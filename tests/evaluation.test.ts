import test from "node:test";
import assert from "node:assert/strict";
import { bootstrapMean95, evaluate, releaseGate, type EvaluationObservation } from "../src/eval/metrics.js";

function row(taskId: string, seed: number, method: EvaluationObservation["method"], score: number): EvaluationObservation {
  return { taskId, seed, method, score, delivered: true, latencyMs: method === "base" ? 100 : 500, cost: method === "base" ? 1 : 3, inputTokens: 10, outputTokens: 2, cachedTokens: 1, toolCalls: 2, toolErrors: 0 };
}

test("paired evaluation reports wins, regressions, efficiency, and deterministic CI", () => {
  const rows = [
    row("a", 1, "base", 50), row("a", 1, "harness2-k1", 60),
    row("b", 1, "base", 40), row("b", 1, "harness2-k1", 45),
    row("c", 1, "base", 70), row("c", 1, "harness2-k1", 72),
  ];
  const report = evaluate(rows, { bootstrapIterations: 1_000, generatedAt: "2026-10-20T00:00:00.000Z" });
  const candidate = report.methods.find((method) => method.method === "harness2-k1");
  assert.equal(candidate?.pairedAgainstBase?.wins, 3);
  assert.equal(candidate?.pairedAgainstBase?.regressionRate, 0);
  assert.equal(candidate?.pairedAgainstBase?.meanDelta, 17 / 3);
  assert.equal(candidate?.pairedAgainstBase?.gainPerCost, 17 / 6);
  assert.deepEqual(bootstrapMean95([2, 5, 10], 1_000), bootstrapMean95([2, 5, 10], 1_000));
  assert.equal(releaseGate(report, "harness2-k1", { maxRegressionRate: 0.01 }).pass, true);
});

test("release gate fails delivery and regression thresholds", () => {
  const rows = [
    row("a", 1, "base", 50), { ...row("a", 1, "harness2-k1", 40), delivered: false },
    row("b", 1, "base", 40), row("b", 1, "harness2-k1", 45),
  ];
  const report = evaluate(rows, { bootstrapIterations: 1_000 });
  const gate = releaseGate(report, "harness2-k1", { maxRegressionRate: 0.01 });
  assert.equal(gate.pass, false);
  assert.equal(gate.checks.deliveryNotLower, false);
  assert.equal(gate.checks.regressionWithinLimit, false);
});

test("evaluation rejects duplicate and internally inconsistent observations", () => {
  const base = row("a", 1, "base", 50);
  assert.throws(() => evaluate([base, base]), /duplicate/);
  assert.throws(() => evaluate([{ ...base, toolCalls: 0, toolErrors: 1 }]), /cannot exceed/);
});
