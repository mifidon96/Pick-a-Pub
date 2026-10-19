# Custom domain and email. Everything here is skipped until domain_name is set.
#
# To switch on (see README "Custom domain and email"):
#   1. Buy the domain in Route 53 (it creates the hosted zone), or point an
#      existing domain's name servers at a new Route 53 hosted zone.
#   2. Set domain_name in infra/envs/<env>.tfvars and deploy.
#   3. Once SES has granted production access, set use_ses_email = true and deploy.

locals {
  custom_domain = var.domain_name != ""
  zone_name     = var.hosted_zone_name != "" ? var.hosted_zone_name : var.domain_name
  site_url      = local.custom_domain ? "https://${var.domain_name}" : "https://${aws_cloudfront_distribution.web.domain_name}"
}

# CloudFront only accepts certificates from us-east-1.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
  default_tags {
    tags = {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

data "aws_route53_zone" "main" {
  count = local.custom_domain ? 1 : 0
  name  = local.zone_name
}

resource "aws_acm_certificate" "site" {
  count             = local.custom_domain ? 1 : 0
  provider          = aws.us_east_1
  domain_name       = var.domain_name
  validation_method = "DNS"
  lifecycle { create_before_destroy = true }
}

resource "aws_route53_record" "cert_validation" {
  for_each = local.custom_domain ? {
    for o in aws_acm_certificate.site[0].domain_validation_options : o.domain_name => o
  } : {}
  zone_id         = data.aws_route53_zone.main[0].zone_id
  name            = each.value.resource_record_name
  type            = each.value.resource_record_type
  records         = [each.value.resource_record_value]
  ttl             = 300
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "site" {
  count                   = local.custom_domain ? 1 : 0
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.site[0].arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}

resource "aws_route53_record" "site" {
  for_each = local.custom_domain ? toset(["A", "AAAA"]) : toset([])
  zone_id  = data.aws_route53_zone.main[0].zone_id
  name     = var.domain_name
  type     = each.value
  alias {
    name                   = aws_cloudfront_distribution.web.domain_name
    zone_id                = aws_cloudfront_distribution.web.hosted_zone_id
    evaluate_target_health = false
  }
}

# ---------------------------------------------------------------------------
# Email (SES). The domain is verified with DKIM as soon as domain_name is set;
# Cognito only switches to it when use_ses_email = true.
# New accounts start in the SES sandbox (can only email verified addresses):
# request production access in the SES console first.
# ---------------------------------------------------------------------------
resource "aws_sesv2_email_identity" "domain" {
  count          = local.custom_domain ? 1 : 0
  email_identity = var.domain_name
}

resource "aws_route53_record" "dkim" {
  count   = local.custom_domain ? 3 : 0
  zone_id = data.aws_route53_zone.main[0].zone_id
  name    = "${aws_sesv2_email_identity.domain[0].dkim_signing_attributes[0].tokens[count.index]}._domainkey.${var.domain_name}"
  type    = "CNAME"
  ttl     = 1800
  records = ["${aws_sesv2_email_identity.domain[0].dkim_signing_attributes[0].tokens[count.index]}.dkim.amazonses.com"]
}

# Tells mail servers what to do with mail that fails checks. "none" = report only.
resource "aws_route53_record" "dmarc" {
  count   = local.custom_domain ? 1 : 0
  zone_id = data.aws_route53_zone.main[0].zone_id
  name    = "_dmarc.${var.domain_name}"
  type    = "TXT"
  ttl     = 1800
  records = ["v=DMARC1; p=none;"]
}

# Lets Cognito send from this identity.
data "aws_iam_policy_document" "ses_cognito" {
  count = local.custom_domain ? 1 : 0
  statement {
    actions   = ["ses:SendEmail", "ses:SendRawEmail"]
    resources = [aws_sesv2_email_identity.domain[0].arn]
    principals {
      type        = "Service"
      identifiers = ["cognito-idp.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_sesv2_email_identity_policy" "cognito" {
  count          = local.custom_domain ? 1 : 0
  email_identity = aws_sesv2_email_identity.domain[0].email_identity
  policy_name    = "cognito"
  policy         = data.aws_iam_policy_document.ses_cognito[0].json
}
