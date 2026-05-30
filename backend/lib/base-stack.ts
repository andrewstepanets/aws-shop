import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

export interface BaseStackProps extends cdk.StackProps {
  projectName: string;
  stage: string;
}

export abstract class BaseStack extends cdk.Stack {
  protected readonly projectName: string;
  protected readonly stage: string;
  protected readonly resourcePrefix: string;

  protected constructor(scope: Construct, id: string, props: BaseStackProps) {
    super(scope, id, props);

    this.projectName = props.projectName;
    this.stage = props.stage;
    this.resourcePrefix = `${props.projectName}-${props.stage}`;

    cdk.Tags.of(this).add("Project", this.projectName);
    cdk.Tags.of(this).add("Stage", this.stage);
  }

  protected resourceName(name: string): string {
    return `${this.resourcePrefix}-${name}`;
  }

  /**
   * Whether this is the production environment. Used to decide data-retention
   * defaults (e.g. keep vs. destroy stateful resources on stack deletion).
   */
  protected get isProduction(): boolean {
    return this.stage === "prod";
  }
}
