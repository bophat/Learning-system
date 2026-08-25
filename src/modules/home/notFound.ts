/** Trang 404 cho đường dẫn không tồn tại. */

import type { MountFn } from "../../router";
import { renderPage, bindShell, setModuleTheme } from "../../components/appShell";
import { icon } from "../../components/icons";
import { esc } from "../../components/bindActions";

export const mountNotFound: MountFn = (root, params) => {
  setModuleTheme(null);
  const content = `<div class="page" style="padding:80px 0 90px">
    <div class="empty" style="max-width:560px;margin:0 auto">
      <div class="icon-chip lg brand">${icon("compass")}</div>
      <h3 style="font-size:22px">Không tìm thấy trang này</h3>
      <p>Đường dẫn <code>${esc(params[0] ?? "")}</code> không tồn tại. Có thể bạn vừa mở một liên kết cũ hoặc gõ nhầm địa chỉ.</p>
      <div class="row gap-10 wrap" style="justify-content:center">
        <button class="btn btn-primary" data-action="go" data-arg="/">${icon("home")}Về trang chủ</button>
        <button class="btn btn-outline" data-action="go" data-arg="/chung-chi">${icon("layers")}Danh mục chứng chỉ</button>
      </div>
    </div>
  </div>`;
  root.innerHTML = renderPage({ content });
  bindShell(root, "");
};
