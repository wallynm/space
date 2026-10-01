import { describe, it, expect } from "vitest";
import { treemap } from "./treemap";
describe("treemap", () => {
  it("preserves proportional area without overlap", () => {
    const weights = [90, 30, 20, 10, 1],
      rects = treemap(weights),
      total = weights.reduce((a, b) => a + b);
    expect(rects.reduce((a, r) => a + r.width * r.height, 0)).toBeCloseTo(
      10000,
    );
    for (const r of rects) {
      expect(r.width * r.height).toBeCloseTo(
        (weights[r.index] / total) * 10000,
      );
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y + r.height).toBeLessThanOrEqual(100.00001);
      for (const s of rects.filter((s) => s.index !== r.index)) {
        const overlap =
          Math.min(r.x + r.width, s.x + s.width) - Math.max(r.x, s.x) > 1e-8 &&
          Math.min(r.y + r.height, s.y + s.height) - Math.max(r.y, s.y) > 1e-8;
        expect(overlap).toBe(false);
      }
    }
  });
  it("handles empty, invalid and zero values", () => {
    expect(treemap([0, -1, NaN, Infinity])).toEqual([]);
    expect(treemap([0, 4])).toEqual([
      { index: 1, x: 0, y: 0, width: 100, height: 100 },
    ]);
  });
});
