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

/**
 * The stable boundary expected from DSH. Bind these callbacks to the real SDK
 * after its event payloads and session API are available.
 */
export interface DshBridgeBindings {
  exportBaseHarness(task: TaskContext): Promise<HarnessTree>;
  stageHarness(tree: HarnessTree, task: TaskContext): Promise<Omit<InstalledHarness, "fingerprint">>;
  runInternalSession(request: RolloutRequest, harness: InstalledHarness): Promise<RunArtifact>;
  validateHarness?(tree: HarnessTree, task: TaskContext): Promise<HarnessValidationResult>;
  getEnvironmentFingerprint(): Promise<string>;
}

export class DshBridgeAdapter implements DshHarnessSubstrate {
  readonly name = "dsh";

  constructor(private readonly bindings: DshBridgeBindings) {}

  baseHarness(task: TaskContext): Promise<HarnessTree> {
    return this.bindings.exportBaseHarness(task);
  }

  async materialize(tree: HarnessTree, task: TaskContext): Promise<InstalledHarness> {
    const staged = await this.bindings.stageHarness(tree, task);
    return { ...staged, fingerprint: fingerprintTree(tree) };
  }

  execute(request: RolloutRequest, harness: InstalledHarness): Promise<RunArtifact> {
    if (!request.internal) throw new Error("Harness² rollouts must be marked internal");
    return this.bindings.runInternalSession(request, harness);
  }

  async validate(tree: HarnessTree, task: TaskContext): Promise<HarnessValidationResult> {
    return this.bindings.validateHarness?.(tree, task) ?? { ok: true, issues: [] };
  }

  environmentFingerprint(): Promise<string> {
    return this.bindings.getEnvironmentFingerprint();
  }
}
