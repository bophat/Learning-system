/**
 * Router tối giản dựa trên location.hash — đủ dùng cho một trang tĩnh nhiều
 * module, không cần thư viện ngoài. Mỗi route đăng ký một hàm `mount(root)`
 * trả về hàm dọn dẹp (huỷ interval, gỡ listener bàn phím...) nếu cần.
 */

export type Unmount = (() => void) | void;
export type MountFn = (root: HTMLElement, params: string[]) => Unmount;

interface Route {
  pattern: RegExp;
  mount: MountFn;
}

const routes: Route[] = [];
let notFound: MountFn | null = null;
let guard: ((path: string) => string | null) | null = null;
let currentUnmount: Unmount;
let currentHash = "";
let root: HTMLElement | null = null;

/** Đăng ký một route. `path` dạng "/ap/morning/:id" — ":x" khớp một đoạn bất kỳ không chứa "/". */
export function registerRoute(path: string, mount: MountFn): void {
  const pattern = new RegExp("^" + path.replace(/:[^/]+/g, "([^/]+)").replace(/\//g, "\\/") + "$");
  routes.push({ pattern, mount });
}

export function registerNotFound(mount: MountFn): void {
  notFound = mount;
}

/**
 * Cổng kiểm tra chạy trước mọi route: trả về đường dẫn cần chuyển hướng tới,
 * hoặc null nếu cho đi tiếp. Dùng để chặn người chưa đăng nhập.
 */
export function setRouteGuard(fn: (path: string) => string | null): void {
  guard = fn;
}

export function currentPath(): string {
  return location.hash.replace(/^#/, "") || "/";
}

export function navigate(path: string): void {
  if (currentPath() === path) {
    resolve(true);
    return;
  }
  location.hash = path;
}

export function back(fallback = "/"): void {
  if (history.length > 1) history.back();
  else navigate(fallback);
}

/** Vẽ lại route hiện tại (dùng sau khi đổi giao diện sáng/tối chẳng hạn). */
export function rerender(): void {
  resolve(true);
}

function resolve(keepScroll = false): void {
  if (!root) return;
  const hash = currentPath();

  const redirect = guard ? guard(hash) : null;
  if (redirect && redirect !== hash) {
    navigate(redirect);
    return;
  }

  const changed = hash !== currentHash;
  currentHash = hash;

  if (currentUnmount) currentUnmount();
  currentUnmount = undefined;
  root.innerHTML = "";

  for (const route of routes) {
    const m = hash.match(route.pattern);
    if (m) {
      currentUnmount = route.mount(root, m.slice(1));
      if (changed && !keepScroll) window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
      return;
    }
  }

  if (notFound) {
    currentUnmount = notFound(root, [hash]);
    if (changed && !keepScroll) window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  } else if (hash !== "/") {
    navigate("/");
  }
}

export function startRouter(rootEl: HTMLElement): void {
  root = rootEl;
  window.addEventListener("hashchange", () => resolve());
  resolve();
}
