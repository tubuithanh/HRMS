import { describe, it, expect } from 'vitest';
import { replacePrefix, isDescendantPath } from './org.path';

describe('org path helpers', () => {
  it('thay prefix ở đầu chuỗi', () => {
    expect(replacePrefix('/ATECH/QC/Nhom1/', '/ATECH/QC/', '/ATECH/SX/QC/')).toBe(
      '/ATECH/SX/QC/Nhom1/',
    );
  });

  it('KHÔNG thay nhầm đoạn giữa khi mã lặp lại trong path', () => {
    // Đây là lỗi cũ: String.replace thay lần khớp đầu, có thể trúng đoạn giữa.
    // Với replacePrefix, chỉ prefix ở đầu bị thay.
    const path = '/ATECH/QC/ATECH/'; // 'ATECH' xuất hiện 2 lần
    expect(replacePrefix(path, '/ATECH/', '/BTECH/')).toBe('/BTECH/QC/ATECH/');
  });

  it('trả nguyên chuỗi nếu prefix không khớp đầu', () => {
    expect(replacePrefix('/ATECH/QC/', '/OTHER/', '/X/')).toBe('/ATECH/QC/');
  });

  it('phát hiện đúng quan hệ cha-con để chống vòng lặp', () => {
    const parentPath = '/ATECH/';
    const childPath = '/ATECH/QC/';
    // childPath nằm trong nhánh của parentPath -> không cho chọn child làm cha
    expect(isDescendantPath(childPath, parentPath)).toBe(true);
    // parentPath không nằm trong nhánh con của childPath
    expect(isDescendantPath(parentPath, childPath)).toBe(false);
  });
});
