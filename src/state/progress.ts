/**
 * Tiến trình học: lịch sử làm bài, câu đã lưu, ngân hàng câu sai.
 *
 * Dữ liệu nằm trên Supabase (bảng `attempts` và `question_state`) nên đổi máy
 * vẫn thấy nguyên tiến trình. Sau khi đăng nhập, `loadProgress()` kéo toàn bộ
 * về bộ nhớ một lần; từ đó mọi hàm đọc đều đồng bộ còn thao tác ghi thì cập
 * nhật bộ nhớ trước rồi đẩy lên máy chủ, để giao diện không phải chờ mạng.
 */

import { db } from "../services/supabase";
import { currentUserId } from "./auth";

export interface AttemptRecord {
  id: string;
  moduleId: string;
  stageId: string;
  label: string;
  at: number;
  correct: number;
  total: number;
  pct: number;
  durationSec: number;
  passed: boolean;
}

interface QuestionState {
  bookmarked: boolean;
  status: "wrong" | "mastered" | null;
}

let attempts: AttemptRecord[] = [];
const qstate = new Map<string, QuestionState>();
const pendingState = new Set<string>();
const listeners = new Set<() => void>();

const key = (moduleId: string, n: number) => `${moduleId}:${n}`;

export function onProgressChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(): void {
  listeners.forEach((fn) => fn());
}

function logFailure(what: string, error: unknown): void {
  // Lỗi đồng bộ không được làm hỏng buổi học: dữ liệu vẫn đúng trong bộ nhớ
  // của phiên hiện tại, chỉ là chưa lên được máy chủ.
  console.warn(`[tiến trình] không lưu được ${what}:`, error);
}

// ---------------------------------------------------------------- nạp dữ liệu

interface QuestionStateRow {
  module_id: string;
  question_n: number;
  bookmarked: boolean;
  status: "wrong" | "mastered" | null;
}

/**
 * PostgREST trả tối đa 1000 dòng mỗi lượt, mà một người học lâu năm có thể có
 * vài nghìn câu đã đánh dấu, nên phải lấy theo trang.
 */
async function fetchAllQuestionState(): Promise<QuestionStateRow[]> {
  const PAGE = 1000;
  const out: QuestionStateRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db()
      .from("question_state")
      .select("module_id, question_n, bookmarked, status")
      .order("module_id", { ascending: true })
      .order("question_n", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      logFailure("trạng thái câu hỏi", error);
      break;
    }
    out.push(...((data ?? []) as QuestionStateRow[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/** Kéo toàn bộ tiến trình của người đang đăng nhập về bộ nhớ. */
export async function loadProgress(): Promise<void> {
  attempts = [];
  qstate.clear();
  pendingState.clear();

  const uid = currentUserId();
  if (!uid) return;

  const [attemptRes, stateRows] = await Promise.all([
    db().from("attempts").select("*").order("taken_at", { ascending: false }).limit(200),
    fetchAllQuestionState(),
  ]);

  if (attemptRes.error) logFailure("lịch sử làm bài", attemptRes.error);
  else {
    attempts = (attemptRes.data ?? []).map((r) => ({
      id: r.id,
      moduleId: r.module_id,
      stageId: r.stage_id ?? "",
      label: r.label ?? "",
      at: new Date(r.taken_at).getTime(),
      correct: r.correct ?? 0,
      total: r.total ?? 0,
      pct: r.pct ?? 0,
      durationSec: r.duration_sec ?? 0,
      passed: !!r.passed,
    }));
  }

  for (const r of stateRows) {
    qstate.set(key(r.module_id, r.question_n), {
      bookmarked: !!r.bookmarked,
      status: r.status ?? null,
    });
  }
  notify();
}

export function clearProgressCache(): void {
  attempts = [];
  qstate.clear();
  pendingState.clear();
}

// ---------------------------------------------------------------- lịch sử

export function addAttempt(a: Omit<AttemptRecord, "id" | "at">): AttemptRecord {
  const record: AttemptRecord = {
    ...a,
    id: crypto.randomUUID(),
    at: Date.now(),
  };
  attempts = [record, ...attempts];
  notify();

  void db()
    .from("attempts")
    .insert({
      id: record.id,
      user_id: currentUserId(),
      module_id: record.moduleId,
      stage_id: record.stageId,
      label: record.label,
      correct: record.correct,
      total: record.total,
      pct: record.pct,
      duration_sec: record.durationSec,
      passed: record.passed,
      taken_at: new Date(record.at).toISOString(),
    })
    .then(({ error }) => error && logFailure("kết quả bài làm", error));

  return record;
}

export function getAttempts(moduleId?: string): AttemptRecord[] {
  return moduleId ? attempts.filter((a) => a.moduleId === moduleId) : attempts.slice();
}

export function deleteAttempt(id: string): void {
  attempts = attempts.filter((a) => a.id !== id);
  notify();
  void db()
    .from("attempts")
    .delete()
    .eq("id", id)
    .then(({ error }) => error && logFailure("xoá lịch sử", error));
}

export async function clearAttempts(): Promise<void> {
  attempts = [];
  notify();
  const { error } = await db().from("attempts").delete().eq("user_id", currentUserId());
  if (error) logFailure("xoá lịch sử", error);
}

// ---------------------------------------------------------------- câu đã lưu

function stateOf(moduleId: string, n: number): QuestionState {
  return qstate.get(key(moduleId, n)) ?? { bookmarked: false, status: null };
}

function setState(moduleId: string, n: number, patch: Partial<QuestionState>): void {
  const next = { ...stateOf(moduleId, n), ...patch };
  qstate.set(key(moduleId, n), next);
  pendingState.add(key(moduleId, n));
}

function numbersWhere(moduleId: string, test: (s: QuestionState) => boolean): number[] {
  const out: number[] = [];
  for (const [k, v] of qstate) {
    const [mid, n] = k.split(":");
    if (mid === moduleId && test(v)) out.push(Number(n));
  }
  return out.sort((a, b) => a - b);
}

export function getBookmarks(moduleId: string): number[] {
  return numbersWhere(moduleId, (s) => s.bookmarked);
}

export function isBookmarked(moduleId: string, n: number): boolean {
  return stateOf(moduleId, n).bookmarked;
}

export function toggleBookmark(moduleId: string, n: number): boolean {
  const next = !stateOf(moduleId, n).bookmarked;
  setState(moduleId, n, { bookmarked: next });
  flushAnswers();
  notify();
  return next;
}

// ---------------------------------------------------------------- câu sai / đã thuộc

export function getWrong(moduleId: string): number[] {
  return numbersWhere(moduleId, (s) => s.status === "wrong");
}

export function getMastered(moduleId: string): number[] {
  return numbersWhere(moduleId, (s) => s.status === "mastered");
}

/** Ghi nhận kết quả một câu. Gọi liên tiếp nhiều câu rồi `flushAnswers()` một lần. */
export function recordAnswer(moduleId: string, n: number, correct: boolean): void {
  setState(moduleId, n, { status: correct ? "mastered" : "wrong" });
}

/** Đẩy các thay đổi đang chờ lên máy chủ (gộp thành một lượt ghi). */
export function flushAnswers(): void {
  if (pendingState.size === 0) return;
  const uid = currentUserId();
  if (!uid) return;

  const rows = [...pendingState].map((k) => {
    const [moduleId, n] = k.split(":");
    const s = qstate.get(k)!;
    return {
      user_id: uid,
      module_id: moduleId,
      question_n: Number(n),
      bookmarked: s.bookmarked,
      status: s.status,
      updated_at: new Date().toISOString(),
    };
  });
  pendingState.clear();

  void db()
    .from("question_state")
    .upsert(rows, { onConflict: "user_id,module_id,question_n" })
    .then(({ error }) => error && logFailure("trạng thái câu hỏi", error));
}

export async function clearWrong(moduleId: string): Promise<void> {
  for (const n of getWrong(moduleId)) setState(moduleId, n, { status: null });
  flushAnswers();
  notify();
}

// ---------------------------------------------------------------- thống kê

export interface ModuleStats {
  attempts: number;
  bestPct: number;
  avgPct: number;
  lastPct: number | null;
  answeredQuestions: number;
  masteredCount: number;
  wrongCount: number;
  bookmarkCount: number;
  totalTimeSec: number;
}

export function getModuleStats(moduleId: string): ModuleStats {
  const list = getAttempts(moduleId);
  const pcts = list.map((a) => a.pct);
  return {
    attempts: list.length,
    bestPct: pcts.length ? Math.max(...pcts) : 0,
    avgPct: pcts.length ? Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length) : 0,
    lastPct: list.length ? list[0].pct : null,
    answeredQuestions: list.reduce((s, a) => s + a.total, 0),
    masteredCount: getMastered(moduleId).length,
    wrongCount: getWrong(moduleId).length,
    bookmarkCount: getBookmarks(moduleId).length,
    totalTimeSec: list.reduce((s, a) => s + a.durationSec, 0),
  };
}

export function getOverallStats(): { attempts: number; questions: number; timeSec: number; avgPct: number } {
  const pcts = attempts.map((a) => a.pct);
  return {
    attempts: attempts.length,
    questions: attempts.reduce((s, a) => s + a.total, 0),
    timeSec: attempts.reduce((s, a) => s + a.durationSec, 0),
    avgPct: pcts.length ? Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length) : 0,
  };
}

/** Xoá sạch tiến trình của người dùng hiện tại trên máy chủ. */
export async function resetProgress(): Promise<void> {
  const uid = currentUserId();
  attempts = [];
  qstate.clear();
  pendingState.clear();
  notify();
  if (!uid) return;
  const [a, b] = await Promise.all([
    db().from("attempts").delete().eq("user_id", uid),
    db().from("question_state").delete().eq("user_id", uid),
  ]);
  if (a.error) logFailure("xoá lịch sử", a.error);
  if (b.error) logFailure("xoá trạng thái câu hỏi", b.error);
}
