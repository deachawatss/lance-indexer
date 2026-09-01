// lance-indexer: COMPARE — LanceDB (lab นี้) vs SQLite FTS5 (jsonl-proofs) บน corpus เดียวกัน
// วัดจริงทั้งคู่ query 2 รอบรายงานรอบ 2 (cold/warm ตาม craft ของ nexus) — เขียนผลลง COMPARE.md
import * as lancedb from "@lancedb/lancedb";
import { Database } from "bun:sqlite";
import { fileURLToPath } from "node:url";
import { statSync } from "node:fs";

const LDIR = fileURLToPath(new URL("../.data/lancedb", import.meta.url));
const SDB = fileURLToPath(new URL("../../jsonl-proofs/.data/proof.db", import.meta.url));
const OUT = fileURLToPath(new URL("../COMPARE.md", import.meta.url));
const OLLAMA = process.env.OLLAMA_URL ?? "http://localhost:11434";

const db = await lancedb.connect(LDIR);
const events = await db.openTable("events");
const vectors = (await db.tableNames()).includes("vectors") ? await db.openTable("vectors") : null;
const sq = new Database(SDB, { readonly: true });
const esc = (s: string) => s.replace(/'/g, "''");

const lanceN = await events.countRows();
const sqN = (sq.query("SELECT count(*) n FROM events").get() as any).n;
const vecN = vectors ? await vectors.countRows() : 0;

async function time2(fn: () => Promise<number> | number): Promise<{ ms: number; n: number }> {
  await fn(); // รอบ 1 ทิ้ง (warm-up)
  const t0 = performance.now();
  const n = await fn();
  return { ms: +(performance.now() - t0).toFixed(1), n };
}

const QS = ["trigram", "lancedb", "ความ", "วรรณยุกต์"];
type Row = { q: string; ftri: any; fts: any; like: any; sem: any };
const results: Row[] = [];
for (const q of QS) {
  const ftri = await time2(() =>
    (sq.query(`SELECT count(*) n FROM ftri WHERE ftri MATCH ?`).get(`"${q}"`) as any).n);
  const fts = await time2(() =>
    (sq.query(`SELECT count(*) n FROM fts WHERE fts MATCH ?`).get(`"${q}"`) as any).n);
  const like = await time2(async () =>
    (await events.query().where(`ltext LIKE '%${esc(q.toLowerCase())}%'`).select(["id"]).toArray()).length);
  let sem: any = { ms: "—", n: "—" };
  if (vectors) {
    const res = await fetch(`${OLLAMA}/api/embed`, {
      method: "POST", body: JSON.stringify({ model: "bge-m3", input: [q] }),
    });
    const qv = ((await res.json()) as any).embeddings[0] as number[];
    sem = await time2(async () => (await vectors.vectorSearch(qv).limit(10).toArray()).length);
  }
  results.push({ q, ftri, fts, like, sem });
}

// ขนาดบนดิสก์
const duLance = Number(Bun.spawnSync(["du", "-sk", LDIR]).stdout.toString().split("\t")[0]);
const sqKB = Math.round(statSync(SDB).size / 1024);

const lines: string[] = [];
lines.push(`# COMPARE — LanceDB indexer vs SQLite FTS5 (measured ${new Date().toISOString().slice(0, 16)}Z, m5)`);
lines.push("");
lines.push(`corpus: digger-oracle project sessions — Lance events **${lanceN}**, sqlite events **${sqN}** (ต่างกันได้เพราะ live session โตระหว่าง import) · vectors **${vecN}** (subset len>80)`);
lines.push("");
lines.push(`| query | FTS5 trigram | FTS5 unicode61 | Lance LIKE scan | Lance vector top-10 |`);
lines.push(`|---|---|---|---|---|`);
for (const r of results)
  lines.push(`| \`${r.q}\` | ${r.ftri.n} hits · ${r.ftri.ms}ms | ${r.fts.n} hits · ${r.fts.ms}ms | ${r.like.n} hits · ${r.like.ms}ms | ${r.sem.n} @ ${r.sem.ms}ms |`);
lines.push("");
lines.push(`| storage | size |`);
lines.push(`|---|---|`);
lines.push(`| LanceDB dir (events+files+vectors ${vecN}×1024d) | ${(duLance / 1024).toFixed(1)} MB |`);
lines.push(`| proof.db (events + FTS ×2) | ${(sqKB / 1024).toFixed(1)} MB |`);
lines.push("");
lines.push(`อ่านผล:`);
lines.push(`- **lexical แม่น + เร็วสุด = FTS5 trigram** — index จริง, ไทย substring ได้`);
lines.push(`- **Lance LIKE = full scan** ไม่มี text index (tantivy FTS ช้ากว่า FTS5 10-200x เลยไม่ใช้) — ที่ corpus นี้ยังเร็วพอ (< สิบ ms) แต่โตแล้วแพ้แน่`);
lines.push(`- **vector ตอบคนละคำถาม** — ความหมายข้ามภาษา ไม่ใช่ substring; latency คงที่ตาม nexus (query แบนตาม scale)`);
lines.push(`- ตรง #157: **LanceDB (vectors) + FTS5 trigram (lexical) คู่กัน** — ตัวเดียวไม่พอทั้งคู่`);
lines.push(`- caveat: Lance เก็บ text CAP 4000 chars/event, proof.db เก็บเต็ม — hit count Lance ต่ำกว่าเล็กน้อยเพราะคำที่อยู่หลัง 4000 หาย และขนาด 10.7 vs 39.7 MB ก็เทียบตรงๆ ไม่ได้ (proof.db แบก FTS ×2 + full text)`);
await Bun.write(OUT, lines.join("\n") + "\n");
console.log(lines.join("\n"));
console.log(`\nwrote: ${OUT}`);
