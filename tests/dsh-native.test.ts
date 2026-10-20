import test from "node:test";
import assert from "node:assert/strict";
import { Context } from "@deepseek-ai/cordis";
import { LlmAdapter, type GenerateOptions, type StreamChunk } from "@deepseek-ai/dsh-llm";
import { SessionId } from "@deepseek-ai/dsh-session";
import {
  mountAgentLoopTestDependencies,
  mountAgentLoopTestHarness,
} from "@deepseek-ai/dsh-agent-loop-testkit";
import * as harness2Plugin from "../src/dsh/index.js";
import { DshAgentRunner } from "../src/dsh/agent-runner.js";
import { DshHarness2Runtime } from "../src/dsh/runtime.js";

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
      maxCost: 1,
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
      cost: 0,
      toolCalls: 0,
      toolErrors: 0,
    });
    assert.equal(ctx.agents.list().length, 1, "all four probe Agents must be disposed");
  } finally {
    await ctx.fiber.dispose();
  }
});
