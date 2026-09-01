/**
 * convert-jlpt-all.mjs
 *
 * Chuyển đổi toàn bộ dữ liệu JLPT (N1, N2, N3, N4, N5) từ data/corodomo_exams_full*.json
 * sang định dạng chuẩn của hệ thống ÔnThi:
 *
 *   - seed/jlpt-n1-questions.json
 *   - seed/jlpt-n2-questions.json
 *   - seed/jlpt-n3-questions.json
 *   - seed/jlpt-n4-questions.json
 *   - seed/jlpt-n5-questions.json
 *
 * Chạy: node scripts/convert-jlpt-all.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const CONFIGS = [
  {
    moduleId: "jlpt-n1",
    level: "n1",
    input: path.join(ROOT, "data", "corodomo_exams_full.json"),
    output: path.join(ROOT, "seed", "jlpt-n1-questions.json"),
  },
  {
    moduleId: "jlpt-n2",
    level: "n2",
    input: path.join(ROOT, "data", "corodomo_exams_full (1).json"),
    output: path.join(ROOT, "seed", "jlpt-n2-questions.json"),
  },
  {
    moduleId: "jlpt-n3",
    level: "n3",
    input: path.join(ROOT, "data", "corodomo_exams_full (2).json"),
    output: path.join(ROOT, "seed", "jlpt-n3-questions.json"),
  },
  {
    moduleId: "jlpt-n4",
    level: "n4",
    input: path.join(ROOT, "data", "corodomo_exams_full (3).json"),
    output: path.join(ROOT, "seed", "jlpt-n4-questions.json"),
  },
  {
    moduleId: "jlpt-n5",
    level: "n5",
    input: path.join(ROOT, "data", "corodomo_exams_full (4).json"),
    output: path.join(ROOT, "seed", "jlpt-n5-questions.json"),
  },
];

function labelToStageId(moduleId, label) {
  // VD: "JLPT-N2 07 2024" -> "jlpt-n2-2024-07"
  const m = label.match(/(\d{2})\s+(\d{4})/);
  if (m) return `${moduleId}-${m[2]}-${m[1]}`;

  // VD: "JLPT N4 Đề 7" -> "jlpt-n4-de-7"
  const deMatch = label.match(/đề\s*(\d+)/i);
  if (deMatch) return `${moduleId}-de-${deMatch[1]}`;

  // VD: "JLPT N5 Ôn tập 11" -> "jlpt-n5-on-tap-11"
  const onTapMatch = label.match(/ôn\s*tập\s*(\d+)/i);
  if (onTapMatch) return `${moduleId}-on-tap-${onTapMatch[1]}`;

  return `${moduleId}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function cleanText(str) {
  if (!str) return "";
  return str
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<p[^>]*>/gi, "")
    .replace(/<center[^>]*>/gi, "")
    .replace(/<\/center>/gi, "")
    .replace(/<h[1-6][^>]*>/gi, "")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<u[^>]*>/gi, "「")
    .replace(/<\/u>/gi, "」")
    .replace(/<[^>]*>/gi, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function idToLabel(id) {
  const map = { "1": "A", "2": "B", "3": "C", "4": "D", "5": "E" };
  return map[String(id)] ?? String(id);
}

function getDomain(part, qsetInstr, qsetContent) {
  if (part === 2) return "聴解（Nghe hiểu）";
  const instr = qsetInstr || "";
  if (
    instr.includes("読み方") ||
    instr.includes("漢字") ||
    instr.includes("表記") ||
    instr.includes("言葉") ||
    instr.includes("使い方") ||
    instr.includes("意味")
  ) {
    return "言語知識（文字・語彙）";
  }
  if (instr.includes("文の") || instr.includes("文法") || instr.includes("★")) {
    return "言語知識（文法）";
  }
  if ((qsetContent && qsetContent.length > 40) || instr.includes("文章") || instr.includes("読")) {
    return "読解（Đọc hiểu）";
  }
  return "言語知識";
}

function buildStem(qset, sq, lastLongScript, lastLongPassage) {
  const parts = [];
  const instr = cleanText(qset.question);
  const qsetContent = cleanText(qset.content);
  const sqContent = cleanText(sq.content);
  const sqQuestion = cleanText(sq.question);
  let script = cleanText(sq.script);

  if (instr) parts.push(`【${instr}】`);

  // Bài đọc (Dokkai)
  let passage = sqContent || qsetContent;
  if (!passage && lastLongPassage && (sqQuestion.includes("筆者") || sqQuestion.includes("文章") || sqQuestion.includes("問") || sqQuestion.includes("次"))) {
    passage = lastLongPassage;
  }
  if (passage) {
    parts.push(`📖 Bài đọc:\n${passage}`);
  }

  // Lời thoại nghe (Choukai)
  if (script) {
    script = script.replace(/^Tham khảo:\s*/i, "");
  }
  // Nếu subQ này script quá ngắn và trước đó có bài thoại chung
  if ((!script || script.length < 80) && lastLongScript) {
    script = lastLongScript + (script ? `\n\n${script}` : "");
  }

  if (script) {
    parts.push(`🎧 Lời thoại bài nghe:\n${script}`);
  }

  if (sqQuestion) {
    if (!script || !script.endsWith(sqQuestion)) {
      parts.push(`❓ Câu hỏi:\n${sqQuestion}`);
    }
  }

  return parts.join("\n\n");
}

function convertFile(cfg) {
  console.log(`\n========================================`);
  console.log(`🚀 Đang xử lý ${cfg.moduleId.toUpperCase()} (${cfg.input})...`);

  if (!fs.existsSync(cfg.input)) {
    console.error(`❌ Không tìm thấy file: ${cfg.input}`);
    return { count: 0, stages: [] };
  }

  const raw = fs.readFileSync(cfg.input, "utf8");
  const data = JSON.parse(raw);
  const examUrls = Object.keys(data);

  console.log(`   Tìm thấy ${examUrls.length} bài thi`);

  const allRows = [];
  const stagesMeta = [];

  for (const url of examUrls) {
    const exam = data[url];
    const meta = exam.captures?.[0]?.data?.data;
    const rawLabel = meta?.label || exam.item?.title || url;
    const stageId = labelToStageId(cfg.moduleId, rawLabel);

    const qCap = exam.captures?.find((c) => c.apiUrl && c.apiUrl.includes("question"));
    if (!qCap) continue;

    const sections = qCap.data?.data;
    if (!sections) continue;

    let n = 1;
    let stageCount = 0;
    const qsetList = Object.values(sections).filter(Boolean);

    for (const qset of qsetList) {
      if (!qset || typeof qset !== "object") continue;

      const subQs = Array.isArray(qset.questions) ? qset.questions : [];
      const domain = getDomain(qset.part, qset.question, qset.content);

      let lastLongScript = "";
      let lastLongPassage = cleanText(qset.content);

      for (const sq of subQs) {
        const s = cleanText(sq.script).replace(/^Tham khảo:\s*/i, "");
        if (s.length > 150) {
          lastLongScript = s;
          break;
        }
      }

      for (const sq of subQs) {
        if (!sq) continue;

        const opts = Array.isArray(sq.options) ? sq.options : [];
        if (opts.length === 0) continue;

        const stem = buildStem(qset, sq, lastLongScript, lastLongPassage);

        const options = opts.map((o) => ({
          label: idToLabel(o.id),
          en: cleanText(o.value || ""),
          ja: "",
        }));

        const correctId = String(sq.correctAnswer ?? "");
        const answer = idToLabel(correctId) || null;
        const explanation = cleanText(sq.explanation || "") || undefined;
        const audioUrl = sq.audio || qset.audio || null;

        allRows.push({
          module_id: cfg.moduleId,
          level_id: cfg.level,
          stage_id: stageId,
          n,
          kind: "mc",
          stem_en: stem,
          stem_ja: "",
          options,
          answer,
          multi: false,
          domain,
          audio_url: audioUrl,
          ...(explanation ? { explanation } : {}),
        });

        n++;
        stageCount++;
      }
    }

    stagesMeta.push({
      id: stageId,
      name: rawLabel.replace(/^JLPT-?[Nn]\d\s*/, "").trim() || rawLabel,
      questionCount: stageCount,
    });

    console.log(`   ✓ ${rawLabel.padEnd(25)} → ${stageId} (${stageCount} câu)`);
  }

  fs.writeFileSync(cfg.output, JSON.stringify(allRows, null, 2), "utf8");
  console.log(`💾 Đã ghi ${allRows.length} câu vào ${cfg.output}`);

  return { moduleId: cfg.moduleId, count: allRows.length, stages: stagesMeta };
}

console.log("🔥 BẮT ĐẦU CHUYỂN ĐỔI TOÀN BỘ DỮ LIỆU JLPT (N1 → N5)");
const results = CONFIGS.map(convertFile);

console.log("\n========================================");
console.log("📊 TỔNG KẾT CHUYỂN ĐỔI JLPT:");
let grandTotal = 0;
for (const r of results) {
  grandTotal += r.count;
  console.log(`  - ${r.moduleId.toUpperCase().padEnd(10)}: ${r.count} câu (${r.stages.length} đề thi/stages)`);
}
console.log(`🌟 TỔNG CỘNG: ${grandTotal} CÂU HỎI`);
