/**
 * Lịch ôn lặp lại ngắt quãng, nối thuật toán SM-2 (`src/lib/srs.ts`) với CSDL.
 *
 * Trạng thái mỗi thẻ nằm chung bảng `question_state` với đánh dấu và ngân hàng
 * câu sai — một câu hỏi chỉ có một dòng trạng thái cho mỗi người học. Khoá đủ
 * bốn phần module + cấp độ + chặng thi + số câu, để câu trùng số ở cấp/chặng
 * khác nhau (JLPT N1 câu 1 và N3 câu 1...) không ghi đè lịch ôn của nhau.
 */

import type { MultipleChoiceQuestion, ExamQuestion } from "../types/exam";
import { db } from "../services/supabase";
import { currentUserId } from "./auth";
import { newCard, review, isDue, previewIntervals, type SrsCard, type SrsGrade } from "../lib/srs";

export type { SrsGrade, SrsCard } from "../lib/srs";

const cards = new Map<string, SrsCard>();
let loadedModule: string | null = null;

const key = (moduleId: string, levelId: string, stageId: string, n: number) => `${moduleId} ${levelId} ${stageId} ${n}`;

function rowToCard(r: {
  srs_state: string;
  interval_days: number;
  ease: number;
  reps: number;
  lapses: number;
  due_at: string | null;
  last_reviewed_at: string | null;
}): SrsCard {
  return {
    state: (["new", "learning", "review", "relearning"].includes(r.srs_state) ? r.srs_state : "new") as SrsCard["state"],
    intervalDays: Number(r.interval_days) || 0,
    ease: Number(r.ease) || 2.5,
    reps: r.reps ?? 0,
    lapses: r.lapses ?? 0,
    dueAt: r.due_at ? Date.parse(r.due_at) : null,
    lastReviewedAt: r.last_reviewed_at ? Date.parse(r.last_reviewed_at) : null,
  };
}

/** Tải trạng thái ôn của một chứng chỉ (mọi cấp/chặng cùng lúc). Gọi khi mở màn ôn tập. */
export async function loadSrs(moduleId: string): Promise<void> {
  const uid = currentUserId();
  if (!uid) return;
  if (loadedModule === moduleId) return;

  const { data, error } = await db()
    .from("question_state")
    .select("level_id, stage_id, question_n, srs_state, interval_days, ease, reps, lapses, due_at, last_reviewed_at")
    .eq("user_id", uid)
    .eq("module_id", moduleId);
  if (error) throw new Error(error.message);

  cards.clear();
  for (const r of data ?? []) {
    cards.set(key(moduleId, r.level_id ?? "", r.stage_id ?? "", r.question_n), rowToCard(r));
  }
  loadedModule = moduleId;
}

export function getCard(moduleId: string, n: number, levelId = "", stageId = ""): SrsCard {
  return cards.get(key(moduleId, levelId, stageId, n)) ?? newCard();
}

/** Nhãn hiện trên bốn nút đánh giá, ví dụ "10 phút" / "3 ngày". */
export function gradeLabels(moduleId: string, n: number, levelId = "", stageId = ""): Record<SrsGrade, string> {
  return previewIntervals(getCard(moduleId, n, levelId, stageId));
}

export interface SrsCounts {
  due: number;
  fresh: number;
  learning: number;
  review: number;
  total: number;
}

/** Đếm số thẻ theo trạng thái trong một tập câu hỏi. */
export function countSrs(moduleId: string, questions: { n: number }[], levelId = "", stageId = "", now = Date.now()): SrsCounts {
  const counts: SrsCounts = { due: 0, fresh: 0, learning: 0, review: 0, total: questions.length };
  for (const q of questions) {
    const c = getCard(moduleId, q.n, levelId, stageId);
    if (c.state === "new") counts.fresh += 1;
    else if (c.state === "review") counts.review += 1;
    else counts.learning += 1;
    if (isDue(c, now)) counts.due += 1;
  }
  return counts;
}

/**
 * Lấy danh sách câu tới hạn ôn, xếp câu quá hạn lâu nhất lên trước và giới hạn
 * số câu mới mỗi phiên để buổi ôn không quá nặng.
 */
export function pickDue<T extends ExamQuestion>(
  moduleId: string,
  questions: T[],
  opts: { limit?: number; maxNew?: number; now?: number; levelId?: string; stageId?: string } = {}
): T[] {
  const now = opts.now ?? Date.now();
  const limit = opts.limit ?? 30;
  const maxNew = opts.maxNew ?? 10;
  const levelId = opts.levelId ?? "";
  const stageId = opts.stageId ?? "";

  const dueOld: { q: T; due: number }[] = [];
  const fresh: T[] = [];

  for (const q of questions) {
    const c = getCard(moduleId, q.n, levelId, stageId);
    if (c.state === "new") fresh.push(q);
    else if (isDue(c, now)) dueOld.push({ q, due: c.dueAt ?? 0 });
  }

  dueOld.sort((a, b) => a.due - b.due);
  const out = dueOld.slice(0, limit).map((x) => x.q);
  for (const q of fresh) {
    if (out.length >= limit || out.length - dueOld.length >= maxNew) break;
    out.push(q);
  }
  return out;
}

/** Ghi nhận một lượt ôn và tính lịch kế tiếp. Trả về thẻ sau khi cập nhật. */
export function gradeCard(moduleId: string, n: number, grade: SrsGrade, levelId = "", stageId = ""): SrsCard {
  const next = review(getCard(moduleId, n, levelId, stageId), grade);
  cards.set(key(moduleId, levelId, stageId, n), next);

  const uid = currentUserId();
  if (uid) {
    void db()
      .from("question_state")
      .upsert(
        {
          user_id: uid,
          module_id: moduleId,
          level_id: levelId,
          stage_id: stageId,
          question_n: n,
          srs_state: next.state,
          interval_days: next.intervalDays,
          ease: next.ease,
          reps: next.reps,
          lapses: next.lapses,
          due_at: next.dueAt ? new Date(next.dueAt).toISOString() : null,
          last_reviewed_at: next.lastReviewedAt ? new Date(next.lastReviewedAt).toISOString() : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,module_id,level_id,stage_id,question_n" }
      )
      .then(({ error }) => error && console.warn("[lịch ôn] không lưu được:", error));
  }
  return next;
}

/** Chọn thẻ ghi nhớ (kind = "flashcard") tới hạn. */
export function pickDueFlashcards(moduleId: string, all: ExamQuestion[], limit = 20, levelId = "", stageId = ""): ExamQuestion[] {
  return pickDue(moduleId, all.filter((q) => q.kind === "flashcard"), { limit, levelId, stageId });
}

/** Chọn câu trắc nghiệm tới hạn. */
export function pickDueQuestions(moduleId: string, all: MultipleChoiceQuestion[], limit = 30, levelId = "", stageId = ""): MultipleChoiceQuestion[] {
  return pickDue(moduleId, all, { limit, levelId, stageId });
}

export function clearSrsCache(): void {
  cards.clear();
  loadedModule = null;
}
