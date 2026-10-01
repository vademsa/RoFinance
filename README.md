# RoFinance

English (primary) · [Tiếng Việt](README.vi.md)

RoFinance is a personal finance app for tracking income, expenses, debts, and balances across configurable budget jars and financial cycles. It is built with React, Express, and PostgreSQL, with optional Gemini AI features and Binance market data.

## Requirements

- Node.js 20.9 or later
- PostgreSQL 14 or later (including Google Cloud SQL for PostgreSQL)

## Quick start

```bash
cp .env.example .env.local
npm install
npm run dev
```

Edit `.env.local` before starting the app. At minimum, set `DATABASE_URL` to your PostgreSQL connection string and `SESSION_SECRET` to a random string of at least 32 characters. The app reads `.env.local` and then `.env`; these files are excluded from Git. Do not put real credentials in `.env.example` or commit them to the repository.

The main configuration values are:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string; required. |
| `SESSION_SECRET` | Secret for signing sessions; required, at least 32 characters. |
| `MOBILE_JWT_ACTIVE_KID` | Active key ID for mobile access-token signing; optional until mobile access is enabled. |
| `MOBILE_JWT_KEYS` | JSON map of key IDs to your own base64-encoded random keys (at least 32 bytes each). Keep prior keys temporarily during rotation. |
| `MOBILE_ALLOWED_ORIGINS` | Optional exact Capacitor WebView origins; defaults to the standard iOS and Android localhost origins. |
| `DATABASE_SSL` | Set to `false` when the database connection should not use SSL. |
| `DATABASE_POOL_SIZE` | Maximum PostgreSQL connection pool size; defaults to `10`. |
| `APP_URL` | Public base URL used for OAuth callbacks; can also be stored in `app_config`. |
| `GEMINI_API_KEY` | Optional bootstrap fallback for AI features. |
| `GEMINI_MODEL` | Optional Gemini model override. |

`DATABASE_URL` and `SESSION_SECRET` must come from the environment because they are needed before the app can read PostgreSQL. For AI features, you can store the Gemini key under `gemini_api_key` in the `app_config` table, with `is_secret` set to `true`. Leave all values in the committed template blank; provide real values only in your local environment or server configuration.

## Google and Apple sign-in

Register these callback paths under your own public `APP_URL` in Google Cloud Console and Apple Developer:

- `/api/auth/google/callback`
- `/api/auth/apple/callback`

Set `APP_URL` in the environment or store it as `app_url` in `app_config`. Store Google settings under `google_oauth` (`clientId`, `clientSecret`) and Apple settings under `apple_oauth` (`clientId`, `teamId`, `keyId`, `privateKey`); mark both provider entries as secret. Enter actual values only in your deployment environment or database.

Google requires an OAuth web client. Apple requires a Service ID with Sign in with Apple enabled and a `.p8` private key. A provider's sign-in button is enabled only when its configuration is complete.

## Build and checks

```bash
npm run lint
npm run test:logic
npm run build
npm start
```

The server creates the required tables on startup. If you manage production migrations separately, the equivalent SQL is in [`server/migrations/001_initial.sql`](server/migrations/001_initial.sql).

## Data and authentication

- `users` stores email, bcrypt password hash, display name, and validated avatar data.
- `auth_identities` links users to Google or Apple accounts.
- `user_sessions` stores sessions in PostgreSQL through `connect-pg-simple`; the browser receives an `HttpOnly` session cookie.
- `user_data` stores one JSONB financial data record per user.
- `app_config` stores server-side runtime settings.

Financial data, AI, and bank synchronization APIs require authentication. Health checks and registration/sign-in endpoints are public. On the first sign-in after upgrading from local storage, legacy IndexedDB/LocalStorage data is imported once into the PostgreSQL account; it is not automatically imported into a second account on the same browser.

## Mobile app

The independent Android/iOS frontend is in [RoFinance-Mobile](RoFinance-Mobile/README.md). It calls this backend over HTTPS. Web authentication remains cookie-session based; mobile uses short-lived JWT access tokens and rotating, revocable refresh tokens. To enable mobile authentication, generate your own random key (`openssl rand -base64 32`), place it in `MOBILE_JWT_KEYS` under an ID of your choice, and select that ID with `MOBILE_JWT_ACTIVE_KID`. Keep the key only in server-side secret configuration, never in the mobile build or Git. If these variables are absent, web continues to work and mobile authentication fails closed.

The data API returns a revision and requires `If-Match` on writes to report concurrent changes instead of silently overwriting them. Existing browser tabs opened before this update should be reloaded before editing. The mobile app's initial frontend is a separate copy of the web frontend, so future UI/domain-logic changes must be reviewed in both projects.
