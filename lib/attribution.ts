// lance-indexer: attribution — cwd ดิบ → (org, repo) และ repo → group
// กติกาเดียว import path กับ aggregation ของ server เรียกตัวนี้ทั้งคู่ — เขียนสองที่เมื่อไหร่คือ drift
// pure ล้วน ไม่มี I/O เลย เทสต์จึงไม่ต้องตั้ง db ตั้ง server หรือวางไฟล์
export const UNGROUPED = "Ungrouped";

// สองส่วนแรกหลัง /ghq/<host>/ เท่านั้น — หยุดตรงนี้คือสิ่งที่พับ worktree เข้า repo แม่ให้เอง
// อ่านจาก cwd ดิบเสมอ ห้ามอ่านชื่อ dir ที่ถูก flatten (flatten แปลงทั้ง / และ . เป็น - เส้นแบ่งหายถาวร)
const GHQ = /\/ghq\/[^/]+\/([^/]+)\/([^/]+)/;

export type OrgRepo = { org: string; repo: string };

export function deriveOrgRepo(cwd: string): OrgRepo {
  const m = GHQ.exec(cwd ?? "");
  return m ? { org: m[1]!, repo: m[2]! } : { org: "", repo: "" };
}

// การเห็น repo หนึ่งครั้งใต้ org หนึ่ง — lastSeen คือ ts ล่าสุดของ repo นั้นใต้ org นั้น
export type Sighting = { org: string; repo: string; lastSeen: string };

// repo ย้าย org ได้ ประวัติเลยขาดสองท่อน — group ซ่อมตรงนี้ด้วยการเลือก org ที่เห็น repo นั้นล่าสุด
// เสมอกันตัด tie ด้วยชื่อ org (มาก่อนตามตัวอักษร) ผลลัพธ์จะได้ไม่ขึ้นกับลำดับที่ข้อมูลไหลเข้ามา
export function resolveGroups(sightings: Sighting[]): Map<string, string> {
  const best = new Map<string, Sighting>();
  for (const s of sightings) {
    if (!s.org || !s.repo) continue;
    const cur = best.get(s.repo);
    if (!cur || s.lastSeen > cur.lastSeen || (s.lastSeen === cur.lastSeen && s.org < cur.org))
      best.set(s.repo, s);
  }
  return new Map([...best].map(([repo, s]) => [repo, s.org]));
}

export function groupOf(repo: string, groups: Map<string, string>): string {
  return groups.get(repo) ?? UNGROUPED;
}
