/**
 * Màn hình thử nghiệm cho `richExam.ts` — 5 dạng câu hỏi mới (Nghe, Đọc,
 * Viết, Ghép nối, Bút toán) với dữ liệu mẫu viết thẳng trong code, không phụ
 * thuộc CSDL. Mục đích duy nhất: xác nhận toàn bộ luồng (render → trả lời →
 * chấm → kết quả → lưu tiến trình) chạy đúng trước khi các module thật
 * (JLPT/IELTS/TOEIC) gọi `startRichExam` với dữ liệu thật.
 *
 * Chỉ admin thấy được — đây là công cụ kiểm thử nội bộ, không phải tính năng
 * cho người học. Xoá file này khi các module thật đã tự gọi engine trực tiếp.
 */

import type { ExamQuestion } from "../../types/exam";
import { registerRoute } from "../../router";
import { renderPage, bindShell } from "../../components/appShell";
import { icon } from "../../components/icons";
import { isAdmin } from "../../state/auth";
import { startRichExam } from "../shared/richExam";

const SAMPLE: ExamQuestion[] = [
  {
    kind: "listening",
    n: 9001,
    en: "What does the woman ask the man to do?",
    ja: "",
    options: [
      { label: "A", en: "Send her a revised invoice", ja: "" },
      { label: "B", en: "Call the accounting department", ja: "" },
      { label: "C", en: "Reschedule the meeting", ja: "" },
      { label: "D", en: "Print a new report", ja: "" },
    ],
    answer: "A",
    multi: false,
    audioUrl: "",
    part: 2,
    totalParts: 4,
    revealAfterAudio: false,
  },
  {
    kind: "reading",
    n: 9002,
    title: "The Silent Language of Trees",
    passageEn:
      "For centuries, foresters assumed that trees compete purely for light, water and nutrients. Recent research overturns this view. Underground fungal networks, sometimes called the wood wide web, connect the root systems of trees across a forest floor.",
    passageJa: "",
    subItems: [
      { id: "s1", kind: "completion", prompt: "Foresters used to believe trees compete for light, water and ___.", answer: "nutrients" },
      {
        id: "s2",
        kind: "mc",
        prompt: "What connects tree root systems?",
        options: [
          { label: "A", en: "Underground fungal networks", ja: "" },
          { label: "B", en: "Bird migration", ja: "" },
        ],
        answer: "A",
      },
    ],
  },
  {
    kind: "writing",
    n: 9003,
    title: "Task 2",
    prompt: "Some people believe unpaid community service should be compulsory in schools. Discuss both views and give your opinion.",
    minWords: 50,
  },
  {
    kind: "matching",
    n: 9004,
    title: "Ghép dịch vụ AWS",
    prompt: "Chọn dịch vụ AWS phù hợp cho từng mô tả.",
    items: [
      { id: "m1", label: "Lưu trữ file tĩnh, phục vụ trang web", options: ["Amazon EC2", "Amazon S3", "AWS Lambda"], answerIndex: 1 },
      { id: "m2", label: "Cơ sở dữ liệu quan hệ có quản lý", options: ["Amazon RDS", "Amazon SQS", "Amazon SNS"], answerIndex: 0 },
    ],
  },
  {
    kind: "accounting",
    n: 9005,
    prompt: "商品¥500,000を仕入れ、代金のうち¥200,000は現金で支払い、残額は掛けとした。",
    accounts: ["仕入", "現金", "買掛金", "売上"],
    correctEntries: [
      { side: "debit", account: "仕入", amount: 500000 },
      { side: "credit", account: "現金", amount: 200000 },
      { side: "credit", account: "買掛金", amount: 300000 },
    ],
  },
];

function mountDemo(root: HTMLElement): void {
  if (!isAdmin()) {
    root.innerHTML = renderPage({
      content: `<div class="page page-body"><div class="empty"><div class="icon-chip lg">${icon("shield")}</div><h3>Chỉ dành cho quản trị viên</h3></div></div>`,
    });
    bindShell(root);
    return;
  }

  const content = `<div class="page page-body">
    <div class="card card-pad">
      <h1 style="margin:0 0 8px">Thử nghiệm 5 dạng câu hỏi mới</h1>
      <p class="text-muted" style="margin:0 0 20px">Dữ liệu mẫu viết sẵn trong code — kiểm tra bộ máy làm bài mới (Nghe, Đọc, Viết, Ghép nối, Bút toán) trước khi các module thật dùng dữ liệu thật.</p>
      <button class="btn btn-primary" data-action="start">${icon("play")}Bắt đầu (5 câu mẫu)</button>
    </div>
  </div>`;
  root.innerHTML = renderPage({ content });
  bindShell(root, "", {
    start: () => {
      startRichExam({
        moduleId: "dev-demo",
        levelId: "",
        stageId: "demo",
        label: "Thử nghiệm 5 dạng mới",
        brandLabel: "Dev",
        questions: SAMPLE,
        durationSec: 20 * 60,
        passPct: 60,
        exitPath: "/thu-nghiem-cau-hoi",
      });
    },
  });
}

export function registerRichExamDemoRoute(): void {
  registerRoute("/thu-nghiem-cau-hoi", mountDemo);
}
