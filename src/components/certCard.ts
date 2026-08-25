/**
 * Thẻ chứng chỉ dùng chung cho trang chủ và trang danh mục.
 * Đảm bảo kích thước, chiều cao, khoảng cách và các khối thành phần 100% đồng nhất.
 */

import type { ExamModuleMeta } from "../types/exam";
import { esc } from "./bindActions";
import { icon } from "./icons";
import { formatNumber } from "./ui";
import { getModuleStats } from "../state/progress";

function statusBadge(m: ExamModuleMeta): string {
  if (!m.available) return `<span class="badge badge-outline">${icon("clock")}Sắp có</span>`;
  if (m.sampleData) return `<span class="badge badge-warn">${icon("info")}Dữ liệu mẫu</span>`;
  return `<span class="badge badge-good">${icon("checkCircle")}Sẵn sàng</span>`;
}

export function certCard(m: ExamModuleMeta): string {
  const stats = getModuleStats(m.id);
  const hasProgress = stats.attempts > 0;

  const progressPct = hasProgress ? stats.bestPct : 0;
  const progressText = hasProgress
    ? `<span>Điểm cao nhất</span><span class="nums fw-700 text-brand">${stats.bestPct}%</span>`
    : `<span>Tiến trình học</span><span class="text-muted">${m.available ? "Chưa làm bài" : "Sắp có đề"}</span>`;

  return `<button class="cert-card" data-cert="${esc(m.id)}" data-action="openCert" data-arg="${esc(m.id)}">
    <div class="cert-art">
      <div class="cert-code">
        <span>${esc(m.shortName)}</span>
        <small>${esc(m.shortLabel)}</small>
      </div>
      <div class="cert-art-badge">${statusBadge(m)}</div>
      <span class="cert-glyph">${icon(m.iconName, "", 1.4)}</span>
    </div>
    <div class="cert-body">
      <div class="cert-name" title="${esc(m.fullName)}">${esc(m.fullName)}</div>
      <div class="cert-tagline">${esc(m.tagline || m.description)}</div>
      <div class="cert-meta">
        <span class="cert-stat-item">${icon("list")}${m.questionCount ? `${formatNumber(m.questionCount)} câu` : "Chưa mở"}</span>
        <span class="cert-stat-item">${icon("clock")}${m.examMinutes ? `${m.examMinutes}′` : "—"}</span>
        <span class="cert-stat-item">${icon("target")}Đậu ≥ ${m.passPct}%</span>
      </div>
    </div>
    <div class="cert-foot">
      <div class="cert-progress-label">${progressText}</div>
      <div class="bar thin"><i style="width:${progressPct}%"></i></div>
    </div>
  </button>`;
}
