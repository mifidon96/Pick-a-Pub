resource "aws_cognito_user_pool" "main" {
  name                     = local.name
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length    = 10
    require_lowercase = true
    require_numbers   = true
    require_uppercase = false
    require_symbols   = false
  }

  # Cognito's own email allows about 50 a day and often lands in spam. With a
  # domain and SES production access, send from no-reply@<domain> instead.
  email_configuration {
    email_sending_account = var.use_ses_email ? "DEVELOPER" : "COGNITO_DEFAULT"
    source_arn            = var.use_ses_email ? aws_sesv2_email_identity.domain[0].arn : null
    from_email_address    = var.use_ses_email ? "Pick-a-Pub <no-reply@${var.domain_name}>" : null
  }

  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "Your Pick-a-Pub code"
    email_message        = "Your Pick-a-Pub verification code is {####}. If you did not ask for this, ignore this email."
  }

  lifecycle {
    precondition {
      condition     = !var.use_ses_email || var.domain_name != ""
      error_message = "use_ses_email needs domain_name to be set."
    }
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }
}

# Hosted sign-in page: https://<prefix>.auth.<region>.amazoncognito.com
resource "aws_cognito_user_pool_domain" "main" {
  domain       = var.cognito_domain_prefix
  user_pool_id = aws_cognito_user_pool.main.id
}

resource "aws_cognito_user_pool_client" "web" {
  name         = "${local.name}-web"
  user_pool_id = aws_cognito_user_pool.main.id

  # Browser app: no client secret, authorisation code flow with PKCE.
  generate_secret                      = false
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  # aws.cognito.signin.user.admin lets the signed-in user delete their own
  # sign-in from the account page (Cognito DeleteUser).
  allowed_oauth_scopes         = ["openid", "email", "aws.cognito.signin.user.admin"]
  supported_identity_providers = ["COGNITO"]

  callback_urls = concat(
    ["${local.site_url}/auth/callback/", "http://localhost:3000/auth/callback/"],
    var.extra_callback_urls,
  )
}
