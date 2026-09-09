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
 * Định danh bền của một phương án — dùng ở MỌI nơi so đáp án đúng/đã chọn
 * (chấm điểm, tô đúng/sai, xem lại bài...). KHÔNG dùng `o.label` cho việc
 * này vì label đổi mỗi lần tráo; chỉ dùng label để hiển thị/làm khoá bấm
 * chọn trong một lần vẽ màn hình.
 */
export function optionKey(o: ChoiceOption): string {
  return o.id || o.label;
}

/**
 * Tráo vị trí các phương án của MỘT câu và gán lại nhãn hiển thị A/B/C...
 * theo vị trí mới. Trước khi tráo, gán `id` cố định (nếu chưa có) bằng đúng
 * nhãn hiện tại — lúc này nhãn vẫn là nhãn gốc do người nạp đề đặt, khớp với
 * `answer` (đáp án đúng luôn được ghi theo nhãn gốc). Từ đó về sau id không
 * đổi dù tráo lại bao nhiêu lần, nên KHÔNG cần tính lại `answer` mỗi lần
 * tráo nữa — đây chính là chỗ bản cũ (tính lại answer theo nhãn mới) từng
 * sai khi bài đang làm dở được khôi phục từ một lượt tráo khác: nhãn đổi
 * nhưng answer đã "chốt cứng" theo nhãn cũ mất rồi.
 *
 * Trả về CÂU MỚI, không sửa object gốc — object gốc còn nằm trong bộ nhớ đệm
 * ngân hàng câu hỏi (`data/questions.ts`), sửa tại chỗ sẽ làm những màn khác
 * (duyệt câu hỏi, sổ ghi chú...) đang giữ cùng tham chiếu bị xáo trộn theo.
 */
function remapOptions<T extends { options: ChoiceOption[]; answer: string | null }>(q: T): T {
  if (q.options.length < 2) return q;

  const withId = q.options.map((o) => (o.id ? o : { ...o, id: o.label }));
  const order = shuffleArray(withId);
  const options = order.map((o, i) => ({ ...o, label: ALPHA[i] }));

  return { ...q, options };
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
