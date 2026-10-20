import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dshRoot = path.resolve(process.env.DSH_SOURCE_ROOT ?? path.join(root, "..", "deepseek-harness"));
await access(path.join(dshRoot, "packages", "client", "tsdown.client.ts"));

async function run(args, env = process.env) {
  const command = process.platform === "win32" ? "cmd.exe" : "pnpm";
  const commandArgs = process.platform === "win32" ? ["/d", "/s", "/c", "pnpm", ...args] : args;
  const child = spawn(command, commandArgs, { cwd: dshRoot, env, stdio: "inherit" });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  if (code !== 0) process.exit(typeof code === "number" ? code : 1);
}

await run(["exec", "tsc", "-p", path.join(root, "tsconfig.client.json")]);
await run(["exec", "tsdown", "--config", path.join(root, "tsdown.panel.config.ts")], {
  ...process.env,
  DSH_BUILD_FACE: "client",
  DSH_SOURCE_ROOT: dshRoot,
});
