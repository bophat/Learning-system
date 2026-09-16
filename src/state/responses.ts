/**
 * Ghi lại từng lượt trả lời một câu.
 *
 * Đây là nguồn dữ liệu cho ba thứ: phân tích thời gian làm bài, biểu đồ năng lực
 * theo chủ đề, và thống kê độ khó câu hỏi. Ghi theo lô để một bài 65 câu không
 * tạo ra 65 lượt gọi mạng.
 */

import { db } from "../services/supabase";
import { currentUserId } from "./auth";

export type AnswerMode = "practice" | "exam" | "srs" | "flashcard";

export interface ResponseInput {
  moduleId: string;
  /** Cấp độ nếu chứng chỉ có chia cấp (JLPT N1..N5), bỏ trống nếu không. */
  levelId?: string;
  stageId?: string;
  questionN: number;
  /** Các ký tự đáp án đã chọn, ví dụ "AD". Bỏ trống nếu không trả lời. */
  chosen?: string;
  correct: boolean;
  /** Thời gian người học dừng ở câu này, tính bằng mili giây. */
  timeMs?: number;
  mode?: AnswerMode;
  attemptId?: string | null;
}

let buffer: ResponseInput[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

const FLUSH_DELAY_MS = 4000;
const MAX_BUFFER = 60;

function toRow(r: ResponseInput, uid: string) {
  return {
    user_id: uid,
    module_id: r.moduleId,
    level_id: r.levelId ?? "",
    stage_id: r.stageId ?? "",
    question_n: r.questionN,
    attempt_id: r.attemptId ?? null,
    chosen: r.chosen ?? null,
    correct: r.correct,
    time_ms: r.timeMs ?? null,
    mode: r.mode ?? "practice",
    answered_at: new Date().toISOString(),
  };
}

/** Xếp một lượt trả lời vào hàng chờ. Không chờ mạng, không chặn giao diện. */
export function logResponse(r: ResponseInput): void {
  if (!currentUserId()) return;
  buffer.push(r);
  if (buffer.length >= MAX_BUFFER) {
    flushResponses();
    return;
  }
  if (timer) clearTimeout(timer);
  timer = setTimeout(flushResponses, FLUSH_DELAY_MS);
}

/** Đẩy ngay mọi lượt đang chờ. Gọi khi nộp bài hoặc rời màn làm bài. */
export function flushResponses(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const uid = currentUserId();
  if (!uid || buffer.length === 0) return;

  const rows = buffer.map((r) => toRow(r, uid));
  buffer = [];

  void db()
    .from("responses")
    .insert(rows)
    .then(({ error }) => error && console.warn("[lượt trả lời] không lưu được:", error));
}

// ---------------------------------------------------------------- đọc lại để phân tích

export interface QuestionTiming {
  questionN: number;
  attempts: number;
  correct: number;
  pct: number;
  avgTimeMs: number;
}

/** Tổng hợp theo từng câu cho người đang đăng nhập. `levelId` bỏ trống thì
 * gộp mọi cấp — truyền cụ thể để chỉ xem một cấp (JLPT N1, N2...). */
export async function loadMyResponseStats(moduleId: string, levelId?: string): Promise<QuestionTiming[]> {
  const uid = currentUserId();
  if (!uid) return [];

  const rows: { question_n: number; correct: boolean; time_ms: number | null }[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let query = db()
      .from("responses")
      .select("question_n, correct, time_ms")
      .eq("user_id", uid)
      .eq("module_id", moduleId);
    if (levelId !== undefined) query = query.eq("level_id", levelId);
    const { data, error } = await query.range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  const acc = new Map<number, { attempts: number; correct: number; timeSum: number; timeCount: number }>();
  for (const r of rows) {
    const cur = acc.get(r.question_n) ?? { attempts: 0, correct: 0, timeSum: 0, timeCount: 0 };
    cur.attempts += 1;
    if (r.correct) cur.correct += 1;
    if (r.time_ms != null) {
      cur.timeSum += r.time_ms;
      cur.timeCount += 1;
    }
    acc.set(r.question_n, cur);
  }

  return [...acc.entries()]
    .map(([questionN, v]) => ({
      questionN,
      attempts: v.attempts,
      correct: v.correct,
      pct: Math.round((v.correct / v.attempts) * 100),
      avgTimeMs: v.timeCount ? Math.round(v.timeSum / v.timeCount) : 0,
    }))
    .sort((a, b) => a.questionN - b.questionN);
}

/** Tổng số lượt trả lời của người dùng (dùng cho huy hiệu). */
export async function countMyResponses(): Promise<number> {
  const uid = currentUserId();
  if (!uid) return 0;
  const { count, error } = await db()
    .from("responses")
    .select("id", { count: "exact", head: true })
    .eq("user_id", uid);
  if (error) return 0;
  return count ?? 0;
}
