/** Trang hướng dẫn sử dụng + câu hỏi thường gặp. */

import type { MountFn } from "../../router";
import { renderPage, bindShell, setModuleTheme } from "../../components/appShell";
import { icon } from "../../components/icons";
import { esc } from "../../components/bindActions";
import { crumbs, sectionHead, notice } from "../../components/ui";

const STRATEGY_STEPS = [
  {
    step: "1",
    title: "Giai đoạn 1: Làm quen & Hiểu bản chất",
    mode: "Duyệt câu hỏi",
    badge: "Bắt đầu",
    text: "Xem từng câu hỏi kèm ngay đáp án tham chiếu. Đọc kỹ đề bài, đối chiếu thuật ngữ song ngữ (nếu có) và lưu lại các câu chưa chắc bằng nút Bookmark.",
    tips: "Không cần bấm giờ. Mục tiêu là hiểu rõ ngữ cảnh và yêu cầu của từng dạng câu hỏi.",
  },
  {
    step: "2",
    title: "Giai đoạn 2: Luyện tập & Lấp lỗ hổng",
    mode: "Luyện tập chấm tức thì",
    badge: "Trọng tâm",
    text: "Làm theo từng gói 10–30 câu, bấm Kiểm tra sau mỗi câu để đối chiếu ngay khi còn nhớ suy luận. Câu sai tự động vào 'Ngân hàng câu sai'.",
    tips: "Dành riêng các buổi học chỉ để luyện lại danh sách câu sai cho đến khi tỷ lệ đúng đạt trên 90%.",
  },
  {
    step: "3",
    title: "Giai đoạn 3: Thi thử & Rèn phản xạ",
    mode: "Thi thử có giờ",
    badge: "Về đích",
    text: "Mô phỏng 100% điều kiện thi thật: đúng số câu, đếm ngược thời gian, chấm điểm sau khi nộp toàn bài và đối chiếu với ngưỡng đậu quy đổi.",
    tips: "Phân bổ thời gian: trung bình 1.5–2 phút/câu. Gặp câu dài hoặc phân vân, bấm 'F' để cắm cờ và quay lại sau.",
  },
];

const MODES = [
  {
    iconName: "book",
    tone: "info",
    title: "Duyệt câu hỏi",
    badge: "Ôn nền tảng",
    text: "Xem lần lượt từng câu kèm đáp án đúng, có ô tìm kiếm và danh sách câu bên cạnh. Phù hợp khi bạn cần đọc hiểu đề bài và tra cứu thuật ngữ mà không bị áp lực thời gian.",
    bullets: ["Hiện sẵn đáp án tham chiếu", "Tìm kiếm theo từ khoá, mã số câu", "Lưu lại câu quan trọng để xem lại"],
  },
  {
    iconName: "zap",
    tone: "warn",
    title: "Luyện tập",
    badge: "Sửa lỗi sai",
    text: "Chọn số câu tuỳ ý, trả lời và bấm Kiểm tra là biết đúng/sai ngay lập tức. Câu trả lời sai được tự động gom vào ngân hàng câu sai để bạn rèn luyện riêng.",
    bullets: ["Chấm điểm ngay tại chỗ", "Không giới hạn thời gian", "Tự động tích luỹ ngân hàng câu sai"],
  },
  {
    iconName: "trophy",
    tone: "brand",
    title: "Thi thử",
    badge: "Mô phỏng thật",
    text: "Mô phỏng kỳ thi chính thức với đúng số lượng câu và đồng hồ đếm ngược. Tự do nhảy câu, đánh dấu cờ để rà soát. Hết giờ hệ thống tự động nộp bài và chấm điểm.",
    bullets: ["Đồng hồ đếm ngược như phòng thi", "Bảng nhảy câu và đánh dấu cờ xem lại", "Chấm điểm và đối chiếu ngưỡng đậu"],
  },
];

const FAQS: [string, string][] = [
  [
    "Có cần đăng ký tài khoản không?",
    "Có. Tài khoản là nơi giữ tiến trình học của bạn, nhờ đó khi đổi máy hay đổi trình duyệt bạn vẫn giữ nguyên lịch sử làm bài, các câu đã lưu (bookmark), ngân hàng câu sai và phiên làm bài đang dở. Đăng ký chỉ cần email và mật khẩu, hoặc đăng nhập 1 chạm với tài khoản Google.",
  ],
  [
    "Dữ liệu học của tôi được lưu ở đâu?",
    "Dữ liệu được lưu trữ an toàn trên máy chủ đám mây Supabase và gắn trực tiếp với tài khoản cá nhân. Mỗi người học chỉ đọc và ghi được dữ liệu của chính mình thông qua cơ chế Row Level Security của CSDL.",
  ],
  [
    "Đang làm bài mà vô tình đóng tab hoặc mất mạng thì sao?",
    "Phiên làm bài được lưu tự động sau mỗi hành động (cả trên trình duyệt lẫn máy chủ). Khi mở lại trang chứng chỉ đó — kể cả trên thiết bị khác — bạn sẽ thấy thẻ 'Tiếp tục bài đang làm' với đúng vị trí câu, đáp án đã chọn và đồng hồ thời gian còn lại.",
  ],
  [
    "Làm sao để thêm đề thi mới hoặc cập nhật ngân hàng câu hỏi?",
    "Tài khoản có quyền quản trị viên sẽ có thêm mục 'Quản trị' trên thanh điều hướng. Quản trị viên có thể tải lên file đề thi định dạng JSON hoặc CSV. Hệ thống tự động kiểm tra cú pháp, trùng lặp và tính toàn vẹn của đáp án trước khi nạp vào CSDL.",
  ],
  [
    "Nguồn gốc câu hỏi và bản dịch trong ứng dụng?",
    "Bộ đề AWS SAA-C03 gồm 904 câu được tuyển chọn kỹ lưỡng từ ngân hàng câu hỏi ôn thi cộng đồng, có kèm bản dịch tiếng Nhật để phục vụ cả việc học thuật ngữ. Bộ câu hỏi AP (Ứng dụng CNTT) hiện tại là dữ liệu minh hoạ chuẩn cấu trúc và sẽ tiếp tục được mở rộng đề thi thật.",
  ],
  [
    "Hệ thống có chạy được ngoại tuyến (offline) không?",
    "Ngân hàng câu hỏi và tiến trình học tập được quản lý trên máy chủ nên cần có kết nối Internet để tải dữ liệu và đồng bộ kết quả. Tuy nhiên toàn bộ ứng dụng được tối ưu hoá cực kỳ gọn nhẹ (chỉ một file HTML/CSS/JS duy nhất) giúp tải trang tức thì.",
  ],
  [
    "Điểm số trong ứng dụng được tính như thế nào?",
    "Ứng dụng tính tỷ lệ phần trăm số câu trả lời chính xác trên tổng số câu hỏi trong bài và so sánh với ngưỡng đậu tiêu chuẩn của chứng chỉ (ví dụ AWS là 72%, tương đương ~720/1000 điểm).",
  ],
  [
    "Kế hoạch ra mắt các chứng chỉ JLPT và FE?",
    "Cấu trúc đề, chặng thi và giao diện chuyên biệt cho JLPT (chia 3 phần chữ Hán, ngữ pháp, nghe hiểu) và FE (Khoa A đại cương, Khoa B lập trình) đã được hoàn thiện. Ngay khi dữ liệu ngân hàng câu hỏi được biên tập xong, các chứng chỉ này sẽ mở trực tiếp trên hệ thống.",
  ],
];

const state = { open: 0 };

export const mountGuide: MountFn = (root) => {
  setModuleTheme(null);

  const render = () => {
    const content = `
      <div class="page-head">
        <div class="page">
          ${crumbs([{ label: "Trang chủ", action: "go", arg: "/" }, { label: "Hướng dẫn sử dụng" }])}
          <div class="page-head-main">
            <div class="page-head-text">
              <span class="badge badge-brand mb-12">${icon("sparkles")}Cẩm nang ôn thi hiệu quả</span>
              <h1>Hướng dẫn sử dụng &amp; Phương pháp học</h1>
              <p class="lead">Lộ trình học 3 giai đoạn, phân tích các chế độ luyện tập và giải đáp mọi thắc mắc thường gặp.</p>
            </div>
            <div class="page-head-side">
              <button class="btn btn-primary" data-action="go" data-arg="/chung-chi">${icon("play")}Vào danh mục chứng chỉ</button>
            </div>
          </div>
        </div>
      </div>

      <div class="page page-body">
        ${sectionHead("Lộ trình đề xuất", "Quy trình ôn thi 3 giai đoạn để đạt điểm cao")}
        <div class="feature-grid">
          ${STRATEGY_STEPS.map(
            (s) => `<div class="feature">
              <div class="row-between mb-12">
                <div class="step-n" style="margin-bottom:0">${s.step}</div>
                <span class="badge badge-brand">${esc(s.badge)}</span>
              </div>
              <h3>${esc(s.title)}</h3>
              <p class="mb-12">${esc(s.text)}</p>
              <div class="card-pad" style="background:var(--surface-2);border-radius:var(--r-md);padding:12px;font-size:13px;border:1px solid var(--line)">
                <b class="text-brand">${icon("sparkles")} Mẹo:</b> <span>${esc(s.tips)}</span>
              </div>
            </div>`
          ).join("")}
        </div>

        ${sectionHead("Chế độ học tập", "Ba phương thức luyện tập phục vụ từng mục đích")}
        <div class="feature-grid">
          ${MODES.map(
            (m) => `<div class="feature">
              <div class="row-between mb-16">
                <div class="icon-chip lg ${m.tone}">${icon(m.iconName)}</div>
                <span class="badge badge-outline">${esc(m.badge)}</span>
              </div>
              <h3>${esc(m.title)}</h3>
              <p>${esc(m.text)}</p>
              <ul class="checklist mt-16">
                ${m.bullets.map((b) => `<li>${icon("check")}<span>${esc(b)}</span></li>`).join("")}
              </ul>
            </div>`
          ).join("")}
        </div>

        ${sectionHead("Hỏi đáp thường gặp", "Giải đáp thắc mắc về tài khoản, dữ liệu & lộ trình")}
        <div class="card card-pad mb-32">
          ${FAQS.map(
            ([q, a], i) => `<div class="faq-item ${state.open === i ? "is-open" : ""}">
              <button class="faq-q" data-action="faq" data-arg="${i}">${esc(q)}${icon(state.open === i ? "chevronUp" : "plus")}</button>
              ${state.open === i ? `<div class="faq-a" style="animation:fade-up .2s var(--ease-out) both">${esc(a)}</div>` : ""}
            </div>`
          ).join("")}
        </div>

        ${notice(
          "<strong>Lưu ý về bản quyền &amp; dữ liệu:</strong> Hệ thống được thiết kế phục vụ mục đích học tập và rèn luyện kỹ năng thi chứng chỉ chuyên nghiệp. Nội dung câu hỏi và bài giảng được biên tập bám sát chuẩn kiến thức của các tổ chức khảo thí.",
          "info",
          "info"
        )}

        <div class="cta-band mt-40">
          <div class="cta-band-text">
            <h2>Sẵn sàng bắt đầu buổi ôn luyện?</h2>
            <p>Chọn ngay một chứng chỉ và bắt đầu làm bài để hệ thống phân tích và theo dõi sự tiến bộ của bạn.</p>
          </div>
          <button class="btn btn-primary btn-lg" data-action="go" data-arg="/chung-chi">${icon("play")}Xem danh sách chứng chỉ</button>
        </div>
      </div>`;

    root.innerHTML = renderPage({ active: "guide", content });

    bindShell(root, "guide", {
      faq: (i) => {
        const idx = Number(i);
        state.open = state.open === idx ? -1 : idx;
        render();
      },
    });
  };

  render();
};

