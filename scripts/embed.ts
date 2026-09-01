// lance-indexer: EMBED — เติม vectors table ทีหลัง (import ไม่รอ embed — คนละตาราง join ด้วย id)
// v2: embed เฉพาะ block kind=text ยาวพอ — tool_use/tool_result เป็น JSON/log embed แล้วจม signal
// incremental: ข้าม id ที่ embed แล้ว — รันซ้ำได้เรื่อยๆ จนครบ · batch 8 ตาม sweep ของ nexus
import * as lancedb from "@lancedb/lancedb";
import { fileURLToPath } from "node:url";
const DIR = fileURLToPath(new URL("../.data/lancedb", import.meta.url));
const OLLAMA = process.env.OLLAMA_URL ?? "http://localhost:11434";
// multi-GPU: OLLAMA_URLS=คั่น comma (m5 + gpu1/gpu2 ผ่าน ssh tunnel — WireGuard พังก็ยังได้)
// work-stealing: เครื่องเร็วหยิบก้อนถัดไปเอง ไม่ต้องแบ่งล่วงหน้า
const URLS = (process.env.OLLAMA_URLS ?? OLLAMA).split(",").map((s) => s.trim()).filter(Boolean);
const N = Number(process.argv[2] ?? 300);
const BATCH = 8;

const db = await lancedb.connect(DIR);
const events = await db.openTable("events");
const rows = (await events.query()
  .where(`kind = 'text' AND n_chars > 80`)
  .select(["id", "file", "session", "line", "idx", "role", "text"]).toArray() as any[])
  // system-reminder = ข้อความ harness ฉีดซ้ำเหมือนกันเป๊ะหลายร้อยก้อน — embed ไปมีแต่สร้าง dup cluster
  .filter((r) => { const t = String(r.text).trimStart(); return !t.startsWith("<system-reminder>") && !t.startsWith("[Image: source:"); });
// divide-and-conquer เชิงลำดับ: user (คำถาม/intent = ground truth) ก่อน assistant —
// throughput เท่าเดิม (คอขวด = GPU) แต่ coverage ที่ "ค้นเจอจริง" มาเร็วกว่า
const RANK: Record<string, number> = { user: 0, summary: 1, assistant: 2 };
rows.sort((a, b) => (RANK[a.role] ?? 3) - (RANK[b.role] ?? 3));

const names = await db.tableNames();
const done = new Set<string>();
if (names.includes("vectors"))
  for (const r of await (await db.openTable("vectors")).query().select(["id"]).toArray() as any[])
    done.add(r.id);

const todo = rows.filter((r) => !done.has(r.id)).slice(0, N);
console.log(`candidates ${rows.length} (kind=text, n_chars>80) · embedded already ${done.size} · this run ${todo.length}`);
if (!todo.length) { console.log("nothing to embed"); process.exit(0); }

console.log(`endpoints: ${URLS.join("  ")}`);
const t0 = Date.now();
const out: any[] = [];
const perUrl = new Map<string, number>(URLS.map((u) => [u, 0]));
let cursor = 0, lastReport = 0, written = 0, flushing = Promise.resolve();

// เขียนลง db เป็น chunk — บทเรียนแพง: รอบก่อน buffer 29K แล้วเขียนตอนจบ เจอ schema ชน = งาน GPU หายหมด
async function flushDb(force = false) {
  if (!force && out.length - written < 2000) return;
  const chunk = out.slice(written);
  if (!chunk.length) return;
  written += chunk.length;
  flushing = flushing.then(async () => {   // เขียนทีละคิว กัน mergeInsert ชนกันเอง
    if (!(await db.tableNames()).includes("vectors")) {
      const vt = await db.createTable("vectors", chunk);
      const n = await vt.countRows();
      if (n !== chunk.length) throw new Error(`vectors: silent insert! ${n} != ${chunk.length}`);
    } else {
      const vt = await db.openTable("vectors");
      await vt.mergeInsert("id").whenMatchedUpdateAll().whenNotMatchedInsertAll().execute(chunk);
    }
    console.log(`flushed ${written} rows to db`);
  });
  await flushing;
}
async function worker(url: string) {
  for (;;) {
    const i = cursor;
    if (i >= todo.length) return;
    cursor += BATCH;
    const chunk = todo.slice(i, i + BATCH);
    let embeddings: number[][];
    try {
      const res = await fetch(`${url}/api/embed`, {
        method: "POST",
        body: JSON.stringify({ model: "bge-m3", input: chunk.map((r) => String(r.text).slice(0, 2000)) }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      ({ embeddings } = (await res.json()) as { embeddings: number[][] });
      if (embeddings.length !== chunk.length) throw new Error("count mismatch");
    } catch (e) {
      // endpoint ตาย → ถอนตัว คนอื่นทำต่อ; ก้อนนี้คืน (id ยังไม่อยู่ใน vectors รอบหน้าเก็บเอง)
      console.log(`worker ${url} ตาย: ${e} — ถอนตัว (เหลือ ${URLS.filter((u) => perUrl.get(u)! >= 0).length - 1} ตัว)`);
      perUrl.set(url, -1);
      return;
    }
    chunk.forEach((r, j) => out.push({
      id: r.id, file: r.file, session: r.session, line: r.line, idx: r.idx, role: r.role,
      text: String(r.text).slice(0, 300), vector: embeddings[j],
    }));
    perUrl.set(url, perUrl.get(url)! + chunk.length);
    if (out.length - lastReport >= 200) {
      lastReport = out.length;
      const rate = out.length / ((Date.now() - t0) / 1000);
      const shares = URLS.map((u) => `${u.replace(/https?:\/\//, "")}=${Math.max(perUrl.get(u)!, 0)}`).join(" ");
      console.log(`progress ${out.length}/${todo.length} @ ${rate.toFixed(1)} emb/s · ${shares} · เหลือ ~${Math.round((todo.length - out.length) / rate / 60)}m`);
      await flushDb();
    }
  }
}
await Promise.all(URLS.map(worker));
if (!out.length) throw new Error("ทุก endpoint ตาย — ไม่มีอะไร embed ได้");
await flushDb(true);
const secs = (Date.now() - t0) / 1000;
const total = await (await db.openTable("vectors")).countRows();
console.log(`embedded ${out.length} @ ${(out.length / secs).toFixed(1)} emb/s (batch ${BATCH}) · vectors total ${total}`);
