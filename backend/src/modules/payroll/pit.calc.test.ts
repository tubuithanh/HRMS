import { describe, it, expect } from 'vitest';
import {
  calcProgressivePIT,
  calcProgressivePITQuick,
  calcFlat10,
  calcFlat20,
} from './pit.calc';

describe('Thuế TNCN lũy tiến 5 bậc 2026', () => {
  it('thu nhập tính thuế <= 0 thì thuế = 0', () => {
    expect(calcProgressivePIT(0).toString()).toBe('0');
    expect(calcProgressivePIT(-1_000_000).toString()).toBe('0');
  });

  it('bậc 1: thu nhập tính thuế 5.150.000 -> 257.500', () => {
    expect(calcProgressivePIT(5_150_000).toString()).toBe('257500');
  });

  it('đúng ranh giới bậc 1: 10.000.000 -> 500.000', () => {
    expect(calcProgressivePIT(10_000_000).toString()).toBe('500000');
  });

  it('bậc 2: thu nhập tính thuế 17.154.000 -> 1.215.400', () => {
    expect(calcProgressivePIT(17_154_000).toString()).toBe('1215400');
  });

  it('bậc 3: 40.000.000 -> 4.500.000', () => {
    // 500k (bậc1) + 2.000k (bậc2: 20tr*10%) + 2.000k (bậc3: 10tr*20%)
    expect(calcProgressivePIT(40_000_000).toString()).toBe('4500000');
  });

  it('bậc 5: 120.000.000 -> 27.500.000', () => {
    // quick: 120tr*35% - 14.5tr = 42tr - 14.5tr = 27.5tr
    expect(calcProgressivePIT(120_000_000).toString()).toBe('27500000');
  });

  it('cách lũy tiến và cách tính nhanh cho cùng kết quả', () => {
    for (const income of [
      5_150_000, 10_000_000, 17_154_000, 40_000_000, 75_000_000, 120_000_000,
    ]) {
      expect(calcProgressivePIT(income).toString()).toBe(
        calcProgressivePITQuick(income).toString(),
      );
    }
  });
});

describe('Khấu trừ cố định', () => {
  it('10% cho hợp đồng dưới 3 tháng', () => {
    expect(calcFlat10(5_000_000).toString()).toBe('500000');
  });

  it('20% cho cá nhân không cư trú', () => {
    expect(calcFlat20(5_000_000).toString()).toBe('1000000');
  });
});

describe('khấu trừ 10% — ngưỡng 2 triệu đồng/lần', () => {
  it('dưới 2 triệu không khấu trừ, từ 2 triệu khấu trừ 10%', () => {
    expect(calcFlat10(1_999_999).toString()).toBe('0');
    expect(calcFlat10(2_000_000).toString()).toBe('200000');
  });
});
