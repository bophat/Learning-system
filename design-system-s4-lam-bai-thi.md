# Design System — S4: Màn hình làm bài thi

> Nối `spec-ui-lam-bai-thi.md` (spec chức năng) với các quy tắc UX/khả năng
> tiếp cận đã kiểm chứng qua công cụ `ui-ux-pro-max`, và khớp với hệ thiết
> kế **đã chốt** của dự án. Đây KHÔNG phải một hướng thẩm mỹ mới — màu/font
> giữ nguyên như hiện có. Tài liệu này trả lời câu hỏi còn lại của spec gốc:
> *cấu trúc, trạng thái, và quy tắc tương tác cụ thể cho từng thành phần.*

---

## 0. Ràng buộc kế thừa — không đổi

Dự án đã chốt cứng, áp dụng cho mọi thành phần mới ở tài liệu này:

- **Hệ màu: đúng 3 mã + đen trắng.** Cam `--brand` (thương hiệu, hành động,
  cảnh báo), xanh lá `--good` (đúng/đạt), đỏ `--bad` (sai/chưa đạt), còn lại
  là xám trung tính (`--bg`, `--surface`, `--ink`...). Xem
  `src/styles/tokens.css`. **Không** thêm hue mới cho bất kỳ thành phần nào
  dưới đây, kể cả gauge điểm, bảng bút toán, hay toggle song ngữ.
- **Không gradient, không kính mờ** (trừ `.modal-scrim`).
- **Một họ chữ**: Be Vietnam Pro (`--font-sans`), IBM Plex Mono cho số/mã.
- **Ngân sách thông tin**: mỗi thẻ trong lưới tối đa 5 mẩu thông tin (mục
  2.9 trong `CONTRACT.md`) — áp dụng cho thẻ đề thi ở S2, thẻ kết quả ở S6.

---

## 1. Bố cục & điểm gãy (khung chung cho S4)

| Breakpoint | Bố cục |
|---|---|
| Desktop ≥1024px | 2 cột cố định: nội dung chính (flex, cuộn riêng) + Question Navigator (280px, cuộn riêng) |
| Tablet 768–1023px | Navigator thu gọn thành **thanh ngang cuộn được** phía trên nội dung, không chiếm cột riêng |
| Mobile <768px | Navigator ẩn vào drawer/bottom-sheet, mở bằng nút nổi ở thanh thao tác dưới cùng (đã có `.mobile-bar` trong `exam.css`) |

**Vi phạm cần tránh (từ kiểm tra UX):** không để nav cố định che nội dung —
nếu thêm thanh cố định mới, cộng `padding-top` bằng đúng chiều cao thanh đó.
Không để bất kỳ thành phần nào (bảng bút toán, split-view đọc, video) tạo
cuộn ngang ở mobile — độ nghiêm trọng **Cao** theo kiểm tra UX.

---

## 2. Component spec

### 2.1 Đồng hồ đếm ngược (đã có, cần vá)

**Trạng thái:** bình thường / cảnh báo (&lt;5 phút) / hết giờ.

**Vá theo kiểm tra UX (mức độ Cao — "Color Only"):** bản spec gốc chỉ ghi
*"đổi màu cảnh báo"*. Đổi màu đơn thuần **không đạt chuẩn tiếp cận** — người
khiếm thị màu sẽ không nhận ra cảnh báo. Bắt buộc kèm thêm **icon nhấp nháy
nhẹ hoặc đổi cả icon** (ví dụ từ `clock` sang `alertTriangle`), không chỉ đổi
màu chữ. Bản hiện tại (`timerClass()` trong `mcExam.ts`) đã đổi class
`is-warn`/`is-low` — cần bổ sung icon, không chỉ màu.

### 2.2 Question Navigator Grid (đã có, cần vá)

4 trạng thái ô: chưa làm / đã làm / đã đánh dấu / đang xem. Bản hiện tại
(`.pnum` trong `mcExam.ts`) đã có sẵn 3/4 trạng thái tương tự.

**Vá theo kiểm tra UX (mức độ Cao — "Touch Target Size"):** ô số câu trên
mobile phải tối thiểu **24×24px** (ngưỡng WCAG 2.2 AA), lý tưởng 44px như
khuyến nghị native. Cách nhau tối thiểu **8px**. Kiểm tra lại kích thước
`.pnum` hiện tại ở breakpoint mobile.

**Vá theo kiểm tra UX (mức độ Cao — "Keyboard Navigation"):** lưới số câu
phải điều hướng được bằng bàn phím — thứ tự tab đi đúng theo thứ tự câu,
không có bẫy bàn phím. *(Lưu ý: dự án đã chủ động bỏ phím tắt tuỳ chỉnh theo
yêu cầu — mục này nói về `Tab`/`Enter` mặc định của trình duyệt, không phải
phím tắt riêng. `<button>` thật đã tự có hành vi này, chỉ cần không phá.)*

### 2.3 Audio Player khoá tua (mới)

**Không tìm thấy mẫu UX khớp trực tiếp trong CSDL công cụ** (đã thử "audio
player no scrub locked replay", 0 kết quả) — spec dưới đây tổng hợp từ yêu
cầu chức năng gốc + nguyên tắc chung.

- Chỉ hai nút: Play / Pause. **Không có** thanh tua kéo được.
- Thanh tiến trình **chỉ hiển thị**, không có `cursor: pointer`, không bắt
  sự kiện click/drag.
- Trạng thái: chưa phát / đang phát / đã phát xong (khoá vĩnh viễn cho phần
  đó — nút Play biến mất hoặc disabled, không cho phát lại).
- Hiển thị rõ "Part 2/4" dạng badge, không chỉ dựa vào số thứ tự ẩn.
- Với JLPT: dạng câu hỏi "nghe xong mới hiện đáp án" — đáp án render dạng
  `display:none` hoặc skeleton mờ cho tới khi audio phần đó phát xong, có
  thông báo rõ *"Đáp án sẽ hiện sau khi nghe xong"* thay vì im lặng.
- Không tự phát (autoplay) khi vào màn hình — chờ người dùng bấm Play, có
  cảnh báo trước ở S3 nếu người dùng chưa có tai nghe.

### 2.4 Passage Reader + Highlight (Reading — nối trực tiếp backend đã có)

**Đã có sẵn phần lớn hạ tầng**: `src/components/highlighter.ts` (toolbar
tô màu, popup ghi chú) + `src/state/highlights.ts` (lưu trên Supabase, đồng
bộ đa thiết bị). Component này của S4 **tái dùng nguyên**, không dựng lại.

- Split-view 2 cột độc lập cuộn: đoạn văn trái, câu hỏi phải. Ở mobile, xếp
  dọc với tab chuyển "Đoạn văn" / "Câu hỏi" thay vì split ngang (split ngang
  ở màn hẹp sẽ vỡ, mỗi cột còn quá ít chỗ).
- Highlight: đã hỗ trợ 4 màu + ghi chú qua `highlighter.ts`. **Khoảng trống
  cần UI hoàn thiện**: highlight chưa được vẽ lại (`<mark>`) sau khi tải lại
  trang — dữ liệu đã lưu đúng, sổ tay đọc đúng, chỉ thiếu bước vẽ lại vào
  DOM khi render lại đoạn văn. `Highlight.field`/`startOffset`/`endOffset`
  (tuỳ chọn, đã có trong schema) dành cho việc này.
- Matching Headings: dropdown làm mặc định trên mọi kích thước màn hình
  (xem 2.5 — lý do không phải chỉ để tương thích mobile, mà là **yêu cầu
  khả năng tiếp cận WCAG 2.2 AA**), kéo-thả là lớp tăng cường tuỳ chọn.
- Sentence Completion: ô nhập inline ngay trong dòng tóm tắt — dùng
  `.input` với `display:inline-block; width:auto` thay vì tách khối riêng.

### 2.5 Matching / Kéo-thả (mới — có vi phạm khả năng tiếp cận cần sửa spec gốc)

**Vá theo kiểm tra UX (mức độ Cao — WCAG 2.2 "Dragging Movements"):** spec
gốc mô tả kéo-thả là "chính", dropdown là "phương án dự phòng cho mobile".
**Ngược lại mới đúng chuẩn**: WCAG 2.2 AA yêu cầu bắt buộc có cách thao tác
**không cần kéo** cho MỌI nền tảng, không riêng mobile — vì nhiều người
dùng bàn phím/switch-control trên desktop cũng không kéo-thả được.

→ **Dropdown/chọn bằng nút là chế độ chính (bắt buộc hoạt động mọi lúc)**,
kéo-thả là lớp tăng cường trải nghiệm cho ai dùng chuột/cảm ứng thành thạo,
luôn đi kèm nút "Di chuyển lên/xuống" cạnh mỗi mục thay vì chỉ có tay cầm
kéo. Áp dụng cho cả Matching Headings (2.4) lẫn Boki nếu có dạng kéo-thả.

### 2.6 Text Editor + đếm từ (Writing)

- Textarea lớn, đếm từ hiện góc dưới phải, cập nhật theo thời gian thực.
- **Vá theo kiểm tra UX (mức độ Cao — "Content Jumping"):** dành sẵn khoảng
  trống cố định cho số đếm (ví dụ `min-width` đủ cho "9999 từ"), không để
  con số thay đổi độ dài làm bố cục nhảy mỗi khi gõ.
- **Vá theo kiểm tra UX (mức độ Cao — "Contextual Live Badge Updates"):**
  nếu có cảnh báo tự động dạng "còn thiếu N từ" cập nhật khi gõ, dùng
  `aria-live="polite"` với **một câu hoàn chỉnh** ("Còn thiếu 40 từ để đạt
  mức tối thiểu"), không phát mỗi số đếm riêng lẻ — tránh trình đọc màn hình
  đọc ra số dồn dập mỗi ký tự gõ.
- Cảnh báo dưới mức tối thiểu: đổi màu **kèm text rõ ràng** ("Còn thiếu 40
  từ"), không chỉ đổi màu số đếm (cùng nguyên tắc 2.1).
- Auto-save mỗi 10–30s — tái dùng cơ chế `saveSession`/debounce đã có trong
  `state/session.ts` thay vì viết cơ chế lưu mới.

### 2.7 Recorder (Speaking)

**Không tìm thấy mẫu UX khớp trong CSDL công cụ.** Theo yêu cầu chức năng
gốc:

- 2 giai đoạn tách biệt rõ ràng bằng nhãn text: "Chuẩn bị" → "Đang ghi âm".
  Không dùng riêng màu để phân biệt hai giai đoạn (cùng nguyên tắc 2.1).
- Xin quyền micro **trước khi vào bài** (ở S3), không xin giữa chừng lúc
  đếm giờ đang chạy — mất thời gian thi thật nếu người dùng phải bấm "Cho
  phép" giữa lúc đồng hồ đang đếm.
- Nút ghi âm: 3 trạng thái thị giác rõ (chờ / đang ghi có animation nhịp đập
  nhẹ, tôn trọng `prefers-reduced-motion` / đã ghi xong).

### 2.8 Bảng bút toán debit/credit (Boki)

- Dùng `inputmode="numeric"` cho ô nhập số tiền (bàn phím số trên mobile,
  không phải bàn phím chữ mặc định — mức độ Trung bình theo kiểm tra UX).
- Validate cân bằng hai cột **ngay khi nhập** (`onBlur` mỗi dòng), không đợi
  tới lúc nộp bài — đúng nguyên tắc "Inline Validation" (mức độ Trung bình).
- Dropdown chọn tài khoản kế toán: cân nhắc ô tìm kiếm gõ-lọc nếu danh mục
  tài khoản dài (Boki có hàng trăm tài khoản chuẩn), tránh dropdown cuộn dài
  vô tận.

### 2.9 Toggle song ngữ (Tokutei)

Đã có mẫu tương tự trong app: `.segmented` (dùng cho chuyển EN/日本語 ở màn
làm bài AWS hiện tại) — tái dùng nguyên component này, chỉ đổi nhãn.

**Video (nếu có):** theo kiểm tra UX (mức độ Trung bình — "Auto-Play
Video"): **không** tự phát, có nút Play rõ ràng, có phụ đề bật/tắt được
(`<track kind="captions">`), dừng hẳn khi cuộn ra khỏi khung nhìn.

### 2.10 Score/Band Gauge (S6)

- Tái dùng `ring()` đã có trong `src/components/ui.ts` (đang dùng cho vòng
  phần trăm kết quả AWS) — không dựng gauge mới.
- Với chứng chỉ có điểm sàn từng phần (JLPT, Boki 1級): mỗi phần hiện badge
  **"Đạt"/"Chưa đạt"** riêng bên cạnh điểm số — dùng `.badge-good`/`.badge-bad`
  đã có, **không chỉ tô màu progress bar** (cùng nguyên tắc 2.1, và tránh
  đúng cái bẫy spec gốc cảnh báo: "tổng điểm đủ nhưng vẫn trượt vì 1 phần
  dưới sàn" — phải hiện chữ "Chưa đạt" tường minh, không để người học tự suy
  luận từ màu).

### 2.11 Modal xác nhận nộp bài (đã có)

Bản hiện tại (`askSubmit()` trong `mcExam.ts`) đã đúng tinh thần spec: đếm
câu chưa làm, 2 nút rõ ràng. Không cần sửa.

---

## 3. Bảng đối chiếu: đã có sẵn / cần dựng mới

| Component | Trạng thái trong code hiện tại |
|---|---|
| Đồng hồ đếm ngược | ✅ có — cần vá thêm icon cảnh báo (2.1) |
| Question Navigator | ✅ có — cần kiểm tra kích thước chạm mobile (2.2) |
| Modal nộp bài | ✅ có, đúng spec |
| Highlight văn bản + ghi chú | ✅ có (backend + UI), thiếu bước vẽ lại `<mark>` sau tải lại trang |
| Toggle song ngữ | ✅ có mẫu (`.segmented`), tái dùng được |
| Score gauge | ✅ có (`ring()`), tái dùng được |
| Audio player khoá tua | ❌ chưa có |
| Split-view đọc hiểu độc lập cuộn | ❌ chưa có |
| Matching/kéo-thả + dropdown | ❌ chưa có |
| Text editor đếm từ | ❌ chưa có |
| Recorder | ❌ chưa có |
| Bảng bút toán debit/credit | ❌ chưa có |

---

## 4. Nguồn tra cứu

Các mục "Vá theo kiểm tra UX" trong tài liệu này lấy từ `ui-ux-pro-max`
(`--domain ux`), truy vấn ngày 2026-08-26: *countdown timer warning state
color, touch target size spacing, keyboard navigation grid arrow keys, drag
drop mobile fallback dropdown, word count validation textarea, split pane
independent scroll, autosave draft data loss prevention*. Hai truy vấn
không có kết quả khớp trong CSDL công cụ (đã ghi rõ ở từng mục): *audio
player no scrub locked replay*, *recorder microphone permission*.
