import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { handle } from "./app";
import { runAdmin, type AdminEvent } from "./admin";

// Public API, behind API Gateway (HTTP API, payload v2).
// API Gateway verifies the Cognito token. The user id is only present on routes
// that carry a valid token.
export async function handler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> {
  let body: unknown;
  if (event.body) {
    try {
      const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
      body = JSON.parse(raw);
    } catch {
      return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Invalid JSON" }) };
    }
  }
  const sub = event.requestContext.authorizer?.jwt?.claims?.sub;
  const res = await handle({
    method: event.requestContext.http.method,
    path: event.rawPath,
    query: event.queryStringParameters ?? {},
    body,
    userId: typeof sub === "string" ? sub : undefined,
  });
  return { statusCode: res.status, headers: { "content-type": "application/json" }, body: JSON.stringify(res.body) };
}

// Admin Lambda: invoked directly with `aws lambda invoke`.
export async function admin(event: AdminEvent): Promise<unknown> {
  return runAdmin(event);
}
