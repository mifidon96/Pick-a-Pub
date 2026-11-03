# Read by scripts/deploy.sh (and GitHub Actions) after each apply.

output "environment" {
  description = "dev or prod."
  value       = var.environment
}

output "site_url" {
  description = "The website's address: the custom domain if set, else the CloudFront address."
  value       = local.site_url
}

output "api_url" {
  description = "API Gateway address. deploy.sh writes it into the site's config.js."
  value       = aws_apigatewayv2_api.main.api_endpoint
}

output "cognito_authority" {
  description = "Cognito user pool issuer URL. deploy.sh writes it into config.js."
  value       = "https://${aws_cognito_user_pool.main.endpoint}"
}

output "cognito_client_id" {
  description = "Cognito app client the website signs in with. deploy.sh writes it into config.js."
  value       = aws_cognito_user_pool_client.web.id
}

output "web_bucket" {
  description = "S3 bucket deploy.sh uploads the website to."
  value       = aws_s3_bucket.web.bucket
}

output "cloudfront_distribution_id" {
  description = "Distribution whose cache deploy.sh clears after uploading the website."
  value       = aws_cloudfront_distribution.web.id
}

output "photos_bucket" {
  description = "S3 bucket for pub photos (uploads under pending/, approved under public/)."
  value       = aws_s3_bucket.photos.bucket
}

output "admin_function" {
  description = "Lambda deploy.sh invokes for database set-up, migrations and pub imports."
  value       = aws_lambda_function.app["admin"].function_name
}

output "importer_function" {
  description = "Lambda that imports pubs and photos and refreshes match listings."
  value       = aws_lambda_function.importer.function_name
}

output "dashboard_url" {
  description = "CloudWatch dashboard for this environment."
  value       = "https://${var.region}.console.aws.amazon.com/cloudwatch/home?region=${var.region}#dashboards/dashboard/${aws_cloudwatch_dashboard.main.dashboard_name}"
}

# Used once per deploy by deploy.sh to set up the app's database login.
output "db_master_password" {
  description = "RDS master password. Only deploy.sh reads it, to set up the IAM database login."
  value       = random_password.db.result
  sensitive   = true
}
