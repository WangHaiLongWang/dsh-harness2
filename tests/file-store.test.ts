import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { FileExperienceStore } from "../src/storage/file-store.js";
import type { ExperienceEntry, ExperienceScope } from "../src/types.js";

const scope: ExperienceScope = { tenant: "t", project: "p", domain: "d" };

function entry(id: string): ExperienceEntry {
  return {
    id, ...scope, taskId: id, createdAt: "2026-10-20T00:00:00.000Z",
    harnessFingerprint: id, harness: { "system.md": id },
    reflection: { cue: id, lesson: id, evidence: id, confidence: "medium" },
  };
}

test("file experience store serializes concurrent appends without lost entries", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "harness2-store-"));
  try {
    const store = new FileExperienceStore(root);
    await Promise.all(Array.from({ length: 20 }, (_, index) => store.append(scope, entry(`e${index}`))));
    await Promise.all([store.append(scope, entry("e1")), store.append(scope, entry("e1"))]);
    const entries = await store.list(scope);
    assert.equal(entries.length, 20);
    assert.equal(new Set(entries.map((item) => item.id)).size, 20);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
