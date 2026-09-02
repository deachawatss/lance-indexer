// lance-indexer: i18n — ตารางคำสองภาษา + ตัวค้น t(key, params) ตัวเดียวที่ทุกหน้าใช้
// หน้าเว็บที่นี่ไม่มี module system ตัวนี้จึงเป็น <script src> ธรรมดา แขวนของไว้บน global
// 54% ของข้อความถูกประกอบในฟังก์ชันตอนรัน — กลไกแบบ attribute อย่างเดียวจึงไม่พอ ต้องเป็นฟังก์ชัน
(function (root) {
  const DEFAULT = "en";
  const STORE_KEY = "lang";

  const TABLES = {
    en: {
      "nav.search": "🔍 Search",
      "nav.map": "🗺 Map",
      "nav.insight": "💡 Insight",
      "nav.live": "📡 Live",
      "nav.jobs": "⚙ Jobs",
      "lang.switch": "ไทย",
      "lang.switch.title": "อ่านเป็นภาษาไทย",
      "common.loading": "Loading…",
      "common.loadFailed": "Could not load: {error}",
      "common.close": "✕ Close",
      "live.starting": "starting…",
      "live.filterRepo": "filter by repo (blank = all)",
      "live.pause": "⏸ Pause",
      "live.resume": "▶ Resume",
      "live.waitingFirst": "waiting for the first block…",
      "live.backfill": "backfill…",
      "live.stat": "{time} · +{added} new · showing {shown}",
      "live.lag": " · newest in index: {lag} ago",
      "search.placeholder": "full-text search across every session on this machine… (blank = browse)",
      "search.openFull": "↗ Open full screen",
      "search.noHits": "no hits",
      "search.refreshing": "refreshing…",
      "repo.dailyActivity": "Daily activity",
      "repo.topTools": "Most used tools",
      "repo.topics": "Topics (latest session summaries)",
      "repo.noSummary": "No summary in this repo",
      "repo.memoryDistance": "Memory distance — repos that think alike (centroid cosine)",
      "repo.needVectors": "Not enough vectors yet (needs ≥20)",
      "repo.mapThisRepo": "🗺 Map this repo only",
      "job.start": "▶ Start",
      "job.stop": "■ Stop",
      "job.preflightTitle": "{name} · checking…",
      "job.checking": "checking status…",
      "job.preflightDone": "{name} · checked",
      "job.checkFailed": "could not check: {error}",
      "job.import.files": "files on this machine  {n}",
      "job.import.unchanged": "  ✓ done, unchanged    {n}  (will skip)",
      "job.import.new": "  ＋ new                {n}",
      "job.import.changed": "  ∆ changed            {n}",
      "job.import.will": "will import {n} files — press ▶ Start",
      "job.import.upToDate": "everything is up to date — nothing to do (start anyway to confirm)",
      "job.embed.candidates": "text blocks in total   {n}",
      "job.embed.done": "  ✓ embedded           {n}",
      "job.embed.remaining": "  ○ remaining          {n}",
      "job.embed.will": "this run does {n} blocks (incremental — skips what is done) — press ▶ Start",
      "job.embed.upToDate": "all done — nothing left to embed",
      "job.alreadyRunning": "[{name}] {note} — following it",
      "job.runningNote": "already running",
      "job.finished": "✓ done",
      "job.exit": "✗ exit {code}",
      "job.expandHint": "click to expand",
      "job.running": "· running",
      "job.ended": "· finished",
      "drill.capped": " (stored 4000 — read the full text on the raw tab)",
      "drill.jumpHint": "{total} blocks — click to jump",
      "insight.h1": "💡 Ask the whole machine's memory",
      "insight.sub1": "Straightforward RAG: embed the question (bge-m3) → vector top-K out of",
      "insight.sub2": "blocks → hand the evidence to an LLM, which answers and cites [n] — the model runs on gpu1 over an ssh tunnel, nothing leaves the house",
      "insight.placeholder": "for example: what problem hit the fleet most often this week? / what did we already decide about the vector store?",
      "insight.ask": "Ask",
      "insight.model.fast": "qwen2.5:7b (gpu1, fast, no thinking)",
      "insight.model.smart": "qwen3:30b-a3b (smarter, thinks longer)",
      "insight.repoPlaceholder": "(whole machine)",
      "insight.tryLabel": "Try:",
      "insight.try1": "what did each oracle work on this week",
      "insight.try2": "what wireguard/netbird problems came up, and how were they fixed",
      "insight.try3": "the most expensive lesson about LanceDB",
      "insight.evidence": "Evidence — click [n] in the answer to highlight it",
      "insight.searching": "searching evidence + asking the model… (a big model can take ~10-60s)",
      "insight.thinking": "thinking… {s}s",
      "admin.perRound": "blocks/run (incremental — skips what is done)",
      "admin.noJobs": "No jobs this session — press import or embed above",
      "admin.pickJob": "Pick a job on the left to read its log",
      "map.title": "Memory map",
      "map.loading": "loading…",
      "map.intro": "Position comes from the embedding — close together means close in meaning. Drag to rotate, scroll to zoom, click to open.",
      "map.vizTitle": "choose a visualizer plugin",
      "map.mode.map": "Plan",
      "map.mode.web": "Web",
      "map.mode.names": "Names 20",
      "map.spin": "🔄 Keep spinning",
      "map.spinTitle": "spinning stops when you drag — press this to spin again",
      "map.scopeTitle": "choose what the map shows",
      "map.wholeMachine": "Whole machine",
      "map.wholeGroup": "Whole group",
      "map.neighbours": "{n} neighbours",
      "map.links": "{n} links",
      "map.linkedBlocks": "Linked blocks — hover to point at them on the map",
      "map.loadFailedShort": "could not load",
      "map.statPoints": "{shown} points",
      "map.statScope": " (only {scope})",
      "map.statWhole": " (whole machine)",
      "map.statExplained": " · explains {pct}%",
      "map.statUnembedded": " · {n} without vectors",
      "walk.header": "🚶 Walk — {n} steps (strongest link, no backtracking)",
      "walk.start": "start",
      "walk.step": "step {k}",
      "walk.score": "score {score}",
      "srv.ASK_SOMETHING": "What would you like to ask?",
      "srv.NO_VECTORS": "no vectors yet — run: just embed",
      "srv.EMBED_FAILED": "embedding failed: ollama {status}",
      "srv.LLM_FAILED": "the model failed: {status} {detail}",
      "srv.NOT_ENOUGH_VECTORS": "not enough vectors",
      "srv.NOT_ENOUGH_VECTORS_SCOPED": "not enough vectors in {scope}",
      "srv.NAME_REQUIRED": "which name?",
      "srv.REPO_NOT_FOUND": "no such repo: {name}",
      "srv.UNKNOWN_PREFLIGHT": "unknown preflight: {name}",
      "srv.JOB_STARTED": "{name} is running",
      "srv.JOB_ALREADY_RUNNING": "{name} is already running",
      "srv.JOB_NOT_FOUND": "no such job",
      "srv.JOB_NOT_RUNNING": "that job is not running",
      "srv.NOT_FOUND": "not found",
      "srv.HYBRID_NEEDS_VECTORS": "hybrid needs vectors — run: just embed",
      "srv.SERVER_ERROR": "server error: {detail}",
      "srv.DEMO_JOBS_IMMUTABLE": "the static demo's jobs cannot be changed",
      "srv.UNKNOWN": "unexpected server code: {error}",
    },
    th: {
      "nav.search": "🔍 ค้นหา",
      "nav.map": "🗺 แผนที่",
      "nav.insight": "💡 insight",
      "nav.live": "📡 live",
      "nav.jobs": "⚙ jobs",
      "lang.switch": "EN",
      "lang.switch.title": "Read in English",
      "common.loading": "กำลังโหลด…",
      "common.loadFailed": "โหลดไม่ได้: {error}",
      "common.close": "✕ ปิด",
      "live.starting": "เริ่ม…",
      "live.filterRepo": "กรอง repo (ว่าง = ทุกตัว)",
      "live.pause": "⏸ พัก",
      "live.resume": "▶ ต่อ",
      "live.waitingFirst": "รอ block แรก…",
      "live.backfill": "backfill…",
      "live.stat": "{time} · +{added} ใหม่ · แสดง {shown}",
      "live.lag": " · ล่าสุดใน index: {lag} ที่แล้ว",
      "search.placeholder": "ค้น full-text ทุก session ในเครื่อง… (ว่าง = browse)",
      "search.openFull": "↗ เปิดเต็มจอ",
      "search.noHits": "ไม่เจอ",
      "search.refreshing": "refreshing…",
      "repo.dailyActivity": "กิจกรรมรายวัน",
      "repo.topTools": "เครื่องมือที่ใช้บ่อย",
      "repo.topics": "หัวข้อ (session summaries ล่าสุด)",
      "repo.noSummary": "ไม่มี summary ใน repo นี้",
      "repo.memoryDistance": "Memory distance — repo ที่คิดใกล้กัน (centroid cosine)",
      "repo.needVectors": "ยังไม่มี vectors พอ (ต้อง ≥20)",
      "repo.mapThisRepo": "🗺 แผนที่เฉพาะ repo นี้",
      "job.start": "▶ เริ่ม",
      "job.stop": "■ หยุด",
      "job.preflightTitle": "{name} · ตรวจก่อน…",
      "job.checking": "กำลังเช็คสถานะ…",
      "job.preflightDone": "{name} · ตรวจแล้ว",
      "job.checkFailed": "เช็คไม่ได้: {error}",
      "job.import.files": "ไฟล์ทั้งเครื่อง       {n}",
      "job.import.unchanged": "  ✓ ทำแล้ว ไม่เปลี่ยน  {n}  (จะข้าม)",
      "job.import.new": "  ＋ ใหม่               {n}",
      "job.import.changed": "  ∆ เปลี่ยน            {n}",
      "job.import.will": "จะ import {n} ไฟล์ — กด ▶ เริ่ม",
      "job.import.upToDate": "ทุกอย่างทันสมัยแล้ว — ไม่มีอะไรต้องทำ (กดเริ่มเพื่อยืนยันซ้ำได้)",
      "job.embed.candidates": "text blocks ทั้งหมด    {n}",
      "job.embed.done": "  ✓ embed แล้ว         {n}",
      "job.embed.remaining": "  ○ เหลือ              {n}",
      "job.embed.will": "รอบนี้จะทำ {n} ก้อน (incremental — ข้ามที่ทำแล้ว) — กด ▶ เริ่ม",
      "job.embed.upToDate": "ครบหมดแล้ว — ไม่มีอะไรต้อง embed",
      "job.alreadyRunning": "[{name}] {note} — เกาะดูต่อ",
      "job.runningNote": "กำลังวิ่งอยู่",
      "job.finished": "✓ เสร็จ",
      "job.exit": "✗ exit {code}",
      "job.expandHint": "กดเพื่อขยาย",
      "job.running": "· กำลังวิ่ง",
      "job.ended": "· จบแล้ว",
      "drill.capped": " (เก็บ 4000 — ดูเต็มที่ raw)",
      "drill.jumpHint": "{total} blocks — click เพื่อ jump",
      "insight.h1": "💡 ถามความจำทั้งเครื่อง",
      "insight.sub1": "RAG ตรงไปตรงมา: embed คำถาม (bge-m3) → vector top-K จาก",
      "insight.sub2": "ก้อน → ส่งหลักฐานให้ LLM ตอบพร้อมอ้าง [n] — โมเดลรันบน gpu1 ผ่าน ssh tunnel ไม่มีอะไรออกจากบ้าน",
      "insight.placeholder": "เช่น: อาทิตย์นี้ fleet เจอปัญหาอะไรซ้ำบ่อยสุด? / เราตัดสินใจอะไรไปแล้วเรื่อง vector store?",
      "insight.ask": "ถาม",
      "insight.model.fast": "qwen2.5:7b (gpu1, เร็ว ไม่คิดในใจ)",
      "insight.model.smart": "qwen3:30b-a3b (ฉลาดกว่า แต่คิดยาว)",
      "insight.repoPlaceholder": "(ทั้งเครื่อง)",
      "insight.tryLabel": "ลอง:",
      "insight.try1": "อาทิตย์นี้แต่ละ oracle ทำอะไรกันบ้าง",
      "insight.try2": "ปัญหา wireguard/netbird ที่เจอคืออะไร แก้ยังไง",
      "insight.try3": "บทเรียนเรื่อง LanceDB ที่จ่ายแพงที่สุด",
      "insight.evidence": "หลักฐาน — click [n] ในคำตอบเพื่อไฮไลต์",
      "insight.searching": "ค้นหลักฐาน + ถามโมเดล… (โมเดลใหญ่อาจใช้ ~10-60s)",
      "insight.thinking": "กำลังคิด… {s}s",
      "admin.perRound": "ก้อน/รอบ (incremental — ข้ามที่ทำแล้ว)",
      "admin.noJobs": "ยังไม่มีงานในรอบนี้ — กด import หรือ embed ด้านบน",
      "admin.pickJob": "เลือกงานจากซ้ายเพื่อดู log",
      "map.title": "แผนความจำ",
      "map.loading": "โหลด…",
      "map.intro": "ตำแหน่งมาจาก embedding — อยู่ใกล้กันคือความหมายใกล้กัน ลากเพื่อหมุน เลื่อนเพื่อซูม กดเพื่อเปิด",
      "map.vizTitle": "เลือก visualizer plugin",
      "map.mode.map": "แผน",
      "map.mode.web": "ใย",
      "map.mode.names": "ชื่อ 20",
      "map.spin": "🔄 หมุนต่อ",
      "map.spinTitle": "หมุนหยุดเองเมื่อลาก — กดนี่เพื่อหมุนต่อ",
      "map.scopeTitle": "เลือกขอบเขตของแผนที่",
      "map.wholeMachine": "ทั้งเครื่อง",
      "map.wholeGroup": "ทั้งกลุ่ม",
      "map.neighbours": "{n} เพื่อนบ้าน",
      "map.links": "{n} เส้นเชื่อม",
      "map.linkedBlocks": "ก้อนที่มีเส้นเชื่อม — hover เพื่อชี้บนแผนที่",
      "map.loadFailedShort": "โหลดไม่ได้",
      "map.statPoints": "{shown} จุด",
      "map.statScope": " (เฉพาะ {scope})",
      "map.statWhole": " (ทั้งเครื่อง)",
      "map.statExplained": " · อธิบายได้ {pct}%",
      "map.statUnembedded": " · {n} ยังไม่มีเวกเตอร์",
      "walk.header": "🚶 การเดิน — {n} ก้าว (ตามเส้นแข็งสุด ไม่ย้อน)",
      "walk.start": "เริ่ม",
      "walk.step": "ก้าว {k}",
      "walk.score": "คะแนน {score}",
      "srv.ASK_SOMETHING": "ถามอะไรดี?",
      "srv.NO_VECTORS": "ยังไม่มี vectors — รัน: just embed",
      "srv.EMBED_FAILED": "embed ไม่สำเร็จ: ollama {status}",
      "srv.LLM_FAILED": "โมเดลไม่ตอบ: {status} {detail}",
      "srv.NOT_ENOUGH_VECTORS": "vectors ไม่พอ",
      "srv.NOT_ENOUGH_VECTORS_SCOPED": "vectors ไม่พอใน {scope}",
      "srv.NAME_REQUIRED": "ชื่ออะไร?",
      "srv.REPO_NOT_FOUND": "ไม่พบ repo นี้: {name}",
      "srv.UNKNOWN_PREFLIGHT": "ไม่รู้จัก preflight: {name}",
      "srv.JOB_STARTED": "{name} วิ่งแล้ว",
      "srv.JOB_ALREADY_RUNNING": "{name} กำลังวิ่งอยู่แล้ว",
      "srv.JOB_NOT_FOUND": "ไม่มีงานนี้",
      "srv.JOB_NOT_RUNNING": "งานนี้ไม่ได้วิ่งอยู่",
      "srv.NOT_FOUND": "ไม่เจอ",
      "srv.HYBRID_NEEDS_VECTORS": "hybrid ต้องมี vectors — รัน: just embed",
      "srv.SERVER_ERROR": "server error: {detail}",
      "srv.DEMO_JOBS_IMMUTABLE": "งานของ demo แบบ static แก้ไม่ได้",
      "srv.UNKNOWN": "โค้ดที่ server ส่งมาไม่รู้จัก: {error}",
    },
  };

  // localStorage พังได้ (โหมดส่วนตัว / storage ถูกบล็อก) — ล้มกลับไปค่าเริ่มต้น ห้าม throw
  // แบบเดียวกับที่หน้า map เก็บ visualizer ที่เลือกไว้
  function stored() {
    try {
      const v = root.localStorage.getItem(STORE_KEY);
      return TABLES[v] ? v : DEFAULT;
    } catch {
      return DEFAULT;
    }
  }

  let lang = stored();

  // key ที่ไม่มีในตาราง ต้องเห็นได้ชัดว่าหาย ไม่ใช่ช่องว่างเงียบๆ และไม่ใช่ throw
  function t(key, params) {
    const raw = TABLES[lang][key] ?? TABLES[DEFAULT][key] ?? `⟨${key}⟩`;
    if (!params) return raw;
    return raw.replace(/\{(\w+)\}/g, (m, name) =>
      Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : m);
  }

  // เปลี่ยนภาษาในหน่วยความจำอย่างเดียว — ใช้ตอนเทสต์ ไม่ใช่ทางที่ผู้ใช้กด
  function use(next) {
    if (TABLES[next]) lang = next;
    return lang;
  }

  // ผู้ใช้กดสลับ = เก็บค่าแล้วโหลดหน้าใหม่ทั้งหน้า (ข้อความครึ่งหนึ่งเกิดในฟังก์ชัน re-render ตามไม่คุ้ม)
  function setLang(next) {
    use(next);
    try { root.localStorage.setItem(STORE_KEY, lang); } catch {}
    root.location?.reload();
  }

  // ข้อความที่อยู่ใน markup นิ่งๆ ผ่านทางนี้ ส่วนที่ประกอบตอนรันเรียก t() ตรงๆ
  function apply(scope) {
    const doc = scope ?? root.document;
    if (!doc) return;
    doc.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    doc.querySelectorAll("[data-i18n-placeholder]").forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
    doc.querySelectorAll("[data-i18n-title]").forEach((el) => { el.title = t(el.dataset.i18nTitle); });
    doc.querySelectorAll("[data-lang-switch]").forEach((el) => {
      el.textContent = t("lang.switch");
      el.title = t("lang.switch.title");
      el.onclick = () => setLang(lang === "th" ? "en" : "th");
    });
    if (doc.documentElement) doc.documentElement.lang = lang;
  }

  // ข้อความจาก server มาเป็นโค้ดคงที่ ฝั่งเบราว์เซอร์เป็นเจ้าของถ้อยคำ — กลไกเดียวตลอดเส้นทาง
  // โค้ดที่ไม่รู้จักต้องเห็นได้ ไม่ใช่ช่องว่าง
  function tsrv(payload) {
    const code = payload?.error ?? payload?.note ?? "";
    if (!code) return "";
    const key = code === "NOT_ENOUGH_VECTORS" && payload.scope ? "srv.NOT_ENOUGH_VECTORS_SCOPED" : `srv.${code}`;
    const table = TABLES[lang][key] ?? TABLES[DEFAULT][key];
    return table === undefined ? t("srv.UNKNOWN", { error: code }) : t(key, payload);
  }

  root.i18n = { t, tsrv, use, setLang, apply, stored, TABLES, DEFAULT, get lang() { return lang; } };
  root.t = t;
  root.tsrv = tsrv;
  if (root.document) root.document.addEventListener("DOMContentLoaded", () => apply());
})(typeof globalThis !== "undefined" ? globalThis : self);
