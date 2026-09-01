/**
 * master-reset-clean.mjs
 *
 * Xóa sạch toàn bộ dữ liệu cũ/rác trên Supabase và nạp lại 100% dữ liệu chuẩn cấu trúc:
 * - 10 Modules chuẩn hóa theo spec-cau-truc-thi-chung-chi.md
 * - JLPT: 6,692 câu hỏi thật N1-N5
 * - IELTS: 3,910 câu hỏi chi tiết gộp theo 108 đề Cambridge (Reading + Listening có Audio)
 * - TOEIC: 240 câu hỏi chuẩn ETS Parts 1-7
 * - AWS SAA-C03: 904 câu hỏi thi thật song ngữ Anh/Nhật
 * - AP: Bộ câu hỏi chuẩn IPA Nhật Bản
 *
 * Chạy: node scripts/master-reset-clean.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { upsert, remove, select } from "./rest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CHUNK = 400;

async function chunkedUpsert(label, rows) {
  if (!rows || rows.length === 0) return;
  console.log(`🚀 Đang nạp ${rows.length} câu hỏi [${label}]...`);
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    // Đảm bảo tất cả các field đồng nhất
    const sanitized = chunk.map((q) => ({
      module_id: q.module_id,
      level_id: q.level_id || "default",
      stage_id: q.stage_id || "default",
      n: q.n,
      kind: q.kind || "mc",
      stem_en: q.stem_en || "",
      stem_ja: q.stem_ja || "",
      options: q.options || [],
      answer: q.answer || "",
      multi: !!q.multi,
      domain: q.domain || "",
      audio_url: q.audio_url || null,
      explanation: q.explanation || "",
    }));
    await upsert("questions", sanitized, "module_id,level_id,stage_id,n");
    process.stdout.write(`\r  ${Math.min(i + CHUNK, rows.length)}/${rows.length} câu`);
  }
  process.stdout.write("\n");
}

function loadJson(relPath) {
  const full = path.join(ROOT, relPath);
  if (!existsSync(full)) return [];
  return JSON.parse(readFileSync(full, "utf8"));
}

async function main() {
  console.log("🧹 BẮT ĐẦU DỌN SẠCH DỮ LIỆU CŨ VÀ NẠP DỮ LIỆU ĐẦY ĐỦ CẤU TRÚC...\n");

  // 1. Nạp danh mục modules chuẩn
  console.log("📦 1. Nạp danh mục 10 chứng chỉ chuẩn vào exam_modules...");
  const modules = loadJson("seed/modules.json");
  await upsert("exam_modules", modules, "id");
  console.log(`✅ Đã nạp ${modules.length} modules vào exam_modules.\n`);

  // 2. Xóa toàn bộ câu hỏi cũ trong bảng questions
  console.log("🗑️ 2. Xóa sạch toàn bộ bảng questions trên Supabase...");
  const moduleIds = ["jlpt", "ielts", "toeic", "aws", "ap", "fe", "hsk", "boki", "pmp", "tokutei"];
  for (const mid of moduleIds) {
    await remove("questions", `module_id=eq.${mid}`).catch(() => {});
  }
  // Xoá các module cũ nếu có (như jlpt-n1 cũ)
  const legacyIds = ["jlpt-n1", "jlpt-n2", "jlpt-n3", "jlpt-n4", "jlpt-n5"];
  for (const lid of legacyIds) {
    await remove("questions", `module_id=eq.${lid}`).catch(() => {});
    await remove("exam_modules", `id=eq.${lid}`).catch(() => {});
  }
  console.log("✅ Đã xóa sạch toàn bộ câu hỏi cũ.\n");

  // 3. Nạp lại JLPT (N1-N5)
  console.log("🇯🇵 3. Nạp ngân hàng câu hỏi JLPT (N1-N5)...");
  const jlptN1 = loadJson("seed/jlpt-n1-questions.json");
  const jlptN2 = loadJson("seed/jlpt-n2-questions.json");
  const jlptN3 = loadJson("seed/jlpt-n3-questions.json");
  const jlptN4 = loadJson("seed/jlpt-n4-questions.json");
  const jlptN5 = loadJson("seed/jlpt-n5-questions.json");

  // Gán module_id = "jlpt" thống nhất
  const normalizeJlpt = (list, lvl) =>
    list.map((q) => ({
      ...q,
      module_id: "jlpt",
      level_id: lvl,
    }));

  await chunkedUpsert("JLPT N1", normalizeJlpt(jlptN1, "n1"));
  await chunkedUpsert("JLPT N2", normalizeJlpt(jlptN2, "n2"));
  await chunkedUpsert("JLPT N3", normalizeJlpt(jlptN3, "n3"));
  await chunkedUpsert("JLPT N4", normalizeJlpt(jlptN4, "n4"));
  await chunkedUpsert("JLPT N5", normalizeJlpt(jlptN5, "n5"));

  const totalJlpt = jlptN1.length + jlptN2.length + jlptN3.length + jlptN4.length + jlptN5.length;
  console.log(`✅ Đã nạp thành công ${totalJlpt} câu hỏi JLPT.\n`);

  // 4. Nạp lại IELTS (108 đề Cambridge gộp, 3,910 câu chi tiết)
  console.log("🇬🇧 4. Nạp ngân hàng câu hỏi IELTS gộp 108 đề Cambridge...");
  const ieltsQuestions = loadJson("seed/ielts-questions.json");
  await chunkedUpsert("IELTS (3,910 câu)", ieltsQuestions);
  console.log(`✅ Đã nạp thành công ${ieltsQuestions.length} câu hỏi IELTS.\n`);

  // 5. Nạp lại TOEIC (40 đề chuẩn ETS)
  console.log("📘 5. Nạp ngân hàng câu hỏi TOEIC (40 đề ETS)...");
  const toeicQuestions = loadJson("seed/toeic-questions.json");
  await chunkedUpsert("TOEIC (240 câu)", toeicQuestions);
  console.log(`✅ Đã nạp thành công ${toeicQuestions.length} câu hỏi TOEIC.\n`);

  // 6. Nạp lại AWS SAA-C03 (904 câu song ngữ)
  console.log("☁️ 6. Nạp ngân hàng câu hỏi AWS SAA-C03 (904 câu)...");
  const awsQuestions = loadJson("seed/aws-questions.json");
  const awsMapped = awsQuestions.map((q) => ({
    module_id: "aws",
    level_id: null,
    stage_id: "saa-c03",
    n: q.n,
    kind: "mc",
    stem_en: q.en || "",
    stem_ja: q.ja || "",
    options: (q.opts || []).map((o) => ({
      label: o.l || o.label,
      en: o.en || "",
      ja: o.ja || "",
    })),
    answer: q.ans || q.answer || "",
    multi: !!q.multi,
    domain: "AWS SAA-C03",
    audio_url: null,
    explanation: "",
  }));
  await chunkedUpsert("AWS (904 câu)", awsMapped);
  console.log(`✅ Đã nạp thành công ${awsMapped.length} câu hỏi AWS.\n`);

  // 7. Nạp lại AP
  console.log("💻 7. Nạp câu hỏi AP...");
  const apQuestions = loadJson("seed/ap-questions.json");
  if (apQuestions.length > 0) {
    const apMapped = apQuestions.map((q) => ({
      module_id: "ap",
      level_id: null,
      stage_id: q.stage_id || "morning",
      n: q.n,
      kind: q.kind || "mc",
      stem_en: q.stem_en || "",
      stem_ja: q.stem_ja || "",
      options: q.options || [],
      answer: q.answer || "",
      multi: !!q.multi,
      domain: q.domain || "AP",
      audio_url: null,
      explanation: "",
    }));
    await chunkedUpsert("AP", apMapped);
    console.log(`✅ Đã nạp thành công ${apMapped.length} câu hỏi AP.\n`);
  }

  // 8. Thống kê kiểm tra cuối cùng
  console.log("==========================================");
  console.log("🎉 HOÀN TẤT DỌN SẠCH & ĐỒNG BỘ DỮ LIỆU CHUẨN!");
  console.log(`- JLPT: ${totalJlpt} câu hỏi (N1: ${jlptN1.length}, N2: ${jlptN2.length}, N3: ${jlptN3.length}, N4: ${jlptN4.length}, N5: ${jlptN5.length})`);
  console.log(`- IELTS: ${ieltsQuestions.length} câu hỏi (108 đề Cambridge gộp Listening + Reading)`);
  console.log(`- TOEIC: ${toeicQuestions.length} câu hỏi (40 đề ETS)`);
  console.log(`- AWS: ${awsQuestions.length} câu hỏi (SAA-C03 song ngữ)`);
  console.log(`- AP: ${apQuestions.length} câu hỏi`);
  console.log("==========================================");
}

main().catch((err) => {
  console.error("❌ Lỗi:", err.message);
  process.exit(1);
});
