# The public API: one HTTP API in front of two Lambdas.
#   api      - pubs, reviews, photos, matches, accounts (lambda.tf)
#   importer - imports pubs for a new area on demand (importer.tf)
# Routes that change your own data need a Cognito sign-in token. API Gateway
# checks it and rejects the request before any Lambda runs.

locals {
  # Every endpoint: which Lambda answers it, and whether you must be signed in.
  routes = {
    "GET /pubs"                 = { target = "api", signed_in = false }
    "GET /pubs/{id}"            = { target = "api", signed_in = false }
    "GET /fixtures"             = { target = "api", signed_in = false } # "Where's it showing?"
    "GET /fixtures/{id}/pubs"   = { target = "api", signed_in = false }
    "POST /events"              = { target = "api", signed_in = false } # cookie-free page counts
    "POST /areas/import"        = { target = "importer", signed_in = false }
    "GET /areas/status"         = { target = "importer", signed_in = false }
    "GET /pubs/{id}/review"     = { target = "api", signed_in = true } # your review of a pub
    "PUT /pubs/{id}/review"     = { target = "api", signed_in = true }
    "POST /pubs/{id}/photos"    = { target = "api", signed_in = true }
    "POST /reviews/{id}/report" = { target = "api", signed_in = true }
    "GET /me"                   = { target = "api", signed_in = true } # download my data
    "DELETE /me"                = { target = "api", signed_in = true } # delete my account
  }

  route_targets = {
    api      = aws_lambda_function.app["api"]
    importer = aws_lambda_function.importer
  }
}

resource "aws_apigatewayv2_api" "main" {
  name          = local.name
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = local.allowed_origins
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
    route_key              = aws_apigatewayv2_route.this["POST /events"].route_key
    throttling_rate_limit  = 10
    throttling_burst_limit = 20
  }

  # Starting an area import fetches from OpenStreetMap, so keep it slow.
  route_settings {
    route_key              = aws_apigatewayv2_route.this["POST /areas/import"].route_key
    throttling_rate_limit  = 1
    throttling_burst_limit = 3
  }
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

resource "aws_apigatewayv2_route" "this" {
  for_each = local.routes

  api_id             = aws_apigatewayv2_api.main.id
  route_key          = each.key
  target             = "integrations/${aws_apigatewayv2_integration.lambda[each.value.target].id}"
  authorization_type = each.value.signed_in ? "JWT" : "NONE"
  authorizer_id      = each.value.signed_in ? aws_apigatewayv2_authorizer.cognito.id : null
}

# How API Gateway hands a request to each Lambda, and its permission to do so.
resource "aws_apigatewayv2_integration" "lambda" {
  for_each = local.route_targets

  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = each.value.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_lambda_permission" "apigw" {
  for_each = local.route_targets

  statement_id  = "AllowApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = each.value.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}
