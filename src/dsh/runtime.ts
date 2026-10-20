import type { Agent } from "@deepseek-ai/dsh-agent";
import type { Context } from "@deepseek-ai/cordis";
import { Harness2Orchestrator } from "../core/orchestrator.js";
import { FileExperienceStore, FileRunStore } from "../storage/file-store.js";
import type { Harness2Policy, Harness2Result, RecursionMode, TaskContext } from "../types.js";
import { DshAgentRunner } from "./agent-runner.js";
import { DshModelEditor } from "./model-editor.js";
import { NativeDshSubstrate } from "./substrate.js";
import type { DshTokenPricing } from "./pricing.js";
import { randomUUID } from "node:crypto";

export interface DshHarness2Config {
  mode: RecursionMode;
  k: number;
  timeoutMs: number;
  maxParallelProposals: number;
  maxParallelRollouts: number;
  maxTotalTokens: number;
  maxCost?: number;
  pricing?: DshTokenPricing;
  enableScripts?: boolean;
  scriptTimeoutMs?: number;
  scriptOutputMaxBytes?: number;
  libraryMode: "off" | "read-only" | "read-write";
  tenant: string;
  project: string;
  dataDir: string;
}

export interface DshHarness2RunOptions {
  task: string;
  domain: string;
  mode?: RecursionMode;
  k?: number;
  signal?: AbortSignal;
}

export interface DshHarness2Plan {
  mode: RecursionMode;
  k: number;
  expectedRollouts: number;
  expectedEditStages: number;
  selectionCalls: number;
  reflectionCalls: number;
  maxTotalTokens: number;
  maxCost: number | null;
  pricingConfigured: boolean;
  scriptsEnabled: boolean;
}

export interface ActiveHarness2Run {
  runId: string;
  taskId: string;
  mode: RecursionMode;
  k: number;
  startedAt: string;
}

/** Host service that runs explicit Harness² jobs without intercepting ordinary parent turns. */
export class DshHarness2Runtime {
  readonly #active = new Map<string, { view: ActiveHarness2Run; controller: AbortController }>();
  constructor(
    private readonly ctx: Context,
    private readonly config: DshHarness2Config,
  ) {}

  plan(options: Pick<DshHarness2RunOptions, "mode" | "k"> = {}): DshHarness2Plan {
    const mode = options.mode ?? this.config.mode;
    const k = options.k ?? this.config.k;
    if (!Number.isInteger(k) || k < 1 || k > 5) throw new Error("Harness² k must be an integer in [1, 5]");
    return {
      mode,
      k,
      expectedRollouts: 4 * k,
      expectedEditStages: 3 * k,
      selectionCalls: k > 1 ? 1 : 0,
      reflectionCalls: this.config.libraryMode === "read-write" ? 1 : 0,
      maxTotalTokens: this.config.maxTotalTokens,
      maxCost: this.config.maxCost ?? null,
      pricingConfigured: this.config.pricing !== undefined,
      scriptsEnabled: this.config.enableScripts ?? false,
    };
  }

  active(): ActiveHarness2Run[] {
    return [...this.#active.values()].map((entry) => ({ ...entry.view }));
  }

  cancel(runId: string): boolean {
    const active = this.#active.get(runId);
    if (!active) return false;
    active.controller.abort(new Error("Harness² run cancelled by operator"));
    return true;
  }

  async run(parent: Agent, options: DshHarness2RunOptions): Promise<Harness2Result> {
    const controller = new AbortController();
    const signal = options.signal
      ? AbortSignal.any([options.signal, controller.signal])
      : controller.signal;
    const task: TaskContext = {
      taskId: `session-${parent.id}-${randomUUID()}`,
      domain: options.domain,
      prompt: options.task,
      metadata: { parentSessionId: parent.id },
    };
    const scope = {
      tenant: this.config.tenant,
      project: this.config.project,
      domain: options.domain,
    };
    const policy: Harness2Policy = {
      mode: options.mode ?? this.config.mode,
      k: options.k ?? this.config.k,
      timeoutMs: this.config.timeoutMs,
      maxParallelProposals: this.config.maxParallelProposals,
      maxParallelRollouts: this.config.maxParallelRollouts,
      maxTotalTokens: this.config.maxTotalTokens,
      maxCost: this.config.maxCost ?? Number.POSITIVE_INFINITY,
      libraryMode: this.config.libraryMode,
      scope,
    };
    const orchestrator = new Harness2Orchestrator({
      substrate: new NativeDshSubstrate(parent, new DshAgentRunner(
        this.ctx,
        this.config.pricing,
        {
          enabled: this.config.enableScripts ?? false,
          assetRoot: `${this.config.dataDir}/assets`,
          timeoutMs: this.config.scriptTimeoutMs ?? 30_000,
          outputMaxBytes: this.config.scriptOutputMaxBytes ?? 1_000_000,
        },
      )),
      editor: new DshModelEditor(
        this.ctx,
        parent,
        signal,
        this.config.timeoutMs,
        this.config.pricing,
        this.config.enableScripts ?? false,
      ),
      experienceStore: new FileExperienceStore(`${this.config.dataDir}/library`),
      runStore: new FileRunStore(`${this.config.dataDir}/runs`),
      onEvent: event => {
        if (event.type === "run-planned") {
          this.#active.set(event.runId, {
            view: { runId: event.runId, taskId: event.taskId, mode: event.mode, k: event.k, startedAt: new Date().toISOString() },
            controller,
          });
        } else if (event.type === "run-finished") {
          this.#active.delete(event.runId);
        }
        this.ctx.emit("harness2/event", event);
      },
    });
    try {
      return await orchestrator.run(task, policy, signal);
    } finally {
      for (const [runId, entry] of this.#active) {
        if (entry.controller === controller) this.#active.delete(runId);
      }
    }
  }
}
