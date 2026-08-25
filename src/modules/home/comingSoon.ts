/** Trang giới thiệu chứng chỉ chưa có dữ liệu câu hỏi (JLPT, FE). */

import type { MountFn } from "../../router";
import { navigate } from "../../router";
import { renderPage, bindShell, setModuleTheme } from "../../components/appShell";
import { icon } from "../../components/icons";
import { esc } from "../../components/bindActions";
import { crumbs, notice } from "../../components/ui";
import { getModule, getModules } from "../../data/catalog";
import { toast } from "../../components/toast";

export const mountComingSoon: MountFn = (root, params) => {
  const m = getModule(params[0] ?? "");
  if (!m) { navigate("/chung-chi"); return; }
  setModuleTheme(m.id);

  const isSubscribed = localStorage.getItem(`notify_${m.id}`) === "1";

  const stages = m.stages.length
    ? m.stages
        .map(
          (s, i) => `<div class="list-row">
            <div class="icon-chip brand">${i + 1}</div>
            <div class="list-main">
              <div class="list-title">${esc(s.name)}</div>
              <div class="list-sub">${s.durationMinutes ? `${s.durationMinutes} phút` : "Chưa xác định"}${s.questionCount ? ` · ${s.questionCount} câu` : ""}${s.note ? ` · ${esc(s.note)}` : ""}</div>
            </div>
            <span class="badge badge-outline">${esc(
              s.kind === "mc-test" ? "Trắc nghiệm" : s.kind === "essay-test" ? "Tự luận" : "Nghe hiểu"
            )}</span>
          </div>`
        )
        .join("")
    : `<p class="card-note">Chưa mô tả các chặng thi cho chứng chỉ này.</p>`;

  const activeModules = getModules().filter((x) => x.available);

  const content = `
    <div class="page-head">
      <div class="page">
        ${crumbs([
          { label: "Trang chủ", action: "go", arg: "/" },
          { label: "Chứng chỉ", action: "go", arg: "/chung-chi" },
          { label: m.shortName },
        ])}
        <div class="page-head-main">
          <div class="page-head-text">
            <div class="row gap-8 mb-12" style="align-items:center">
              <span class="badge badge-outline">${icon("clock")}Đang biên tập dữ liệu</span>
              <span class="badge badge-brand">${esc(m.level)}</span>
              <span class="text-xs text-muted">· ${esc(m.provider)}</span>
            </div>
            <h1>${esc(m.fullName)}</h1>
            <p class="lead">${esc(m.description)}</p>
          </div>
          <div class="page-head-side">
            <div class="icon-chip lg brand">${icon(m.iconName)}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="page page-body">
      ${notice(
        `<strong>Chứng chỉ này đang trong giai đoạn số hóa ngân hàng đề.</strong> Khung dữ liệu, chặng thi và thuật toán chấm điểm đã sẵn sàng. Khi ngân hàng đề hoàn tất kiểm duyệt, chứng chỉ sẽ tự động mở luyện thi mà không cần cập nhật ứng dụng.`,
        "warn",
        "alert"
      )}

      <div class="card card-pad mt-24" style="background:var(--surface)">
        <div class="row-between" style="gap:16px;flex-wrap:wrap">
          <div>
            <div class="card-title">Nhận thông báo ngay khi đề thi ra mắt</div>
            <div class="card-note">Đăng ký để nhận thông báo ưu tiên khi kỳ thi này mở bài luyện tập đầu tiên.</div>
          </div>
          <button class="btn ${isSubscribed ? "btn-outline" : "btn-primary"}" data-action="subscribe">
            ${icon(isSubscribed ? "checkCircle" : "sparkles")}
            ${isSubscribed ? "Đã đăng ký theo dõi" : "Đăng ký nhận thông báo"}
          </button>
        </div>
      </div>

      <div class="feature-grid mt-24">
        <div class="card card-pad">
          <div class="card-head">
            <div>
              <div class="card-title">Cấu trúc &amp; Quy chế thi</div>
              <div class="card-note">Thông số kỹ thuật của kỳ thi thật</div>
            </div>
            <span class="icon-chip">${icon("layers")}</span>
          </div>
          <div class="facts">
            ${m.facts.map((f) => `<div class="fact-row"><span>${esc(f.label)}</span><b>${esc(f.value)}</b></div>`).join("")}
          </div>
        </div>

        <div class="card card-pad">
          <div class="card-head">
            <div>
              <div class="card-title">Các chặng thi chính thức</div>
              <div class="card-note">Phân bổ theo cấu trúc khảo thí</div>
            </div>
            <span class="icon-chip">${icon("list")}</span>
          </div>
          <div class="list">${stages}</div>
        </div>
      </div>

      <div class="card card-pad mt-24">
        <div class="card-head">
          <div>
            <div class="card-title">Kiến thức trọng tâm cần chuẩn bị</div>
            <div class="card-note">Những kỹ năng và chuyên đề cốt lõi của chứng chỉ này</div>
          </div>
          <span class="icon-chip good">${icon("checkCircle")}</span>
        </div>
        <ul class="checklist">
          ${m.highlights.map((h) => `<li>${icon("check")}<span>${esc(h)}</span></li>`).join("")}
        </ul>
      </div>

      <div class="card card-pad mt-24">
        <div class="card-head">
          <div>
            <div class="card-title">Trong lúc chờ đợi, bạn có thể luyện tập ngay</div>
            <div class="card-note">Các chứng chỉ công nghệ thông tin đã có đầy đủ ngân hàng đề thi</div>
          </div>
        </div>
        <div class="row gap-12 wrap">
          ${activeModules
            .map(
              (act) =>
                `<button class="btn btn-outline" data-action="go" data-arg="/${esc(act.id)}">
                  ${icon(act.iconName)} ${esc(act.shortName)} · ${esc(act.shortLabel)} (${act.questionCount} câu)
                </button>`
            )
            .join("")}
        </div>
      </div>

      <div class="row gap-10 mt-32 wrap">
        <button class="btn btn-primary" data-action="go" data-arg="/chung-chi">${icon("arrowLeft")}Xem tất cả chứng chỉ</button>
        <button class="btn btn-outline" data-action="go" data-arg="/huong-dan">${icon("help")}Xem hướng dẫn sử dụng</button>
      </div>
    </div>`;

  root.innerHTML = renderPage({ active: "certs", content });
  bindShell(root, "certs", {
    subscribe: () => {
      const cur = localStorage.getItem(`notify_${m.id}`) === "1";
      if (cur) {
        localStorage.removeItem(`notify_${m.id}`);
        toast(`Đã huỷ theo dõi chứng chỉ ${m.shortName}.`, "default");
      } else {
        localStorage.setItem(`notify_${m.id}`, "1");
        toast(`Đã lưu! Hệ thống sẽ thông báo ngay khi chứng chỉ ${m.shortName} mở đề.`, "good");
      }
      mountComingSoon(root, params);
    },
  });
};

