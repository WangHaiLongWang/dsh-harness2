import type { Agent } from "@deepseek-ai/dsh-agent";
import type {
  DshHarnessSubstrate,
  HarnessTree,
  HarnessValidationResult,
  InstalledHarness,
  RolloutRequest,
  RunArtifact,
  TaskContext,
} from "../types.js";
import { fingerprintTree } from "../core/harness-tree.js";
import { DshAgentRunner } from "./agent-runner.js";

/** Binds generic Harness² orchestration to one live parent DSH Agent. */
export class NativeDshSubstrate implements DshHarnessSubstrate {
  readonly name = "dsh-0.2.1-alpha.4";

  constructor(
    private readonly parent: Agent,
    private readonly runner: DshAgentRunner,
  ) {}

  async baseHarness(_task: TaskContext): Promise<HarnessTree> {
    return {
      "system.md": "",
      "guardrails.md": "",
      "memory.md": "",
      "tool-guidance.md": "",
    };
  }

  async materialize(tree: HarnessTree, _task: TaskContext): Promise<InstalledHarness> {
    return { fingerprint: fingerprintTree(tree), opaque: tree };
  }

  execute(request: RolloutRequest, harness: InstalledHarness): Promise<RunArtifact> {
    return this.runner.run({
      parent: this.parent,
      task: request.task,
      tree: harness.opaque as HarnessTree,
      runId: request.runId,
      stage: request.stage,
      timeoutMs: request.timeoutMs,
      ...(request.signal ? { signal: request.signal } : {}),
    });
  }

  async validate(tree: HarnessTree, _task: TaskContext): Promise<HarnessValidationResult> {
    const issues = this.runner.validate(tree);
    return { ok: issues.length === 0, issues };
  }

  async environmentFingerprint(): Promise<string> {
    return this.name;
  }
}
