/**
 * convert-corodomo.mjs
 *
 * Đọc file data/corodomo_exams_full.json, chuyển đổi sang định dạng
 * QuestionRowInput của hệ thống ÔnThi:
 *
 *   seed/jlpt-n1-questions.json — 1916 câu đầy đủ bài đọc, lời thoại, đáp án & giải thích.
 *
 * Chạy: node scripts/convert-corodomo.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const MODULE_ID = "jlpt-n1";
const INPUT = path.join(ROOT, "data", "corodomo_exams_full.json");
const OUTPUT = path.join(ROOT, "seed", "jlpt-n1-questions.json");

function labelToStageId(label) {
  const m = label.match(/(\d{2})\s+(\d{4})/);
  if (!m) return label.toLowerCase().replace(/\s+/g, "-");
  return `${MODULE_ID}-${m[2]}-${m[1]}`;
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
  if (!passage && lastLongPassage && (sqQuestion.includes("筆者") || sqQuestion.includes("文章") || sqQuestion.includes("問"))) {
    passage = lastLongPassage;
  }
  if (passage) {
    parts.push(`📖 Bài đọc:\n${passage}`);
  }

  // Lời thoại nghe (Choukai)
  if (script) {
    script = script.replace(/^Tham khảo:\s*/i, "");
  }
  // Nếu subQ này script quá ngắn (chỉ có dòng câu hỏi) và trước đó có bài đàm thoại chung
  if ((!script || script.length < 80) && lastLongScript) {
    script = lastLongScript + (script ? `\n\n${script}` : "");
  }

  if (script) {
    parts.push(`🎧 Lời thoại bài nghe:\n${script}`);
  }

  if (sqQuestion) {
    // Nếu sqQuestion không bị trùng hoàn toàn với script
    if (!script || !script.endsWith(sqQuestion)) {
      parts.push(`❓ Câu hỏi:\n${sqQuestion}`);
    }
  }

  return parts.join("\n\n");
}

console.log("📖  Đọc file nguồn...");
const raw = fs.readFileSync(INPUT, "utf8");
const data = JSON.parse(raw);
const examUrls = Object.keys(data);

console.log(`   Tìm thấy ${examUrls.length} kỳ thi`);

const allRows = [];
const summary = [];

for (const url of examUrls) {
  const exam = data[url];
  const meta = exam.captures[0]?.data?.data;
  if (!meta) continue;

  const stageId = labelToStageId(meta.label);
  const label = meta.label;

  const qCap = exam.captures.find((c) => c.apiUrl && c.apiUrl.includes("question"));
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

    // Tìm xem trong nhóm này có script thoại dài không
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
        module_id: MODULE_ID,
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

  summary.push({ label, stageId, count: stageCount });
  console.log(`   ✅  ${label.padEnd(20)} → ${stageId}  (${stageCount} câu)`);
}

fs.writeFileSync(OUTPUT, JSON.stringify(allRows, null, 2), "utf8");

console.log(`\n✨  Xong! Đã ghi ${allRows.length} câu → ${OUTPUT}`);
console.log(`\n📋  Tóm tắt theo kỳ thi:`);
summary.forEach((s) =>
  console.log(`   ${s.label.padEnd(22)} ${String(s.count).padStart(4)} câu   stage: ${s.stageId}`)
);
console.log(`\n   TỔNG: ${allRows.length} câu`);
