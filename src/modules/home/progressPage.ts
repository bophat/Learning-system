/**
 * Trang tiến trình: tổng hợp lịch sử làm bài, phân tích năng lực 6 trụ cột:
 * - Chuỗi ngày học (Streak)
 * - Mục tiêu & Đếm ngược ngày thi
 * - Mức sẵn sàng thi (Readiness Score & Factors)
 * - Năng lực theo chủ đề (Topic Mastery)
 * - Phân tích thời gian (Time Insights)
 * - Phòng truyền thống 10 Huy hiệu thành tựu
 */

import type { MountFn } from "../../router";
import { navigate } from "../../router";
import { renderPage, bindShell, setModuleTheme } from "../../components/appShell";
import { icon } from "../../components/icons";
import { esc } from "../../components/bindActions";
import { confirmDialog, promptDialog } from "../../components/modal";
import { toast } from "../../components/toast";
import { crumbs, sectionHead, emptyState, ring, bar, formatDuration, formatDateTime, formatNumber } from "../../components/ui";
import { getModules, getModule } from "../../data/catalog";
import {
  getAttempts,
  getOverallStats,
  getModuleStats,
  deleteAttempt,
  clearAttempts,
  resetProgress,
} from "../../state/progress";
import { clearAllData } from "../../state/storage";
import { loadStudyDays, getStreak, loadGoals, getGoal, saveGoal, planFor, loadBadges, hasBadge } from "../../state/habits";
import { BADGES } from "../../data/badges";
import { computeReadiness, loadTopicMastery, loadTimeInsight, type TopicMastery, type TimeInsight } from "../../state/analytics";
import { withData } from "../../components/loading";

const state = {
  filter: "all" as "all" | "passed" | "failed",
  selectedModuleId: "aws",
};

export const mountProgress: MountFn = (root) => {
  setModuleTheme(null);

  let topicMasteryList: TopicMastery[] = [];
  let timeInsight: TimeInsight = { slow: [], guessed: [], medianTimeMs: 0, totalAnswered: 0 };

  void withData(
    root,
    async () => {
      await Promise.all([loadStudyDays(), loadGoals(), loadBadges()]);
      const availableModules = getModules().filter((m) => m.available);
      if (availableModules.length > 0) {
        state.selectedModuleId = availableModules[0].id;
        try {
          topicMasteryList = await loadTopicMastery(state.selectedModuleId);
          timeInsight = await loadTimeInsight(state.selectedModuleId);
        } catch {
          // Chưa chạy schema hoặc rỗng
        }
      }
    },
    () => {
      const render = () => {
        const overall = getOverallStats();
        const attempts = getAttempts();
        const modules = getModules().filter((m) => m.available);
        const selModule = getModule(state.selectedModuleId) ?? modules[0];

        // 1. Thói quen & Chuỗi ngày học
        const goal = getGoal(state.selectedModuleId);
        const dailyTarget = goal?.dailyTarget ?? 20;
        const streak = getStreak(dailyTarget);

        const streakHtml = `
          <div class="card streak-card mb-32">
            <div class="streak-fire">
              ${icon("flame")}
            </div>
            <div class="grow">
              <div class="row gap-8 wrap" style="align-items:center">
                <h3 style="font-size:18px;margin:0">Chuỗi ngày học: <span class="nums" style="color:var(--brand)">${streak.current} ngày</span></h3>
                <span class="badge badge-brand nums">Kỷ lục: ${streak.best} ngày</span>
              </div>
              <p class="text-sm text-muted mt-4" style="margin-bottom:0">
                ${
                  streak.doneToday
                    ? `<span style="color:var(--good);font-weight:600">${icon("checkCircle")} Hôm nay đã hoàn thành mục tiêu ${streak.questionsToday}/${dailyTarget} câu!</span>`
                    : `Hôm nay đã làm ${streak.questionsToday}/${dailyTarget} câu. Làm thêm ${Math.max(0, dailyTarget - streak.questionsToday)} câu để duy trì chuỗi.`
                }
              </p>
            </div>
          </div>
        `;

        // 2. Kế hoạch & Đếm ngược ngày thi
        const stats = getModuleStats(state.selectedModuleId);
        const plan = planFor(state.selectedModuleId, selModule?.questionCount ?? 904, stats.masteredCount);

        const planHtml = `
          <div class="card card-pad mb-32">
            <div class="card-head">
              <div>
                <div class="card-title">Mục tiêu &amp; Đếm ngược ngày thi</div>
                <div class="card-note">Lên kế hoạch phân bổ lượng câu hỏi ôn tập mỗi ngày cho chứng chỉ ${esc(selModule?.shortName ?? "")}</div>
              </div>
              <button class="btn btn-outline btn-sm" data-action="setGoal">${icon("calendar")}Đặt mục tiêu</button>
            </div>

            <div class="stat-grid compact">
              <div class="stat-box">
                <div class="k">${icon("clock")}Thời gian còn lại</div>
                <div class="v">${plan.daysLeft !== null ? `${plan.daysLeft}<small> ngày</small>` : "Chưa đặt"}</div>
              </div>
              <div class="stat-box">
                <div class="k">${icon("target")}Chỉ tiêu mỗi ngày</div>
                <div class="v">${plan.dailyTarget}<small> câu</small></div>
              </div>
              <div class="stat-box">
                <div class="k">${icon("zap")}Khối lượng đề nghị</div>
                <div class="v">${plan.suggestedPerDay !== null ? `${plan.suggestedPerDay}<small> câu/ngày</small>` : "—"}</div>
              </div>
              <div class="stat-box">
                <div class="k">${icon("list")}Câu chưa thuần thục</div>
                <div class="v">${plan.remainingQuestions}<small> câu</small></div>
              </div>
            </div>
          </div>
        `;

        // 3. Mức sẵn sàng thi (Readiness)
        const readiness = computeReadiness(state.selectedModuleId, selModule?.passPct ?? 72);
        const levelBadgeClass =
          readiness.level === "sẵn sàng"
            ? "badge-good"
            : readiness.level === "gần sẵn sàng"
            ? "badge-brand"
            : "badge-warn";

        const factorsHtml = readiness.factors
          .map(
            (f) => `<div class="factor-item">
              <div class="factor-head">
                <span>${esc(f.label)} (Trọng số ${Math.round(f.weight * 100)}%)</span>
                <span class="nums">${f.value}%</span>
              </div>
              ${bar(f.value)}
              <div class="factor-hint">${esc(f.hint)}</div>
            </div>`
          )
          .join("");

        const adviceHtml = readiness.advice
          .map((a) => `<li style="margin-bottom:6px">${esc(a)}</li>`)
          .join("");

        const readinessHtml = `
          <div class="card card-pad mb-32">
            <div class="card-head">
              <div>
                <div class="card-title">Đánh giá mức độ sẵn sàng thi</div>
                <div class="card-note">Ước lượng xác suất vượt qua bài thi thực tế dựa trên thuật toán đa nhân tố</div>
              </div>
              <span class="badge ${levelBadgeClass}">${esc(readiness.level.toUpperCase())}</span>
            </div>

            <div class="readiness-banner">
              <div style="display:flex;flex-direction:column;align-items:center;text-align:center;gap:12px">
                ${ring({ pct: readiness.score, size: 130, stroke: 12, label: "chỉ số sẵn sàng" })}
              </div>
              <div class="factor-list">
                ${factorsHtml}
              </div>
            </div>

            <div class="mt-20 pt-16" style="border-top:1px dashed var(--line)">
              <div class="fw-700 text-sm mb-8" style="color:var(--ink)">Gợi ý hành động tiếp theo:</div>
              <ul class="md-list" style="margin-left:18px;font-size:13.5px">
                ${adviceHtml}
              </ul>
            </div>
          </div>
        `;

        // 4. Năng lực theo chủ đề (Topic Mastery)
        const topicMasteryHtml = topicMasteryList.length
          ? `<div class="card card-pad mb-32">
              <div class="card-head">
                <div>
                  <div class="card-title">Mức thành thạo theo từng chủ đề</div>
                  <div class="card-note">Phân tích điểm mạnh &amp; điểm yếu để tập trung cải thiện đúng trọng tâm</div>
                </div>
              </div>
              <div class="col gap-16">
                ${topicMasteryList
                  .map(
                    (t) => `<div>
                      <div class="row gap-8 mb-4" style="justify-content:space-between;font-size:13.5px;font-weight:600">
                        <span>${esc(t.topicName)}</span>
                        <span class="nums">${t.correct}/${t.answered} câu (${t.pct}%)</span>
                      </div>
                      ${bar(t.pct)}
                    </div>`
                  )
                  .join("")}
              </div>
            </div>`
          : "";

        // 5. Phân tích thời gian (Time Insights)
        const timeInsightHtml =
          timeInsight.slow.length > 0 || timeInsight.guessed.length > 0
            ? `<div class="card card-pad mb-32">
                <div class="card-head">
                  <div>
                    <div class="card-title">Phân tích nhịp độ &amp; thời gian làm bài</div>
                    <div class="card-note">Thời gian trung vị: ${(timeInsight.medianTimeMs / 1000).toFixed(1)}s / câu</div>
                  </div>
                </div>
                <div class="feature-grid">
                  <div class="card card-pad" style="background:var(--surface-2)">
                    <div class="fw-700 mb-8 row gap-6" style="color:var(--bad)">
                      ${icon("clock")} Câu tốn nhiều thời gian (${timeInsight.slow.length})
                    </div>
                    <p class="card-note mb-12">Những câu làm chậm hơn 2 lần thời gian trung vị — hãy củng cố kiến thức các câu này.</p>
                    <div class="row gap-6 wrap">
                      ${timeInsight.slow.map((s) => `<span class="badge badge-outline nums">#${s.questionN} (${(s.avgTimeMs / 1000).toFixed(0)}s)</span>`).join("")}
                    </div>
                  </div>

                  <div class="card card-pad" style="background:var(--surface-2)">
                    <div class="fw-700 mb-8 row gap-6" style="color:var(--brand)">
                      ${icon("zap")} Nghi vấn đoán mò (${timeInsight.guessed.length})
                    </div>
                    <p class="card-note mb-12">Những câu trả lời rất nhanh (&lt;8s) mà vẫn chọn sai — cần đọc kỹ đề hơn.</p>
                    <div class="row gap-6 wrap">
                      ${timeInsight.guessed.map((s) => `<span class="badge badge-outline nums">#${s.questionN} (${(s.avgTimeMs / 1000).toFixed(0)}s)</span>`).join("")}
                    </div>
                  </div>
                </div>
              </div>`
            : "";

        // 6. Phòng trưng bày 10 Huy hiệu
        const badgesHtml = `
          <div class="card card-pad mb-32">
            <div class="card-head">
              <div>
                <div class="card-title">Huy hiệu thành tựu</div>
                <div class="card-note">Ghi nhận từng mốc trưởng thành trong hành trình chinh phục chứng chỉ</div>
              </div>
            </div>
            <div class="badge-grid">
              ${BADGES.map((b) => {
                const unlocked = hasBadge(b.code);
                return `<div class="badge-card ${unlocked ? "is-unlocked" : "is-locked"}">
                  <div class="badge-card-icon">
                    ${icon(b.iconName || "award")}
                  </div>
                  <div class="badge-card-name">${esc(b.name)}</div>
                  <div class="badge-card-desc">${esc(b.description)}</div>
                  ${unlocked ? `<span class="badge badge-good" style="font-size:10.5px">Đã đạt</span>` : `<span class="badge badge-outline" style="font-size:10.5px">Chưa mở</span>`}
                </div>`;
              }).join("")}
            </div>
          </div>
        `;

        // Lưới thẻ chứng chỉ
        const moduleCards = modules
          .map((m) => {
            const s = getModuleStats(m.id);
            const active = s.attempts > 0 || s.bookmarkCount > 0 || s.wrongCount > 0;
            return `<div class="card card-pad" style="display:flex;flex-direction:column;justify-content:space-between;min-height:280px">
              <div class="row gap-16 mb-20" style="align-items:flex-start">
                <div class="icon-chip lg">${icon(m.iconName)}</div>
                <div class="grow" style="min-width:0">
                  <div class="card-title">${esc(m.shortName)} · ${esc(m.shortLabel)}</div>
                  <div class="card-note">${esc(m.fullName)}</div>
                </div>
                ${active ? ring({ pct: s.bestPct, size: 96, stroke: 9, label: "cao nhất" }) : ""}
              </div>
              ${
                active
                  ? `<div class="stat-grid compact">
                      <div class="stat-box"><div class="k">${icon("refresh")}Lần thi</div><div class="v">${s.attempts}</div></div>
                      <div class="stat-box"><div class="k">${icon("target")}Trung bình</div><div class="v">${s.avgPct}<small>%</small></div></div>
                      <div class="stat-box"><div class="k">${icon("xCircle")}Câu sai</div><div class="v">${s.wrongCount}</div></div>
                      <div class="stat-box"><div class="k">${icon("bookmark")}Đã lưu</div><div class="v">${s.bookmarkCount}</div></div>
                    </div>`
                  : `<p class="card-note" style="margin-bottom:auto">Chưa có dữ liệu — làm thử một bài để bắt đầu theo dõi tiến trình ở chứng chỉ này.</p>`
              }
              <div class="row gap-8 wrap" style="margin-top:auto;padding-top:20px">
                <button class="btn btn-primary btn-sm" data-action="go" data-arg="/${esc(m.id)}">${icon("play")}Vào ôn</button>
                <button class="btn btn-outline btn-sm" data-action="go" data-arg="/on-tap/${esc(m.id)}">${icon("refresh")}Ôn thẻ SM-2</button>
                <button class="btn btn-soft-accent btn-sm" data-action="go" data-arg="/bai-hoc/${esc(m.id)}">${icon("bookOpen")}Bài giảng</button>
              </div>
            </div>`;
          })
          .join("");

        // Lịch sử làm bài
        const filteredAttempts = attempts.filter((a) => {
          if (state.filter === "passed") return a.passed;
          if (state.filter === "failed") return !a.passed;
          return true;
        });

        const historyRows = filteredAttempts.length
          ? filteredAttempts
              .map((a) => {
                const m = getModule(a.moduleId);
                return `<div class="list-row">
                  <div class="icon-chip ${a.passed ? "good" : "bad"}">${icon(a.passed ? "trophy" : "target")}</div>
                  <div class="list-main">
                    <div class="list-title">${esc(m?.shortName ?? a.moduleId)} · ${esc(a.label)}</div>
                    <div class="list-sub">${esc(formatDateTime(a.at))} · ${esc(formatDuration(a.durationSec))}</div>
                  </div>
                  <div class="list-side">
                    <div style="text-align:right">
                      <div class="fw-700 nums" style="font-size:17px">${a.pct}%</div>
                      <div class="text-xs text-muted nums">${a.correct}/${a.total} câu</div>
                    </div>
                    <button class="icon-btn" data-action="del" data-arg="${esc(a.id)}" title="Xoá khỏi lịch sử">${icon("trash")}</button>
                  </div>
                </div>`;
              })
              .join("")
          : `<p class="card-note p-16" style="text-align:center">Không có lần thi nào phù hợp với bộ lọc.</p>`;

        const historyFilters: [typeof state.filter, string][] = [
          ["all", `Tất cả (${attempts.length})`],
          ["passed", `Đạt (${attempts.filter((a) => a.passed).length})`],
          ["failed", `Chưa đạt (${attempts.filter((a) => !a.passed).length})`],
        ];

        const content = `
          <div class="page-head">
            <div class="page">
              ${crumbs([{ label: "Trang chủ", action: "go", arg: "/" }, { label: "Tiến trình" }])}
              <div class="page-head-main">
                <div class="page-head-text">
                  <h1>Bảng phân tích năng lực &amp; Tiến trình</h1>
                  <p class="lead">Báo cáo khoa học nhận thức toàn diện: theo dõi thói quen, mức độ sẵn sàng thi, và lộ trình ôn tập cá nhân hoá.</p>
                </div>
              </div>
            </div>
          </div>

          <div class="page page-body">
            ${streakHtml}

            ${
              overall.attempts === 0
                ? emptyState({
                    iconName: "chart",
                    title: "Chưa có dữ liệu làm bài",
                    text: "Hãy hoàn thành bài luyện tập hoặc thi thử đầu tiên để kích hoạt toàn bộ hệ thống phân tích năng lực.",
                    actionLabel: "Chọn chứng chỉ để bắt đầu",
                    action: "go",
                    actionArg: "/chung-chi",
                  })
                : `<div class="stat-grid mb-32">
                    <div class="stat-box"><div class="k">${icon("refresh")}Lần làm bài</div><div class="v">${overall.attempts}</div></div>
                    <div class="stat-box"><div class="k">${icon("list")}Câu đã làm</div><div class="v">${formatNumber(overall.questions)}</div></div>
                    <div class="stat-box"><div class="k">${icon("target")}Tỷ lệ đúng TB</div><div class="v">${overall.avgPct}<small>%</small></div></div>
                    <div class="stat-box"><div class="k">${icon("clock")}Thời gian học</div><div class="v" style="font-size:20px">${esc(formatDuration(overall.timeSec))}</div></div>
                  </div>`
            }

            ${planHtml}
            ${readinessHtml}
            ${topicMasteryHtml}
            ${timeInsightHtml}
            ${badgesHtml}

            ${sectionHead("Theo từng chứng chỉ", "Tổng quan kết quả và lối vào nhanh các bộ đề")}
            <div class="feature-grid mb-48">${moduleCards}</div>

            ${
              attempts.length
                ? `${sectionHead("Lịch sử làm bài", "Nhật ký các lần luyện tập và thi thử gần nhất")}
                  <div class="card card-pad mb-48">
                    <div class="card-head">
                      <div>
                        <div class="card-title">Chi tiết lịch sử</div>
                        <div class="card-note">${attempts.length} lần làm bài gần nhất</div>
                      </div>
                      <div class="row gap-8">
                        <div class="segmented">
                          ${historyFilters
                            .map(
                              ([k, label]) =>
                                `<button class="${state.filter === k ? "is-active" : ""}" data-action="filterHist" data-arg="${k}">${label}</button>`
                            )
                            .join("")}
                        </div>
                        <button class="btn btn-ghost btn-sm" data-action="reset">${icon("trash")}<span class="hide-sm">Xoá lịch sử</span></button>
                      </div>
                    </div>
                    <div class="list">${historyRows}</div>
                  </div>`
                : ""
            }

            <div class="card card-pad mb-32" style="border-color:var(--bad-line)">
              <div class="card-head" style="margin-bottom:12px">
                <div>
                  <div class="card-title">Xoá toàn bộ dữ liệu</div>
                  <div class="card-note">Xoá lịch sử làm bài, câu đã lưu, ngân hàng câu sai và bài đang làm dở trên trình duyệt này.</div>
                </div>
                <button class="btn btn-danger btn-sm" data-action="wipe">${icon("trash")}Xoá tất cả</button>
              </div>
            </div>
          </div>
        `;

        root.innerHTML = renderPage({ active: "progress", content });

        bindShell(root, "progress", {
          filterHist: (k) => {
            state.filter = (k as typeof state.filter) ?? "all";
            render();
          },
          del: (id) => { if (id) { deleteAttempt(id); render(); } },
          setGoal: async () => {
            const dateStr = await promptDialog({
              title: "Đặt ngày thi dự kiến",
              text: "Nhập ngày thi của bạn (định dạng YYYY-MM-DD, ví dụ: 2026-10-15):",
              defaultValue: goal?.examDate ?? "",
              confirmLabel: "Lưu mục tiêu",
            });
            if (dateStr === null) return;
            const targetStr = await promptDialog({
              title: "Chỉ tiêu số câu mỗi ngày",
              text: "Số câu hỏi bạn muốn làm mỗi ngày:",
              defaultValue: String(goal?.dailyTarget ?? 20),
              confirmLabel: "Hoàn tất",
            });
            if (targetStr === null) return;
            const daily = Math.max(5, parseInt(targetStr, 10) || 20);
            await saveGoal(state.selectedModuleId, dateStr.trim() || null, daily);
            toast("Đã lưu mục tiêu ôn thi thành công!", "good");
            render();
          },
          reset: async () => {
            const ok = await confirmDialog({
              title: "Xoá lịch sử làm bài?",
              text: "Các lần thi đã ghi sẽ biến mất. Câu đã lưu và ngân hàng câu sai vẫn được giữ lại.",
              confirmLabel: "Xoá lịch sử",
              tone: "danger",
            });
            if (!ok) return;
            await clearAttempts();
            toast("Đã xoá lịch sử làm bài.", "good");
            render();
          },
          wipe: async () => {
            const ok = await confirmDialog({
              title: "Xoá toàn bộ dữ liệu học tập?",
              text: "Thao tác này không hoàn tác được: lịch sử, câu đã lưu, câu sai và bài đang làm dở đều bị xoá khỏi trình duyệt này.",
              confirmLabel: "Xoá tất cả",
              tone: "danger",
            });
            if (!ok) return;
            await resetProgress();
            clearAllData();
            toast("Đã xoá toàn bộ dữ liệu.", "good");
            navigate("/");
          },
        });
      };

      render();
    },
    "Đang tải phân tích tiến trình..."
  );
};
