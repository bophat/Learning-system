/**
 * Màn hình Ôn tập thẻ ghi nhớ (Flashcard) & Lặp lại ngắt quãng (SM-2).
 * Hỗ trợ lật thẻ bằng click hoặc phím Space/Enter, chấm điểm 4 mức (Quên, Khó, Được, Dễ).
 */

import type { MountFn } from "../../router";
import { navigate } from "../../router";
import { renderPage, bindShell, setModuleTheme } from "../../components/appShell";
import { icon } from "../../components/icons";
import { esc } from "../../components/bindActions";
import { crumbs, emptyState, bar, renderMarkdown } from "../../components/ui";
import { getModule } from "../../data/catalog";
import { loadQuestions } from "../../data/questions";
import { loadSrs, countSrs, pickDue, gradeCard, gradeLabels, type SrsGrade } from "../../state/srs";
import { withData } from "../../components/loading";
import type { ExamQuestion } from "../../types/exam";

export const mountFlashcards: MountFn = (root, params) => {
  const moduleId = params[0] || "aws";
  const m = getModule(moduleId);
  setModuleTheme(moduleId);

  let questions: ExamQuestion[] = [];
  let dueQueue: ExamQuestion[] = [];
  let currentIndex = 0;
  let isFlipped = false;
  let reviewedCount = 0;

  void withData(
    root,
    async () => {
      await loadSrs(moduleId);
      questions = await loadQuestions(moduleId);
      dueQueue = pickDue(moduleId, questions, { limit: 25, maxNew: 10 });
    },
    () => {
      const render = () => {
        const counts = countSrs(moduleId, questions);
        const totalDue = dueQueue.length;

        if (totalDue === 0 || currentIndex >= totalDue) {
          const content = `
            <div class="page-head">
              <div class="page">
                ${crumbs([
                  { label: "Trang chủ", action: "go", arg: "/" },
                  { label: m?.shortName ?? moduleId, action: "go", arg: `/${moduleId}` },
                  { label: "Ôn tập ngắt quãng" },
                ])}
                <div class="page-head-main">
                  <div class="page-head-text">
                    <h1>Ôn tập ngắt quãng (SM-2)</h1>
                    <p class="lead">${esc(m?.fullName ?? "")}</p>
                  </div>
                </div>
              </div>
            </div>

            <div class="page page-body">
              ${emptyState({
                iconName: "checkCircle",
                tone: "good",
                title: reviewedCount > 0 ? "Đã hoàn thành phiên ôn tập!" : "Chưa có thẻ nào đến hạn ôn",
                text: reviewedCount > 0
                  ? `Bạn vừa ôn luyện xong ${reviewedCount} thẻ. Thuật toán SM-2 đã tự động dời lịch các thẻ theo mức độ ghi nhớ của bạn.`
                  : "Tất cả các thẻ trong bộ nhớ của bạn đều đang ở trạng thái tốt. Hãy quay lại vào ngày mai hoặc làm thêm đề mới.",
                actionLabel: "Quay về chứng chỉ",
                action: "go",
                actionArg: `/${moduleId}`,
              })}
            </div>
          `;
          root.innerHTML = renderPage({ active: "certs", moduleId, content });
          bindShell(root, "certs", {});
          return;
        }

        const q = dueQueue[currentIndex];
        const labels = gradeLabels(moduleId, q.n);
        const progressPct = Math.round((currentIndex / totalDue) * 100);

        let frontText = "";
        let frontSub = "";
        let backText = "";

        if (q.kind === "flashcard") {
          frontText = q.front;
          frontSub = q.frontJa ?? "";
          backText = q.back;
        } else if (q.kind === "mc") {
          frontText = q.en;
          frontSub = q.ja ?? "";
          const rightOpts = q.options
            .filter((o) => (q.answer ?? "").includes(o.label))
            .map((o) => `<strong>${esc(o.label)}.</strong> ${esc(o.en || o.ja)}`)
            .join("<br>");
          backText = `<strong>Đáp án đúng:</strong><br>${rightOpts}${q.explanation ? `<br><br><strong>Giải thích:</strong><br>${q.explanation}` : ""}`;
        } else if (q.kind === "essay") {
          frontText = q.prompt || q.title || "";
          backText = q.subQuestions?.map((sq) => `<strong>${esc(sq.prompt)}</strong><br>${esc(sq.referenceAnswer)}`).join("<br><br>") || "Xem tài liệu hướng dẫn";
        }

        const content = `
          <div class="page-head">
            <div class="page">
              ${crumbs([
                { label: "Trang chủ", action: "go", arg: "/" },
                { label: m?.shortName ?? moduleId, action: "go", arg: `/${moduleId}` },
                { label: "Ôn tập thẻ" },
              ])}
              <div class="page-head-main">
                <div class="page-head-text">
                  <h1>Thẻ ghi nhớ & Ôn tập ngắt quãng</h1>
                  <p class="lead">Học sâu nhớ lâu với thuật toán khoa học não bộ SM-2</p>
                </div>
              </div>
            </div>
          </div>

          <div class="page page-body">
            <div class="row gap-16 mb-20" style="align-items:center;justify-content:space-between">
              <div class="row gap-12" style="align-items:center">
                <span class="badge badge-brand nums">Thẻ ${currentIndex + 1} / ${totalDue}</span>
                <span class="text-sm text-muted nums">Đến hạn: ${counts.due} · Đang học: ${counts.learning} · Đã nhớ: ${counts.review}</span>
              </div>
              <button class="btn btn-ghost btn-sm" data-action="exit">${icon("close")}Thoát</button>
            </div>

            <div class="mb-24">${bar(progressPct)}</div>

            <div class="flashcard-stage">
              <div class="flashcard-card" data-action="flip" role="button" tabindex="0" title="Bấm hoặc gõ Space để lật thẻ">
                <div class="flashcard-badge">${isFlipped ? "Mặt sau (Đáp án / Giải thích)" : "Mặt trước (Câu hỏi / Thuật ngữ)"}</div>
                
                <div class="flashcard-text">
                  ${isFlipped ? renderMarkdown(backText) : renderMarkdown(frontText)}
                </div>

                ${!isFlipped && frontSub ? `<div class="flashcard-subtext">${esc(frontSub)}</div>` : ""}

                <div class="flashcard-hint">
                  ${icon("refresh")} ${isFlipped ? "Bấm vào thẻ để xem lại mặt trước" : "Bấm vào thẻ hoặc ấn Space để xem đáp án"}
                </div>
              </div>

              ${
                isFlipped
                  ? `<div class="srs-grades">
                      <button class="srs-grade-btn again" data-action="grade" data-arg="again">
                        <span class="srs-grade-title">Quên</span>
                        <span class="srs-interval">${esc(labels.again)}</span>
                      </button>
                      <button class="srs-grade-btn hard" data-action="grade" data-arg="hard">
                        <span class="srs-grade-title">Khó</span>
                        <span class="srs-interval">${esc(labels.hard)}</span>
                      </button>
                      <button class="srs-grade-btn good" data-action="grade" data-arg="good">
                        <span class="srs-grade-title">Được</span>
                        <span class="srs-interval">${esc(labels.good)}</span>
                      </button>
                      <button class="srs-grade-btn easy" data-action="grade" data-arg="easy">
                        <span class="srs-grade-title">Dễ</span>
                        <span class="srs-interval">${esc(labels.easy)}</span>
                      </button>
                    </div>`
                  : `<button class="btn btn-primary btn-block btn-lg" data-action="flip">${icon("eye")}Xem đáp án (Space)</button>`
              }
            </div>
          </div>
        `;

        root.innerHTML = renderPage({ active: "certs", moduleId, content });

        bindShell(root, "certs", {
          flip: () => {
            isFlipped = !isFlipped;
            render();
          },
          grade: (g) => {
            if (!g) return;
            gradeCard(moduleId, q.n, g as SrsGrade);
            reviewedCount += 1;
            currentIndex += 1;
            isFlipped = false;
            render();
          },
          exit: () => navigate("/" + moduleId),
        });
      };

      render();

    },
    "Đang tải dữ liệu thẻ ôn tập..."
  );
};
