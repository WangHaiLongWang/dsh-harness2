import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import type {
  HarnessRunDetail, HarnessRunStatus, HarnessRunSummary, HarnessStageSummary, HarnessTree, HarnessUsage,
} from './types.ts'

const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const MAX_SUMMARY_BYTES = 2 * 1024 * 1024
const MAX_RUNS = 100
const EMPTY_USAGE: HarnessUsage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0, cost: 0, toolCalls: 0, toolErrors: 0 }

type JsonObject = Record<string, unknown>

function object(value: unknown): JsonObject { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonObject : {} }
function text(value: unknown): string { return typeof value === 'string' ? value : '' }
function number(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? value : 0 }
function boolean(value: unknown): boolean { return value === true }
function status(value: unknown): HarnessRunStatus {
  return value === 'failed' || value === 'cancelled' ? value : 'completed'
}
function strings(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 100) : []
}
function usage(value: unknown): HarnessUsage {
  const item = object(value)
  return {
    inputTokens: number(item.inputTokens), outputTokens: number(item.outputTokens), cachedTokens: number(item.cachedTokens),
    cost: number(item.cost), toolCalls: number(item.toolCalls), toolErrors: number(item.toolErrors),
  }
}
function tree(value: unknown): HarnessTree {
  const entries = Object.entries(object(value))
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .filter(([name, content]) => name.length <= 160 && content.length <= 256_000)
    .slice(0, 64)
  return Object.fromEntries(entries)
}
function dates(source: JsonObject): { startedAt: string, endedAt: string } {
  const bases = Array.isArray(source.baseRuns) ? source.baseRuns.map(object) : []
  const stages = Array.isArray(source.stages) ? source.stages.map(item => object(object(item).run)) : []
  const chosen = object(source.chosenRun)
  const runs = [...bases, ...stages, chosen]
  return {
    startedAt: runs.map(run => text(run.startedAt)).filter(Boolean).sort()[0] ?? '',
    endedAt: runs.map(run => text(run.endedAt)).filter(Boolean).sort().at(-1) ?? '',
  }
}

function summaryOf(source: JsonObject): HarnessRunSummary {
  const timing = dates(source)
  return {
    runId: text(source.runId), taskId: text(source.taskId),
    mode: source.mode === 'sequential' ? 'sequential' : 'parallel', k: number(source.k), status: status(source.status),
    chosenLabel: text(source.chosenLabel), ...timing,
    stageCount: Array.isArray(source.stages) ? source.stages.length : 0,
    fallbackCount: strings(source.fallbacks).length, errorCount: strings(source.errors).length,
    usage: source.totalUsage === undefined ? EMPTY_USAGE : usage(source.totalUsage),
  }
}

function stageOf(value: unknown): HarnessStageSummary {
  const stage = object(value), run = object(stage.run)
  return {
    label: text(stage.label), dimension: ['INV', 'DOM', 'COMPOSE', 'BASE'].includes(text(stage.dimension))
      ? text(stage.dimension) as HarnessStageSummary['dimension'] : 'BASE',
    round: number(stage.round), status: status(run.status), delivered: boolean(run.delivered),
    startedAt: text(run.startedAt), endedAt: text(run.endedAt), fellBack: boolean(stage.fellBack), keptBase: boolean(stage.keptBase),
    validationIssueCount: Array.isArray(stage.validationIssues) ? stage.validationIssues.length : 0,
    usage: usage(run.usage), tree: tree(stage.tree),
  }
}

/** Read bounded, redacted Harness² summaries from the configured Run Store. */
export class Harness2RunReader {
  constructor(private readonly root: string) {}

  async list(): Promise<readonly HarnessRunSummary[]> {
    let entries
    try { entries = await readdir(this.root, { withFileTypes: true }) } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
    const summaries = await Promise.all(entries.filter(entry => entry.isDirectory() && RUN_ID.test(entry.name)).map(async entry => {
      try { return summaryOf(await this.read(entry.name)) } catch { return null }
    }))
    return summaries.filter((item): item is HarnessRunSummary => item !== null && item.runId !== '')
      .sort((left, right) => right.endedAt.localeCompare(left.endedAt)).slice(0, MAX_RUNS)
  }

  async detail(runId: string): Promise<HarnessRunDetail | null> {
    if (!RUN_ID.test(runId)) throw new Error('Invalid Harness² run id')
    let source: JsonObject
    try { source = await this.read(runId) } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
    return {
      ...summaryOf(source),
      baseTree: tree(source.baseHarness),
      adoptedTree: tree(source.adoptedHarness),
      stages: (Array.isArray(source.stages) ? source.stages : []).slice(0, 50).map(stageOf),
      fallbacks: strings(source.fallbacks), errors: strings(source.errors),
    }
  }

  private async read(runId: string): Promise<JsonObject> {
    const file = path.resolve(this.root, runId, 'summary.json')
    const expected = path.resolve(this.root, runId) + path.sep
    if (!file.startsWith(expected)) throw new Error('Harness² path escaped the Run Store')
    const raw = await readFile(file)
    if (raw.byteLength > MAX_SUMMARY_BYTES) throw new Error('Harness² summary exceeds the panel limit')
    return object(JSON.parse(raw.toString('utf8')))
  }
}

