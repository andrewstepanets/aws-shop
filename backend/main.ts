#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import "dotenv/config";
import { S3StorageStack } from "./stacks/s3-storage-stack";

const app = new cdk.App();

const getEnv = (name: string): string => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

const projectName = getEnv("PROJECT_NAME");
const stage = getEnv("STAGE");
const region = getEnv("AWS_REGION");

new S3StorageStack(app, "S3StorageStack", {
  projectName,
  stage,
  env: {
    region,
  },
});
