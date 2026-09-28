# RoFinance

[English (primary)](#english) · [Tiếng Việt](#tiếng-việt)

## English

RoFinance is a personal finance app for tracking income, expenses, debts, and balances across configurable budget jars and financial cycles. It is built with React, Express, and PostgreSQL, with optional Gemini AI features and Binance market data.

### Requirements

- Node.js 20.9 or later
- PostgreSQL 14 or later (including Google Cloud SQL for PostgreSQL)

### Quick start

```bash
cp .env.example .env.local
npm install
npm run dev
```

Edit `.env.local` before starting the app. At minimum, set `DATABASE_URL` to your PostgreSQL connection string and `SESSION_SECRET` to a random string of at least 32 characters. The app reads `.env.local` and then `.env`; these files are excluded from Git. Do not put real credentials in `.env.example` or commit them to the repository.

The main configuration values are:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string; required. |
| `SESSION_SECRET` | Secret for signing sessions; required, at least 32 characters. |
| `DATABASE_SSL` | Set to `false` when the database connection should not use SSL. |
| `DATABASE_POOL_SIZE` | Maximum PostgreSQL connection pool size; defaults to `10`. |
| `APP_URL` | Public base URL used for OAuth callbacks; can also be stored in `app_config`. |
| `GEMINI_API_KEY` | Optional bootstrap fallback for AI features. |
| `GEMINI_MODEL` | Optional Gemini model override. |

`DATABASE_URL` and `SESSION_SECRET` must come from the environment because they are needed before the app can read PostgreSQL. For AI features, you can store the Gemini key under `gemini_api_key` in the `app_config` table, with `is_secret` set to `true`. Leave all values in the committed template blank; provide real values only in your local environment or server configuration.

### Google and Apple sign-in

Register these callback paths under your own public `APP_URL` in Google Cloud Console and Apple Developer:

- `/api/auth/google/callback`
- `/api/auth/apple/callback`

Set `APP_URL` in the environment or store it as `app_url` in `app_config`. Store Google settings under `google_oauth` (`clientId`, `clientSecret`) and Apple settings under `apple_oauth` (`clientId`, `teamId`, `keyId`, `privateKey`); mark both provider entries as secret. Enter actual values only in your deployment environment or database.

Google requires an OAuth web client. Apple requires a Service ID with Sign in with Apple enabled and a `.p8` private key. A provider's sign-in button is enabled only when its configuration is complete.

### Build and checks

```bash
npm run lint
npm run test:logic
npm run build
npm start
```

The server creates the required tables on startup. If you manage production migrations separately, the equivalent SQL is in [`server/migrations/001_initial.sql`](server/migrations/001_initial.sql).

### Data and authentication

- `users` stores email, bcrypt password hash, display name, and validated avatar data.
- `auth_identities` links users to Google or Apple accounts.
- `user_sessions` stores sessions in PostgreSQL through `connect-pg-simple`; the browser receives an `HttpOnly` session cookie.
- `user_data` stores one JSONB financial data record per user.
- `app_config` stores server-side runtime settings.

Financial data, AI, and bank synchronization APIs require authentication. Health checks and registration/sign-in endpoints are public. On the first sign-in after upgrading from local storage, legacy IndexedDB/LocalStorage data is imported once into the PostgreSQL account; it is not automatically imported into a second account on the same browser.

## Tiếng Việt

RoFinance là ứng dụng quản lý tài chính cá nhân, giúp theo dõi thu nhập, chi tiêu, các khoản nợ và số dư theo các hũ ngân sách có thể tùy chỉnh cùng chu kỳ tài chính. Ứng dụng sử dụng React, Express và PostgreSQL; có thêm tính năng AI Gemini và dữ liệu thị trường Binance khi được cấu hình.

### Yêu cầu

- Node.js 20.9 trở lên
- PostgreSQL 14 trở lên (hỗ trợ cả Google Cloud SQL for PostgreSQL)

### Bắt đầu

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

### Đăng nhập bằng Google và Apple

Khai báo các đường dẫn callback `/api/auth/google/callback` và `/api/auth/apple/callback` dưới `APP_URL` công khai của bạn trong Google Cloud Console và Apple Developer. Đặt `APP_URL` trong môi trường hoặc lưu thành `app_url` trong `app_config`. Lưu cấu hình Google ở `google_oauth` (`clientId`, `clientSecret`) và Apple ở `apple_oauth` (`clientId`, `teamId`, `keyId`, `privateKey`); đánh dấu hai mục này là secret. Chỉ nhập giá trị thật trong môi trường triển khai hoặc cơ sở dữ liệu. Google yêu cầu OAuth web client; Apple yêu cầu Service ID đã bật Sign in with Apple và private key `.p8`.

### Build và kiểm tra

```bash
npm run lint
npm run test:logic
npm run build
npm start
```

Server tự tạo các bảng cần thiết khi khởi động. Nếu môi trường production quản lý migration riêng, SQL tương ứng nằm tại [`server/migrations/001_initial.sql`](server/migrations/001_initial.sql).

### Dữ liệu và xác thực

- `users` lưu email, mật khẩu đã hash bằng bcrypt, tên hiển thị và dữ liệu ảnh đại diện đã được kiểm tra.
- `auth_identities` liên kết người dùng với tài khoản Google hoặc Apple.
- `user_sessions` lưu session trong PostgreSQL qua `connect-pg-simple`; trình duyệt nhận cookie session `HttpOnly`.
- `user_data` lưu một bản ghi dữ liệu tài chính JSONB cho mỗi người dùng.
- `app_config` lưu cấu hình runtime phía server.

API dữ liệu tài chính, AI và đồng bộ ngân hàng đều yêu cầu đăng nhập. Health check và các endpoint đăng ký/đăng nhập được truy cập công khai. Ở lần đăng nhập đầu tiên sau khi nâng cấp từ bộ nhớ cục bộ, dữ liệu IndexedDB/LocalStorage cũ được nhập một lần vào tài khoản PostgreSQL; dữ liệu này không tự động nhập vào tài khoản thứ hai trên cùng trình duyệt.
