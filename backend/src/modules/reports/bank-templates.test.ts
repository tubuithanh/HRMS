import { describe, expect, it } from 'vitest';
import { bankTemplatesSchema, BankTemplate, cellValue, DEFAULT_TEMPLATE, toCsv } from './bank-templates';

const row = { codeEmp: 'NV01', fullName: 'Nguyễn Văn "A"', beneficiary: 'NGUYEN VAN A', accountNo: '0071000123456', bank: 'VCB', branch: 'Dĩ An, Bình Dương', amount: 12_500_000 };

describe('mẫu file chuyển lương', () => {
  it('giá trị từng cột', () => {
    expect(cellValue('stt', row, 4, 'X')).toBe(5);
    expect(cellValue('bankName', row, 0, 'X')).toBe('Vietcombank');
    expect(cellValue('accountNo', row, 0, 'X')).toBe('0071000123456'); // giữ số 0 đầu
    expect(cellValue('content', row, 0, 'TRA LUONG T09 2026')).toBe('TRA LUONG T09 2026');
  });

  it('CSV có BOM, bọc ngoặc kép ô có dấu phẩy / ngoặc kép', () => {
    const t: BankTemplate = {
      ...DEFAULT_TEMPLATE,
      format: 'csv',
      columns: [
        { field: 'accountNo', header: 'So TK' },
        { field: 'fullName', header: 'Ho ten' },
        { field: 'branch', header: 'Chi nhanh' },
        { field: 'amount', header: 'So tien' },
      ],
    };
    const csv = toCsv(t, [row], 'X');
    expect(csv.startsWith('﻿So TK,Ho ten,Chi nhanh,So tien\r\n')).toBe(true);
    expect(csv).toContain('0071000123456,"Nguyễn Văn ""A""","Dĩ An, Bình Dương",12500000');
    expect(toCsv({ ...t, headerRow: false }, [row], 'X').split('\r\n')[0]).toContain('0071000123456');
  });

  it('kiểm tra mẫu: trùng mã, trường không tồn tại', () => {
    expect(bankTemplatesSchema.safeParse([DEFAULT_TEMPLATE, DEFAULT_TEMPLATE]).success).toBe(false);
    expect(bankTemplatesSchema.safeParse([{ ...DEFAULT_TEMPLATE, columns: [{ field: 'xyz', header: 'a' }] }]).success).toBe(false);
    expect(bankTemplatesSchema.safeParse([DEFAULT_TEMPLATE]).success).toBe(true);
  });
});
