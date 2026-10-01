import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { newerCatalog, retainSelection, retainDuplicateSelection } from "./catalog-state";
import type { CatalogReport, FileEntry } from "./types";
const file = (id: string, blocked: string | null = null): FileEntry => ({ id, path: "/fixture/" + id, name: id, bytes: 64e6, logicalBytes: 64e6, modified: 1, accessed: null, kind: "bin", blocked });
const report = (revision: number, ids: string[], id = "100"): CatalogReport => ({ id, revision, root: "/fixture", createdAt: 1, bytes: ids.length * 64e6, files: ids.map((id) => file(id)), projects: [], warnings: [], visited: ids.length, incomplete: false });
describe("durable catalog synchronization", () => {
  it("a delayed query cannot reintroduce a file removed by the native cleanup event", async () => {
    const client = new QueryClient();
    client.setQueryData(["catalog"], report(1, ["a", "b"]));
    let resolve!: (r: CatalogReport) => void;
    const request = new Promise<CatalogReport>((r) => { resolve = r; });
    const query = (async () => {
      const incoming = await request;
      const current = client.getQueryData<CatalogReport>(["catalog"]);
      client.setQueryData(["catalog"], newerCatalog(current, incoming));
    })();
    client.setQueryData(["catalog"], report(2, ["b"]));
    resolve(report(1, ["a", "b"]));
    await query;
    expect(client.getQueryData<CatalogReport>(["catalog"])?.files.map((f) => f.id)).toEqual(["b"]);
    client.clear();
  });
  it("preserves unchanged selections and removes deleted, changed or newly protected identities", () => {
    const selected = new Set(["a", "b", "c"]);
    const next = retainSelection(selected, [file("b"), file("a-new"), file("c", "proteção")]);
    expect([...next]).toEqual(["b"]);
    expect(retainSelection(next, [file("b"), file("d")])).toBe(next);
  });
  it("keeps an intact duplicate copy when the index loses another group member", () => {
    const groups = [{ hash: "hash", logicalBytes: 64e6, recoverableBytes: 64e6, files: [file("a"), file("b")] }];
    expect(retainDuplicateSelection(new Set(["a", "b", "gone"]), groups).size).toBe(1);
    expect(retainDuplicateSelection(new Set(["gone"]), groups).size).toBe(0);
  });
  it("an old root response cannot replace a newer manually selected catalog", () => {
    expect(newerCatalog(report(1, ["new"], "200"), report(9, ["old"], "100"))?.id).toBe("200");
    expect(newerCatalog(report(3, ["b"]), null)?.revision).toBe(3);
  });
});
