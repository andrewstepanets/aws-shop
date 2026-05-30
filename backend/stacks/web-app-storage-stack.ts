import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  LambdaEdgeEventType,
  PriceClass,
  ViewerProtocolPolicy,
  experimental,
} from "aws-cdk-lib/aws-cloudfront";
import { S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Code, Runtime } from "aws-cdk-lib/aws-lambda";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import { Construct } from "constructs";
import { authConfigParameterName } from "../lib/auth-config";
import { BaseStack, BaseStackProps } from "../lib/base-stack";
import { S3Storage } from "../lib/s3-storage";

export class WebAppStorageStack extends BaseStack {
  public readonly webAppBucket: Bucket;
  public readonly distribution: Distribution;

  constructor(scope: Construct, id: string, props: BaseStackProps) {
    super(scope, id, props);

    this.webAppBucket = S3Storage.createPrivateBucket(
      this,
      "WebAppBucket",
      {
        bucketName: this.resourceName("web-app"),
      },
      { retainData: this.isProduction }
    );

    const authEdgeFunction = new experimental.EdgeFunction(this, "WebAppAuthEdgeFunction", {
      code: Code.fromAsset(path.join(__dirname, "../dist/lambdas/cloudfront-auth")),
      handler: "index.handler",
      runtime: Runtime.NODEJS_20_X,
      stackId: `${props.projectName}-${props.stage}-web-app-auth-edge`,
    });

    // Allow the edge function to read its runtime config from SSM. The ARN is built
    // from props rather than referencing AuthStack, so this stack stays independent
    // of AuthStack and `cdk deploy --all` can deploy both in a single pass.
    authEdgeFunction.addToRolePolicy(
      new PolicyStatement({
        actions: ["ssm:GetParameter"],
        resources: [
          cdk.Stack.of(this).formatArn({
            service: "ssm",
            resource: "parameter",
            resourceName: authConfigParameterName(props.projectName, props.stage).replace(
              /^\//,
              ""
            ),
          }),
        ],
      })
    );

    this.distribution = new Distribution(this, "WebAppDistribution", {
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(this.webAppBucket),
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        edgeLambdas: [
          {
            eventType: LambdaEdgeEventType.VIEWER_REQUEST,
            functionVersion: authEdgeFunction.currentVersion,
          },
        ],
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: "index.html",
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
        },
      ],
      priceClass: PriceClass.PRICE_CLASS_100,
    });

    new BucketDeployment(this, "WebAppDeployment", {
      sources: [Source.asset(path.join(__dirname, "../../dist"))],
      destinationBucket: this.webAppBucket,
      distribution: this.distribution,
      distributionPaths: ["/*"],
    });

    new cdk.CfnOutput(this, "WebAppBucketName", {
      value: this.webAppBucket.bucketName,
    });

    new cdk.CfnOutput(this, "WebAppDistributionDomainName", {
      value: this.distribution.distributionDomainName,
    });
  }
}
