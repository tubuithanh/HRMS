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
Xây dựng) với ~150 nhân sự giả: hợp đồng, lương, phụ cấp, chấm công và nghỉ phép
3 tháng gần nhất, 4 kỳ lương, tạm ứng, tuyển dụng. Tài khoản demo (mật khẩu
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
- **Chấm công:** nhân viên tự chấm vào/ra (sau 8:30 là đi muộn), nhân sự nhập/sửa, bảng công tháng.
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

## Nguyên tắc bắt buộc của dự án

1. **Tính tiền phải dùng `Decimal`** (kiểu Decimal của Prisma, hoặc `decimal.js`).
   TUYỆT ĐỐI không dùng phép `+ - * /` trên `number` cho các phép tính lương,
   thuế, bảo hiểm — vì số thực JavaScript gây sai số tiền.
2. **Dữ liệu có thể thay đổi theo thời gian** dùng mô hình ngày hiệu lực
   (`effectiveDate` / `endDate`).
3. **Mọi công thức lương/thuế/bảo hiểm phải có unit test** dựa trên ví dụ
   đã được kế toán xác nhận.
4. **Không đưa dữ liệu nhân sự thật lên host miễn phí.** Chỉ dùng dữ liệu giả.
