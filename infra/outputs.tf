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

output "admin_function" {
  value = aws_lambda_function.admin.function_name
}
