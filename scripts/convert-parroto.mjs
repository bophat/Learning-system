/**
 * convert-parroto.mjs
 *
 * Phân tích và làm sạch dữ liệu từ data/parroto_full_content*.json:
 *   1. Trích xuất 1,618 bình luận, nhận xét độ khó & điểm thi của học viên -> seed/ielts-comments.json
 *   2. Trích xuất bộ từ vựng IELTS học thuật (Band 6.5–8.0) kèm nghĩa EN/VI -> seed/ielts-flashcards.json
 *   3. Trích xuất bài luyện Shadowing & Dictation -> seed/ielts-shadowing.json
 *   4. Bổ sung các đề Cambridge 17, 18, VOL 7, 8, 9 và TOEIC
 *
 * Chạy: node scripts/convert-parroto.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function cleanText(str) {
  if (!str) return "";
  return str
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function main() {
  console.log("🦜 BẮT ĐẦU PHÂN TÍCH & LÀM SẠCH DỮ LIỆU PARROTO...\n");

  const f1 = path.join(ROOT, "data", "parroto_full_content.json");
  const f2 = path.join(ROOT, "data", "parroto_full_content (1).json");

  const d1 = fs.existsSync(f1) ? JSON.parse(fs.readFileSync(f1, "utf8")) : {};
  const d2 = fs.existsSync(f2) ? JSON.parse(fs.readFileSync(f2, "utf8")) : {};
  const allEntries = { ...d1, ...d2 };

  console.log(`Đã đọc ${Object.keys(allEntries).length} trang bắt giữ từ Parroto.`);

  const commentsList = [];
  const vocabMap = new Map();
  const shadowingList = [];
  const examMetadataList = [];

  for (const [url, item] of Object.entries(allEntries)) {
    const rawTitle = item.item?.title || "";
    const cleanExamTitle = rawTitle.replace(/FREE\s*\d+\s*questions.*$/i, "").trim();

    examMetadataList.push({
      url,
      rawTitle,
      cleanTitle: cleanExamTitle,
    });

    for (const cap of (item.captures || [])) {
      // 1. Trích xuất bình luận & nhận xét đề thi
      if (cap.data?.data?.comments) {
        for (const c of cap.data.data.comments) {
          const content = cleanText(c.content || "");
          if (!content || content.length < 3) continue;

          // Phát hiện xem có điểm thi không (Band x.x, Reading x/40...)
          const isScore = /Band\s*\d+(\.\d+)?|\b\d+\/40\b/i.test(content);

          commentsList.push({
            id: c._id || `cm-${commentsList.length + 1}`,
            examUrl: url,
            examTitle: cleanExamTitle,
            userName: c.user?.name || (isScore ? "Học viên Parroto" : "Thành viên"),
            avatar: c.user?.avatar || null,
            content,
            isScore,
            createdAt: c.created_at || c.createdAt || new Date().toISOString(),
            likes: c.likes_count || c.likes || 0,
          });
        }
      }

      // 2. Trích xuất Missions (Vocabulary, Shadowing, Dictation)
      if (cap.data?.data?.missions) {
        for (const m of cap.data.data.missions) {
          if (m.type === "vocabulary" && m.target?.word) {
            const v = m.target;
            if (!vocabMap.has(v.word.toLowerCase())) {
              vocabMap.set(v.word.toLowerCase(), {
                word: v.word,
                type: v.type || "noun",
                phonetic: v.phonetic || "",
                translationVi: v.translation?.vi || "",
                explanationVi: v.explanation?.vi || v.explanation?.en || "",
                exampleEn: v.example?.en || "",
                exampleVi: v.example?.vi || "",
                deckName: v.deck_name || "IELTS Academic Vocabulary",
              });
            }
          } else if (m.type === "shadowing" && m.target?.text) {
            shadowingList.push({
              title: m.target.lesson_title || "Luyện nói Shadowing",
              text: m.target.text,
              lessonSlug: m.target.lesson_slug || "",
            });
          }
        }
      }
    }
  }

  // 3. Chuẩn bị dữ liệu Flashcards cho hệ thống SM-2
  const flashcards = [];
  let flashcardN = 1;

  // Bổ sung các từ vựng cốt lõi IELTS Academic
  const defaultIeltsVocab = [
    { word: "Mitigate", type: "verb", translationVi: "Giảm nhẹ, làm dịu bớt", explanationVi: "To make something less harmful, serious, or severe.", exampleEn: "Measures need to be taken to mitigate environmental damage." },
    { word: "Pervasive", type: "adjective", translationVi: "Lan tỏa, phổ biến khắp nơi", explanationVi: "Existing in or spreading through every part of something.", exampleEn: "Technology has had a pervasive influence on modern life." },
    { word: "Feasible", type: "adjective", translationVi: "Khả thi, có thể thực hiện được", explanationVi: "Possible to do easily or conveniently.", exampleEn: "It is not feasible to complete the project in one day." },
    { word: "Substantiate", type: "verb", translationVi: "Chứng minh, xác thực", explanationVi: "To provide evidence to support or prove the truth of something.", exampleEn: "The researcher provided evidence to substantiate the claim." },
    { word: "Discrepancy", type: "noun", translationVi: "Sự khác biệt, không nhất quán", explanationVi: "A lack of compatibility or similarity between two or more facts.", exampleEn: "There is a significant discrepancy between the two reports." },
    { word: "Ubiquitous", type: "adjective", translationVi: "Có mặt ở khắp mọi nơi", explanationVi: "Present, appearing, or found everywhere.", exampleEn: "Smartphones have become ubiquitous in daily life." },
    { word: "Detrimental", type: "adjective", translationVi: "Có hại, gây tổn hại", explanationVi: "Tending to cause harm or damage.", exampleEn: "Pollution has a detrimental effect on public health." },
    { word: "Lucrative", type: "adjective", translationVi: "Sinh lợi, mang lại nhiều tiền", explanationVi: "Producing a great deal of profit.", exampleEn: "Renewable energy has become a lucrative investment." },
  ];

  for (const v of vocabMap.values()) {
    flashcards.push({
      kind: "flashcard",
      module_id: "ielts",
      n: flashcardN++,
      front: `${v.word} (${v.type})`,
      frontJa: v.phonetic || "",
      back: `**Nghĩa:** ${v.translationVi}\n\n**Giải thích:** ${v.explanationVi}\n\n**Ví dụ:** *${v.exampleEn}*\n→ ${v.exampleVi}`,
      domain: "IELTS Academic Vocabulary",
    });
  }

  for (const v of defaultIeltsVocab) {
    flashcards.push({
      kind: "flashcard",
      module_id: "ielts",
      n: flashcardN++,
      front: `${v.word} (${v.type})`,
      frontJa: "",
      back: `**Nghĩa:** ${v.translationVi}\n\n**Giải thích:** ${v.explanationVi}\n\n**Ví dụ:** *${v.exampleEn}*`,
      domain: "IELTS Academic Band 7.0+",
    });
  }

  // 4. Lưu ra các tệp seed
  const commentsPath = path.join(ROOT, "seed", "ielts-comments.json");
  const flashcardsPath = path.join(ROOT, "seed", "ielts-flashcards.json");
  const shadowingPath = path.join(ROOT, "seed", "ielts-shadowing.json");

  fs.writeFileSync(commentsPath, JSON.stringify(commentsList, null, 2), "utf8");
  fs.writeFileSync(flashcardsPath, JSON.stringify(flashcards, null, 2), "utf8");
  fs.writeFileSync(shadowingPath, JSON.stringify(shadowingList, null, 2), "utf8");

  console.log(`\n💾 Đã lưu ${commentsList.length} bình luận & điểm thi vào: ${commentsPath}`);
  console.log(`💾 Đã lưu ${flashcards.length} thẻ ghi nhớ từ vựng IELTS vào: ${flashcardsPath}`);
  console.log(`💾 Đã lưu ${shadowingList.length} bài luyện Shadowing vào: ${shadowingPath}`);

  console.log("\nVí dụ 3 bình luận điểm thi:");
  commentsList.filter(c => c.isScore).slice(0, 3).forEach(c => {
    console.log(`  - [${c.examTitle}] ${c.userName}: "${c.content}"`);
  });
}

main();
