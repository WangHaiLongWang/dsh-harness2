export type EvaluationMethod = "base" | "best-of-k" | "harness2-k1" | "harness2-parallel" | "harness2-sequential";

export interface EvaluationObservation {
  taskId: string;
  seed: number;
  method: EvaluationMethod;
  score: number;
  delivered: boolean;
  latencyMs: number;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  toolCalls: number;
  toolErrors: number;
}

export interface ConfidenceInterval {
  low: number;
  high: number;
}

export interface MethodEvaluation {
  method: EvaluationMethod;
  samples: number;
  meanScore: number;
  deliveryRate: number;
  meanLatencyMs: number;
  meanCost: number;
  meanTokens: number;
  toolErrorRate: number;
  pairedAgainstBase?: {
    pairs: number;
    meanDelta: number;
    delta95: ConfidenceInterval;
    wins: number;
    ties: number;
    losses: number;
    regressionRate: number;
    gainPerCost: number | null;
  };
}

export interface EvaluationReport {
  generatedAt: string;
  regressionTolerance: number;
  methods: MethodEvaluation[];
}

export interface ReleaseGate {
  pass: boolean;
  checks: {
    positiveLowerBound: boolean;
    winsExceedLosses: boolean;
    deliveryNotLower: boolean;
    toolErrorsNotHigher: boolean;
    regressionWithinLimit: boolean;
  };
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function quantile(sorted: readonly number[], probability: number): number {
  if (sorted.length === 0) return 0;
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const fraction = position - lower;
  return (sorted[lower] as number) * (1 - fraction) + (sorted[upper] as number) * fraction;
}

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

export function bootstrapMean95(
  values: readonly number[],
  iterations = 10_000,
  seed = 0x4841524e,
): ConfidenceInterval {
  if (values.length === 0) return { low: 0, high: 0 };
  if (!Number.isInteger(iterations) || iterations < 100) throw new Error("bootstrap iterations must be an integer >= 100");
  const next = random(seed);
  const samples = new Array<number>(iterations);
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let total = 0;
    for (let index = 0; index < values.length; index += 1) {
      total += values[Math.floor(next() * values.length)] as number;
    }
    samples[iteration] = total / values.length;
  }
  samples.sort((a, b) => a - b);
  return { low: quantile(samples, 0.025), high: quantile(samples, 0.975) };
}

function key(row: EvaluationObservation): string {
  return `${row.taskId}\0${row.seed}`;
}

function validate(rows: readonly EvaluationObservation[]): void {
  const seen = new Set<string>();
  for (const row of rows) {
    const identity = `${key(row)}\0${row.method}`;
    if (seen.has(identity)) throw new Error(`duplicate evaluation observation: ${row.taskId}/${row.seed}/${row.method}`);
    seen.add(identity);
    for (const field of ["score", "latencyMs", "cost", "inputTokens", "outputTokens", "cachedTokens", "toolCalls", "toolErrors"] as const) {
      if (!Number.isFinite(row[field]) || row[field] < 0) throw new Error(`${field} must be a finite non-negative number`);
    }
    if (row.toolErrors > row.toolCalls) throw new Error("toolErrors cannot exceed toolCalls");
  }
}

export function evaluate(
  rows: readonly EvaluationObservation[],
  options: { regressionTolerance?: number; bootstrapIterations?: number; generatedAt?: string } = {},
): EvaluationReport {
  validate(rows);
  const regressionTolerance = options.regressionTolerance ?? 0;
  const base = new Map(rows.filter((row) => row.method === "base").map((row) => [key(row), row]));
  const methods = [...new Set(rows.map((row) => row.method))].sort();
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    regressionTolerance,
    methods: methods.map((method): MethodEvaluation => {
      const selected = rows.filter((row) => row.method === method);
      const toolCalls = selected.reduce((sum, row) => sum + row.toolCalls, 0);
      const result: MethodEvaluation = {
        method,
        samples: selected.length,
        meanScore: mean(selected.map((row) => row.score)),
        deliveryRate: mean(selected.map((row) => Number(row.delivered))),
        meanLatencyMs: mean(selected.map((row) => row.latencyMs)),
        meanCost: mean(selected.map((row) => row.cost)),
        meanTokens: mean(selected.map((row) => row.inputTokens + row.outputTokens + row.cachedTokens)),
        toolErrorRate: toolCalls === 0 ? 0 : selected.reduce((sum, row) => sum + row.toolErrors, 0) / toolCalls,
      };
      if (method === "base") return result;
      const pairs = selected.flatMap((row) => {
        const reference = base.get(key(row));
        return reference ? [{ row, reference, delta: row.score - reference.score }] : [];
      });
      const deltas = pairs.map((pair) => pair.delta);
      const extraCost = mean(pairs.map((pair) => pair.row.cost - pair.reference.cost));
      result.pairedAgainstBase = {
        pairs: pairs.length,
        meanDelta: mean(deltas),
        delta95: bootstrapMean95(deltas, options.bootstrapIterations ?? 10_000),
        wins: deltas.filter((delta) => delta > 0).length,
        ties: deltas.filter((delta) => delta === 0).length,
        losses: deltas.filter((delta) => delta < 0).length,
        regressionRate: mean(deltas.map((delta) => Number(delta < -regressionTolerance))),
        gainPerCost: extraCost > 0 ? mean(deltas) / extraCost : null,
      };
      return result;
    }),
  };
}

export function releaseGate(
  report: EvaluationReport,
  method: EvaluationMethod,
  options: { maxRegressionRate: number },
): ReleaseGate {
  const base = report.methods.find((item) => item.method === "base");
  const candidate = report.methods.find((item) => item.method === method);
  if (!base || !candidate?.pairedAgainstBase) throw new Error(`missing base or paired method ${method}`);
  const paired = candidate.pairedAgainstBase;
  const checks = {
    positiveLowerBound: paired.delta95.low > 0,
    winsExceedLosses: paired.wins > paired.losses,
    deliveryNotLower: candidate.deliveryRate >= base.deliveryRate,
    toolErrorsNotHigher: candidate.toolErrorRate <= base.toolErrorRate,
    regressionWithinLimit: paired.regressionRate <= options.maxRegressionRate,
  };
  return { pass: Object.values(checks).every(Boolean), checks };
}
