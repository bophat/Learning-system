/**
 * Cây chủ đề — phân loại chi tiết bên trong một chứng chỉ.
 *
 * Ví dụ AWS SAA không chỉ có "Storage" chung chung mà tách được thành
 * "S3 Lifecycle", "EBS vs Instance Store", "Glacier"... Nhờ đó biểu đồ năng lực
 * mới chỉ ra được đúng chỗ yếu, và bài luyện mới nhắm được vào đó.
 */

import { db } from "../services/supabase";

export interface Topic {
  id: number;
  moduleId: string;
  parentId: number | null;
  slug: string;
  name: string;
  sortOrder: number;
  /** Chủ đề con, dựng sẵn khi tải để UI khỏi phải tự gom. */
  children: Topic[];
}

const cache = new Map<string, Topic[]>();

interface TopicRow {
  id: number;
  module_id: string;
  parent_id: number | null;
  slug: string;
  name: string;
  sort_order: number;
}

/** Tải cây chủ đề của một chứng chỉ. Trả về danh sách gốc, mỗi nút có `children`. */
export async function loadTopics(moduleId: string): Promise<Topic[]> {
  const hit = cache.get(moduleId);
  if (hit) return hit;

  const { data, error } = await db()
    .from("topics")
    .select("*")
    .eq("module_id", moduleId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);

  const byId = new Map<number, Topic>();
  for (const r of (data ?? []) as TopicRow[]) {
    byId.set(r.id, {
      id: r.id,
      moduleId: r.module_id,
      parentId: r.parent_id,
      slug: r.slug,
      name: r.name,
      sortOrder: r.sort_order,
      children: [],
    });
  }

  const roots: Topic[] = [];
  for (const t of byId.values()) {
    const parent = t.parentId != null ? byId.get(t.parentId) : undefined;
    if (parent) parent.children.push(t);
    else roots.push(t);
  }

  cache.set(moduleId, roots);
  return roots;
}

/** Danh sách phẳng, tiện cho ô chọn và bộ lọc. */
export async function loadTopicsFlat(moduleId: string): Promise<Topic[]> {
  const roots = await loadTopics(moduleId);
  const out: Topic[] = [];
  const walk = (list: Topic[]) => list.forEach((t) => { out.push(t); walk(t.children); });
  walk(roots);
  return out;
}

// ---------------------------------------------------------------- quản trị

export async function upsertTopic(t: {
  id?: number;
  moduleId: string;
  parentId?: number | null;
  slug: string;
  name: string;
  sortOrder?: number;
}): Promise<void> {
  const row = {
    ...(t.id ? { id: t.id } : {}),
    module_id: t.moduleId,
    parent_id: t.parentId ?? null,
    slug: t.slug,
    name: t.name,
    sort_order: t.sortOrder ?? 0,
  };
  const { error } = await db().from("topics").upsert(row, { onConflict: "module_id,slug" });
  if (error) throw new Error(error.message);
  cache.delete(t.moduleId);
}

export async function deleteTopic(id: number, moduleId: string): Promise<void> {
  const { error } = await db().from("topics").delete().eq("id", id);
  if (error) throw new Error(error.message);
  cache.delete(moduleId);
}

export function clearTopicCache(moduleId?: string): void {
  if (moduleId) cache.delete(moduleId);
  else cache.clear();
}
