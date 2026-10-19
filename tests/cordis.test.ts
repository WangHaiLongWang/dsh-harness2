import test from "node:test";
import assert from "node:assert/strict";
import { registerHarness2Plugins, type CordisLikeContext } from "../src/cordis/plugins.js";
import { Harness2Orchestrator, DEFAULT_POLICY } from "../src/core/orchestrator.js";
import { MemoryExperienceStore, MemoryRunStore } from "../src/storage/memory-store.js";
import { DeterministicEditor, FakeDshSubstrate } from "../src/testing/fakes.js";

class FakeCordis implements CordisLikeContext {
  listeners = new Map<string, (payload: unknown) => void | Promise<void>>();
  services = new Map<string, unknown>();
  emitted: { event: string; payload: unknown }[] = [];
  on(event: string, listener: (payload: unknown) => void | Promise<void>) {
    this.listeners.set(event, listener);
    return () => this.listeners.delete(event);
  }
  async emit(event: string, payload: unknown) {
    this.emitted.push({ event, payload });
  }
  provide(name: string, service: unknown) {
    this.services.set(name, service);
  }
}

test("Cordis bridge registers services and skips internal rollouts", async () => {
  const context = new FakeCordis();
  const store = new MemoryExperienceStore();
  const substrate = new FakeDshSubstrate();
  const orchestrator = new Harness2Orchestrator({
    substrate,
    editor: new DeterministicEditor(),
    experienceStore: store,
    runStore: new MemoryRunStore(),
    id: () => "cordis",
  });
  const dispose = registerHarness2Plugins(context, orchestrator, store);
  assert.equal(context.services.get("harness2"), orchestrator);
  const listener = context.listeners.get("agent/pre-step");
  assert.ok(listener);
  await listener({ internal: true, task: { taskId: "x" }, policy: DEFAULT_POLICY });
  assert.equal(substrate.executions.length, 0);
  await listener({
    task: { taskId: "x", domain: "general", prompt: "x" },
    policy: DEFAULT_POLICY,
  });
  assert.equal(substrate.executions.length, 4);
  assert.deepEqual(context.emitted.map((item) => item.event), [
    "harness2/run-planned",
    "harness2/run-finished",
  ]);
  dispose();
  assert.equal(context.listeners.has("agent/pre-step"), false);
});
