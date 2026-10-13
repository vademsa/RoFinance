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

Server tự tạo các bảng cần thiết khi khởi động. Nếu production quản lý migration riêng, SQL khởi tạo nằm tại [`server/migrations/001_initial.sql`](server/migrations/001_initial.sql); các bảng nhân vật bổ sung được định nghĩa trong [`server/characterSchema.ts`](server/characterSchema.ts). Những bảng này tách khỏi JSON tài chính hiện có; hãy sao lưu cơ sở dữ liệu trước khi triển khai cập nhật.

## Dữ liệu và xác thực

Mỗi bản build web production có mã phiên bản tự động. Ứng dụng kiểm tra `/api/app-version` không dùng cache mỗi 30 giây, khi quay lại ứng dụng/kết nối mạng và trước thao tác dùng điểm hoặc vật phẩm. Phát hành build web mới hoặc khởi động lại API sẽ kích hoạt làm mới. HTML web dùng `Cache-Control: no-store`; khi triển khai, tải đủ tài nguyên và thay `index.html` cuối cùng. Làm mới chờ đóng biểu mẫu, lưu bản nháp nhân vật, hoàn tất lưu dữ liệu và đóng popup kết quả; không bỏ dữ liệu khi lưu lỗi. Mã UUID của lượt chờ vẫn được giữ để xác nhận lại mà không trừ điểm hai lần. Nếu không kiểm tra được phiên bản, thao tác dùng điểm tạm bị chặn. Bản native làm mới dữ liệu server, không tải lại WebView liên tục; thay đổi giao diện native vẫn cần phát hành Android/iOS mới. Tỉ lệ và kết quả quay luôn do backend hiện hành quyết định, không lấy từ cache trên thiết bị.

- `users` lưu email, mật khẩu đã hash bằng bcrypt, tên hiển thị và dữ liệu ảnh đại diện đã được kiểm tra.
- `auth_identities` liên kết người dùng với tài khoản Google hoặc Apple.
- `user_sessions` lưu session trong PostgreSQL qua `connect-pg-simple`; trình duyệt nhận cookie session `HttpOnly`.
- `user_data` lưu một bản ghi dữ liệu tài chính JSONB cho mỗi người dùng.
- `app_config` lưu cấu hình runtime phía server.
- `character_profiles` và `character_actions` lưu trạng thái nhân vật riêng tư và kết quả thao tác chống ghi nhận lặp; `character_rankings` chỉ lưu phần xếp hạng người dùng đồng ý công khai. `character_point_grants` ghi nhận các lần quản trị viên cấp điểm thử, tách khỏi thưởng tài chính.

API dữ liệu tài chính, AI và đồng bộ ngân hàng đều yêu cầu đăng nhập. Health check và các endpoint đăng ký/đăng nhập được truy cập công khai. Ở lần đăng nhập đầu tiên sau khi nâng cấp từ bộ nhớ cục bộ, dữ liệu IndexedDB/LocalStorage cũ được nhập một lần vào tài khoản PostgreSQL; dữ liệu này không tự động nhập vào tài khoản thứ hai trên cùng trình duyệt.

Đăng ký mới bằng email/mật khẩu trên web và mobile yêu cầu ít nhất 8 ký tự, có chữ hoa, chữ thường và số. Hỗ trợ chữ Unicode, kể cả tiếng Việt. Không nhận mật khẩu vượt 72 byte UTF-8 hoặc chứa ký tự điều khiển để tránh bị cắt khi băm. Chính sách đăng ký mới không chặn đăng nhập bằng mật khẩu cũ hay tài khoản OAuth.

## Trang quản trị

Đăng nhập ứng dụng web trước, sau đó mở `/admin`. Quyền chỉ gắn với một ID tài khoản hiện có được khóa trong policy phía server [`server/adminAccess.ts`](server/adminAccess.ts), kèm kiểm tra email đang lưu trong cơ sở dữ liệu cho mỗi yêu cầu trang/API. Email hay role trong token, dữ liệu người dùng gửi, biến môi trường và IP không cấp quyền này; xóa rồi tạo lại tài khoản không chuyển quyền. Thiếu tài khoản, lỗi xác thực hoặc cơ sở dữ liệu đều từ chối truy cập. Session web đã ký và JWT mobile hợp lệ với phiên còn hoạt động dùng chung guard backend.

Giao diện Việt/Anh, sáng/tối và responsive có tổng quan vận hành, danh mục vật phẩm, quản lý tài khoản tìm kiếm/phân trang và lịch sử quản trị phân trang. Danh sách tài khoản chỉ có ID, email, tên hiển thị, ngày tham gia và trạng thái có nhân vật; không có tài chính, ngân hàng, mật khẩu hay token phiên.

Vào **Tài khoản → Quản lý** để mở popup cấp 1–100.000 điểm thưởng, tặng 1–100 bản vật phẩm chuẩn không phải đồ khởi đầu (kể cả Signature), thu hồi vật phẩm đang sở hữu hoặc thu hồi các phiên web/mobile hiện có. Có thể tặng đồ/cấp điểm cho người chưa tạo nhân vật; chu kỳ tính điểm chỉ bắt đầu khi họ mở hồ sơ nhân vật lần đầu. Cấp thưởng không thay đổi điểm xếp hạng, số dư tài chính hoặc trang bị đang mặc. Thu hồi ưu tiên bản trùng; nếu lấy bản cuối đang mặc, backend khôi phục quyền sở hữu đồ cơ bản thay thế và cập nhật hình nhân vật trên bảng xếp hạng, không đổi điểm hay hoàn điểm. Thao tác cần lý do và xác nhận, được backend kiểm tra, dùng cùng khóa tài khoản với trò chơi và lưu kết quả cùng lịch sử trong một giao dịch database. Gửi lại đúng ID/nội dung trả về kết quả cũ; đổi nội dung với cùng ID bị từ chối. ID phiên web bị thu hồi vẫn bị chặn dù request đang chạy lưu lại phiên; người dùng được đăng nhập mới. Admin duy nhất không được tự thu hồi phiên của mình.

HTML/API/phản hồi lỗi riêng tư, không cache. Dữ liệu chỉ ở bộ nhớ, bị xóa khi ẩn trang hoặc kiểm tra quyền thất bại. Giữ trang để kiểm tra thao tác chưa rõ kết quả bằng đúng ID cũ; khi còn pending, điều hướng/đăng xuất bị chặn và đóng/tải lại trang sẽ cảnh báo. Nếu trình duyệt bất ngờ thoát hoàn toàn, kiểm tra **Lịch sử quản trị** bằng ID yêu cầu cũ trước khi gửi thao tác mới. Tải lại theo phiên bản chờ thao tác pending được giải quyết. Triển khai đồng bộ web, API và web-server; startup thêm `admin_operations` và `admin_revoked_web_sessions`, không thay đổi bảng tài chính. Chưa có điều hướng Admin trong app native; dùng web. Preflight Admin khác origin không được bỏ qua xác thực.

Popup quản lý tài khoản luôn hiển thị kho đồ bằng hình ảnh chuẩn, số bản, trạng thái đang mặc, tìm kiếm và phân trang 6 món. Đồ cơ bản vẫn hiển thị nhưng không thể thu hồi; trang bị có thể thu hồi đang mặc được ưu tiên lên đầu. Bấm món đang sở hữu để chọn thu hồi hoặc dùng danh mục ảnh để tặng đồ. Popup xác nhận hiển thị đúng ảnh món được chọn.

**Thu hồi điểm thưởng** chỉ trừ điểm trò chơi còn khả dụng, chưa dùng (1–100.000 mỗi thao tác). Popup hiển thị điểm khả dụng, đã dùng và đã thu hồi. Backend kiểm tra lại số dư dưới cùng khóa với quay thưởng và lưu sổ trừ điểm `revokedPoints` có lịch sử; không sửa thưởng chu kỳ, điểm xếp hạng, lịch sử cấp điểm, tài chính hoặc điểm đã dùng. Thu hồi lỗi/vượt số dư không thay đổi dữ liệu; thử lại cùng ID không bị trừ hai lần. Điểm nhận thêm sau đó vẫn cộng bình thường.

Ô lý do và nút xác nhận nằm ngay dưới phần nhập liệu ở cột trái (trên kho đồ khi dùng điện thoại). Khi tặng, bộ lọc loại/vị trí trang bị áp dụng cho cả thẻ ảnh lẫn danh sách chọn. Ô điểm hiển thị dấu chấm hàng nghìn, ví dụ `10.000`, còn API vẫn nhận số nguyên `10000`.

## Nhân vật đồng hành pixel

**Giới tính nhân vật và trang phục:** chọn **Nam** hoặc **Nữ** trong Hồ sơ nhân vật rồi bấm **Lưu trang phục**. Đổi lựa chọn ngoại hình không mất đồ, bản dư, điểm, thưởng, trang phục đang mặc hay dữ liệu tài chính; hồ sơ cũ giữ ngoại hình nam ban đầu cho đến khi đổi. Chọn Nữ đổi ngay nét mặt và dáng tóc dài trên nhân vật, kể cả khi dùng tóc/mặt cũ hoặc Signature; ID trang bị và màu tóc vẫn giữ nguyên. Chuyển lại Nam khôi phục nét gốc. Đồ cũ là **Dùng chung**. Hai bộ Thanh lịch mới bổ sung 14 vật phẩm thường có ID riêng, mỗi bộ 7 món, dùng chung nét vẽ pixel ở danh mục và trên nhân vật. Có bộ lọc **Nam**, **Nữ**, **Dùng chung** trong kho và popup phần thưởng. Đây là nhãn kiểu dáng, không khóa việc phối đồ đã sở hữu. Đồ mới có thể nhận qua quay, đổi bằng mảnh cũ hoặc được Admin tặng; đổi giới tính không tự cấp đồ. Tổng tỷ lệ trúng và tỷ lệ độ hiếm không đổi. Chân dung đã đồng ý tham gia bảng xếp hạng dùng ngoại hình nhân vật đã chọn, không lấy giới tính thật của tài khoản hay công khai tài chính. Cần build lại Android/iOS để nhận giao diện và danh mục mới; chỉ restart backend không cập nhật tài nguyên đã đóng gói trong app native.

**Hiệu ứng đủ bộ:** sưu tập và mặc đủ bảy món cùng bộ để bật hiệu ứng riêng cho nhân vật. Hồ sơ nhân vật → Bộ sưu tập trang phục hiển thị tiến độ của 16 bộ hoàn chỉnh và nút **Mặc bộ** để thử nhanh; vẫn phải lưu trang phục riêng. Tháo hoặc phối khác một món sẽ tắt hiệu ứng bộ, aura từng vật phẩm vẫn giữ. Bộ Thiên hà có chòm sao chuyển động; Phượng hoàng có chim lửa và tàn lửa bay. Hiệu ứng cũng hiện ở thẻ đồng hành và nhân vật đã đồng ý tham gia bảng xếp hạng, chỉ dựa trên trang phục hợp lệ, không công khai tủ đồ hay dữ liệu tài chính. Không cộng điểm, đổi tỷ lệ quay, thứ hạng hay số dư. Mặc thử đồ chưa sở hữu trong danh mục không bật hiệu ứng bộ. Đồ khởi đầu và các món bí mật riêng lẻ không phải bộ đầy đủ. Chế độ giảm chuyển động dừng hiệu ứng trang trí.

Mở **Hồ sơ nhân vật** cạnh các nút hồ sơ tài khoản hoặc nhấn thẻ nhân vật trong Hũ Tài Chính. Bạn có thể chọn nhân vật, thử đồ và lưu những món đã sở hữu ở bảy vị trí: áo, mũ, giày, tóc, gương mặt, biểu cảm và balo. Chỉnh tên/ảnh đại diện tài khoản vẫn là chức năng riêng. Android/iOS dùng chung màn hình này.

Slot chỉ là vị trí trang bị, không giới hạn hình dạng vật phẩm. Đồ huyền thoại ở slot lưng có cánh thiên thần thiên hà, phượng hoàng, pha lê quỹ đạo hoặc long thần; slot đầu có vòng thiên thần, mặt trời phượng hoàng, sao chổi hoặc hố đen. Hình trong kho và lúc mặc dùng chung nét vẽ pixel. Cánh nằm sau thân, vòng nổi trên tóc, aura vẫn theo vị trí và độ hiếm. Đây là nâng cấp hình ảnh cho tám ID hiện có: giữ nguyên đồ đã sở hữu, bản dư, trang phục đã lưu và xác suất do backend quản lý.

Cảm xúc dựa trên ngân sách tương đối, chi tiêu và tiến độ của chu kỳ lương đang chọn, không đánh giá mức giàu hay hạnh phúc cá nhân. Thiếu dữ liệu hoặc chưa có thu nhập thì giữ trung tính. Điểm quản lý gồm tuân thủ ngân sách (60), tuân thủ từng hũ (25) và phần dự phòng còn lại (15). Chuyển tiền không tính là chi; chi tiêu hũ cũ vẫn được tính nhưng tiền dư đã chuyển không bị cộng hai lần. Điểm trong kỳ là tạm tính. Nhân vật không thay đổi số dư hoặc giao dịch.

Bạn nhận **40 điểm chào mừng một lần**. Chu kỳ đủ dữ liệu đã kết thúc, tính từ chu kỳ đang diễn ra khi tạo nhân vật, thưởng `floor(điểm quản lý / 5)`, tối đa 20 điểm mỗi kỳ. Lịch sử trước đó, kỳ trống, kỳ chồng lấn và chỉnh sửa lặp không tạo thêm thưởng. Mùa xếp hạng là tháng dương lịch mà chu kỳ lương hợp lệ kết thúc; mỗi mùa tính tối đa một kỳ. Điểm dựa trên ghi chép của người dùng, không phải cuộc thi đã xác minh qua ngân hàng.

Một lượt quay dùng **20 điểm**, không dùng tiền thật, và có thể **không trúng vật phẩm**. Bộ sưu tập có **126 món**: bảy món cơ bản và 119 giải thưởng, bao gồm bộ Huyền thoại độc quyền project **RoFinance Signature** gồm bảy món có ánh kim, viền lấp lánh và dấu R pixel. Tỉ lệ mỗi lượt giữ nguyên: **không trúng 65%, thường 29,75%, hiếm 5,075%, đặc biệt 0,17325%, huyền thoại 0,00175%**. Bốn nhóm vật phẩm lần lượt có 49, 28, 14 và 28 món, chia đều cơ hội trong mỗi nhóm. Lượt không trúng vẫn dùng 20 điểm, không nhận mảnh và giữ nguyên tủ đồ/trang phục. Mọi lượt mới có cùng xác suất độc lập, không có bảo hiểm hoặc bảo đảm hiếm. Bộ đếm cũ và mã thao tác đã xác nhận vẫn được giữ tương thích nhưng không tạo bảo đảm cho lượt mới. Cả nhóm huyền thoại có cơ hội xấp xỉ 1/57.143 mỗi lượt; một món huyền thoại cụ thể có cơ hội 1/1.600.000. Thêm bộ Signature mở rộng nhóm Huyền thoại, không tăng tổng tỉ lệ của nhóm này. Đây là xác suất, không cam kết trúng sau số lượt đó.

Vòng quay tính mười giây theo thời gian thực từ lúc nhấn **Bắt đầu quay**, kể cả khi chuyển ứng dụng/tab và đang chờ xác nhận. Khi hệ điều hành tạm dừng ứng dụng thì không thể vẽ hoạt ảnh trong nền; lúc quay lại, vòng quay bắt kịp thời gian đã trôi qua hoặc hiện ngay kết quả backend đã xác nhận nếu đủ mười giây. Phản hồi chậm hoặc chưa có phản hồi không tạo phần thưởng giả. Chỉ mở popup không bắt đầu quay hoặc trừ điểm.

Nhấn **Xem phần thưởng** để mở popup nhỏ gọn, có bộ lọc độ hiếm/loại đồ và phân trang sáu món mỗi trang. Giao diện chỉ hiện hình, tên, độ hiếm và trạng thái/thao tác, không hiện phần trăm xác suất hay đoạn giải thích tỉ lệ. Lọc và đổi trang vẫn không đổi xác suất backend hoặc tiêu điểm. Đóng bằng X, Escape hoặc nhấn bên ngoài. Bộ sưu tập bên dưới chỉ hiện **vật phẩm đã sở hữu**, cũng phân trang sáu món mỗi trang. Không còn nút Chi tiết riêng: rê chuột hoặc focus thẻ bằng bàn phím để xem danh hiệu; trên điện thoại, chạm tên/vùng thẻ để bật/tắt. Enter/Space cũng bật/tắt, Escape ẩn danh hiệu trước khi đóng popup. Nút mặc thử, đổi đồ và ô chọn nguyên liệu hoạt động riêng. Chữ danh hiệu theo màu độ hiếm, không cộng điểm xếp hạng. Đồ Huyền thoại và nhân vật đang mặc giữ nền chủ đề. Vẫn cho mặc thử đồ chưa sở hữu nhưng chỉ lưu được đồ đã có. Tên/hình đồ bí mật chưa sở hữu vẫn ẩn; đồ đã nhận xuất hiện trong tủ đồ và popup của chủ sở hữu. Đây là bất ngờ giao diện, không phải bí mật chống xem mã nguồn. Mã vật phẩm, tủ đồ và xác suất quay backend được giữ nguyên.

Đồ trùng từ lượt mới được giữ thành **1 bản dư gắn đúng ID vật phẩm trúng**, không tự đổi thành năm mảnh. Trong tủ đồ đã sở hữu, nhấn chữ **Phân giải** hoặc **Ghép đồ** trên vật phẩm có bản dư để mở popup riêng. Mở hoặc hủy không tiêu vật phẩm; kiểm tra số bản và xác nhận rõ ràng bên trong. Dùng **2 bản dư nhận 20 điểm (1 lượt quay)** hoặc **7 bản dư cùng độ hiếm nhận 1 món ngẫu nhiên ở bậc kế tiếp**. Có thể dùng các ID khác nhau nếu cùng độ hiếm. Backend dùng ngẫu nhiên mật mã để ghép; kết quả có thể trùng và nhóm bậc kế tiếp bao gồm cả đồ bí mật. Huyền thoại là bậc cao nhất, không ghép tiếp. Bản gốc và đồ đang mặc luôn được giữ. Mảnh đã kiếm trước đây vẫn dùng được: đổi 20 mảnh lấy một món **công khai, không thuộc huyền thoại** chưa sở hữu. Đồ huyền thoại/bí mật không đổi bằng mảnh. Số bản dư và điểm phân giải do backend quản lý; client không được gán số lượng, độ hiếm, điểm, tài khoản hay ID kết quả. Đồ hiếm không tăng lợi thế điểm. Quay thưởng không giảm thứ hạng. Ghi chép backdate được tính lại: nếu điểm đã dùng vượt tổng thưởng sau chỉnh sửa, đồ vẫn giữ nguyên và thưởng tương lai bù phần thiếu trước khi quay tiếp. Dải vật phẩm chạy ngang rồi chậm dần, dừng đúng vật phẩm hoặc ô không trúng do backend xác nhận tại vạch giữa. Các ô minh họa không thể hiện xác suất và không tự quyết định giải. Lượt chưa rõ kết quả giữ mã thao tác để xác nhận lại an toàn, kể cả không trúng. Chế độ giảm chuyển động của thiết bị dừng hiệu ứng aura phụ; dải vật phẩm vẫn tự chạy ít nhất mười giây. Cần build và phát hành lại bản mobile khi cập nhật danh mục/kết quả để mã vật phẩm và định dạng kết quả có thể rỗng khớp với backend; bản cài đặt cũ không nhận diện được mã đồ mới, kết quả không trúng hoặc định dạng bản dư mới khi trùng.

Nhân vật đang mặc đồ dùng chung màu aura với vật phẩm trong kho: Hiếm tím, Đặc biệt vàng, Huyền thoại công khai bạch kim và Huyền thoại bí mật 7 màu. Mỗi món đúng vị trí có hiệu ứng riêng: mũ phía trên đầu, áo sau thân người, balo sau lưng, còn giày chỉ phát sáng quanh từng chiếc, không tạo vòng aura dưới chân. Tóc, gương mặt và biểu cảm phát sáng nhẹ trong vùng tương ứng. Hiệu ứng co giãn theo kích thước nhân vật ở hồ sơ, thẻ đồng hành và ảnh công khai với cảm xúc trung tính. Đồ cơ bản không có aura. Danh mục hiện chưa có slot quần riêng; quần là nét vẽ cố định, không lấy giày để thay aura dưới chân của quần. Mặc thử, lưu hay tháo đồ cập nhật hiệu ứng, không ảnh hưởng tài chính, cảm xúc hay điểm xếp hạng. Chế độ giảm chuyển động dừng hoạt ảnh trang trí. Danh hiệu hiện khi rê chuột, chạm hoặc focus bằng bàn phím, không còn nút riêng. Phân giải vẫn phải chọn bản dư và xác nhận ở thao tác riêng.

**Bảng xếp hạng nhân vật trong Thống kê** mặc định tắt và chỉ tham gia khi đồng ý. Đặt biệt danh riêng và bật tham gia tại Hồ sơ nhân vật → Quyền riêng tư. Chỉ biệt danh, nhân vật/trang phục pixel, điểm tổng hợp và thứ hạng được trả về. Không công khai thu nhập, chi tiêu, số dư, ngân hàng, nợ, giao dịch, tỷ lệ tài chính, giải thích riêng, ảnh đại diện tài khoản hoặc ID tài khoản nội bộ. Điểm bằng nhau có cùng hạng; tắt tham gia sẽ gỡ dữ liệu công khai. Không nhập thông tin cá nhân vào biệt danh công khai.

Thống kê → **Xem bảng xếp hạng mẫu** hiển thị năm nhân vật, điểm và trang phục hư cấu, có nhãn mô phỏng rõ ràng. Đây là minh họa chỉ đọc ở giao diện, tách khỏi dữ liệu thật, không tạo tài khoản, điểm, thưởng hay ghi chép tài chính. Trở về bảng thật để xem mùa đã chọn; mùa thật chưa có người tham gia vẫn để trống.

Quay, đổi, phân giải và ghép đồ là thao tác nguyên tử, xác thực ở backend, khóa theo tài khoản, chỉ nhận các trường hợp lệ và có mã thao tác chống thực hiện trùng. Nếu mất phản hồi, nhấn **Xác nhận lại** để lấy đúng kết quả cũ mà không trừ thêm điểm. Thiết bị chỉ lưu mã UUID/loại thao tác/mã vật phẩm hoặc nguyên liệu theo từng tài khoản và từng lượt, kể cả khi tải lại; bản ghi này không chứa số tiền hoặc token đăng nhập. Không xóa dữ liệu ứng dụng/trình duyệt khi còn lượt chờ xác nhận. Các chức năng tài chính vẫn dùng được khi dịch vụ nhân vật không sẵn sàng.

Trang bình thường không hiện dải quay. Nhấn **Quay thưởng** chỉ mở popup, không tiêu điểm hay tạo mã thao tác. Nhấn **Bắt đầu quay** bên trong mới gửi yêu cầu xác thực và dùng điểm. Ảnh vật phẩm lướt qua vạch giữa theo mốc mười giây thực từ thao tác đó, tính cả thời gian chuyển nền và chờ xác nhận. Dải minh họa chỉ xáo trộn một lần riêng cho từng lượt, giữ nguyên khi backend xác nhận; chỉ ô dừng được cập nhật theo kết quả backend. Mỗi món tại vạch được làm nổi bật; dải bắt đầu chậm, tăng tốc mượt đến nhanh nhất ở giữa lượt, rồi giảm tốc dần đến khi dừng hẳn, không hiển thị thanh tiến trình hay đếm ngược. Khi renderer chậm hoặc tạm dừng, dải bắt kịp thời gian thay vì kéo dài để vẽ bù các frame đã bỏ lỡ. Kết quả chỉ hiện khi đủ thời gian và có xác nhận backend; phản hồi chậm không bắt đầu thêm một bộ đếm mười giây. Đồ thường có aura trung tính nhẹ; đồ Hiếm có aura tím chuyển động, Đặc biệt vàng, Huyền thoại công khai bạch kim và Huyền thoại bí mật 7 màu. Đây chỉ là hiệu ứng, không phải nhóm/tỉ lệ trúng mới. Khi quay chỉ dải vật phẩm di chuyển: nền và vạch giữa đứng yên, các ô lướt không có nền hoặc aura động. Aura chuyển động vẫn được giữ ở kết quả, danh sách thưởng và tủ đồ. Dải vật phẩm tự chạy, không có ô bật/tắt hoạt ảnh; chế độ giảm chuyển động của thiết bị dừng hiệu ứng aura phụ.

Nút **Quay tiếp** bắt đầu dải mới ngay trong cùng popup, đưa vùng cuộn về đầu và xóa kết quả của lượt trước. Số lượt còn lại được tính từ điểm backend trả về; khi hết điểm, nút xám và không bấm được. Backend kiểm tra điểm hiện tại trong giao dịch khóa theo tài khoản cho mỗi lượt mới, không chỉ dựa vào nút phía client. Khi điểm bị dùng ở thiết bị khác, giao diện cập nhật lại sau khi backend từ chối. Nếu phản hồi của lượt tiếp theo không rõ, popup giữ nút **Xác nhận lại lượt quay**, dùng đúng mã cũ kể cả khi điểm đã về 0. Đóng kết quả bằng X/Escape/nhấn ngoài hoặc xem trong tủ đồ. Trong lúc xác nhận/quay, nút đóng tạm khóa; phản hồi không rõ của lượt đầu dùng lại luồng xác nhận an toàn sẵn có, không tự tạo giải thưởng.

Kiểm thử trình duyệt dùng dữ liệu giả, không gửi request tới production:

```bash
npx playwright install chromium
npm run test:character:ui
```

Với tài khoản thử nghiệm đã được chỉ định và phê duyệt, người vận hành có quyền truy cập database có thể cấp điểm quay sau khi server đã chạy migration:

```bash
npx tsx scripts/grant-character-test-points.ts '<email-tài-khoản>' '<số-điểm>' '<UUID-v4>'
```

Dùng lại đúng UUID khi thử lại cùng lần cấp để chỉ cộng một lần. Tài khoản phải có hồ sơ nhân vật. Điểm thử dùng trường tùy chọn riêng `bonusPoints` (dữ liệu cũ mặc định bằng 0), không đặt lại điểm đã tiêu/tủ đồ, không sửa dữ liệu tài chính và không tăng điểm quản lý, cấp độ hoặc xếp hạng. Người dùng thông thường không được truy cập endpoint cấp điểm; Admin duy nhất dùng thao tác có lịch sử tại `/admin`. Người dùng không thể sửa trường này qua API hồ sơ. Điểm thiếu do chỉnh sửa tài chính cũ có thể được bù trước khi điểm thử khả dụng để quay.

Nếu đã được cho phép cấp toàn bộ đồ để test, thêm `--full-collection` vào cuối lệnh. Công cụ cấp một bản sở hữu của từng ID hợp lệ trong danh mục, gồm đồ bí mật, giữ nguyên trang phục đang mặc, bản dư và mảnh cũ. Không tự tạo bản dư hoặc đổi tỉ lệ quay. Điểm và danh sách ID được cấp ghi nguyên tử vào sổ cấp thử; khi thử lại phải giữ nguyên UUID, tài khoản, điểm, cờ và danh mục. Không mở công cụ này thành API công khai. Một lượt hiện dùng 20 điểm, nên 999 lượt quay thêm tương ứng 19.980 điểm thử nếu không có khoản thiếu điểm do chỉnh sửa cũ.

Kiểm thử tích hợp PostgreSQL chỉ chạy khi đặt `CHARACTER_TEST_DATABASE_URL` thành chuỗi kết nối cơ sở dữ liệu kiểm thử. Các tests tạo/xóa schema riêng có tên ngẫu nhiên; không dùng tài khoản database không được phép tạo schema kiểm thử. Kế hoạch chi tiết và các gate audit nằm trong [CHARACTER_FEATURE_PLAN.md](CHARACTER_FEATURE_PLAN.md).

## Ứng dụng mobile

Ứng dụng Android/iOS nằm trong [RoFinance-Mobile](RoFinance-Mobile/README.vi.md) thuộc cùng npm workspace. Hai bản dùng **chung** màn hình React, bản dịch, logic tài chính và danh sách ngân hàng trong `src/` và `shared/`; thư mục mobile chỉ giữ tài nguyên Capacitor/native cùng phần API, xác thực và kiểu dáng riêng. Chạy `npm install` một lần ở thư mục gốc, sau đó dùng `npm run lint:mobile`, `npm run build:mobile` hoặc `npm run sync:mobile`. Web và mobile vẫn build độc lập; API tiếp tục chạy như tiến trình riêng.

Mobile gọi backend này qua HTTPS. Web tiếp tục dùng session cookie; mobile dùng access token JWT ngắn hạn cùng refresh token có thể xoay và thu hồi. Để bật xác thực mobile, tự tạo khóa ngẫu nhiên bằng `openssl rand -base64 32`, điền vào `MOBILE_JWT_KEYS` dưới mã khóa bạn chọn, rồi đặt mã đó ở `MOBILE_JWT_ACTIVE_KID`. Chỉ lưu khóa trong cấu hình bí mật phía server, không đưa vào bản mobile hoặc Git. Khi chưa cấu hình, web vẫn hoạt động còn xác thực mobile sẽ từ chối yêu cầu.

Đăng nhập Google native dùng web client ID từ `google_oauth` trên server. Mobile gửi Google ID token đến `/api/mobile/auth/google`; backend xác minh trước khi cấp JWT mobile. Xem README mobile để cấu hình OAuth client Android và iOS.

API dữ liệu trả về phiên bản và bắt buộc gửi `If-Match` khi ghi để báo xung đột thay vì âm thầm ghi đè. Những tab trình duyệt đã mở trước khi cập nhật cần tải lại trước khi chỉnh sửa. Giao diện và quy tắc chung chỉ sửa một lần trong `src/`; hành vi riêng từng nền tảng mới cần chỉnh riêng.
