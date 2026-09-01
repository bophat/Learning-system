# Spec UI — Màn hình làm bài thi (theo 4 nhóm chứng chỉ)

> Spec chức năng/UX (screens, components, states, interaction) để đưa vào
> Claude Design renew giao diện phần "làm bài thi". Không chốt bảng màu/
> font cụ thể — phần đó nên để Claude Design đề xuất theo brief riêng,
> spec này tập trung vào **cấu trúc màn hình, thành phần cần có, và sự
> khác biệt bắt buộc giữa 4 nhóm chứng chỉ** (vì mỗi nhóm có dạng câu hỏi
> rất khác nhau — gộp chung 1 UI cho tất cả sẽ thiếu tính năng ở đâu đó).

---

## 0. Vì sao 4 nhóm cần UI khác nhau (tóm tắt từ spec nội dung)

| Nhóm | Dạng câu hỏi đặc trưng | Yêu cầu UI riêng |
|---|---|---|
| **Ngôn ngữ** (JLPT/HSK/TOEIC/IELTS) | Nghe (audio phát 1 lần), Đọc (đoạn văn dài + câu hỏi), Viết (luận/tóm tắt), Nói (ghi âm theo giờ) | Audio player khoá replay, split-view passage/câu hỏi, text editor đếm từ, recorder có đếm ngược chuẩn bị |
| **Kỹ thuật** (FE/AWS/Azure/Claude/Microsoft) | Trắc nghiệm 1 đáp án, multiple-response, case-study dài (nhiều câu chung 1 tình huống), đôi khi có snippet code | Hiển thị code block, câu hỏi nhóm theo case-study dùng chung ngữ cảnh phía trên |
| **Kinh doanh** (Marketing/Boki/PMO/SAP) | Trắc nghiệm, matching/kéo-thả, tính toán (Boki có bút toán), case-study | Widget matching kéo-thả, ô nhập số/công thức cho Boki |
| **Tokutei** | Trắc nghiệm song ngữ (Nhật + tiếng mẹ đẻ), nghe tình huống công việc, đôi khi có video | Toggle song ngữ, video player |

---

## 1. Sitemap — luồng màn hình

```
[Trang chủ / chọn nhóm chứng chỉ]
        │
        ▼
[S1: Danh sách chứng chỉ trong nhóm]  (vd trong "Ngôn ngữ": JLPT, HSK, TOEIC, IELTS)
        │
        ▼
[S2: Danh sách bộ đề / đề thi]  (vd JLPT: N1, N2, N3... ; IELTS: Cambridge 20, Vol 9...)
        │
        ▼
[S3: Trang tổng quan đề thi]  (trước khi bắt đầu: thời gian, số câu, hướng dẫn, nút Bắt đầu)
        │
        ▼
[S4: Màn hình làm bài]  ◄──── vòng lặp qua từng câu/phần ────┐
        │                                                     │
        │  (bấm Nộp bài / hết giờ)                            │
        ▼                                                     │
[S5: Modal xác nhận nộp bài]  ──(huỷ, quay lại làm tiếp)──────┘
        │
        ▼
[S6: Màn hình kết quả]  (điểm số, band, breakdown theo phần)
        │
        ▼
[S7: Màn hình xem lại đáp án]  (từng câu: đáp án đã chọn / đáp án đúng / giải thích)
```

---

## 2. Spec từng màn hình

### S1 — Danh sách chứng chỉ trong nhóm

- Grid/list các thẻ chứng chỉ (JLPT, HSK, TOEIC, IELTS... hoặc FE, AWS,
  Azure... tuỳ nhóm đang chọn).
- Mỗi thẻ hiển thị: tên chứng chỉ, logo/icon, số lượng đề hiện có, mô tả
  ngắn (1 dòng).
- Filter/tab theo 4 nhóm lớn (Ngôn ngữ / Kỹ thuật / Kinh doanh / Tokutei)
  ở đầu trang — người dùng chuyển nhóm không rời trang.

### S2 — Danh sách bộ đề / đề thi cụ thể

- Với chứng chỉ có phân cấp độ (JLPT: N1-N5; AWS: Foundational/
  Associate/Professional): hiển thị **tab hoặc filter theo cấp độ** ở
  đầu, danh sách đề cập nhật theo cấp độ đang chọn.
- Với chứng chỉ chia theo bộ sách (IELTS: Cambridge 20, Vol 9): mỗi bộ là
  1 card, bấm vào mở rộng/điều hướng sang danh sách đề cụ thể trong bộ.
- Mỗi thẻ đề thi hiển thị: tên đề, thời gian làm bài, số câu hỏi, trạng
  thái (chưa làm / đang làm dở / đã hoàn thành + điểm gần nhất), badge
  kỹ năng nếu đề gộp nhiều kỹ năng (Reading+Listening+Writing+Speaking).
- Nút hành động: "Bắt đầu" (chưa làm) / "Tiếp tục" (đang làm dở) / "Làm
  lại" + "Xem kết quả" (đã hoàn thành).

### S3 — Trang tổng quan đề thi (trước khi vào làm)

Bắt buộc có trước khi vào S4, tránh vào thẳng bài thi mà không đọc hướng
dẫn (đặc biệt quan trọng cho Nghe — không được phát lại):

- Tên đề, chứng chỉ, cấp độ.
- Bảng cấu trúc đề: liệt kê từng phần (Reading/Listening/...), số câu,
  thời gian mỗi phần — tham chiếu đúng spec nội dung đã có (vd IELTS
  Listening 4 part x 10 câu / 30 phút).
- Hướng dẫn đặc biệt theo loại đề, ví dụ:
  - Ngôn ngữ - Nghe: "Audio chỉ phát 1 lần, không tua lại được."
  - Kỹ thuật: "Có thể đánh dấu để xem lại trước khi nộp bài."
  - Tokutei: chọn ngôn ngữ hiển thị song song (Nhật/Việt/Anh...).
- Checkbox xác nhận đã đọc hướng dẫn (tuỳ chọn bật/tắt theo config).
- Nút "Bắt đầu làm bài" — bấm xong mới bắt đầu đếm giờ.

### S4 — Màn hình làm bài (core screen)

**Layout khung chung** (áp dụng mọi nhóm):

```
+-----------------------------------------------------------+
| Header: Ten de | Tab chuyen phan (neu de gop nhieu ky nang) |
|         | Dong ho dem nguoc | Nut Nop bai                   |
+---------------------------------+---------------------------+
|                                 |  Question Navigator        |
|   Vung noi dung chinh           |  (grid so cau, mau theo    |
|   (doan van / audio / cau hoi   |  trang thai: da lam/chua   |
|   / code block / video...)      |  lam/da danh dau)          |
|                                 |                             |
|                                 |  Nut Cau truoc / Cau sau    |
+---------------------------------+---------------------------+
```

- **Đồng hồ đếm ngược**: luôn hiển thị, đổi màu cảnh báo khi còn <5 phút
  (vd chuyển sang màu cam/đỏ + rung nhẹ 1 lần), tự động nộp bài khi hết
  giờ (có thông báo "Hết giờ, bài thi đã được nộp tự động" thay vì mất
  dữ liệu).
- **Question Navigator**: lưới số thứ tự câu hỏi, mỗi ô 1 trạng thái màu
  khác nhau — Chưa làm / Đã làm / Đã đánh dấu xem lại (flag) / Đang xem.
  Bấm vào số để nhảy thẳng tới câu đó (không bắt buộc làm tuần tự, trừ
  khi đề yêu cầu khoá thứ tự — vd 1 số bài Nghe).
- **Nút đánh dấu (flag)**: mỗi câu có icon cờ để đánh dấu "xem lại sau",
  hiển thị đồng bộ trên Question Navigator.
- **Tab chuyển phần kỹ năng**: chỉ hiện khi đề đã gộp nhiều kỹ năng (theo
  hướng gộp Reading+Listening đã làm ở extension) — mỗi tab là 1 kỹ
  năng, có thể khoá chuyển tab nếu đề yêu cầu làm tuần tự Listening trước
  Reading (tuỳ rule từng chứng chỉ).

**Biến thể nội dung chính theo dạng câu hỏi:**

**(a) Trắc nghiệm thuần** (Kỹ thuật, Kinh doanh, phần lớn Tokutei):
- Câu hỏi ở trên, danh sách đáp án bên dưới (radio button 1 đáp án /
  checkbox nếu multiple-response — ghi rõ "Chọn 2 đáp án đúng" trên đề).
- Nếu là case-study (nhiều câu dùng chung 1 tình huống dài — thường gặp ở
  AWS Professional, Azure Expert): tình huống cố định ở panel trái/trên,
  cuộn riêng độc lập với panel câu hỏi bên phải/dưới — không bắt người
  dùng cuộn lại từ đầu mỗi khi chuyển câu.
- Nếu có code snippet: hiển thị trong khối code có số dòng, font mono,
  syntax highlight nếu xác định được ngôn ngữ.

**(b) Reading** (IELTS/TOEIC/JLPT/HSK Đọc):
- Split-view 2 cột: đoạn văn bên trái (cuộn độc lập), câu hỏi bên phải
  (cuộn độc lập).
- Cho phép **highlight/bôi màu văn bản** (tối thiểu 1 màu, lý tưởng có
  ghi chú) — tính năng phổ biến trong thi IELTS thật, giúp tìm lại
  thông tin.
- Với câu dạng Matching Headings: hiển thị danh sách heading rời (kéo-thả
  hoặc dropdown) để gán vào từng đoạn.
- Với câu dạng Sentence Completion/Summary: ô nhập trực tiếp inline
  trong đoạn tóm tắt (không tách riêng thành câu hỏi rời).

**(c) Listening** (IELTS/TOEIC/JLPT/HSK Nghe):
- Audio player tối giản: nút Play/Pause, thanh tiến trình **chỉ hiển
  thị, không cho tua/kéo** (đúng luật thi thật — nghe 1 lần).
- Tự động chuyển sang câu tiếp theo/phần tiếp theo khi audio phần đó kết
  thúc (không cho quay lại phần audio đã qua).
- Hiển thị rõ đang ở Part/Section mấy trong tổng số (vd "Part 2/4").
- Với JLPT: có dạng câu hỏi phải nghe xong mới hiện đáp án để chọn (tránh
  đọc trước đáp án ảnh hưởng bài thi thật) — cần cấu hình bật/tắt theo
  loại câu.

**(d) Writing** (IELTS/HSK/JLPT không có nhưng TOEIC S&W có, Boki bút
toán cũng thuộc dạng nhập liệu tương tự):
- Đề bài/prompt cố định phía trên (hoặc panel trái nếu có biểu đồ/hình
  ảnh kèm theo — Task 1 IELTS).
- Text editor đơn giản bên dưới, có **đếm số từ** real-time, cảnh báo màu
  khi dưới mức tối thiểu yêu cầu (vd IELTS Task 2 < 250 từ).
- Auto-save định kỳ (mỗi 10-30s) để tránh mất bài khi rớt mạng/crash.

**(e) Speaking** (IELTS/HSK/JLPT không thi máy nhưng nếu làm bản luyện
tập ghi âm):
- Hiển thị câu hỏi/thẻ đề bài.
- Đồng hồ đếm ngược riêng cho 2 giai đoạn: **thời gian chuẩn bị** (vd 1
  phút, không ghi âm) → **thời gian trả lời** (vd 2 phút, tự động ghi âm,
  tự dừng khi hết giờ).
- Nút ghi âm có trạng thái rõ ràng (chuẩn bị / đang ghi / đã ghi xong),
  cho nghe lại trước khi qua câu tiếp (nếu đề cho phép).

**(f) Matching/Kéo-thả** (SAP, 1 số dạng Boki, Matching Headings IELTS):
- Widget kéo-thả 2 cột, hoặc dropdown chọn nếu ưu tiên tương thích mobile
  (kéo-thả khó dùng trên màn hình cảm ứng nhỏ) — nên có **cả 2 chế độ**,
  tự chuyển sang dropdown khi màn hình <768px.

**(g) Tính toán/Bút toán** (Boki):
- Bảng nhập liệu dạng debit/credit (借方/貸方), có dropdown chọn tài
  khoản kế toán + ô nhập số tiền, tự tính tổng 2 cột để đối chiếu cân
  bằng (validate ngay khi nhập, không đợi nộp bài mới báo lỗi).

**(h) Song ngữ** (Tokutei):
- Toggle hiển thị song song Nhật/Việt (hoặc ngôn ngữ mẹ đẻ khác) — không
  thay thế hẳn 1 ngôn ngữ, để người học vẫn tiếp xúc tiếng Nhật gốc.
- Nếu có video tình huống công việc: player full-width phía trên câu
  hỏi, có phụ đề tuỳ chọn bật/tắt.

### S5 — Modal xác nhận nộp bài

- Hiển thị tóm tắt: số câu đã làm / tổng số câu, số câu còn đánh dấu
  "xem lại", số câu **chưa trả lời** (nhấn mạnh nếu >0 — dễ bỏ sót).
- 2 nút: "Quay lại làm tiếp" (đóng modal) / "Nộp bài" (xác nhận).
- Nếu hết giờ tự động: bỏ qua modal này, hiện thẳng thông báo "Hết giờ —
  bài thi đã được nộp".

### S6 — Màn hình kết quả

- Điểm/band tổng lớn, nổi bật ở đầu trang.
- Breakdown theo từng phần kỹ năng (nếu đề gộp nhiều kỹ năng): mỗi phần 1
  điểm riêng + progress bar trực quan.
- Với chứng chỉ có điểm sàn từng phần (JLPT, Boki 1級): hiển thị rõ
  **phần nào đạt / phần nào KHÔNG đạt sàn** dù tổng điểm đủ — tránh hiểu
  nhầm "đậu" khi thực ra rớt vì 1 phần dưới sàn.
- Thời gian đã dùng / tổng thời gian cho phép.
- Nút "Xem lại đáp án" (→ S7) và "Làm lại đề này" / "Đề tiếp theo".

### S7 — Màn hình xem lại đáp án

- Danh sách toàn bộ câu hỏi, mỗi câu hiển thị: đáp án đã chọn (tô màu
  đỏ nếu sai), đáp án đúng (tô màu xanh), giải thích ngắn nếu có sẵn dữ
  liệu.
- Filter nhanh: "Chỉ xem câu sai" / "Chỉ xem câu đã đánh dấu" — hữu ích
  khi đề dài 40-100 câu, không muốn cuộn hết.
- Với Reading/Listening: bấm vào câu có thể nhảy lại đúng vị trí trong
  đoạn văn/thời điểm audio tương ứng (nếu dữ liệu có timestamp).

---

## 3. Component list cần thiết kế trong Claude Design

| Component | Ghi chú |
|---|---|
| Đồng hồ đếm ngược (Countdown Timer) | 3 trạng thái màu: bình thường / cảnh báo (<5p) / hết giờ |
| Question Navigator Grid | 4 trạng thái ô: chưa làm / đã làm / đã đánh dấu / đang xem |
| Audio Player (khoá tua) | Khác audio player thường — không có thanh tua kéo được |
| Passage Reader + Highlight | Đoạn văn dài, hỗ trợ bôi màu/ghi chú, cuộn độc lập |
| Matching/Drag-drop widget | Có 2 chế độ: kéo-thả (desktop) / dropdown (mobile) |
| Text Editor + đếm từ | Cho Writing, cảnh báo khi dưới số từ tối thiểu |
| Recorder widget | 2 giai đoạn chuẩn bị/trả lời, có nghe lại |
| Bảng bút toán debit/credit | Riêng cho Boki, tự validate cân bằng |
| Toggle song ngữ | Riêng cho Tokutei |
| Score/Band gauge | Hiển thị điểm dạng đồng hồ đo hoặc thanh progress, có ngưỡng đạt/không đạt |
| Modal xác nhận nộp bài | Tóm tắt số câu chưa làm |

---

## 4. Responsive & Accessibility

- Breakpoint gợi ý: Desktop (≥1024px) hiển thị đủ 2 cột (nội dung +
  Question Navigator); Tablet (768-1023px) Navigator thu gọn thành thanh
  ngang cuộn được phía trên hoặc dưới; Mobile (<768px) Navigator ẩn vào
  drawer/bottom-sheet mở bằng nút riêng, ưu tiên toàn màn hình cho nội
  dung câu hỏi.
- Giữ nguyên tắc **quality floor**: responsive đến mobile, focus state rõ
  ràng cho điều hướng bàn phím (quan trọng vì đây là màn hình thi — có
  người dùng thao tác nhanh bằng phím tắt số/mũi tên để chuyển câu), tôn
  trọng `prefers-reduced-motion`.
- Với Listening/Speaking: đảm bảo có phương án cho người dùng không có
  tai nghe/mic (thông báo rõ trước khi vào bài, không để lỗi im lặng).

---

## 5. Gợi ý bước tiếp theo với Claude Design

Spec này là **bản chức năng/UX**, chưa chốt hướng thẩm mỹ (màu sắc, font,
phong cách). Khi đưa vào Claude Design, nên:

1. Đưa cả spec nội dung (cấu trúc đề thi 4 nhóm) + spec UI này làm brief.
2. Để Claude Design tự đề xuất hướng thẩm mỹ theo đúng tinh thần "mỗi
   nhóm 1 sắc thái riêng" nếu muốn phân biệt trực quan (vd nhóm Ngôn ngữ
   ấm áp/thân thiện, nhóm Kỹ thuật gọn/kỹ thuật hơn, Tokutei cần rõ ràng
   song ngữ) — hoặc yêu cầu 1 hệ thống thống nhất xuyên suốt nếu ưu tiên
   nhất quán thương hiệu.
3. Ưu tiên thiết kế trước màn hình **S4 (làm bài)** vì đây là màn hình
   phức tạp nhất và có nhiều biến thể nhất — các màn hình còn lại
   (S1-S3, S6-S7) đơn giản hơn, có thể suy ra từ cùng 1 design system
   sau khi S4 đã ổn.
