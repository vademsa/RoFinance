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
npm run dev
```

Chỉnh sửa `.env.local` trước khi chạy ứng dụng. Tối thiểu cần đặt `DATABASE_URL` thành chuỗi kết nối PostgreSQL và `SESSION_SECRET` thành chuỗi ngẫu nhiên dài ít nhất 32 ký tự. Ứng dụng đọc `.env.local` rồi đến `.env`; các file này đã được loại khỏi Git. Không ghi credential thật vào `.env.example` hoặc commit lên repository.

Các biến cấu hình chính:

| Biến | Mục đích |
| --- | --- |
| `DATABASE_URL` | Chuỗi kết nối PostgreSQL; bắt buộc. |
| `SESSION_SECRET` | Khóa ký session; bắt buộc, dài ít nhất 32 ký tự. |
| `DATABASE_SSL` | Đặt `false` nếu kết nối cơ sở dữ liệu không dùng SSL. |
| `DATABASE_POOL_SIZE` | Số kết nối tối đa trong pool PostgreSQL; mặc định là `10`. |
| `APP_URL` | URL công khai dùng cho OAuth callback; cũng có thể lưu trong `app_config`. |
| `GEMINI_API_KEY` | Khóa khởi tạo dự phòng cho tính năng AI; không bắt buộc. |
| `GEMINI_MODEL` | Ghi đè model Gemini; không bắt buộc. |

`DATABASE_URL` và `SESSION_SECRET` phải lấy từ môi trường vì ứng dụng cần chúng trước khi đọc PostgreSQL. Với tính năng AI, bạn có thể lưu khóa Gemini trong mục `gemini_api_key` của bảng `app_config` và đặt `is_secret` thành `true`. Để trống các giá trị trong file mẫu được commit; chỉ điền giá trị thật vào môi trường cục bộ hoặc cấu hình máy chủ.

## Đăng nhập bằng Google và Apple

Khai báo các đường dẫn callback `/api/auth/google/callback` và `/api/auth/apple/callback` dưới `APP_URL` công khai của bạn trong Google Cloud Console và Apple Developer. Đặt `APP_URL` trong môi trường hoặc lưu thành `app_url` trong `app_config`. Lưu cấu hình Google ở `google_oauth` (`clientId`, `clientSecret`) và Apple ở `apple_oauth` (`clientId`, `teamId`, `keyId`, `privateKey`); đánh dấu hai mục này là secret. Chỉ nhập giá trị thật trong môi trường triển khai hoặc cơ sở dữ liệu. Google yêu cầu OAuth web client; Apple yêu cầu Service ID đã bật Sign in with Apple và private key `.p8`.

## Build và kiểm tra

```bash
npm run lint
npm run test:logic
npm run build
npm start
```

Server tự tạo các bảng cần thiết khi khởi động. Nếu môi trường production quản lý migration riêng, SQL tương ứng nằm tại [`server/migrations/001_initial.sql`](server/migrations/001_initial.sql).

## Dữ liệu và xác thực

- `users` lưu email, mật khẩu đã hash bằng bcrypt, tên hiển thị và dữ liệu ảnh đại diện đã được kiểm tra.
- `auth_identities` liên kết người dùng với tài khoản Google hoặc Apple.
- `user_sessions` lưu session trong PostgreSQL qua `connect-pg-simple`; trình duyệt nhận cookie session `HttpOnly`.
- `user_data` lưu một bản ghi dữ liệu tài chính JSONB cho mỗi người dùng.
- `app_config` lưu cấu hình runtime phía server.

API dữ liệu tài chính, AI và đồng bộ ngân hàng đều yêu cầu đăng nhập. Health check và các endpoint đăng ký/đăng nhập được truy cập công khai. Ở lần đăng nhập đầu tiên sau khi nâng cấp từ bộ nhớ cục bộ, dữ liệu IndexedDB/LocalStorage cũ được nhập một lần vào tài khoản PostgreSQL; dữ liệu này không tự động nhập vào tài khoản thứ hai trên cùng trình duyệt.
