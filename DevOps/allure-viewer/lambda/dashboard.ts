import type { ALBEvent, ALBResult } from "aws-lambda";

export async function handler(_event: ALBEvent): Promise<ALBResult> {
  const html = `<html><body style="font-family:Arial;padding:24px;">
  <h1>Allure Dashboard (Auth OK)</h1>
  <p>If you can see this, ALB + Cognito authentication is working.</p>
</body></html>`;

  return {
    statusCode: 200,
    statusDescription: "200 OK",
    isBase64Encoded: false,
    headers: { "content-type": "text/html; charset=utf-8" },
    body: html,
  };
}
