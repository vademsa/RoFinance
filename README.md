# RoFinance

Ứng dụng quản lý tài chính cá nhân theo mô hình 6 hũ, với React, Express,
PostgreSQL, Gemini và dữ liệu thị trường Binance.

## Yêu cầu

- Node.js 20.9+
- PostgreSQL 14+ (Google Cloud SQL for PostgreSQL được hỗ trợ)

## Cấu hình

Sao chép `.env.example` thành `.env.local` hoặc cấu hình các biến tương ứng
trong môi trường triển khai:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
DATABASE_SSL=true
SESSION_SECRET=mot-chuoi-ngau-nhien-toi-thieu-32-ky-tu
GEMINI_API_KEY=bootstrap-key-tuy-chon
```

`DATABASE_URL` và `SESSION_SECRET` là bootstrap secrets nên không thể đọc từ
chính PostgreSQL. `gemini_api_key` có thể lưu trong bảng `app_config`:

```sql
INSERT INTO app_config (key, value, is_secret)
VALUES ('gemini_api_key', to_jsonb('YOUR_KEY'::text), true)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value, is_secret = true, updated_at = NOW();
```

## OAuth Google và Apple

Các callback URL cần khai báo tại Google Cloud Console và Apple Developer:

```text
https://rof.aprwatch.com/api/auth/google/callback
https://rof.aprwatch.com/api/auth/apple/callback
```

Lưu cấu hình OAuth trong PostgreSQL:

```sql
INSERT INTO app_config (key, value, is_secret) VALUES
(
  'app_url',
  to_jsonb('https://rof.aprwatch.com'::text),
  false
),
(
  'google_oauth',
  jsonb_build_object(
    'clientId', 'GOOGLE_CLIENT_ID',
    'clientSecret', 'GOOGLE_CLIENT_SECRET'
  ),
  true
),
(
  'apple_oauth',
  jsonb_build_object(
    'clientId', 'APPLE_SERVICE_ID',
    'teamId', 'APPLE_TEAM_ID',
    'keyId', 'APPLE_KEY_ID',
    'privateKey', '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----'
  ),
  true
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    is_secret = EXCLUDED.is_secret,
    updated_at = NOW();
```

Google yêu cầu OAuth Web Client. Apple yêu cầu Service ID đã bật Sign in with
Apple và private key `.p8`. Nút provider chỉ được bật khi cấu hình tương ứng đã
có đầy đủ trong `app_config`.

Mật khẩu người dùng được hash bằng bcrypt trước khi lưu. Session chỉ nằm trong
cookie `HttpOnly`, còn nội dung session được lưu trong PostgreSQL.

## Chạy

```bash
npm install
npm run dev
```

Server tự tạo các bảng cần thiết khi khởi động. Migration SQL tương ứng nằm tại
`server/migrations/001_initial.sql` nếu môi trường production yêu cầu chạy
migration riêng.

```bash
npm run lint
npm run build
npm start
```

## Mô hình dữ liệu

- `users`: email, password hash, tên hiển thị và ảnh đại diện đã được giới hạn/kiểm tra định dạng.
- `auth_identities`: liên kết tài khoản với Google hoặc Apple.
- `user_sessions`: session đăng nhập, được `connect-pg-simple` quản lý.
- `user_data`: dữ liệu tài chính JSONB, một bản ghi cho mỗi user.
- `app_config`: cấu hình runtime phía server.

Mọi API dữ liệu, AI và đồng bộ ngân hàng đều yêu cầu đăng nhập. Chỉ health check
và các endpoint đăng ký/đăng nhập được truy cập công khai.

Trong lần đăng nhập đầu tiên sau khi nâng cấp, dữ liệu IndexedDB/LocalStorage cũ
được nhập một lần vào tài khoản PostgreSQL. Dữ liệu legacy không được tự động
nhập vào tài khoản thứ hai trên cùng trình duyệt.
