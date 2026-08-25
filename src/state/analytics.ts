/**
 * Phân tích học tập: mạnh yếu theo chủ đề, mức sẵn sàng thi, và thời gian làm bài.
 *
 * Nguyên tắc: mọi con số đưa ra đều kèm thành phần cấu thành. Một chỉ số "sẵn
 * sàng 72%" mà không nói vì sao thì người học không biết phải làm gì tiếp.
 */

import { db } from "../services/supabase";
import { currentUserId } from "./auth";
import { getAttempts } from "./progress";
import { getBankStats } from "../data/catalog";
import { loadMyResponseStats, type QuestionTiming } from "./responses";

// ---------------------------------------------------------------- biểu đồ năng lực

export interface TopicMastery {
  topicId: number | null;
  topicName: string;
  topicSlug: string;
  answered: number;
  correct: number;
  pct: number;
  avgTimeMs: number;
}

/** Mức thành thạo theo từng chủ đề, dùng vẽ biểu đồ mạng nhện. */
export async function loadTopicMastery(moduleId: string): Promise<TopicMastery[]> {
  const uid = currentUserId();
  if (!uid) return [];

  const { data, error } = await db()
    .from("topic_mastery")
    .select("*")
    .eq("user_id", uid)
    .eq("module_id", moduleId);
  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((r) => ({
      topicId: r.topic_id,
      topicName: r.topic_name ?? "Chưa phân loại",
      topicSlug: r.topic_slug ?? "khac",
      answered: r.answered ?? 0,
      correct: r.correct ?? 0,
      pct: r.pct ?? 0,
      avgTimeMs: r.avg_time_ms ?? 0,
    }))
    .sort((a, b) => a.pct - b.pct);
}

// ---------------------------------------------------------------- mức sẵn sàng thi

export interface ReadinessFactor {
  label: string;
  /** Điểm thành phần 0–100. */
  value: number;
  /** Trọng số trong tổng điểm. */
  weight: number;
  hint: string;
}

export interface Readiness {
  score: number;
  level: "chưa sẵn sàng" | "cần luyện thêm" | "gần sẵn sàng" | "sẵn sàng";
  factors: ReadinessFactor[];
  /** Việc nên làm tiếp, xếp theo mức ảnh hưởng. */
  advice: string[];
}

function levelOf(score: number): Readiness["level"] {
  if (score >= 80) return "sẵn sàng";
  if (score >= 65) return "gần sẵn sàng";
  if (score >= 45) return "cần luyện thêm";
  return "chưa sẵn sàng";
}

/**
 * Ước lượng khả năng vượt qua kỳ thi thật.
 *
 * Bốn thành phần: điểm gần đây (quan trọng nhất), độ phủ ngân hàng đề, độ ổn
 * định giữa các lần thi, và độ mới của lần học gần nhất. Đây là ước lượng tham
 * khảo chứ không phải dự báo chính xác — có ghi rõ trong `advice`.
 */
export function computeReadiness(moduleId: string, passPct: number): Readiness {
  const attempts = getAttempts(moduleId);
  const bank = getBankStats(moduleId);

  if (attempts.length === 0) {
    return {
      score: 0,
      level: "chưa sẵn sàng",
      factors: [],
      advice: ["Làm một bài thi thử có bấm giờ để hệ thống có cơ sở ước lượng."],
    };
  }

  const recent = attempts.slice(0, 3);
  const avgRecent = recent.reduce((s, a) => s + a.pct, 0) / recent.length;

  // Độ phủ: đã trả lời bao nhiêu phần trăm ngân hàng đề (ước lượng từ tổng số câu đã làm).
  const answered = attempts.reduce((s, a) => s + a.total, 0);
  const coverage = bank.answerable ? Math.min(100, (answered / bank.answerable) * 100) : 0;

  // Độ ổn định: điểm dao động càng ít càng đáng tin.
  const pcts = attempts.slice(0, 5).map((a) => a.pct);
  const mean = pcts.reduce((s, p) => s + p, 0) / pcts.length;
  const sd = Math.sqrt(pcts.reduce((s, p) => s + (p - mean) ** 2, 0) / pcts.length);
  const stability = Math.max(0, 100 - sd * 2.5);

  // Độ mới: học trong 3 ngày qua là 100, giảm dần, quá 21 ngày còn 0.
  const daysSince = (Date.now() - attempts[0].at) / 86400000;
  const recency = daysSince <= 3 ? 100 : Math.max(0, 100 - (daysSince - 3) * 5.5);

  const factors: ReadinessFactor[] = [
    {
      label: "Điểm 3 lần gần nhất",
      value: Math.round(avgRecent),
      weight: 0.5,
      hint: `Ngưỡng đậu tham chiếu ${passPct}%.`,
    },
    {
      label: "Độ phủ ngân hàng đề",
      value: Math.round(coverage),
      weight: 0.25,
      hint: `Đã làm ${answered} lượt trên ${bank.answerable} câu có đáp án.`,
    },
    {
      label: "Độ ổn định",
      value: Math.round(stability),
      weight: 0.15,
      hint: sd < 8 ? "Điểm khá đều giữa các lần." : "Điểm dao động nhiều giữa các lần thi.",
    },
    {
      label: "Độ mới",
      value: Math.round(recency),
      weight: 0.1,
      hint: daysSince < 1 ? "Vừa học hôm nay." : `Lần học gần nhất cách đây ${Math.round(daysSince)} ngày.`,
    },
  ];

  const score = Math.round(factors.reduce((s, f) => s + f.value * f.weight, 0));

  const advice: string[] = [];
  if (avgRecent < passPct) advice.push(`Điểm gần đây (${Math.round(avgRecent)}%) còn dưới ngưỡng đậu ${passPct}% — ưu tiên luyện lại ngân hàng câu sai.`);
  if (coverage < 60) advice.push(`Mới phủ khoảng ${Math.round(coverage)}% ngân hàng đề — còn nhiều dạng câu chưa gặp.`);
  if (stability < 70) advice.push("Điểm dao động mạnh giữa các lần thi, làm thêm vài đề nữa để kết quả ổn định.");
  if (recency < 60) advice.push("Đã lâu không học, nên ôn lại trước khi tin vào con số này.");
  if (advice.length === 0) advice.push("Giữ nhịp hiện tại và làm thêm đề đủ bộ để chắc tay.");
  advice.push("Đây là ước lượng tham khảo dựa trên dữ liệu luyện tập, không phải dự báo chính thức.");

  return { score, level: levelOf(score), factors, advice };
}

// ---------------------------------------------------------------- thời gian làm bài

export interface TimeInsight {
  /** Câu tốn nhiều thời gian bất thường. */
  slow: QuestionTiming[];
  /** Câu trả lời nhanh bất thường mà lại sai — dấu hiệu đoán mò. */
  guessed: QuestionTiming[];
  medianTimeMs: number;
  totalAnswered: number;
}

const FAST_GUESS_MS = 8000;

/** Phát hiện câu tốn thời gian và câu có dấu hiệu đoán mò. */
export async function loadTimeInsight(moduleId: string): Promise<TimeInsight> {
  const stats = (await loadMyResponseStats(moduleId)).filter((s) => s.avgTimeMs > 0);
  if (stats.length === 0) return { slow: [], guessed: [], medianTimeMs: 0, totalAnswered: 0 };

  const times = stats.map((s) => s.avgTimeMs).sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];

  return {
    slow: stats.filter((s) => s.avgTimeMs > median * 2).sort((a, b) => b.avgTimeMs - a.avgTimeMs).slice(0, 15),
    guessed: stats.filter((s) => s.avgTimeMs < FAST_GUESS_MS && s.pct < 50).sort((a, b) => a.avgTimeMs - b.avgTimeMs).slice(0, 15),
    medianTimeMs: median,
    totalAnswered: stats.reduce((s, x) => s + x.attempts, 0),
  };
}
