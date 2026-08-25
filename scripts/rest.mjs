/**
 * Tiện ích dùng chung cho các script chạy ở máy: đọc .env.local và gọi thẳng
 * REST API của Supabase.
 *
 * Cố ý không dùng @supabase/supabase-js ở đây — thư viện đó khởi tạo sẵn phần
 * realtime vốn cần WebSocket gốc (Node 22 trở lên mới có). Script chỉ cần
 * đọc/ghi bảng nên gọi PostgREST trực tiếp là đủ và không kén phiên bản Node.
 */

import { readFileSync, existsSync } from "node:fs";

export function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  }

  const url = (process.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "").replace(/\/rest\/v1.*$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  if (!url || !key) {
    console.error(`
Thiếu cấu hình. Tạo file .env.local ở thư mục gốc với nội dung:

  VITE_SUPABASE_URL=https://<project>.supabase.co
  VITE_SUPABASE_ANON_KEY=<anon / publishable key>
  SUPABASE_SERVICE_ROLE_KEY=<service_role / secret key>

Lấy ở Supabase Dashboard → Project Settings → API Keys.
`);
    process.exit(1);
  }
  return { url, key };
}

const { url: BASE, key: KEY } = loadEnv();

function headers(extra = {}) {
  return {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function request(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: headers(init.headers) });
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      const j = JSON.parse(text);
      detail = j.message || j.msg || j.error_description || j.error || text;
    } catch {
      /* giữ nguyên text */
    }
    throw new Error(`${res.status} ${res.statusText} — ${detail}`);
  }
  return text ? JSON.parse(text) : null;
}

/** SELECT: `select("exam_modules", "id,short_name", "order=id.asc")` */
export function select(table, columns = "*", query = "") {
  const q = [`select=${encodeURIComponent(columns)}`, query].filter(Boolean).join("&");
  return request(`/rest/v1/${table}?${q}`);
}

/** UPSERT theo cột xung đột, trả về số dòng đã ghi. */
export async function upsert(table, rows, onConflict) {
  if (rows.length === 0) return 0;
  await request(`/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  return rows.length;
}

/** DELETE với bộ lọc dạng PostgREST, ví dụ `remove("questions", "module_id=eq.aws")`. */
export function remove(table, filter) {
  return request(`/rest/v1/${table}?${filter}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}

/** Gọi Admin API của phần xác thực (tạo/tra cứu người dùng). */
export function authAdmin(path, init = {}) {
  return request(`/auth/v1/admin${path}`, init);
}
