/**
 * Highlighter & Annotation System (Ghi chú & Tô màu văn bản khi làm bài)
 *
 * Tính năng:
 * 1. Bôi đen văn bản để tô màu (Vàng, Xanh lá, Hồng, Xanh dương).
 * 2. Thêm ghi chú, dịch nghĩa từ vựng, công thức hoặc mẹo làm bài.
 * 3. Toolbar nổi (Floating Toolbar) tự động xuất hiện ngay trên vùng chọn.
 * 4. Popup xem nhanh ghi chú khi click vào đoạn highlight.
 * 5. Drawer Sổ tay ghi chú & Từ vựng tổng hợp tất cả ghi chú của bài thi.
 * 6. Lưu trên Supabase (bảng `question_highlights`) nên đổi máy vẫn thấy
 *    nguyên ghi chú — không còn chỉ nằm ở localStorage của một máy.
 *
 * `stageId`/`levelId` để tránh đụng số câu giữa các chặng/cấp khác nhau
 * trong cùng chứng chỉ (AP buổi sáng câu 1 và buổi chiều câu 1, hay JLPT N1
 * câu 1 và N3 câu 1) — bỏ trống ("") với chứng chỉ không cần phân biệt.
 */

import { icon } from "./icons";
import { esc } from "./bindActions";
import { toast } from "./toast";
import {
  loadHighlights as loadHighlightsBE,
  getAllHighlights,
  addHighlight as addHighlightBE,
  deleteHighlight as deleteHighlightBE,
  updateHighlight as updateHighlightBE,
  clearHighlightsInScope,
  type Highlight,
} from "../state/highlights";

export type HighlightColor = "yellow" | "green" | "pink" | "blue";
export type AnnotationType = "vocab" | "formula" | "tip" | "note";

export interface ExamAnnotation {
  id: string;
  moduleId: string;
  levelId: string;
  stageId: string;
  questionN: number;
  text: string;
  color: HighlightColor;
  type: AnnotationType;
  note: string;
  createdAt: number;
}

function toAnnotation(h: Highlight): ExamAnnotation {
  return {
    id: String(h.id),
    moduleId: h.moduleId,
    levelId: h.levelId,
    stageId: h.stageId,
    questionN: h.questionN,
    text: h.quote,
    color: h.color,
    type: h.kind,
    note: h.note,
    createdAt: h.createdAt,
  };
}

/**
 * Tải highlight của một chặng thi từ Supabase về bộ nhớ. Gọi (và chờ xong)
 * TRƯỚC khi dùng `loadAllAnnotations` hay mở drawer — các hàm đó đọc đồng bộ
 * từ bộ nhớ đã tải, không tự gọi mạng.
 */
export async function preloadAnnotations(moduleId: string, stageId: string, levelId = ""): Promise<void> {
  await loadHighlightsBE(moduleId, levelId, stageId);
}

export function loadAllAnnotations(moduleId: string, stageId: string, levelId = ""): ExamAnnotation[] {
  return getAllHighlights(moduleId, levelId, stageId).map(toAnnotation);
}

export function addAnnotation(
  moduleId: string,
  stageId: string,
  questionN: number,
  text: string,
  color: HighlightColor,
  type: AnnotationType = "note",
  note = "",
  levelId = ""
): ExamAnnotation {
  const h = addHighlightBE({
    moduleId,
    levelId,
    stageId,
    questionN,
    quote: text.trim(),
    color,
    kind: type,
    note: note.trim(),
  });
  return toAnnotation(h);
}

// moduleId/stageId giữ lại trong chữ ký để không phải sửa các nơi đang gọi —
// id đã là khoá duy nhất trên CSDL nên không cần hai tham số kia để xoá đúng dòng.
export function removeAnnotation(_moduleId: string, _stageId: string, id: string): void {
  deleteHighlightBE(Number(id));
}

export function updateAnnotationNote(_moduleId: string, _stageId: string, id: string, note: string, type?: AnnotationType): void {
  updateHighlightBE(Number(id), { note: note.trim(), kind: type });
}

// ------------------------------------------------------------ UI Floating Toolbar & Note Popover

let activeToolbar: HTMLElement | null = null;
let activePopover: HTMLElement | null = null;

export function destroyHighlighterUI(): void {
  if (activeToolbar) {
    activeToolbar.remove();
    activeToolbar = null;
  }
  if (activePopover) {
    activePopover.remove();
    activePopover = null;
  }
}

interface HighlighterOptions {
  container: HTMLElement;
  moduleId: string;
  levelId: string;
  stageId: string;
  questionN: number;
  onAnnotationChange?: (count: number) => void;
  onJumpToQuestion?: (n: number) => void;
}

export function initTextHighlighter(opts: HighlighterOptions): () => void {
  const { container, moduleId, stageId, levelId, questionN } = opts;

  // Vẽ lại các highlight đã lưu từ trước (đổi câu, tải lại trang, quay lại
  // bài đang làm dở) — dữ liệu đã có sẵn trên Supabase, chỉ thiếu bước này.
  redrawSavedHighlights(container, moduleId, levelId, stageId, questionN, opts);

  const handleSelection = (e: MouseEvent | TouchEvent) => {
    // Không hiện toolbar nếu đang click bên trong toolbar hoặc popover
    if (
      (activeToolbar && activeToolbar.contains(e.target as Node)) ||
      (activePopover && activePopover.contains(e.target as Node))
    ) {
      return;
    }

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      destroyHighlighterUI();
      return;
    }

    const selectedText = sel.toString().trim();
    if (!selectedText || selectedText.length < 2 || selectedText.length > 600) {
      destroyHighlighterUI();
      return;
    }

    const range = sel.getRangeAt(0);
    // Kiểm tra xem vùng chọn có nằm trong container câu hỏi/bài đọc không
    if (!container.contains(range.commonAncestorContainer)) {
      destroyHighlighterUI();
      return;
    }

    const rect = range.getBoundingClientRect();
    showFloatingToolbar(rect, selectedText, range, opts);
  };

  container.addEventListener("mouseup", handleSelection);

  // Click vào các đoạn đã highlight để xem ghi chú
  const handleHighlightClick = (e: MouseEvent) => {
    const mark = (e.target as HTMLElement).closest(".hl-mark");
    if (!mark) return;
    const annId = mark.getAttribute("data-ann-id");
    if (!annId) return;

    const list = loadAllAnnotations(moduleId, stageId, levelId);
    const ann = list.find((a) => a.id === annId);
    if (!ann) return;

    e.stopPropagation();
    showAnnotationDetail(mark as HTMLElement, ann, opts);
  };

  container.addEventListener("click", handleHighlightClick);

  return () => {
    container.removeEventListener("mouseup", handleSelection);
    container.removeEventListener("click", handleHighlightClick);
    destroyHighlighterUI();
  };
}

function showFloatingToolbar(
  rect: DOMRect,
  text: string,
  range: Range,
  opts: HighlighterOptions
): void {
  destroyHighlighterUI();

  const toolbar = document.createElement("div");
  toolbar.className = "hl-toolbar";
  toolbar.innerHTML = `
    <div class="hl-toolbar-inner">
      <button class="hl-btn hl-yellow" title="Tô màu Vàng" data-hl-color="yellow"></button>
      <button class="hl-btn hl-green" title="Tô màu Xanh lá" data-hl-color="green"></button>
      <button class="hl-btn hl-pink" title="Tô màu Hồng" data-hl-color="pink"></button>
      <button class="hl-btn hl-blue" title="Tô màu Xanh dương" data-hl-color="blue"></button>
      <div class="hl-sep"></div>
      <button class="hl-action-btn" data-hl-action="note" title="Thêm Ghi chú / Công thức">${icon("edit3")} Ghi chú</button>
      <button class="hl-action-btn" data-hl-action="vocab" title="Lưu Từ vựng">${icon("bookOpen")} Từ vựng</button>
      <button class="hl-action-btn icon-only" data-hl-action="copy" title="Sao chép">${icon("copy")}</button>
    </div>
  `;

  document.body.appendChild(toolbar);
  activeToolbar = toolbar;

  // Tính vị trí nổi ngay phía trên đoạn chọn
  const top = Math.max(10, rect.top + window.scrollY - 48);
  const left = Math.max(10, Math.min(window.innerWidth - 300, rect.left + window.scrollX + rect.width / 2 - 140));

  toolbar.style.top = `${top}px`;
  toolbar.style.left = `${left}px`;

  // Gắn sự kiện click toolbar
  toolbar.querySelectorAll<HTMLButtonElement>("[data-hl-color]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const color = btn.getAttribute("data-hl-color") as HighlightColor;
      applyHighlight(range, text, color, "note", "", opts);
      destroyHighlighterUI();
      toast("Đã tô màu đánh dấu!", "good", 1200);
    });
  });

  toolbar.querySelector("[data-hl-action='copy']")?.addEventListener("click", (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    toast("Đã sao chép vào bộ nhớ tạm", "good", 1200);
    destroyHighlighterUI();
  });

  toolbar.querySelector("[data-hl-action='note']")?.addEventListener("click", (e) => {
    e.stopPropagation();
    destroyHighlighterUI();
    showNoteModal(rect, text, range, opts, "note");
  });

  toolbar.querySelector("[data-hl-action='vocab']")?.addEventListener("click", (e) => {
    e.stopPropagation();
    destroyHighlighterUI();
    showNoteModal(rect, text, range, opts, "vocab");
  });
}

/** Bọc một Range bằng thẻ `<mark>` — dùng chung cho highlight mới lẫn vẽ lại highlight cũ. */
function wrapRangeAsMark(range: Range, annId: string, color: HighlightColor, hasNote: boolean): boolean {
  try {
    const mark = document.createElement("mark");
    mark.className = `hl-mark hl-${color}`;
    mark.setAttribute("data-ann-id", annId);
    if (hasNote) mark.setAttribute("data-has-note", "true");

    const contents = range.extractContents();
    mark.appendChild(contents);
    range.insertNode(mark);
    return true;
  } catch (err) {
    console.warn("Không thể bọc trực tiếp range:", err);
    return false;
  }
}

function applyHighlight(
  range: Range,
  text: string,
  color: HighlightColor,
  type: AnnotationType,
  noteText: string,
  opts: HighlighterOptions
): ExamAnnotation {
  const ann = addAnnotation(opts.moduleId, opts.stageId, opts.questionN, text, color, type, noteText, opts.levelId);
  wrapRangeAsMark(range, ann.id, color, !!noteText);
  window.getSelection()?.removeAllRanges();
  opts.onAnnotationChange?.(loadAllAnnotations(opts.moduleId, opts.stageId, opts.levelId).length);
  return ann;
}

/**
 * Tìm lại vị trí của `text` trong các text-node còn "trần" (chưa nằm trong
 * `.hl-mark`) của `container`, rồi trả về một Range trỏ đúng đoạn đó. Trả về
 * null nếu không tìm thấy (nội dung đổi khác, hoặc đã được vẽ trước đó).
 */
function findRangeForText(container: HTMLElement, text: string): Range | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.parentElement?.closest(".hl-mark") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodes: Text[] = [];
  let concatenated = "";
  let node: Node | null;
  while ((node = walker.nextNode())) {
    nodes.push(node as Text);
    concatenated += (node as Text).data;
  }

  const idx = concatenated.indexOf(text);
  if (idx === -1 || text.length === 0) return null;

  let pos = 0;
  let startNode: Text | null = null;
  let startOffset = 0;
  let endNode: Text | null = null;
  let endOffset = 0;
  for (const n of nodes) {
    const len = n.data.length;
    if (startNode === null && idx < pos + len) {
      startNode = n;
      startOffset = idx - pos;
    }
    if (startNode !== null && idx + text.length <= pos + len) {
      endNode = n;
      endOffset = idx + text.length - pos;
      break;
    }
    pos += len;
  }
  if (!startNode || !endNode) return null;

  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}

/** Vẽ lại `<mark>` cho mọi highlight đã lưu của câu hiện tại, theo đúng thứ tự tạo (cũ trước). */
function redrawSavedHighlights(
  container: HTMLElement,
  moduleId: string,
  levelId: string,
  stageId: string,
  questionN: number,
  opts: HighlighterOptions
): void {
  const all = loadAllAnnotations(moduleId, stageId, levelId);
  const mine = all.filter((a) => a.questionN === questionN).sort((a, b) => a.createdAt - b.createdAt);

  for (const ann of mine) {
    const range = findRangeForText(container, ann.text);
    if (!range) continue; // nội dung không khớp nữa (đề đổi bản dịch...) — bỏ qua, không crash
    wrapRangeAsMark(range, ann.id, ann.color, !!ann.note);
  }

  // Badge trên thanh công cụ đếm theo cả chặng thi, không riêng câu hiện tại.
  opts.onAnnotationChange?.(all.length);
}

function showNoteModal(
  rect: DOMRect,
  text: string,
  range: Range,
  opts: HighlighterOptions,
  initialType: AnnotationType = "note"
): void {
  destroyHighlighterUI();

  const pop = document.createElement("div");
  pop.className = "hl-popover";
  pop.innerHTML = `
    <div class="hl-popover-card">
      <div class="hl-popover-head">
        <div class="row gap-8">
          <span class="badge badge-brand">Câu ${opts.questionN}</span>
          <span class="hl-popover-title">${initialType === "vocab" ? "Thêm từ vựng mới" : "Thêm ghi chú / Công thức"}</span>
        </div>
        <button class="icon-btn sm" data-pop-action="close">${icon("close")}</button>
      </div>
      <div class="hl-popover-quote">"${esc(text.length > 80 ? text.substring(0, 80) + "..." : text)}"</div>
      
      <div class="hl-type-row mb-12">
        <label class="hl-radio-chip"><input type="radio" name="annType" value="vocab" ${initialType === "vocab" ? "checked" : ""}> 📚 Từ vựng</label>
        <label class="hl-radio-chip"><input type="radio" name="annType" value="formula" ${initialType === "formula" ? "checked" : ""}> 📐 Công thức</label>
        <label class="hl-radio-chip"><input type="radio" name="annType" value="tip" ${initialType === "tip" ? "checked" : ""}> 💡 Mẹo / Bẫy</label>
        <label class="hl-radio-chip"><input type="radio" name="annType" value="note" ${initialType === "note" ? "checked" : ""}> 📝 Ghi chú</label>
      </div>

      <div class="hl-color-row mb-12">
        <span class="text-xs text-muted mr-8">Màu tô:</span>
        <label class="hl-color-pick"><input type="radio" name="annColor" value="yellow" checked><span class="hl-dot hl-yellow"></span></label>
        <label class="hl-color-pick"><input type="radio" name="annColor" value="green"><span class="hl-dot hl-green"></span></label>
        <label class="hl-color-pick"><input type="radio" name="annColor" value="pink"><span class="hl-dot hl-pink"></span></label>
        <label class="hl-color-pick"><input type="radio" name="annColor" value="blue"><span class="hl-dot hl-blue"></span></label>
      </div>

      <textarea class="textarea hl-note-input" placeholder="${
        initialType === "vocab"
          ? "Nhập phiên âm, nghĩa tiếng Việt, từ đồng nghĩa..."
          : initialType === "formula"
          ? "Nhập công thức, quy tắc hoặc cấu trúc ngữ pháp..."
          : "Nhập ghi chú cá nhân của bạn cho đoạn này..."
      }" rows="3"></textarea>

      <div class="row-between mt-12">
        <button class="btn btn-ghost btn-sm" data-pop-action="close">Huỷ</button>
        <button class="btn btn-primary btn-sm" data-pop-action="save">${icon("check")} Lưu ghi chú</button>
      </div>
    </div>
  `;

  document.body.appendChild(pop);
  activePopover = pop;

  const top = Math.max(20, Math.min(window.innerHeight - 320, rect.bottom + window.scrollY + 8));
  const left = Math.max(10, Math.min(window.innerWidth - 360, rect.left + window.scrollX - 40));
  pop.style.top = `${top}px`;
  pop.style.left = `${left}px`;

  const textarea = pop.querySelector<HTMLTextAreaElement>(".hl-note-input");
  textarea?.focus();

  pop.querySelector("[data-pop-action='close']")?.addEventListener("click", () => destroyHighlighterUI());

  pop.querySelector("[data-pop-action='save']")?.addEventListener("click", () => {
    const noteVal = textarea?.value || "";
    const colorVal = (pop.querySelector("input[name='annColor']:checked") as HTMLInputElement)?.value as HighlightColor || "yellow";
    const typeVal = (pop.querySelector("input[name='annType']:checked") as HTMLInputElement)?.value as AnnotationType || "note";

    applyHighlight(range, text, colorVal, typeVal, noteVal, opts);
    destroyHighlighterUI();
    toast("Đã lưu ghi chú thành công!", "good");
  });
}

function showAnnotationDetail(targetEl: HTMLElement, ann: ExamAnnotation, opts: HighlighterOptions): void {
  destroyHighlighterUI();

  const rect = targetEl.getBoundingClientRect();
  const pop = document.createElement("div");
  pop.className = "hl-popover";

  const typeLabels: Record<AnnotationType, string> = {
    vocab: "📚 Từ vựng",
    formula: "📐 Công thức",
    tip: "💡 Mẹo làm bài",
    note: "📝 Ghi chú",
  };

  pop.innerHTML = `
    <div class="hl-popover-card">
      <div class="hl-popover-head">
        <div class="row gap-8">
          <span class="badge badge-outline">${typeLabels[ann.type] || "Ghi chú"}</span>
          <span class="badge badge-brand">Câu ${ann.questionN}</span>
        </div>
        <button class="icon-btn sm" data-pop-action="close">${icon("close")}</button>
      </div>
      <div class="hl-popover-quote">"${esc(ann.text)}"</div>
      ${
        ann.note
          ? `<div class="hl-popover-body">${esc(ann.note)}</div>`
          : `<div class="hl-popover-body text-muted" style="font-style:italic">Chưa có ghi chú văn bản.</div>`
      }
      <div class="row-between mt-12 pt-8" style="border-top:1px solid var(--line)">
        <button class="btn btn-danger btn-sm" data-pop-action="delete">${icon("trash")} Xoá</button>
        <button class="btn btn-outline btn-sm" data-pop-action="edit">${icon("edit3")} Sửa ghi chú</button>
      </div>
    </div>
  `;

  document.body.appendChild(pop);
  activePopover = pop;

  const top = Math.max(20, rect.bottom + window.scrollY + 6);
  const left = Math.max(10, Math.min(window.innerWidth - 340, rect.left + window.scrollX));
  pop.style.top = `${top}px`;
  pop.style.left = `${left}px`;

  pop.querySelector("[data-pop-action='close']")?.addEventListener("click", () => destroyHighlighterUI());

  pop.querySelector("[data-pop-action='delete']")?.addEventListener("click", () => {
    removeAnnotation(opts.moduleId, opts.stageId, ann.id);
    targetEl.replaceWith(...Array.from(targetEl.childNodes));
    destroyHighlighterUI();
    opts.onAnnotationChange?.(loadAllAnnotations(opts.moduleId, opts.stageId, opts.levelId).length);
    toast("Đã xoá ghi chú / tô màu.", "good", 1200);
  });

  pop.querySelector("[data-pop-action='edit']")?.addEventListener("click", () => {
    const editArea = document.createElement("div");
    editArea.innerHTML = `
      <textarea class="textarea hl-note-input mt-8" rows="3">${esc(ann.note)}</textarea>
      <div class="row gap-8 mt-8" style="justify-content:flex-end">
        <button class="btn btn-primary btn-sm" data-pop-action="saveEdit">Cập nhật</button>
      </div>
    `;
    pop.querySelector(".hl-popover-body")?.replaceWith(editArea);
    pop.querySelector("[data-pop-action='edit']")?.remove();

    editArea.querySelector("[data-pop-action='saveEdit']")?.addEventListener("click", () => {
      const newText = editArea.querySelector<HTMLTextAreaElement>("textarea")?.value || "";
      updateAnnotationNote(opts.moduleId, opts.stageId, ann.id, newText);
      destroyHighlighterUI();
      toast("Đã cập nhật ghi chú!", "good");
    });
  });
}

// ------------------------------------------------------------ Sổ tay ghi chú (Slide-over Drawer)

export function openAnnotationsDrawer(
  moduleId: string,
  stageId: string,
  onJumpToQuestion?: (qNum: number) => void,
  levelId = ""
): void {
  const scrim = document.createElement("div");
  scrim.className = "nav-scrim";

  const drawer = document.createElement("aside");
  drawer.className = "hl-drawer";

  const renderDrawerContent = () => {
    const all = loadAllAnnotations(moduleId, stageId, levelId);

    const typeIcons: Record<AnnotationType, string> = {
      vocab: "bookOpen",
      formula: "terminal",
      tip: "zap",
      note: "edit3",
    };

    const typeBadgeClass: Record<AnnotationType, string> = {
      vocab: "badge-warn",
      formula: "badge-brand",
      tip: "badge-good",
      note: "badge-outline",
    };

    const typeLabels: Record<AnnotationType, string> = {
      vocab: "Từ vựng",
      formula: "Công thức",
      tip: "Mẹo làm bài",
      note: "Ghi chú",
    };

    const listHtml = all.length
      ? all
          .map(
            (a) => `
        <div class="hl-drawer-card hl-border-${a.color}">
          <div class="row-between mb-6">
            <div class="row gap-6">
              <span class="badge ${typeBadgeClass[a.type] || "badge-outline"}">${icon(typeIcons[a.type] || "edit3")}${typeLabels[a.type] || "Ghi chú"}</span>
              <button class="badge badge-brand clickable" data-drawer-jump="${a.questionN}" title="Nhảy đến câu này">Câu ${a.questionN} ${icon("arrowRight")}</button>
            </div>
            <button class="icon-btn sm text-muted" data-drawer-delete="${a.id}" title="Xoá">${icon("trash")}</button>
          </div>
          <div class="hl-drawer-quote">"${esc(a.text)}"</div>
          ${a.note ? `<div class="hl-drawer-note mt-6">${esc(a.note)}</div>` : ""}
        </div>
      `
          )
          .join("")
      : `
        <div class="empty card card-pad" style="text-align:center;padding:48px 16px">
          <div class="icon-chip lg mx-auto mb-16">${icon("edit3")}</div>
          <div class="card-title">Chưa có ghi chú nào</div>
          <p class="card-note mt-4">Khi làm bài, hãy bôi đen văn bản trong câu hỏi hoặc bài đọc để tô màu highlight, lưu từ vựng hoặc ghi chép công thức.</p>
        </div>
      `;

    drawer.innerHTML = `
      <div class="hl-drawer-head">
        <div class="row gap-8">
          <div class="icon-chip">${icon("bookmark")}</div>
          <div>
            <div class="card-title" style="font-size:16px">Sổ tay ghi chú &amp; Từ vựng</div>
            <div class="text-xs text-muted nums">${all.length} ghi chú trong bài thi này</div>
          </div>
        </div>
        <button class="icon-btn" data-drawer-close aria-label="Đóng">${icon("close")}</button>
      </div>

      <div class="hl-drawer-body">${listHtml}</div>

      <div class="hl-drawer-foot">
        <button class="btn btn-outline btn-sm" style="flex:1" data-drawer-export ${all.length === 0 ? "disabled" : ""}>${icon("download")} Xuất file Markdown</button>
        <button class="btn btn-ghost btn-sm text-danger" data-drawer-clear ${all.length === 0 ? "disabled" : ""}>${icon("trash")} Xoá hết</button>
      </div>
    `;

    // Events inside drawer
    drawer.querySelector("[data-drawer-close]")?.addEventListener("click", close);

    drawer.querySelectorAll<HTMLElement>("[data-drawer-jump]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const qNum = Number(btn.getAttribute("data-drawer-jump"));
        if (qNum && onJumpToQuestion) {
          onJumpToQuestion(qNum);
          close();
        }
      });
    });

    drawer.querySelectorAll<HTMLElement>("[data-drawer-delete]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-drawer-delete");
        if (id) {
          removeAnnotation(moduleId, stageId, id);
          toast("Đã xoá ghi chú", "good", 1200);
          renderDrawerContent();
        }
      });
    });

    drawer.querySelector("[data-drawer-clear]")?.addEventListener("click", () => {
      if (confirm("Bạn có chắc chắn muốn xoá toàn bộ ghi chú của bài thi này không?")) {
        void clearHighlightsInScope(moduleId, levelId, stageId);
        toast("Đã xoá toàn bộ ghi chú", "good");
        renderDrawerContent();
      }
    });

    drawer.querySelector("[data-drawer-export]")?.addEventListener("click", () => {
      const markdown = all
        .map(
          (a, idx) => `### ${idx + 1}. [Câu ${a.questionN}] ${typeLabels[a.type] || "Ghi chú"}
- **Trích đoạn**: *"${a.text}"*
- **Ghi chú**: ${a.note || "(Không có nội dung thêm)"}
`
        )
        .join("\n---\n\n");

      const blob = new Blob([`# Sổ tay Ghi chú Bài thi (${moduleId.toUpperCase()})\n\n${markdown}`], {
        type: "text/markdown;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ghi-chu-${moduleId}-${stageId || "exam"}.md`;
      a.click();
      URL.revokeObjectURL(url);
      toast("Đã tải xuống file ghi chú!", "good");
    });
  };

  const close = () => {
    scrim.remove();
    drawer.remove();
    document.body.classList.remove("is-locked");
  };

  scrim.addEventListener("click", close);
  document.body.classList.add("is-locked");
  document.body.append(scrim, drawer);

  renderDrawerContent();
}
