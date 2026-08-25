/**
 * Phiên đăng nhập và hồ sơ người dùng.
 *
 * App bắt buộc đăng nhập: `main.ts` chờ `initAuth()` xong mới dựng router, và
 * mọi route đều đi qua cổng kiểm tra ở đó. Vai trò (`user` / `admin`) lấy từ
 * bảng `profiles`; quyền thật sự vẫn do RLS phía Supabase quyết định, phía
 * trình duyệt chỉ dùng vai trò để ẩn/hiện giao diện.
 */

import type { Session } from "@supabase/supabase-js";
import { db, isConfigured, friendlyError } from "../services/supabase";

/** Dự án đã khai báo Supabase chưa. Để tầng giao diện khỏi phải import `services/`. */
export const isBackendConfigured = isConfigured;

export interface Profile {
  id: string;
  email: string;
  displayName: string;
  role: "user" | "admin";
}

let session: Session | null = null;
let profile: Profile | null = null;
const listeners = new Set<() => void>();

export function onAuthChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(): void {
  listeners.forEach((fn) => fn());
}

export function getSession(): Session | null {
  return session;
}

export function getProfile(): Profile | null {
  return profile;
}

export function isLoggedIn(): boolean {
  return !!session?.user;
}

export function isAdmin(): boolean {
  return profile?.role === "admin";
}

export function currentUserId(): string {
  return session?.user?.id ?? "";
}

async function fetchProfile(): Promise<void> {
  if (!session?.user) {
    profile = null;
    return;
  }
  const { data, error } = await db()
    .from("profiles")
    .select("id, email, display_name, role")
    .eq("id", session.user.id)
    .maybeSingle();

  if (error || !data) {
    // Trigger tạo hồ sơ có thể chạy chậm hơn một nhịp — tạm dựng hồ sơ từ phiên.
    profile = {
      id: session.user.id,
      email: session.user.email ?? "",
      displayName: (session.user.user_metadata?.display_name as string) ?? session.user.email?.split("@")[0] ?? "Bạn",
      role: "user",
    };
    return;
  }
  profile = {
    id: data.id,
    email: data.email ?? session.user.email ?? "",
    displayName: data.display_name || data.email?.split("@")[0] || "Bạn",
    role: data.role === "admin" ? "admin" : "user",
  };
}

/** Gọi một lần lúc khởi động: khôi phục phiên cũ rồi lắng nghe thay đổi. */
export async function initAuth(): Promise<void> {
  if (!isConfigured) return;
  const { data } = await db().auth.getSession();
  session = data.session;
  await fetchProfile();

  db().auth.onAuthStateChange((_event, next) => {
    const changed = next?.user?.id !== session?.user?.id;
    session = next;
    if (changed) {
      void fetchProfile().then(notify);
    } else {
      notify();
    }
  });
}

// ---------------------------------------------------------------- thao tác

export interface AuthResult {
  ok: boolean;
  message?: string;
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  try {
    const { error } = await db().auth.signInWithPassword({ email: email.trim(), password });
    if (error) return { ok: false, message: friendlyError(error) };
    await fetchProfile();
    return { ok: true };
  } catch (err) {
    return { ok: false, message: friendlyError(err) };
  }
}

export async function signUp(email: string, password: string, displayName: string): Promise<AuthResult> {
  try {
    const { data, error } = await db().auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: displayName.trim() } },
    });
    if (error) return { ok: false, message: friendlyError(error) };
    if (data.session) {
      await fetchProfile();
      return { ok: true };
    }
    // Dự án đang bật xác nhận email — chưa có phiên đăng nhập ngay.
    return { ok: true, message: "Đã gửi email xác nhận. Mở hộp thư và bấm link để kích hoạt tài khoản." };
  } catch (err) {
    return { ok: false, message: friendlyError(err) };
  }
}

export async function signInWithGoogle(): Promise<AuthResult> {
  try {
    const { error } = await db().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}${location.pathname}` },
    });
    if (error) return { ok: false, message: friendlyError(error) };
    return { ok: true };
  } catch (err) {
    return { ok: false, message: friendlyError(err) };
  }
}

export async function sendPasswordReset(email: string): Promise<AuthResult> {
  try {
    const { error } = await db().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${location.origin}${location.pathname}`,
    });
    if (error) return { ok: false, message: friendlyError(error) };
    return { ok: true, message: "Đã gửi email đặt lại mật khẩu. Kiểm tra hộp thư của bạn." };
  } catch (err) {
    return { ok: false, message: friendlyError(err) };
  }
}

export async function updateDisplayName(name: string): Promise<AuthResult> {
  try {
    const { error } = await db().from("profiles").update({ display_name: name.trim() }).eq("id", currentUserId());
    if (error) return { ok: false, message: friendlyError(error) };
    if (profile) profile.displayName = name.trim();

    // Bình luận lưu sẵn tên tác giả nên phải cập nhật lại các bài cũ của chính mình.
    void db().from("question_comments").update({ author_name: name.trim() }).eq("user_id", currentUserId());

    notify();
    return { ok: true };
  } catch (err) {
    return { ok: false, message: friendlyError(err) };
  }
}

export async function signOut(): Promise<void> {
  try {
    await db().auth.signOut();
  } catch {
    /* dù lỗi vẫn coi như đã đăng xuất phía trình duyệt */
  }
  session = null;
  profile = null;
  notify();
}
