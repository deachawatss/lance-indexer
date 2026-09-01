# COMPARE — LanceDB indexer vs SQLite FTS5 (measured 2026-08-30T03:19Z, m5)

corpus: digger-oracle project sessions — Lance events **3497**, sqlite events **3496** (ต่างกันได้เพราะ live session โตระหว่าง import) · vectors **400** (subset len>80)

| query | FTS5 trigram | FTS5 unicode61 | Lance LIKE scan | Lance vector top-10 |
|---|---|---|---|---|
| `trigram` | 146 hits · 0.3ms | 142 hits · 0ms | 127 hits · 2.7ms | 10 @ 2.5ms |
| `lancedb` | 22 hits · 0.3ms | 22 hits · 0ms | 21 hits · 2.3ms | 10 @ 2ms |
| `ความ` | 25 hits · 0.1ms | 5 hits · 0ms | 20 hits · 2.1ms | 10 @ 2.2ms |
| `วรรณยุกต์` | 4 hits · 0.2ms | 4 hits · 0ms | 4 hits · 1.8ms | 10 @ 1.5ms |

| storage | size |
|---|---|
| LanceDB dir (events+files+vectors 400×1024d) | 10.7 MB |
| proof.db (events + FTS ×2) | 39.7 MB |

อ่านผล:
- **lexical แม่น + เร็วสุด = FTS5 trigram** — index จริง, ไทย substring ได้
- **Lance LIKE = full scan** ไม่มี text index (tantivy FTS ช้ากว่า FTS5 10-200x เลยไม่ใช้) — ที่ corpus นี้ยังเร็วพอ (< สิบ ms) แต่โตแล้วแพ้แน่
- **vector ตอบคนละคำถาม** — ความหมายข้ามภาษา ไม่ใช่ substring; latency คงที่ตาม nexus (query แบนตาม scale)
- ตรง #157: **LanceDB (vectors) + FTS5 trigram (lexical) คู่กัน** — ตัวเดียวไม่พอทั้งคู่
