# One-off setup for an AWS account, run once by scripts/bootstrap.sh:
#   - S3 bucket for Terraform state (versioned, encrypted, private)
#   - GitHub Actions sign-in to AWS with OIDC, so no AWS keys are stored in GitHub
#   - Roles: plan (read-only, for pull requests), deploy-dev and deploy-prod
#   - A monthly budget alert
# Its own state is local (infra/bootstrap/terraform.tfstate). It holds no secrets;
# if it is ever lost, everything here can be imported back.

terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.69"
    }
  }
}

variable "alert_email" {
  description = "Gets the budget alerts."
  type        = string
}

variable "monthly_budget_usd" {
  description = "AWS bills in USD. 25 USD is roughly 20 GBP."
  type        = number
  default     = 25
}

variable "github_repo" {
  type    = string
  default = "mifidon96/Pick-a-Pub"
}

variable "project" {
  type    = string
  default = "pickapub"
}

provider "aws" {
  region = "eu-west-2"
  default_tags {
    tags = { Project = var.project, ManagedBy = "terraform-bootstrap" }
  }
}

data "aws_caller_identity" "current" {}

# ---------------------------------------------------------------------------
# Terraform state
# ---------------------------------------------------------------------------
resource "aws_s3_bucket" "state" {
  bucket = "${var.project}-tfstate-${data.aws_caller_identity.current.account_id}"
  lifecycle { prevent_destroy = true }
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Old versions of the state are kept for 90 days, then cleaned up.
resource "aws_s3_bucket_lifecycle_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    id     = "expire-old-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration { noncurrent_days = 90 }
    abort_incomplete_multipart_upload { days_after_initiation = 1 }
  }
}

# HTTPS only.
data "aws_iam_policy_document" "state_bucket" {
  statement {
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = data.aws_iam_policy_document.state_bucket.json
}

# ---------------------------------------------------------------------------
# GitHub Actions to AWS, without stored keys
# ---------------------------------------------------------------------------
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  # AWS no longer checks this for GitHub, but the API still wants a value.
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

# Who may use each role. "sub" is set by GitHub and cannot be faked by a workflow:
#   pull requests      -> repo:<owner>/<repo>:pull_request
#   a GitHub environment -> repo:<owner>/<repo>:environment:<name>
locals {
  roles = {
    plan        = { sub = "repo:${var.github_repo}:pull_request", policy = "arn:aws:iam::aws:policy/ReadOnlyAccess" }
    deploy-dev  = { sub = "repo:${var.github_repo}:environment:dev", policy = "arn:aws:iam::aws:policy/AdministratorAccess" }
    deploy-prod = { sub = "repo:${var.github_repo}:environment:prod", policy = "arn:aws:iam::aws:policy/AdministratorAccess" }
  }
}

data "aws_iam_policy_document" "github_trust" {
  for_each = local.roles
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = [each.value.sub]
    }
  }
}

resource "aws_iam_role" "github" {
  for_each             = local.roles
  name                 = "${var.project}-github-${each.key}"
  assume_role_policy   = data.aws_iam_policy_document.github_trust[each.key].json
  max_session_duration = 3600
}

resource "aws_iam_role_policy_attachment" "github" {
  for_each   = local.roles
  role       = aws_iam_role.github[each.key].name
  policy_arn = each.value.policy
}

# ---------------------------------------------------------------------------
# Budget alert: emails at 80% of the forecast and 100% of actual spend
# ---------------------------------------------------------------------------
resource "aws_budgets_budget" "monthly" {
  name         = "${var.project}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }
}

output "state_bucket" {
  value = aws_s3_bucket.state.bucket
}

output "account_id" {
  value = data.aws_caller_identity.current.account_id
}

output "role_arns" {
  value = { for k, r in aws_iam_role.github : k => r.arn }
}
