import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { HarnessRunDetail, HarnessRunSummary } from '../panel/types.ts'

export interface Harness2PanelState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  readonly runs: readonly HarnessRunSummary[]
  readonly selectedId: string | null
  readonly detail: HarnessRunDetail | null
}
export interface Harness2PanelFace {
  readonly hooks: { readonly harness2Panel: SnapshotStore<Harness2PanelState> }
  readonly refresh: () => Promise<void>
  readonly selectRun: (runId: string) => Promise<void>
}

const INITIAL: Harness2PanelState = { status: 'idle', runs: [], selectedId: null, detail: null }

export class Harness2PanelController {
  readonly store = createSnapshotStore<Harness2PanelState>(INITIAL)
  private generation = 0
  readonly refresh = async (): Promise<void> => {
    const generation = ++this.generation
    const current = this.store.getSnapshot()
    this.store.set({ ...current, status: 'loading' })
    try {
      const response = await fetch('api/harness2-panel/runs')
      if (!response.ok) throw new Error(`Harness² list returned ${response.status}`)
      const runs = await response.json() as readonly HarnessRunSummary[]
      if (generation !== this.generation) return
      const selectedId = runs.some(run => run.runId === current.selectedId) ? current.selectedId : runs[0]?.runId ?? null
      this.store.set({ status: 'ready', runs, selectedId, detail: null })
      if (selectedId !== null) await this.selectRun(selectedId)
    } catch {
      if (generation === this.generation) this.store.set({ ...current, status: 'error' })
    }
  }

  readonly selectRun = async (runId: string): Promise<void> => {
    const generation = ++this.generation
    const current = this.store.getSnapshot()
    this.store.set({ ...current, selectedId: runId, detail: null })
    try {
      const response = await fetch(`api/harness2-panel/run?runId=${encodeURIComponent(runId)}`)
      if (!response.ok) throw new Error(`Harness² detail returned ${response.status}`)
      const detail = await response.json() as HarnessRunDetail
      if (generation === this.generation) this.store.set({ ...this.store.getSnapshot(), detail })
    } catch {
      if (generation === this.generation) this.store.set({ ...this.store.getSnapshot(), status: 'error' })
    }
  }

  face(): Harness2PanelFace { return { hooks: { harness2Panel: this.store }, refresh: this.refresh, selectRun: this.selectRun } }
}

