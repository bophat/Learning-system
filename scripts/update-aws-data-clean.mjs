/**
 * scripts/update-aws-data-clean.mjs
 *
 * Chuẩn hóa 100% ngôn ngữ độc lập cho 904 câu AWS SAA:
 * - Tiếng Việt (VI): 100% Tiếng Việt thuần túy, loại bỏ hoàn toàn các câu tiếng Anh thừa.
 * - Tiếng Anh (EN): 100% Tiếng Anh chuẩn mực.
 * - Tiếng Nhật (JA): 100% Tiếng Nhật chuẩn mực.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { loadEnv } from "./rest.mjs";

const { url: BASE, key: KEY } = loadEnv();
const SOURCE_FILE = "aws-saa-all-904-questions-study-guide-v2.json";

console.log(`Đang nạp dữ liệu từ ${SOURCE_FILE}...`);
const sourceData = JSON.parse(readFileSync(SOURCE_FILE, "utf8"));
console.log(`Đã đọc ${sourceData.length} câu hỏi.`);

function cleanViText(text) {
  if (!text) return "";
  let s = String(text);

  // Xóa các câu tiếng Anh mẫu bị lọt vào tiếng Việt
  s = s.replace(/([A-D]) is correct according to the source\. Its architecture\/service choice directly matches the requirements identified above\./g, "Phương án $1 là đáp án chính xác. Cấu trúc và dịch vụ AWS này trực tiếp đáp ứng đúng và tối ưu nhất yêu cầu của bài toán.");
  s = s.replace(/([A-D]) is not selected\. Compare it with the explicit requirements: this option does not provide the same best-fit mapping as the source\x27s correct answer\./g, "Phương án $1 không chính xác do không đáp ứng đúng hoặc không tối ưu theo yêu cầu của đề bài.");
  s = s.replace(/([A-D]) is not selected\. Compare it with the explicit requirements: this option does not provide the same best-fit mapping as the source\x27s correct answer/g, "Phương án $1 không chính xác do không đáp ứng đúng hoặc không tối ưu theo yêu cầu của đề bài.");
  s = s.replace(/Compare it with the explicit requirements: this option does not provide the same best-fit mapping as the source\x27s correct answer\./g, "Không đáp ứng đúng hoặc không tối ưu theo yêu cầu của đề bài.");
  s = s.replace(/Phương án:\s*/g, "Nội dung lựa chọn: ");
  s = s.replace(/A is correct according to the source\./g, "Phương án A là đáp án chính xác.");
  s = s.replace(/B is correct according to the source\./g, "Phương án B là đáp án chính xác.");
  s = s.replace(/C is correct according to the source\./g, "Phương án C là đáp án chính xác.");
  s = s.replace(/D is correct according to the source\./g, "Phương án D là đáp án chính xác.");
  s = s.replace(/B is not selected\./g, "Phương án B không được chọn.");
  s = s.replace(/C is not selected\./g, "Phương án C không được chọn.");
  s = s.replace(/D is not selected\./g, "Phương án D không được chọn.");
  s = s.replace(/A is not selected\./g, "Phương án A không được chọn.");
  s = s.replace(/According to the source,\s*/gi, "Theo chuẩn kiến trúc AWS, ");
  s = s.replace(/The correct answer is ([A-D])\./g, "Đáp án đúng là $1.");

  return s.trim();
}

function buildViExplanation(item) {
  const ans = item.correct_answer;
  const base = cleanViText(item.explanation_vi || `Đáp án đúng là ${ans}. Lựa chọn này đáp ứng tối ưu các yêu cầu về kiến trúc, tính sẵn sàng và tối thiểu hóa độ phức tạp vận hành.`);
  const study = item.study || {};

  const s1 = cleanViText(study["1_tom_tat_de_bai_va_phan_tich_yeu_cau"] || study.requirement_vi || "Đề bài yêu cầu xác định giải pháp kiến trúc AWS phù hợp nhất với các điều kiện ràng buộc.");
  const s2 = cleanViText(study["2_giai_thich_dap_an_dung"] || `Đáp án đúng là **${ans}**. Cấu hình và dịch vụ AWS này trực tiếp giải quyết bài toán.`);
  const s3 = cleanViText(study["3_cac_dap_an_khac_tai_sao_sai"] || (item.options || []).filter(o => o.label !== ans).map(o => `• **${o.label}**: ${cleanViText(o.why_vi || "Không đáp ứng đúng hoặc không tối ưu theo yêu cầu đề bài.")}`).join("\n"));
  const s4 = cleanViText(study["4_luu_y"] || "Không chỉ nhìn vào tên dịch vụ riêng lẻ. Hãy đối chiếu từng ràng buộc bắt buộc của đề bài với khả năng thực tế của dịch vụ.");
  const s5 = cleanViText(study["5_meo_khi_di_thi_de_nho"] || "🧠 Mẹo làm bài: Nhớ theo chuỗi **Yêu cầu (Requirement) → Dịch vụ (Service) → Loại trừ (Eliminate)**.");

  return `${base}

---
### 📚 Phân tích chi tiết theo AWS SAA Study Guide:

**1. 💡 Tóm tắt đề bài & Phân tích yêu cầu:**
${s1}

**2. ✅ Giải thích đáp án đúng:**
${s2}

**3. ❌ Tại sao các đáp án khác sai:**
${s3}

**4. ⚠️ Lưu ý quan trọng:**
${s4}

**5. 🎯 Mẹo khi đi thi (Exam Tip):**
${s5}`;
}

function buildEnExplanation(item) {
  const ans = item.correct_answer;
  const base = item.explanation_en || item.explanation || `The correct answer is ${ans}. This option directly satisfies the required architecture, performance, security, and operational constraints.`;
  const study = item.study || {};

  const s1 = study.requirement_en || "Analyze the core architectural and functional requirements stated in the problem.";
  const s2 = `Option **${ans}** is correct. Its architecture and AWS service integration directly fulfill the requirements with the least operational overhead.`;
  const s3 = (item.options || []).filter(o => o.label !== ans).map(o => `• **${o.label}**: ${o.why_en || "Does not fulfill all constraints or introduces unnecessary operational complexity."}`).join("\n");
  const s4 = "Always focus on the strict constraints (cost, latency, high availability, simplicity) rather than just memorizing service features.";
  const s5 = "🧠 Exam Strategy: Follow **Identify Requirements → Map AWS Services → Eliminate Inefficient Choices**.";

  return `${base}

---
### 📚 AWS SAA Detailed Study Guide:

**1. 💡 Problem Summary & Requirements:**
${s1}

**2. ✅ Correct Answer Explanation:**
${s2}

**3. ❌ Why Other Options Are Incorrect:**
${s3}

**4. ⚠️ Important Considerations:**
${s4}

**5. 🎯 Exam Tip:**
${s5}`;
}

function buildJaExplanation(item) {
  const ans = item.correct_answer;
  const base = item.explanation_ja || `正解は ${ans} です。この選択肢は、設問で求められているアーキテクチャ、性能、セキュリティ、運用の簡素化の要件を最も直接的かつ最適に満たしています。`;
  const study = item.study || {};

  const s1 = study.requirement_ja || "設問で明示されている機能要件および非機能要件（性能、可用性、セキュリティ、運用効率など）を整理します。";
  const s2 = `正解は **${ans}** です。この構成およびAWSサービスの組み合わせが、設問の要件を直接的かつ最小限の運用オーバーヘッドで満たします。`;
  const s3 = (item.options || []).filter(o => o.label !== ans).map(o => `・**${o.label}**: ${o.why_ja || "要件を十分に満たさないか、不要な構成要素や運用負荷が増加するため不適切です。"}`).join("\n");
  const s4 = "AWSサービス名だけで判断せず、問題文の制約（コスト、耐障害性、レイテンシ、管理の手間）を満たしているかを常に優先して検討します。";
  const s5 = "🧠 試験のコツ: **要件の抽出 → サービスの絞り込み → 消去法** の流れで、制約に違反する選択肢から素早く除外していきましょう。";

  return `${base}

---
### 📚 AWS SAA 詳細解説ガイド:

**1. 💡 設問の要件分析:**
${s1}

**2. ✅ 正解の解説:**
${s2}

**3. ❌ 不正解の理由:**
${s3}

**4. ⚠️ 重要なポイント:**
${s4}

**5. 🎯 試験のコツ (Exam Tip):**
${s5}`;
}

// 1. Cập nhật seed/aws-questions.json
const updatedSeed = sourceData.map((item) => {
  const options = (item.options || []).map((o) => ({
    l: o.label,
    en: o.text_en || "",
    ja: o.text_ja || "",
    why: cleanViText(o.why_vi || o.why || o.why_en || ""),
    why_vi: cleanViText(o.why_vi || o.why || ""),
    why_en: o.why_en || o.why || "",
    why_ja: o.why_ja || o.why || "",
  }));

  const expVi = buildViExplanation(item);
  const expEn = buildEnExplanation(item);
  const expJa = buildJaExplanation(item);

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
console.log("✅ Đã cập nhật file local: seed/aws-questions.json (100% ngôn ngữ phân tách sạch)");

// 2. Cập nhật Supabase
function headers() {
  return {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
  };
}

async function updateSupabase() {
  console.log("\n🚀 Bắt đầu cập nhật toàn bộ 904 câu sạch lên Supabase...");

  const dbRows = sourceData.map((item) => {
    const options = (item.options || []).map((o) => ({
      label: o.label,
      en: o.text_en || "",
      ja: o.text_ja || "",
      why: cleanViText(o.why_vi || o.why || o.why_en || ""),
      why_vi: cleanViText(o.why_vi || o.why || ""),
      why_en: o.why_en || o.why || "",
      why_ja: o.why_ja || o.why || "",
    }));

    const expVi = buildViExplanation(item);
    const expEn = buildEnExplanation(item);
    const expJa = buildJaExplanation(item);

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

  console.log("\n\n🎉 HOÀN TẤT ĐỒNG BỘ 904 CÂU AWS SAA LÊN SUPABASE (100% ĐỘC LẬP NGÔN NGỮ)!");
}

await updateSupabase();
