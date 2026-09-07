/**
 * Bài đang làm dở.
 *
 * Ghi ngay xuống localStorage để đóng tab/tải lại trang là tiếp tục được tức
 * thì, đồng thời đẩy lên Supabase (có trễ vài giây, gộp nhiều lần ghi thành
 * một) để mở ở máy khác vẫn thấy. Chỉ lưu số hiệu câu hỏi chứ không lưu nội
 * dung — khi khôi phục thì tra lại trong ngân hàng câu hỏi.
 *
 * Khoá theo module + level (level rỗng "" với chứng chỉ không chia cấp), để
 * một người vừa dở bài JLPT N1 vừa dở bài JLPT N3 không đè phiên của nhau.
 */

import type { Lang } from "../types/exam";
import { db } from "../services/supabase";
import { currentUserId } from "./auth";
import { readJson, writeJson, removeKey } from "./storage";

export interface SavedSession {
  moduleId: string;
  /** Rỗng nếu chứng chỉ không chia cấp. */
  levelId: string;
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
  /** Câu Nghe đã phát xong ở chế độ thi thử — khoá không cho nghe lại kể cả sau khi tải lại trang. */
  audioPlayed?: number[];
  lang: Lang;
  remaining: number | null;
  durationSec: number | null;
  startedAt: number;
  elapsed: number;
  savedAt: number;
}

const SYNC_DELAY_MS = 2500;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function slotId(moduleId: string, levelId = ""): string {
  return levelId ? `${moduleId}/${levelId}` : moduleId;
}

function localKey(slot: string): string {
  return `session.${currentUserId() || "guest"}.${slot}.v1`;
}

export function saveSession(s: SavedSession): void {
  const record = { ...s, savedAt: Date.now() };
  const slot = slotId(s.moduleId, s.levelId);
  writeJson(localKey(slot), record);
  scheduleSync(slot, record);
}

export function loadSession(moduleId: string, levelId = ""): SavedSession | null {
  const s = readJson<SavedSession | null>(localKey(slotId(moduleId, levelId)), null);
  if (!s || !Array.isArray(s.qNums) || s.qNums.length === 0) return null;
  return s;
}

export function clearSession(moduleId: string, levelId = ""): void {
  const slot = slotId(moduleId, levelId);
  removeKey(localKey(slot));
  const t = timers.get(slot);
  if (t) {
    clearTimeout(t);
    timers.delete(slot);
  }
  const uid = currentUserId();
  if (!uid) return;
  void db()
    .from("exam_sessions")
    .delete()
    .eq("user_id", uid)
    .eq("module_id", moduleId)
    .eq("level_id", levelId)
    .then(({ error }) => error && console.warn("[bài đang làm] không xoá được trên máy chủ:", error));
}

function scheduleSync(slot: string, record: SavedSession): void {
  const uid = currentUserId();
  if (!uid) return;
  const existing = timers.get(slot);
  if (existing) clearTimeout(existing);
  timers.set(
    slot,
    setTimeout(() => {
      timers.delete(slot);
      void db()
        .from("exam_sessions")
        .upsert(
          {
            user_id: uid,
            module_id: record.moduleId,
            level_id: record.levelId,
            payload: record,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,module_id,level_id" }
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

  const { data, error } = await db().from("exam_sessions").select("module_id, level_id, payload").eq("user_id", uid);
  if (error) {
    console.warn("[bài đang làm] không tải được từ máy chủ:", error);
    return;
  }

  for (const row of data ?? []) {
    const remote = row.payload as SavedSession | null;
    if (!remote || !Array.isArray(remote.qNums) || remote.qNums.length === 0) continue;
    const slot = slotId(row.module_id, row.level_id ?? "");
    const local = loadSession(row.module_id, row.level_id ?? "");
    if (!local || (remote.savedAt ?? 0) > (local.savedAt ?? 0)) {
      writeJson(localKey(slot), remote);
    }
  }
}

/** Đẩy ngay mọi thay đổi đang chờ (gọi khi rời màn làm bài). */
export function flushSessions(): void {
  for (const [slot, timer] of timers) {
    clearTimeout(timer);
    timers.delete(slot);
    const raw = readJson<SavedSession | null>(localKey(slot), null);
    if (raw) scheduleSyncNow(raw);
  }
}

function scheduleSyncNow(record: SavedSession): void {
  const uid = currentUserId();
  if (!uid) return;
  void db()
    .from("exam_sessions")
    .upsert(
      {
        user_id: uid,
        module_id: record.moduleId,
        level_id: record.levelId,
        payload: record,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,module_id,level_id" }
    )
    .then(({ error }) => error && console.warn("[bài đang làm] không đồng bộ được:", error));
}
