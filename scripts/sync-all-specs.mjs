/**
 * sync-all-specs.mjs
 *
 * Đồng bộ cấu trúc thi chuẩn xác 100% theo spec-cau-truc-thi-chung-chi.md
 * cho tất cả các chứng chỉ trong hệ thống (JLPT, IELTS, TOEIC, FE, AP, AWS, HSK, BOKI, PMP, TOKUTEI)
 *
 * Chạy: node scripts/sync-all-specs.mjs
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { upsert, select } from "./rest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const modulesJsonPath = path.join(ROOT, "seed", "modules.json");
const existingModules = existsSync(modulesJsonPath) ? JSON.parse(readFileSync(modulesJsonPath, "utf8")) : [];

const findExisting = (id) => existingModules.find((m) => m.id === id) || {};

const allModules = [
  // 1. JLPT
  {
    id: "jlpt",
    short_name: "JLPT",
    short_label: "N1 → N5",
    full_name: "Japanese-Language Proficiency Test (Kỳ thi Năng lực Tiếng Nhật)",
    tagline: "Chuẩn khảo thí quốc tế JEES/Japan Foundation: N1 (165'), N2 (155'), N3 (140'), N4 (115'), N5 (90').",
    description:
      "Kỳ thi đánh giá và chứng nhận năng lực tiếng Nhật dành cho người không nói tiếng Nhật bản ngữ, do Japan Foundation và JEES tổ chức. Bao gồm 5 cấp độ từ N5 (sơ cấp) đến N1 (cao cấp), kiểm tra toàn diện Kiến thức ngôn ngữ (Từ vựng/Ngữ pháp), Đọc hiểu và Nghe hiểu.",
    icon_name: "language",
    provider: "Japan Foundation · JEES",
    level: "5 Cấp độ N5 → N1",
    exam_minutes: 165,
    pass_note: "Đạt điểm sàn tổng VÀ điểm sàn từng môn (mỗi môn ≥ 19/60)",
    pass_pct: 56,
    accent_hue: 24,
    available: true,
    sample_data: false,
    bilingual: false,
    highlights: [
      "Đầy đủ 5 cấp độ N1 (165'), N2 (155'), N3 (140'), N4 (115'), N5 (90').",
      "Cấu trúc chia môn con: Từ vựng (文字・語彙), Ngữ pháp - Đọc hiểu (文法・読解), Nghe hiểu (聴解).",
      "Quy chế điểm sàn kép: Không được liệt bất kỳ môn nào dưới 19/60 điểm.",
      "6,692 câu hỏi thật kèm bài đọc, file âm thanh MP3 và giải thích chi tiết tiếng Việt.",
    ],
    facts: [
      { label: "Cấp độ N1", value: "165 phút (Ngôn ngữ + Đọc hiểu 110' · Nghe 55') · Đậu ≥ 100/180" },
      { label: "Cấp độ N2", value: "155 phút (Ngôn ngữ + Đọc hiểu 105' · Nghe 50') · Đậu ≥ 90/180" },
      { label: "Cấp độ N3", value: "140 phút (Từ vựng 30' · Ngữ pháp+Đọc 70' · Nghe 40') · Đậu ≥ 95/180" },
      { label: "Cấp độ N4", value: "115 phút (Từ vựng 25' · Ngữ pháp+Đọc 55' · Nghe 35') · Đậu ≥ 90/180" },
      { label: "Cấp độ N5", value: "90 phút (Từ vựng 20' · Ngữ pháp+Đọc 40' · Nghe 30') · Đậu ≥ 80/180" },
      { label: "Quy chế điểm liệt", value: "Mỗi phần bắt buộc ≥ 19/60 điểm" },
      { label: "Thang điểm chuẩn", value: "Thang điểm IRT tối đa 180 điểm" },
      { label: "Tần suất thi", value: "2 lần/năm (Tháng 7 và Tháng 12)" },
    ],
    levels: [
      { id: "n1", label: "N1", examMinutes: 165, passNote: "Tổng ≥ 100/180 · mỗi môn ≥ 19/60", passPct: 56, sortOrder: 1 },
      { id: "n2", label: "N2", examMinutes: 155, passNote: "Tổng ≥ 90/180 · mỗi môn ≥ 19/60", passPct: 50, sortOrder: 2 },
      { id: "n3", label: "N3", examMinutes: 140, passNote: "Tổng ≥ 95/180 · mỗi môn ≥ 19/60", passPct: 53, sortOrder: 3 },
      { id: "n4", label: "N4", examMinutes: 115, passNote: "Tổng ≥ 90/180 · mỗi môn ≥ 19/60", passPct: 50, sortOrder: 4 },
      { id: "n5", label: "N5", examMinutes: 90, passNote: "Tổng ≥ 80/180 · mỗi môn ≥ 19/60", passPct: 44, sortOrder: 5 },
    ],
    stages: findExisting("jlpt").stages || [],
    sort_order: 1,
  },

  // 2. IELTS
  {
    id: "ielts",
    short_name: "IELTS",
    short_label: "Academic & General",
    full_name: "International English Language Testing System (IELTS)",
    tagline: "4 Kỹ năng: Listening (40' · 40 câu), Reading (60' · 40 câu), Writing (60' · 2 bài), Speaking (11–14').",
    description:
      "Hệ thống kiểm tra tiếng Anh quốc tế uy tín hàng đầu thế giới do Cambridge Assessment English, IDP và British Council đồng sáng lập. Kiểm tra toàn diện 4 kỹ năng Nghe, Đọc, Viết, Nói trên thang điểm Band 0 đến 9.0.",
    icon_name: "globe",
    provider: "Cambridge · IDP · British Council",
    level: "Band 6.0 – 9.0",
    exam_minutes: 174,
    pass_note: "Mục tiêu chuẩn Band ≥ 6.5 / 9.0 (Overal 4 kỹ năng)",
    pass_pct: 72,
    accent_hue: 215,
    available: true,
    sample_data: false,
    bilingual: false,
    highlights: [
      "161 bộ đề thi IELTS: Cambridge IELTS C10–C21 và Actual Tests.",
      "Listening: 40 phút, 4 Sections có audio MP3 trực tiếp và transcript.",
      "Reading: 60 phút, 3 Passages học thuật dài 800–1200 từ/bài.",
      "Writing: 60 phút (Task 1 mô tả biểu đồ 150 từ, Task 2 nghị luận 250 từ).",
      "Speaking: 11–14 phút phỏng vấn trực tiếp 3 phần.",
    ],
    facts: [
      { label: "Phần Listening", value: "40 câu (40 phút · 4 Sections có Audio)" },
      { label: "Phần Reading", value: "40 câu (60 phút · 3 Passages học thuật)" },
      { label: "Phần Writing", value: "2 bài (60 phút · Task 1 150 từ + Task 2 250 từ)" },
      { label: "Phần Speaking", value: "11 – 14 phút (Phỏng vấn trực tiếp 3 Parts)" },
      { label: "Thang điểm chuẩn", value: "Band 0.0 – 9.0 (làm tròn 0.5)" },
      { label: "Tổng thời gian", value: "~174 phút (~2 giờ 54 phút)" },
      { label: "Bộ đề nguồn", value: "Cambridge IELTS C10–C21 & Actual Tests" },
    ],
    levels: [
      { id: "listening", label: "Listening (40 câu · 40')", examMinutes: 40, passNote: "Band 6.5+ (27/40 câu)", passPct: 68, sortOrder: 1 },
      { id: "reading", label: "Reading (40 câu · 60')", examMinutes: 60, passNote: "Band 6.5+ (27/40 câu)", passPct: 68, sortOrder: 2 },
      { id: "writing", label: "Writing (2 Tasks · 60')", examMinutes: 60, passNote: "Task 1 (150 từ) & Task 2 (250 từ)", passPct: 70, sortOrder: 3 },
      { id: "speaking", label: "Speaking (3 Parts · 14')", examMinutes: 14, passNote: "Part 1, Part 2, Part 3", passPct: 70, sortOrder: 4 },
    ],
    stages: findExisting("ielts").stages || [],
    sort_order: 2,
  },

  // 3. TOEIC
  {
    id: "toeic",
    short_name: "TOEIC",
    short_label: "Listening & Reading",
    full_name: "Test of English for International Communication (TOEIC)",
    tagline: "Chuẩn ETS: 200 câu / 120 phút (Listening 100 câu · 45' + Reading 100 câu · 75'), thang điểm 10–990.",
    description:
      "Bài thi tiếng Anh giao tiếp quốc tế dành cho người đi làm do Viện Khảo thí Giáo dục Hoa Kỳ (ETS) phát triển. Cấu trúc gồm 200 câu trắc nghiệm (100 câu Nghe Part 1–4 trong 45 phút và 100 câu Đọc Part 5–7 trong 75 phút), thi liên tục trong 2 giờ.",
    icon_name: "award",
    provider: "ETS · IIG Vietnam",
    level: "Target 450 – 990+",
    exam_minutes: 120,
    pass_note: "Mục tiêu phổ biến ≥ 650 / 990 điểm",
    pass_pct: 65,
    accent_hue: 175,
    available: true,
    sample_data: false,
    bilingual: false,
    highlights: [
      "40 bộ đề thi TOEIC chuẩn format ETS mới nhất (Parroto Practice Vol 1, TOEIC 2026).",
      "Listening (45'): Part 1 (6 câu ảnh), Part 2 (25 câu hỏi đáp), Part 3 (39 câu hội thoại), Part 4 (30 câu độc thoại).",
      "Reading (75'): Part 5 (30 câu điền từ), Part 6 (16 câu đoạn văn), Part 7 (54 câu đọc hiểu đơn/kép/ba).",
      "Thang điểm chuẩn 10–990 điểm (Listening 5–495, Reading 5–495), không trừ điểm câu sai.",
    ],
    facts: [
      { label: "Part 1: Photographs", value: "6 câu (Xem tranh chọn câu mô tả đúng)" },
      { label: "Part 2: Question-Response", value: "25 câu (3 lựa chọn A-B-C)" },
      { label: "Part 3: Conversations", value: "39 câu (13 đoạn hội thoại × 3 câu)" },
      { label: "Part 4: Talks", value: "30 câu (10 bài độc thoại × 3 câu)" },
      { label: "Part 5: Incomplete Sentences", value: "30 câu (Điền từ/ngữ pháp vào câu)" },
      { label: "Part 6: Text Completion", value: "16 câu (4 đoạn văn × 4 câu)" },
      { label: "Part 7: Reading Comprehension", value: "54 câu (29 câu đơn + 25 câu đoạn kép/ba)" },
      { label: "Tổng thời gian & Số câu", value: "120 phút · 200 câu (không nghỉ giữa giờ)" },
      { label: "Thang tính điểm", value: "10 – 990 điểm (Listening 5–495 · Reading 5–495)" },
    ],
    levels: [
      { id: "listening", label: "Listening (Part 1-4 · 100 câu · 45')", examMinutes: 45, passNote: "Mục tiêu ≥ 350/495", passPct: 70, sortOrder: 1 },
      { id: "reading", label: "Reading (Part 5-7 · 100 câu · 75')", examMinutes: 75, passNote: "Mục tiêu ≥ 300/495", passPct: 60, sortOrder: 2 },
    ],
    stages: findExisting("toeic").stages || [],
    sort_order: 3,
  },

  // 4. AWS SAA-C03
  {
    id: "aws",
    short_name: "AWS SAA",
    short_label: "SAA-C03",
    full_name: "AWS Certified Solutions Architect – Associate (SAA-C03)",
    tagline: "65 câu / 130 phút · Đậu ≥ 720/1000 điểm · Thiết kế kiến trúc đám mây AWS bảo mật, tối ưu chi phí.",
    description:
      "Chứng chỉ kiến trúc sư giải pháp đám mây AWS cấp Associate hàng đầu ngành CNTT. Đánh giá toàn diện năng lực thiết kế hệ thống tối ưu chi phí, hiệu năng cao, độ sẵn sàng cao và an toàn bảo mật trên Amazon Web Services.",
    icon_name: "cloud",
    provider: "Amazon Web Services (AWS)",
    level: "Associate",
    exam_minutes: 130,
    pass_note: "Điểm chuẩn ≥ 720 / 1000 điểm",
    pass_pct: 72,
    accent_hue: 38,
    available: true,
    sample_data: false,
    bilingual: true,
    highlights: [
      "904 câu hỏi thi thật sát với đề thi SAA-C03 chính thức.",
      "Hỗ trợ song ngữ tiếng Anh (English) và tiếng Nhật (日本語).",
      "4 Domain khảo thí chuẩn AWS: An toàn (30%), Linh hoạt (26%), Hiệu năng (24%), Chi phí (20%).",
      "Chế độ song ngữ đối chiếu và giải thích chi tiết từng lựa chọn.",
    ],
    facts: [
      { label: "Mã đề thi", value: "SAA-C03 (AWS Solutions Architect Associate)" },
      { label: "Số lượng câu hỏi", value: "65 câu (50 câu tính điểm + 15 câu thử nghiệm)" },
      { label: "Thời gian làm bài", value: "130 phút (thêm 30' ESL nếu không phải bản ngữ Anh)" },
      { label: "Dạng câu hỏi", value: "Trắc nghiệm 1 đáp án đúng & Chọn nhiều đáp án đúng" },
      { label: "Thang điểm & Điểm đậu", value: "Thang điểm 100–1000 · Điểm đậu ≥ 720" },
      { label: "Domain 1: Bảo mật", value: "30% (Design Secure Architectures)" },
      { label: "Domain 2: Linh hoạt", value: "26% (Design Resilient Architectures)" },
      { label: "Domain 3: Hiệu năng cao", value: "24% (Design High-Performing Architectures)" },
      { label: "Domain 4: Tối ưu chi phí", value: "20% (Design Cost-Optimized Architectures)" },
    ],
    levels: [],
    stages: findExisting("aws").stages || [],
    sort_order: 4,
  },

  // 5. AP (IPA Nhật Bản)
  {
    id: "ap",
    short_name: "AP",
    short_label: "応用情報",
    full_name: "Kỹ sư Công nghệ Thông tin Ứng dụng (AP - 応用情報技術者)",
    tagline: "Buổi sáng: 80 câu trắc nghiệm (150') · Buổi chiều: 5 bài tự luận chuyên sâu (150') · Đậu ≥ 60/100 mỗi buổi.",
    description:
      "Kỳ thi kỹ sư CNTT ứng dụng cấp quốc gia do IPA (Bộ Kinh tế, Thương mại và Công nghiệp Nhật Bản) tổ chức. Đánh giá năng lực thiết kế hệ thống, an toàn thông tin, quản lý dự án và chiến lược kinh doanh CNTT cấp độ 3 theo chuẩn ITSS.",
    icon_name: "cpu",
    provider: "IPA Nhật Bản (METI)",
    level: "ITSS Level 3 (Ứng dụng)",
    exam_minutes: 300,
    pass_note: "Đạt đồng thời cả 2 buổi: Sáng ≥ 60/100 điểm VÀ Chiều ≥ 60/100 điểm",
    pass_pct: 60,
    accent_hue: 200,
    available: true,
    sample_data: false,
    bilingual: false,
    highlights: [
      "Kỳ thi kỹ sư CNTT quốc gia cấp 3 theo chuẩn ITSS Nhật Bản.",
      "Buổi sáng (午前): 80 câu trắc nghiệm 4 lựa chọn (150 phút).",
      "Buổi chiều (午後): 5 bài tự luận tình huống dài (150 phút).",
      "Quy chế đậu kép: Bắt buộc đạt ≥ 60/100 ở cả 2 buổi sáng và chiều.",
    ],
    facts: [
      { label: "Buổi sáng (午前)", value: "80 câu trắc nghiệm / 150 phút (Công nghệ, Quản lý, Chiến lược)" },
      { label: "Buổi chiều (午後)", value: "5 câu tự luận tình huống / 150 phút (1 câu Bảo mật bắt buộc + chọn 4/10 câu)" },
      { label: "Tổng thời gian thi", value: "300 phút (5 giờ thi chia 2 buổi sáng và chiều)" },
      { label: "Chuẩn đậu chính thức", value: "Sáng ≥ 60/100 điểm VÀ Chiều ≥ 60/100 điểm" },
      { label: "Tần suất tổ chức", value: "2 lần/năm (Tháng 4 và Tháng 10)" },
    ],
    levels: [],
    stages: findExisting("ap").stages || [
      { id: "morning", name: "Buổi sáng (午前 - 80 câu)", durationMinutes: 150, kind: "mc-test", questionCount: 80 },
      { id: "afternoon", name: "Buổi chiều (午後 - 5 câu tự luận)", durationMinutes: 150, kind: "essay-test", questionCount: 5 },
    ],
    sort_order: 5,
  },

  // 6. FE (IPA Nhật Bản)
  {
    id: "fe",
    short_name: "FE",
    short_label: "基本情報",
    full_name: "Kỹ sư Công nghệ Thông tin Cơ bản (FE - 基本情報技術者)",
    tagline: "CBT quanh năm: Khoa A (60 câu · 90') + Khoa B (20 câu Thuật toán/Bảo mật · 100') · Đậu ≥ 600/1000.",
    description:
      "Kỳ thi kỹ sư CNTT cơ bản cấp quốc gia do IPA Nhật Bản tổ chức theo hình thức thi máy tính CBT quanh năm. Đánh giá kiến thức nền tảng CNTT ở Khoa A và kỹ năng tư duy thuật toán, an toàn thông tin ở Khoa B.",
    icon_name: "terminal",
    provider: "IPA Nhật Bản (METI)",
    level: "ITSS Level 2 (Cơ bản)",
    exam_minutes: 190,
    pass_note: "Đạt đồng thời: Khoa A ≥ 600/1000 VÀ Khoa B ≥ 600/1000 điểm",
    pass_pct: 60,
    accent_hue: 150,
    available: true,
    sample_data: false,
    bilingual: false,
    highlights: [
      "Kỳ thi CBT máy tính tổ chức quanh năm theo chuẩn mới nhất của IPA.",
      "Khoa A (科目A): 60 câu trắc nghiệm kiến thức tổng quát CNTT (90 phút).",
      "Khoa B (科目B): 20 câu tình huống (16 câu lập trình giả mã/thuật toán + 4 câu an toàn thông tin) (100 phút).",
      "Chuẩn đậu kép: Cả 2 phần đều phải đạt ≥ 600/1000 điểm quy đổi.",
    ],
    facts: [
      { label: "Khoa A (科目A)", value: "60 câu trắc nghiệm 4 lựa chọn / 90 phút (Kiến thức cơ bản CNTT)" },
      { label: "Khoa B (科目B)", value: "20 câu / 100 phút (16 câu Thuật toán/Giả mã + 4 câu Bảo mật)" },
      { label: "Tổng thời gian làm bài", value: "190 phút (Khoa A 90' + Khoa B 100')" },
      { label: "Chuẩn đậu chính thức", value: "Khoa A ≥ 600/1000 VÀ Khoa B ≥ 600/1000 điểm" },
      { label: "Hình thức thi", value: "Thi trên máy tính CBT quanh năm tại các trung tâm khảo thí" },
    ],
    levels: [],
    stages: findExisting("fe").stages || [
      { id: "subject-a", name: "Khoa A (科目A - 60 câu)", durationMinutes: 90, kind: "mc-test", questionCount: 60 },
      { id: "subject-b", name: "Khoa B (科目B - 20 câu)", durationMinutes: 100, kind: "mc-test", questionCount: 20 },
    ],
    sort_order: 6,
  },

  // 7. HSK (汉语水平考试 1-6)
  {
    id: "hsk",
    short_name: "HSK",
    short_label: "HSK 1 → 6",
    full_name: "Hanyu Shuiping Kaoshi (Kỳ thi Năng lực Hán ngữ)",
    tagline: "Chuẩn quốc tế CTI/Hanban: 6 Cấp độ HSK 1–6 (Nghe, Đọc, Viết) · Thang điểm 200–300 · Đậu ≥ 60%.",
    description:
      "Kỳ thi chuẩn hóa quốc tế đánh giá năng lực tiếng Trung dành cho người không sử dụng tiếng Trung là tiếng mẹ đẻ do Trung tâm Khảo thí Quốc tế Trung Quốc (CTI) tổ chức. Gồm 6 cấp độ từ HSK 1 (sơ cấp) đến HSK 6 (cao cấp).",
    icon_name: "book",
    provider: "CTI · Hanban (Trung Quốc)",
    level: "6 Cấp độ HSK 1 → 6",
    exam_minutes: 140,
    pass_note: "Tổng điểm ≥ 60% (HSK 1-2 ≥ 120/200, HSK 3-6 ≥ 180/300)",
    pass_pct: 60,
    accent_hue: 350,
    available: true,
    sample_data: false,
    bilingual: false,
    highlights: [
      "Đầy đủ 6 cấp độ chuẩn HSK 1 đến HSK 6.",
      "Cấu trúc thi: Nghe (听力), Đọc hiểu (阅读) và Viết (书写, HSK 3–6).",
      "Thang điểm 200 điểm (HSK 1-2) và 300 điểm (HSK 3-6), chuẩn đậu ≥ 60%.",
    ],
    facts: [
      { label: "HSK 1", value: "40 câu / 40 phút (Nghe 20 câu · Đọc 20 câu) · Đậu ≥ 120/200" },
      { label: "HSK 2", value: "60 câu / 55 phút (Nghe 35 câu · Đọc 25 câu) · Đậu ≥ 120/200" },
      { label: "HSK 3", value: "80 câu / 90 phút (Nghe 40 · Đọc 30 · Viết 10) · Đậu ≥ 180/300" },
      { label: "HSK 4", value: "100 câu / 105 phút (Nghe 45 · Đọc 40 · Viết 15) · Đậu ≥ 180/300" },
      { label: "HSK 5", value: "100 câu / 125 phút (Nghe 45 · Đọc 45 · Viết 10) · Đậu ≥ 180/300" },
      { label: "HSK 6", value: "101 câu / 140 phút (Nghe 50 · Đọc 50 · Tóm tắt 1000 chữ) · Đậu ≥ 180/300" },
    ],
    levels: [
      { id: "hsk1", label: "HSK 1", examMinutes: 40, passNote: "Tổng ≥ 120/200", passPct: 60, sortOrder: 1 },
      { id: "hsk2", label: "HSK 2", examMinutes: 55, passNote: "Tổng ≥ 120/200", passPct: 60, sortOrder: 2 },
      { id: "hsk3", label: "HSK 3", examMinutes: 90, passNote: "Tổng ≥ 180/300", passPct: 60, sortOrder: 3 },
      { id: "hsk4", label: "HSK 4", examMinutes: 105, passNote: "Tổng ≥ 180/300", passPct: 60, sortOrder: 4 },
      { id: "hsk5", label: "HSK 5", examMinutes: 125, passNote: "Tổng ≥ 180/300", passPct: 60, sortOrder: 5 },
      { id: "hsk6", label: "HSK 6", examMinutes: 140, passNote: "Tổng ≥ 180/300", passPct: 60, sortOrder: 6 },
    ],
    stages: [
      { id: "hsk-de-1", name: "Đề thi mô phỏng HSK Chuẩn 1", durationMinutes: 90, kind: "mc-test", questionCount: 80 },
    ],
    sort_order: 7,
  },

  // 8. BOKI (Kế toán Nhật Bản JCCI)
  {
    id: "boki",
    short_name: "BOKI",
    short_label: "日商簿記",
    full_name: "Nissho Boki (Kỳ thi Kế toán Thương mại & Công nghiệp Nhật Bản)",
    tagline: "Chuẩn JCCI: 3級 (60' · Kế toán thương mại), 2級 (90' · 5 bài), 1級 (180' · 4 môn) · Đậu ≥ 70%.",
    description:
      "Kỳ thi kế toán thương mại và công nghiệp danh giá của Phòng Thương mại và Công nghiệp Nhật Bản (JCCI). Đánh giá kỹ năng hạch toán kế toán (仕訳), sổ sách, lập báo cáo tài chính và tính giá thành sản phẩm doanh nghiệp.",
    icon_name: "barChart",
    provider: "JCCI Nhật Bản",
    level: "3 Cấp độ 3級 → 1級",
    exam_minutes: 180,
    pass_note: "Đạt ≥ 70% tổng điểm (1級 bắt buộc mỗi môn ≥ 40%, không có môn liệt)",
    pass_pct: 70,
    accent_hue: 160,
    available: true,
    sample_data: false,
    bilingual: false,
    highlights: [
      "Chuẩn kế toán doanh nghiệp Nhật Bản theo quy chuẩn JCCI.",
      "3級: Kế toán thương mại doanh nghiệp nhỏ (60 phút · CBT/Giấy).",
      "2級: 5 bài kế toán thương mại & kế toán công nghiệp (90 phút).",
      "1級: 4 môn Kế toán thương mại, Kế toán học, Kế toán công nghiệp, Tính giá thành (180 phút).",
    ],
    facts: [
      { label: "Boki 3級", value: "Kế toán thương mại doanh nghiệp nhỏ (60 phút) · Đậu ≥ 70%" },
      { label: "Boki 2級", value: "5 bài (3 bài Thương mại + 2 bài Công nghiệp · 90 phút) · Đậu ≥ 70%" },
      { label: "Boki 1級", value: "4 môn / 180 phút (Sáng 90' + Chiều 90') · Đậu ≥ 70% & mỗi môn ≥ 40%" },
      { label: "Hình thức thi", value: "Thi máy CBT (2級/3級 quanh năm) & Thi giấy (3 đợt/năm)" },
    ],
    levels: [
      { id: "boki3", label: "Boki 3級", examMinutes: 60, passNote: "Đậu ≥ 70%", passPct: 70, sortOrder: 1 },
      { id: "boki2", label: "Boki 2級", examMinutes: 90, passNote: "Đậu ≥ 70%", passPct: 70, sortOrder: 2 },
      { id: "boki1", label: "Boki 1級", examMinutes: 180, passNote: "Tổng ≥ 70% VÀ mỗi môn ≥ 40%", passPct: 70, sortOrder: 3 },
    ],
    stages: [
      { id: "boki-de-1", name: "Đề luyện thi Boki 3級 Chuẩn", durationMinutes: 60, kind: "mc-test", questionCount: 20 },
    ],
    sort_order: 8,
  },

  // 9. PMP (Project Management Professional)
  {
    id: "pmp",
    short_name: "PMP",
    short_label: "Quản lý Dự án",
    full_name: "Project Management Professional (PMP - PMI)",
    tagline: "180 câu / 230 phút · 3 Domain: People (42%), Process (50%), Business Environment (8%) · Agile & Predictive.",
    description:
      "Chứng chỉ quản lý dự án chuyên nghiệp tiêu chuẩn vàng quốc tế do Viện Quản lý Dự án Hoa Kỳ (PMI) cấp. Đánh giá năng lực lãnh đạo đội ngũ, quy trình thực thi dự án và chiến lược môi trường kinh doanh kết hợp cả mô hình Agile, Hybrid và Waterfall.",
    icon_name: "users",
    provider: "PMI (Project Management Institute)",
    level: "Professional (Chuyên gia)",
    exam_minutes: 230,
    pass_note: "Đạt chuẩn Target / Above Target theo chuẩn đánh giá PMI",
    pass_pct: 70,
    accent_hue: 280,
    available: true,
    sample_data: false,
    bilingual: false,
    highlights: [
      "Tiêu chuẩn vàng quốc tế về quản lý dự án chuyên nghiệp của PMI.",
      "Tổng 180 câu hỏi tình huống trong 230 phút (3 giờ 50 phút).",
      "Tỷ trọng khảo thí: People (42%), Process (50%), Business Environment (8%).",
      "50% câu hỏi về phương pháp Agile/Hybrid và 50% phương pháp truyền thống Waterfall.",
    ],
    facts: [
      { label: "Tổng số câu & Thời gian", value: "180 câu / 230 phút (175 câu tính điểm + 5 câu thử nghiệm)" },
      { label: "Domain 1: People", value: "42% (~74 câu: Lãnh đạo, giải quyết xung đột, xây dựng team)" },
      { label: "Domain 2: Process", value: "50% (~87 câu: Phạm vi, tiến độ, chi phí, rủi ro, chất lượng)" },
      { label: "Domain 3: Business", value: "8% (~14 câu: Chiến lược, tuân thủ, giá trị kinh doanh)" },
      { label: "Dạng câu hỏi", value: "Trắc nghiệm 1/nhiều đáp án, Matching nối cặp, Hotspot, Điền khuyết" },
      { label: "Nghỉ giải lao", value: "2 lần nghỉ 10 phút tùy chọn" },
    ],
    levels: [],
    stages: [
      { id: "pmp-mock-1", name: "Đề thi mô phỏng PMP 180 câu", durationMinutes: 230, kind: "mc-test", questionCount: 180 },
    ],
    sort_order: 9,
  },

  // 10. Tokutei Ginou (特定技能)
  {
    id: "tokutei",
    short_name: "Tokutei",
    short_label: "特定技能",
    full_name: "Tokutei Ginou (Kỳ thi Kỹ năng Đặc định Nhật Bản)",
    tagline: "19 Ngành nghề: Tiếng Nhật (JFT-Basic/JLPT N4) + Đề thi kỹ năng chuyên ngành (Lý thuyết & Thực hành).",
    description:
      "Hệ thống khảo thí kỹ năng nghề đặc định làm việc tại Nhật Bản theo 19 ngành nghề được cấp phép. Đòi hỏi ứng viên vượt qua 2 kỳ thi độc lập: Tiếng Nhật giao tiếp (JFT-Basic hoặc JLPT N4 trở lên) và Kỳ thi kiểm tra kỹ năng nghiệp vụ chuyên ngành tương đương Kỹ năng cấp 3 quốc gia Nhật Bản.",
    icon_name: "target",
    provider: "Bộ Tư pháp & Các Hiệp hội Ngành nghề Nhật Bản",
    level: "Kỹ năng đặc định số 1 & 2",
    exam_minutes: 60,
    pass_note: "Đạt Tiếng Nhật (JFT-Basic/N4) VÀ Đạt Kỹ năng chuyên ngành ≥ 65%",
    pass_pct: 65,
    accent_hue: 15,
    available: true,
    sample_data: false,
    bilingual: true,
    highlights: [
      "Hệ thống khảo thí visa kỹ năng đặc định Nhật Bản theo 19 ngành nghề.",
      "Điều kiện 1: Tiếng Nhật JFT-Basic (~60' CBT) hoặc JLPT N4 trở lên.",
      "Điều kiện 2: Thi kỹ năng nghề (Lý thuyết vệ sinh/kỹ thuật + Thực hành tình huống, đậu ≥ 65%).",
      "Các ngành mũi nhọn: Nông nghiệp, Ẩm thực (外食業), Khách sạn (宿泊), Điều dưỡng (介護), Xây dựng.",
    ],
    facts: [
      { label: "Kỳ thi tiếng Nhật", value: "JFT-Basic (~60 phút CBT) hoặc JLPT N4 trở lên" },
      { label: "Ngành Ẩm thực (外食業)", value: "30 câu Lý thuyết + 15 câu Thực hành (Đậu ≥ 65%)" },
      { label: "Ngành Nông nghiệp (農業)", value: "~70 câu / 60 phút (Tiếng Nhật hiện trường + Kỹ thuật nông nghiệp)" },
      { label: "Ngành Điều dưỡng (介護)", value: "Bắt buộc thêm Kỳ thi tiếng Nhật điều dưỡng chuyên ngành" },
      { label: "Miễn thi", value: "Miễn cả 2 kỳ nếu đã hoàn thành Thực tập sinh số 2 (技能実習2号)" },
    ],
    levels: [
      { id: "gaishoku", label: "Ẩm thực (外食業)", examMinutes: 60, passNote: "Lý thuyết & Thực hành ≥ 65%", passPct: 65, sortOrder: 1 },
      { id: "nougyou", label: "Nông nghiệp (農業)", examMinutes: 60, passNote: "Lý thuyết & Tiếng Nhật hiện trường ≥ 65%", passPct: 65, sortOrder: 2 },
      { id: "kaigo", label: "Điều dưỡng (介護)", examMinutes: 60, passNote: "Kỹ năng & Tiếng Nhật điều dưỡng", passPct: 65, sortOrder: 3 },
      { id: "hotel", label: "Khách sạn (宿泊)", examMinutes: 60, passNote: "Nghiệp vụ lưu trú ≥ 65%", passPct: 65, sortOrder: 4 },
    ],
    stages: [
      { id: "tokutei-gaishoku-1", name: "Đề thi Kỹ năng Ẩm thực (外食業) Số 1", durationMinutes: 60, kind: "mc-test", questionCount: 45 },
    ],
    sort_order: 10,
  },
];

async function main() {
  console.log("📐 ĐỒNG BỘ CẤU TRÚC 10 CHỨNG CHỈ THEO SPEC CHUẨN XÁC...\n");

  // 1. Lưu seed/modules.json
  writeFileSync(modulesJsonPath, JSON.stringify(allModules, null, 2), "utf8");
  console.log(`✅ Đã cập nhật seed/modules.json với 10 chứng chỉ:`);
  allModules.forEach((m) => console.log(`  - [${m.id}] ${m.fullName}`));

  // 2. Nạp exam_modules lên Supabase
  console.log("\n🚀 Đang đồng bộ lên bảng exam_modules trên Supabase...");
  await upsert("exam_modules", allModules, "id");
  console.log("🎉 ĐÃ ĐỒNG BỘ THÀNH CÔNG 100% CẤU TRÚC CHỨNG CHỈ LÊN SUPABASE!");
}

main().catch((err) => {
  console.error("❌ Lỗi:", err.message);
  process.exit(1);
});
