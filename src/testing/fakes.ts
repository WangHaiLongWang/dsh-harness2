import type {
  CompositionRequest,
  DshHarnessSubstrate,
  HarnessEditor,
  HarnessTree,
  HarnessValidationResult,
  InstalledHarness,
  ProposalRequest,
  Reflection,
  ReflectionRequest,
  RolloutRequest,
  RunArtifact,
  SelectionCandidate,
  TaskContext,
} from "../types.js";
import { fingerprintTree } from "../core/harness-tree.js";

export class DeterministicEditor implements HarnessEditor {
  proposalCalls: ProposalRequest[] = [];
  compositionCalls: CompositionRequest[] = [];

  async propose(request: ProposalRequest): Promise<HarnessTree> {
    this.proposalCalls.push(request);
    if (request.dimension === "INV") {
      return {
        ...request.current,
        "guardrails.md": `${request.current["guardrails.md"] ?? ""}\nVerify the produced artifact before delivery.`,
      };
    }
    return {
      ...request.current,
      "system.md": `${request.current["system.md"] ?? ""}\nApply the task's explicit domain constraints.`,
    };
  }

  async compose(request: CompositionRequest): Promise<HarnessTree> {
    this.compositionCalls.push(request);
    const merged: Record<string, string> = { ...request.current };
    // Merge candidate diffs, not complete snapshots. A complete-tree assignment
    // would let a later candidate restore an earlier candidate's changed file.
    for (const candidate of request.candidates) {
      for (const [file, body] of Object.entries(candidate.tree)) {
        if (request.current[file] !== body) merged[file] = body;
      }
      for (const file of Object.keys(request.current)) {
        if (!Object.hasOwn(candidate.tree, file)) delete merged[file];
      }
    }
    return merged;
  }

  async select(_task: TaskContext, candidates: readonly SelectionCandidate[]): Promise<string> {
    const best = [...candidates].sort((a, b) => {
      const aSize = Object.values(a.deliverables).join("").length;
      const bSize = Object.values(b.deliverables).join("").length;
      return bSize - aSize;
    })[0];
    if (!best) throw new Error("no candidates");
    return best.anonymousId;
  }

  async reflect(request: ReflectionRequest): Promise<Reflection | null> {
    if (fingerprintTree(request.base) === fingerprintTree(request.adopted)) return null;
    return {
      cue: "A task requires an explicit artifact and the baseline does not verify it",
      lesson: "Add an artifact verification guardrail before delivery",
      evidence: `adopted ${request.chosen.stage} after matched candidate probes`,
      confidence: "medium",
    };
  }
}

export class FakeDshSubstrate implements DshHarnessSubstrate {
  readonly name = "fake-dsh";
  readonly executions: RolloutRequest[] = [];
  failStages = new Set<string>();
  throwStages = new Set<string>();
  emptyStages = new Set<string>();
  perRunTokens = 20;
  perRunCost = 0.01;

  async baseHarness(_task: TaskContext): Promise<HarnessTree> {
    return {
      "system.md": "Complete the requested task.",
      "guardrails.md": "Do not fabricate source facts.",
      "memory.md": "",
      "tool-guidance.md": "Use available tools when needed.",
    };
  }

  async materialize(tree: HarnessTree, _task: TaskContext): Promise<InstalledHarness> {
    return { fingerprint: fingerprintTree(tree), opaque: tree };
  }

  async execute(request: RolloutRequest, harness: InstalledHarness): Promise<RunArtifact> {
    this.executions.push(request);
    if (request.signal?.aborted) throw new DOMException("cancelled", "AbortError");
    if (this.throwStages.has(request.stage)) throw new Error("injected substrate exception");
    const now = new Date(0).toISOString();
    const failed = this.failStages.has(request.stage);
    const delivered = !failed && !this.emptyStages.has(request.stage);
    const tree = harness.opaque as HarnessTree;
    const quality = Object.values(tree).join("\n").length;
    return {
      runId: request.runId,
      taskId: request.task.taskId,
      stage: request.stage,
      harnessFingerprint: harness.fingerprint,
      environmentFingerprint: "fake-env-v1",
      startedAt: now,
      endedAt: now,
      status: failed ? "failed" : "completed",
      delivered,
      trajectory: `[ACTION] ${request.stage}\n[OBSERVATION] quality=${quality}`,
      deliverables: delivered ? { "result.txt": `stage=${request.stage};quality=${quality}` } : {},
      usage: {
        inputTokens: this.perRunTokens,
        outputTokens: this.perRunTokens,
        cachedTokens: 0,
        cost: this.perRunCost,
        toolCalls: 1,
        toolErrors: failed ? 1 : 0,
      },
      ...(failed ? { error: "injected failure" } : {}),
    };
  }

  async validate(_tree: HarnessTree, _task: TaskContext): Promise<HarnessValidationResult> {
    return { ok: true, issues: [] };
  }

  async environmentFingerprint(): Promise<string> {
    return "fake-env-v1";
  }
}
