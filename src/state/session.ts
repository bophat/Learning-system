/**
 * Bài đang làm dở.
 *
 * Ghi ngay xuống localStorage để đóng tab/tải lại trang là tiếp tục được tức
 * thì, đồng thời đẩy lên Supabase (có trễ vài giây, gộp nhiều lần ghi thành
 * một) để mở ở máy khác vẫn thấy. Chỉ lưu số hiệu câu hỏi chứ không lưu nội
 * dung — khi khôi phục thì tra lại trong ngân hàng câu hỏi.
 */

import type { Lang } from "../types/exam";
import { db } from "../services/supabase";
import { currentUserId } from "./auth";
import { readJson, writeJson, removeKey } from "./storage";

export interface SavedSession {
  moduleId: string;
  stageId: string;
  label: string;
  mode: "practice" | "exam";
  /** Số hiệu (n) các câu trong bài, đúng thứ tự. */
  qNums: number[];
  idx: number;
  answers: Record<string, string[]>;
  /** Các câu đã bấm "Kiểm tra" (chỉ dùng ở chế độ luyện tập). */
  checked: number[];
  flags: number[];
  lang: Lang;
  remaining: number | null;
  durationSec: number | null;
  startedAt: number;
  elapsed: number;
  savedAt: number;
}

const SYNC_DELAY_MS = 2500;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function localKey(moduleId: string): string {
  return `session.${currentUserId() || "guest"}.${moduleId}.v1`;
}

export function saveSession(s: SavedSession): void {
  const record = { ...s, savedAt: Date.now() };
  writeJson(localKey(s.moduleId), record);
  scheduleSync(record);
}

export function loadSession(moduleId: string): SavedSession | null {
  const s = readJson<SavedSession | null>(localKey(moduleId), null);
  if (!s || !Array.isArray(s.qNums) || s.qNums.length === 0) return null;
  return s;
}

export function clearSession(moduleId: string): void {
  removeKey(localKey(moduleId));
  const t = timers.get(moduleId);
  if (t) {
    clearTimeout(t);
    timers.delete(moduleId);
  }
  const uid = currentUserId();
  if (!uid) return;
  void db()
    .from("exam_sessions")
    .delete()
    .eq("user_id", uid)
    .eq("module_id", moduleId)
    .then(({ error }) => error && console.warn("[bài đang làm] không xoá được trên máy chủ:", error));
}

function scheduleSync(record: SavedSession): void {
  const uid = currentUserId();
  if (!uid) return;
  const existing = timers.get(record.moduleId);
  if (existing) clearTimeout(existing);
  timers.set(
    record.moduleId,
    setTimeout(() => {
      timers.delete(record.moduleId);
      void db()
        .from("exam_sessions")
        .upsert(
          {
            user_id: uid,
            module_id: record.moduleId,
            payload: record,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,module_id" }
        )
        .then(({ error }) => error && console.warn("[bài đang làm] không đồng bộ được:", error));
    }, SYNC_DELAY_MS)
  );
}

/**
 * Kéo bài đang làm dở từ máy chủ về, dùng lúc mới đăng nhập. Bản nào mới hơn
 * thì thắng, để làm dở ở điện thoại rồi mở laptop vẫn đúng chỗ đang dừng.
 */
export async function pullSessions(): Promise<void> {
  const uid = currentUserId();
  if (!uid) return;

  const { data, error } = await db().from("exam_sessions").select("module_id, payload").eq("user_id", uid);
  if (error) {
    console.warn("[bài đang làm] không tải được từ máy chủ:", error);
    return;
  }

  for (const row of data ?? []) {
    const remote = row.payload as SavedSession | null;
    if (!remote || !Array.isArray(remote.qNums) || remote.qNums.length === 0) continue;
    const local = loadSession(row.module_id);
    if (!local || (remote.savedAt ?? 0) > (local.savedAt ?? 0)) {
      writeJson(localKey(row.module_id), remote);
    }
  }
}

/** Đẩy ngay mọi thay đổi đang chờ (gọi khi rời màn làm bài). */
export function flushSessions(): void {
  for (const [moduleId, timer] of timers) {
    clearTimeout(timer);
    timers.delete(moduleId);
    const record = loadSession(moduleId);
    if (record) scheduleSyncNow(record);
  }
}

function scheduleSyncNow(record: SavedSession): void {
  const uid = currentUserId();
  if (!uid) return;
  void db()
    .from("exam_sessions")
    .upsert(
      { user_id: uid, module_id: record.moduleId, payload: record, updated_at: new Date().toISOString() },
      { onConflict: "user_id,module_id" }
    )
    .then(({ error }) => error && console.warn("[bài đang làm] không đồng bộ được:", error));
}
