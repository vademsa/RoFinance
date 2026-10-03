# RoFinance Mobile

[English (primary)](README.md) · Tiếng Việt

Đây là bản Capacitor Android/iOS trong cùng monorepo RoFinance. Màn hình, bản dịch và quy tắc tài chính lấy từ một nguồn `src/` và `shared/` của repository. Thư mục này chỉ chứa dự án native, điểm vào mobile, lưu token an toàn, lớp API JWT và CSS riêng cho điện thoại; không chứa backend hoặc khóa ký JWT.

## Phạm vi hiện tại

- Đã có cấu trúc dự án Android/iOS và giao diện tài chính ban đầu.
- Đăng ký/đăng nhập email và mật khẩu dùng JWT mobile. Access token chỉ ở bộ nhớ; refresh token được xoay và lưu bằng iOS Keychain hoặc kho bảo mật dựa trên Android Keystore. Dữ liệu tài chính không được cache trong IndexedDB/localStorage của WebView.
- Backend báo xung đột phiên bản khi thiết bị khác sửa dữ liệu. Cần tải lại tài khoản trước khi sửa tiếp; chưa có tự động gộp xung đột.
- Chưa triển khai OAuth Google/Apple theo luồng native và xuất Excel/PDF native. Bản mobile ẩn các thao tác đó; dùng bản web để xuất báo cáo.

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

Giao diện và quy tắc chung chỉ sửa một lần trong `../src/` và `../shared/`, rồi build lại hai bản. Chỉ hành vi riêng mobile mới nằm trong thư mục này. Dependency được quản lý bởi npm workspace ở thư mục gốc, không cài thêm `node_modules` thứ hai.
