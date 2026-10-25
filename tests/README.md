# Automated tests

Automated tests, configuration and synthetic fixtures in this directory are
versioned with the application and available in a fresh clone.
Run commands from the repository root after installing its workspace dependencies.

- `utils/`: frontend logic and rendering tests.
- `server/`: current backend unit and gated integration tests.
- `character/`: browser tests and shared synthetic API fixture.
- `scripts/`: brand-asset generator tests.
- `helpers/`: reusable test helpers without execution on import.
- `support/`: optional local-only operator tools; not shipped in Git or run automatically.
- `android/`: native unit and instrumented examples, configured through Gradle source sets.
- `archive/`: private historical tests, ignored by Git and excluded from runners/type checks.
- `artifacts/`: generated reports, screenshots and traces, ignored by Git.
- `fixtures/private/`: local-only private fixtures, ignored by Git.

```bash
npm run test:typecheck
npm run test:logic
npm run test:brand
npx playwright install chromium
npm run test:character:ui
```

Use synthetic names, emails and bank accounts only. Never commit real statements,
credentials, access tokens, cookies, browser storage state or screenshots of private
data. Generate temporary signing keys at runtime rather than embedding secrets.
The public Google issuer/icon URLs and deliberately invalid credentials in negative
tests are fixtures, not working service credentials. Keep any real configuration
in ignored environment files or your test runner's secret store.

Browser tests use intercepted synthetic APIs on a local server. Database integration
tests require `CHARACTER_TEST_DATABASE_URL` pointing to a disposable test database;
never use production. Tests create and remove uniquely named isolated schemas.
Admin integration tests additionally require `RUN_ADMIN_INTEGRATION=1` or
`RUN_ADMIN_PROXY_INTEGRATION=1`; the proxy test also needs `ADMIN_TEST_WEB_DIR`
pointing to an absolute path containing a built web app. Default runs skip these
tests unless explicitly configured. Never run
archived bank-ingestion tests against a live application: some legacy scripts
perform writes immediately when executed. Moving them here does not authorize
execution. Operator grant tools also write real state and require separate
approval of the exact account and grant before use.
