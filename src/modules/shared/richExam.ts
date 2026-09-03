/**
 * Bộ máy làm bài cho 5 dạng câu hỏi mới: Nghe, Đọc, Viết, Ghép nối, Bút toán.
 *
 * Tách riêng khỏi `mcExam.ts` (chỉ dành cho trắc nghiệm thuần) vì năm dạng
 * này có UI và cách chấm khác hẳn nhau — audio khoá tua, split-view cuộn
 * độc lập, dropdown ghép nối, bảng debit/credit tự validate. Một bài thi có
 * thể trộn nhiều dạng trong cùng một lượt (đúng thực tế IELTS: Đọc + Nghe +
 * Viết trong một buổi), nên engine này nhận `ExamQuestion[]` bất kỳ tổ hợp
 * kind nào, không riêng một dạng.
 *
 * Chấm điểm: coi mỗi "đơn vị chấm" là 1 điểm — với câu Đọc, mỗi câu con
 * (subItem) là một đơn vị riêng chứ không phải cả bài Đọc chỉ tính 1 điểm.
 * Câu Viết không tự chấm được, luôn tách riêng khỏi tỷ lệ đúng, chỉ tính là
 * "đã làm" nếu đủ số từ tối thiểu.
 */

import type {
  AccountingEntry,
  AccountingQuestion,
  ExamQuestion,
  ListeningQuestion,
  MatchingQuestion,
  ReadingQuestion,
  WritingQuestion,
} from "../../types/exam";
import { registerRoute, navigate } from "../../router";
import { bindActions, esc } from "../../components/bindActions";
import { icon } from "../../components/icons";
import { renderPage, bindShell, setModuleTheme } from "../../components/appShell";
import { confirmDialog } from "../../components/modal";
import { toast } from "../../components/toast";
import { formatClock, formatDuration, percent, crumbs, renderMarkdown } from "../../components/ui";
import { addAttempt, recordAnswer, flushAnswers, getModuleStats, getWrong, getAttempts } from "../../state/progress";
import { logResponse, flushResponses } from "../../state/responses";
import { afterExamBookkeeping } from "../../state/habits";
import { saveSession, clearSession, flushSessions, type SavedSession } from "../../state/session";
import { initTextHighlighter, openAnnotationsDrawer, loadAllAnnotations, destroyHighlighterUI } from "../../components/highlighter";

export interface RichExamLaunch {
  moduleId: string;
  levelId: string;
  stageId: string;
  label: string;
  brandLabel: string;
  questions: ExamQuestion[];
  durationSec: number | null;
  passPct: number;
  exitPath: string;
}

/** Hình dạng câu trả lời tuỳ theo kind — xem `gradeOne()` để biết cách đọc từng dạng. */
type AnyAnswer =
  | { kind: "mc" | "listening"; picked: string[]; played?: boolean }
  | { kind: "reading"; subs: Record<string, string> }
  | { kind: "writing"; text: string }
  | { kind: "matching"; picks: Record<string, number> }
  | { kind: "accounting"; entries: AccountingEntry[] };

interface GradedUnit {
  /** Số câu + id câu con (nếu có) để hiện trong màn xem lại. */
  n: number;
  subId?: string;
  label: string;
  correct: boolean | null; // null = không tự chấm được (Viết)
  skipped: boolean;
}

interface RichResult {
  units: GradedUnit[];
  correct: number;
  gradable: number;
  pct: number;
  passed: boolean;
  durationSec: number;
  ungradedWriting: number;
}

interface Runtime extends RichExamLaunch {
  idx: number;
  answers: Record<number, AnyAnswer>;
  flags: Set<number>;
  remaining: number | null;
  elapsed: number;
  startedAt: number;
  result: RichResult | null;
  reviewFilter: "all" | "wrong";
  paletteOpen: boolean;
  shownAt: number;
  timeSpent: Record<number, number>;
}

let rt: Runtime | null = null;
const EXAM_PATH = "/lam-bai-2";
const RESULT_PATH = "/ket-qua-2";

// ---------------------------------------------------------------- khởi động

export function startRichExam(launch: RichExamLaunch): void {
  rt = {
    ...launch,
    idx: 0,
    answers: {},
    flags: new Set(),
    remaining: launch.durationSec,
    elapsed: 0,
    startedAt: Date.now(),
    result: null,
    reviewFilter: "all",
    paletteOpen: false,
    shownAt: Date.now(),
    timeSpent: {},
  };
  persist();
  navigate(EXAM_PATH);
}

interface ResumeContext {
  brandLabel: string;
  exitPath: string;
  passPct: number;
  pool: ExamQuestion[];
}

export function resumeRichExam(saved: SavedSession, ctx: ResumeContext): boolean {
  const byNum = new Map(ctx.pool.map((q) => [q.n, q]));
  const questions = saved.qNums.map((n) => byNum.get(n)).filter((q): q is ExamQuestion => !!q);
  if (questions.length !== saved.qNums.length || questions.length === 0) return false;

  const answers: Record<number, AnyAnswer> = {};
  for (const [k, v] of Object.entries(saved.answers)) {
    // SavedSession chỉ định nghĩa answers: string[] cho mcExam; ở đây ta lưu
    // JSON tuỳ dạng vào cùng trường đó (đã ép kiểu khi ghi ở persist()).
    try {
      answers[Number(k)] = JSON.parse((v as unknown as string[]).join("")) as AnyAnswer;
    } catch {
      /* bỏ qua câu hỏng, coi như chưa làm */
    }
  }

  rt = {
    moduleId: saved.moduleId,
    levelId: saved.levelId,
    stageId: saved.stageId,
    label: saved.label,
    brandLabel: ctx.brandLabel,
    questions,
    durationSec: saved.durationSec,
    passPct: ctx.passPct,
    exitPath: ctx.exitPath,
    idx: Math.min(saved.idx, questions.length - 1),
    answers,
    flags: new Set(saved.flags ?? []),
    remaining: saved.remaining,
    elapsed: saved.elapsed ?? 0,
    startedAt: Date.now() - (saved.elapsed ?? 0) * 1000,
    result: null,
    reviewFilter: "all",
    paletteOpen: false,
    shownAt: Date.now(),
    timeSpent: {},
  };
  navigate(EXAM_PATH);
  return true;
}

function persist(): void {
  if (!rt || rt.result) return;
  // Mã hoá answers (bất kỳ hình dạng nào) thành JSON, nhét vào field string[]
  // sẵn có của SavedSession — tránh phải đổi schema session cho một engine phụ.
  const answers: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(rt.answers)) answers[k] = [JSON.stringify(v)];
  const s: SavedSession = {
    moduleId: rt.moduleId,
    levelId: rt.levelId,
    stageId: rt.stageId,
    label: rt.label,
    mode: "exam",
    qNums: rt.questions.map((q) => q.n),
    idx: rt.idx,
    answers,
    checked: [],
    flags: [...rt.flags],
    lang: "en",
    remaining: rt.remaining,
    durationSec: rt.durationSec,
    startedAt: rt.startedAt,
    elapsed: rt.elapsed,
    savedAt: Date.now(),
  };
  saveSession(s);
}

function accrueTime(): void {
  const r = rt;
  if (!r) return;
  const q = r.questions[r.idx];
  if (!q) return;
  const now = Date.now();
  r.timeSpent[q.n] = (r.timeSpent[q.n] ?? 0) + Math.max(0, now - r.shownAt);
  r.shownAt = now;
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

// ---------------------------------------------------------------- chấm điểm

function gradeQuestion(q: ExamQuestion, a: AnyAnswer | undefined): GradedUnit[] {
  if (q.kind === "listening") {
    const picked = a?.kind === "listening" ? a.picked : [];
    const ansLetters = (q.answer ?? "").split("");
    const skipped = picked.length === 0;
    const correct = !skipped && [...picked].sort().join("") === [...ansLetters].sort().join("");
    return [{ n: q.n, label: `Câu ${q.n} (Nghe)`, correct, skipped }];
  }
  if (q.kind === "matching") {
    const picks = a?.kind === "matching" ? a.picks : {};
    return q.items.map((it) => {
      const picked = picks[it.id];
      const skipped = picked === undefined;
      return { n: q.n, subId: it.id, label: `${q.title} — ${it.label}`, correct: !skipped && picked === it.answerIndex, skipped };
    });
  }
  if (q.kind === "accounting") {
    const entries = a?.kind === "accounting" ? a.entries : [];
    const skipped = entries.length === 0;
    const norm = (list: AccountingEntry[]) =>
      [...list].map((e) => `${e.side}:${e.account}:${e.amount}`).sort().join("|");
    const correct = !skipped && norm(entries) === norm(q.correctEntries);
    return [{ n: q.n, label: `Câu ${q.n} (Bút toán)`, correct, skipped }];
  }
  if (q.kind === "reading") {
    const subs = a?.kind === "reading" ? a.subs : {};
    return q.subItems.map((si) => {
      const picked = subs[si.id];
      const skipped = picked === undefined || picked === "";
      const correct = !skipped && normalize(picked) === normalize(si.answer);
      return { n: q.n, subId: si.id, label: `Câu ${q.n} — ${si.id}`, correct, skipped };
    });
  }
  if (q.kind === "writing") {
    // Viết: không tự chấm được.
    const text = a?.kind === "writing" ? a.text : "";
    return [{ n: q.n, label: q.title, correct: null, skipped: text.trim().length === 0 }];
  }
  // mc/essay/flashcard không thuộc engine này — không nên tới đây, nhưng vẫn
  // trả về một đơn vị "bỏ trống" thay vì crash nếu lỡ lọt vào.
  return [{ n: q.n, label: `Câu ${q.n}`, correct: null, skipped: true }];
}

function grade(): RichResult {
  const r = rt!;
  const units = r.questions.flatMap((q) => gradeQuestion(q, r.answers[q.n]));
  const gradableUnits = units.filter((u) => u.correct !== null);
  const correct = gradableUnits.filter((u) => u.correct).length;
  const gradable = gradableUnits.length;
  const pct = percent(correct, gradable);
  return {
    units,
    correct,
    gradable,
    pct,
    passed: pct >= r.passPct,
    durationSec: r.elapsed,
    ungradedWriting: units.length - gradableUnits.length,
  };
}

function finish(auto = false): void {
  const r = rt;
  if (!r || r.result) return;
  accrueTime();
  const result = grade();
  r.result = result;

  // Ghi vào ngân hàng câu sai theo từng đơn vị đã chấm được.
  for (const u of result.units) {
    if (u.correct === null) continue;
    recordAnswer(r.moduleId, u.n, u.correct, r.levelId, r.stageId);
    logResponse({
      moduleId: r.moduleId,
      levelId: r.levelId,
      stageId: r.stageId,
      questionN: u.n,
      correct: u.correct,
      timeMs: r.timeSpent[u.n],
      mode: "exam",
    });
  }
  flushAnswers();
  flushResponses();

  const attempt = addAttempt({
    moduleId: r.moduleId,
    levelId: r.levelId,
    stageId: r.stageId,
    label: `${r.label} · ${r.questions.length} câu`,
    correct: result.correct,
    total: result.gradable,
    pct: result.pct,
    durationSec: result.durationSec,
    passed: result.passed,
  });

  const stats = getModuleStats(r.moduleId, r.levelId);
  void afterExamBookkeeping({
    moduleId: r.moduleId,
    passPct: r.passPct,
    mode: "exam",
    total: result.gradable,
    durationSec: result.durationSec,
    bestPct: Math.max(stats.bestPct, attempt.pct),
    examAttempts: getAttempts(r.moduleId, r.levelId).length,
    wrongCount: getWrong(r.moduleId, r.levelId).length,
  }).then((earned) => {
    if (earned.length) toast(`Nhận huy hiệu mới: ${earned.length} cái. Xem ở trang Tiến trình.`, "good", 4000);
  });

  clearSession(r.moduleId, r.levelId);
  navigate(RESULT_PATH);
  if (auto) toast("Hết giờ — bài thi đã được nộp tự động.", "bad", 3600);
}

// ---------------------------------------------------------------- dựng từng dạng câu hỏi

function currentQuestion(): ExamQuestion {
  return rt!.questions[rt!.idx];
}

function setAnswer(a: AnyAnswer): void {
  const r = rt!;
  r.answers[currentQuestion().n] = a;
  persist();
}

function timerClass(remaining: number | null): string {
  if (remaining === null) return "";
  if (remaining <= 60) return "is-low";
  if (remaining <= 300) return "is-warn";
  return "";
}

function renderListening(q: ListeningQuestion): string {
  const a = rt!.answers[q.n];
  const picked = a?.kind === "listening" ? a.picked : [];
  const played = (a?.kind === "listening" && a.played) || picked.length > 0;
  const showOptions = !q.revealAfterAudio || played;

  return `<div class="q-card">
    <div class="q-top">
      <span class="badge badge-outline">${icon("headphones")}Part ${q.part}/${q.totalParts}</span>
    </div>
    <div style="max-width:420px;margin:0 auto;text-align:center;padding:20px 0 28px">
      <button class="btn btn-primary" style="width:64px;height:64px;border-radius:50%;padding:0" data-action="playAudio" data-arg="${q.n}">
        ${icon("play")}
      </button>
      <div class="bar thin" style="margin-top:18px"><i style="width:0%" id="audioProgress"></i></div>
      <div class="text-xs text-muted mt-8" style="display:flex;align-items:center;justify-content:center;gap:6px">
        ${icon("info")} Audio chỉ phát một lần — không thể tua lại
      </div>
    </div>
    ${
      showOptions
        ? `<div class="q-stem">${esc(q.en)}</div>
           <div class="opt-list">${q.options
             .map(
               (o) => `<button class="opt ${q.multi ? "multi" : ""} ${picked.includes(o.label) ? "is-picked" : ""} clickable" data-action="pickListen" data-arg="${esc(o.label)}">
                 <span class="opt-mark">${esc(o.label)}</span>
                 <span class="opt-text">${esc(o.en)}</span>
               </button>`
             )
             .join("")}</div>`
        : `<div class="notice info">${icon("info")}<div>Đáp án sẽ hiện ra sau khi nghe xong đoạn audio này.</div></div>`
    }
  </div>`;
}

function renderReading(q: ReadingQuestion): string {
  const a = rt!.answers[q.n];
  const subs = a?.kind === "reading" ? a.subs : {};
  return `<div class="q-card" style="padding:0;overflow:hidden">
    <div class="reading-split-grid">
      <div style="border-right:1px solid var(--line);padding:24px 26px;overflow-y:auto;max-height:70vh">
        <div class="passage-title">${icon("bookmark")}Đoạn văn</div>
        ${q.title ? `<h3 style="margin:0 0 12px">${esc(q.title)}</h3>` : ""}
        <div class="passage-body">${esc(q.passageEn)}</div>
      </div>
      <div style="padding:24px 26px;overflow-y:auto;max-height:70vh">
        ${q.subItems
          .map((si, i) => {
            const val = subs[si.id] ?? "";
            if (si.kind === "mc") {
              return `<div class="q-instr mb-12" style="background:none;border:none;padding:0"><b>${i + 1}.</b> ${esc(si.prompt)}</div>
                <div class="opt-list" style="margin-bottom:22px">
                  ${si.options
                    .map(
                      (o) => `<button class="opt clickable ${val === o.label ? "is-picked" : ""}" data-action="pickReadingSub" data-arg="${si.id}|${esc(o.label)}">
                        <span class="opt-mark">${esc(o.label)}</span><span class="opt-text">${esc(o.en)}</span>
                      </button>`
                    )
                    .join("")}
                </div>`;
            }
            if (si.kind === "matching") {
              return `<div class="q-instr mb-12" style="background:none;border:none;padding:0"><b>${i + 1}.</b> ${esc(si.prompt)}</div>
                <select class="select mb-20" data-input="readingSub" data-arg="${si.id}">
                  <option value="">— Chọn —</option>
                  ${si.options.map((o) => `<option value="${esc(o)}" ${val === o ? "selected" : ""}>${esc(o)}</option>`).join("")}
                </select>`;
            }
            return `<div class="field mb-20">
              <label class="field-label">${i + 1}. ${esc(si.prompt)}</label>
              <input class="input" data-input="readingSub" data-arg="${si.id}" value="${esc(val)}" placeholder="Điền câu trả lời…">
            </div>`;
          })
          .join("")}
      </div>
    </div>
  </div>`;
}

function renderWriting(q: WritingQuestion): string {
  const a = rt!.answers[q.n];
  const text = a?.kind === "writing" ? a.text : "";
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const under = words < q.minWords;
  return `<div class="q-card">
    <div class="essay-prompt">${renderMarkdown(q.prompt)}</div>
    <textarea class="textarea" style="width:100%;height:320px" data-input="writing" placeholder="Viết bài của bạn ở đây…">${esc(text)}</textarea>
    <div class="row-between mt-8">
      <span class="text-xs text-muted">Tự lưu khi bạn dừng gõ</span>
      <span class="text-xs" style="font-weight:700;color:${under ? "var(--bad)" : "var(--good)"};min-width:190px;text-align:right">
        ${under ? icon("alert") : icon("checkCircle")} ${words} từ${under ? ` — còn thiếu ${q.minWords - words} từ` : " — đã đủ"}
      </span>
    </div>
  </div>`;
}

function renderMatching(q: MatchingQuestion): string {
  const a = rt!.answers[q.n];
  const picks = a?.kind === "matching" ? a.picks : {};
  return `<div class="q-card">
    <div class="q-instr mb-16">${esc(q.prompt)}</div>
    <div class="pill-group" style="flex-direction:column;gap:10px">
      ${q.items
        .map((it) => {
          const val = picks[it.id];
          const ok = val === it.answerIndex;
          return `<div class="opt" style="align-items:center;${val !== undefined ? (ok ? "border-color:var(--good)" : "") : ""}">
            <span class="opt-text" style="flex:1">${esc(it.label)}</span>
            <select class="select" style="flex:0 0 240px" data-input="matching" data-arg="${it.id}">
              <option value="">— Chọn dịch vụ —</option>
              ${it.options.map((o, i) => `<option value="${i}" ${val === i ? "selected" : ""}>${esc(o)}</option>`).join("")}
            </select>
          </div>`;
        })
        .join("")}
    </div>
  </div>`;
}

function renderAccounting(q: AccountingQuestion): string {
  const a = rt!.answers[q.n];
  const entries = a?.kind === "accounting" ? a.entries : [];
  const debit = entries.filter((e) => e.side === "debit");
  const credit = entries.filter((e) => e.side === "credit");
  const sum = (list: AccountingEntry[]) => list.reduce((s, e) => s + (e.amount || 0), 0);
  const debitSum = sum(debit);
  const creditSum = sum(credit);
  const balanced = debitSum > 0 && debitSum === creditSum;

  const row = (side: "debit" | "credit", e: AccountingEntry | undefined, i: number) => `
    <div style="padding:12px 14px;display:flex;gap:8px;${side === "debit" ? "border-right:1.5px solid var(--line);" : ""}border-bottom:1px solid var(--line)">
      <select class="select" data-input="ledgerAccount" data-arg="${side}:${i}">
        <option value="">— 勘定科目 —</option>
        ${q.accounts.map((acc) => `<option value="${esc(acc)}" ${e?.account === acc ? "selected" : ""}>${esc(acc)}</option>`).join("")}
      </select>
      <input class="input" style="width:120px;text-align:right" data-input="ledgerAmount" data-arg="${side}:${i}" value="${e?.amount ?? ""}" placeholder="0">
    </div>`;

  const rows = Math.max(debit.length, credit.length, 1) + 1;
  let body = "";
  for (let i = 0; i < rows; i++) body += `<div style="display:grid;grid-template-columns:1fr 1fr">${row("debit", debit[i], i)}${row("credit", credit[i], i)}</div>`;

  return `<div class="q-card">
    <div class="q-instr mb-16">${esc(q.prompt)}</div>
    <div style="border:1.5px solid var(--line-strong);border-radius:var(--r-md);overflow:hidden">
      <div style="display:grid;grid-template-columns:1fr 1fr">
        <div style="padding:10px 14px;background:var(--brand-soft);border-right:1.5px solid var(--line-strong);font-size:12.5px;font-weight:700;color:var(--brand-strong)">借方 (Debit)</div>
        <div style="padding:10px 14px;background:var(--brand-soft);font-size:12.5px;font-weight:700;color:var(--brand-strong)">貸方 (Credit)</div>
      </div>
      ${body}
    </div>
    <div class="notice ${balanced ? "good" : "info"} mt-16">
      ${icon(balanced ? "checkCircle" : "info")}
      <div>${balanced ? `Hai cột đã cân bằng: ${debitSum.toLocaleString()}` : `Debit ${debitSum.toLocaleString()} · Credit ${creditSum.toLocaleString()} — chưa cân bằng`}</div>
    </div>
  </div>`;
}

function renderQuestionCard(): string {
  const q = currentQuestion();
  if (q.kind === "listening") return renderListening(q);
  if (q.kind === "reading") return renderReading(q);
  if (q.kind === "writing") return renderWriting(q);
  if (q.kind === "matching") return renderMatching(q);
  if (q.kind === "accounting") return renderAccounting(q);
  return `<div class="q-card"><div class="empty">Dạng câu hỏi không hỗ trợ ở đây — dùng màn làm bài trắc nghiệm.</div></div>`;
}

// ---------------------------------------------------------------- khung màn hình

function isAnswered(q: ExamQuestion, a: AnyAnswer | undefined): boolean {
  if (!a) return false;
  if (a.kind === "mc" || a.kind === "listening") return a.picked.length > 0;
  if (a.kind === "writing") return a.text.trim().length > 0;
  if (a.kind === "matching" && q.kind === "matching") return Object.keys(a.picks).length >= q.items.length;
  if (a.kind === "accounting") return a.entries.length > 0;
  if (a.kind === "reading" && q.kind === "reading") return Object.keys(a.subs).length >= q.subItems.length;
  return false;
}

function renderTopBar(): string {
  const r = rt!;
  const done = r.questions.filter((q) => isAnswered(q, r.answers[q.n])).length;
  const pct = percent(done, r.questions.length);
  const isWarn = r.remaining !== null && r.remaining <= 300;
  const timerIcon = isWarn ? "alertTriangle" : "clock";
  const timer =
    r.remaining !== null
      ? `<div class="timer ${timerClass(r.remaining)}" id="richTimer">${icon(timerIcon)}<span>${formatClock(r.remaining)}</span></div>`
      : `<div class="timer">${icon("clock")}<span>${formatClock(r.elapsed)}</span></div>`;

  const annList = loadAllAnnotations(r.moduleId, r.stageId);
  const notesBtn = `<button class="btn btn-ghost btn-sm" data-action="openAnnotations" title="Sổ tay ghi chú &amp; từ vựng">
    ${icon("edit3")}
    <span class="hide-sm">Ghi chú</span>
    ${annList.length ? `<span class="badge badge-brand sm nums" id="examNoteBadge" style="margin-left:4px">${annList.length}</span>` : `<span class="badge badge-outline sm nums" id="examNoteBadge" style="margin-left:4px;display:none"></span>`}
  </button>`;

  return `<div class="exam-bar">
    <div class="page exam-bar-inner">
      <button class="icon-btn" data-action="exit" title="Thoát bài làm">${icon("arrowLeft")}</button>
      <div class="exam-bar-title hide-sm">
        <b>${esc(r.label)}</b>
        <span>${esc(r.brandLabel)} · ${r.questions.length} câu</span>
      </div>
      <div class="exam-bar-mid">
        <div class="exam-bar-progress hide-sm"><div class="bar thin"><i style="width:${pct}%"></i></div></div>
        <span class="exam-bar-count">${done}/${r.questions.length} câu</span>
      </div>
      ${notesBtn}
      ${timer}
      <button class="btn btn-primary btn-sm" data-action="askSubmit">${icon("send")}<span class="hide-sm">Nộp bài</span></button>
    </div>
  </div>`;
}

function renderNavigator(): string {
  const r = rt!;
  const cells = r.questions
    .map((q, i) => {
      const answered = isAnswered(q, r.answers[q.n]);
      const cls = [i === r.idx ? "is-current" : "", answered && i !== r.idx ? "is-done" : "", r.flags.has(q.n) ? "is-flagged" : ""].filter(Boolean).join(" ");
      return `<button class="pnum ${cls}" data-action="goto" data-arg="${i}" title="Câu ${i + 1}">${i + 1}</button>`;
    })
    .join("");
  return `<div class="card palette">
    <div class="palette-head"><b>Danh sách câu hỏi</b><span class="text-xs text-muted nums">${r.questions.filter((q) => isAnswered(q, r.answers[q.n])).length}/${r.questions.length}</span></div>
    <div class="palette-grid">${cells}</div>
    <button class="btn btn-outline btn-sm btn-block mt-12" data-action="askSubmit">${icon("send")}Nộp bài</button>
  </div>`;
}

function renderRun(root: HTMLElement): void {
  const r = rt!;
  setModuleTheme(r.moduleId);
  root.innerHTML = `${renderTopBar()}
    <div class="page exam-layout">
      <div class="exam-main">${renderQuestionCard()}</div>
      <aside class="exam-aside ${r.paletteOpen ? "is-open" : ""}">${renderNavigator()}</aside>
    </div>
    <div class="palette-scrim ${r.paletteOpen ? "is-open" : ""}" data-action="togglePalette"></div>
    <div class="mobile-bar">
      <button class="btn btn-outline btn-sm btn-icon-only" data-action="prev" ${r.idx === 0 ? "disabled" : ""}>${icon("arrowLeft")}</button>
      <button class="btn btn-soft-accent btn-sm grow" data-action="togglePalette">${icon("grid")}Câu ${r.idx + 1}/${r.questions.length}</button>
      <button class="btn btn-outline btn-sm btn-icon-only" data-action="next" ${r.idx === r.questions.length - 1 ? "disabled" : ""}>${icon("arrowRight")}</button>
    </div>
    <div class="page" style="padding:0 0 40px">
      <div class="q-nav" style="padding-top:20px">
        <button class="btn btn-outline" data-action="prev" ${r.idx === 0 ? "disabled" : ""}>${icon("arrowLeft")}Câu trước</button>
        <button class="btn btn-accent" data-action="next" ${r.idx === r.questions.length - 1 ? "disabled" : ""}>Câu tiếp${icon("arrowRight")}</button>
      </div>
    </div>`;

  bindActions(root, {
    exit: () => void exitExam(),
    goto: (i) => { accrueTime(); r.idx = Number(i); r.paletteOpen = false; renderRun(root); window.scrollTo({ top: 0 }); },
    prev: () => { accrueTime(); r.idx = Math.max(0, r.idx - 1); persist(); renderRun(root); window.scrollTo({ top: 0 }); },
    next: () => { accrueTime(); r.idx = Math.min(r.questions.length - 1, r.idx + 1); persist(); renderRun(root); window.scrollTo({ top: 0 }); },
    togglePalette: () => { r.paletteOpen = !r.paletteOpen; renderRun(root); },
    askSubmit: () => void askSubmit(),

    // Listening
    playAudio: () => {
      const q = currentQuestion();
      if (q.kind !== "listening") return;
      const cur = r.answers[q.n];
      const picked = cur?.kind === "listening" ? cur.picked : [];
      r.answers[q.n] = { kind: "listening", picked, played: true };
      persist();
      renderRun(root);
    },
    pickListen: (letter) => {
      const q = currentQuestion();
      if (q.kind !== "listening" || !letter) return;
      const cur = r.answers[q.n];
      const prev = cur?.kind === "listening" ? cur.picked : [];
      const picked = q.multi ? (prev.includes(letter) ? prev.filter((l) => l !== letter) : [...prev, letter]) : [letter];
      setAnswer({ kind: "listening", picked });
      renderRun(root);
    },

    openAnnotations: () => {
      openAnnotationsDrawer(r.moduleId, r.stageId, (targetN) => {
        const targetIdx = r.questions.findIndex((q) => q.n === targetN);
        if (targetIdx >= 0) {
          accrueTime();
          r.idx = targetIdx;
          r.paletteOpen = false;
          persist();
          renderRun(root);
          window.scrollTo({ top: 0 });
        }
      }, r.levelId);
    },

    // Reading — mc sub-items
    pickReadingSub: (arg) => {
      destroyHighlighterUI();
      const q = currentQuestion();
      if (q.kind !== "reading" || !arg) return;
      const [subId, label] = arg.split("|");
      const cur = r.answers[q.n];
      const subs = cur?.kind === "reading" ? { ...cur.subs } : {};
      subs[subId] = label;
      setAnswer({ kind: "reading", subs });
      renderRun(root);
    },
  });

  bindInputsForKind(root);

  const examMain = root.querySelector<HTMLElement>(".exam-main");
  if (examMain) {
    initTextHighlighter({
      container: examMain,
      moduleId: r.moduleId,
      levelId: r.levelId || "",
      stageId: r.stageId,
      questionN: currentQuestion().n,
      onAnnotationChange: (count) => {
        const badge = root.querySelector("#examNoteBadge");
        if (badge) {
          badge.textContent = count ? String(count) : "";
          (badge as HTMLElement).style.display = count ? "inline-block" : "none";
        }
      },
      onJumpToQuestion: (targetN) => {
        const targetIdx = r.questions.findIndex((q) => q.n === targetN);
        if (targetIdx >= 0) {
          accrueTime();
          r.idx = targetIdx;
          r.paletteOpen = false;
          persist();
          renderRun(root);
          window.scrollTo({ top: 0 });
        }
      },
    });
  }
}

/** Ô nhập text/select không dùng data-action (bindActions chỉ bắt click) — gắn tay ở đây. */
function bindInputsForKind(root: HTMLElement): void {
  const r = rt!;
  const q = currentQuestion();

  root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-input="readingSub"]').forEach((el) => {
    el.addEventListener("change", () => {
      if (q.kind !== "reading") return;
      const subId = el.getAttribute("data-arg")!;
      const cur = r.answers[q.n];
      const subs = cur?.kind === "reading" ? { ...cur.subs } : {};
      subs[subId] = el.value;
      setAnswer({ kind: "reading", subs });
    });
  });

  const textarea = root.querySelector<HTMLTextAreaElement>('[data-input="writing"]');
  if (textarea && q.kind === "writing") {
    let t: ReturnType<typeof setTimeout>;
    textarea.addEventListener("input", () => {
      const words = textarea.value.trim() ? textarea.value.trim().split(/\s+/).length : 0;
      const counter = root.querySelector(".q-card .row-between span:last-child");
      const under = words < q.minWords;
      if (counter) {
        counter.innerHTML = `${icon(under ? "alert" : "checkCircle")} ${words} từ${under ? ` — còn thiếu ${q.minWords - words} từ` : " — đã đủ"}`;
        (counter as HTMLElement).style.color = under ? "var(--bad)" : "var(--good)";
      }
      clearTimeout(t);
      t = setTimeout(() => setAnswer({ kind: "writing", text: textarea.value }), 600);
    });
  }

  root.querySelectorAll<HTMLSelectElement>('[data-input="matching"]').forEach((el) => {
    el.addEventListener("change", () => {
      if (q.kind !== "matching") return;
      const itemId = el.getAttribute("data-arg")!;
      const cur = r.answers[q.n];
      const picks = cur?.kind === "matching" ? { ...cur.picks } : {};
      picks[itemId] = Number(el.value);
      setAnswer({ kind: "matching", picks });
      renderRun(root);
    });
  });

  /**
   * Cố ý KHÔNG gọi renderRun() ở đây. Một dòng chỉ được tính là "entry" khi
   * cả tài khoản lẫn số tiền đều đã điền — nếu vẽ lại toàn bảng ngay khi mới
   * điền xong MỘT ô, các ô còn lại (chưa đủ cặp) sẽ bị coi là rỗng và mất
   * giá trị đang gõ dở. Chỉ cập nhật đúng phần thông báo cân bằng tại chỗ.
   */
  const ledgerHandler = () => {
    if (q.kind !== "accounting") return;
    const accountEls = root.querySelectorAll<HTMLSelectElement>('[data-input="ledgerAccount"]');
    const amountEls = root.querySelectorAll<HTMLInputElement>('[data-input="ledgerAmount"]');
    const next: AccountingEntry[] = [];
    accountEls.forEach((accEl) => {
      const [side, idxStr] = accEl.getAttribute("data-arg")!.split(":");
      const amtEl = [...amountEls].find((a) => a.getAttribute("data-arg") === `${side}:${idxStr}`);
      const account = accEl.value;
      const amount = Number(amtEl?.value || 0);
      if (account && amount > 0) next.push({ side: side as "debit" | "credit", account, amount });
    });
    setAnswer({ kind: "accounting", entries: next });

    const debitSum = next.filter((e) => e.side === "debit").reduce((s, e) => s + e.amount, 0);
    const creditSum = next.filter((e) => e.side === "credit").reduce((s, e) => s + e.amount, 0);
    const balanced = debitSum > 0 && debitSum === creditSum;
    const notice = root.querySelector(".q-card .notice");
    if (notice) {
      notice.className = `notice ${balanced ? "good" : "info"} mt-16`;
      notice.innerHTML = `${icon(balanced ? "checkCircle" : "info")}<div>${
        balanced ? `Hai cột đã cân bằng: ${debitSum.toLocaleString()}` : `Debit ${debitSum.toLocaleString()} · Credit ${creditSum.toLocaleString()} — chưa cân bằng`
      }</div>`;
    }
  };
  root.querySelectorAll('[data-input="ledgerAccount"]').forEach((el) => el.addEventListener("change", ledgerHandler));
  root.querySelectorAll('[data-input="ledgerAmount"]').forEach((el) => el.addEventListener("input", ledgerHandler));
}

async function askSubmit(): Promise<void> {
  const r = rt!;
  const done = r.questions.filter((q) => isAnswered(q, r.answers[q.n])).length;
  const left = r.questions.length - done;
  const extra = left
    ? `<div class="notice warn mt-16">${icon("alert")}<div>Còn <strong>${left} câu</strong> chưa làm.</div></div>`
    : `<div class="notice good mt-16">${icon("checkCircle")}<div>Bạn đã trả lời hết <strong>${done} câu</strong>.</div></div>`;
  const ok = await confirmDialog({ title: "Nộp bài?", text: "Sau khi nộp, bài sẽ được chấm và bạn không sửa được nữa.", confirmLabel: "Nộp bài", cancelLabel: "Làm tiếp", extra });
  if (ok) finish(false);
}

async function exitExam(): Promise<void> {
  const r = rt!;
  const ok = await confirmDialog({ title: "Thoát khỏi bài làm?", text: "Bài làm được lưu lại — mở lại là học tiếp được.", confirmLabel: "Thoát", cancelLabel: "Ở lại" });
  if (!ok) return;
  persist();
  const path = r.exitPath;
  rt = null;
  navigate(path);
}

// ---------------------------------------------------------------- màn kết quả

function renderResult(root: HTMLElement): void {
  const r = rt!;
  const res = r.result!;
  setModuleTheme(r.moduleId);

  const rows = res.units
    .filter((u) => (r.reviewFilter === "wrong" ? u.correct === false : true))
    .map((u) => {
      const badgeCls = u.correct === null ? "skip" : u.correct ? "ok" : u.skipped ? "skip" : "no";
      const text = u.correct === null ? "Cần tự đối chiếu" : u.skipped ? "Bỏ trống" : u.correct ? "Đúng" : "Sai";
      return `<div class="review-row">
        <span class="review-badge ${badgeCls}">${icon(u.correct === null ? "pencil" : u.correct ? "check" : "close")}</span>
        <span class="review-main"><span class="review-stem">${esc(u.label)}</span><span class="review-meta">${text}</span></span>
      </div>`;
    })
    .join("");

  const content = `<div class="page-head"><div class="page">${crumbs([{ label: "Trang chủ", action: "go", arg: "/" }, { label: r.brandLabel, action: "go", arg: r.exitPath }, { label: "Kết quả" }])}</div></div>
    <div class="page page-body">
      <div class="result-hero anim-up">
        <div class="result-hero-text">
          <span class="badge ${res.passed ? "badge-good" : "badge-bad"} mb-12">${icon(res.passed ? "trophy" : "target")}${res.passed ? "Đạt" : "Chưa đạt"}</span>
          <h1>${res.pct}% — ${res.correct}/${res.gradable} câu tự chấm đúng</h1>
          ${res.ungradedWriting ? `<p>${res.ungradedWriting} phần Viết cần bạn tự đối chiếu với đáp án mẫu, không tính vào tỷ lệ trên.</p>` : ""}
        </div>
      </div>
      <div class="row-between mt-40 mb-16">
        <h2 class="card-title" style="font-size:20px">Xem lại bài làm</h2>
        <div class="segmented">
          <button class="${r.reviewFilter === "all" ? "is-active" : ""}" data-action="filter" data-arg="all">Tất cả</button>
          <button class="${r.reviewFilter === "wrong" ? "is-active" : ""}" data-action="filter" data-arg="wrong">Câu sai</button>
        </div>
      </div>
      <div>${rows}</div>
      <div class="result-actions mt-24">
        <button class="btn btn-outline" data-action="go" data-arg="${esc(r.exitPath)}">${icon("home")}Về trang chứng chỉ</button>
      </div>
    </div>`;

  root.innerHTML = renderPage({ content });
  bindShell(root, "", {
    filter: (v) => { r.reviewFilter = (v as typeof r.reviewFilter) ?? "all"; renderResult(root); },
  });
}

// ---------------------------------------------------------------- đăng ký route

export function registerRichExamRoutes(): void {
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
      const el = document.getElementById("richTimer");
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

export function hasLiveRichExam(moduleId: string, levelId?: string): boolean {
  if (!rt || rt.result || rt.moduleId !== moduleId) return false;
  return levelId === undefined || rt.levelId === levelId;
}

export function continueLiveRichExam(): void {
  if (rt && !rt.result) navigate(EXAM_PATH);
}

export { formatDuration };
