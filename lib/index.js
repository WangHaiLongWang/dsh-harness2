import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { BlockAssembler, createUserMessage } from "@deepseek-ai/dsh-llm";
import { SessionId } from "@deepseek-ai/dsh-session";
//#region dist/src/core/budget.js
var BudgetExceededError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "BudgetExceededError";
	}
};
var BudgetTracker = class {
	#maxTokens;
	#maxCost;
	#usage = emptyUsage();
	constructor(maxTokens, maxCost) {
		this.#maxTokens = maxTokens;
		this.#maxCost = maxCost;
	}
	add(run) {
		this.addUsage(run.usage);
	}
	addUsage(usage) {
		this.#usage = addUsage(this.#usage, usage);
		const tokens = this.#usage.inputTokens + this.#usage.outputTokens;
		if (tokens > this.#maxTokens) throw new BudgetExceededError(`token budget exceeded: ${tokens}/${this.#maxTokens}`);
		if (this.#usage.cost > this.#maxCost) throw new BudgetExceededError(`cost budget exceeded: ${this.#usage.cost}/${this.#maxCost}`);
	}
	snapshot() {
		return { ...this.#usage };
	}
};
function emptyUsage() {
	return {
		inputTokens: 0,
		outputTokens: 0,
		cachedTokens: 0,
		cost: 0,
		toolCalls: 0,
		toolErrors: 0
	};
}
function addUsage(a, b) {
	return {
		inputTokens: a.inputTokens + b.inputTokens,
		outputTokens: a.outputTokens + b.outputTokens,
		cachedTokens: a.cachedTokens + b.cachedTokens,
		cost: a.cost + b.cost,
		toolCalls: a.toolCalls + b.toolCalls,
		toolErrors: a.toolErrors + b.toolErrors
	};
}
//#endregion
//#region dist/src/core/harness-tree.js
const EXACT_FILES = new Set([
	"system.md",
	"guardrails.md",
	"memory.md",
	"tool-guidance.md"
]);
const COMPONENT_PATH = /^(skills\/[a-z0-9_-]+\/SKILL\.md|skills\/[a-z0-9_-]+\/scripts\/[a-zA-Z0-9_.-]+|subagents\/[a-z0-9_-]+\/AGENT\.md|scripts\/[a-zA-Z0-9_.-]+|plugins\/[a-z0-9_-]+\/[a-zA-Z0-9_./-]+)$/;
const SCRIPT_REF = /(?:scripts\/|skills\/([a-z0-9_-]+)\/scripts\/)([a-zA-Z0-9_.-]+)/g;
const DEFAULT_TREE_LIMITS = {
	maxFiles: 128,
	maxFileBytes: 256e3,
	maxAlwaysOnBytes: 64e3
};
function normalizeHarnessPath(input) {
	const normalized = input.replaceAll("\\", "/").normalize("NFC");
	if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) throw new Error(`absolute harness path is forbidden: ${input}`);
	const clean = path.posix.normalize(normalized);
	if (clean === ".." || clean.startsWith("../") || clean.includes("/../")) throw new Error(`parent traversal is forbidden: ${input}`);
	return clean.replace(/^\.\//, "");
}
function canonicalTree(tree) {
	const result = {};
	for (const raw of Object.keys(tree).sort()) {
		const key = normalizeHarnessPath(raw);
		if (Object.hasOwn(result, key)) throw new Error(`duplicate normalized path: ${key}`);
		result[key] = tree[raw] ?? "";
	}
	return result;
}
function fingerprintTree(tree) {
	const canonical = canonicalTree(tree);
	const hash = createHash("sha256");
	for (const [key, value] of Object.entries(canonical)) hash.update(key).update("\0").update(value).update("\0");
	return hash.digest("hex");
}
function diffTree(before, after) {
	const left = canonicalTree(before);
	const right = canonicalTree(after);
	return {
		added: Object.keys(right).filter((key) => !Object.hasOwn(left, key)),
		removed: Object.keys(left).filter((key) => !Object.hasOwn(right, key)),
		modified: Object.keys(right).filter((key) => Object.hasOwn(left, key) && left[key] !== right[key])
	};
}
function validateHarnessTree(tree, limits = DEFAULT_TREE_LIMITS) {
	const issues = [];
	let canonical;
	try {
		canonical = canonicalTree(tree);
	} catch (error) {
		return {
			ok: false,
			issues: [{
				code: "invalid-path",
				message: String(error)
			}]
		};
	}
	const entries = Object.entries(canonical);
	if (entries.length > limits.maxFiles) issues.push({
		code: "too-many-files",
		message: `${entries.length} exceeds ${limits.maxFiles}`
	});
	const lowerPaths = /* @__PURE__ */ new Map();
	for (const [file, body] of entries) {
		const lower = file.toLowerCase();
		const prior = lowerPaths.get(lower);
		if (prior && prior !== file) issues.push({
			path: file,
			code: "case-collision",
			message: `collides with ${prior}`
		});
		lowerPaths.set(lower, file);
		if (!EXACT_FILES.has(file) && !COMPONENT_PATH.test(file)) issues.push({
			path: file,
			code: "outside-surface",
			message: "path is not editable"
		});
		if (Buffer.byteLength(body, "utf8") > limits.maxFileBytes) issues.push({
			path: file,
			code: "file-too-large",
			message: "file exceeds byte limit"
		});
		if (/\b(?:process\.env|child_process|eval\s*\(|new Function|https?:\/\/)/.test(body)) issues.push({
			path: file,
			code: "unsafe-content",
			message: "forbidden capability reference"
		});
	}
	const alwaysOn = [
		"system.md",
		"guardrails.md",
		"memory.md",
		"tool-guidance.md"
	].map((key) => canonical[key] ?? "").join("\n");
	if (Buffer.byteLength(alwaysOn, "utf8") > limits.maxAlwaysOnBytes) issues.push({
		code: "always-on-too-large",
		message: "always-on context exceeds byte limit"
	});
	for (const [file] of entries.filter(([name]) => /^skills\/[^/]+\/SKILL\.md$/.test(name))) {
		const name = file.split("/")[1];
		if (name && !alwaysOn.includes(name)) issues.push({
			path: file,
			code: "skill-without-trigger",
			message: `always-on text must contain skill name ${name}`
		});
	}
	for (const [file, body] of entries.filter(([name]) => name.endsWith(".md"))) for (const match of body.matchAll(SCRIPT_REF)) {
		const skill = match[1];
		const script = match[2];
		if (!script) continue;
		const expected = skill ? `skills/${skill}/scripts/${script}` : `scripts/${script}`;
		if (!Object.hasOwn(canonical, expected)) issues.push({
			path: file,
			code: "missing-script",
			message: `references missing ${expected}`
		});
	}
	return {
		ok: issues.length === 0,
		issues
	};
}
//#endregion
//#region dist/src/core/orchestrator.js
const MAX_EDIT_ATTEMPTS = 2;
function assertPolicy(policy) {
	if (!Number.isInteger(policy.k) || policy.k < 1 || policy.k > 16) throw new Error("k must be an integer in [1, 16]");
	for (const [name, value] of Object.entries({
		timeoutMs: policy.timeoutMs,
		maxParallelProposals: policy.maxParallelProposals,
		maxParallelRollouts: policy.maxParallelRollouts,
		maxTotalTokens: policy.maxTotalTokens,
		maxCost: policy.maxCost
	})) if (name !== "maxCost" && !Number.isFinite(value) || value <= 0) throw new Error(`${name} must be positive${name === "maxCost" ? " or Infinity" : ""}`);
	if (policy.scope.domain === "") throw new Error("experience scope domain is required");
}
async function mapLimit(values, limit, work) {
	const result = new Array(values.length);
	let cursor = 0;
	const worker = async () => {
		while (true) {
			const index = cursor++;
			if (index >= values.length) return;
			result[index] = await work(values[index], index);
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
	return result;
}
function anonymousId(runId, taskId) {
	return createHash("sha256").update(taskId).update("\0").update(runId).digest("hex").slice(0, 12);
}
var Harness2Orchestrator = class {
	#substrate;
	#editor;
	#experienceStore;
	#runStore;
	#now;
	#id;
	#onEvent;
	constructor(deps) {
		this.#substrate = deps.substrate;
		this.#editor = deps.editor;
		this.#experienceStore = deps.experienceStore;
		this.#runStore = deps.runStore;
		this.#now = deps.now ?? (() => /* @__PURE__ */ new Date());
		this.#id = deps.id ?? randomUUID;
		this.#onEvent = deps.onEvent ?? (() => {});
	}
	plan(task, policy) {
		assertPolicy(policy);
		return {
			taskId: task.taskId,
			mode: policy.mode,
			k: policy.k,
			expectedRollouts: 4 * policy.k,
			expectedEditStages: 3 * policy.k,
			selectionRequired: policy.k > 1
		};
	}
	async run(task, policy, signal) {
		assertPolicy(policy);
		const runId = `h2-${this.#id()}`;
		const planned = this.plan(task, policy);
		this.#emit({
			type: "run-planned",
			runId,
			taskId: task.taskId,
			mode: policy.mode,
			k: policy.k,
			expectedRollouts: planned.expectedRollouts,
			expectedEditStages: planned.expectedEditStages
		});
		const budget = new BudgetTracker(policy.maxTotalTokens, policy.maxCost);
		this.#editor.setUsageSink?.((usage) => budget.addUsage(usage));
		const errors = [];
		const fallbacks = [];
		const stages = [];
		const baseRuns = [];
		let chosenLabel = "";
		let chosenRun;
		let baseHarness;
		let adoptedHarness;
		let experienceWritten = false;
		try {
			if (signal?.aborted) throw new DOMException("run cancelled", "AbortError");
			const base = await this.#substrate.baseHarness(task);
			baseHarness = base;
			const initialValidation = await this.#validate(base, task);
			if (!initialValidation.ok) throw new Error(`base harness is invalid: ${initialValidation.issues.map((i) => i.message).join("; ")}`);
			const library = policy.libraryMode === "off" ? [] : await this.#experienceStore.list(policy.scope);
			const bases = await mapLimit(Array.from({ length: policy.k }, (_, index) => `base${index + 1}`), policy.maxParallelRollouts, async (label) => this.#roll(runId, label, task, base, policy, budget, signal));
			baseRuns.push(...bases);
			let finals;
			if (policy.mode === "parallel") finals = await this.#parallel(runId, task, policy, base, bases, library, stages, fallbacks, budget, signal);
			else finals = await this.#sequential(runId, task, policy, base, bases, library, stages, fallbacks, budget, signal);
			const delivered = finals.filter((item) => item.run.delivered);
			if (policy.k === 1 && delivered[0]) chosenLabel = delivered[0].label;
			else if (delivered.length > 0) {
				const candidates = delivered.map((item) => ({
					anonymousId: anonymousId(item.run.runId, task.taskId),
					deliverables: item.run.deliverables
				}));
				try {
					const selected = await this.#editor.select(task, candidates);
					const selectedIndex = candidates.findIndex((item) => item.anonymousId === selected);
					if (selectedIndex < 0) throw new Error("selector returned an unknown anonymous id");
					chosenLabel = delivered[selectedIndex]?.label ?? "";
				} catch (error) {
					errors.push(`selection: ${String(error)}`);
					fallbacks.push("selection");
					chosenLabel = "";
				}
			}
			let chosen = finals.find((item) => item.label === chosenLabel);
			if (!chosen?.run.delivered) {
				const deliveredBase = baseRuns.find((item) => item.delivered);
				if (deliveredBase) {
					chosenLabel = deliveredBase.stage;
					chosenRun = deliveredBase;
					adoptedHarness = base;
					fallbacks.push("delivered-base");
				} else {
					chosen = finals.find((item) => item.run.delivered);
					if (chosen) chosenLabel = chosen.label;
				}
			}
			if (chosen) {
				chosenRun = chosen.run;
				adoptedHarness = chosen.tree;
			}
			if (!chosenRun) throw new Error("no rollout produced a deliverable");
			this.#emit({
				type: "selection-finished",
				runId,
				taskId: task.taskId,
				chosenLabel,
				fellBack: fallbacks.includes("selection") || fallbacks.includes("delivered-base")
			});
			if (policy.libraryMode === "read-write" && adoptedHarness) {
				const reflection = await this.#editor.reflect({
					task,
					base,
					adopted: adoptedHarness,
					chosen: chosenRun,
					evidence: stages
				});
				if (reflection) {
					const entry = {
						id: `${task.taskId}-${fingerprintTree(adoptedHarness).slice(0, 12)}`,
						...policy.scope,
						taskId: task.taskId,
						createdAt: this.#now().toISOString(),
						harnessFingerprint: fingerprintTree(adoptedHarness),
						harness: adoptedHarness,
						reflection
					};
					await this.#experienceStore.append(policy.scope, entry);
					experienceWritten = true;
				}
			}
			this.#emit({
				type: "reflection-finished",
				runId,
				taskId: task.taskId,
				experienceWritten
			});
		} catch (error) {
			errors.push(String(error));
		}
		const result = {
			runId,
			taskId: task.taskId,
			mode: policy.mode,
			k: policy.k,
			status: signal?.aborted ? "cancelled" : chosenRun ? "completed" : "failed",
			chosenLabel,
			...chosenRun ? { chosenRun } : {},
			...baseHarness ? { baseHarness } : {},
			...adoptedHarness ? { adoptedHarness } : {},
			baseRuns,
			stages,
			fallbacks,
			experienceWritten,
			totalUsage: budget.snapshot(),
			errors
		};
		await this.#runStore.saveSummary(result);
		this.#emit({
			type: "run-finished",
			runId,
			taskId: task.taskId,
			status: result.status,
			chosenLabel,
			errors: errors.length,
			usage: result.totalUsage
		});
		return result;
	}
	async #parallel(runId, task, policy, base, bases, library, stages, fallbacks, budget, signal) {
		const candidates = await mapLimit(Array.from({ length: policy.k }, (_, i) => i + 1).flatMap((round) => [{
			label: `inv${round}`,
			dimension: "INV",
			round
		}, {
			label: `dom${round}`,
			dimension: "DOM",
			round
		}]), policy.maxParallelProposals, async (spec) => {
			const stage = await this.#proposeAndRoll(runId, spec.label, spec.dimension, spec.round, task, base, bases, [], library, policy, budget, signal);
			if (stage.fellBack) fallbacks.push(stage.label);
			return stage;
		});
		stages.push(...candidates);
		for (const stage of candidates) this.#stageEvent(runId, task.taskId, stage);
		const finals = await mapLimit(Array.from({ length: policy.k }, (_, i) => i + 1), policy.maxParallelProposals, async (round) => {
			const label = `final${round}`;
			const stage = await this.#composeAndRoll(runId, label, round, task, base, bases, candidates, [], library, policy, budget, signal);
			if (stage.fellBack) fallbacks.push(stage.label);
			return stage;
		});
		stages.push(...finals);
		for (const stage of finals) this.#stageEvent(runId, task.taskId, stage);
		return finals;
	}
	async #sequential(runId, task, policy, base, bases, library, stages, fallbacks, budget, signal) {
		let current = base;
		const finals = [];
		for (let round = 1; round <= policy.k; round += 1) {
			const candidates = await mapLimit([[`inv${round}`, "INV"], [`dom${round}`, "DOM"]], Math.min(2, policy.maxParallelProposals), async ([label, dimension]) => {
				const stage = await this.#proposeAndRoll(runId, label, dimension, round, task, current, bases, stages, library, policy, budget, signal);
				if (stage.fellBack) fallbacks.push(stage.label);
				return stage;
			});
			stages.push(...candidates);
			for (const stage of candidates) this.#stageEvent(runId, task.taskId, stage);
			const final = await this.#composeAndRoll(runId, `final${round}`, round, task, current, bases, candidates, stages, library, policy, budget, signal);
			if (final.fellBack) fallbacks.push(final.label);
			stages.push(final);
			this.#stageEvent(runId, task.taskId, final);
			finals.push(final);
			current = final.tree;
		}
		return finals;
	}
	async #proposeAndRoll(runId, label, dimension, round, task, current, references, history, library, policy, budget, signal) {
		let feedback;
		for (let attempt = 1; attempt <= MAX_EDIT_ATTEMPTS; attempt += 1) {
			const request = {
				label,
				dimension,
				round,
				task,
				current,
				references,
				history,
				library,
				...feedback ? { validationFeedback: feedback } : {}
			};
			try {
				const tree = await this.#editor.propose(request);
				const validation = await this.#validate(tree, task);
				if (!validation.ok) {
					feedback = validation.issues;
					continue;
				}
				const run = await this.#roll(runId, label, task, tree, policy, budget, signal);
				return this.#evidence(label, dimension, round, current, tree, run, false, validation.issues);
			} catch (error) {
				if (error instanceof BudgetExceededError || signal?.aborted) throw error;
				feedback = [{
					code: "editor-error",
					message: String(error)
				}];
			}
		}
		const run = await this.#roll(runId, label, task, current, policy, budget, signal);
		return this.#evidence(label, dimension, round, current, current, run, true, feedback ?? []);
	}
	async #composeAndRoll(runId, label, round, task, current, references, candidates, history, library, policy, budget, signal) {
		let feedback;
		for (let attempt = 1; attempt <= MAX_EDIT_ATTEMPTS; attempt += 1) {
			const request = {
				label,
				round,
				task,
				current,
				references,
				candidates,
				history,
				library,
				...feedback ? { validationFeedback: feedback } : {}
			};
			try {
				const tree = await this.#editor.compose(request);
				const validation = await this.#validate(tree, task);
				if (!validation.ok) {
					feedback = validation.issues;
					continue;
				}
				const run = await this.#roll(runId, label, task, tree, policy, budget, signal);
				return this.#evidence(label, "COMPOSE", round, current, tree, run, false, validation.issues);
			} catch (error) {
				if (error instanceof BudgetExceededError || signal?.aborted) throw error;
				feedback = [{
					code: "editor-error",
					message: String(error)
				}];
			}
		}
		const run = await this.#roll(runId, label, task, current, policy, budget, signal);
		return this.#evidence(label, "COMPOSE", round, current, current, run, true, feedback ?? []);
	}
	#evidence(label, dimension, round, current, tree, run, fellBack, validationIssues) {
		const diff = diffTree(current, tree);
		return {
			label,
			dimension,
			round,
			tree,
			run,
			fellBack,
			keptBase: diff.added.length + diff.removed.length + diff.modified.length === 0,
			validationIssues
		};
	}
	async #validate(tree, task) {
		const local = validateHarnessTree(tree);
		if (!local.ok) return local;
		return this.#substrate.validate(tree, task);
	}
	async #roll(parentRunId, stage, task, tree, policy, budget, signal) {
		if (signal?.aborted) throw new DOMException("run cancelled", "AbortError");
		const installed = await this.#substrate.materialize(tree, task);
		const expectedFingerprint = fingerprintTree(tree);
		if (installed.fingerprint !== expectedFingerprint) throw new Error(`materialized harness fingerprint mismatch at ${stage}`);
		const stageRunId = `${parentRunId}-${stage}`;
		this.#emit({
			type: "rollout-started",
			runId: parentRunId,
			taskId: task.taskId,
			stage
		});
		let run;
		try {
			run = await this.#substrate.execute({
				runId: stageRunId,
				stage,
				task,
				timeoutMs: policy.timeoutMs,
				internal: true,
				...signal ? { signal } : {}
			}, installed);
		} catch (error) {
			if (signal?.aborted) throw error;
			const now = this.#now().toISOString();
			run = {
				runId: stageRunId,
				taskId: task.taskId,
				stage,
				harnessFingerprint: installed.fingerprint,
				environmentFingerprint: await this.#substrate.environmentFingerprint(),
				startedAt: now,
				endedAt: now,
				status: "failed",
				delivered: false,
				trajectory: `[ERROR] ${String(error)}`,
				deliverables: {},
				usage: emptyUsage(),
				error: String(error)
			};
		}
		if (run.taskId !== task.taskId || run.stage !== stage) throw new Error(`substrate returned mismatched run identity at ${stage}`);
		await this.#runStore.saveRun(run);
		budget.add(run);
		this.#emit({
			type: "rollout-finished",
			runId: parentRunId,
			taskId: task.taskId,
			stage,
			status: run.status,
			delivered: run.delivered,
			usage: run.usage
		});
		return run;
	}
	#stageEvent(runId, taskId, stage) {
		this.#emit({
			type: "stage-finished",
			runId,
			taskId,
			stage: stage.label,
			dimension: stage.dimension,
			fellBack: stage.fellBack,
			keptBase: stage.keptBase
		});
	}
	#emit(event) {
		try {
			this.#onEvent(event);
		} catch {}
	}
};
//#endregion
//#region dist/src/storage/file-store.js
function safeSegment(value) {
	const normalized = value.normalize("NFC");
	if (!/^[a-zA-Z0-9_.-]+$/.test(normalized) || normalized === "." || normalized === "..") throw new Error(`unsafe storage segment: ${value}`);
	return normalized;
}
async function readJson(file, fallback) {
	try {
		return JSON.parse(await readFile(file, "utf8"));
	} catch (error) {
		if (error.code === "ENOENT") return fallback;
		throw error;
	}
}
async function atomicJson(file, value) {
	await mkdir(path.dirname(file), { recursive: true });
	const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
	await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, {
		encoding: "utf8",
		flag: "wx"
	});
	await rename(temp, file);
}
const writeQueues = /* @__PURE__ */ new Map();
async function serialized(file, operation) {
	const current = (writeQueues.get(file) ?? Promise.resolve()).catch(() => {}).then(operation);
	writeQueues.set(file, current);
	try {
		await current;
	} finally {
		if (writeQueues.get(file) === current) writeQueues.delete(file);
	}
}
var FileExperienceStore = class {
	root;
	constructor(root) {
		this.root = root;
	}
	#file(scope) {
		return path.join(this.root, safeSegment(scope.tenant), safeSegment(scope.project), safeSegment(scope.domain), "entries.json");
	}
	async list(scope) {
		return readJson(this.#file(scope), []);
	}
	async append(scope, entry) {
		const file = this.#file(scope);
		await serialized(file, async () => {
			const entries = await readJson(file, []);
			if (entries.some((item) => item.id === entry.id)) return;
			await atomicJson(file, [...entries, entry]);
		});
	}
};
var FileRunStore = class {
	root;
	constructor(root) {
		this.root = root;
	}
	async saveRun(run) {
		await atomicJson(path.join(this.root, safeSegment(run.runId), "run.json"), run);
	}
	async saveSummary(summary) {
		await atomicJson(path.join(this.root, safeSegment(summary.runId), "summary.json"), summary);
	}
};
//#endregion
//#region dist/src/dsh/pricing.js
/** Convert one provider usage sample to the configured deployment currency. */
function priceUsage(usage, pricing) {
	if (!pricing) return 0;
	return (usage.inputTokens * pricing.inputPerMillion + usage.outputTokens * pricing.outputPerMillion + (usage.cacheReadTokens ?? 0) * pricing.cacheReadPerMillion + (usage.cacheWriteTokens ?? 0) * pricing.cacheWritePerMillion) / 1e6;
}
/** Project DSH's disjoint cache counters into the shared orchestration usage record. */
function runUsageOf(usage, pricing) {
	return {
		inputTokens: usage.inputTokens,
		outputTokens: usage.outputTokens,
		cachedTokens: (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0),
		cost: priceUsage(usage, pricing),
		toolCalls: 0,
		toolErrors: 0
	};
}
//#endregion
//#region dist/src/dsh/components.js
const SKILL_FILE = /^skills\/([a-z0-9_-]+)\/SKILL\.md$/;
const SUBAGENT_FILE = /^subagents\/([a-z0-9_-]+)\/AGENT\.md$/;
function summary(body, fallback) {
	return (body.split(/\r?\n/).map((value) => value.replace(/^#+\s*/, "").trim()).find((value) => value !== "") ?? fallback).slice(0, 240);
}
function subagentToolName(name) {
	return `harness2_agent_${name.replaceAll("-", "_")}`;
}
function validateNativeComponents(ctx, tree) {
	const issues = [];
	const toolNames = /* @__PURE__ */ new Map();
	for (const file of Object.keys(tree)) {
		if ([
			"system.md",
			"guardrails.md",
			"memory.md",
			"tool-guidance.md"
		].includes(file)) continue;
		if (file.startsWith("scripts/")) continue;
		if (SKILL_FILE.exec(file)) {
			if (ctx.get("skills") === void 0) issues.push({
				path: file,
				code: "dsh-skill-unavailable",
				message: "ctx.skills is not composed"
			});
			continue;
		}
		const subagent = SUBAGENT_FILE.exec(file);
		if (subagent) {
			if (!ctx.get("subagents")?.getProvider("spawn")) issues.push({
				path: file,
				code: "dsh-subagent-unavailable",
				message: "spawn subagent provider is not composed"
			});
			const name = subagent[1];
			const tool = subagentToolName(name);
			if (toolNames.has(tool)) issues.push({
				path: file,
				code: "subagent-tool-collision",
				message: `tool name collides with ${toolNames.get(tool)}`
			});
			else toolNames.set(tool, file);
			continue;
		}
		issues.push({
			path: file,
			code: "unsupported-dsh-component",
			message: "DSH native implementation supports C1-C6; script and middleware assets remain disabled"
		});
	}
	return issues;
}
function installNativeComponents(rootCtx, agentCtx, tree) {
	for (const [file, body] of Object.entries(tree)) {
		const skill = SKILL_FILE.exec(file);
		if (skill) {
			const name = skill[1];
			const skills = agentCtx.get("skills");
			if (!skills) throw new Error("Harness² skill materialization requires ctx.skills");
			skills.register({
				name,
				description: summary(body, `Harness² skill ${name}`),
				content: body,
				source: "runtime",
				invocation: {
					modelInvocable: true,
					userInvocable: false
				}
			});
			continue;
		}
		const subagent = SUBAGENT_FILE.exec(file);
		if (!subagent) continue;
		const name = subagent[1];
		const runtime = rootCtx.get("subagents");
		if (!runtime) throw new Error("Harness² subagent materialization requires ctx.subagents");
		agentCtx.tools.register(defineTool({
			name: subagentToolName(name),
			description: `Delegate to the Harness² ${name} specialist. ${summary(body, "")}`.trim(),
			parameters: { task: {
				type: "string",
				required: true,
				description: "Complete task for this specialist."
			} },
			output: {
				schema: {
					type: "object",
					additionalProperties: false,
					properties: { subagentId: {
						type: "string",
						required: true
					} }
				},
				render: (_args, value) => [{
					type: "text",
					text: `started subagent ${value.subagentId}`
				}]
			},
			isConcurrencySafe: () => true,
			async execute(args, exec) {
				const parent = exec.agent;
				if (!parent) throw new Error(`${subagentToolName(name)} requires an owning Agent`);
				const started = await runtime.startActivation({
					provider: "spawn",
					label: `Harness² ${name}`,
					request: {
						parent,
						prompt: [{
							type: "text",
							text: `${body}\n\n# Assigned task\n\n${args.task}`
						}],
						maxDepth: 2
					},
					signal: exec.signal,
					delivery: "parent"
				});
				return { subagentId: String(started.childId) };
			},
			presentCall: (args) => ({
				card: "generic",
				title: `Delegate to ${name}`,
				kind: "execute",
				rawInput: args.task
			})
		}));
	}
}
//#endregion
//#region dist/src/dsh/script-assets.js
const SCRIPT_FILE = /^scripts\/([a-zA-Z0-9_.-]+\.py)$/;
const MAX_SCRIPT_BYTES = 128e3;
function toolName(file) {
	return `harness2_script_${file.slice(0, -3).replaceAll(/[^a-zA-Z0-9_]/g, "_")}`;
}
function quoteShellArgument(value) {
	return process.platform === "win32" ? `'${value.replaceAll("'", "''")}'` : `'${value.replaceAll("'", `'"'"'`)}'`;
}
function under(root, target) {
	const relative = path.relative(root, target);
	return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}
function validateScriptComponents(tree, policy) {
	const issues = [];
	const tools = /* @__PURE__ */ new Map();
	for (const [file, body] of Object.entries(tree)) {
		if (!file.startsWith("scripts/")) continue;
		const match = SCRIPT_FILE.exec(file);
		if (!policy.enabled) {
			issues.push({
				path: file,
				code: "dsh-scripts-disabled",
				message: "C7 scripts are disabled by deployment policy"
			});
			continue;
		}
		if (!match) {
			issues.push({
				path: file,
				code: "unsupported-script",
				message: "only scripts/<name>.py is supported"
			});
			continue;
		}
		if (Buffer.byteLength(body, "utf8") > MAX_SCRIPT_BYTES) issues.push({
			path: file,
			code: "script-too-large",
			message: `script exceeds ${MAX_SCRIPT_BYTES} bytes`
		});
		if (body.includes("\0")) issues.push({
			path: file,
			code: "invalid-script",
			message: "script contains a NUL byte"
		});
		const name = toolName(match[1]);
		const prior = tools.get(name);
		if (prior) issues.push({
			path: file,
			code: "script-tool-collision",
			message: `tool name collides with ${prior}`
		});
		else tools.set(name, file);
	}
	return issues;
}
async function stageScripts(rootCtx, tree, policy, runId) {
	const scripts = Object.entries(tree).flatMap(([file, body]) => {
		const match = SCRIPT_FILE.exec(file);
		return match ? [{
			file: match[1],
			body
		}] : [];
	});
	if (scripts.length === 0) return {
		install() {},
		dispose: () => Promise.resolve()
	};
	if (!policy.enabled) throw new Error("Harness² scripts are disabled");
	const root = path.resolve(policy.assetRoot);
	const safeRun = runId.replaceAll(/[^a-zA-Z0-9_.-]/g, "_");
	const directory = path.resolve(root, safeRun);
	if (!under(root, directory)) throw new Error("invalid Harness² script staging directory");
	await mkdir(directory, { recursive: true });
	for (const script of scripts) await writeFile(path.join(directory, script.file), script.body, {
		encoding: "utf8",
		flag: "wx"
	});
	let disposed = false;
	return {
		install(agentCtx) {
			const shell = rootCtx.get("shell");
			if (!shell) throw new Error("Harness² script materialization requires ctx.shell");
			for (const script of scripts) {
				const scriptPath = path.join(directory, script.file);
				agentCtx.tools.register(defineTool({
					name: toolName(script.file),
					description: `Run the fixed Harness² Python helper ${script.file}. Input is provided on stdin; the command and path cannot be changed.`,
					parameters: { input: {
						type: "string",
						description: "Optional UTF-8 stdin for the helper."
					} },
					output: {
						schema: {
							type: "object",
							additionalProperties: false,
							properties: {
								exitCode: {
									required: true,
									oneOf: [{ type: "integer" }, { type: "null" }]
								},
								stdout: {
									type: "string",
									required: true
								},
								stderr: {
									type: "string",
									required: true
								},
								timedOut: {
									type: "boolean",
									required: true
								}
							}
						},
						render: (_args, value) => [{
							type: "text",
							text: `${value.stdout}${value.stderr === "" ? "" : `\n[stderr]\n${value.stderr}`}`
						}]
					},
					async execute(args, exec) {
						const sandboxService = rootCtx.get("sandboxPolicy");
						if (!sandboxService) throw new Error("Harness² refuses unconfined script execution without ctx.sandboxPolicy");
						const sandboxPolicy = sandboxService.resolve(exec.agent ? { session: exec.agent.session } : {});
						const spec = shell.resolve({
							command: `python ${quoteShellArgument(scriptPath)}`,
							workdir: exec.agent?.session.header.cwd ?? directory,
							timeoutMs: policy.timeoutMs,
							stdoutMaxBytes: policy.outputMaxBytes,
							stdin: args.input ?? "",
							signal: exec.signal,
							sandboxPolicy
						});
						const result = await (await shell.execute(spec)).result();
						return {
							exitCode: result.exitCode,
							stdout: result.stdout.text,
							stderr: result.stderr.text,
							timedOut: result.timedOut
						};
					},
					presentCall: () => ({
						card: "generic",
						title: `Run ${script.file}`,
						kind: "execute",
						rawInput: script.file
					})
				}));
			}
		},
		async dispose() {
			if (disposed) return;
			disposed = true;
			if (!under(root, directory)) throw new Error("refusing to remove script directory outside asset root");
			await rm(directory, {
				recursive: true,
				force: true
			});
		}
	};
}
//#endregion
//#region dist/src/dsh/agent-runner.js
const OVERLAY_SECTION = "harness2:overlay";
function overlayText(tree) {
	return [
		["System", tree["system.md"]],
		["Guardrails", tree["guardrails.md"]],
		["Memory", tree["memory.md"]],
		["Tool guidance", tree["tool-guidance.md"]]
	].filter((entry) => typeof entry[1] === "string" && entry[1].trim() !== "").map(([title, body]) => `# Harness² ${title}\n\n${body}`).join("\n\n");
}
function finalText(events) {
	let text = "";
	for (const event of events) {
		if (event.type !== "assistant/message") continue;
		const candidate = event.data.message.content.filter((block) => block.type === "text").map((block) => block.text).join("");
		if (candidate !== "") text = candidate;
	}
	return text;
}
function usageOf(events, pricing) {
	const usage = {
		inputTokens: 0,
		outputTokens: 0,
		cachedTokens: 0,
		cost: 0,
		toolCalls: 0,
		toolErrors: 0
	};
	for (const event of events) if (event.type === "assistant/message" && event.data.usage) {
		usage.inputTokens += event.data.usage.inputTokens;
		usage.outputTokens += event.data.usage.outputTokens;
		usage.cachedTokens += (event.data.usage.cacheReadTokens ?? 0) + (event.data.usage.cacheWriteTokens ?? 0);
		usage.cost += priceUsage(event.data.usage, pricing);
	} else if (event.type === "tool/call") usage.toolCalls += 1;
	else if (event.type === "tool/result" && event.data.message.isError === true) usage.toolErrors += 1;
	return usage;
}
function trajectoryOf(events) {
	return events.map((event) => {
		if (event.type === "assistant/message") return `[ASSISTANT] ${event.data.message.content.filter((block) => block.type === "text").map((block) => block.text).join("")}`;
		if (event.type === "tool/call") return `[ACTION] ${event.data.name} ${event.data.arguments}`;
		if (event.type === "tool/result") {
			const text = event.data.message.content.filter((block) => block.type === "text").map((block) => block.text).join("");
			return event.data.message.isError === true ? `[ERROR] ${text}` : `[OBSERVATION] ${text}`;
		}
		if (event.type === "turn/end") return `[TURN_END] ${event.data.reason.kind}`;
		return "";
	}).filter(Boolean).join("\n");
}
/** Executes one isolated Harness² probe through the production DSH Agent registry. */
var DshAgentRunner = class {
	ctx;
	pricing;
	scripts;
	constructor(ctx, pricing, scripts = {
		enabled: false,
		assetRoot: "",
		timeoutMs: 3e4,
		outputMaxBytes: 1e6
	}) {
		this.ctx = ctx;
		this.pricing = pricing;
		this.scripts = scripts;
	}
	validate(tree) {
		const issues = [...validateNativeComponents(this.ctx, tree), ...validateScriptComponents(tree, this.scripts)];
		if (this.scripts.enabled && Object.keys(tree).some((file) => file.startsWith("scripts/"))) {
			if (!this.ctx.get("shell")) issues.push({
				code: "dsh-shell-unavailable",
				message: "C7 requires ctx.shell"
			});
			if (!this.ctx.get("sandboxPolicy")) issues.push({
				code: "dsh-sandbox-policy-unavailable",
				message: "C7 refuses unconfined execution without ctx.sandboxPolicy"
			});
		}
		return issues;
	}
	async run(request) {
		const startedAt = (/* @__PURE__ */ new Date()).toISOString();
		const timeout = AbortSignal.timeout(request.timeoutMs);
		const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
		const parent = request.parent;
		const agentOptions = { ...parent.options };
		const sessionId = SessionId(`harness2-${randomUUID()}`);
		const cwd = parent.session.header.cwd;
		const overlay = overlayText(request.tree);
		const stagedScripts = await stageScripts(this.ctx, request.tree, this.scripts, request.runId);
		let handle;
		try {
			handle = await this.ctx.agents.create({
				sessionId,
				parentAgent: parent,
				agentOptions,
				signal,
				meta: {
					...cwd === void 0 ? {} : { cwd },
					parentSession: parent.id,
					origin: "subagent",
					delegationDepth: (parent.session.header.delegationDepth ?? 0) + 1
				},
				setup: async (agentCtx) => {
					this.ctx.get("agentPresets")?.composeFrom(agentCtx, parent.ctx);
					if (overlay !== "") agentCtx.systemPrompt.section({
						name: OVERLAY_SECTION,
						order: 10150,
						text: overlay,
						interpolate: false
					});
					installNativeComponents(this.ctx, agentCtx, request.tree);
					stagedScripts.install(agentCtx);
					agentCtx.tools.restrict({ deny: [
						"harness2_run",
						"harness2_plan",
						"harness2_status",
						"harness2_cancel"
					] });
				}
			});
		} catch (error) {
			await stagedScripts.dispose();
			throw error;
		}
		const cancel = () => {
			handle.agent.cancel({
				kind: "hook",
				reason: "Harness² rollout deadline or owner cancellation"
			});
		};
		signal.addEventListener("abort", cancel, { once: true });
		try {
			if (signal.aborted) cancel();
			const firstSeq = handle.agent.session.seq;
			handle.agent.followup(createUserMessage({
				content: [{
					type: "text",
					text: request.task.prompt
				}],
				source: { kind: "user" }
			}));
			while (true) {
				await handle.agent.whenIdle();
				const idleSeq = handle.agent.session.seq;
				if (!await this.ctx.get("subagents")?.waitForChildren(handle.agent) && handle.agent.status === "idle" && handle.agent.session.seq === idleSeq) break;
			}
			const events = handle.agent.session.snapshotEvents(firstSeq);
			const text = finalText(events);
			const ended = [...events].reverse().find((event) => event.type === "turn/end");
			const failed = ended?.type === "turn/end" && ended.data.reason.kind !== "completed";
			return {
				runId: request.runId,
				taskId: request.task.taskId,
				stage: request.stage,
				harnessFingerprint: fingerprintTree(request.tree),
				environmentFingerprint: "dsh-0.2.1-alpha.4",
				startedAt,
				endedAt: (/* @__PURE__ */ new Date()).toISOString(),
				status: failed ? "failed" : "completed",
				delivered: !failed && text.trim() !== "",
				trajectory: trajectoryOf(events),
				deliverables: text.trim() === "" ? {} : { "response.md": text },
				usage: usageOf(events, this.pricing),
				...failed ? { error: `turn ended with ${ended.data.reason.kind}` } : {}
			};
		} finally {
			signal.removeEventListener("abort", cancel);
			const failures = (await Promise.allSettled([handle.dispose(), stagedScripts.dispose()])).flatMap((result) => result.status === "rejected" ? [result.reason] : []);
			if (failures.length > 0) throw new AggregateError(failures, "Harness² rollout cleanup failed");
		}
	}
};
//#endregion
//#region dist/src/dsh/model-editor.js
function editorSystem(enableScripts) {
	return `You edit an agent harness from execution evidence. Return exactly one JSON object mapping complete UTF-8 file contents. Preserve every unchanged file. Supported paths are system.md, guardrails.md, memory.md, tool-guidance.md, skills/<name>/SKILL.md, and subagents/<name>/AGENT.md.${enableScripts ? " You may also create standalone scripts/<name>.py helpers; they receive optional stdin and must write their result to stdout." : " Do not create scripts in this deployment."} Skill and subagent names use lowercase letters, digits, hyphen, or underscore. Do not create middleware plugins. Never include prose or Markdown fences.`;
}
function json$1(value) {
	return JSON.stringify(value, null, 2);
}
function parseObject(text) {
	const value = JSON.parse(text);
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("editor output must be one JSON object");
	const result = {};
	for (const [key, entry] of Object.entries(value)) {
		if (typeof entry !== "string") throw new Error(`editor value for ${key} must be a string`);
		result[key] = entry;
	}
	return result;
}
function evidence(request) {
	return {
		task: request.task,
		currentHarness: request.current,
		references: request.references.map((run) => ({
			stage: run.stage,
			delivered: run.delivered,
			trajectory: run.trajectory,
			deliverables: run.deliverables
		})),
		history: request.history.map((stage) => ({
			label: stage.label,
			dimension: stage.dimension,
			trajectory: stage.run.trajectory,
			deliverables: stage.run.deliverables
		})),
		library: request.library.map((entry) => ({
			cue: entry.reflection.cue,
			lesson: entry.reflection.lesson,
			evidence: entry.reflection.evidence,
			harness: entry.harness
		})),
		validationFeedback: request.validationFeedback ?? []
	};
}
/** Uses the same DSH route as the parent Agent for editor, selector, and reflection calls. */
var DshModelEditor = class {
	ctx;
	parent;
	signal;
	timeoutMs;
	pricing;
	enableScripts;
	#usageSink;
	constructor(ctx, parent, signal, timeoutMs = 36e5, pricing, enableScripts = false) {
		this.ctx = ctx;
		this.parent = parent;
		this.signal = signal;
		this.timeoutMs = timeoutMs;
		this.pricing = pricing;
		this.enableScripts = enableScripts;
	}
	setUsageSink(sink) {
		this.#usageSink = sink;
	}
	async #complete(system, prompt) {
		const options = {
			provider: this.parent.options.provider ?? "",
			model: this.parent.options.model ?? "",
			system,
			messages: [{
				role: "user",
				content: [{
					type: "text",
					text: prompt
				}]
			}],
			temperature: 0,
			signal: this.signal ? AbortSignal.any([this.signal, AbortSignal.timeout(this.timeoutMs)]) : AbortSignal.timeout(this.timeoutMs)
		};
		if (options.provider === "" || options.model === "") throw new Error("Harness² requires a resolved parent provider and model");
		const assembler = new BlockAssembler();
		for await (const chunk of this.ctx.llm.stream(options)) assembler.push(chunk);
		const usage = assembler.usage;
		if (usage) this.#usageSink?.(runUsageOf(usage, this.pricing));
		const last = assembler.blocks().at(-1);
		if (last?.type !== "text") throw new Error("editor returned no final text block");
		return last.text.trim();
	}
	async propose(request) {
		const focus = request.dimension === "INV" ? "Improve reusable execution behavior: planning, tools, context, verification, or delegation." : "Improve domain procedure, constraints, and artifact requirements without embedding task-specific facts.";
		return parseObject(await this.#complete(editorSystem(this.enableScripts), `${focus}\nUse concrete behavioral evidence. KEEP_BASE is represented by returning currentHarness unchanged.\n\n${json$1(evidence(request))}`));
	}
	async compose(request) {
		return parseObject(await this.#complete(editorSystem(this.enableScripts), `Compose one successor harness. Merge only changes supported by trajectory evidence; preserve the current harness when evidence is weak. Candidate evidence:\n${json$1({
			...evidence(request),
			candidates: request.candidates
		})}`));
	}
	async select(task, candidates) {
		const text = await this.#complete("Choose exactly one existing anonymous deliverable. Judge delivery, conformance, fidelity, internal consistency, operational fitness, and finish. Return only JSON: {\"choice\":\"<anonymousId>\"}.", json$1({
			task,
			candidates
		}));
		const value = JSON.parse(text);
		if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid selector output");
		const choice = value["choice"];
		if (typeof choice !== "string") throw new Error("selector choice must be a string");
		return choice;
	}
	async reflect(request) {
		const text = await this.#complete("Attribute harness edits using execution contrasts. Return NO_ENTRY if no reusable lesson is supported; otherwise return exactly JSON with cue, lesson, evidence, and confidence (high|medium|low).", json$1(request));
		if (text === "NO_ENTRY") return null;
		const value = JSON.parse(text);
		if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid reflection output");
		const record = value;
		if (typeof record["cue"] !== "string" || typeof record["lesson"] !== "string" || typeof record["evidence"] !== "string" || ![
			"high",
			"medium",
			"low"
		].includes(String(record["confidence"]))) throw new Error("reflection output has invalid fields");
		return {
			cue: record["cue"],
			lesson: record["lesson"],
			evidence: record["evidence"],
			confidence: record["confidence"]
		};
	}
};
//#endregion
//#region dist/src/dsh/substrate.js
/** Binds generic Harness² orchestration to one live parent DSH Agent. */
var NativeDshSubstrate = class {
	parent;
	runner;
	name = "dsh-0.2.1-alpha.4";
	constructor(parent, runner) {
		this.parent = parent;
		this.runner = runner;
	}
	async baseHarness(_task) {
		return {
			"system.md": "",
			"guardrails.md": "",
			"memory.md": "",
			"tool-guidance.md": ""
		};
	}
	async materialize(tree, _task) {
		return {
			fingerprint: fingerprintTree(tree),
			opaque: tree
		};
	}
	execute(request, harness) {
		return this.runner.run({
			parent: this.parent,
			task: request.task,
			tree: harness.opaque,
			runId: request.runId,
			stage: request.stage,
			timeoutMs: request.timeoutMs,
			...request.signal ? { signal: request.signal } : {}
		});
	}
	async validate(tree, _task) {
		const issues = this.runner.validate(tree);
		return {
			ok: issues.length === 0,
			issues
		};
	}
	async environmentFingerprint() {
		return this.name;
	}
};
//#endregion
//#region dist/src/dsh/runtime.js
/** Host service that runs explicit Harness² jobs without intercepting ordinary parent turns. */
var DshHarness2Runtime = class {
	ctx;
	config;
	#active = /* @__PURE__ */ new Map();
	constructor(ctx, config) {
		this.ctx = ctx;
		this.config = config;
	}
	plan(options = {}) {
		const mode = options.mode ?? this.config.mode;
		const k = options.k ?? this.config.k;
		if (!Number.isInteger(k) || k < 1 || k > 5) throw new Error("Harness² k must be an integer in [1, 5]");
		return {
			mode,
			k,
			expectedRollouts: 4 * k,
			expectedEditStages: 3 * k,
			selectionCalls: k > 1 ? 1 : 0,
			reflectionCalls: this.config.libraryMode === "read-write" ? 1 : 0,
			maxTotalTokens: this.config.maxTotalTokens,
			maxCost: this.config.maxCost ?? null,
			pricingConfigured: this.config.pricing !== void 0,
			scriptsEnabled: this.config.enableScripts ?? false
		};
	}
	active() {
		return [...this.#active.values()].map((entry) => ({ ...entry.view }));
	}
	cancel(runId) {
		const active = this.#active.get(runId);
		if (!active) return false;
		active.controller.abort(/* @__PURE__ */ new Error("Harness² run cancelled by operator"));
		return true;
	}
	async run(parent, options) {
		const controller = new AbortController();
		const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
		const task = {
			taskId: `session-${parent.id}-${randomUUID()}`,
			domain: options.domain,
			prompt: options.task,
			metadata: { parentSessionId: parent.id }
		};
		const scope = {
			tenant: this.config.tenant,
			project: this.config.project,
			domain: options.domain
		};
		const policy = {
			mode: options.mode ?? this.config.mode,
			k: options.k ?? this.config.k,
			timeoutMs: this.config.timeoutMs,
			maxParallelProposals: this.config.maxParallelProposals,
			maxParallelRollouts: this.config.maxParallelRollouts,
			maxTotalTokens: this.config.maxTotalTokens,
			maxCost: this.config.maxCost ?? Number.POSITIVE_INFINITY,
			libraryMode: this.config.libraryMode,
			scope
		};
		const orchestrator = new Harness2Orchestrator({
			substrate: new NativeDshSubstrate(parent, new DshAgentRunner(this.ctx, this.config.pricing, {
				enabled: this.config.enableScripts ?? false,
				assetRoot: `${this.config.dataDir}/assets`,
				timeoutMs: this.config.scriptTimeoutMs ?? 3e4,
				outputMaxBytes: this.config.scriptOutputMaxBytes ?? 1e6
			})),
			editor: new DshModelEditor(this.ctx, parent, signal, this.config.timeoutMs, this.config.pricing, this.config.enableScripts ?? false),
			experienceStore: new FileExperienceStore(`${this.config.dataDir}/library`),
			runStore: new FileRunStore(`${this.config.dataDir}/runs`),
			onEvent: (event) => {
				if (event.type === "run-planned") this.#active.set(event.runId, {
					view: {
						runId: event.runId,
						taskId: event.taskId,
						mode: event.mode,
						k: event.k,
						startedAt: (/* @__PURE__ */ new Date()).toISOString()
					},
					controller
				});
				else if (event.type === "run-finished") this.#active.delete(event.runId);
				this.ctx.emit("harness2/event", event);
			}
		});
		try {
			return await orchestrator.run(task, policy, signal);
		} finally {
			for (const [runId, entry] of this.#active) if (entry.controller === controller) this.#active.delete(runId);
		}
	}
};
//#endregion
//#region dist/src/panel/read-store.js
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const MAX_SUMMARY_BYTES = 2 * 1024 * 1024;
const MAX_RUNS = 100;
const EMPTY_USAGE = {
	inputTokens: 0,
	outputTokens: 0,
	cachedTokens: 0,
	cost: 0,
	toolCalls: 0,
	toolErrors: 0
};
function object(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
}
function text(value) {
	return typeof value === "string" ? value : "";
}
function number(value) {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function boolean(value) {
	return value === true;
}
function status(value) {
	return value === "failed" || value === "cancelled" ? value : "completed";
}
function strings(value) {
	return Array.isArray(value) ? value.filter((item) => typeof item === "string").slice(0, 100) : [];
}
function usage(value) {
	const item = object(value);
	return {
		inputTokens: number(item.inputTokens),
		outputTokens: number(item.outputTokens),
		cachedTokens: number(item.cachedTokens),
		cost: number(item.cost),
		toolCalls: number(item.toolCalls),
		toolErrors: number(item.toolErrors)
	};
}
function tree(value) {
	const entries = Object.entries(object(value)).filter((entry) => typeof entry[1] === "string").filter(([name, content]) => name.length <= 160 && content.length <= 256e3).slice(0, 64);
	return Object.fromEntries(entries);
}
function dates(source) {
	const bases = Array.isArray(source.baseRuns) ? source.baseRuns.map(object) : [];
	const stages = Array.isArray(source.stages) ? source.stages.map((item) => object(object(item).run)) : [];
	const chosen = object(source.chosenRun);
	const runs = [
		...bases,
		...stages,
		chosen
	];
	return {
		startedAt: runs.map((run) => text(run.startedAt)).filter(Boolean).sort()[0] ?? "",
		endedAt: runs.map((run) => text(run.endedAt)).filter(Boolean).sort().at(-1) ?? ""
	};
}
function summaryOf(source) {
	const timing = dates(source);
	return {
		runId: text(source.runId),
		taskId: text(source.taskId),
		mode: source.mode === "sequential" ? "sequential" : "parallel",
		k: number(source.k),
		status: status(source.status),
		chosenLabel: text(source.chosenLabel),
		...timing,
		stageCount: Array.isArray(source.stages) ? source.stages.length : 0,
		fallbackCount: strings(source.fallbacks).length,
		errorCount: strings(source.errors).length,
		usage: source.totalUsage === void 0 ? EMPTY_USAGE : usage(source.totalUsage)
	};
}
function stageOf(value) {
	const stage = object(value), run = object(stage.run);
	return {
		label: text(stage.label),
		dimension: [
			"INV",
			"DOM",
			"COMPOSE",
			"BASE"
		].includes(text(stage.dimension)) ? text(stage.dimension) : "BASE",
		round: number(stage.round),
		status: status(run.status),
		delivered: boolean(run.delivered),
		startedAt: text(run.startedAt),
		endedAt: text(run.endedAt),
		fellBack: boolean(stage.fellBack),
		keptBase: boolean(stage.keptBase),
		validationIssueCount: Array.isArray(stage.validationIssues) ? stage.validationIssues.length : 0,
		usage: usage(run.usage),
		tree: tree(stage.tree)
	};
}
/** Read bounded, redacted Harness² summaries from the configured Run Store. */
var Harness2RunReader = class {
	root;
	constructor(root) {
		this.root = root;
	}
	async list() {
		let entries;
		try {
			entries = await readdir(this.root, { withFileTypes: true });
		} catch (error) {
			if (error.code === "ENOENT") return [];
			throw error;
		}
		return (await Promise.all(entries.filter((entry) => entry.isDirectory() && RUN_ID.test(entry.name)).map(async (entry) => {
			try {
				return summaryOf(await this.read(entry.name));
			} catch {
				return null;
			}
		}))).filter((item) => item !== null && item.runId !== "").sort((left, right) => right.endedAt.localeCompare(left.endedAt)).slice(0, MAX_RUNS);
	}
	async detail(runId) {
		if (!RUN_ID.test(runId)) throw new Error("Invalid Harness² run id");
		let source;
		try {
			source = await this.read(runId);
		} catch (error) {
			if (error.code === "ENOENT") return null;
			throw error;
		}
		return {
			...summaryOf(source),
			baseTree: tree(source.baseHarness),
			adoptedTree: tree(source.adoptedHarness),
			stages: (Array.isArray(source.stages) ? source.stages : []).slice(0, 50).map(stageOf),
			fallbacks: strings(source.fallbacks),
			errors: strings(source.errors)
		};
	}
	async read(runId) {
		const file = path.resolve(this.root, runId, "summary.json");
		const expected = path.resolve(this.root, runId) + path.sep;
		if (!file.startsWith(expected)) throw new Error("Harness² path escaped the Run Store");
		const raw = await readFile(file);
		if (raw.byteLength > MAX_SUMMARY_BYTES) throw new Error("Harness² summary exceeds the panel limit");
		return object(JSON.parse(raw.toString("utf8")));
	}
};
//#endregion
//#region dist/src/panel/service.js
const LIST_PATH = "/api/harness2-panel/runs";
const DETAIL_PATH = "/api/harness2-panel/run";
function json(value, status = 200) {
	return Response.json(value, {
		status,
		headers: { "cache-control": "no-store" }
	});
}
/** Register browser-authenticated routes when the host composition provides Connection. */
function mountHarness2Panel(ctx, dataDir) {
	ctx.inject(["connection"], (child) => {
		const reader = new Harness2RunReader(dataDir);
		child.effect(() => child.connection.fetch.register({
			path: LIST_PATH,
			methods: ["GET"],
			requestBody: "buffered",
			fetch: async (_request) => {
				try {
					return json(await reader.list());
				} catch {
					return json({ error: "read-failed" }, 500);
				}
			}
		}), "harness2-panel: run list");
		child.effect(() => child.connection.fetch.register({
			path: DETAIL_PATH,
			methods: ["GET"],
			requestBody: "buffered",
			fetch: async (request) => {
				const runId = new URL(request.url).searchParams.get("runId");
				if (runId === null) return json({ error: "invalid-run-id" }, 400);
				try {
					const detail = await reader.detail(runId);
					return detail === null ? json({ error: "not-found" }, 404) : json(detail);
				} catch {
					return json({ error: "read-failed" }, 400);
				}
			}
		}), "harness2-panel: run detail");
	});
}
//#endregion
//#region dist/src/dsh/index.js
/** Cordis Loader diagnostic name. */
const name = "harness2";
/** Services used by rollout creation, editor calls, scoped prompts, and the model-facing entry tool. */
const inject = [
	"agents",
	"llm",
	"systemPrompt",
	"tools"
];
/** Deployment policy for explicit Harness² runs. */
const Config = z.object({
	mode: z.union(["parallel", "sequential"]).default("parallel"),
	k: z.number().min(1).max(5).step(1).default(1),
	timeoutMs: z.number().min(1).default(36e5),
	maxParallelProposals: z.number().min(1).step(1).default(2),
	maxParallelRollouts: z.number().min(1).step(1).default(2),
	maxTotalTokens: z.number().min(1).step(1).default(1e6),
	maxCost: z.number().min(1e-6),
	pricing: z.object({
		inputPerMillion: z.number().min(0).required(),
		outputPerMillion: z.number().min(0).required(),
		cacheReadPerMillion: z.number().min(0).required(),
		cacheWritePerMillion: z.number().min(0).required()
	}).default(void 0),
	enableScripts: z.boolean().default(false),
	scriptTimeoutMs: z.number().min(1).default(3e4),
	scriptOutputMaxBytes: z.number().min(1).step(1).default(1e6),
	libraryMode: z.union([
		"off",
		"read-only",
		"read-write"
	]).default("off"),
	tenant: z.string().required(),
	project: z.string().required(),
	dataDir: z.string().required()
});
/** Register the Harness² host service and its explicit model-facing tool. */
function apply(ctx, config) {
	if (config.maxCost !== void 0 && config.pricing === void 0) throw new Error("harness2: maxCost requires explicit provider token pricing");
	const runtime = new DshHarness2Runtime(ctx, config);
	ctx.provide("harness2", runtime);
	mountHarness2Panel(ctx, `${config.dataDir}/runs`);
	ctx.tools.register(defineTool({
		name: "harness2_run",
		description: "Run a high-cost Harness² Propose-Probe-Compose job for one explicit task. Use only when the user asks for recursive harness improvement or extra test-time adaptation.",
		parameters: {
			task: {
				type: "string",
				required: true,
				description: "Complete task to execute in isolated candidate agents."
			},
			domain: {
				type: "string",
				required: true,
				description: "Stable experience-library domain."
			},
			mode: {
				type: "string",
				enum: ["parallel", "sequential"],
				description: "Recursion mode; deployment default when omitted."
			},
			k: {
				type: "integer",
				enum: [
					1,
					2,
					3,
					4,
					5
				],
				description: "Exploration budget; deployment default when omitted."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					status: {
						type: "string",
						required: true,
						enum: [
							"completed",
							"failed",
							"cancelled"
						]
					},
					chosenLabel: {
						type: "string",
						required: true
					},
					content: {
						type: "string",
						required: true
					},
					rollouts: {
						type: "integer",
						required: true
					},
					fallbacks: {
						type: "array",
						required: true,
						items: { type: "string" }
					},
					errors: {
						type: "array",
						required: true,
						items: { type: "string" }
					},
					inputTokens: {
						type: "integer",
						required: true
					},
					outputTokens: {
						type: "integer",
						required: true
					},
					cachedTokens: {
						type: "integer",
						required: true
					},
					estimatedCost: {
						type: "number",
						required: true
					}
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: value.status === "completed" ? value.content : `Harness² ${value.status}: ${value.errors.join("; ")}`
			}]
		},
		async execute(args, exec) {
			if (!exec.agent) throw new Error("harness2_run requires an owning DSH Agent");
			const result = await runtime.run(exec.agent, {
				task: args.task,
				domain: args.domain,
				...args.mode === void 0 ? {} : { mode: args.mode },
				...args.k === void 0 ? {} : { k: args.k },
				signal: exec.signal
			});
			return {
				status: result.status,
				chosenLabel: result.chosenLabel,
				content: Object.values(result.chosenRun?.deliverables ?? {}).join("\n\n"),
				rollouts: result.baseRuns.length + result.stages.length,
				fallbacks: [...result.fallbacks],
				errors: [...result.errors],
				inputTokens: result.totalUsage.inputTokens,
				outputTokens: result.totalUsage.outputTokens,
				cachedTokens: result.totalUsage.cachedTokens,
				estimatedCost: result.totalUsage.cost
			};
		},
		presentCall: (args) => ({
			card: "generic",
			title: `Harness² ${args.mode ?? config.mode} k=${args.k ?? config.k}`,
			kind: "execute",
			rawInput: {
				domain: args.domain,
				task: args.task
			}
		})
	}));
	ctx.tools.register(defineTool({
		name: "harness2_plan",
		description: "Preview the exact Harness² call topology and configured hard budgets without running models or modifying the experience library.",
		parameters: {
			mode: {
				type: "string",
				enum: ["parallel", "sequential"],
				description: "Recursion mode; deployment default when omitted."
			},
			k: {
				type: "integer",
				enum: [
					1,
					2,
					3,
					4,
					5
				],
				description: "Exploration budget; deployment default when omitted."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					mode: {
						type: "string",
						required: true,
						enum: ["parallel", "sequential"]
					},
					k: {
						type: "integer",
						required: true
					},
					expectedRollouts: {
						type: "integer",
						required: true
					},
					expectedEditStages: {
						type: "integer",
						required: true
					},
					selectionCalls: {
						type: "integer",
						required: true
					},
					reflectionCalls: {
						type: "integer",
						required: true
					},
					maxTotalTokens: {
						type: "integer",
						required: true
					},
					maxCost: {
						required: true,
						oneOf: [{ type: "number" }, { type: "null" }]
					},
					pricingConfigured: {
						type: "boolean",
						required: true
					},
					scriptsEnabled: {
						type: "boolean",
						required: true
					}
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: JSON.stringify(value, null, 2)
			}]
		},
		execute(args) {
			return Promise.resolve(runtime.plan({
				...args.mode === void 0 ? {} : { mode: args.mode },
				...args.k === void 0 ? {} : { k: args.k }
			}));
		},
		presentCall: () => ({
			card: "generic",
			title: "Preview Harness² budget",
			kind: "read"
		})
	}));
	ctx.tools.register(defineTool({
		name: "harness2_status",
		description: "List active Harness² runs. This performs no model calls.",
		parameters: {},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: { active: {
					type: "array",
					required: true,
					items: {
						type: "object",
						additionalProperties: false,
						properties: {
							runId: {
								type: "string",
								required: true
							},
							taskId: {
								type: "string",
								required: true
							},
							mode: {
								type: "string",
								required: true,
								enum: ["parallel", "sequential"]
							},
							k: {
								type: "integer",
								required: true
							},
							startedAt: {
								type: "string",
								required: true
							}
						}
					}
				} }
			},
			render: (_args, value) => [{
				type: "text",
				text: value.active.length === 0 ? "No active Harness² runs." : JSON.stringify(value.active, null, 2)
			}]
		},
		execute() {
			return Promise.resolve({ active: runtime.active() });
		},
		presentCall: () => ({
			card: "generic",
			title: "List Harness² runs",
			kind: "read"
		})
	}));
	ctx.tools.register(defineTool({
		name: "harness2_cancel",
		description: "Cancel one active Harness² run by exact run id. Completed or unknown ids are unchanged.",
		parameters: { runId: {
			type: "string",
			required: true
		} },
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: { accepted: {
					type: "boolean",
					required: true
				} }
			},
			render: (_args, value) => [{
				type: "text",
				text: value.accepted ? "Harness² cancellation requested." : "Harness² run is not active."
			}]
		},
		execute(args) {
			return Promise.resolve({ accepted: runtime.cancel(args.runId) });
		},
		presentCall: (args) => ({
			card: "generic",
			title: "Cancel Harness² run",
			kind: "other",
			rawInput: args.runId
		})
	}));
}
var dsh_default = {
	name,
	inject,
	Config,
	apply
};
//#endregion
export { Config, DshHarness2Runtime, apply, dsh_default as default, inject, name };
