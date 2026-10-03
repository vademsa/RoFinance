# RoFinance Mobile

English (primary) · [Tiếng Việt](README.vi.md)

This is the Capacitor Android/iOS target in the RoFinance monorepo. Its screens, translations, and financial rules come from the repository's single `src/` and `shared/` trees. This folder owns only native projects, the mobile entry point, secure token storage, the JWT API adapter, and mobile-only styling. It contains no backend or JWT signing key.

## Current scope

- Android and iOS native project scaffolds and the initial finance UI are included.
- Email/password registration and sign-in use mobile JWT endpoints. Access tokens stay in memory; rotating refresh tokens use iOS Keychain or Android Keystore-backed storage. Financial records are not cached in WebView IndexedDB/localStorage.
- The backend reports a revision conflict if data changed on another device. Reopen/reload the account before making further changes; automatic conflict merging is not implemented.
- Native Google/Apple OAuth and native Excel/PDF export are not implemented yet. The mobile app hides those actions; use the web app for exports.

## Before building

1. Configure the shared backend's `MOBILE_JWT_ACTIVE_KID` and `MOBILE_JWT_KEYS` as documented in the root README. Do not put the signing key in this project.
2. Confirm the API HTTPS origin. `VITE_API_BASE_URL` can override the compiled default; it must be an HTTPS origin without a path. This value is public, not a credential.
3. Replace the placeholder `appId` in `capacitor.config.ts` **and** the native Android/iOS identifiers before publishing. Choose the final identifier before relying on device Keychain data.
4. Install Node.js 22+, Android Studio/SDK for Android, and macOS/Xcode for an iOS binary.

From the repository root, run:

```bash
npm install
npm run lint
npm run lint:mobile
npm run test:logic
npm run sync:mobile
```

Open `RoFinance-Mobile/android/` in Android Studio or `RoFinance-Mobile/ios/App/App.xcodeproj` in Xcode, then build and test on real devices. From the repository root, run `npm run sync:mobile` after frontend changes. Never set Capacitor `server.url` to the production backend: the app bundles its own UI and calls the backend API separately.

Change common UI and business rules once in `../src/` and `../shared/`; both builds pick them up. Only mobile-specific behavior belongs in this folder. Dependencies are managed by the root npm workspace rather than a second `node_modules` installation.
