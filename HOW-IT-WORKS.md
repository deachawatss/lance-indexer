# lance-indexer ทำงานยังไง

เอกสารนี้อธิบายทั้ง pipeline ตั้งแต่ไฟล์ jsonl ดิบจนถึงหน้าจอ — ทุกตัวเลขวัดจริงบน m5, 2026-08-30.

```
~/.claude/projects/**/*.jsonl
        │  discover (เดิน 3 ชั้น, ข้าม journal.jsonl)
        │  flatten  (1 บรรทัด → 0..n content blocks)
        ▼
   LanceDB .data/lancedb
   ├── events   204,953 rows   ← import (11.8s ทั้งเครื่อง / backfill 1.2s)
   ├── files    2,434 rows     ← manifest (path, mtime, size) สำหรับ backfill
   └── vectors  เติมทีหลัง      ← embed (bge-m3 ผ่าน Ollama, incremental)
        │
        ▼
   ui.ts (Bun.serve, localhost:4131)
   ├── /          browse + fts / vector / hybrid + facets + drill (text/timeline/raw)
   ├── /map       แผนความจำ: PCA + mutual kNN + MST
   └── /api/*     search, facets, event, raw, session, map, import, embed, jobs, job-log
```

## 1. Import — `scripts/import.ts`

**Discover**: เดินสามชั้นของ `~/.claude/projects` — transcript หลัก (`<session>.jsonl`),
subagent (`<session>/subagents/agent-*.jsonl`), workflow agent
(`subagents/workflows/wf_*/agent-*.jsonl`) — ข้าม `journal.jsonl` (dispatch ledger ไม่ใช่บทสนทนา)

**Flatten** (พอร์ตจาก haos `jsonl-lance/src/flatten.ts`): หนึ่งบรรทัด jsonl คือหนึ่ง message
แต่หนึ่ง assistant turn มีทั้ง thinking + prose + tool calls หลายก้อน — เราแตกเป็น **content block**
เพื่อให้ผลค้นชี้ก้อนที่โดนจริง เก็บเฉพาะ type `user` / `assistant` / `summary`
(23 event types ที่เหลือคือ bookkeeping — index ไปมีแต่จม signal):

| kind | มาจาก | text ที่เก็บ |
|---|---|---|
| `text` | content block type text | ข้อความตรงๆ |
| `thinking` | block type thinking | (บนดิสก์ว่างเสมอ — คุณสมบัติของ format) |
| `tool_use` | block type tool_use | `JSON.stringify(input)` + ชื่อ tool |
| `tool_result` | block type tool_result | ข้อความผลลัพธ์ |
| `image` | block type image | `[image]` placeholder |
| `summary` | บรรทัด type summary | `rec.summary` |

คอลัมน์ facet มาจากบรรทัดเดียวกัน: `role` = type, `repo` = `basename(cwd)` (เคล็ดของ haos —
ไม่ต้อง decode ชื่อ project dir), `model` = `message.model`, `tier` จากชั้นที่ discover เจอ,
`line` = เลขบรรทัดจริงในไฟล์ (นับรวมบรรทัดว่าง — สัญญาของ raw tab), `id` = `file#line#idx`

**text CAP 4000 ตัวอักษร** — indexer ไม่ใช่ archive: `n_chars` เก็บความยาวจริง
และ raw tab อ่านต้นฉบับเต็มจากดิสก์เสมอ จึงไม่เสียอะไรนอกจากน้ำหนัก index

**Backfill**: ตาราง `files` เก็บ (path, mtime, size) — รอบใหม่ไฟล์ไหนไม่เปลี่ยนถูกข้าม
ไฟล์ที่เปลี่ยน (jsonl append-only) ถูกอ่านใหม่แล้ว `mergeInsert("id")` — idempotent:
รันซ้ำ count ไม่ขยับ. วัดจริง: full 2,434 ไฟล์ = 11.8s, backfill = 1.2s (ข้าม 2,424)

## 2. ค้นหาโดยไม่มี embedding — ได้ และดีพอสำหรับ query ส่วนใหญ่

โหมด `fts` = `ltext LIKE '%q%'` scan บน Lance (คอลัมน์ lowercase เก็บคู่ไว้ตอน import)
วัดจริง: ~20ms ที่ 204K blocks รวม filter. ไทยได้เพราะ LIKE คือ substring ตรงๆ ไม่มี tokenizer มาขวาง

ทำไมไม่ใช้ FTS ของ Lance (tantivy): default tokenizer ตัดที่ token — ไทยค้นในคำไม่ได้
(`ยุกต์` = 0 hits บน 7788 ทดสอบจริง) ต้อง ngram(3); และ eval ของ nexus/haos ชี้ว่า lexical
จริงจังที่ scale ให้ SQLite FTS5 trigram ทำ (0.1-0.3ms, ไทยในคำได้ — ดู `../jsonl-proofs`)

หลักฐานที่แรงสุดจาก eval ของ haos (200 queries, MRR): query แบบ "จำได้ครึ่งประโยค"
**fts ชนะ vector ขาด — 0.765 vs 0.099** — embed สองชั่วโมงไม่ช่วย class นี้เลย

## 3. Embed ทีหลัง — `scripts/embed.ts`

`vectors` เป็น**ตารางแยก** join ด้วย `id` — import ไม่เคยรอ embed นี่คือแก่นของ "embed later":

- embed เฉพาะ `kind = 'text' AND n_chars > 80` — tool JSON/log embed แล้วจม signal
- bge-m3 ผ่าน Ollama, batch 8 (nexus sweep แล้ว: 8 > 32 > 1, non-monotonic)
- **incremental**: ข้าม id ที่มีใน vectors แล้ว — รันกี่รอบก็ได้จนครบ หยุดกลางทางได้
- โหมด `vector` และ `hybrid` กับหน้า `/map` เปิดตัวเองเมื่อตารางโผล่ — ไม่ต้องแตะ index เดิม

**Hybrid = RRF k=60 เป็นโหมดให้เลือก ไม่ใช่ default** — eval ของ haos: RRF ลาก fts
ที่ถูกลงเมื่อ query เป็นวลีที่จำได้ (0.765 → 0.44) แต่ชนะเมื่อ query ไม่แชร์คำกับคำตอบ
ทุกแถว hybrid ติดป้ายที่มา (`fts#3 vec#11`) ให้ fusion ตรวจได้ ไม่ magic

## 4. แผนที่ — `/map` (คณิตจาก arra-memory-haos `src/graph.ts`)

- **ตำแหน่ง**: PCA 1024d → 3d แบบ power iteration + deflation, seed คงที่ 42 —
  corpus เดิมวางเหมือนเดิมทุกโหลด; header บอก "อธิบายได้ X%" เพราะ 3 แกนจาก 1024 คือเงา
- **เส้น**: mutual kNN ที่ k=⌈√N⌉ (clamp 2..12) — threshold ค่าเดียวใช้ไม่ได้เพราะ similarity
  กระจุก (bge-m3 คู่ที่ไม่เกี่ยวกันยัง ~0.35) + MST เชื่อมเกาะ ทำเครื่องหมาย `bridge` วาดจางสุด
- **Renderer**: canvas 2D ล้วน — sprite glow + additive composite, picking แบบ screen-space
  ใกล้สุดชนะ, label 20 จุดตาม degree, ฝุ่น 420 เม็ดให้ parallax อ่านออกตอนหมุน

## 5. Jobs — สั่งจาก UI ดูสถานะสด

ปุ่ม **⟳ import** / **⚡ embed 2000** ใน sidebar → `POST /api/import` / `POST /api/embed?n=`
→ server `Bun.spawn` **script ตัวจริง** (ไม่ duplicate logic — stdout ของ script คือ status):

- stdout/stderr ถูก drain เข้า buffer 500 บรรทัด + offset นับที่ตัดทิ้ง
- `GET /api/job-log?name=embed&from=N` คืนบรรทัดตั้งแต่ N — UI poll ทุก 1s ต่อท้าย
  ลง mini terminal (tty-style: incremental, autoscroll) จนจบงาน
- script พ่น `progress …` เป็นระยะ (import ทุก flush, embed ทุก 200 ก้อน พร้อม emb/s + ETA)
- กันงานซ้อนชนิดเดียวกัน (409) · จบแล้ว re-aggregate facets + ล้าง map cache เอง
- ไม่ใช่ PTY จริง — script พ่นบรรทัดธรรมดา ไม่มี control codes จึงไม่ต้องมี
  (ถ้าวันหน้าอยาก interactive จริง ทางของ maw คือ tmux pane — คนละโจทย์กับ lab นี้)

## 6. สิ่งที่ตั้งใจไม่ทำ

- ไม่มี ANN index — brute vector 2-9ms ที่หมื่น vectors ยังใต้ crossover (nexus: 2K-20K);
  เกินนั้นค่อยเปิด IVF ใน Lance ได้โดยไม่เปลี่ยน engine
- ไฟล์ jsonl หด (ไม่ append-only) — mergeInsert ไม่ลบ block ส่วนเกิน; ยังไม่พบในธรรมชาติ
- UI ผูก localhost เท่านั้น ไม่ publish (กติกา: local files + gh discussions)
