import * as cdk from "aws-cdk-lib";
import { GlobalStack } from "../lib/global-stack";
import { RegionalStack } from "../lib/regional-stack";

const app = new cdk.App();

const domainName = app.node.tryGetContext("domainName") ?? "ds-shin.com";
const dashboardSub = app.node.tryGetContext("dashboardSub") ?? "allurereport";
const loginSub = app.node.tryGetContext("loginSub") ?? "allurereportlogin";
const cognitoCustomDomainCertARN =
  "arn:aws:acm:us-east-1:484907527321:certificate/9599c608-8ee2-4cee-8789-b87c7ba4eee1";

const dashboardFqdn = `${dashboardSub}.${domainName}`;
const loginFqdn = `${loginSub}.${domainName}`;
const cognitoCloudFrontFqdn = "d2qpq62vczftwx.cloudfront.net";

// Optional: If you already have an S3 bucket, specify it here
const allureBucketName = app.node.tryGetContext("allureBucketName");

const account = process.env.CDK_DEFAULT_ACCOUNT!;
const region = process.env.CDK_DEFAULT_REGION!;

// Global stack for CloudFront cert (still needed later)
new GlobalStack(app, "AllureViewer-Global", {
  env: { account, region: "us-east-1" },
  domainName,
  dashboardFqdn,
  loginFqdn,
});

// Regional stack: Cognito + ALB + Lambda
new RegionalStack(app, "AllureViewer-Regional", {
  env: { account, region },
  domainName,
  dashboardFqdn,
  loginFqdn,
  cognitoCustomDomainCertARN,
  cognitoCloudFrontFqdn,
  allureBucketName,
});
