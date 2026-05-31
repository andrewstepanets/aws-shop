#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import "dotenv/config";
import { AuthStack } from "./stacks/auth-stack";
import { CiOidcStack } from "./stacks/ci-oidc-stack";
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

// Stack names are stage-qualified so multiple environments (dev, prod) can live
// side by side in the same account without colliding.
const stackId = (name: string): string => `${projectName}-${stage}-${name}`;

const stackProps = {
  projectName,
  stage,
  env: {
    region,
  },
};

const webAppStorageStack = new WebAppStorageStack(app, stackId("storage"), stackProps);
const webAppUrl = `https://${webAppStorageStack.distribution.distributionDomainName}`;

new AuthStack(app, stackId("auth"), {
  ...stackProps,
  callbackUrls: [webAppUrl],
  cognitoDomainPrefix,
  logoutUrls: [webAppUrl],
});

// Account-level CI role for GitHub Actions. Excluded from normal `cdk deploy --all`
// so CI never tries to mutate its own IAM role; deploy it once manually with:
//   cdk deploy aws-shop-ci-oidc -c includeCi=true
if (app.node.tryGetContext("includeCi") === "true") {
  new CiOidcStack(app, `${projectName}-ci-oidc`, {
    env: { region },
    githubOwner: process.env.GITHUB_OWNER ?? "andrewstepanets",
    githubRepo: process.env.GITHUB_REPO ?? "aws-shop",
  });
}
