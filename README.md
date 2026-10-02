# ATECH HRM

Hệ thống quản lý nhân sự (HRM) của ATECH.

Stack: **PERN** — PostgreSQL · Express · React · Node.js, viết bằng **TypeScript**.

## Cấu trúc

```
atech-hrm/
├── backend/     # API server (Node.js + Express + TypeScript + Prisma)
└── frontend/    # Web app (React + TypeScript + Vite)
```

## Yêu cầu môi trường

- Node.js 20 trở lên
- PostgreSQL 14 trở lên (hoặc tài khoản Neon / Supabase miễn phí)


## Chạy backend

```bash
cd backend
cp .env.example .env        # sửa DATABASE_URL trỏ tới PostgreSQL của bạn
npm install
npm run prisma:generate     # sinh Prisma Client
npm run prisma:migrate      # tạo bảng trong database
npm run seed                # (tuỳ chọn) tạo dữ liệu mẫu
npm run dev                 # chạy ở http://localhost:4000
```

Kiểm tra: mở http://localhost:4000/api/health — phải trả về `{ "status": "ok", "db": "connected" }`.

## Dữ liệu mẫu (demo)

```bash
cd backend
npm run seed                    # danh mục + tài khoản admin (chạy trước)
npm run seed:demo -- --reset    # XOÁ dữ liệu nghiệp vụ rồi tạo tập đoàn mẫu
```

Tạo Tập đoàn ATECH đa ngành (Văn phòng, Sản xuất, Thương mại, Dịch vụ – Logistics,
Xây dựng) với ~150 nhân sự giả: hợp đồng, lương, phụ cấp, tài khoản ngân hàng, chấm công và nghỉ phép
3 tháng gần nhất, kỳ lương từ tháng 1 năm nay (đủ số liệu cho quyết toán thuế), ca làm việc và lịch xoay ca
khối sản xuất, tạm ứng, tuyển dụng. Tài khoản demo (mật khẩu
`Demo@12345`): `hr.demo`, `ketoan.demo`, `nhanvien.demo`, `kinhdoanh.demo`.
**Chỉ dùng cho môi trường thử — không chạy trên database thật.**

## Đăng nhập & phân quyền

`npm run seed` tạo tài khoản `admin`, mật khẩu lấy từ `SEED_ADMIN_PASSWORD` trong `.env`.
Đăng nhập qua `POST /api/auth/login` rồi gửi header `Authorization: Bearer <token>`.

| Vai trò      | Nhân sự, tổ chức, bảng công, nghỉ phép | Tính lương     | Tuyển dụng | Tài khoản |
|--------------|-----------------------------------------|----------------|------------|-----------|
| `ADMIN`      | toàn quyền                              | toàn quyền     | toàn quyền | toàn quyền |
| `HR`         | toàn quyền                              | chỉ xem        | toàn quyền | —         |
| `ACCOUNTANT` | chỉ xem                                 | toàn quyền     | —          | —         |
| `EMPLOYEE`   | —                                       | —              | —          | —         |

Mọi tài khoản đều dùng được phần cá nhân (`/api/me`): xem hồ sơ, chấm công vào/ra,
xin nghỉ, tải phiếu lương của kỳ đã khoá. Tài khoản phải được ADMIN gắn với một
hồ sơ nhân sự thì mới dùng được phần này.

### Bảo mật đăng nhập

- Mật khẩu: tối thiểu 8 ký tự, có chữ và số, không chứa tên đăng nhập.
- Nhập sai 5 lần liên tiếp → tài khoản tạm khoá 15 phút (ADMIN mở khoá được ngay).
  Mỗi IP tối đa 20 lần đăng nhập / 15 phút.
- Tài khoản mới và tài khoản được ADMIN đặt lại mật khẩu phải đổi mật khẩu ở lần đăng nhập kế tiếp.
- Đổi / đặt lại mật khẩu → mọi phiên đăng nhập cũ bị đăng xuất.
- Quên mật khẩu: link đặt lại (30 phút, dùng một lần) gửi tới email trong hồ sơ nhân sự.
  Cấu hình `SMTP_*` và `APP_URL` trong `backend/.env`; chưa cấu hình thì link được in ra log server.

## Các phân hệ

- **Nhân sự:** hồ sơ, quá trình làm việc, hợp đồng lao động và phụ lục (kiểm tra theo BLLĐ 2019, cảnh báo sắp hết hạn), vị trí, lương cơ bản, hồ sơ thuế, người phụ thuộc, giấy tờ.
- **Tổ chức:** cây phòng ban, chức danh, vị trí định biên.
- **Chấm công:** nhân viên tự chấm vào/ra, nhân sự nhập/sửa, bảng công tháng. Máy chủ luôn dùng giờ Việt Nam (`TZ=Asia/Ho_Chi_Minh`).
  - *Giờ công theo ca*: mỗi ngày tính phút đi muộn, về sớm, giờ làm thực tế (trừ nghỉ giữa ca) và giờ làm đêm 22:00 – 06:00
    (Điều 106) — theo ca của người đó, không có ca thì theo giờ hành chính trong Cấu hình.
  - *Phụ cấp làm đêm* ≥ 30% lương giờ (Điều 98, tỷ lệ chỉnh trong Cấu hình) tự vào lương, miễn thuế TNCN.
    Tuỳ chọn trừ lương theo phút đi muộn / về sớm (mặc định tắt).
  - *Nhập máy chấm công* (Chấm công → Nhập máy chấm công): Excel / CSV mỗi dòng một lần quẹt (mã chấm công + thời gian,
    hoặc Ngày + Giờ tách cột như ZKTeco). Ghép theo ca: quẹt sớm nhất = vào, muộn nhất = ra, mỗi lần quẹt gán cho ca gần nhất
    (ca đêm quẹt ra rạng sáng thuộc ngày hôm trước), bỏ quẹt trùng trong 2 phút, mã `1` khớp `0001`.
    Xem trước → chỉ nhập khi không còn lỗi; ngày nhân sự đã nhập tay được giữ nguyên.
  - *Giới hạn vị trí* khi tự chấm công (Cấu hình): theo GPS (bán kính quanh văn phòng), theo IP / dải mạng công ty, hoặc một trong hai.
    Trên Render cần `TRUST_PROXY_HOPS` (mặc định 1 khi `NODE_ENV=production`) để lấy đúng IP người dùng.
- **Ca làm việc:** danh mục ca (kể cả ca qua đêm), ca mặc định theo ngày hiệu lực (áp thứ 2 – thứ 6), lịch ca từng ngày
  (bấm ô để đổi), xoay ca theo chu kỳ cho nhóm người (chia tổ lệch ca). Ca đêm: chấm ra sáng hôm sau vẫn đóng đúng ngày công.
- **Ngày lễ & làm thêm giờ:** danh mục ngày lễ (tự tính vào bảng công, không trừ phép); đơn làm thêm
  giờ theo BLLĐ 2019 — 150/200/300% (đêm 210/270/390%), tối đa 4h ngày thường, 12h ngày nghỉ, 40h/tháng;
  phần vượt lương giờ bình thường miễn thuế TNCN.
- **Nghỉ phép:** loại nghỉ, xin nghỉ (cả ngày / nửa ngày sáng hoặc chiều), duyệt 2 cấp, số ngày còn lại
  (chỉ tính thứ 2 – thứ 6, không tính ngày lễ). Phép năm: +1 ngày mỗi 5 năm thâm niên, tính theo tỷ lệ
  tháng làm việc ở năm vào làm / nghỉ việc, chuyển phép tồn sang năm sau (tối đa và hạn dùng cấu hình được).
- **Nghỉ việc:** một thao tác kết thúc vị trí, hợp đồng, phụ cấp, huỷ đơn sau ngày nghỉ, khoá tài khoản;
  quyết toán trợ cấp thôi việc / mất việc (từ đủ 12 tháng, trừ thời gian đóng BHTN) và tiền phép chưa nghỉ
  vào kỳ lương cuối; tạm ứng còn nợ được trừ hết ở kỳ cuối.
- **Tính lương:** khoản lương (phụ cấp cố định, thưởng/phạt trong kỳ), tạm ứng trả dần, tính theo ngày công, kỳ lương, chạy lương, khoá kỳ, phiếu lương PDF, bảng lương Excel, Net → Gross, lương tháng 13, quyết toán nghỉ việc.
- **Báo cáo BHXH – Thuế – Chuyển lương** (Tính lương → Báo cáo), xem trên web và tải Excel:
  - *D02-LT*: lao động tăng / giảm / điều chỉnh mức đóng BH, so kỳ lương tháng này với tháng trước (cần chạy lương cả hai tháng).
  - *05/KK-TNCN* theo tháng hoặc quý: chỉ tiêu [21] – [35]; cá nhân cư trú / không cư trú theo cách tính thuế (biểu 20% = không cư trú).
  - *Quyết toán thuế năm* (05/QTT, phụ lục 05-1, 05-2): tính lại thuế năm theo biểu lũy tiến (mốc × 12), giảm trừ bản thân đủ 12 tháng,
    so với số đã khấu trừ → còn phải nộp / nộp thừa.
  - *Chứng từ khấu trừ thuế TNCN* (nội dung theo Điều 32 NĐ 123/2020): lập cho mọi người bị khấu trừ trong khoảng tháng,
    đánh số tăng dần theo năm (lập lại cùng kỳ thì cập nhật số liệu, giữ số), in PDF từng người hoặc cả năm để ký, đóng dấu.
    Nhân viên tự tải chứng từ của mình ở trang Phiếu lương. Chứng từ điện tử còn cần ký số và đăng ký với cơ quan thuế.
  - *File chuyển lương*: theo **mẫu file** kế toán tự khai báo cho từng ngân hàng (thứ tự cột, tên cột, Excel hoặc CSV UTF-8,
    tách cùng / khác ngân hàng, có / không dòng tiêu đề). Tên người hưởng in hoa không dấu, số tài khoản giữ số 0 đầu,
    liệt kê người thiếu số tài khoản. Số tài khoản, ngân hàng, chi nhánh khai trong hồ sơ nhân sự.
- **Khen thưởng – kỷ luật** (BLLĐ 2019): một quyết định cho một hoặc nhiều người; hình thức kỷ luật theo Điều 124,
  tự tính ngày xoá kỷ luật theo Điều 126 (khiển trách 3 tháng, kéo dài nâng lương 6 tháng, cách chức 3 năm).
  Không có phạt tiền (Điều 127): tiền chỉ ở thưởng (khoản THUONG) hoặc bồi thường thiệt hại (khoản BOI_THUONG, Điều 129),
  tự đưa vào kỳ lương đang mở.
- **Đào tạo:** khoá học, học viên, kết quả, chứng chỉ (hạn hiệu lực), chi phí và cam kết làm việc sau khoá học.
  Nghỉ việc trước hết cam kết → bồi hoàn theo tỷ lệ thời gian còn lại, tự trừ vào kỳ lương cuối khi Cho nghỉ việc.
- **Đánh giá hiệu suất:** kỳ đánh giá với mục tiêu có trọng số (tổng 100); nhân viên tự đánh giá → quản lý trực tiếp chấm
  (người không có quản lý do nhân sự chấm) → điểm bình quân gia quyền, xếp loại A ≥ 4,5 · B ≥ 3,5 · C ≥ 2,5 · D.
  Nhân viên chỉ thấy điểm của quản lý khi phiếu hoàn tất.
- **Thông báo:** chuông trên menu (+ email nếu cấu hình SMTP) — đơn chờ duyệt, kết quả duyệt, phiếu lương mới, khen thưởng /
  kỷ luật, được cử đi học, việc cần đánh giá; nhân sự được nhắc hợp đồng hết hạn trong 30 ngày và sinh nhật.
- **Chế độ BHXH** (Luật BHXH 2024 — cần cán bộ BHXH / kế toán đối chiếu): ốm đau (30/40/60 ngày/năm theo số năm đóng,
  +10 nghề nặng nhọc; 75% lương tháng liền kề ÷ 24), chăm con ốm (20/15 ngày theo tuổi con), thai sản (sinh con 6 tháng +1 tháng
  mỗi con từ con thứ hai, 100% bình quân 6 tháng, trợ cấp một lần 2 × lương cơ sở mỗi con; khám thai; sảy thai theo tuổi thai;
  lao động nam 5/7/10/14 ngày), dưỡng sức 30% lương cơ sở/ngày. Lương tính hưởng lấy từ bảng lương. Lập hồ sơ tự ghi đơn nghỉ
  không lương công ty (Ốm / Thai sản) → trừ khỏi công, nghỉ từ 14 ngày tự không đóng BH. Nháp → đã nộp → BHXH đã chi →
  đưa vào lương (khoản Trợ cấp BHXH, miễn thuế). Xuất danh sách đề nghị (tham khảo mẫu 01B-HSB).
- **Tiếp nhận / nghỉ việc:** danh sách việc theo mẫu (sửa được), mỗi việc giao cho Nhân sự / IT / Quản lý trực tiếp / Nhân viên /
  Kế toán, có hạn. Tạo hợp đồng mới (kể cả nhập Excel) tự mở danh sách tiếp nhận; Cho nghỉ việc tự mở danh sách nghỉ việc kèm việc
  thu hồi từng tài sản còn giữ. Mỗi người đánh dấu việc của vai trò mình ở *Cá nhân → Việc cần làm*.
- **Tài sản cấp phát:** kho tài sản (máy tính, điện thoại, đồng phục / BHLĐ, thẻ…), cấp / thu hồi có tình trạng, lịch sử theo tài sản
  và theo nhân viên; thu hồi tự đánh dấu xong việc trong danh sách nghỉ việc.
- **Gợi ý làm thêm giờ từ chấm công:** ngày ở lại sau giờ ca từ 60 phút, đi làm thứ 7 / chủ nhật / lễ mà chưa có đơn → gợi ý số giờ
  (làm tròn xuống 0,5) để tạo đơn; vẫn phải duyệt như đơn thường.
- **Tuyển dụng:** tin tuyển dụng, ứng viên theo vòng, nhận việc → tạo hồ sơ nhân sự.
- **Nhập / xuất Excel:** nhân viên mới, điều chỉnh lương, chấm công theo file mẫu; kiểm tra từng dòng,
  chỉ nhập khi không còn lỗi (tất cả hoặc không dòng nào). Xuất danh sách nhân sự.
- **Nhật ký thao tác** (ADMIN): mọi thao tác ghi dữ liệu, thay đổi trước/sau trên các bảng quan trọng
  (lương, hợp đồng, nhân sự, tài khoản…), đăng nhập thành công/thất bại. Mật khẩu luôn được che.

### Cách tính lương (cần kế toán xác nhận trước khi dùng thật)

Xem chi tiết và ví dụ số trong `backend/src/modules/payroll/payroll.inputs.ts`
và `payroll.inputs.test.ts`.

1. Công chuẩn = số ngày thứ 2 – thứ 6 của kỳ.
2. Công hưởng lương = công chuẩn trong thời gian làm việc − nghỉ không lương − vắng.
3. Lương cơ bản và phụ cấp “theo công” × công hưởng lương / công chuẩn.
4. BH tính trên lương đóng BH + phụ cấp tính BH (đủ tháng); không làm việc
   từ 14 ngày trở lên trong tháng thì không đóng BH.
5. Khoản phát sinh (thưởng, phạt…) giữ nguyên; tạm ứng trừ mỗi kỳ một phần;
   khấu trừ khác bị giới hạn 30% lương thực trả, phần vượt tự trừ tiếp ở kỳ sau.
6. Giảm trừ gia cảnh, lương cơ sở, lương tối thiểu vùng, biểu thuế, tỷ lệ BH lấy theo ngày hiệu lực
   (Hệ thống → Tham số pháp lý); kỳ lương dùng mức hiệu lực vào ngày cuối kỳ.

## Chạy frontend

```bash
cd frontend
cp .env.example .env        # trỏ VITE_API_URL tới backend
npm install
npm run dev                 # chạy ở http://localhost:5173
```

## Triển khai online (Render + Neon, gói miễn phí)

| Phần      | Nơi chạy                    | Địa chỉ                              |
|-----------|-----------------------------|--------------------------------------|
| Giao diện | Render – Web Service `HRMS` | https://hrms-lk4o.onrender.com       |
| Backend   | Render – Web Service `hrms-api` | https://hrms-api-q4ue.onrender.com |
| Database  | Neon PostgreSQL (us-east-2) | —                                    |

Dùng Neon thay cho Postgres của Render vì Postgres miễn phí của Render bị xoá sau 30 ngày.

### 1. Database (Neon)

Tạo project trên neon.tech → **Connect** → **tắt Connection pooling** → chép chuỗi kết nối,
bỏ `&channel_binding=require` ở cuối. Chuỗi đúng có dạng:

```
postgresql://neondb_owner:<mật-khẩu>@ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require
```

Không dùng địa chỉ có `-pooler` (lệnh `prisma migrate` sẽ treo). **Không commit chuỗi này lên git.**

Tạo bảng và nạp dữ liệu mẫu từ máy (PowerShell):

```powershell
cd backend
npm install
$env:DATABASE_URL="<chuỗi Neon>&connect_timeout=30"
$env:SEED_ADMIN_PASSWORD="<mật khẩu admin, ≥ 8 ký tự>"
$env:PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK="1"
npx prisma migrate deploy
npx prisma db execute --file prisma/migrations/manual_partial_unique_indexes.sql
npm run seed
npm run seed:demo -- --reset      # 5–15 phút, chỉ chạy ở MỘT terminal
```

### 2. Backend (Render → New → Web Service)

| Mục            | Giá trị |
|----------------|---------|
| Root Directory | `backend` |
| Build Command  | `npm install --include=dev && npx prisma generate && npm run build` |
| Start Command  | `npm start` |
| Region         | gần database (Neon us-east-2 → Ohio) |

Biến môi trường: `DATABASE_URL` (chuỗi Neon), `NODE_ENV=production`, `JWT_SECRET`
(tạo bằng `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`),
`JWT_EXPIRES_IN=8h`, `CORS_ORIGINS` và `APP_URL` = địa chỉ giao diện.

Kiểm tra: `https://<backend>/api/health` → `{"status":"ok","db":"connected"}`.

### 3. Giao diện (Render → New → Web Service)

| Mục            | Giá trị |
|----------------|---------|
| Root Directory | `frontend` |
| Build Command  | `npm install && npm run build` |
| Start Command  | `npm run preview` |

Biến môi trường:
- `VITE_API_URL` = `https://<backend>/api` (một lần `https://`, có `/api` ở cuối)
- `VITE_SHOW_DEMO_ACCOUNTS` = `true` để hiện tài khoản dùng thử ở màn hình đăng nhập

Biến `VITE_*` được gắn lúc build → đổi xong phải **Manual Deploy → Clear build cache & deploy**.
`vite.config.ts` đã cho phép tên miền `*.onrender.com` và cổng `$PORT` của Render.

### Cập nhật bản online

Sửa code → commit → push lên GitHub → Render tự build lại (Auto-Deploy) hoặc bấm **Manual Deploy**.
Có migration mới thì chạy `npx prisma migrate deploy` (và `npm run seed` nếu có danh mục mới) với chuỗi Neon
**trước khi push** — Start Command của backend không tự migrate.

### Lỗi thường gặp

| Lỗi | Cách xử lý |
|-----|------------|
| `Blocked request. This host … is not allowed` | Thiếu `preview.allowedHosts` trong `vite.config.ts` |
| Deploy giao diện chạy ~15 phút rồi Failed | `vite preview` không nghe ở `0.0.0.0:$PORT` (đã sửa trong `vite.config.ts`) |
| `Failed to construct 'URL': Invalid URL` khi đăng nhập | `VITE_API_URL` sai dạng (thiếu hoặc thừa `https://`) |
| `P1002 … advisory lock` khi migrate | Đặt `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1`, không dùng địa chỉ `-pooler` |
| `violates RESTRICT setting of foreign key` khi `seed:demo` | Một lần seed khác còn chạy ngầm → `taskkill /F /IM node.exe` rồi chạy lại |
| Admin đăng nhập sai mật khẩu | `npm run seed` chỉ đặt mật khẩu admin ở lần tạo đầu tiên |

### Lưu ý gói miễn phí

- Render "ngủ" sau ~15 phút không dùng; lần mở đầu chờ ~1 phút.
- Khi bật `VITE_SHOW_DEMO_ACCOUNTS`, mật khẩu dùng thử hiện công khai — chỉ dùng cho demo.
- Chỉ dùng dữ liệu giả (xem nguyên tắc 4 bên dưới).

## Nguyên tắc bắt buộc của dự án

1. **Tính tiền phải dùng `Decimal`** (kiểu Decimal của Prisma, hoặc `decimal.js`).
   TUYỆT ĐỐI không dùng phép `+ - * /` trên `number` cho các phép tính lương,
   thuế, bảo hiểm — vì số thực JavaScript gây sai số tiền.
2. **Dữ liệu có thể thay đổi theo thời gian** dùng mô hình ngày hiệu lực
   (`effectiveDate` / `endDate`).
3. **Mọi công thức lương/thuế/bảo hiểm phải có unit test** dựa trên ví dụ
   đã được kế toán xác nhận.
4. **Không đưa dữ liệu nhân sự thật lên host miễn phí.** Chỉ dùng dữ liệu giả.
