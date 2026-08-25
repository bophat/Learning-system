/**
 * Danh mục huy hiệu. Để trong code chứ không trong CSDL vì điều kiện đạt là
 * logic, không phải dữ liệu — sửa điều kiện là sửa code, không phải sửa bảng.
 * CSDL chỉ ghi ai đã đạt cái nào (`user_badges`).
 */

export interface Badge {
  code: string;
  name: string;
  description: string;
  iconName: string;
}

export const BADGES: Badge[] = [
  { code: "first-100", name: "Trăm câu đầu tiên", description: "Trả lời 100 câu hỏi.", iconName: "list" },
  { code: "first-500", name: "Năm trăm câu", description: "Trả lời 500 câu hỏi.", iconName: "layers" },
  { code: "first-exam", name: "Lần thi thử đầu", description: "Hoàn thành một bài thi thử có bấm giờ.", iconName: "trophy" },
  { code: "perfect-exam", name: "Trọn vẹn", description: "Đạt 100% trong một bài thi thử.", iconName: "star" },
  { code: "pass-exam", name: "Vượt ngưỡng", description: "Đạt trên ngưỡng đậu trong một bài thi thử.", iconName: "award" },
  { code: "wrong-bank-clear", name: "Sạch câu sai", description: "Làm đúng lại toàn bộ ngân hàng câu sai của một chứng chỉ.", iconName: "checkCircle" },
  { code: "streak-7", name: "Bảy ngày liền", description: "Học đủ chỉ tiêu 7 ngày liên tiếp.", iconName: "zap" },
  { code: "streak-30", name: "Ba mươi ngày liền", description: "Học đủ chỉ tiêu 30 ngày liên tiếp.", iconName: "bolt" },
  { code: "srs-100", name: "Trăm lượt ôn", description: "Hoàn thành 100 lượt ôn theo lịch lặp lại ngắt quãng.", iconName: "refresh" },
  { code: "theory-done", name: "Chắc lý thuyết", description: "Đọc xong toàn bộ bài giảng của một chứng chỉ.", iconName: "book" },
];

export function getBadge(code: string): Badge | undefined {
  return BADGES.find((b) => b.code === code);
}
