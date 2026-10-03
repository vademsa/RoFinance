# RoFinance

[English (primary)](README.md) · Tiếng Việt

RoFinance là ứng dụng quản lý tài chính cá nhân, giúp theo dõi thu nhập, chi tiêu, các khoản nợ và số dư theo các hũ ngân sách có thể tùy chỉnh cùng chu kỳ tài chính. Ứng dụng sử dụng React, Express và PostgreSQL; có thêm tính năng AI Gemini và dữ liệu thị trường Binance khi được cấu hình.

## Yêu cầu

- Node.js 20.9 trở lên
- PostgreSQL 14 trở lên (hỗ trợ cả Google Cloud SQL for PostgreSQL)

## Bắt đầu

```bash
cp .env.example .env.local
npm install
npm run dev:api
```

Mở terminal thứ hai, chạy `npm run dev:web` rồi truy cập URL do Vite cung cấp. API và giao diện web là hai tiến trình riêng. Vite chuyển tiếp `/api` tới API nội bộ để trình duyệt vẫn dùng session cookie cùng origin.

Chỉnh sửa `.env.local` trước khi chạy ứng dụng. Tối thiểu cần đặt `DATABASE_URL` thành chuỗi kết nối PostgreSQL và `SESSION_SECRET` thành chuỗi ngẫu nhiên dài ít nhất 32 ký tự. Ứng dụng đọc `.env.local` rồi đến `.env`; các file này đã được loại khỏi Git. Không ghi credential thật vào `.env.example` hoặc commit lên repository.

Các biến cấu hình chính:

| Biến | Mục đích |
| --- | --- |
| `DATABASE_URL` | Chuỗi kết nối PostgreSQL; bắt buộc. |
| `SESSION_SECRET` | Khóa ký session; bắt buộc, dài ít nhất 32 ký tự. |
| `MOBILE_JWT_ACTIVE_KID` | Mã khóa đang dùng để ký access token mobile; chưa cần cho đến khi bật mobile. |
| `MOBILE_JWT_KEYS` | JSON ánh xạ mã khóa tới khóa ngẫu nhiên do bạn tự tạo, mã hóa base64 (mỗi khóa ít nhất 32 byte). Giữ khóa cũ tạm thời khi xoay khóa. |
| `MOBILE_ALLOWED_ORIGINS` | Các origin WebView Capacitor được cho phép chính xác; mặc định là localhost chuẩn của iOS và Android. |
| `DATABASE_SSL` | Đặt `false` nếu kết nối cơ sở dữ liệu không dùng SSL. |
| `DATABASE_POOL_SIZE` | Số kết nối tối đa trong pool PostgreSQL; mặc định là `10`. |
| `APP_URL` | URL công khai dùng cho OAuth callback; cũng có thể lưu trong `app_config`. |
| `GEMINI_API_KEY` | Khóa khởi tạo dự phòng cho tính năng AI; không bắt buộc. |
| `GEMINI_MODEL` | Ghi đè model Gemini; không bắt buộc. |
| `API_PORT` | Cổng API, mặc định `6869` trên loopback. |
| `WEB_PORT` | Cổng web khi chạy production, mặc định `6868` trên loopback. |
| `API_INTERNAL_URL` | Origin API để web/Vite chuyển tiếp; mặc định `http://127.0.0.1:6869`. Nếu API ở máy khác, dùng HTTPS. |

`DATABASE_URL` và `SESSION_SECRET` phải lấy từ môi trường vì ứng dụng cần chúng trước khi đọc PostgreSQL. Với tính năng AI, bạn có thể lưu khóa Gemini trong mục `gemini_api_key` của bảng `app_config` và đặt `is_secret` thành `true`. Để trống các giá trị trong file mẫu được commit; chỉ điền giá trị thật vào môi trường cục bộ hoặc cấu hình máy chủ.

## Đăng nhập bằng Google và Apple

Khai báo các đường dẫn callback `/api/auth/google/callback` và `/api/auth/apple/callback` dưới `APP_URL` công khai của bạn trong Google Cloud Console và Apple Developer. Đặt `APP_URL` trong môi trường hoặc lưu thành `app_url` trong `app_config`. Lưu cấu hình Google ở `google_oauth` (`clientId`, `clientSecret`) và Apple ở `apple_oauth` (`clientId`, `teamId`, `keyId`, `privateKey`); đánh dấu hai mục này là secret. Chỉ nhập giá trị thật trong môi trường triển khai hoặc cơ sở dữ liệu. Google yêu cầu OAuth web client; Apple yêu cầu Service ID đã bật Sign in with Apple và private key `.p8`.

## Build và kiểm tra

```bash
npm run lint
npm run test:logic
npm run build
npm run start:api
```

Chạy web riêng bằng `npm run start:web` (hoặc `pm2 start ecosystem.config.cjs` để khởi động cả hai). Trỏ HTTPS proxy/tunnel hiện có tới cổng **web** (`6868` mặc định); tiến trình web chuyển tiếp `/api` tới cổng API (`6869`). Không công khai cổng API. Trình duyệt, OAuth callback và mobile vẫn có thể dùng cùng một HTTPS origin. Khi nâng cấp PM2 đang chạy, cần thay tiến trình `rofinance` cũ trước khi khởi động web mới vì cả hai cùng dùng cổng `6868`; thực hiện trong thời gian triển khai phù hợp. Chỉ build file sẽ không tự khởi động lại dịch vụ đang chạy.

Build web nằm trong `dist/web`, còn build backend ở `dist/api.cjs`. Hai tiến trình không trực tiếp phục vụ mã nguồn của nhau.

Server tự tạo các bảng cần thiết khi khởi động. Nếu môi trường production quản lý migration riêng, SQL tương ứng nằm tại [`server/migrations/001_initial.sql`](server/migrations/001_initial.sql).

## Dữ liệu và xác thực

- `users` lưu email, mật khẩu đã hash bằng bcrypt, tên hiển thị và dữ liệu ảnh đại diện đã được kiểm tra.
- `auth_identities` liên kết người dùng với tài khoản Google hoặc Apple.
- `user_sessions` lưu session trong PostgreSQL qua `connect-pg-simple`; trình duyệt nhận cookie session `HttpOnly`.
- `user_data` lưu một bản ghi dữ liệu tài chính JSONB cho mỗi người dùng.
- `app_config` lưu cấu hình runtime phía server.

API dữ liệu tài chính, AI và đồng bộ ngân hàng đều yêu cầu đăng nhập. Health check và các endpoint đăng ký/đăng nhập được truy cập công khai. Ở lần đăng nhập đầu tiên sau khi nâng cấp từ bộ nhớ cục bộ, dữ liệu IndexedDB/LocalStorage cũ được nhập một lần vào tài khoản PostgreSQL; dữ liệu này không tự động nhập vào tài khoản thứ hai trên cùng trình duyệt.

## Ứng dụng mobile

Frontend Android/iOS độc lập hiện nằm ở project ngang cấp `../RoFinance-Mobile`, có Git repository, thư viện và README riêng, và gọi backend này qua HTTPS. Web tiếp tục dùng session cookie; mobile dùng access token JWT ngắn hạn cùng refresh token có thể xoay và thu hồi. Để bật xác thực mobile, tự tạo khóa ngẫu nhiên bằng `openssl rand -base64 32`, điền vào `MOBILE_JWT_KEYS` dưới mã khóa bạn chọn, rồi đặt mã đó ở `MOBILE_JWT_ACTIVE_KID`. Chỉ lưu khóa trong cấu hình bí mật phía server, không đưa vào bản mobile hoặc Git. Khi chưa cấu hình, web vẫn hoạt động còn xác thực mobile sẽ từ chối yêu cầu.

API dữ liệu trả về phiên bản và bắt buộc gửi `If-Match` khi ghi để báo xung đột thay vì âm thầm ghi đè. Những tab trình duyệt đã mở trước khi cập nhật cần tải lại trước khi chỉnh sửa. Frontend mobile ban đầu được tách từ frontend web, nên những thay đổi UI/logic sau này cần được rà soát ở cả hai dự án.
