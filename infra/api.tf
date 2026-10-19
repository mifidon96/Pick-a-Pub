# Build the bundle first: `cd api && npm ci && npm run build`
data "archive_file" "api" {
  type        = "zip"
  source_dir  = "${path.module}/../api/dist/lambda"
  output_path = "${path.module}/.build/api.zip"
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "${local.name}-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

# Logs plus the network interfaces a Lambda needs inside a VPC.
resource "aws_iam_role_policy_attachment" "lambda_vpc" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

locals {
  # Simplification for the first version: the DB password is a Lambda environment
  # variable. The tidier option is Secrets Manager, but that needs a VPC endpoint
  # (a monthly charge) because this VPC has no route to the internet.
  lambda_env = {
    PGHOST     = aws_db_instance.main.address
    PGPORT     = tostring(aws_db_instance.main.port)
    PGDATABASE = aws_db_instance.main.db_name
    PGUSER     = aws_db_instance.main.username
    PGPASSWORD = random_password.db.result
    PGSSL      = "1"
    # Photos: uploads go to this bucket, approved ones are served by CloudFront.
    PHOTOS_BUCKET   = aws_s3_bucket.photos.bucket
    PHOTOS_BASE_URL = local.site_url
    # Makes Node trust the RDS certificate authority shipped with the Lambda runtime.
    NODE_EXTRA_CA_CERTS = "/var/runtime/ca-cert.pem"
  }
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${local.name}-api"
  retention_in_days = 14
}

resource "aws_cloudwatch_log_group" "admin" {
  name              = "/aws/lambda/${local.name}-admin"
  retention_in_days = 14
}

resource "aws_lambda_function" "api" {
  function_name    = "${local.name}-api"
  role             = aws_iam_role.lambda.arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = "index.handler"
  filename         = data.archive_file.api.output_path
  source_code_hash = data.archive_file.api.output_base64sha256
  memory_size      = 256
  timeout          = 10

  vpc_config {
    subnet_ids         = aws_subnet.private[*].id
    security_group_ids = [aws_security_group.lambda.id]
  }

  environment {
    variables = local.lambda_env
  }

  depends_on = [aws_cloudwatch_log_group.api, aws_iam_role_policy_attachment.lambda_vpc]
}

# Same code, different entry point. Not exposed through API Gateway:
# call it with `aws lambda invoke` to run migrations or import pubs.
resource "aws_lambda_function" "admin" {
  function_name    = "${local.name}-admin"
  role             = aws_iam_role.lambda.arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = "index.admin"
  filename         = data.archive_file.api.output_path
  source_code_hash = data.archive_file.api.output_base64sha256
  memory_size      = 256
  timeout          = 60

  vpc_config {
    subnet_ids         = aws_subnet.private[*].id
    security_group_ids = [aws_security_group.lambda.id]
  }

  environment {
    variables = local.lambda_env
  }

  depends_on = [aws_cloudwatch_log_group.admin, aws_iam_role_policy_attachment.lambda_vpc]
}

resource "aws_apigatewayv2_api" "main" {
  name          = local.name
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = concat([local.site_url, "http://localhost:3000"], var.extra_origins)
    allow_methods = ["GET", "PUT", "POST", "DELETE", "OPTIONS"]
    allow_headers = ["content-type", "authorization"]
    max_age       = 3600
  }
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "$default"
  auto_deploy = true

  # Blunt protection against abuse and a surprise bill.
  default_route_settings {
    throttling_rate_limit  = 20
    throttling_burst_limit = 40
  }

  # Page counts: one per page view, so a firm cap stops anyone flooding the table.
  route_settings {
    route_key              = aws_apigatewayv2_route.events.route_key
    throttling_rate_limit  = 10
    throttling_burst_limit = 20
  }

  # Starting an area import fetches from OpenStreetMap, so keep it slow.
  route_settings {
    route_key              = aws_apigatewayv2_route.import_area.route_key
    throttling_rate_limit  = 1
    throttling_burst_limit = 3
  }
}

resource "aws_apigatewayv2_integration" "api" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.main.id
  name             = "cognito"
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]

  jwt_configuration {
    issuer   = "https://${aws_cognito_user_pool.main.endpoint}"
    audience = [aws_cognito_user_pool_client.web.id]
  }
}

# Reading is public.
resource "aws_apigatewayv2_route" "list_pubs" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /pubs"
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}

resource "aws_apigatewayv2_route" "get_pub" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /pubs/{id}"
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}

# Anything about your own review needs a valid Cognito token. API Gateway rejects the request before
# the Lambda runs if the token is missing or bad.
resource "aws_apigatewayv2_route" "get_my_review" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "GET /pubs/{id}/review"
  target             = "integrations/${aws_apigatewayv2_integration.api.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_route" "put_review" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "PUT /pubs/{id}/review"
  target             = "integrations/${aws_apigatewayv2_integration.api.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_route" "add_photo" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "POST /pubs/{id}/photos"
  target             = "integrations/${aws_apigatewayv2_integration.api.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

resource "aws_apigatewayv2_route" "report_review" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "POST /reviews/{id}/report"
  target             = "integrations/${aws_apigatewayv2_integration.api.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

# "Download my data" and "Delete my account".
resource "aws_apigatewayv2_route" "me" {
  for_each           = toset(["GET", "DELETE"])
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "${each.value} /me"
  target             = "integrations/${aws_apigatewayv2_integration.api.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

# "Where's it showing?" (public).
resource "aws_apigatewayv2_route" "fixtures" {
  for_each  = toset(["GET /fixtures", "GET /fixtures/{id}/pubs"])
  api_id    = aws_apigatewayv2_api.main.id
  route_key = each.value
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}

# Cookie-free page counts (api/src/analytics.ts). Public.
resource "aws_apigatewayv2_route" "events" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /events"
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}
