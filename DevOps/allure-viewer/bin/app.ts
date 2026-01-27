import * as cdk from "aws-cdk-lib";
import { GlobalStack } from "../lib/global-stack";

const app = new cdk.App();

const domainName = app.node.tryGetContext("domainName") ?? "ds-shin.com";
const dashboardSub = app.node.tryGetContext("dashboardSub") ?? "allure";
const dashboardFqdn = `${dashboardSub}.${domainName}`;

const account = process.env.CDK_DEFAULT_ACCOUNT!;

new GlobalStack(app, "AllureViewer-Global", {
  env: { account, region: "us-east-1" },
  domainName,
  dashboardFqdn,
});
