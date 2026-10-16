# "Search anywhere" importer. Outside the VPC so it can reach OpenStreetMap
# without a NAT gateway. It has no database access: it hands pubs to the admin
# Lambda, which is inside the VPC.

data "archive_file" "importer" {
  type        = "zip"
  source_dir  = "${path.module}/../api/dist/importer"
  output_path = "${path.module}/.build/importer.zip"
}

resource "aws_iam_role" "importer" {
  name               = "${var.project}-importer"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "importer_logs" {
  role       = aws_iam_role.importer.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "importer" {
  statement {
    actions = ["lambda:InvokeFunction"]
    resources = [
      aws_lambda_function.admin.arn,
      # Itself, to run the import in the background. Built from the name to avoid a cycle.
      "arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:function:${var.project}-importer",
    ]
  }
}

# Saving copies of Wikimedia photos into the photos bucket.
data "aws_iam_policy_document" "importer_photos" {
  statement {
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.photos.arn}/public/wikimedia/*"]
  }
}

resource "aws_iam_role_policy" "importer_photos" {
  name   = "photos"
  role   = aws_iam_role.importer.id
  policy = data.aws_iam_policy_document.importer_photos.json
}

resource "aws_iam_role_policy" "importer" {
  name   = "invoke"
  role   = aws_iam_role.importer.id
  policy = data.aws_iam_policy_document.importer.json
}

data "aws_caller_identity" "current" {}

resource "aws_cloudwatch_log_group" "importer" {
  name              = "/aws/lambda/${var.project}-importer"
  retention_in_days = 14
}

resource "aws_lambda_function" "importer" {
  function_name    = "${var.project}-importer"
  role             = aws_iam_role.importer.arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = "index.handler"
  filename         = data.archive_file.importer.output_path
  source_code_hash = data.archive_file.importer.output_base64sha256
  memory_size      = 256
  timeout          = 120 # Overpass can be slow for a city centre, then photo copies

  environment {
    variables = {
      ADMIN_FUNCTION = aws_lambda_function.admin.function_name
      PHOTOS_BUCKET  = aws_s3_bucket.photos.bucket
    }
  }

  depends_on = [aws_cloudwatch_log_group.importer, aws_iam_role_policy_attachment.importer_logs]
}

resource "aws_apigatewayv2_integration" "importer" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.importer.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "import_area" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /areas/import"
  target    = "integrations/${aws_apigatewayv2_integration.importer.id}"
}

resource "aws_apigatewayv2_route" "area_status" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /areas/status"
  target    = "integrations/${aws_apigatewayv2_integration.importer.id}"
}

resource "aws_lambda_permission" "apigw_importer" {
  statement_id  = "AllowApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.importer.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}
