import { createPublicKey, JsonWebKey, verify } from "node:crypto";
import { request as httpsRequest } from "node:https";
import { URLSearchParams } from "node:url";

declare const AUTH_AWS_REGION: string;
declare const AUTH_COGNITO_DOMAIN_PREFIX: string;
declare const AUTH_COGNITO_USER_POOL_ID: string;
declare const AUTH_COGNITO_CLIENT_ID: string;
declare const AUTH_WEB_APP_URL: string;

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

const region = AUTH_AWS_REGION;
const domainPrefix = AUTH_COGNITO_DOMAIN_PREFIX;
const userPoolId = AUTH_COGNITO_USER_POOL_ID;
const clientId = AUTH_COGNITO_CLIENT_ID;
const webAppUrl = AUTH_WEB_APP_URL.replace(/\/$/, "");
const cognitoDomain = `${domainPrefix}.auth.${region}.amazoncognito.com`;
const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
const redirectUri = webAppUrl;
const authorizePath = "/oauth2/authorize";
const tokenPath = "/oauth2/token";

let jwksCache: Jwk[] | undefined;

export const handler = async (event: CloudFrontEvent) => {
  const request = event.Records[0].cf.request;
  const cookies = parseCookies(request.headers.cookie?.[0]?.value ?? "");
  const idToken = cookies.id_token;

  if (idToken && (await isValidIdToken(idToken))) {
    return request;
  }

  const query = new URLSearchParams(request.querystring);
  const code = query.get("code");

  if (code) {
    return handleCodeCallback(request, code, query.get("state"));
  }

  return redirectToHostedUi(request);
};

const handleCodeCallback = async (
  request: CloudFrontRequest,
  code: string,
  state: string | null
) => {
  try {
    const tokenResponse = await exchangeCodeForTokens(code);
    const cleanPath = getRedirectPathFromState(state) ?? request.uri;
    const maxAge = getTokenMaxAge(tokenResponse.id_token, tokenResponse.expires_in);

    return {
      status: "302",
      statusDescription: "Found",
      headers: {
        location: [{ key: "Location", value: `${webAppUrl}${cleanPath}` }],
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
    return redirectToHostedUi(request);
  }
};

const redirectToHostedUi = (request: CloudFrontRequest) => {
  const state = base64UrlEncode(request.uri);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
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
          value: `https://${cognitoDomain}${authorizePath}?${params.toString()}`,
        },
      ],
    },
  };
};

const exchangeCodeForTokens = (code: string): Promise<TokenResponse> => {
  const body = new URLSearchParams({
    client_id: clientId,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  }).toString();

  return postJson<TokenResponse>(cognitoDomain, tokenPath, body);
};

const isValidIdToken = async (token: string): Promise<boolean> => {
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
    payload.iss !== issuer ||
    payload.aud !== clientId ||
    payload.token_use !== "id" ||
    payload.exp <= Math.floor(Date.now() / 1000)
  ) {
    return false;
  }

  const jwk = (await getJwks()).find((key) => key.kid === header.kid);

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

const getJwks = async (): Promise<Jwk[]> => {
  if (jwksCache) {
    return jwksCache;
  }

  const response = await getJson<{ keys: Jwk[] }>(
    `cognito-idp.${region}.amazonaws.com`,
    `/${userPoolId}/.well-known/jwks.json`
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
