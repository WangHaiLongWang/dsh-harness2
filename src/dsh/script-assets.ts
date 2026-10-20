import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-shell";
import { defineTool } from "@deepseek-ai/dsh-tools";
import type { HarnessTree, HarnessValidationIssue } from "../types.js";

const SCRIPT_FILE = /^scripts\/([a-zA-Z0-9_.-]+\.py)$/;
const MAX_SCRIPT_BYTES = 128_000;

export interface ScriptPolicy {
  enabled: boolean;
  assetRoot: string;
  timeoutMs: number;
  outputMaxBytes: number;
}

function toolName(file: string): string {
  return `harness2_script_${file.slice(0, -3).replaceAll(/[^a-zA-Z0-9_]/g, "_")}`;
}

function quoteShellArgument(value: string): string {
  return process.platform === "win32"
    ? `'${value.replaceAll("'", "''")}'`
    : `'${value.replaceAll("'", `'"'"'`)}'`;
}

function under(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export function validateScriptComponents(tree: HarnessTree, policy: ScriptPolicy): HarnessValidationIssue[] {
  const issues: HarnessValidationIssue[] = [];
  const tools = new Map<string, string>();
  for (const [file, body] of Object.entries(tree)) {
    if (!file.startsWith("scripts/")) continue;
    const match = SCRIPT_FILE.exec(file);
    if (!policy.enabled) {
      issues.push({ path: file, code: "dsh-scripts-disabled", message: "C7 scripts are disabled by deployment policy" });
      continue;
    }
    if (!match) {
      issues.push({ path: file, code: "unsupported-script", message: "only scripts/<name>.py is supported" });
      continue;
    }
    if (Buffer.byteLength(body, "utf8") > MAX_SCRIPT_BYTES) {
      issues.push({ path: file, code: "script-too-large", message: `script exceeds ${MAX_SCRIPT_BYTES} bytes` });
    }
    if (body.includes("\0")) issues.push({ path: file, code: "invalid-script", message: "script contains a NUL byte" });
    const name = toolName(match[1] as string);
    const prior = tools.get(name);
    if (prior) issues.push({ path: file, code: "script-tool-collision", message: `tool name collides with ${prior}` });
    else tools.set(name, file);
  }
  return issues;
}

export interface StagedScripts {
  install(agentCtx: Context): void;
  dispose(): Promise<void>;
}

export async function stageScripts(
  rootCtx: Context,
  tree: HarnessTree,
  policy: ScriptPolicy,
  runId: string,
): Promise<StagedScripts> {
  const scripts = Object.entries(tree).flatMap(([file, body]) => {
    const match = SCRIPT_FILE.exec(file);
    return match ? [{ file: match[1] as string, body }] : [];
  });
  if (scripts.length === 0) return { install() {}, dispose: () => Promise.resolve() };
  if (!policy.enabled) throw new Error("Harness² scripts are disabled");

  const root = path.resolve(policy.assetRoot);
  const safeRun = runId.replaceAll(/[^a-zA-Z0-9_.-]/g, "_");
  const directory = path.resolve(root, safeRun);
  if (!under(root, directory)) throw new Error("invalid Harness² script staging directory");
  await mkdir(directory, { recursive: true });
  for (const script of scripts) await writeFile(path.join(directory, script.file), script.body, { encoding: "utf8", flag: "wx" });

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
          parameters: { input: { type: "string", description: "Optional UTF-8 stdin for the helper." } },
          output: {
            schema: { type: "object", additionalProperties: false, properties: { exitCode: { required: true, oneOf: [{ type: "integer" }, { type: "null" }] }, stdout: { type: "string", required: true }, stderr: { type: "string", required: true }, timedOut: { type: "boolean", required: true } } },
            render: (_args, value) => [{ type: "text", text: `${value.stdout}${value.stderr === "" ? "" : `\n[stderr]\n${value.stderr}`}` }],
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
              sandboxPolicy,
            });
            const result = await (await shell.execute(spec)).result();
            return { exitCode: result.exitCode, stdout: result.stdout.text, stderr: result.stderr.text, timedOut: result.timedOut };
          },
          presentCall: () => ({ card: "generic", title: `Run ${script.file}`, kind: "execute", rawInput: script.file }),
        }));
      }
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      if (!under(root, directory)) throw new Error("refusing to remove script directory outside asset root");
      await rm(directory, { recursive: true, force: true });
    },
  };
}
