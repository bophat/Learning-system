/** Hộp thoại xác nhận (Promise-based) — dùng cho nộp bài, xoá dữ liệu... */

import { esc } from "./bindActions";

export interface ConfirmParams {
  title: string;
  text: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  /** HTML phụ hiện giữa mô tả và các nút (ví dụ tóm tắt số câu chưa làm). */
  extra?: string;
}

export function confirmDialog(p: ConfirmParams): Promise<boolean> {
  return new Promise((resolve) => {
    const scrim = document.createElement("div");
    scrim.className = "modal-scrim";
    scrim.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      <h3>${esc(p.title)}</h3>
      <p>${esc(p.text)}</p>
      ${p.extra ?? ""}
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close>${esc(p.cancelLabel ?? "Huỷ")}</button>
        <button class="btn ${p.tone === "danger" ? "btn-danger" : "btn-primary"}" data-ok>${esc(p.confirmLabel ?? "Đồng ý")}</button>
      </div>
    </div>`;

    const done = (value: boolean) => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("is-locked");
      scrim.remove();
      resolve(value);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") done(false);
      if (e.key === "Enter") done(true);
    };

    scrim.addEventListener("click", (e) => { if (e.target === scrim) done(false); });
    scrim.querySelector("[data-close]")!.addEventListener("click", () => done(false));
    scrim.querySelector("[data-ok]")!.addEventListener("click", () => done(true));
    document.addEventListener("keydown", onKey);
    document.body.classList.add("is-locked");
    document.body.appendChild(scrim);
    scrim.querySelector<HTMLElement>("[data-ok]")?.focus();
  });
}

export interface AlertParams {
  title: string;
  text: string;
  okLabel?: string;
}

export function alertDialog(p: AlertParams): Promise<void> {
  return new Promise((resolve) => {
    const scrim = document.createElement("div");
    scrim.className = "modal-scrim";
    scrim.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      <h3>${esc(p.title)}</h3>
      <div style="line-height:1.6;margin-bottom:20px">${p.text}</div>
      <div class="modal-actions">
        <button class="btn btn-primary" data-ok>${esc(p.okLabel ?? "Đóng")}</button>
      </div>
    </div>`;

    const done = () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("is-locked");
      scrim.remove();
      resolve();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") done();
    };

    scrim.addEventListener("click", (e) => { if (e.target === scrim) done(); });
    scrim.querySelector("[data-ok]")!.addEventListener("click", () => done());
    document.addEventListener("keydown", onKey);
    document.body.classList.add("is-locked");
    document.body.appendChild(scrim);
    scrim.querySelector<HTMLElement>("[data-ok]")?.focus();
  });
}

export interface PromptParams {
  title: string;
  text: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

export function promptDialog(p: PromptParams): Promise<string | null> {
  return new Promise((resolve) => {
    const scrim = document.createElement("div");
    scrim.className = "modal-scrim";
    scrim.innerHTML = `<div class="modal" role="dialog" aria-modal="true" style="max-width:520px">
      <h3>${esc(p.title)}</h3>
      <div style="line-height:1.6;margin-bottom:12px">${p.text}</div>
      <textarea class="input input-textarea" style="width:100%;min-height:90px;margin-bottom:16px" placeholder="${esc(p.placeholder ?? "")}">${esc(p.defaultValue ?? "")}</textarea>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close>${esc(p.cancelLabel ?? "Huỷ")}</button>
        <button class="btn btn-primary" data-ok>${esc(p.confirmLabel ?? "Lưu")}</button>
      </div>
    </div>`;

    const txt = scrim.querySelector<HTMLTextAreaElement>("textarea")!;

    const done = (val: string | null) => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("is-locked");
      scrim.remove();
      resolve(val);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") done(null);
    };

    scrim.addEventListener("click", (e) => { if (e.target === scrim) done(null); });
    scrim.querySelector("[data-close]")!.addEventListener("click", () => done(null));
    scrim.querySelector("[data-ok]")!.addEventListener("click", () => done(txt.value));
    document.addEventListener("keydown", onKey);
    document.body.classList.add("is-locked");
    document.body.appendChild(scrim);
    txt.focus();
  });
}
