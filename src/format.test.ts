import { describe, it, expect } from "vitest";
import { bytes, shortPath, selectedBytes } from "./format";
describe("Review totals and disk labels", () => {
  it("uses decimal GB consistently with macOS", () =>
    expect(bytes(101_000_000_000)).toBe("101,0 GB"));
  it("does not include blocked candidates in a cleanup estimate", () =>
    expect(
      selectedBytes(
        [
          { id: "a", bytes: 100, blocked: null },
          { id: "b", bytes: 900, blocked: "tracked" },
        ],
        new Set(["a", "b"]),
      ),
    ).toBe(100));
  it("never shortens an unrelated username prefix", () =>
    expect(shortPath("/Users/ana2/project", "/Users/ana")).toBe(
      "/Users/ana2/project",
    ));
  it("handles zero and unavailable numbers", () => {
    expect(bytes(0)).toBe("0 B");
    expect(bytes(NaN)).toBe("—");
  });
});
