# RoFinance branding

The originals in `Logo/` are the source of truth. Do not replace them with user avatars or change their artwork when rebuilding assets.

- `ChatGPT Image Oct 12, 2026, 12_03_06 AM-1.png`: transparent horizontal wordmark, displayed directly on the header without an added background. Preserve the original colours and transparency in both themes.
- `ChatGPT Image Oct 12, 2026, 12_03_09 AM-3.png`: transparent mark for compact headers, profile/sign-in, Admin, legal pages, favicons, adaptive Android foregrounds and splash screens.
- `ChatGPT Image Oct 12, 2026, 12_03_07 AM-2.png`: opaque light application artwork for iOS, Android legacy/round icons and Apple touch icons.

The six unused `10_19_*` and `11_44_*` uploads were removed from the project on 2026-10-12. Only the three active `12_03_*` originals remain in `Logo/`; generated assets and deployment rollback copies are unchanged.

Latest update on 2026-10-12: the `12_03_*` uploads replace every generated application branding asset. This upload swaps the icon roles: `AM-3` is transparent and `AM-2` is opaque. The generator now rejects opaque wordmark/mark sources before writing assets. The wordmark is 816×222, retaining source colours and transparency without an added header background. Final asset tests passed 4/4 and responsive branding/theme/language cases passed 6/6. Web/mobile type checks and JavaScript builds passed; compiled and published desktop-dark/phone-light checks passed using intercepted synthetic APIs. Local/public checks verified web revision `f3a1102a-0f48-4d3a-8ab2-772c4d2dc759` and exact content for 11 entry/logo/favicon assets. Only the web service was restarted; the API and user data were unchanged. Initial verification hit a stale test filename condition and a browser setup crash while concurrent jobs were running; these were corrected/rerun and are not counted as passes. Logs and the recoverable previous-web copy are in `/tmp/rofinance-logo-v3.wmhV5N`. Android/iOS resources are regenerated, but native packages still need syncing/rebuilding.

Previous colour update on 2026-10-11: the three `11_44_*` uploads generated shared web/mobile branding, favicons, all Android launcher densities, the iOS app icon and native splash screens. The transparent wordmark was 816×215; no white header plate or colour filter was added. Asset tests passed 4/4, including exact comparisons against that source version and unchanged originals; responsive branding/theme/language browser cases passed 6/6. Web/mobile type checks and JavaScript builds passed. Compiled and published desktop-dark/phone-light checks passed with intercepted synthetic APIs. Published web revision `4bf3d886-8c2d-4aeb-a2d7-cd14eef85a1d` matched local/public HTML and all 11 checked logo/favicon/entry assets. Only the web service was restarted; the API and user data were unchanged. Logs and a recoverable previous-web copy are in `/tmp/rofinance-logo-v2.HPx3v5`.

Run from the repository root:

```bash
npm run icons:brand
npm run test:brand
npm run build:web
npm run sync:mobile
```

`icons:mobile` remains an alias for the same generator. Commit both originals and generated assets. Shared `BrandLogo` images and HTML favicons are fingerprinted by Vite in web/mobile builds, so a new release does not reuse stale image URLs. Default public favicon SVG/PNG/ICO and Apple touch URLs are also retained with the new artwork. There are no external image dependencies for the project logo.

Android foregrounds preserve the complete mark within the central adaptive-mask safe area at all five density sizes. iOS uses an opaque 1024×1024 RGB asset. Splash dimensions remain unchanged. Rebuild/install the Android/iOS binaries after syncing; this change has not compiled APK/IPA packages or been tested on physical devices. Bank/coin/category icons, personal avatars and the explicitly designed pixel Signature R monogram are separate assets, not application-logo placeholders, and remain unchanged.

Verification on 2026-10-11: asset-generation tests passed 3/3, including unchanged originals, reproducible native assets, dimensions/transparency and adaptive bounds. Web/mobile type checks and final JavaScript builds passed. Fresh responsive branding/language/theme/guest browser cases passed 6/6; compiled branding checks passed for desktop-dark and phone-light, including the signed-out landing, using synthetic intercepted API responses with no production account/financial changes. A separate compiled mobile-bundle browser check also passed for landing/sign-in logos; it is not native-device testing. Initial test-only issues (the existing translated profile-close label and initial fixture-data normalisation) and the missing web PNG type declaration were corrected and rerun; failing attempts are not counted as passes.

Tiếng Việt: ảnh gốc nằm trong `Logo/`. Chạy `npm run icons:brand` để cập nhật toàn bộ logo/icon/favicon, sau đó `npm run sync:mobile` và build lại Android/iOS. Web và mobile dùng chung component logo; không thay avatar cá nhân hay icon ngân hàng/coin.

Final web publication: revision `c2717362-0784-4bd3-9559-1d5a181f3f35` passed local/public health, release and exact asset-content checks, plus published desktop-dark/phone-light browser checks. Anonymous Admin/character access still returns 401. Only the web service was restarted; the API and financial/account data were unchanged. Final build/logs and recoverable web backup are in `/tmp/rofinance-logo-final.kLB0HW` (temporary host artifacts, not a permanent backup). Original generation tests and earlier verification logs are in `/tmp/rofinance-logo.XAqJRR`.

Transparency correction on 2026-10-11: removed the added white wordmark wrapper without altering image assets or header dimensions. Fresh responsive branding/theme/language cases passed 6/6, including transparent image/wrapper CSS assertions at desktop widths in both themes. Web/mobile type checks and JavaScript builds passed. Compiled and published desktop-dark/phone-light checks passed. Web revision `e708e620-24fd-4278-b6e9-1ca40ed71f7a` was verified locally and publicly with matching HTML/assets and health checks. Only the web service was restarted; the API was unchanged. Logs and a recoverable previous-web copy are in `/tmp/rofinance-transparent-logo.HBBEqp`. Native apps need rebuilding to receive the shared header correction.
