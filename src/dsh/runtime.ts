import type { Agent } from "@deepseek-ai/dsh-agent";
import type { Context } from "@deepseek-ai/cordis";
import { Harness2Orchestrator } from "../core/orchestrator.js";
import { FileExperienceStore, FileRunStore } from "../storage/file-store.js";
import type { Harness2Policy, Harness2Result, RecursionMode, TaskContext } from "../types.js";
import { DshAgentRunner } from "./agent-runner.js";
import { DshModelEditor } from "./model-editor.js";
import { NativeDshSubstrate } from "./substrate.js";
import type { DshTokenPricing } from "./pricing.js";

export interface DshHarness2Config {
  mode: RecursionMode;
  k: number;
  timeoutMs: number;
  maxParallelProposals: number;
  maxParallelRollouts: number;
  maxTotalTokens: number;
  maxCost?: number;
  pricing?: DshTokenPricing;
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

/** Host service that runs explicit Harness² jobs without intercepting ordinary parent turns. */
export class DshHarness2Runtime {
  constructor(
    private readonly ctx: Context,
    private readonly config: DshHarness2Config,
  ) {}

  async run(parent: Agent, options: DshHarness2RunOptions): Promise<Harness2Result> {
    const task: TaskContext = {
      taskId: `session-${parent.id}-${Date.now()}`,
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
      substrate: new NativeDshSubstrate(parent, new DshAgentRunner(this.ctx, this.config.pricing)),
      editor: new DshModelEditor(
        this.ctx,
        parent,
        options.signal,
        this.config.timeoutMs,
        this.config.pricing,
      ),
      experienceStore: new FileExperienceStore(`${this.config.dataDir}/library`),
      runStore: new FileRunStore(`${this.config.dataDir}/runs`),
    });
    return orchestrator.run(task, policy, options.signal);
  }
}
