/**
 * push-all-jlpt.mjs
 *
 * Đẩy toàn bộ dữ liệu JLPT (N1, N2, N3, N4, N5) lên Supabase:
 *   - exam_modules (metadata, stages)
 *   - questions (câu hỏi, options, đáp án, bài đọc, lời thoại, audio, giải thích)
 *
 * Chạy tất cả: node scripts/push-all-jlpt.mjs
 * Chạy 1 cấp:  node scripts/push-all-jlpt.mjs n2
 * Xoá câu cũ:  node scripts/push-all-jlpt.mjs --reset
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { select, upsert, remove } from "./rest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const reset = process.argv.includes("--reset");
const filterArg = process.argv.find((a) => !a.startsWith("--") && a !== process.argv[0] && a !== process.argv[1]);
const CHUNK = 400;

const MODULE_DEFS = [
  {
    id: "jlpt-n1",
    level: "n1",
    short_name: "JLPT",
    short_label: "N1",
    full_name: "Năng lực Tiếng Nhật — Cấp độ N1",
    tagline: "1916 câu từ 19 đề thi thật JLPT-N1 (2014–2024), đầy đủ giải thích tiếng Việt.",
    description:
      "Ngân hàng câu hỏi JLPT-N1 tổng hợp từ các đề thi chính thức kỳ 7 và 12 từ năm 2014 đến 2024. " +
      "Mỗi kỳ thi là một stage riêng, bao gồm phần Từ vựng & Chữ Hán, Ngữ pháp, Đọc hiểu và Nghe hiểu. " +
      "Toàn bộ câu hỏi có đáp án và giải thích tiếng Việt.",
    icon_name: "language",
    provider: "Japan Foundation · JEES",
    exam_minutes: 170,
    pass_note: "Tổng ≥ 100/180 · mỗi phần ≥ 19/60",
    pass_pct: 56,
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
      { label: "Phần 3", value: "Nghe hiểu (có audio)" },
      { label: "Tổng câu hỏi", value: "1916 câu (19 đề thật)" },
      { label: "Giai đoạn", value: "2014–2024" },
      { label: "Điểm đậu N1", value: "Tổng ≥ 100/180 + từng phần ≥ 19/60" },
    ],
    seedFile: "seed/jlpt-n1-questions.json",
    sort_order: 5,
  },
  {
    id: "jlpt-n2",
    level: "n2",
    short_name: "JLPT",
    short_label: "N2",
    full_name: "Năng lực Tiếng Nhật — Cấp độ N2",
    tagline: "2081 câu từ 20 đề thi thật JLPT-N2 (2014–2024), đầy đủ giải thích tiếng Việt.",
    description:
      "Ngân hàng câu hỏi JLPT-N2 tổng hợp từ các đề thi chính thức kỳ 7 và 12 từ năm 2014 đến 2024. " +
      "Mỗi kỳ thi là một stage riêng, gồm Từ vựng & Chữ Hán, Ngữ pháp, Đọc hiểu và Nghe hiểu.",
    icon_name: "language",
    provider: "Japan Foundation · JEES",
    exam_minutes: 155,
    pass_note: "Tổng ≥ 90/180 · mỗi phần ≥ 19/60",
    pass_pct: 50,
    accent_hue: 348,
    available: true,
    sample_data: false,
    bilingual: false,
    highlights: [
      "2081 câu hỏi thật từ 20 kỳ thi JLPT-N2 (2014–2024).",
      "Đáp án chuẩn xác 100% cùng giải thích chi tiết.",
      "Hỗ trợ luyện tập theo kỳ thi và làm bài trắc nghiệm tính giờ.",
    ],
    facts: [
      { label: "Phần 1", value: "Từ vựng & Chữ Hán" },
      { label: "Phần 2", value: "Ngữ pháp & Đọc hiểu" },
      { label: "Phần 3", value: "Nghe hiểu (có audio)" },
      { label: "Tổng câu hỏi", value: "2081 câu (20 đề thật)" },
      { label: "Giai đoạn", value: "2014–2024" },
      { label: "Điểm đậu N2", value: "Tổng ≥ 90/180 + từng phần ≥ 19/60" },
    ],
    seedFile: "seed/jlpt-n2-questions.json",
    sort_order: 6,
  },
  {
    id: "jlpt-n3",
    level: "n3",
    short_name: "JLPT",
    short_label: "N3",
    full_name: "Năng lực Tiếng Nhật — Cấp độ N3",
    tagline: "1799 câu từ 18 đề thi thật JLPT-N3 (2015–2024), đầy đủ giải thích tiếng Việt.",
    description:
      "Ngân hàng câu hỏi JLPT-N3 tổng hợp từ các đề thi chính thức từ năm 2015 đến 2024. " +
      "Mỗi kỳ thi là một stage riêng biệt, hỗ trợ học Từ vựng, Ngữ pháp, Đọc hiểu và Nghe hiểu.",
    icon_name: "language",
    provider: "Japan Foundation · JEES",
    exam_minutes: 140,
    pass_note: "Tổng ≥ 95/180 · mỗi phần ≥ 19/60",
    pass_pct: 53,
    accent_hue: 348,
    available: true,
    sample_data: false,
    bilingual: false,
    highlights: [
      "1799 câu hỏi thật từ 18 kỳ thi JLPT-N3 (2015–2024).",
      "Đáp án chuẩn xác 100%, có audio và bài đọc đầy đủ.",
      "Luyện tập chấm ngay từng câu hoặc làm bài thi thử theo thời gian thật.",
    ],
    facts: [
      { label: "Phần 1", value: "Từ vựng & Chữ Hán" },
      { label: "Phần 2", value: "Ngữ pháp & Đọc hiểu" },
      { label: "Phần 3", value: "Nghe hiểu (có audio)" },
      { label: "Tổng câu hỏi", value: "1799 câu (18 đề thật)" },
      { label: "Giai đoạn", value: "2015–2024" },
      { label: "Điểm đậu N3", value: "Tổng ≥ 95/180 + từng phần ≥ 19/60" },
    ],
    seedFile: "seed/jlpt-n3-questions.json",
    sort_order: 7,
  },
  {
    id: "jlpt-n4",
    level: "n4",
    short_name: "JLPT",
    short_label: "N4",
    full_name: "Năng lực Tiếng Nhật — Cấp độ N4",
    tagline: "477 câu hỏi JLPT-N4 từ 7 bộ đề thi trắc nghiệm chuẩn.",
    description:
      "Ngân hàng câu hỏi JLPT-N4 gồm 7 bộ đề thi mẫu và đề chuẩn, bao gồm Từ vựng, Ngữ pháp, Đọc hiểu và Nghe hiểu.",
    icon_name: "language",
    provider: "Japan Foundation · JEES",
    exam_minutes: 125,
    pass_note: "Tổng ≥ 90/180 · mỗi phần ≥ 19/60",
    pass_pct: 50,
    accent_hue: 348,
    available: true,
    sample_data: false,
    bilingual: false,
    highlights: [
      "477 câu hỏi từ 7 bộ đề thi JLPT-N4.",
      "Đầy đủ đáp án 100%, có audio cho phần nghe hiểu.",
      "Phù hợp ôn tập từ vựng và ngữ pháp trình độ sơ cấp.",
    ],
    facts: [
      { label: "Phần 1", value: "Từ vựng & Chữ Hán" },
      { label: "Phần 2", value: "Ngữ pháp & Đọc hiểu" },
      { label: "Phần 3", value: "Nghe hiểu" },
      { label: "Tổng câu hỏi", value: "477 câu (7 đề)" },
      { label: "Điểm đậu N4", value: "Tổng ≥ 90/180 + từng phần ≥ 19/60" },
    ],
    seedFile: "seed/jlpt-n4-questions.json",
    sort_order: 8,
  },
  {
    id: "jlpt-n5",
    level: "n5",
    short_name: "JLPT",
    short_label: "N5",
    full_name: "Năng lực Tiếng Nhật — Cấp độ N5",
    tagline: "419 câu hỏi JLPT-N5 từ 11 bộ đề ôn tập nền tảng.",
    description:
      "Ngân hàng câu hỏi JLPT-N5 gồm 11 bộ đề ôn tập nền tảng tiếng Nhật nhập môn, đầy đủ từ vựng Hiragana, Katakana, Kanji cơ bản và bài nghe.",
    icon_name: "language",
    provider: "Japan Foundation · JEES",
    exam_minutes: 105,
    pass_note: "Tổng ≥ 80/180 · mỗi phần ≥ 19/60",
    pass_pct: 44,
    accent_hue: 348,
    available: true,
    sample_data: false,
    bilingual: false,
    highlights: [
      "419 câu hỏi từ 11 bộ đề ôn tập JLPT-N5.",
      "Đầy đủ đáp án, hình ảnh và audio nghe hiểu.",
      "Nền tảng vững chắc cho người mới bắt đầu học tiếng Nhật.",
    ],
    facts: [
      { label: "Phần 1", value: "Từ vựng & Chữ Hán sơ cấp" },
      { label: "Phần 2", value: "Ngữ pháp & Đọc hiểu sơ cấp" },
      { label: "Phần 3", value: "Nghe hiểu sơ cấp" },
      { label: "Tổng câu hỏi", value: "419 câu (11 đề)" },
      { label: "Điểm đậu N5", value: "Tổng ≥ 80/180 + từng phần ≥ 19/60" },
    ],
    seedFile: "seed/jlpt-n5-questions.json",
    sort_order: 9,
  },
];

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

async function main() {
  console.log("🇯🇵 BẮT ĐẦU IMPORT TOÀN BỘ JLPT (N1 → N5) LÊN SUPABASE\n");

  const targetDefs = filterArg
    ? MODULE_DEFS.filter((d) => d.id === filterArg || d.level === filterArg.toLowerCase() || d.id === `jlpt-${filterArg.toLowerCase()}`)
    : MODULE_DEFS;

  if (targetDefs.length === 0) {
    console.error(`❌ Không tìm thấy module nào khớp với "${filterArg}". Danh sách: n1, n2, n3, n4, n5`);
    process.exit(1);
  }

  // 1. Chuẩn bị modules payload kèm stages được trích xuất từ seed questions
  const modulesToUpsert = [];

  for (const def of targetDefs) {
    const seedPath = path.join(ROOT, def.seedFile);
    if (!existsSync(seedPath)) {
      console.warn(`⚠️ Không tìm thấy file seed: ${def.seedFile} — hãy chạy convert-jlpt-all.mjs trước!`);
      continue;
    }

    const rawQuestions = JSON.parse(readFileSync(seedPath, "utf8"));

    // Gom stages từ câu hỏi
    const stageMap = new Map();
    for (const q of rawQuestions) {
      if (!stageMap.has(q.stage_id)) {
        stageMap.set(q.stage_id, 0);
      }
      stageMap.set(q.stage_id, stageMap.get(q.stage_id) + 1);
    }

    const stages = Array.from(stageMap.entries()).map(([id, count]) => {
      // Đặt tên đẹp cho stage
      let name = id;
      const m = id.match(/(\d{4})-(\d{2})$/);
      if (m) name = `${def.short_label} ${m[2]}/${m[1]}`;
      const deM = id.match(/de-(\d+)$/i);
      if (deM) name = `${def.short_label} Đề ${deM[1]}`;
      const otM = id.match(/on-tap-(\d+)$/i);
      if (otM) name = `${def.short_label} Ôn tập ${otM[1]}`;

      return {
        id,
        name,
        durationMinutes: def.exam_minutes,
        kind: "mc-test",
        questionCount: count,
      };
    });

    const moduleRecord = {
      id: def.id,
      short_name: def.short_name,
      short_label: def.short_label,
      full_name: def.full_name,
      tagline: def.tagline,
      description: def.description,
      icon_name: def.icon_name,
      provider: def.provider,
      level: def.level.toUpperCase(),
      exam_minutes: def.exam_minutes,
      pass_note: def.pass_note,
      pass_pct: def.pass_pct,
      accent_hue: def.accent_hue,
      available: true,
      sample_data: false,
      bilingual: false,
      highlights: def.highlights,
      facts: def.facts,
      stages,
      sort_order: def.sort_order,
    };

    modulesToUpsert.push(moduleRecord);
  }

  // 2. Upsert exam_modules lên Supabase
  console.log(`1️⃣   Upsert ${modulesToUpsert.length} modules vào exam_modules...`);
  await upsert("exam_modules", modulesToUpsert, "id");
  console.log(`     ✅ Đã cập nhật các module: ${modulesToUpsert.map((m) => m.id).join(", ")}\n`);

  // 3. Upsert câu hỏi cho từng module
  let totalUploaded = 0;
  for (const def of targetDefs) {
    const seedPath = path.join(ROOT, def.seedFile);
    if (!existsSync(seedPath)) continue;

    const rawRows = JSON.parse(readFileSync(seedPath, "utf8"));
    const rows = rawRows.map(normalize);

    console.log(`2️⃣   [${def.id.toUpperCase()}] Nạp ${rows.length} câu hỏi...`);

    if (reset) {
      console.log(`     Đang xoá câu cũ của module ${def.id}...`);
      await remove("questions", `module_id=eq.${def.id}`);
      console.log("     ✅ Đã xoá");
    }

    await chunkedUpsert(rows);
    console.log(`     ✅ Hoàn tất ${def.id} (${rows.length} câu)\n`);
    totalUploaded += rows.length;
  }

  // 4. Cập nhật lại seed/modules.json để đồng bộ local
  const currentModulesJsonPath = path.join(ROOT, "seed", "modules.json");
  if (existsSync(currentModulesJsonPath)) {
    const currentModules = JSON.parse(readFileSync(currentModulesJsonPath, "utf8"));
    const mergedMap = new Map();
    for (const m of currentModules) mergedMap.set(m.id, m);
    for (const m of modulesToUpsert) mergedMap.set(m.id, m);
    writeFileSync(currentModulesJsonPath, JSON.stringify(Array.from(mergedMap.values()), null, 2), "utf8");
    console.log("3️⃣   Đã đồng bộ seed/modules.json");
  }

  // 5. Kiểm tra thống kê DB
  console.log("\n4️⃣   Kiểm tra số liệu module_stats trên Supabase:");
  const stats = await select("module_stats");
  console.table(stats);

  console.log(`\n🎉 HOÀN THÀNH TẤT CẢ! Tổng số câu hỏi đã nạp: ${totalUploaded} câu.`);
}

main().catch((err) => {
  console.error(`\n❌ Lỗi: ${err.message}`);
  process.exit(1);
});
