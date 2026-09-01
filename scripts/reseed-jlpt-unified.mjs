/**
 * reseed-jlpt-unified.mjs
 *
 * Hợp nhất toàn bộ 5 cấp độ N1–N5 vào duy nhất một module `jlpt`:
 *   - exam_modules: 1 bản ghi `id = "jlpt"`, available = true, có 5 levels (N1..N5) kèm stages của từng cấp.
 *   - questions: 6,692 câu hỏi với `module_id = "jlpt"`, `level_id = "n1"|"n2"|"n3"|"n4"|"n5"`.
 *   - Dọn sạch các module riêng lẻ `jlpt-n1`..`jlpt-n5`.
 *
 * Chạy: node scripts/reseed-jlpt-unified.mjs
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { select, upsert, remove } from "./rest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CHUNK = 400;

const LEVEL_FILES = [
  { level: "n1", file: "seed/jlpt-n1-questions.json", examMinutes: 165, passPct: 56, passNote: "Tổng ≥ 100/180 · mỗi phần ≥ 19/60", sortOrder: 1 },
  { level: "n2", file: "seed/jlpt-n2-questions.json", examMinutes: 155, passPct: 50, passNote: "Tổng ≥ 90/180 · mỗi phần ≥ 19/60", sortOrder: 2 },
  { level: "n3", file: "seed/jlpt-n3-questions.json", examMinutes: 140, passPct: 53, passNote: "Tổng ≥ 95/180 · mỗi phần ≥ 19/60", sortOrder: 3 },
  { level: "n4", file: "seed/jlpt-n4-questions.json", examMinutes: 125, passPct: 50, passNote: "Tổng ≥ 90/180 · mỗi phần ≥ 19/60", sortOrder: 4 },
  { level: "n5", file: "seed/jlpt-n5-questions.json", examMinutes: 105, passPct: 44, passNote: "Tổng ≥ 80/180 · mỗi phần ≥ 19/60", sortOrder: 5 },
];

async function chunkedUpsert(rows) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await upsert("questions", rows.slice(i, i + CHUNK), "module_id,level_id,stage_id,n");
    process.stdout.write(`\r  ${Math.min(i + CHUNK, rows.length)}/${rows.length} câu`);
  }
  process.stdout.write("\n");
}

async function main() {
  console.log("🇯🇵 BẮT ĐẦU TỔNG HỢP JLPT THÀNH 1 MODULE DUY NHẤT (N1 → N5)\n");

  const allQuestions = [];
  const levelsMeta = [];
  const allStages = [];

  for (const lf of LEVEL_FILES) {
    const p = path.join(ROOT, lf.file);
    if (!existsSync(p)) {
      console.error(`❌ Không tìm thấy ${lf.file}`);
      continue;
    }

    const raw = JSON.parse(readFileSync(p, "utf8"));
    const stageMap = new Map();

    for (const q of raw) {
      // Chuẩn hóa stage_id (ví dụ: jlpt-n2-2024-07 -> 2024-07 hoặc giữ nguyên định dạng)
      let stageClean = q.stage_id.replace(new RegExp(`^jlpt-${lf.level}-`, "i"), "");
      if (!stageClean) stageClean = q.stage_id;

      if (!stageMap.has(stageClean)) {
        stageMap.set(stageClean, 0);
      }
      stageMap.set(stageClean, stageMap.get(stageClean) + 1);

      allQuestions.push({
        module_id: "jlpt",
        level_id: lf.level,
        stage_id: stageClean,
        n: q.n,
        kind: "mc",
        stem_en: q.stem_en ?? null,
        stem_ja: q.stem_ja ?? null,
        options: q.options ?? [],
        answer: q.answer ?? null,
        multi: false,
        domain: q.domain ?? null,
        audio_url: q.audio_url ?? null,
        explanation: q.explanation ?? null,
      });
    }

    const stages = Array.from(stageMap.entries()).map(([id, count]) => {
      let name = id;
      const m = id.match(/(\d{4})-(\d{2})$/);
      if (m) name = `Đề thi ${m[2]}/${m[1]}`;
      const deM = id.match(/de-(\d+)$/i);
      if (deM) name = `Đề số ${deM[1]}`;
      const otM = id.match(/on-tap-(\d+)$/i);
      if (otM) name = `Đề ôn tập ${otM[1]}`;

      return {
        id,
        name,
        durationMinutes: lf.examMinutes,
        kind: "mc-test",
        questionCount: count,
      };
    });

    levelsMeta.push({
      id: lf.level,
      label: lf.level.toUpperCase(),
      sortOrder: lf.sortOrder,
      examMinutes: lf.examMinutes,
      passNote: lf.passNote,
      passPct: lf.passPct,
      questionCount: raw.length,
      stages,
    });

    allStages.push(...stages);
    console.log(`  ✓ ${lf.level.toUpperCase()}: ${raw.length} câu (${stages.length} đề thi/stages)`);
  }

  // 1. Tạo 1 bản ghi module jlpt
  const jlptModule = {
    id: "jlpt",
    short_name: "JLPT",
    short_label: "N1 → N5",
    full_name: "Japanese-Language Proficiency Test (Năng lực Nhật ngữ)",
    tagline: "6,692 câu hỏi từ 75 đề thi thật đầy đủ 5 cấp độ từ N5 đến N1 kèm đáp án và giải thích tiếng Việt.",
    description:
      "Kỳ thi năng lực tiếng Nhật quốc tế với 5 cấp độ từ N5 (sơ cấp) đến N1 (cao cấp). " +
      "Chọn cấp độ để vào ngân hàng đề thi chính thức, luyện tập từng phần và thi thử tính giờ.",
    icon_name: "language",
    provider: "Japan Foundation · JEES",
    level: "N5 · N4 · N3 · N2 · N1",
    exam_minutes: 170,
    pass_note: "Tổng điểm + ngưỡng từng phần",
    pass_pct: 50,
    accent_hue: 348,
    available: true,
    sample_data: false,
    bilingual: false,
    highlights: [
      "Ngân hàng 6,692 câu hỏi thật qua các kỳ thi từ 2014 đến 2024.",
      "Chia rõ ràng 5 cấp độ N1, N2, N3, N4, N5.",
      "Đầy đủ bài đọc, lời thoại, file âm thanh nghe hiểu và giải thích tiếng Việt.",
    ],
    facts: [
      { label: "Cấp độ hỗ trợ", value: "N1, N2, N3, N4, N5" },
      { label: "Tổng số đề thi", value: "75 đề thi thật" },
      { label: "Tổng số câu hỏi", value: "6,692 câu" },
      { label: "Các phần thi", value: "Từ vựng, Ngữ pháp, Đọc hiểu, Nghe hiểu" },
      { label: "Điểm đậu", value: "Tổng điểm ≥ ngưỡng + từng phần ≥ 19/60" },
    ],
    stages: allStages,
    levels: levelsMeta,
    sort_order: 2,
  };

  console.log("\n1️⃣   Upsert module JLPT duy nhất vào exam_modules...");
  await upsert("exam_modules", [jlptModule], "id");
  console.log("     ✅ Đã cập nhật module jlpt");

  // 2. Xóa các module lẻ jlpt-n1..n5 nếu có
  console.log("\n2️⃣   Dọn dẹp các module riêng lẻ cũ (jlpt-n1 -> jlpt-n5)...");
  for (let i = 1; i <= 5; i++) {
    await remove("questions", `module_id=eq.jlpt-n${i}`).catch(() => {});
    await remove("exam_modules", `id=eq.jlpt-n${i}`).catch(() => {});
  }
  await remove("questions", "module_id=eq.jlpt").catch(() => {});
  console.log("     ✅ Đã dọn dẹp sạch sẽ");

  // 3. Nạp toàn bộ 6,692 câu hỏi với module_id = 'jlpt'
  console.log(`\n3️⃣   Nạp ${allQuestions.length} câu hỏi vào module jlpt...`);
  await chunkedUpsert(allQuestions);
  console.log("     ✅ Đã nạp thành công 100% câu hỏi");

  // 4. Cập nhật seed/modules.json
  const currentModulesJsonPath = path.join(ROOT, "seed", "modules.json");
  if (existsSync(currentModulesJsonPath)) {
    const currentModules = JSON.parse(readFileSync(currentModulesJsonPath, "utf8"));
    const filtered = currentModules.filter((m) => !m.id.startsWith("jlpt-") && m.id !== "jlpt");
    filtered.push(jlptModule);
    filtered.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    writeFileSync(currentModulesJsonPath, JSON.stringify(filtered, null, 2), "utf8");
    console.log("\n4️⃣   Đã đồng bộ seed/modules.json");
  }

  // 5. Kiểm tra module_stats & level_stats
  console.log("\n5️⃣   Kiểm tra số liệu module_stats trên Supabase:");
  const stats = await select("module_stats");
  console.table(stats);

  console.log("\n6️⃣   Kiểm tra số liệu level_stats trên Supabase:");
  const lStats = await select("level_stats");
  console.table(lStats);

  console.log(`\n🎉 HOÀN TẤT! Module JLPT hiện là 1 chứng chỉ duy nhất với 5 cấp độ N1..N5 và ${allQuestions.length} câu hỏi.`);
}

main().catch((err) => {
  console.error(`\n❌ Lỗi: ${err.message}`);
  process.exit(1);
});
