# Dev: every merge to main lands here first. Safe to destroy when not in use.
environment           = "dev"
cognito_domain_prefix = "pickapub-morgan-dev"
deletion_protection   = false

# Custom domain: a subdomain in the prod hosted zone.
domain_name      = "dev.pickapub.com"
hosted_zone_name = "pickapub.com"
