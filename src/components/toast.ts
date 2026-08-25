/** Thông báo nổi ngắn ở giữa dưới màn hình. */

import { icon } from "./icons";

let host: HTMLElement | null = null;

function getHost(): HTMLElement {
  if (host && document.body.contains(host)) return host;
  host = document.createElement("div");
  host.className = "toast-host";
  document.body.appendChild(host);
  return host;
}

export function toast(message: string, tone: "default" | "good" | "bad" = "default", ms = 2600): void {
  const el = document.createElement("div");
  el.className = `toast ${tone}`;
  const glyph = tone === "good" ? "checkCircle" : tone === "bad" ? "alert" : "info";
  el.innerHTML = `${icon(glyph)}<span></span>`;
  el.querySelector("span")!.textContent = message;
  getHost().appendChild(el);
  setTimeout(() => {
    el.classList.add("is-out");
    setTimeout(() => el.remove(), 220);
  }, ms);
}
