/**
 * Gắn sự kiện theo kiểu khai báo: phần tử có `data-action="tên"` (kèm
 * `data-arg="..."` tuỳ chọn) sẽ gọi `handlers["tên"](arg, el)`. Mỗi lần render
 * là thay toàn bộ innerHTML nên gọi lại hàm này sau mỗi lần render, thay vì
 * quản lý addEventListener thủ công cho từng phần tử.
 */
export type ActionHandlers = Record<string, (arg: string | null, el: HTMLElement) => void>;

export function bindActions(root: HTMLElement | Document, handlers: ActionHandlers): void {
  root.querySelectorAll<HTMLElement>("[data-action]").forEach((el) => {
    const action = el.dataset.action;
    if (!action || !(action in handlers)) return;
    el.addEventListener("click", (e) => {
      e.preventDefault();
      handlers[action](el.dataset.arg ?? null, el);
    });
  });
}

/** Gắn sự kiện gõ phím cho ô nhập có `data-input="tên"`. */
export function bindInputs(
  root: HTMLElement,
  handlers: Record<string, (value: string, el: HTMLInputElement | HTMLTextAreaElement) => void>,
  event: "input" | "change" = "input"
): void {
  root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-input]").forEach((el) => {
    const name = el.dataset.input;
    if (!name || !(name in handlers)) return;
    el.addEventListener(event, () => handlers[name](el.value, el));
  });
}

/** Escape văn bản trước khi chèn vào chuỗi HTML (đề bài/đáp án là dữ liệu, không phải markup). */
export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Tô sáng từ khoá trong một đoạn văn bản (đã escape sẵn). */
export function highlight(text: string, term: string): string {
  const safe = esc(text);
  if (!term.trim()) return safe;
  const needle = esc(term.trim()).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return safe.replace(new RegExp(needle, "gi"), (m) => `<mark>${m}</mark>`);
}
