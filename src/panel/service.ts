/** Authenticated read-only HTTP projection for the Harness² Web panel. */
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-client-connection";
import { Harness2RunReader } from "./read-store.js";

const LIST_PATH = "/api/harness2-panel/runs";
const DETAIL_PATH = "/api/harness2-panel/run";

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}

/** Register browser-authenticated routes when the host composition provides Connection. */
export function mountHarness2Panel(ctx: Context, dataDir: string): void {
  ctx.inject(["connection"], (child) => {
    const reader = new Harness2RunReader(dataDir);
    child.effect(() => child.connection.fetch.register({
      path: LIST_PATH,
      methods: ["GET"],
      requestBody: "buffered",
      fetch: async (_request) => {
        try { return json(await reader.list()); }
        catch { return json({ error: "read-failed" }, 500); }
      },
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
        } catch { return json({ error: "read-failed" }, 400); }
      },
    }), "harness2-panel: run detail");
  });
}

