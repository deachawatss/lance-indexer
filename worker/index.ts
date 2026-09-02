type Env = { ASSETS: { fetch(request: Request): Promise<Response> } };

type Event = {
  id: string; file: string; session: string; line: number; idx: number;
  kind: string; role: string; tier: string; repo: string; tool: string;
  model: string; ts: string; text: string; n_chars: number;
};

const REPOS = ["lance-indexer", "pulse-oracle", "atlas-oracle", "netbird-oracle"];
const ROLES = ["user", "assistant", "assistant", "assistant", "summary"];
const KINDS = ["text", "text", "tool_use", "tool_result", "summary"];
const TEXT = [
  "How do we keep imported JSONL provenance while making search instant?",
  "Use LanceDB events and manifest tables; import is idempotent and embedding stays optional.",
  '{"command":"just import && just ui"}',
  "Backfill complete: source metadata is unchanged, so no canonical block was duplicated.",
  "Decision: keep vectors in a separate table and join by stable event identity.",
  "A static public demo must bundle fixtures only; it never accesses local session logs.",
];
const events: Event[] = Array.from({ length: 720 }, (_, index) => {
  const repo = REPOS[Math.floor(index / 9) % REPOS.length]!;
  const role = ROLES[index % ROLES.length]!;
  const kind = KINDS[index % KINDS.length]!;
  const session = `fixture-${repo}-${Math.floor(index / 12)}`;
  const text = `${TEXT[index % TEXT.length]} · fixture block ${String(index + 1).padStart(3, "0")}`;
  return {
    id: `fixture-${index + 1}`, file: `/fixture/${repo}/${session}.jsonl`, session,
    line: 1 + Math.floor(index / 3), idx: index % 3, kind, role,
    tier: index % 11 === 0 ? "workflow_agent" : index % 4 === 0 ? "subagent" : "session",
    repo, tool: kind === "tool_use" ? "Bash" : "", model: "claude-sonnet-fixture",
    ts: new Date(Date.UTC(2026, 7, 27, 2, 0, 0) + index * 13 * 60_000).toISOString(),
    text, n_chars: text.length,
  };
}).sort((a, b) => b.ts.localeCompare(a.ts));

const countBy = (rows: Event[], field: keyof Event) => {
  const map = new Map<string, number>();
  for (const row of rows) {
    const value = String(row[field] ?? "");
    if (value) map.set(value, (map.get(value) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
};
const json = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "cache-control": "no-store", "x-lance-indexer-demo": "static-fixture" },
});
const corpus = () => ({ rows: events.length, sessions: new Set(events.map((row) => row.file)).size, span_days: 7, vectors: events.length - 24 });
const fixedJob = {
  id: 1, name: "import", args: "fixture", running: false, code: 0,
  started: Date.parse("2026-09-01T03:10:00Z"), elapsed_s: 1,
  last: "[demo] Fixture import simulated — no data was persisted.",
};
const logs = [
  "[demo] static fixture mode: no KV, D1, R2, filesystem, or LanceDB binding.",
  "discover: 48 fixture files",
  "import: new/changed=0 unchanged-skipped=48",
  "blocks: +0 upserted this run, 720 in static corpus",
  "done: simulated import does not write or retain state.",
];

function filter(url: URL) {
  const q = (url.searchParams.get("q") ?? "").toLowerCase();
  return events.filter((row) => {
    for (const key of ["kind", "role", "tier", "repo", "tool", "model", "session"] as const) {
      const selected = url.searchParams.get(key) ?? "";
      if (selected && row[key] !== selected) return false;
    }
    return !q || row.text.toLowerCase().includes(q);
  });
}

function facets() {
  return {
    corpus: { ...corpus(), demo: true },
    kinds: countBy(events, "kind"), roles: countBy(events, "role"), tiers: countBy(events, "tier"),
    repos: countBy(events, "repo"), tools: countBy(events, "tool"), models: countBy(events, "model"),
  };
}

function repoContext(name: string) {
  const rows = events.filter((row) => row.repo === name);
  if (!rows.length) return null;
  const byDay = new Map<string, number>();
  rows.forEach((row) => { const day = row.ts.slice(0, 10); byDay.set(day, (byDay.get(day) ?? 0) + 1); });
  return {
    name, blocks: rows.length, sessions: new Set(rows.map((row) => row.file)).size,
    first: rows.at(-1)!.ts.slice(0, 10), last: rows[0]!.ts.slice(0, 10),
    kinds: Object.fromEntries(countBy(rows, "kind")), tools: countBy(rows.filter((row) => row.tool), "tool"),
    days: [...byDay.entries()],
    summaries: rows.filter((row) => row.kind === "summary").slice(0, 8).map((row) => ({ ts: row.ts, text: row.text.slice(0, 160) })),
    neighbors: REPOS.filter((repo) => repo !== name).slice(0, 3).map((repo, index) => ({ repo, d: 0.16 + index * 0.11 })),
  };
}

function map(url: URL) {
  const selectedRepo = url.searchParams.get("repo") ?? "";
  const rows = events.filter((row) => !selectedRepo || row.repo === selectedRepo).slice(0, 120);
  const nodes = rows.map((row, index) => {
    const angle = index * 2.399963; const radius = 0.2 + Math.sqrt(index / rows.length) * 0.78;
    return { id: row.id, title: row.text.slice(0, 76), repo: row.repo, session: row.session, line: row.line,
      ts: row.ts, degree: index % 5 + 1, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, z: Math.sin(angle * .43) * .7 };
  });
  const edges = nodes.flatMap((_, index) => index ? [{ s: index - 1, t: index, d: .12 + (index % 7) * .04, kind: index % 9 === 0 ? "bridge" : "similar" }] : []);
  return { sampled: nodes.length, totalVectors: events.length - 24, k: 4, explained: .78, unembedded: 24, nodes, edges };
}

function assetRequest(request: Request, pathname: string) {
  const target = pathname === "/" ? "/index.html"
    : pathname === "/map" ? "/map.html"
    : pathname === "/live" ? "/live.html"
    : pathname === "/admin" ? "/admin.html"
    : pathname === "/insight" ? "/insight.html" : pathname;
  return new Request(new URL(target, request.url), request);
}

async function demoAsset(request: Request, env: Env, pathname: string) {
  const response = await env.ASSETS.fetch(assetRequest(request, pathname));
  const badge = `<aside style="position:fixed;right:12px;bottom:12px;z-index:9999;padding:7px 10px;border:1px solid #3d9f70;border-radius:7px;background:#101713ee;color:#a8e8bd;font:11px ui-monospace,monospace;box-shadow:0 8px 24px #0008">STATIC FIXTURE · 720 synthetic blocks · no KV / D1 / storage</aside>`;
  return new HTMLRewriter().on("body", { element(element) { element.append(badge, { html: true }); } }).transform(response);
}

export const demoWorker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url); const path = url.pathname;
    if (path === "/health") return json({ ok: true, service: "lance-indexer", mode: "static-fixture", storage: "none" });
    if (path === "/viz/index.json") return json(["atlas.js", "flat.js", "hologram.js", "radial.js", "timeline.js", "walk.js"]);
    if (path === "/api/status") return json({ demo: true, storage: "none", corpus: corpus() });
    if (path === "/api/facets") return json(facets());
    if (path === "/api/search") {
      const rows = filter(url).slice(0, 120);
      return json({ mode: url.searchParams.get("mode") ?? "browse", n: rows.length, took: { db: 1, total: 2 }, rows });
    }
    if (path === "/api/event") {
      const row = events.find((event) => event.id === url.searchParams.get("id"));
      return row ? json(row) : json({ error: "NOT_FOUND" }, 404);
    }
    if (path === "/api/session") {
      const rows = events.filter((event) => event.file === (url.searchParams.get("file") ?? "")).sort((a, b) => a.line - b.line || a.idx - b.idx);
      return json({ total: rows.length, from: 0, rows: rows.slice(0, 60) });
    }
    if (path === "/api/raw") return json({ type: "fixture", note: "Synthetic public fixture. No local JSONL is readable in this deployment." });
    if (path === "/api/repo") {
      const name = url.searchParams.get("name") ?? "";
      const body = repoContext(name);
      return body ? json(body) : json({ error: "REPO_NOT_FOUND", name }, 404);
    }
    if (path === "/api/map") return json(map(url));
    if (path === "/api/preflight") {
      const name = url.searchParams.get("name");
      return json(name === "embed"
        ? { name, candidates: 412, embedded: 388, remaining: 24, demo: true }
        : { name: "import", found: 48, new: 0, changed: 0, unchanged: 48, willImport: 0, demo: true });
    }
    if (path === "/api/jobs") return json({ jobs: [fixedJob], vectors: corpus().vectors, rows: corpus().rows, files: corpus().sessions, textCandidates: 412 });
    if (path === "/api/job-log") {
      const from = Math.max(0, Number(url.searchParams.get("from") ?? 0));
      return json({ id: 1, name: "import", running: false, code: 0, next: logs.length, lines: logs.slice(from) });
    }
    if (path === "/api/import" && request.method === "POST") return json({ started: true, id: 1, demo: true, note: "JOB_STARTED", name: "import" });
    if (path === "/api/embed" && request.method === "POST") return json({ started: true, id: 1, demo: true, note: "JOB_STARTED", name: "embed" });
    if (path === "/api/job-kill" && request.method === "POST") return json({ error: "DEMO_JOBS_IMMUTABLE" }, 409);
    if (path === "/api/refresh") return json({ ok: true, rows: events.length, demo: true });
    if (path === "/api/insight" && request.method === "POST") {
      const body = await request.json().catch(() => ({})) as { q?: unknown; repo?: unknown; model?: unknown };
      const q = String(body.q ?? "").trim();
      if (!q) return json({ error: "ASK_SOMETHING" }, 400);
      const evidence = filter(new URL(`${url.origin}/api/search?q=${encodeURIComponent(q)}`)).slice(0, 4);
      return json({
        answer: "เดโมสาธารณะนี้ใช้ fixture เท่านั้น: Lance Indexer แยก import, manifest และ vector table เพื่อให้ ingestion ไม่ต้องรอ embedding [1]. การค้นหาและแผนที่จึงอธิบาย provenance ได้โดยไม่แตะ session จริง [2].",
        model: "static-fixture-rag", evidence: evidence.map((row, index) => ({ n: index + 1, ...row, d: .12 + index * .08, snippet: row.text.slice(0, 200) })),
        took: { embed: 0, search: 1, llm: 0, total: 1 }, demo: true,
      });
    }
    if (path.startsWith("/api/")) return json({ error: "NOT_FOUND" }, 404);
    return demoAsset(request, env, path);
  },
};
export default demoWorker;
