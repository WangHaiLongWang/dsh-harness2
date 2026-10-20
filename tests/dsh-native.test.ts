import test from "node:test";
import assert from "node:assert/strict";
import { Context } from "@deepseek-ai/cordis";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { LlmAdapter, type GenerateOptions, type StreamChunk } from "@deepseek-ai/dsh-llm";
import { SessionId } from "@deepseek-ai/dsh-session";
import {
  mountAgentLoopTestDependencies,
  mountAgentLoopTestHarness,
} from "@deepseek-ai/dsh-agent-loop-testkit";
import * as harness2Plugin from "../src/dsh/index.js";
import { DshAgentRunner } from "../src/dsh/agent-runner.js";
import { DshHarness2Runtime } from "../src/dsh/runtime.js";
import SkillRegistry from "@deepseek-ai/dsh-skill";
import { validateNativeComponents } from "../src/dsh/components.js";

function response(text: string): StreamChunk[] {
  return [
    { type: "block-start", index: 0, blockType: "text" },
    { type: "text-delta", index: 0, text },
    { type: "block-end", index: 0, block: { type: "text", text } },
    { type: "usage", usage: { inputTokens: 7, outputTokens: 3, cacheReadTokens: 2 } },
    { type: "finish", reason: { kind: "stop" } },
  ];
}

class RecordingAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = [];
  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options);
    yield* response("child result");
  }
}

class Harness2ScriptAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = [];
  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options);
    const prompt = JSON.stringify(options.messages);
    let text = "rollout result";
    if (options.system?.includes("You edit an agent harness from execution evidence")) {
      if (prompt.includes("Improve reusable execution behavior")) {
        text = JSON.stringify({
          "system.md": "",
          "guardrails.md": "Verify artifact before delivery.",
          "memory.md": "",
          "tool-guidance.md": "",
        });
      } else if (prompt.includes("Improve domain procedure")) {
        text = JSON.stringify({
          "system.md": "Apply explicit domain constraints.",
          "guardrails.md": "",
          "memory.md": "",
          "tool-guidance.md": "",
        });
      } else {
        text = JSON.stringify({
          "system.md": "Apply explicit domain constraints.",
          "guardrails.md": "Verify artifact before delivery.",
          "memory.md": "",
          "tool-guidance.md": "",
        });
      }
    }
    yield* response(text);
  }
}

test("native DSH runner creates an isolated production Agent with scoped harness overlay", async () => {
  const ctx = new Context();
  try {
    await mountAgentLoopTestDependencies(ctx);
    const adapter = new RecordingAdapter();
    ctx.llm.registerAdapter(["mock"], adapter);
    await ctx.plugin(harness2Plugin, {
      mode: "parallel",
      k: 1,
      timeoutMs: 10_000,
      maxParallelProposals: 2,
      maxParallelRollouts: 2,
      maxTotalTokens: 10_000,
      libraryMode: "off",
      tenant: "test",
      project: "test",
      dataDir: "runs/native-test",
    });
    const harness = await mountAgentLoopTestHarness(ctx);
    const parent = await harness.create(
      SessionId("harness2-native-parent"),
      { provider: "mock", model: "mock" },
    );
    const runner = new DshAgentRunner(ctx);
    const result = await runner.run({
      parent,
      task: { taskId: "native", domain: "test", prompt: "do the work" },
      tree: {
        "system.md": "",
        "guardrails.md": "Verify artifact before delivery.",
        "memory.md": "",
        "tool-guidance.md": "",
      },
      runId: "native-run",
      stage: "probe",
      timeoutMs: 10_000,
    });

    assert.equal(result.status, "completed");
    assert.equal(result.delivered, true);
    assert.equal(result.deliverables["response.md"], "child result");
    assert.deepEqual(result.usage, {
      inputTokens: 7,
      outputTokens: 3,
      cachedTokens: 2,
      cost: 0,
      toolCalls: 0,
      toolErrors: 0,
    });
    assert.equal(adapter.requests.length, 1);
    assert.match(JSON.stringify(adapter.requests[0]?.messages), /Verify artifact before delivery/);
    assert.equal(ctx.agents.get(SessionId("harness2-native-parent")), parent);
    assert.equal(ctx.agents.list().length, 1, "probe Agent must be disposed after extraction");
  } finally {
    await ctx.fiber.dispose();
  }
});

test("native DSH runtime completes the full k=1 Propose-Probe-Compose chain", async () => {
  const ctx = new Context();
  try {
    await mountAgentLoopTestDependencies(ctx);
    const adapter = new Harness2ScriptAdapter();
    ctx.llm.registerAdapter(["mock"], adapter);
    await ctx.plugin(harness2Plugin, {
      mode: "parallel",
      k: 1,
      timeoutMs: 10_000,
      maxParallelProposals: 2,
      maxParallelRollouts: 2,
      maxTotalTokens: 10_000,
      maxCost: 1,
      pricing: {
        inputPerMillion: 1,
        outputPerMillion: 2,
        cacheReadPerMillion: 0.5,
        cacheWritePerMillion: 1,
      },
      libraryMode: "off",
      tenant: "test",
      project: "test",
      dataDir: "runs/native-chain-test",
    });
    const harness = await mountAgentLoopTestHarness(ctx);
    const parent = await harness.create(
      SessionId("harness2-chain-parent"),
      { provider: "mock", model: "mock" },
    );
    const runtime = new DshHarness2Runtime(ctx, {
      mode: "parallel",
      k: 1,
      timeoutMs: 10_000,
      maxParallelProposals: 2,
      maxParallelRollouts: 2,
      maxTotalTokens: 10_000,
      maxCost: 1,
      pricing: {
        inputPerMillion: 1,
        outputPerMillion: 2,
        cacheReadPerMillion: 0.5,
        cacheWritePerMillion: 1,
      },
      libraryMode: "off",
      tenant: "test",
      project: "test",
      dataDir: "runs/native-chain-test",
    });
    const result = await runtime.run(parent, { task: "produce an artifact", domain: "test" });

    assert.equal(result.status, "completed");
    assert.equal(result.baseRuns.length, 1);
    assert.equal(result.stages.length, 3);
    assert.equal(result.chosenLabel, "final1");
    assert.equal(result.chosenRun?.deliverables["response.md"], "rollout result");
    assert.equal(adapter.requests.length, 7, "k=1 uses 3 editor calls and 4 executor rollouts");
    assert.deepEqual(result.totalUsage, {
      inputTokens: 49,
      outputTokens: 21,
      cachedTokens: 14,
      cost: 0.000098,
      toolCalls: 0,
      toolErrors: 0,
    });
    assert.equal(ctx.agents.list().length, 1, "all four probe Agents must be disposed");
  } finally {
    await ctx.fiber.dispose();
  }
});

test("C6 skill is registered in the isolated Agent scope", async () => {
  const ctx = new Context();
  try {
    await mountAgentLoopTestDependencies(ctx);
    await ctx.plugin(SkillRegistry);
    const adapter = new RecordingAdapter();
    ctx.llm.registerAdapter(["mock"], adapter);
    await ctx.plugin(harness2Plugin, {
      mode: "parallel", k: 1, timeoutMs: 10_000,
      maxParallelProposals: 2, maxParallelRollouts: 2,
      maxTotalTokens: 10_000, libraryMode: "off",
      tenant: "test", project: "test", dataDir: "runs/native-skill-test",
    });
    const harness = await mountAgentLoopTestHarness(ctx);
    const parent = await harness.create(SessionId("harness2-skill-parent"), { provider: "mock", model: "mock" });
    let observed: string[] = [];
    const stop = ctx.on("agent/created", async ({ agent }) => {
      if (agent === parent) return;
      observed = (await agent.ctx.get("skills")?.list({ scope: agent }) ?? []).map((skill) => skill.name);
    });
    try {
      await new DshAgentRunner(ctx).run({
        parent,
        task: { taskId: "skill", domain: "test", prompt: "use the available procedure" },
        tree: {
          "system.md": "When checking exact output, load exact-output.",
          "guardrails.md": "", "memory.md": "", "tool-guidance.md": "",
          "skills/exact-output/SKILL.md": "# Exact output\nReturn only the required token.",
        },
        runId: "skill-run", stage: "probe", timeoutMs: 10_000,
      });
    } finally {
      stop();
    }
    assert.ok(observed.includes("exact-output"));
  } finally {
    await ctx.fiber.dispose();
  }
});

test("C5 capability validation accepts AGENT.md when spawn is available", () => {
  const ctx = new Context();
  try {
    ctx.provide("subagents", { getProvider: (name: string) => name === "spawn" ? {} : undefined } as never);
    const issues = validateNativeComponents(ctx, {
      "system.md": "",
      "subagents/reviewer/AGENT.md": "Review the work.",
      "scripts/check.py": "print('unsafe')",
    });
    assert.deepEqual(issues, []);
  } finally {
    void ctx.fiber.dispose();
  }
});

test("C5 AGENT.md becomes an isolated Agent-scoped delegation tool", async () => {
  const ctx = new Context();
  try {
    await mountAgentLoopTestDependencies(ctx);
    ctx.provide("subagents", {
      getProvider: (name: string) => name === "spawn" ? {} : undefined,
      waitForChildren: async () => false,
      startActivation: async () => { throw new Error("not called by this schema test"); },
    } as never);
    const adapter = new RecordingAdapter();
    ctx.llm.registerAdapter(["mock"], adapter);
    await ctx.plugin(harness2Plugin, {
      mode: "parallel", k: 1, timeoutMs: 10_000,
      maxParallelProposals: 2, maxParallelRollouts: 2,
      maxTotalTokens: 10_000, libraryMode: "off",
      tenant: "test", project: "test", dataDir: "runs/native-subagent-test",
    });
    const harness = await mountAgentLoopTestHarness(ctx);
    const parent = await harness.create(SessionId("harness2-subagent-parent"), { provider: "mock", model: "mock" });
    await new DshAgentRunner(ctx).run({
      parent,
      task: { taskId: "subagent", domain: "test", prompt: "review" },
      tree: {
        "system.md": "", "guardrails.md": "", "memory.md": "", "tool-guidance.md": "",
        "subagents/reviewer/AGENT.md": "# Reviewer\nCheck requirements and report gaps.",
      },
      runId: "subagent-run", stage: "probe", timeoutMs: 10_000,
    });
    assert.ok(adapter.requests[0]?.tools?.some((tool) => tool.name === "harness2_agent_reviewer"));
    assert.equal(ctx.tools.get("harness2_agent_reviewer"), undefined, "scoped tool must disappear with probe Agent");
  } finally {
    await ctx.fiber.dispose();
  }
});

test("C7 stages a fixed scoped script tool and removes its asset directory", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "harness2-script-test-"));
  const ctx = new Context();
  try {
    await mountAgentLoopTestDependencies(ctx);
    ctx.provide("shell", {
      resolve: (request: object) => request,
      execute: async () => { throw new Error("script should not execute in schema test"); },
    } as never);
    ctx.provide("sandboxPolicy", {
      resolve: () => ({ mode: "read-only", workspaceRoot: root }),
    } as never);
    const adapter = new RecordingAdapter();
    ctx.llm.registerAdapter(["mock"], adapter);
    await ctx.plugin(harness2Plugin, {
      mode: "parallel", k: 1, timeoutMs: 10_000,
      maxParallelProposals: 2, maxParallelRollouts: 2,
      maxTotalTokens: 10_000, libraryMode: "off",
      tenant: "test", project: "test", dataDir: root,
    });
    const harness = await mountAgentLoopTestHarness(ctx);
    const parent = await harness.create(SessionId("harness2-script-parent"), { provider: "mock", model: "mock" });
    const runner = new DshAgentRunner(ctx, undefined, {
      enabled: true,
      assetRoot: path.join(root, "assets"),
      timeoutMs: 1_000,
      outputMaxBytes: 10_000,
    });
    await runner.run({
      parent,
      task: { taskId: "script", domain: "test", prompt: "inspect helper" },
      tree: {
        "system.md": "", "guardrails.md": "", "memory.md": "", "tool-guidance.md": "",
        "scripts/check.py": "print('ok')\n",
      },
      runId: "script-run", stage: "probe", timeoutMs: 10_000,
    });
    assert.ok(adapter.requests[0]?.tools?.some((tool) => tool.name === "harness2_script_check"));
    await assert.rejects(stat(path.join(root, "assets", "script-run")), /ENOENT/);
    assert.equal(ctx.tools.get("harness2_script_check"), undefined);
  } finally {
    await ctx.fiber.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test("C7 scripts fail validation while the deployment switch is off", async () => {
  const ctx = new Context();
  try {
    const runner = new DshAgentRunner(ctx);
    assert.deepEqual(runner.validate({ "scripts/check.py": "print('ok')" }).map((issue) => issue.code), [
      "dsh-scripts-disabled",
    ]);
  } finally {
    await ctx.fiber.dispose();
  }
});
