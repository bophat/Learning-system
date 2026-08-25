#!/usr/bin/env node
/**
 * Nạp dữ liệu khởi tạo (danh mục chứng chỉ + ngân hàng câu hỏi) lên Supabase.
 *
 *   node scripts/seed.mjs            # nạp tất cả
 *   node scripts/seed.mjs aws        # chỉ nạp một chứng chỉ
 *   node scripts/seed.mjs --reset    # xoá câu hỏi cũ của chứng chỉ đó trước khi nạp
 *
 * Cần VITE_SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY trong .env.local. Khoá
 * service_role bỏ qua toàn bộ phân quyền nên CHỈ dùng ở máy bạn, không bao giờ
 * đưa vào code chạy trên trình duyệt.
 */

import { readFileSync } from "node:fs";
import { select, upsert, remove } from "./rest.mjs";

const args = process.argv.slice(2);
const reset = args.includes("--reset");
const only = args.filter((a) => !a.startsWith("--"));
const CHUNK = 500;

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

async function chunkedUpsert(rows) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await upsert("questions", rows.slice(i, i + CHUNK), "module_id,stage_id,n");
    process.stdout.write(`\r  ${Math.min(i + CHUNK, rows.length)}/${rows.length} câu`);
  }
  process.stdout.write("\n");
}

/**
 * PostgREST yêu cầu mọi dòng trong cùng một lô insert phải có y hệt bộ khoá,
 * mà câu trắc nghiệm và câu tự luận lại dùng những trường khác nhau — nên phải
 * điền đủ mọi cột cho từng dòng.
 */
function normalize(row) {
  return {
    module_id: row.module_id,
    stage_id: row.stage_id ?? "exam",
    n: row.n,
    kind: row.kind ?? "mc",
    stem_en: row.stem_en ?? null,
    stem_ja: row.stem_ja ?? null,
    options: row.options ?? [],
    answer: row.answer ?? null,
    multi: !!row.multi,
    domain: row.domain ?? null,
    title: row.title ?? null,
    prompt: row.prompt ?? null,
    sub_questions: row.sub_questions ?? [],
    required: !!row.required,
  };
}

const SOURCES = {
  aws: () =>
    readJson("seed/aws-questions.json").map((q) =>
      normalize({
        module_id: "aws",
        stage_id: "exam",
        kind: "mc",
        n: q.n,
        stem_en: q.en,
        stem_ja: q.ja,
        options: (q.opts ?? []).map((o) => ({ label: o.l, en: o.en, ja: o.ja })),
        answer: q.ans,
        multi: q.multi,
      })
    ),
  ap: () => readJson("seed/ap-questions.json").map((q) => normalize({ module_id: "ap", ...q })),
};

async function main() {
  const modules = readJson("seed/modules.json").filter((m) => !only.length || only.includes(m.id));
  if (modules.length === 0) {
    console.error(`Không tìm thấy chứng chỉ nào khớp: ${only.join(", ")}`);
    process.exit(1);
  }

  console.log(`\nNạp ${modules.length} chứng chỉ...`);
  await upsert("exam_modules", modules, "id");
  console.log(`  ✓ ${modules.map((m) => m.id).join(", ")}`);

  for (const m of modules) {
    const load = SOURCES[m.id];
    if (!load) {
      console.log(`\n${m.id}: chưa có file câu hỏi trong seed/ — bỏ qua.`);
      continue;
    }
    const rows = load();
    console.log(`\nNạp câu hỏi cho ${m.id} (${rows.length} câu)...`);
    if (reset) {
      await remove("questions", `module_id=eq.${m.id}`);
      console.log("  đã xoá câu hỏi cũ");
    }
    await chunkedUpsert(rows);
  }

  const stats = await select("module_stats");
  console.log("\nSố liệu sau khi nạp:");
  for (const s of stats) {
    console.log(
      `  ${String(s.module_id).padEnd(6)} ${String(s.total).padStart(5)} câu · ${s.with_answer} có đáp án · ${s.essay_total} tự luận`
    );
  }
  console.log("\nXong.\n");
}

main().catch((err) => {
  console.error(`\nLỗi: ${err.message}\n`);
  process.exit(1);
});
