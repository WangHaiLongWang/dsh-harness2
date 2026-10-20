import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { BlockAssembler, type GenerateOptions } from "@deepseek-ai/dsh-llm";
import type {
  CompositionRequest,
  HarnessEditor,
  HarnessTree,
  ProposalRequest,
  Reflection,
  ReflectionRequest,
  RunUsage,
  SelectionCandidate,
  TaskContext,
} from "../types.js";

const EDITOR_SYSTEM = `You edit an agent harness from execution evidence. Return exactly one JSON object with all four keys system.md, guardrails.md, memory.md, and tool-guidance.md, mapped to complete UTF-8 file contents. Keep unchanged files. This deployment supports only those four text components. Never include prose or Markdown fences.`;

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function parseObject(text: string): Record<string, string> {
  const value: unknown = JSON.parse(text);
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("editor output must be one JSON object");
  }
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "string") throw new Error(`editor value for ${key} must be a string`);
    result[key] = entry;
  }
  return result;
}

function evidence(request: ProposalRequest | CompositionRequest): Record<string, unknown> {
  return {
    task: request.task,
    currentHarness: request.current,
    references: request.references.map((run) => ({
      stage: run.stage,
      delivered: run.delivered,
      trajectory: run.trajectory,
      deliverables: run.deliverables,
    })),
    history: request.history.map((stage) => ({
      label: stage.label,
      dimension: stage.dimension,
      trajectory: stage.run.trajectory,
      deliverables: stage.run.deliverables,
    })),
    library: request.library.map((entry) => ({
      cue: entry.reflection.cue,
      lesson: entry.reflection.lesson,
      evidence: entry.reflection.evidence,
      harness: entry.harness,
    })),
    validationFeedback: request.validationFeedback ?? [],
  };
}

/** Uses the same DSH route as the parent Agent for editor, selector, and reflection calls. */
export class DshModelEditor implements HarnessEditor {
  #usageSink: ((usage: RunUsage) => void) | undefined;

  constructor(
    private readonly ctx: Context,
    private readonly parent: Agent,
    private readonly signal?: AbortSignal,
    private readonly timeoutMs = 3_600_000,
  ) {}

  setUsageSink(sink: (usage: RunUsage) => void): void {
    this.#usageSink = sink;
  }

  async #complete(system: string, prompt: string): Promise<string> {
    const options: GenerateOptions = {
      provider: this.parent.options.provider ?? "",
      model: this.parent.options.model ?? "",
      system,
      messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
      temperature: 0,
      signal: this.signal
        ? AbortSignal.any([this.signal, AbortSignal.timeout(this.timeoutMs)])
        : AbortSignal.timeout(this.timeoutMs),
    };
    if (options.provider === "" || options.model === "") {
      throw new Error("Harness² requires a resolved parent provider and model");
    }
    const assembler = new BlockAssembler();
    for await (const chunk of this.ctx.llm.stream(options)) assembler.push(chunk);
    const usage = assembler.usage;
    if (usage) {
      this.#usageSink?.({
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cachedTokens: (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0),
        cost: 0,
        toolCalls: 0,
        toolErrors: 0,
      });
    }
    const blocks = assembler.blocks();
    const last = blocks.at(-1);
    if (last?.type !== "text") throw new Error("editor returned no final text block");
    return last.text.trim();
  }

  async propose(request: ProposalRequest): Promise<HarnessTree> {
    const focus = request.dimension === "INV"
      ? "Improve reusable execution behavior: planning, tools, context, verification, or delegation."
      : "Improve domain procedure, constraints, and artifact requirements without embedding task-specific facts.";
    return parseObject(await this.#complete(
      EDITOR_SYSTEM,
      `${focus}\nUse concrete behavioral evidence. KEEP_BASE is represented by returning currentHarness unchanged.\n\n${json(evidence(request))}`,
    ));
  }

  async compose(request: CompositionRequest): Promise<HarnessTree> {
    return parseObject(await this.#complete(
      EDITOR_SYSTEM,
      `Compose one successor harness. Merge only changes supported by trajectory evidence; preserve the current harness when evidence is weak. Candidate evidence:\n${json({ ...evidence(request), candidates: request.candidates })}`,
    ));
  }

  async select(task: TaskContext, candidates: readonly SelectionCandidate[]): Promise<string> {
    const text = await this.#complete(
      "Choose exactly one existing anonymous deliverable. Judge delivery, conformance, fidelity, internal consistency, operational fitness, and finish. Return only JSON: {\"choice\":\"<anonymousId>\"}.",
      json({ task, candidates }),
    );
    const value: unknown = JSON.parse(text);
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid selector output");
    const choice = (value as Record<string, unknown>)["choice"];
    if (typeof choice !== "string") throw new Error("selector choice must be a string");
    return choice;
  }

  async reflect(request: ReflectionRequest): Promise<Reflection | null> {
    const text = await this.#complete(
      "Attribute harness edits using execution contrasts. Return NO_ENTRY if no reusable lesson is supported; otherwise return exactly JSON with cue, lesson, evidence, and confidence (high|medium|low).",
      json(request),
    );
    if (text === "NO_ENTRY") return null;
    const value: unknown = JSON.parse(text);
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid reflection output");
    const record = value as Record<string, unknown>;
    if (typeof record["cue"] !== "string" || typeof record["lesson"] !== "string"
      || typeof record["evidence"] !== "string"
      || !["high", "medium", "low"].includes(String(record["confidence"]))) {
      throw new Error("reflection output has invalid fields");
    }
    return {
      cue: record["cue"],
      lesson: record["lesson"],
      evidence: record["evidence"],
      confidence: record["confidence"] as Reflection["confidence"],
    };
  }
}
