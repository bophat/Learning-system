# ÔnThi — nền tảng luyện thi chứng chỉ

Web app luyện thi nhiều chứng chỉ (AWS SAA-C03, AP 応用情報, và khung sẵn cho JLPT/FE).
Mỗi chứng chỉ ôn theo đúng cấu trúc đề thi thật của nó — đúng số câu, đúng thời gian,
đúng cách chấm — thay vì dùng chung một khuôn "câu hỏi + đáp án".

> **Đang có hai bên cùng làm dự án này?** Đọc [CONTRACT.md](CONTRACT.md) trước — file đó
> quy định hệ màu, quy tắc cấu trúc, ranh giới sở hữu file và là nơi hai bên nhắn nhau.

Người dùng đăng nhập bằng tài khoản riêng; ngân hàng đề thi và toàn bộ tiến trình học
nằm trên **Supabase**, nên đổi máy hay đổi trình duyệt vẫn thấy nguyên tiến trình.

---

## Cách 1: dùng Supabase đám mây

Cần Node.js 20+ và một dự án Supabase (bản miễn phí là đủ).

### 1. Tạo dự án Supabase

Vào [supabase.com](https://supabase.com) → **New project**. Chờ dự án khởi tạo xong.

### 2. Tạo lược đồ cơ sở dữ liệu

Mở **SQL Editor** trong Supabase Dashboard, dán toàn bộ nội dung
[`supabase/schema.sql`](supabase/schema.sql) rồi bấm **Run**. File này tạo các bảng,
Row Level Security và trigger tạo hồ sơ người dùng. Chạy lại nhiều lần cũng không sao.

### 3. Khai báo khoá

Sao chép `.env.example` thành `.env.local` rồi điền giá trị lấy ở
**Project Settings → API**:

```bash
cp .env.example .env.local
```

| Biến | Dùng ở đâu | Ghi chú |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | web app | công khai |
| `VITE_SUPABASE_ANON_KEY` | web app | công khai, mọi quyền do RLS kiểm soát |
| `SUPABASE_SERVICE_ROLE_KEY` | chỉ script nạp dữ liệu | **bí mật** — bỏ qua toàn bộ RLS, không bao giờ đưa lên git |

### 4. Nạp ngân hàng câu hỏi

```bash
npm install
node scripts/seed.mjs
```

Script đọc thư mục `seed/` và đẩy lên Supabase: 4 chứng chỉ, 904 câu AWS SAA-C03 và
16 câu minh hoạ cho AP. Thêm `--reset` để xoá câu hỏi cũ trước khi nạp, hoặc truyền
tên chứng chỉ (`node scripts/seed.mjs aws`) để chỉ nạp một phần.

### 5. Chạy app và tự cấp quyền quản trị

```bash
npm run dev
```

Đăng ký một tài khoản trong app, sau đó chạy trong SQL Editor:

```sql
update public.profiles set role = 'admin' where email = 'email-cua-ban@example.com';
```

Đăng nhập lại là thấy mục **Quản trị** trên thanh điều hướng.

### 6. Bật đăng nhập Google (tuỳ chọn)

Nút "Tiếp tục với Google" đã có sẵn. Để nó hoạt động: tạo OAuth client bên Google Cloud
rồi điền Client ID/Secret vào **Authentication → Providers → Google** trong Supabase.
Chưa bật thì bấm vào nút sẽ báo "Đăng nhập Google chưa được bật trong dự án Supabase".

---

## Cách 2: chạy Supabase ngay trên máy (Docker)

Không cần tài khoản Supabase, hợp để thử nhanh hoặc phát triển offline. Cần **Docker
Desktop đang chạy**.

```bash
npm install
npm run db:start          # dựng Postgres + Auth + API trong Docker, áp dụng schema
```

Lệnh trên in ra `API URL`, `anon key`, `service_role key` của bản local. Điền vào
`.env.local`:

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<anon key vừa in ra>
SUPABASE_SERVICE_ROLE_KEY=<service_role key vừa in ra>
```

Rồi nạp dữ liệu, tạo tài khoản quản trị và chạy app:

```bash
npm run seed
node scripts/create-admin.mjs admin@local.test matkhau123 "Quản trị"
npm run dev
```

Các lệnh khác:

| Lệnh | Việc |
| --- | --- |
| `npm run db:start` | Bật stack Supabase local |
| `npm run db:stop` | Tắt stack (dữ liệu vẫn còn) |
| `npm run db:reset` | Xoá sạch và dựng lại CSDL từ `supabase/schema.sql` |
| `npm run db:sync` | Chép `schema.sql` sang `supabase/migrations/` |

Studio (giao diện quản lý CSDL local) nằm ở <http://127.0.0.1:54323>, hộp thư test
(Inbucket) ở <http://127.0.0.1:54324> — email xác nhận và đặt lại mật khẩu ở bản local
rơi vào đó chứ không gửi ra ngoài.

`supabase/schema.sql` là file gốc; `supabase/migrations/00000000000000_init.sql` chỉ là
bản sao do `npm run db:sync` tạo ra, nên sửa schema thì sửa ở `schema.sql`.

---

## Build & triển khai

```bash
npm run build
```

Kết quả là `dist/index.html` — một file HTML duy nhất (~420 KB, đã nhúng CSS/JS), tải lên
bất kỳ hosting tĩnh nào (Netlify, Vercel, GitHub Pages). Câu hỏi không nằm trong file này
mà được tải từ Supabase lúc chạy, nên **cần có mạng mới ôn được**.

Nhớ khai báo `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY` ở phần biến môi trường của
dịch vụ hosting, và thêm tên miền thật vào **Authentication → URL Configuration** trong
Supabase để link xác nhận email/đặt lại mật khẩu trỏ đúng chỗ.

---

## Các màn hình

| Route | Màn hình |
| --- | --- |
| `/dang-nhap` | Đăng nhập / đăng ký / quên mật khẩu. Chưa đăng nhập thì mọi đường dẫn đều về đây |
| `/` | Trang chủ: hero, thẻ chứng chỉ, tính năng, các bước |
| `/chung-chi` | Danh mục chứng chỉ: tìm kiếm, lọc, bảng so sánh cấu trúc đề |
| `/tien-trinh` | Tiến trình: thống kê, theo từng chứng chỉ, lịch sử làm bài |
| `/huong-dan` | Hướng dẫn sử dụng, phím tắt, hỏi đáp |
| `/tai-khoan` | Thông tin tài khoản, đổi tên hiển thị, đăng xuất, xoá dữ liệu học tập |
| `/quan-tri` | **Chỉ admin** — nạp đề thi, xem số liệu, xoá đề của một chứng chỉ |
| `/aws`, `/ap` | Tổng quan từng chứng chỉ |
| `/aws/browse` | Duyệt câu hỏi: tìm kiếm, lọc, song ngữ, lưu câu |
| `/aws/thiet-lap` | Thiết lập bài làm: cách chấm, nguồn câu, số câu, thứ tự |
| `/ap/buoi-chieu` · `/ap/tu-luan` · `/ap/hoan-thanh` | Chọn 5/11 đề tự luận → viết bài → tổng kết |
| `/lam-bai` · `/ket-qua` | Màn làm bài trắc nghiệm dùng chung + màn kết quả |
| `/sap-co/:id` | Chứng chỉ chưa có dữ liệu: mô tả cấu trúc đề |

---

## Nạp đề thi mới

Vào **Quản trị → Tải đề thi lên**, chọn chứng chỉ + chặng thi rồi thả file vào. Nhận
JSON hoặc CSV; file được kiểm tra trước (trùng số câu, đáp án không khớp phương án,
thiếu đề bài...) và chỉ cho nạp khi không còn lỗi.

Câu hỏi ghi đè theo cặp **chứng chỉ + chặng + số câu**, nên nạp lại cùng một file là
cập nhật chứ không tạo bản trùng.

**JSON** (giữ được bản dịch và câu tự luận):

```json
[
  {
    "n": 1,
    "en": "Which storage class fits rarely accessed data?",
    "ja": "めったにアクセスしないデータに適したストレージクラスは?",
    "opts": [
      { "l": "A", "en": "S3 Standard-IA", "ja": "S3 Standard-IA" },
      { "l": "B", "en": "S3 Standard", "ja": "S3 Standard" }
    ],
    "ans": "A",
    "multi": false,
    "domain": "Storage"
  }
]
```

**CSV** (xuất từ Excel/Google Sheets):

```csv
n,en,ja,A,B,C,D,answer,multi,domain
1,"Đề bài câu 1","日本語",Phương án A,Phương án B,Phương án C,Phương án D,B,false,Mạng
```

Câu tự luận dùng JSON với `"kind": "essay"`, các trường `title`, `prompt`,
`subQuestions: [{ id, prompt, referenceAnswer }]`.

---

## Tính năng chính

- **Tài khoản riêng** — email + mật khẩu, hoặc Google. Quên mật khẩu gửi link qua email.
- **Hai chế độ làm bài**: *luyện tập* (chấm ngay từng câu) và *thi thử* (đếm ngược, nhảy
  câu tự do, chấm sau khi nộp, hết giờ tự nộp).
- **Bảng số câu** với trạng thái đã trả lời / đang làm / đã đánh dấu; trên mobile là bảng
  trượt từ dưới lên.
- **Bài đang làm dở đồng bộ đa thiết bị** — dừng ở điện thoại, mở laptop là làm tiếp đúng
  chỗ, giữ nguyên đáp án đã chọn và thời gian còn lại.
- **Ngân hàng câu sai & câu đã lưu** — câu sai (hoặc bỏ trống) tự vào danh sách để luyện
  lại; làm đúng thì câu tự rời khỏi danh sách.
- **Theo dõi tiến trình**: lịch sử từng lần thi, điểm cao nhất, trung bình, tổng thời gian.
- **Song ngữ Anh/Nhật** cho bộ đề có bản dịch, có chế độ hiện song song.
- **Giao diện sáng/tối**, responsive từ điện thoại tới màn hình rộng.

---

## Cấu trúc thư mục

```
supabase/schema.sql        lược đồ CSDL + Row Level Security (dán vào SQL Editor)
scripts/seed.mjs           nạp dữ liệu khởi tạo lên Supabase
seed/                      dữ liệu nguồn: modules.json, aws-questions.json, ap-questions.json

src/
  types/exam.ts            kiểu dữ liệu chung cho mọi chứng chỉ
  router.ts                router theo location.hash, có cổng kiểm tra đăng nhập
  main.ts                  khởi động: xác thực → tải dữ liệu → dựng router

  services/supabase.ts     kết nối Supabase + dịch thông báo lỗi sang tiếng Việt

  state/
    auth.ts                phiên đăng nhập, hồ sơ, vai trò
    progress.ts            lịch sử thi, câu đã lưu, câu sai (đồng bộ máy chủ)
    session.ts             bài đang làm dở (localStorage + đồng bộ máy chủ)
    storage.ts             lớp localStorage, tách theo tài khoản
    theme.ts               sáng / tối / theo hệ thống

  data/
    catalog.ts             danh mục chứng chỉ đọc từ bảng exam_modules
    questions.ts           ngân hàng câu hỏi đọc từ bảng questions (có phân trang)

  styles/                  tokens, base, layout, components, exam, home
  components/              appShell, icons, certCard, ui, modal, toast, loading, bindActions

  modules/
    auth/                  màn đăng nhập, trang tài khoản
    admin/                 trang quản trị + bộ đọc file đề (JSON/CSV)
    home/                  trang chủ, danh mục, tiến trình, hướng dẫn, sắp có, 404
    shared/mcExam.ts       bộ máy làm bài trắc nghiệm dùng chung
    aws/                   tổng quan, duyệt câu hỏi, thiết lập bài làm
    ap/                    tổng quan, chọn đề, tự luận buổi chiều
```

---

## Thêm một chứng chỉ mới

1. Thêm một dòng vào bảng `exam_modules` (qua SQL, hoặc thêm vào `seed/modules.json`
   rồi chạy lại `node scripts/seed.mjs`).
2. Nạp câu hỏi qua trang **Quản trị**.
3. Nếu chứng chỉ chỉ có phần trắc nghiệm thì không cần code gì thêm — trang danh mục tự
   hiện thẻ mới. Muốn có màn hình riêng như AWS/AP thì tạo `src/modules/<cert>/index.ts`
   export `registerXxxRoutes()` và gọi `startExam()` của `modules/shared/mcExam.ts`.
4. Thêm `[data-module="<cert>"] { --accent-h: <góc màu>; }` vào `src/styles/tokens.css`
   để chứng chỉ có màu nhấn riêng.

---

## Ghi chú về dữ liệu

- **AWS SAA-C03**: 904 câu, 651 câu có đáp án tham khảo (253 câu còn lại không có dữ liệu
  đáp án trong tài liệu nguồn — chỉ xem được ở chế độ Duyệt câu hỏi).
- **AP**: chưa có ngân hàng đề thật (IPA/VITEC). `seed/ap-questions.json` chứa 5 câu trắc
  nghiệm và 11 đề tự luận **tự soạn để minh hoạ**, chỉ nhằm dựng đúng luồng thi. Khi có đề
  thật, nạp đè qua trang Quản trị rồi tắt cờ `sample_data` của chứng chỉ.
- **JLPT, FE**: mới có mô tả cấu trúc đề, chưa có câu hỏi. JLPT còn cần phát audio phần
  Nghe + chấm điểm riêng từng phần; FE Khoa B cần khung hiển thị mã giả ngôn ngữ.

## Bảo mật

Anon key nhúng trong bản build là khoá công khai — mọi quyền truy cập do Row Level
Security ở Supabase quyết định: người dùng chỉ đọc/ghi được dữ liệu học tập của chính
mình, và chỉ tài khoản `role = 'admin'` mới sửa được ngân hàng đề. Khoá `service_role`
chỉ dùng cho script chạy ở máy bạn và không bao giờ được đưa vào code trình duyệt.
