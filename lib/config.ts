import "server-only";

/** Server-side configuration. Never imported by client components. */
export interface WebConfig {
  authMode: "cognito" | "local";
  cognitoDomain: string;
  clientId: string;
  clientSecret: string;
  appUrl: string;
  apiUrl: string;
  localSecret: string;
  secureCookies: boolean;
}

export function webConfig(env: NodeJS.ProcessEnv = process.env): WebConfig {
  const authMode = env.AUTH_MODE === "local" ? "local" : "cognito";
  const appUrl = (env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  // Dev-only login is refused anywhere that is not literally localhost, whatever NODE_ENV says.
  if (authMode === "local" && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(appUrl)) {
    throw new Error("AUTH_MODE=local is only allowed when APP_URL is http://localhost or http://127.0.0.1");
  }
  return {
    authMode,
    cognitoDomain: (env.COGNITO_DOMAIN ?? "").replace(/\/$/, ""),
    clientId: env.COGNITO_CLIENT_ID ?? "",
    clientSecret: env.COGNITO_CLIENT_SECRET ?? "",
    appUrl,
    apiUrl: (env.API_URL ?? "http://localhost:8080").replace(/\/$/, ""),
    localSecret: env.LOCAL_JWT_SECRET ?? "",
    secureCookies: appUrl.startsWith("https://"),
  };
}
