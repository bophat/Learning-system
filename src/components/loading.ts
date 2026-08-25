/** Màn chờ và màn báo lỗi dùng cho các trang phải tải dữ liệu từ máy chủ. */

import { renderPage, bindShell } from "./appShell";
import { esc } from "./bindActions";
import { icon } from "./icons";

export function loadingBlock(message = "Đang tải dữ liệu..."): string {
  return `<div class="loading-wrap">
    <div class="spinner lg"></div>
    <p>${esc(message)}</p>
  </div>`;
}

export function renderLoading(root: HTMLElement, message?: string): void {
  root.innerHTML = renderPage({ content: loadingBlock(message), hideFooter: true });
  bindShell(root, "");
}

export function errorBlock(message: string, retryAction = "retry"): string {
  return `<div class="page" style="padding:70px 0 90px">
    <div class="empty" style="max-width:560px;margin:0 auto">
      <div class="icon-chip lg bad">${icon("alert")}</div>
      <h3 style="font-size:20px">Không tải được dữ liệu</h3>
      <p>${esc(message)}</p>
      <div class="row gap-10 wrap" style="justify-content:center">
        <button class="btn btn-primary" data-action="${esc(retryAction)}">${icon("refresh")}Thử lại</button>
        <button class="btn btn-outline" data-action="go" data-arg="/">${icon("home")}Về trang chủ</button>
      </div>
    </div>
  </div>`;
}

/**
 * Tải dữ liệu rồi vẽ trang: hiện màn chờ trong lúc tải, hiện màn lỗi kèm nút
 * thử lại nếu hỏng. Trả về hàm dọn dẹp của `render` nếu có.
 */
export async function withData(
  root: HTMLElement,
  load: () => Promise<void>,
  render: () => void,
  message?: string
): Promise<void> {
  renderLoading(root, message);
  try {
    await load();
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    root.innerHTML = renderPage({ content: errorBlock(text) });
    bindShell(root, "", { retry: () => void withData(root, load, render, message) });
    return;
  }
  render();
}
