# Pub and area pages for search engines.
# The admin Lambda writes plain HTML pages into the website bucket
# (api/src/admin/pages.ts): /pubs/<name>-<id>/ and /football-pubs/<area>/,
# plus sitemap.xml. It runs every night here, and at the end of each deploy.

# The Lambdas may write only those pages, nothing else in the website bucket.
data "aws_iam_policy_document" "pages" {
  statement {
    actions = ["s3:PutObject", "s3:DeleteObject"]
    resources = [
      "${aws_s3_bucket.web.arn}/pubs/*",
      "${aws_s3_bucket.web.arn}/football-pubs/*",
      "${aws_s3_bucket.web.arn}/sitemap.xml",
    ]
  }
  # Listing, to remove pages for pubs that no longer have one.
  statement {
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.web.arn]
    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["pubs/*", "football-pubs/*"]
    }
  }
}

resource "aws_iam_role_policy" "pages" {
  name   = "search-pages"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.pages.json
}

# 03:30 UTC: a new review is on its pub's page by the next morning.
resource "aws_cloudwatch_event_rule" "pages" {
  name                = "${local.name}-pages"
  description         = "Rebuild the pub and area pages for search engines"
  schedule_expression = "cron(30 3 * * ? *)"
}

resource "aws_cloudwatch_event_target" "pages" {
  rule  = aws_cloudwatch_event_rule.pages.name
  arn   = aws_lambda_function.app["admin"].arn
  input = jsonencode({ action = "render_pages" })
}

resource "aws_lambda_permission" "pages" {
  statement_id  = "AllowEventBridgePages"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.app["admin"].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.pages.arn
}
