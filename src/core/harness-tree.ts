import { createHash } from "node:crypto";
import path from "node:path";
import type {
  HarnessTree,
  HarnessValidationIssue,
  HarnessValidationResult,
} from "../types.js";

const EXACT_FILES = new Set(["system.md", "guardrails.md", "memory.md", "tool-guidance.md"]);
const COMPONENT_PATH = /^(skills\/[a-z0-9_-]+\/SKILL\.md|skills\/[a-z0-9_-]+\/scripts\/[a-zA-Z0-9_.-]+|subagents\/[a-z0-9_-]+\/AGENT\.md|scripts\/[a-zA-Z0-9_.-]+|plugins\/[a-z0-9_-]+\/[a-zA-Z0-9_./-]+)$/;
const SCRIPT_REF = /(?:scripts\/|skills\/([a-z0-9_-]+)\/scripts\/)([a-zA-Z0-9_.-]+)/g;

export interface TreeLimits {
  maxFiles: number;
  maxFileBytes: number;
  maxAlwaysOnBytes: number;
}

export const DEFAULT_TREE_LIMITS: TreeLimits = {
  maxFiles: 128,
  maxFileBytes: 256_000,
  maxAlwaysOnBytes: 64_000,
};

export function normalizeHarnessPath(input: string): string {
  const normalized = input.replaceAll("\\", "/").normalize("NFC");
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    throw new Error(`absolute harness path is forbidden: ${input}`);
  }
  const clean = path.posix.normalize(normalized);
  if (clean === ".." || clean.startsWith("../") || clean.includes("/../")) {
    throw new Error(`parent traversal is forbidden: ${input}`);
  }
  return clean.replace(/^\.\//, "");
}

export function canonicalTree(tree: HarnessTree): Record<string, string> {
  const result: Record<string, string> = {};
  for (const raw of Object.keys(tree).sort()) {
    const key = normalizeHarnessPath(raw);
    if (Object.hasOwn(result, key)) throw new Error(`duplicate normalized path: ${key}`);
    result[key] = tree[raw] ?? "";
  }
  return result;
}

export function fingerprintTree(tree: HarnessTree): string {
  const canonical = canonicalTree(tree);
  const hash = createHash("sha256");
  for (const [key, value] of Object.entries(canonical)) {
    hash.update(key).update("\0").update(value).update("\0");
  }
  return hash.digest("hex");
}

export function diffTree(before: HarnessTree, after: HarnessTree): {
  added: string[];
  removed: string[];
  modified: string[];
} {
  const left = canonicalTree(before);
  const right = canonicalTree(after);
  return {
    added: Object.keys(right).filter((key) => !Object.hasOwn(left, key)),
    removed: Object.keys(left).filter((key) => !Object.hasOwn(right, key)),
    modified: Object.keys(right).filter(
      (key) => Object.hasOwn(left, key) && left[key] !== right[key],
    ),
  };
}

export function validateHarnessTree(
  tree: HarnessTree,
  limits: TreeLimits = DEFAULT_TREE_LIMITS,
): HarnessValidationResult {
  const issues: HarnessValidationIssue[] = [];
  let canonical: Record<string, string>;
  try {
    canonical = canonicalTree(tree);
  } catch (error) {
    return {
      ok: false,
      issues: [{ code: "invalid-path", message: String(error) }],
    };
  }
  const entries = Object.entries(canonical);
  if (entries.length > limits.maxFiles) {
    issues.push({ code: "too-many-files", message: `${entries.length} exceeds ${limits.maxFiles}` });
  }
  const lowerPaths = new Map<string, string>();
  for (const [file, body] of entries) {
    const lower = file.toLowerCase();
    const prior = lowerPaths.get(lower);
    if (prior && prior !== file) {
      issues.push({ path: file, code: "case-collision", message: `collides with ${prior}` });
    }
    lowerPaths.set(lower, file);
    if (!EXACT_FILES.has(file) && !COMPONENT_PATH.test(file)) {
      issues.push({ path: file, code: "outside-surface", message: "path is not editable" });
    }
    if (Buffer.byteLength(body, "utf8") > limits.maxFileBytes) {
      issues.push({ path: file, code: "file-too-large", message: "file exceeds byte limit" });
    }
    if (/\b(?:process\.env|child_process|eval\s*\(|new Function|https?:\/\/)/.test(body)) {
      issues.push({ path: file, code: "unsafe-content", message: "forbidden capability reference" });
    }
  }

  const alwaysOn = ["system.md", "guardrails.md", "memory.md", "tool-guidance.md"]
    .map((key) => canonical[key] ?? "")
    .join("\n");
  if (Buffer.byteLength(alwaysOn, "utf8") > limits.maxAlwaysOnBytes) {
    issues.push({ code: "always-on-too-large", message: "always-on context exceeds byte limit" });
  }

  for (const [file] of entries.filter(([name]) => /^skills\/[^/]+\/SKILL\.md$/.test(name))) {
    const name = file.split("/")[1];
    if (name && !alwaysOn.includes(name)) {
      issues.push({
        path: file,
        code: "skill-without-trigger",
        message: `always-on text must contain skill name ${name}`,
      });
    }
  }

  for (const [file, body] of entries.filter(([name]) => name.endsWith(".md"))) {
    for (const match of body.matchAll(SCRIPT_REF)) {
      const skill = match[1];
      const script = match[2];
      if (!script) continue;
      const expected = skill ? `skills/${skill}/scripts/${script}` : `scripts/${script}`;
      if (!Object.hasOwn(canonical, expected)) {
        issues.push({ path: file, code: "missing-script", message: `references missing ${expected}` });
      }
    }
  }
  return { ok: issues.length === 0, issues };
}
