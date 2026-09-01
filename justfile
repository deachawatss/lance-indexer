# lance-indexer — jsonl indexer บน LanceDB ล้วน (ไม่มี sqlite ใน pipeline)
# ลำดับตามที่ออกแบบ: import ก่อน → ui ก่อน → embed ทีหลัง → compare
# กติกาเดิมจาก jsonl-proofs: db ของตัวเอง สร้างตอน import ล้างตอน teardown, ไม่แตะ db ใคร

data := justfile_directory() / ".data"

# ① IMPORT — jsonl 3 ชั้น → LanceDB (events + files manifest, mergeInsert idempotent)
#   รันซ้ำ = backfill: (path,mtime,size) ไม่เปลี่ยนถูกข้าม (ALL=1 เอาทั้ง corpus ทุก project)
import:
    cd scripts && bun install --silent
    bun scripts/import.ts

# ② UI — dashboard บน localhost:4131 (PORT=xxxx เปลี่ยนได้)
#   ใช้ได้ก่อนมี vector: stats/sessions/text-search = LIKE scan ล้วน
#   semantic tab เปิดเองเมื่อ vectors table โผล่
ui:
    bun scripts/ui.ts

# ③ EMBED — เติม vectors ทีหลัง ทีละก้อน (incremental — ข้าม id ที่ทำแล้ว รันซ้ำจนครบ)
embed n="300":
    bun scripts/embed.ts {{n}}

# ④ COMPARE — วัดจริงเทียบ jsonl-proofs FTS5 บน corpus เดียวกัน → เขียน COMPARE.md
compare:
    bun scripts/compare.ts

# TEARDOWN — ล้าง db ทิ้ง จบวงจร
teardown:
    rm -rf {{data}}
    @echo "wiped {{data}}"
