# ATECH HRM

**Hệ thống quản lý nhân sự – tiền lương toàn diện cho doanh nghiệp Việt Nam.**

Quản lý trọn vòng đời nhân viên — từ tuyển dụng, tiếp nhận, chấm công theo ca, nghỉ phép, tính lương, BHXH, thuế TNCN
đến đánh giá, khen thưởng và nghỉ việc — với nghiệp vụ bám sát **Bộ luật Lao động 2019**, **Luật BHXH 2024** và các
thông tư thuế hiện hành. Chạy trên web và điện thoại (cài như ứng dụng).

| | |
|---|---|
| **Công nghệ** | PostgreSQL · Express · React · Node.js — viết bằng TypeScript |
| **Quy mô mã nguồn** | 22 phân hệ backend · 56 bảng dữ liệu · 241 unit test + kiểm thử đầu-cuối |
| **Bản chạy thử** | https://hrms-lk4o.onrender.com (dữ liệu giả) |

> ⚠️ Các công thức lương, thuế, bảo hiểm và chế độ BHXH được lập trình theo văn bản pháp luật và có unit test,
> nhưng **phải được kế toán / cán bộ BHXH của doanh nghiệp đối chiếu** trước khi dùng cho dữ liệu thật.

---

## Mục lục

1. [Tính năng](#1-tính-năng)
2. [Vai trò và phân quyền](#2-vai-trò-và-phân-quyền)
3. [Quy tắc nghiệp vụ và căn cứ pháp lý](#3-quy-tắc-nghiệp-vụ-và-căn-cứ-pháp-lý)
4. [Kiến trúc](#4-kiến-trúc)
5. [Cài đặt và chạy trên máy](#5-cài-đặt-và-chạy-trên-máy)
6. [Biến môi trường](#6-biến-môi-trường)
7. [Triển khai online (Render + Neon)](#7-triển-khai-online-render--neon)
8. [Tích hợp: email Gmail OAuth2, nhắc việc tự động](#8-tích-hợp-email-gmail-oauth2-nhắc-việc-tự-động)
9. [Bảo mật](#9-bảo-mật)
10. [Kiểm thử và chất lượng](#10-kiểm-thử-và-chất-lượng)
11. [Vận hành và xử lý sự cố](#11-vận-hành-và-xử-lý-sự-cố)
12. [Giới hạn đã biết và lộ trình](#12-giới-hạn-đã-biết-và-lộ-trình)
13. [Nguyên tắc bắt buộc của dự án](#13-nguyên-tắc-bắt-buộc-của-dự-án)

---

## 1. Tính năng

### 1.1. Nhân sự và tổ chức

| Chức năng | Mô tả |
|---|---|
| **Hồ sơ nhân sự** | Thông tin cá nhân, CCCD, MST, mã BHXH, tài khoản ngân hàng nhận lương, người phụ thuộc, người thân, học vấn, chứng chỉ, kinh nghiệm, kỹ năng, giấy tờ, giấy phép lao động / thẻ tạm trú (người nước ngoài). |
| **Hợp đồng lao động** | Hợp đồng và phụ lục, kiểm tra theo BLLĐ 2019, cảnh báo sắp hết hạn; quá trình công tác theo ngày hiệu lực (vị trí, lương cơ bản, hồ sơ thuế). |
| **Tổ chức** | Cây đơn vị (công ty → khối → ban / phòng → nhóm), chức danh, vị trí định biên, vị trí chủ chốt. |
| **Sơ đồ tổ chức** | Sơ đồ dạng cây: người phụ trách, số nhân viên trực tiếp / cả nhánh, vị trí trống; thu gọn / mở rộng, tìm người hoặc đơn vị (tự mở nhánh, tô sáng), phóng to / thu nhỏ, in. |
| **Tuyển dụng** | Tin tuyển dụng, ứng viên theo vòng, nhận việc → tạo hồ sơ nhân sự. |
| **Tiếp nhận / nghỉ việc** | Danh sách việc theo mẫu (sửa được), mỗi việc giao cho Nhân sự / IT / Quản lý / Nhân viên / Kế toán, có hạn. Tạo hợp đồng mới (kể cả nhập Excel) tự mở danh sách tiếp nhận; cho nghỉ việc tự mở danh sách nghỉ việc kèm việc thu hồi từng tài sản. |
| **Cho nghỉ việc** | Một thao tác: kết thúc vị trí, hợp đồng, phụ cấp, huỷ đơn sau ngày nghỉ, khoá tài khoản; quyết toán trợ cấp thôi việc / mất việc, tiền phép chưa nghỉ, bồi hoàn đào tạo, tạm ứng còn nợ vào kỳ lương cuối. |
| **Tài sản cấp phát** | Kho tài sản (máy tính, điện thoại, đồng phục / BHLĐ, thẻ…), cấp / thu hồi có tình trạng, lịch sử theo tài sản và theo nhân viên. |

### 1.2. Chấm công, ca làm việc, nghỉ phép

| Chức năng | Mô tả |
|---|---|
| **Chấm công** | Nhân viên tự chấm vào / ra (có thể giới hạn theo GPS hoặc mạng công ty), nhân sự nhập / sửa, bảng công tháng. |
| **Giờ công theo ca** | Mỗi ngày tính phút đi muộn, về sớm, giờ làm thực tế (trừ nghỉ giữa ca), giờ làm đêm 22:00 – 06:00. Ca đêm chấm ra sáng hôm sau vẫn đúng ngày công. |
| **Ca làm việc** | Danh mục ca (kể cả qua đêm), ca mặc định theo ngày hiệu lực, lịch ca từng ngày, **xoay ca** theo chu kỳ cho nhóm người (chia tổ lệch ca). |
| **Nhập máy chấm công** | File Excel / CSV từ máy vân tay, khuôn mặt (kể cả ZKTeco tách cột Ngày + Giờ). Tự ghép giờ vào / ra theo ca, bỏ quẹt trùng, xem trước, chỉ nhập khi không còn lỗi, không ghi đè ngày nhân sự đã sửa tay. |
| **Nghỉ phép** | Cả ngày / nửa ngày sáng – chiều, duyệt 2 cấp (quản lý trực tiếp → nhân sự), số ngày còn lại; phép năm theo thâm niên, tỷ lệ tháng làm việc, chuyển phép tồn. |
| **Làm thêm giờ** | Đơn làm thêm theo BLLĐ 2019 (hệ số, giới hạn ngày / tháng), duyệt 2 cấp; **gợi ý làm thêm từ dữ liệu chấm công** (ở lại sau ca, đi làm ngày nghỉ / lễ). |
| **Ngày lễ** | Danh mục ngày lễ, tự tính vào bảng công, không trừ phép. |

### 1.3. Tiền lương, BHXH, thuế

| Chức năng | Mô tả |
|---|---|
| **Tính lương** | Kỳ lương, chạy lương, khoá kỳ; lương theo ngày công, phụ cấp cố định, khoản phát sinh, làm thêm giờ, phụ cấp làm đêm, trừ đi muộn / về sớm (tuỳ chọn), tạm ứng trả dần, trần khấu trừ 30%; Net → Gross; lương tháng 13; quyết toán nghỉ việc. |
| **Phiếu lương** | Phiếu chi tiết trên web và PDF; nhân viên tự xem kỳ đã khoá. |
| **Tham số pháp lý** | Giảm trừ gia cảnh, lương cơ sở, lương tối thiểu vùng, biểu thuế, tỷ lệ BH — theo ngày hiệu lực, cập nhật khi luật đổi. |
| **Báo cáo BHXH** | Danh sách lao động tăng / giảm / điều chỉnh mức đóng (tham khảo mẫu **D02-LT**). |
| **Báo cáo thuế TNCN** | Tờ khai **05/KK-TNCN** theo tháng / quý (chỉ tiêu [21]–[35]); **quyết toán năm** 05/QTT kèm phụ lục 05-1, 05-2; **chứng từ khấu trừ thuế** PDF đánh số theo năm. |
| **Chuyển lương ngân hàng** | File chuyển khoản theo **mẫu tự khai báo cho từng ngân hàng** (cột, Excel / CSV, tách cùng / khác ngân hàng). |
| **Chế độ BHXH** | Ốm đau, chăm con ốm, thai sản (sinh con, khám thai, sảy thai, lao động nam), dưỡng sức. Tự tính số ngày, mức hưởng, hạn mức năm; ghi ngày nghỉ vào bảng công; theo dõi Nháp → Đã nộp → BHXH đã chi → đưa vào lương; xuất danh sách đề nghị (tham khảo mẫu 01B-HSB). |

### 1.4. Phát triển con người

| Chức năng | Mô tả |
|---|---|
| **Khen thưởng – kỷ luật** | Quyết định cho một hoặc nhiều người; hình thức kỷ luật theo luật, tự tính ngày xoá kỷ luật; tiền thưởng / bồi thường tự vào kỳ lương; không có phạt tiền. |
| **Đào tạo** | Khoá học, học viên, kết quả, chứng chỉ có hạn; chi phí và cam kết làm việc → bồi hoàn theo tỷ lệ khi nghỉ trước hạn. |
| **Đánh giá hiệu suất** | Kỳ đánh giá với mục tiêu có trọng số; nhân viên tự đánh giá → quản lý trực tiếp chấm → xếp loại A / B / C / D; phân bố xếp loại theo kỳ. |

### 1.5. Tự phục vụ, thông báo, điện thoại

| Chức năng | Mô tả |
|---|---|
| **Cổng nhân viên** | Hồ sơ của tôi, chấm công, nghỉ phép, làm thêm giờ, phiếu lương, chứng từ thuế, đánh giá, tài sản đang giữ, hồ sơ BHXH, việc cần làm; quản lý duyệt đơn và xem nhóm của mình. |
| **Thông báo** | Chuông trong ứng dụng (+ email): đơn chờ duyệt, kết quả duyệt, phiếu lương mới, khen thưởng / kỷ luật, cử đi học, việc cần đánh giá, chế độ BHXH đã chi. |
| **Nhắc việc hằng ngày** | Hợp đồng / thử việc / chứng chỉ / giấy phép lao động sắp hết hạn, sinh nhật, việc tiếp nhận – nghỉ việc đến hạn, phiếu đánh giá sắp hết hạn — mỗi mục nhắc một lần, kèm email tổng hợp. |
| **Dùng trên điện thoại** | Thanh điều hướng dưới đáy, nút chấm công lớn, bảng tự chuyển thành thẻ; **cài lên màn hình chính** như ứng dụng (PWA). |
| **Dashboard** | Quân số, chi phí nhân sự, tỷ lệ đi làm, nghỉ việc, việc cần xử lý, biểu đồ xu hướng. |

### 1.6. Quản trị hệ thống

| Chức năng | Mô tả |
|---|---|
| **Tài khoản & nhóm quyền** | Tạo / khoá / đặt lại mật khẩu, gắn với hồ sơ nhân sự, **phạm vi dữ liệu theo đơn vị**; **nhóm quyền** do quản trị tự tạo và tích chọn quyền Xem / Sửa cho 15 chức năng (xem mục 2). |
| **Cấu hình hệ thống** | Mọi tham số vận hành chỉnh trên web, có kiểm tra không vượt mức luật định: thông tin công ty; giờ hành chính, phụ cấp đêm, trừ muộn / sớm, ngưỡng gợi ý làm thêm; tính lương (vùng, ngày trả, giờ làm / ngày, trần khấu trừ, ngưỡng miễn đóng BH, ngưỡng khấu trừ thuế 10%); làm thêm giờ (hệ số 6 loại, giới hạn ngày / tháng, thời hạn đăng ký); dưỡng sức; giới hạn vị trí chấm công; duyệt 2 cấp; bảo mật đăng nhập; giờ chạy và số ngày báo trước của nhắc việc; gửi email thử. Tham số pháp lý (giảm trừ, lương cơ sở, biểu thuế, tỷ lệ BH) quản lý theo ngày hiệu lực. |
| **Nhập / xuất Excel** | Nhân viên mới, điều chỉnh lương, chấm công theo file mẫu; kiểm tra từng dòng, tất cả hoặc không. Xuất danh sách nhân sự. |
| **Nhật ký thao tác** | Mọi thao tác ghi dữ liệu kèm giá trị trước / sau, đăng nhập thành công / thất bại; mật khẩu luôn được che. |

---

## 2. Vai trò và phân quyền

Phân quyền gồm **ba lớp chồng nhau**, tất cả được kiểm tra ở **backend** (giao diện chỉ ẩn menu / nút cho gọn — gọi thẳng API cũng không vượt quyền):

| Lớp | Trả lời câu hỏi | Cấu hình ở |
|---|---|---|
| 1. **Nhóm quyền** | Được dùng chức năng nào, chỉ xem hay được sửa? | *Hệ thống → Nhóm quyền* (chỉ quản trị) |
| 2. **Phạm vi dữ liệu** | Được thấy nhân viên của những đơn vị nào? | *Hệ thống → Tài khoản → Phạm vi* |
| 3. **Quản lý trực tiếp** | Được duyệt đơn / chấm đánh giá của ai? | Tự động theo **vị trí chủ chốt** trong sơ đồ tổ chức |

### 2.1. Nhóm quyền

**Quyền** = một chức năng × một mức:

- **Xem** (`<chức năng>:read`) — mở trang, xem danh sách, xuất báo cáo.
- **Thêm / sửa / duyệt** (`<chức năng>:write`) — mọi thao tác ghi: thêm, sửa, xoá, duyệt, tính lương, khoá kỳ… Quyền sửa **đã gồm** quyền xem.

**15 chức năng phân quyền:**

| Mã | Chức năng | Gồm các trang |
|---|---|---|
| `dashboard` | Dashboard | Số liệu tổng hợp, biểu đồ (người không có quyền thấy dashboard cá nhân) |
| `corehr` | Hồ sơ nhân sự, tổ chức, hợp đồng | Hồ sơ, hợp đồng, quá trình công tác, tổ chức, sơ đồ, nghỉ việc |
| `attendance` | Chấm công, ca, làm thêm giờ | Bảng công, ca làm việc, xếp ca, nhập máy chấm công, ngày lễ, duyệt làm thêm |
| `leave` | Nghỉ phép | Duyệt nghỉ phép, loại nghỉ, số ngày phép |
| `payroll` | Tính lương | Kỳ lương, khoản lương, tạm ứng, phiếu lương, Net → Gross |
| `reports` | Báo cáo BHXH, thuế, chuyển lương | D02-LT, 05/KK, quyết toán, chứng từ khấu trừ, file ngân hàng |
| `benefits` | Chế độ BHXH | Ốm đau, thai sản, dưỡng sức |
| `people` | Khen thưởng, đào tạo, đánh giá | Quyết định khen thưởng – kỷ luật, khoá đào tạo, kỳ đánh giá |
| `assets` | Tài sản cấp phát | Kho tài sản, cấp / thu hồi |
| `checklists` | Tiếp nhận / nghỉ việc | Danh sách việc, mẫu việc |
| `recruitment` | Tuyển dụng | Tin tuyển dụng, ứng viên |
| `import` | Nhập dữ liệu Excel | Nhập nhân viên, điều chỉnh lương, chấm công; xuất danh sách |
| `users` | Tài khoản | Tạo / khoá tài khoản, đặt lại mật khẩu, phạm vi |
| `settings` | Cấu hình hệ thống, tham số pháp lý | Mọi tab cấu hình, tham số pháp lý theo ngày hiệu lực |
| `audit` | Nhật ký thao tác | Lịch sử thay đổi dữ liệu, đăng nhập |

**Nhóm hệ thống** (tạo tự động khi server khởi động — quyền mặc định):

| Chức năng | Quản trị `ADMIN` | Nhân sự `HR` | Kế toán `ACCOUNTANT` | Nhân viên `EMPLOYEE` |
|---|:-:|:-:|:-:|:-:|
| Dashboard | ✅ | 👁 | 👁 | — |
| Hồ sơ nhân sự, tổ chức, hợp đồng | ✅ | ✅ | 👁 | — |
| Chấm công, ca, làm thêm giờ | ✅ | ✅ | 👁 | — |
| Nghỉ phép | ✅ | ✅ | 👁 | — |
| Tính lương | ✅ | 👁 | ✅ | — |
| Báo cáo BHXH, thuế, chuyển lương | ✅ | 👁 | ✅ | — |
| Chế độ BHXH | ✅ | ✅ | ✅ | — |
| Khen thưởng, đào tạo, đánh giá | ✅ | ✅ | 👁 | — |
| Tài sản cấp phát | ✅ | ✅ | 👁 | — |
| Tiếp nhận / nghỉ việc | ✅ | ✅ | 👁 | — |
| Tuyển dụng | ✅ | ✅ | — | — |
| Nhập dữ liệu Excel | ✅ | ✅ | 👁 | — |
| Tài khoản | ✅ | — | — | — |
| Cấu hình hệ thống, tham số pháp lý | ✅ | — | — | — |
| Nhật ký thao tác | ✅ | — | — | — |

✅ thêm / sửa / duyệt · 👁 chỉ xem · — không truy cập. **Cổng nhân viên** (hồ sơ, chấm công, nghỉ phép, làm thêm, phiếu lương,
đánh giá, việc cần làm **của chính mình**) luôn có cho mọi tài khoản đã gắn hồ sơ nhân sự, không phụ thuộc nhóm quyền.

**Quyền hiệu lực của một tài khoản:**

1. Vai trò **Quản trị** → toàn quyền, luôn luôn (nhóm Quản trị không giới hạn được — tránh tự khoá mất quyền quản trị).
2. Tài khoản **có gán nhóm** → quyền = **hợp** quyền các nhóm được gán (một người có thể thuộc nhiều nhóm).
3. Tài khoản **chưa gán nhóm** → dùng nhóm hệ thống trùng mã vai trò (`HR`, `ACCOUNTANT`, `EMPLOYEE`).

#### Thao tác (chỉ quản trị)

| Việc cần làm | Cách làm |
|---|---|
| Xem / sửa quyền một nhóm | *Hệ thống → Nhóm quyền* → chọn nhóm bên trái → tích **Xem** / **Thêm-sửa-duyệt** → **Lưu**. Có nút chọn nhanh *Xem tất cả / Toàn quyền / Bỏ hết* |
| Tạo nhóm mới | **+ Nhóm quyền** → mã (A-Z, 0-9, _), tên, tuỳ chọn *sao chép quyền từ* một nhóm có sẵn → chỉnh tiếp |
| Gán nhóm cho người dùng | *Hệ thống → Tài khoản* → nút **Quyền** ở dòng tài khoản → tích một hoặc nhiều nhóm. Bỏ hết = quay về theo vai trò |
| Khôi phục nhóm hệ thống | Chọn nhóm → **Khôi phục mặc định** |
| Xoá nhóm | Chỉ nhóm tự tạo và **không còn tài khoản nào** dùng |

Thay đổi có hiệu lực **ngay** với các thao tác tiếp theo (giao diện cập nhật menu khi người dùng tải lại trang) và được ghi vào nhật ký thao tác.

**Ví dụ**

- *Trưởng phòng nhân sự xem được lương*: tạo nhóm `TRUONG_PHONG_NS`, sao chép từ *Nhân sự*, tích thêm **Xem** ở *Tính lương* và *Báo cáo*; gán cho tài khoản đó.
- *Kế toán viên chỉ xem lương, không tính*: tạo nhóm `KE_TOAN_XEM`, chỉ tích **Xem** ở *Tính lương*, *Báo cáo*, *Dashboard*.
- *Trợ lý nhân sự chỉ chấm công*: nhóm `TRO_LY_CC` với **Thêm-sửa** ở *Chấm công* và **Xem** ở *Hồ sơ nhân sự*; kết hợp **phạm vi** = nhà máy của họ.
- *Nhân viên IT quản lý tài sản*: gán thêm nhóm có **Thêm-sửa** ở *Tài sản cấp phát* — vẫn giữ cổng nhân viên như bình thường.

#### Quy tắc an toàn

- Chỉ **Quản trị** được xem và chỉnh nhóm quyền.
- Người có quyền *Tài khoản* nhưng không phải Quản trị **không** cấp được vai trò Quản trị, **không** sửa / khoá / đặt lại mật khẩu tài khoản Quản trị.
- Luôn phải còn ít nhất một tài khoản Quản trị đang hoạt động.
- Nhóm hệ thống không xoá được; nhóm đang được gán không xoá được.
- Nhân viên chỉ xem phiếu lương của kỳ **đã khoá**; không ai tự duyệt đơn của chính mình (trừ Quản trị).

### 2.2. Phạm vi dữ liệu theo đơn vị

*Hệ thống → Tài khoản → Phạm vi*: tài khoản được gán đơn vị chỉ thấy và thao tác với nhân viên thuộc các đơn vị đó (kể cả đơn vị con)
ở **mọi** chức năng — danh sách, bảng công, lương, báo cáo, dashboard; ghi dữ liệu ra ngoài phạm vi cũng bị chặn.

- Không gán đơn vị = toàn công ty; Quản trị luôn thấy tất cả.
- Nhân viên chưa xếp đơn vị (vừa tuyển) hiện cho mọi người có quyền, để còn xếp đơn vị.
- Áp tập trung ở tầng truy vấn database (`backend/src/common/scope/scope.ts`) nên không chức năng nào bị sót.
- Nhóm quyền quyết định **làm được gì**, phạm vi quyết định **trên những ai** — kết hợp được, vd *Kế toán chi nhánh Hà Nội*.

### 2.3. Quản lý trực tiếp

Không phải vai trò hay nhóm quyền: người giữ **vị trí chủ chốt** của một đơn vị tự là quản lý của nhân viên trong đơn vị đó
(kể cả khi tài khoản chỉ là Nhân viên). Quản lý được: duyệt bước 1 đơn nghỉ phép / làm thêm giờ (khi bật *Duyệt 2 cấp*),
chấm điểm đánh giá hiệu suất, xem *Nhân viên của tôi*, làm các việc tiếp nhận giao cho “Quản lý trực tiếp”.
Đổi người quản lý = đổi người giữ vị trí chủ chốt ở *Tổ chức*.

### 2.4. Mã nguồn liên quan

| File | Nội dung |
|---|---|
| `backend/src/modules/auth/permissions.ts` | Danh mục chức năng, nhóm hệ thống, tính quyền hiệu lực (cache 60 giây) |
| `backend/src/modules/auth/permission-group.service.ts` | Thêm / sửa / xoá / khôi phục nhóm quyền |
| `backend/src/routes.ts` | Gắn quyền cho từng chức năng: `access('payroll')` — GET cần `:read`, còn lại cần `:write` |
| `backend/src/common/middleware/auth.ts` | `requirePermission(...)`, gắn quyền vào mỗi request |
| `frontend/src/auth.tsx` | `can()`, `useCan()`, `useCanWrite()` — ẩn / hiện menu, trang, nút |
| `frontend/src/pages/PermissionGroupsPage.tsx` | Màn hình Nhóm quyền |

Thêm chức năng mới: khai báo mã trong `MODULES` (backend) và kiểu `Module` (frontend), gắn `access('<mã>')` cho router,
cập nhật quyền mặc định của nhóm hệ thống nếu cần.

**Giới hạn:** quyền chia hai mức Xem / Thêm-sửa-duyệt (chưa tách riêng Xoá, Xuất Excel); một số quy tắc nghiệp vụ vẫn theo vai trò gốc
(ai nhận nhắc việc hằng ngày, việc tiếp nhận giao cho “Nhân sự / Kế toán”, ai xem được mọi phiếu đánh giá).

### Tài khoản dùng thử (dữ liệu mẫu)

| Tài khoản | Vai trò | Ghi chú |
|---|---|---|
| `admin` | Quản trị | Mật khẩu = `SEED_ADMIN_PASSWORD` lúc tạo; đặt lại: `npm run reset:admin` |
| `hr.demo` | Nhân sự | Trưởng phòng Hành chính – Nhân sự |
| `ketoan.demo` | Kế toán | Kế toán trưởng |
| `quanly.demo` | Nhân viên (quản lý) | Trưởng phòng Kinh doanh — duyệt đơn bước 1 |
| `kinhdoanh.demo` | Nhân viên | Nhân viên kinh doanh |
| `nhanvien.demo` | Nhân viên | Công nhân xưởng lắp ráp (làm ca) |

Mật khẩu các tài khoản `*.demo`: `Demo@12345`.

---

## 3. Quy tắc nghiệp vụ và căn cứ pháp lý

> **Khi luật thay đổi — không cần sửa mã nguồn:** mức tiền (giảm trừ gia cảnh, lương cơ sở, lương tối thiểu vùng, biểu thuế, tỷ lệ BH) thêm mức mới theo ngày hiệu lực ở *Cấu hình hệ thống → Tham số pháp lý*; các con số trong công thức (hệ số và giới hạn làm thêm, trần khấu trừ, thời hạn hợp đồng, thử việc, phép thâm niên, trợ cấp thôi việc / mất việc, số ngày và mức hưởng ốm đau, thai sản, dưỡng sức…) sửa ở *Cấu hình hệ thống* (khung **Tính lương**, **Làm thêm giờ**, **Quy tắc luật lao động & BHXH**). Các số dưới đây là mặc định theo luật hiện hành.

### 3.1. Tính lương

Chi tiết và ví dụ số: `backend/src/modules/payroll/payroll.inputs.ts` và các file `*.test.ts` cùng thư mục.

1. **Công chuẩn** = số ngày thứ 2 – thứ 6 của kỳ. **Công hưởng lương** = công chuẩn trong thời gian làm việc − nghỉ không lương − vắng.
2. Lương cơ bản và phụ cấp “theo công” × công hưởng lương / công chuẩn; khoản phát sinh giữ nguyên.
3. **Làm thêm giờ** (Điều 98, 107 BLLĐ): 150% / 200% / 300% (đêm 210% / 270% / 390%); tối đa 4 giờ ngày thường, 12 giờ ngày nghỉ, 40 giờ / tháng;
   phần trả cao hơn lương giờ bình thường **miễn thuế TNCN**.
4. **Phụ cấp làm đêm** (Điều 98, 106): lương giờ × giờ làm 22:00 – 06:00 × tỷ lệ cấu hình (tối thiểu 30%), miễn thuế TNCN.
5. **Bảo hiểm** tính trên lương đóng BH + phụ cấp tính BH; không làm việc từ 14 ngày trong tháng thì không đóng.
6. **Khấu trừ khác** (tạm ứng, bồi thường thiệt hại…) tối đa 30% lương thực trả, phần vượt tự trừ kỳ sau.
7. Giảm trừ gia cảnh, lương cơ sở, lương tối thiểu vùng, biểu thuế, tỷ lệ BH lấy theo **ngày hiệu lực** vào ngày cuối kỳ.
8. **Nghỉ việc**: trợ cấp thôi việc ½ tháng lương / năm (mất việc: 1 tháng / năm, tối thiểu 2 tháng), từ đủ 12 tháng, trừ thời gian đóng BHTN; tháng lẻ ≤ 6 tính ½ năm, > 6 tính 1 năm; tiền phép chưa nghỉ = lương / số ngày làm việc tháng liền kề × số ngày.

### 3.2. Thuế TNCN

- 05/KK: cá nhân cư trú / không cư trú theo cách tính thuế (biểu 20% = không cư trú); kỳ chưa khoá được cảnh báo.
- Quyết toán năm: biểu năm = mốc tháng × 12; giảm trừ bản thân đủ 12 tháng cho người ủy quyền quyết toán (đang làm việc 31/12).
- Chứng từ khấu trừ: nội dung theo Điều 32 Nghị định 123/2020; lập lại cùng kỳ thì cập nhật số liệu, giữ số chứng từ.

### 3.3. Chế độ BHXH (Luật BHXH 2024)

| Chế độ | Số ngày | Mức hưởng |
|---|---|---|
| Ốm đau | 30 / 40 / 60 ngày làm việc / năm (đóng < 15 / 15–30 / ≥ 30 năm), +10 ngày nghề nặng nhọc, độc hại | 75% lương đóng BHXH tháng liền kề ÷ 24 × ngày |
| Chăm con ốm | 20 ngày (con < 3 tuổi) / 15 ngày (3 – < 7 tuổi) mỗi năm | như ốm đau |
| Sinh con | 6 tháng, +1 tháng mỗi con từ con thứ hai | 100% bình quân 6 tháng × số tháng + trợ cấp một lần 2 × lương cơ sở / con |
| Khám thai | 1 ngày / lần (2 ngày nếu xa / bệnh lý) | 100% bình quân 6 tháng ÷ 24 × ngày |
| Sảy thai, phá thai | 10 / 20 / 40 / 50 ngày theo tuổi thai | 100% bình quân 6 tháng ÷ 30 × ngày |
| Lao động nam khi vợ sinh | 5 / 7 / 10 / 14 ngày làm việc, trong 60 ngày | 100% bình quân 6 tháng ÷ 24 × ngày |
| Dưỡng sức | tối đa 10 ngày | 30% lương cơ sở / ngày |

Lương tính hưởng lấy từ bảng lương đã tính; ngày nghỉ được ghi thành đơn nghỉ không lương công ty (loại Ốm / Thai sản).

### 3.4. Kỷ luật và đào tạo

- Hình thức kỷ luật theo Điều 124; tự xoá kỷ luật theo Điều 126 (khiển trách 3 tháng, kéo dài nâng lương 6 tháng, cách chức 3 năm).
- **Không phạt tiền** (Điều 127): tiền chỉ ở khen thưởng hoặc bồi thường thiệt hại (Điều 129).
- Bồi hoàn đào tạo khi nghỉ trước hạn cam kết: chi phí × thời gian cam kết còn lại / tổng thời gian cam kết.

### 3.5. Phép năm

12 ngày / năm (Điều 113), +1 ngày mỗi 5 năm thâm niên (Điều 114), tính theo tỷ lệ tháng làm việc ở năm vào làm / nghỉ việc; chỉ tính thứ 2 – thứ 6, không tính ngày lễ; chuyển phép tồn sang năm sau (số ngày tối đa và hạn dùng cấu hình được).

---

## 4. Kiến trúc

```
HRMS/
├── backend/                       API — Node.js, Express, TypeScript, Prisma
│   ├── prisma/
│   │   ├── schema.prisma          56 bảng dữ liệu
│   │   ├── migrations/            lịch sử thay đổi cấu trúc database
│   │   ├── seed.ts                danh mục, tham số pháp lý, tài khoản admin
│   │   ├── seed-demo.ts           tập đoàn mẫu ~150 nhân sự (chỉ môi trường thử)
│   │   └── reset-admin.ts         đặt lại mật khẩu admin
│   ├── scripts/gmail-token.ts     lấy refresh token Gmail OAuth2
│   └── src/
│       ├── common/                xác thực, nhật ký, phạm vi dữ liệu, gửi email, tiện ích ngày / tiền
│       ├── config/                biến môi trường, Prisma client
│       └── modules/               22 phân hệ: corehr, attendance, shift, leave, overtime, payroll,
│                                  reports, benefits, people, assets, checklist, recruitment,
│                                  notification, jobs, approval, dashboard, import, audit, settings, auth, me, health
└── frontend/                      Web — React 18, TypeScript, Vite, Bootstrap 5.3 (PWA)
    ├── public/                    biểu tượng, manifest, service worker
    └── src/{pages,components,lib}
```

**Điểm thiết kế chính**

- **Tách logic thuần khỏi truy cập dữ liệu:** công thức (lương, thuế, BHXH, giờ công, ghép lần quẹt…) nằm trong `*.logic.ts` /
  `*.calc.ts`, không phụ thuộc database, có unit test riêng.
- **Tiền tệ dùng `Decimal`** ở mọi phép tính; **dữ liệu theo ngày hiệu lực** cho lương, vị trí, ca, tham số pháp lý.
- **Prisma extension** cho nhật ký thao tác (ghi giá trị trước / sau) và **phạm vi dữ liệu** (lọc tự động mọi truy vấn).
- **Giờ Việt Nam** cố định (`TZ=Asia/Ho_Chi_Minh`) — máy chủ cloud mặc định UTC.
- Giao dịch database tối đa 60 giây (phù hợp database ở xa).

---

## 5. Cài đặt và chạy trên máy

**Yêu cầu:** Node.js 20+ (đã thử với 24), PostgreSQL 14+ (hoặc Neon / Supabase).

### 5.1. Backend

```bash
cd backend
cp .env.example .env             # sửa DATABASE_URL, JWT_SECRET, SEED_ADMIN_PASSWORD
npm install
npm run prisma:generate
npm run prisma:migrate           # tạo bảng
npx prisma db execute --file prisma/migrations/manual_partial_unique_indexes.sql
npm run seed                     # danh mục, tham số pháp lý, ca, mẫu tiếp nhận, tài khoản admin
npm run dev                      # http://localhost:4000
```

Kiểm tra: http://localhost:4000/api/health → `{"status":"ok","db":"connected"}`.

### 5.2. Frontend

```bash
cd frontend
cp .env.example .env             # VITE_API_URL=http://localhost:4000/api
npm install
npm run dev                      # http://localhost:5173
```

### 5.3. Dữ liệu mẫu

```bash
cd backend
npm run seed:demo -- --reset     # XOÁ dữ liệu nghiệp vụ rồi tạo tập đoàn mẫu
```

Tập đoàn đa ngành (Văn phòng, Sản xuất, Thương mại, Dịch vụ – Logistics, Xây dựng) ~150 nhân sự giả: hợp đồng, lương, phụ cấp,
tài khoản ngân hàng, chấm công 3 tháng theo ca (xoay ca khối sản xuất), nghỉ phép, làm thêm, tạm ứng, kỳ lương từ tháng 1,
khen thưởng, đào tạo, đánh giá, tài sản, hồ sơ BHXH, tiếp nhận nhân viên mới, tuyển dụng.
**Chỉ dùng cho môi trường thử — không chạy trên database thật.**

### 5.4. Các lệnh

| Thư mục | Lệnh | Tác dụng |
|---|---|---|
| backend | `npm run dev` | Chạy API, tự tải lại khi sửa code |
| backend | `npm run build` / `npm start` | Biên dịch / chạy bản build |
| backend | `npm test` | Chạy unit test (Vitest) |
| backend | `npm run prisma:migrate` | Tạo migration mới khi sửa `schema.prisma` |
| backend | `npm run seed` / `npm run seed:demo -- --reset` | Danh mục / dữ liệu mẫu |
| backend | `npm run reset:admin` | Đặt lại mật khẩu admin theo `SEED_ADMIN_PASSWORD`, mở khoá |
| backend | `npm run gmail:token` | Lấy refresh token Gmail OAuth2 |
| frontend | `npm run dev` / `npm run build` / `npm run preview` | Chạy thử / build / xem bản build |

---

## 6. Biến môi trường

### 6.1. Backend (`backend/.env`)

| Biến | Bắt buộc | Mô tả |
|---|:-:|---|
| `DATABASE_URL` | ✅ | Chuỗi kết nối PostgreSQL |
| `JWT_SECRET` | ✅ | Khoá ký phiên đăng nhập, ≥ 32 ký tự ngẫu nhiên |
| `NODE_ENV` | | `development` / `production` |
| `PORT` | | Cổng API (mặc định 4000; Render tự cấp) |
| `CORS_ORIGINS` | | Địa chỉ giao diện được phép gọi API, cách nhau dấu phẩy |
| `APP_URL` | | Địa chỉ giao diện (link trong email) |
| `JWT_EXPIRES_IN` | | Thời hạn phiên mặc định (vd `8h`) |
| `SEED_ADMIN_PASSWORD` | khi seed | Mật khẩu admin tạo lần đầu |
| `TRUST_PROXY_HOPS` | | Số proxy phía trước (mặc định 1 khi production) — để lấy đúng IP người dùng |
| `CRON_SECRET` | | Khoá ≥ 16 ký tự cho `POST /api/cron/daily`; bỏ trống = tắt |
| `GMAIL_USER`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` | | Gửi email Gmail OAuth2 (xem mục 8.1) |
| `GMAIL_SEND_VIA` | | `smtp` (mặc định) hoặc `api` (Gmail API qua HTTPS) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | | SMTP thường (khi không dùng Gmail OAuth2) |
| `SMTP_FROM` | | Tên / địa chỉ người gửi |

### 6.2. Frontend (`frontend/.env`) — gắn vào bản build

| Biến | Mô tả |
|---|---|
| `VITE_API_URL` | Địa chỉ API, có `/api` ở cuối |
| `VITE_SHOW_DEMO_ACCOUNTS` | `true` để hiện tài khoản dùng thử ở màn hình đăng nhập (chỉ cho bản demo) |

---

## 7. Triển khai online (Render + Neon)

| Thành phần | Nơi chạy | Địa chỉ |
|---|---|---|
| Giao diện | Render — Web Service `HRMS` | https://hrms-lk4o.onrender.com |
| API | Render — Web Service `hrms-api` | https://hrms-api-q4ue.onrender.com |
| Database | Neon PostgreSQL | — |

Neon được dùng thay Postgres miễn phí của Render (bị xoá sau 30 ngày). Nên đặt database **cùng vùng** với API
(khuyến nghị Singapore cho người dùng Việt Nam).

### 7.1. Database (Neon)

Tạo project → **Connect** → **tắt Connection pooling** → chép chuỗi kết nối, bỏ `&channel_binding=require`. Không dùng địa chỉ `-pooler`
(lệnh migrate sẽ treo). **Không commit chuỗi này.**

```powershell
cd backend
npm install
$env:DATABASE_URL="<chuỗi Neon>&connect_timeout=30"
$env:SEED_ADMIN_PASSWORD="<mật khẩu admin>"
$env:PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK="1"
npx prisma migrate deploy
npx prisma db execute --file prisma/migrations/manual_partial_unique_indexes.sql
npm run seed
npm run seed:demo -- --reset      # tuỳ chọn; chạy ở MỘT terminal, có thể mất 30–60 phút nếu database ở xa
```

### 7.2. API (Render → New → Web Service)

| Mục | Giá trị |
|---|---|
| Root Directory | `backend` |
| Build Command | `npm install --include=dev && npx prisma generate && npm run build` |
| Start Command | `npm start` |
| Environment | `DATABASE_URL`, `NODE_ENV=production`, `JWT_SECRET`, `JWT_EXPIRES_IN=8h`, `CORS_ORIGINS`, `APP_URL`; tuỳ chọn `CRON_SECRET`, `GMAIL_*` |

Tạo `JWT_SECRET`: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

### 7.3. Giao diện (Render → New → Web Service)

| Mục | Giá trị |
|---|---|
| Root Directory | `frontend` |
| Build Command | `npm install && npm run build` |
| Start Command | `npm run preview` |
| Environment | `VITE_API_URL=https://<api>/api`, tuỳ chọn `VITE_SHOW_DEMO_ACCOUNTS=true` |

Biến `VITE_*` gắn lúc build → đổi xong chọn **Manual Deploy → Clear build cache & deploy**.

### 7.4. Cập nhật bản online

1. Có migration mới → chạy `npx prisma migrate deploy` (và `npm run seed` nếu có danh mục mới) với chuỗi Neon **trước khi push**
   (Start Command không tự migrate). Migration chỉ thêm cột / bảng nên bản đang chạy không bị ảnh hưởng.
2. Commit, push lên GitHub → Render tự build lại (hoặc **Manual Deploy**).

### 7.5. Cài trên điện thoại

Mở địa chỉ giao diện bằng Chrome (Android) / Safari (iOS) → **Thêm vào màn hình chính**. Ứng dụng mở thẳng trang Chấm công;
không lưu dữ liệu nhân sự ngoại tuyến.

---

## 8. Tích hợp: email Gmail OAuth2, nhắc việc tự động

### 8.1. Gửi email bằng Gmail OAuth2

Cấu hình **ngay trên web**, không cần mật khẩu Gmail, không cần dòng lệnh: *Cấu hình hệ thống → Gửi email*.

1. https://console.cloud.google.com → tạo project → *APIs & Services → Library* → bật **Gmail API**.
2. *Google Auth Platform*: đối tượng **External** (hoặc **Internal** với Google Workspace), điền tên ứng dụng, email hỗ trợ;
   ở *Audience* bấm **Publish app** — để ở *Testing* thì kết nối **hết hạn sau 7 ngày**.
3. *Clients → Create client* → loại **Web application** → *Authorized redirect URIs* thêm địa chỉ hiện ở khung Gửi email
   (dạng `https://<api>/api/settings/mail/oauth/callback`, có nút sao chép) → chép Client ID, Client secret.
4. Trên web: *Cách gửi* = **Gmail OAuth2**, dán Client ID, Client secret, chọn *Gửi qua* (SMTP, hoặc **Gmail API** nếu hosting chặn cổng SMTP —
   khuyên dùng trên Render) → bấm **Kết nối Gmail** → đăng nhập Gmail dùng để gửi → **Cho phép**. Hệ thống tự lưu refresh token và địa chỉ gửi.
5. Bấm **Gửi thử** — lỗi (sai client, token bị thu hồi…) được báo rõ.

- Client secret, refresh token, mật khẩu SMTP được **mã hoá (AES-256-GCM)** khi lưu, không bao giờ hiển thị lại; khoá dẫn xuất từ `JWT_SECRET`
  — đổi `JWT_SECRET` thì phải nhập / kết nối lại.
- Cùng khung đó cấu hình được **SMTP thường**, hoặc chọn **Theo biến môi trường** để dùng cách cũ (`GMAIL_*`, `SMTP_*`; refresh token lấy bằng
  `npm run gmail:token` với client loại *Desktop app*), hoặc **Không gửi**.
- Gmail cá nhân gửi khoảng 500 người nhận / ngày (Workspace ~2.000). Thu hồi quyền: https://myaccount.google.com/permissions
  (hoặc bấm **Ngắt kết nối**).

### 8.2. Nhắc việc hằng ngày

Chạy sau 7:00 mỗi ngày bằng ba cách bổ sung cho nhau: lịch trong server; tự chạy bù khi có người mở ứng dụng;
dịch vụ ngoài gọi API. Render gói miễn phí ngủ khi không có người dùng, nên để nhắc đúng giờ:

1. Đặt `CRON_SECRET` cho backend.
2. Tạo lịch trên cron-job.org: `POST https://<api>/api/cron/daily`, 7:05 hằng ngày (Asia/Ho_Chi_Minh),
   header `X-Cron-Secret: <CRON_SECRET>` (lời gọi này cũng đánh thức server).

*Cấu hình hệ thống → Nhắc việc hằng ngày* hiện lần chạy gần nhất và có nút **Chạy ngay**.

---

## 9. Bảo mật

| Lớp | Biện pháp |
|---|---|
| Mật khẩu | Băm scrypt; tối thiểu 8 ký tự có chữ và số, không chứa tên đăng nhập; bắt đổi ở lần đăng nhập đầu và sau khi quản trị đặt lại |
| Đăng nhập | Sai 5 lần → khoá 15 phút; mỗi IP tối đa 20 lần / 15 phút; quên mật khẩu bằng link dùng một lần (30 phút) |
| Phiên | JWT HS256; đổi / đặt lại mật khẩu → mọi phiên cũ hết hiệu lực; khoá tài khoản có hiệu lực ngay |
| Phân quyền | Theo nhóm quyền (quản trị cấu hình) cho từng chức năng + phạm vi dữ liệu theo đơn vị; quản lý chỉ thấy đơn của nhân viên mình; nhân viên chỉ thấy dữ liệu của mình |
| Kiểm soát | Nhật ký thao tác (trước / sau), nhật ký đăng nhập; mật khẩu luôn được che |
| Hạ tầng | Helmet, CORS giới hạn nguồn, lấy đúng IP sau proxy, khoá cron so sánh an toàn thời gian, bí mật chỉ nằm trong biến môi trường |
| Dữ liệu | Không đưa dữ liệu nhân sự thật lên host miễn phí; ứng dụng điện thoại không lưu dữ liệu ngoại tuyến |

---

## 10. Kiểm thử và chất lượng

```bash
cd backend
npm test          # 241 unit test (Vitest)
cd ../frontend
npm run build     # kiểm tra kiểu TypeScript + build
```

- **Unit test** cho mọi công thức: lương, thuế lũy tiến, bảo hiểm, Net → Gross, nghỉ việc, phép năm, làm thêm, giờ công theo ca,
  ghép lần quẹt máy chấm công, BHXH, báo cáo D02 / 05KK / quyết toán, kỷ luật, đào tạo, đánh giá, phạm vi dữ liệu, gửi email.
- **Kiểm thử đầu-cuối** (gọi API thật trên dữ liệu mẫu, đối chiếu với database) cho từng đợt chức năng — gần 300 tình huống gồm
  phân quyền, kiểm tra dữ liệu sai, luồng duyệt, số liệu báo cáo, phạm vi dữ liệu.
- Giao diện được kiểm tra bằng ảnh chụp tự động trên màn hình máy tính và điện thoại.

---

## 11. Vận hành và xử lý sự cố

### 11.1. Định kỳ

- **Sao lưu database** (Neon: bật lịch sao lưu / point-in-time restore).
- Cập nhật **tham số pháp lý** khi nhà nước thay đổi (lương cơ sở, lương tối thiểu vùng, giảm trừ gia cảnh, tỷ lệ BH).
- Cập nhật **ngày lễ** (Tết âm lịch, nghỉ bù) mỗi năm.
- Xoay vòng các bí mật (`JWT_SECRET`, mật khẩu database, Gmail refresh token) khi có nghi ngờ lộ.

### 11.2. Lỗi thường gặp

| Hiện tượng | Nguyên nhân / cách xử lý |
|---|---|
| `Blocked request. This host … is not allowed` | Thiếu `preview.allowedHosts` trong `frontend/vite.config.ts` (đã cấu hình `*.onrender.com`) |
| Deploy giao diện chạy ~15 phút rồi Failed | `vite preview` phải nghe `0.0.0.0:$PORT` (đã cấu hình) |
| `Failed to construct 'URL': Invalid URL` khi đăng nhập | `VITE_API_URL` sai dạng (thiếu / thừa `https://`) |
| `P1002 … advisory lock` khi migrate | Đặt `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1`, không dùng địa chỉ `-pooler` |
| `violates RESTRICT setting of foreign key` khi `seed:demo` | Một lần seed khác còn chạy ngầm → dừng tiến trình Node rồi chạy lại |
| `Transaction already closed … timeout` | Database ở xa; giao dịch đã nâng lên 60 giây — đặt database cùng vùng với API |
| Admin sai mật khẩu | `npm run seed` chỉ đặt mật khẩu lần đầu → `npm run reset:admin` |
| Đăng nhập báo quá nhiều lần thử | Giới hạn 20 lần / IP / 15 phút; chờ hoặc khởi động lại server (bộ đếm trong bộ nhớ) |
| Không nhận được email | *Gửi thử* trong Cấu hình hệ thống để xem lỗi; hosting chặn SMTP → `GMAIL_SEND_VIA=api` |
| Nhắc việc không chạy đúng 7:00 | Server đang ngủ → cấu hình `CRON_SECRET` + cron-job.org (mục 8.2) |
| Lần mở đầu tiên chậm ~1 phút | Render gói miễn phí ngủ sau ~15 phút không dùng |

---

## 12. Giới hạn đã biết và lộ trình

**Giới hạn hiện tại**

- Báo cáo BHXH / thuế xuất **Excel tham khảo**, chưa phải file XML nộp thẳng lên cổng điện tử; chứng từ thuế chưa có chữ ký số.
- Chế độ BHXH: số năm đóng BHXH đang ước tính theo thời gian làm việc; chưa có chế độ ốm dài ngày.
- Máy chấm công và ngân hàng kết nối qua file, chưa tích hợp trực tiếp.
- Khi bật phạm vi dữ liệu, danh sách tài sản vẫn hiện toàn công ty (chỉ ẩn người đang giữ ngoài phạm vi).

**Lộ trình đề xuất**

- Đăng nhập 2 lớp (OTP) cho quản trị và kế toán.
- Báo cáo phân tích nhân sự: tỷ lệ nghỉ việc, thâm niên, chi phí theo khối, tương quan đánh giá – lương.
- Đánh giá 360°, đề xuất tăng lương / thưởng từ kết quả đánh giá.
- Xuất XML theo chuẩn cổng BHXH / thuế điện tử.

---

## 13. Nguyên tắc bắt buộc của dự án

1. **Tính tiền phải dùng `Decimal`** (Prisma Decimal hoặc `decimal.js`) — không dùng `+ - * /` trên `number` cho lương, thuế, bảo hiểm.
2. **Dữ liệu thay đổi theo thời gian** dùng mô hình ngày hiệu lực (`effectiveDate` / `endDate`).
3. **Mọi công thức lương / thuế / bảo hiểm phải có unit test** dựa trên ví dụ đã được kế toán xác nhận.
4. **Không đưa dữ liệu nhân sự thật lên host miễn phí.** Chỉ dùng dữ liệu giả.
