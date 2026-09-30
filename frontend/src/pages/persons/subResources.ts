import { FieldDef } from '../../components/ui';
import { options } from '../../lib/format';

/** Cấu hình các nhóm hồ sơ mở rộng: /corehr/persons/:id/<path>. */
export interface SubResource {
  key: string;
  path: string;
  title: string;
  fields: FieldDef[];
  /** Tên trường hiển thị trong bảng. */
  columns: string[];
}

const relationshipOptions = options({
  'Cha': 'Cha',
  'Mẹ': 'Mẹ',
  'Vợ': 'Vợ',
  'Chồng': 'Chồng',
  'Con': 'Con',
  'Anh/chị/em': 'Anh/chị/em',
  'Khác': 'Khác',
});

export const subResources: SubResource[] = [
  {
    key: 'dependants',
    path: 'dependants',
    title: 'Người phụ thuộc',
    fields: [
      { name: 'dependantName', label: 'Họ tên', required: true },
      { name: 'relationship', label: 'Quan hệ', type: 'select', required: true, options: relationshipOptions },
      { name: 'dateOfBirth', label: 'Ngày sinh', type: 'date' },
      { name: 'dependantTaxCode', label: 'MST người phụ thuộc' },
      { name: 'deductionFromMonth', label: 'Giảm trừ từ tháng', type: 'date' },
      { name: 'deductionToMonth', label: 'Giảm trừ đến tháng', type: 'date' },
    ],
    columns: ['dependantName', 'relationship', 'dateOfBirth', 'dependantTaxCode', 'deductionFromMonth', 'deductionToMonth'],
  },
  {
    key: 'relatives',
    path: 'relatives',
    title: 'Người thân',
    fields: [
      { name: 'relativeName', label: 'Họ tên', required: true },
      { name: 'relationship', label: 'Quan hệ', type: 'select', required: true, options: relationshipOptions },
      { name: 'dateOfBirth', label: 'Ngày sinh', type: 'date' },
      { name: 'phone', label: 'Điện thoại' },
      { name: 'occupation', label: 'Nghề nghiệp' },
      { name: 'address', label: 'Địa chỉ', full: true },
      { name: 'isEmergencyContact', label: 'Liên hệ khẩn cấp', type: 'checkbox' },
    ],
    columns: ['relativeName', 'relationship', 'dateOfBirth', 'phone', 'isEmergencyContact'],
  },
  {
    key: 'educations',
    path: 'educations',
    title: 'Học vấn',
    fields: [
      { name: 'schoolName', label: 'Trường', required: true },
      { name: 'major', label: 'Chuyên ngành' },
      { name: 'qualification', label: 'Trình độ', placeholder: 'Đại học, Cao đẳng…' },
      { name: 'graduationYear', label: 'Năm tốt nghiệp', type: 'number' },
      { name: 'grade', label: 'Xếp loại' },
      { name: 'isHighest', label: 'Trình độ cao nhất', type: 'checkbox' },
    ],
    columns: ['schoolName', 'major', 'qualification', 'graduationYear', 'isHighest'],
  },
  {
    key: 'certificates',
    path: 'certificates',
    title: 'Chứng chỉ',
    fields: [
      { name: 'certificateName', label: 'Tên chứng chỉ', required: true },
      { name: 'issuedBy', label: 'Nơi cấp' },
      { name: 'issueDate', label: 'Ngày cấp', type: 'date' },
      { name: 'expiryDate', label: 'Ngày hết hạn', type: 'date' },
      { name: 'isMandatory', label: 'Bắt buộc cho công việc', type: 'checkbox' },
    ],
    columns: ['certificateName', 'issuedBy', 'issueDate', 'expiryDate', 'isMandatory'],
  },
  {
    key: 'experiences',
    path: 'experiences',
    title: 'Kinh nghiệm',
    fields: [
      { name: 'companyName', label: 'Công ty', required: true },
      { name: 'position', label: 'Vị trí' },
      { name: 'fromDate', label: 'Từ ngày', type: 'date' },
      { name: 'toDate', label: 'Đến ngày', type: 'date' },
      { name: 'reasonLeave', label: 'Lý do nghỉ' },
      { name: 'description', label: 'Mô tả công việc', type: 'textarea' },
    ],
    columns: ['companyName', 'position', 'fromDate', 'toDate'],
  },
  {
    key: 'skills',
    path: 'skills',
    title: 'Kỹ năng',
    fields: [
      { name: 'skillName', label: 'Kỹ năng', required: true },
      { name: 'level', label: 'Mức độ', type: 'select', options: options({ 'Cơ bản': 'Cơ bản', 'Khá': 'Khá', 'Thành thạo': 'Thành thạo', 'Chuyên gia': 'Chuyên gia' }) },
    ],
    columns: ['skillName', 'level'],
  },
  {
    key: 'documents',
    path: 'documents',
    title: 'Giấy tờ',
    fields: [
      { name: 'documentType', label: 'Loại giấy tờ', required: true, placeholder: 'CCCD, Sơ yếu lý lịch, Giấy khám SK…' },
      { name: 'documentNo', label: 'Số' },
      { name: 'issueDate', label: 'Ngày cấp', type: 'date' },
      { name: 'expiryDate', label: 'Ngày hết hạn', type: 'date' },
      { name: 'fileName', label: 'Tên file' },
    ],
    columns: ['documentType', 'documentNo', 'issueDate', 'expiryDate'],
  },
  {
    key: 'work-permits',
    path: 'work-permits',
    title: 'Giấy phép lao động',
    fields: [
      { name: 'permitNo', label: 'Số giấy phép' },
      { name: 'permitType', label: 'Loại', type: 'select', options: options({ NEW: 'Cấp mới', REISSUE: 'Cấp lại', EXTEND: 'Gia hạn', EXEMPT: 'Miễn GPLĐ' }) },
      { name: 'positionName', label: 'Vị trí công việc' },
      { name: 'issuedBy', label: 'Nơi cấp' },
      { name: 'issueDate', label: 'Ngày cấp', type: 'date' },
      { name: 'expiryDate', label: 'Ngày hết hạn', type: 'date' },
      { name: 'status', label: 'Trạng thái', type: 'select', options: options({ PREPARING: 'Đang chuẩn bị', SUBMITTED: 'Đã nộp', ISSUED: 'Đã cấp', EXPIRED: 'Hết hạn' }) },
    ],
    columns: ['permitNo', 'permitType', 'issueDate', 'expiryDate', 'status'],
  },
  {
    key: 'residence-cards',
    path: 'residence-cards',
    title: 'Thẻ tạm trú / Visa',
    fields: [
      { name: 'cardType', label: 'Loại', type: 'select', required: true, options: options({ TRC: 'Thẻ tạm trú (TRC)', VISA: 'Visa' }) },
      { name: 'cardNo', label: 'Số thẻ' },
      { name: 'issueDate', label: 'Ngày cấp', type: 'date' },
      { name: 'expiryDate', label: 'Ngày hết hạn', type: 'date' },
    ],
    columns: ['cardType', 'cardNo', 'issueDate', 'expiryDate'],
  },
];
