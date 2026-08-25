/**
 * Ngân hàng câu hỏi, đọc từ bảng `questions` trên Supabase.
 *
 * Mỗi chặng thi tải một lần rồi giữ lại trong bộ nhớ cho tới khi tải lại trang,
 * vì một bộ đề có thể tới cả nghìn câu và người học thường làm đi làm lại nhiều
 * lượt trên cùng bộ đó. PostgREST trả tối đa 1000 dòng mỗi lượt nên phải lấy
 * theo trang.
 */

import type { EssayQuestion, ExamQuestion, FlashcardQuestion, MultipleChoiceQuestion } from "../types/exam";
import { db } from "../services/supabase";

const PAGE = 1000;
const cache = new Map<string, ExamQuestion[]>();

interface QuestionRow {
  module_id: string;
  stage_id: string;
  n: number;
  kind: "mc" | "essay" | "flashcard";
  stem_en: string | null;
  stem_ja: string | null;
  options: { label: string; en: string; ja: string }[];
  answer: string | null;
  multi: boolean;
  domain: string | null;
  title: string | null;
  prompt: string | null;
  sub_questions: { id: string; prompt: string; referenceAnswer: string }[];
  required: boolean;
  topic_id: number | null;
  explanation: string | null;
  explanation_ja: string | null;
  refs: { label: string; url: string }[];
  body_format: "plain" | "markdown";
  audio_url: string | null;
  difficulty: number | null;
}

function toQuestion(row: QuestionRow): ExamQuestion {
  if (row.kind === "flashcard") {
    const card: FlashcardQuestion = {
      kind: "flashcard",
      n: row.n,
      front: row.stem_en ?? "",
      frontJa: row.stem_ja ?? "",
      back: row.prompt ?? "",
      domain: row.domain ?? undefined,
      topicId: row.topic_id,
      refs: Array.isArray(row.refs) ? row.refs : [],
      bodyFormat: row.body_format ?? "plain",
      audioUrl: row.audio_url,
    };
    return card;
  }
  if (row.kind === "essay") {
    const essay: EssayQuestion = {
      kind: "essay",
      n: row.n,
      title: row.title ?? `Câu ${row.n}`,
      prompt: row.prompt ?? "",
      subQuestions: Array.isArray(row.sub_questions) ? row.sub_questions : [],
      required: !!row.required,
    };
    return essay;
  }
  const mc: MultipleChoiceQuestion = {
    kind: "mc",
    n: row.n,
    en: row.stem_en ?? "",
    ja: row.stem_ja ?? "",
    options: Array.isArray(row.options) ? row.options : [],
    answer: row.answer,
    multi: !!row.multi,
    domain: row.domain ?? undefined,
    topicId: row.topic_id,
    explanation: row.explanation ?? undefined,
    explanationJa: row.explanation_ja ?? undefined,
    refs: Array.isArray(row.refs) ? row.refs : [],
    bodyFormat: row.body_format ?? "plain",
    audioUrl: row.audio_url,
    difficulty: row.difficulty ?? undefined,
  };
  return mc;
}

/** Tải toàn bộ câu hỏi của một chặng (bỏ trống `stageId` để lấy cả chứng chỉ). */
export async function loadQuestions(moduleId: string, stageId?: string): Promise<ExamQuestion[]> {
  const key = `${moduleId}:${stageId ?? "*"}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const rows: QuestionRow[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = db().from("questions").select("*").eq("module_id", moduleId).order("n", { ascending: true });
    if (stageId) query = query.eq("stage_id", stageId);

    const { data, error } = await query.range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as QuestionRow[]));
    if (!data || data.length < PAGE) break;
  }

  const list = rows.map(toQuestion);
  cache.set(key, list);
  return list;
}

/** Chỉ lấy câu trắc nghiệm — dùng cho các màn làm bài. */
export async function loadMcQuestions(moduleId: string, stageId?: string): Promise<MultipleChoiceQuestion[]> {
  const all = await loadQuestions(moduleId, stageId);
  return all.filter((q): q is MultipleChoiceQuestion => q.kind === "mc");
}

/** Chỉ lấy câu tự luận. */
export async function loadEssayQuestions(moduleId: string, stageId?: string): Promise<EssayQuestion[]> {
  const all = await loadQuestions(moduleId, stageId);
  return all.filter((q): q is EssayQuestion => q.kind === "essay");
}

/** Chỉ lấy thẻ ghi nhớ. */
export async function loadFlashcards(moduleId: string, stageId?: string): Promise<FlashcardQuestion[]> {
  const all = await loadQuestions(moduleId, stageId);
  return all.filter((q): q is FlashcardQuestion => q.kind === "flashcard");
}

/**
 * Ghi câu hỏi lên máy chủ theo lô. Dùng cho trang quản trị — nhờ đó tầng giao
 * diện không phải gọi thẳng Supabase, mọi truy cập dữ liệu đi qua đúng một lớp.
 * Trả về số câu đã ghi; `onProgress` để hiện tiến độ.
 */
export async function saveQuestions(
  rows: Record<string, unknown>[],
  onProgress?: (done: number, total: number) => void
): Promise<number> {
  const CHUNK = 400;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await db().from("questions").upsert(slice, { onConflict: "module_id,stage_id,n" });
    if (error) throw new Error(error.message);
    onProgress?.(Math.min(i + CHUNK, rows.length), rows.length);
  }
  const moduleId = rows[0]?.module_id;
  if (typeof moduleId === "string") clearQuestionCache(moduleId);
  return rows.length;
}

/** Xoá câu hỏi của một chứng chỉ, có thể giới hạn theo chặng thi. */
export async function deleteQuestions(moduleId: string, stageId?: string): Promise<void> {
  let q = db().from("questions").delete().eq("module_id", moduleId);
  if (stageId) q = q.eq("stage_id", stageId);
  const { error } = await q;
  if (error) throw new Error(error.message);
  clearQuestionCache(moduleId);
}

/** Xoá bộ nhớ đệm (sau khi admin nạp đề mới). */
export function clearQuestionCache(moduleId?: string): void {
  if (!moduleId) {
    cache.clear();
    return;
  }
  for (const key of [...cache.keys()]) {
    if (key.startsWith(`${moduleId}:`)) cache.delete(key);
  }
}
