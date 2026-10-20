import { readFile } from "node:fs/promises";
import { evaluate, releaseGate } from "../dist/src/eval/metrics.js";

const input = process.argv[2];
const method = process.argv[3] ?? "harness2-k1";
if (!input) {
  process.stderr.write("usage: npm run eval:report -- <observations.json> [method]\n");
  process.exitCode = 2;
} else {
  const rows = JSON.parse(await readFile(input, "utf8"));
  const report = evaluate(rows);
  const gate = releaseGate(report, method, { maxRegressionRate: 0.01 });
  process.stdout.write(`${JSON.stringify({ report, gate }, null, 2)}\n`);
  if (!gate.pass) process.exitCode = 1;
}
