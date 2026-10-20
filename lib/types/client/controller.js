import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
const INITIAL = { status: 'idle', runs: [], selectedId: null, detail: null };
export class Harness2PanelController {
    store = createSnapshotStore(INITIAL);
    generation = 0;
    refresh = async () => {
        const generation = ++this.generation;
        const current = this.store.getSnapshot();
        this.store.set({ ...current, status: 'loading' });
        try {
            const response = await fetch('api/harness2-panel/runs');
            if (!response.ok)
                throw new Error(`Harness² list returned ${response.status}`);
            const runs = await response.json();
            if (generation !== this.generation)
                return;
            const selectedId = runs.some(run => run.runId === current.selectedId) ? current.selectedId : runs[0]?.runId ?? null;
            this.store.set({ status: 'ready', runs, selectedId, detail: null });
            if (selectedId !== null)
                await this.selectRun(selectedId);
        }
        catch {
            if (generation === this.generation)
                this.store.set({ ...current, status: 'error' });
        }
    };
    selectRun = async (runId) => {
        const generation = ++this.generation;
        const current = this.store.getSnapshot();
        this.store.set({ ...current, selectedId: runId, detail: null });
        try {
            const response = await fetch(`api/harness2-panel/run?runId=${encodeURIComponent(runId)}`);
            if (!response.ok)
                throw new Error(`Harness² detail returned ${response.status}`);
            const detail = await response.json();
            if (generation === this.generation)
                this.store.set({ ...this.store.getSnapshot(), detail });
        }
        catch {
            if (generation === this.generation)
                this.store.set({ ...this.store.getSnapshot(), status: 'error' });
        }
    };
    face() { return { hooks: { harness2Panel: this.store }, refresh: this.refresh, selectRun: this.selectRun }; }
}
//# sourceMappingURL=controller.js.map