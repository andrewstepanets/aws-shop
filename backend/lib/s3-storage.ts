import * as cdk from "aws-cdk-lib";
import { BlockPublicAccess, Bucket, BucketEncryption, BucketProps } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

export type StorageBucketProps = Omit<
  BucketProps,
  "blockPublicAccess" | "encryption" | "enforceSSL" | "versioned" | "removalPolicy"
>;

export class S3Storage {
  static createPrivateBucket(scope: Construct, id: string, props: StorageBucketProps): Bucket {
    return new Bucket(scope, id, {
      ...props,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
  }
}
