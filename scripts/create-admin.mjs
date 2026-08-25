#!/usr/bin/env node
/**
 * Tạo (hoặc cấp quyền cho) một tài khoản quản trị.
 *
 *   node scripts/create-admin.mjs ban@example.com matkhau123 "Tên hiển thị"
 *   node scripts/create-admin.mjs ban@example.com          # chỉ nâng quyền cho tài khoản có sẵn
 *
 * Tài khoản tạo bằng script này được đánh dấu đã xác nhận email sẵn, khỏi phải
 * chờ mail. Cần SUPABASE_SERVICE_ROLE_KEY trong .env.local.
 */

import { authAdmin, upsert } from "./rest.mjs";

const [email, password, name] = process.argv.slice(2);

if (!email) {
  console.error('Cách dùng: node scripts/create-admin.mjs <email> [mật khẩu] ["Tên hiển thị"]');
  process.exit(1);
}

const displayName = name || email.split("@")[0];

async function findUser(target) {
  for (let page = 1; page <= 20; page++) {
    const data = await authAdmin(`/users?page=${page}&per_page=200`);
    const users = data.users ?? data ?? [];
    const hit = users.find((u) => (u.email ?? "").toLowerCase() === target.toLowerCase());
    if (hit) return hit;
    if (users.length < 200) return null;
  }
  return null;
}

async function main() {
  let user = await findUser(email);

  if (user) {
    console.log(`Tài khoản ${email} đã tồn tại — chỉ cấp quyền quản trị.`);
  } else {
    if (!password) {
      console.error("Tài khoản chưa tồn tại nên cần truyền mật khẩu ở tham số thứ hai.");
      process.exit(1);
    }
    user = await authAdmin("/users", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: displayName },
      }),
    });
    console.log(`Đã tạo tài khoản ${email}.`);
  }

  // Trigger tạo hồ sơ chạy ngay sau khi có user; chờ một nhịp cho chắc.
  await new Promise((r) => setTimeout(r, 500));

  await upsert("profiles", [{ id: user.id, email, display_name: displayName, role: "admin" }], "id");
  console.log(`✓ ${email} đã có vai trò admin. Đăng nhập vào app là thấy mục Quản trị.`);
}

main().catch((err) => {
  console.error(`\nLỗi: ${err.message}\n`);
  process.exit(1);
});
