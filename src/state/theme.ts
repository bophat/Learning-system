/** Chế độ sáng/tối. "system" = đi theo cài đặt của hệ điều hành. */

import { readJson, writeJson } from "./storage";

export type ThemeMode = "system" | "light" | "dark";

let mode: ThemeMode = readJson<ThemeMode>("theme", "system");

export function getTheme(): ThemeMode {
  return mode;
}

/** true nếu giao diện đang hiển thị ở chế độ tối (kể cả khi đang để "system"). */
export function isDark(): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export function applyTheme(): void {
  const root = document.documentElement;
  if (mode === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", mode);
}

export function setTheme(next: ThemeMode): void {
  mode = next;
  writeJson("theme", next);
  applyTheme();
}

/** Bấm nút mặt trời/mặt trăng: lật sang chế độ ngược với thứ đang thấy. */
export function toggleTheme(): ThemeMode {
  setTheme(isDark() ? "light" : "dark");
  return mode;
}
