/**
 * Module TOEIC: Luyện thi TOEIC Listening & Reading (40 bộ đề chuẩn ETS)
 *
 * - 40 bộ đề thi TOEIC: Parroto Practice Vol 1 (Tests 1–10), TOEIC 2026 (Tests 1–10), TOEIC 2023...
 * - Cấu trúc 200 câu (100 câu Nghe Part 1–4 + 100 câu Đọc Part 5–7), thời gian 120 phút, thang điểm 10–990.
 */

import type { Lang } from "../../types/exam";
import { registerRoute, navigate } from "../../router";
import { renderPage, bindShell, setModuleTheme } from "../../components/appShell";
import { icon } from "../../components/icons";
import { esc } from "../../components/bindActions";
import { toast } from "../../components/toast";
import { crumbs, formatDuration, formatDateTime, formatNumber, sectionHead, ring } from "../../components/ui";
import { loadModuleState, saveModuleState } from "../../state/storage";
import { getModuleStats, getAttempts, getBookmarks, getWrong } from "../../state/progress";
import { loadSession, clearSession } from "../../state/session";
import { startExam, hasLiveExam, continueLiveExam } from "../shared/mcExam";
import { getModule } from "../../data/catalog";

const MODULE_ID = "toeic";

interface StoredState {
  sectionId: string;
  mode: "practice" | "exam";
  count: number | "all";
  order: "sequential" | "random";
  source: "all" | "wrong" | "saved";
  stageId: string;
}

const state = {
  sectionId: "listening",
  lang: "en" as Lang,
  mode: "practice" as "practice" | "exam",
  count: 30 as number | "all",
  order: "sequential" as "sequential" | "random",
  source: "all" as "all" | "wrong" | "saved",
  stageId: "all" as string,
  starting: false,
};

function meta() {
  return getModule(MODULE_ID);
}

function brandLabel(): string {
  return "TOEIC";
}

function hydrate(): void {
  const s = loadModuleState<StoredState>(MODULE_ID);
  if (!s) return;
  if (s.sectionId) state.sectionId = s.sectionId;
  state.mode = s.mode ?? "practice";
  state.count = s.count ?? 30;
  state.order = s.order ?? "sequential";
  state.source = s.source ?? "all";
  state.stageId = s.stageId ?? "all";
}

function persist(): void {
  saveModuleState<StoredState>(MODULE_ID, {
    sectionId: state.sectionId,
    mode: state.mode,
    count: state.count,
    order: state.order,
    source: state.source,
    stageId: state.stageId,
  });
}

// ------------------------------------------------------------ Trang tổng quan TOEIC

function renderHome(root: HTMLElement): void {
  setModuleTheme(MODULE_ID);
  hydrate();

  const m = meta();
  if (!m) {
    navigate("/chung-chi");
    return;
  }

  const stats = getModuleStats(MODULE_ID);
  const wrong = getWrong(MODULE_ID);
  const saved = getBookmarks(MODULE_ID);
  const attempts = getAttempts(MODULE_ID).slice(0, 5);
  const session = loadSession(MODULE_ID);
  const live = hasLiveExam(MODULE_ID);

  const resumeCard = session || live
    ? `<div class="card card-pad mb-24" style="border-color:var(--brand-soft);background:var(--brand-soft)">
        <div class="row-between">
          <div class="row gap-16" style="min-width:0">
            <div class="icon-chip lg">${icon("play")}</div>
            <div style="min-width:0">
              <div class="card-title">Tiếp tục bài thi TOEIC đang làm</div>
              <div class="card-note">${esc(session?.label ?? "Bài đang làm")} · dừng ở câu ${(session?.idx ?? 0) + 1}/${session?.qNums.length ?? "?"}${
                session?.remaining != null ? ` · còn ${Math.ceil(session.remaining / 60)} phút` : ""
              }</div>
            </div>
          </div>
          <div class="row gap-8 wrap">
            <button class="btn btn-ghost btn-sm" data-action="dropSession">${icon("trash")}Bỏ bài</button>
            <button class="btn btn-primary" data-action="resume">${icon("arrowRight")}Làm tiếp</button>
          </div>
        </div>
      </div>`
    : "";

  const cardHtml = (c: { action: string; arg?: string; iconName: string; title: string; text: string; meta: string[]; disabled: boolean }) =>
    `<button class="mode-card" data-action="${c.action}" ${c.arg ? `data-arg="${esc(c.arg)}"` : ""} ${c.disabled ? "disabled" : ""}>
      <div class="icon-chip">${icon(c.iconName)}</div>
      <h3>${esc(c.title)}</h3>
      <p>${esc(c.text)}</p>
      <div class="mode-meta">${c.meta.map((x) => `<span class="badge badge-outline">${esc(x)}</span>`).join("")}</div>
    </button>`;

  const mainModes = [
    {
      action: "examFull",
      iconName: "trophy",
      title: "Thi thử Full Test (200 câu)",
      text: "Mô phỏng bài thi thật 120 phút gồm 100 câu Listening (45') và 100 câu Reading (75') kèm đồng hồ đếm ngược.",
      meta: ["200 câu", "120 phút", "Thang điểm 990"],
      disabled: false,
    },
    {
      action: "practiceListening",
      iconName: "volume",
      title: "Luyện phần Listening (Part 1-4)",
      text: "Luyện riêng 100 câu Nghe hiểu: Hình ảnh (Part 1), Hỏi đáp (Part 2), Hội thoại (Part 3) và Độc thoại (Part 4).",
      meta: ["100 câu", "45 phút", "Max 495 điểm"],
      disabled: false,
    },
    {
      action: "practiceReading",
      iconName: "bookOpen",
      title: "Luyện phần Reading (Part 5-7)",
      text: "Luyện riêng 100 câu Đọc hiểu: Hoàn thành câu (Part 5), Đoạn văn (Part 6) và Đọc hiểu đơn/kép/ba (Part 7).",
      meta: ["100 câu", "75 phút", "Max 495 điểm"],
      disabled: false,
    },
  ].map(cardHtml).join("");

  const reviewModes = [
    {
      action: "wrong",
      iconName: "xCircle",
      title: "Luyện câu sai TOEIC",
      text: wrong.length
        ? `Bạn đang có ${wrong.length} câu từng làm sai cần củng cố lại.`
        : "Chưa có câu sai nào — hãy làm bài để hệ thống gom các câu bạn cần ôn luyện.",
      meta: [`${wrong.length} câu`],
      disabled: wrong.length === 0,
    },
    {
      action: "saved",
      iconName: "bookmark",
      title: "Câu đã đánh dấu",
      text: saved.length
        ? `${saved.length} câu bạn đã ghim lưu để xem lại.`
        : "Bấm biểu tượng cờ lưu ở mỗi câu hỏi để tập hợp những câu quan trọng.",
      meta: [`${saved.length} câu đã lưu`],
      disabled: saved.length === 0,
    },
    {
      action: "flashcards",
      iconName: "refresh",
      title: "600 Từ vựng TOEIC căn bản",
      text: "Bộ từ vựng TOEIC thiết yếu theo 50 chủ đề kinh doanh và văn phòng thông dụng nhất.",
      meta: ["Spaced Repetition", "600 từ thiết yếu"],
      disabled: false,
    },
    {
      action: "lessons",
      iconName: "bookOpen",
      title: "Mẹo & Bẫy trong đề TOEIC",
      text: "Bí quyết phân bổ thời gian Part 5–7, bẫy đồng âm Part 1–2 và cách nghe bắt keyword Part 3–4.",
      meta: ["Tips 800+", "Chiến thuật"],
      disabled: false,
    },
  ].map(cardHtml).join("");

  const stages = m.stages || [];

  const stagesGridHtml = stages.length
    ? `<div class="feature-grid mb-32" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr))">
        ${stages
          .map((s: any) => {
            return `<div class="card card-pad" style="display:flex;flex-direction:column;justify-content:space-between">
              <div>
                <div class="row-between mb-8">
                  <span class="badge badge-brand">${icon("clock")}120′</span>
                  <span class="text-xs text-muted nums">200 câu</span>
                </div>
                <div class="card-title" style="font-size:16px">${esc(s.name)}</div>
                <p class="card-note mt-4">Đề thi chuẩn format ETS gồm 100 câu Listening và 100 câu Reading.</p>
              </div>
              <div class="row gap-8 mt-16">
                <button class="btn btn-outline btn-sm" style="flex:1" data-action="stagePractice" data-arg="${esc(s.id)}">${icon("zap")}Luyện</button>
                <button class="btn btn-primary btn-sm" style="flex:1" data-action="stageExam" data-arg="${esc(s.id)}">${icon("trophy")}Thi</button>
              </div>
            </div>`;
          })
          .join("")}
      </div>`
    : `<div class="empty card card-pad"><p>Đang cập nhật danh sách đề thi TOEIC.</p></div>`;

  const historyCard = attempts.length
    ? `<div class="card card-pad mb-32">
        <div class="card-head">
          <div>
            <div class="card-title">Lịch sử thi TOEIC gần đây</div>
            <div class="card-note">${stats.attempts} lượt thi · điểm cao nhất ${stats.bestPct}%</div>
          </div>
          <button class="btn btn-ghost btn-sm" data-action="go" data-arg="/tien-trinh">Xem tất cả${icon("chevronRight")}</button>
        </div>
        <div class="list">
          ${attempts
            .map(
              (a) => `<div class="list-row">
                <div class="icon-chip ${a.passed ? "good" : "bad"}">${icon(a.passed ? "trophy" : "target")}</div>
                <div class="list-main">
                  <div class="list-title">${esc(a.label)}</div>
                  <div class="list-sub">${esc(formatDateTime(a.at))} · ${esc(formatDuration(a.durationSec))}</div>
                </div>
                <div class="list-side">
                  <div style="text-align:right">
                    <div class="fw-700 nums">${a.pct}%</div>
                    <div class="text-xs text-muted nums">${a.correct}/${a.total} câu</div>
                  </div>
                </div>
              </div>`
            )
            .join("")}
        </div>
      </div>`
    : "";

  const content = `
    <div class="page-head">
      <div class="page">
        ${crumbs([{ label: "Trang chủ", action: "go", arg: "/" }, { label: "Chứng chỉ", action: "go", arg: "/chung-chi" }, { label: "TOEIC" }])}
        <div class="page-head-main">
          <div class="page-head-text">
            <div class="row gap-8 wrap mb-12">
              <span class="badge badge-brand">${icon("award")}${esc(m.provider)}</span>
              <span class="badge badge-good">${icon("checkCircle")}40 Bộ đề ETS Format</span>
              <span class="badge badge-outline">${icon("clock")}120 Phút · 200 Câu</span>
            </div>
            <h1>${esc(m.fullName)}</h1>
            <p class="lead">${esc(m.tagline || m.description)}</p>
          </div>
          ${
            stats.attempts
              ? `<div class="page-head-side">${ring({ pct: stats.bestPct, size: 108, stroke: 10, label: "điểm cao nhất" })}</div>`
              : ""
          }
        </div>
      </div>
    </div>

    <div class="page page-body">
      ${resumeCard}

      <!-- Lưới 4 chỉ số thống kê TOEIC -->
      <div class="stat-grid mb-32">
        <div class="stat-box">
          <div class="k">${icon("list")}Tổng số bộ đề</div>
          <div class="v">${formatNumber(stages.length)} <small style="font-size:14px;color:var(--muted);font-weight:500">đề thi</small></div>
        </div>
        <div class="stat-box">
          <div class="k">${icon("clock")}Thời gian thi chuẩn</div>
          <div class="v">120 <small style="font-size:14px;color:var(--muted);font-weight:500">phút</small></div>
        </div>
        <div class="stat-box">
          <div class="k">${icon("target")}Mục tiêu điểm</div>
          <div class="v">≥ 650/990</div>
        </div>
        <div class="stat-box">
          <div class="k">${icon("trophy")}Điểm cao nhất của bạn</div>
          <div class="v">${stats.attempts ? `${stats.bestPct}%` : "—"}</div>
        </div>
      </div>

      ${sectionHead("Chế độ thi & Luyện tập", "Lựa chọn phương thức ôn luyện TOEIC chuẩn ETS")}
      <div class="feature-grid mb-32">${mainModes}</div>

      ${sectionHead("Danh sách 40 bộ đề thi TOEIC", "Tổng hợp các đề ETS TOEIC, TOEIC 2026 và Parroto Practice Vol 1")}
      ${stagesGridHtml}

      ${sectionHead("Củng cố kiến thức", "Ghi nhớ 600 từ vựng TOEIC và tránh bẫy")}
      <div class="feature-grid mb-32">${reviewModes}</div>

      ${historyCard}
    </div>
  `;

  root.innerHTML = renderPage({ active: "certs", content });

  bindShell(root, "certs", {
    resume: () => {
      if (live) continueLiveExam();
    },
    dropSession: () => {
      clearSession(MODULE_ID);
      toast("Đã bỏ bài làm dở.", "good");
      renderHome(root);
    },
    examFull: () => {
      toast("Đang tải đề thi TOEIC Full Test...", "default", 1500);
      navigate(`/${MODULE_ID}/thiet-lap`);
    },
    practiceListening: () => {
      state.sectionId = "listening";
      state.mode = "practice";
      persist();
      navigate(`/${MODULE_ID}/thiet-lap`);
    },
    practiceReading: () => {
      state.sectionId = "reading";
      state.mode = "practice";
      persist();
      navigate(`/${MODULE_ID}/thiet-lap`);
    },
    wrong: () => {
      state.mode = "practice";
      state.source = "wrong";
      persist();
      navigate(`/${MODULE_ID}/thiet-lap`);
    },
    saved: () => {
      state.mode = "practice";
      state.source = "saved";
      persist();
      navigate(`/${MODULE_ID}/thiet-lap`);
    },
    flashcards: () => navigate(`/on-tap/${MODULE_ID}`),
    lessons: () => navigate(`/bai-hoc/${MODULE_ID}`),
    stagePractice: (stageId) => {
      state.mode = "practice";
      state.stageId = stageId || "all";
      persist();
      navigate(`/${MODULE_ID}/thiet-lap`);
    },
    stageExam: (stageId) => {
      state.mode = "exam";
      state.stageId = stageId || "all";
      persist();
      navigate(`/${MODULE_ID}/thiet-lap`);
    },
  });
}

// ------------------------------------------------------------ Màn thiết lập bài làm TOEIC

function renderSetup(root: HTMLElement): void {
  setModuleTheme(MODULE_ID);
  const m = meta();
  const stages = m?.stages || [];

  const content = `
    <div class="page-head">
      <div class="page">
        ${crumbs([
          { label: "Trang chủ", action: "go", arg: "/" },
          { label: "TOEIC", action: "go", arg: `/${MODULE_ID}` },
          { label: "Thiết lập bài làm" },
        ])}
        <div class="page-head-main">
          <div class="page-head-text">
            <div class="row gap-8 mb-8">
              <span class="badge badge-brand">ETS TOEIC</span>
              <span class="badge badge-outline">${state.mode === "exam" ? "Thi thử 120 phút" : "Luyện tập"}</span>
            </div>
            <h1>Thiết lập ${state.mode === "exam" ? "bài thi thử" : "luyện tập"} TOEIC</h1>
            <p class="lead">Tùy chọn bộ đề và phần thi TOEIC theo mục tiêu ôn luyện của bạn.</p>
          </div>
        </div>
      </div>
    </div>

    <div class="page page-body">
      <div class="card card-pad mb-32" style="max-width:680px;margin:0 auto">
        <div class="mb-24">
          <div class="field-label mb-8">Bộ đề thi TOEIC</div>
          <select class="select" data-select="setupStage">
            <option value="all" ${state.stageId === "all" ? "selected" : ""}>Tất cả các bộ đề (${stages.length} đề)</option>
            ${stages.map((s: any) => `<option value="${esc(s.id)}" ${state.stageId === s.id ? "selected" : ""}>${esc(s.name)} (120 phút)</option>`).join("")}
          </select>
        </div>

        <div class="mb-24">
          <div class="field-label mb-8">Phần thi</div>
          <div class="segmented" style="display:flex">
            <button class="btn ${state.sectionId === "all" ? "btn-primary" : "btn-outline"}" style="flex:1" data-action="setSection" data-arg="all">Cả 2 phần (Full 200 câu)</button>
            <button class="btn ${state.sectionId === "listening" ? "btn-primary" : "btn-outline"}" style="flex:1" data-action="setSection" data-arg="listening">Listening (100 câu)</button>
            <button class="btn ${state.sectionId === "reading" ? "btn-primary" : "btn-outline"}" style="flex:1" data-action="setSection" data-arg="reading">Reading (100 câu)</button>
          </div>
        </div>

        <div class="row-between pt-16" style="border-top:1px solid var(--line)">
          <button class="btn btn-outline" data-action="go" data-arg="/${MODULE_ID}">${icon("arrowLeft")}Quay lại</button>
          <button class="btn btn-primary btn-lg" data-action="startNow">${icon("play")}Bắt đầu làm bài</button>
        </div>
      </div>
    </div>
  `;

  root.innerHTML = renderPage({ active: "certs", content });

  bindShell(root, "certs", {
    setSection: (sec) => {
      state.sectionId = sec || "all";
      persist();
      renderSetup(root);
    },
    startNow: () => {
      toast("Đang tải bộ đề thi TOEIC...", "default", 1500);
      const st = stages.find((s) => s.id === state.stageId) || stages[0];
      const stName = st?.name ?? "TOEIC Full Test";
      startExam({
        moduleId: MODULE_ID,
        levelId: state.sectionId,
        stageId: state.stageId === "all" ? "exam" : state.stageId,
        label: `Thi thử TOEIC - ${stName}`,
        brandLabel: brandLabel(),
        questions: [],
        mode: state.mode,
        durationSec: 120 * 60,
        bilingual: false,
        passPct: 65,
        exitPath: `/${MODULE_ID}`,
      });
    },
  });

  const stageSel = root.querySelector<HTMLSelectElement>("[data-select='setupStage']");
  if (stageSel) {
    stageSel.addEventListener("change", () => {
      state.stageId = stageSel.value;
      persist();
    });
  }
}

// ------------------------------------------------------------ Đăng ký Router

export function registerToeicRoutes(): void {
  registerRoute("/toeic", (root) => renderHome(root));
  registerRoute("/toeic/thiet-lap", (root) => renderSetup(root));
}
