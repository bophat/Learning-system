/**
 * Xáo trộn thuần — không đụng CSDL, không đụng DOM, nên đặt cạnh `srs.ts` /
 * `adaptive.ts` trong `lib/` để dễ kiểm chứng độc lập.
 *
 * Vì sao cần: các chứng chỉ như AWS không chia thành nhiều "mã đề" riêng như
 * JLPT theo từng kỳ thi — chỉ có MỘT ngân hàng câu hỏi chung. Nếu mỗi lần thi
 * thử luôn lấy đúng N câu theo thứ tự cố định (mặc định trước đây), học viên
 * làm vài lần là thuộc đúng "câu 3 luôn là B" mà không cần hiểu bài — tráo cả
 * thứ tự câu lẫn vị trí phương án mới thực sự chống học tủ.
 */

import type { ChoiceOption, ListeningQuestion, MultipleChoiceQuestion } from "../types/exam";

/** Fisher–Yates — xáo tại chỗ trên bản sao, không đụng mảng gốc. */
export function shuffleArray<T>(arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Tráo vị trí các phương án của MỘT câu, gán lại nhãn A/B/C... theo vị trí
 * mới, và tính lại chuỗi đáp án đúng cho khớp nhãn mới — nội dung phương án
 * (đúng/sai) không đổi, chỉ đổi chỗ đứng và ký hiệu.
 *
 * Trả về CÂU MỚI, không sửa object gốc — object gốc còn nằm trong bộ nhớ đệm
 * ngân hàng câu hỏi (`data/questions.ts`), sửa tại chỗ sẽ làm những màn khác
 * (duyệt câu hỏi, sổ ghi chú...) đang giữ cùng tham chiếu bị xáo trộn theo.
 */
function remapOptions<T extends { options: ChoiceOption[]; answer: string | null }>(q: T): T {
  if (q.options.length < 2) return q;

  const order = shuffleArray(q.options);
  // Nhãn cũ -> nhãn mới, để tính lại answer.
  const relabel = new Map(order.map((o, i) => [o.label, ALPHA[i]]));

  const options = order.map((o, i) => ({ ...o, label: ALPHA[i] }));
  const answer = q.answer
    ? [...q.answer]
        .map((oldLabel) => relabel.get(oldLabel) ?? oldLabel)
        .sort()
        .join("")
    : q.answer;

  return { ...q, options, answer };
}

/** Tráo phương án của một câu trắc nghiệm. */
export function shuffleMcOptions(q: MultipleChoiceQuestion): MultipleChoiceQuestion {
  return remapOptions(q);
}

/** Tráo phương án của một câu Nghe (cùng cơ chế chấm với trắc nghiệm). */
export function shuffleListeningOptions(q: ListeningQuestion): ListeningQuestion {
  return remapOptions(q);
}

/** Áp dụng cho cả danh sách — dùng ngay trước khi đưa vào `startExam`. */
export function shuffleAllMcOptions(list: MultipleChoiceQuestion[]): MultipleChoiceQuestion[] {
  return list.map(shuffleMcOptions);
}
