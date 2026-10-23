# Production: what the public sees.
environment           = "prod"
cognito_domain_prefix = "pickapub-morgan"
deletion_protection   = true

# Custom domain (bought in Route 53, which created the hosted zone).
domain_name = "pickapub.com"

# Email from no-reply@pickapub.com: request SES production access first
# (see README "Custom domain and email"), then:
# use_ses_email = true
