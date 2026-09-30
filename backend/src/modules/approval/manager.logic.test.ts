import { describe, expect, it } from 'vitest';
import { computeManagers } from './manager.logic';

/*
 * Cây tổ chức:
 *   ROOT (TGD)
 *   └─ SX (GĐ khối)
 *      ├─ XLR  (quản đốc KHÔNG phải vị trí then chốt; 2 công nhân)
 *      └─ QC   (trưởng phòng QC; 1 nhân viên)
 *   └─ TM (không có người đứng đầu)
 *      └─ KD (trưởng phòng KD; 1 nhân viên; 1 nhân viên có quản lý chỉ định riêng)
 */
const orgs = [
  { id: 'ROOT', parentId: null },
  { id: 'SX', parentId: 'ROOT' },
  { id: 'XLR', parentId: 'SX' },
  { id: 'QC', parentId: 'SX' },
  { id: 'TM', parentId: 'ROOT' },
  { id: 'KD', parentId: 'TM' },
];
const a = (employmentId: string, orgId: string, isKeyPosition = false, directManagerEmploymentId: string | null = null) => ({
  employmentId,
  orgId,
  isKeyPosition,
  directManagerEmploymentId,
});
const assignments = [
  a('tgd', 'ROOT', true),
  a('gd-sx', 'SX', true),
  a('quan-doc', 'XLR'),
  a('cn1', 'XLR'),
  a('cn2', 'XLR'),
  a('tp-qc', 'QC', true),
  a('nv-qc', 'QC'),
  a('tp-kd', 'KD', true),
  a('nv-kd', 'KD'),
  a('nv-kd-2', 'KD', false, 'gd-sx'),
];
const m = computeManagers(orgs, assignments);

describe('computeManagers', () => {
  it('nhân viên → trưởng đơn vị', () => {
    expect(m.get('nv-qc')).toBe('tp-qc');
    expect(m.get('nv-kd')).toBe('tp-kd');
  });

  it('đơn vị không có vị trí then chốt → lên đơn vị cha', () => {
    expect(m.get('cn1')).toBe('gd-sx');
    expect(m.get('quan-doc')).toBe('gd-sx');
  });

  it('trưởng đơn vị → quản lý của đơn vị cha; bỏ qua cấp không có người', () => {
    expect(m.get('tp-qc')).toBe('gd-sx');
    expect(m.get('gd-sx')).toBe('tgd');
    expect(m.get('tp-kd')).toBe('tgd'); // TM không có người đứng đầu
  });

  it('người đứng đầu cao nhất không có quản lý', () => {
    expect(m.get('tgd')).toBeNull();
  });

  it('quản lý chỉ định riêng được ưu tiên', () => {
    expect(m.get('nv-kd-2')).toBe('gd-sx');
  });

  it('quản lý chỉ định đã nghỉ việc → dùng quy tắc theo tổ chức', () => {
    const m2 = computeManagers(orgs, [...assignments.filter((x) => x.employmentId !== 'gd-sx'), a('x', 'KD', false, 'gd-sx')]);
    expect(m2.get('x')).toBe('tp-kd');
  });
});
