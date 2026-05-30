import * as cdk from "aws-cdk-lib";
import { BlockPublicAccess, Bucket, BucketEncryption, BucketProps } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

export type StorageBucketProps = Omit<
  BucketProps,
  | "autoDeleteObjects"
  | "blockPublicAccess"
  | "encryption"
  | "enforceSSL"
  | "versioned"
  | "removalPolicy"
>;

export interface PrivateBucketOptions {
  /**
   * Whether the bucket holds data that must survive a `cdk destroy`.
   *
   * `true` (production): keep the bucket on stack deletion and enable versioning.
   * `false` (ephemeral envs like dev): delete the bucket and all its objects on
   * stack deletion, so the stack can be torn down and re-created cleanly without
   * a leftover bucket blocking the (fixed) bucket name on the next deploy.
   */
  retainData: boolean;
}

export class S3Storage {
  static createPrivateBucket(
    scope: Construct,
    id: string,
    props: StorageBucketProps,
    options: PrivateBucketOptions
  ): Bucket {
    return new Bucket(scope, id, {
      ...props,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: options.retainData,
      removalPolicy: options.retainData
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: !options.retainData,
    });
  }
}
