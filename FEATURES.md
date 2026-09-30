# ATECH HRM — Chức năng đã cài đặt

Tài liệu này liệt kê các chức năng đã có **code chạy được**, và những gì
chưa làm. Cập nhật theo tiến độ.

## Đã cài đặt

### Nền tảng
- Khung Express + TypeScript, chia theo module.
- Kết nối PostgreSQL qua Prisma.
- Kiểm tra biến môi trường (Zod), xử lý lỗi tập trung, middleware bảo mật.
- Công cụ tính tiền an toàn (`money.ts`) dùng decimal.js.
- Công cụ ngày hiệu lực (`effectiveDating.ts`).

### Core HR
Mô hình: **Person → Employment → Assignment → Position → OrgStructure**,
tách con người khỏi quá trình làm việc, vị trí công việc theo ngày hiệu lực.

| Method | Endpoint | Mô tả |
| --- | --- | --- |
| GET | `/api/corehr/persons` | Danh sách nhân sự |
| POST | `/api/corehr/persons` | Tạo nhân sự (kiểm tra trùng CCCD, mã, MST) |
| GET | `/api/corehr/persons/:id` | Chi tiết nhân sự + employment + người phụ thuộc |
| POST | `/api/corehr/employments` | Tạo lần làm việc (tự tính ngày hết thử việc) |
| GET | `/api/corehr/employments/:id/assignments` | Lịch sử công tác |
| POST | `/api/corehr/positions` | Tạo vị trí định biên |
| POST | `/api/corehr/assignments` | Gán/đổi vị trí (đóng dòng cũ, mở dòng mới, trong 1 giao dịch) |

### Core HR — hồ sơ mở rộng & tổ chức (mới)

| Method | Endpoint | Mô tả |
| --- | --- | --- |
| PATCH | `/api/corehr/persons/:id` | Sửa nhân sự (kiểm tra trùng CCCD với người khác) |
| DELETE | `/api/corehr/persons/:id` | Xóa mềm (chặn nếu còn lần làm việc đang hoạt động) |
| GET/POST/PATCH/DELETE | `/api/corehr/org` | Cây tổ chức: tạo, sửa, xóa phòng ban; tự cập nhật path cho cả nhánh con; chặn xóa khi còn con hoặc còn nhân viên |
| GET | `/api/corehr/expiring-documents?days=60` | Cảnh báo giấy tờ sắp/đã hết hạn (giấy phép LĐ, thẻ tạm trú, chứng chỉ bắt buộc) |

Các nhóm hồ sơ con của nhân sự — đều có GET (danh sách), POST (thêm), DELETE (xóa mềm), theo mẫu `/api/corehr/persons/:id/<nhóm>`:
- `relatives` — người thân
- `dependants` — người phụ thuộc (giảm trừ gia cảnh)
- `educations` — quá trình học vấn
- `certificates` — chứng chỉ (có cờ bắt buộc)
- `experiences` — kinh nghiệm làm việc
- `skills` — kỹ năng
- `documents` — tài liệu đính kèm
- `work-permits` — giấy phép lao động (lao động nước ngoài)
- `residence-cards` — thẻ tạm trú / visa

### Payroll (tính lương)
Theo luật Việt Nam 2026: giảm trừ gia cảnh 15,5tr / 6,2tr, biểu thuế
lũy tiến 5 bậc, bảo hiểm bắt buộc có mức trần.

| Method | Endpoint | Mô tả |
| --- | --- | --- |
| POST | `/api/payroll/preview` | Tính thử lương cho một bộ tham số |
| GET/POST | `/api/payroll/periods` | Danh sách / tạo kỳ lương |
| POST | `/api/payroll/run` | Chạy tính lương hàng loạt, lưu kết quả từng nhân viên (lấy lương và người phụ thuộc theo ngày hiệu lực; lưu snapshot; chạy lại được) |
| GET | `/api/payroll/periods/:id/results` | Kết quả lương của cả kỳ |
| POST | `/api/payroll/periods/:id/lock` | Khóa kỳ (sau khi khóa không tính lại) |
| POST | `/api/payroll/net-to-gross` | Quy đổi lương Net sang Gross (cho lao động nước ngoài) |
| POST | `/api/payroll/final-settlement` | Thanh toán khi nghỉ việc: trợ cấp thôi việc/mất việc, tiền phép chưa nghỉ |
| POST | `/api/payroll/preview-elements` | Tính lương từ danh sách pay element (nhiều khoản thu nhập/khấu trừ, quy tắc thuế và BH riêng, áp trần khấu trừ 30%) |
| POST | `/api/payroll/thirteenth-month` | Lương tháng 13 theo tỷ lệ số tháng làm việc |
| POST/GET | `/api/payroll/advances` | Tạm ứng lương: sinh lịch khấu trừ nhiều kỳ (kỳ cuối gánh số lẻ để tổng khớp tuyệt đối) |
| POST | `/api/payroll/payslip` | Lắp dữ liệu phiếu lương + xuất HTML xem trước |
| POST | `/api/payroll/payslip/pdf` | Phiếu lương PDF (tải file, tiếng Việt đầy đủ nhờ font DejaVu) |
| GET | `/api/payroll/periods/:id/report` | Báo cáo bảng lương cả kỳ, xuất Excel (.xlsx) |

Thư viện tính bổ sung (thuần, đã test):
- `pay-element.ts` — tách chịu thuế/miễn thuế từng khoản, gộp thành đầu vào tính lương.
- `deduction.ts` — áp trần khấu trừ 30% lương thực trả, phần vượt hoãn kỳ sau.
- `thirteenth-month.ts` — lương tháng 13 theo tỷ lệ.
- `payroll-validation.ts` — kiểm tra lương tối thiểu vùng, cảnh báo chênh lệch so kỳ trước.

Thư viện tính (thuần, đã test):
- `pit.calc.ts` — thuế TNCN lũy tiến (và cách tính nhanh để đối chiếu chéo),
  khấu trừ 10% (HĐ < 3 tháng), 20% (không cư trú).
- `insurance.calc.ts` — BHXH/BHYT/BHTN với mức trần theo lương cơ sở và
  lương tối thiểu vùng.
- `payroll.calc.ts` — ghép gross → bảo hiểm → thu nhập tính thuế → thuế →
  thực lĩnh.

### Ví dụ gọi thử

```bash
# Tính thử lương: 30tr, vùng I, 1 người phụ thuộc
curl -X POST http://localhost:4000/api/payroll/preview \
  -H "Content-Type: application/json" \
  -d '{
    "taxableEarnings": [30000000],
    "insuranceSalary": 30000000,
    "region": 1,
    "dependantCount": 1,
    "taxMethod": "PROGRESSIVE"
  }'
# -> empInsurance 3.150.000, PIT 257.500, netPay 26.592.500
```

## Kiểm thử
28 unit test, phủ: công cụ tiền, ngày hiệu lực, thuế TNCN 5 bậc (mọi bậc
và ranh giới), bảo hiểm (dưới/trên trần), tính lương trọn vẹn (đối chiếu
với ví dụ tính tay).

```bash
npm test
```

## CHƯA làm (theo thiết kế, sẽ làm ở các bước sau)
- Core HR: quy trình điều chuyển/bổ nhiệm/tăng lương có duyệt đa cấp (chờ workflow engine).
- Chấm công: ca, phép, quẹt thẻ, tăng ca, tính công.
- Hợp đồng: hợp đồng, phụ lục, đánh giá tái ký.
- Bảo hiểm: báo tăng/giảm, hồ sơ hưởng chế độ.
- Payroll (nhóm 2, phụ thuộc phân hệ khác hoặc tích hợp): file chuyển khoản ngân hàng, truy lĩnh/truy thu (chờ workflow), tăng ca vào lương (chờ chấm công), tờ khai thuế XML + chứng từ khấu trừ điện tử (tích hợp), lương thay đổi giữa kỳ (chia đoạn), đa tiền tệ, duyệt bảng lương (chờ workflow).
  (NHÓM 1 ĐÃ XONG: pay element, khấu trừ trần 30%, lương tháng 13, tạm ứng + lịch khấu trừ, phiếu lương PDF, báo cáo lương Excel, kiểm tra min-wage/variance.)
- Tuyển dụng, đánh giá, đào tạo.
- Hệ thống: người dùng, phân quyền, luồng duyệt, audit log.
- Giao diện web cho các màn hình trên (hiện chỉ có trang kiểm tra kết nối).

## Lưu ý
- Các mức thuế/bảo hiểm 2026 đang để trong code (`payroll.params.ts`) và
  seed (`prisma/seed.ts`). Hệ thống thật nạp từ bảng có ngày hiệu lực.
  Cần đối chiếu văn bản hướng dẫn mới nhất trước khi vận hành.
- Chỉ dùng dữ liệu giả trên môi trường demo/miễn phí.
