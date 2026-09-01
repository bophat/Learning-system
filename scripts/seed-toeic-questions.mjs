/**
 * seed-toeic-questions.mjs
 *
 * Tạo các bộ câu hỏi mẫu chuẩn định dạng ETS TOEIC cho 40 đề thi TOEIC
 * (gồm cả Listening Part 1-4 và Reading Part 5-7)
 *
 * Chạy: node scripts/seed-toeic-questions.mjs
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { upsert, remove } from "./rest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CHUNK = 400;

async function chunkedUpsert(rows) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await upsert("questions", rows.slice(i, i + CHUNK), "module_id,level_id,stage_id,n");
    process.stdout.write(`\r  ${Math.min(i + CHUNK, rows.length)}/${rows.length} câu`);
  }
  process.stdout.write("\n");
}

async function main() {
  console.log("📘 TẠO NGÂN HÀNG CÂU HỎI TOEIC CHO 40 BỘ ĐỀ...\n");

  const f1 = path.join(ROOT, "data", "parroto_full_content.json");
  const f2 = path.join(ROOT, "data", "parroto_full_content (1).json");
  const d1 = existsSync(f1) ? JSON.parse(readFileSync(f1, "utf8")) : {};
  const d2 = existsSync(f2) ? JSON.parse(readFileSync(f2, "utf8")) : {};
  const all = { ...d1, ...d2 };

  const stages = [];
  const toeicSeen = new Set();

  for (const [url, item] of Object.entries(all)) {
    if (url.includes("/toeic/")) {
      const slug = url.split("/").pop();
      if (toeicSeen.has(slug)) continue;
      toeicSeen.add(slug);

      const rawTitle = item.item?.title || "";
      const cleanTitle = rawTitle.replace(/FREE\s*\d+\s*questions.*$/i, "").trim() || slug;
      stages.push({ slug, title: cleanTitle });
    }
  }

  const sampleQuestions = [
    {
      part: "Part 5 (Incomplete Sentences)",
      skill: "reading",
      stem: "Ms. Tanaka requested that the budget proposal be submitted _______ Friday afternoon at the latest.",
      options: [
        { label: "A", en: "by", ja: "" },
        { label: "B", en: "at", ja: "" },
        { label: "C", en: "until", ja: "" },
        { label: "D", en: "for", ja: "" },
      ],
      answer: "A",
      explanation: "'By Friday' chỉ mốc thời gian muộn nhất một hành động phải hoàn thành (deadline).",
    },
    {
      part: "Part 5 (Incomplete Sentences)",
      skill: "reading",
      stem: "The new software update will significantly improve the _______ of the data processing system.",
      options: [
        { label: "A", en: "efficient", ja: "" },
        { label: "B", en: "efficiency", ja: "" },
        { label: "C", en: "efficiently", ja: "" },
        { label: "D", en: "efficiencies", ja: "" },
      ],
      answer: "B",
      explanation: "Sau mạo từ 'the' và trước giới từ 'of' cần một danh từ không đếm được chỉ tính hiệu quả ('efficiency').",
    },
    {
      part: "Part 6 (Text Completion)",
      skill: "reading",
      stem: "We are pleased to announce that our annual corporate conference will be held in Da Nang this October. _______ registered attendees will receive a comprehensive schedule next week.",
      options: [
        { label: "A", en: "All", ja: "" },
        { label: "B", en: "Each", ja: "" },
        { label: "C", en: "Every", ja: "" },
        { label: "D", en: "Much", ja: "" },
      ],
      answer: "A",
      explanation: "'All' đi với danh từ số nhiều đếm được 'attendees'.",
    },
    {
      part: "Part 7 (Reading Comprehension)",
      skill: "reading",
      stem: "📖 Memo to all staff:\nPlease be advised that the main cafeteria will undergo renovations from August 1 to August 10. During this period, boxed lunches will be available in Conference Room B on the second floor.\n\nWhat is the purpose of this memo?",
      options: [
        { label: "A", en: "To announce catering services", ja: "" },
        { label: "B", en: "To notify employees about temporary dining arrangements", ja: "" },
        { label: "C", en: "To recruit cafeteria staff", ja: "" },
        { label: "D", en: "To introduce a new company policy", ja: "" },
      ],
      answer: "B",
      explanation: "Mục đích của thông báo là thông tin cho nhân viên về việc sửa nhà ăn và nơi nhận đồ ăn thay thế.",
    },
    {
      part: "Part 1 (Photographs)",
      skill: "listening",
      stem: "🎧 Part 1 - Look at the photograph and choose the statement that best describes what you see.",
      options: [
        { label: "A", en: "A man is presenting data on a whiteboard", ja: "" },
        { label: "B", en: "A woman is taking notes in a notebook", ja: "" },
        { label: "C", en: "They are shaking hands in an office", ja: "" },
        { label: "D", en: "People are exiting the conference room", ja: "" },
      ],
      answer: "A",
      explanation: "Mô tả chính xác hành động người đàn ông đang thuyết trình dữ liệu trên bảng trắng.",
    },
    {
      part: "Part 2 (Question - Response)",
      skill: "listening",
      stem: "🎧 'When will the marketing report be finalized?'",
      options: [
        { label: "A", en: "Yes, I read it yesterday.", ja: "" },
        { label: "B", en: "By the end of the day.", ja: "" },
        { label: "C", en: "In the marketing department.", ja: "" },
        { label: "D", en: "Mr. Johnson wrote it.", ja: "" },
      ],
      answer: "B",
      explanation: "Câu hỏi 'When' (Khi nào) cần câu trả lời về thời gian: 'By the end of the day' (Trước cuối ngày hôm nay).",
    },
  ];

  const questions = [];
  let n = 1;

  for (const st of stages) {
    const stageId = `toeic-${st.slug}`;
    for (let i = 0; i < sampleQuestions.length; i++) {
      const q = sampleQuestions[i];
      questions.push({
        module_id: "toeic",
        level_id: q.skill,
        stage_id: stageId,
        n,
        kind: "mc",
        stem_en: q.stem,
        stem_ja: "",
        options: q.options,
        answer: q.answer,
        multi: false,
        domain: q.part,
        explanation: `${st.title} · ${q.part}: ${q.explanation}`,
      });
      n++;
    }
  }

  const outPath = path.join(ROOT, "seed", "toeic-questions.json");
  writeFileSync(outPath, JSON.stringify(questions, null, 2), "utf8");
  console.log(`💾 Đã tạo ${questions.length} câu hỏi TOEIC vào ${outPath}`);

  console.log("🚀 Đang nạp câu hỏi TOEIC lên Supabase...");
  await remove("questions", "module_id=eq.toeic").catch(() => {});
  await chunkedUpsert(questions);
  console.log("🎉 ĐÃ NẠP XONG TOÀN BỘ CÂU HỎI TOEIC LÊN SUPABASE!");
}

main().catch((e) => {
  console.error("❌ Lỗi:", e.message);
  process.exit(1);
});
