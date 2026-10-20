import type { RunUsage } from "../types.js";

/** Explicit provider billing rates in one deployment currency per million tokens. */
export interface DshTokenPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion: number;
  cacheWritePerMillion: number;
}

export interface DshProviderUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

/** Convert one provider usage sample to the configured deployment currency. */
export function priceUsage(usage: DshProviderUsage, pricing?: DshTokenPricing): number {
  if (!pricing) return 0;
  return (
    usage.inputTokens * pricing.inputPerMillion
    + usage.outputTokens * pricing.outputPerMillion
    + (usage.cacheReadTokens ?? 0) * pricing.cacheReadPerMillion
    + (usage.cacheWriteTokens ?? 0) * pricing.cacheWritePerMillion
  ) / 1_000_000;
}

/** Project DSH's disjoint cache counters into the shared orchestration usage record. */
export function runUsageOf(
  usage: DshProviderUsage,
  pricing?: DshTokenPricing,
): RunUsage {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cachedTokens: (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0),
    cost: priceUsage(usage, pricing),
    toolCalls: 0,
    toolErrors: 0,
  };
}
