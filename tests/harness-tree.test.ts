import test from "node:test";
import assert from "node:assert/strict";
import {
  diffTree,
  fingerprintTree,
  normalizeHarnessPath,
  validateHarnessTree,
} from "../src/core/harness-tree.js";

test("fingerprint is stable across key order and slash style", () => {
  const left = { "system.md": "a", "skills/check/SKILL.md": "check" };
  const right = { "skills\\check\\SKILL.md": "check", "system.md": "a" };
  assert.equal(fingerprintTree(left), fingerprintTree(right));
});

test("normalization rejects traversal and absolute paths", () => {
  assert.throws(() => normalizeHarnessPath("../secret"), /traversal/);
  assert.throws(() => normalizeHarnessPath("C:\\secret"), /absolute/);
  assert.throws(() => normalizeHarnessPath("/secret"), /absolute/);
});

test("validator requires skill trigger and referenced scripts", () => {
  const result = validateHarnessTree({
    "system.md": "Complete the task.",
    "skills/reconcile/SKILL.md": "Run scripts/check.py",
  });
  assert.equal(result.ok, false);
  assert.deepEqual(
    new Set(result.issues.map((issue) => issue.code)),
    new Set(["skill-without-trigger", "missing-script"]),
  );
});

test("validator accepts a triggered self-contained skill", () => {
  const result = validateHarnessTree({
    "system.md": "When reconciling, load reconcile.",
    "guardrails.md": "Do not invent facts.",
    "skills/reconcile/SKILL.md": "Run skills/reconcile/scripts/check.py",
    "skills/reconcile/scripts/check.py": "print('ok')",
  });
  assert.deepEqual(result, { ok: true, issues: [] });
});

test("diff reports added, removed, and modified files", () => {
  assert.deepEqual(
    diffTree({ "system.md": "a", "memory.md": "old" }, { "system.md": "b", "guardrails.md": "g" }),
    { added: ["guardrails.md"], removed: ["memory.md"], modified: ["system.md"] },
  );
});
