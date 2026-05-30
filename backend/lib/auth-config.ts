/**
 * SSM parameter that holds the CloudFront auth Lambda@Edge runtime config.
 *
 * Single source of truth for the name: `AuthStack` writes the parameter here and
 * `WebAppStorageStack` grants read access to the same name. The edge function's
 * build script (`scripts/build-edge-auth.mjs`) derives the identical name from the
 * same `PROJECT_NAME`/`STAGE` env vars — keep the two in sync if this changes.
 */
export const authConfigParameterName = (projectName: string, stage: string): string =>
  `/${projectName}/${stage}/web-app-auth/config`;
