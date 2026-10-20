/** Browser-safe DTOs exposed by the Harness² read-only panel service. */
export type HarnessRunStatus = 'completed' | 'failed' | 'cancelled';
export type HarnessTree = Readonly<Record<string, string>>;
export interface HarnessUsage {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cachedTokens: number;
    readonly cost: number;
    readonly toolCalls: number;
    readonly toolErrors: number;
}
export interface HarnessRunSummary {
    readonly runId: string;
    readonly taskId: string;
    readonly mode: 'parallel' | 'sequential';
    readonly k: number;
    readonly status: HarnessRunStatus;
    readonly chosenLabel: string;
    readonly startedAt: string;
    readonly endedAt: string;
    readonly stageCount: number;
    readonly fallbackCount: number;
    readonly errorCount: number;
    readonly usage: HarnessUsage;
}
export interface HarnessStageSummary {
    readonly label: string;
    readonly dimension: 'INV' | 'DOM' | 'COMPOSE' | 'BASE';
    readonly round: number;
    readonly status: HarnessRunStatus;
    readonly delivered: boolean;
    readonly startedAt: string;
    readonly endedAt: string;
    readonly fellBack: boolean;
    readonly keptBase: boolean;
    readonly validationIssueCount: number;
    readonly usage: HarnessUsage;
    readonly tree: HarnessTree;
}
export interface HarnessRunDetail extends HarnessRunSummary {
    readonly baseTree: HarnessTree;
    readonly adoptedTree: HarnessTree;
    readonly stages: readonly HarnessStageSummary[];
    readonly fallbacks: readonly string[];
    readonly errors: readonly string[];
}
//# sourceMappingURL=types.d.ts.map