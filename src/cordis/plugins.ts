import type { Harness2Orchestrator } from "../core/orchestrator.js";
import type { ExperienceStore, Harness2Policy, TaskContext } from "../types.js";

export const DSH_HOOKS = [
  "agent/pre-step",
  "agent/request",
  "agent/turn-stopping",
  "subagent/start",
  "subagent_fork",
] as const;

export const HARNESS2_EVENTS = [
  "harness2/run-planned",
  "harness2/reference-ready",
  "harness2/candidate-ready",
  "harness2/probe-finished",
  "harness2/composition-finished",
  "harness2/selection-finished",
  "harness2/reflection-finished",
  "harness2/run-finished",
] as const;

export interface CordisLikeContext {
  on(event: string, listener: (payload: unknown) => void | Promise<void>): () => void;
  emit(event: string, payload: unknown): void | Promise<void>;
  provide(name: string, service: unknown): void;
}

export interface Harness2TaskEnvelope {
  task: TaskContext;
  policy: Harness2Policy;
  internal?: boolean;
  signal?: AbortSignal;
}

export function registerHarness2Plugins(
  context: CordisLikeContext,
  orchestrator: Harness2Orchestrator,
  experienceStore: ExperienceStore,
): () => void {
  context.provide("harness2", orchestrator);
  context.provide("harness2-experience-store", experienceStore);

  // This bridge intentionally performs orchestration only at the top-level task boundary.
  // Exact DSH payload extraction is supplied by the host integration package.
  const dispose = context.on("agent/pre-step", async (payload) => {
    const envelope = payload as Partial<Harness2TaskEnvelope>;
    if (envelope.internal || !envelope.task || !envelope.policy) return;
    const plan = orchestrator.plan(envelope.task, envelope.policy);
    await context.emit("harness2/run-planned", plan);
    const result = await orchestrator.run(envelope.task, envelope.policy, envelope.signal);
    await context.emit("harness2/run-finished", {
      runId: result.runId,
      taskId: result.taskId,
      status: result.status,
      chosenLabel: result.chosenLabel,
    });
  });
  return dispose;
}
