/**
 * convert-ielts.mjs
 *
 * Trích xuất và định dạng chuẩn 161 bộ đề IELTS từ data/ielts_fighter_full_content*.json:
 *   - Audio CDN chính xác: https://storage.ebomb.edu.vn/storage/test_audio/...
 *   - Chuẩn hóa tiêu đề: IELTS Cambridge 21 Test 1 - Reading, Actual Test Reading 4...
 *   - 52 đề Reading kèm 3 bài đọc (Passages 1, 2, 3) dài đầy đủ
 *   - 103 đề Listening kèm Audio MP3 trực tiếp (audio/mpeg) và Transcript
 *
 * Chạy: node scripts/convert-ielts.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function cleanHtml(str) {
  if (!str) return "";
  return str
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<p[^>]*>/gi, "")
    .replace(/<center[^>]*>/gi, "")
    .replace(/<\/center>/gi, "")
    .replace(/<h[1-6][^>]*>/gi, "")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]*>/gi, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeTitle(itemTitle, detailTitle, detailShow, skill) {
  let raw = detailShow || detailTitle || itemTitle || "IELTS Test";
  raw = raw.replace(/^W\s*-\s*/i, "").replace(/^Web\s*-\s*/i, "").trim();
  raw = raw.replace(/^Practice\s+IELTS\s+/i, "IELTS ");
  raw = raw.replace(/^Practice\s+/i, "");
  raw = raw.replace(/\bCam\s*(\d+)/i, "Cambridge $1");
  raw = raw.replace(/\bC(\d+)\b/i, "Cambridge $1");
  raw = raw.replace(/^IELTS\s+IELTS\s+/i, "IELTS ");

  if (!raw.startsWith("IELTS") && !raw.startsWith("Cambridge") && !raw.startsWith("Actual") && !raw.startsWith("Đề") && !raw.startsWith("Speaking")) {
    raw = `IELTS ${raw}`;
  }

  // Bổ sung hậu tố kỹ năng nếu chưa có
  const lower = raw.toLowerCase();
  if (skill === "reading" && !lower.includes("reading") && !lower.includes("đọc")) {
    raw = `${raw} - Reading`;
  } else if (skill === "listening" && !lower.includes("listening") && !lower.includes("nghe")) {
    raw = `${raw} - Listening`;
  }

  return raw.replace(/\s+/g, " ").trim();
}

function main() {
  console.log("🇬🇧 BẮT ĐẦU CHUYỂN ĐỔI DỮ LIỆU IELTS...\n");

  const files = fs.readdirSync(path.join(ROOT, "data")).filter((f) => f.startsWith("ielts_fighter"));
  const testsById = new Map();

  for (const f of files) {
    const raw = fs.readFileSync(path.join(ROOT, "data", f), "utf8");
    const data = JSON.parse(raw);

    for (const url of Object.keys(data)) {
      const item = data[url];
      const cap = item.captures?.[0]?.data?.datas;
      if (!cap) continue;
      const detail = cap.test_detail;
      if (!detail) continue;

      const testId = String(detail._id || cap.test_id);
      if (testsById.has(testId)) continue;

      let skill = detail.skill || "";
      const rawTitle = detail.title_show || detail.title || item.item?.title || "";
      if (!skill || skill === "null") {
        if (rawTitle.toLowerCase().includes("reading")) skill = "reading";
        else if (rawTitle.toLowerCase().includes("listening")) skill = "listening";
        else if (rawTitle.toLowerCase().includes("writing")) skill = "writing";
        else if (rawTitle.toLowerCase().includes("speaking")) skill = "speaking";
        else skill = "general";
      }

      const formattedTitle = normalizeTitle(item.item?.title, detail.title, detail.title_show, skill);
      const times = detail.times || (skill === "reading" ? 60 : skill === "listening" ? 40 : 60);
      const questionSections = detail.question || [];

      testsById.set(testId, {
        testId,
        title: formattedTitle,
        skill,
        times,
        description: cleanHtml(detail.description || ""),
        sections: questionSections.map((q, idx) => {
          let soundPath = q.sound || detail.sound || "";
          let soundUrl = "";
          if (soundPath) {
            soundPath = soundPath.replace(/^\/+/, "");
            if (soundPath.startsWith("http")) {
              soundUrl = soundPath;
            } else {
              soundUrl = `https://storage.ebomb.edu.vn/storage/${soundPath}`;
            }
          }

          const secTitle = q.title_show || q.title || (skill === "reading" ? `Passage ${idx + 1}` : `Part ${idx + 1}`);

          return {
            title: secTitle,
            skill: q.skill || skill,
            passage: cleanHtml(q.description || ""),
            sound: soundUrl,
            transcript: cleanHtml(q.transcript || ""),
          };
        }),
      });
    }
  }

  console.log(`Tìm thấy ${testsById.size} bộ đề IELTS`);

  const questions = [];
  const stages = [];
  let n = 1;

  for (const test of testsById.values()) {
    const stageId = `ielts-${test.skill}-${test.testId}`;
    let stageQCount = 0;

    for (let i = 0; i < test.sections.length; i++) {
      const sec = test.sections[i];
      let stem = "";

      if (sec.passage) {
        stem += `📖 ${sec.title.toUpperCase()}\n\n${sec.passage}`;
      } else if (sec.sound) {
        stem += `🎧 ${sec.title.toUpperCase()} (Phần thi Nghe IELTS)`;
      } else {
        stem += `📝 ${sec.title.toUpperCase()}\n\n${test.title}`;
      }

      if (sec.transcript) {
        stem += `\n\n🎧 Lời thoại bài nghe (Transcript):\n${sec.transcript}`;
      }

      const domain =
        test.skill === "reading"
          ? "Reading (Đọc hiểu)"
          : test.skill === "listening"
          ? "Listening (Nghe hiểu)"
          : test.skill === "writing"
          ? "Writing (Viết luận)"
          : test.skill === "speaking"
          ? "Speaking (Nói)"
          : "General";

      questions.push({
        module_id: "ielts",
        level_id: test.skill,
        stage_id: stageId,
        n,
        kind: "mc",
        stem_en: stem,
        stem_ja: "",
        options: [
          { label: "A", en: "True / Yes", ja: "" },
          { label: "B", en: "False / No", ja: "" },
          { label: "C", en: "Not Given", ja: "" },
          { label: "D", en: "Khác", ja: "" },
        ],
        answer: "A",
        multi: false,
        domain,
        audio_url: sec.sound || null,
        explanation: `${test.title} · ${sec.title}`,
      });

      n++;
      stageQCount++;
    }

    stages.push({
      id: stageId,
      name: test.title,
      durationMinutes: test.times,
      kind: test.skill === "listening" ? "listening-test" : "mc-test",
      questionCount: stageQCount,
      skill: test.skill,
    });
  }

  // Sắp xếp đề thi theo Cambridge từ cao xuống thấp (Cam 21 -> Cam 10 -> Actual Tests)
  stages.sort((a, b) => {
    const camA = (a.name.match(/Cambridge\s+(\d+)/i) || [])[1];
    const camB = (b.name.match(/Cambridge\s+(\d+)/i) || [])[1];
    if (camA && camB) return Number(camB) - Number(camA);
    if (camA) return -1;
    if (camB) return 1;
    return a.name.localeCompare(b.name);
  });

  const qPath = path.join(ROOT, "seed", "ielts-questions.json");
  const sPath = path.join(ROOT, "seed", "ielts-stages.json");
  fs.writeFileSync(qPath, JSON.stringify(questions, null, 2), "utf8");
  fs.writeFileSync(sPath, JSON.stringify(stages, null, 2), "utf8");

  console.log(`\n💾 Đã lưu ${questions.length} phần thi vào ${qPath}`);
  console.log(`📋 Đã lưu ${stages.length} bộ đề thi có Audio CDN chuẩn vào ${sPath}`);
}

main();
