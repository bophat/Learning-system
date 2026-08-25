/** Trang tài khoản: đổi tên hiển thị, xem vai trò, đăng xuất, xoá dữ liệu học tập. */

import type { MountFn } from "../../router";
import { navigate } from "../../router";
import { renderPage, bindShell, setModuleTheme } from "../../components/appShell";
import { icon } from "../../components/icons";
import { esc } from "../../components/bindActions";
import { confirmDialog } from "../../components/modal";
import { toast } from "../../components/toast";
import { crumbs, notice, formatDuration, formatNumber } from "../../components/ui";
import { getProfile, isAdmin, signOut, updateDisplayName } from "../../state/auth";
import { getOverallStats, resetProgress } from "../../state/progress";

export const mountAccount: MountFn = (root) => {
  setModuleTheme(null);

  const render = () => {
    const p = getProfile();
    if (!p) {
      navigate("/dang-nhap");
      return;
    }
    const stats = getOverallStats();
    const initials = p.displayName.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

    const content = `
      <div class="page-head">
        <div class="page">
          ${crumbs([{ label: "Trang chủ", action: "go", arg: "/" }, { label: "Tài khoản" }])}
          <div class="page-head-main">
            <div class="row gap-16" style="align-items:center">
              <span class="avatar lg">${esc(initials || "?")}</span>
              <div>
                <h1 style="margin-bottom:6px">${esc(p.displayName)}</h1>
                <div class="row gap-8 wrap">
                  <span class="badge badge-outline">${icon("send")}${esc(p.email)}</span>
                  ${isAdmin() ? `<span class="badge badge-brand">${icon("shield")}Quản trị viên</span>` : `<span class="badge">${icon("users")}Người học</span>`}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="page page-body" style="max-width:860px">
        <div class="stat-grid mb-24">
          <div class="stat-box"><div class="k">${icon("refresh")}Lần làm bài</div><div class="v">${stats.attempts}</div></div>
          <div class="stat-box"><div class="k">${icon("list")}Câu đã làm</div><div class="v">${formatNumber(stats.questions)}</div></div>
          <div class="stat-box"><div class="k">${icon("target")}Tỷ lệ đúng TB</div><div class="v">${stats.avgPct}<small>%</small></div></div>
          <div class="stat-box"><div class="k">${icon("clock")}Thời gian ôn</div><div class="v" style="font-size:19px">${esc(formatDuration(stats.timeSec))}</div></div>
        </div>

        <div class="card card-pad mb-24">
          <div class="card-head"><div class="card-title">Thông tin tài khoản</div></div>
          <form data-form>
            <div class="field">
              <label class="field-label" for="name">Tên hiển thị</label>
              <input class="input" id="name" name="name" type="text" value="${esc(p.displayName)}" maxlength="60" required>
              <p class="field-hint">Tên này chỉ hiện với bạn, dùng để nhận ra tài khoản đang đăng nhập.</p>
            </div>
            <div class="field" style="margin-bottom:0">
              <label class="field-label" for="email">Email</label>
              <input class="input" id="email" type="email" value="${esc(p.email)}" disabled>
              <p class="field-hint">Email dùng để đăng nhập, không đổi được ở đây.</p>
            </div>
            <div class="row gap-10 mt-20 wrap">
              <button class="btn btn-primary" type="submit">${icon("save")}Lưu thay đổi</button>
              <button class="btn btn-outline" type="button" data-action="signout">${icon("arrowLeft")}Đăng xuất</button>
            </div>
          </form>
        </div>

        ${notice(
          "Tiến trình học của bạn được lưu trên máy chủ và tự đồng bộ giữa các thiết bị dùng chung tài khoản này.",
          "info",
          "info"
        )}

        <div class="card card-pad mt-24" style="border-color:var(--bad-line)">
          <div class="card-head" style="margin-bottom:12px">
            <div>
              <div class="card-title">Xoá dữ liệu học tập</div>
              <div class="card-note">Xoá lịch sử làm bài, câu đã lưu và ngân hàng câu sai khỏi tài khoản. Không xoá tài khoản.</div>
            </div>
            <button class="btn btn-danger btn-sm" data-action="wipe">${icon("trash")}Xoá dữ liệu</button>
          </div>
        </div>
      </div>`;

    root.innerHTML = renderPage({ active: "account", content });

    bindShell(root, "account", {
      signout: async () => {
        const ok = await confirmDialog({
          title: "Đăng xuất?",
          text: "Tiến trình đã được lưu trên máy chủ, đăng nhập lại là thấy nguyên vẹn.",
          confirmLabel: "Đăng xuất",
        });
        if (ok) await signOut();
      },
      wipe: async () => {
        const ok = await confirmDialog({
          title: "Xoá toàn bộ dữ liệu học tập?",
          text: "Lịch sử làm bài, câu đã lưu và ngân hàng câu sai sẽ bị xoá khỏi tài khoản này. Thao tác không hoàn tác được.",
          confirmLabel: "Xoá dữ liệu",
          tone: "danger",
        });
        if (!ok) return;
        await resetProgress();
        toast("Đã xoá dữ liệu học tập.", "good");
        render();
      },
    });

    const form = root.querySelector<HTMLFormElement>("[data-form]");
    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = String(new FormData(form).get("name") ?? "").trim();
      if (!name) return;
      const res = await updateDisplayName(name);
      toast(res.ok ? "Đã lưu thay đổi." : (res.message ?? "Không lưu được."), res.ok ? "good" : "bad");
      if (res.ok) render();
    });
  };

  render();
};
