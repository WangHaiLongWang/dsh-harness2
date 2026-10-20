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
  "@deepseek-ai/dsh-system-prompt": "packages/core/system-prompt",
  "@deepseek-ai/dsh-tools": "packages/core/tools",
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
