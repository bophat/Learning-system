/**
 * Ghi chú theo đoạn văn bản được tô chọn bằng chuột — từ vựng, công thức,
 * mẹo làm bài, hay bất kỳ đoạn nào trong đề bài / phương án / giải thích.
 * Nối với giao diện ở `src/components/highlighter.ts`.
 *
 * Thiết kế đồng bộ giống các state khác trong dự án (progress, srs, social):
 * `loadHighlights()` kéo cả một chặng thi về bộ nhớ một lần, sau đó các hàm
 * đọc là đồng bộ (`getHighlights`), còn ghi thì cập nhật bộ nhớ trước rồi đẩy
 * lên máy chủ ở nền — để thao tác tô/xoá highlight không phải chờ mạng.
 *
 * `levelId`/`stageId` để tránh đụng số câu giữa các cấp/chặng khác nhau
 * trong cùng chứng chỉ (JLPT N1 câu 1 và N3 câu 1, hay AP buổi sáng câu 1 và
 * buổi chiều câu 1) — bỏ trống ("") với chứng chỉ không cần phân biệt.
 */

import { db } from "../services/supabase";
import { currentUserId } from "./auth";

export type HighlightColor = "yellow" | "green" | "pink" | "blue";
export type HighlightKind = "vocab" | "formula" | "tip" | "note";

export interface Highlight {
  id: number;
  moduleId: string;
  levelId: string;
  stageId: string;
  questionN: number;
  /** Nguyên văn đoạn đã tô. */
  quote: string;
  color: HighlightColor;
  kind: HighlightKind;
  note: string;
  createdAt: number;
  /** Trường văn bản nguồn (vd "stem_en") nếu có — phục vụ vẽ lại đúng vị trí sau này. */
  field?: string;
  startOffset?: number;
  endOffset?: number;
}

interface HighlightRow {
  id: number;
  module_id: string;
  level_id: string;
  stage_id: string;
  question_n: number;
  quote: string;
  color: string;
  kind: string;
  note: string;
  created_at: string;
  field: string | null;
  start_offset: number | null;
  end_offset: number | null;
}

function toHighlight(r: HighlightRow): Highlight {
  return {
    id: r.id,
    moduleId: r.module_id,
    levelId: r.level_id ?? "",
    stageId: r.stage_id ?? "",
    questionN: r.question_n,
    quote: r.quote,
    color: (["yellow", "green", "pink", "blue"].includes(r.color) ? r.color : "yellow") as HighlightColor,
    kind: (["vocab", "formula", "tip", "note"].includes(r.kind) ? r.kind : "note") as HighlightKind,
    note: r.note ?? "",
    createdAt: Date.parse(r.created_at),
    field: r.field || undefined,
    startOffset: r.start_offset ?? undefined,
    endOffset: r.end_offset ?? undefined,
  };
}

/** `moduleId + levelId + stageId` -> danh sách highlight đã tải cho phạm vi đó. */
const cache = new Map<string, Highlight[]>();
const loadedScopes = new Set<string>();

function scopeKey(moduleId: string, levelId: string, stageId: string): string {
  return `${moduleId} ${levelId} ${stageId}`;
}

/**
 * Tải toàn bộ highlight của một chặng thi (mọi câu cùng lúc), gọi khi mở màn
 * làm bài — tránh phải gọi mạng riêng cho từng câu lúc người học lướt qua.
 */
export async function loadHighlights(moduleId: string, levelId = "", stageId = ""): Promise<void> {
  const uid = currentUserId();
  if (!uid) return;
  const scope = scopeKey(moduleId, levelId, stageId);
  if (loadedScopes.has(scope)) return;

  const { data, error } = await db()
    .from("question_highlights")
    .select("id, module_id, level_id, stage_id, question_n, quote, color, kind, note, created_at, field, start_offset, end_offset")
    .eq("user_id", uid)
    .eq("module_id", moduleId)
    .eq("level_id", levelId)
    .eq("stage_id", stageId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  cache.set(scope, (data ?? []).map(toHighlight));
  loadedScopes.add(scope);
}

/** Toàn bộ highlight của một chặng thi — dùng cho sổ tay ghi chú (đồng bộ, đọc từ bộ nhớ đã tải). */
export function getAllHighlights(moduleId: string, levelId = "", stageId = ""): Highlight[] {
  return cache.get(scopeKey(moduleId, levelId, stageId)) ?? [];
}

/** Highlight của riêng một câu. */
export function getHighlights(moduleId: string, questionN: number, levelId = "", stageId = ""): Highlight[] {
  return getAllHighlights(moduleId, levelId, stageId).filter((h) => h.questionN === questionN);
}

function pushToCache(h: Highlight): void {
  const scope = scopeKey(h.moduleId, h.levelId, h.stageId);
  cache.set(scope, [h, ...(cache.get(scope) ?? [])]);
}

/**
 * Thêm một highlight mới. Cập nhật bộ nhớ ngay (trả về id tạm) rồi đẩy lên
 * máy chủ ở nền — người dùng không phải chờ mạng để thấy phần tô hiện ra.
 */
export function addHighlight(input: {
  moduleId: string;
  levelId?: string;
  stageId?: string;
  questionN: number;
  quote: string;
  color: HighlightColor;
  kind: HighlightKind;
  note?: string;
  field?: string;
  startOffset?: number;
  endOffset?: number;
}): Highlight {
  const uid = currentUserId();
  const levelId = input.levelId ?? "";
  const stageId = input.stageId ?? "";
  // id tạm âm để không đụng id thật (luôn dương, tăng dần) từ CSDL; đổi ngay
  // khi máy chủ trả về id thật.
  const tempId = -Date.now();

  const h: Highlight = {
    id: tempId,
    moduleId: input.moduleId,
    levelId,
    stageId,
    questionN: input.questionN,
    quote: input.quote.slice(0, 600),
    color: input.color,
    kind: input.kind,
    note: (input.note ?? "").slice(0, 2000),
    createdAt: Date.now(),
    field: input.field,
    startOffset: input.startOffset,
    endOffset: input.endOffset,
  };
  pushToCache(h);

  if (uid) {
    void db()
      .from("question_highlights")
      .insert({
        user_id: uid,
        module_id: input.moduleId,
        level_id: levelId,
        stage_id: stageId,
        question_n: input.questionN,
        quote: h.quote,
        color: h.color,
        kind: h.kind,
        note: h.note,
        field: input.field ?? "",
        start_offset: input.startOffset ?? null,
        end_offset: input.endOffset ?? null,
      })
      .select("id")
      .single()
      .then(({ data, error }) => {
        if (error) {
          console.warn("[highlight] không lưu được:", error);
          return;
        }
        // Vá lại id tạm bằng id thật để xoá/sửa về sau trỏ đúng dòng.
        const scope = scopeKey(input.moduleId, levelId, stageId);
        const list = cache.get(scope);
        const hit = list?.find((x) => x.id === tempId);
        if (hit && data) hit.id = data.id;
      });
  }
  return h;
}

/** Sửa ghi chú và/hoặc phân loại của một highlight đã có. */
export function updateHighlight(id: number, patch: { note?: string; kind?: HighlightKind; color?: HighlightColor }): void {
  for (const list of cache.values()) {
    const hit = list.find((h) => h.id === id);
    if (hit) {
      if (patch.note !== undefined) hit.note = patch.note;
      if (patch.kind !== undefined) hit.kind = patch.kind;
      if (patch.color !== undefined) hit.color = patch.color;
      break;
    }
  }
  if (id < 0) return; // chưa có id thật từ máy chủ, chờ addHighlight vá xong

  const body: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.note !== undefined) body.note = patch.note.slice(0, 2000);
  if (patch.kind !== undefined) body.kind = patch.kind;
  if (patch.color !== undefined) body.color = patch.color;

  void db()
    .from("question_highlights")
    .update(body)
    .eq("id", id)
    .then(({ error }) => error && console.warn("[highlight] không sửa được:", error));
}

export function deleteHighlight(id: number): void {
  for (const [scope, list] of cache) {
    const next = list.filter((h) => h.id !== id);
    if (next.length !== list.length) cache.set(scope, next);
  }
  if (id < 0) return;
  void db()
    .from("question_highlights")
    .delete()
    .eq("id", id)
    .then(({ error }) => error && console.warn("[highlight] không xoá được:", error));
}

/** Xoá sạch highlight của một chặng thi (nút "Xoá hết" trong sổ tay). */
export async function clearHighlightsInScope(moduleId: string, levelId = "", stageId = ""): Promise<void> {
  cache.set(scopeKey(moduleId, levelId, stageId), []);
  const uid = currentUserId();
  if (!uid) return;
  const { error } = await db()
    .from("question_highlights")
    .delete()
    .eq("user_id", uid)
    .eq("module_id", moduleId)
    .eq("level_id", levelId)
    .eq("stage_id", stageId);
  if (error) console.warn("[highlight] không xoá hết được:", error);
}

export function clearHighlightCache(): void {
  cache.clear();
  loadedScopes.clear();
}
