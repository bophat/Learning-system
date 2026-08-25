/**
 * Kết nối Supabase. Cấu hình lấy từ biến môi trường lúc build:
 *   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY  (xem .env.example)
 *
 * Anon key là khoá công khai — mọi kiểm soát truy cập nằm ở Row Level Security
 * phía cơ sở dữ liệu (xem supabase/schema.sql), không nằm ở trình duyệt.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

/**
 * false = chưa điền .env.local, app sẽ hiện màn hướng dẫn cấu hình thay vì lỗi
 * trắng trang. Chấp nhận cả Supabase đám mây lẫn bản chạy local qua Docker
 * (http://127.0.0.1:54321).
 */
export const isConfigured = url.startsWith("http") && anonKey.length > 20 && !url.includes("xxxx");

const client: SupabaseClient | null = isConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "examPrep.auth",
      },
    })
  : null;

/** Truy cập client. Chỉ gọi ở những nhánh đã chắc chắn `isConfigured === true`. */
export function db(): SupabaseClient {
  if (!client) {
    throw new Error("Chưa cấu hình Supabase — tạo file .env.local theo mẫu .env.example.");
  }
  return client;
}

/** Dịch thông báo lỗi hay gặp của Supabase sang tiếng Việt cho dễ hiểu. */
export function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const map: [RegExp, string][] = [
    [/invalid login credentials/i, "Email hoặc mật khẩu không đúng."],
    [/email not confirmed/i, "Email chưa được xác nhận — kiểm tra hộp thư để bấm link xác nhận."],
    [/user already registered/i, "Email này đã được đăng ký. Hãy đăng nhập thay vì đăng ký mới."],
    [/password should be at least/i, "Mật khẩu quá ngắn — cần ít nhất 6 ký tự."],
    [/unable to validate email/i, "Địa chỉ email không hợp lệ."],
    [/provider is not enabled/i, "Đăng nhập Google chưa được bật trong dự án Supabase."],
    [/rate limit|too many requests/i, "Bạn thao tác hơi nhanh — thử lại sau một lát."],
    [/failed to fetch|networkerror/i, "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại."],
    [/row-level security|permission denied/i, "Tài khoản của bạn không có quyền thực hiện thao tác này."],
  ];
  for (const [re, msg] of map) if (re.test(raw)) return msg;
  return raw || "Đã có lỗi xảy ra.";
}
