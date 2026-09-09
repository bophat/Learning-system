/**
 * Kiến trúc dữ liệu chung cho mọi chứng chỉ (AWS, JLPT, FE, AP, ...).
 * Mỗi chứng chỉ khai báo một `ExamModuleMeta` — trang chủ/trang danh mục đọc
 * từ đây, còn mỗi module tự quyết định nó có bao nhiêu "chặng" thi và mỗi
 * chặng hiển thị bằng màn hình nào (xem `src/modules/<cert>/`).
 */

export type Lang = "vi" | "en" | "ja";

/** Một lựa chọn trong câu hỏi trắc nghiệm. */
export interface ChoiceOption {
  /** Ký hiệu lựa chọn hiện đang hiển thị, ví dụ "A", "B", "C", "D" — đổi
   * theo vị trí mỗi khi phương án bị tráo (xem `lib/shuffle.ts`), nên KHÔNG
   * dùng trường này để so đáp án đúng/đã chọn, chỉ dùng để hiển thị và làm
   * khoá bấm chọn trong một lần vẽ màn hình. */
  label: string;
  /** Định danh cố định, không đổi dù tráo vị trí bao nhiêu lần — dùng để so
   * đáp án đúng/đã chọn (xem `lib/shuffle.ts#optionKey`). Rỗng với dữ liệu
   * chưa từng qua tráo — khi đó `label` (nhãn gốc) chính là định danh. */
  id?: string;
  en: string;
  ja: string;
  vi?: string;
  /** Giải thích vì sao phương án này đúng hoặc sai (tuỳ chọn). */
  why?: string;
  why_vi?: string;
  why_en?: string;
  why_ja?: string;
}

/** Tài liệu tham khảo đính kèm câu hỏi hoặc bài giảng. */
export interface Reference {
  label: string;
  url: string;
}

/** Một câu hỏi trắc nghiệm (dùng cho AWS, và phần trắc nghiệm của FE/AP). */
export interface MultipleChoiceQuestion {
  kind: "mc";
  n: number;
  en: string;
  ja: string;
  vi?: string;
  options: ChoiceOption[];
  /** Chuỗi ký hiệu đáp án đúng, ví dụ "B" hoặc "AD" cho câu chọn nhiều. null = chưa có dữ liệu đáp án trong nguồn. */
  answer: string | null;
  multi: boolean;
  /** Chặng thi hoặc mã kỳ thi mà câu này thuộc về, ví dụ "jlpt-n1-2024-07". */
  stageId?: string;
  /** Nhãn domain/chủ đề, dùng để lọc luyện tập theo domain (tuỳ chọn). */
  domain?: string;

  /** Chủ đề chi tiết trong cây kiến thức (`topics.id`). */
  topicId?: number | null;
  /** Giải thích chung cho cả câu — vì sao đáp án đúng là đáp án đúng. */
  explanation?: string;
  explanationJa?: string;
  /** Bản tiếng Việt — độc lập, không phải dịch máy từ hai trường trên. */
  explanationVi?: string;
  /** Liên kết tài liệu chính thức để đọc thêm. */
  refs?: Reference[];
  /** "markdown" cho phép LaTeX giữa hai dấu $ và khối mã. */
  bodyFormat?: "plain" | "markdown";
  /** File nghe đính kèm (JLPT). */
  audioUrl?: string | null;
  /** Độ khó thang -3..3 kiểu IRT. undefined = chưa hiệu chỉnh. */
  difficulty?: number;
}

/** Thẻ ghi nhớ hai mặt, dùng cho thuật ngữ / cú pháp / tên dịch vụ. */
export interface FlashcardQuestion {
  kind: "flashcard";
  n: number;
  /** Mặt trước. */
  front: string;
  frontJa: string;
  /** Mặt sau — nội dung cần nhớ. */
  back: string;
  domain?: string;
  topicId?: number | null;
  refs?: Reference[];
  bodyFormat?: "plain" | "markdown";
  audioUrl?: string | null;
}

/** Một câu hỏi tự luận dài (buổi chiều AP, Khoa B của FE ở dạng rút gọn). */
export interface EssayQuestion {
  kind: "essay";
  n: number;
  /** Tiêu đề ngắn để hiện trong danh sách chọn câu, ví dụ "Câu 3: Bảo mật". */
  title: string;
  /** Đề bài đầy đủ (có thể nhiều đoạn, ngăn bằng \n\n). */
  prompt: string;
  /** Các câu hỏi con trong cùng một đề bài lớn. */
  subQuestions: EssaySubQuestion[];
  /** true nếu đây là câu bắt buộc (không nằm trong nhóm phải chọn). */
  required?: boolean;
}

export interface EssaySubQuestion {
  id: string;
  prompt: string;
  /** Đáp án mẫu để người học tự đối chiếu — không chấm điểm tự động được. */
  referenceAnswer: string;
}

/**
 * Câu Nghe — chấm như trắc nghiệm (options/answer/multi) nhưng UI phải khoá
 * tua: audio chỉ phát một lần, đúng luật thi thật của IELTS/TOEIC/JLPT.
 */
export interface ListeningQuestion {
  kind: "listening";
  n: number;
  en: string;
  ja: string;
  options: ChoiceOption[];
  answer: string | null;
  multi: boolean;
  audioUrl: string;
  /** Ví dụ 2 trong "Part 2/4". */
  part: number;
  totalParts: number;
  /** true = ẩn phương án cho tới khi audio phát xong (một số dạng câu JLPT). */
  revealAfterAudio: boolean;
  stageId?: string;
  domain?: string;
  topicId?: number | null;
  difficulty?: number;
}

/** Một câu con bên trong một bài Đọc — mỗi câu con có thể là một dạng khác nhau. */
export type ReadingSubItem =
  | { id: string; kind: "mc"; prompt: string; promptJa?: string; options: ChoiceOption[]; answer: string }
  | { id: string; kind: "completion"; prompt: string; promptJa?: string; answer: string }
  | { id: string; kind: "matching"; prompt: string; promptJa?: string; options: string[]; answer: string };

/**
 * Bài Đọc — một đoạn văn dài kèm nhiều câu hỏi con khác dạng (trắc nghiệm,
 * điền từ, ghép tiêu đề). UI hiển thị split-view: đoạn văn và câu hỏi cuộn
 * độc lập nhau.
 */
export interface ReadingQuestion {
  kind: "reading";
  n: number;
  passageEn: string;
  passageJa: string;
  title?: string;
  subItems: ReadingSubItem[];
  stageId?: string;
  domain?: string;
  topicId?: number | null;
}

/** Câu Viết — không chấm tự động được, người học tự đối chiếu đáp án mẫu. */
export interface WritingQuestion {
  kind: "writing";
  n: number;
  title: string;
  prompt: string;
  minWords: number;
  sampleAnswer?: string;
  stageId?: string;
}

export interface MatchingItem {
  id: string;
  label: string;
  labelJa?: string;
  /** Các lựa chọn hiện trong dropdown, đúng thứ tự. */
  options: string[];
  /** Vị trí đáp án đúng trong `options`. */
  answerIndex: number;
}

/** Câu Ghép nối — mỗi mục chọn đáp án bằng dropdown (bắt buộc), kéo-thả là tuỳ chọn tăng cường. */
export interface MatchingQuestion {
  kind: "matching";
  n: number;
  title: string;
  prompt: string;
  items: MatchingItem[];
  stageId?: string;
}

export interface AccountingEntry {
  side: "debit" | "credit";
  account: string;
  amount: number;
}

/** Câu bút toán (Boki) — nhập debit/credit, tự validate cân bằng khi làm. */
export interface AccountingQuestion {
  kind: "accounting";
  n: number;
  prompt: string;
  /** Danh mục tài khoản kế toán cho cả hai cột dropdown. */
  accounts: string[];
  correctEntries: AccountingEntry[];
  stageId?: string;
}

export type ExamQuestion =
  | MultipleChoiceQuestion
  | EssayQuestion
  | FlashcardQuestion
  | ListeningQuestion
  | ReadingQuestion
  | WritingQuestion
  | MatchingQuestion
  | AccountingQuestion;

/** Một "chặng" của kỳ thi — AWS có 1 chặng, JLPT có 3, FE/AP có 2. */
export interface ExamStage {
  id: string;
  name: string;
  /** Thời gian làm bài của chặng này, tính bằng phút. undefined = không giới hạn giờ. */
  durationMinutes?: number;
  /** Loại giao diện cần dùng để hiển thị chặng này. */
  kind: "mc-test" | "essay-test" | "listening-test";
  /** Số câu của chặng theo đề thi thật (dùng để mô tả cấu trúc đề). */
  questionCount?: number;
  note?: string;
}

/**
 * Một cấp độ của chứng chỉ có chia cấp — JLPT có N1..N5, HSK có HSK1..HSK6.
 * Mỗi cấp là một kỳ thi riêng: thời lượng, ngưỡng đậu và ngân hàng câu hỏi
 * khác nhau, dù dùng chung các `stages` (các phần trong một buổi thi) của
 * chứng chỉ. Chứng chỉ không chia cấp (AWS, AP, FE) có `levels: []`.
 */
export interface ExamLevel {
  /** Mã cấp, dùng làm `level_id` khi truy vấn câu hỏi — ví dụ "n1". */
  id: string;
  /** Nhãn hiển thị, ví dụ "N1". */
  label: string;
  examMinutes: number;
  passNote: string;
  passPct: number;
  sortOrder: number;
  /** Tổng số câu hỏi hiện có của riêng cấp này (0 nếu chưa có dữ liệu). */
  questionCount?: number;
}

/** Một dòng trong bảng "cấu trúc đề thi" ở trang chi tiết chứng chỉ. */
export interface FactRow {
  label: string;
  value: string;
}

export interface ExamModuleMeta {
  id: string;
  /** Mã ngắn hiện trên thẻ, ví dụ "AWS", "AP". */
  shortName: string;
  /** Nhãn phụ đi kèm mã, ví dụ "SAA-C03". */
  shortLabel: string;
  fullName: string;
  /** Mô tả một dòng, hiện ở thẻ chứng chỉ. */
  tagline: string;
  /** Mô tả dài hơn cho trang chi tiết. */
  description: string;
  /** Tên biểu tượng trong `src/components/icons.ts`. */
  iconName: string;
  /** Đơn vị tổ chức thi. */
  provider: string;
  /** Trình độ / cấp độ. */
  level: string;
  /** Tổng số câu hỏi hiện có trong ứng dụng (0 nếu chưa có dữ liệu). */
  questionCount: number;
  /** Tổng thời gian thi thật, tính bằng phút. */
  examMinutes: number;
  /** Điều kiện đậu, ví dụ "720/1000 điểm". */
  passNote: string;
  /** Ngưỡng đậu quy đổi ra tỷ lệ câu đúng, dùng để chấm bài trong app. */
  passPct: number;
  /** true = ngân hàng câu hỏi có cả bản tiếng Anh và tiếng Nhật. */
  bilingual: boolean;
  /** Vài gạch đầu dòng nổi bật, hiện ở trang chi tiết. */
  highlights: string[];
  /** Bảng tóm tắt cấu trúc đề thi. */
  facts: FactRow[];
  stages: ExamStage[];
  /** Rỗng nếu chứng chỉ không chia cấp. Có giá trị thì UI cần cho chọn cấp
   * trước khi vào ôn/thi — xem `ExamLevel`. */
  levels: ExamLevel[];
  /** false = module đã lên khung nhưng chưa có dữ liệu câu hỏi thật (hiện "sắp có"). */
  available: boolean;
  /** true = dữ liệu hiện tại chỉ là câu hỏi minh hoạ, chưa phải đề thật. */
  sampleData?: boolean;
  accentHue: number;
  /** Thứ tự hiển thị trong danh mục. */
  sortOrder: number;
}
