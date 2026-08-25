/**
 * Đảm bảo chất lượng đề — dành cho quản trị viên.
 *
 * Hai chỉ số kinh điển trong khảo thí:
 *  • Độ khó (p-value): tỷ lệ trả lời đúng. Quá cao (>0.95) là câu quá dễ,
 *    quá thấp (<0.2) thì hoặc là câu khó thật, hoặc là đáp án đang sai.
 *  • Độ phân biệt (discrimination): chênh lệch tỷ lệ đúng giữa nhóm giỏi và
 *    nhóm yếu. Dưới 0.2 nghĩa là câu không phân loại được thí sinh — thường do
 *    đề mơ hồ, dịch sai, hoặc có hai đáp án cùng đúng.
 *
 * Cả hai đọc qua hàm SECURITY DEFINER phía CSDL, tự chặn người không phải admin.
 */

import { db } from "../services/supabase";

export interface ItemStat {
  questionN: number;
  samples: number;
  /** 0..1 — càng cao càng dễ. */
  pValue: number;
  /** -1..1 — dưới 0.2 là câu đáng ngờ. */
  discrimination: number;
  avgTimeMs: number;
  /** Cảnh báo tự động, rỗng nghĩa là câu bình thường. */
  flags: string[];
}

function flagsFor(s: { samples: number; pValue: number; discrimination: number }): string[] {
  const out: string[] = [];
  if (s.samples < 20) return ["Chưa đủ lượt trả lời để kết luận"];
  if (s.pValue < 0.2) out.push("Quá khó hoặc đáp án có thể sai");
  if (s.pValue > 0.95) out.push("Quá dễ, gần như ai cũng đúng");
  if (s.discrimination < 0.1) out.push("Không phân biệt được thí sinh giỏi/yếu");
  else if (s.discrimination < 0.2) out.push("Độ phân biệt thấp");
  if (s.discrimination < 0) out.push("Nhóm giỏi làm sai nhiều hơn nhóm yếu — nghi đáp án sai");
  return out;
}

/** Bảng phân tích chất lượng cho toàn bộ câu của một chứng chỉ. */
export async function loadItemStats(moduleId: string): Promise<ItemStat[]> {
  const { data, error } = await db().rpc("item_analysis", { p_module: moduleId });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: { question_n: number; n: number; p_value: number; discrimination: number; avg_time_ms: number }) => {
    const base = {
      questionN: r.question_n,
      samples: r.n ?? 0,
      pValue: Number(r.p_value) || 0,
      discrimination: Number(r.discrimination) || 0,
      avgTimeMs: r.avg_time_ms ?? 0,
    };
    return { ...base, flags: flagsFor(base) };
  });
}

/** Tỷ lệ chọn từng phương án của một câu — nhìn ra ngay phương án gây nhiễu. */
export async function loadOptionPicks(moduleId: string, questionN: number): Promise<{ chosen: string; n: number }[]> {
  const { data, error } = await db().rpc("option_picks", { p_module: moduleId, p_n: questionN });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: { chosen: string; n: number }) => ({ chosen: r.chosen, n: r.n }));
}

/**
 * Ghi độ khó tính từ số liệu thực tế ngược vào bảng câu hỏi, để chế độ thi
 * thích ứng có cơ sở chọn câu. Chỉ ghi câu đã đủ mẫu.
 */
export async function syncDifficulty(moduleId: string, minSamples = 20): Promise<number> {
  const { difficultyFromPValue } = await import("../lib/adaptive");
  const stats = await loadItemStats(moduleId);

  const rows = stats
    .filter((s) => s.samples >= minSamples)
    .map((s) => ({ n: s.questionN, difficulty: difficultyFromPValue(s.pValue, s.samples) }))
    .filter((r): r is { n: number; difficulty: number } => r.difficulty !== undefined);

  for (const r of rows) {
    const { error } = await db()
      .from("questions")
      .update({ difficulty: Number(r.difficulty.toFixed(3)) })
      .eq("module_id", moduleId)
      .eq("n", r.n);
    if (error) throw new Error(error.message);
  }
  return rows.length;
}
