import type {
  ExperienceEntry,
  ExperienceScope,
  ExperienceStore,
  Harness2Result,
  RunArtifact,
  RunStore,
} from "../types.js";

function scopeKey(scope: ExperienceScope): string {
  return `${scope.tenant}\0${scope.project}\0${scope.domain}`;
}

export class MemoryExperienceStore implements ExperienceStore {
  readonly #entries = new Map<string, ExperienceEntry[]>();

  async list(scope: ExperienceScope): Promise<readonly ExperienceEntry[]> {
    return [...(this.#entries.get(scopeKey(scope)) ?? [])];
  }

  async append(scope: ExperienceScope, entry: ExperienceEntry): Promise<void> {
    const key = scopeKey(scope);
    const current = this.#entries.get(key) ?? [];
    if (current.some((item) => item.id === entry.id)) return;
    this.#entries.set(key, [...current, structuredClone(entry)]);
  }
}

export class MemoryRunStore implements RunStore {
  readonly runs: RunArtifact[] = [];
  readonly summaries: Harness2Result[] = [];

  async saveRun(run: RunArtifact): Promise<void> {
    if (!this.runs.some((item) => item.runId === run.runId)) this.runs.push(structuredClone(run));
  }

  async saveSummary(summary: Harness2Result): Promise<void> {
    const index = this.summaries.findIndex((item) => item.runId === summary.runId);
    if (index >= 0) this.summaries[index] = structuredClone(summary);
    else this.summaries.push(structuredClone(summary));
  }
}
