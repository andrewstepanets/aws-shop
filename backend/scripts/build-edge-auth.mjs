import "dotenv/config";
import { build } from "esbuild";

// Only static, deploy-independent values are baked in. Cognito identifiers are
// resolved at runtime from SSM, so this build does not depend on any deployed stack.
const requiredEnv = ["AWS_REGION", "PROJECT_NAME", "STAGE"];

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

const configParamName = `/${getEnv("PROJECT_NAME")}/${getEnv("STAGE")}/web-app-auth/config`;

await build({
  bundle: true,
  define: {
    AUTH_CONFIG_PARAM_NAME: JSON.stringify(configParamName),
    AUTH_CONFIG_REGION: JSON.stringify(getEnv("AWS_REGION")),
  },
  entryPoints: ["lambdas/cloudfront-auth/handler.ts"],
  // Provided by the Lambda Node.js 22 runtime — no need to bundle.
  external: ["@aws-sdk/*", "aws-sdk"],
  format: "cjs",
  logLevel: "info",
  minify: true,
  outfile: "dist/lambdas/cloudfront-auth/index.js",
  platform: "node",
  target: "node22",
});
