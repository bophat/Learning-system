/**
 * push-toeic.mjs
 *
 * Tạo và nạp module TOEIC với 40 bộ đề thi từ Parroto lên Supabase
 *
 * Chạy: node scripts/push-toeic.mjs
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { select, upsert } from "./rest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function main() {
  console.log("📘 BẮT ĐẦU TẠO MODULE TOEIC...\n");

  const f1 = path.join(ROOT, "data", "parroto_full_content.json");
  const f2 = path.join(ROOT, "data", "parroto_full_content (1).json");
  const d1 = existsSync(f1) ? JSON.parse(readFileSync(f1, "utf8")) : {};
  const d2 = existsSync(f2) ? JSON.parse(readFileSync(f2, "utf8")) : {};
  const all = { ...d1, ...d2 };

  const stages = [];
  const toeicSeen = new Set();

  for (const [url, item] of Object.entries(all)) {
    if (url.includes("/toeic/")) {
      const slug = url.split("/").pop();
      if (toeicSeen.has(slug)) continue;
      toeicSeen.add(slug);

      const rawTitle = item.item?.title || "";
      const cleanTitle = rawTitle.replace(/FREE\s*\d+\s*questions.*$/i, "").trim() || slug;

      stages.push({
        id: `toeic-${slug}`,
        name: cleanTitle,
        durationMinutes: 120,
        kind: "mc-test",
        questionCount: 200,
      });
    }
  }

  // Sắp xếp đề thi TOEIC đẹp mắt
  stages.sort((a, b) => a.name.localeCompare(b.name));

  const toeicModule = {
    id: "toeic",
    short_name: "TOEIC",
    short_label: "Listening & Reading",
    full_name: "Test of English for International Communication (TOEIC)",
    tagline: "40 bộ đề thi TOEIC: ETS TOEIC, TOEIC 2026, Parroto Practice Vol 1 (200 câu/đề).",
    description:
      "Luyện thi chứng chỉ tiếng Anh giao tiếp quốc tế TOEIC Listening & Reading. Tổng hợp 40 bộ đề chuẩn ETS format 200 câu (100 câu nghe + 100 câu đọc) trong 120 phút.",
    icon_name: "award",
    provider: "ETS · IIG Vietnam",
    level: "Target 450 – 990+",
    exam_minutes: 120,
    pass_note: "Mục tiêu ≥ 650/990",
    pass_pct: 65,
    accent_hue: 175,
    available: true,
    sample_data: false,
    bilingual: false,
    highlights: [
      "40 bộ đề thi TOEIC chuẩn định dạng ETS mới nhất.",
      "100 câu Listening (Part 1–4) và 100 câu Reading (Part 5–7).",
      "Thang tính điểm chuẩn 10–990 điểm.",
    ],
    facts: [
      { label: "Phần Listening", value: "100 câu (45 phút · Part 1–4)" },
      { label: "Phần Reading", value: "100 câu (75 phút · Part 5–7)" },
      { label: "Tổng thời gian", value: "120 phút" },
      { label: "Thang điểm", value: "10 – 990 điểm" },
      { label: "Tổng số đề thi", value: "40 bộ đề" },
    ],
    stages,
    levels: [
      { id: "listening", label: "Listening (Part 1-4)", examMinutes: 45, passNote: "Mục tiêu ≥ 350/495", passPct: 70, sortOrder: 1 },
      { id: "reading", label: "Reading (Part 5-7)", examMinutes: 75, passNote: "Mục tiêu ≥ 300/495", passPct: 60, sortOrder: 2 },
    ],
    sort_order: 4,
  };

  // 1. Cập nhật seed/modules.json
  const modulesJsonPath = path.join(ROOT, "seed", "modules.json");
  if (existsSync(modulesJsonPath)) {
    const modules = JSON.parse(readFileSync(modulesJsonPath, "utf8"));
    const filtered = modules.filter((m) => m.id !== "toeic");
    filtered.push(toeicModule);
    filtered.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    writeFileSync(modulesJsonPath, JSON.stringify(filtered, null, 2), "utf8");
    console.log("✅ Đã cập nhật seed/modules.json với module TOEIC (40 bộ đề)");
  }

  // 2. Upsert lên Supabase
  console.log("🚀 Đang nạp module TOEIC lên Supabase...");
  upsert("exam_modules", [toeicModule], "id")
    .then(() => {
      console.log("🎉 ĐÃ NẠP THÀNH CÔNG MODULE TOEIC LÊN SUPABASE!");
    })
    .catch((err) => {
      console.error("❌ Lỗi nạp Supabase:", err.message);
    });
}

main();
