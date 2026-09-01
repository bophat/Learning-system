/**
 * Danh mục chứng chỉ, đọc từ bảng `exam_modules` trên Supabase.
 *
 * Tải một lần lúc khởi động rồi giữ trong bộ nhớ, nên phần lớn giao diện vẫn
 * đọc được đồng bộ (`getModules()`) như hồi danh mục còn nằm cứng trong code.
 */

import type { ExamModuleMeta, ExamStage, ExamLevel } from "../types/exam";
import { db } from "../services/supabase";

/** Số liệu tổng hợp của ngân hàng câu hỏi, lấy từ view `module_stats`. */
export interface BankStats {
  total: number;
  mcTotal: number;
  essayTotal: number;
  withAnswer: number;
  answerable: number;
  multiTotal: number;
}

const EMPTY_STATS: BankStats = { total: 0, mcTotal: 0, essayTotal: 0, withAnswer: 0, answerable: 0, multiTotal: 0 };

let modules: ExamModuleMeta[] = [];
let stats: Record<string, BankStats> = {};
/** Số liệu theo từng cấp, khoá bằng `moduleId + "/" + levelId`. */
let levelStats: Record<string, BankStats> = {};
let loaded = false;

const levelKey = (moduleId: string, levelId: string) => `${moduleId}/${levelId}`;

interface ModuleRow {
  id: string;
  short_name: string;
  short_label: string;
  full_name: string;
  tagline: string;
  description: string;
  icon_name: string;
  provider: string;
  level: string;
  exam_minutes: number;
  pass_note: string;
  pass_pct: number;
  accent_hue: number;
  available: boolean;
  sample_data: boolean;
  bilingual: boolean;
  highlights: string[];
  facts: { label: string; value: string }[];
  stages: ExamStage[];
  levels: Omit<ExamLevel, "questionCount">[];
  sort_order: number;
}

function toMeta(row: ModuleRow, bank: BankStats, levels: ExamLevel[]): ExamModuleMeta {
  return {
    id: row.id,
    shortName: row.short_name,
    shortLabel: row.short_label ?? "",
    fullName: row.full_name,
    tagline: row.tagline ?? "",
    description: row.description ?? "",
    iconName: row.icon_name || "book",
    provider: row.provider ?? "",
    level: row.level ?? "",
    questionCount: bank.total,
    examMinutes: row.exam_minutes ?? 0,
    passNote: row.pass_note ?? "",
    passPct: row.pass_pct ?? 60,
    bilingual: !!row.bilingual,
    highlights: Array.isArray(row.highlights) ? row.highlights : [],
    facts: Array.isArray(row.facts) ? row.facts : [],
    stages: Array.isArray(row.stages) ? row.stages : [],
    levels,
    available: !!row.available,
    sampleData: !!row.sample_data,
    accentHue: row.accent_hue ?? 45,
    sortOrder: row.sort_order ?? 0,
  };
}

/** Tải danh mục + số liệu ngân hàng câu hỏi. Gọi sau khi đăng nhập xong. */
export async function loadCatalog(): Promise<void> {
  const [modRes, statRes, levelStatRes] = await Promise.all([
    db().from("exam_modules").select("*").order("sort_order", { ascending: true }),
    db().from("module_stats").select("*"),
    db().from("level_stats").select("*"),
  ]);

  if (modRes.error) throw new Error(modRes.error.message);

  stats = {};
  for (const s of statRes.data ?? []) {
    stats[s.module_id] = {
      total: s.total ?? 0,
      mcTotal: s.mc_total ?? 0,
      essayTotal: s.essay_total ?? 0,
      withAnswer: s.with_answer ?? 0,
      answerable: s.answerable ?? 0,
      multiTotal: s.multi_total ?? 0,
    };
  }

  levelStats = {};
  for (const s of levelStatRes.data ?? []) {
    levelStats[levelKey(s.module_id, s.level_id)] = {
      total: s.total ?? 0,
      mcTotal: s.mc_total ?? 0,
      essayTotal: s.essay_total ?? 0,
      withAnswer: s.with_answer ?? 0,
      answerable: s.answerable ?? 0,
      multiTotal: s.multi_total ?? 0,
    };
  }

  modules = (modRes.data ?? []).map((row: ModuleRow) => {
    const levels: ExamLevel[] = (Array.isArray(row.levels) ? row.levels : []).map((lv) => ({
      ...lv,
      questionCount: levelStats[levelKey(row.id, lv.id)]?.total ?? 0,
    }));
    return toMeta(row, stats[row.id] ?? EMPTY_STATS, levels);
  });
  loaded = true;
}

export function isCatalogLoaded(): boolean {
  return loaded;
}

export function getModules(): ExamModuleMeta[] {
  return modules;
}

export function getModule(id: string): ExamModuleMeta | undefined {
  return modules.find((m) => m.id === id);
}

export function getBankStats(id: string): BankStats {
  return stats[id] ?? EMPTY_STATS;
}

/** Số liệu ngân hàng câu hỏi của riêng MỘT CẤP — chỉ có ý nghĩa với chứng
 * chỉ có `levels` (JLPT...). Chứng chỉ không chia cấp thì dùng `getBankStats`. */
export function getLevelStats(moduleId: string, levelId: string): BankStats {
  return levelStats[levelKey(moduleId, levelId)] ?? EMPTY_STATS;
}

/** Cấp độ theo id, tiện cho màn chọn cấp và trang chi tiết. */
export function getLevel(moduleId: string, levelId: string): ExamLevel | undefined {
  return getModule(moduleId)?.levels.find((l) => l.id === levelId);
}
