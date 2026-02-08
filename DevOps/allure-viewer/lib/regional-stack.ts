import * as cdk from "aws-cdk-lib";
import { CfnParameter } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as path from "path";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as elbv2_targets from "aws-cdk-lib/aws-elasticloadbalancingv2-targets";
import * as elbv2_actions from "aws-cdk-lib/aws-elasticloadbalancingv2-actions";
import * as s3 from "aws-cdk-lib/aws-s3";

export interface RegionalStackProps extends cdk.StackProps {
  domainName: string;
  dashboardFqdn: string;
  loginFqdn: string;
  cognitoCustomDomainCertARN: string;
  cognitoCloudFrontFqdn: string;
}

export class RegionalStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: RegionalStackProps) {
    super(scope, id, props);

    const zone = route53.HostedZone.fromLookup(this, "Zone", {
      domainName: props.domainName,
    });

    // Create Dummy A record for the parent domain
    const parentDomainRecord = new route53.ARecord(
      this,
      "AllureReportCognitoDummyAliasRecord",
      {
        zone: zone,
        target: route53.RecordTarget.fromIpAddresses("192.0.2.1"), //TEST-NET Dummy IP
        recordName: "", //This automatically will use hosted zone apex (ds-shin.com)
      }
    );
    const customCognitoDomainCert = acm.Certificate.fromCertificateArn(
      this,
      "CognitoDomainCert",
      props.cognitoCustomDomainCertARN
    );

    // Cognito user pool
    const userPool = new cognito.UserPool(this, "AllureReportUserPool", {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      standardAttributes: { email: { required: true, mutable: true } },
      passwordPolicy: { minLength: 12 },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
    });

    //App client (we’ll point callback to ALB first; later to CloudFront)
    const userPoolClient = userPool.addClient("AppClient", {
      generateSecret: true,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        // For now, we just want to SEE the login page.
        // We'll update this to your real app URL after ALB/CloudFront exists.
        callbackUrls: [`https://${props.dashboardFqdn}/oauth2/idpresponse`],
        logoutUrls: [`https://${props.dashboardFqdn}/`],
      },
    });

    // Cognito custom domain: allurereportlogin.ds-shin.com
    const userPoolDomain = userPool.addDomain("AllureReportUserPoolDomain", {
      customDomain: {
        domainName: props.loginFqdn,
        certificate: customCognitoDomainCert,
      },
    });

    userPoolDomain.node.addDependency(parentDomainRecord);

    // Create DNS record so you don't get NXDOMAIN
    new route53.CnameRecord(this, "CognitoDomainCname", {
      zone,
      recordName: "allurereportlogin", // IMPORTANT: relative name, not full FQDN
      domainName: props.cognitoCloudFrontFqdn,
      ttl: cdk.Duration.minutes(5),
    });

    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0, // ← This removes NAT Gateways!
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "Public",
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });

    // Dashboard lambda
    const dashboardFn = new NodejsFunction(this, "DashboardFn", {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, "../lambda/dashboard.ts"),
      handler: "handler",
    });

    const albCert = new acm.Certificate(this, "AlbCert", {
      domainName: props.dashboardFqdn, // allurereport.ds-shin.com
      validation: acm.CertificateValidation.fromDns(zone),
    });
    // ALB
    const alb = new elbv2.ApplicationLoadBalancer(this, "Alb", {
      vpc,
      internetFacing: true,
    });

    // HTTP 80 -> redirect to HTTPS 443
    alb.addListener("HttpListener", {
      port: 80,
      open: true,
      defaultAction: elbv2.ListenerAction.redirect({
        protocol: "HTTPS",
        port: "443",
        permanent: true,
      }),
    });

    // HTTPS listener (required for authenticate-cognito)
    const httpsListener = alb.addListener("HttpsListener", {
      port: 443,
      open: true,
      certificates: [elbv2.ListenerCertificate.fromCertificateManager(albCert)],
    });

    const tg = new elbv2.ApplicationTargetGroup(this, "LambdaTg", {
      targetType: elbv2.TargetType.LAMBDA,
      targets: [new elbv2_targets.LambdaTarget(dashboardFn)],
    });

    httpsListener.addAction("Default", {
      action: new elbv2_actions.AuthenticateCognitoAction({
        userPool,
        userPoolClient,
        userPoolDomain,
        next: elbv2.ListenerAction.forward([tg]),
      }),
    });

    // Route53: make allurereport.ds-shin.com point to ALB (Phase 4 entrypoint)
    const dashboardLabel = props.dashboardFqdn.replace(
      `.${props.domainName}`,
      ""
    );

    new route53.ARecord(this, "DashboardAliasA", {
      zone,
      recordName: dashboardLabel,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.LoadBalancerTarget(alb)
      ),
    });

    new route53.AaaaRecord(this, "DashboardAliasAAAA", {
      zone,
      recordName: dashboardLabel,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.LoadBalancerTarget(alb)
      ),
    });

    new cdk.CfnOutput(this, "CognitoLoginDomain", {
      value: `https://${props.loginFqdn}`,
    });
    new cdk.CfnOutput(this, "CognitoUserPoolClientId", {
      value: userPoolClient.userPoolClientId,
    });
  }
}
