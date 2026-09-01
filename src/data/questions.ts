/**
 * Ngân hàng câu hỏi, đọc từ bảng `questions` trên Supabase.
 *
 * Mỗi chặng thi tải một lần rồi giữ lại trong bộ nhớ cho tới khi tải lại trang,
 * vì một bộ đề có thể tới cả nghìn câu và người học thường làm đi làm lại nhiều
 * lượt trên cùng bộ đó. PostgREST trả tối đa 1000 dòng mỗi lượt nên phải lấy
 * theo trang.
 */

import type {
  AccountingQuestion,
  EssayQuestion,
  ExamQuestion,
  FlashcardQuestion,
  ListeningQuestion,
  MatchingItem,
  MatchingQuestion,
  MultipleChoiceQuestion,
  ReadingQuestion,
  ReadingSubItem,
  WritingQuestion,
} from "../types/exam";
import { db } from "../services/supabase";

const PAGE = 1000;
const cache = new Map<string, ExamQuestion[]>();

type QuestionKind = "mc" | "essay" | "flashcard" | "listening" | "reading" | "writing" | "matching" | "accounting";

interface QuestionRow {
  module_id: string;
  level_id: string;
  stage_id: string;
  n: number;
  kind: QuestionKind;
  stem_en: string | null;
  stem_ja: string | null;
  options: { label: string; en: string; ja: string }[];
  answer: string | null;
  multi: boolean;
  domain: string | null;
  title: string | null;
  prompt: string | null;
  sub_questions: ({ id: string; prompt: string; referenceAnswer: string } | ReadingSubItem)[];
  required: boolean;
  topic_id: number | null;
  explanation: string | null;
  explanation_ja: string | null;
  explanation_vi: string | null;
  refs: { label: string; url: string }[];
  body_format: "plain" | "markdown";
  audio_url: string | null;
  difficulty: number | null;
  /** Dữ liệu riêng theo kind — xem chú thích trong supabase/schema.sql. */
  payload: Record<string, unknown>;
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
      subQuestions: Array.isArray(row.sub_questions)
        ? (row.sub_questions as { id: string; prompt: string; referenceAnswer: string }[])
        : [],
      required: !!row.required,
    };
    return essay;
  }
  if (row.kind === "listening") {
    const p = row.payload ?? {};
    const listening: ListeningQuestion = {
      kind: "listening",
      n: row.n,
      en: row.stem_en ?? "",
      ja: row.stem_ja ?? "",
      options: Array.isArray(row.options) ? row.options : [],
      answer: row.answer,
      multi: !!row.multi,
      audioUrl: row.audio_url ?? "",
      part: Number(p.part ?? 1),
      totalParts: Number(p.totalParts ?? 1),
      revealAfterAudio: !!p.revealAfterAudio,
      stageId: row.stage_id,
      domain: row.domain ?? undefined,
      topicId: row.topic_id,
      difficulty: row.difficulty ?? undefined,
    };
    return listening;
  }
  if (row.kind === "reading") {
    const p = row.payload ?? {};
    const reading: ReadingQuestion = {
      kind: "reading",
      n: row.n,
      passageEn: String(p.passageEn ?? ""),
      passageJa: String(p.passageJa ?? ""),
      title: row.title ?? undefined,
      subItems: Array.isArray(row.sub_questions) ? (row.sub_questions as ReadingSubItem[]) : [],
      stageId: row.stage_id,
      domain: row.domain ?? undefined,
      topicId: row.topic_id,
    };
    return reading;
  }
  if (row.kind === "writing") {
    const p = row.payload ?? {};
    const writing: WritingQuestion = {
      kind: "writing",
      n: row.n,
      title: row.title ?? `Câu ${row.n}`,
      prompt: row.prompt ?? "",
      minWords: Number(p.minWords ?? 0),
      sampleAnswer: typeof p.sampleAnswer === "string" ? p.sampleAnswer : undefined,
      stageId: row.stage_id,
    };
    return writing;
  }
  if (row.kind === "matching") {
    const p = row.payload ?? {};
    const matching: MatchingQuestion = {
      kind: "matching",
      n: row.n,
      title: row.title ?? `Câu ${row.n}`,
      prompt: row.prompt ?? "",
      items: Array.isArray(p.items) ? (p.items as MatchingItem[]) : [],
      stageId: row.stage_id,
    };
    return matching;
  }
  if (row.kind === "accounting") {
    const p = row.payload ?? {};
    const accounting: AccountingQuestion = {
      kind: "accounting",
      n: row.n,
      prompt: row.prompt ?? "",
      accounts: Array.isArray(p.accounts) ? (p.accounts as string[]) : [],
      correctEntries: Array.isArray(p.correctEntries) ? (p.correctEntries as AccountingQuestion["correctEntries"]) : [],
      stageId: row.stage_id,
    };
    return accounting;
  }
  const mc: MultipleChoiceQuestion = {
    kind: "mc",
    n: row.n,
    en: row.stem_en ?? "",
    ja: row.stem_ja ?? "",
    options: Array.isArray(row.options) ? row.options : [],
    answer: row.answer,
    multi: !!row.multi,
    stageId: row.stage_id,
    domain: row.domain ?? undefined,
    topicId: row.topic_id,
    explanation: row.explanation ?? undefined,
    explanationJa: row.explanation_ja ?? undefined,
    explanationVi: row.explanation_vi ?? undefined,
    refs: Array.isArray(row.refs) ? row.refs : [],
    bodyFormat: row.body_format ?? "plain",
    audioUrl: row.audio_url,
    difficulty: row.difficulty ?? undefined,
  };
  return mc;
}

/**
 * Tải toàn bộ câu hỏi của một chặng (bỏ trống `stageId` để lấy cả chứng chỉ).
 * `levelId` chỉ cần cho chứng chỉ có chia cấp (JLPT...) — bỏ trống với các
 * chứng chỉ còn lại, hành vi y hệt trước khi có tham số này.
 */
export async function loadQuestions(moduleId: string, stageId?: string, levelId?: string): Promise<ExamQuestion[]> {
  const key = `${moduleId}:${levelId ?? "*"}:${stageId ?? "*"}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const rows: QuestionRow[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = db().from("questions").select("*").eq("module_id", moduleId).order("n", { ascending: true });
    if (stageId) query = query.eq("stage_id", stageId);
    if (levelId) query = query.eq("level_id", levelId);

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
export async function loadMcQuestions(moduleId: string, stageId?: string, levelId?: string): Promise<MultipleChoiceQuestion[]> {
  const all = await loadQuestions(moduleId, stageId, levelId);
  return all.filter((q): q is MultipleChoiceQuestion => q.kind === "mc");
}

/** Chỉ lấy câu tự luận. */
export async function loadEssayQuestions(moduleId: string, stageId?: string, levelId?: string): Promise<EssayQuestion[]> {
  const all = await loadQuestions(moduleId, stageId, levelId);
  return all.filter((q): q is EssayQuestion => q.kind === "essay");
}

/** Chỉ lấy thẻ ghi nhớ. */
export async function loadFlashcards(moduleId: string, stageId?: string, levelId?: string): Promise<FlashcardQuestion[]> {
  const all = await loadQuestions(moduleId, stageId, levelId);
  return all.filter((q): q is FlashcardQuestion => q.kind === "flashcard");
}

/** Chỉ lấy câu Nghe. */
export async function loadListeningQuestions(moduleId: string, stageId?: string, levelId?: string): Promise<ListeningQuestion[]> {
  const all = await loadQuestions(moduleId, stageId, levelId);
  return all.filter((q): q is ListeningQuestion => q.kind === "listening");
}

/** Chỉ lấy bài Đọc. */
export async function loadReadingQuestions(moduleId: string, stageId?: string, levelId?: string): Promise<ReadingQuestion[]> {
  const all = await loadQuestions(moduleId, stageId, levelId);
  return all.filter((q): q is ReadingQuestion => q.kind === "reading");
}

/** Chỉ lấy câu Viết. */
export async function loadWritingQuestions(moduleId: string, stageId?: string, levelId?: string): Promise<WritingQuestion[]> {
  const all = await loadQuestions(moduleId, stageId, levelId);
  return all.filter((q): q is WritingQuestion => q.kind === "writing");
}

/** Chỉ lấy câu Ghép nối. */
export async function loadMatchingQuestions(moduleId: string, stageId?: string, levelId?: string): Promise<MatchingQuestion[]> {
  const all = await loadQuestions(moduleId, stageId, levelId);
  return all.filter((q): q is MatchingQuestion => q.kind === "matching");
}

/** Chỉ lấy câu bút toán (Boki). */
export async function loadAccountingQuestions(moduleId: string, stageId?: string, levelId?: string): Promise<AccountingQuestion[]> {
  const all = await loadQuestions(moduleId, stageId, levelId);
  return all.filter((q): q is AccountingQuestion => q.kind === "accounting");
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
    const { error } = await db().from("questions").upsert(slice, { onConflict: "module_id,level_id,stage_id,n" });
    if (error) throw new Error(error.message);
    onProgress?.(Math.min(i + CHUNK, rows.length), rows.length);
  }
  const moduleId = rows[0]?.module_id;
  if (typeof moduleId === "string") clearQuestionCache(moduleId);
  return rows.length;
}

/** Xoá câu hỏi của một chứng chỉ, có thể giới hạn theo cấp và/hoặc chặng thi. */
export async function deleteQuestions(moduleId: string, stageId?: string, levelId?: string): Promise<void> {
  let q = db().from("questions").delete().eq("module_id", moduleId);
  if (stageId) q = q.eq("stage_id", stageId);
  if (levelId) q = q.eq("level_id", levelId);
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
    if (key === moduleId || key.startsWith(`${moduleId}:`)) cache.delete(key);
  }
}
