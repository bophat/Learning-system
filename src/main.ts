import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/exam.css";
import "./styles/home.css";

import { registerRoute, registerNotFound, setRouteGuard, startRouter, rerender, navigate } from "./router";
import { applyTheme } from "./state/theme";
import { isConfigured } from "./services/supabase";
import { initAuth, onAuthChange, isLoggedIn, currentUserId, signOut } from "./state/auth";
import { loadCatalog } from "./data/catalog";
import { loadProgress, clearProgressCache } from "./state/progress";
import { clearSrsCache } from "./state/srs";
import { clearSocialCache } from "./state/social";
import { clearHabitCache } from "./state/habits";
import { clearTopicCache } from "./data/topics";
import { clearLessonCache } from "./data/lessons";
import { flushResponses } from "./state/responses";
import { clearHighlightCache } from "./state/highlights";
import { pullSessions } from "./state/session";
import { renderLoading } from "./components/loading";
import { renderPage, bindShell } from "./components/appShell";
import { icon } from "./components/icons";
import { esc } from "./components/bindActions";

import { mountLogin } from "./modules/auth/loginPage";
import { mountAccount } from "./modules/auth/accountPage";
import { mountAdmin } from "./modules/admin/adminPage";
import { mountLanding } from "./modules/home/landing";
import { mountCatalog } from "./modules/home/catalog";
import { mountProgress } from "./modules/home/progressPage";
import { mountGuide } from "./modules/home/guidePage";
import { mountComingSoon } from "./modules/home/comingSoon";
import { mountNotFound } from "./modules/home/notFound";
import { mountFlashcards } from "./modules/shared/flashcards";
import { mountLessons } from "./modules/lessons/lessonPage";
import { registerAwsRoutes } from "./modules/aws";
import { registerApRoutes } from "./modules/ap";
import { registerJlptRoutes } from "./modules/jlpt";
import { registerIeltsRoutes } from "./modules/ielts";
import { registerToeicRoutes } from "./modules/toeic";
import { registerExamRoutes } from "./modules/shared/mcExam";
import { registerRichExamRoutes } from "./modules/shared/richExam";
import { registerRichExamDemoRoute } from "./modules/dev/richExamDemo";

const LOGIN_PATH = "/dang-nhap";

applyTheme();

const app = document.getElementById("app");

// ---------------------------------------------------------------- route

registerRoute(LOGIN_PATH, mountLogin);
registerRoute("/tai-khoan", mountAccount);
registerRoute("/quan-tri", mountAdmin);
registerRoute("/", mountLanding);
registerRoute("/chung-chi", mountCatalog);
registerRoute("/tien-trinh", mountProgress);
registerRoute("/huong-dan", mountGuide);
registerRoute("/sap-co/:id", mountComingSoon);
registerRoute("/on-tap/:id", mountFlashcards);
registerRoute("/bai-hoc/:id", mountLessons);
registerRoute("/bai-hoc/:id/:slug", mountLessons);
registerAwsRoutes();
registerApRoutes();
registerJlptRoutes();
registerIeltsRoutes();
registerToeicRoutes();
registerExamRoutes();
registerRichExamRoutes();
registerRichExamDemoRoute();
registerNotFound(mountNotFound);

// Chưa đăng nhập thì mọi đường dẫn đều dẫn về màn đăng nhập, và ngược lại.
setRouteGuard((path) => {
  const authed = isConfigured && isLoggedIn();
  if (!authed) return path === LOGIN_PATH ? null : LOGIN_PATH;
  if (path === LOGIN_PATH) return "/";
  return null;
});

// ---------------------------------------------------------------- dữ liệu

let dataReady = false;

function renderFatal(message: string): void {
  if (!app) return;
  app.innerHTML = renderPage({
    hideFooter: true,
    content: `<div class="page" style="padding:70px 0 90px">
      <div class="empty" style="max-width:560px;margin:0 auto">
        <div class="icon-chip lg bad">${icon("alert")}</div>
        <h3 style="font-size:20px">Không tải được dữ liệu</h3>
        <p>${esc(message)}</p>
        <p class="text-sm">Thường là do chưa chạy <code>supabase/schema.sql</code>, hoặc mạng đang trục trặc.</p>
        <div class="row gap-10 wrap" style="justify-content:center">
          <button class="btn btn-primary" data-action="retry">${icon("refresh")}Thử lại</button>
          <button class="btn btn-outline" data-action="logout">${icon("arrowLeft")}Đăng xuất</button>
        </div>
      </div>
    </div>`,
  });
  bindShell(app, "", {
    retry: () => void enterApp(),
    logout: () => void signOut(),
  });
}

/** Tải danh mục chứng chỉ + tiến trình của người dùng rồi mở ứng dụng. */
async function enterApp(): Promise<void> {
  if (!app) return;
  renderLoading(app, "Đang tải dữ liệu học tập...");
  try {
    await Promise.all([loadCatalog(), loadProgress()]);
    await pullSessions();
    dataReady = true;
  } catch (err) {
    renderFatal(err instanceof Error ? err.message : String(err));
    return;
  }
  navigate("/");
}

// ---------------------------------------------------------------- khởi động

let lastUserId = "";

async function boot(): Promise<void> {
  if (!app) return;

  if (!isConfigured) {
    // Chưa có .env.local — màn đăng nhập sẽ hiện hướng dẫn thiết lập.
    startRouter(app);
    return;
  }

  renderLoading(app, "Đang kiểm tra phiên đăng nhập...");
  await initAuth();
  lastUserId = currentUserId();

  if (isLoggedIn()) {
    try {
      await Promise.all([loadCatalog(), loadProgress()]);
      await pullSessions();
      dataReady = true;
    } catch (err) {
      startRouter(app);
      renderFatal(err instanceof Error ? err.message : String(err));
      return;
    }
  }

  startRouter(app);

  // Chỉ phản ứng khi thật sự đổi tài khoản (bỏ qua các lần làm mới token).
  onAuthChange(() => {
    const uid = currentUserId();
    if (uid === lastUserId) return;
    lastUserId = uid;

    if (uid) {
      dataReady = false;
      void enterApp();
    } else {
      dataReady = false;
      // Đổi tài khoản thì phải xoá sạch bộ nhớ đệm, nếu không người sau sẽ
      // thấy dữ liệu học của người trước.
      flushResponses();
      clearProgressCache();
      clearSrsCache();
      clearSocialCache();
      clearHabitCache();
      clearTopicCache();
      clearLessonCache();
      clearHighlightCache();
      navigate(LOGIN_PATH);
    }
  });
}

// Đổi sáng/tối thì vẽ lại trang hiện tại để các biểu tượng đổi theo.
window.addEventListener("theme-change", () => {
  if (dataReady || !isConfigured) rerender();
});

// Thanh điều hướng đổ bóng khi trang đã cuộn xuống.
const onScroll = () => {
  const header = document.querySelector(".site-header");
  if (header) header.classList.toggle("is-stuck", window.scrollY > 8);
};
window.addEventListener("scroll", onScroll, { passive: true });

void boot().then(onScroll);
