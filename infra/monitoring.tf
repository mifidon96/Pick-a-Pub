# Alarms emailed through SNS, plus one dashboard.
# The email subscription needs confirming once: AWS sends a link to alert_email.

resource "aws_sns_topic" "alerts" {
  name = "${local.name}-alerts"
}

resource "aws_sns_topic_subscription" "email" {
  count     = var.alert_email == "" ? 0 : 1
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

locals {
  functions = {
    api      = aws_lambda_function.api.function_name
    admin    = aws_lambda_function.admin.function_name
    importer = aws_lambda_function.importer.function_name
  }
  alarm_actions = [aws_sns_topic.alerts.arn]
}

# Any Lambda error. On the API that means someone saw "Something went wrong".
resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  for_each = local.functions

  alarm_name          = "${local.name}-${each.key}-errors"
  alarm_description   = "${each.value} threw an error. Check its log group in CloudWatch."
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = each.value }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "api_throttles" {
  alarm_name          = "${local.name}-api-throttles"
  alarm_description   = "The API Lambda is being throttled: requests are failing."
  namespace           = "AWS/Lambda"
  metric_name         = "Throttles"
  dimensions          = { FunctionName = aws_lambda_function.api.function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  alarm_name          = "${local.name}-api-5xx"
  alarm_description   = "API Gateway returned 5 or more server errors in 5 minutes."
  namespace           = "AWS/ApiGateway"
  metric_name         = "5xx"
  dimensions          = { ApiId = aws_apigatewayv2_api.main.id }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 5
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "api_latency" {
  alarm_name          = "${local.name}-api-slow"
  alarm_description   = "API p95 latency above 3 seconds for 15 minutes."
  namespace           = "AWS/ApiGateway"
  metric_name         = "Latency"
  dimensions          = { ApiId = aws_apigatewayv2_api.main.id }
  extended_statistic  = "p95"
  period              = 300
  evaluation_periods  = 3
  threshold           = 3000
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "db_cpu" {
  alarm_name          = "${local.name}-db-cpu"
  alarm_description   = "Database CPU above 80% for 15 minutes."
  namespace           = "AWS/RDS"
  metric_name         = "CPUUtilization"
  dimensions          = { DBInstanceIdentifier = aws_db_instance.main.identifier }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "db_storage" {
  alarm_name          = "${local.name}-db-storage"
  alarm_description   = "Less than 2 GB of database storage left."
  namespace           = "AWS/RDS"
  metric_name         = "FreeStorageSpace"
  dimensions          = { DBInstanceIdentifier = aws_db_instance.main.identifier }
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 2 * 1024 * 1024 * 1024
  comparison_operator = "LessThanThreshold"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

# A db.t4g.micro has 1 GB of memory and Postgres keeps most of it as cache on
# purpose, so free memory normally sits around 100 MB. The old 100 MB threshold
# flapped all night on dev. Under 32 MB for 15 minutes is real pressure.
resource "aws_cloudwatch_metric_alarm" "db_memory" {
  alarm_name          = "${local.name}-db-memory"
  alarm_description   = "Database has less than 32 MB of free memory for 15 minutes."
  namespace           = "AWS/RDS"
  metric_name         = "FreeableMemory"
  dimensions          = { DBInstanceIdentifier = aws_db_instance.main.identifier }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 32 * 1024 * 1024
  comparison_operator = "LessThanThreshold"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

# Swapping is the clearer sign that the database is short of memory.
resource "aws_cloudwatch_metric_alarm" "db_swap" {
  alarm_name          = "${local.name}-db-swap"
  alarm_description   = "Database is using more than 50 MB of swap for 15 minutes: it is short of memory."
  namespace           = "AWS/RDS"
  metric_name         = "SwapUsage"
  dimensions          = { DBInstanceIdentifier = aws_db_instance.main.identifier }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 50 * 1024 * 1024
  comparison_operator = "GreaterThanThreshold"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

# A db.t4g.micro allows roughly 80 to 100 connections. Each warm Lambda holds up
# to 2, so this is the first limit a traffic spike hits.
resource "aws_cloudwatch_metric_alarm" "db_connections" {
  alarm_name          = "${local.name}-db-connections"
  alarm_description   = "More than 60 database connections for 10 minutes: close to the limit for this instance size."
  namespace           = "AWS/RDS"
  metric_name         = "DatabaseConnections"
  dimensions          = { DBInstanceIdentifier = aws_db_instance.main.identifier }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 60
  comparison_operator = "GreaterThanThreshold"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = local.name
  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric", x = 0, y = 0, width = 12, height = 6
        properties = {
          title  = "API requests and errors"
          region = var.region
          stat   = "Sum"
          period = 300
          metrics = [
            ["AWS/ApiGateway", "Count", "ApiId", aws_apigatewayv2_api.main.id, { label = "Requests" }],
            [".", "4xx", ".", ".", { label = "4xx" }],
            [".", "5xx", ".", ".", { label = "5xx", color = "#d62728" }],
          ]
        }
      },
      {
        type = "metric", x = 12, y = 0, width = 12, height = 6
        properties = {
          title  = "API latency (ms)"
          region = var.region
          period = 300
          metrics = [
            ["AWS/ApiGateway", "Latency", "ApiId", aws_apigatewayv2_api.main.id, { stat = "p50", label = "p50" }],
            ["...", { stat = "p95", label = "p95" }],
          ]
        }
      },
      {
        type = "metric", x = 0, y = 6, width = 12, height = 6
        properties = {
          title   = "Lambda errors"
          region  = var.region
          stat    = "Sum"
          period  = 300
          metrics = [for k, fn in local.functions : ["AWS/Lambda", "Errors", "FunctionName", fn, { label = k }]]
        }
      },
      {
        type = "metric", x = 12, y = 6, width = 12, height = 6
        properties = {
          title   = "Lambda duration p95 (ms)"
          region  = var.region
          stat    = "p95"
          period  = 300
          metrics = [for k, fn in local.functions : ["AWS/Lambda", "Duration", "FunctionName", fn, { label = k }]]
        }
      },
      {
        type = "metric", x = 0, y = 12, width = 8, height = 6
        properties = {
          title   = "Database CPU %"
          region  = var.region
          stat    = "Average"
          period  = 300
          metrics = [["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", aws_db_instance.main.identifier]]
        }
      },
      {
        type = "metric", x = 8, y = 12, width = 8, height = 6
        properties = {
          title   = "Database connections"
          region  = var.region
          stat    = "Maximum"
          period  = 300
          metrics = [["AWS/RDS", "DatabaseConnections", "DBInstanceIdentifier", aws_db_instance.main.identifier]]
        }
      },
      {
        type = "metric", x = 16, y = 12, width = 8, height = 6
        properties = {
          title   = "Database free storage (bytes)"
          region  = var.region
          stat    = "Minimum"
          period  = 300
          metrics = [["AWS/RDS", "FreeStorageSpace", "DBInstanceIdentifier", aws_db_instance.main.identifier]]
        }
      },
      {
        type = "alarm", x = 0, y = 18, width = 24, height = 4
        properties = {
          title = "Alarms"
          alarms = concat(
            [for a in aws_cloudwatch_metric_alarm.lambda_errors : a.arn],
            [
              aws_cloudwatch_metric_alarm.api_throttles.arn,
              aws_cloudwatch_metric_alarm.api_5xx.arn,
              aws_cloudwatch_metric_alarm.api_latency.arn,
              aws_cloudwatch_metric_alarm.db_cpu.arn,
              aws_cloudwatch_metric_alarm.db_storage.arn,
              aws_cloudwatch_metric_alarm.db_memory.arn,
              aws_cloudwatch_metric_alarm.db_swap.arn,
              aws_cloudwatch_metric_alarm.db_connections.arn,
            ],
          )
        }
      },
    ]
  })
}
