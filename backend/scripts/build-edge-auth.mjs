import "dotenv/config";
import { build } from "esbuild";

const requiredEnv = [
  "AWS_REGION",
  "COGNITO_DOMAIN_PREFIX",
  "COGNITO_USER_POOL_ID",
  "COGNITO_CLIENT_ID",
  "WEB_APP_URL",
];

const getEnv = (name) => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

for (const name of requiredEnv) {
  getEnv(name);
}

await build({
  bundle: true,
  define: {
    AUTH_AWS_REGION: JSON.stringify(getEnv("AWS_REGION")),
    AUTH_COGNITO_DOMAIN_PREFIX: JSON.stringify(getEnv("COGNITO_DOMAIN_PREFIX")),
    AUTH_COGNITO_USER_POOL_ID: JSON.stringify(getEnv("COGNITO_USER_POOL_ID")),
    AUTH_COGNITO_CLIENT_ID: JSON.stringify(getEnv("COGNITO_CLIENT_ID")),
    AUTH_WEB_APP_URL: JSON.stringify(getEnv("WEB_APP_URL")),
  },
  entryPoints: ["lambdas/cloudfront-auth/handler.ts"],
  external: ["aws-sdk"],
  format: "cjs",
  logLevel: "info",
  minify: true,
  outfile: "dist/lambdas/cloudfront-auth/index.js",
  platform: "node",
  target: "node20",
});
