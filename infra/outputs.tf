output "site_url" {
  value = "https://${aws_cloudfront_distribution.web.domain_name}"
}

output "api_url" {
  description = "NEXT_PUBLIC_API_URL"
  value       = aws_apigatewayv2_api.main.api_endpoint
}

output "cognito_authority" {
  description = "NEXT_PUBLIC_COGNITO_AUTHORITY"
  value       = "https://${aws_cognito_user_pool.main.endpoint}"
}

output "cognito_client_id" {
  description = "NEXT_PUBLIC_COGNITO_CLIENT_ID"
  value       = aws_cognito_user_pool_client.web.id
}

output "web_bucket" {
  value = aws_s3_bucket.web.bucket
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.web.id
}

output "photos_bucket" {
  value = aws_s3_bucket.photos.bucket
}

output "importer_function" {
  value = aws_lambda_function.importer.function_name
}

output "admin_function" {
  value = aws_lambda_function.admin.function_name
}

output "environment" {
  value = var.environment
}

output "dashboard_url" {
  value = "https://${var.region}.console.aws.amazon.com/cloudwatch/home?region=${var.region}#dashboards/dashboard/${aws_cloudwatch_dashboard.main.dashboard_name}"
}
