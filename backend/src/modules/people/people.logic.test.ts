import { describe, expect, it } from 'vitest';
import { disciplineExpiry, ratingOf, trainingRefund, validateGoalTemplate, weightedScore } from './people.logic';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (x: Date | null) => x?.toISOString().slice(0, 10) ?? null;

describe('Kỷ luật — xoá kỷ luật (Điều 126 BLLĐ 2019)', () => {
  it('khiển trách 3 tháng, kéo dài nâng lương 6 tháng, cách chức 3 năm, sa thải không xoá', () => {
    expect(iso(disciplineExpiry('REPRIMAND', d('2026-01-15')))).toBe('2026-04-15');
    expect(iso(disciplineExpiry('EXTEND_RAISE', d('2026-01-15')))).toBe('2026-07-15');
    expect(iso(disciplineExpiry('DEMOTE', d('2026-01-15')))).toBe('2029-01-15');
    expect(disciplineExpiry('DISMISS', d('2026-01-15'))).toBeNull();
  });
});

describe('Đào tạo — bồi hoàn theo tỷ lệ thời gian cam kết còn lại', () => {
  // Khoá kết thúc 01/01/2026, cam kết 12 tháng → hết cam kết 01/01/2027 (365 ngày).
  it('nghỉ giữa chừng: bồi hoàn theo số ngày còn lại', () => {
    // Nghỉ 02/07/2026: còn 183/365 ngày → 12.000.000 × 183/365 = 6.016.438
    expect(trainingRefund(12_000_000, 12, d('2026-01-01'), d('2026-07-02')).toNumber()).toBe(6_016_438);
  });
  it('nghỉ ngay khi vừa học xong: bồi hoàn toàn bộ', () => {
    expect(trainingRefund(12_000_000, 12, d('2026-01-01'), d('2025-12-20')).toNumber()).toBe(12_000_000);
  });
  it('hết cam kết hoặc không cam kết: không bồi hoàn', () => {
    expect(trainingRefund(12_000_000, 12, d('2026-01-01'), d('2027-01-01')).toNumber()).toBe(0);
    expect(trainingRefund(12_000_000, 0, d('2026-01-01'), d('2026-02-01')).toNumber()).toBe(0);
  });
});

describe('Đánh giá hiệu suất', () => {
  const goals = [
    { title: 'Doanh số', weight: 50, selfScore: 4, managerScore: 5 },
    { title: 'Khách hàng mới', weight: 30, selfScore: 3, managerScore: 4 },
    { title: 'Tuân thủ', weight: 20, selfScore: 5, managerScore: 3 },
  ];
  it('điểm bình quân gia quyền', () => {
    expect(weightedScore(goals, 'selfScore')).toBe(3.9); // (200+90+100)/100
    expect(weightedScore(goals, 'managerScore')).toBe(4.3); // (250+120+60)/100
  });
  it('chưa chấm đủ → null', () => {
    expect(weightedScore([{ title: 'a', weight: 100, managerScore: null }], 'managerScore')).toBeNull();
  });
  it('xếp loại', () => {
    expect([4.5, 4.49, 3.5, 2.5, 2.49].map(ratingOf)).toEqual(['A', 'B', 'B', 'C', 'D']);
  });
  it('kiểm tra mẫu mục tiêu', () => {
    expect(validateGoalTemplate([{ title: 'a', weight: 60 }, { title: 'b', weight: 40 }])).toBeNull();
    expect(validateGoalTemplate([{ title: 'a', weight: 60 }])).toContain('100');
    expect(validateGoalTemplate([])).not.toBeNull();
    expect(validateGoalTemplate([{ title: ' ', weight: 100 }])).not.toBeNull();
  });
});
