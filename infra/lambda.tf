# The API and admin Lambdas. Same code bundle, two entry points:
#   api   - behind API Gateway (api_gateway.tf); answers the website
#   admin - not public; deploy.sh invokes it to set up the database, run
#           migrations and import pubs
# Both run inside the VPC so they can reach the database. The importer, which
# needs the internet instead, is in importer.tf.

# Build the bundle first: `cd api && npm ci && npm run build`
data "archive_file" "api" {
  type        = "zip"
  source_dir  = "${path.module}/../api/dist/lambda"
  output_path = "${path.module}/.build/api.zip"
}

locals {
  app_functions = {
    api   = { handler = "index.handler", timeout = 10 }
    admin = { handler = "index.admin", timeout = 60 }
  }

  # No database password here: the Lambdas sign a 15-minute IAM login token for
  # db_app_user each time they connect (api/src/lib/db.ts). deploy.sh creates that
  # user with the master password, passed in for that one call only.
  db_app_user = "pickapub_app"
  lambda_env = {
    PGHOST       = aws_db_instance.main.address
    PGPORT       = tostring(aws_db_instance.main.port)
    PGDATABASE   = aws_db_instance.main.db_name
    PGUSER       = local.db_app_user
    PGAUTH       = "iam"
    PGMASTERUSER = aws_db_instance.main.username
    PGSSL        = "1"
    # Photos: uploads go to this bucket, approved ones are served by CloudFront.
    PHOTOS_BUCKET   = aws_s3_bucket.photos.bucket
    PHOTOS_BASE_URL = local.site_url
    # Pub and area pages for search engines are written here (pages.tf).
    WEB_BUCKET = aws_s3_bucket.web.bucket
    SITE_URL   = local.site_url
    SITE_ENV   = var.environment
    # Makes Node trust the RDS certificate authority shipped with the Lambda runtime.
    NODE_EXTRA_CA_CERTS = "/var/runtime/ca-cert.pem"
  }
}

resource "aws_lambda_function" "app" {
  for_each = local.app_functions

  function_name    = "${local.name}-${each.key}"
  role             = aws_iam_role.lambda.arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = each.value.handler
  filename         = data.archive_file.api.output_path
  source_code_hash = data.archive_file.api.output_base64sha256
  memory_size      = 256
  timeout          = each.value.timeout

  vpc_config {
    subnet_ids         = aws_subnet.private[*].id
    security_group_ids = [aws_security_group.lambda.id]
  }

  environment {
    variables = local.lambda_env
  }

  depends_on = [aws_cloudwatch_log_group.app, aws_iam_role_policy_attachment.lambda_vpc]
}

resource "aws_cloudwatch_log_group" "app" {
  for_each          = local.app_functions
  name              = "/aws/lambda/${local.name}-${each.key}"
  retention_in_days = 14
}

# ---------------------------------------------------------------------------
# Permissions: logs, the VPC network interfaces, the database login and the
# photos bucket (photos.tf). Nothing else.
# ---------------------------------------------------------------------------

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

# Allows the Lambdas to log in to the database as the app user, and nothing else.
data "aws_iam_policy_document" "db_connect" {
  statement {
    actions   = ["rds-db:connect"]
    resources = ["arn:aws:rds-db:${var.region}:${data.aws_caller_identity.current.account_id}:dbuser:${aws_db_instance.main.resource_id}/${local.db_app_user}"]
  }
}

resource "aws_iam_role_policy" "db_connect" {
  name   = "db-connect"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.db_connect.json
}
