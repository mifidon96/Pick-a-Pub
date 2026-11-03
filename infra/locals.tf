# Values used across several files, in one place.

locals {
  # Every resource name starts with this, e.g. pickapub-prod-api.
  name = "${var.project}-${var.environment}"

  # The site's address: the custom domain when one is set (domain.tf), else
  # CloudFront's own *.cloudfront.net address.
  custom_domain = var.domain_name != ""
  zone_name     = var.hosted_zone_name != "" ? var.hosted_zone_name : var.domain_name
  site_url      = local.custom_domain ? "https://${var.domain_name}" : "https://${aws_cloudfront_distribution.web.domain_name}"

  # Where the website may run from: the live site, and `next dev` on a laptop.
  # Used for sign-in redirects (auth.tf) and browser CORS (API, photo uploads).
  allowed_origins = [local.site_url, "http://localhost:3000"]
}

data "aws_caller_identity" "current" {}
