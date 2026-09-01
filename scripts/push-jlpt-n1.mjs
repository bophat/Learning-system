/**
 * push-jlpt-n1.mjs
 *
 * Đẩy dữ liệu JLPT-N1 (1916 câu, 19 kỳ thi) lên Supabase.
 * Chạy: node scripts/push-jlpt-n1.mjs
 * Xoá câu cũ trước:  node scripts/push-jlpt-n1.mjs --reset
 */

import { readFileSync } from "node:fs";
import { select, upsert, remove } from "./rest.mjs";

const reset = process.argv.includes("--reset");
const CHUNK = 400;

// ─── Module meta ──────────────────────────────────────────────────────────────
// 19 stage IDs từ convert-corodomo.mjs
const STAGES = [
  "jlpt-n1-2024-07","jlpt-n1-2023-12","jlpt-n1-2023-07",
  "jlpt-n1-2022-12","jlpt-n1-2022-07","jlpt-n1-2021-12",
  "jlpt-n1-2021-07","jlpt-n1-2020-12","jlpt-n1-2019-12",
  "jlpt-n1-2019-07","jlpt-n1-2018-12","jlpt-n1-2018-07",
  "jlpt-n1-2017-12","jlpt-n1-2017-07","jlpt-n1-2016-12",
  "jlpt-n1-2016-07","jlpt-n1-2015-12","jlpt-n1-2015-07",
  "jlpt-n1-2014-12",
];

const MODULE = {
  id: "jlpt-n1",
  short_name: "JLPT",
  short_label: "N1",
  full_name: "Năng lực Tiếng Nhật — Cấp độ N1",
  tagline: "1916 câu từ 19 đề thi thật JLPT-N1 (2014–2024), đầy đủ giải thích tiếng Việt.",
  description:
    "Ngân hàng câu hỏi JLPT-N1 tổng hợp từ các đề thi chính thức kỳ 7 và 12 từ năm 2014 đến 2024. " +
    "Mỗi kỳ thi là một stage riêng, bao gồm phần Từ vựng & Chữ Hán, Ngữ pháp & Đọc hiểu. " +
    "Toàn bộ câu hỏi có đáp án và giải thích tiếng Việt.",
  icon_name: "language",
  provider: "Japan Foundation · JEES",
  level: "N1",
  exam_minutes: 170,
  pass_note: "Tổng điểm + ngưỡng từng phần",
  pass_pct: 60,
  accent_hue: 348,
  available: true,
  sample_data: false,
  bilingual: false,
  highlights: [
    "1916 câu hỏi thật từ 19 kỳ thi JLPT-N1 (2014–2024).",
    "Đầy đủ đáp án và giải thích tiếng Việt cho từng câu.",
    "Luyện theo từng kỳ thi hoặc luyện tổng hợp theo phần.",
  ],
  facts: [
    { label: "Phần 1", value: "Từ vựng & Chữ Hán" },
    { label: "Phần 2", value: "Ngữ pháp & Đọc hiểu" },
    { label: "Tổng câu hỏi", value: "1916 câu (19 đề thật)" },
    { label: "Giai đoạn", value: "2014–2024" },
    { label: "Điểm đậu N1", value: "Tổng ≥ 100/180 + từng phần ≥ 19/60" },
  ],
  stages: STAGES.map((id) => {
    // id = "jlpt-n1-2024-07" → name = "07/2024"
    const [, yyyy, mm] = id.match(/(\d{4})-(\d{2})$/);
    return {
      id,
      name: `JLPT-N1 ${mm}/${yyyy}`,
      durationMinutes: 170,
      kind: "mc-test",
      questionCount: 96,
    };
  }),
  sort_order: 5,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function normalize(row) {
  return {
    module_id: row.module_id,
    level_id: row.level_id ?? "",
    stage_id: row.stage_id ?? "exam",
    n: row.n,
    kind: row.kind ?? "mc",
    stem_en: row.stem_en ?? null,
    stem_ja: row.stem_ja ?? null,
    options: row.options ?? [],
    answer: row.answer ?? null,
    multi: !!row.multi,
    domain: row.domain ?? null,
    title: row.title ?? null,
    prompt: row.prompt ?? null,
    sub_questions: row.sub_questions ?? [],
    required: !!row.required,
    explanation: row.explanation ?? null,
    audio_url: row.audio_url ?? null,
  };
}

async function chunkedUpsert(rows) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await upsert("questions", rows.slice(i, i + CHUNK), "module_id,level_id,stage_id,n");
    process.stdout.write(`\r  ${Math.min(i + CHUNK, rows.length)}/${rows.length} câu`);
  }
  process.stdout.write("\n");
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n📚  Push JLPT-N1 → Supabase\n");

  // 1. Upsert module meta
  console.log("1️⃣   Upsert module jlpt-n1 vào exam_modules...");
  await upsert("exam_modules", [MODULE], "id");
  console.log("     ✅ Xong\n");

  // 2. Load câu hỏi đã convert
  const rawRows = JSON.parse(readFileSync("seed/jlpt-n1-questions.json", "utf8"));
  const rows = rawRows.map(normalize);
  console.log(`2️⃣   Nạp ${rows.length} câu hỏi...`);

  // 3. Reset nếu yêu cầu
  if (reset) {
    console.log("     Đang xoá câu cũ của module jlpt-n1...");
    await remove("questions", "module_id=eq.jlpt-n1");
    console.log("     ✅ Đã xoá\n");
  }

  // 4. Push theo batch
  await chunkedUpsert(rows);
  console.log("     ✅ Xong\n");

  // 5. Kiểm tra kết quả
  console.log("3️⃣   Kiểm tra số liệu trên DB...");
  const stats = await select("module_stats");
  const jlptStat = stats.find((s) => s.module_id === "jlpt-n1");
  if (jlptStat) {
    console.log(`     jlpt-n1: ${jlptStat.total} câu · ${jlptStat.with_answer} có đáp án`);
  } else {
    console.log("     ⚠️  Chưa thấy jlpt-n1 trong module_stats (view có thể cần refresh)");
    // Đếm trực tiếp
    const direct = await select("questions", "count", "module_id=eq.jlpt-n1");
    console.log("     Đếm trực tiếp:", direct);
  }

  console.log("\n✨  Hoàn tất! Mở Admin → Tải lại số liệu để thấy cập nhật.\n");
}

main().catch((err) => {
  console.error(`\n❌  Lỗi: ${err.message}\n`);
  process.exit(1);
});
