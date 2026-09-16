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
import { esc } from "../../components/bindActions";
import { toast } from "../../components/toast";
import { crumbs, notice, ring, formatDuration, formatDateTime, formatNumber } from "../../components/ui";
import { loadModuleState, saveModuleState } from "../../state/storage";
import { currentUserId } from "../../state/auth";
import { getModuleStats, getAttempts, getBookmarks, getWrong } from "../../state/progress";
import { loadSession, clearSession } from "../../state/session";
import { startExam, resumeExam, hasLiveExam, continueLiveExam } from "../shared/mcExam";
import { loadMcQuestions } from "../../data/questions";
import { shuffleAllMcOptions } from "../../lib/shuffle";
import { getModule, getBankStats } from "../../data/catalog";

const MODULE_ID = "aws";

interface StoredState {
  lang: Lang;
  mode: "practice" | "exam";
  count: number | "all";
  order: "sequential" | "random";
  source: "all" | "wrong" | "saved";
}

const state = {
  lang: "en" as Lang,
  mode: "practice" as "practice" | "exam",
  count: 20 as number | "all",
  order: "sequential" as "sequential" | "random",
  source: "all" as "all" | "wrong" | "saved",
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
      <div class="mode-grid mb-24">${mainModes}</div>

      <h2 class="card-title mb-16" style="font-size:20px">Ôn lại những gì còn yếu</h2>
      <div class="mode-grid mb-32">${reviewModes}</div>

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
              `<strong>${formatNumber(bank.total - bank.withAnswer)} câu chưa có dữ liệu đáp án</strong> trong tài liệu nguồn nên không đưa vào bài làm được.`,
              "info",
              "info"
            )}</div>`
          : ""
      }
    </div>`;

  root.innerHTML = renderPage({ active: "certs", content });

  bindShell(root, "certs", {
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
        <div class="setup-layout">
          <div class="card card-pad">
            <div class="field">
              <span class="field-label">Cách chấm</span>
              <div class="choice-grid" style="grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))">
                <button class="choice-card ${state.mode === "practice" ? "is-active" : ""}" data-action="mode" data-arg="practice">
                  <span class="ck"></span>
                  <span class="grow"><b>Luyện tập</b><span>Chấm ngay sau mỗi câu, không giới hạn thời gian.</span></span>
                </button>
                <button class="choice-card ${state.mode === "exam" ? "is-active" : ""}" data-action="mode" data-arg="exam">
                  <span class="ck"></span>
                  <span class="grow"><b>Thi thử</b><span>Có đồng hồ đếm ngược, chấm sau khi nộp toàn bài.</span></span>
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
  registerRoute("/aws/thiet-lap", (root) => renderSetup(root));
}
