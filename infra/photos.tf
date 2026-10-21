# Photos bucket. Private: uploads arrive under pending/ and only public/ is
# readable, through CloudFront.

resource "aws_s3_bucket" "photos" {
  bucket_prefix = "${local.name}-photos-"
  # Dev can be torn down in one go. Prod keeps uploads safe from a stray destroy.
  force_destroy = var.environment != "prod"
}

resource "aws_s3_bucket_public_access_block" "photos" {
  bucket                  = aws_s3_bucket.photos.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "photos" {
  bucket = aws_s3_bucket.photos.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Browsers upload straight to S3 with a signed form from the API.
resource "aws_s3_bucket_cors_configuration" "photos" {
  bucket = aws_s3_bucket.photos.id
  cors_rule {
    allowed_methods = ["POST"]
    allowed_origins = concat([local.site_url, "http://localhost:3000"], var.extra_origins)
    allowed_headers = ["*"]
    max_age_seconds = 3600
  }
}

# Unreviewed uploads are deleted after a fortnight.
resource "aws_s3_bucket_lifecycle_configuration" "photos" {
  bucket = aws_s3_bucket.photos.id
  rule {
    id     = "expire-pending"
    status = "Enabled"
    filter {
      prefix = "pending/"
    }
    expiration {
      days = 14
    }
  }
  rule {
    id     = "abort-incomplete-uploads"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload { days_after_initiation = 1 }
  }
}

data "aws_iam_policy_document" "photos_bucket" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.photos.arn}/public/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.web.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "photos" {
  bucket = aws_s3_bucket.photos.id
  policy = data.aws_iam_policy_document.photos_bucket.json
}

# What the API and admin Lambdas may do with photos.
data "aws_iam_policy_document" "lambda_photos" {
  statement {
    sid       = "UploadAndReviewPending"
    actions   = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.photos.arn}/pending/*"]
  }
  statement {
    sid       = "PublishApproved"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.photos.arn}/public/*"]
  }
}

resource "aws_iam_role_policy" "lambda_photos" {
  name   = "photos"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.lambda_photos.json
}
