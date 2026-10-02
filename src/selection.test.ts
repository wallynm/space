import { describe, expect, it } from "vitest";
import { selectVisible, toggleRange } from "./selection";

const items = ["a", "b", "blocked", "c"].map((id) => ({ id, blocked: id === "blocked" ? "Protected" : null }));
describe("list selection", () => {
  it("selects ranges in either direction and skips protected items", () => {
    expect([...toggleRange(new Set(["outside", "a"]), items, "c", "a")]).toEqual(["outside", "a", "b", "c"]);
    expect([...toggleRange(new Set(["c"]), items, "a", "c")]).toEqual(["c", "a", "b"]);
  });
  it("deselects a range without losing selections outside it", () => {
    expect([...toggleRange(new Set(["outside", "a", "b", "c"]), items, "c", "a")]).toEqual(["outside"]);
  });
  it("falls back to a single item when the anchor disappears", () => {
    expect([...toggleRange(new Set(["outside"]), items, "b", "missing")]).toEqual(["outside", "b"]);
    expect([...toggleRange(new Set(), items, "blocked", "a")]).toEqual([]);
  });
  it("selects and clears only visible, unblocked items", () => {
    expect([...selectVisible(new Set(["outside"]), items)]).toEqual(["outside", "a", "b", "c"]);
    expect([...selectVisible(new Set(["outside", "a", "b"]), items.slice(0, 1), false)]).toEqual(["outside", "b"]);
  });
});
