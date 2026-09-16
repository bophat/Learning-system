/**
 * Module IELTS: Luyện thi IELTS Academic & General
 *
 * Tổng hợp 161 bộ đề:
 * - 52 bộ đề Reading (Cambridge IELTS C10–C21, Actual Tests) kèm bài đọc đầy đủ
 * - 103 bộ đề Listening (Cambridge IELTS C10–C21, Actual Tests) kèm Audio MP3 trực tiếp
 * - Writing & Speaking
 */

import type { Lang, MultipleChoiceQuestion, ExamLevel } from "../../types/exam";
import { registerRoute, navigate } from "../../router";
import { renderPage, bindShell, setModuleTheme } from "../../components/appShell";
import { icon } from "../../components/icons";
import { esc } from "../../components/bindActions";
import { toast } from "../../components/toast";
import { crumbs, formatDuration, formatDateTime, formatNumber, sectionHead, ring } from "../../components/ui";
import { loadModuleState, saveModuleState } from "../../state/storage";
import { getModuleStats, getAttempts, getBookmarks, getWrong } from "../../state/progress";
import { loadSession, clearSession } from "../../state/session";
import { startExam, resumeExam, hasLiveExam, continueLiveExam } from "../shared/mcExam";
import { loadMcQuestions } from "../../data/questions";
import { getModule, getLevelStats } from "../../data/catalog";

const MODULE_ID = "ielts";

interface StoredState {
  skillId: string;
  mode: "practice" | "exam";
  count: number | "all";
  order: "sequential" | "random";
  source: "all" | "wrong" | "saved";
  stageId: string;
}

const state = {
  skillId: "reading",
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

function currentLevelMeta(): ExamLevel | undefined {
  const m = meta();
  return m?.levels.find((l) => l.id.toLowerCase() === state.skillId.toLowerCase()) ?? m?.levels[0];
}

function brandLabel(): string {
  const lvl = currentLevelMeta();
  return lvl ? `IELTS ${lvl.label}` : "IELTS";
}

function hydrate(): void {
  const s = loadModuleState<StoredState>(MODULE_ID);
  if (!s) return;
  if (s.skillId) state.skillId = s.skillId;
  state.mode = s.mode ?? "practice";
  state.count = s.count ?? 30;
  state.order = s.order ?? "sequential";
  state.source = s.source ?? "all";
  state.stageId = s.stageId ?? "all";
}

function persist(): void {
  saveModuleState<StoredState>(MODULE_ID, {
    skillId: state.skillId,
    mode: state.mode,
    count: state.count,
    order: state.order,
    source: state.source,
    stageId: state.stageId,
  });
}

const cachedQuestionsMap = new Map<string, MultipleChoiceQuestion[]>();

async function ensureQuestions(skillId: string): Promise<MultipleChoiceQuestion[]> {
  const key = `${MODULE_ID}:${skillId}`;
  if (cachedQuestionsMap.has(key)) {
    return cachedQuestionsMap.get(key)!;
  }
  const questions = await loadMcQuestions(MODULE_ID, undefined, skillId);
  cachedQuestionsMap.set(key, questions);
  return questions;
}

// ------------------------------------------------------------ Trang tổng quan IELTS

function renderHome(root: HTMLElement, skillParam?: string): void {
  setModuleTheme(MODULE_ID);
  hydrate();
  if (skillParam && ["reading", "listening", "writing", "speaking"].includes(skillParam.toLowerCase())) {
    state.skillId = skillParam.toLowerCase();
  }

  const m = meta();
  if (!m) {
    navigate("/chung-chi");
    return;
  }

  const lvl = currentLevelMeta();
  const currentSkillId = lvl?.id ?? "reading";
  const skillBank = getLevelStats(MODULE_ID, currentSkillId);
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
              <div class="card-title">Tiếp tục bài thi IELTS đang làm</div>
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
      action: "practice",
      iconName: "zap",
      title: "Luyện tập linh hoạt",
      text: "Lựa chọn các bộ đề Cambridge từ Cam 10 đến Cam 21 để luyện từng phần.",
      meta: ["Tự do chọn đề", "Không áp lực thời gian"],
      disabled: skillBank.answerable === 0,
    },
    {
      action: "exam",
      iconName: "trophy",
      title: `Thi thử ${lvl?.label ?? ""} bấm giờ`,
      text: `Mô phỏng bài thi thật ${lvl?.examMinutes ?? 60} phút chuẩn phòng thi với đồng hồ đếm ngược.`,
      meta: [`${lvl?.examMinutes ?? 60} phút`, `Mục tiêu Band ≥ 6.5`],
      disabled: skillBank.answerable === 0,
    },
  ].map(cardHtml).join("");

  const reviewModes = [
    {
      action: "wrong",
      iconName: "xCircle",
      title: "Luyện câu chưa nhớ",
      text: wrong.length
        ? `Bạn đang có ${wrong.length} phần thi/câu hỏi cần củng cố lại.`
        : "Chưa có câu sai nào — hãy làm bài để hệ thống gom các câu bạn cần ôn luyện.",
      meta: [`${wrong.length} câu`],
      disabled: wrong.length === 0,
    },
    {
      action: "saved",
      iconName: "bookmark",
      title: "Đề đã đánh dấu",
      text: saved.length
        ? `${saved.length} đề thi bạn đã lưu để xem lại.`
        : "Bấm biểu tượng cờ lưu ở mỗi đề thi để tập hợp những bộ đề hay.",
      meta: [`${saved.length} đề đã lưu`],
      disabled: saved.length === 0,
    },
    {
      action: "flashcards",
      iconName: "refresh",
      title: "Từ vựng IELTS theo chủ đề",
      text: "Học từ vựng học thuật Academic Vocabulary List (AVL) theo phương pháp lặp lại ngắt quãng SM-2.",
      meta: ["Spaced Repetition", "Từ vựng 7.0+"],
      disabled: false,
    },
    {
      action: "lessons",
      iconName: "bookOpen",
      title: "Chiến thuật làm bài",
      text: "Kỹ năng Skimming, Scanning, phân tích bài nghe và tránh bẫy thường gặp trong đề thi.",
      meta: ["Tips & Tricks", "Chiến thuật 8.0+"],
      disabled: false,
    },
  ].map(cardHtml).join("");

  // Danh sách các bộ đề thi IELTS gộp
  const stages = m.stages || [];
  const skillStages = stages.filter((s: any) => {
    if (currentSkillId === "reading") return s.readingPassages > 0;
    if (currentSkillId === "listening") return s.listeningParts > 0;
    return true;
  });

  const stagesGridHtml = skillStages.length
    ? `<div class="feature-grid mb-32" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr))">
        ${skillStages
          .map((s: any) => {
            const hasAudio = s.listeningParts > 0;
            const hasReading = s.readingPassages > 0;
            const partsList = [
              hasAudio ? `${s.listeningParts || 4} Phần Nghe` : null,
              hasReading ? `${s.readingPassages || 3} Bài Đọc` : null,
            ].filter(Boolean).join(" + ");

            return `<div class="card card-pad" style="display:flex;flex-direction:column;justify-content:space-between">
              <div>
                <div class="row-between mb-8">
                  <span class="badge badge-brand">${icon("clock")}${esc(s.durationMinutes)}′</span>
                  <span class="text-xs text-muted nums">${s.questionCount ? `${s.questionCount} câu` : partsList}</span>
                </div>
                <div class="card-title" style="font-size:16px">${esc(s.name)}</div>
                <p class="card-note mt-4">${partsList}: Đầy đủ bài đọc học thuật và bài nghe Audio MP3 trực tiếp chuẩn Cambridge.</p>
              </div>
              <div class="row gap-8 mt-16">
                <button class="btn btn-outline btn-sm" style="flex:1" data-action="stagePractice" data-arg="${esc(s.id)}">${icon("zap")}Luyện tập</button>
                <button class="btn btn-primary btn-sm" style="flex:1" data-action="stageExam" data-arg="${esc(s.id)}">${icon("trophy")}Thi thử</button>
              </div>
            </div>`;
          })
          .join("")}
      </div>`
    : `<div class="empty card card-pad"><p>Đang cập nhật danh sách đề thi cho kỹ năng này.</p></div>`;

  const historyCard = attempts.length
    ? `<div class="card card-pad mb-32">
        <div class="card-head">
          <div>
            <div class="card-title">Lịch sử làm bài gần đây</div>
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
                    <div class="text-xs text-muted nums">${a.correct}/${a.total} phần</div>
                  </div>
                </div>
              </div>`
            )
            .join("")}
        </div>
      </div>`
    : "";

  // Bộ chọn Kỹ năng IELTS (Reading, Listening, Writing, Speaking)
  const skillTabs = (m.levels || [])
    .map((l) => {
      const isActive = l.id.toLowerCase() === currentSkillId.toLowerCase();
      const count = l.questionCount ? `${formatNumber(l.questionCount)} phần` : "";
      return `<button class="pill ${isActive ? "is-active" : ""}" data-action="selectSkill" data-arg="${esc(l.id)}" style="font-size:15px;padding:8px 20px;font-weight:700">
        ${esc(l.label)} ${count ? `<span class="text-xs nums" style="font-weight:500;opacity:0.85;margin-left:5px">(${count})</span>` : ""}
      </button>`;
    })
    .join("");

  const content = `
    <div class="page-head">
      <div class="page">
        ${crumbs([{ label: "Trang chủ", action: "go", arg: "/" }, { label: "Chứng chỉ", action: "go", arg: "/chung-chi" }, { label: "IELTS" }])}
        <div class="page-head-main">
          <div class="page-head-text">
            <div class="row gap-8 wrap mb-12">
              <span class="badge badge-brand">${icon("globe")}${esc(m.provider)}</span>
              <span class="badge badge-good">${icon("checkCircle")}Cambridge IELTS C10–C21</span>
              <span class="badge badge-outline">${icon("list")}161 bộ đề thi</span>
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

      <!-- Khối chọn kỹ năng IELTS -->
      <div class="card card-pad mb-24" style="background:var(--surface);border:1px solid var(--line-strong)">
        <div class="row-between wrap gap-16" style="align-items:center">
          <div>
            <div class="card-title" style="font-size:17px;display:flex;align-items:center;gap:8px">
              ${icon("trophy", "text-brand")} Chọn kỹ năng IELTS ôn tập:
            </div>
            <div class="card-note mt-4">Hệ thống sẽ chuyển ngân hàng đề thi và tài liệu tương ứng.</div>
          </div>
          <div class="pill-group wrap">${skillTabs}</div>
        </div>
      </div>

      <!-- Lưới 4 chỉ số thống kê nằm ngang cân đối -->
      <div class="stat-grid mb-32">
        <div class="stat-box">
          <div class="k">${icon("list")}Đề thi ${lvl?.label ?? ""}</div>
          <div class="v">${formatNumber(skillStages.length)} <small style="font-size:14px;color:var(--muted);font-weight:500">bộ đề</small></div>
        </div>
        <div class="stat-box">
          <div class="k">${icon("clock")}Thời gian làm bài</div>
          <div class="v">${lvl?.examMinutes ?? 60} <small style="font-size:14px;color:var(--muted);font-weight:500">phút</small></div>
        </div>
        <div class="stat-box">
          <div class="k">${icon("target")}Mục tiêu điểm</div>
          <div class="v">Band 6.5+</div>
        </div>
        <div class="stat-box">
          <div class="k">${icon("trophy")}Điểm cao nhất của bạn</div>
          <div class="v">${stats.attempts ? `${stats.bestPct}%` : "—"}</div>
        </div>
      </div>

      ${sectionHead(`Chế độ học phần ${lvl?.label ?? ""}`, `Luyện tập chuyên sâu kỹ năng IELTS ${lvl?.label ?? ""}`)}
      <div class="feature-grid mb-32">${mainModes}</div>

      ${sectionHead(`Danh sách đề thi IELTS ${lvl?.label ?? ""}`, `${skillStages.length} bộ đề thi Cambridge và Actual Tests`)}
      ${stagesGridHtml}

      ${sectionHead("Củng cố kiến thức", "Ghi nhớ từ vựng học thuật & chiến thuật")}
      <div class="feature-grid mb-32">${reviewModes}</div>

      ${historyCard}
    </div>
  `;

  root.innerHTML = renderPage({ active: "certs", content });

  bindShell(root, "certs", {
    selectSkill: (skId) => {
      if (skId) {
        state.skillId = skId.toLowerCase();
        state.stageId = "all";
        persist();
        renderHome(root, state.skillId);
      }
    },
    resume: async () => {
      if (live) {
        continueLiveExam();
        return;
      }
      const s = loadSession(MODULE_ID);
      if (!s) return;
      toast("Đang tải lại bài làm...", "default", 1500);
      try {
        const questions = await ensureQuestions(state.skillId);
        const ok = resumeExam(s, {
          brandLabel: brandLabel(),
          exitPath: `/${MODULE_ID}/${state.skillId}`,
          passPct: lvl?.passPct ?? 70,
          bilingual: false,
          pool: questions,
        });
        if (!ok) {
          clearSession(MODULE_ID);
          toast("Không khôi phục được bài cũ.", "bad");
          renderHome(root, state.skillId);
        }
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), "bad");
      }
    },
    dropSession: () => {
      clearSession(MODULE_ID);
      toast("Đã bỏ bài làm dở.", "good");
      renderHome(root, state.skillId);
    },
    practice: () => {
      state.mode = "practice";
      persist();
      navigate(`/${MODULE_ID}/thiet-lap`);
    },
    exam: () => {
      state.mode = "exam";
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
      state.source = "all";
      persist();
      navigate(`/${MODULE_ID}/thiet-lap`);
    },
    stageExam: async (stageId) => {
      if (!stageId) return;
      const st = skillStages.find((s: any) => s.id === stageId);
      const stName = st?.name ?? stageId;
      try {
        const all = await ensureQuestions(state.skillId);
        const list = all.filter((q) => !stageId || q.stageId === stageId);
        if (!list.length) {
          toast("Chưa có nội dung cho kỳ thi này.", "bad");
          return;
        }
        startExam({
          moduleId: MODULE_ID,
          levelId: state.skillId,
          stageId,
          label: `Thi thử ${lvl?.label ?? ""} - ${stName}`,
          brandLabel: brandLabel(),
          questions: list,
          mode: "exam",
          durationSec: (lvl?.examMinutes ?? 60) * 60,
          bilingual: false,
          passPct: lvl?.passPct ?? 70,
          exitPath: `/${MODULE_ID}/${state.skillId}`,
        });
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), "bad");
      }
    },
  });
}

// ------------------------------------------------------------ Màn thiết lập bài làm IELTS

function renderSetup(root: HTMLElement): void {
  setModuleTheme(MODULE_ID);
  const m = meta();
  const lvl = currentLevelMeta();
  const stages = (m?.stages || []).filter((s: any) => !s.skill || s.skill === state.skillId);

  const counts: (number | "all")[] = [5, 10, 20, "all"];
  const orders: { id: "sequential" | "random"; label: string; desc: string }[] = [
    { id: "sequential", label: "Theo thứ tự Cambridge", desc: "Lần lượt theo đề" },
    { id: "random", label: "Ngẫu nhiên", desc: "Xáo trộn thứ tự các đề" },
  ];

  const content = `
    <div class="page-head">
      <div class="page">
        ${crumbs([
          { label: "Trang chủ", action: "go", arg: "/" },
          { label: `IELTS ${lvl?.label ?? ""}`, action: "go", arg: `/${MODULE_ID}/${state.skillId}` },
          { label: "Thiết lập bài làm" },
        ])}
        <div class="page-head-main">
          <div class="page-head-text">
            <div class="row gap-8 mb-8">
              <span class="badge badge-brand">Kỹ năng ${lvl?.label ?? ""}</span>
              <span class="badge badge-outline">${state.mode === "exam" ? "Thi thử" : "Luyện tập"}</span>
            </div>
            <h1>Thiết lập ${state.mode === "exam" ? "bài thi thử" : "luyện tập"} IELTS ${esc(lvl?.label ?? "")}</h1>
            <p class="lead">Tùy chỉnh bộ đề Cambridge và thời gian làm bài phù hợp với bạn.</p>
          </div>
        </div>
      </div>
    </div>

    <div class="page page-body">
      <div class="card card-pad mb-32" style="max-width:680px;margin:0 auto">
        <div class="mb-24">
          <div class="field-label mb-8">Bộ đề thi (${lvl?.label ?? ""})</div>
          <select class="select" data-select="setupStage">
            <option value="all" ${state.stageId === "all" ? "selected" : ""}>Tất cả các bộ đề (${stages.length} đề)</option>
            ${stages.map((s: any) => `<option value="${esc(s.id)}" ${state.stageId === s.id ? "selected" : ""}>${esc(s.name)} (${s.durationMinutes} phút)</option>`).join("")}
          </select>
        </div>

        <div class="mb-24">
          <div class="field-label mb-8">Nguồn đề</div>
          <div class="segmented" style="display:flex">
            <button class="btn ${state.source === "all" ? "btn-primary" : "btn-outline"}" style="flex:1" data-action="setSource" data-arg="all">Tất cả đề</button>
            <button class="btn ${state.source === "wrong" ? "btn-primary" : "btn-outline"}" style="flex:1" data-action="setSource" data-arg="wrong">Cần luyện lại</button>
            <button class="btn ${state.source === "saved" ? "btn-primary" : "btn-outline"}" style="flex:1" data-action="setSource" data-arg="saved">Đã đánh dấu</button>
          </div>
        </div>

        ${
          state.mode === "practice"
            ? `<div class="mb-24">
                <div class="field-label mb-8">Số lượng phần làm</div>
                <div class="pill-group wrap">
                  ${counts
                    .map(
                      (c) =>
                        `<button class="pill ${state.count === c ? "is-active" : ""}" data-action="setCount" data-arg="${c}">${c === "all" ? "Toàn bộ" : `${c} phần`}</button>`
                    )
                    .join("")}
                </div>
              </div>`
            : ""
        }

        <div class="mb-32">
          <div class="field-label mb-8">Thứ tự đề thi</div>
          <div class="row gap-12 wrap">
            ${orders
              .map(
                (o) =>
                  `<button class="card card-pad" style="flex:1 1 200px;text-align:left;border-color:${
                    state.order === o.id ? "var(--brand)" : "var(--line)"
                  };background:${state.order === o.id ? "var(--brand-soft)" : "var(--surface)"}" data-action="setOrder" data-arg="${o.id}">
                    <div class="fw-700 mb-4">${esc(o.label)}</div>
                    <div class="text-xs text-muted">${esc(o.desc)}</div>
                  </button>`
              )
              .join("")}
          </div>
        </div>

        <div class="row-between pt-16" style="border-top:1px solid var(--line)">
          <button class="btn btn-outline" data-action="go" data-arg="/${MODULE_ID}/${state.skillId}">${icon("arrowLeft")}Quay lại</button>
          <button class="btn btn-primary btn-lg" data-action="startNow">${icon("play")}Bắt đầu làm bài</button>
        </div>
      </div>
    </div>
  `;

  root.innerHTML = renderPage({ active: "certs", content });

  bindShell(root, "certs", {
    setSource: (s) => {
      state.source = (s as typeof state.source) || "all";
      persist();
      renderSetup(root);
    },
    setCount: (c) => {
      state.count = c === "all" ? "all" : Number(c);
      persist();
      renderSetup(root);
    },
    setOrder: (o) => {
      state.order = (o as typeof state.order) || "sequential";
      persist();
      renderSetup(root);
    },
    startNow: async () => {
      toast("Đang chuẩn bị đề thi IELTS...", "default", 1500);
      try {
        const all = await ensureQuestions(state.skillId);
        let list = all;

        if (state.stageId !== "all") {
          list = list.filter((q) => q.stageId === state.stageId);
        }

        if (state.source === "wrong") {
          const wrongSet = new Set(getWrong(MODULE_ID));
          list = list.filter((q) => wrongSet.has(q.n));
        } else if (state.source === "saved") {
          const savedSet = new Set(getBookmarks(MODULE_ID));
          list = list.filter((q) => savedSet.has(q.n));
        }

        if (state.order === "random") {
          list = [...list].sort(() => Math.random() - 0.5);
        }

        if (state.mode === "practice" && typeof state.count === "number") {
          list = list.slice(0, state.count);
        }

        if (!list.length) {
          toast("Không có đề thi nào thỏa mãn thiết lập.", "bad");
          return;
        }

        const label =
          state.source === "wrong"
            ? `Luyện lại IELTS ${lvl?.label ?? ""}`
            : state.source === "saved"
            ? `Đề IELTS đã lưu ${lvl?.label ?? ""}`
            : state.mode === "exam"
            ? `Thi thử IELTS ${lvl?.label ?? ""}`
            : `Luyện tập IELTS ${lvl?.label ?? ""}`;

        startExam({
          moduleId: MODULE_ID,
          levelId: state.skillId,
          stageId: state.stageId === "all" ? "exam" : state.stageId,
          label,
          brandLabel: brandLabel(),
          questions: list,
          mode: state.mode,
          durationSec: state.mode === "exam" ? (lvl?.examMinutes ?? 60) * 60 : null,
          bilingual: false,
          passPct: lvl?.passPct ?? 70,
          exitPath: `/${MODULE_ID}/${state.skillId}`,
        });
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), "bad");
      }
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

export function registerIeltsRoutes(): void {
  registerRoute("/ielts", (root) => renderHome(root));
  registerRoute("/ielts/:skill", (root, params) => renderHome(root, params[0]));
  registerRoute("/ielts/thiet-lap", (root) => renderSetup(root));
}
