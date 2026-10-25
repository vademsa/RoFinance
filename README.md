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
npm run dev:api
```

In a second terminal, run `npm run dev:web` and open the Vite URL. The API and web UI are separate processes. Vite forwards `/api` to the API's loopback address; the browser continues to use same-origin session cookies.

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
| `API_PORT` | API listen port; defaults to `6869` on loopback. |
| `WEB_PORT` | Production web-server port; defaults to `6868` on loopback. |
| `API_INTERNAL_URL` | API origin used by the web process/Vite proxy; defaults to `http://127.0.0.1:6869`. Use HTTPS for a remote API. |

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
npm run build
npm run start:api
```

Automated tests, synthetic fixtures and Playwright configuration are versioned in [tests/](tests/README.md). Run `npm run test:typecheck`, `npm run test:logic`, `npm run test:brand` or `npm run test:character:ui` from the repository root. Private legacy fixtures, local operator tools and generated test artifacts remain excluded from Git. Building and running the application does not require test files.

Start the web process separately with `npm run start:web` (or use `pm2 start ecosystem.config.cjs` to start both). Point your existing HTTPS proxy/tunnel at the **web** port (`6868` by default); the web process forwards `/api` to the API port (`6869`). Keep the API port private. The browser, OAuth callbacks, and mobile client can continue to use the same public HTTPS origin. When migrating an existing PM2 deployment, replace the old combined `rofinance` process before starting the new web process, since both use port `6868`; do this during a deployment window. Building files alone does not restart live services.

The web build is `dist/web`; the backend build is `dist/api.cjs`. The web process serves public assets and proxies API requests. The protected `/admin` HTML shell is served by the API only after authorization.

The server creates the required tables on startup. If you manage production migrations separately, the initial SQL is in [`server/migrations/001_initial.sql`](server/migrations/001_initial.sql); the additional character tables are defined in [`server/characterSchema.ts`](server/characterSchema.ts). These tables are separate from existing financial JSON; back up the database before deploying updates.

## Data and authentication

Each production web build gets an automatic release ID. Clients check the uncached `/api/app-version` endpoint every 30 seconds, on focus/reconnection, and before point/material actions. Publishing the new web build or restarting the API triggers a refresh. Web HTML is served with `Cache-Control: no-store`; publish the complete asset directory and replace `index.html` last. Refresh waits for open forms, character drafts, pending saves and result dialogs; failed saves are never discarded. Durable action UUIDs survive refresh for idempotent confirmation. If version checking is unavailable, point actions are temporarily blocked. Native clients refresh server data rather than repeatedly reloading their packaged WebView; native UI changes still require a new Android/iOS release. Draw odds and results always come from the current backend, not cached client rules.

- `users` stores email, bcrypt password hash, display name, and validated avatar data.
- `auth_identities` links users to Google or Apple accounts.
- `user_sessions` stores sessions in PostgreSQL through `connect-pg-simple`; the browser receives an `HttpOnly` session cookie.
- `user_data` stores one JSONB financial data record per user.
- `app_config` stores server-side runtime settings.
- `character_profiles` and `character_actions` store private character state and idempotent action receipts; `character_rankings` contains only the opted-in ranking projection. `character_point_grants` audits operator-issued test credit separately from financial awards.

Financial data, AI, and bank synchronization APIs require authentication. Health checks and registration/sign-in endpoints are public. On the first sign-in after upgrading from local storage, legacy IndexedDB/LocalStorage data is imported once into the PostgreSQL account; it is not automatically imported into a second account on the same browser.

New email/password registrations on web and mobile require at least 8 characters, an uppercase letter, a lowercase letter and a digit. Unicode letters (including Vietnamese) are supported. Passwords exceeding 72 UTF-8 bytes or containing control characters are rejected before hashing. This registration policy does not block existing password sign-ins or OAuth accounts.

## Admin dashboard

Sign in to the web app first, then open `/admin`. Access is restricted to one existing account identity pinned in the server-only policy [`server/adminAccess.ts`](server/adminAccess.ts), with a fresh stored-email check on every page/API request. Email or role claims, request inputs, environment variables and IP addresses cannot grant this permission; deleting/recreating the account does not transfer it. Missing identity or authentication/database failures deny access. Signed web sessions and valid, active mobile JWTs use the same server guard.

The responsive English/Vietnamese light/dark dashboard includes aggregate operational counts, the canonical item catalogue, searchable paginated account management and a paginated audit trail. The account directory contains only ID, email, display name, join date and character availability—never financial records, banking details, passwords or session tokens.

Select **Accounts → Manage** to open a management dialog: grant 1–100,000 character bonus points, gift 1–100 copies of a canonical non-starter item (including Signature), revoke owned item copies, or revoke existing web/mobile sessions. Gifts and points also work before a user creates their character: their financial-scoring enrollment starts only on their first character visit. Grants do not change ranking scores, financial balances or equipped items. Revocation removes spare copies first; removing the last equipped copy restores ownership of the basic slot item and updates ranking portraits without changing scores or refunding points. Each write requires a reason and confirmation, validates all inputs server-side, uses the game's owner lock and commits together with an immutable request-ID audit receipt. Retrying the same ID/input returns the original result; changing input with that ID is rejected. Existing web-session IDs stay revoked even if an in-flight request saves them again; new sign-ins remain allowed. Self-revocation of the sole Admin is prohibited.

HTML/API/error responses are private and uncached. Authorized data stays in memory only and is removed on hiding or failed access checks. Keep the page open to reconcile an uncertain write with its original request ID; navigation/logout is blocked while pending and closing/reloading warns before discarding it. After an unexpected full browser exit, inspect **Admin audit trail** for the original request ID before submitting another operation. Release reloads wait until pending writes are resolved. Deploy web, API and web-server together; startup adds `admin_operations` and `admin_revoked_web_sessions` without changing financial tables. There is no native in-app Admin navigation; use the web dashboard. Cross-origin Admin preflights do not bypass authentication.

The management dialog always shows the target account's wardrobe with canonical item artwork, copy counts, equipped status, search and six-card pagination. Basic items are visible but cannot be revoked; equipped non-basic items are shown first. Click an owned item to prepare revocation, or choose gifts using the illustrated catalogue. Both item confirmations display the exact selected artwork.

**Revoke reward points** deducts only available, unspent game points (1–100,000 per operation). The dialog shows available, spent and revoked points. The backend rechecks the balance under the same lock used by draws and stores an audited `revokedPoints` ledger; it does not rewrite awards, ranking scores, bonus-credit history, financial data or past spending. Failed or excessive revocations make no changes; retrying the same request ID never deducts twice. New credits remain additive after deductions.

The reason and confirmation controls stay directly below the action inputs in the left column (above the wardrobe on phones). Gift selection includes a slot/type filter that updates both image cards and dropdown choices. Point inputs display dot-grouped integers, for example `10.000`, while requests send the unchanged numeric value `10000`.

## Pixel companion

**Character gender and clothing:** choose **Male** or **Female** in Character Profile and press **Save outfit**. Changing the cosmetic preference preserves owned items, duplicates, credits, awards, equipment and financial data; old profiles retain the original male appearance until changed. Selecting Female immediately gives the shared portrait a distinct face and long layered hair, including with old/Signature head cosmetics, while keeping the equipped item IDs and hair colour; switching back to Male restores the original base. Existing items are **Unisex**. Two new Classic collections add 14 canonical common items, seven for each clothing style, with shared pixel artwork in the catalogue and on the character. Filter **Male**, **Female** or **Unisex** in the owned wardrobe and reward catalogue. Labels describe clothing style, not an equip restriction: mixing owned styles is allowed. New items can be drawn, exchanged with legacy fragments, or gifted by Admin; no items are granted automatically by changing gender. Overall draw/rarity odds are unchanged. Public opted-in portraits retain the chosen cosmetic appearance without exposing account gender or finances. Rebuild Android/iOS apps to include the updated interface and item catalogue; a backend restart alone does not update bundled native assets.

**Full-set effects:** collect and wear all seven matching items from a set to activate its themed character effect. Character Profile → Outfit sets shows progress for 16 complete collections and provides **Wear set** previews; save the outfit separately. Taking off or mixing one item stops the set effect, while individual item auras remain. Celestial adds animated constellations; Phoenix adds a fiery bird and drifting embers. Effects also appear on the companion and opted-in leaderboard portraits, using validated equipment only, without publishing inventory or financial data. They do not grant points or change draw odds, ranking or balances. Unowned catalogue previews cannot activate a set. Starter items and individual secret pieces are not full sets. Reduced motion freezes the decorative effects.

Open **Character profile** beside the account controls, or select the companion card in Financial Jars. Choose a character, preview clothing, and save owned items in seven slots: shirt, hat, shoes, hair, face, expression and backpack. Account-name/avatar editing remains separate. The same screens are shared with Android/iOS.

Equipment slots are attachment positions, not restrictions on the item's silhouette. Legendary back-slot items have celestial angel wings, phoenix wings, orbital crystal wings or dragon wings; legendary head-slot items have angel, solar phoenix, comet or singularity halos. Both inventory and equipped portraits use the same pixel artwork. Wings sit behind the body, halos float above the hair and rarity auras remain localized. These are visual upgrades of the existing eight IDs: ownership, spare copies, saved outfits and server-controlled probabilities are preserved.

Mood reflects your selected salary cycle's relative budgets, spending and pacing, not wealth or personal happiness. Missing/unfunded records stay neutral. The management score combines budget compliance (60), per-jar compliance (25) and remaining buffer (15). Transfers are not expenses; archived spending is included without counting transferred unspent funds twice. In-cycle scores are provisional. The companion never changes balances or transactions.

You receive **40 welcome points once**. Eligible completed cycles, starting with the cycle in progress when the character is created, award `floor(score / 5)` points, up to 20 per cycle. Earlier historical records, empty cycles, overlapping cycles and repeated edits cannot generate extra awards. A season is the calendar month in which an eligible salary cycle ends. At most one cycle award is counted per season; scores are based on self-reported records, not bank-verified competition.

A draw costs **20 points**, never real money, and can award **no item**. The collection has **126 items**: seven starters and 119 draw prizes, including the seven-item project-exclusive **RoFinance Signature** legendary set with metallic tailoring, sparkling borders and a pixel R emblem. Per-draw rates remain **no item 65%, common 29.75%, rare 5.075%, special 0.17325%, legendary 0.00175%**. The respective item pools have 49, 28, 14 and 28 items, with equal chances inside each pool. An empty draw spends 20 points, awards no fragments and preserves inventory/equipment. Every new draw has these same independent probabilities; there is no pity/insurance guarantee. Legacy counters and committed receipts remain compatible without granting future guarantees. The entire legendary pool has approximately a 1-in-57,143 per-draw chance; a specific legendary item has a 1-in-1,600,000 chance. Adding the Signature items expands the legendary pool, not its overall probability. These probabilities do not promise a win within that many draws.

The reel uses ten seconds of elapsed real time from **Start draw**, including time hidden behind another app or browser tab and time awaiting confirmation. Suspended systems cannot render unseen frames; on resume, the reel catches up or shows the exact server-confirmed result immediately if its deadline passed. A late or missing server response never produces a fabricated prize. Merely opening the popup does not start a draw or spend points.

Choose **View rewards** to open a compact prize catalogue with rarity/category filters and six items per page. The interface shows artwork, names, rarity and ownership/actions, without probability percentages or explanatory odds paragraphs. Filtering and pagination still do not alter server probabilities or spend points. Close the popup with X, Escape or by clicking outside. The collection below shows **only owned items**, also paginated six per page. There is no extra Details button: hover or keyboard-focus a card to see its cosmetic title; on touch screens, tap the name/card area to toggle it. Enter/Space also toggle the title, and Escape hides it before closing a containing popup. Preview, exchange and material-selection controls remain independent. Title colors match rarity and give no ranking bonus. Legendary item art and equipped portraits retain themed scenery. Unowned items can be previewed, but saving requires ownership. Undiscovered secret names/artwork remain hidden until owned; won secrets appear in the owner's collection and catalogue. These are presentation surprises, not secrets protected from source inspection. Existing item IDs, ownership and backend draw probabilities are unchanged.

New duplicate wins keep one **spare copy bound to the won item ID**, not five fragments. In your owned collection, click an item's **Recycle** or **Fuse** text button to open its dedicated popup. Opening or cancelling does not spend copies; review the quantities and explicitly confirm. Consume **2 spare copies for 20 reward points (one draw)**, or **7 spare copies of the same rarity for one uniformly random next-tier item**. Different item IDs of the same rarity can be combined. Fusion is selected by server cryptographic randomness, can produce a duplicate, and includes secret prizes in the next-tier pool. Legendary is the highest tier and cannot be fused further. Originals and equipped items are never consumed. Previously earned fragments remain available: exchange 20 for an unowned **public, non-legendary** item you choose. Legendary/secret items cannot be exchanged for fragments. Spare counts and recycling points are authoritative server state; clients cannot assign quantities, rarity, points, owner or output IDs. Cosmetic rarity gives no score advantage. Spending points does not lower rank. Backdate corrections recalculate past awards; if points already spent exceed the corrected total, items are kept and future rewards offset the shortfall before another draw. A horizontal item reel slows down and stops with the exact server-confirmed item or empty card beneath the centre marker. Decorative cards are not a representation of odds and never choose the prize. Uncertain requests retain their receipt for safe confirmation, including empty results. Device reduced-motion settings freeze auxiliary aura effects; the automatic item reel still runs for at least ten seconds. Rebuild and distribute the mobile client alongside catalogue/result updates so its item allowlist and nullable-result contract match the backend; older binaries cannot interpret newly added items, empty results or the new spare-copy duplicate format.

Equipped characters share the inventory's aura colors: rare purple, special gold, public legendary platinum, and secret legendary rainbow. Each correctly slotted item has its own effect: hats above the head, shirts behind the torso, backpacks behind the back, and shoes softly glowing around each shoe without a floor ring. Hair, face and expressions have smaller localized glow. Effects scale with the actual pixel portrait in the profile, companion card and public neutral-mood portrait. Basic items have no aura. The existing catalogue has no separate trousers slot; trousers are fixed pixel art, so shoes never substitute for a trousers ground aura. Previewing, saving or removing equipment updates its effect without changing finances, moods or ranking points. Reduced-motion preferences freeze decorative animation. Cosmetic titles appear on hover, touch or keyboard focus without an extra button. Recycling still requires selecting spare copies and confirming its separate action.

The **Character Leaderboard in Statistics** is optional and off by default. Set a separate public alias and opt in from Character Profile → Privacy. Only alias, dressed pixel character, composite score and rank are returned. Income, expenses, balances, banks, debts, transactions, financial ratios, private explanations, account avatars and internal account IDs are not published. Equal scores share rank; opting out removes published entries. Do not put personal information in your public alias.

Statistics → **View demo leaderboard** shows five explicitly labelled fictional characters, scores and outfits. It is a read-only local illustration, separate from real ranking entries, and creates no accounts, scores, rewards or financial records. Return to the real leaderboard to view the selected season; an empty real season stays empty.

Draws, exchanges, recycling and fusion are atomic, authenticated server operations with owner-scoped locking, exact input allowlists and durable idempotent receipts. If a response is lost, use **Confirm again** to retrieve the same result without another debit. The device keeps only an owner-scoped action UUID/kind/item-or-material receipt, including across reloads; it stores no financial amounts or authentication tokens in that receipt. Do not clear app/browser storage while an action is awaiting confirmation. Other financial features remain available if the character service is unavailable.

The reel is hidden on the normal page. **Draw an item** only opens a dedicated popup, without spending points or creating a receipt. Choose **Start draw** inside to initiate the authenticated draw. Isolated item images scroll past a fixed marker using a ten-second real-time clock from that action, including hidden time and the wait for confirmation. Decorative cards are randomly shuffled once per attempt and stay fixed when confirmation arrives; only the landing card is filled with the server outcome. Each card at the marker is highlighted. The reel starts slowly, accelerates smoothly to its peak at halfway, then decelerates to a complete stop, without a visible progress bar or countdown. A suspended or slow renderer catches up rather than extending the presentation to draw every missed frame. The result appears only after the deadline and server confirmation; late confirmation does not start another ten-second timer. Common items have subtle neutral auras; rare items have moving purple auras, special items gold, public legendary items platinum, and secret legendary items rainbow. These are cosmetic effects, not additional rarity/probability tiers. Only the item strip moves during a draw: the stage background and centre marker remain stationary, and scrolling cards have no animated scenery or aura. Animated auras remain on the result, catalogue and owned collection. The reel runs automatically with no animation checkbox; device reduced-motion settings stop auxiliary aura effects.

**Draw again** starts a fresh reel in the same popup, resetting its scroll position and clearing the previous result. Remaining draws are computed from the server-returned point balance; at zero the button is grey and disabled. The backend checks current points under its owner-scoped transaction lock on every new draw, not just the client button. A stale-balance rejection refreshes points; an uncertain repeat stays in the popup with **Confirm draw again**, which reuses the original receipt even at zero points. Close a finished result with X, Escape or an outside click, or go directly to the wardrobe. Dismissal is disabled during confirmation/spinning; an uncertain initial request exposes the existing safe confirmation flow without inventing a prize.

For automated browser checks with synthetic data (no production requests):

```bash
npx playwright install chromium
npm run test:character:ui
```

For a specifically approved test account, an operator with database access can issue draw credit after startup migrations have run:

```bash
npx tsx tests/support/grant-character-test-points.ts '<account-email>' '<point-count>' '<UUID-v4>'
```

This optional operator CLI is local-only and not included in a Git clone. Use the authenticated Admin interface for normal account support.

Use the same UUID when retrying the same grant: it is credited only once. The account must already have a character profile. Test credit uses a separate optional `bonusPoints` field (old states default to zero), does not reset spending/inventory or modify financial records, and never increases management scores, levels or rankings. No grant endpoint is available to ordinary users; the sole Admin uses audited `/admin` operations. Users cannot assign this field through the profile API. Existing financial corrections can offset test credit before it is available to spend.

For an explicitly approved full-collection test, append `--full-collection` to the command. It grants one owned copy of every canonical catalogue item, including secrets, while retaining the existing outfit, spare copies and fragments. It never grants extra duplicates or changes prize probabilities. The credit and exact granted item IDs are recorded atomically in the operator ledger; retries must use the same UUID, account, points, flag and catalogue. Do not expose this script as a public API. One draw currently costs 20 points, so 999 additional draws require 19,980 test points when there is no existing correction shortfall.

PostgreSQL integration tests run only when `CHARACTER_TEST_DATABASE_URL` is set to a test database connection. They create and remove uniquely named isolated schemas; never point test configuration at a database role that should not create test schemas.

## Mobile app

The Android/iOS app lives in [RoFinance-Mobile](RoFinance-Mobile/README.md) in the same npm workspace. Both builds consume the **same** React screens, translations, financial logic, and bank registry from `src/` and `shared/`; the mobile folder contains only Capacitor/native assets and platform-specific API, authentication, and styling. Run `npm install` once at the repository root, then use `npm run lint:mobile`, `npm run build:mobile`, or `npm run sync:mobile`. Web and mobile are built independently while the API continues to run as a separate process.

Mobile calls this backend over HTTPS. Web authentication remains cookie-session based; mobile uses short-lived JWT access tokens and rotating, revocable refresh tokens. To enable mobile authentication, generate your own random key (`openssl rand -base64 32`), place it in `MOBILE_JWT_KEYS` under an ID of your choice, and select that ID with `MOBILE_JWT_ACTIVE_KID`. Keep the key only in server-side secret configuration, never in the mobile build or Git. If these variables are absent, web continues to work and mobile authentication fails closed.

Native Google Sign-In uses the server-side `google_oauth` web client ID. The mobile app sends a Google ID token to `/api/mobile/auth/google`; the backend validates it before issuing a mobile JWT. See the mobile README for Android and iOS OAuth client setup.

The data API returns a revision and requires `If-Match` on writes to report concurrent changes instead of silently overwriting them. Existing browser tabs opened before this update should be reloaded before editing. Shared UI and business rules are changed once in `src/`; only platform-specific behavior requires a separate edit.
