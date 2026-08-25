/**
 * Thói quen học: chuỗi ngày liên tiếp, mục tiêu theo ngày thi, và huy hiệu.
 *
 * Mục tiêu ở đây không phải "chơi game" cho vui mà để trả lời một câu rất thực
 * tế: còn N ngày tới ngày thi thì mỗi ngày phải làm bao nhiêu câu.
 */

import { db } from "../services/supabase";
import { currentUserId } from "./auth";
import { BADGES } from "../data/badges";

// ---------------------------------------------------------------- ngày học

export interface StudyDay {
  day: string; // "2026-08-25"
  questionsDone: number;
  seconds: number;
}

let days: StudyDay[] = [];
let daysLoaded = false;

function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Tải lịch sử ngày học (mặc định 1 năm gần nhất). */
export async function loadStudyDays(limitDays = 370): Promise<StudyDay[]> {
  const uid = currentUserId();
  if (!uid) return [];
  if (daysLoaded) return days;

  const since = new Date(Date.now() - limitDays * 86400000);
  const { data, error } = await db()
    .from("study_days")
    .select("day, questions_done, seconds")
    .eq("user_id", uid)
    .gte("day", todayKey(since))
    .order("day", { ascending: false });
  if (error) throw new Error(error.message);

  days = (data ?? []).map((r) => ({ day: r.day, questionsDone: r.questions_done ?? 0, seconds: r.seconds ?? 0 }));
  daysLoaded = true;
  return days;
}

/** Cộng dồn hoạt động của hôm nay. Gọi sau khi nộp bài hoặc xong một phiên ôn. */
export async function recordStudy(questions: number, seconds: number): Promise<void> {
  const uid = currentUserId();
  if (!uid || questions <= 0) return;

  const key = todayKey();
  const existing = days.find((d) => d.day === key);
  const next: StudyDay = {
    day: key,
    questionsDone: (existing?.questionsDone ?? 0) + questions,
    seconds: (existing?.seconds ?? 0) + Math.max(0, Math.round(seconds)),
  };
  days = [next, ...days.filter((d) => d.day !== key)];

  const { error } = await db()
    .from("study_days")
    .upsert(
      { user_id: uid, day: key, questions_done: next.questionsDone, seconds: next.seconds },
      { onConflict: "user_id,day" }
    );
  if (error) console.warn("[thói quen] không lưu được ngày học:", error);
}

export interface Streak {
  current: number;
  best: number;
  /** Hôm nay đã đạt chỉ tiêu chưa. */
  doneToday: boolean;
  questionsToday: number;
}

/** Chuỗi ngày liên tiếp đạt chỉ tiêu. Hôm nay chưa đạt thì chuỗi vẫn giữ, chưa đứt. */
export function getStreak(dailyTarget = 10): Streak {
  const map = new Map(days.map((d) => [d.day, d]));
  const today = todayKey();
  const questionsToday = map.get(today)?.questionsDone ?? 0;
  const doneToday = questionsToday >= dailyTarget;

  let current = 0;
  const cursor = new Date();
  // Nếu hôm nay chưa đạt thì bắt đầu đếm từ hôm qua — chuỗi chỉ đứt khi bỏ trọn một ngày.
  if (!doneToday) cursor.setDate(cursor.getDate() - 1);
  for (;;) {
    const d = map.get(todayKey(cursor));
    if (!d || d.questionsDone < dailyTarget) break;
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  let best = 0;
  let run = 0;
  const sorted = [...days].sort((a, b) => a.day.localeCompare(b.day));
  let prev: Date | null = null;
  for (const d of sorted) {
    if (d.questionsDone < dailyTarget) {
      run = 0;
      prev = null;
      continue;
    }
    const cur = new Date(d.day);
    run = prev && (cur.getTime() - prev.getTime()) / 86400000 === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = cur;
  }

  return { current, best: Math.max(best, current), doneToday, questionsToday };
}

// ---------------------------------------------------------------- mục tiêu & ngày thi

export interface StudyGoal {
  moduleId: string;
  examDate: string | null;
  dailyTarget: number;
}

const goals = new Map<string, StudyGoal>();

export async function loadGoals(): Promise<StudyGoal[]> {
  const uid = currentUserId();
  if (!uid) return [];
  const { data, error } = await db().from("study_goals").select("*").eq("user_id", uid);
  if (error) throw new Error(error.message);
  goals.clear();
  for (const r of data ?? []) {
    goals.set(r.module_id, { moduleId: r.module_id, examDate: r.exam_date, dailyTarget: r.daily_target ?? 20 });
  }
  return [...goals.values()];
}

export function getGoal(moduleId: string): StudyGoal | undefined {
  return goals.get(moduleId);
}

export async function saveGoal(moduleId: string, examDate: string | null, dailyTarget: number): Promise<void> {
  const uid = currentUserId();
  if (!uid) return;
  goals.set(moduleId, { moduleId, examDate, dailyTarget });
  const { error } = await db()
    .from("study_goals")
    .upsert(
      { user_id: uid, module_id: moduleId, exam_date: examDate, daily_target: dailyTarget, updated_at: new Date().toISOString() },
      { onConflict: "user_id,module_id" }
    );
  if (error) console.warn("[mục tiêu] không lưu được:", error);
}

export interface GoalPlan {
  daysLeft: number | null;
  dailyTarget: number;
  /** Số câu nên làm mỗi ngày để phủ hết phần chưa làm trước ngày thi. */
  suggestedPerDay: number | null;
  remainingQuestions: number;
}

/** Tính khối lượng cần làm mỗi ngày từ nay tới ngày thi. */
export function planFor(moduleId: string, totalQuestions: number, masteredCount: number): GoalPlan {
  const goal = goals.get(moduleId);
  const remaining = Math.max(0, totalQuestions - masteredCount);
  if (!goal?.examDate) {
    return { daysLeft: null, dailyTarget: goal?.dailyTarget ?? 20, suggestedPerDay: null, remainingQuestions: remaining };
  }
  const msLeft = new Date(`${goal.examDate}T00:00:00`).getTime() - Date.now();
  const daysLeft = Math.max(0, Math.ceil(msLeft / 86400000));
  return {
    daysLeft,
    dailyTarget: goal.dailyTarget,
    suggestedPerDay: daysLeft > 0 ? Math.ceil(remaining / daysLeft) : remaining,
    remainingQuestions: remaining,
  };
}

// ---------------------------------------------------------------- huy hiệu

const earned = new Set<string>();
let badgesLoaded = false;

export async function loadBadges(): Promise<string[]> {
  const uid = currentUserId();
  if (!uid) return [];
  if (badgesLoaded) return [...earned];
  const { data, error } = await db().from("user_badges").select("code").eq("user_id", uid);
  if (error) throw new Error(error.message);
  earned.clear();
  for (const r of data ?? []) earned.add(r.code);
  badgesLoaded = true;
  return [...earned];
}

export function hasBadge(code: string): boolean {
  return earned.has(code);
}

export function earnedBadges(): string[] {
  return [...earned];
}

/** Trao một huy hiệu. Trả về true nếu đây là lần đầu đạt (để UI hiện chúc mừng). */
export async function awardBadge(code: string): Promise<boolean> {
  const uid = currentUserId();
  if (!uid || earned.has(code)) return false;
  if (!BADGES.some((b) => b.code === code)) return false;

  earned.add(code);
  const { error } = await db().from("user_badges").upsert({ user_id: uid, code }, { onConflict: "user_id,code" });
  if (error) {
    console.warn("[huy hiệu] không lưu được:", error);
    return false;
  }
  return true;
}

export interface BadgeContext {
  totalAnswered: number;
  examAttempts: number;
  bestPct: number;
  passPct: number;
  wrongBankEmpty: boolean;
  srsReviews: number;
  streak: number;
  lessonsAllRead: boolean;
}

/** Kiểm tra toàn bộ điều kiện, trao những huy hiệu mới đạt. Trả về mã các huy hiệu vừa nhận. */
export async function checkBadges(ctx: BadgeContext): Promise<string[]> {
  const wins: string[] = [];
  const rules: [string, boolean][] = [
    ["first-100", ctx.totalAnswered >= 100],
    ["first-500", ctx.totalAnswered >= 500],
    ["first-exam", ctx.examAttempts >= 1],
    ["perfect-exam", ctx.bestPct >= 100],
    ["pass-exam", ctx.bestPct >= ctx.passPct],
    ["wrong-bank-clear", ctx.wrongBankEmpty && ctx.totalAnswered > 0],
    ["streak-7", ctx.streak >= 7],
    ["streak-30", ctx.streak >= 30],
    ["srs-100", ctx.srsReviews >= 100],
    ["theory-done", ctx.lessonsAllRead],
  ];
  for (const [code, ok] of rules) {
    if (ok && (await awardBadge(code))) wins.push(code);
  }
  return wins;
}

/**
 * Ghi sổ sau khi nộp một bài: cộng ngày học, kiểm tra huy hiệu.
 * Chạy ngầm, không chặn giao diện. Trả về mã các huy hiệu vừa đạt.
 */
export async function afterExamBookkeeping(opts: {
  moduleId: string;
  passPct: number;
  mode: "practice" | "exam";
  total: number;
  durationSec: number;
  bestPct: number;
  examAttempts: number;
  wrongCount: number;
}): Promise<string[]> {
  try {
    const { countMyResponses } = await import("./responses");
    await recordStudy(opts.total, opts.durationSec);
    await Promise.all([loadStudyDays(), loadBadges(), loadGoals()]);

    const target = getGoal(opts.moduleId)?.dailyTarget ?? 10;
    const totalAnswered = await countMyResponses();

    return await checkBadges({
      totalAnswered,
      examAttempts: opts.examAttempts,
      bestPct: opts.bestPct,
      passPct: opts.passPct,
      wrongBankEmpty: opts.wrongCount === 0,
      srsReviews: 0,
      streak: getStreak(target).current,
      lessonsAllRead: false,
    });
  } catch (err) {
    console.warn("[thói quen] không ghi sổ được sau bài làm:", err);
    return [];
  }
}

export function clearHabitCache(): void {
  days = [];
  daysLoaded = false;
  goals.clear();
  earned.clear();
  badgesLoaded = false;
}
