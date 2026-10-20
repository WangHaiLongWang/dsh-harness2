import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { diffLines } from "../src/client/diff.js";
import { Harness2RunReader } from "../src/panel/read-store.js";

test("panel reader projects bounded Harness trees without trajectories", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "harness2-panel-"));
  try {
    const runId = "h2-panel-test";
    await mkdir(path.join(root, runId));
    await writeFile(path.join(root, runId, "summary.json"), JSON.stringify({
      runId, taskId: "task", mode: "parallel", k: 1, status: "completed", chosenLabel: "final1",
      baseHarness: { "system.md": "base" }, adoptedHarness: { "system.md": "candidate" },
      baseRuns: [{ startedAt: "2026-01-01T00:00:00Z", endedAt: "2026-01-01T00:00:01Z", trajectory: "private" }],
      stages: [], totalUsage: {}, fallbacks: [], errors: [],
    }));
    const detail = await new Harness2RunReader(root).detail(runId);
    assert.deepEqual(detail?.baseTree, { "system.md": "base" });
    assert.doesNotMatch(JSON.stringify(detail), /private/);
    await assert.rejects(() => new Harness2RunReader(root).detail("../escape"), /Invalid Harness/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Web Harness Diff reports additions, removals, and context", () => {
  assert.deepEqual(diffLines("role\nold\nend", "role\nnew\nend"), [
    { kind: "same", text: "role", oldLine: 1, newLine: 1 },
    { kind: "add", text: "new", newLine: 2 },
    { kind: "remove", text: "old", oldLine: 2 },
    { kind: "same", text: "end", oldLine: 3, newLine: 3 },
  ]);
});
