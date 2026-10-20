import { type SnapshotStore } from '@deepseek-ai/dsh-client-store';
import type { HarnessRunDetail, HarnessRunSummary } from '../panel/types.ts';
export interface Harness2PanelState {
    readonly status: 'idle' | 'loading' | 'ready' | 'error';
    readonly runs: readonly HarnessRunSummary[];
    readonly selectedId: string | null;
    readonly detail: HarnessRunDetail | null;
}
export interface Harness2PanelFace {
    readonly hooks: {
        readonly harness2Panel: SnapshotStore<Harness2PanelState>;
    };
    readonly refresh: () => Promise<void>;
    readonly selectRun: (runId: string) => Promise<void>;
}
export declare class Harness2PanelController {
    readonly store: SnapshotStore<Harness2PanelState>;
    private generation;
    readonly refresh: () => Promise<void>;
    readonly selectRun: (runId: string) => Promise<void>;
    face(): Harness2PanelFace;
}
//# sourceMappingURL=controller.d.ts.map