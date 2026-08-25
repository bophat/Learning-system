/** Trang chủ: giới thiệu, chọn chứng chỉ, tính năng, các bước, hỏi đáp nhanh. */

import type { MountFn } from "../../router";
import { navigate } from "../../router";
import { renderPage, bindShell, setModuleTheme } from "../../components/appShell";
import { icon } from "../../components/icons";
import { esc } from "../../components/bindActions";
import { certCard } from "../../components/certCard";
import { sectionHead, formatNumber, formatDuration } from "../../components/ui";
import { getModules } from "../../data/catalog";
import { getOverallStats } from "../../state/progress";
import { loadSession } from "../../state/session";

const FEATURES: { iconName: string; title: string; text: string; tone: string }[] = [
  {
    iconName: "target",
    title: "Mô phỏng đúng đề thi thật",
    text: "Đúng số câu, đúng thời gian, đúng cách chấm của từng kỳ thi — AWS chọn nhiều đáp án, AP có buổi sáng và buổi chiều riêng.",
    tone: "brand",
  },
  {
    iconName: "zap",
    title: "Chấm điểm ngay tại chỗ",
    text: "Chế độ luyện tập cho biết đúng/sai ngay sau mỗi câu, kèm đáp án chuẩn để bạn hiểu lỗi sai khi còn nhớ đề.",
    tone: "warn",
  },
  {
    iconName: "chart",
    title: "Theo dõi tiến trình",
    text: "Lịch sử từng lần thi, điểm cao nhất, điểm trung bình và tổng thời gian luyện tập của riêng bạn.",
    tone: "info",
  },
  {
    iconName: "refresh",
    title: "Ngân hàng câu sai",
    text: "Mọi câu trả lời sai được gom lại tự động. Luyện riêng nhóm câu đó cho tới khi làm đúng thì câu tự rời khỏi danh sách.",
    tone: "bad",
  },
  {
    iconName: "language",
    title: "Song ngữ Anh — Nhật",
    text: "Bộ đề AWS hiển thị được cả bản tiếng Anh lẫn tiếng Nhật, xem song song để vừa ôn thi vừa luyện thuật ngữ.",
    tone: "good",
  },
  {
    iconName: "shield",
    title: "Đồng bộ mọi thiết bị",
    text: "Tiến trình gắn với tài khoản của bạn: làm dở trên điện thoại, mở laptop là học tiếp đúng chỗ đang dừng.",
    tone: "",
  },
];

const STEPS = [
  { title: "Chọn chứng chỉ", text: "AWS SAA-C03, AP (応用情報) — hoặc xem trước cấu trúc đề của JLPT và FE." },
  { title: "Chọn cách ôn", text: "Duyệt câu hỏi kèm đáp án, luyện tập chấm ngay từng câu, hoặc thi thử có đồng hồ đếm ngược." },
  { title: "Xem lại & lấp lỗ hổng", text: "Sau khi nộp bài, xem lại từng câu sai rồi luyện riêng nhóm câu đó cho tới khi chắc." },
];

function heroMock(): string {
  return `<div style="position:relative">
    <div class="hero-float tl">${icon("checkCircle", "text-good")}<span>Chấm điểm tức thì</span></div>
    <div class="hero-mock">
      <div class="mock-bar">
        <span class="mock-dot"></span><span class="mock-dot"></span><span class="mock-dot"></span>
        <span class="mock-timer">01:58:24</span>
      </div>
      <p class="mock-q">Một ứng dụng web cần lưu trữ tệp tĩnh với độ bền cao và chi phí thấp. Giải pháp nào phù hợp nhất?</p>
      <div class="mock-opts">
        <div class="mock-opt ok"><i>A</i>Amazon S3 với lớp lưu trữ Standard-IA</div>
        <div class="mock-opt no"><i>B</i>Amazon EBS gắn vào EC2</div>
        <div class="mock-opt"><i>C</i>Instance store trên EC2</div>
      </div>
      <div class="mock-foot">
        <span class="mock-pnum done">1</span>
        <span class="mock-pnum done">2</span>
        <span class="mock-pnum cur">3</span>
        <span class="mock-pnum">4</span>
        <span class="mock-pnum">5</span>
        <span class="text-xs text-muted" style="margin-left:auto">3 / 65 câu</span>
      </div>
    </div>
    <div class="hero-float br">${icon("trophy", "text-brand")}<span>Ngưỡng đậu 72%</span></div>
  </div>`;
}

export const mountLanding: MountFn = (root) => {
  setModuleTheme(null);

  const modules = getModules();
  const totalQuestions = modules.reduce((s, m) => s + m.questionCount, 0);
  const readyCount = modules.filter((m) => m.available).length;
  const overall = getOverallStats();

  // Có bài nào đang làm dở không?
  const pending = modules.filter((m) => m.available)
    .map((m) => ({ m, s: loadSession(m.id) }))
    .find((x) => x.s);

  const resumeBanner = pending?.s
    ? `<div class="page" style="margin-top:-34px;position:relative;z-index:2">
        <div class="card card-pad row-between anim-up" style="border-color:var(--accent-soft-2);background:var(--accent-soft)">
          <div class="row gap-16" style="min-width:0">
            <div class="icon-chip lg">${icon("play")}</div>
            <div style="min-width:0">
              <div class="card-title">Bạn còn một bài đang làm dở</div>
              <div class="card-note">${esc(pending.m.shortName)} · ${esc(pending.s.label)} — dừng ở câu ${pending.s.idx + 1}/${pending.s.qNums.length}</div>
            </div>
          </div>
          <button class="btn btn-accent" data-action="openCert" data-arg="${esc(pending.m.id)}">${icon("arrowRight")}Tiếp tục làm bài</button>
        </div>
      </div>`
    : "";

  const yourProgress = overall.attempts
    ? `<div class="page section tight">
        <div class="card card-pad">
          <div class="card-head">
            <div>
              <div class="card-title">Tiến trình của bạn</div>
              <div class="card-note">Tổng hợp từ ${overall.attempts} lần luyện tập gần đây</div>
            </div>
            <button class="btn btn-outline btn-sm" data-action="go" data-arg="/tien-trinh">${icon("chart")}Xem chi tiết</button>
          </div>
          <div class="stat-grid">
            <div class="stat-box"><div class="k">${icon("refresh")}Lần làm bài</div><div class="v">${overall.attempts}</div></div>
            <div class="stat-box"><div class="k">${icon("list")}Câu đã làm</div><div class="v">${formatNumber(overall.questions)}</div></div>
            <div class="stat-box"><div class="k">${icon("target")}Tỷ lệ đúng TB</div><div class="v">${overall.avgPct}<small>%</small></div></div>
            <div class="stat-box"><div class="k">${icon("clock")}Thời gian ôn</div><div class="v" style="font-size:19px">${esc(formatDuration(overall.timeSec))}</div></div>
          </div>
        </div>
      </div>`
    : "";

  const content = `
    <section class="hero">
      <div class="page hero-inner">
        <div class="hero-grid">
          <div>
            <span class="badge badge-brand mb-16">${icon("sparkles")}Hệ thống học tập thông minh · Đồng bộ đa thiết bị</span>
            <h1>Luyện thi chứng chỉ<br><span class="hl">theo đúng cấu trúc đề thật</span></h1>
            <p class="hero-sub">Mỗi kỳ thi có một hình thức riêng — AWS chọn nhiều đáp án, AP thi hai buổi sáng &amp; chiều, JLPT chấm theo từng phần. Ở đây bạn ôn đúng theo hình thức đó, không phải một khuôn chung cho tất cả.</p>
            <div class="hero-cta">
              <button class="btn btn-primary btn-lg" data-action="go" data-arg="/chung-chi">${icon("play")}Bắt đầu ôn ngay</button>
              <button class="btn btn-outline btn-lg" data-action="go" data-arg="/huong-dan">${icon("help")}Cách sử dụng</button>
            </div>
            <div class="hero-trust">
              <div class="hero-trust-item"><span class="hero-trust-num">${formatNumber(totalQuestions)}+</span><span class="hero-trust-label">câu hỏi có sẵn</span></div>
              <div class="hero-trust-item"><span class="hero-trust-num">${modules.length}</span><span class="hero-trust-label">chứng chỉ</span></div>
              <div class="hero-trust-item"><span class="hero-trust-num">${readyCount}</span><span class="hero-trust-label">đang mở luyện thi</span></div>
              <div class="hero-trust-item"><span class="hero-trust-num">4</span><span class="hero-trust-label">chế độ luyện tập</span></div>
            </div>
          </div>
          ${heroMock()}
        </div>
      </div>
    </section>

    ${resumeBanner}
    ${yourProgress}

    <section class="section" id="cert-list">
      <div class="page">
        ${sectionHead("Ngân hàng đề thi", "Chọn chứng chỉ để bắt đầu", "Mỗi thẻ dưới đây là một kỳ thi riêng với giao diện luyện tập được dựng theo đúng cấu trúc đề của nó.")}
        <div class="cert-grid">${modules.map(certCard).join("")}</div>
      </div>
    </section>

    <section class="section surface">
      <div class="page">
        ${sectionHead("Vì sao chọn ÔnThi", "Hệ thống học tập toàn diện & chuẩn khảo thí", "Tối ưu hóa thời gian ôn tập, phân tích lỗ hổng kiến thức và bám sát cấu trúc đề thi thực tế.", true)}
        <div class="feature-grid">
          ${FEATURES.map(
            (f) => `<div class="feature">
              <div class="icon-chip lg ${f.tone}">${icon(f.iconName)}</div>
              <h3>${esc(f.title)}</h3>
              <p>${esc(f.text)}</p>
            </div>`
          ).join("")}
        </div>
      </div>
    </section>

    <section class="section">
      <div class="page">
        ${sectionHead("Bắt đầu thế nào", "Ba bước là vào ôn được")}
        <div class="steps">
          ${STEPS.map(
            (s, i) => `<div class="step">
              <div class="step-n">${i + 1}</div>
              <h3>${esc(s.title)}</h3>
              <p>${esc(s.text)}</p>
            </div>`
          ).join("")}
        </div>
      </div>
    </section>

    <section class="section tight">
      <div class="page">
        <div class="cta-band">
          <div class="cta-band-text">
            <h2>Sẵn sàng cho buổi ôn đầu tiên?</h2>
            <p>Chọn một chứng chỉ, làm thử 10 câu ở chế độ luyện tập để cảm nhận, rồi bắt đầu bấm giờ như thi thật.</p>
          </div>
          <button class="btn btn-primary btn-lg" data-action="go" data-arg="/chung-chi">${icon("arrowRight")}Xem danh sách chứng chỉ</button>
        </div>
      </div>
    </section>`;

  root.innerHTML = renderPage({ active: "home", content });

  bindShell(root, "home", {
    openCert: (id) => {
      const m = modules.find((x) => x.id === id);
      if (!m) return;
      navigate(m.available ? `/${m.id}` : `/sap-co/${m.id}`);
    },
  });
};
