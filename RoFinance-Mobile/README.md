# RoFinance Mobile

English (primary) · [Tiếng Việt](README.vi.md)

This is the Capacitor Android/iOS target in the RoFinance monorepo. Its screens, translations, and financial rules come from the repository's single `src/` and `shared/` trees. This folder owns only native projects, the mobile entry point, secure token storage, the JWT API adapter, and mobile-only styling. It contains no backend or JWT signing key.

## Current scope

- Android and iOS native project scaffolds and the initial finance UI are included.
- Email/password registration and sign-in use mobile JWT endpoints. Access tokens stay in memory; rotating refresh tokens use iOS Keychain or Android Keystore-backed storage. Financial records are not cached in WebView IndexedDB/localStorage.
- The backend reports a revision conflict if data changed on another device. Reopen/reload the account before making further changes; automatic conflict merging is not implemented.
- Native Google Sign-In is implemented. It exchanges a Google ID token for the shared backend's mobile JWT session; device-specific OAuth clients must be configured before it can work on a real device. Native Apple Sign-In and Excel/PDF export are not implemented yet; use the web app for exports.

## Set up native Google Sign-In

1. Configure the backend's `google_oauth` entry as described in the root README. Its **web client ID** is sent to the native app by `/api/mobile/auth/providers`; its client secret stays on the backend. Deploy the updated backend before installing a mobile build with Google Sign-In. Never put the client secret or a JWT signing key into the mobile app.
2. Choose the final Android application ID and iOS bundle ID before creating native OAuth clients. The committed `com.example.rofinance.mobile` identifier is only a placeholder.
3. In the **same Google Cloud project** as the web client, create an Android OAuth client for the Android application ID and the SHA-1 fingerprint of the signing certificate. From the Android project directory, use `./gradlew signingReport` (Windows: `.\gradlew.bat signingReport`) to find the debug fingerprint. For a Play Store build, also register the Play App Signing certificate fingerprint; the upload-key fingerprint is not sufficient.
4. Create an iOS OAuth client for the final iOS bundle ID. Replace `REPLACE_WITH_IOS_CLIENT_ID` and `REPLACE_WITH_REVERSED_IOS_CLIENT_ID` in `ios/App/App/Info.plist` with the full iOS client ID and its reversed URL scheme from Google Cloud Console, respectively.
5. Run `npm run sync:mobile` from the repository root, rebuild the native app, then test Google Sign-In on a real Android/iOS device. The Google button is enabled only when the backend advertises its web client ID. No Google ID token is trusted without server-side signature, issuer, audience, expiry, and verified-email checks.

Google's [native backend-auth guide](https://developers.google.com/identity/sign-in/android/backend-auth) and the [plugin setup guide](https://capawesome.io/docs/plugins/google-sign-in/) provide the platform credential details. If you plan to publish the iOS app, also review [App Store Review Guideline 4.8](https://developer.apple.com/app-store/review/guidelines/#login-services) for equivalent sign-in options.

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

The Android/iOS launcher icons and splash screens are generated from `public/favicon.svg`. After changing the brand mark, run `npm run icons:mobile`, then `npm run sync:mobile` and rebuild the native apps. Reinstall the app if a launcher caches its old icon.

Change common UI and business rules once in `../src/` and `../shared/`; both builds pick them up. Only mobile-specific behavior belongs in this folder. Dependencies are managed by the root npm workspace rather than a second `node_modules` installation.
