# RoFinance overview
RoFinance is a Vietnamese personal-finance web app based on the six-jar budgeting model. It covers income allocation, spending transactions, debt, bank-account records, safer investments, crypto positions, analytics, and Gemini-powered financial guidance.

## Architecture
- `src/main.tsx` boots a React 19 SPA through Vite.
- `src/App.tsx` is the main client orchestrator and state owner. Feature UI lives under `src/components/`.
- `src/types.ts` defines the financial domain model; `src/constants/defaultData.ts` provides default/seed state.
- `src/lib/api.ts` wraps authenticated session and whole-account data APIs.
- `src/lib/localDb.ts` supports legacy IndexedDB/localStorage import and browser backup.
- `server.ts` is the Express composition root. It initializes PostgreSQL, sessions, auth/OAuth, data APIs, AI endpoints, crypto market proxy/search, bank balance confirmation, and Vite/static serving.
- `server/auth.ts`, `server/oauth.ts`, and `server/db.ts` isolate authentication, OAuth, and database setup/config.
- PostgreSQL stores normalized identity/session/config tables plus one JSONB `user_data` snapshot per user.

## Runtime data flow
On startup the SPA restores the session, loads `/api/data`, and imports legacy browser data once when the account has no server snapshot. `App` owns financial state and serializes debounced saves through a promise queue to `PUT /api/data`. The server allowlists top-level fields and upserts the JSONB snapshot under a per-user PostgreSQL advisory lock.

## External services
Google/Apple OAuth, Google Gemini, PostgreSQL, and public Binance/OKX/Bybit market APIs. Bank balances are manual confirmations; the server does not connect to banks.

## Monthly financial cycles
Users can configure `preferences.monthlyResetDay` (1-31). `src/utils/monthlyCycle.ts` owns local-date-safe cycle boundaries, summaries, and recalculation. `App.tsx` persists `activeCycleStart` and up to 60 `monthlySummaries`, automatically closes elapsed cycles, recalculates jar `currentSpent` for the active cycle, and retains all transactions. `AnalyticsCharts.tsx` displays real cycle history; the setting lives in `Navbar.tsx`. PostgreSQL's `/api/data` allowlist includes both cycle fields.

### Spending invariant
`Jar.currentSpent` is derived state: always recompute it from expense transactions inside the active financial cycle with `applyCurrentCycleSpending`. Planning/configuration flows (income allocation, debt reallocation, jar editing) must never trust or restore `currentSpent` from modal snapshots. Regression coverage is in `src/utils/monthlyCycle.test.ts` and runs with `npm run test:logic`. Local calendar dates use `toLocalDateKey`, not UTC `toISOString().slice(0, 10)`.

### Cycle income invariant
A completed cycle summary's `income` is the confirmed aggregate `monthlyIncome` snapshot at rollover, not the sum of income transactions. Income transactions already adjust the active aggregate when recorded in the current cycle. Historical income transactions adjust only the matching stored summary. Rebuilding expenses must preserve the stored income snapshot. The analytics table labels `income - expense` as net cash flow (surplus/deficit), explicitly distinct from bank balance, and permits manual correction of legacy summary income.