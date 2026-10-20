import { lstat, mkdir, readFile, rm, symlink } from "node:fs/promises";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const dshRoot = path.resolve(process.argv[2] ?? process.env.DSH_SOURCE_ROOT ?? path.join(projectRoot, "..", "deepseek-harness"));
const links = {
  "@deepseek-ai/cordis": "vendor/cordis",
  "@deepseek-ai/dsh-agent": "packages/core/agent",
  "@deepseek-ai/dsh-agent-loop": "packages/core/agent-loop",
  "@deepseek-ai/dsh-agent-loop-testkit": "packages/test-support/agent-loop-testkit",
  "@deepseek-ai/dsh-agent-preset-registry": "packages/preset/agent-preset-registry",
  "@deepseek-ai/dsh-brand": "packages/util/brand",
  "@deepseek-ai/dsh-llm": "packages/llm/llm",
  "@deepseek-ai/dsh-session": "packages/core/session",
  "@deepseek-ai/dsh-shell": "packages/shell/shell",
  "@deepseek-ai/dsh-skill": "packages/skill/skill",
  "@deepseek-ai/dsh-subagent": "packages/subagent/subagent",
  "@deepseek-ai/dsh-system-prompt": "packages/core/system-prompt",
  "@deepseek-ai/dsh-tools": "packages/core/tools",
  "@deepseek-ai/dsh-typert-protocol": "packages/typert/protocol",
  "@deepseek-ai/dsh-api-remotes": "packages/api/remotes",
  "@deepseek-ai/dsh-client-locale": "packages/client/locale",
  "@deepseek-ai/dsh-client-connection": "packages/client/connection",
  "@deepseek-ai/dsh-client-store": "packages/client/store",
  "@deepseek-ai/dsh-client-ui-layout": "packages/client/ui-layout",
  "@deepseek-ai/dsh-client-ui-primitives": "packages/client/ui-primitives",
  "@deepseek-ai/dsh-client-ui-renderer": "packages/client/ui-renderer",
  "@deepseek-ai/dsh-client-ui-sidebar": "packages/client/ui-sidebar",
  "@deepseek-ai/dsh-client-ui-slots": "packages/client/ui-slots",
  "@deepseek-ai/schemastery": "vendor/schemastery",
};

for (const [name, relative] of Object.entries(links)) {
  const source = path.join(dshRoot, relative);
  const manifest = JSON.parse(await readFile(path.join(source, "package.json"), "utf8"));
  if (manifest.name !== name) throw new Error(`${source} declares ${manifest.name}, expected ${name}`);
  const target = path.join(projectRoot, "node_modules", ...name.split("/"));
  await mkdir(path.dirname(target), { recursive: true });
  try {
    const current = await lstat(target);
    if (!current.isSymbolicLink() && !current.isDirectory()) throw new Error(`${target} is not replaceable`);
    await rm(target, { recursive: true, force: true });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await symlink(source, target, process.platform === "win32" ? "junction" : "dir");
  process.stdout.write(`linked ${name} -> ${source}\n`);
}
