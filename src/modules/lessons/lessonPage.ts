/**
 * Màn hình Bài giảng lý thuyết — Đọc kiến thức nền tảng trước khi vào luyện đề.
 * Hỗ trợ dựng Markdown, công thức LaTeX, phân mục chủ đề và theo dõi tiến độ đọc.
 */

import type { MountFn } from "../../router";
import { navigate } from "../../router";
import { renderPage, bindShell, setModuleTheme } from "../../components/appShell";
import { icon } from "../../components/icons";
import { esc } from "../../components/bindActions";
import { crumbs, emptyState, renderMarkdown } from "../../components/ui";
import { toast } from "../../components/toast";
import { getModule } from "../../data/catalog";
import { loadLessons, getLesson, markLesson, type Lesson } from "../../data/lessons";
import { withData } from "../../components/loading";

export const mountLessons: MountFn = (root, params) => {
  const moduleId = params[0] || "aws";
  const slug = params[1];
  const m = getModule(moduleId);
  setModuleTheme(moduleId);

  let lessons: Lesson[] = [];
  let currentLesson: Lesson | undefined;

  void withData(
    root,
    async () => {
      lessons = await loadLessons(moduleId);
      if (slug) {
        currentLesson = await getLesson(moduleId, slug);
        if (currentLesson) {
          void markLesson(currentLesson.id, "reading");
        }
      }
    },
    () => {
      const render = () => {
        if (!slug || !currentLesson) {
          const listHtml = lessons.length
            ? `<div class="feature-grid">` +
              lessons
                .map((l) => {
                  const statusBadge =
                    l.progress === "đã xong"
                      ? `<span class="badge badge-good">` + icon("checkCircle") + `Đã đọc</span>`
                      : l.progress === "đang đọc"
                      ? `<span class="badge badge-brand">` + icon("clock") + `Đang đọc</span>`
                      : `<span class="badge badge-outline">Chưa đọc</span>`;

                  return `<div class="card card-pad" data-action="read" data-arg="` + esc(l.slug) + `" style="cursor:pointer;display:flex;flex-direction:column;justify-content:space-between">
                    <div>
                      <div class="row gap-8 mb-12" style="justify-content:space-between;align-items:center">
                        <span class="text-xs text-muted nums">` + icon("clock") + l.estMinutes + ` phút đọc</span>
                        ` + statusBadge + `
                      </div>
                      <h3 class="card-title mb-8">` + esc(l.title) + `</h3>
                      <p class="card-note" style="margin-bottom:16px">` + esc(l.summary || "Khái niệm và kiến thức trọng tâm cho kỳ thi.") + `</p>
                    </div>
                    <div class="row gap-6 mt-16" style="color:var(--brand);font-weight:650;font-size:13.5px;align-items:center">
                      <span>Đọc bài giảng</span> ` + icon("arrowRight") + `
                    </div>
                  </div>`;
                })
                .join("") +
              `</div>`
            : emptyState({
                iconName: "bookOpen",
                title: "Chưa có bài giảng cho chứng chỉ này",
                text: "Các bài giảng lý thuyết tóm lược kiến thức trọng tâm đang được biên soạn và sẽ sớm ra mắt.",
                actionLabel: "Vào luyện đề ngay",
                action: "go",
                actionArg: "/" + moduleId,
              });

          const content = `<div class="page-head">
            <div class="page">` +
              crumbs([
                { label: "Trang chủ", action: "go", arg: "/" },
                { label: m?.shortName ?? moduleId, action: "go", arg: "/" + moduleId },
                { label: "Bài giảng lý thuyết" },
              ]) +
              `<div class="page-head-main">
                <div class="page-head-text">
                  <h1>Bài giảng &amp; Kiến thức nền tảng</h1>
                  <p class="lead">Tóm lược lý thuyết cốt lõi giúp bạn tự tin nắm vững cấu trúc đề ` + esc(m?.shortName ?? "") + `.</p>
                </div>
              </div>
            </div>
          </div>
          <div class="page page-body">` + listHtml + `</div>`;

          root.innerHTML = renderPage({ active: "certs", moduleId, content });
          bindShell(root, "certs", {
            read: (s) => { if (s) navigate("/bai-hoc/" + moduleId + "/" + s); },
          });
          return;
        }

        const currentIndex = lessons.findIndex((l) => l.id === currentLesson?.id);
        const prevLesson = currentIndex > 0 ? lessons[currentIndex - 1] : null;
        const nextLesson = currentIndex < lessons.length - 1 ? lessons[currentIndex + 1] : null;

        const navHtml = lessons
          .map((l) => {
            const active = l.id === currentLesson?.id;
            const iconCheck = l.progress === "đã xong" ? icon("check") : "";
            return `<button class="lesson-link ` + (active ? "is-active" : "") + `" data-action="read" data-arg="` + esc(l.slug) + `">
              <span class="truncate">` + esc(l.title) + `</span>
              ` + iconCheck + `
            </button>`;
          })
          .join("");

        const content = `<div class="page-head">
          <div class="page">` +
            crumbs([
              { label: "Trang chủ", action: "go", arg: "/" },
              { label: m?.shortName ?? moduleId, action: "go", arg: "/" + moduleId },
              { label: "Bài giảng", action: "go", arg: "/bai-hoc/" + moduleId },
              { label: currentLesson.title },
            ]) +
            `<div class="page-head-main">
              <div class="page-head-text">
                <h1>` + esc(currentLesson.title) + `</h1>
                <p class="lead">` + icon("clock") + ` Ước tính ` + currentLesson.estMinutes + ` phút đọc · ` + esc(m?.fullName ?? "") + `</p>
              </div>
            </div>
          </div>
        </div>
        <div class="page page-body">
          <div class="lesson-layout">
            <aside class="lesson-nav-card card card-pad hide-sm">
              <div class="card-title mb-12" style="font-size:15px">Mục lục bài học</div>
              <div class="col gap-4">` + navHtml + `</div>
            </aside>
            <article class="card card-pad lesson-article">` +
              renderMarkdown(currentLesson.body || currentLesson.summary || "Nội dung đang được cập nhật...") +
              `<div class="row gap-12 mt-40 pt-24" style="border-top:1px solid var(--line);justify-content:space-between;align-items:center;flex-wrap:wrap">
                <div>` +
                  (currentLesson.progress === "đã xong"
                    ? `<span class="badge badge-good">` + icon("checkCircle") + `Bạn đã đọc xong bài này</span>`
                    : `<button class="btn btn-primary" data-action="markDone">` + icon("check") + `Đánh dấu đã đọc xong</button>`) +
                `</div>
                <div class="row gap-8">` +
                  (prevLesson ? `<button class="btn btn-outline btn-sm" data-action="read" data-arg="` + esc(prevLesson.slug) + `">` + icon("chevronLeft") + `Bài trước</button>` : "") +
                  (nextLesson ? `<button class="btn btn-primary btn-sm" data-action="read" data-arg="` + esc(nextLesson.slug) + `">Bài tiếp theo ` + icon("chevronRight") + `</button>` : "") +
                `</div>
              </div>
            </article>
          </div>
        </div>`;

        root.innerHTML = renderPage({ active: "certs", moduleId, content });

        bindShell(root, "certs", {
          read: (s) => { if (s) navigate("/bai-hoc/" + moduleId + "/" + s); },
          markDone: async () => {
            if (!currentLesson) return;
            await markLesson(currentLesson.id, "done");
            currentLesson.progress = "đã xong";
            toast("Đã ghi nhận hoàn thành bài học!", "good");
            render();
          },
        });
      };

      render();
    },
    "Đang tải bài giảng..."
  );
};