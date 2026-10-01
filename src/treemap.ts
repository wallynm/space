export type Rect = {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
};
/** Weighted binary partition. Positive weights occupy the complete rectangle. */
export function treemap(weights: number[]): Rect[] {
  const values = weights
    .map((w, index) => ({
      index,
      weight: Math.max(0, Number.isFinite(w) ? w : 0),
    }))
    .filter((v) => v.weight > 0);
  const result: Rect[] = [];
  function partition(
    items: typeof values,
    x: number,
    y: number,
    width: number,
    height: number,
  ) {
    if (!items.length) return;
    if (items.length === 1) {
      result.push({ index: items[0].index, x, y, width, height });
      return;
    }
    const total = items.reduce((t, i) => t + i.weight, 0);
    let sum = 0,
      cut = 1,
      best = Infinity;
    for (let i = 1; i < items.length; i++) {
      sum += items[i - 1].weight;
      const distance = Math.abs(total / 2 - sum);
      if (distance < best) {
        best = distance;
        cut = i;
      }
    }
    const fraction =
      items.slice(0, cut).reduce((t, i) => t + i.weight, 0) / total;
    if (width >= height) {
      partition(items.slice(0, cut), x, y, width * fraction, height);
      partition(
        items.slice(cut),
        x + width * fraction,
        y,
        width * (1 - fraction),
        height,
      );
    } else {
      partition(items.slice(0, cut), x, y, width, height * fraction);
      partition(
        items.slice(cut),
        x,
        y + height * fraction,
        width,
        height * (1 - fraction),
      );
    }
  }
  partition(values, 0, 0, 100, 100);
  return result;
}
