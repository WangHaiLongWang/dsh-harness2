import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  ExperienceEntry,
  ExperienceScope,
  ExperienceStore,
  Harness2Result,
  RunArtifact,
  RunStore,
} from "../types.js";

function safeSegment(value: string): string {
  const normalized = value.normalize("NFC");
  if (!/^[a-zA-Z0-9_.-]+$/.test(normalized) || normalized === "." || normalized === "..") {
    throw new Error(`unsafe storage segment: ${value}`);
  }
  return normalized;
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

async function atomicJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(temp, file);
}

const writeQueues = new Map<string, Promise<void>>();

async function serialized(file: string, operation: () => Promise<void>): Promise<void> {
  const previous = writeQueues.get(file) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  writeQueues.set(file, current);
  try {
    await current;
  } finally {
    if (writeQueues.get(file) === current) writeQueues.delete(file);
  }
}

export class FileExperienceStore implements ExperienceStore {
  constructor(private readonly root: string) {}

  #file(scope: ExperienceScope): string {
    return path.join(
      this.root,
      safeSegment(scope.tenant),
      safeSegment(scope.project),
      safeSegment(scope.domain),
      "entries.json",
    );
  }

  async list(scope: ExperienceScope): Promise<readonly ExperienceEntry[]> {
    return readJson<ExperienceEntry[]>(this.#file(scope), []);
  }

  async append(scope: ExperienceScope, entry: ExperienceEntry): Promise<void> {
    const file = this.#file(scope);
    await serialized(file, async () => {
      const entries = await readJson<ExperienceEntry[]>(file, []);
      if (entries.some((item) => item.id === entry.id)) return;
      await atomicJson(file, [...entries, entry]);
    });
  }
}

export class FileRunStore implements RunStore {
  constructor(private readonly root: string) {}

  async saveRun(run: RunArtifact): Promise<void> {
    await atomicJson(path.join(this.root, safeSegment(run.runId), "run.json"), run);
  }

  async saveSummary(summary: Harness2Result): Promise<void> {
    await atomicJson(path.join(this.root, safeSegment(summary.runId), "summary.json"), summary);
  }
}
