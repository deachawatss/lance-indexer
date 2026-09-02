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
    doc.querySelectorAll("[data-t]").forEach((el) => { el.textContent = t(el.dataset.t); });
    doc.querySelectorAll("[data-t-placeholder]").forEach((el) => { el.placeholder = t(el.dataset.tPlaceholder); });
    doc.querySelectorAll("[data-t-title]").forEach((el) => { el.title = t(el.dataset.tTitle); });
    doc.querySelectorAll("[data-lang-switch]").forEach((el) => {
      el.textContent = t("lang.switch");
      el.title = t("lang.switch.title");
      el.onclick = () => setLang(lang === "th" ? "en" : "th");
    });
    if (doc.documentElement) doc.documentElement.lang = lang;
  }

  root.i18n = { t, use, setLang, apply, stored, TABLES, DEFAULT, get lang() { return lang; } };
  root.t = t;
  if (root.document) root.document.addEventListener("DOMContentLoaded", () => apply());
})(typeof globalThis !== "undefined" ? globalThis : self);
