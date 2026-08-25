/**
 * Lặp lại ngắt quãng — thuật toán SM-2 (SuperMemo 2).
 *
 * Ý tưởng: mỗi câu có một "khoảng cách" tới lần ôn kế tiếp. Trả lời tốt thì
 * khoảng cách nhân lên theo hệ số dễ (ease), trả lời sai thì reset về đầu và
 * hạ hệ số dễ xuống. Nhờ vậy câu nào sắp quên mới hiện lại, câu đã thuộc thì
 * giãn ra dần — bám theo đường cong lãng quên thay vì ôn dàn trải.
 *
 * File này thuần tính toán, không đụng tới CSDL, để dễ kiểm chứng.
 */

export type SrsState = "new" | "learning" | "review" | "relearning";

/** Bốn mức người học tự đánh giá sau khi lật đáp án. */
export type SrsGrade = "again" | "hard" | "good" | "easy";

export interface SrsCard {
  state: SrsState;
  /** Khoảng cách hiện tại tới lần ôn kế, tính bằng ngày (có thể < 1). */
  intervalDays: number;
  /** Hệ số dễ, không bao giờ xuống dưới 1.3. */
  ease: number;
  /** Số lần ôn đúng liên tiếp. */
  reps: number;
  /** Số lần quên (tụt về học lại). */
  lapses: number;
  dueAt: number | null;
  lastReviewedAt: number | null;
}

/**
 * Bước học cho câu mới / câu vừa quên, tính bằng phút. Qua hết các bước này thì
 * câu "tốt nghiệp" sang giai đoạn ôn dài hạn.
 */
const LEARNING_STEPS_MIN = [10];
const MIN_EASE = 1.3;
const MAX_INTERVAL_DAYS = 365;

const DAY_MS = 86400000;
const MIN_MS = 60000;

export function newCard(): SrsCard {
  return { state: "new", intervalDays: 0, ease: 2.5, reps: 0, lapses: 0, dueAt: null, lastReviewedAt: null };
}

/** Điều chỉnh hệ số dễ theo chất lượng câu trả lời (công thức SM-2). */
function nextEase(ease: number, grade: SrsGrade): number {
  const q = grade === "again" ? 2 : grade === "hard" ? 3 : grade === "good" ? 4 : 5;
  const delta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
  return Math.max(MIN_EASE, ease + delta);
}

/**
 * Tính trạng thái mới sau một lần ôn.
 * `now` truyền vào được để kiểm thử cho dễ.
 */
export function review(card: SrsCard, grade: SrsGrade, now: number = Date.now()): SrsCard {
  const ease = nextEase(card.ease, grade);

  // Quên: tụt về học lại từ bước đầu, ghi nhận một lần "lapse".
  if (grade === "again") {
    return {
      state: card.state === "new" ? "learning" : "relearning",
      intervalDays: LEARNING_STEPS_MIN[0] / 1440,
      ease,
      reps: 0,
      lapses: card.lapses + (card.state === "review" ? 1 : 0),
      dueAt: now + LEARNING_STEPS_MIN[0] * MIN_MS,
      lastReviewedAt: now,
    };
  }

  // Đang học lại sau khi quên: bản thân lần quên đã đẩy câu về bước đầu rồi,
  // nên chỉ cần một lần đúng là quay lại chu kỳ dài.
  if (card.state === "relearning") {
    const intervalDays = grade === "easy" ? 3 : 1;
    return {
      state: "review",
      intervalDays,
      ease,
      reps: card.reps + 1,
      lapses: card.lapses,
      dueAt: now + intervalDays * DAY_MS,
      lastReviewedAt: now,
    };
  }

  // Câu mới hoặc đang học: đi lần lượt qua các bước phút rồi mới "tốt nghiệp".
  if (card.state === "new" || card.state === "learning") {
    const nextRep = card.reps + 1;
    const graduate = grade === "easy" || nextRep > LEARNING_STEPS_MIN.length;
    if (graduate) {
      const intervalDays = grade === "easy" ? 4 : 1;
      return {
        state: "review",
        intervalDays,
        ease,
        reps: nextRep,
        lapses: card.lapses,
        dueAt: now + intervalDays * DAY_MS,
        lastReviewedAt: now,
      };
    }
    const minutes = LEARNING_STEPS_MIN[nextRep - 1];
    return {
      state: "learning",
      intervalDays: minutes / 1440,
      ease,
      reps: nextRep,
      lapses: card.lapses,
      dueAt: now + minutes * MIN_MS,
      lastReviewedAt: now,
    };
  }

  // Đã vào giai đoạn ôn: giãn khoảng cách theo hệ số dễ.
  const factor = grade === "hard" ? 1.2 : grade === "easy" ? ease * 1.3 : ease;
  const intervalDays = Math.min(MAX_INTERVAL_DAYS, Math.max(1, Math.round(card.intervalDays * factor)));
  return {
    state: "review",
    intervalDays,
    ease,
    reps: card.reps + 1,
    lapses: card.lapses,
    dueAt: now + intervalDays * DAY_MS,
    lastReviewedAt: now,
  };
}

/** Câu đã tới hạn ôn chưa. Câu mới coi như luôn tới hạn. */
export function isDue(card: SrsCard, now: number = Date.now()): boolean {
  if (card.state === "new" || card.dueAt === null) return true;
  return card.dueAt <= now;
}

/** Mô tả khoảng cách kế tiếp cho từng nút, để hiện ngay trên nút bấm. */
export function previewIntervals(card: SrsCard, now: number = Date.now()): Record<SrsGrade, string> {
  const fmt = (next: SrsCard) => {
    const ms = (next.dueAt ?? now) - now;
    if (ms < 3600000) return `${Math.max(1, Math.round(ms / MIN_MS))} phút`;
    if (ms < DAY_MS) return `${Math.round(ms / 3600000)} giờ`;
    const days = Math.round(ms / DAY_MS);
    if (days < 30) return `${days} ngày`;
    if (days < 365) return `${Math.round(days / 30)} tháng`;
    return `${(days / 365).toFixed(1)} năm`;
  };
  return {
    again: fmt(review(card, "again", now)),
    hard: fmt(review(card, "hard", now)),
    good: fmt(review(card, "good", now)),
    easy: fmt(review(card, "easy", now)),
  };
}
