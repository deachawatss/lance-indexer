// lance-indexer: UI server v2 — block granularity + facets ครบ (kind/role/tier/repo/tool/model)
// localhost เท่านั้น ไม่ publish · lexical = LIKE scan · vector/hybrid เปิดเมื่อ vectors table โผล่
import * as lancedb from "@lancedb/lancedb";
import { UNGROUPED, groupOf, resolveGroups, type Sighting } from "../lib/attribution";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
const DIR = fileURLToPath(new URL("../.data/lancedb", import.meta.url));
const HTML = fileURLToPath(new URL("../ui/index.html", import.meta.url));
const MAPHTML = fileURLToPath(new URL("../ui/map.html", import.meta.url));
const OLLAMA = process.env.OLLAMA_URL ?? "http://localhost:11434";
const PORT = Number(process.env.PORT ?? 4131);

const db = await lancedb.connect(DIR);
const events = await db.openTable("events");
const esc = (s: string) => s.replace(/'/g, "''");
// log ของ job คือ stdout ดิบของสคริปต์ลูก — บรรทัดที่ server เขียนเองติดป้ายนี้ไว้ให้เบราว์เซอร์แปล
const SRV_LINE = "@@srv ";
const count = (m: Record<string, number>, k: string) => { if (k) m[k] = (m[k] ?? 0) + 1; };

// ── aggregate ครั้งเดียวตอน start: counts ทุก facet + browse window ──
// scan รอบแรกไม่เอา text (204K แถว text เต็มกินหลายร้อย MB), รอบสองดึง text เฉพาะแถวใหม่สุด
type Agg = {
  stats: any; kinds: any; roles: any; tiers: any; repos: any; tools: any; models: any;
  byId: Map<string, any>; recent: any[]; sessions: number;
  groups: Map<string, string>; ungrouped: number;
};
async function aggregate(): Promise<Agg> {
  const rows = await events.query()
    .select(["id", "file", "session", "tier", "role", "kind", "org", "repo", "tool", "model", "ts", "line", "idx"])
    .toArray() as any[];
  const kinds = {}, roles = {}, tiers = {}, repos = {}, tools = {}, models = {};
  const byId = new Map<string, any>();
  const sess = new Set<string>();
  // group ต้องรู้ว่า repo ชื่อนี้เคยอยู่ใต้ org ไหนบ้าง — เก็บ ts ล่าสุดต่อคู่ (org,repo) ในรอบ scan เดิม
  const seen = new Map<string, string>();
  let ungrouped = 0;
  for (const r of rows) {
    count(kinds, r.kind); count(roles, r.role); count(tiers, r.tier);
    count(repos, r.repo); count(tools, r.tool); count(models, r.model);
    sess.add(r.file);
    const org = r.org ?? "", repo = r.repo ?? "";
    if (org && repo) {
      const k = `${org}\n${repo}`, ts = r.ts ?? "";
      if (ts > (seen.get(k) ?? "")) seen.set(k, ts);
    }
    if (!repo) ungrouped++;
    byId.set(r.id, { kind: r.kind, role: r.role, tier: r.tier, repo: r.repo, tool: r.tool, model: r.model, ts: r.ts });
  }
  const sightings: Sighting[] = [...seen].map(([k, lastSeen]) => {
    const [org, repo] = k.split("\n");
    return { org: org!, repo: repo!, lastSeen };
  });
  const groups = resolveGroups(sightings);
  rows.sort((a, b) => (b.ts ?? "").localeCompare(a.ts ?? ""));
  const top = rows.slice(0, 2000);
  const cutoff = top[top.length - 1]?.ts ?? "";
  const texts = new Map<string, string>();
  if (cutoff)
    for (const r of await events.query().where(`ts >= '${esc(cutoff)}'`).select(["id", "text"]).toArray() as any[])
      texts.set(r.id, String(r.text).slice(0, 400));
  const recent = top.map((r) => ({ ...r, text: texts.get(r.id) ?? "" }));
  const span = rows.length
    ? Math.max(1, Math.round((Date.parse(rows[0].ts || "") - Date.parse(rows[rows.length - 1].ts || "")) / 86400000)) : 0;
  return {
    stats: { rows: rows.length, sessions: sess.size, span_days: span },
    kinds, roles, tiers, repos, tools, models, byId, recent, sessions: sess.size,
    groups, ungrouped,
  };
}
console.log("aggregating…");
let agg = await aggregate();
console.log(`aggregate: ${agg.stats.rows} blocks, ${agg.stats.sessions} files, ${new Set(agg.groups.values()).size} groups`);

// group → รายชื่อ repo ในกลุ่ม — ขยายในหน่วยความจำล้วน ไม่เคยกลายเป็น query clause
// (ชื่อ group มาจาก request parameter ที่ผู้ใช้คุมได้ ส่วน where ที่นี่ต่อสตริงเอา)
function reposInGroup(group: string): Set<string> {
  const named = new Set(
    Object.keys(agg.repos as Record<string, number>).filter((repo) => groupOf(repo, agg.groups) === group));
  if (group === UNGROUPED) named.add("");   // แถวที่ derive ชื่อ repo ไม่ได้เลย
  return named;
}
// รายการสำหรับ dropdown ของแผนที่: repo ซ้อนใต้ group พร้อมจำนวน block ต่อรายการ
function groupList() {
  const byGroup = new Map<string, { group: string; blocks: number; repos: { repo: string; blocks: number }[] }>();
  for (const [repo, blocks] of Object.entries(agg.repos as Record<string, number>)) {
    const g = groupOf(repo, agg.groups);
    let e = byGroup.get(g);
    if (!e) byGroup.set(g, e = { group: g, blocks: 0, repos: [] });
    e.blocks += blocks;
    e.repos.push({ repo, blocks });
  }
  if (agg.ungrouped) {
    const e = byGroup.get(UNGROUPED) ?? { group: UNGROUPED, blocks: 0, repos: [] };
    e.blocks += agg.ungrouped;
    byGroup.set(UNGROUPED, e);
  }
  for (const e of byGroup.values()) e.repos.sort((a, b) => b.blocks - a.blocks);
  return [...byGroup.values()].sort((a, b) => b.blocks - a.blocks);
}

async function vectorsTable() {
  return (await db.tableNames()).includes("vectors") ? db.openTable("vectors") : null;
}
const json = (o: any, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

// ── jobs: import/embed สั่งจาก UI, สถานะสดจาก stdout ของ script จริง (ไม่ duplicate logic) ──
const SCRIPTS = fileURLToPath(new URL(".", import.meta.url));
// history เก็บ 50 งานล่าสุด (admin panel) · lines เก็บ 500 บรรทัด + offset นับที่ตัดทิ้ง — incremental tty
type Job = { id: number; name: string; args: string[]; running: boolean; started: number; ended?: number; lines: string[]; offset: number; code: number | null; proc?: any };
const jobList: Job[] = [];
let jobSeq = 0;
const activeByName = (n: string) => jobList.find((j) => j.name === n && j.running);
const latestByName = (n: string) => [...jobList].reverse().find((j) => j.name === n);
function runJob(name: string, args: string[], onDone?: () => Promise<void>, env?: Record<string, string>): Job | null {
  if (activeByName(name)) return null;   // กันซ้อน — งานเดียวต่อชนิด
  const job: Job = { id: ++jobSeq, name, args, running: true, started: Date.now(), lines: [], offset: 0, code: null };
  jobList.push(job);
  if (jobList.length > 50) jobList.shift();
  const proc = Bun.spawn(["bun", ...args], { cwd: SCRIPTS, stdout: "pipe", stderr: "pipe", env: { ...process.env, ...env } });
  job.proc = proc;
  const drain = async (stream: ReadableStream) => {
    const reader = stream.getReader(); const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value);
      const parts = buf.split("\n"); buf = parts.pop()!;
      for (const l of parts) if (l.trim()) {
        job.lines.push(l);
        if (job.lines.length > 500) { job.lines.shift(); job.offset++; }
      }
    }
    if (buf.trim()) job.lines.push(buf);
  };
  Promise.all([drain(proc.stdout as any), drain(proc.stderr as any), proc.exited]).then(async () => {
    job.code = await proc.exited;
    job.running = false;
    job.ended = Date.now();
    if (job.code === 0 && onDone) await onDone().catch((e) => job.lines.push(`post: ${e}`));
  });
  return job;
}

// ── แผนที่: PCA + mutual kNN + MST — พอร์ตคณิตจาก arra-memory-haos src/graph.ts ──
function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}
function project3(vectors: Float32Array[]): { coords: number[][]; explained: number } {
  const n = vectors.length, d = vectors[0]!.length;
  const mean = new Float32Array(d);
  for (const v of vectors) for (let i = 0; i < d; i++) mean[i]! += v[i]! / n;
  const centred = vectors.map((v) => {
    const out = new Float32Array(d);
    for (let i = 0; i < d; i++) out[i] = v[i]! - mean[i]!;
    return out;
  });
  let totalVar = 0;
  for (const v of centred) totalVar += dot(v, v);
  const comps: Float32Array[] = [];
  const captured: number[] = [];
  let seed = 42;
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };
  for (let c = 0; c < 3; c++) {
    let vec = new Float32Array(d);
    for (let i = 0; i < d; i++) vec[i] = rand();
    for (let iter = 0; iter < 64; iter++) {
      const next = new Float32Array(d);
      for (const row of centred) {
        const s = dot(row, vec);
        for (let i = 0; i < d; i++) next[i]! += s * row[i]!;
      }
      for (const prev of comps) {
        const s = dot(next, prev);
        for (let i = 0; i < d; i++) next[i]! -= s * prev[i]!;
      }
      const norm = Math.sqrt(dot(next, next));
      if (norm < 1e-9) break;
      for (let i = 0; i < d; i++) next[i]! /= norm;
      vec = next;
    }
    comps.push(vec);
    let variance = 0;
    for (const row of centred) variance += dot(row, vec) ** 2;
    captured.push(variance);
  }
  const coords = centred.map((row) => comps.map((c) => dot(row, c)));
  for (let axis = 0; axis < 3; axis++) {
    // normalize ด้วย p5/p95 แล้ว clamp — outlier ไม่กี่จุดจะได้ไม่บีบ cloud ทั้งก้อนไปมุมเดียว
    const vals = coords.map((c) => c[axis]!).sort((a, b) => a - b);
    const lo = vals[Math.floor(vals.length * 0.05)]!;
    const hi = vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.95))]!;
    const span = hi - lo || 1;
    for (const c of coords) c[axis] = Math.max(-1.2, Math.min(1.2, ((c[axis]! - lo) / span) * 2 - 1));
  }
  return { coords, explained: totalVar > 0 ? captured.reduce((a, b) => a + b, 0) / totalVar : 0 };
}
function mapEdges(sim: number[][], k: number) {
  const n = sim.length;
  const topK: Set<number>[] = [];
  for (let i = 0; i < n; i++)
    topK.push(new Set([...Array(n).keys()].filter((j) => j !== i)
      .sort((a, b) => sim[i]![b]! - sim[i]![a]!).slice(0, k)));
  const edges: { s: number; t: number; d: number; kind: string }[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < n; i++)
    for (const j of topK[i]!) {
      if (!topK[j]!.has(i)) continue;
      const key = i < j ? `${i}:${j}` : `${j}:${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ s: i, t: j, d: 1 - sim[i]![j]!, kind: "similar" });
    }
  const inTree = new Array(n).fill(false);
  inTree[0] = true;
  for (let added = 1; added < n; added++) {
    let best = { i: -1, j: -1, s: -Infinity };
    for (let i = 0; i < n; i++) {
      if (!inTree[i]) continue;
      for (let j = 0; j < n; j++)
        if (!inTree[j] && sim[i]![j]! > best.s) best = { i, j, s: sim[i]![j]! };
    }
    if (best.j === -1) break;
    inTree[best.j] = true;
    const key = best.i < best.j ? `${best.i}:${best.j}` : `${best.j}:${best.i}`;
    if (!seen.has(key)) { seen.add(key); edges.push({ s: best.i, t: best.j, d: 1 - best.s, kind: "bridge" }); }
  }
  return edges;
}
// เก็บหลาย scope ไม่ใช่ตัวเดียว — dropdown ชวนสลับไปกลับ ส่วน miss หนึ่งครั้งคือ PCA + kNN ใหม่ทั้งก้อน
const MAP_CACHE_MAX = 5;
const mapCache = new Map<string, string>();

// memory distance ระหว่าง repo: centroid ของ vectors ต่อ repo → cosine ต่อกัน (cache ตาม count)
let nbCache: { n: number; data: Record<string, { repo: string; d: number; n: number }[]> } | null = null;
async function repoNeighbors() {
  const vt = await vectorsTable();
  if (!vt) return null;
  const tbl = await vt;
  const nVec = await tbl.countRows();
  if (nbCache?.n === nVec) return nbCache.data;
  const sums = new Map<string, { v: Float64Array; n: number }>();
  for (const r of await tbl.query().select(["id", "vector"]).toArray() as any[]) {
    const repo = agg.byId.get(r.id)?.repo;
    if (!repo) continue;
    let s = sums.get(repo);
    const vec = Float32Array.from(r.vector);  // Arrow Vector index ตรงๆ ให้ undefined — ต้อง from()
    if (!s) sums.set(repo, s = { v: new Float64Array(vec.length), n: 0 });
    for (let i = 0; i < vec.length; i++) s.v[i]! += vec[i]!;
    s.n++;
  }
  const cents = [...sums.entries()].filter(([, s]) => s.n >= 20).map(([repo, s]) => {
    const c = new Float32Array(s.v.length);
    let norm = 0;
    for (let i = 0; i < s.v.length; i++) { c[i] = s.v[i]! / s.n; norm += c[i]! * c[i]!; }
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < c.length; i++) c[i]! /= norm;
    return { repo, c, n: s.n };
  });
  const data: Record<string, { repo: string; d: number; n: number }[]> = {};
  for (const a of cents) {
    data[a.repo] = cents.filter((b) => b !== a)
      .map((b) => ({ repo: b.repo, d: +(1 - dot(a.c, b.c)).toFixed(3), n: b.n }))
      .sort((x, y) => x.d - y.d);
  }
  nbCache = { n: nVec, data };
  return data;
}
async function buildMap(limit: number, scope: Set<string> | null) {
  const vt = await vectorsTable();
  if (!vt) return null;
  const tbl = await vt;
  let all = await tbl.query().select(["id", "file", "session", "line", "idx", "text", "vector"]).toArray() as any[];
  // ขยะ harness: <system-reminder> ฉีดซ้ำเป็นร้อยก้อนเหมือนกันเป๊ะ (d=0) — ดูด walk เข้า cluster ตัน
  // และยึด label แผนที่ — ตัดออกจากภาพ (ยังค้นเจอปกติในหน้าค้น)
  const JUNK = ["<system-reminder>", "[Image: source:"];
  all = all.filter((r) => { const t = String(r.text).trimStart(); return !JUNK.some((j) => t.startsWith(j)); });
  // scope = ชุดชื่อ repo ที่ขยายไว้แล้วในหน่วยความจำ (repo เดี่ยว หรือทุก repo ในกลุ่ม)
  if (scope) all = all.filter((r) => scope.has(agg.byId.get(r.id)?.repo ?? ""));
  const totalVec = all.length;
  if (totalVec < 2) return null;
  const step = Math.max(1, Math.ceil(all.length / limit));
  const rows = all.filter((_, i) => i % step === 0).slice(0, limit);
  const vectors = rows.map((r) => Float32Array.from(r.vector as number[]));
  if (vectors.length < 2) return null;
  const { coords, explained } = project3(vectors);
  const n = vectors.length;
  const sim: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const flat: number[] = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const s = dot(vectors[i]!, vectors[j]!);
      sim[i]![j] = s; sim[j]![i] = s; flat.push(1 - s);
    }
  flat.sort((a, b) => a - b);
  const k = Math.max(2, Math.min(12, Math.ceil(Math.sqrt(n))));
  const edges = mapEdges(sim, k);
  const degree = new Array(n).fill(0);
  for (const e of edges) if (e.kind === "similar") { degree[e.s]++; degree[e.t]++; }
  return {
    nodes: rows.map((r, i) => ({
      id: r.id, session: r.session, file: r.file, seq: r.line, line: r.line, idx: r.idx,
      title: String(r.text).replace(/\s+/g, " ").slice(0, 90),
      degree: degree[i], ts: agg.byId.get(r.id)?.ts ?? "", repo: agg.byId.get(r.id)?.repo ?? "",
      x: coords[i]![0], y: coords[i]![1], z: coords[i]![2],
    })),
    edges, explained, k,
    density: edges.length / ((n * (n - 1)) / 2),
    sampled: n, totalVectors: totalVec, unembedded: agg.stats.rows - totalVec,
    distance: flat.length
      ? { min: flat[0], max: flat[flat.length - 1], median: flat[Math.floor(flat.length / 2)] }
      : null,
  };
}

// ── อ่านบรรทัดดิบจากไฟล์จริง — raw tab: index ไม่ต้องเก็บต้นฉบับซ้ำ ──
async function rawLine(file: string, line: number): Promise<string | null> {
  if (!file.startsWith(`${process.env.HOME}/.claude/projects/`)) return null; // กันหลุด scope
  let n = 0;
  const rl = createInterface({ input: createReadStream(file) });
  for await (const l of rl) { n++; if (n === line) { rl.close(); return l; } }
  return null;
}

const topEntries = (m: Record<string, number>, n: number) =>
  Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n);

Bun.serve({
  port: PORT,
  idleTimeout: 120,
  async fetch(req) {
    const u = new URL(req.url);
    try {
      if (u.pathname === "/") return new Response(Bun.file(HTML));
      if (u.pathname === "/map") return new Response(Bun.file(MAPHTML));
      if (u.pathname === "/admin") return new Response(Bun.file(fileURLToPath(new URL("../ui/admin.html", import.meta.url))));
      if (u.pathname === "/insight") return new Response(Bun.file(fileURLToPath(new URL("../ui/insight.html", import.meta.url))));
      if (u.pathname === "/live") return new Response(Bun.file(fileURLToPath(new URL("../ui/live.html", import.meta.url))));
      // insight: ถาม LLM บน corpus — RAG ตรงไปตรงมา: embed คำถาม → vector topK → ส่งหลักฐานให้โมเดลตอบพร้อมอ้าง [n]
      if (u.pathname === "/api/insight" && req.method === "POST") {
        const body = await req.json().catch(() => ({}));
        const q = String(body.q ?? "").trim();
        if (!q) return json({ error: "ASK_SOMETHING" }, 400);
        const k = Math.max(4, Math.min(24, Number(body.k ?? 12)));
        const repo = String(body.repo ?? "").trim();
        const model = String(body.model ?? process.env.INSIGHT_MODEL ?? "qwen2.5:7b");
        const llmUrl = process.env.INSIGHT_URL ?? "http://localhost:18434"; // gpu1 ผ่าน ssh tunnel
        const vt = await vectorsTable();
        if (!vt) return json({ error: "NO_VECTORS" }, 409);
        const t0 = Date.now();
        const er = await fetch(`${OLLAMA}/api/embed`, {
          method: "POST", body: JSON.stringify({ model: "bge-m3", input: [q] }),
        });
        if (!er.ok) return json({ error: "EMBED_FAILED", status: er.status }, 502);
        const qv = ((await er.json()) as any).embeddings[0] as number[];
        const tE = Date.now();
        let hits = await (await vt).vectorSearch(qv).limit(repo ? k * 4 : k).toArray() as any[];
        if (repo) hits = hits.filter((h) => agg.byId.get(h.id)?.repo === repo).slice(0, k);
        const tS = Date.now();
        // ดึงเนื้อเต็ม (4000) จาก events — vectors เก็บแค่ 300
        const evidence: any[] = [];
        for (const h of hits) {
          const rows = await events.query().where(`id = '${esc(h.id)}'`)
            .select(["id", "repo", "session", "line", "role", "kind", "ts", "text"]).limit(1).toArray() as any[];
          const r = rows[0];
          if (r) evidence.push({ ...r, d: h._distance, text: String(r.text).slice(0, 1500) });
        }
        const ctxBlocks = evidence.map((e, i) =>
          `[${i + 1}] (${e.repo} · ${e.role} · ${(e.ts ?? "").slice(0, 10)})\n${e.text}`).join("\n\n---\n\n");
        const lr = await fetch(`${llmUrl}/api/chat`, {
          method: "POST",
          body: JSON.stringify({
            model, stream: false, think: false,
            options: { temperature: 0.3, num_ctx: 16384 },
            messages: [
              { role: "system", content: "/no_think\nคุณคือนักวิเคราะห์ความจำของ fleet โอราเคิล ตอบจากหลักฐานที่ให้เท่านั้น อ้างอิงด้วยเลข [n] ทุกข้อความสำคัญ ถ้าหลักฐานไม่พอให้บอกตรงๆ ตอบภาษาเดียวกับคำถาม กระชับ ห้ามบรรยายขั้นตอนคิด — ตอบเลย" },
              { role: "user", content: `คำถาม: ${q}\n\nหลักฐานจาก session logs (${evidence.length} ก้อน, เรียงตามความใกล้):\n\n${ctxBlocks}\n\n/no_think` },
            ],
          }),
        });
        if (!lr.ok) return json({ error: "LLM_FAILED", status: lr.status, detail: await lr.text() }, 502);
        const lj = (await lr.json()) as any;
        let answer = String(lj.message?.content ?? "");
        answer = answer.replace(/<think>[\s\S]*?<\/think>/g, "").trim(); // qwen3 คิดในใจ — ตัดทิ้ง
        return json({
          answer, model,
          evidence: evidence.map((e, i) => ({
            n: i + 1, id: e.id, repo: e.repo, session: e.session, line: e.line,
            role: e.role, ts: e.ts, d: e.d, snippet: e.text.slice(0, 200),
          })),
          took: { embed: tE - t0, search: tS - tE, llm: Date.now() - tS, total: Date.now() - t0 },
        });
      }
      // สคริปต์ร่วมของทุกหน้า — ตารางคำสองภาษา ต้องเสิร์ฟจริง ไม่งั้นหน้าเว็บโหลดไม่เจอ
      if (u.pathname === "/i18n.js")
        return new Response(Bun.file(fileURLToPath(new URL("../ui/i18n.js", import.meta.url))));
      // viz plugins: ไฟล์ js ใน ui/viz — เพิ่ม plugin = วางไฟล์ ไม่ต้องแตะ server
      if (u.pathname.startsWith("/viz/")) {
        const base = fileURLToPath(new URL("../ui/viz/", import.meta.url));
        const f = u.pathname.slice(5).replace(/[^a-zA-Z0-9._-]/g, "");
        if (u.pathname === "/viz/index.json") {
          const { readdirSync } = await import("node:fs");
          let files: string[] = []; try { files = readdirSync(base).filter((x) => x.endsWith(".js")); } catch {}
          return json(files);
        }
        return new Response(Bun.file(base + f));
      }
      if (u.pathname === "/api/map") {
        const limit = Math.max(10, Math.min(1200, Number(u.searchParams.get("limit") ?? 600)));
        const repo = u.searchParams.get("repo") ?? "";
        const group = u.searchParams.get("group") ?? "";
        // ว่างทั้งคู่ = ทั้งเครื่อง (กติกาเดิม) · repo ชนะ group ถ้าส่งมาทั้งคู่
        const scope = repo ? new Set([repo]) : group ? reposInGroup(group) : null;
        const vt = await vectorsTable();
        const nVec = vt ? await (await vt).countRows() : 0;
        if (!nVec) return json({ error: "NO_VECTORS" }, 409);
        const key = `${nVec}:${repo}:${group}:${limit}`;
        let body = mapCache.get(key);
        if (body === undefined) {
          const g = await buildMap(limit, scope);
          // เดิมข้อความนี้ประกอบครึ่งอังกฤษครึ่งไทยคร่อม client/server — ตอนนี้เป็นโค้ดเดียว scope เป็นพารามิเตอร์
          if (!g) return json({ error: "NOT_ENOUGH_VECTORS", scope: repo || group || "" }, 409);
          body = JSON.stringify({ ...g, repo, group });
          if (mapCache.size >= MAP_CACHE_MAX) mapCache.delete(mapCache.keys().next().value!);
          mapCache.set(key, body);
        } else {
          mapCache.delete(key); mapCache.set(key, body);   // แตะแล้วเลื่อนไปท้ายคิว — ตัวเก่าสุดโดนทิ้งก่อน
        }
        return new Response(body, { headers: { "content-type": "application/json" } });
      }
      // repo context: สถิติ / topics (summaries+tools) / memory distance (centroid ต่อ repo)
      if (u.pathname === "/api/repo") {
        const name = u.searchParams.get("name") ?? "";
        if (!name) return json({ error: "NAME_REQUIRED" }, 400);
        const rows = await events.query().where(`repo = '${esc(name)}'`)
          .select(["session", "file", "kind", "role", "tier", "tool", "ts", "text", "n_chars"]).toArray() as any[];
        if (!rows.length) return json({ error: "REPO_NOT_FOUND", name }, 404);
        const kinds: any = {}, tools: any = {}, days: any = {};
        const sess = new Set<string>();
        let first = "", last = "";
        for (const r of rows) {
          count(kinds, r.kind); if (r.kind === "tool_use") count(tools, r.tool);
          sess.add(r.file);
          const d = (r.ts ?? "").slice(0, 10);
          if (d) { days[d] = (days[d] ?? 0) + 1; if (!first || d < first) first = d; if (d > last) last = d; }
        }
        const summaries = rows.filter((r) => r.kind === "summary")
          .sort((a, b) => (b.ts ?? "").localeCompare(a.ts ?? "")).slice(0, 10)
          .map((r) => ({ ts: r.ts, text: String(r.text).slice(0, 160) }));
        // memory distance: centroid ของ vectors ต่อ repo (cache ตาม vector count)
        const nb = await repoNeighbors();
        return json({
          name, blocks: rows.length, sessions: sess.size, first, last,
          kinds, tools: topEntries(tools, 10),
          days: Object.entries(days).sort(),
          summaries, neighbors: nb?.[name] ?? null,
        });
      }
      if (u.pathname === "/api/refresh") { agg = await aggregate(); mapCache.clear(); return json({ ok: true, rows: agg.stats.rows }); }
      // preflight: เช็คก่อนเริ่ม — อะไรทำแล้ว / อะไรใหม่ (ไม่เขียนอะไรทั้งนั้น)
      if (u.pathname === "/api/preflight") {
        const name = u.searchParams.get("name") ?? "";
        if (name === "import") {
          const { readdirSync, statSync } = await import("node:fs");
          const { join } = await import("node:path");
          const ROOT = `${process.env.HOME}/.claude/projects`;
          const found: { path: string; mtime: number; size: number }[] = [];
          for (const proj of readdirSync(ROOT)) {
            const pd = join(ROOT, proj);
            let entries: string[] = []; try { entries = readdirSync(pd); } catch { continue; }
            for (const e of entries) {
              const p = join(pd, e);
              if (e.endsWith(".jsonl")) { const s = statSync(p); found.push({ path: p, mtime: s.mtimeMs, size: s.size }); }
              else {
                const sub = join(p, "subagents");
                let subs: string[] = []; try { subs = readdirSync(sub); } catch { continue; }
                for (const se of subs) {
                  if (se.endsWith(".jsonl") && se !== "journal.jsonl") {
                    const s = statSync(join(sub, se)); found.push({ path: join(sub, se), mtime: s.mtimeMs, size: s.size });
                  } else if (se === "workflows") {
                    for (const wf of readdirSync(join(sub, se))) {
                      if (!wf.startsWith("wf_")) continue;
                      for (const f of readdirSync(join(sub, se, wf)))
                        if (f.endsWith(".jsonl") && f !== "journal.jsonl") {
                          const fp = join(sub, se, wf, f); const s = statSync(fp);
                          found.push({ path: fp, mtime: s.mtimeMs, size: s.size });
                        }
                    }
                  }
                }
              }
            }
          }
          const known = new Map<string, { mtime: number; size: number }>();
          if ((await db.tableNames()).includes("files"))
            for (const r of await (await db.openTable("files")).query().toArray() as any[])
              known.set(r.path, { mtime: r.mtime, size: r.size });
          let fresh = 0, changed = 0, unchanged = 0;
          for (const f of found) {
            const k = known.get(f.path);
            if (!k) fresh++;
            else if (k.mtime === f.mtime && k.size === f.size) unchanged++;
            else changed++;
          }
          return json({ name, found: found.length, new: fresh, changed, unchanged, willImport: fresh + changed });
        }
        if (name === "embed") {
          const candidates = agg.kinds["text"] ?? 0; // ประมาณจาก aggregate (n_chars>80 กรองตอนรันจริง)
          const vt = await vectorsTable();
          const done = vt ? await (await vt).countRows() : 0;
          return json({ name, candidates, embedded: done, remaining: Math.max(0, candidates - done) });
        }
        return json({ error: "UNKNOWN_PREFLIGHT", name }, 400);
      }
      if (u.pathname === "/api/import" && req.method === "POST") {
        const j = runJob("import", ["import.ts"], async () => { agg = await aggregate(); mapCache.clear(); });
        return json({ started: !!j, id: j?.id, note: j ? "JOB_STARTED" : "JOB_ALREADY_RUNNING", name: "import" }, j ? 200 : 409);
      }
      if (u.pathname === "/api/embed" && req.method === "POST") {
        const n = Math.max(1, Math.min(100000, Number(u.searchParams.get("n") ?? 2000)));
        // gpus=1 → กระจาย m5 + gpu1/gpu2 ผ่าน ssh tunnel (18434/18435) แบบ work-stealing
        const GPU_URLS = "http://localhost:11434,http://localhost:18434,http://localhost:18435";
        const env = u.searchParams.get("gpus") ? { OLLAMA_URLS: GPU_URLS } : undefined;
        const j = runJob("embed", ["embed.ts", String(n)], async () => { mapCache.clear(); }, env);
        return json({ started: !!j, id: j?.id, n, gpus: !!env, note: j ? "JOB_STARTED" : "JOB_ALREADY_RUNNING", name: "embed" }, j ? 200 : 409);
      }
      // kill: หยุดงานที่วิ่งอยู่ — ปลอดภัยเพราะ import idempotent / embed incremental (รันใหม่ต่อจากเดิม)
      if (u.pathname === "/api/job-kill" && req.method === "POST") {
        const id = Number(u.searchParams.get("id") ?? 0);
        const j = id ? jobList.find((x) => x.id === id) : activeByName(u.searchParams.get("name") ?? "");
        if (!j) return json({ error: "JOB_NOT_FOUND" }, 404);
        if (!j.running) return json({ error: "JOB_NOT_RUNNING" }, 409);
        j.lines.push(`${SRV_LINE}JOB_KILLED`);   // บรรทัดที่ server เขียนเอง ต้องเป็นโค้ด ไม่ใช่ประโยค
        j.proc?.kill();
        return json({ killed: true, id: j.id });
      }
      // tty-style incremental log: ?id=7 หรือ ?name=embed (ตัวล่าสุดของชนิดนั้น) &from=N
      if (u.pathname === "/api/job-log") {
        const id = Number(u.searchParams.get("id") ?? 0);
        const j = id ? jobList.find((x) => x.id === id) : latestByName(u.searchParams.get("name") ?? "");
        if (!j) return json({ error: "JOB_NOT_FOUND" }, 404);
        const from = Math.max(Number(u.searchParams.get("from") ?? 0), j.offset);
        return json({
          id: j.id, name: j.name, running: j.running, code: j.code,
          next: j.offset + j.lines.length, lines: j.lines.slice(from - j.offset),
        });
      }
      if (u.pathname === "/api/jobs") {
        const vt = await vectorsTable();
        return json({
          jobs: [...jobList].reverse().map((j) => ({
            id: j.id, name: j.name, args: j.args.slice(1).join(" "),
            running: j.running, code: j.code, started: j.started,
            elapsed_s: Math.round(((j.ended ?? Date.now()) - j.started) / 1000),
            last: j.lines[j.lines.length - 1] ?? "",
          })),
          vectors: vt ? await (await vt).countRows() : 0,
          rows: agg.stats.rows, files: agg.stats.sessions,
          textCandidates: agg.kinds["text"] ?? 0,
        });
      }
      if (u.pathname === "/api/facets") {
        const vt = await vectorsTable();
        return json({
          corpus: { ...agg.stats, vectors: vt ? await (await vt).countRows() : 0 },
          kinds: topEntries(agg.kinds, 8), roles: topEntries(agg.roles, 5),
          tiers: topEntries(agg.tiers, 5), repos: topEntries(agg.repos, 14),
          tools: topEntries(agg.tools, 18), models: topEntries(agg.models, 8),
          groups: groupList(),
        });
      }
      // timeline: block รอบๆ บรรทัดที่เลือก เรียงตาม (line, idx)
      if (u.pathname === "/api/session") {
        const file = u.searchParams.get("file") ?? "";
        const center = Number(u.searchParams.get("center") ?? 0);
        const rows = await events.query().where(`file = '${esc(file)}'`)
          .select(["line", "idx", "kind", "role", "tool", "ts", "text"]).toArray() as any[];
        rows.sort((a, b) => a.line - b.line || a.idx - b.idx);
        let at = center ? rows.findIndex((r) => r.line >= center) : 0;
        if (at < 0) at = 0;
        const from = Math.max(0, at - 20);
        return json({
          total: rows.length, from,
          rows: rows.slice(from, from + 60).map((r) => ({ ...r, text: String(r.text).slice(0, 700) })),
        });
      }
      if (u.pathname === "/api/event") {
        const id = u.searchParams.get("id") ?? "";
        const rows = await events.query().where(`id = '${esc(id)}'`)
          .select(["line", "idx", "kind", "role", "tool", "model", "repo", "ts", "n_chars", "text"])
          .limit(1).toArray() as any[];
        return json(rows[0] ?? { error: "NOT_FOUND" }, rows[0] ? 200 : 404);
      }
      if (u.pathname === "/api/raw") {
        const file = u.searchParams.get("file") ?? "";
        const line = Number(u.searchParams.get("line") ?? 0);
        const raw = await rawLine(file, line);
        return raw === null ? json({ error: "NOT_FOUND" }, 404)
          : new Response(raw, { headers: { "content-type": "application/json" } });
      }
      if (u.pathname === "/api/search") {
        const q = (u.searchParams.get("q") ?? "").trim();
        const mode = u.searchParams.get("mode") ?? "text";
        const F: Record<string, string> = {};
        for (const g of ["kind", "role", "tier", "repo", "tool", "model", "session"])
          F[g] = u.searchParams.get(g) ?? "";
        const t0 = Date.now();
        const pass = (r: any) => Object.entries(F).every(([g, v]) => !v || r[g] === v);

        if (!q) {
          const hasFilter = Object.values(F).some(Boolean);
          const fresh = u.searchParams.get("fresh") === "1";
          if (!hasFilter && !fresh) {
            const rows = agg.recent.filter(pass).slice(0, 120);
            return json({ mode: "browse", n: rows.length, took: { db: 0, total: Date.now() - t0 }, rows });
          }
          if (fresh) {
            // live feed: ยิงตรงตาราง ไม่ผ่าน aggregate cache (cache ตามหลัง re-agg ได้เป็นนาที)
            const since = new Date(Date.now() - 3 * 3600_000).toISOString();
            const conds = [`ts >= '${since}'`,
              ...Object.entries(F).filter(([, v]) => v).map(([g, v]) => `${g} = '${esc(v)}'`)];
            const rows = await events.query().where(conds.join(" AND "))
              .select(["id", "file", "session", "line", "idx", "kind", "role", "tier", "repo", "tool", "model", "ts", "text"])
              .toArray() as any[];
            rows.sort((a, b) => (b.ts ?? "").localeCompare(a.ts ?? ""));
            return json({
              mode: "browse-fresh", n: rows.length, took: { db: Date.now() - t0, total: Date.now() - t0 },
              rows: rows.slice(0, 120).map((r) => ({ ...r, text: String(r.text).slice(0, 400) })),
            });
          }
          // มี filter → query ทั้งตารางตรงๆ — cache browse มีแค่ 2000 แถวใหม่สุด
          // (repo ที่เงียบช่วงนี้จะไม่มีสักแถวในนั้น = "ไม่เจอ" หลอกๆ)
          const conds = Object.entries(F).filter(([, v]) => v).map(([g, v]) => `${g} = '${esc(v)}'`);
          const rows = await events.query().where(conds.join(" AND "))
            .select(["id", "file", "session", "line", "idx", "kind", "role", "tier", "repo", "tool", "model", "ts", "text"])
            .toArray() as any[];
          rows.sort((a, b) => (b.ts ?? "").localeCompare(a.ts ?? ""));
          return json({
            mode: "browse", n: rows.length, took: { db: Date.now() - t0, total: Date.now() - t0 },
            rows: rows.slice(0, 120).map((r) => ({ ...r, text: String(r.text).slice(0, 400) })),
          });
        }
        const textSearch = async (limit: number) => {
          const conds = [`ltext LIKE '%${esc(q.toLowerCase())}%'`];
          for (const [g, v] of Object.entries(F)) if (v) conds.push(`${g} = '${esc(v)}'`);
          const rows = await events.query().where(conds.join(" AND "))
            .select(["id", "file", "session", "line", "idx", "kind", "role", "tier", "repo", "tool", "model", "ts", "text"])
            .limit(limit).toArray() as any[];
          rows.sort((a, b) => (b.ts ?? "").localeCompare(a.ts ?? ""));
          return rows.map((r) => ({ ...r, text: String(r.text).slice(0, 1200) }));
        };
        const vecSearch = async (limit: number) => {
          const vt = await vectorsTable();
          if (!vt) return null;
          const res = await fetch(`${OLLAMA}/api/embed`, {
            method: "POST", body: JSON.stringify({ model: "bge-m3", input: [q] }),
          });
          if (!res.ok) throw new Error(`ollama ${res.status}`);
          const qv = ((await res.json()) as any).embeddings[0] as number[];
          let query = (await vt).vectorSearch(qv);
          if (F.session) query = query.where(`session = '${esc(F.session)}'`);
          const hits = await query.limit(limit).toArray() as any[];
          return hits
            .map((h) => ({ id: h.id, file: h.file, session: h.session, line: h.line, idx: h.idx, d: h._distance, text: h.text, ...(agg.byId.get(h.id) ?? {}) }))
            .filter(pass);
        };
        if (mode === "text") {
          const rows = await textSearch(120);
          return json({ mode, n: rows.length, took: { db: Date.now() - t0, total: Date.now() - t0 }, rows: rows.slice(0, 60) });
        }
        if (mode === "vector") {
          const rows = await vecSearch(60);
          if (!rows) return json({ error: "NO_VECTORS" }, 409);
          return json({ mode, n: rows.length, took: { total: Date.now() - t0 }, rows });
        }
        // hybrid: RRF k=60 — โหมดให้เลือก ไม่ใช่ default (eval haos: known-item fts เดี่ยวชนะ)
        const [tr, vr] = await Promise.all([textSearch(100), vecSearch(60)]);
        if (!vr) return json({ error: "HYBRID_NEEDS_VECTORS" }, 409);
        const K = 60;
        const fused = new Map<string, any>();
        tr.forEach((r, i) => fused.set(r.id, { ...r, ftsRank: i + 1, score: 1 / (K + i + 1) }));
        vr.forEach((r, i) => {
          const f = fused.get(r.id);
          if (f) { f.vecRank = i + 1; f.d = r.d; f.score += 1 / (K + i + 1); }
          else fused.set(r.id, { ...r, vecRank: i + 1, score: 1 / (K + i + 1) });
        });
        const rows = [...fused.values()].sort((a, b) => b.score - a.score).slice(0, 60);
        return json({ mode: "hybrid", n: rows.length, took: { total: Date.now() - t0 }, rows });
      }
      return new Response("not found", { status: 404 });
    } catch (e: any) {
      return json({ error: "SERVER_ERROR", detail: String(e?.message ?? e) }, 500);
    }
  },
});
console.log(`lance-indexer ui: http://localhost:${PORT}  (db: ${DIR})`);
