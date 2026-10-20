/** Native DSH 0.2.1-alpha.4 plugin entry for explicit Harness² jobs. */
import type { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import type {} from "@deepseek-ai/dsh-agent-preset-registry";
import { DshHarness2Runtime, type DshHarness2Config } from "./runtime.js";

declare module "@deepseek-ai/cordis" {
  interface Context {
    harness2: DshHarness2Runtime;
  }
}

/** Cordis Loader diagnostic name. */
export const name = "harness2";

/** Services used by rollout creation, editor calls, scoped prompts, and the model-facing entry tool. */
export const inject = ["agents", "llm", "systemPrompt", "tools"];

/** Deployment policy for explicit Harness² runs. */
export const Config: z<DshHarness2Config> = z.object({
  mode: z.union(["parallel", "sequential"] as const).default("parallel"),
  k: z.number().min(1).max(5).step(1).default(1),
  timeoutMs: z.number().min(1).default(3_600_000),
  maxParallelProposals: z.number().min(1).step(1).default(2),
  maxParallelRollouts: z.number().min(1).step(1).default(2),
  maxTotalTokens: z.number().min(1).step(1).default(1_000_000),
  maxCost: z.number().min(0.000001),
  pricing: z.object({
    inputPerMillion: z.number().min(0).required(),
    outputPerMillion: z.number().min(0).required(),
    cacheReadPerMillion: z.number().min(0).required(),
    cacheWritePerMillion: z.number().min(0).required(),
  }).default(undefined as never),
  enableScripts: z.boolean().default(false),
  scriptTimeoutMs: z.number().min(1).default(30_000),
  scriptOutputMaxBytes: z.number().min(1).step(1).default(1_000_000),
  libraryMode: z.union(["off", "read-only", "read-write"] as const).default("off"),
  tenant: z.string().required(),
  project: z.string().required(),
  dataDir: z.string().required(),
});

/** Register the Harness² host service and its explicit model-facing tool. */
export function apply(ctx: Context, config: DshHarness2Config): void {
  if (config.maxCost !== undefined && config.pricing === undefined) {
    throw new Error("harness2: maxCost requires explicit provider token pricing");
  }
  const runtime = new DshHarness2Runtime(ctx, config);
  ctx.provide("harness2", runtime);
  ctx.tools.register(defineTool({
    name: "harness2_run",
    description: "Run a high-cost Harness² Propose-Probe-Compose job for one explicit task. Use only when the user asks for recursive harness improvement or extra test-time adaptation.",
    parameters: {
      task: { type: "string", required: true, description: "Complete task to execute in isolated candidate agents." },
      domain: { type: "string", required: true, description: "Stable experience-library domain." },
      mode: { type: "string", enum: ["parallel", "sequential"], description: "Recursion mode; deployment default when omitted." },
      k: { type: "integer", enum: [1, 2, 3, 4, 5], description: "Exploration budget; deployment default when omitted." },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          status: { type: "string", required: true, enum: ["completed", "failed", "cancelled"] },
          chosenLabel: { type: "string", required: true },
          content: { type: "string", required: true },
          rollouts: { type: "integer", required: true },
          fallbacks: { type: "array", required: true, items: { type: "string" } },
          errors: { type: "array", required: true, items: { type: "string" } },
          inputTokens: { type: "integer", required: true },
          outputTokens: { type: "integer", required: true },
          cachedTokens: { type: "integer", required: true },
          estimatedCost: { type: "number", required: true },
        },
      },
      render: (_args, value) => [{
        type: "text",
        text: value.status === "completed"
          ? value.content
          : `Harness² ${value.status}: ${value.errors.join("; ")}`,
      }],
    },
    async execute(args, exec) {
      if (!exec.agent) throw new Error("harness2_run requires an owning DSH Agent");
      const result = await runtime.run(exec.agent, {
        task: args.task,
        domain: args.domain,
        ...(args.mode === undefined ? {} : { mode: args.mode }),
        ...(args.k === undefined ? {} : { k: args.k }),
        signal: exec.signal,
      });
      return {
        status: result.status,
        chosenLabel: result.chosenLabel,
        content: Object.values(result.chosenRun?.deliverables ?? {}).join("\n\n"),
        rollouts: result.baseRuns.length + result.stages.length,
        fallbacks: [...result.fallbacks],
        errors: [...result.errors],
        inputTokens: result.totalUsage.inputTokens,
        outputTokens: result.totalUsage.outputTokens,
        cachedTokens: result.totalUsage.cachedTokens,
        estimatedCost: result.totalUsage.cost,
      };
    },
    presentCall: (args) => ({
      card: "generic",
      title: `Harness² ${args.mode ?? config.mode} k=${args.k ?? config.k}`,
      kind: "execute",
      rawInput: { domain: args.domain, task: args.task },
    }),
  }));
}

export default { name, inject, Config, apply };
export * from "./runtime.js";
