/**
 * Khung chung của mọi trang: thanh điều hướng trên cùng, vùng nội dung,
 * chân trang, ngăn kéo menu cho mobile và nút đổi sáng/tối.
 */

import { icon } from "./icons";
import { esc, bindActions } from "./bindActions";
import { navigate } from "../router";
import { isDark, toggleTheme } from "../state/theme";
import { getModules } from "../data/catalog";
import { getProfile, isAdmin } from "../state/auth";

export type NavKey = "home" | "certs" | "progress" | "guide" | "admin" | "account" | "";

interface NavItem { key: NavKey; label: string; path: string; iconName: string }

const NAV: NavItem[] = [
  { key: "home", label: "Trang chủ", path: "/", iconName: "home" },
  { key: "certs", label: "Chứng chỉ", path: "/chung-chi", iconName: "layers" },
  { key: "progress", label: "Tiến trình", path: "/tien-trinh", iconName: "chart" },
  { key: "guide", label: "Hướng dẫn", path: "/huong-dan", iconName: "help" },
];

/** Mục điều hướng chỉ hiện với quản trị viên. */
const ADMIN_NAV: NavItem = { key: "admin", label: "Quản trị", path: "/quan-tri", iconName: "shield" };

function navItems(): NavItem[] {
  return isAdmin() ? [...NAV, ADMIN_NAV] : NAV;
}

/** Chữ cái đầu của tên, dùng làm ảnh đại diện. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function accountButton(): string {
  const p = getProfile();
  if (!p) return "";
  return `<button class="avatar-btn" data-action="go" data-arg="/tai-khoan" title="${esc(p.email)}">
    <span class="avatar">${esc(initials(p.displayName))}</span>
    <span class="avatar-name hide-sm">${esc(p.displayName)}</span>
  </button>`;
}

export interface ShellParams {
  active?: NavKey;
  /** Đặt màu nhấn theo chứng chỉ (aws/ap/...). null = dùng màu thương hiệu. */
  moduleId?: string | null;
  content: string;
  hideFooter?: boolean;
}

function brandMark(): string {
  return `<a class="brand-mark" href="#/" data-action="go" data-arg="/">
    <span class="logo">${icon("logo", "", 2)}</span>
    <span>Ôn<em>Thi</em></span>
  </a>`;
}

function themeButton(): string {
  // Tạm thời ẩn nút chuyển theme trong khi darkmode đang tắt
  return "";
}

export function renderHeader(active: NavKey): string {
  const links = navItems()
    .map(
      (n) => `<a class="nav-link ${n.key === active ? "is-active" : ""}" href="#${n.path}" data-action="go" data-arg="${n.path}">${esc(n.label)}</a>`
    )
    .join("");

  return `<header class="site-header">
    <div class="page site-header-inner">
      ${brandMark()}
      <nav class="main-nav hide-sm">${links}</nav>
      <div class="header-actions">
        ${themeButton()}
        ${accountButton()}
        <button class="icon-btn only-sm" data-action="openMenu" aria-label="Mở menu">${icon("menu")}</button>
      </div>
    </div>
  </header>`;
}

function renderFooter(): string {
  const certLinks = getModules()
    .map(
      (m) => `<li><a href="#/${m.id}" data-action="go" data-arg="${m.available ? `/${m.id}` : `/sap-co/${m.id}`}">${esc(m.shortName)} — ${esc(m.shortLabel)}</a></li>`
    )
    .join("");

  return `<footer class="site-footer">
    <div class="page">
      <div class="footer-grid">
        <div class="footer-about">
          ${brandMark()}
          <p>Nền tảng luyện thi chứng chỉ CNTT &amp; ngoại ngữ. Mỗi kỳ thi được mô phỏng đúng cấu trúc đề thật — đúng số câu, đúng thời gian, đúng cách chấm.</p>
        </div>
        <div class="footer-col">
          <h4>Chứng chỉ</h4>
          <ul>${certLinks}</ul>
        </div>
        <div class="footer-col">
          <h4>Tính năng</h4>
          <ul>
            <li><a href="#/chung-chi" data-action="go" data-arg="/chung-chi">Thi thử có giờ</a></li>
            <li><a href="#/chung-chi" data-action="go" data-arg="/chung-chi">Luyện tập theo chủ đề</a></li>
            <li><a href="#/tien-trinh" data-action="go" data-arg="/tien-trinh">Theo dõi tiến trình</a></li>
            <li><a href="#/tien-trinh" data-action="go" data-arg="/tien-trinh">Câu đã lưu &amp; câu sai</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>Trợ giúp</h4>
          <ul>
            <li><a href="#/huong-dan" data-action="go" data-arg="/huong-dan">Hướng dẫn sử dụng</a></li>
            <li><a href="#/huong-dan" data-action="go" data-arg="/huong-dan">Câu hỏi thường gặp</a></li>
            <li><a href="#/huong-dan" data-action="go" data-arg="/huong-dan">Nguồn dữ liệu câu hỏi</a></li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <span>© ${new Date().getFullYear()} ÔnThi — Nền tảng học tập &amp; Luyện thi chứng chỉ chuyên nghiệp.</span>
        <span>Tiến trình học gắn với tài khoản của bạn và tự đồng bộ giữa các thiết bị.</span>
      </div>
    </div>
  </footer>`;
}

/** Dựng một trang hoàn chỉnh (header + nội dung + footer). */
export function renderPage(p: ShellParams): string {
  return `${renderHeader(p.active ?? "")}
    <main class="grow">${p.content}</main>
    ${p.hideFooter ? "" : renderFooter()}`;
}

/** Đặt màu nhấn của trang theo chứng chỉ đang xem. */
export function setModuleTheme(moduleId: string | null): void {
  if (moduleId) document.documentElement.setAttribute("data-module", moduleId);
  else document.documentElement.removeAttribute("data-module");
}

function openDrawer(active: NavKey): void {
  const scrim = document.createElement("div");
  scrim.className = "nav-scrim";
  const drawer = document.createElement("aside");
  drawer.className = "nav-drawer";
  drawer.innerHTML = `
    <div class="nav-drawer-head">
      ${brandMark()}
      <button class="icon-btn" data-action="closeMenu" aria-label="Đóng menu">${icon("close")}</button>
    </div>
    ${navItems()
      .map((n) => `<a class="drawer-link ${n.key === active ? "is-active" : ""}" href="#${n.path}" data-action="goClose" data-arg="${n.path}">${icon(n.iconName)}${esc(n.label)}</a>`)
      .join("")}
    <div class="drawer-sep"></div>
    ${getModules()
      .filter((m) => m.available)
      .map((m) => `<a class="drawer-link" href="#/${m.id}" data-action="goClose" data-arg="/${m.id}">${icon(m.iconName)}${esc(m.shortName)} — ${esc(m.shortLabel)}</a>`)
      .join("")}
    <div class="drawer-sep"></div>
    <a class="drawer-link" href="#/tai-khoan" data-action="goClose" data-arg="/tai-khoan">${icon("users")}Tài khoản</a>
    <button class="drawer-link" data-action="themeClose">${icon(isDark() ? "sun" : "moon")}${isDark() ? "Giao diện sáng" : "Giao diện tối"}</button>
  `;

  const close = () => {
    scrim.remove();
    drawer.remove();
    document.body.classList.remove("is-locked");
  };

  bindActions(drawer, {
    closeMenu: close,
    goClose: (path) => { close(); if (path) navigate(path); },
    themeClose: () => { toggleTheme(); close(); window.dispatchEvent(new Event("theme-change")); },
    go: (path) => { close(); if (path) navigate(path); },
  });
  scrim.addEventListener("click", close);

  document.body.classList.add("is-locked");
  document.body.append(scrim, drawer);
}

/**
 * Gắn hành vi cho header/footer. Trả thêm các handler riêng của trang qua
 * `extra` để chỉ cần gọi bindActions một lần cho cả trang.
 */
export function bindShell(root: HTMLElement, active: NavKey = "", extra: Record<string, (arg: string | null, el: HTMLElement) => void> = {}): void {
  bindActions(root, {
    go: (path) => { if (path) navigate(path); },
    openMenu: () => openDrawer(active),
    theme: () => { toggleTheme(); window.dispatchEvent(new Event("theme-change")); },
    ...extra,
  });
}
