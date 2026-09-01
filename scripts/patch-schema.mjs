/**
 * patch-schema.mjs
 *
 * Chạy migration SQL trực tiếp lên Supabase để thêm cột level_id còn thiếu.
 * Dùng khoá service_role nên không bị chặn bởi RLS.
 *
 * Chạy: node scripts/patch-schema.mjs
 */

import { readFileSync, existsSync } from "node:fs";

// ─── Load env ─────────────────────────────────────────────────────────────────
function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  }
  const url = (process.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "").replace(/\/rest\/v1.*$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) { console.error("Thiếu VITE_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
  return { url, key };
}

const { url: BASE, key: KEY } = loadEnv();

async function runSQL(sql) {
  const res = await fetch(`${BASE}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text };
}

// Supabase không expose exec_sql qua PostgREST — dùng pg endpoint thay thế
async function runSQLDirect(sql) {
  // Supabase Management API: POST /pg/query (chỉ dùng cho dashboard — không available cho user)
  // Thay bằng cách dùng RPC custom nếu có, hoặc dùng REST upsert trick
  // Thực tế: dùng supabase CLI hoặc dashboard SQL editor
  return null;
}

// ─── Patch SQL ────────────────────────────────────────────────────────────────
// Vì Supabase REST không cho chạy DDL trực tiếp, ta tạo function tạm qua rpc
// Nhưng cách đơn giản nhất: dùng supabase CLI
console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Supabase REST API KHÔNG cho phép chạy DDL (ALTER TABLE)
  trực tiếp. Cần chạy qua một trong hai cách sau:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CÁCH 1 — Supabase CLI (nếu đã login):
  npx supabase db push

CÁCH 2 — Dashboard SQL Editor:
  Mở: https://supabase.com/dashboard/project/ictyzrnhtobrangjdeqn/sql/new
  Dán và chạy SQL bên dưới:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PATCH: thêm cột level_id vào question_state và exam_sessions

alter table public.question_state
  add column if not exists level_id text not null default '';

alter table public.question_state
  add column if not exists stage_id text not null default '';

alter table public.exam_sessions
  add column if not exists level_id text not null default '';

-- Dựng lại primary key nếu còn khoá cũ thiếu cột
do $$
declare pk_cols int;
begin
  select array_length(conkey, 1) into pk_cols
  from pg_constraint
  where conname = 'question_state_pkey'
    and conrelid = 'public.question_state'::regclass;
  if pk_cols is not null and pk_cols < 5 then
    alter table public.question_state drop constraint question_state_pkey;
    alter table public.question_state add constraint question_state_pkey
      primary key (user_id, module_id, level_id, stage_id, question_n);
  end if;
end $$;

do $$
declare pk_cols int;
begin
  select array_length(conkey, 1) into pk_cols
  from pg_constraint
  where conname = 'exam_sessions_pkey'
    and conrelid = 'public.exam_sessions'::regclass;
  if pk_cols is not null and pk_cols < 3 then
    alter table public.exam_sessions drop constraint exam_sessions_pkey;
    alter table public.exam_sessions add constraint exam_sessions_pkey
      primary key (user_id, module_id, level_id);
  end if;
end $$;
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

// Thử dùng supabase CLI
import { execSync } from "node:child_process";
try {
  console.log("Thử chạy: npx supabase db push ...");
  const result = execSync("npx supabase db push --linked 2>&1", {
    cwd: process.cwd(),
    timeout: 30000,
    encoding: "utf8",
  });
  console.log(result);
} catch (e) {
  console.log("CLI không khả dụng hoặc chưa link project. Vui lòng dùng Dashboard SQL Editor theo hướng dẫn trên.\n");
  console.log("Chi tiết:", e.stdout ?? e.message);
}
