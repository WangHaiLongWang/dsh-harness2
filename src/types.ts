export type RecursionMode = "parallel" | "sequential";
export type CandidateDimension = "INV" | "DOM";
export type HarnessTree = Readonly<Record<string, string>>;

export interface TaskContext {
  taskId: string;
  domain: string;
  prompt: string;
  sourceUris?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
}

export interface InstalledHarness {
  fingerprint: string;
  stagingDir?: string;
  opaque?: unknown;
}

export interface RunUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  cost: number;
  toolCalls: number;
  toolErrors: number;
}

export interface RunArtifact {
  runId: string;
  taskId: string;
  stage: string;
  harnessFingerprint: string;
  environmentFingerprint: string;
  startedAt: string;
  endedAt: string;
  status: "completed" | "failed" | "cancelled";
  delivered: boolean;
  trajectory: string;
  deliverables: Readonly<Record<string, string>>;
  usage: RunUsage;
  error?: string;
}

export interface RolloutRequest {
  runId: string;
  stage: string;
  task: TaskContext;
  timeoutMs: number;
  internal: true;
  signal?: AbortSignal;
}

export interface HarnessValidationIssue {
  path?: string;
  code: string;
  message: string;
}

export interface HarnessValidationResult {
  ok: boolean;
  issues: readonly HarnessValidationIssue[];
}

export interface DshHarnessSubstrate {
  readonly name: string;
  baseHarness(task: TaskContext): Promise<HarnessTree>;
  materialize(tree: HarnessTree, task: TaskContext): Promise<InstalledHarness>;
  execute(request: RolloutRequest, harness: InstalledHarness): Promise<RunArtifact>;
  validate(tree: HarnessTree, task: TaskContext): Promise<HarnessValidationResult>;
  environmentFingerprint(): Promise<string>;
}

export interface ProposalRequest {
  label: string;
  dimension: CandidateDimension;
  round: number;
  task: TaskContext;
  current: HarnessTree;
  references: readonly RunArtifact[];
  history: readonly StageEvidence[];
  library: readonly ExperienceEntry[];
  validationFeedback?: readonly HarnessValidationIssue[];
}

export interface CompositionRequest {
  label: string;
  round: number;
  task: TaskContext;
  current: HarnessTree;
  references: readonly RunArtifact[];
  candidates: readonly StageEvidence[];
  history: readonly StageEvidence[];
  library: readonly ExperienceEntry[];
  validationFeedback?: readonly HarnessValidationIssue[];
}

export interface SelectionCandidate {
  anonymousId: string;
  deliverables: Readonly<Record<string, string>>;
}

export interface ReflectionRequest {
  task: TaskContext;
  base: HarnessTree;
  adopted: HarnessTree;
  chosen: RunArtifact;
  evidence: readonly StageEvidence[];
}

export interface Reflection {
  cue: string;
  lesson: string;
  evidence: string;
  confidence: "high" | "medium" | "low";
}

export interface HarnessEditor {
  propose(request: ProposalRequest): Promise<HarnessTree>;
  compose(request: CompositionRequest): Promise<HarnessTree>;
  select(task: TaskContext, candidates: readonly SelectionCandidate[]): Promise<string>;
  reflect(request: ReflectionRequest): Promise<Reflection | null>;
}

export interface UsageAwareHarnessEditor extends HarnessEditor {
  setUsageSink(sink: (usage: RunUsage) => void): void;
}

export interface StageEvidence {
  label: string;
  dimension: CandidateDimension | "COMPOSE" | "BASE";
  round: number;
  tree: HarnessTree;
  run: RunArtifact;
  fellBack: boolean;
  keptBase: boolean;
  validationIssues: readonly HarnessValidationIssue[];
}

export interface ExperienceEntry {
  id: string;
  tenant: string;
  project: string;
  domain: string;
  taskId: string;
  createdAt: string;
  harnessFingerprint: string;
  harness: HarnessTree;
  reflection: Reflection;
}

export interface ExperienceStore {
  list(scope: ExperienceScope): Promise<readonly ExperienceEntry[]>;
  append(scope: ExperienceScope, entry: ExperienceEntry): Promise<void>;
}

export interface ExperienceScope {
  tenant: string;
  project: string;
  domain: string;
}

export interface RunStore {
  saveRun(run: RunArtifact): Promise<void>;
  saveSummary(summary: Harness2Result): Promise<void>;
}

export interface Harness2Policy {
  mode: RecursionMode;
  k: number;
  timeoutMs: number;
  maxParallelProposals: number;
  maxParallelRollouts: number;
  maxTotalTokens: number;
  maxCost: number;
  libraryMode: "off" | "read-only" | "read-write";
  scope: ExperienceScope;
}

export interface Harness2Result {
  runId: string;
  taskId: string;
  mode: RecursionMode;
  k: number;
  status: "completed" | "failed" | "cancelled";
  chosenLabel: string;
  chosenRun?: RunArtifact;
  adoptedHarness?: HarnessTree;
  baseRuns: readonly RunArtifact[];
  stages: readonly StageEvidence[];
  fallbacks: readonly string[];
  experienceWritten: boolean;
  totalUsage: RunUsage;
  errors: readonly string[];
}
