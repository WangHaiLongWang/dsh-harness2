import test from "node:test";
import assert from "node:assert/strict";
import { Harness2Orchestrator, DEFAULT_POLICY } from "../src/core/orchestrator.js";
import { MemoryExperienceStore, MemoryRunStore } from "../src/storage/memory-store.js";
import { DeterministicEditor, FakeDshSubstrate } from "../src/testing/fakes.js";
import type {
  CompositionRequest,
  HarnessEditor,
  HarnessTree,
  ProposalRequest,
  ReflectionRequest,
  SelectionCandidate,
  TaskContext,
} from "../src/types.js";

const task: TaskContext = {
  taskId: "task-1",
  domain: "office",
  prompt: "Produce result.txt",
};

function setup(editor: HarnessEditor = new DeterministicEditor()) {
  const substrate = new FakeDshSubstrate();
  const experienceStore = new MemoryExperienceStore();
  const runStore = new MemoryRunStore();
  const orchestrator = new Harness2Orchestrator({
    substrate,
    editor,
    experienceStore,
    runStore,
    id: () => "test",
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  });
  return { substrate, experienceStore, runStore, orchestrator };
}

test("plan exposes Harness² 4k rollout and 3k edit-stage budget", () => {
  const { orchestrator } = setup();
  assert.deepEqual(orchestrator.plan(task, { ...DEFAULT_POLICY, k: 3 }), {
    taskId: "task-1",
    mode: "parallel",
    k: 3,
    expectedRollouts: 12,
    expectedEditStages: 9,
    selectionRequired: true,
  });
});

test("parallel k=2 executes 4k rollouts, 3k stages, selection, and reflection", async () => {
  const editor = new DeterministicEditor();
  const { orchestrator, substrate, experienceStore, runStore } = setup(editor);
  const policy = {
    ...DEFAULT_POLICY,
    k: 2,
    libraryMode: "read-write" as const,
    scope: { tenant: "t", project: "p", domain: "office" },
  };
  const result = await orchestrator.run(task, policy);
  assert.equal(result.status, "completed");
  assert.equal(substrate.executions.length, 8);
  assert.equal(result.stages.length, 6);
  assert.equal(editor.proposalCalls.length, 4);
  assert.equal(editor.compositionCalls.length, 2);
  assert.equal(runStore.runs.length, 8);
  assert.equal(runStore.summaries.length, 1);
  assert.equal(result.experienceWritten, true);
  assert.equal((await experienceStore.list(policy.scope)).length, 1);
});

test("sequential recursion passes prior stages into later rounds", async () => {
  const editor = new DeterministicEditor();
  const { orchestrator, substrate } = setup(editor);
  const result = await orchestrator.run(task, { ...DEFAULT_POLICY, mode: "sequential", k: 2 });
  assert.equal(result.status, "completed");
  assert.equal(substrate.executions.length, 8);
  assert.equal(result.stages.length, 6);
  const secondInv = editor.proposalCalls.find((call) => call.label === "inv2");
  assert.ok(secondInv);
  assert.ok(secondInv.history.some((stage) => stage.label === "final1"));
  assert.match(secondInv.current["guardrails.md"] ?? "", /Verify the produced artifact/);
});

test("invalid edits retry once then inherit current harness", async () => {
  class InvalidEditor extends DeterministicEditor {
    override async propose(request: ProposalRequest): Promise<HarnessTree> {
      this.proposalCalls.push(request);
      return { ...request.current, "../escape": "bad" };
    }
  }
  const editor = new InvalidEditor();
  const { orchestrator } = setup(editor);
  const result = await orchestrator.run(task, DEFAULT_POLICY);
  assert.equal(result.status, "completed");
  assert.deepEqual([...result.fallbacks].sort(), ["dom1", "inv1"]);
  assert.equal(editor.proposalCalls.length, 4);
  const retries = editor.proposalCalls.filter((call) => call.validationFeedback?.length);
  assert.equal(retries.length, 2);
  assert.ok(result.stages.filter((stage) => stage.fellBack).every((stage) => stage.keptBase));
});

test("selector failure falls back to a delivered base", async () => {
  class BrokenSelector extends DeterministicEditor {
    override async select(_task: TaskContext, _candidates: readonly SelectionCandidate[]): Promise<string> {
      return "unknown";
    }
  }
  const { orchestrator } = setup(new BrokenSelector());
  const result = await orchestrator.run(task, { ...DEFAULT_POLICY, k: 2 });
  assert.equal(result.status, "completed");
  assert.equal(result.chosenLabel, "base1");
  assert.ok(result.fallbacks.includes("selection"));
  assert.ok(result.fallbacks.includes("delivered-base"));
});

test("substrate exceptions become auditable failed runs", async () => {
  const { orchestrator, substrate, runStore } = setup();
  substrate.throwStages.add("inv1");
  const result = await orchestrator.run(task, DEFAULT_POLICY);
  assert.equal(result.status, "completed");
  const failed = result.stages.find((stage) => stage.label === "inv1")?.run;
  assert.equal(failed?.status, "failed");
  assert.match(failed?.trajectory ?? "", /injected substrate exception/);
  assert.equal(runStore.runs.length, 4);
});

test("hard token budget stops opening new stages and returns failed status", async () => {
  const { orchestrator, substrate } = setup();
  const result = await orchestrator.run(task, { ...DEFAULT_POLICY, maxTotalTokens: 30 });
  assert.equal(result.status, "failed");
  assert.equal(substrate.executions.length, 1);
  assert.match(result.errors.join("\n"), /token budget exceeded/);
});

test("aborted run does not launch a rollout", async () => {
  const { orchestrator, substrate } = setup();
  const controller = new AbortController();
  controller.abort();
  const result = await orchestrator.run(task, DEFAULT_POLICY, controller.signal);
  assert.equal(result.status, "cancelled");
  assert.equal(substrate.executions.length, 0);
});

test("read-only library is visible but never appended", async () => {
  class LibraryAwareEditor implements HarnessEditor {
    seen = -1;
    async propose(request: ProposalRequest) {
      this.seen = request.library.length;
      return request.current;
    }
    async compose(request: CompositionRequest) { return request.current; }
    async select(_task: TaskContext, candidates: readonly SelectionCandidate[]) {
      return candidates[0]?.anonymousId ?? "";
    }
    async reflect(_request: ReflectionRequest) { return null; }
  }
  const editor = new LibraryAwareEditor();
  const { orchestrator, experienceStore } = setup(editor);
  const scope = { tenant: "t", project: "p", domain: "office" };
  await experienceStore.append(scope, {
    id: "seed", ...scope, taskId: "old", createdAt: "2026-01-01T00:00:00.000Z",
    harnessFingerprint: "x", harness: { "system.md": "x" },
    reflection: { cue: "c", lesson: "l", evidence: "e", confidence: "low" },
  });
  const result = await orchestrator.run(task, {
    ...DEFAULT_POLICY, libraryMode: "read-only", scope,
  });
  assert.equal(result.status, "completed");
  assert.equal(editor.seen, 1);
  assert.equal((await experienceStore.list(scope)).length, 1);
});
