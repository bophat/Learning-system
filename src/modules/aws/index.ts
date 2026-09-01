/**
 * Module AWS SAA-C03: trang tổng quan, màn duyệt câu hỏi song ngữ và màn thiết
 * lập bài làm. Phần làm bài/chấm điểm dùng chung bộ máy ở `modules/shared/mcExam`.
 *
 * Ngân hàng câu hỏi nằm trên Supabase. Trang tổng quan chỉ đọc số liệu tổng hợp
 * (view `module_stats`) nên vào rất nhanh; cả nghìn câu chỉ được tải khi thật sự
 * cần — lúc mở màn duyệt câu hỏi hoặc lúc bấm bắt đầu làm bài.
 */

import type { Lang, MultipleChoiceQuestion } from "../../types/exam";
import { registerRoute, navigate } from "../../router";
import { renderPage, bindShell, setModuleTheme } from "../../components/appShell";
import { icon } from "../../components/icons";
import { esc, bindInputs, highlight } from "../../components/bindActions";
import { toast } from "../../components/toast";
import { withData } from "../../components/loading";
import { crumbs, notice, ring, formatDuration, formatDateTime, formatNumber } from "../../components/ui";
import { loadModuleState, saveModuleState } from "../../state/storage";
import { currentUserId } from "../../state/auth";
import { getModuleStats, getAttempts, getBookmarks, getWrong, isBookmarked, toggleBookmark } from "../../state/progress";
import { loadSession, clearSession } from "../../state/session";
import { startExam, resumeExam, hasLiveExam, continueLiveExam } from "../shared/mcExam";
import { loadMcQuestions } from "../../data/questions";
import { shuffleAllMcOptions } from "../../lib/shuffle";
import { getModule, getBankStats } from "../../data/catalog";

const MODULE_ID = "aws";

interface StoredState {
  lang: Lang;
  browseIdx: number;
  mode: "practice" | "exam";
  count: number | "all";
  order: "sequential" | "random";
  source: "all" | "wrong" | "saved";
}

const state = {
  lang: "en" as Lang,
  browseIdx: 0,
  mode: "practice" as "practice" | "exam",
  count: 20 as number | "all",
  order: "sequential" as "sequential" | "random",
  source: "all" as "all" | "wrong" | "saved",
  browseQuery: "",
  browseFilter: "all" as "all" | "answered" | "multi" | "saved",
  showAnswer: true,
  starting: false,
};

/**
 * Lấy lại lựa chọn đã lưu của người đang đăng nhập. Gọi ở đầu mỗi màn vì lúc
 * file này được nạp thì chưa biết ai đang đăng nhập.
 */
let hydratedFor: string | null = null;
function hydrate(): void {
  const uid = currentUserId();
  if (hydratedFor === uid) return;
  hydratedFor = uid;
  const p = loadModuleState<StoredState>(MODULE_ID);
  state.lang = p.lang === "ja" ? "ja" : "en";
  state.browseIdx = Math.max(0, p.browseIdx ?? 0);
  state.mode = p.mode === "exam" ? "exam" : "practice";
  state.count = p.count ?? 20;
  state.order = p.order === "random" ? "random" : "sequential";
  state.source = p.source ?? "all";
}

/** Ngân hàng câu hỏi sau khi tải — giữ lại để không phải tải đi tải lại. */
let questions: MultipleChoiceQuestion[] = [];

async function ensureQuestions(): Promise<void> {
  if (questions.length) return;
  questions = await loadMcQuestions(MODULE_ID);
}

function meta() {
  return getModule(MODULE_ID);
}

function brandLabel(): string {
  const m = meta();
  return m ? `${m.shortName} ${m.shortLabel}` : "AWS";
}

function passPct(): number {
  return meta()?.passPct ?? 72;
}

/** Chỉ câu vừa có đáp án vừa có đủ phương án mới đưa vào bài làm được. */
function pool(): MultipleChoiceQuestion[] {
  return questions.filter((q) => q.answer && q.options.length > 0);
}

function save(patch: Partial<StoredState>): void {
  saveModuleState<StoredState>(MODULE_ID, patch);
}

function stem(q: MultipleChoiceQuestion, lang: Lang): string {
  return lang === "ja" ? q.ja || q.en : q.en;
}

function optText(o: { en: string; ja: string }, lang: Lang): string {
  return lang === "ja" ? o.ja || o.en : o.en;
}

// ------------------------------------------------------------ trang tổng quan

function renderHome(root: HTMLElement): void {
  setModuleTheme(MODULE_ID);
  hydrate();
  const m = meta();
  if (!m) {
    navigate("/chung-chi");
    return;
  }

  const bank = getBankStats(MODULE_ID);
  const stats = getModuleStats(MODULE_ID);
  const wrong = getWrong(MODULE_ID);
  const saved = getBookmarks(MODULE_ID);
  const attempts = getAttempts(MODULE_ID).slice(0, 5);
  const session = loadSession(MODULE_ID);
  const live = hasLiveExam(MODULE_ID);

  const resumeCard = session || live
    ? `<div class="card card-pad mb-24" style="border-color:var(--accent-soft-2);background:var(--accent-soft)">
        <div class="row-between">
          <div class="row gap-16" style="min-width:0">
            <div class="icon-chip lg">${icon("play")}</div>
            <div style="min-width:0">
              <div class="card-title">Tiếp tục bài đang làm</div>
              <div class="card-note">${esc(session?.label ?? "Bài đang làm")} · dừng ở câu ${(session?.idx ?? 0) + 1}/${session?.qNums.length ?? "?"}${
                session?.remaining != null ? ` · còn ${Math.ceil(session.remaining / 60)} phút` : ""
              }</div>
            </div>
          </div>
          <div class="row gap-8 wrap">
            <button class="btn btn-ghost btn-sm" data-action="dropSession">${icon("trash")}Bỏ bài này</button>
            <button class="btn btn-accent" data-action="resume">${icon("arrowRight")}Làm tiếp</button>
          </div>
        </div>
      </div>`
    : "";

  const cardHtml = (c: { action: string; iconName: string; title: string; text: string; meta: string[]; disabled: boolean }) =>
    `<button class="mode-card" data-action="${c.action}" ${c.disabled ? "disabled" : ""}>
      <div class="icon-chip">${icon(c.iconName)}</div>
      <h3>${esc(c.title)}</h3>
      <p>${esc(c.text)}</p>
      <div class="mode-meta">${c.meta.map((x) => `<span class="badge badge-outline">${esc(x)}</span>`).join("")}</div>
    </button>`;

  const examStage = m.stages[0];
  const examCount = examStage?.questionCount ?? 65;
  const examMinutes = examStage?.durationMinutes ?? m.examMinutes;

  const mainModes = [
    {
      action: "browse",
      iconName: "book",
      title: "Duyệt câu hỏi",
      text: `Xem lần lượt ${formatNumber(bank.total)} câu kèm đáp án đúng, đối chiếu bản tiếng Anh và tiếng Nhật.`,
      meta: [`${formatNumber(bank.total)} câu`, "Có sẵn đáp án"],
      disabled: bank.total === 0,
    },
    {
      action: "practice",
      iconName: "zap",
      title: "Luyện tập",
      text: "Chọn số câu và làm theo nhịp của bạn — mỗi câu chấm ngay để biết sai ở đâu.",
      meta: ["Chấm từng câu", "Không giới hạn giờ"],
      disabled: bank.answerable === 0,
    },
    {
      action: "exam",
      iconName: "trophy",
      title: "Thi thử",
      text: `${examCount} câu trong ${examMinutes} phút, đồng hồ đếm ngược và bảng số câu đúng như phòng thi.`,
      meta: [`${examCount} câu · ${examMinutes} phút`, `Ngưỡng đậu ${passPct()}%`],
      disabled: bank.answerable === 0,
    },
  ]
    .map(cardHtml)
    .join("");

  const reviewModes = [
    {
      action: "flashcards",
      iconName: "refresh",
      title: "Thẻ ghi nhớ (SM-2)",
      text: "Học theo phương pháp lặp lại ngắt quãng — hệ thống tự tính thời điểm cần ôn lại tối ưu.",
      meta: ["Lặp ngắt quãng", "4 mức ghi nhớ"],
      disabled: false,
    },
    {
      action: "lessons",
      iconName: "bookOpen",
      title: "Bài giảng lý thuyết",
      text: "Tóm lược lý thuyết cốt lõi và các kiến thức quan trọng nhất trước khi vào làm đề.",
      meta: ["Lý thuyết nền tảng", "Markdown & LaTeX"],
      disabled: false,
    },
    {
      action: "wrong",
      iconName: "xCircle",
      title: "Luyện câu sai",
      text: wrong.length
        ? `Bạn đang có ${wrong.length} câu từng trả lời sai. Làm đúng lại là câu tự rời khỏi danh sách.`
        : "Chưa có câu sai nào được ghi nhận — làm một bài luyện tập để bắt đầu gom.",
      meta: [`${wrong.length} câu`],
      disabled: wrong.length === 0,
    },
    {
      action: "saved",
      iconName: "bookmark",
      title: "Câu đã lưu",
      text: saved.length
        ? `${saved.length} câu bạn đã đánh dấu để xem lại.`
        : "Bấm biểu tượng cờ lưu ở mỗi câu để gom những câu bạn muốn ôn kỹ.",
      meta: [`${saved.length} câu`],
      disabled: saved.length === 0,
    },
  ]
    .map(cardHtml)
    .join("");

  const historyCard = attempts.length
    ? `<div class="card card-pad">
        <div class="card-head">
          <div>
            <div class="card-title">Lần làm bài gần đây</div>
            <div class="card-note">${stats.attempts} lần · điểm cao nhất ${stats.bestPct}%</div>
          </div>
          <button class="btn btn-ghost btn-sm" data-action="go" data-arg="/tien-trinh">Tất cả${icon("chevronRight")}</button>
        </div>
        <div class="list">
          ${attempts
            .map(
              (a) => `<div class="list-row">
                <div class="icon-chip ${a.passed ? "good" : "bad"}">${icon(a.passed ? "trophy" : "target")}</div>
                <div class="list-main">
                  <div class="list-title">${esc(a.label)}</div>
                  <div class="list-sub">${esc(formatDateTime(a.at))} · ${esc(formatDuration(a.durationSec))}</div>
                </div>
                <div class="list-side">
                  <div style="text-align:right">
                    <div class="fw-700 nums">${a.pct}%</div>
                    <div class="text-xs text-muted nums">${a.correct}/${a.total}</div>
                  </div>
                </div>
              </div>`
            )
            .join("")}
        </div>
      </div>`
    : `<div class="card card-pad">
        <div class="card-head"><div class="card-title">Lần làm bài gần đây</div></div>
        <p class="card-note">Chưa có lần làm bài nào. Thử chế độ Luyện tập 10 câu để khởi động.</p>
      </div>`;

  const content = `
    <div class="page-head">
      <div class="page">
        ${crumbs([
          { label: "Trang chủ", action: "go", arg: "/" },
          { label: "Chứng chỉ", action: "go", arg: "/chung-chi" },
          { label: m.shortName },
        ])}
        <div class="page-head-main">
          <div class="page-head-text">
            <div class="row gap-8 wrap mb-12">
              <span class="badge badge-accent">${icon(m.iconName)}${esc(m.shortLabel)}</span>
              <span class="badge badge-good">${icon("checkCircle")}${formatNumber(bank.withAnswer)} câu có đáp án</span>
              ${m.bilingual ? `<span class="badge badge-outline">${icon("language")}Song ngữ EN · 日本語</span>` : ""}
            </div>
            <h1>${esc(m.fullName)}</h1>
            <p class="lead">${esc(m.description)}</p>
          </div>
          ${stats.attempts ? `<div class="page-head-side">${ring({ pct: stats.bestPct, size: 108, stroke: 10, label: "điểm cao nhất" })}</div>` : ""}
        </div>
      </div>
    </div>

    <div class="page page-body">
      ${resumeCard}

      <div class="stat-grid mb-32">
        <div class="stat-box"><div class="k">${icon("list")}Ngân hàng câu hỏi</div><div class="v">${formatNumber(bank.total)}</div></div>
        <div class="stat-box"><div class="k">${icon("checkCircle")}Có đáp án tham khảo</div><div class="v">${formatNumber(bank.withAnswer)}</div></div>
        <div class="stat-box"><div class="k">${icon("layers")}Câu chọn nhiều đáp án</div><div class="v">${formatNumber(bank.multiTotal)}</div></div>
        <div class="stat-box"><div class="k">${icon("target")}Bạn đã làm đúng</div><div class="v">${stats.masteredCount}<small> câu</small></div></div>
      </div>

      <h2 class="card-title mb-16" style="font-size:20px">Chọn cách ôn</h2>
      <div class="mode-grid mb-24" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">${mainModes}</div>

      <h2 class="card-title mb-16" style="font-size:20px">Ôn lại những gì còn yếu</h2>
      <div class="mode-grid mb-32" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">${reviewModes}</div>

      <div class="feature-grid">
        ${historyCard}
        <div class="card card-pad">
          <div class="card-head"><div class="card-title">Cấu trúc đề thi thật</div></div>
          <div class="facts">
            ${m.facts.map((f) => `<div class="fact-row"><span>${esc(f.label)}</span><b>${esc(f.value)}</b></div>`).join("")}
          </div>
        </div>
      </div>

      ${
        bank.total - bank.withAnswer > 0
          ? `<div class="mt-24">${notice(
              `<strong>${formatNumber(bank.total - bank.withAnswer)} câu chưa có dữ liệu đáp án</strong> trong tài liệu nguồn nên không đưa vào bài làm được — bạn vẫn đọc được chúng ở chế độ Duyệt câu hỏi.`,
              "info",
              "info"
            )}</div>`
          : ""
      }
    </div>`;

  root.innerHTML = renderPage({ active: "certs", content });

  bindShell(root, "certs", {
    browse: () => navigate("/aws/browse"),
    flashcards: () => navigate("/on-tap/aws"),
    lessons: () => navigate("/bai-hoc/aws"),
    practice: () => { state.mode = "practice"; state.source = "all"; save({ mode: "practice", source: "all" }); navigate("/aws/thiet-lap"); },
    exam: () => {
      // Không chia mã đề như JLPT — thi thử phải mặc định trộn thứ tự câu,
      // nếu không học viên làm vài lần là thuộc "câu 3 luôn là B".
      state.mode = "exam"; state.source = "all"; state.count = examCount; state.order = "random";
      save({ mode: "exam", source: "all", count: examCount, order: "random" });
      navigate("/aws/thiet-lap");
    },
    wrong: () => { state.mode = "practice"; state.source = "wrong"; save({ mode: "practice", source: "wrong" }); navigate("/aws/thiet-lap"); },
    saved: () => { state.mode = "practice"; state.source = "saved"; save({ mode: "practice", source: "saved" }); navigate("/aws/thiet-lap"); },
    resume: async () => {
      if (live) { continueLiveExam(); return; }
      const s = loadSession(MODULE_ID);
      if (!s) return;
      toast("Đang tải lại bài làm...", "default", 1500);
      try {
        await ensureQuestions();
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), "bad");
        return;
      }
      const ok = resumeExam(s, {
        brandLabel: brandLabel(),
        exitPath: "/aws",
        passPct: passPct(),
        bilingual: !!m.bilingual,
        pool: questions,
      });
      if (!ok) { clearSession(MODULE_ID); toast("Không khôi phục được bài cũ.", "bad"); renderHome(root); }
    },
    dropSession: () => { clearSession(MODULE_ID); toast("Đã bỏ bài làm dở."); renderHome(root); },
  });
}

// ------------------------------------------------------------ duyệt câu hỏi

function filteredBrowse(): MultipleChoiceQuestion[] {
  const q = state.browseQuery.trim().toLowerCase();
  const saved = getBookmarks(MODULE_ID);
  return questions.filter((item) => {
    if (state.browseFilter === "answered" && !item.answer) return false;
    if (state.browseFilter === "multi" && !item.multi) return false;
    if (state.browseFilter === "saved" && !saved.includes(item.n)) return false;
    if (!q) return true;
    if (String(item.n) === q) return true;
    return `${item.en} ${item.ja}`.toLowerCase().includes(q);
  });
}

function renderBrowse(root: HTMLElement): void {
  setModuleTheme(MODULE_ID);
  hydrate();
  const m = meta();
  const total = questions.length;
  state.browseIdx = Math.min(Math.max(state.browseIdx, 0), Math.max(total - 1, 0));

  const render = () => {
    const list = filteredBrowse();
    const current = questions[state.browseIdx];
    if (!current) {
      navigate("/aws");
      return;
    }
    const capped = list.slice(0, 150);

    const sideItems = capped
      .map(
        (item) => `<button class="browse-item ${item.n === current.n ? "is-current" : ""}" data-action="pickQ" data-arg="${item.n}">
          <span class="browse-item-n">#${item.n}</span>
          <span class="browse-item-t">${esc(stem(item, state.lang).slice(0, 110))}</span>
          ${isBookmarked(MODULE_ID, item.n) ? icon("bookmark") : ""}
        </button>`
      )
      .join("");

    const answerLetters = (current.answer ?? "").split("");
    const opts = current.options.length
      ? current.options
          .map((o) => {
            const isRight = state.showAnswer && answerLetters.includes(o.label);
            return `<div class="opt ${isRight ? "is-right" : state.showAnswer && answerLetters.length ? "is-dim" : ""}">
              <span class="opt-mark">${esc(o.label)}</span>
              <span class="opt-text">${highlight(optText(o, state.lang), state.browseQuery)}</span>
              ${isRight ? `<span class="opt-flag">${icon("check")}Đáp án đúng</span>` : ""}
            </div>`;
          })
          .join("")
      : `<div class="notice warn">${icon("alert")}<div>Tài liệu nguồn thiếu phần phương án của câu này.</div></div>`;

    const filters: [typeof state.browseFilter, string][] = [
      ["all", "Tất cả"],
      ["answered", "Có đáp án"],
      ["multi", "Chọn nhiều"],
      ["saved", `Đã lưu (${getBookmarks(MODULE_ID).length})`],
    ];

    const content = `
      <div class="page-head">
        <div class="page">
          ${crumbs([
            { label: "Trang chủ", action: "go", arg: "/" },
            { label: m?.shortName ?? "AWS", action: "go", arg: "/aws" },
            { label: "Duyệt câu hỏi" },
          ])}
          <div class="page-head-main">
            <div class="page-head-text">
              <h1>Duyệt câu hỏi</h1>
              <p class="lead">Đọc đề kèm đáp án đúng, chuyển ngôn ngữ để đối chiếu thuật ngữ, và lưu lại những câu bạn muốn ôn kỹ.</p>
            </div>
            <div class="page-head-side">
              ${
                m?.bilingual
                  ? `<div class="segmented">
                      <button class="${state.lang === "en" ? "is-active" : ""}" data-action="lang" data-arg="en">English</button>
                      <button class="${state.lang === "ja" ? "is-active" : ""}" data-action="lang" data-arg="ja">日本語</button>
                    </div>`
                  : ""
              }
              <button class="btn btn-outline btn-sm" data-action="toggleAnswer">${icon(state.showAnswer ? "eyeOff" : "eye")}${state.showAnswer ? "Ẩn đáp án" : "Hiện đáp án"}</button>
            </div>
          </div>
        </div>
      </div>

      <div class="page browse-layout">
        <aside class="browse-side">
          <div class="card card-pad" style="padding:16px">
            <div class="search-box sm mb-12">
              ${icon("search")}
              <input class="input" type="search" placeholder="Tìm theo từ khoá hoặc số câu" value="${esc(state.browseQuery)}" data-input="q" autocomplete="off">
            </div>
            <div class="pill-group mb-12">
              ${filters
                .map(([k, label]) => `<button class="pill ${state.browseFilter === k ? "is-active accent" : ""}" style="height:32px;padding:0 12px;font-size:12.5px" data-action="bfilter" data-arg="${k}">${label}</button>`)
                .join("")}
            </div>
            <div class="text-xs text-muted mb-8">${formatNumber(list.length)} câu khớp${list.length > capped.length ? ` · hiện ${capped.length} câu đầu` : ""}</div>
            <div class="browse-list">${sideItems || `<p class="card-note">Không có câu nào khớp.</p>`}</div>
          </div>
        </aside>

        <div>
          <div class="q-card">
            <div class="q-top">
              <div class="q-tags">
                <span class="q-num">${icon("list")}Câu #${current.n}</span>
                ${current.multi ? `<span class="badge badge-info">${icon("check")}Chọn nhiều đáp án</span>` : ""}
                ${current.answer ? `<span class="badge badge-good">${icon("checkCircle")}Đáp án: ${esc(answerLetters.join(", "))}</span>` : `<span class="badge badge-warn">${icon("alert")}Chưa có đáp án</span>`}
              </div>
              <div class="q-tools">
                <button class="tool-btn ${isBookmarked(MODULE_ID, current.n) ? "is-on mark" : ""}" data-action="bookmark" title="Lưu câu này">${icon("bookmark")}</button>
              </div>
            </div>
            <div class="q-stem">${highlight(stem(current, state.lang), state.browseQuery)}</div>
            ${m?.bilingual ? `<div class="q-stem-alt">${esc(stem(current, state.lang === "en" ? "ja" : "en"))}</div>` : ""}
            <div class="opt-list">${opts}</div>
            <div class="q-nav">
              <button class="btn btn-outline" data-action="prev" ${state.browseIdx === 0 ? "disabled" : ""}>${icon("arrowLeft")}Câu trước</button>
              <span class="q-nav-hint hide-sm">Câu ${state.browseIdx + 1} / ${formatNumber(total)}</span>
              <button class="btn btn-accent" data-action="next" ${state.browseIdx >= total - 1 ? "disabled" : ""}>Câu tiếp${icon("arrowRight")}</button>
            </div>
          </div>
        </div>
      </div>`;

    root.innerHTML = renderPage({ active: "certs", content });

    bindShell(root, "certs", {
      lang: (v) => { state.lang = v === "ja" ? "ja" : "en"; save({ lang: state.lang }); render(); },
      toggleAnswer: () => { state.showAnswer = !state.showAnswer; render(); },
      bfilter: (v) => { state.browseFilter = (v as typeof state.browseFilter) ?? "all"; render(); },
      pickQ: (n) => {
        const idx = questions.findIndex((x) => x.n === Number(n));
        if (idx >= 0) { state.browseIdx = idx; save({ browseIdx: idx }); render(); window.scrollTo({ top: 0, behavior: "smooth" }); }
      },
      bookmark: () => {
        const on = toggleBookmark(MODULE_ID, questions[state.browseIdx].n);
        toast(on ? "Đã lưu câu hỏi." : "Đã bỏ lưu.", on ? "good" : "default", 1500);
        render();
      },
      prev: () => { state.browseIdx = Math.max(0, state.browseIdx - 1); save({ browseIdx: state.browseIdx }); render(); window.scrollTo({ top: 0, behavior: "smooth" }); },
      next: () => { state.browseIdx = Math.min(total - 1, state.browseIdx + 1); save({ browseIdx: state.browseIdx }); render(); window.scrollTo({ top: 0, behavior: "smooth" }); },
    });

    bindInputs(root, {
      q: (value, el) => {
        state.browseQuery = value;
        render();
        const next = root.querySelector<HTMLInputElement>('[data-input="q"]');
        if (next) { next.focus(); next.setSelectionRange(el.selectionStart ?? value.length, el.selectionEnd ?? value.length); }
      },
    });
  };

  render();

}

// ------------------------------------------------------------ thiết lập bài làm

function sourceQuestions(): MultipleChoiceQuestion[] {
  if (state.source === "wrong") {
    const wrong = new Set(getWrong(MODULE_ID));
    return pool().filter((q) => wrong.has(q.n));
  }
  if (state.source === "saved") {
    const saved = new Set(getBookmarks(MODULE_ID));
    return pool().filter((q) => saved.has(q.n));
  }
  return pool();
}

function renderSetup(root: HTMLElement): void {
  setModuleTheme(MODULE_ID);
  hydrate();
  const m = meta();
  if (!m) {
    navigate("/chung-chi");
    return;
  }
  const bank = getBankStats(MODULE_ID);

  const render = () => {
    // Số câu khả dụng ước lượng từ số liệu tổng hợp, khỏi phải tải cả ngân hàng
    // câu hỏi chỉ để hiện một con số.
    const counts: Record<typeof state.source, number> = {
      all: bank.answerable,
      wrong: getWrong(MODULE_ID).length,
      saved: getBookmarks(MODULE_ID).length,
    };
    const maxCount = counts[state.source];
    const countOptions: (number | "all")[] = [10, 20, 50, 65, 100, "all"];
    const resolvedCount = state.count === "all" ? maxCount : Math.min(state.count, maxCount);
    const minutes = state.mode === "exam" ? Math.max(5, Math.round(resolvedCount * 2)) : 0;

    const sources: [typeof state.source, string, string][] = [
      ["all", "Toàn bộ ngân hàng", "Mọi câu có đáp án tham khảo."],
      ["wrong", "Câu tôi từng làm sai", "Luyện lại cho tới khi làm đúng."],
      ["saved", "Câu tôi đã lưu", "Những câu bạn tự đánh dấu."],
    ];

    const content = `
      <div class="page-head">
        <div class="page">
          ${crumbs([
            { label: "Trang chủ", action: "go", arg: "/" },
            { label: m.shortName, action: "go", arg: "/aws" },
            { label: "Thiết lập bài làm" },
          ])}
          <div class="page-head-main">
            <div class="page-head-text">
              <h1>Thiết lập bài làm</h1>
              <p class="lead">Chọn cách chấm, nguồn câu hỏi và số câu. Bạn đổi lại được bất cứ lúc nào ở lần làm bài sau.</p>
            </div>
          </div>
        </div>
      </div>

      <div class="page page-body">
        <div class="feature-grid" style="grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);align-items:start">
          <div class="card card-pad">
            <div class="field">
              <span class="field-label">Cách chấm</span>
              <div class="choice-grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">
                <button class="choice-card ${state.mode === "practice" ? "is-active" : ""}" data-action="mode" data-arg="practice">
                  <span class="ck"></span>
                  <span><b>Luyện tập</b><span>Chấm ngay sau mỗi câu, không giới hạn thời gian.</span></span>
                </button>
                <button class="choice-card ${state.mode === "exam" ? "is-active" : ""}" data-action="mode" data-arg="exam">
                  <span class="ck"></span>
                  <span><b>Thi thử</b><span>Có đồng hồ đếm ngược, chấm sau khi nộp toàn bài.</span></span>
                </button>
              </div>
            </div>

            <div class="field">
              <span class="field-label">Nguồn câu hỏi</span>
              <div class="choice-grid">
                ${sources
                  .map(
                    ([key, title, desc]) => `<button class="choice-card ${state.source === key ? "is-active" : ""}" data-action="source" data-arg="${key}" ${counts[key] === 0 && key !== "all" ? "disabled" : ""}>
                      <span class="ck"></span>
                      <span class="grow"><b>${esc(title)}</b><span>${esc(desc)}</span></span>
                      <span class="badge ${counts[key] ? "badge-accent" : "badge-outline"}">${formatNumber(counts[key])} câu</span>
                    </button>`
                  )
                  .join("")}
              </div>
            </div>

            <div class="field">
              <span class="field-label">Số câu (còn ${formatNumber(maxCount)} câu khả dụng)</span>
              <div class="pill-group">
                ${countOptions
                  .map((c) => {
                    const disabled = c !== "all" && (c as number) > maxCount;
                    const label = c === "all" ? `Tất cả (${formatNumber(maxCount)})` : String(c);
                    return `<button class="pill ${state.count === c ? "is-active accent" : ""}" data-action="count" data-arg="${c}" ${disabled ? "disabled" : ""}>${label}</button>`;
                  })
                  .join("")}
              </div>
            </div>

            <div class="field" style="margin-bottom:0">
              <span class="field-label">Thứ tự câu hỏi</span>
              <div class="pill-group">
                <button class="pill ${state.order === "sequential" ? "is-active accent" : ""}" data-action="order" data-arg="sequential">${icon("list")}Theo số câu</button>
                <button class="pill ${state.order === "random" ? "is-active accent" : ""}" data-action="order" data-arg="random">${icon("shuffle")}Ngẫu nhiên</button>
              </div>
            </div>
          </div>

          <div class="card card-pad" style="position:sticky;top:88px">
            <div class="card-head"><div class="card-title">Tóm tắt bài làm</div></div>
            <div class="facts mb-20">
              <div class="fact-row"><span>Chế độ</span><b>${state.mode === "exam" ? "Thi thử có giờ" : "Luyện tập chấm ngay"}</b></div>
              <div class="fact-row"><span>Số câu</span><b>${formatNumber(resolvedCount)} câu</b></div>
              <div class="fact-row"><span>Thời gian</span><b>${state.mode === "exam" ? `${minutes} phút` : "Không giới hạn"}</b></div>
              <div class="fact-row"><span>Thứ tự</span><b>${state.order === "random" ? "Ngẫu nhiên" : "Theo số câu"}</b></div>
              <div class="fact-row"><span>Ngưỡng đậu</span><b>${passPct()}%</b></div>
            </div>
            ${
              maxCount === 0
                ? notice("Nguồn câu hỏi này đang trống. Chọn nguồn khác để bắt đầu.", "warn", "alert")
                : `<button class="btn btn-primary btn-lg btn-block" data-action="start" ${state.starting ? "disabled" : ""}>
                    ${state.starting ? '<span class="spinner"></span>Đang tải đề...' : `${icon("play")}Bắt đầu làm bài`}
                  </button>`
            }
            <p class="field-hint" style="text-align:center">Bài làm dở sẽ được lưu tự động.</p>
          </div>
        </div>
      </div>`;

    root.innerHTML = renderPage({ active: "certs", content });

    bindShell(root, "certs", {
      mode: (v) => { state.mode = v === "exam" ? "exam" : "practice"; save({ mode: state.mode, count: state.count }); render(); },
      source: (v) => { state.source = (v as typeof state.source) ?? "all"; save({ source: state.source }); render(); },
      count: (v) => { state.count = v === "all" ? "all" : Number(v); save({ count: state.count }); render(); },
      order: (v) => { state.order = v === "random" ? "random" : "sequential"; save({ order: state.order }); render(); },
      start: async () => {
        if (state.starting) return;
        state.starting = true;
        render();
        try {
          await ensureQuestions();
        } catch (err) {
          state.starting = false;
          toast(err instanceof Error ? err.message : String(err), "bad", 4000);
          render();
          return;
        }
        state.starting = false;

        let list = sourceQuestions().slice();
        if (list.length === 0) {
          toast("Nguồn câu hỏi này đang trống.", "bad");
          render();
          return;
        }
        if (state.order === "random") {
          for (let i = list.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [list[i], list[j]] = [list[j], list[i]];
          }
        }
        const count = state.count === "all" ? list.length : Math.min(state.count, list.length);
        list = list.slice(0, count);
        // Tráo vị trí đáp án của từng câu — chặn kiểu học tủ "câu này luôn chọn ô thứ 2"
        // dù đã trộn thứ tự câu. Luôn làm, không phụ thuộc state.order.
        list = shuffleAllMcOptions(list);

        const label =
          state.source === "wrong" ? "Luyện câu sai" : state.source === "saved" ? "Câu đã lưu" : state.mode === "exam" ? "Thi thử" : "Luyện tập";

        startExam({
          moduleId: MODULE_ID,
          levelId: "",
          stageId: state.mode === "exam" ? "exam" : "practice",
          label,
          brandLabel: brandLabel(),
          questions: list,
          mode: state.mode,
          durationSec: state.mode === "exam" ? Math.max(5, Math.round(list.length * 2)) * 60 : null,
          bilingual: !!m.bilingual,
          passPct: passPct(),
          exitPath: "/aws",
        });
      },
    });
  };

  render();
}

export function registerAwsRoutes(): void {
  registerRoute("/aws", (root) => renderHome(root));
  registerRoute("/aws/browse", (root) => {
    void withData(root, ensureQuestions, () => renderBrowse(root), "Đang tải ngân hàng câu hỏi...");
  });
  registerRoute("/aws/thiet-lap", (root) => renderSetup(root));
}
