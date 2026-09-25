import { describe, it, expect } from 'vitest';
import { groupLines } from '../src/ruler.js';

const box = (top, h = 24) => ({ top, bottom: top + h });

describe('groupLines', () => {
  it('groups words on the same line and starts a new line below', () => {
    const lines = groupLines([box(10), box(10), box(12, 20), box(56), box(56), box(102)]);
    expect(lines.map((l) => [l.first, l.last])).toEqual([
      [0, 2],
      [3, 4],
      [5, 5],
    ]);
    expect(lines[0]).toMatchObject({ top: 10, bottom: 34 });
  });

  it('skips words that are not shown', () => {
    const lines = groupLines([box(10), null, box(10), box(56)]);
    expect(lines.map((l) => [l.first, l.last])).toEqual([
      [0, 2],
      [3, 3],
    ]);
  });

  it('treats a new paragraph as a new line', () => {
    const lines = groupLines([box(10), box(120), box(120)]);
    expect(lines).toHaveLength(2);
  });
});
