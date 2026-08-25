/**
 * Lớp lưu trữ trên trình duyệt (localStorage). Mọi thứ đều best-effort:
 * nếu localStorage không dùng được (chế độ riêng tư, cookie bị chặn...) thì
 * ứng dụng vẫn chạy bình thường, chỉ là không nhớ được giữa các lần mở.
 */

import { currentUserId } from "./auth";

const PREFIX = "examPrep";

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`${PREFIX}.${key}`);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(`${PREFIX}.${key}`, JSON.stringify(value));
  } catch {
    /* bỏ qua — hết dung lượng hoặc bị chặn */
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(`${PREFIX}.${key}`);
  } catch {
    /* bỏ qua */
  }
}

/** Xoá toàn bộ dữ liệu của ứng dụng (dùng ở trang Tiến trình). */
export function clearAllData(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(`${PREFIX}.`)) doomed.push(k);
    }
    doomed.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* bỏ qua */
  }
}

/**
 * Trạng thái riêng của từng module (ngôn ngữ đang chọn, vị trí đang duyệt,
 * bản nháp tự luận...). Gắn theo tài khoản để hai người dùng chung một máy
 * không thấy dữ liệu của nhau.
 */
function moduleKey(moduleId: string): string {
  return `${currentUserId() || "guest"}.${moduleId}.v1`;
}

export function loadModuleState<T extends object>(moduleId: string): Partial<T> {
  return readJson<Partial<T>>(moduleKey(moduleId), {});
}

export function saveModuleState<T extends object>(moduleId: string, patch: Partial<T>): void {
  const current = loadModuleState<T>(moduleId);
  writeJson(moduleKey(moduleId), { ...current, ...patch });
}
