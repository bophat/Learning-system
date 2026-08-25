/**
 * Trang quản trị: Nạp đề thi, quản lý danh mục và Kiểm định chất lượng đề thi (QA).
 * Chỉ hiện với tài khoản có role = "admin".
 */

import type { MountFn } from "../../router";
import { renderPage, bindShell, setModuleTheme } from "../../components/appShell";
import { icon } from "../../components/icons";
import { esc } from "../../components/bindActions";
import { alertDialog } from "../../components/modal";
import { toast } from "../../components/toast";
import { crumbs, formatNumber, sectionHead } from "../../components/ui";
import { db, friendlyError } from "../../services/supabase";
import { isAdmin } from "../../state/auth";
import { getModules, getBankStats, loadCatalog } from "../../data/catalog";
import { clearQuestionCache } from "../../data/questions";
import { parseQuestionFile, type ParseResult, type QuestionRowInput } from "./parseQuestions";
import { loadItemStats, loadOptionPicks, syncDifficulty, type ItemStat } from "../../data/itemStats";

const CHUNK = 400;

const state = {
  tab: "upload" as "upload" | "qa",
  moduleId: "",
  stageId: "exam",
  replace: false,
  fileName: "",
  parsed: null as ParseResult | null,
  busy: false,
  progress: "",
  qaStats: [] as ItemStat[],
  loadingQa: false,
};

const SAMPLE_JSON = `[
  {
    "n": 1,
    "en": "Which storage class fits rarely accessed data?",
    "ja": "めったにアクセスしないデータに適したストレージクラスは?",
    "opts": [
      { "l": "A", "en": "S3 Standard-IA", "ja": "S3 Standard-IA" },
      { "l": "B", "en": "S3 Standard", "ja": "S3 Standard" }
    ],
    "ans": "A",
    "multi": false,
    "domain": "Storage"
  }
]`;

const SAMPLE_CSV = `n,en,ja,A,B,C,D,answer,multi,domain
1,"Đề bài câu 1","日本語",Phương án A,Phương án B,Phương án C,Phương án D,B,false,Mạng`;

async function uploadRows(rows: QuestionRowInput[], onProgress: (done: number) => void): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await db().from("questions").upsert(slice, { onConflict: "module_id,stage_id,n" });
    if (error) throw new Error(friendlyError(error));
    onProgress(Math.min(i + CHUNK, rows.length));
  }
}

export const mountAdmin: MountFn = (root) => {
  setModuleTheme(null);

  if (!isAdmin()) {
    root.innerHTML = renderPage({
      content: `<div class="page" style="padding:70px 0 90px">
        <div class="empty" style="max-width:560px;margin:0 auto">
          <div class="icon-chip lg bad">${icon("shield")}</div>
          <h3 style="font-size:20px">Trang dành cho quản trị viên</h3>
          <p>Tài khoản của bạn chưa có quyền quản trị. Nếu đây là dự án của bạn, chạy câu lệnh sau trong SQL Editor của Supabase rồi đăng nhập lại:</p>
          <div class="code-block" style="text-align:left">update public.profiles set role = 'admin' where email = 'email-cua-ban@example.com';</div>
          <button class="btn btn-primary mt-20" data-action="go" data-arg="/">${icon("home")}Về trang chủ</button>
        </div>
      </div>`,
    });
    bindShell(root, "");
    return;
  }

  const loadQaData = async () => {
    if (!state.moduleId) return;
    state.loadingQa = true;
    try {
      state.qaStats = await loadItemStats(state.moduleId);
    } catch (err) {
      console.warn("[admin qa]", err);
      state.qaStats = [];
    } finally {
      state.loadingQa = false;
      render();
    }
  };

  const render = () => {
    const modules = getModules();
    if (!state.moduleId && modules.length) state.moduleId = modules[0].id;

    // Tab 1: Nạp đề & Quản lý danh mục
    const moduleRows = modules
      .map((m) => {
        const bank = getBankStats(m.id);
        return `<div class="list-row">
          <div class="icon-chip">${icon(m.iconName)}</div>
          <div class="list-main">
            <div class="list-title">${esc(m.shortName)} · ${esc(m.fullName)}</div>
            <div class="list-sub">
              <code>${esc(m.id)}</code> · ${formatNumber(bank.total)} câu
              ${bank.total ? ` · ${formatNumber(bank.withAnswer)} có đáp án · ${bank.essayTotal} tự luận` : " · chưa có câu hỏi"}
            </div>
          </div>
          <div class="list-side">
            <button class="btn btn-outline btn-sm" data-action="pickModule" data-arg="${esc(m.id)}">${icon("send")}Nạp đề</button>
            <button class="icon-btn" data-action="wipeModule" data-arg="${esc(m.id)}" title="Xoá toàn bộ câu hỏi của chứng chỉ này">${icon("trash")}</button>
          </div>
        </div>`;
      })
      .join("");

    const stageOptions = (() => {
      const m = modules.find((x) => x.id === state.moduleId);
      const stages = m?.stages?.length ? m.stages : [{ id: "exam", name: "Bài thi" }];
      return stages
        .map((s) => `<option value="${esc(s.id)}" ${state.stageId === s.id ? "selected" : ""}>${esc(s.name)} (${esc(s.id)})</option>`)
        .join("");
    })();

    const p = state.parsed;
    const mcCount = p?.rows.filter((r) => r.kind === "mc").length ?? 0;
    const essayCount = p?.rows.filter((r) => r.kind === "essay").length ?? 0;
    const noAnswer = p?.rows.filter((r) => r.kind === "mc" && !r.answer).length ?? 0;

    const preview = p
      ? `<div class="card card-pad mt-20" style="background:var(--surface-2)">
          <div class="card-head">
            <div>
              <div class="card-title">Kết quả đọc file</div>
              <div class="card-note">${esc(state.fileName)}</div>
            </div>
            <button class="btn btn-ghost btn-sm" data-action="clearFile">${icon("close")}Bỏ file</button>
          </div>
          <div class="stat-grid mb-16" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr))">
            <div class="stat-box"><div class="k">${icon("list")}Tổng câu</div><div class="v">${p.rows.length}</div></div>
            <div class="stat-box"><div class="k">${icon("checkCircle")}Trắc nghiệm</div><div class="v">${mcCount}</div></div>
            <div class="stat-box"><div class="k">${icon("pencil")}Tự luận</div><div class="v">${essayCount}</div></div>
            <div class="stat-box"><div class="k">${icon("alert")}Thiếu đáp án</div><div class="v">${noAnswer}</div></div>
          </div>
          ${
            p.errors.length
              ? `<div class="notice bad mb-12">${icon("xCircle")}<div><strong>${p.errors.length} lỗi phải sửa trước khi nạp:</strong><br>${p.errors
                  .slice(0, 8)
                  .map(esc)
                  .join("<br>")}${p.errors.length > 8 ? `<br>… và ${p.errors.length - 8} lỗi nữa` : ""}</div></div>`
              : `<div class="notice good mb-12">${icon("checkCircle")}<div>Dữ liệu hợp lệ, sẵn sàng nạp lên máy chủ.</div></div>`
          }
          ${
            p.warnings.length
              ? `<div class="notice warn">${icon("alert")}<div><strong>${p.warnings.length} cảnh báo:</strong><br>${p.warnings
                  .slice(0, 5)
                  .map(esc)
                  .join("<br>")}${p.warnings.length > 5 ? `<br>… và ${p.warnings.length - 5} cảnh báo nữa` : ""}</div></div>`
              : ""
          }
          <div class="row gap-10 mt-20 wrap">
            <button class="btn btn-primary" data-action="upload" ${p.errors.length || state.busy ? "disabled" : ""}>
              ${state.busy ? '<span class="spinner"></span>' : icon("send")}
              <span data-progress>${state.busy ? esc(state.progress || "Đang nạp...") : "Nạp " + formatNumber(p.rows.length) + " câu lên máy chủ"}</span>
            </button>
            <label class="row gap-8" style="font-size:14px;cursor:pointer">
              <input type="checkbox" data-check="replace" ${state.replace ? "checked" : ""}>
              Xoá câu hỏi cũ của chặng này trước khi nạp
            </label>
          </div>
        </div>`
      : "";

    const uploadTabContent = `
      <div class="card card-pad mb-32">
        <div class="card-head">
          <div>
            <div class="card-title">Chứng chỉ trong hệ thống</div>
            <div class="card-note">${modules.length} chứng chỉ</div>
          </div>
          <button class="btn btn-outline btn-sm" data-action="reload">${icon("refresh")}Tải lại số liệu</button>
        </div>
        <div class="list">${moduleRows || '<p class="card-note">Chưa có chứng chỉ nào. Chạy <code>node scripts/seed.mjs</code> để nạp dữ liệu khởi tạo.</p>'}</div>
      </div>

      ${sectionHead("Nạp dữ liệu", "Tải đề thi lên")}
      <div class="card card-pad mb-32">
        <div class="feature-grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px">
          <div class="field" style="margin-bottom:0">
            <label class="field-label" for="mod">Chứng chỉ</label>
            <select class="select" id="mod" data-select="module">
              ${modules.map((m) => `<option value="${esc(m.id)}" ${state.moduleId === m.id ? "selected" : ""}>${esc(m.shortName)} — ${esc(m.fullName)}</option>`).join("")}
            </select>
          </div>
          <div class="field" style="margin-bottom:0">
            <label class="field-label" for="stage">Chặng thi</label>
            <select class="select" id="stage" data-select="stage">${stageOptions}</select>
          </div>
        </div>

        <label class="dropzone mt-20" data-drop>
          <input type="file" accept=".json,.csv,application/json,text/csv" hidden data-file>
          <div class="icon-chip lg brand">${icon("save")}</div>
          <b>Chọn file đề thi hoặc kéo thả vào đây</b>
          <span>Nhận file .json hoặc .csv — xem mẫu định dạng bên dưới</span>
        </label>

        ${preview}
      </div>

      ${sectionHead("Định dạng", "File đề thi cần trông như thế nào")}
      <div class="feature-grid mb-32">
        <div class="card card-pad">
          <div class="card-head"><div class="card-title">JSON</div><span class="badge badge-outline">khuyên dùng</span></div>
          <p class="card-note mb-12">Giữ được cả bản dịch tiếng Nhật và câu tự luận.</p>
          <div class="code-block">${esc(SAMPLE_JSON)}</div>
        </div>
        <div class="card card-pad">
          <div class="card-head"><div class="card-title">CSV</div><span class="badge badge-outline">xuất từ Excel</span></div>
          <p class="card-note mb-12">Dòng đầu là tiêu đề cột. Cột <code>ja</code> và <code>domain</code> có thể bỏ trống.</p>
          <div class="code-block">${esc(SAMPLE_CSV)}</div>
        </div>
      </div>
    `;

    // Tab 2: QA & Khảo thí
    const flaggedItems = state.qaStats.filter((s) => s.flags.length > 0 && s.samples >= 10);
    const qaRowsHtml = state.qaStats.length
      ? state.qaStats
          .slice(0, 50)
          .map((s) => {
            const flagBadges = s.flags.map((f) => `<span class="badge badge-bad" style="font-size:11px">${esc(f)}</span>`).join(" ");
            return `<div class="list-row">
              <div class="nums fw-700" style="width:48px;color:var(--brand)">#${s.questionN}</div>
              <div class="list-main">
                <div class="row gap-8 wrap" style="align-items:center">
                  <span class="text-sm nums">Lượt làm: <strong>${s.samples}</strong></span>
                  <span class="text-sm nums">Độ khó (p): <strong>${(s.pValue * 100).toFixed(1)}%</strong></span>
                  <span class="text-sm nums">Độ phân biệt (r): <strong>${s.discrimination.toFixed(2)}</strong></span>
                  <span class="text-sm text-muted nums">TB: ${(s.avgTimeMs / 1000).toFixed(1)}s</span>
                </div>
                ${flagBadges ? `<div class="mt-4 row gap-4 wrap">${flagBadges}</div>` : ""}
              </div>
              <div class="list-side">
                <button class="btn btn-outline btn-sm" data-action="viewPicks" data-arg="${s.questionN}">${icon("chart")}Xem tỷ lệ</button>
              </div>
            </div>`;
          })
          .join("")
      : `<p class="card-note p-16" style="text-align:center">${state.loadingQa ? "Đang phân tích dữ liệu..." : "Chưa có đủ lượt làm bài thực tế để phân tích khảo thí."}</p>`;

    const qaTabContent = `
      <div class="card card-pad mb-32">
        <div class="card-head">
          <div>
            <div class="card-title">Kiểm định chất lượng câu hỏi &amp; Phân tích khảo thí</div>
            <div class="card-note">Tự động phát hiện câu nghi sai đáp án, câu quá dễ hoặc độ phân biệt thấp dựa trên lý thuyết đo lường giáo dục</div>
          </div>
          <div class="row gap-8">
            <select class="select" data-select="qaModule" style="width:auto">
              ${modules.map((m) => `<option value="${esc(m.id)}" ${state.moduleId === m.id ? "selected" : ""}>${esc(m.shortName)}</option>`).join("")}
            </select>
            <button class="btn btn-primary btn-sm" data-action="syncDiff">${icon("refresh")}Đồng bộ độ khó CSDL</button>
          </div>
        </div>

        <div class="stat-grid mb-24 compact">
          <div class="stat-box"><div class="k">${icon("list")}Câu đã phân tích</div><div class="v">${state.qaStats.length}</div></div>
          <div class="stat-box"><div class="k">${icon("alert")}Câu có cảnh báo</div><div class="v" style="color:var(--bad)">${flaggedItems.length}</div></div>
        </div>

        <div class="list">${qaRowsHtml}</div>
      </div>
    `;

    const content = `
      <div class="page-head">
        <div class="page">
          ${crumbs([{ label: "Trang chủ", action: "go", arg: "/" }, { label: "Quản trị" }])}
          <div class="page-head-main">
            <div class="page-head-text">
              <span class="badge badge-brand mb-12">${icon("shield")}Quản trị viên</span>
              <h1>Quản lý ngân hàng đề &amp; Đảm bảo chất lượng</h1>
              <p class="lead">Nạp đề mới, quản lý danh mục và kiểm định độ chuẩn xác của câu hỏi thông qua chỉ số phân biệt và độ khó thực tế.</p>
            </div>
          </div>
        </div>
      </div>

      <div class="page page-body">
        <div class="segmented mb-32">
          <button class="${state.tab === "upload" ? "is-active" : ""}" data-action="tab" data-arg="upload">${icon("send")}Nạp đề &amp; Danh mục</button>
          <button class="${state.tab === "qa" ? "is-active" : ""}" data-action="tab" data-arg="qa">${icon("chart")}Chất lượng đề (QA)</button>
        </div>

        ${state.tab === "upload" ? uploadTabContent : qaTabContent}
      </div>
    `;

    root.innerHTML = renderPage({ active: "admin", content });

    bindShell(root, "admin", {
      tab: (t) => {
        state.tab = (t as typeof state.tab) ?? "upload";
        if (state.tab === "qa" && state.qaStats.length === 0) {
          void loadQaData();
        } else {
          render();
        }
      },
      reload: async () => {
        await loadCatalog();
        toast("Đã cập nhật số liệu.", "good");
        render();
      },
      pickModule: (id) => {
        if (!id) return;
        state.moduleId = id;
        const m = getModules().find((x) => x.id === id);
        state.stageId = m?.stages?.[0]?.id ?? "exam";
        render();
        root.querySelector("[data-drop]")?.scrollIntoView({ behavior: "smooth", block: "center" });
      },
      syncDiff: async () => {
        try {
          const synced = await syncDifficulty(state.moduleId);
          toast(`Đã cập nhật độ khó cho ${synced} câu vào CSDL!`, "good");
        } catch (err) {
          toast(err instanceof Error ? err.message : String(err), "bad");
        }
      },
      viewPicks: async (arg) => {
        const n = parseInt(arg ?? "", 10);
        if (!n) return;
        try {
          const picks = await loadOptionPicks(state.moduleId, n);
          const pickDetails = picks.length
            ? picks.map((p) => `Phương án <strong>${esc(p.chosen)}</strong>: ${p.n} lượt chọn`).join("<br>")
            : "Chưa có lượt chọn chi tiết.";
          await alertDialog({
            title: `Tỷ lệ chọn phương án — Câu #${n}`,
            text: pickDetails,
          });
        } catch (err) {
          toast(err instanceof Error ? err.message : String(err), "bad");
        }
      },
      clearFile: () => {
        state.parsed = null;
        state.fileName = "";
        render();
      },
      upload: async () => {
        if (!state.parsed || state.parsed.errors.length || state.busy) return;
        state.busy = true;
        state.progress = "Đang chuẩn bị...";
        render();

        try {
          if (state.replace) {
            const { error: delErr } = await db()
              .from("questions")
              .delete()
              .eq("module_id", state.moduleId)
              .eq("stage_id", state.stageId);
            if (delErr) throw new Error(delErr.message);
          }

          await uploadRows(state.parsed.rows, (done) => {
            state.progress = `Đã nạp ${done}/${state.parsed?.rows.length} câu...`;
            const el = root.querySelector("[data-progress]");
            if (el) el.textContent = state.progress;
          });

          clearQuestionCache();
          await loadCatalog();
          toast(`Đã nạp thành công ${state.parsed.rows.length} câu!`, "good");
          state.parsed = null;
          state.fileName = "";
        } catch (err) {
          toast(err instanceof Error ? err.message : String(err), "bad");
        } finally {
          state.busy = false;
          state.progress = "";
          render();
        }
      },
    });

    const modSelect = root.querySelector("[data-select='module']");
    if (modSelect) {
      modSelect.addEventListener("change", () => {
        state.moduleId = (modSelect as HTMLSelectElement).value;
        const m = modules.find((x) => x.id === state.moduleId);
        state.stageId = m?.stages?.[0]?.id ?? "exam";
        render();
      });
    }

    const qaModSelect = root.querySelector("[data-select='qaModule']");
    if (qaModSelect) {
      qaModSelect.addEventListener("change", () => {
        state.moduleId = (qaModSelect as HTMLSelectElement).value;
        void loadQaData();
      });
    }

    const stageSelect = root.querySelector("[data-select='stage']");
    if (stageSelect) {
      stageSelect.addEventListener("change", () => {
        state.stageId = (stageSelect as HTMLSelectElement).value;
      });
    }

    const fileInput = root.querySelector("[data-file]");
    if (fileInput) {
      fileInput.addEventListener("change", async () => {
        const file = (fileInput as HTMLInputElement).files?.[0];
        if (!file) return;
        state.fileName = file.name;
        const text = await file.text();
        state.parsed = parseQuestionFile(text, file.name, state.moduleId, state.stageId);
        render();
      });
    }
  };

  render();
};
