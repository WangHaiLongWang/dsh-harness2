import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type {} from "@deepseek-ai/dsh-skill";
import type {} from "@deepseek-ai/dsh-subagent";
import { defineTool } from "@deepseek-ai/dsh-tools";
import type { HarnessTree, HarnessValidationIssue } from "../types.js";

const SKILL_FILE = /^skills\/([a-z0-9_-]+)\/SKILL\.md$/;
const SUBAGENT_FILE = /^subagents\/([a-z0-9_-]+)\/AGENT\.md$/;

function summary(body: string, fallback: string): string {
  const line = body.split(/\r?\n/).map((value) => value.replace(/^#+\s*/, "").trim()).find((value) => value !== "");
  return (line ?? fallback).slice(0, 240);
}

function subagentToolName(name: string): string {
  return `harness2_agent_${name.replaceAll("-", "_")}`;
}

export function validateNativeComponents(ctx: Context, tree: HarnessTree): HarnessValidationIssue[] {
  const issues: HarnessValidationIssue[] = [];
  const toolNames = new Map<string, string>();
  for (const file of Object.keys(tree)) {
    if (["system.md", "guardrails.md", "memory.md", "tool-guidance.md"].includes(file)) continue;
    const skill = SKILL_FILE.exec(file);
    if (skill) {
      if (ctx.get("skills") === undefined) issues.push({ path: file, code: "dsh-skill-unavailable", message: "ctx.skills is not composed" });
      continue;
    }
    const subagent = SUBAGENT_FILE.exec(file);
    if (subagent) {
      if (!ctx.get("subagents")?.getProvider("spawn")) issues.push({ path: file, code: "dsh-subagent-unavailable", message: "spawn subagent provider is not composed" });
      const name = subagent[1] as string;
      const tool = subagentToolName(name);
      if (toolNames.has(tool)) issues.push({ path: file, code: "subagent-tool-collision", message: `tool name collides with ${toolNames.get(tool)}` });
      else toolNames.set(tool, file);
      continue;
    }
    issues.push({ path: file, code: "unsupported-dsh-component", message: "DSH native implementation supports C1-C6; script and middleware assets remain disabled" });
  }
  return issues;
}

export function installNativeComponents(rootCtx: Context, agentCtx: Context, tree: HarnessTree): void {
  for (const [file, body] of Object.entries(tree)) {
    const skill = SKILL_FILE.exec(file);
    if (skill) {
      const name = skill[1] as string;
      const skills = agentCtx.get("skills");
      if (!skills) throw new Error("Harness² skill materialization requires ctx.skills");
      skills.register({ name, description: summary(body, `Harness² skill ${name}`), content: body, source: "runtime", invocation: { modelInvocable: true, userInvocable: false } });
      continue;
    }
    const subagent = SUBAGENT_FILE.exec(file);
    if (!subagent) continue;
    const name = subagent[1] as string;
    const runtime = rootCtx.get("subagents");
    if (!runtime) throw new Error("Harness² subagent materialization requires ctx.subagents");
    agentCtx.tools.register(defineTool({
      name: subagentToolName(name),
      description: `Delegate to the Harness² ${name} specialist. ${summary(body, "")}`.trim(),
      parameters: { task: { type: "string", required: true, description: "Complete task for this specialist." } },
      output: { schema: { type: "object", additionalProperties: false, properties: { subagentId: { type: "string", required: true } } }, render: (_args, value) => [{ type: "text", text: `started subagent ${value.subagentId}` }] },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const parent: Agent | undefined = exec.agent;
        if (!parent) throw new Error(`${subagentToolName(name)} requires an owning Agent`);
        const started = await runtime.startActivation({ provider: "spawn", label: `Harness² ${name}`, request: { parent, prompt: [{ type: "text", text: `${body}\n\n# Assigned task\n\n${args.task}` }], maxDepth: 2 }, signal: exec.signal, delivery: "parent" });
        return { subagentId: String(started.childId) };
      },
      presentCall: (args) => ({ card: "generic", title: `Delegate to ${name}`, kind: "execute", rawInput: args.task }),
    }));
  }
}
