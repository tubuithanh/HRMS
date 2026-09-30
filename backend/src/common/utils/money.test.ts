import { describe, it, expect } from 'vitest';
import { add, sub, mul, divRound, sum, roundVND, toDbString } from './money';

describe('money utils', () => {
  it('cộng chính xác, không sai số như số thực', () => {
    // Với number thường: 0.1 + 0.2 === 0.30000000000000004
    expect(add('0.1', '0.2').toString()).toBe('0.3');
  });

  it('trừ chính xác', () => {
    expect(sub('20000000', '2100000').toString()).toBe('17900000');
  });

  it('nhân tỷ lệ bảo hiểm 10.5% chính xác', () => {
    // Lương đóng BH 20.000.000 * 10.5% = 2.100.000
    expect(mul('20000000', '0.105').toString()).toBe('2100000');
  });

  it('chia có kiểm soát: lương chia cho 3 (không chia hết)', () => {
    // 10.000.000 / 3 = 3.333.333,3333... giữ 10 chữ số thập phân
    const r = divRound('10000000', 3);
    expect(r.toString()).toBe('3333333.3333333333');
  });

  it('chia rồi cộng dồn 3 phần không vượt quá số gốc quá 1 đồng', () => {
    // Đây là lý do phải làm tròn ở bước cuối: chia 3 phần rồi cộng lại
    const part = divRound('10000000', 3, 0); // làm tròn về đồng
    const total = roundVND(sum([part, part, part]));
    // 3.333.333 * 3 = 9.999.999 — lệch 1 đồng so với gốc, cần xử lý bù ở
    // bước phân bổ. Test này ghi nhận hành vi để không ai bất ngờ.
    expect(total.toString()).toBe('9999999');
  });

  it('divRound ném lỗi khi chia cho 0', () => {
    expect(() => divRound('100', 0)).toThrow();
  });

  it('làm tròn về đồng VND', () => {
    expect(roundVND('2100000.6').toString()).toBe('2100001');
    expect(roundVND('2100000.4').toString()).toBe('2100000');
  });

  it('toDbString giới hạn số chữ số thập phân', () => {
    const value = divRound('10000000', 3); // 3333333.3333333333
    expect(toDbString(value)).toBe('3333333.3333'); // cắt còn 4 chữ số
  });
});
