import { Harness2Orchestrator, DEFAULT_POLICY } from "./core/orchestrator.js";
import { FileExperienceStore, FileRunStore } from "./storage/file-store.js";
import { DeterministicEditor, FakeDshSubstrate } from "./testing/fakes.js";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../runs/demo/", import.meta.url));
const substrate = new FakeDshSubstrate();
const orchestrator = new Harness2Orchestrator({
  substrate,
  editor: new DeterministicEditor(),
  experienceStore: new FileExperienceStore(`${root}/library`),
  runStore: new FileRunStore(`${root}/runs`),
  id: () => "demo",
});

const result = await orchestrator.run(
  { taskId: "demo-task", domain: "general", prompt: "Create and verify result.txt" },
  {
    ...DEFAULT_POLICY,
    k: 2,
    libraryMode: "read-write",
    scope: { tenant: "demo", project: "demo", domain: "general" },
  },
);

console.log(JSON.stringify({
  status: result.status,
  chosenLabel: result.chosenLabel,
  rollouts: substrate.executions.length,
  stages: result.stages.length,
  fallbacks: result.fallbacks,
  experienceWritten: result.experienceWritten,
  usage: result.totalUsage,
}, null, 2));
