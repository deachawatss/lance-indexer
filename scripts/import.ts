// lance-indexer: IMPORT v2 — jsonl 3 ชั้น → LanceDB, granularity = CONTENT BLOCK (พอร์ต flatten จาก haos jsonl-lance)
// หนึ่ง assistant turn มี thinking + prose + tool calls หลายก้อน — hit ควรชี้ก้อนที่โดน ไม่ใช่ทั้ง turn
// v2 default = ทั้งเครื่อง (ONLY=1 จำกัดเฉพาะ digger) · line = เลขบรรทัดจริงในไฟล์ (raw tab อ่านคืนได้)
// รันซ้ำ = BACKFILL: (path,mtime,size) ไม่เปลี่ยน → ข้าม
import * as lancedb from "@lancedb/lancedb";
import { readdirSync, statSync, createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = `${process.env.HOME}/.claude/projects`;
const DIR = fileURLToPath(new URL("../.data/lancedb", import.meta.url));
const ONLY = process.env.ONLY ? "-opt-Code-github-com-Soul-Brews-Studio-digger-oracle" : null;
const CAP = 4000; // indexer ไม่ใช่ archive — raw tab ชี้กลับ (file,line) อ่านต้นฉบับเสมอ

// ---- 1. DISCOVER: เดิน 3 ชั้น ข้าม journal.jsonl ----
type F = { path: string; tier: string; mtime: number; size: number };
const found: F[] = [];
for (const proj of readdirSync(ROOT)) {
  if (ONLY && !proj.startsWith(ONLY)) continue;
  const pd = join(ROOT, proj);
  let entries: string[] = []; try { entries = readdirSync(pd); } catch { continue; }
  for (const e of entries) {
    const p = join(pd, e);
    if (e.endsWith(".jsonl")) { const s = statSync(p); found.push({ path: p, tier: "session", mtime: s.mtimeMs, size: s.size }); }
    else {
      const sub = join(p, "subagents");
      let subs: string[] = []; try { subs = readdirSync(sub); } catch { continue; }
      for (const se of subs) {
        if (se.endsWith(".jsonl") && se !== "journal.jsonl") {
          const s = statSync(join(sub, se)); found.push({ path: join(sub, se), tier: "subagent", mtime: s.mtimeMs, size: s.size });
        } else if (se === "workflows") {
          for (const wf of readdirSync(join(sub, se))) {
            if (!wf.startsWith("wf_")) continue;
            for (const f of readdirSync(join(sub, se, wf))) {
              if (f.endsWith(".jsonl") && f !== "journal.jsonl") {
                const fp = join(sub, se, wf, f); const s = statSync(fp);
                found.push({ path: fp, tier: "workflow_agent", mtime: s.mtimeMs, size: s.size });
              }
            }
          }
        }
      }
    }
  }
}

// ---- 2. FLATTEN: 1 บรรทัด → 0..n block rows (พอร์ตจาก haos flatten.ts) ----
const KEEP = new Set(["user", "assistant", "summary"]);
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
function resultText(c: unknown): string {
  if (typeof c === "string") return c;
  if (Array.isArray(c))
    return c.map((b: any) => (typeof b === "string" ? b : b?.type === "text" ? str(b.text) : "")).filter(Boolean).join("\n");
  if (c && typeof c === "object") { try { return JSON.stringify(c); } catch { return ""; } }
  return "";
}
function flatten(o: any, f: F, line: number, session: string): any[] {
  const type = str(o?.type);
  if (!KEEP.has(type)) return [];
  const out: any[] = [];
  const base = {
    file: f.path, line, session, tier: f.tier,
    repo: basename(str(o.cwd)) || "?",          // repo = basename(cwd) — เคล็ดจาก haos
    role: type, model: str(o?.message?.model),
    ts: str(o.timestamp),
  };
  const push = (kind: string, tool: string, text: string, idx: number) => {
    if (!text.trim()) return;
    const t = text.slice(0, CAP);
    out.push({ ...base, id: `${f.path}#${line}#${idx}`, idx, kind, tool, n_chars: text.length, text: t, ltext: t.toLowerCase() });
  };
  if (type === "summary") { push("summary", "", str(o.summary), 0); return out; }
  const c = o?.message?.content;
  if (typeof c === "string") { push("text", "", c, 0); return out; }
  if (!Array.isArray(c)) return out;
  c.forEach((b: any, i: number) => {
    switch (b?.type) {
      case "text": push("text", "", str(b.text), i); break;
      case "thinking": push("thinking", "", str(b.thinking), i); break;
      case "tool_use": { let inp = ""; try { inp = JSON.stringify(b.input); } catch {} push("tool_use", str(b.name), inp, i); break; }
      case "tool_result": push("tool_result", "", resultText(b.content), i); break;
      case "image": push("image", "", "[image]", i); break;
    }
  });
  return out;
}

// ---- 3. MANIFEST diff ใน JS ----
const db = await lancedb.connect(DIR);
let names = await db.tableNames();
const known = new Map<string, { mtime: number; size: number }>();
if (names.includes("files"))
  for (const r of await (await db.openTable("files")).query().toArray() as any[])
    known.set(r.path, { mtime: r.mtime, size: r.size });
const changed = found.filter((f) => {
  const k = known.get(f.path);
  return !(k && k.mtime === f.mtime && k.size === f.size);
});

// ---- 4. READ + WRITE เป็น chunk (ไฟล์ทั้งเครื่องใหญ่เกินกว่าอัดเดียว) ----
let blocks = 0, corrupt = 0;
const t0 = Date.now();
let buf: any[] = [];
const fileRows: any[] = [];
async function flush() {
  if (!buf.length) return;
  names = await db.tableNames();
  if (!names.includes("events")) {
    const tbl = await db.createTable("events", buf);
    const n = await tbl.countRows();
    if (n !== buf.length) throw new Error(`silent insert! ${n} != ${buf.length}`);
  } else {
    const tbl = await db.openTable("events");
    for (let i = 0; i < buf.length; i += 5000)
      await tbl.mergeInsert("id").whenMatchedUpdateAll().whenNotMatchedInsertAll().execute(buf.slice(i, i + 5000));
  }
  blocks += buf.length; buf = [];
  console.log(`progress ${blocks} blocks…`);  // UI jobs panel อ่านบรรทัดนี้โชว์สด
}
for (const f of changed) {
  let line = 0;
  const session = basename(f.path, ".jsonl");
  const rl = createInterface({ input: createReadStream(f.path) });
  for await (const raw of rl) {
    line++;                                    // เลขบรรทัดจริง (รวมบรรทัดว่าง) — สัญญา raw tab
    if (!raw.trim()) continue;
    let o: any; try { o = JSON.parse(raw); } catch { corrupt++; continue; }
    buf.push(...flatten(o, f, line, session));
    if (buf.length >= 20000) await flush();
  }
  fileRows.push({ path: f.path, tier: f.tier, mtime: f.mtime, size: f.size });
}
await flush();
if (fileRows.length) {
  names = await db.tableNames();
  if (!names.includes("files")) await db.createTable("files", fileRows);
  else {
    const ft = await db.openTable("files");
    for (let i = 0; i < fileRows.length; i += 5000)
      await ft.mergeInsert("path").whenMatchedUpdateAll().whenNotMatchedInsertAll().execute(fileRows.slice(i, i + 5000));
  }
}

const total = (await db.tableNames()).includes("events")
  ? await (await db.openTable("events")).countRows() : 0;
console.log(`discover: ${found.length} files (ข้าม journal.jsonl)${ONLY ? " [ONLY digger]" : " [ทั้งเครื่อง]"}`);
console.log(`import:   new/changed=${changed.length}  unchanged-skipped=${found.length - changed.length}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
console.log(`blocks:   +${blocks} upserted this run, ${total} in table, corrupt=${corrupt}`);
console.log(`db:       ${DIR}`);
