# QuizForge web

The front end of QuizForge: a **Next.js** app that is also the **BFF** (backend for frontend). It shows the quiz screens and sits between the browser and the API: login with Amazon Cognito (Authorization Code + PKCE), the session in an httpOnly cookie, and every call to the API with the token added on the server, so the browser never sees a token.

- The API, the worker, the database, the infrastructure and the architecture report live in **[jhgcc1/quizforge](https://github.com/jhgcc1/quizforge)**.
- The only thing shared between the two repositories is the **API contract** (request and response schemas, zod): `@quizforge/contract`, released as a tarball on a GitHub Release of the back end repository. Its URL is in `package.json`; to update it, change the version in that URL and run `pnpm install`.

## Run it

```bash
pnpm install
AUTH_MODE=local LOCAL_JWT_SECRET=<at least 32 characters> APP_URL=http://localhost:3000 API_URL=http://localhost:18080 pnpm dev
```

`AUTH_MODE=local` replaces Cognito with a development login (any user name). To run the whole system (API, worker, database, queue), use the docker compose of the back end repository, which builds this repository's image too.

| Variable | Meaning |
|---|---|
| `AUTH_MODE` | `cognito` (default) or `local` (development only, refused outside localhost) |
| `APP_URL`, `API_URL` | Public address of this app, address of the API |
| `COGNITO_DOMAIN`, `COGNITO_CLIENT_ID`, `COGNITO_CLIENT_SECRET` | The Cognito app client (set by the infrastructure) |
| `OAUTH_SCOPES` | Scopes requested at login. Default `openid email`. Set `openid email profile` to get the user name (needs `profile` allowed on the Cognito app client first, otherwise the Hosted UI returns invalid_scope) |
| `ALLOW_SIGNUP`, `SOCIAL_PROVIDERS` | Show "Create account" and the Google / Facebook buttons (`google,facebook`) |

## Checks

```bash
pnpm typecheck && pnpm lint && pnpm test:coverage && pnpm build
```

CI (`.github/workflows/ci.yml`) runs `quality` (types, lint, unit tests with a coverage floor), `build`, `docker-build` (image plus a Trivy scan) and `secrets-scan` (gitleaks). `main` is protected by a ruleset (`scripts/protect-main.sh`): pull request, these four checks, linear history.

## How it is deployed

The back end repository owns the infrastructure and the deploy. Its pipeline checks this repository out at a pinned ref, builds the `web` image from the `Dockerfile` here, and ships it together with the API and the worker after a human approval. A merge here does not deploy by itself.

## Tests

`lib/` (the BFF helpers) and `app/**/route.ts` (the route handlers) have unit tests. The React components are checked by the end-to-end test (Playwright in Chrome), which lives in the back end repository because it needs all the services.
