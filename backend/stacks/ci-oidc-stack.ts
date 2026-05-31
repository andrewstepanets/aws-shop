import * as cdk from "aws-cdk-lib";
import {
  OpenIdConnectPrincipal,
  OpenIdConnectProvider,
  PolicyStatement,
  Role,
} from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export interface CiOidcStackProps extends cdk.StackProps {
  /** GitHub org/user that owns the repository, e.g. "andrewstepanets". */
  githubOwner: string;
  /** Repository name, e.g. "aws-shop". */
  githubRepo: string;
  /** CDK bootstrap qualifier — must match what `cdk bootstrap` used (default "hnb659fds"). */
  bootstrapQualifier?: string;
}

/**
 * Account-level CI plumbing: lets GitHub Actions authenticate to AWS via OIDC
 * (no long-lived access keys stored as GitHub secrets) and deploy this project's
 * CDK app.
 *
 * Deploy this ONCE manually with admin credentials:
 *   cdk deploy aws-shop-ci-oidc -c includeCi=true
 * then copy the DeployRoleArn output into the repo variable AWS_DEPLOY_ROLE_ARN.
 *
 * The role can only assume the CDK bootstrap roles (cdk-<qualifier>-*), so its
 * effective permissions are exactly whatever `cdk bootstrap` granted — not a
 * standing admin identity.
 */
export class CiOidcStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CiOidcStackProps) {
    super(scope, id, props);

    const { githubOwner, githubRepo } = props;
    const qualifier = props.bootstrapQualifier ?? "hnb659fds";
    const repo = `repo:${githubOwner}/${githubRepo}`;

    // One OIDC provider per account for GitHub. If the account already has one,
    // import it instead of creating a second (AWS allows only one per URL).
    const provider = new OpenIdConnectProvider(this, "GitHubOidcProvider", {
      url: "https://token.actions.githubusercontent.com",
      clientIds: ["sts.amazonaws.com"],
    });

    // Trust only specific GitHub contexts of this repo:
    // - deploys from the main branch (dev),
    // - pull requests (cdk diff),
    // - jobs running in the "production" GitHub Environment (prod, behind approval).
    const principal = new OpenIdConnectPrincipal(provider, {
      StringEquals: {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
      },
      StringLike: {
        "token.actions.githubusercontent.com:sub": [
          `${repo}:ref:refs/heads/main`,
          `${repo}:pull_request`,
          `${repo}:environment:production`,
        ],
      },
    });

    const deployRole = new Role(this, "GitHubActionsDeployRole", {
      roleName: `${githubRepo}-gha-deploy`,
      assumedBy: principal,
      maxSessionDuration: cdk.Duration.hours(1),
      description: `GitHub Actions deploy role for ${githubOwner}/${githubRepo}`,
    });

    deployRole.addToPolicy(
      new PolicyStatement({
        sid: "AssumeCdkBootstrapRoles",
        actions: ["sts:AssumeRole"],
        resources: [`arn:aws:iam::${this.account}:role/cdk-${qualifier}-*`],
      })
    );

    new cdk.CfnOutput(this, "DeployRoleArn", {
      value: deployRole.roleArn,
      description: "Set this as the GitHub repo variable AWS_DEPLOY_ROLE_ARN",
    });
  }
}
