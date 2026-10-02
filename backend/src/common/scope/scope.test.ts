import { describe, expect, it } from 'vitest';
import { expandOrgTree } from './scope';

describe('phạm vi dữ liệu theo đơn vị', () => {
  const orgs = [
    { id: 'ROOT', parentId: null },
    { id: 'SX', parentId: 'ROOT' },
    { id: 'XLR', parentId: 'SX' },
    { id: 'XCK', parentId: 'SX' },
    { id: 'TO1', parentId: 'XLR' },
    { id: 'KD', parentId: 'ROOT' },
  ];
  it('gồm đơn vị được gán và toàn bộ đơn vị con', () => {
    expect([...expandOrgTree(['SX'], orgs)].sort()).toEqual(['SX', 'TO1', 'XCK', 'XLR']);
  });
  it('nhiều đơn vị, không lặp, không lan sang nhánh khác', () => {
    expect([...expandOrgTree(['XLR', 'KD', 'TO1'], orgs)].sort()).toEqual(['KD', 'TO1', 'XLR']);
  });
  it('rỗng → rỗng', () => {
    expect(expandOrgTree([], orgs).size).toBe(0);
  });
});
