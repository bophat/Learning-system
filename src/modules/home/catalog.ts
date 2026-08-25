/** Trang danh mục chứng chỉ: tìm kiếm, lọc và so sánh cấu trúc đề thi. */

import type { MountFn } from "../../router";
import { navigate } from "../../router";
import { renderPage, bindShell, setModuleTheme } from "../../components/appShell";
import { icon } from "../../components/icons";
import { esc, bindInputs } from "../../components/bindActions";
import { certCard } from "../../components/certCard";
import { crumbs, emptyState } from "../../components/ui";
import { getModules } from "../../data/catalog";

type Filter = "all" | "ready" | "soon";

const state = { q: "", filter: "all" as Filter };

function matches(text: string, q: string): boolean {
  return text.toLowerCase().includes(q.toLowerCase());
}

export const mountCatalog: MountFn = (root) => {
  setModuleTheme(null);

  /** Danh sách thẻ sau khi lọc — tách riêng để gõ tìm kiếm chỉ vẽ lại phần này. */
  const resultsHtml = () => {
    const list = getModules().filter((m) => {
      if (state.filter === "ready" && !m.available) return false;
      if (state.filter === "soon" && m.available) return false;
      if (!state.q.trim()) return true;
      const hay = `${m.shortName} ${m.shortLabel} ${m.fullName} ${m.tagline} ${m.provider} ${m.level}`;
      return matches(hay, state.q);
    });

    return list.length
      ? `<div class="cert-grid">${list.map(certCard).join("")}</div>`
      : emptyState({
          iconName: "search",
          title: "Không tìm thấy chứng chỉ nào",
          text: "Thử từ khoá khác, hoặc bỏ bộ lọc để xem toàn bộ danh mục.",
          actionLabel: "Xoá bộ lọc",
          action: "clear",
        });
  };

  const render = () => {
    const filters: [Filter, string][] = [
      ["all", `Tất cả (${getModules().length})`],
      ["ready", `Đang mở (${getModules().filter((m) => m.available).length})`],
      ["soon", `Sắp có (${getModules().filter((m) => !m.available).length})`],
    ];

    const compareRows = getModules().map(
      (m) => `<tr>
        <td><b>${esc(m.shortName)}</b><br><span class="text-xs text-muted">${esc(m.shortLabel)}</span></td>
        <td>${m.stages.length ? m.stages.map((s) => esc(s.name)).join(" + ") : "—"}</td>
        <td class="nums">${m.examMinutes} phút</td>
        <td>${esc(m.passNote)}</td>
        <td>${m.available ? `<span class="badge badge-good">${icon("checkCircle")}Đang mở</span>` : `<span class="badge badge-outline">${icon("clock")}Sắp có</span>`}</td>
      </tr>`
    ).join("");

    const content = `
      <div class="page-head">
        <div class="page">
          ${crumbs([{ label: "Trang chủ", action: "go", arg: "/" }, { label: "Chứng chỉ" }])}
          <div class="page-head-main">
            <div class="page-head-text">
              <h1>Danh mục chứng chỉ</h1>
              <p class="lead">Bốn kỳ thi, bốn cấu trúc đề khác nhau. Chọn kỳ thi bạn đang theo để vào đúng giao diện luyện tập của nó.</p>
            </div>
          </div>
        </div>
      </div>

      <div class="page page-body">
        <div class="row-between mb-24" style="gap:12px">
          <div class="search-box sm" style="flex:1 1 280px;max-width:420px">
            ${icon("search")}
            <input class="input" type="search" placeholder="Tìm chứng chỉ, ví dụ: AWS, 応用情報, JLPT..." value="${esc(state.q)}" data-input="q" autocomplete="off">
          </div>
          <div class="pill-group">
            ${filters.map(([k, label]) => `<button class="pill ${state.filter === k ? "is-active" : ""}" data-action="filter" data-arg="${k}">${label}</button>`).join("")}
          </div>
        </div>

        <div id="certResults">${resultsHtml()}</div>

        <div class="card card-pad mt-40">
          <div class="card-head">
            <div>
              <div class="card-title">So sánh nhanh cấu trúc đề</div>
              <div class="card-note">Thông tin theo quy chế thi hiện hành của từng đơn vị tổ chức.</div>
            </div>
          </div>
          <div style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse;font-size:14px;min-width:560px">
              <thead>
                <tr style="text-align:left;color:var(--muted);font-size:12.5px;text-transform:uppercase;letter-spacing:.05em">
                  <th style="padding:10px 12px 10px 0">Chứng chỉ</th>
                  <th style="padding:10px 12px">Các chặng thi</th>
                  <th style="padding:10px 12px">Thời gian</th>
                  <th style="padding:10px 12px">Điều kiện đậu</th>
                  <th style="padding:10px 0 10px 12px">Trạng thái</th>
                </tr>
              </thead>
              <tbody>${compareRows}</tbody>
            </table>
          </div>
        </div>
      </div>`;

    root.innerHTML = renderPage({ active: "certs", content });

    root.querySelectorAll("tbody td").forEach((td) => {
      (td as HTMLElement).style.padding = "14px 12px";
      (td as HTMLElement).style.borderTop = "1px solid var(--line)";
      (td as HTMLElement).style.verticalAlign = "middle";
    });

    bindShell(root, "certs", {
      filter: (v) => { state.filter = (v as Filter) ?? "all"; render(); },
      clear: () => { state.q = ""; state.filter = "all"; render(); },
      openCert: (id) => {
        const m = getModules().find((x) => x.id === id);
        if (!m) return;
        navigate(m.available ? `/${m.id}` : `/sap-co/${m.id}`);
      },
    });

    // Gõ tìm kiếm chỉ vẽ lại lưới kết quả để ô nhập không mất con trỏ.
    bindInputs(root, {
      q: (value) => {
        state.q = value;
        const box = root.querySelector<HTMLElement>("#certResults");
        if (!box) return;
        box.innerHTML = resultsHtml();
        bindShell(box, "certs", {
          clear: () => { state.q = ""; state.filter = "all"; render(); },
          openCert: (id) => {
            const m = getModules().find((x) => x.id === id);
            if (m) navigate(m.available ? `/${m.id}` : `/sap-co/${m.id}`);
          },
        });
      },
    });
  };

  render();
};
