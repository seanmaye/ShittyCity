import { describe, expect, it } from 'vitest';
import { rectInRing } from '../js/scene/city.ts';

const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
// the square with a notch cut in from its top edge, down to a point at (5, 4)
const notched = [[0, 0], [10, 0], [10, 10], [6, 10], [5, 4], [4, 10], [0, 10]];

describe('rectInRing', () => {
  it('is true for a rectangle wholly inside', () => {
    expect(rectInRing(square, [2, 2, 8, 8])).toBe(true);
    expect(rectInRing(notched, [1, 1, 9, 3])).toBe(true);
  });
  it('is false for a rectangle partly or wholly outside', () => {
    expect(rectInRing(square, [5, 5, 15, 15])).toBe(false);
    expect(rectInRing(square, [20, 20, 30, 30])).toBe(false);
  });
  it('is false when the outline dips into the rectangle between its corners', () => {
    expect(rectInRing(notched, [1, 1, 9, 8])).toBe(false);
  });
  it('is false for a rectangle that touches the outline', () => {
    expect(rectInRing(square, [0, 2, 5, 8])).toBe(false);
    expect(rectInRing(square, [0, 0, 10, 10])).toBe(false);
  });
});
