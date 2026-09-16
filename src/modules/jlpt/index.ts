/**
 * Module JLPT: Hợp nhất 1 chứng chỉ duy nhất với 5 cấp độ N1, N2, N3, N4, N5.
 *
 * Layout cân đối, chuẩn giao diện với:
 * - Header thoáng đãng, chỉ chứa thông tin chứng chỉ và huy hiệu.
 * - Thanh chọn cấp độ N1–N5 trực quan, nổi bật ngay đầu trang.
 * - Lưới 4 chỉ số thống kê (stat-grid) nằm ngang cân đối.
 * - Lưới chế độ học, danh sách đề thi theo năm và củng cố kiến thức.
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

const MODULE_ID = "jlpt";

interface StoredState {
  levelId: string;
  mode: "practice" | "exam";
  count: number | "all";
  order: "sequential" | "random";
  source: "all" | "wrong" | "saved";
  stageId: string;
}

const state = {
  levelId: "n1",
  lang: "ja" as Lang,
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
  return m?.levels.find((l) => l.id.toLowerCase() === state.levelId.toLowerCase()) ?? m?.levels[0];
}

function brandLabel(): string {
  const lvl = currentLevelMeta();
  return lvl ? `JLPT ${lvl.label}` : "JLPT";
}

function hydrate(): void {
  const s = loadModuleState<StoredState>(MODULE_ID);
  if (!s) return;
  if (s.levelId) state.levelId = s.levelId;
  state.mode = s.mode ?? "practice";
  state.count = s.count ?? 30;
  state.order = s.order ?? "sequential";
  state.source = s.source ?? "all";
  state.stageId = s.stageId ?? "all";
}

function persist(): void {
  saveModuleState<StoredState>(MODULE_ID, {
    levelId: state.levelId,
    mode: state.mode,
    count: state.count,
    order: state.order,
    source: state.source,
    stageId: state.stageId,
  });
}

const cachedQuestionsMap = new Map<string, MultipleChoiceQuestion[]>();

async function ensureQuestions(levelId: string): Promise<MultipleChoiceQuestion[]> {
  const key = `${MODULE_ID}:${levelId}`;
  if (cachedQuestionsMap.has(key)) {
    return cachedQuestionsMap.get(key)!;
  }
  const questions = await loadMcQuestions(MODULE_ID, undefined, levelId);
  cachedQuestionsMap.set(key, questions);
  return questions;
}

// ------------------------------------------------------------ Trang tổng quan

function renderHome(root: HTMLElement, levelParam?: string): void {
  setModuleTheme(MODULE_ID);
  hydrate();
  if (levelParam && ["n1", "n2", "n3", "n4", "n5"].includes(levelParam.toLowerCase())) {
    state.levelId = levelParam.toLowerCase();
  }

  const m = meta();
  if (!m) {
    navigate("/chung-chi");
    return;
  }

  const lvl = currentLevelMeta();
  const currentLvlId = lvl?.id ?? "n1";
  const levelBank = getLevelStats(MODULE_ID, currentLvlId);
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
              <div class="card-title">Tiếp tục bài đang làm</div>
              <div class="card-note">${esc(session?.label ?? "Bài đang làm")} · dừng ở câu ${(session?.idx ?? 0) + 1}/${session?.qNums.length ?? "?"}${
                session?.remaining != null ? ` · còn ${Math.ceil(session.remaining / 60)} phút` : ""
              }</div>
            </div>
          </div>
          <div class="row gap-8 wrap">
            <button class="btn btn-ghost btn-sm" data-action="dropSession">${icon("trash")}Bỏ bài này</button>
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
      text: "Tùy chọn số lượng câu và kỳ thi — chấm ngay từng câu để đối chiếu giải thích tại chỗ.",
      meta: ["Chấm từng câu", "Tự do chọn đề"],
      disabled: levelBank.answerable === 0,
    },
    {
      action: "exam",
      iconName: "trophy",
      title: `Thi thử ${lvl?.label ?? ""} bấm giờ`,
      text: `Mô phỏng bài thi thật ${lvl?.examMinutes ?? 170} phút với đồng hồ đếm ngược, bảng câu hỏi và chấm điểm tổng kết sau khi nộp.`,
      meta: [`${lvl?.examMinutes ?? 170} phút`, `Đậu ≥ ${lvl?.passPct ?? 50}%`],
      disabled: levelBank.answerable === 0,
    },
  ].map(cardHtml).join("");

  const reviewModes = [
    {
      action: "wrong",
      iconName: "xCircle",
      title: "Luyện câu sai",
      text: wrong.length
        ? `Bạn đang có ${wrong.length} câu từng làm sai. Làm đúng lại để câu tự động rời khỏi danh sách.`
        : "Chưa có câu sai nào — hãy làm bài để hệ thống gom các câu bạn cần củng cố.",
      meta: [`${wrong.length} câu sai`],
      disabled: wrong.length === 0,
    },
    {
      action: "saved",
      iconName: "bookmark",
      title: "Câu đã đánh dấu",
      text: saved.length
        ? `${saved.length} câu bạn đã ghim lưu để ôn lại kỹ hơn.`
        : "Bấm biểu tượng cờ lưu ở mỗi câu hỏi để tập hợp những câu quan trọng.",
      meta: [`${saved.length} câu đã lưu`],
      disabled: saved.length === 0,
    },
    {
      action: "flashcards",
      iconName: "refresh",
      title: "Thẻ ghi nhớ (SM-2)",
      text: `Ôn tập chữ Hán và từ vựng ${lvl?.label ?? ""} then chốt theo thuật toán lặp ngắt quãng tối ưu trí nhớ.`,
      meta: ["Spaced Repetition", `Từ vựng ${lvl?.label ?? ""}`],
      disabled: false,
    },
    {
      action: "lessons",
      iconName: "bookOpen",
      title: "Cẩm nang & Ngữ pháp",
      text: `Tổng hợp ngữ pháp ${lvl?.label ?? ""} cốt lõi và các bẫy thường gặp trong đề thi thật.`,
      meta: [`Ngữ pháp ${lvl?.label ?? ""}`, "Lý thuyết"],
      disabled: false,
    },
  ].map(cardHtml).join("");

  const levelStages = (lvl as any)?.stages || m.stages || [];

  const stagesGridHtml = levelStages.length
    ? `<div class="feature-grid mb-32" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr))">
        ${levelStages
          .map((s: any) => {
            return `<div class="card card-pad" style="display:flex;flex-direction:column;justify-content:space-between">
              <div>
                <div class="row-between mb-8">
                  <span class="badge badge-brand">${icon("trophy")}${esc(s.name.replace(/^Đề\s*(thi\s*)?/i, ""))}</span>
                  <span class="text-xs text-muted nums">${s.questionCount ?? ""} câu</span>
                </div>
                <div class="card-title" style="font-size:16px">${esc(s.name)}</div>
                <p class="card-note mt-4">Đề thi chuẩn JLPT ${lvl?.label ?? ""} có đáp án &amp; giải thích chi tiết.</p>
              </div>
              <div class="row gap-8 mt-16">
                <button class="btn btn-outline btn-sm" style="flex:1" data-action="stagePractice" data-arg="${esc(s.id)}">${icon("zap")}Luyện</button>
                <button class="btn btn-primary btn-sm" style="flex:1" data-action="stageExam" data-arg="${esc(s.id)}">${icon("trophy")}Thi</button>
              </div>
            </div>`;
          })
          .join("")}
      </div>`
    : `<div class="empty card card-pad"><p>Đang cập nhật danh sách đề thi cho cấp độ này.</p></div>`;

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
                    <div class="text-xs text-muted nums">${a.correct}/${a.total} câu</div>
                  </div>
                </div>
              </div>`
            )
            .join("")}
        </div>
      </div>`
    : "";

  // Bộ chọn Cấp độ JLPT (N1 → N5)
  const levelTabs = (m.levels || [])
    .map((l) => {
      const isActive = l.id.toLowerCase() === currentLvlId.toLowerCase();
      const count = l.questionCount ? `${formatNumber(l.questionCount)} câu` : "";
      return `<button class="pill ${isActive ? "is-active" : ""}" data-action="selectLevel" data-arg="${esc(l.id)}" style="font-size:15px;padding:8px 20px;font-weight:700">
        ${esc(l.label)} ${count ? `<span class="text-xs nums" style="font-weight:500;opacity:0.85;margin-left:5px">(${count})</span>` : ""}
      </button>`;
    })
    .join("");

  const content = `
    <div class="page-head">
      <div class="page">
        ${crumbs([{ label: "Trang chủ", action: "go", arg: "/" }, { label: "Chứng chỉ", action: "go", arg: "/chung-chi" }, { label: "JLPT" }])}
        <div class="page-head-main">
          <div class="page-head-text">
            <div class="row gap-8 wrap mb-12">
              <span class="badge badge-brand">${icon("language")}${esc(m.provider)}</span>
              <span class="badge badge-good">${icon("checkCircle")}5 Cấp độ N1–N5</span>
              <span class="badge badge-outline">${icon("list")}6,692 câu hỏi thật</span>
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

      <!-- Khối chọn cấp độ N1..N5 -->
      <div class="card card-pad mb-24" style="background:var(--surface);border:1px solid var(--line-strong)">
        <div class="row-between wrap gap-16" style="align-items:center">
          <div>
            <div class="card-title" style="font-size:17px;display:flex;align-items:center;gap:8px">
              ${icon("trophy", "text-brand")} Chọn cấp độ JLPT ôn tập:
            </div>
            <div class="card-note mt-4">Hệ thống sẽ chuyển ngân hàng câu hỏi và cấu trúc thi tương ứng.</div>
          </div>
          <div class="pill-group wrap">${levelTabs}</div>
        </div>
      </div>

      <!-- Lưới 4 chỉ số thống kê nằm ngang cân đối -->
      <div class="stat-grid mb-32">
        <div class="stat-box">
          <div class="k">${icon("list")}Ngân hàng câu hỏi ${lvl?.label ?? ""}</div>
          <div class="v">${formatNumber(levelBank.total)} <small style="font-size:14px;color:var(--muted);font-weight:500">câu</small></div>
        </div>
        <div class="stat-box">
          <div class="k">${icon("clock")}Thời gian thi chuẩn</div>
          <div class="v">${lvl?.examMinutes ?? 170} <small style="font-size:14px;color:var(--muted);font-weight:500">phút</small></div>
        </div>
        <div class="stat-box">
          <div class="k">${icon("target")}Ngưỡng điểm đậu</div>
          <div class="v">≥ ${lvl?.passPct ?? 50}%</div>
        </div>
        <div class="stat-box">
          <div class="k">${icon("trophy")}Điểm cao nhất của bạn</div>
          <div class="v">${stats.attempts ? `${stats.bestPct}%` : "—"}</div>
        </div>
      </div>

      ${sectionHead(`Chế độ học cấp độ ${lvl?.label ?? ""}`, `Lựa chọn phương pháp ôn tập phù hợp với cấp độ ${lvl?.label ?? ""}`)}
      <div class="feature-grid mb-32">${mainModes}</div>

      ${sectionHead(`Danh sách đề thi JLPT ${lvl?.label ?? ""}`, `${levelStages.length} bộ đề thi chính thức chuẩn JLPT ${lvl?.label ?? ""}`)}
      ${stagesGridHtml}

      ${sectionHead("Củng cố kiến thức", "Ghi nhớ và khắc phục điểm yếu")}
      <div class="feature-grid mb-32">${reviewModes}</div>

      ${historyCard}
    </div>
  `;

  root.innerHTML = renderPage({ active: "certs", content });

  bindShell(root, "certs", {
    selectLevel: (lvlId) => {
      if (lvlId) {
        state.levelId = lvlId.toLowerCase();
        state.stageId = "all";
        persist();
        renderHome(root, state.levelId);
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
        const questions = await ensureQuestions(state.levelId);
        const ok = resumeExam(s, {
          brandLabel: brandLabel(),
          exitPath: `/${MODULE_ID}/${state.levelId}`,
          passPct: lvl?.passPct ?? 50,
          bilingual: false,
          pool: questions,
        });
        if (!ok) {
          clearSession(MODULE_ID);
          toast("Không khôi phục được bài cũ.", "bad");
          renderHome(root, state.levelId);
        }
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), "bad");
      }
    },
    dropSession: () => {
      clearSession(MODULE_ID);
      toast("Đã bỏ bài làm dở.", "good");
      renderHome(root, state.levelId);
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
      const st = levelStages.find((s: any) => s.id === stageId);
      const stName = st?.name ?? stageId;
      try {
        const all = await ensureQuestions(state.levelId);
        const list = all.filter((q) => !stageId || q.stageId === stageId);
        if (!list.length) {
          toast("Chưa có câu hỏi cho kỳ thi này.", "bad");
          return;
        }
        startExam({
          moduleId: MODULE_ID,
          levelId: state.levelId,
          stageId,
          label: `Thi thử ${lvl?.label ?? ""} - ${stName}`,
          brandLabel: brandLabel(),
          questions: list,
          mode: "exam",
          durationSec: (lvl?.examMinutes ?? 170) * 60,
          bilingual: false,
          passPct: lvl?.passPct ?? 50,
          exitPath: `/${MODULE_ID}/${state.levelId}`,
        });
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), "bad");
      }
    },
  });
}

// ------------------------------------------------------------ Màn thiết lập bài làm

function renderSetup(root: HTMLElement): void {
  setModuleTheme(MODULE_ID);
  const m = meta();
  const lvl = currentLevelMeta();
  const stages = (lvl as any)?.stages || m?.stages || [];

  const counts: (number | "all")[] = [15, 30, 60, "all"];
  const orders: { id: "sequential" | "random"; label: string; desc: string }[] = [
    { id: "sequential", label: "Theo thứ tự đề", desc: "Lần lượt từ câu 1 đến hết" },
    { id: "random", label: "Ngẫu nhiên", desc: "Xáo trộn thứ tự các câu hỏi" },
  ];

  const content = `
    <div class="page-head">
      <div class="page">
        ${crumbs([
          { label: "Trang chủ", action: "go", arg: "/" },
          { label: `JLPT ${lvl?.label ?? ""}`, action: "go", arg: `/${MODULE_ID}/${state.levelId}` },
          { label: "Thiết lập bài làm" },
        ])}
        <div class="page-head-main">
          <div class="page-head-text">
            <div class="row gap-8 mb-8">
              <span class="badge badge-brand">Cấp độ ${lvl?.label ?? ""}</span>
              <span class="badge badge-outline">${state.mode === "exam" ? "Thi thử" : "Luyện tập"}</span>
            </div>
            <h1>Thiết lập ${state.mode === "exam" ? "bài thi thử" : "luyện tập"} JLPT ${esc(lvl?.label ?? "")}</h1>
            <p class="lead">Tùy chỉnh phạm vi câu hỏi và cách làm bài theo mục tiêu ôn tập của bạn.</p>
          </div>
        </div>
      </div>
    </div>

    <div class="page page-body">
      <div class="card card-pad mb-32" style="max-width:680px;margin:0 auto">
        <div class="mb-24">
          <div class="field-label mb-8">Kỳ thi / Bộ đề (${lvl?.label ?? ""})</div>
          <select class="select" data-select="setupStage">
            <option value="all" ${state.stageId === "all" ? "selected" : ""}>Tất cả các đề thi</option>
            ${stages.map((s: any) => `<option value="${esc(s.id)}" ${state.stageId === s.id ? "selected" : ""}>${esc(s.name)} (${s.questionCount ?? 0} câu)</option>`).join("")}
          </select>
        </div>

        <div class="mb-24">
          <div class="field-label mb-8">Nguồn câu hỏi</div>
          <div class="segmented" style="display:flex">
            <button class="btn ${state.source === "all" ? "btn-primary" : "btn-outline"}" style="flex:1" data-action="setSource" data-arg="all">Tất cả câu</button>
            <button class="btn ${state.source === "wrong" ? "btn-primary" : "btn-outline"}" style="flex:1" data-action="setSource" data-arg="wrong">Từng làm sai</button>
            <button class="btn ${state.source === "saved" ? "btn-primary" : "btn-outline"}" style="flex:1" data-action="setSource" data-arg="saved">Đã đánh dấu</button>
          </div>
        </div>

        ${
          state.mode === "practice"
            ? `<div class="mb-24">
                <div class="field-label mb-8">Số lượng câu</div>
                <div class="pill-group wrap">
                  ${counts
                    .map(
                      (c) =>
                        `<button class="pill ${state.count === c ? "is-active" : ""}" data-action="setCount" data-arg="${c}">${c === "all" ? "Toàn bộ" : `${c} câu`}</button>`
                    )
                    .join("")}
                </div>
              </div>`
            : ""
        }

        <div class="mb-32">
          <div class="field-label mb-8">Thứ tự câu hỏi</div>
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
          <button class="btn btn-outline" data-action="go" data-arg="/${MODULE_ID}/${state.levelId}">${icon("arrowLeft")}Quay lại</button>
          <button class="btn btn-primary btn-lg" data-action="startNow">${icon("play")}Bắt đầu ngay</button>
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
      toast("Đang chuẩn bị đề thi...", "default", 1500);
      try {
        const all = await ensureQuestions(state.levelId);
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
          toast("Không có câu hỏi nào thỏa mãn thiết lập.", "bad");
          return;
        }

        const label =
          state.source === "wrong"
            ? `Luyện câu sai JLPT ${lvl?.label ?? ""}`
            : state.source === "saved"
            ? `Câu đã lưu JLPT ${lvl?.label ?? ""}`
            : state.mode === "exam"
            ? `Thi thử JLPT ${lvl?.label ?? ""}`
            : `Luyện tập JLPT ${lvl?.label ?? ""}`;

        startExam({
          moduleId: MODULE_ID,
          levelId: state.levelId,
          stageId: state.stageId === "all" ? "exam" : state.stageId,
          label,
          brandLabel: brandLabel(),
          questions: list,
          mode: state.mode,
          durationSec: state.mode === "exam" ? (lvl?.examMinutes ?? 170) * 60 : null,
          bilingual: false,
          passPct: lvl?.passPct ?? 50,
          exitPath: `/${MODULE_ID}/${state.levelId}`,
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

export function registerJlptRoutes(): void {
  registerRoute("/jlpt", (root) => renderHome(root));
  registerRoute("/jlpt/:level", (root, params) => renderHome(root, params[0]));
  registerRoute("/jlpt/thiet-lap", (root) => renderSetup(root));

  // Hỗ trợ backwards compatibility nếu người dùng gõ /jlpt-n1, /jlpt-n2...
  for (const lvl of ["n1", "n2", "n3", "n4", "n5"]) {
    registerRoute(`/jlpt-${lvl}`, (root) => renderHome(root, lvl));
    registerRoute(`/jlpt-${lvl}/thiet-lap`, (root) => {
      state.levelId = lvl;
      renderSetup(root);
    });
  }
}
