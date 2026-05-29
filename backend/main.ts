#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import "dotenv/config";
import { AuthStack } from "./stacks/auth-stack";
import { WebAppStorageStack } from "./stacks/web-app-storage-stack";

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
const cognitoDomainPrefix = getEnv("COGNITO_DOMAIN_PREFIX");

const stackProps = {
  projectName,
  stage,
  env: {
    region,
  },
};

const webAppStorageStack = new WebAppStorageStack(app, "S3StorageStack", stackProps);
const webAppUrl = `https://${webAppStorageStack.distribution.distributionDomainName}`;

new AuthStack(app, "AuthStack", {
  ...stackProps,
  callbackUrls: [webAppUrl],
  cognitoDomainPrefix,
  logoutUrls: [webAppUrl],
});
