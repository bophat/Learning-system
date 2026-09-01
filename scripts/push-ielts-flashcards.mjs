/**
 * push-ielts-flashcards.mjs
 *
 * Nạp bộ thẻ ghi nhớ từ vựng IELTS học thuật (Band 6.5–8.0) vào bảng questions trên Supabase
 *
 * Chạy: node scripts/push-ielts-flashcards.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { upsert, remove } from "./rest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

async function main() {
  console.log("🇬🇧 BẮT ĐẦU NẠP TỪ VỰNG FLASHCARD IELTS VÀO SUPABASE\n");

  const p = path.join(ROOT, "seed", "ielts-flashcards.json");
  if (!existsSync(p)) {
    console.error("❌ Không tìm thấy seed/ielts-flashcards.json");
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(p, "utf8"));
  const rows = raw.map((f, idx) => ({
    module_id: "ielts",
    level_id: "vocabulary",
    stage_id: "vocab-band-7",
    n: 1000 + idx + 1,
    kind: "flashcard",
    stem_en: f.front,
    stem_ja: f.frontJa || "",
    prompt: f.back,
    options: [],
    answer: null,
    multi: false,
    domain: f.domain || "IELTS Vocabulary",
    explanation: f.back,
  }));

  console.log(`Đang nạp ${rows.length} thẻ flashcard từ vựng IELTS...`);
  await remove("questions", "module_id=eq.ielts&level_id=eq.vocabulary").catch(() => {});
  await upsert("questions", rows, "module_id,level_id,stage_id,n");

  console.log("✅ Đã nạp thành công bộ thẻ từ vựng IELTS vào bảng questions!");
}

main().catch((err) => {
  console.error("❌ Lỗi:", err.message);
  process.exit(1);
});
