import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as acm from "aws-cdk-lib/aws-certificatemanager";

export interface GlobalStackProps extends cdk.StackProps {
  domainName: string;
  dashboardFqdn: string; // allure.example.com
}

export class GlobalStack extends cdk.Stack {
  public readonly cloudFrontCertArn: string;

  constructor(scope: Construct, id: string, props: GlobalStackProps) {
    super(scope, id, props);

    const zone = route53.HostedZone.fromLookup(this, "Zone", {
      domainName: props.domainName,
    });

    const cert = new acm.Certificate(this, "CloudFrontCert", {
      domainName: props.dashboardFqdn,
      validation: acm.CertificateValidation.fromDns(zone),
    });

    this.cloudFrontCertArn = cert.certificateArn;

    new cdk.CfnOutput(this, "CloudFrontCertArn", {
      value: cert.certificateArn,
    });
  }
}
