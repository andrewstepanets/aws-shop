import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { createPublicKey, JsonWebKey, verify } from "node:crypto";
import { request as httpsRequest } from "node:https";
import { URLSearchParams } from "node:url";

// Injected at build time (static values only — no dependency on deployed stack outputs).
declare const AUTH_CONFIG_PARAM_NAME: string;
declare const AUTH_CONFIG_REGION: string;

interface CloudFrontHeader {
  key?: string;
  value: string;
}

interface CloudFrontRequest {
  headers: Record<string, CloudFrontHeader[] | undefined>;
  querystring: string;
  uri: string;
}

interface CloudFrontEvent {
  Records: Array<{
    cf: {
      request: CloudFrontRequest;
    };
  }>;
}

interface Jwk extends JsonWebKey {
  alg: string;
  e: string;
  kid: string;
  kty: string;
  n: string;
  use: string;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  id_token: string;
  refresh_token?: string;
  token_type: string;
}

// Cognito configuration resolved at runtime from SSM (Lambda@Edge has no env vars).
interface AuthConfig {
  clientId: string;
  domainPrefix: string;
  region: string;
  userPoolId: string;
}

// Per-request derived values (web app URL comes from the incoming Host header).
interface AuthContext {
  authorizeUrl: string;
  clientId: string;
  cognitoDomain: string;
  issuer: string;
  jwksHost: string;
  redirectUri: string;
  region: string;
  userPoolId: string;
  webAppUrl: string;
}

const ssmClient = new SSMClient({ region: AUTH_CONFIG_REGION });

let configCache: AuthConfig | undefined;
let jwksCache: Jwk[] | undefined;

export const handler = async (event: CloudFrontEvent) => {
  const request = event.Records[0].cf.request;
  const ctx = await buildContext(request);
  const cookies = parseCookies(request.headers.cookie?.[0]?.value ?? "");
  const idToken = cookies.id_token;

  if (idToken && (await isValidIdToken(idToken, ctx))) {
    return request;
  }

  const query = new URLSearchParams(request.querystring);
  const code = query.get("code");

  if (code) {
    return handleCodeCallback(request, code, query.get("state"), ctx);
  }

  return redirectToHostedUi(request, ctx);
};

const loadConfig = async (): Promise<AuthConfig> => {
  if (configCache) {
    return configCache;
  }

  const response = await ssmClient.send(
    new GetParameterCommand({ Name: AUTH_CONFIG_PARAM_NAME })
  );
  const value = response.Parameter?.Value;

  if (!value) {
    throw new Error(`Auth config parameter ${AUTH_CONFIG_PARAM_NAME} is empty`);
  }

  configCache = JSON.parse(value) as AuthConfig;
  return configCache;
};

const buildContext = async (request: CloudFrontRequest): Promise<AuthContext> => {
  const config = await loadConfig();
  const host = request.headers.host?.[0]?.value ?? "";
  const webAppUrl = `https://${host}`.replace(/\/$/, "");
  const cognitoDomain = `${config.domainPrefix}.auth.${config.region}.amazoncognito.com`;

  return {
    authorizeUrl: `https://${cognitoDomain}/oauth2/authorize`,
    clientId: config.clientId,
    cognitoDomain,
    issuer: `https://cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`,
    jwksHost: `cognito-idp.${config.region}.amazonaws.com`,
    redirectUri: webAppUrl,
    region: config.region,
    userPoolId: config.userPoolId,
    webAppUrl,
  };
};

const handleCodeCallback = async (
  request: CloudFrontRequest,
  code: string,
  state: string | null,
  ctx: AuthContext
) => {
  try {
    const tokenResponse = await exchangeCodeForTokens(code, ctx);
    const cleanPath = getRedirectPathFromState(state) ?? request.uri;
    const maxAge = getTokenMaxAge(tokenResponse.id_token, tokenResponse.expires_in);

    return {
      status: "302",
      statusDescription: "Found",
      headers: {
        location: [{ key: "Location", value: `${ctx.webAppUrl}${cleanPath}` }],
        "set-cookie": [
          {
            key: "Set-Cookie",
            value: buildCookie("id_token", tokenResponse.id_token, maxAge),
          },
          {
            key: "Set-Cookie",
            value: buildCookie("access_token", tokenResponse.access_token, maxAge),
          },
        ],
      },
    };
  } catch {
    return redirectToHostedUi(request, ctx);
  }
};

const redirectToHostedUi = (request: CloudFrontRequest, ctx: AuthContext) => {
  const state = base64UrlEncode(request.uri);
  const params = new URLSearchParams({
    client_id: ctx.clientId,
    redirect_uri: ctx.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
  });

  return {
    status: "302",
    statusDescription: "Found",
    headers: {
      location: [
        {
          key: "Location",
          value: `${ctx.authorizeUrl}?${params.toString()}`,
        },
      ],
    },
  };
};

const exchangeCodeForTokens = (code: string, ctx: AuthContext): Promise<TokenResponse> => {
  const body = new URLSearchParams({
    client_id: ctx.clientId,
    code,
    grant_type: "authorization_code",
    redirect_uri: ctx.redirectUri,
  }).toString();

  return postJson<TokenResponse>(ctx.cognitoDomain, "/oauth2/token", body);
};

const isValidIdToken = async (token: string, ctx: AuthContext): Promise<boolean> => {
  const parts = token.split(".");

  if (parts.length !== 3) {
    return false;
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJwtPart<{ alg: string; kid: string }>(encodedHeader);
  const payload = decodeJwtPart<{
    aud: string;
    exp: number;
    iss: string;
    token_use: string;
  }>(encodedPayload);

  if (
    header.alg !== "RS256" ||
    payload.iss !== ctx.issuer ||
    payload.aud !== ctx.clientId ||
    payload.token_use !== "id" ||
    payload.exp <= Math.floor(Date.now() / 1000)
  ) {
    return false;
  }

  const jwk = await findJwk(header.kid, ctx);

  if (!jwk) {
    return false;
  }

  return verify(
    "RSA-SHA256",
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    createPublicKey({ format: "jwk", key: jwk }),
    base64UrlDecode(encodedSignature)
  );
};

const findJwk = async (kid: string, ctx: AuthContext): Promise<Jwk | undefined> => {
  const cached = (await getJwks(ctx)).find((key) => key.kid === kid);

  if (cached) {
    return cached;
  }

  // Cognito may have rotated its signing keys — refetch once before giving up.
  jwksCache = undefined;
  return (await getJwks(ctx)).find((key) => key.kid === kid);
};

const getJwks = async (ctx: AuthContext): Promise<Jwk[]> => {
  if (jwksCache) {
    return jwksCache;
  }

  const response = await getJson<{ keys: Jwk[] }>(
    ctx.jwksHost,
    `/${ctx.userPoolId}/.well-known/jwks.json`
  );

  jwksCache = response.keys;
  return jwksCache;
};

const postJson = <T>(hostname: string, path: string, body: string): Promise<T> => {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        headers: {
          "content-length": Buffer.byteLength(body).toString(),
          "content-type": "application/x-www-form-urlencoded",
        },
        hostname,
        method: "POST",
        path,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");

          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(raw));
            return;
          }

          resolve(JSON.parse(raw) as T);
        });
      }
    );

    req.on("error", reject);
    req.write(body);
    req.end();
  });
};

const getJson = <T>(hostname: string, path: string): Promise<T> => {
  return new Promise((resolve, reject) => {
    const req = httpsRequest({ hostname, method: "GET", path }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");

        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(raw));
          return;
        }

        resolve(JSON.parse(raw) as T);
      });
    });

    req.on("error", reject);
    req.end();
  });
};

const parseCookies = (cookieHeader: string): Record<string, string> => {
  return cookieHeader.split(";").reduce<Record<string, string>>((cookies, cookie) => {
    const [name, ...valueParts] = cookie.trim().split("=");

    if (name) {
      cookies[name] = decodeURIComponent(valueParts.join("="));
    }

    return cookies;
  }, {});
};

const buildCookie = (name: string, value: string, maxAge: number): string => {
  return `${name}=${encodeURIComponent(
    value
  )}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Lax`;
};

const getTokenMaxAge = (idToken: string, fallback: number): number => {
  try {
    const payload = decodeJwtPart<{ exp: number }>(idToken.split(".")[1]);
    return Math.max(payload.exp - Math.floor(Date.now() / 1000), 0);
  } catch {
    return fallback;
  }
};

const getRedirectPathFromState = (state: string | null): string | undefined => {
  if (!state) {
    return undefined;
  }

  const decoded = base64UrlDecode(state).toString("utf8");
  return decoded.startsWith("/") ? decoded : undefined;
};

const decodeJwtPart = <T>(value: string): T => {
  return JSON.parse(base64UrlDecode(value).toString("utf8")) as T;
};

const base64UrlEncode = (value: string): string => {
  return Buffer.from(value, "utf8").toString("base64url");
};

const base64UrlDecode = (value: string): Buffer => {
  return Buffer.from(value, "base64url");
};
