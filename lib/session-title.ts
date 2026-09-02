// lance-indexer: หัวข้อของ session — ชื่อเรื่องที่ Claude Code เขียนไว้ในไฟล์ jsonl
// เดิม importer มองหา type "summary" แต่ทั้งคลัง 3,543 ไฟล์ไม่มีสักเรคอร์ด (issue #9)
// ของจริงตอนนี้คือ ai-title (Claude ตั้งให้) กับ custom-title (ผู้ใช้ตั้งเอง) — เก็บ summary ไว้เผื่อไฟล์เก่า
// pure ล้วน ไม่มี I/O
export type TitleRecord = {
  type: string;
  aiTitle?: string;
  customTitle?: string;
  summary?: string;
  line: number;
};

export type SessionTitle = { text: string; line: number };

// ai-title ถูกเขียนทับเรื่อยๆ ระหว่าง session (เฉลี่ย 29 ครั้งต่อไฟล์) ตัวท้ายสุดคือตัวที่ใช้จริง
// custom-title ผู้ใช้ตั้งเอง เลยชนะเสมอไม่ว่ามาก่อนหรือหลัง
export function pickSessionTitle(records: TitleRecord[]): SessionTitle | null {
  let ai: SessionTitle | null = null;
  let custom: SessionTitle | null = null;
  for (const r of records) {
    const text =
      r.type === "custom-title" ? r.customTitle
      : r.type === "ai-title" ? r.aiTitle
      : r.type === "summary" ? r.summary
      : undefined;
    if (typeof text !== "string" || !text.trim()) continue;
    const picked = { text: text.trim(), line: r.line };
    if (r.type === "custom-title") custom = picked; else ai = picked;
  }
  return custom ?? ai;
}
