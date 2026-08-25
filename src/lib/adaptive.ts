/**
 * Khảo thí thích ứng (CAT) — chọn câu kế tiếp theo đúng sức người học.
 *
 * Dùng mô hình một tham số (Rasch): xác suất trả lời đúng một câu có độ khó `b`
 * khi năng lực là `theta` bằng 1 / (1 + e^-(theta - b)). Sau mỗi câu, cập nhật
 * `theta` theo kiểu Elo — sai số càng lớn thì dịch càng nhiều — rồi chọn câu
 * tiếp theo có độ khó gần `theta` nhất, vì đó là câu cho nhiều thông tin nhất
 * về năng lực (và cũng vừa sức nhất để học).
 *
 * Thang đo: theta và b cùng nằm khoảng -3 (rất yếu/rất dễ) đến +3 (rất giỏi/rất khó).
 */

export interface AdaptiveItem {
  n: number;
  /** Độ khó. Chưa có số liệu thì để undefined, sẽ coi như 0 (trung bình). */
  difficulty?: number;
}

export interface AdaptiveState {
  theta: number;
  answered: number;
  /** Số hiệu các câu đã dùng, để không lặp lại. */
  used: Set<number>;
}

export function newAdaptiveState(startTheta = 0): AdaptiveState {
  return { theta: startTheta, answered: 0, used: new Set() };
}

/** Xác suất trả lời đúng theo mô hình Rasch. */
export function successProbability(theta: number, difficulty: number): number {
  return 1 / (1 + Math.exp(-(theta - difficulty)));
}

/**
 * Cập nhật ước lượng năng lực sau một câu.
 * Bước dịch giảm dần theo số câu đã làm để ước lượng ổn định lại về sau.
 */
export function updateAbility(state: AdaptiveState, difficulty: number, correct: boolean): AdaptiveState {
  const k = Math.max(0.15, 0.8 / Math.sqrt(state.answered + 1));
  const expected = successProbability(state.theta, difficulty);
  const theta = Math.max(-3, Math.min(3, state.theta + k * ((correct ? 1 : 0) - expected)));
  return { theta, answered: state.answered + 1, used: state.used };
}

/**
 * Chọn câu kế tiếp: gần `theta` nhất, ưu tiên câu đã có số liệu độ khó.
 * Trả về null khi hết câu.
 */
export function pickNext(items: AdaptiveItem[], state: AdaptiveState): AdaptiveItem | null {
  let best: AdaptiveItem | null = null;
  let bestScore = Infinity;

  for (const item of items) {
    if (state.used.has(item.n)) continue;
    const b = item.difficulty ?? 0;
    // Cộng một khoản phạt nhỏ cho câu chưa có số liệu, để ưu tiên câu đã hiệu chỉnh.
    const penalty = item.difficulty === undefined ? 0.25 : 0;
    const score = Math.abs(b - state.theta) + penalty;
    if (score < bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return best;
}

/** Quy đổi năng lực sang tỷ lệ phần trăm dễ hiểu cho người dùng (0–100). */
export function abilityToPercent(theta: number): number {
  return Math.round(successProbability(theta, 0) * 100);
}

/**
 * Ước lượng độ khó từ số liệu thực tế: tỷ lệ đúng càng thấp thì câu càng khó.
 * `pValue` là tỷ lệ trả lời đúng (0..1).
 */
export function difficultyFromPValue(pValue: number, sampleSize: number): number | undefined {
  if (sampleSize < 5) return undefined; // quá ít lượt, chưa đáng tin
  const p = Math.min(0.98, Math.max(0.02, pValue));
  return Math.max(-3, Math.min(3, Math.log((1 - p) / p)));
}
