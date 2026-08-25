/**
 * Màn đăng nhập / đăng ký. Đây là màn duy nhất xem được khi chưa có tài khoản.
 * Nếu dự án chưa cấu hình Supabase thì hiện hướng dẫn thiết lập thay vì form,
 * để người cài đặt biết chính xác còn thiếu gì.
 */

import type { MountFn } from "../../router";
import { icon } from "../../components/icons";
import { esc } from "../../components/bindActions";
import { bindActions } from "../../components/bindActions";
import { setModuleTheme } from "../../components/appShell";
import { isConfigured } from "../../services/supabase";
import { signIn, signUp, signInWithGoogle, sendPasswordReset } from "../../state/auth";
import { toggleTheme, isDark } from "../../state/theme";

type Mode = "signin" | "signup" | "forgot";

const state = {
  mode: "signin" as Mode,
  email: "",
  password: "",
  name: "",
  busy: false,
  message: "",
  tone: "bad" as "bad" | "good",
};

function brandPanel(): string {
  const points = [
    "Mô phỏng đúng cấu trúc đề thi thật của từng chứng chỉ",
    "Chấm điểm tức thì, gom câu sai để luyện lại",
    "Tiến trình đồng bộ giữa điện thoại và máy tính",
  ];
  return `<div class="auth-side">
    <div class="brand-mark" style="font-size:22px">
      <span class="logo">${icon("logo", "", 2)}</span>
      <span>Ôn<em>Thi</em></span>
    </div>
    <div>
      <h1>Luyện thi chứng chỉ<br>theo đúng cấu trúc đề thật</h1>
      <p class="mt-16">Đăng nhập để mở ngân hàng đề và giữ lại tiến trình ôn tập của bạn trên mọi thiết bị.</p>
    </div>
    <ul class="checklist">
      ${points.map((p) => `<li>${icon("check")}<span>${esc(p)}</span></li>`).join("")}
    </ul>
  </div>`;
}

function setupNotice(): string {
  return `<div class="auth-main">
    <div class="auth-card">
      <div class="icon-chip lg warn mb-16">${icon("alert")}</div>
      <h2>Chưa cấu hình máy chủ</h2>
      <p>App cần một dự án Supabase để lưu đề thi và tài khoản. Làm ba bước sau rồi tải lại trang:</p>
      <ol style="padding-left:20px;font-size:14.5px;line-height:1.9;color:var(--ink-2)">
        <li>Tạo dự án miễn phí ở <a href="https://supabase.com" target="_blank" rel="noopener">supabase.com</a></li>
        <li>Mở <b>SQL Editor</b>, dán toàn bộ file <code>supabase/schema.sql</code> rồi bấm Run</li>
        <li>Tạo file <code>.env.local</code> ở thư mục gốc dự án:</li>
      </ol>
      <div class="code-block mt-12">VITE_SUPABASE_URL=https://&lt;project&gt;.supabase.co
VITE_SUPABASE_ANON_KEY=&lt;anon key&gt;
SUPABASE_SERVICE_ROLE_KEY=&lt;service_role key&gt;</div>
      <p class="mt-16" style="font-size:14px">Sau đó chạy <code>node scripts/seed.mjs</code> để nạp ngân hàng câu hỏi lên cơ sở dữ liệu.</p>
    </div>
  </div>`;
}

export const mountLogin: MountFn = (root) => {
  setModuleTheme(null);

  if (!isConfigured) {
    root.innerHTML = `<div class="auth-screen">${brandPanel()}${setupNotice()}</div>`;
    return;
  }

  const render = () => {
    const isSignup = state.mode === "signup";
    const isForgot = state.mode === "forgot";

    const message = state.message
      ? `<div class="notice ${state.tone === "good" ? "good" : "bad"} auth-msg">${icon(
          state.tone === "good" ? "checkCircle" : "alert"
        )}<div>${esc(state.message)}</div></div>`
      : "";

    const form = isForgot
      ? `<form data-form>
          <div class="field">
            <label class="field-label" for="email">Email đã đăng ký</label>
            <input class="input" id="email" name="email" type="email" autocomplete="email" required
                   value="${esc(state.email)}" placeholder="ban@example.com">
          </div>
          <button class="btn btn-primary btn-lg btn-block" type="submit" ${state.busy ? "disabled" : ""}>
            ${state.busy ? '<span class="spinner"></span>' : icon("send")}Gửi link đặt lại mật khẩu
          </button>
        </form>
        <p class="auth-foot"><button class="link-btn" data-action="mode" data-arg="signin">Quay lại đăng nhập</button></p>`
      : `<form data-form>
          ${
            isSignup
              ? `<div class="field">
                  <label class="field-label" for="name">Tên hiển thị</label>
                  <input class="input" id="name" name="name" type="text" autocomplete="name" required
                         value="${esc(state.name)}" placeholder="Nguyễn Văn A">
                </div>`
              : ""
          }
          <div class="field">
            <label class="field-label" for="email">Email</label>
            <input class="input" id="email" name="email" type="email" autocomplete="email" required
                   value="${esc(state.email)}" placeholder="ban@example.com">
          </div>
          <div class="field" style="margin-bottom:16px">
            <label class="field-label" for="password">Mật khẩu</label>
            <input class="input" id="password" name="password" type="password" required minlength="6"
                   autocomplete="${isSignup ? "new-password" : "current-password"}"
                   placeholder="${isSignup ? "Ít nhất 6 ký tự" : "••••••••"}">
          </div>
          ${
            isSignup
              ? ""
              : `<div class="row-between mb-20"><span></span><button type="button" class="link-btn" data-action="mode" data-arg="forgot">Quên mật khẩu?</button></div>`
          }
          <button class="btn btn-primary btn-lg btn-block" type="submit" ${state.busy ? "disabled" : ""}>
            ${state.busy ? '<span class="spinner"></span>' : icon(isSignup ? "sparkles" : "arrowRight")}
            ${isSignup ? "Tạo tài khoản" : "Đăng nhập"}
          </button>
        </form>

        <div class="auth-sep">hoặc</div>

        <button class="btn btn-outline btn-lg btn-block" data-action="google" ${state.busy ? "disabled" : ""}>
          ${icon("globe")}Tiếp tục với Google
        </button>

        <p class="auth-foot">
          ${isSignup ? "Đã có tài khoản?" : "Chưa có tài khoản?"}
          <button class="link-btn" data-action="mode" data-arg="${isSignup ? "signin" : "signup"}">
            ${isSignup ? "Đăng nhập" : "Đăng ký tài khoản"}
          </button>
        </p>`;

    root.innerHTML = `<div class="auth-screen">
      ${brandPanel()}
      <div class="auth-main">
        <div class="auth-card">
          <div class="row-between mb-24">
            <div class="brand-mark only-sm" style="font-size:18px">
              <span class="logo">${icon("logo", "", 2)}</span><span>Ôn<em>Thi</em></span>
            </div>
            <span class="spacer"></span>
            <button class="icon-btn" data-action="theme" title="Đổi giao diện sáng/tối">${icon(isDark() ? "sun" : "moon")}</button>
          </div>

          ${
            isForgot
              ? `<h2>Đặt lại mật khẩu</h2><p>Nhập email của bạn, hệ thống sẽ gửi link để tạo mật khẩu mới.</p>`
              : `<h2>${isSignup ? "Tạo tài khoản mới" : "Chào mừng trở lại"}</h2>
                 <p>${isSignup ? "Tạo tài khoản để lưu trữ tiến trình và bắt đầu học tập." : "Đăng nhập để tiếp tục học tập và làm bài."}</p>
                 <div class="auth-tabs">
                   <button class="${state.mode === "signin" ? "is-active" : ""}" data-action="mode" data-arg="signin">Đăng nhập</button>
                   <button class="${state.mode === "signup" ? "is-active" : ""}" data-action="mode" data-arg="signup">Đăng ký</button>
                 </div>`
          }

          ${message}
          ${form}
        </div>
      </div>
    </div>`;

    bindActions(root, {
      mode: (m) => {
        state.mode = (m as Mode) ?? "signin";
        state.message = "";
        render();
      },
      theme: () => {
        toggleTheme();
        render();
      },
      google: async () => {
        state.busy = true;
        state.message = "";
        render();
        const res = await signInWithGoogle();
        if (!res.ok) {
          state.busy = false;
          state.tone = "bad";
          state.message = res.message ?? "Không đăng nhập được bằng Google.";
          render();
        }
        // Thành công thì trình duyệt chuyển sang trang của Google.
      },
    });

    const formEl = root.querySelector<HTMLFormElement>("[data-form]");
    formEl?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (state.busy) return;

      const data = new FormData(formEl);
      state.email = String(data.get("email") ?? "").trim();
      state.name = String(data.get("name") ?? "").trim();
      const password = String(data.get("password") ?? "");

      state.busy = true;
      state.message = "";
      render();

      const res =
        state.mode === "forgot"
          ? await sendPasswordReset(state.email)
          : state.mode === "signup"
            ? await signUp(state.email, password, state.name || state.email.split("@")[0])
            : await signIn(state.email, password);

      state.busy = false;
      if (!res.ok) {
        state.tone = "bad";
        state.message = res.message ?? "Không thực hiện được.";
        render();
        return;
      }
      if (res.message) {
        state.tone = "good";
        state.message = res.message;
        render();
        return;
      }
      // Đăng nhập thành công: `onAuthStateChange` trong main.ts lo phần chuyển trang.
    });

    // Con trỏ vào ô đầu tiên còn trống cho đỡ phải bấm.
    const firstEmpty = root.querySelector<HTMLInputElement>("input:not([value]):not([type=hidden]), input[value='']");
    firstEmpty?.focus();
  };

  render();
};
