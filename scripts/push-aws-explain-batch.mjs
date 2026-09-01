/**
 * Ghi giải thích 1 lô câu AWS lên Supabase — PATCH từng câu theo n, giữ
 * nguyên option/answer gốc, chỉ cập nhật explanation (3 ngôn ngữ) và option.why.
 *
 * Cách dùng: node scripts/push-aws-explain-batch.mjs <file.json>
 * File json: mảng { n, explanation, explanation_ja, explanation_vi, options: [{label, why}] }
 */
import { readFileSync } from "node:fs";
import { loadEnv } from "./rest.mjs";

const { url: BASE, key: KEY } = loadEnv();
const FILE = process.argv[2];
if (!FILE) {
  console.error("Dùng: node scripts/push-aws-explain-batch.mjs <file.json>");
  process.exit(1);
}

function headers() {
  return {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
  };
}

async function getOptions(n) {
  const res = await fetch(`${BASE}/rest/v1/questions?select=options&module_id=eq.aws&n=eq.${n}`, { headers: headers() });
  const rows = await res.json();
  if (!rows.length) throw new Error(`Không tìm thấy câu n=${n}`);
  return rows[0].options;
}

async function patchQuestion(n, body) {
  const res = await fetch(`${BASE}/rest/v1/questions?module_id=eq.aws&n=eq.${n}`, {
    method: "PATCH",
    headers: { ...headers(), Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PATCH n=${n} thất bại: ${res.status} ${text}`);
  }
}

const items = JSON.parse(readFileSync(FILE, "utf8"));

let done = 0;
for (const item of items) {
  const options = await getOptions(item.n);
  const whyMap = new Map(item.options.map((o) => [o.label, o.why]));
  const mergedOptions = options.map((o) => ({ ...o, why: whyMap.get(o.label) ?? o.why }));

  await patchQuestion(item.n, {
    explanation: item.explanation,
    explanation_ja: item.explanation_ja,
    explanation_vi: item.explanation_vi,
    options: mergedOptions,
  });
  done++;
  console.log(`Đã ghi câu n=${item.n} (${done}/${items.length})`);
}

console.log("Xong lô này.");
