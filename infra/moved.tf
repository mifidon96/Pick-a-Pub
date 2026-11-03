# Renames from the November 2026 tidy-up (routes, Lambdas and log groups moved
# into for_each maps). Each block tells Terraform "this is the same resource
# under a new name", so nothing is destroyed and recreated.
#
# Safe to delete once both dev and prod have been deployed with them.

moved {
  from = aws_lambda_function.api
  to   = aws_lambda_function.app["api"]
}
moved {
  from = aws_lambda_function.admin
  to   = aws_lambda_function.app["admin"]
}
moved {
  from = aws_cloudwatch_log_group.api
  to   = aws_cloudwatch_log_group.app["api"]
}
moved {
  from = aws_cloudwatch_log_group.admin
  to   = aws_cloudwatch_log_group.app["admin"]
}

moved {
  from = aws_apigatewayv2_integration.api
  to   = aws_apigatewayv2_integration.lambda["api"]
}
moved {
  from = aws_apigatewayv2_integration.importer
  to   = aws_apigatewayv2_integration.lambda["importer"]
}
moved {
  from = aws_lambda_permission.apigw
  to   = aws_lambda_permission.apigw["api"]
}
moved {
  from = aws_lambda_permission.apigw_importer
  to   = aws_lambda_permission.apigw["importer"]
}

moved {
  from = aws_apigatewayv2_route.list_pubs
  to   = aws_apigatewayv2_route.this["GET /pubs"]
}
moved {
  from = aws_apigatewayv2_route.get_pub
  to   = aws_apigatewayv2_route.this["GET /pubs/{id}"]
}
moved {
  from = aws_apigatewayv2_route.get_my_review
  to   = aws_apigatewayv2_route.this["GET /pubs/{id}/review"]
}
moved {
  from = aws_apigatewayv2_route.put_review
  to   = aws_apigatewayv2_route.this["PUT /pubs/{id}/review"]
}
moved {
  from = aws_apigatewayv2_route.add_photo
  to   = aws_apigatewayv2_route.this["POST /pubs/{id}/photos"]
}
moved {
  from = aws_apigatewayv2_route.report_review
  to   = aws_apigatewayv2_route.this["POST /reviews/{id}/report"]
}
moved {
  from = aws_apigatewayv2_route.me["GET"]
  to   = aws_apigatewayv2_route.this["GET /me"]
}
moved {
  from = aws_apigatewayv2_route.me["DELETE"]
  to   = aws_apigatewayv2_route.this["DELETE /me"]
}
moved {
  from = aws_apigatewayv2_route.fixtures["GET /fixtures"]
  to   = aws_apigatewayv2_route.this["GET /fixtures"]
}
moved {
  from = aws_apigatewayv2_route.fixtures["GET /fixtures/{id}/pubs"]
  to   = aws_apigatewayv2_route.this["GET /fixtures/{id}/pubs"]
}
moved {
  from = aws_apigatewayv2_route.events
  to   = aws_apigatewayv2_route.this["POST /events"]
}
moved {
  from = aws_apigatewayv2_route.import_area
  to   = aws_apigatewayv2_route.this["POST /areas/import"]
}
moved {
  from = aws_apigatewayv2_route.area_status
  to   = aws_apigatewayv2_route.this["GET /areas/status"]
}
