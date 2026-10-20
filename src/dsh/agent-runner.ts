import { randomUUID } from "node:crypto";
import type { Context } from "@deepseek-ai/cordis";
import type { Agent, AgentOptions } from "@deepseek-ai/dsh-agent";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { SessionId, type SessionEvent } from "@deepseek-ai/dsh-session";
import type {} from "@deepseek-ai/dsh-agent-preset-registry";
import type { HarnessTree, HarnessValidationIssue, RunArtifact, RunUsage, TaskContext } from "../types.js";
import { fingerprintTree } from "../core/harness-tree.js";
import { priceUsage, type DshTokenPricing } from "./pricing.js";
import { installNativeComponents, validateNativeComponents } from "./components.js";

const OVERLAY_SECTION = "harness2:overlay";

function overlayText(tree: HarnessTree): string {
  const parts = [
    ["System", tree["system.md"]],
    ["Guardrails", tree["guardrails.md"]],
    ["Memory", tree["memory.md"]],
    ["Tool guidance", tree["tool-guidance.md"]],
  ].filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim() !== "");
  return parts.map(([title, body]) => `# Harness² ${title}\n\n${body}`).join("\n\n");
}

function finalText(events: readonly SessionEvent[]): string {
  let text = "";
  for (const event of events) {
    if (event.type !== "assistant/message") continue;
    const candidate = event.data.message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");
    if (candidate !== "") text = candidate;
  }
  return text;
}

function usageOf(events: readonly SessionEvent[], pricing?: DshTokenPricing): RunUsage {
  const usage: RunUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    cost: 0,
    toolCalls: 0,
    toolErrors: 0,
  };
  for (const event of events) {
    if (event.type === "assistant/message" && event.data.usage) {
      usage.inputTokens += event.data.usage.inputTokens;
      usage.outputTokens += event.data.usage.outputTokens;
      usage.cachedTokens += (event.data.usage.cacheReadTokens ?? 0)
        + (event.data.usage.cacheWriteTokens ?? 0);
      usage.cost += priceUsage(event.data.usage, pricing);
    } else if (event.type === "tool/call") {
      usage.toolCalls += 1;
    } else if (event.type === "tool/result" && event.data.message.isError === true) {
      usage.toolErrors += 1;
    }
  }
  return usage;
}

function trajectoryOf(events: readonly SessionEvent[]): string {
  return events.map((event) => {
    if (event.type === "assistant/message") {
      return `[ASSISTANT] ${event.data.message.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("")}`;
    }
    if (event.type === "tool/call") return `[ACTION] ${event.data.name} ${event.data.arguments}`;
    if (event.type === "tool/result") {
      const text = event.data.message.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");
      return event.data.message.isError === true ? `[ERROR] ${text}` : `[OBSERVATION] ${text}`;
    }
    if (event.type === "turn/end") return `[TURN_END] ${event.data.reason.kind}`;
    return "";
  }).filter(Boolean).join("\n");
}

export interface DshAgentRunRequest {
  parent: Agent;
  task: TaskContext;
  tree: HarnessTree;
  runId: string;
  stage: string;
  timeoutMs: number;
  signal?: AbortSignal;
}

/** Executes one isolated Harness² probe through the production DSH Agent registry. */
export class DshAgentRunner {
  constructor(
    private readonly ctx: Context,
    private readonly pricing?: DshTokenPricing,
  ) {}

  validate(tree: HarnessTree): HarnessValidationIssue[] {
    return validateNativeComponents(this.ctx, tree);
  }

  async run(request: DshAgentRunRequest): Promise<RunArtifact> {
    const startedAt = new Date().toISOString();
    const timeout = AbortSignal.timeout(request.timeoutMs);
    const signal = request.signal
      ? AbortSignal.any([request.signal, timeout])
      : timeout;
    const parent = request.parent;
    const agentOptions: AgentOptions = { ...parent.options };
    const sessionId = SessionId(`harness2-${randomUUID()}`);
    const cwd = parent.session.header.cwd;
    const overlay = overlayText(request.tree);
    const handle = await this.ctx.agents.create({
      sessionId,
      parentAgent: parent,
      agentOptions,
      signal,
      meta: {
        ...(cwd === undefined ? {} : { cwd }),
        parentSession: parent.id,
        origin: "subagent",
        delegationDepth: (parent.session.header.delegationDepth ?? 0) + 1,
      },
      setup: async (agentCtx) => {
        const presets = this.ctx.get("agentPresets");
        presets?.composeFrom(agentCtx, parent.ctx);
        if (overlay !== "") {
          agentCtx.systemPrompt.section({
            name: OVERLAY_SECTION,
            order: 10_150,
            text: overlay,
            interpolate: false,
          });
        }
        installNativeComponents(this.ctx, agentCtx, request.tree);
        agentCtx.tools.restrict({ deny: ["harness2_run"] });
      },
    });

    const cancel = (): void => {
      handle.agent.cancel({ kind: "hook", reason: "Harness² rollout deadline or owner cancellation" });
    };
    signal.addEventListener("abort", cancel, { once: true });
    try {
      if (signal.aborted) cancel();
      const firstSeq = handle.agent.session.seq;
      handle.agent.followup(createUserMessage({
        content: [{ type: "text", text: request.task.prompt }],
        source: { kind: "user" },
      }));
      while (true) {
        await handle.agent.whenIdle();
        const idleSeq = handle.agent.session.seq;
        if (!await this.ctx.get("subagents")?.waitForChildren(handle.agent)
          && handle.agent.status === "idle"
          && handle.agent.session.seq === idleSeq) break;
      }
      const events = handle.agent.session.snapshotEvents(firstSeq);
      const text = finalText(events);
      const ended = [...events].reverse().find((event) => event.type === "turn/end");
      const failed = ended?.type === "turn/end" && ended.data.reason.kind !== "completed";
      return {
        runId: request.runId,
        taskId: request.task.taskId,
        stage: request.stage,
        harnessFingerprint: fingerprintTree(request.tree),
        environmentFingerprint: "dsh-0.2.1-alpha.4",
        startedAt,
        endedAt: new Date().toISOString(),
        status: failed ? "failed" : "completed",
        delivered: !failed && text.trim() !== "",
        trajectory: trajectoryOf(events),
        deliverables: text.trim() === "" ? {} : { "response.md": text },
        usage: usageOf(events, this.pricing),
        ...(failed ? { error: `turn ended with ${ended.data.reason.kind}` } : {}),
      };
    } finally {
      signal.removeEventListener("abort", cancel);
      await handle.dispose();
    }
  }
}
