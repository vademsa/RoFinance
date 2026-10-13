# Nghiên cứu MISA MoneyKeeper và đề xuất cho RoFinance

Ngày khảo sát: **05/10/2026**. Tài liệu này chỉ để review; **chưa triển khai tính năng, chưa nhập/xuất hay sửa dữ liệu** ở MISA hoặc RoFinance.

## Phạm vi và độ tin cậy

- **Đã xem trực tiếp** bản web [MISA MoneyKeeper](https://moneykeeperapp.misa.vn/) sau khi đăng nhập: trang chủ, danh sách tài khoản, hai tab sổ tiết kiệm/tích lũy, biểu mẫu ghi chép, ghi chép hàng loạt, bước chọn ngân hàng của trình nhập sao kê và lịch sử ghi chép. Không đưa thông tin đăng nhập, số dư hay giao dịch cá nhân vào tài liệu này.
- **Chỉ thấy trong menu, chưa xác minh quy trình hoạt động**: nhập bằng Excel, xuất khẩu dữ liệu và phần lớn tiện ích. Ở thời điểm khảo sát, mục “Kết nối ngân hàng” và “Báo cáo” trên menu web có trạng thái vô hiệu hóa; “Chia tiền” hiện thông báo đang phát triển. Không nên xem các mục này là chức năng web đã hoàn chỉnh.
- **Theo tài liệu công khai của MISA**, không đồng nghĩa với việc đã kiểm chứng trên bản web hiện tại: quét hóa đơn, hạn mức theo hạng mục, dự thu/dự chi, nhắc nhở, mục tiêu tiết kiệm, chia sẻ tài khoản, ghi chép chuyến đi/sự kiện và danh sách mua sắm. Nhiều bài hướng dẫn được xuất bản từ năm 2020–2021, vì vậy cần xác minh lại nếu muốn bắt chước một quy trình cụ thể. [Tổng quan tính năng MISA](https://moneykeeper.misa.vn/), [bài giới thiệu chi tiết](https://moneykeeper.misa.vn/so-thu-chi-misa-ung-dung-quan-ly-chi-tieu-ca-nhan-so-1-tai-viet-nam/).

## Những gì bản web MISA cho thấy

| Khu vực | Quan sát trực tiếp | Ý nghĩa đối với RoFinance |
| --- | --- | --- |
| Trang chủ | Tổng số dư, tổng thu/chi theo khoảng thời gian, ghi chép gần đây, lịch chi tiêu và danh sách tài khoản. | Cách gom thông tin hữu ích, nhưng RoFinance đã có dashboard và thống kê theo **chu kỳ tài chính**; không nên đổi về tháng dương lịch. |
| Tài khoản | Danh sách được lọc theo loại, trạng thái, có/không tính vào báo cáo; có tab riêng cho tài khoản thường, sổ tiết kiệm và tích lũy. | Gợi ý cải thiện phân loại tài sản; không được trộn “tài khoản chứa tiền” với “hũ phân bổ ngân sách”. |
| Ghi chép đơn lẻ | Các kiểu **chi, thu, chuyển khoản, điều chỉnh số dư**, với tài khoản, thời gian, hạng mục, diễn giải và chi tiết bổ sung. | RoFinance đã hỗ trợ thu/chi/chuyển hũ; “điều chỉnh số dư” cần quy tắc kế toán riêng nếu bổ sung. |
| Ghi chép hàng loạt | Bảng nhiều dòng với số tiền, hạng mục, tài khoản, thời gian, diễn giải. [Màn hình web](https://moneykeeperapp.misa.vn/management/add-transaction). | Rất phù hợp khi người dùng nhập bù nhiều giao dịch của chu kỳ trước. |
| Nhập sao kê | Trình nhiều bước: chọn ngân hàng → tài khoản nhập → tải tệp → kết quả xử lý → chi tiết nhập khẩu; có danh sách ngân hàng. | Hướng tốt cho nhập CSV/XLSX, nhưng phải có xem trước, chống trùng và người dùng xác nhận trước khi ghi. |
| Lịch sử | Trang riêng có bộ lọc và tổng thu/tổng chi. [Màn hình web](https://moneykeeperapp.misa.vn/management/transactions). | RoFinance đã có lịch sử theo ngày và bộ lọc chu kỳ; nên ưu tiên tìm kiếm/đối soát hơn là làm lại trang. |

## Đối chiếu với RoFinance hiện tại

RoFinance đã có **hũ tài chính, mẫu phân bổ, chu kỳ do người dùng đặt, dư chuyển tiếp, giao dịch backdate/chỉnh sửa, danh mục tùy chỉnh, thống kê theo chu kỳ, nợ, tài sản đầu tư, AI và xuất Excel/PDF trên web**. Số dư tài khoản ngân hàng liên kết được tính từ các hũ; ứng dụng **không đọc hoặc kết nối trực tiếp ngân hàng**. Vì vậy, các tính năng MISA trùng lặp chỉ nên được cải thiện ở UX hoặc độ chi tiết, không xây thành hệ thống sổ cái thứ hai. Xem [mô hình dữ liệu](src/types.ts), [tài khoản ngân hàng](src/components/BankAccountsModal.tsx), [lịch sử](src/components/TransactionList.tsx), [thống kê](src/components/AnalyticsCharts.tsx) và [xuất báo cáo](src/utils/exporter.ts).

## Đề xuất để duyệt

**P0 — nên làm trước**

1. **Nhập sao kê CSV/XLSX có đối soát.** Người dùng chọn ngân hàng/tài khoản, tải tệp, ánh xạ cột, xem trước ngày–số tiền–diễn giải, đánh dấu giao dịch trùng, chọn hũ/danh mục, rồi xác nhận từng dòng hoặc cả lô. Đây là đề xuất dựa trên trình nhập sao kê đã thấy ở bản web MISA. Không đăng nhập ngân hàng hộ người dùng, không tự tạo giao dịch chỉ vì tải tệp. Dedupe theo tài khoản + mã giao dịch ngân hàng nếu có; nếu không, dùng ngày/số tiền/nội dung và cho người dùng xử lý các trường hợp mơ hồ.
2. **Ghi chép hàng loạt/backdate.** Một bảng nhập nhiều giao dịch thu/chi, hỗ trợ dán từ bảng tính, kiểm tra từng dòng và xem tác động lên hũ/chu kỳ trước khi lưu. MISA có màn hình tương ứng; RoFinance hiện chủ yếu nhập từng giao dịch. Cần đảm bảo lỗi một dòng không âm thầm làm sai các dòng khác.

**P1 — giá trị cao, sau khi nền dữ liệu P0 ổn định**

3. **Hạn mức theo danh mục trong từng hũ.** Ví dụ hũ Thiết yếu có hạn mức riêng cho ăn sáng, ăn trưa, đi chợ; cảnh báo 80%/100%. MISA quảng bá hạn mức theo hạng mục; RoFinance hiện cảnh báo theo hũ (đặc biệt NEC), chưa có ngân sách cho từng danh mục. Hạn mức danh mục là lớp phân tích bên trong hũ, **không cộng thêm tiền** vào hũ và phải chạy theo chu kỳ 25→24 nếu đó là cấu hình của người dùng. [MISA về hạn mức](https://moneykeeper.misa.vn/so-thu-chi-misa-ung-dung-quan-ly-chi-tieu-ca-nhan-so-1-tai-viet-nam/), [cảnh báo RoFinance](src/components/BudgetAlertsBanner.tsx).
4. **Khoản thu/chi dự kiến và nhắc định kỳ.** Tạo mẫu lương, thuê nhà, hóa đơn, học phí, kỳ hạn nợ; có ngày đến hạn và nhắc trước. MISA mô tả “dự thu/dự chi”. Nên tạo **bản nháp/chờ xác nhận**, không tự ghi nhận thu/chi khi chưa thực nhận/thực trả; nếu không số dư và thống kê sẽ sai. Ngày đến hạn cần xử lý tháng ngắn, múi giờ và chu kỳ lương. [Nguồn MISA](https://moneykeeper.misa.vn/mach-ban-5-cach-su-dung-so-thu-chi-misa-huu-ich-nhat/).
5. **Mục tiêu tích lũy gắn với hũ/tài khoản hiện có.** Ví dụ quỹ dự phòng 6 tháng, du lịch, mua xe: mục tiêu, hạn, số đã dành, dự báo hoàn thành. MISA có tab tiết kiệm/tích lũy trên web và quảng bá kế hoạch tiết kiệm. Trong RoFinance, mục tiêu nên là một **nhãn phân bổ trên tiền hiện có**, không phải số dư mới; gửi/rút phải lưu lịch sử và không được đếm hai lần. [Nguồn MISA](https://moneykeeper.misa.vn/), [đầu tư an toàn RoFinance](src/components/SafetyInvestmentPortfolio.tsx).

**P2 — chọn theo nhu cầu sử dụng thực tế**

6. **Gắn thẻ chuyến đi/sự kiện cho giao dịch.** Một giao dịch vẫn thuộc một hũ/danh mục/chu kỳ, nhưng có thêm `eventId` tùy chọn để xem tổng chi cho chuyến đi, cưới hỏi hoặc dự án. Không tạo thêm một “hũ sự kiện” và không nhân đôi giao dịch. Đây là tính năng MISA mô tả trong tài liệu công khai, chưa xác minh trên bản web khảo sát. [Nguồn MISA](https://moneykeeper.misa.vn/mach-ban-5-cach-su-dung-so-thu-chi-misa-huu-ich-nhat/).
7. **Quét hóa đơn trên mobile để tạo bản nháp.** OCR/AI đề xuất số tiền, ngày, cửa hàng, danh mục; người dùng xác nhận rồi mới ghi sổ. Cần chính sách lưu/xóa ảnh, quyền camera, giới hạn tệp, xử lý ảnh độc hại và thông báo rõ nếu ảnh gửi đến dịch vụ AI bên ngoài. Chưa xác minh trên web; MISA mô tả tính năng này trong tài liệu công khai. [Nguồn MISA](https://moneykeeper.misa.vn/ra-mat-phien-ban-money-keeper-2-0-cai-tien-giao-dien-bo-sung-tinh-nang/).
8. **Phân loại nguồn tiền ngoài ngân hàng (tiền mặt/ví điện tử/thẻ tín dụng).** Bản web MISA hiển thị các loại này trong danh sách tài khoản. Chỉ nên triển khai nếu người dùng muốn theo dõi chúng; giữ khu vực **“Số dư tài khoản ngân hàng”** hiện tại đúng như yêu cầu trước đây. Thẻ tín dụng phải phân biệt dư nợ với tiền có thể chi, thanh toán thẻ là chuyển nghĩa vụ chứ không phải thu nhập. [Nguồn MISA về loại tài khoản](https://moneykeeper.misa.vn/kiem-soat-chi-tieu-de-dang-voi-cac-tai-khoan-co-san-tren-so-thu-chi-misa/).

**P3 — chưa nên làm ngay**

9. **Chia sẻ tài chính gia đình/nhóm.** MISA có tài liệu về chia sẻ tài khoản, nhưng tính năng này tác động mạnh đến bảo mật và mô hình sở hữu dữ liệu. Nếu làm, cần phân quyền xem/ghi theo tài khoản hoặc không gian, lời mời hết hạn, thu hồi quyền, nhật ký thay đổi và thử nghiệm cách xử lý hai người cùng sửa. Không sao chép toàn bộ dữ liệu cá nhân sang tài khoản người được mời. [Nguồn MISA](https://moneykeeper.misa.vn/ban-da-biet-cach-theo-doi-chi-tieu-cua-nguoi-khac-ma-khong-can-hoi-chua/).
10. **Danh sách mua sắm, chia tiền, tính thuế, tra tỷ giá.** Có thể hữu ích nhưng ít gắn với điểm mạnh “hũ + chu kỳ” của RoFinance. Trên web MISA khảo sát, “Chia tiền” còn báo đang phát triển; các tiện ích khác chỉ nhìn thấy tên trong menu, chưa xác minh hoạt động. Không nên ưu tiên chỉ vì xuất hiện trong menu. [Tài liệu MISA về các tiện ích](https://moneykeeper.misa.vn/mach-ban-5-cach-su-dung-so-thu-chi-misa-huu-ich-nhat/).

## Nguyên tắc phải giữ nếu triển khai

- **Một nguồn sự thật cho dòng tiền:** giao dịch thu/chi tác động đến hũ và tài khoản liên kết theo quy tắc hiện có; chuyển khoản/chuyển hũ không tạo thêm thu nhập hoặc chi phí. Điều chỉnh số dư phải là loại sự kiện riêng, có lý do và lịch sử kiểm toán.
- **Tôn trọng chu kỳ tài chính:** nhập bù hoặc import ngày cũ cập nhật đúng chu kỳ cũ; không chuyển chi tiêu cũ sang chu kỳ hiện tại, không tính lại lương/phân bổ ngoài ý muốn, không xóa snapshot/dư chuyển tiếp.
- **Nhập liệu an toàn:** giới hạn kích thước/loại tệp, kiểm tra dữ liệu cả phía backend, chống trùng, xem trước, xác nhận, rollback khi lỗi và chỉ cho người sở hữu thao tác. Không lưu mật khẩu ngân hàng hay tự động screen-scrape tài khoản MISA/ngân hàng.
- **Quyền riêng tư:** ẩn số tiền phải áp dụng cho các màn hình/tệp xem trước mới; thông báo mobile là opt-in; ảnh hóa đơn và dữ liệu nhóm cần chính sách giữ/xóa rõ ràng.
- **Không sao chép mã nguồn, hình ảnh hoặc thiết kế độc quyền của MISA**; chỉ tham khảo mô hình tính năng và thiết kế trải nghiệm phù hợp RoFinance.

## Thứ tự đề nghị và quyết định cần bạn duyệt

Đề nghị bắt đầu bằng **(1) nhập sao kê có đối soát** và **(2) ghi chép hàng loạt** vì chúng giải quyết trực tiếp việc ghi thiếu/backdate; sau đó chọn giữa **(3) hạn mức danh mục**, **(4) khoản định kỳ** và **(5) mục tiêu tích lũy**. Đây chỉ là đề xuất, không phải lệnh triển khai. Trước khi làm cần chốt: loại sao kê/ngân hàng ưu tiên, có cần CSV ngoài Excel không, import theo từng hũ hay ánh xạ tài khoản→hũ, và khoản định kỳ chỉ nhắc hay được phép tự tạo bản nháp.

### Nguồn chính

- Bản web đã khảo sát: [MISA MoneyKeeper](https://moneykeeperapp.misa.vn/), [tài khoản](https://moneykeeperapp.misa.vn/management/wallet), [ghi chép hàng loạt](https://moneykeeperapp.misa.vn/management/add-transaction), [lịch sử](https://moneykeeperapp.misa.vn/management/transactions) — các trang sau cần đăng nhập.
- Tài liệu công khai của MISA: [trang tính năng](https://moneykeeper.misa.vn/), [tổng quan](https://moneykeeper.misa.vn/so-thu-chi-misa-ung-dung-quan-ly-chi-tieu-ca-nhan-so-1-tai-viet-nam/), [5 tiện ích](https://moneykeeper.misa.vn/mach-ban-5-cach-su-dung-so-thu-chi-misa-huu-ich-nhat/), [chia sẻ tài khoản](https://moneykeeper.misa.vn/ban-da-biet-cach-theo-doi-chi-tieu-cua-nguoi-khac-ma-khong-can-hoi-chua/).
