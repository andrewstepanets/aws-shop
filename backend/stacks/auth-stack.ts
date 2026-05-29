import * as cdk from "aws-cdk-lib";
import {
  AccountRecovery,
  ManagedLoginVersion,
  OAuthScope,
  UserPool,
  UserPoolClient,
  UserPoolClientIdentityProvider,
  UserPoolDomain,
  VerificationEmailStyle,
} from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";
import { BaseStack, BaseStackProps } from "../lib/base-stack";

export interface AuthStackProps extends BaseStackProps {
  callbackUrls: string[];
  cognitoDomainPrefix: string;
  logoutUrls: string[];
}

export class AuthStack extends BaseStack {
  public readonly userPool: UserPool;
  public readonly userPoolClient: UserPoolClient;
  public readonly userPoolDomain: UserPoolDomain;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const defaultRedirectUri = props.callbackUrls[0];

    this.userPool = new UserPool(this, "WebAppUserPool", {
      userPoolName: this.resourceName("users"),
      selfSignUpEnabled: false,
      signInAliases: {
        email: true,
      },
      autoVerify: {
        email: true,
      },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      passwordPolicy: {
        minLength: 8,
        requireDigits: true,
        requireLowercase: true,
        requireSymbols: false,
        requireUppercase: true,
      },
      userVerification: {
        emailStyle: VerificationEmailStyle.CODE,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.userPoolClient = this.userPool.addClient("WebAppClient", {
      userPoolClientName: this.resourceName("web-app-client"),
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      generateSecret: false,
      preventUserExistenceErrors: true,
      supportedIdentityProviders: [UserPoolClientIdentityProvider.COGNITO],
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [OAuthScope.EMAIL, OAuthScope.OPENID, OAuthScope.PROFILE],
        callbackUrls: props.callbackUrls,
        defaultRedirectUri,
        logoutUrls: props.logoutUrls,
      },
    });

    this.userPoolDomain = this.userPool.addDomain("WebAppUserPoolDomain", {
      cognitoDomain: {
        domainPrefix: props.cognitoDomainPrefix,
      },
      managedLoginVersion: ManagedLoginVersion.CLASSIC_HOSTED_UI,
    });

    new cdk.CfnOutput(this, "UserPoolId", {
      value: this.userPool.userPoolId,
    });

    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: this.userPoolClient.userPoolClientId,
    });

    new cdk.CfnOutput(this, "UserPoolDomainPrefix", {
      value: props.cognitoDomainPrefix,
    });

    new cdk.CfnOutput(this, "HostedUiSignInUrl", {
      value: cdk.Fn.join("", [
        "https://",
        props.cognitoDomainPrefix,
        ".auth.",
        this.region,
        ".amazoncognito.com/oauth2/authorize?client_id=",
        this.userPoolClient.userPoolClientId,
        "&response_type=code&scope=openid+email+profile&redirect_uri=",
        defaultRedirectUri,
      ]),
    });
  }
}
