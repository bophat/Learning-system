/**
 * Bộ máy làm bài trắc nghiệm dùng chung cho mọi chứng chỉ.
 *
 * Cùng một màn hình phục vụ hai kiểu:
 *  - "practice" (luyện tập): chấm ngay từng câu, xem đúng/sai tại chỗ.
 *  - "exam" (thi thử): có đồng hồ đếm ngược, tự do nhảy câu, chấm sau khi nộp
 *    toàn bài — đúng cách các kỳ thi thật (AWS, buổi sáng AP) vận hành.
 *
 * Bài đang làm dở được lưu xuống localStorage nên đóng tab/tải lại trang vẫn
 * tiếp tục được. Chỉ chạy một bài tại một thời điểm nên trạng thái để ở module
 * scope, giống các module khác trong dự án.
 */

import type { Lang, MultipleChoiceQuestion } from "../../types/exam";
import { registerRoute, navigate } from "../../router";
import { bindActions, esc } from "../../components/bindActions";
import { icon } from "../../components/icons";
import { renderPage, bindShell, setModuleTheme } from "../../components/appShell";
import { confirmDialog, promptDialog } from "../../components/modal";
import { toast } from "../../components/toast";
import { ring, statBox, formatClock, formatDuration, formatDateTime, percent, crumbs, renderMarkdown } from "../../components/ui";
import { addAttempt, recordAnswer, flushAnswers, isBookmarked, toggleBookmark, getModuleStats, getWrong, getAttempts } from "../../state/progress";
import { logResponse, flushResponses } from "../../state/responses";
import { afterExamBookkeeping } from "../../state/habits";
import { saveSession, clearSession, flushSessions, type SavedSession } from "../../state/session";
import { hasNote, getNote, saveNote, loadNotes, loadComments, postComment } from "../../state/social";

export type ExamMode = "practice" | "exam";

export interface ExamLaunch {
  moduleId: string;
  stageId: string;
  /** Nhãn chế độ, ví dụ "Thi thử" / "Luyện tập" / "Buổi sáng". */
  label: string;
  /** Tên chứng chỉ hiện trên thanh trạng thái. */
  brandLabel: string;
  questions: MultipleChoiceQuestion[];
  mode: ExamMode;
  durationSec: number | null;
  bilingual: boolean;
  passPct: number;
  /** Route quay về khi thoát bài. */
  exitPath: string;
}

interface PerQuestion {
  n: number;
  picked: string[];
  answer: string;
  isCorrect: boolean;
  skipped: boolean;
}

interface ExamResult {
  correct: number;
  total: number;
  answered: number;
  pct: number;
  passed: boolean;
  durationSec: number;
  perQuestion: PerQuestion[];
}

interface Runtime extends ExamLaunch {
  idx: number;
  answers: Record<number, string[]>;
  checked: Set<number>;
  flags: Set<number>;
  lang: Lang;
  remaining: number | null;
  elapsed: number;
  startedAt: number;
  result: ExamResult | null;
  reviewFilter: "all" | "wrong" | "flagged";
  expanded: Set<number>;
  showAlt: boolean;
  paletteOpen: boolean;
  /** Mốc lúc câu hiện tại được hiện lên, để đo thời gian dừng ở mỗi câu. */
  shownAt: number;
  /** Tổng thời gian đã dừng ở từng câu, tính bằng mili giây. */
  timeSpent: Record<number, number>;
}

let rt: Runtime | null = null;

const EXAM_PATH = "/lam-bai";
const RESULT_PATH = "/ket-qua";

// ---------------------------------------------------------------- khởi động

export function startExam(launch: ExamLaunch): void {
  rt = {
    ...launch,
    idx: 0,
    answers: {},
    checked: new Set(),
    flags: new Set(),
    lang: "en",
    remaining: launch.durationSec,
    elapsed: 0,
    startedAt: Date.now(),
    result: null,
    reviewFilter: "all",
    expanded: new Set(),
    showAlt: false,
    paletteOpen: false,
    shownAt: Date.now(),
    timeSpent: {},
  };
  persist();
  navigate(EXAM_PATH);
}

export interface ResumeContext {
  brandLabel: string;
  exitPath: string;
  passPct: number;
  bilingual: boolean;
  pool: MultipleChoiceQuestion[];
}

/** Khôi phục bài đang làm dở từ localStorage. Trả về false nếu dữ liệu không còn khớp. */
export function resumeExam(saved: SavedSession, ctx: ResumeContext): boolean {
  const byNum = new Map(ctx.pool.map((q) => [q.n, q]));
  const questions = saved.qNums.map((n) => byNum.get(n)).filter((q): q is MultipleChoiceQuestion => !!q);
  if (questions.length !== saved.qNums.length || questions.length === 0) return false;

  const answers: Record<number, string[]> = {};
  for (const [k, v] of Object.entries(saved.answers)) answers[Number(k)] = v;

  rt = {
    moduleId: saved.moduleId,
    stageId: saved.stageId,
    label: saved.label,
    brandLabel: ctx.brandLabel,
    questions,
    mode: saved.mode,
    durationSec: saved.durationSec,
    bilingual: ctx.bilingual,
    passPct: ctx.passPct,
    exitPath: ctx.exitPath,
    idx: Math.min(saved.idx, questions.length - 1),
    answers,
    checked: new Set(saved.checked ?? []),
    flags: new Set(saved.flags ?? []),
    lang: saved.lang === "ja" ? "ja" : "en",
    remaining: saved.remaining,
    elapsed: saved.elapsed ?? 0,
    startedAt: Date.now() - (saved.elapsed ?? 0) * 1000,
    result: null,
    reviewFilter: "all",
    expanded: new Set(),
    showAlt: false,
    paletteOpen: false,
    shownAt: Date.now(),
    timeSpent: {},
  };
  navigate(EXAM_PATH);
  return true;
}

function persist(): void {
  if (!rt || rt.result) return;
  const answers: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(rt.answers)) answers[k] = v;
  const s: SavedSession = {
    moduleId: rt.moduleId,
    stageId: rt.stageId,
    label: rt.label,
    mode: rt.mode,
    qNums: rt.questions.map((q) => q.n),
    idx: rt.idx,
    answers,
    checked: [...rt.checked],
    flags: [...rt.flags],
    lang: rt.lang,
    remaining: rt.remaining,
    durationSec: rt.durationSec,
    startedAt: rt.startedAt,
    elapsed: rt.elapsed,
    savedAt: Date.now(),
  };
  saveSession(s);
}

// ---------------------------------------------------------------- chấm điểm

/** Cộng thời gian vừa dừng ở câu hiện tại vào sổ, rồi khởi động lại đồng hồ. */
function accrueTime(): void {
  const r = rt;
  if (!r) return;
  const q = r.questions[r.idx];
  if (!q) return;
  const now = Date.now();
  r.timeSpent[q.n] = (r.timeSpent[q.n] ?? 0) + Math.max(0, now - r.shownAt);
  r.shownAt = now;
}

function normalize(letters: string[]): string {
  return [...letters].sort().join("");
}

function grade(): ExamResult {
  const r = rt!;
  const perQuestion: PerQuestion[] = r.questions.map((q) => {
    const picked = r.answers[q.n] ?? [];
    const answer = q.answer ?? "";
    const isCorrect = picked.length > 0 && normalize(picked) === normalize(answer.split(""));
    return { n: q.n, picked, answer, isCorrect, skipped: picked.length === 0 };
  });
  const correct = perQuestion.filter((p) => p.isCorrect).length;
  const answered = perQuestion.filter((p) => !p.skipped).length;
  const total = perQuestion.length;
  const pct = percent(correct, total);
  return {
    correct,
    total,
    answered,
    pct,
    passed: pct >= r.passPct,
    durationSec: r.elapsed,
    perQuestion,
  };
}

function finish(auto = false): void {
  const r = rt;
  if (!r || r.result) return;
  accrueTime();
  const result = grade();
  r.result = result;

  // Câu bỏ trống cũng tính là chưa nắm được, nên vẫn vào ngân hàng câu sai.
  result.perQuestion.forEach((p) => recordAnswer(r.moduleId, p.n, p.isCorrect));
  flushAnswers();

  // Chế độ thi thử chấm một lượt ở cuối nên tới đây mới ghi được từng lượt trả
  // lời; chế độ luyện tập đã ghi ngay lúc bấm Kiểm tra. Câu bỏ trống không ghi,
  // vì "không làm" khác với "làm sai" khi tính độ khó câu hỏi.
  if (r.mode === "exam") {
    for (const p of result.perQuestion) {
      if (p.skipped) continue;
      logResponse({
        moduleId: r.moduleId,
        stageId: r.stageId,
        questionN: p.n,
        chosen: normalize(p.picked),
        correct: p.isCorrect,
        timeMs: r.timeSpent[p.n],
        mode: "exam",
      });
    }
  }
  flushResponses();

  const attempt = addAttempt({
    moduleId: r.moduleId,
    stageId: r.stageId,
    label: `${r.label} · ${result.total} câu`,
    correct: result.correct,
    total: result.total,
    pct: result.pct,
    durationSec: result.durationSec,
    passed: result.passed,
  });

  // Cộng ngày học và xét huy hiệu ở nền, không chặn màn kết quả.
  const stats = getModuleStats(r.moduleId);
  void afterExamBookkeeping({
    moduleId: r.moduleId,
    passPct: r.passPct,
    mode: r.mode,
    total: result.total,
    durationSec: result.durationSec,
    bestPct: Math.max(stats.bestPct, attempt.pct),
    examAttempts: getAttempts(r.moduleId).filter((a) => a.stageId !== "practice").length,
    wrongCount: getWrong(r.moduleId).length,
  }).then((earned) => {
    if (earned.length) toast(`Nhận huy hiệu mới: ${earned.length} cái. Xem ở trang Tiến trình.`, "good", 4000);
  });

  clearSession(r.moduleId);
  navigate(RESULT_PATH);
  if (auto) toast("Hết giờ — bài thi đã được nộp tự động.", "bad", 3600);
}

// ---------------------------------------------------------------- màn làm bài

function currentQuestion(): MultipleChoiceQuestion {
  return rt!.questions[rt!.idx];
}

function stemOf(q: MultipleChoiceQuestion, lang: Lang): string {
  return lang === "ja" ? q.ja || q.en : q.en;
}

function optText(o: { en: string; ja: string }, lang: Lang): string {
  return lang === "ja" ? o.ja || o.en : o.en;
}

function timerClass(remaining: number | null): string {
  if (remaining === null) return "";
  if (remaining <= 60) return "is-low";
  if (remaining <= 300) return "is-warn";
  return "";
}

function renderExamBar(): string {
  const r = rt!;
  const done = Object.values(r.answers).filter((a) => a.length > 0).length;
  const pct = percent(done, r.questions.length);
  const timer =
    r.remaining !== null
      ? `<div class="timer ${timerClass(r.remaining)}" id="examTimer">${icon("clock")}<span>${formatClock(r.remaining)}</span></div>`
      : `<div class="timer" id="examTimer">${icon("clock")}<span>${formatClock(r.elapsed)}</span></div>`;

  const langToggle = r.bilingual
    ? `<div class="segmented hide-sm">
        <button class="${r.lang === "en" ? "is-active" : ""}" data-action="lang" data-arg="en">EN</button>
        <button class="${r.lang === "ja" ? "is-active" : ""}" data-action="lang" data-arg="ja">日本語</button>
      </div>`
    : "";

  const flagBadge = r.flags.size > 0
    ? `<span class="badge badge-warn hide-sm" title="Số câu đã đánh dấu xem lại">${icon("flag")}${r.flags.size} cờ</span>`
    : "";

  return `<div class="exam-bar">
    <div class="page exam-bar-inner">
      <button class="icon-btn" data-action="exit" title="Thoát bài làm" aria-label="Thoát">${icon("arrowLeft")}</button>
      <div class="exam-bar-title hide-sm">
        <b>${esc(r.label)}</b>
        <span>${esc(r.brandLabel)} · ${r.questions.length} câu</span>
      </div>
      <div class="exam-bar-mid">
        <div class="exam-bar-progress hide-sm">${`<div class="bar thin"><i style="width:${pct}%"></i></div>`}</div>
        <span class="exam-bar-count">${done}/${r.questions.length} câu</span>
        ${flagBadge}
      </div>
      ${langToggle}
      ${timer}
      <button class="btn btn-primary btn-sm" data-action="askSubmit">${icon("send")}<span class="hide-sm">Nộp bài</span></button>
    </div>
  </div>`;
}

function renderPalette(): string {
  const r = rt!;
  const cells = r.questions
    .map((q, i) => {
      const answered = (r.answers[q.n] ?? []).length > 0;
      const cls = [
        i === r.idx ? "is-current" : "",
        answered && i !== r.idx ? "is-done" : "",
        r.flags.has(q.n) ? "is-flagged" : "",
      ]
        .filter(Boolean)
        .join(" ");
      return `<button class="pnum ${cls}" data-action="goto" data-arg="${i}" title="Câu ${i + 1}">${i + 1}</button>`;
    })
    .join("");

  const done = Object.values(r.answers).filter((a) => a.length > 0).length;
  const firstUnansweredIdx = r.questions.findIndex((q) => !r.answers[q.n]?.length);
  const jumpUnansweredBtn = firstUnansweredIdx >= 0 && firstUnansweredIdx !== r.idx
    ? `<button class="btn btn-soft-accent btn-sm btn-block mt-8" data-action="goto" data-arg="${firstUnansweredIdx}">${icon("arrowRight")}Nhảy tới câu chưa làm (#${firstUnansweredIdx + 1})</button>`
    : "";

  return `<div class="card palette">
    <div class="palette-handle"></div>
    <div class="palette-head">
      <b>Danh sách câu hỏi</b>
      <span class="text-xs text-muted nums">${done}/${r.questions.length}</span>
    </div>
    <div class="palette-grid">${cells}</div>
    <div class="palette-legend">
      <div class="legend-row"><span class="legend-key current"></span>Câu đang làm</div>
      <div class="legend-row"><span class="legend-key done"></span>Đã chọn đáp án</div>
      <div class="legend-row"><span class="legend-key flag"></span>Đã cắm cờ xem lại</div>
    </div>
    ${jumpUnansweredBtn}
    <button class="btn btn-outline btn-sm btn-block mt-12" data-action="askSubmit">${icon("send")}Nộp bài</button>
  </div>`;
}

function renderQuestionCard(): string {
  const r = rt!;
  const q = currentQuestion();
  const picked = r.answers[q.n] ?? [];
  const isChecked = r.mode === "practice" && r.checked.has(q.n);
  const answerLetters = (q.answer ?? "").split("");
  const marked = isBookmarked(r.moduleId, q.n);

  const opts = q.options
    .map((o) => {
      const isPicked = picked.includes(o.label);
      const isRight = answerLetters.includes(o.label);
      let cls = "";
      let flag = "";
      if (isChecked) {
        if (isRight) {
          cls = "is-right";
          flag = `<span class="opt-flag">${icon("check")}Đáp án đúng</span>`;
        } else if (isPicked) {
          cls = "is-wrong";
          flag = `<span class="opt-flag">${icon("close")}Bạn chọn</span>`;
        } else {
          cls = "is-dim";
        }
      } else if (isPicked) {
        cls = "is-picked";
      }
      const clickable = isChecked ? "" : "clickable";
      const action = isChecked ? "" : `data-action="pick" data-arg="${esc(o.label)}"`;
      const optWhy = isChecked && o.why ? `<div class="text-xs text-muted mt-4">${renderMarkdown(o.why)}</div>` : "";
      return `<button class="opt ${q.multi ? "multi" : ""} ${cls} ${clickable}" ${action}>
        <span class="opt-mark">${esc(o.label)}</span>
        <div class="grow" style="min-width:0">
          <span class="opt-text">${esc(optText(o, r.lang))}</span>
          ${optWhy}
        </div>
        ${flag}
      </button>`;
    })
    .join("");

  const pickedCount = picked.length;
  const targetCount = answerLetters.length;
  const isComplete = targetCount > 0 && pickedCount === targetCount;

  const multiBadge = q.multi
    ? `<span class="badge ${isComplete ? "badge-good" : "badge-warn"}">${icon(isComplete ? "checkCircle" : "check")}${isComplete ? `Đã chọn đủ ${pickedCount}/${targetCount} đáp án` : `Chọn ${targetCount || "nhiều"} đáp án (đã chọn ${pickedCount}/${targetCount || "…"})`}</span>`
    : "";

  const tags = [
    `<span class="q-num">${icon("list")}Câu ${r.idx + 1}/${r.questions.length}</span>`,
    multiBadge,
    q.domain ? `<span class="badge badge-outline">${esc(q.domain)}</span>` : "",
    `<span class="badge badge-outline hide-sm">#${q.n}</span>`,
  ]
    .filter(Boolean)
    .join("");

  let verdict = "";
  if (isChecked) {
    const ok = normalize(picked) === normalize(answerLetters);
    const expText = (r.lang === "ja" && q.explanationJa) ? q.explanationJa : q.explanation;
    const refsHtml = q.refs && q.refs.length
      ? `<div class="mt-8 text-xs text-muted"><strong>Tham khảo:</strong> ${q.refs.map((rf) => `<a href="${esc(rf.url)}" target="_blank" rel="noopener noreferrer" class="link-text">${esc(rf.label || rf.url)}</a>`).join(" · ")}</div>`
      : "";

    verdict = `<div class="verdict ${ok ? "good" : "bad"}">
      ${icon(ok ? "checkCircle" : "xCircle")}
      <div>${ok ? "Chính xác!" : "Chưa đúng"}<small>Đáp án đúng: ${esc(answerLetters.join(", ") || "—")}${
        picked.length ? ` · Bạn chọn: ${esc(picked.join(", "))}` : ""
      }</small></div>
    </div>
    ${
      expText
        ? `<div class="card card-pad mt-12 mb-16" style="background:var(--surface-2);border-left:3px solid var(--brand)">
            <div class="fw-700 text-sm mb-4" style="color:var(--brand)">${icon("info")} Giải thích chi tiết:</div>
            <div class="text-sm" style="line-height:1.6">${renderMarkdown(expText)}</div>
            ${refsHtml}
          </div>`
        : ""
    }`;
  }

  const altStem = r.bilingual && r.showAlt
    ? `<div class="q-stem-alt">${esc(stemOf(q, r.lang === "en" ? "ja" : "en"))}</div>`
    : "";

  const isLast = r.idx === r.questions.length - 1;
  let primary: string;
  if (r.mode === "practice" && !isChecked) {
    primary = `<button class="btn btn-accent" data-action="check" ${picked.length === 0 ? "disabled" : ""}>${icon("checkCircle")}Kiểm tra</button>`;
  } else if (isLast) {
    primary = `<button class="btn btn-primary" data-action="askSubmit">${icon("send")}Nộp bài &amp; xem kết quả</button>`;
  } else {
    primary = `<button class="btn btn-accent" data-action="next">Câu tiếp${icon("arrowRight")}</button>`;
  }

  const userHasNote = hasNote(r.moduleId, q.n);

  return `<div class="q-card">
    <div class="q-top">
      <div class="q-tags">${tags}</div>
      <div class="q-tools">
        ${r.bilingual ? `<button class="tool-btn ${r.showAlt ? "is-on mark" : ""}" data-action="alt" title="Hiện bản dịch song song">${icon("language")}</button>` : ""}
        <button class="tool-btn ${userHasNote ? "is-on mark" : ""}" data-action="note" title="Ghi chú riêng">${icon("pencil")}</button>
        <button class="tool-btn" data-action="discuss" title="Thảo luận câu này">${icon("messageSquare")}</button>
        <button class="tool-btn ${marked ? "is-on mark" : ""}" data-action="bookmark" title="Lưu câu này">${icon("bookmark")}</button>
        <button class="tool-btn ${r.flags.has(q.n) ? "is-on" : ""}" data-action="flag" title="Đánh dấu cờ xem lại sau">${icon("flag")}</button>
      </div>
    </div>
    <div class="q-stem">${esc(stemOf(q, r.lang))}</div>
    ${altStem}
    ${verdict}
    <div class="opt-list">${opts}</div>
    <div class="q-nav">
      <button class="btn btn-outline" data-action="prev" ${r.idx === 0 ? "disabled" : ""}>${icon("arrowLeft")}Câu trước</button>
      ${primary}
    </div>
  </div>`;
}

function renderRun(root: HTMLElement): void {
  const r = rt!;
  setModuleTheme(r.moduleId);

  const doneCount = Object.values(r.answers).filter((a) => a.length > 0).length;

  root.innerHTML = `${renderExamBar()}
    <div class="page exam-layout">
      <div class="exam-main">${renderQuestionCard()}</div>
      <aside class="exam-aside ${r.paletteOpen ? "is-open" : ""}">${renderPalette()}</aside>
    </div>
    <div class="palette-scrim ${r.paletteOpen ? "is-open" : ""}" data-action="togglePalette"></div>
    <div class="mobile-bar">
      <button class="btn btn-outline btn-sm btn-icon-only" data-action="prev" ${r.idx === 0 ? "disabled" : ""} aria-label="Câu trước">${icon("arrowLeft")}</button>
      <button class="btn btn-soft-accent btn-sm grow" data-action="togglePalette">${icon("grid")}Câu ${r.idx + 1}/${r.questions.length} (${doneCount} đã làm)</button>
      <button class="btn btn-outline btn-sm btn-icon-only" data-action="flag" title="Cắm cờ">${icon("flag", r.flags.has(currentQuestion().n) ? "text-brand" : "")}</button>
      <button class="btn btn-outline btn-sm btn-icon-only" data-action="next" ${r.idx === r.questions.length - 1 ? "disabled" : ""} aria-label="Câu tiếp">${icon("arrowRight")}</button>
    </div>`;

  bindActions(root, {
    exit: () => void exitExam(),
    lang: (v) => { r.lang = v === "ja" ? "ja" : "en"; persist(); renderRun(root); },
    alt: () => { r.showAlt = !r.showAlt; renderRun(root); },
    bookmark: () => {
      const on = toggleBookmark(r.moduleId, currentQuestion().n);
      toast(on ? "Đã lưu câu hỏi." : "Đã bỏ lưu câu hỏi.", on ? "good" : "default", 1600);
      renderRun(root);
    },
    note: async () => {
      const q = currentQuestion();
      await loadNotes(r.moduleId);
      const currentNote = getNote(r.moduleId, q.n);
      const val = await promptDialog({
        title: `Ghi chú cá nhân — Câu #${q.n}`,
        text: "Ghi chú riêng tư chỉ mình bạn thấy:",
        defaultValue: currentNote,
        confirmLabel: "Lưu ghi chú",
      });
      if (val !== null) {
        await saveNote(r.moduleId, q.n, val);
        toast("Đã lưu ghi chú.", "good");
        renderRun(root);
      }
    },
    discuss: async () => {
      const q = currentQuestion();
      try {
        const comments = await loadComments(r.moduleId, q.n);
        const commentListHtml = comments.length
          ? comments.map((c) => `<div class="comment-box mb-8"><div class="comment-top"><span class="comment-author">${esc(c.authorName)}</span><span class="comment-time">${esc(formatDateTime(c.createdAt))}</span></div><div class="comment-content">${renderMarkdown(c.body)}</div></div>`).join("")
          : "Chưa có thảo luận nào cho câu này.";

        const newComment = await promptDialog({
          title: `Thảo luận cộng đồng — Câu #${q.n}`,
          text: `Đóng góp bình luận hoặc câu hỏi của bạn:\n\n${commentListHtml}`,
          defaultValue: "",
          confirmLabel: "Gửi thảo luận",
        });
        if (newComment && newComment.trim()) {
          await postComment(r.moduleId, q.n, newComment.trim());
          toast("Đã gửi thảo luận thành công!", "good");
        }
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), "bad");
      }
    },
    flag: () => {
      const n = currentQuestion().n;
      if (r.flags.has(n)) r.flags.delete(n);
      else r.flags.add(n);
      persist();
      renderRun(root);
    },
    pick: (letter) => { if (letter) pick(letter); renderRun(root); },
    check: () => { checkCurrent(); renderRun(root); },
    prev: () => { move(-1); renderRun(root); },
    next: () => { move(1); renderRun(root); },
    goto: (i) => { accrueTime(); r.idx = Number(i); r.paletteOpen = false; renderRun(root); window.scrollTo({ top: 0 }); },
    togglePalette: () => { r.paletteOpen = !r.paletteOpen; renderRun(root); },
    askSubmit: () => void askSubmit(),
  });
}

function pick(letter: string): void {
  const r = rt!;
  const q = currentQuestion();
  if (r.mode === "practice" && r.checked.has(q.n)) return;
  const cur = r.answers[q.n] ?? [];
  if (q.multi) {
    r.answers[q.n] = cur.includes(letter) ? cur.filter((l) => l !== letter) : [...cur, letter];
  } else {
    r.answers[q.n] = cur.length === 1 && cur[0] === letter ? [] : [letter];
  }
  if (r.answers[q.n].length === 0) delete r.answers[q.n];
  persist();
}

function checkCurrent(): void {
  const r = rt!;
  const q = currentQuestion();
  const picked = r.answers[q.n] ?? [];
  if (picked.length === 0) return;
  accrueTime();
  const correct = normalize(picked) === normalize((q.answer ?? "").split(""));
  r.checked.add(q.n);
  recordAnswer(r.moduleId, q.n, correct);
  flushAnswers();
  logResponse({
    moduleId: r.moduleId,
    stageId: r.stageId,
    questionN: q.n,
    chosen: normalize(picked),
    correct,
    timeMs: r.timeSpent[q.n],
    mode: "practice",
  });
  persist();
}

function move(delta: number): void {
  const r = rt!;
  accrueTime();
  r.idx = Math.min(Math.max(r.idx + delta, 0), r.questions.length - 1);
  r.paletteOpen = false;
  persist();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function askSubmit(): Promise<void> {
  const r = rt!;
  const done = Object.values(r.answers).filter((a) => a.length > 0).length;
  const left = r.questions.length - done;
  const extra = left
    ? `<div class="notice warn mt-16">${icon("alert")}<div>Còn <strong>${left} câu</strong> chưa chọn đáp án. Các câu này sẽ bị tính là sai.</div></div>`
    : `<div class="notice good mt-16">${icon("checkCircle")}<div>Bạn đã trả lời hết <strong>${done} câu</strong>.</div></div>`;
  const ok = await confirmDialog({
    title: "Nộp bài?",
    text: "Sau khi nộp, bài sẽ được chấm và bạn không sửa được đáp án nữa.",
    confirmLabel: "Nộp bài",
    cancelLabel: "Làm tiếp",
    extra,
  });
  if (ok) finish(false);
}

async function exitExam(): Promise<void> {
  const r = rt!;
  const ok = await confirmDialog({
    title: "Thoát khỏi bài làm?",
    text: "Bài làm được lưu lại trên máy bạn — mở lại chứng chỉ này là có thể học tiếp từ đúng chỗ đang dở.",
    confirmLabel: "Thoát",
    cancelLabel: "Ở lại",
  });
  if (!ok) return;
  persist();
  const path = r.exitPath;
  rt = null;
  navigate(path);
}

// ---------------------------------------------------------------- màn kết quả

function reviewRows(): string {
  const r = rt!;
  const res = r.result!;
  const byNum = new Map(r.questions.map((q) => [q.n, q]));

  const rows = res.perQuestion.filter((p) => {
    if (r.reviewFilter === "wrong") return !p.isCorrect;
    if (r.reviewFilter === "flagged") return r.flags.has(p.n);
    return true;
  });

  if (rows.length === 0) {
    return `<div class="empty"><div class="icon-chip lg good">${icon("checkCircle")}</div>
      <h3>Không có câu nào ở mục này</h3>
      <p>${r.reviewFilter === "wrong" ? "Bạn làm đúng toàn bộ câu hỏi trong bài này." : "Bạn không đánh dấu câu nào để xem lại."}</p></div>`;
  }

  return rows
    .map((p, i) => {
      const q = byNum.get(p.n)!;
      const badgeCls = p.skipped ? "skip" : p.isCorrect ? "ok" : "no";
      const order = res.perQuestion.findIndex((x) => x.n === p.n) + 1;
      const open = r.expanded.has(p.n);

      const detail = open
        ? `<div class="opt-list mt-16">${q.options
            .map((o) => {
              const isRight = (p.answer || "").includes(o.label);
              const isPicked = p.picked.includes(o.label);
              const cls = isRight ? "is-right" : isPicked ? "is-wrong" : "is-dim";
              const flag = isRight
                ? `<span class="opt-flag">${icon("check")}Đáp án đúng</span>`
                : isPicked
                  ? `<span class="opt-flag">${icon("close")}Bạn chọn</span>`
                  : "";
              return `<div class="opt ${cls}"><span class="opt-mark">${esc(o.label)}</span><span class="opt-text">${esc(
                optText(o, r.lang)
              )}</span>${flag}</div>`;
            })
            .join("")}</div>`
        : "";

      return `<div class="review-row" style="flex-direction:column;align-items:stretch;animation:fade-up .3s var(--ease-out) both;animation-delay:${Math.min(i, 12) * 0.02}s">
        <button class="row gap-12" style="align-items:flex-start;text-align:left;width:100%" data-action="toggleReview" data-arg="${p.n}">
          <span class="review-badge ${badgeCls}">${order}</span>
          <span class="review-main">
            <span class="review-stem" style="display:block">${esc(stemOf(q, r.lang).slice(0, 190))}${
              stemOf(q, r.lang).length > 190 ? "…" : ""
            }</span>
            <span class="review-meta">
              <span>${p.skipped ? "<b>Bỏ trống</b>" : `Bạn chọn: <b class="${p.isCorrect ? "ok" : "no"}">${esc(p.picked.join(", "))}</b>`}</span>
              <span>Đáp án: <b class="ok">${esc((p.answer || "—").split("").join(", "))}</b></span>
              ${r.flags.has(p.n) ? `<span class="text-muted">${icon("flag")} đã đánh dấu</span>` : ""}
            </span>
          </span>
          <span class="icon-btn" style="width:32px;height:32px;border:none;background:none">${icon(open ? "chevronDown" : "chevronRight")}</span>
        </button>
        ${detail}
      </div>`;
    })
    .join("");
}

function renderResult(root: HTMLElement): void {
  const r = rt!;
  const res = r.result!;
  setModuleTheme(r.moduleId);

  const tone = res.passed ? "good" : res.pct >= 50 ? "accent" : "bad";
  const headline = res.passed
    ? "Chúc mừng, bạn đã vượt ngưỡng đậu!"
    : res.pct >= 50
      ? "Sắp tới rồi, cố thêm chút nữa!"
      : "Cần luyện thêm ở phần này";
  const sub = res.passed
    ? `Bạn đạt ${res.pct}% — trên ngưỡng ${r.passPct}% của kỳ thi này. Hãy giữ nhịp và thử một đề dài hơn.`
    : `Bạn đạt ${res.pct}%, ngưỡng đậu tham chiếu là ${r.passPct}%. Xem lại các câu sai bên dưới rồi luyện riêng phần đó.`;

  const wrongCount = res.perQuestion.filter((p) => !p.isCorrect).length;

  const filters: [typeof r.reviewFilter, string][] = [
    ["all", `Tất cả (${res.total})`],
    ["wrong", `Câu sai (${wrongCount})`],
    ["flagged", `Đã đánh dấu (${r.flags.size})`],
  ];

  const content = `<div class="page-head">
      <div class="page">
        ${crumbs([
          { label: "Trang chủ", action: "go", arg: "/" },
          { label: r.brandLabel, action: "go", arg: r.exitPath },
          { label: "Kết quả" },
        ])}
      </div>
    </div>
    <div class="page page-body">
      <div class="result-hero anim-up">
        ${ring({ pct: res.pct, size: 132, stroke: 12, label: `${res.correct}/${res.total} câu`, tone })}
        <div class="result-hero-text">
          <span class="badge ${res.passed ? "badge-good" : "badge-bad"} mb-12">${icon(res.passed ? "trophy" : "target")}${
            res.passed ? "Đạt" : "Chưa đạt"
          }</span>
          <h1>${headline}</h1>
          <p>${esc(sub)}</p>
          <div class="result-stats">
            ${statBox("checkCircle", "Câu đúng", String(res.correct), `/ ${res.total}`)}
            ${statBox("xCircle", "Câu sai", String(res.total - res.correct))}
            ${statBox("clock", "Thời gian", formatDuration(res.durationSec))}
            ${statBox("target", "Tỷ lệ đúng", `${res.pct}%`)}
          </div>
          <div class="result-actions">
            ${wrongCount ? `<button class="btn btn-primary" data-action="retryWrong">${icon("refresh")}Luyện lại ${wrongCount} câu sai</button>` : ""}
            <button class="btn btn-outline" data-action="go" data-arg="${esc(r.exitPath)}">${icon("home")}Về trang chứng chỉ</button>
            <button class="btn btn-ghost" data-action="go" data-arg="/tien-trinh">${icon("chart")}Xem tiến trình</button>
          </div>
        </div>
      </div>

      <div class="row-between mt-40 mb-16">
        <h2 class="card-title" style="font-size:20px">Xem lại bài làm</h2>
        <div class="segmented">
          ${filters
            .map(
              ([key, label]) =>
                `<button class="${r.reviewFilter === key ? "is-active" : ""}" data-action="filter" data-arg="${key}">${label}</button>`
            )
            .join("")}
        </div>
      </div>
      <div>${reviewRows()}</div>
    </div>`;

  root.innerHTML = renderPage({ content });

  bindShell(root, "", {
    filter: (v) => { r.reviewFilter = (v as typeof r.reviewFilter) ?? "all"; renderResult(root); },
    toggleReview: (n) => {
      const num = Number(n);
      if (r.expanded.has(num)) r.expanded.delete(num);
      else r.expanded.add(num);
      renderResult(root);
    },
    retryWrong: () => {
      const wrongNums = new Set(res.perQuestion.filter((p) => !p.isCorrect).map((p) => p.n));
      const list = r.questions.filter((q) => wrongNums.has(q.n));
      startExam({
        moduleId: r.moduleId,
        stageId: "practice",
        label: "Luyện lại câu sai",
        brandLabel: r.brandLabel,
        questions: list,
        mode: "practice",
        durationSec: null,
        bilingual: r.bilingual,
        passPct: r.passPct,
        exitPath: r.exitPath,
      });
    },
  });
}

// ---------------------------------------------------------------- đăng ký route

export function registerExamRoutes(): void {
  registerRoute(EXAM_PATH, (root) => {
    if (!rt) { navigate("/"); return; }
    if (rt.result) { navigate(RESULT_PATH); return; }

    renderRun(root);

    const tick = setInterval(() => {
      if (!rt || rt.result) return;
      rt.elapsed += 1;
      if (rt.remaining !== null) {
        rt.remaining -= 1;
        if (rt.remaining <= 0) { rt.remaining = 0; finish(true); return; }
      }
      const el = document.getElementById("examTimer");
      if (el) {
        const span = el.querySelector("span");
        if (span) span.textContent = formatClock(rt.remaining ?? rt.elapsed);
        el.className = `timer ${timerClass(rt.remaining)}`;
      }
      if (rt.elapsed % 5 === 0) persist();
    }, 1000);

    return () => {
      clearInterval(tick);
      persist();
      flushSessions();
      flushResponses();
    };
  });

  registerRoute(RESULT_PATH, (root) => {
    if (!rt || !rt.result) {
      toast("Không còn dữ liệu bài làm — hãy xem lại trong mục Tiến trình.", "default", 3200);
      navigate("/tien-trinh");
      return;
    }
    renderResult(root);
  });
}

/** Bài đang làm dở của module này còn nằm trong bộ nhớ không (chưa nộp). */
export function hasLiveExam(moduleId: string): boolean {
  return !!rt && !rt.result && rt.moduleId === moduleId;
}

export function continueLiveExam(): void {
  if (rt && !rt.result) navigate(EXAM_PATH);
}
