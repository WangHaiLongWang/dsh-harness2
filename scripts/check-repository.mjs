import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const tracked = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], {
  cwd: root,
  encoding: "utf8",
}).split(/\r?\n/).filter(Boolean);
const textFiles = tracked.filter((file) => /\.(?:md|ts|mjs|json|ya?ml|txt)$/i.test(file));
const failures = [];
const forbidden = [
  [/-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/, "private key"],
  [/[?&]token=[A-Za-z0-9_-]{16,}/i, "URL token"],
  [/C:\\Users\\(?!example|user)/i, "local Windows user path"],
  [/D:\\ProjectS/i, "local development path"],
];

for (const file of textFiles) {
  const absolute = path.join(root, file);
  const content = await readFile(absolute, "utf8");
  for (const [pattern, label] of forbidden) {
    if (pattern.test(content)) failures.push(`${file}: contains ${label}`);
  }
  if (!file.toLowerCase().endsWith(".md")) continue;
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const raw = match[1]?.trim() ?? "";
    const target = raw.startsWith("<") && raw.endsWith(">") ? raw.slice(1, -1) : raw;
    if (target === "" || target.startsWith("#") || /^(?:https?:|mailto:)/i.test(target)) continue;
    const local = decodeURIComponent(target.split("#", 1)[0] ?? "");
    try {
      await access(path.resolve(path.dirname(absolute), local));
    } catch {
      failures.push(`${file}: broken relative link ${target}`);
    }
  }
}

for (const forbiddenPath of ["dist", "runs", "node_modules", ".env"]) {
  if (tracked.some((file) => file === forbiddenPath || file.startsWith(`${forbiddenPath}/`))) {
    failures.push(`tracked generated/sensitive path: ${forbiddenPath}`);
  }
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`repository check passed (${String(textFiles.length)} text files)\n`);
}
