/**
 * Lấy lô câu AWS CHƯA có explanation_vi (theo thứ tự n tăng dần), lưu ra file
 * JSON để soạn giải thích. Dùng lại nhiều lượt cho tới khi hết — không cần
 * file theo dõi tiến độ riêng, vì bản thân cột explanation_vi IS NULL đã là
 * "todo list".
 *
 * Cách dùng: node scripts/fetch-aws-explain-batch.mjs [batchSize] [outFile]
 */
import { writeFileSync } from "node:fs";
import { select } from "./rest.mjs";

const BATCH = Number(process.argv[2] ?? 20);
const OUT = process.argv[3] ?? "/tmp/aws-batch.json";

const rows = await select(
  "questions",
  "n,stem_en,options,answer,multi",
  `module_id=eq.aws&explanation_vi=is.null&order=n.asc&limit=${BATCH}`
);

writeFileSync(OUT, JSON.stringify(rows, null, 2));
console.log(`Đã lưu ${rows.length} câu (n=${rows.map((r) => r.n).join(",")}) vào ${OUT}`);
