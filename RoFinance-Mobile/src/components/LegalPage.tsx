import React from 'react';
import { ArrowLeft, ShieldCheck } from 'lucide-react';

type LegalPageType = 'privacy' | 'terms';

interface LegalPageProps {
  type: LegalPageType;
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="space-y-2">
    <h2 className="text-lg font-bold text-white">{title}</h2>
    <div className="space-y-2 text-sm leading-7 text-zinc-300">{children}</div>
  </section>
);

export const LegalPage: React.FC<LegalPageProps> = ({ type }) => {
  const isPrivacy = type === 'privacy';

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100">
      <header className="border-b border-zinc-800 bg-[#121214]">
        <div className="max-w-3xl mx-auto px-5 py-5 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 font-black text-white">
            <ShieldCheck className="w-5 h-5 text-indigo-400" />
            RoFinance
          </a>
          <a href="/" className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white">
            <ArrowLeft className="w-4 h-4" />
            Về trang chủ
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-10 space-y-8">
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-400">RoFinance</p>
          <h1 className="text-3xl sm:text-4xl font-black">
            {isPrivacy ? 'Chính sách quyền riêng tư' : 'Điều khoản sử dụng'}
          </h1>
          <p className="text-sm text-zinc-500">Cập nhật lần cuối: 30 tháng 7 năm 2026</p>
        </div>

        {isPrivacy ? <PrivacyContent /> : <TermsContent />}

        <div className="pt-6 border-t border-zinc-800 flex flex-wrap gap-4 text-xs">
          <a href="/" className="text-indigo-400 hover:text-indigo-300">Trang chủ</a>
          <a href="/privacy-policy" className="text-indigo-400 hover:text-indigo-300">Chính sách quyền riêng tư</a>
          <a href="/terms-of-service" className="text-indigo-400 hover:text-indigo-300">Điều khoản sử dụng</a>
        </div>
      </main>
    </div>
  );
};

const PrivacyContent = () => (
  <>
    <Section title="1. Phạm vi áp dụng">
      <p>
        Chính sách này giải thích cách RoFinance thu thập, sử dụng, lưu trữ và bảo vệ thông tin
        khi bạn sử dụng ứng dụng quản lý tài chính tại rof.aprwatch.com.
      </p>
    </Section>

    <Section title="2. Thông tin chúng tôi thu thập">
      <p>
        Khi bạn đăng ký bằng email, chúng tôi lưu địa chỉ email và mật khẩu đã được băm; chúng
        tôi không lưu mật khẩu gốc. Khi đăng nhập bằng Google hoặc Apple, chúng tôi nhận mã định
        danh tài khoản và địa chỉ email đã được nhà cung cấp xác minh.
      </p>
      <p>
        Dữ liệu bạn nhập có thể gồm thu nhập, ngân sách hũ, giao dịch, tài khoản ngân hàng do
        bạn khai báo, khoản nợ và danh mục tài sản số. RoFinance không yêu cầu mật khẩu ngân
        hàng, mã PIN hoặc mã OTP.
      </p>
    </Section>

    <Section title="3. Cách sử dụng thông tin">
      <p>
        Thông tin được dùng để xác thực tài khoản, lưu và đồng bộ dữ liệu tài chính, hiển thị
        báo cáo, duy trì bảo mật phiên và cung cấp các tính năng do bạn chủ động yêu cầu.
      </p>
    </Section>

    <Section title="4. Đăng nhập Google và Apple">
      <p>
        RoFinance chỉ yêu cầu thông tin nhận dạng cơ bản gồm mã tài khoản và email. Chúng tôi
        không yêu cầu quyền truy cập Gmail, Google Drive, danh bạ, lịch hoặc dữ liệu Apple
        ngoài phạm vi đăng nhập. Bạn có thể thu hồi quyền truy cập trong phần quản lý tài khoản
        Google hoặc Apple của mình.
      </p>
    </Section>

    <Section title="5. Trợ lý tài chính AI">
      <p>
        Khi bạn chủ động sử dụng Trợ lý AI, câu hỏi cùng thông tin hũ, thu nhập và một số giao
        dịch gần đây có thể được gửi tới Google Gemini để tạo câu trả lời. Không sử dụng tính
        năng này nếu bạn không muốn dữ liệu liên quan được xử lý bởi dịch vụ AI của Google.
      </p>
    </Section>

    <Section title="6. Cookie và lưu trữ">
      <p>
        Chúng tôi sử dụng cookie phiên bảo mật, HttpOnly để duy trì trạng thái đăng nhập.
        Dữ liệu tài khoản được lưu trong PostgreSQL và tách biệt theo mã người dùng. Trình
        duyệt có thể giữ dữ liệu local cũ chỉ để hỗ trợ quá trình chuyển đổi một lần.
      </p>
    </Section>

    <Section title="7. Chia sẻ và bên xử lý dữ liệu">
      <p>
        Chúng tôi không bán dữ liệu cá nhân. Dữ liệu chỉ được chia sẻ khi cần vận hành tính
        năng với nhà cung cấp hạ tầng, Google/Apple để xác thực, Gemini khi bạn dùng AI, hoặc
        khi pháp luật yêu cầu. Giá thị trường tài sản số được lấy từ API công khai của Binance.
      </p>
    </Section>

    <Section title="8. Bảo mật và thời gian lưu giữ">
      <p>
        RoFinance sử dụng băm mật khẩu, HTTPS, cookie bảo mật, kiểm soát phiên và phân tách dữ
        liệu theo tài khoản. Dữ liệu được lưu trong thời gian tài khoản còn hoạt động hoặc khi
        cần đáp ứng nghĩa vụ pháp lý và bảo mật.
      </p>
    </Section>

    <Section title="9. Quyền của bạn">
      <p>
        Bạn có thể xem và cập nhật dữ liệu trong ứng dụng, đăng xuất, thu hồi quyền OAuth và
        yêu cầu truy cập hoặc xóa tài khoản cùng dữ liệu liên quan. Yêu cầu hỗ trợ có thể được
        gửi cho quản trị viên RoFinance thông qua chủ sở hữu tên miền aprwatch.com.
      </p>
    </Section>

    <Section title="10. Thay đổi chính sách">
      <p>
        Chính sách có thể được cập nhật khi tính năng hoặc quy định thay đổi. Ngày cập nhật mới
        nhất luôn được hiển thị ở đầu trang.
      </p>
    </Section>
  </>
);

const TermsContent = () => (
  <>
    <Section title="1. Chấp nhận điều khoản">
      <p>
        Khi truy cập hoặc sử dụng RoFinance, bạn đồng ý với các điều khoản này và Chính sách
        quyền riêng tư. Nếu không đồng ý, bạn không nên sử dụng dịch vụ.
      </p>
    </Section>

    <Section title="2. Điều kiện sử dụng tài khoản">
      <p>
        Bạn chịu trách nhiệm cung cấp thông tin chính xác, bảo vệ phương thức đăng nhập và mọi
        hoạt động phát sinh trong tài khoản của mình. Không được truy cập trái phép tài khoản
        hoặc dữ liệu của người khác.
      </p>
    </Section>

    <Section title="3. Mục đích của dịch vụ">
      <p>
        RoFinance cung cấp công cụ ghi chép, phân bổ ngân sách, theo dõi giao dịch, khoản nợ và
        tài sản số. Dịch vụ có thể thay đổi, bổ sung hoặc ngừng một tính năng để đảm bảo vận
        hành và bảo mật.
      </p>
    </Section>

    <Section title="4. Không phải tư vấn tài chính">
      <p>
        Nội dung, biểu đồ và câu trả lời từ Trợ lý AI chỉ có mục đích tham khảo và giáo dục,
        không phải tư vấn đầu tư, pháp lý, thuế hoặc tín dụng. Bạn tự chịu trách nhiệm đối với
        quyết định tài chính và nên tham khảo chuyên gia có thẩm quyền khi cần.
      </p>
    </Section>

    <Section title="5. Dịch vụ bên thứ ba">
      <p>
        Một số chức năng phụ thuộc vào Google, Apple, Gemini, Binance, Cloudflare hoặc nhà cung
        cấp hạ tầng. Việc sử dụng các dịch vụ đó còn chịu điều khoản riêng của từng nhà cung
        cấp. RoFinance không bảo đảm dữ liệu giá thị trường luôn liên tục hoặc tuyệt đối chính xác.
      </p>
    </Section>

    <Section title="6. Hành vi bị cấm">
      <p>
        Bạn không được khai thác lỗ hổng, phá hoại dịch vụ, vượt qua kiểm soát truy cập, phát
        tán mã độc, tự động gửi yêu cầu gây quá tải hoặc sử dụng RoFinance cho hoạt động trái pháp luật.
      </p>
    </Section>

    <Section title="7. Khả dụng và giới hạn trách nhiệm">
      <p>
        Dịch vụ được cung cấp trên cơ sở hiện trạng. Chúng tôi cố gắng duy trì tính sẵn sàng và
        bảo mật nhưng không cam kết dịch vụ không có gián đoạn hoặc lỗi. Trong phạm vi pháp luật
        cho phép, RoFinance không chịu trách nhiệm cho tổn thất tài chính phát sinh từ quyết định
        dựa trên dữ liệu hoặc nội dung trong ứng dụng.
      </p>
    </Section>

    <Section title="8. Chấm dứt và xóa tài khoản">
      <p>
        Quyền truy cập có thể bị đình chỉ khi có hành vi vi phạm, gây nguy hiểm cho hệ thống
        hoặc theo yêu cầu pháp luật. Bạn có thể yêu cầu đóng tài khoản và xóa dữ liệu liên quan.
      </p>
    </Section>

    <Section title="9. Thay đổi điều khoản">
      <p>
        Điều khoản có thể được cập nhật để phản ánh thay đổi của dịch vụ hoặc pháp luật. Việc
        tiếp tục sử dụng sau khi điều khoản mới có hiệu lực được xem là chấp nhận nội dung cập nhật.
      </p>
    </Section>
  </>
);
