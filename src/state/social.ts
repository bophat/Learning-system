/**
 * Thảo luận dưới câu hỏi và ghi chú cá nhân.
 *
 * Hai thứ khác hẳn nhau về quyền riêng tư: bình luận ai cũng đọc được, còn ghi
 * chú chỉ mình người viết thấy (nằm ở cột `note` trong `question_state`).
 */

import { db } from "../services/supabase";
import { currentUserId, getProfile } from "./auth";

// ---------------------------------------------------------------- thảo luận

export interface Comment {
  id: number;
  moduleId: string;
  questionN: number;
  userId: string;
  authorName: string;
  parentId: number | null;
  body: string;
  createdAt: number;
  /** Bình luận của chính người đang đăng nhập — UI hiện nút sửa/xoá. */
  mine: boolean;
  replies: Comment[];
}

interface CommentRow {
  id: number;
  module_id: string;
  question_n: number;
  user_id: string;
  parent_id: number | null;
  author_name: string | null;
  body: string;
  created_at: string;
}

/** Tải các bình luận của một câu, đã gom thành cây hai cấp. */
export async function loadComments(moduleId: string, questionN: number): Promise<Comment[]> {
  const { data, error } = await db()
    .from("question_comments")
    .select("id, module_id, question_n, user_id, author_name, parent_id, body, created_at")
    .eq("module_id", moduleId)
    .eq("question_n", questionN)
    .eq("deleted", false)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const uid = currentUserId();
  const byId = new Map<number, Comment>();
  for (const r of (data ?? []) as unknown as CommentRow[]) {
    byId.set(r.id, {
      id: r.id,
      moduleId: r.module_id,
      questionN: r.question_n,
      userId: r.user_id,
      authorName: r.author_name || "Người học",
      parentId: r.parent_id,
      body: r.body,
      createdAt: Date.parse(r.created_at),
      mine: r.user_id === uid,
      replies: [],
    });
  }

  const roots: Comment[] = [];
  for (const c of byId.values()) {
    const parent = c.parentId != null ? byId.get(c.parentId) : undefined;
    if (parent) parent.replies.push(c);
    else roots.push(c);
  }
  return roots;
}

export async function postComment(moduleId: string, questionN: number, body: string, parentId?: number): Promise<void> {
  const uid = currentUserId();
  const text = body.trim();
  if (!uid || !text) return;
  const { error } = await db().from("question_comments").insert({
    module_id: moduleId,
    question_n: questionN,
    user_id: uid,
    author_name: getProfile()?.displayName || "Người học",
    parent_id: parentId ?? null,
    body: text.slice(0, 4000),
  });
  if (error) throw new Error(error.message);
}

export async function updateComment(id: number, body: string): Promise<void> {
  const text = body.trim();
  if (!text) return;
  const { error } = await db()
    .from("question_comments")
    .update({ body: text.slice(0, 4000), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Xoá mềm — giữ dòng lại để các trả lời bên dưới không mất theo. */
export async function deleteComment(id: number): Promise<void> {
  const { error } = await db().from("question_comments").update({ deleted: true }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Đếm số bình luận của nhiều câu cùng lúc, để hiện huy hiệu "N thảo luận". */
export async function countComments(moduleId: string, questionNs: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (questionNs.length === 0) return out;
  const { data, error } = await db()
    .from("question_comments")
    .select("question_n")
    .eq("module_id", moduleId)
    .eq("deleted", false)
    .in("question_n", questionNs.slice(0, 500));
  if (error) return out;
  for (const r of data ?? []) out.set(r.question_n, (out.get(r.question_n) ?? 0) + 1);
  return out;
}

// ---------------------------------------------------------------- ghi chú riêng

const notes = new Map<string, string>();
let notesModule: string | null = null;

const key = (moduleId: string, n: number) => `${moduleId}:${n}`;

/** Tải toàn bộ ghi chú của một chứng chỉ. */
export async function loadNotes(moduleId: string): Promise<void> {
  const uid = currentUserId();
  if (!uid || notesModule === moduleId) return;
  const { data, error } = await db()
    .from("question_state")
    .select("question_n, note")
    .eq("user_id", uid)
    .eq("module_id", moduleId)
    .not("note", "is", null);
  if (error) throw new Error(error.message);
  notes.clear();
  for (const r of data ?? []) if (r.note) notes.set(key(moduleId, r.question_n), r.note);
  notesModule = moduleId;
}

export function getNote(moduleId: string, n: number): string {
  return notes.get(key(moduleId, n)) ?? "";
}

export function hasNote(moduleId: string, n: number): boolean {
  return (notes.get(key(moduleId, n)) ?? "").trim().length > 0;
}

/** Lưu ghi chú. Chuỗi rỗng nghĩa là xoá ghi chú. */
export async function saveNote(moduleId: string, n: number, body: string): Promise<void> {
  const uid = currentUserId();
  if (!uid) return;
  const text = body.trim();
  if (text) notes.set(key(moduleId, n), text);
  else notes.delete(key(moduleId, n));

  const { error } = await db()
    .from("question_state")
    .upsert(
      { user_id: uid, module_id: moduleId, question_n: n, note: text || null, updated_at: new Date().toISOString() },
      { onConflict: "user_id,module_id,question_n" }
    );
  if (error) console.warn("[ghi chú] không lưu được:", error);
}

export function clearSocialCache(): void {
  notes.clear();
  notesModule = null;
}
