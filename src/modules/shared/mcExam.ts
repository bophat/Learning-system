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

import type { Lang, MultipleChoiceQuestion, ChoiceOption } from "../../types/exam";
import { registerRoute, navigate } from "../../router";
import { bindActions, esc } from "../../components/bindActions";
import { icon } from "../../components/icons";
import { renderPage, bindShell, setModuleTheme } from "../../components/appShell";
import { confirmDialog, promptDialog } from "../../components/modal";
import { toast } from "../../components/toast";
import { formatClock, formatDateTime, formatDuration, percent, renderMarkdown } from "../../components/ui";
import { addAttempt, recordAnswer, flushAnswers, isBookmarked, toggleBookmark, getModuleStats, getWrong, getAttempts } from "../../state/progress";
import { logResponse, flushResponses } from "../../state/responses";
import { afterExamBookkeeping } from "../../state/habits";
import { saveSession, clearSession, flushSessions, type SavedSession } from "../../state/session";
import { hasNote, getNote, saveNote, loadNotes, loadComments, postComment } from "../../state/social";
import { preloadAnnotations } from "../../components/highlighter";
import { initTextHighlighter, openAnnotationsDrawer, loadAllAnnotations, destroyHighlighterUI } from "../../components/highlighter";
import { renderLockedAudioPlayer, bindLockedAudioPlayer } from "../../components/audioPlayer";
import { optionKey } from "../../lib/shuffle";

export type ExamMode = "practice" | "exam";

export interface ExamLaunch {
  moduleId: string;
  /** Cấp độ nếu chứng chỉ có chia cấp (JLPT N1..N5); rỗng nếu không. */
  levelId: string;
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
  /** Câu Nghe đã phát xong (chế độ thi thử) — không cho nghe lại. */
  audioPlayed: Set<number>;
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

/**
 * Tóm tắt cấu trúc đề + lưu ý riêng, hiện trong hộp thoại xác nhận trước khi
 * vào chế độ Thi thử — tương đương màn "S3: Trang tổng quan đề thi" trong
 * spec-ui-lam-bai-thi.md, gọn thành một bước xác nhận thay vì một route
 * riêng vì mọi module đều đi qua đúng một hàm `startExam` này.
 */
function buildExamBriefing(launch: ExamLaunch): string {
  const total = launch.questions.length;
  const hasAudio = launch.questions.some((q) => !!q.audioUrl);

  const factRow = (label: string, value: string) =>
    `<div class="row-between" style="padding:7px 0;border-bottom:1px solid var(--line)">
      <span class="text-sm text-muted">${esc(label)}</span><b class="nums">${esc(value)}</b>
    </div>`;

  const facts = [
    factRow("Số câu hỏi", `${total} câu`),
    factRow("Thời gian làm bài", launch.durationSec ? formatDuration(launch.durationSec) : "Không giới hạn"),
    factRow("Ngưỡng đậu tham chiếu", `${launch.passPct}%`),
  ].join("");

  const notes: string[] = [];
  if (launch.durationSec) notes.push("Hết giờ, bài sẽ tự động nộp — không mất dữ liệu đã làm.");
  if (hasAudio) notes.push("Có phần Nghe: mỗi đoạn audio chỉ phát được một lần, không tua/nghe lại được. Chuẩn bị tai nghe trước khi bắt đầu.");
  notes.push("Có thể nhảy tự do giữa các câu và đánh dấu (cờ) câu cần xem lại trước khi nộp.");

  const notesHtml = `<ul style="margin:12px 0 0;padding-left:18px;font-size:13px;line-height:1.7;color:var(--ink-2)">
    ${notes.map((n) => `<li>${esc(n)}</li>`).join("")}
  </ul>`;

  return `<div class="card card-pad" style="background:var(--surface-2);border:1px solid var(--line);margin:4px 0 0">${facts}</div>${notesHtml}`;
}

/** Chỉ chặn ở chế độ Thi thử — luyện tập không có gì rủi ro (chấm ngay từng câu, không khoá audio) nên vào thẳng. */
async function confirmExamStart(launch: ExamLaunch): Promise<boolean> {
  if (launch.mode !== "exam") return true;
  return confirmDialog({
    title: `Bắt đầu ${launch.label}?`,
    text: "Đề mô phỏng đúng điều kiện phòng thi thật — kiểm tra lại thời gian và (nếu có phần Nghe) tai nghe trước khi bắt đầu, vì không quay lại sửa được sau khi nộp.",
    confirmLabel: "Bắt đầu làm bài",
    cancelLabel: "Để sau",
    extra: buildExamBriefing(launch),
  });
}

export function startExam(launch: ExamLaunch): void {
  void beginExam(launch);
}

async function beginExam(launch: ExamLaunch): Promise<void> {
  const ok = await confirmExamStart(launch);
  if (!ok) return;

  rt = {
    ...launch,
    idx: 0,
    answers: {},
    checked: new Set(),
    flags: new Set(),
    audioPlayed: new Set(),
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
  // Nếu câu hỏi đã bị tráo đáp án lúc bắt đầu bài (vd module AWS — xem
  // lib/shuffle.ts), ngân hàng đề gốc (ctx.pool) vẫn giữ thứ tự CHƯA tráo.
  // Phải áp lại đúng options/answer đã lưu trong phiên, không thì phương án
  // hiện ra sẽ về đúng thứ tự gốc trong khi đáp án đã chọn (theo nhãn cũ)
  // bị chấm nhầm sang phương án khác — sai lệch y hệt lỗi người dùng báo.
  const snapshotByN = new Map((saved.optionsSnapshot ?? []).map((s) => [s.n, s]));
  const questions = saved.qNums
    .map((n) => {
      const base = byNum.get(n);
      if (!base) return undefined;
      const snap = snapshotByN.get(n);
      return snap ? { ...base, options: snap.options, answer: snap.answer } : base;
    })
    .filter((q): q is MultipleChoiceQuestion => !!q);
  if (questions.length !== saved.qNums.length || questions.length === 0) return false;

  const answers: Record<number, string[]> = {};
  for (const [k, v] of Object.entries(saved.answers)) answers[Number(k)] = v;

  rt = {
    moduleId: saved.moduleId,
    levelId: saved.levelId,
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
    audioPlayed: new Set(saved.audioPlayed ?? []),
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
    levelId: rt.levelId,
    stageId: rt.stageId,
    label: rt.label,
    mode: rt.mode,
    qNums: rt.questions.map((q) => q.n),
    idx: rt.idx,
    answers,
    checked: [...rt.checked],
    flags: [...rt.flags],
    audioPlayed: [...rt.audioPlayed],
    // Ghi lại đúng thứ tự phương án + đáp án đúng đang hiển thị (đã tráo hay
    // chưa tuỳ module) — xem giải thích ở resumeExam().
    optionsSnapshot: rt.questions.map((q) => ({ n: q.n, options: q.options, answer: q.answer })),
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
  result.perQuestion.forEach((p) => recordAnswer(r.moduleId, p.n, p.isCorrect, r.levelId, r.stageId));
  flushAnswers();

  // Chế độ thi thử chấm một lượt ở cuối nên tới đây mới ghi được từng lượt trả
  // lời; chế độ luyện tập đã ghi ngay lúc bấm Kiểm tra. Câu bỏ trống không ghi,
  // vì "không làm" khác với "làm sai" khi tính độ khó câu hỏi.
  if (r.mode === "exam") {
    for (const p of result.perQuestion) {
      if (p.skipped) continue;
      logResponse({
        moduleId: r.moduleId,
        levelId: r.levelId,
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
    levelId: r.levelId,
    stageId: r.stageId,
    label: `${r.label} · ${result.total} câu`,
    correct: result.correct,
    total: result.total,
    pct: result.pct,
    durationSec: result.durationSec,
    passed: result.passed,
  });

  // Cộng ngày học và xét huy hiệu ở nền, không chặn màn kết quả.
  const stats = getModuleStats(r.moduleId, r.levelId);
  void afterExamBookkeeping({
    moduleId: r.moduleId,
    passPct: r.passPct,
    mode: r.mode,
    total: result.total,
    durationSec: result.durationSec,
    bestPct: Math.max(stats.bestPct, attempt.pct),
    examAttempts: getAttempts(r.moduleId, r.levelId).filter((a) => a.stageId !== "practice").length,
    wrongCount: getWrong(r.moduleId, r.levelId).length,
  }).then((earned) => {
    if (earned.length) toast(`Nhận huy hiệu mới: ${earned.length} cái. Xem ở trang Tiến trình.`, "good", 4000);
  });

  clearSession(r.moduleId, r.levelId);
  navigate(RESULT_PATH);
  if (auto) toast("Hết giờ — bài thi đã được nộp tự động.", "bad", 3600);
}

// ---------------------------------------------------------------- màn làm bài

function currentQuestion(): MultipleChoiceQuestion {
  return rt!.questions[rt!.idx];
}

export interface StemParts {
  instruction: string;
  passage: string;
  passageTitle: string;
  transcript: string;
  question: string;
}

export function parseStem(raw: string): StemParts {
  let instruction = "";
  let passage = "";
  let passageTitle = "";
  let transcript = "";
  let question = (raw || "").trim();

  // 1. IELTS Reading: "📖 PASSAGE 1\n\nTitle\n\nBody...\n\n---\n\n..."
  const ieltsPassageMatch = question.match(
    /^📖\s*(PASSAGE\s*\d+|Bài đọc\s*\d*)[^\n]*\n+([\s\S]*?)(?=\n+---\n+|\n+\[Passage|\n+Statement|\n+Questions?\s*\d+|\n+❓|$)/i
  );
  if (ieltsPassageMatch) {
    const rawPassage = ieltsPassageMatch[2].trim();
    const lines = rawPassage.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length > 1 && lines[0].length < 100 && !lines[0].startsWith("A.") && !lines[0].startsWith("Paragraph")) {
      passageTitle = lines[0];
      passage = lines.slice(1).join("\n\n");
    } else {
      passage = rawPassage;
    }
    question = question.slice(ieltsPassageMatch[0].length).replace(/^---\s*/, "").trim();
  }

  // 2. Standard "📖 Bài đọc:"
  const standardPassageMatch = question.match(/📖\s*Bài đọc:\s*\n([\s\S]*?)(?=\n\n(?:🎧|❓|【|$))/i);
  if (standardPassageMatch) {
    passage = standardPassageMatch[1].trim();
    question = question.replace(standardPassageMatch[0], "").trim();
  }

  // 3. Instructions
  const ieltsInstrMatch = question.match(
    /^(Do the following statements agree with the information given[\s\S]*?NOT GIVEN[^\n]*)\s*/is
  );
  if (ieltsInstrMatch) {
    instruction = ieltsInstrMatch[1].trim();
    question = question.slice(ieltsInstrMatch[0].length).trim();
  }

  const instrBracketMatch = question.match(/^【(.*?)】\s*/s);
  if (instrBracketMatch) {
    instruction = instrBracketMatch[1].trim();
    question = question.slice(instrBracketMatch[0].length).trim();
  }

  // 4. Transcript
  const scriptMatch = question.match(/🎧\s*Lời thoại bài nghe:\s*\n([\s\S]*?)(?=\n\n(?:❓|$))/i);
  if (scriptMatch) {
    transcript = scriptMatch[1].trim();
    question = question.replace(scriptMatch[0], "").trim();
  }

  question = question
    .replace(/^❓\s*(?:Câu hỏi:\s*)?/i, "")
    .replace(/^\[Passage\s*\d+\]\s*/i, "")
    .trim();

  return { instruction, passage, passageTitle, transcript, question };
}

export interface ExamPartSection {
  id: string;
  name: string;
  shortName: string;
  startIdx: number;
  endIdx: number;
  questions: MultipleChoiceQuestion[];
}

export function getExamParts(moduleId: string, levelId: string, questions: MultipleChoiceQuestion[]): ExamPartSection[] {
  const total = questions.length;
  if (!total) return [];

  // IELTS Reading (40 questions -> 3 Parts: 13, 13, 14)
  if (moduleId === "ielts" && (levelId === "reading" || total === 40)) {
    if (total === 40) {
      return [
        { id: "part-1", name: "Part 1 (1-13)", shortName: "Part 1", startIdx: 0, endIdx: 12, questions: questions.slice(0, 13) },
        { id: "part-2", name: "Part 2 (14-26)", shortName: "Part 2", startIdx: 13, endIdx: 25, questions: questions.slice(13, 26) },
        { id: "part-3", name: "Part 3 (27-40)", shortName: "Part 3", startIdx: 26, endIdx: 39, questions: questions.slice(26, 40) },
      ];
    }
  }

  // IELTS Listening (40 questions -> 4 Parts: 10, 10, 10, 10)
  if (moduleId === "ielts" && levelId === "listening") {
    if (total === 40) {
      return [
        { id: "part-1", name: "Part 1 (1-10)", shortName: "Part 1", startIdx: 0, endIdx: 9, questions: questions.slice(0, 10) },
        { id: "part-2", name: "Part 2 (11-20)", shortName: "Part 2", startIdx: 10, endIdx: 19, questions: questions.slice(10, 20) },
        { id: "part-3", name: "Part 3 (21-30)", shortName: "Part 3", startIdx: 20, endIdx: 29, questions: questions.slice(20, 30) },
        { id: "part-4", name: "Part 4 (31-40)", shortName: "Part 4", startIdx: 30, endIdx: 39, questions: questions.slice(30, 40) },
      ];
    }
  }

  // TOEIC Reading (100 questions -> Part 5 (30), Part 6 (16), Part 7 (54))
  if (moduleId === "toeic" && levelId === "reading" && total === 100) {
    return [
      { id: "part-5", name: "Part 5 (101-130)", shortName: "Part 5", startIdx: 0, endIdx: 29, questions: questions.slice(0, 30) },
      { id: "part-6", name: "Part 6 (131-146)", shortName: "Part 6", startIdx: 30, endIdx: 45, questions: questions.slice(30, 46) },
      { id: "part-7", name: "Part 7 (147-200)", shortName: "Part 7", startIdx: 46, endIdx: 99, questions: questions.slice(46, 100) },
    ];
  }

  // TOEIC Listening (100 questions -> Part 1 (6), Part 2 (25), Part 3 (39), Part 4 (30))
  if (moduleId === "toeic" && levelId === "listening" && total === 100) {
    return [
      { id: "part-1", name: "Part 1 (1-6)", shortName: "Part 1", startIdx: 0, endIdx: 5, questions: questions.slice(0, 6) },
      { id: "part-2", name: "Part 2 (7-31)", shortName: "Part 2", startIdx: 6, endIdx: 30, questions: questions.slice(6, 31) },
      { id: "part-3", name: "Part 3 (32-70)", shortName: "Part 3", startIdx: 31, endIdx: 69, questions: questions.slice(31, 70) },
      { id: "part-4", name: "Part 4 (71-100)", shortName: "Part 4", startIdx: 70, endIdx: 99, questions: questions.slice(70, 100) },
    ];
  }

  // Grouping by Domain
  const domainMap = new Map<string, { start: number; end: number; qs: MultipleChoiceQuestion[] }>();
  questions.forEach((q, idx) => {
    const d = q.domain || "Phần thi";
    if (!domainMap.has(d)) {
      domainMap.set(d, { start: idx, end: idx, qs: [] });
    }
    const item = domainMap.get(d)!;
    item.end = idx;
    item.qs.push(q);
  });
  if (domainMap.size > 1 && domainMap.size <= 8) {
    return Array.from(domainMap.entries()).map(([name, val], i) => ({
      id: `sec-${i + 1}`,
      name: `${name} (${val.start + 1}-${val.end + 1})`,
      shortName: name,
      startIdx: val.start,
      endIdx: val.end,
      questions: val.qs,
    }));
  }

  // Fallback: If >= 30 questions, split into balanced parts
  if (total >= 30) {
    const chunkSize = total <= 50 ? Math.ceil(total / 3) : Math.ceil(total / 4);
    const parts: ExamPartSection[] = [];
    for (let i = 0; i < total; i += chunkSize) {
      const end = Math.min(i + chunkSize - 1, total - 1);
      const partNum = Math.floor(i / chunkSize) + 1;
      parts.push({
        id: `part-${partNum}`,
        name: `Part ${partNum} (${i + 1}-${end + 1})`,
        shortName: `Part ${partNum}`,
        startIdx: i,
        endIdx: end,
        questions: questions.slice(i, end + 1),
      });
    }
    return parts;
  }

  return [
    {
      id: "part-1",
      name: `Phần 1 (1-${total})`,
      shortName: "Phần 1",
      startIdx: 0,
      endIdx: total - 1,
      questions,
    },
  ];
}

function stemOf(q: MultipleChoiceQuestion, lang: Lang): string {
  if (lang === "vi") return q.vi || q.en;
  if (lang === "ja") return q.ja || q.en;
  return q.en;
}

function optText(o: ChoiceOption, lang: Lang): string {
  if (lang === "vi") return o.vi || o.en;
  if (lang === "ja") return o.ja || o.en;
  return o.en;
}

function optWhy(o: ChoiceOption, lang: Lang): string {
  if (lang === "vi") return o.why_vi || o.why || "";
  if (lang === "ja") return o.why_ja || o.why || "";
  return o.why_en || o.why || "";
}

function getExplanationText(q: MultipleChoiceQuestion, lang: Lang): string {
  if (lang === "vi") return q.explanationVi || q.explanation || "";
  if (lang === "ja") return q.explanationJa || q.explanation || "";
  return q.explanation || q.explanationVi || "";
}

function timerClass(remaining: number | null): string {
  if (remaining === null) return "";
  if (remaining <= 60) return "is-low";
  if (remaining <= 300) return "is-warn";
  return "";
}

function renderExamBar(): string {
  const r = rt!;
  const timerIcon = r.remaining !== null && r.remaining <= 300 ? "alertTriangle" : "clock";
  const timer =
    r.remaining !== null
      ? `<div class="cbt-timer ${timerClass(r.remaining)}" id="examTimer">${icon(timerIcon)}<span>${formatClock(r.remaining)}</span></div>`
      : `<div class="cbt-timer" id="examTimer">${icon("clock")}<span>${formatClock(r.elapsed)}</span></div>`;

  const langToggle = `<div class="segmented sm hide-sm" style="margin-right:8px">
    <button class="${r.lang === "vi" ? "is-active" : ""}" data-action="lang" data-arg="vi" title="Xem tiếng Việt">🇻🇳 VI</button>
    <button class="${r.lang === "en" ? "is-active" : ""}" data-action="lang" data-arg="en" title="Xem tiếng Anh">🇬🇧 EN</button>
    <button class="${r.lang === "ja" ? "is-active" : ""}" data-action="lang" data-arg="ja" title="Xem tiếng Nhật">🇯🇵 JA</button>
  </div>`;

  const annList = loadAllAnnotations(r.moduleId, r.stageId);
  const notesBtn = `<button class="btn btn-ghost btn-sm" data-action="openAnnotations" title="Sổ tay ghi chú &amp; từ vựng">
    ${icon("edit3")}
    <span class="hide-sm">Ghi chú</span>
    ${annList.length ? `<span class="badge badge-brand sm nums" id="examNoteBadge" style="margin-left:4px">${annList.length}</span>` : `<span class="badge badge-outline sm nums" id="examNoteBadge" style="margin-left:4px;display:none"></span>`}
  </button>`;

  return `<header class="cbt-header">
    <div class="cbt-header-left">
      ${icon("bookOpen")}
      <span class="cbt-header-title">${esc(r.label)}</span>
    </div>
    <div class="cbt-header-center">
      ${timer}
    </div>
    <div class="cbt-header-right">
      ${notesBtn}
      ${langToggle}
      <button class="cbt-btn-submit" data-action="askSubmit">${icon("send")}<span>Nộp bài</span></button>
      <button class="cbt-btn-exit" data-action="exit">${icon("arrowLeft")}<span>Thoát</span></button>
    </div>
  </header>`;
}

function renderPartStrip(parts: ExamPartSection[]): string {
  const r = rt!;
  if (!parts.length || parts.length <= 1) return "";

  const pills = parts
    .map((p) => {
      const isActive = r.idx >= p.startIdx && r.idx <= p.endIdx;
      const doneInPart = p.questions.filter((q) => (r.answers[q.n] ?? []).length > 0).length;
      return `<button class="cbt-part-pill ${isActive ? "is-active" : ""}" data-action="goto" data-arg="${p.startIdx}">
        <span>${esc(p.shortName)}</span>
        <span class="badge badge-outline sm nums" style="border-radius:var(--r-pill);padding:1px 7px;font-size:11px">${doneInPart}/${p.questions.length}</span>
      </button>`;
    })
    .join("");

  return `<nav class="cbt-part-strip">${pills}</nav>`;
}

function renderPalette(parts: ExamPartSection[]): string {
  const r = rt!;
  const doneCount = Object.values(r.answers).filter((a) => a.length > 0).length;
  const pct = percent(doneCount, r.questions.length);

  const sectionsHtml = parts
    .map((p) => {
      const cells = p.questions
        .map((q, localIdx) => {
          const globalIdx = p.startIdx + localIdx;
          const answered = (r.answers[q.n] ?? []).length > 0;
          const cls = [
            globalIdx === r.idx ? "is-current" : "",
            answered && globalIdx !== r.idx ? "is-done" : "",
            r.flags.has(q.n) ? "is-flagged" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return `<button class="cbt-pnum-cell ${cls}" data-action="goto" data-arg="${globalIdx}" title="Câu ${globalIdx + 1}">${globalIdx + 1}</button>`;
        })
        .join("");

      return `<div>
        <div class="cbt-part-group-title">
          <span>${esc(p.name)}</span>
        </div>
        <div class="cbt-pnum-grid">${cells}</div>
      </div>`;
    })
    .join("");

  return `<aside class="cbt-sidebar-pane ${r.paletteOpen ? "is-open" : ""}">
    <div class="cbt-palette-handle" data-action="togglePalette"></div>
    <div class="cbt-progress-header">
      <span class="cbt-progress-title">Tiến độ làm bài</span>
      <div class="row gap-8" style="align-items:center">
        <span class="cbt-progress-stat">${doneCount}/${r.questions.length} (${pct}%)</span>
        <button class="icon-btn only-sm" style="width:28px;height:28px" data-action="togglePalette" aria-label="Đóng bảng câu hỏi">${icon("close")}</button>
      </div>
    </div>
    ${sectionsHtml}
    <div class="cbt-legend-box">
      <div class="cbt-legend-item">
        <span class="cbt-legend-dot answered"></span>
        <span>Đã trả lời (${doneCount})</span>
      </div>
      <div class="cbt-legend-item">
        <span class="cbt-legend-dot unanswered"></span>
        <span>Chưa trả lời (${r.questions.length - doneCount})</span>
      </div>
      <div class="cbt-legend-item">
        <span class="cbt-legend-dot flagged"></span>
        <span>Đã cắm cờ (${r.flags.size})</span>
      </div>
    </div>
  </aside>`;
}

/** Đổi định danh cố định (id) về đúng nhãn A/B/C... đang hiển thị của câu này — dùng khi in ra chữ cho người đọc. */
function keyToLabel(q: MultipleChoiceQuestion, key: string): string {
  return q.options.find((o) => optionKey(o) === key)?.label ?? key;
}

function renderQuestionContent(q: MultipleChoiceQuestion, parsed: StemParts, _partNumber: number): string {
  const r = rt!;
  const picked = r.answers[q.n] ?? [];
  const isChecked = r.mode === "practice" && r.checked.has(q.n);
  // "answer" (và giá trị lưu trong r.answers) là ĐỊNH DANH CỐ ĐỊNH của phương
  // án, không phải nhãn A/B/C hiện hiển thị — xem lib/shuffle.ts#optionKey.
  const answerKeys = (q.answer ?? "").split("");
  const marked = isBookmarked(r.moduleId, q.n, r.levelId, r.stageId);

  // Check if options fit in horizontal pill format (e.g. TRUE/FALSE/NOT GIVEN or short options)
  const isPillMode = q.options.length <= 5 && q.options.every((o) => optText(o, r.lang).length <= 25);

  let optsHtml = "";
  if (isPillMode) {
    optsHtml = `<div class="cbt-opt-pill-row">${q.options
      .map((o) => {
        const isPicked = picked.includes(optionKey(o));
        const isRight = answerKeys.includes(optionKey(o));
        let cls = "";
        if (isChecked) {
          if (isRight) cls = "is-right";
          else if (isPicked) cls = "is-wrong";
          else cls = "is-dim";
        } else if (isPicked) {
          cls = "is-picked";
        }
        const action = isChecked ? "" : `data-action="pick" data-arg="${esc(o.label)}"`;
        return `<button class="cbt-pill-opt ${cls}" ${action}>
          <span>${esc(optText(o, r.lang))}</span>
        </button>`;
      })
      .join("")}</div>`;
  } else {
    optsHtml = `<div class="opt-list">${q.options
      .map((o) => {
        const isPicked = picked.includes(optionKey(o));
        const isRight = answerKeys.includes(optionKey(o));
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
        const whyText = optWhy(o, r.lang);
        const optWhyHtml = isChecked && whyText ? `<div class="text-xs text-muted mt-4">${renderMarkdown(whyText)}</div>` : "";
        return `<button class="opt ${q.multi ? "multi" : ""} ${cls} ${clickable}" ${action}>
          <span class="opt-mark">${esc(o.label)}</span>
          <div class="grow" style="min-width:0">
            <span class="opt-text">${esc(optText(o, r.lang))}</span>
            ${optWhyHtml}
          </div>
          ${flag}
        </button>`;
      })
      .join("")}</div>`;
  }

  let verdict = "";
  if (isChecked) {
    const ok = normalize(picked) === normalize(answerKeys);
    const expText = getExplanationText(q, r.lang);
    const refsHtml =
      q.refs && q.refs.length
        ? `<div class="mt-8 text-xs text-muted"><strong>Tham khảo:</strong> ${q.refs.map((rf) => `<a href="${esc(rf.url)}" target="_blank" rel="noopener noreferrer" class="link-text">${esc(rf.label || rf.url)}</a>`).join(" · ")}</div>`
        : "";
    const answerLabels = answerKeys.map((k) => keyToLabel(q, k));
    const pickedLabels = picked.map((k) => keyToLabel(q, k));

    verdict = `<div class="verdict ${ok ? "good" : "bad"}" style="margin-top:16px">
      ${icon(ok ? "checkCircle" : "xCircle")}
      <div>${ok ? "Chính xác!" : "Chưa đúng"}<small>Đáp án đúng: ${esc(answerLabels.join(", ") || "—")}${
        pickedLabels.length ? ` · Bạn chọn: ${esc(pickedLabels.join(", "))}` : ""
      }</small></div>
    </div>
    ${
      expText
        ? `<div class="card card-pad mt-12 mb-16" style="background:var(--surface-2);border-left:3px solid var(--brand)">
            <div class="row between gap-8 mb-12" style="align-items:center;flex-wrap:wrap">
              <div class="fw-700 text-sm" style="color:var(--brand)">${icon("info")} Giải thích chi tiết:</div>
              <div class="segmented xs">
                <button class="${r.lang === "vi" ? "is-active" : ""}" data-action="lang" data-arg="vi">🇻🇳 Tiếng Việt</button>
                <button class="${r.lang === "en" ? "is-active" : ""}" data-action="lang" data-arg="en">🇬🇧 English</button>
                <button class="${r.lang === "ja" ? "is-active" : ""}" data-action="lang" data-arg="ja">🇯🇵 日本語</button>
              </div>
            </div>
            <div class="text-sm" style="line-height:1.6">${renderMarkdown(expText)}</div>
            ${refsHtml}
          </div>`
        : ""
    }`;
  }

  const altStem =
    r.bilingual && r.showAlt
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

  const userHasNote = hasNote(r.moduleId, q.n, r.levelId, r.stageId);

  const instrHtml = parsed.instruction
    ? `<div class="cbt-group-box">
        <div class="cbt-group-title">${icon("info")}Hướng dẫn làm bài:</div>
        <div class="cbt-group-body">${renderMarkdown(parsed.instruction)}</div>
      </div>`
    : "";

  const transcriptHtml = parsed.transcript
    ? `<details class="transcript-collapse mb-16">
        <summary class="transcript-toggle">
          <span class="row gap-8" style="align-items:center">
            ${icon("volume")}
            <span>Lời thoại bài nghe (Transcript)</span>
          </span>
          <span class="badge badge-outline transcript-badge">Bấm để xem / ẩn lời thoại</span>
        </summary>
        <div class="transcript-body">${esc(parsed.transcript)}</div>
      </details>`
    : "";

  return `<div class="cbt-question-pane">
    ${instrHtml}
    <div class="cbt-q-item">
      <div class="cbt-q-header">
        <div class="row gap-10" style="align-items:center">
          <span class="cbt-q-num-badge">${r.idx + 1}</span>
          ${q.multi ? `<span class="badge badge-warn">${icon("check")}Chọn nhiều đáp án</span>` : ""}
          <span class="text-xs text-muted nums">Câu #${q.n}</span>
        </div>
        <div class="row gap-6">
          <button class="cbt-flag-toggle ${r.flags.has(q.n) ? "is-flagged" : ""}" data-action="flag">
            ${icon("flag")}<span>${r.flags.has(q.n) ? "Đã đánh dấu" : "Đánh dấu"}</span>
          </button>
          <button class="tool-btn ${userHasNote ? "is-on mark" : ""}" data-action="note" title="Ghi chú">${icon("pencil")}</button>
          <button class="tool-btn" data-action="discuss" title="Thảo luận">${icon("messageSquare")}</button>
          <button class="tool-btn ${marked ? "is-on mark" : ""}" data-action="bookmark" title="Lưu">${icon("bookmark")}</button>
        </div>
      </div>
      ${
        q.audioUrl
          ? r.mode === "exam"
            ? `<div class="mb-16">
                <div class="text-xs fw-700 mb-6 row gap-6" style="color:var(--brand)">${icon("volume")}Audio bài nghe</div>
                ${renderLockedAudioPlayer(q.n, q.audioUrl, r.audioPlayed.has(q.n))}
              </div>`
            : `<div class="audio-wrap mb-16" style="padding:12px 16px;background:var(--surface-2);border-radius:var(--r-md);border:1px solid var(--line)"><div class="text-xs fw-700 mb-6 row gap-6" style="color:var(--brand)">${icon("volume")}Audio bài nghe</div><audio controls src="${esc(q.audioUrl)}" style="width:100%;height:38px"></audio></div>`
          : ""
      }
      ${transcriptHtml}
      <div class="cbt-q-stem">${esc(parsed.question || stemOf(q, r.lang))}</div>
      ${altStem}
      ${optsHtml}
      ${verdict}
      <div class="q-nav mt-20 pt-16" style="border-top:1px solid var(--line)">
        <button class="btn btn-outline" data-action="prev" ${r.idx === 0 ? "disabled" : ""}>${icon("arrowLeft")}Câu trước</button>
        ${primary}
      </div>
    </div>
  </div>`;
}

function renderPassagePane(parsed: StemParts, partIndex: number): string {
  if (!parsed.passage) return "";
  const partTag = `📖 BÀI ĐỌC · PHẦN ${partIndex + 1}`;
  const title = parsed.passageTitle || "Nội dung bài đọc";

  return `<div class="cbt-passage-pane" id="cbtPassagePane">
    <div class="cbt-pane-tag">${icon("bookOpen")}${esc(partTag)}</div>
    <h2 class="cbt-passage-title">${esc(title)}</h2>
    <div class="cbt-passage-body" data-highlightable="true">${renderMarkdown(parsed.passage)}</div>
  </div>`;
}

function renderRun(root: HTMLElement): void {
  const r = rt!;
  setModuleTheme(r.moduleId);

  const parts = getExamParts(r.moduleId, r.levelId, r.questions);
  const currentPartIdx = parts.findIndex((p) => r.idx >= p.startIdx && r.idx <= p.endIdx);
  const partNum = currentPartIdx >= 0 ? currentPartIdx : 0;

  const q = currentQuestion();
  const parsed = parseStem(stemOf(q, r.lang));
  const hasPassage = !!parsed.passage;

  const passagePaneHtml = hasPassage ? renderPassagePane(parsed, partNum) : "";
  const questionPaneHtml = renderQuestionContent(q, parsed, partNum);
  const sidebarHtml = renderPalette(parts);
  const partStripHtml = renderPartStrip(parts);

  const gridClass = hasPassage ? "cbt-main-grid" : "cbt-main-grid no-passage";

  const mobileBarHtml = `<div class="palette-scrim ${r.paletteOpen ? "is-open" : ""}" data-action="togglePalette"></div>
    <div class="mobile-bar">
      <button class="btn btn-outline btn-sm btn-icon-only" data-action="prev" ${r.idx === 0 ? "disabled" : ""}>${icon("arrowLeft")}</button>
      <button class="btn btn-soft-accent btn-sm grow" data-action="togglePalette">${icon("grid")}Câu ${r.idx + 1}/${r.questions.length}</button>
      <button class="btn btn-outline btn-sm btn-icon-only" data-action="next" ${r.idx === r.questions.length - 1 ? "disabled" : ""}>${icon("arrowRight")}</button>
    </div>`;

  root.innerHTML = `<div class="cbt-app">
    ${renderExamBar()}
    ${partStripHtml}
    <main class="${gridClass}">
      ${passagePaneHtml}
      ${questionPaneHtml}
      ${sidebarHtml}
    </main>
    ${mobileBarHtml}
  </div>`;

  // Gắn player khoá tua cho câu Nghe ở chế độ thi thử — chỉ còn nút Phát nếu
  // câu này chưa nghe xong lần nào (đã nghe xong thì HTML không còn nút đó).
  if (q.audioUrl && r.mode === "exam" && !r.audioPlayed.has(q.n)) {
    bindLockedAudioPlayer(root, q.n, () => {
      r.audioPlayed.add(q.n);
      persist();
    });
  }

  // Initialize highlighter on passage pane if present
  if (hasPassage) {
    const passageEl = root.querySelector<HTMLElement>("#cbtPassagePane");
    if (passageEl) {
      initTextHighlighter({
        container: passageEl,
        moduleId: r.moduleId,
        levelId: r.levelId,
        stageId: r.stageId,
        questionN: q.n,
        onJumpToQuestion: (targetN) => {
          const targetIdx = r.questions.findIndex((it) => it.n === targetN);
          if (targetIdx >= 0) {
            accrueTime();
            r.idx = targetIdx;
            persist();
            renderRun(root);
            window.scrollTo({ top: 0 });
          }
        },
      });
    }
  }

  bindActions(root, {
    exit: () => void exitExam(),
    lang: (v) => { r.lang = v === "ja" ? "ja" : v === "en" ? "en" : "vi"; persist(); renderRun(root); },
    alt: () => { r.showAlt = !r.showAlt; renderRun(root); },
    bookmark: () => {
      const on = toggleBookmark(r.moduleId, currentQuestion().n, r.levelId, r.stageId);
      toast(on ? "Đã lưu câu hỏi." : "Đã bỏ lưu câu hỏi.", on ? "good" : "default", 1600);
      renderRun(root);
    },
    note: async () => {
      const curQ = currentQuestion();
      await loadNotes(r.moduleId);
      const currentNote = getNote(r.moduleId, curQ.n, r.levelId, r.stageId);
      const val = await promptDialog({
        title: `Ghi chú cá nhân — Câu #${curQ.n}`,
        text: "Ghi chú riêng tư chỉ mình bạn thấy:",
        defaultValue: currentNote,
        confirmLabel: "Lưu ghi chú",
      });
      if (val !== null) {
        await saveNote(r.moduleId, curQ.n, val, r.levelId, r.stageId);
        toast("Đã lưu ghi chú.", "good");
        renderRun(root);
      }
    },
    discuss: async () => {
      const curQ = currentQuestion();
      try {
        const comments = await loadComments(r.moduleId, curQ.n, r.levelId, r.stageId);
        const commentListHtml = comments.length
          ? comments.map((c) => `<div class="comment-box mb-8"><div class="comment-top"><span class="comment-author">${esc(c.authorName)}</span><span class="comment-time">${esc(formatDateTime(c.createdAt))}</span></div><div class="comment-content">${renderMarkdown(c.body)}</div></div>`).join("")
          : "Chưa có thảo luận nào cho câu này.";

        const newComment = await promptDialog({
          title: `Thảo luận cộng đồng — Câu #${curQ.n}`,
          text: `Đóng góp bình luận hoặc câu hỏi của bạn:\n\n${commentListHtml}`,
          defaultValue: "",
          confirmLabel: "Gửi thảo luận",
        });
        if (newComment && newComment.trim()) {
          await postComment(r.moduleId, curQ.n, newComment.trim(), undefined, r.levelId, r.stageId);
          toast("Đã gửi thảo luận.", "good");
        }
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), "bad");
      }
    },
    openAnnotations: () => {
      openAnnotationsDrawer(
        r.moduleId,
        r.stageId,
        (targetN) => {
          const targetIdx = r.questions.findIndex((it) => it.n === targetN);
          if (targetIdx >= 0) {
            accrueTime();
            r.idx = targetIdx;
            persist();
            renderRun(root);
            window.scrollTo({ top: 0 });
          }
        },
        r.levelId
      );
    },
    askSubmit: () => void askSubmit(),
    togglePalette: () => {
      r.paletteOpen = !r.paletteOpen;
      renderRun(root);
    },
    goto: (arg) => {
      const nextIdx = Number(arg);
      if (Number.isFinite(nextIdx) && nextIdx >= 0 && nextIdx < r.questions.length) {
        destroyHighlighterUI();
        accrueTime();
        r.idx = nextIdx;
        r.paletteOpen = false;
        r.shownAt = Date.now();
        persist();
        renderRun(root);
        window.scrollTo({ top: 0 });
      }
    },
    prev: () => {
      destroyHighlighterUI();
      move(-1);
      renderRun(root);
    },
    next: () => {
      destroyHighlighterUI();
      move(1);
      renderRun(root);
    },
    flag: () => {
      const curN = currentQuestion().n;
      if (r.flags.has(curN)) r.flags.delete(curN);
      else r.flags.add(curN);
      persist();
      renderRun(root);
    },
    pick: (letter) => {
      destroyHighlighterUI();
      if (letter) pick(letter);
      renderRun(root);
    },
    check: () => {
      destroyHighlighterUI();
      checkCurrent();
      renderRun(root);
    },
  });
}

/** `letter` là nhãn A/B/C đang hiển thị lúc bấm — lưu vào r.answers theo
 * định danh cố định (optionKey), không lưu thẳng nhãn, vì nhãn có thể đổi
 * sau này (tráo lại khi mở lại bài đang làm dở) trong khi lựa chọn của
 * người dùng thì không đổi. */
function pick(letter: string): void {
  const r = rt!;
  const q = currentQuestion();
  if (r.mode === "practice" && r.checked.has(q.n)) return;
  const opt = q.options.find((o) => o.label === letter);
  const key = opt ? optionKey(opt) : letter;
  const cur = r.answers[q.n] ?? [];
  if (q.multi) {
    r.answers[q.n] = cur.includes(key) ? cur.filter((l) => l !== key) : [...cur, key];
  } else {
    r.answers[q.n] = cur.length === 1 && cur[0] === key ? [] : [key];
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
  recordAnswer(r.moduleId, q.n, correct, r.levelId, r.stageId);
  flushAnswers();
  logResponse({
    moduleId: r.moduleId,
    levelId: r.levelId,
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
      const expText = getExplanationText(q, r.lang);
      const detail = open
        ? `<div class="opt-list mt-16">${q.options
            .map((o) => {
              const isRight = (p.answer || "").includes(optionKey(o));
              const isPicked = p.picked.includes(optionKey(o));
              const cls = isRight ? "is-right" : isPicked ? "is-wrong" : "is-dim";
              const flag = isRight
                ? `<span class="opt-flag">${icon("check")}Đáp án đúng</span>`
                : isPicked
                  ? `<span class="opt-flag">${icon("close")}Bạn chọn</span>`
                  : "";
              const whyText = optWhy(o, r.lang);
              const optWhyHtml = whyText ? `<div class="text-xs text-muted mt-4">${renderMarkdown(whyText)}</div>` : "";
              return `<div class="opt ${cls}">
                <span class="opt-mark">${esc(o.label)}</span>
                <div class="grow" style="min-width:0">
                  <span class="opt-text">${esc(optText(o, r.lang))}</span>
                  ${optWhyHtml}
                </div>
                ${flag}
              </div>`;
            })
            .join("")}</div>
          ${
            expText
              ? `<div class="card card-pad mt-12 mb-8" style="background:var(--surface-2);border-left:3px solid var(--brand)">
                  <div class="row between gap-8 mb-10" style="align-items:center;flex-wrap:wrap">
                    <div class="fw-700 text-sm" style="color:var(--brand)">${icon("info")} Giải thích chi tiết:</div>
                    <div class="segmented xs">
                      <button class="${r.lang === "vi" ? "is-active" : ""}" data-action="lang" data-arg="vi">🇻🇳 Tiếng Việt</button>
                      <button class="${r.lang === "en" ? "is-active" : ""}" data-action="lang" data-arg="en">🇬🇧 English</button>
                      <button class="${r.lang === "ja" ? "is-active" : ""}" data-action="lang" data-arg="ja">🇯🇵 日本語</button>
                    </div>
                  </div>
                  <div class="text-sm" style="line-height:1.6">${renderMarkdown(expText)}</div>
                </div>`
              : ""
          }`
        : "";

      return `<div class="review-row" style="flex-direction:column;align-items:stretch;animation:fade-up .3s var(--ease-out) both;animation-delay:${Math.min(i, 12) * 0.02}s">
        <button class="row gap-12" style="align-items:flex-start;text-align:left;width:100%" data-action="toggleReview" data-arg="${p.n}">
          <span class="review-badge ${badgeCls}">${order}</span>
          <span class="review-main">
            <span class="review-stem" style="display:block">${esc(stemOf(q, r.lang).slice(0, 190))}${
              stemOf(q, r.lang).length > 190 ? "…" : ""
            }</span>
            <span class="review-meta">
              <span>${p.skipped ? "<b>Bỏ trống</b>" : `Bạn chọn: <b class="${p.isCorrect ? "ok" : "no"}">${esc(p.picked.map((k) => keyToLabel(q, k)).join(", "))}</b>`}</span>
              <span>Đáp án: <b class="ok">${esc((p.answer ? [...p.answer].map((k) => keyToLabel(q, k)) : ["—"]).join(", "))}</b></span>
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

/**
 * Kết quả theo từng phần (Reading/Listening, hay theo domain) — chỉ hiện khi
 * đề có nhiều hơn 1 phần, tái dùng `getExamParts()` đã dùng để chia Question
 * Navigator lúc làm bài nên luôn khớp đúng cách chia đã hiển thị khi thi.
 * Chỉ mang tính thông tin (không có ngưỡng đậu riêng từng phần trong dữ liệu
 * hiện có) — không tự suy ra "đạt/chưa đạt" từng phần để tránh sai lệch.
 */
function renderResultBreakdown(): string {
  const r = rt!;
  const res = r.result!;
  const parts = getExamParts(r.moduleId, r.levelId, r.questions);
  if (parts.length <= 1) return "";

  const byN = new Map(res.perQuestion.map((p) => [p.n, p]));
  const rows = parts
    .map((part) => {
      const items = part.questions.map((q) => byN.get(q.n)).filter((p): p is PerQuestion => !!p);
      const correct = items.filter((p) => p.isCorrect).length;
      const total = items.length;
      const pct = percent(correct, total);
      return `<div class="mb-14">
        <div class="row-between mb-6"><span class="text-sm fw-700">${esc(part.shortName)}</span><span class="text-sm nums text-muted">${correct}/${total} câu · ${pct}%</span></div>
        <div class="bar"><i style="width:${pct}%"></i></div>
      </div>`;
    })
    .join("");

  return `<div class="card card-pad mb-16">
    <div class="card-title mb-14">Kết quả theo từng phần</div>
    ${rows}
  </div>`;
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

  const content = `<div class="page-narrow page-body">
    <div class="result-hero mb-24">
      <div class="result-score">
        <div class="ring lg ${tone}" style="--val:${res.pct}">
          <div class="ring-label">
            <span class="ring-num nums">${res.pct}%</span>
            <span class="ring-cap">${res.correct}/${res.total} câu</span>
          </div>
        </div>
      </div>
      <div class="result-text">
        <div class="badge badge-${tone} sm mb-8">${res.passed ? "ĐẠT" : "CHƯA ĐẠT"}</div>
        <h1 class="h2 mb-6">${headline}</h1>
        <p class="text-muted text-sm mb-16">${esc(sub)}</p>
        <div class="row gap-8" style="flex-wrap:wrap">
          <button class="btn btn-primary" data-action="retryWrong" ${wrongCount === 0 ? "disabled" : ""}>
            ${icon("rotateCcw")}Luyện lại ${wrongCount} câu sai
          </button>
          <a href="${esc(r.exitPath)}" class="btn btn-outline">${icon("arrowLeft")}Về trang chặng</a>
        </div>
      </div>
    </div>

    ${renderResultBreakdown()}

    <div class="card card-pad mb-16">
      <div class="row between gap-12 mb-12" style="align-items:center;flex-wrap:wrap">
        <div class="segmented sm">
          ${filters
            .map(
              ([k, label]) =>
                `<button class="${r.reviewFilter === k ? "is-active" : ""}" data-action="filter" data-arg="${k}">${esc(
                  label
                )}</button>`
            )
            .join("")}
        </div>
        <div class="segmented sm">
          <button class="${r.lang === "vi" ? "is-active" : ""}" data-action="lang" data-arg="vi">🇻🇳 VI</button>
          <button class="${r.lang === "en" ? "is-active" : ""}" data-action="lang" data-arg="en">🇬🇧 EN</button>
          <button class="${r.lang === "ja" ? "is-active" : ""}" data-action="lang" data-arg="ja">🇯🇵 JA</button>
        </div>
      </div>
      <div class="review-list">${reviewRows()}</div>
    </div>
  </div>`;

  root.innerHTML = renderPage({ content });

  bindShell(root, "", {
    filter: (v) => { r.reviewFilter = (v as typeof r.reviewFilter) ?? "all"; renderResult(root); },
    lang: (v) => { r.lang = (v === "ja" ? "ja" : v === "en" ? "en" : "vi"); persist(); renderResult(root); },
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
        levelId: r.levelId,
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

    // Không chặn màn hình chờ dữ liệu ghi chú — tô/xem ghi chú vẫn dùng được
    // ngay khi tải xong, chỉ là vài trăm mili giây đầu có thể chưa thấy.
    void preloadAnnotations(rt.moduleId, rt.stageId, rt.levelId);

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

/** Bài đang làm dở của module (và cấp độ, nếu có) này còn nằm trong bộ nhớ
 * không (chưa nộp). Bỏ trống `levelId` để chỉ kiểm tra theo module. */
export function hasLiveExam(moduleId: string, levelId?: string): boolean {
  if (!rt || rt.result || rt.moduleId !== moduleId) return false;
  return levelId === undefined || rt.levelId === levelId;
}

export function continueLiveExam(): void {
  if (rt && !rt.result) navigate(EXAM_PATH);
}
