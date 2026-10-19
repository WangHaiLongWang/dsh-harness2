import { createHash, randomUUID } from "node:crypto";
import { BudgetExceededError, BudgetTracker, emptyUsage } from "./budget.js";
import { diffTree, fingerprintTree, validateHarnessTree } from "./harness-tree.js";
import type {
  CandidateDimension,
  CompositionRequest,
  DshHarnessSubstrate,
  ExperienceEntry,
  ExperienceStore,
  Harness2Policy,
  Harness2Result,
  HarnessEditor,
  HarnessTree,
  HarnessValidationIssue,
  ProposalRequest,
  RunArtifact,
  RunStore,
  StageEvidence,
  TaskContext,
} from "../types.js";

const MAX_EDIT_ATTEMPTS = 2;

export interface Harness2Dependencies {
  substrate: DshHarnessSubstrate;
  editor: HarnessEditor;
  experienceStore: ExperienceStore;
  runStore: RunStore;
  now?: () => Date;
  id?: () => string;
}

function assertPolicy(policy: Harness2Policy): void {
  if (!Number.isInteger(policy.k) || policy.k < 1 || policy.k > 16) {
    throw new Error("k must be an integer in [1, 16]");
  }
  for (const [name, value] of Object.entries({
    timeoutMs: policy.timeoutMs,
    maxParallelProposals: policy.maxParallelProposals,
    maxParallelRollouts: policy.maxParallelRollouts,
    maxTotalTokens: policy.maxTotalTokens,
    maxCost: policy.maxCost,
  })) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be positive`);
  }
  if (policy.scope.domain === "") throw new Error("experience scope domain is required");
}

async function mapLimit<T, R>(
  values: readonly T[],
  limit: number,
  work: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const result = new Array<R>(values.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const index = cursor++;
      if (index >= values.length) return;
      result[index] = await work(values[index] as T, index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return result;
}

function anonymousId(runId: string, taskId: string): string {
  return createHash("sha256").update(taskId).update("\0").update(runId).digest("hex").slice(0, 12);
}

export class Harness2Orchestrator {
  readonly #substrate: DshHarnessSubstrate;
  readonly #editor: HarnessEditor;
  readonly #experienceStore: ExperienceStore;
  readonly #runStore: RunStore;
  readonly #now: () => Date;
  readonly #id: () => string;

  constructor(deps: Harness2Dependencies) {
    this.#substrate = deps.substrate;
    this.#editor = deps.editor;
    this.#experienceStore = deps.experienceStore;
    this.#runStore = deps.runStore;
    this.#now = deps.now ?? (() => new Date());
    this.#id = deps.id ?? randomUUID;
  }

  plan(task: TaskContext, policy: Harness2Policy): {
    taskId: string;
    mode: string;
    k: number;
    expectedRollouts: number;
    expectedEditStages: number;
    selectionRequired: boolean;
  } {
    assertPolicy(policy);
    return {
      taskId: task.taskId,
      mode: policy.mode,
      k: policy.k,
      expectedRollouts: 4 * policy.k,
      expectedEditStages: 3 * policy.k,
      selectionRequired: policy.k > 1,
    };
  }

  async run(task: TaskContext, policy: Harness2Policy, signal?: AbortSignal): Promise<Harness2Result> {
    assertPolicy(policy);
    const runId = `h2-${this.#id()}`;
    const budget = new BudgetTracker(policy.maxTotalTokens, policy.maxCost);
    const errors: string[] = [];
    const fallbacks: string[] = [];
    const stages: StageEvidence[] = [];
    const baseRuns: RunArtifact[] = [];
    let chosenLabel = "";
    let chosenRun: RunArtifact | undefined;
    let adoptedHarness: HarnessTree | undefined;
    let experienceWritten = false;

    try {
      if (signal?.aborted) throw new DOMException("run cancelled", "AbortError");
      const base = await this.#substrate.baseHarness(task);
      const initialValidation = await this.#validate(base, task);
      if (!initialValidation.ok) {
        throw new Error(`base harness is invalid: ${initialValidation.issues.map((i) => i.message).join("; ")}`);
      }
      const library = policy.libraryMode === "off" ? [] : await this.#experienceStore.list(policy.scope);
      const baseLabels = Array.from({ length: policy.k }, (_, index) => `base${index + 1}`);
      const bases = await mapLimit(baseLabels, policy.maxParallelRollouts, async (label) =>
        this.#roll(runId, label, task, base, policy, budget, signal),
      );
      baseRuns.push(...bases);

      let finals: StageEvidence[];
      if (policy.mode === "parallel") {
        finals = await this.#parallel(
          runId, task, policy, base, bases, library, stages, fallbacks, budget, signal,
        );
      } else {
        finals = await this.#sequential(
          runId, task, policy, base, bases, library, stages, fallbacks, budget, signal,
        );
      }

      const delivered = finals.filter((item) => item.run.delivered);
      if (policy.k === 1 && delivered[0]) {
        chosenLabel = delivered[0].label;
      } else if (delivered.length > 0) {
        const candidates = delivered.map((item) => ({
          anonymousId: anonymousId(item.run.runId, task.taskId),
          deliverables: item.run.deliverables,
        }));
        try {
          const selected = await this.#editor.select(task, candidates);
          const selectedIndex = candidates.findIndex((item) => item.anonymousId === selected);
          if (selectedIndex < 0) throw new Error("selector returned an unknown anonymous id");
          chosenLabel = delivered[selectedIndex]?.label ?? "";
        } catch (error) {
          errors.push(`selection: ${String(error)}`);
          fallbacks.push("selection");
          chosenLabel = "";
        }
      }

      let chosen = finals.find((item) => item.label === chosenLabel);
      if (!chosen?.run.delivered) {
        const deliveredBase = baseRuns.find((item) => item.delivered);
        if (deliveredBase) {
          chosenLabel = deliveredBase.stage;
          chosenRun = deliveredBase;
          adoptedHarness = base;
          fallbacks.push("delivered-base");
        } else {
          chosen = finals.find((item) => item.run.delivered);
          if (chosen) chosenLabel = chosen.label;
        }
      }
      if (chosen) {
        chosenRun = chosen.run;
        adoptedHarness = chosen.tree;
      }
      if (!chosenRun) throw new Error("no rollout produced a deliverable");

      if (policy.libraryMode === "read-write" && adoptedHarness) {
        const reflection = await this.#editor.reflect({
          task,
          base,
          adopted: adoptedHarness,
          chosen: chosenRun,
          evidence: stages,
        });
        if (reflection) {
          const entry: ExperienceEntry = {
            id: `${task.taskId}-${fingerprintTree(adoptedHarness).slice(0, 12)}`,
            ...policy.scope,
            taskId: task.taskId,
            createdAt: this.#now().toISOString(),
            harnessFingerprint: fingerprintTree(adoptedHarness),
            harness: adoptedHarness,
            reflection,
          };
          await this.#experienceStore.append(policy.scope, entry);
          experienceWritten = true;
        }
      }
    } catch (error) {
      errors.push(String(error));
    }

    const result: Harness2Result = {
      runId,
      taskId: task.taskId,
      mode: policy.mode,
      k: policy.k,
      status: signal?.aborted ? "cancelled" : chosenRun ? "completed" : "failed",
      chosenLabel,
      ...(chosenRun ? { chosenRun } : {}),
      ...(adoptedHarness ? { adoptedHarness } : {}),
      baseRuns,
      stages,
      fallbacks,
      experienceWritten,
      totalUsage: budget.snapshot(),
      errors,
    };
    await this.#runStore.saveSummary(result);
    return result;
  }

  async #parallel(
    runId: string,
    task: TaskContext,
    policy: Harness2Policy,
    base: HarnessTree,
    bases: readonly RunArtifact[],
    library: readonly ExperienceEntry[],
    stages: StageEvidence[],
    fallbacks: string[],
    budget: BudgetTracker,
    signal?: AbortSignal,
  ): Promise<StageEvidence[]> {
    const specs = Array.from({ length: policy.k }, (_, i) => i + 1).flatMap((round) => [
      { label: `inv${round}`, dimension: "INV" as const, round },
      { label: `dom${round}`, dimension: "DOM" as const, round },
    ]);
    const candidates = await mapLimit(specs, policy.maxParallelProposals, async (spec) => {
      const stage = await this.#proposeAndRoll(
        runId, spec.label, spec.dimension, spec.round, task, base, bases, [], library,
        policy, budget, signal,
      );
      if (stage.fellBack) fallbacks.push(stage.label);
      return stage;
    });
    stages.push(...candidates);

    const finals = await mapLimit(
      Array.from({ length: policy.k }, (_, i) => i + 1),
      policy.maxParallelProposals,
      async (round) => {
        const label = `final${round}`;
        const stage = await this.#composeAndRoll(
          runId, label, round, task, base, bases, candidates, [], library,
          policy, budget, signal,
        );
        if (stage.fellBack) fallbacks.push(stage.label);
        return stage;
      },
    );
    stages.push(...finals);
    return finals;
  }

  async #sequential(
    runId: string,
    task: TaskContext,
    policy: Harness2Policy,
    base: HarnessTree,
    bases: readonly RunArtifact[],
    library: readonly ExperienceEntry[],
    stages: StageEvidence[],
    fallbacks: string[],
    budget: BudgetTracker,
    signal?: AbortSignal,
  ): Promise<StageEvidence[]> {
    let current = base;
    const finals: StageEvidence[] = [];
    for (let round = 1; round <= policy.k; round += 1) {
      const specs: readonly [string, CandidateDimension][] = [
        [`inv${round}`, "INV"],
        [`dom${round}`, "DOM"],
      ];
      const candidates = await mapLimit(specs, Math.min(2, policy.maxParallelProposals), async ([label, dimension]) => {
        const stage = await this.#proposeAndRoll(
          runId, label, dimension, round, task, current, bases, stages, library,
          policy, budget, signal,
        );
        if (stage.fellBack) fallbacks.push(stage.label);
        return stage;
      });
      stages.push(...candidates);
      const final = await this.#composeAndRoll(
        runId, `final${round}`, round, task, current, bases, candidates, stages,
        library, policy, budget, signal,
      );
      if (final.fellBack) fallbacks.push(final.label);
      stages.push(final);
      finals.push(final);
      current = final.tree;
    }
    return finals;
  }

  async #proposeAndRoll(
    runId: string,
    label: string,
    dimension: CandidateDimension,
    round: number,
    task: TaskContext,
    current: HarnessTree,
    references: readonly RunArtifact[],
    history: readonly StageEvidence[],
    library: readonly ExperienceEntry[],
    policy: Harness2Policy,
    budget: BudgetTracker,
    signal?: AbortSignal,
  ): Promise<StageEvidence> {
    let feedback: readonly HarnessValidationIssue[] | undefined;
    for (let attempt = 1; attempt <= MAX_EDIT_ATTEMPTS; attempt += 1) {
      const request: ProposalRequest = {
        label, dimension, round, task, current, references, history, library,
        ...(feedback ? { validationFeedback: feedback } : {}),
      };
      try {
        const tree = await this.#editor.propose(request);
        const validation = await this.#validate(tree, task);
        if (!validation.ok) {
          feedback = validation.issues;
          continue;
        }
        const run = await this.#roll(runId, label, task, tree, policy, budget, signal);
        return this.#evidence(label, dimension, round, current, tree, run, false, validation.issues);
      } catch (error) {
        if (error instanceof BudgetExceededError || signal?.aborted) throw error;
        feedback = [{ code: "editor-error", message: String(error) }];
      }
    }
    const run = await this.#roll(runId, label, task, current, policy, budget, signal);
    return this.#evidence(label, dimension, round, current, current, run, true, feedback ?? []);
  }

  async #composeAndRoll(
    runId: string,
    label: string,
    round: number,
    task: TaskContext,
    current: HarnessTree,
    references: readonly RunArtifact[],
    candidates: readonly StageEvidence[],
    history: readonly StageEvidence[],
    library: readonly ExperienceEntry[],
    policy: Harness2Policy,
    budget: BudgetTracker,
    signal?: AbortSignal,
  ): Promise<StageEvidence> {
    let feedback: readonly HarnessValidationIssue[] | undefined;
    for (let attempt = 1; attempt <= MAX_EDIT_ATTEMPTS; attempt += 1) {
      const request: CompositionRequest = {
        label, round, task, current, references, candidates, history, library,
        ...(feedback ? { validationFeedback: feedback } : {}),
      };
      try {
        const tree = await this.#editor.compose(request);
        const validation = await this.#validate(tree, task);
        if (!validation.ok) {
          feedback = validation.issues;
          continue;
        }
        const run = await this.#roll(runId, label, task, tree, policy, budget, signal);
        return this.#evidence(label, "COMPOSE", round, current, tree, run, false, validation.issues);
      } catch (error) {
        if (error instanceof BudgetExceededError || signal?.aborted) throw error;
        feedback = [{ code: "editor-error", message: String(error) }];
      }
    }
    const run = await this.#roll(runId, label, task, current, policy, budget, signal);
    return this.#evidence(label, "COMPOSE", round, current, current, run, true, feedback ?? []);
  }

  #evidence(
    label: string,
    dimension: CandidateDimension | "COMPOSE",
    round: number,
    current: HarnessTree,
    tree: HarnessTree,
    run: RunArtifact,
    fellBack: boolean,
    validationIssues: readonly HarnessValidationIssue[],
  ): StageEvidence {
    const diff = diffTree(current, tree);
    return {
      label,
      dimension,
      round,
      tree,
      run,
      fellBack,
      keptBase: diff.added.length + diff.removed.length + diff.modified.length === 0,
      validationIssues,
    };
  }

  async #validate(tree: HarnessTree, task: TaskContext) {
    const local = validateHarnessTree(tree);
    if (!local.ok) return local;
    return this.#substrate.validate(tree, task);
  }

  async #roll(
    parentRunId: string,
    stage: string,
    task: TaskContext,
    tree: HarnessTree,
    policy: Harness2Policy,
    budget: BudgetTracker,
    signal?: AbortSignal,
  ): Promise<RunArtifact> {
    if (signal?.aborted) throw new DOMException("run cancelled", "AbortError");
    const installed = await this.#substrate.materialize(tree, task);
    const expectedFingerprint = fingerprintTree(tree);
    if (installed.fingerprint !== expectedFingerprint) {
      throw new Error(`materialized harness fingerprint mismatch at ${stage}`);
    }
    const stageRunId = `${parentRunId}-${stage}`;
    let run: RunArtifact;
    try {
      run = await this.#substrate.execute(
        {
          runId: stageRunId,
          stage,
          task,
          timeoutMs: policy.timeoutMs,
          internal: true,
          ...(signal ? { signal } : {}),
        },
        installed,
      );
    } catch (error) {
      if (signal?.aborted) throw error;
      const now = this.#now().toISOString();
      run = {
        runId: stageRunId,
        taskId: task.taskId,
        stage,
        harnessFingerprint: installed.fingerprint,
        environmentFingerprint: await this.#substrate.environmentFingerprint(),
        startedAt: now,
        endedAt: now,
        status: "failed",
        delivered: false,
        trajectory: `[ERROR] ${String(error)}`,
        deliverables: {},
        usage: emptyUsage(),
        error: String(error),
      };
    }
    if (run.taskId !== task.taskId || run.stage !== stage) {
      throw new Error(`substrate returned mismatched run identity at ${stage}`);
    }
    await this.#runStore.saveRun(run);
    budget.add(run);
    return run;
  }
}

export const DEFAULT_POLICY: Harness2Policy = {
  mode: "parallel",
  k: 1,
  timeoutMs: 3_600_000,
  maxParallelProposals: 2,
  maxParallelRollouts: 2,
  maxTotalTokens: 1_000_000,
  maxCost: 20,
  libraryMode: "off",
  scope: { tenant: "default", project: "default", domain: "general" },
};

export function failedUsage() {
  return emptyUsage();
}
