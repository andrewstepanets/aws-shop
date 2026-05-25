import * as cdk from "aws-cdk-lib";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { BaseStack, BaseStackProps } from "../lib/base-stack";
import { S3Storage } from "../lib/s3-storage";

export class S3StorageStack extends BaseStack {
  public readonly webAppBucket: Bucket;

  constructor(scope: Construct, id: string, props: BaseStackProps) {
    super(scope, id, props);

    this.webAppBucket = S3Storage.createPrivateBucket(this, "WebAppBucket", {
      bucketName: this.resourceName("web-app"),
    });

    new cdk.CfnOutput(this, "WebAppBucketName", {
      value: this.webAppBucket.bucketName,
    });
  }
}
