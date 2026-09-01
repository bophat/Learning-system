/**
 * scripts/update-aws-data.mjs
 *
 * Cập nhật toàn bộ 904 câu hỏi AWS SAA-C03 từ file study-guide
 * (bao gồm explanation_vi, explanation_en, explanation_ja, why_vi cho từng option,
 * và toàn bộ đối tượng study phân tích chuyên sâu).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { loadEnv } from "./rest.mjs";

const { url: BASE, key: KEY } = loadEnv();
const SOURCE_FILE = "aws-saa-all-904-questions-study-guide-v2.json";

console.log(`Đang đọc dữ liệu từ ${SOURCE_FILE}...`);
const sourceData = JSON.parse(readFileSync(SOURCE_FILE, "utf8"));
console.log(`Tìm thấy ${sourceData.length} câu hỏi trong file nguồn.`);

function buildMarkdownExplanation(baseExp, study, lang = "vi") {
  if (!study || Object.keys(study).length === 0) return baseExp || "";

  let sections = [];
  if (baseExp && baseExp.trim()) {
    sections.push(baseExp.trim());
  }

  if (lang === "vi") {
    const s1 = study["1_tom_tat_de_bai_va_phan_tich_yeu_cau"] || study.requirement_vi || study.requirement_en;
    const s2 = study["2_giai_thich_dap_an_dung"] || study.key_analysis_vi || study.key_analysis_en;
    const s3 = study["3_cac_dap_an_khac_tai_sao_sai"];
    const s4 = study["4_luu_y"] || study.aws_concept_vi || study.aws_concept_en;
    const s5 = study["5_meo_khi_di_thi_de_nho"] || study.exam_tip_vi || study.exam_tip_en;

    let studyText = "---\n### 📚 Phân tích chi tiết theo AWS SAA Study Guide (v2):";
    if (s1) studyText += `\n\n**1. 💡 Tóm tắt đề bài & Phân tích yêu cầu:**\n${s1}`;
    if (s2) studyText += `\n\n**2. ✅ Giải thích đáp án đúng:**\n${s2}`;
    if (s3) studyText += `\n\n**3. ❌ Tại sao các đáp án khác sai:**\n${s3}`;
    if (s4) studyText += `\n\n**4. ⚠️ Lưu ý quan trọng:**\n${s4}`;
    if (s5) studyText += `\n\n**5. 🎯 Mẹo khi đi thi (Exam Tip):**\n${s5}`;

    sections.push(studyText);
  } else if (lang === "en") {
    const req = study.requirement_en || study["1_tom_tat_de_bai_va_phan_tich_yeu_cau"];
    const keyAnalysis = study.key_analysis_en || study["2_giai_thich_dap_an_dung"];
    const concepts = study.aws_concept_en || study["4_luu_y"];
    const tip = study.exam_tip_en || study["5_meo_khi_di_thi_de_nho"];

    let studyText = "---\n### 📚 AWS SAA Study Guide Breakdown:";
    if (req) studyText += `\n\n**💡 Core Requirement:**\n${req}`;
    if (keyAnalysis) studyText += `\n\n**🔍 Key Architecture Analysis:**\n${keyAnalysis}`;
    if (concepts) studyText += `\n\n**📌 Related AWS Concepts:**\n\`${concepts}\``;
    if (tip) studyText += `\n\n**🎯 Exam Tip:**\n${tip}`;

    sections.push(studyText);
  } else if (lang === "ja") {
    const req = study.requirement_ja || study.requirement_en || study["1_tom_tat_de_bai_va_phan_tich_yeu_cau"];
    const keyAnalysis = study.key_analysis_ja || study.key_analysis_en || study["2_giai_thich_dap_an_dung"];
    const concepts = study.aws_concept_ja || study.aws_concept_en || study["4_luu_y"];
    const tip = study.exam_tip_ja || study.exam_tip_en || study["5_meo_khi_di_thi_de_nho"];

    let studyText = "---\n### 📚 AWS SAA 詳細解説ガイド:";
    if (req) studyText += `\n\n**💡 主要要件:**\n${req}`;
    if (keyAnalysis) studyText += `\n\n**🔍 ポイント分析:**\n${keyAnalysis}`;
    if (concepts) studyText += `\n\n**📌 関連AWS概念:**\n\`${concepts}\``;
    if (tip) studyText += `\n\n**🎯 試験のコツ:**\n${tip}`;

    sections.push(studyText);
  }

  return sections.join("\n\n");
}

// 1. Cập nhật seed/aws-questions.json
const updatedSeed = sourceData.map((item) => {
  const options = (item.options || []).map((o) => ({
    l: o.label,
    en: o.text_en || "",
    ja: o.text_ja || "",
    why: o.why_vi || o.why || o.why_en || "",
    why_en: o.why_en || "",
    why_ja: o.why_ja || "",
    why_vi: o.why_vi || "",
  }));

  const expVi = buildMarkdownExplanation(item.explanation_vi, item.study, "vi");
  const expEn = buildMarkdownExplanation(item.explanation_en, item.study, "en");
  const expJa = buildMarkdownExplanation(item.explanation_ja, item.study, "ja");

  return {
    n: item.n,
    en: item.question_en,
    ja: item.question_ja || "",
    opts: options,
    ans: item.correct_answer,
    multi: item.is_multiple_choice || false,
    explanation: expEn,
    explanation_ja: expJa,
    explanation_vi: expVi,
    study: item.study,
  };
});

writeFileSync("seed/aws-questions.json", JSON.stringify(updatedSeed, null, 2), "utf8");
console.log("✅ Đã cập nhật file local: seed/aws-questions.json");

// 2. Đẩy lên Supabase
function headers() {
  return {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
  };
}

async function updateSupabase() {
  console.log("\n🚀 Bắt đầu cập nhật lên Supabase...");

  // Chuẩn bị danh sách rows
  const dbRows = sourceData.map((item) => {
    const options = (item.options || []).map((o) => ({
      label: o.label,
      en: o.text_en || "",
      ja: o.text_ja || "",
      why: o.why_vi || o.why || o.why_en || "",
      why_en: o.why_en || "",
      why_ja: o.why_ja || "",
      why_vi: o.why_vi || "",
    }));

    const expVi = buildMarkdownExplanation(item.explanation_vi, item.study, "vi");
    const expEn = buildMarkdownExplanation(item.explanation_en, item.study, "en");
    const expJa = buildMarkdownExplanation(item.explanation_ja, item.study, "ja");

    return {
      module_id: "aws",
      level_id: "default",
      stage_id: "exam",
      n: item.n,
      kind: "mc",
      stem_en: item.question_en,
      stem_ja: item.question_ja || "",
      options,
      answer: item.correct_answer,
      multi: item.is_multiple_choice || false,
      domain: "AWS SAA-C03",
      explanation: expEn,
      explanation_ja: expJa,
      explanation_vi: expVi,
      body_format: "markdown",
      payload: { study: item.study },
    };
  });

  const BATCH_SIZE = 50;
  let totalSaved = 0;

  for (let i = 0; i < dbRows.length; i += BATCH_SIZE) {
    const batch = dbRows.slice(i, i + BATCH_SIZE);
    const res = await fetch(`${BASE}/rest/v1/questions?on_conflict=module_id,level_id,stage_id,n`, {
      method: "POST",
      headers: {
        ...headers(),
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(batch),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Lỗi cập nhật lô ${i + 1}-${i + batch.length}: ${res.status} ${errText}`);
    }

    totalSaved += batch.length;
    process.stdout.write(`\rĐã đồng bộ ${totalSaved}/${dbRows.length} câu lên Supabase...`);
  }

  console.log("\n\n🎉 HOÀN TẤT ĐỒNG BỘ 904 CÂU AWS SAA LÊN SUPABASE!");
}

await updateSupabase();
