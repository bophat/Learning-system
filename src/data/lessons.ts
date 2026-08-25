/**
 * Bài giảng lý thuyết — phần kiến thức nền trước khi vào làm đề.
 *
 * Nội dung viết bằng Markdown (cho phép bảng, khối mã, công thức LaTeX giữa
 * hai dấu `$`). Backend chỉ trả về chuỗi thô; việc dựng HTML từ Markdown là
 * phần của UI.
 */

import { db } from "../services/supabase";
import { currentUserId } from "../state/auth";

export interface Lesson {
  id: number;
  moduleId: string;
  topicId: number | null;
  slug: string;
  title: string;
  summary: string;
  body: string;
  bodyFormat: "markdown" | "plain";
  estMinutes: number;
  sortOrder: number;
  published: boolean;
  /** Trạng thái đọc của người đang đăng nhập. */
  progress: "chưa đọc" | "đang đọc" | "đã xong";
}

const cache = new Map<string, Lesson[]>();

/** Tải danh sách bài giảng của một chứng chỉ, kèm trạng thái đọc của người dùng. */
export async function loadLessons(moduleId: string): Promise<Lesson[]> {
  const hit = cache.get(moduleId);
  if (hit) return hit;

  const [lessonRes, progressRes] = await Promise.all([
    db().from("lessons").select("*").eq("module_id", moduleId).order("sort_order", { ascending: true }),
    db().from("lesson_progress").select("lesson_id, status").eq("user_id", currentUserId()),
  ]);
  if (lessonRes.error) throw new Error(lessonRes.error.message);

  const status = new Map<number, string>();
  for (const p of progressRes.data ?? []) status.set(p.lesson_id, p.status);

  const list: Lesson[] = (lessonRes.data ?? []).map((r) => ({
    id: r.id,
    moduleId: r.module_id,
    topicId: r.topic_id,
    slug: r.slug,
    title: r.title,
    summary: r.summary ?? "",
    body: r.body ?? "",
    bodyFormat: r.body_format === "plain" ? "plain" : "markdown",
    estMinutes: r.est_minutes ?? 5,
    sortOrder: r.sort_order ?? 0,
    published: !!r.published,
    progress: status.get(r.id) === "done" ? "đã xong" : status.get(r.id) === "reading" ? "đang đọc" : "chưa đọc",
  }));

  cache.set(moduleId, list);
  return list;
}

export async function getLesson(moduleId: string, slug: string): Promise<Lesson | undefined> {
  const list = await loadLessons(moduleId);
  return list.find((l) => l.slug === slug);
}

/** Đánh dấu đang đọc / đã đọc xong. */
export async function markLesson(lessonId: number, status: "reading" | "done"): Promise<void> {
  const uid = currentUserId();
  if (!uid) return;
  const { error } = await db()
    .from("lesson_progress")
    .upsert(
      { user_id: uid, lesson_id: lessonId, status, updated_at: new Date().toISOString() },
      { onConflict: "user_id,lesson_id" }
    );
  if (error) {
    console.warn("[bài giảng] không lưu được tiến độ đọc:", error);
    return;
  }
  for (const [key, list] of cache) {
    const hit = list.find((l) => l.id === lessonId);
    if (hit) {
      hit.progress = status === "done" ? "đã xong" : "đang đọc";
      cache.set(key, list);
    }
  }
}

// ---------------------------------------------------------------- quản trị

export async function upsertLesson(l: Partial<Lesson> & { moduleId: string; slug: string; title: string }): Promise<void> {
  const row = {
    ...(l.id ? { id: l.id } : {}),
    module_id: l.moduleId,
    topic_id: l.topicId ?? null,
    slug: l.slug,
    title: l.title,
    summary: l.summary ?? "",
    body: l.body ?? "",
    body_format: l.bodyFormat ?? "markdown",
    est_minutes: l.estMinutes ?? 5,
    sort_order: l.sortOrder ?? 0,
    published: l.published ?? true,
    updated_at: new Date().toISOString(),
  };
  const { error } = await db().from("lessons").upsert(row, { onConflict: "module_id,slug" });
  if (error) throw new Error(error.message);
  cache.delete(l.moduleId);
}

export async function deleteLesson(id: number, moduleId: string): Promise<void> {
  const { error } = await db().from("lessons").delete().eq("id", id);
  if (error) throw new Error(error.message);
  cache.delete(moduleId);
}

export function clearLessonCache(moduleId?: string): void {
  if (moduleId) cache.delete(moduleId);
  else cache.clear();
}
