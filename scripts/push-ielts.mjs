/**
 * push-ielts.mjs
 *
 * Nạp module IELTS với tên đề thi Cambridge & Actual Tests chuẩn lên Supabase
 *
 * Chạy: node scripts/push-ielts.mjs
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { select, upsert, remove } from "./rest.mjs";

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
  console.log("🇬🇧 CẬP NHẬT TIÊU ĐỀ BỘ ĐỀ IELTS VÀO SUPABASE\n");

  const qPath = path.join(ROOT, "seed", "ielts-questions.json");
  const sPath = path.join(ROOT, "seed", "ielts-stages.json");
  if (!existsSync(qPath) || !existsSync(sPath)) {
    console.error("❌ Thiếu tệp seed/ielts-questions.json hoặc seed/ielts-stages.json");
    process.exit(1);
  }

  const rawQuestions = JSON.parse(readFileSync(qPath, "utf8"));
  const stages = JSON.parse(readFileSync(sPath, "utf8"));

  const ieltsModule = {
    id: "ielts",
    short_name: "IELTS",
    short_label: "Academic",
    full_name: "International English Language Testing System (IELTS)",
    tagline: "161 bộ đề thi IELTS: 52 đề Reading (Cambridge C10–C21) & 103 đề Listening kèm Audio.",
    description:
      "Luyện thi chứng chỉ tiếng Anh quốc tế IELTS Academic & General. Toàn bộ các bộ đề thi Cambridge từ Cam 10 đến Cam 21 và các đề Actual Tests, đầy đủ bài đọc dài học thuật và file âm thanh MP3 luyện nghe từng phần.",
    icon_name: "globe",
    provider: "Cambridge · IDP · British Council",
    level: "Band 6.0 – 9.0",
    exam_minutes: 160,
    pass_note: "Band ≥ 6.5 / 9.0",
    pass_pct: 70,
    accent_hue: 215,
    available: true,
    sample_data: false,
    bilingual: false,
    highlights: [
      "161 bộ đề thi IELTS: 52 đề Reading và 103 đề Listening.",
      "Đầy đủ bài đọc Cambridge từ Cam 10 đến Cam 21 và Actual Tests.",
      "File âm thanh MP3 trực tiếp cho từng bài nghe kèm transcript.",
    ],
    facts: [
      { label: "Phần Reading", value: "52 bộ đề (3 bài đọc/đề · 60 phút)" },
      { label: "Phần Listening", value: "103 bộ đề (4 phần nghe có Audio MP3 · 40 phút)" },
      { label: "Bộ đề nguồn", value: "Cambridge IELTS C10–C21 & Actual Tests" },
      { label: "Điểm mục tiêu", value: "Band 6.5 – 9.0" },
      { label: "Tổng số đề thi", value: "161 bộ đề" },
    ],
    stages,
    levels: [
      {
        id: "reading",
        label: "Reading",
        examMinutes: 60,
        passNote: "Band 6.5+ (27/40)",
        passPct: 68,
        sortOrder: 1,
        questionCount: rawQuestions.filter((q) => q.level_id === "reading").length,
      },
      {
        id: "listening",
        label: "Listening",
        examMinutes: 40,
        passNote: "Band 6.5+ (27/40)",
        passPct: 68,
        sortOrder: 2,
        questionCount: rawQuestions.filter((q) => q.level_id === "listening").length,
      },
      {
        id: "writing",
        label: "Writing",
        examMinutes: 60,
        passNote: "Task 1 & Task 2",
        passPct: 70,
        sortOrder: 3,
        questionCount: rawQuestions.filter((q) => q.level_id === "writing").length,
      },
      {
        id: "speaking",
        label: "Speaking",
        examMinutes: 15,
        passNote: "Part 1, 2, 3",
        passPct: 70,
        sortOrder: 4,
        questionCount: rawQuestions.filter((q) => q.level_id === "speaking").length,
      },
    ],
    sort_order: 3,
  };

  // 1. Upsert module ielts
  console.log("1️⃣   Cập nhật module IELTS với danh sách tên đề chuẩn...");
  await upsert("exam_modules", [ieltsModule], "id");
  console.log("     ✅ Đã cập nhật xong exam_modules");

  // 2. Nạp câu hỏi
  console.log(`2️⃣   Nạp ${rawQuestions.length} câu hỏi / bài đọc / audio IELTS...`);
  await remove("questions", "module_id=eq.ielts").catch(() => {});
  await chunkedUpsert(rawQuestions);
  console.log("     ✅ Đã nạp xong questions");

  // 3. Đồng bộ seed/modules.json
  const modulesJsonPath = path.join(ROOT, "seed", "modules.json");
  if (existsSync(modulesJsonPath)) {
    const modules = JSON.parse(readFileSync(modulesJsonPath, "utf8"));
    const filtered = modules.filter((m) => m.id !== "ielts");
    filtered.push(ieltsModule);
    filtered.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    writeFileSync(modulesJsonPath, JSON.stringify(filtered, null, 2), "utf8");
    console.log("3️⃣   Đã đồng bộ seed/modules.json");
  }

  console.log("\n🎉 HOÀN TẤT! Đã cập nhật 161 tên đề thi IELTS chuẩn đẹp.");
}

main().catch((err) => {
  console.error(`\n❌ Lỗi: ${err.message}`);
  process.exit(1);
});
