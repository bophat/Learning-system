/**
 * Module AP (Kỹ sư CNTT ứng dụng — 応用情報技術者試験).
 *
 * Kỳ thi này có hai buổi với hai hình thức hoàn toàn khác nhau:
 *  - Buổi sáng: trắc nghiệm có giờ, tự do nhảy câu, chấm sau khi nộp toàn bài
 *    → dùng chung bộ máy `modules/shared/mcExam` ở chế độ "exam".
 *  - Buổi chiều: chọn 5 trong 11 đề tự luận (đề 1 bắt buộc), tự viết rồi đối
 *    chiếu đáp án mẫu — không chấm tự động được nên có màn hình riêng.
 *
 * Câu hỏi lấy từ Supabase, tách theo `stage_id` là "morning" và "afternoon".
 */

import type { EssayQuestion, MultipleChoiceQuestion } from "../../types/exam";
import { registerRoute, navigate } from "../../router";
import { renderPage, bindShell, setModuleTheme } from "../../components/appShell";
import { icon } from "../../components/icons";
import { esc, bindInputs } from "../../components/bindActions";
import { toast } from "../../components/toast";
import { confirmDialog } from "../../components/modal";
import { withData } from "../../components/loading";
import { crumbs, notice, ring, formatDuration, formatDateTime } from "../../components/ui";
import { loadModuleState, saveModuleState } from "../../state/storage";
import { currentUserId } from "../../state/auth";
import { getModuleStats, getAttempts } from "../../state/progress";
import { loadSession, clearSession } from "../../state/session";
import { startExam, resumeExam, hasLiveExam, continueLiveExam } from "../shared/mcExam";
import { loadMcQuestions, loadEssayQuestions } from "../../data/questions";
import { getModule, getBankStats } from "../../data/catalog";

const MODULE_ID = "ap";
const REQUIRED_ESSAY = "1";
const PICK_COUNT = 5;
/** Đề thật: 80 câu / 150 phút. Bộ đề ít câu hơn thì rút gọn thời gian theo cùng nhịp. */
const SECONDS_PER_QUESTION = (150 / 80) * 60;

interface StoredState {
  picked: string[];
  drafts: Record<string, string>;
  writeIdx: number;
}

const afternoon = {
  picked: [REQUIRED_ESSAY] as string[],
  drafts: {} as Record<string, string>,
  writeIdx: 0,
  revealed: {} as Record<string, boolean>,
};

let hydratedFor: string | null = null;
function hydrate(): void {
  const uid = currentUserId();
  if (hydratedFor === uid) return;
  hydratedFor = uid;
  const p = loadModuleState<StoredState>(MODULE_ID);
  afternoon.picked = Array.isArray(p.picked) && p.picked.includes(REQUIRED_ESSAY) ? p.picked : [REQUIRED_ESSAY];
  afternoon.drafts = p.drafts ?? {};
  afternoon.writeIdx = p.writeIdx ?? 0;
  afternoon.revealed = {};
}

function saveAfternoon(): void {
  saveModuleState<StoredState>(MODULE_ID, {
    picked: afternoon.picked,
    drafts: afternoon.drafts,
    writeIdx: afternoon.writeIdx,
  });
}

let morningQuestions: MultipleChoiceQuestion[] = [];
let essays: EssayQuestion[] = [];

async function ensureMorning(): Promise<void> {
  if (morningQuestions.length) return;
  morningQuestions = await loadMcQuestions(MODULE_ID, "morning");
}

async function ensureEssays(): Promise<void> {
  if (essays.length) return;
  essays = await loadEssayQuestions(MODULE_ID, "afternoon");
}

function meta() {
  return getModule(MODULE_ID);
}

function brandLabel(): string {
  const m = meta();
  return m ? `${m.shortName} ${m.shortLabel}` : "AP";
}

function passPct(): number {
  return meta()?.passPct ?? 60;
}

function pickedSorted(): string[] {
  return afternoon.picked.slice().sort((a, b) => Number(a) - Number(b));
}

function draftedCount(): number {
  return essays.reduce(
    (sum, e) => sum + (e.subQuestions.some((s) => (afternoon.drafts[s.id] ?? "").trim().length > 0) ? 1 : 0),
    0
  );
}

// ------------------------------------------------------------ trang tổng quan

function renderHome(root: HTMLElement): void {
  setModuleTheme(MODULE_ID);
  hydrate();
  const m = meta();
  if (!m) {
    navigate("/chung-chi");
    return;
  }

  const bank = getBankStats(MODULE_ID);
  const stats = getModuleStats(MODULE_ID);
  const attempts = getAttempts(MODULE_ID).slice(0, 4);
  const session = loadSession(MODULE_ID);
  const live = hasLiveExam(MODULE_ID);
  const morningMinutes = Math.max(1, Math.round((bank.mcTotal * SECONDS_PER_QUESTION) / 60));

  const resumeCard = session || live
    ? `<div class="card card-pad mb-24" style="border-color:var(--accent-soft-2);background:var(--accent-soft)">
        <div class="row-between">
          <div class="row gap-16" style="min-width:0">
            <div class="icon-chip lg">${icon("play")}</div>
            <div style="min-width:0">
              <div class="card-title">Tiếp tục bài buổi sáng</div>
              <div class="card-note">Dừng ở câu ${(session?.idx ?? 0) + 1}/${session?.qNums.length ?? "?"}${
                session?.remaining != null ? ` · còn ${Math.ceil(session.remaining / 60)} phút` : ""
              }</div>
            </div>
          </div>
          <div class="row gap-8 wrap">
            <button class="btn btn-ghost btn-sm" data-action="dropSession">${icon("trash")}Bỏ bài này</button>
            <button class="btn btn-accent" data-action="resume">${icon("arrowRight")}Làm tiếp</button>
          </div>
        </div>
      </div>`
    : "";

  const stageCards = `
    <button class="mode-card" data-action="morning" ${bank.mcTotal === 0 ? "disabled" : ""}>
      <div class="icon-chip">${icon("sun")}</div>
      <h3>Buổi sáng · Trắc nghiệm</h3>
      <p>Đề thật 80 câu trong 150 phút. Bộ đề hiện có ${bank.mcTotal} câu, thời gian rút gọn tương ứng ${morningMinutes} phút.</p>
      <div class="mode-meta">
        <span class="badge badge-outline">${bank.mcTotal} câu</span>
        <span class="badge badge-outline">${morningMinutes} phút</span>
        <span class="badge badge-outline">Nhảy câu tự do</span>
      </div>
    </button>
    <button class="mode-card" data-action="afternoon" ${bank.essayTotal === 0 ? "disabled" : ""}>
      <div class="icon-chip">${icon("pencil")}</div>
      <h3>Buổi chiều · Tự luận</h3>
      <p>Chọn ${PICK_COUNT} trong ${bank.essayTotal} đề (đề 1 An toàn thông tin bắt buộc), tự viết rồi đối chiếu đáp án mẫu.</p>
      <div class="mode-meta">
        <span class="badge badge-outline">Chọn ${PICK_COUNT}/${bank.essayTotal} đề</span>
        <span class="badge badge-outline">Lưu nháp tự động</span>
      </div>
    </button>
    <button class="mode-card" data-action="flashcards">
      <div class="icon-chip">${icon("refresh")}</div>
      <h3>Thẻ ghi nhớ (SM-2)</h3>
      <p>Ôn tập ngắt quãng khoa học não bộ cho thuật ngữ và kiến thức AP.</p>
      <div class="mode-meta">
        <span class="badge badge-outline">Lặp ngắt quãng</span>
        <span class="badge badge-outline">Flashcard</span>
      </div>
    </button>
    <button class="mode-card" data-action="lessons">
      <div class="icon-chip">${icon("bookOpen")}</div>
      <h3>Bài giảng lý thuyết</h3>
      <p>Tóm lược kiến thức nền tảng và trọng tâm cốt lõi trước khi vào luyện đề.</p>
      <div class="mode-meta">
        <span class="badge badge-outline">Lý thuyết nền</span>
        <span class="badge badge-outline">Markdown</span>
      </div>
    </button>`;

  const historyRows = attempts.length
    ? attempts
        .map(
          (a) => `<div class="list-row">
            <div class="icon-chip ${a.passed ? "good" : "bad"}">${icon(a.passed ? "trophy" : "target")}</div>
            <div class="list-main">
              <div class="list-title">${esc(a.label)}</div>
              <div class="list-sub">${esc(formatDateTime(a.at))} · ${esc(formatDuration(a.durationSec))}</div>
            </div>
            <div class="list-side"><div style="text-align:right">
              <div class="fw-700 nums">${a.pct}%</div>
              <div class="text-xs text-muted nums">${a.correct}/${a.total}</div>
            </div></div>
          </div>`
        )
        .join("")
    : `<p class="card-note">Chưa có lần thi thử nào ở chứng chỉ này.</p>`;

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
            <div class="row gap-8 wrap mb-12">
              <span class="badge badge-accent">${icon(m.iconName)}${esc(m.shortLabel)}</span>
              ${m.sampleData ? `<span class="badge badge-warn">${icon("info")}Dữ liệu minh hoạ</span>` : ""}
              <span class="badge badge-outline">${icon("layers")}${m.stages.length} buổi thi</span>
            </div>
            <h1>${esc(m.fullName)}</h1>
            <p class="lead">${esc(m.description)}</p>
          </div>
          ${stats.attempts ? `<div class="page-head-side">${ring({ pct: stats.bestPct, size: 108, stroke: 10, label: "điểm cao nhất" })}</div>` : ""}
        </div>
      </div>
    </div>

    <div class="page page-body">
      ${resumeCard}
      ${
        m.sampleData
          ? notice(
              "<strong>Đang dùng câu hỏi minh hoạ.</strong> Chưa có ngân hàng đề AP thật (IPA/VITEC), nên nội dung câu hỏi ở đây do dự án tự soạn để dựng đúng luồng thi. Khi có đề thật, quản trị viên nạp đề mới lên là thay được ngay.",
              "warn",
              "alert"
            )
          : ""
      }

      <div class="stat-grid mt-24 mb-32">
        <div class="stat-box"><div class="k">${icon("sun")}Câu buổi sáng</div><div class="v">${bank.mcTotal}</div></div>
        <div class="stat-box"><div class="k">${icon("pencil")}Đề buổi chiều</div><div class="v">${bank.essayTotal}</div></div>
        <div class="stat-box"><div class="k">${icon("refresh")}Lần thi thử</div><div class="v">${stats.attempts}</div></div>
        <div class="stat-box"><div class="k">${icon("target")}Ngưỡng đậu</div><div class="v">${passPct()}<small>% mỗi buổi</small></div></div>
      </div>

      <h2 class="card-title mb-16" style="font-size:20px">Hai buổi thi</h2>
      <div class="mode-grid mb-32">${stageCards}</div>

      <div class="feature-grid">
        <div class="card card-pad">
          <div class="card-head">
            <div><div class="card-title">Lần làm bài gần đây</div></div>
            <button class="btn btn-ghost btn-sm" data-action="go" data-arg="/tien-trinh">Tất cả${icon("chevronRight")}</button>
          </div>
          <div class="list">${historyRows}</div>
        </div>
        <div class="card card-pad">
          <div class="card-head"><div class="card-title">Cấu trúc đề thi thật</div></div>
          <div class="facts">
            ${m.facts.map((f) => `<div class="fact-row"><span>${esc(f.label)}</span><b>${esc(f.value)}</b></div>`).join("")}
          </div>
        </div>
      </div>
    </div>`;

  root.innerHTML = renderPage({ active: "certs", content });

  bindShell(root, "certs", {
    morning: async () => {
      toast("Đang tải đề buổi sáng...", "default", 1500);
      try {
        await ensureMorning();
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), "bad", 4000);
        return;
      }
      if (morningQuestions.length === 0) {
        toast("Chưa có câu hỏi cho buổi sáng.", "bad");
        return;
      }
      startExam({
        moduleId: MODULE_ID,
        stageId: "morning",
        label: "Buổi sáng",
        brandLabel: brandLabel(),
        questions: morningQuestions,
        mode: "exam",
        durationSec: Math.round(morningQuestions.length * SECONDS_PER_QUESTION),
        bilingual: !!m.bilingual,
        passPct: passPct(),
        exitPath: "/ap",
      });
    },
    afternoon: () => navigate("/ap/buoi-chieu"),
    flashcards: () => navigate("/on-tap/ap"),
    lessons: () => navigate("/bai-hoc/ap"),
    resume: async () => {
      if (live) { continueLiveExam(); return; }
      const s = loadSession(MODULE_ID);
      if (!s) return;
      try {
        await ensureMorning();
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), "bad");
        return;
      }
      const ok = resumeExam(s, {
        brandLabel: brandLabel(),
        exitPath: "/ap",
        passPct: passPct(),
        bilingual: !!m.bilingual,
        pool: morningQuestions,
      });
      if (!ok) { clearSession(MODULE_ID); toast("Không khôi phục được bài cũ.", "bad"); renderHome(root); }
    },
    dropSession: () => { clearSession(MODULE_ID); toast("Đã bỏ bài làm dở."); renderHome(root); },
  });
}

// ------------------------------------------------------------ buổi chiều: chọn đề

function renderPicker(root: HTMLElement): void {
  setModuleTheme(MODULE_ID);
  hydrate();
  const m = meta();

  const render = () => {
    const rows = essays
      .map((e) => {
        const n = String(e.n);
        const locked = n === REQUIRED_ESSAY;
        const picked = afternoon.picked.includes(n);
        const written = e.subQuestions.some((s) => (afternoon.drafts[s.id] ?? "").trim().length > 0);
        const note = locked
          ? "Đề bắt buộc — mọi thí sinh đều phải làm"
          : picked
            ? "Đã chọn"
            : afternoon.picked.length >= PICK_COUNT
              ? `Đã đủ ${PICK_COUNT} đề — bỏ chọn một đề khác trước`
              : "Bấm để chọn đề này";
        return `<button class="pick-row ${locked ? "locked" : ""} ${picked ? "is-picked" : ""}" data-action="toggle" data-arg="${n}" ${locked ? "disabled" : ""}>
          <span class="pick-check">${icon("check")}</span>
          <span class="grow">
            <span class="pick-title">${esc(e.title)}</span>
            <span class="pick-note">${esc(note)}</span>
          </span>
          ${written ? `<span class="badge badge-accent">${icon("pencil")}Đã viết</span>` : ""}
        </button>`;
      })
      .join("");

    const ready = afternoon.picked.length === PICK_COUNT;

    const content = `
      <div class="page-head">
        <div class="page">
          ${crumbs([
            { label: "Trang chủ", action: "go", arg: "/" },
            { label: m?.shortName ?? "AP", action: "go", arg: "/ap" },
            { label: "Buổi chiều" },
          ])}
          <div class="page-head-main">
            <div class="page-head-text">
              <h1>Buổi chiều · Chọn đề</h1>
              <p class="lead">Đề 1 (An toàn thông tin) bắt buộc, chọn thêm ${PICK_COUNT - 1} đề trong ${Math.max(essays.length - 1, 0)} đề còn lại — đúng như quy chế thi thật.</p>
            </div>
            <div class="page-head-side">
              <div class="card card-pad" style="padding:14px 18px;text-align:center">
                <div class="fw-700 nums" style="font-size:24px">${afternoon.picked.length}/${PICK_COUNT}</div>
                <div class="text-xs text-muted">đề đã chọn</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="page page-body" style="max-width:860px">
        <div class="bar mb-24"><i style="width:${(afternoon.picked.length / PICK_COUNT) * 100}%"></i></div>
        ${rows}
        <div class="row-between mt-24">
          <button class="btn btn-outline" data-action="go" data-arg="/ap">${icon("arrowLeft")}Quay lại</button>
          <button class="btn btn-primary btn-lg" data-action="start" ${ready ? "" : "disabled"}>
            ${icon("play")}${ready ? "Bắt đầu làm bài" : `Chọn thêm ${PICK_COUNT - afternoon.picked.length} đề`}
          </button>
        </div>
      </div>`;

    root.innerHTML = renderPage({ active: "certs", content });

    bindShell(root, "certs", {
      toggle: (n) => {
        if (!n || n === REQUIRED_ESSAY) return;
        if (afternoon.picked.includes(n)) afternoon.picked = afternoon.picked.filter((x) => x !== n);
        else if (afternoon.picked.length < PICK_COUNT) afternoon.picked = [...afternoon.picked, n];
        else { toast(`Chỉ được chọn ${PICK_COUNT} đề — bỏ bớt một đề trước.`, "bad", 2200); return; }
        saveAfternoon();
        render();
      },
      start: () => {
        if (afternoon.picked.length !== PICK_COUNT) return;
        afternoon.writeIdx = 0;
        saveAfternoon();
        navigate("/ap/tu-luan");
      },
    });
  };

  render();
}

// ------------------------------------------------------------ buổi chiều: viết bài

function renderEssay(root: HTMLElement): void {
  setModuleTheme(MODULE_ID);
  hydrate();
  const m = meta();

  const picked = pickedSorted();
  if (picked.length !== PICK_COUNT) {
    navigate("/ap/buoi-chieu");
    return;
  }

  const render = () => {
    const n = picked[Math.min(afternoon.writeIdx, picked.length - 1)];
    const essay = essays.find((e) => String(e.n) === n);
    if (!essay) {
      navigate("/ap/buoi-chieu");
      return;
    }

    const subs = essay.subQuestions
      .map((sub, i) => {
        const draft = afternoon.drafts[sub.id] ?? "";
        const revealed = !!afternoon.revealed[sub.id];
        return `<div class="essay-sub">
          <div class="essay-sub-head">
            <span class="essay-sub-n">${i + 1}</span>
            <p class="essay-sub-prompt">${esc(sub.prompt)}</p>
          </div>
          <textarea class="textarea" data-input="draft" data-subid="${esc(sub.id)}" placeholder="Viết câu trả lời của bạn ở đây...">${esc(draft)}</textarea>
          <div class="essay-count">${draft.trim().length} ký tự</div>
          <div class="row gap-8 mt-12 wrap">
            <button class="btn btn-outline btn-sm" data-action="reveal" data-arg="${esc(sub.id)}">
              ${icon(revealed ? "eyeOff" : "eye")}${revealed ? "Ẩn đáp án mẫu" : "Xem đáp án mẫu"}
            </button>
          </div>
          ${
            revealed
              ? `<div class="essay-answer">
                  <div class="essay-answer-label">${icon("checkCircle")}Đáp án mẫu — tự đối chiếu</div>
                  ${esc(sub.referenceAnswer)}
                </div>`
              : ""
          }
        </div>`;
      })
      .join("");

    const steps = picked
      .map((p, i) => {
        const e = essays.find((x) => String(x.n) === p);
        const written = !!e?.subQuestions.some((s) => (afternoon.drafts[s.id] ?? "").trim().length > 0);
        const cls = [i === afternoon.writeIdx ? "is-current" : "", written ? "is-done" : ""].filter(Boolean).join(" ");
        return `<button class="pnum ${cls}" data-action="goto" data-arg="${i}" title="${esc(e?.title ?? "")}">${p}</button>`;
      })
      .join("");

    const isLast = afternoon.writeIdx >= picked.length - 1;

    const content = `
      <div class="page-head">
        <div class="page">
          ${crumbs([
            { label: "Trang chủ", action: "go", arg: "/" },
            { label: m?.shortName ?? "AP", action: "go", arg: "/ap" },
            { label: "Buổi chiều", action: "go", arg: "/ap/buoi-chieu" },
            { label: `Đề ${n}` },
          ])}
          <div class="page-head-main">
            <div class="page-head-text">
              <h1>${esc(essay.title)}</h1>
              <p class="lead">Đề ${afternoon.writeIdx + 1}/${picked.length} · Bản nháp được lưu tự động.</p>
            </div>
            <div class="page-head-side">
              <div class="row gap-6">${steps}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="page page-body" style="max-width:900px">
        <div class="essay-prompt">${esc(essay.prompt)}</div>
        <div class="card card-pad">${subs}</div>
        <div class="row-between mt-24">
          <button class="btn btn-outline" data-action="prev" ${afternoon.writeIdx === 0 ? "disabled" : ""}>${icon("arrowLeft")}Đề trước</button>
          <span class="text-sm text-muted hide-sm row gap-6">${icon("save")}Đã lưu nháp</span>
          <button class="btn btn-primary" data-action="next">${isLast ? "Hoàn thành" : "Đề tiếp"}${icon("arrowRight")}</button>
        </div>
      </div>`;

    root.innerHTML = renderPage({ active: "certs", content });

    bindShell(root, "certs", {
      reveal: (id) => { if (id) { afternoon.revealed[id] = !afternoon.revealed[id]; render(); } },
      goto: (i) => { afternoon.writeIdx = Number(i); saveAfternoon(); render(); window.scrollTo({ top: 0 }); },
      prev: () => { afternoon.writeIdx = Math.max(0, afternoon.writeIdx - 1); saveAfternoon(); render(); window.scrollTo({ top: 0 }); },
      next: () => {
        if (isLast) { navigate("/ap/hoan-thanh"); return; }
        afternoon.writeIdx += 1;
        saveAfternoon();
        render();
        window.scrollTo({ top: 0 });
      },
    });

    // Lưu nháp khi gõ, nhưng không vẽ lại cả trang để con trỏ không nhảy.
    bindInputs(root, {
      draft: (value, el) => {
        const id = (el as HTMLTextAreaElement).dataset.subid;
        if (!id) return;
        afternoon.drafts[id] = value;
        saveAfternoon();
        const counter = el.parentElement?.querySelector<HTMLElement>(".essay-count");
        if (counter) counter.textContent = `${value.trim().length} ký tự`;
      },
    });
  };

  render();
}

// ------------------------------------------------------------ buổi chiều: hoàn thành

function renderDone(root: HTMLElement): void {
  setModuleTheme(MODULE_ID);
  hydrate();
  const picked = pickedSorted();
  const written = draftedCount();

  const rows = picked
    .map((p) => {
      const e = essays.find((x) => String(x.n) === p);
      if (!e) return "";
      const chars = e.subQuestions.reduce((sum, s) => sum + (afternoon.drafts[s.id] ?? "").trim().length, 0);
      return `<div class="list-row">
        <div class="icon-chip ${chars ? "good" : ""}">${icon(chars ? "checkCircle" : "pencil")}</div>
        <div class="list-main">
          <div class="list-title">${esc(e.title)}</div>
          <div class="list-sub">${chars ? `${chars} ký tự đã viết` : "Chưa viết gì"}</div>
        </div>
        <div class="list-side">
          <button class="btn btn-outline btn-sm" data-action="open" data-arg="${esc(p)}">${icon("pencil")}Mở lại</button>
        </div>
      </div>`;
    })
    .join("");

  const content = `
    <div class="page" style="padding:44px 0 80px;max-width:860px">
      <div class="result-hero mb-32">
        ${ring({ pct: Math.round((written / PICK_COUNT) * 100), size: 128, stroke: 12, label: `${written}/${PICK_COUNT} đề` })}
        <div class="result-hero-text">
          <span class="badge badge-accent mb-12">${icon("pencil")}Buổi chiều</span>
          <h1>Bạn đã đi hết ${PICK_COUNT} đề tự luận</h1>
          <p>Bài tự luận không chấm điểm tự động được. Hãy mở lại từng đề, so bài viết của bạn với đáp án mẫu và tự cho điểm theo thang 100 của kỳ thi (đậu khi ≥ ${passPct()}).</p>
          <div class="result-actions">
            <button class="btn btn-primary" data-action="go" data-arg="/ap/tu-luan">${icon("refresh")}Xem lại bài viết</button>
            <button class="btn btn-outline" data-action="go" data-arg="/ap">${icon("home")}Về trang AP</button>
          </div>
        </div>
      </div>

      <div class="card card-pad mb-24">
        <div class="card-head"><div class="card-title">Các đề bạn đã chọn</div></div>
        <div class="list">${rows}</div>
      </div>

      <div class="row gap-10 wrap">
        <button class="btn btn-ghost" data-action="reselect">${icon("shuffle")}Chọn lại bộ ${PICK_COUNT} đề khác</button>
        <button class="btn btn-ghost" data-action="clearDrafts">${icon("trash")}Xoá toàn bộ bản nháp</button>
      </div>
    </div>`;

  root.innerHTML = renderPage({ active: "certs", content });

  bindShell(root, "certs", {
    open: (p) => {
      if (!p) return;
      afternoon.writeIdx = pickedSorted().indexOf(p);
      saveAfternoon();
      navigate("/ap/tu-luan");
    },
    reselect: () => navigate("/ap/buoi-chieu"),
    clearDrafts: async () => {
      const ok = await confirmDialog({
        title: "Xoá toàn bộ bản nháp?",
        text: "Mọi câu trả lời bạn đã viết ở buổi chiều sẽ bị xoá khỏi trình duyệt này.",
        confirmLabel: "Xoá nháp",
        tone: "danger",
      });
      if (!ok) return;
      afternoon.drafts = {};
      saveAfternoon();
      toast("Đã xoá bản nháp.", "good");
      renderDone(root);
    },
  });
}

export function registerApRoutes(): void {
  registerRoute("/ap", (root) => renderHome(root));
  registerRoute("/ap/buoi-chieu", (root) => {
    void withData(root, ensureEssays, () => renderPicker(root), "Đang tải đề tự luận...");
  });
  registerRoute("/ap/tu-luan", (root) => {
    void withData(root, ensureEssays, () => renderEssay(root), "Đang tải đề tự luận...");
  });
  registerRoute("/ap/hoan-thanh", (root) => {
    void withData(root, ensureEssays, () => renderDone(root), "Đang tải đề tự luận...");
  });
}
