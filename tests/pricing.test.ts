import test from "node:test";
import assert from "node:assert/strict";
import { priceUsage, runUsageOf } from "../src/dsh/pricing.js";

const usage = {
  inputTokens: 1_000_000,
  outputTokens: 500_000,
  cacheReadTokens: 250_000,
  cacheWriteTokens: 125_000,
};

test("unconfigured pricing reports zero instead of inventing a provider price", () => {
  assert.equal(priceUsage(usage), 0);
});

test("explicit per-million rates price every disjoint token counter", () => {
  const pricing = {
    inputPerMillion: 2,
    outputPerMillion: 8,
    cacheReadPerMillion: 0.5,
    cacheWritePerMillion: 1,
  };
  assert.equal(priceUsage(usage, pricing), 6.25);
  assert.deepEqual(runUsageOf(usage, pricing), {
    inputTokens: 1_000_000,
    outputTokens: 500_000,
    cachedTokens: 375_000,
    cost: 6.25,
    toolCalls: 0,
    toolErrors: 0,
  });
});
