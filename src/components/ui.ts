/** Các mảnh giao diện nhỏ dùng lại ở nhiều trang + vài hàm định dạng. */

import { icon } from "./icons";
import { esc } from "./bindActions";

// ---------- định dạng ----------

/** 3661 -> "1 giờ 1 phút"; 125 -> "2 phút 5 giây". */
export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h} giờ${m ? ` ${m} phút` : ""}`;
  if (m > 0) return `${m} phút${sec ? ` ${sec} giây` : ""}`;
  return `${sec} giây`;
}

/** Đồng hồ đếm ngược: "02:09:59" hoặc "09:59". */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString("vi-VN");
}

export function formatDateTime(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (sameDay) return `Hôm nay, ${time}`;
  const yesterday = new Date(today.getTime() - 86400000);
  if (d.toDateString() === yesterday.toDateString()) return `Hôm qua, ${time}`;
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}, ${time}`;
}

export function percent(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}

// ---------- mảnh giao diện ----------

export interface RingParams {
  pct: number;
  size?: number;
  stroke?: number;
  label?: string;
  tone?: "accent" | "good" | "bad";
  showPctSign?: boolean;
}

/** Vòng tròn tiến độ (SVG thuần). */
export function ring(p: RingParams): string {
  const size = p.size ?? 116;
  const stroke = p.stroke ?? 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const value = Math.max(0, Math.min(100, p.pct));
  const offset = c * (1 - value / 100);
  const tone = p.tone ?? "accent";
  return `<div class="ring ${tone}" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle class="track" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" fill="none"/>
      <circle class="fill" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" fill="none"
              stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"/>
    </svg>
    <div class="ring-label">
      <span class="ring-num">${value}${p.showPctSign === false ? "" : "%"}</span>
      ${p.label ? `<span class="ring-cap">${esc(p.label)}</span>` : ""}
    </div>
  </div>`;
}

export function bar(pct: number, cls = ""): string {
  const v = Math.max(0, Math.min(100, Math.round(pct)));
  return `<div class="bar ${cls}"><i style="width:${v}%"></i></div>`;
}

export function statBox(iconName: string, label: string, value: string, suffix = ""): string {
  return `<div class="stat-box">
    <div class="k">${icon(iconName)}${esc(label)}</div>
    <div class="v">${esc(value)}${suffix ? `<small> ${esc(suffix)}</small>` : ""}</div>
  </div>`;
}

export interface EmptyParams {
  iconName?: string;
  title: string;
  text: string;
  actionLabel?: string;
  action?: string;
  actionArg?: string;
  tone?: string;
}

export function emptyState(p: EmptyParams): string {
  return `<div class="empty">
    <div class="icon-chip lg ${p.tone ?? ""}">${icon(p.iconName ?? "compass")}</div>
    <h3>${esc(p.title)}</h3>
    <p>${esc(p.text)}</p>
    ${p.actionLabel ? `<button class="btn btn-primary" data-action="${esc(p.action ?? "")}" ${p.actionArg ? `data-arg="${esc(p.actionArg)}"` : ""}>${esc(p.actionLabel)}</button>` : ""}
  </div>`;
}

export function notice(text: string, tone: "info" | "warn" | "good" | "bad" = "info", iconName = "info"): string {
  return `<div class="notice ${tone === "info" ? "" : tone}">${icon(iconName)}<div>${text}</div></div>`;
}

export function sectionHead(eyebrow: string, title: string, sub = "", center = false): string {
  return `<div class="section-head ${center ? "center" : ""}">
    ${eyebrow ? `<div class="eyebrow">${esc(eyebrow)}</div>` : ""}
    <h2 class="section-title">${esc(title)}</h2>
    ${sub ? `<p class="section-sub">${esc(sub)}</p>` : ""}
  </div>`;
}

export interface Crumb { label: string; action?: string; arg?: string }

export function crumbs(items: Crumb[]): string {
  return `<nav class="crumbs">${items
    .map((c, i) => {
      const sep = i > 0 ? icon("chevronRight") : "";
      const body = c.action
        ? `<button data-action="${esc(c.action)}" ${c.arg ? `data-arg="${esc(c.arg)}"` : ""}>${esc(c.label)}</button>`
        : `<span>${esc(c.label)}</span>`;
      return sep + body;
    })
    .join("")}</nav>`;
}

/**
 * Trình dựng Markdown & LaTeX an toàn không dùng thư viện ngoài.
 * Xử lý escape chống XSS trước khi định dạng thẻ.
 */
export function renderMarkdown(raw: string): string {
  if (!raw) return "";

  // 1. Tách và bảo vệ các khối mã code block
  const codeBlocks: string[] = [];
  let text = raw.replace(/```([\w-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre class="code-block" data-lang="${esc(lang || "text")}"><code>${esc(code.trim())}</code></pre>`);
    return `@@CODE_BLOCK_${idx}@@`;
  });

  // 2. Escape toàn bộ văn bản còn lại để triệt tiêu XSS
  text = esc(text);

  // 3. Xử lý công thức LaTeX inline $...$
  text = text.replace(/\$([^$\n]+)\$/g, '<span class="math-inline">$1</span>');

  // 4. Inline code `...`
  text = text.replace(/`([^`]+)`/g, "<code>$1</code>");

  // 5. In đậm & in nghiêng
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  // 6. Liên kết an toàn [text](url)
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="link-text">$1</a>');

  // 7. Khôi phục code blocks
  text = text.replace(/@@CODE_BLOCK_(\d+)@@/g, (_, i) => codeBlocks[Number(i)] ?? "");

  // 8. Tách đoạn văn bản và danh sách
  const lines = text.split("\n");
  const htmlParts: string[] = [];
  let inList = false;
  let inNumberedList = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (inList) { htmlParts.push("</ul>"); inList = false; }
      if (inNumberedList) { htmlParts.push("</ol>"); inNumberedList = false; }
      continue;
    }

    if (trimmed.startsWith("### ")) {
      if (inList) { htmlParts.push("</ul>"); inList = false; }
      if (inNumberedList) { htmlParts.push("</ol>"); inNumberedList = false; }
      htmlParts.push(`<h4>${trimmed.slice(4)}</h4>`);
    } else if (trimmed.startsWith("## ")) {
      if (inList) { htmlParts.push("</ul>"); inList = false; }
      if (inNumberedList) { htmlParts.push("</ol>"); inNumberedList = false; }
      htmlParts.push(`<h3>${trimmed.slice(3)}</h3>`);
    } else if (trimmed.startsWith("# ")) {
      if (inList) { htmlParts.push("</ul>"); inList = false; }
      if (inNumberedList) { htmlParts.push("</ol>"); inNumberedList = false; }
      htmlParts.push(`<h2>${trimmed.slice(2)}</h2>`);
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      if (inNumberedList) { htmlParts.push("</ol>"); inNumberedList = false; }
      if (!inList) { htmlParts.push('<ul class="md-list">'); inList = true; }
      htmlParts.push(`<li>${trimmed.slice(2)}</li>`);
    } else if (/^\d+\.\s/.test(trimmed)) {
      if (inList) { htmlParts.push("</ul>"); inList = false; }
      if (!inNumberedList) { htmlParts.push('<ol class="md-list">'); inNumberedList = true; }
      htmlParts.push(`<li>${trimmed.replace(/^\d+\.\s/, "")}</li>`);
    } else if (trimmed.startsWith("&gt; ")) {
      if (inList) { htmlParts.push("</ul>"); inList = false; }
      if (inNumberedList) { htmlParts.push("</ol>"); inNumberedList = false; }
      htmlParts.push(`<blockquote class="md-quote">${trimmed.slice(5)}</blockquote>`);
    } else if (trimmed.startsWith("<pre")) {
      if (inList) { htmlParts.push("</ul>"); inList = false; }
      if (inNumberedList) { htmlParts.push("</ol>"); inNumberedList = false; }
      htmlParts.push(trimmed);
    } else {
      if (inList) { htmlParts.push("</ul>"); inList = false; }
      if (inNumberedList) { htmlParts.push("</ol>"); inNumberedList = false; }
      htmlParts.push(`<p>${trimmed}</p>`);
    }
  }

  if (inList) htmlParts.push("</ul>");
  if (inNumberedList) htmlParts.push("</ol>");

  return htmlParts.join("");
}
