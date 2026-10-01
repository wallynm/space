import { describe, it, expect } from "vitest";
import { newerOperation } from "./desktop-api";
import type { OperationState } from "./types";
const snapshot = (
  revision: number,
  running = true,
  id = "scan",
): OperationState => ({
  id,
  revision,
  running,
  label: "Analisando",
  startedAt: 1,
  progress: { visited: revision, path: "/fixture" },
});
describe("operation synchronization", () => {
  it("does not let a delayed snapshot overwrite newer progress", () => {
    expect(newerOperation(snapshot(5), snapshot(3)).progress.visited).toBe(5);
  });
  it("does not finish a new operation when an old completion arrives", () => {
    expect(
      newerOperation(snapshot(9, true, "new"), snapshot(8, false, "old"))
        .running,
    ).toBe(true);
  });
  it("shares completion and supports the initial snapshot", () => {
    expect(newerOperation(snapshot(5), snapshot(6, false)).running).toBe(false);
    expect(newerOperation(undefined, snapshot(1)).revision).toBe(1);
  });
});
