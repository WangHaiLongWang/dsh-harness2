import type { RunArtifact, RunUsage } from "../types.js";

export class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetExceededError";
  }
}

export class BudgetTracker {
  readonly #maxTokens: number;
  readonly #maxCost: number;
  #usage: RunUsage = emptyUsage();

  constructor(maxTokens: number, maxCost: number) {
    this.#maxTokens = maxTokens;
    this.#maxCost = maxCost;
  }

  add(run: RunArtifact): void {
    const usage = run.usage;
    this.#usage = addUsage(this.#usage, usage);
    const tokens = this.#usage.inputTokens + this.#usage.outputTokens;
    if (tokens > this.#maxTokens) {
      throw new BudgetExceededError(`token budget exceeded: ${tokens}/${this.#maxTokens}`);
    }
    if (this.#usage.cost > this.#maxCost) {
      throw new BudgetExceededError(`cost budget exceeded: ${this.#usage.cost}/${this.#maxCost}`);
    }
  }

  snapshot(): RunUsage {
    return { ...this.#usage };
  }
}

export function emptyUsage(): RunUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    cost: 0,
    toolCalls: 0,
    toolErrors: 0,
  };
}

export function addUsage(a: RunUsage, b: RunUsage): RunUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cachedTokens: a.cachedTokens + b.cachedTokens,
    cost: a.cost + b.cost,
    toolCalls: a.toolCalls + b.toolCalls,
    toolErrors: a.toolErrors + b.toolErrors,
  };
}
