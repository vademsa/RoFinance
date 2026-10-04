# RoFinance Mobile

[English (primary)](README.md) · Tiếng Việt

Đây là bản Capacitor Android/iOS trong cùng monorepo RoFinance. Màn hình, bản dịch và quy tắc tài chính lấy từ một nguồn `src/` và `shared/` của repository. Thư mục này chỉ chứa dự án native, điểm vào mobile, lưu token an toàn, lớp API JWT và CSS riêng cho điện thoại; không chứa backend hoặc khóa ký JWT.

## Phạm vi hiện tại

- Đã có cấu trúc dự án Android/iOS và giao diện tài chính ban đầu.
- Đăng ký/đăng nhập email và mật khẩu dùng JWT mobile. Access token chỉ ở bộ nhớ; refresh token được xoay và lưu bằng iOS Keychain hoặc kho bảo mật dựa trên Android Keystore. Dữ liệu tài chính không được cache trong IndexedDB/localStorage của WebView.
- Backend báo xung đột phiên bản khi thiết bị khác sửa dữ liệu. Cần tải lại tài khoản trước khi sửa tiếp; chưa có tự động gộp xung đột.
- Đã triển khai đăng nhập Google native: app đổi Google ID token lấy phiên JWT mobile từ backend chung. Cần cấu hình OAuth client riêng cho thiết bị trước khi dùng thật. Chưa có đăng nhập Apple native và xuất Excel/PDF native; dùng bản web để xuất báo cáo.

## Cấu hình đăng nhập Google native

1. Cấu hình `google_oauth` trên backend theo README ở thư mục gốc. Backend trả **web client ID** công khai qua `/api/mobile/auth/providers`; client secret chỉ nằm trên backend. Triển khai backend mới trước khi cài bản mobile có Google Sign-In. Không đưa Google client secret hoặc khóa ký JWT vào app.
2. Chốt Android application ID và iOS bundle ID rồi mới tạo OAuth client. `com.example.rofinance.mobile` trong source chỉ là giá trị mẫu.
3. Trong **cùng Google Cloud project** với web client, tạo Android OAuth client cho application ID và SHA-1 của chứng chỉ ký app. Chạy `./gradlew signingReport` trong thư mục Android (Windows: `.\gradlew.bat signingReport`) để xem SHA-1 bản debug. Nếu phát hành qua Google Play, cần đăng ký thêm SHA-1 của **Play App Signing**; SHA-1 của upload key không đủ.
4. Tạo iOS OAuth client cho bundle ID cuối cùng. Thay `REPLACE_WITH_IOS_CLIENT_ID` và `REPLACE_WITH_REVERSED_IOS_CLIENT_ID` trong `ios/App/App/Info.plist` bằng iOS client ID đầy đủ và URL scheme đảo ngược lấy từ Google Cloud Console.
5. Chạy `npm run sync:mobile` tại thư mục gốc, build lại native và thử trên Android/iOS thật. Nút Google chỉ bật khi backend trả về web client ID. Backend luôn kiểm tra chữ ký, issuer, audience, hạn dùng và email đã xác minh của Google ID token trước khi cấp JWT.

Xem [hướng dẫn Google xác thực với backend](https://developers.google.com/identity/sign-in/android/backend-auth), [hướng dẫn plugin](https://capawesome.io/docs/plugins/google-sign-in/) và [quy định App Store 4.8](https://developer.apple.com/app-store/review/guidelines/#login-services) nếu dự định phát hành iOS.

## Trước khi build

1. Cấu hình `MOBILE_JWT_ACTIVE_KID` và `MOBILE_JWT_KEYS` trên backend chung theo README ở thư mục gốc. Không đặt khóa ký trong dự án này.
2. Xác nhận HTTPS origin của API. Có thể đặt `VITE_API_BASE_URL` để ghi đè giá trị mặc định khi build; đây là URL công khai, không phải credential.
3. Thay `appId` tạm trong `capacitor.config.ts` **và** định danh native của Android/iOS trước khi phát hành. Chốt định danh cuối trước khi dùng dữ liệu Keychain trên thiết bị.
4. Cài Node.js 22+, Android Studio/SDK để build Android, và macOS/Xcode để tạo bản iOS.

Từ thư mục gốc của repository, chạy:

```bash
npm install
npm run lint
npm run lint:mobile
npm run test:logic
npm run sync:mobile
```

Mở `RoFinance-Mobile/android/` bằng Android Studio hoặc `RoFinance-Mobile/ios/App/App.xcodeproj` bằng Xcode, rồi build và thử trên thiết bị thật. Từ thư mục gốc, chạy `npm run sync:mobile` sau khi sửa frontend. Không đặt `server.url` của Capacitor trỏ tới backend production: ứng dụng đóng gói UI của chính nó và gọi API backend riêng.

Icon ứng dụng và màn hình khởi động Android/iOS được tạo từ `public/favicon.svg`. Sau khi đổi logo, chạy `npm run icons:mobile`, tiếp theo `npm run sync:mobile` và build lại bản native. Nếu launcher còn giữ icon cũ, hãy cài lại ứng dụng.

Giao diện và quy tắc chung chỉ sửa một lần trong `../src/` và `../shared/`, rồi build lại hai bản. Chỉ hành vi riêng mobile mới nằm trong thư mục này. Dependency được quản lý bởi npm workspace ở thư mục gốc, không cài thêm `node_modules` thứ hai.
