// ค่าที่คาดหวังเป็น literal ที่เขียนไว้เอง ไม่ได้อ่านกลับมาจากตารางที่กำลังทดสอบ
import { afterEach, describe, expect, test } from "bun:test";

// สคริปต์เป็น <script src> ธรรมดา แขวนของบน global — เทสต์จึง import แล้วอ่าน globalThis
(globalThis as any).localStorage = { getItem: () => null, setItem: () => {} };
await import("../ui/i18n.js");
const i18n = (globalThis as any).i18n as {
  t: (k: string, p?: Record<string, unknown>) => string;
  use: (l: string) => string;
  stored: () => string;
  lang: string;
  DEFAULT: string;
  TABLES: Record<string, Record<string, string>>;
};

afterEach(() => { i18n.use("en"); });

describe("t", () => {
  test("looks a key up in English", () => {
    expect(i18n.t("live.pause")).toBe("⏸ Pause");
  });

  test("looks the same key up in Thai", () => {
    i18n.use("th");
    expect(i18n.t("live.pause")).toBe("⏸ พัก");
  });

  test("interpolates a runtime value in English", () => {
    expect(i18n.t("live.stat", { time: "09:41:02", added: 3, shown: 60 }))
      .toBe("09:41:02 · +3 new · showing 60");
  });

  test("interpolates a runtime value in Thai", () => {
    i18n.use("th");
    expect(i18n.t("live.stat", { time: "09:41:02", added: 3, shown: 60 }))
      .toBe("09:41:02 · +3 ใหม่ · แสดง 60");
  });

  test("leaves a placeholder alone when the caller omits it", () => {
    expect(i18n.t("common.loadFailed", {})).toBe("Could not load: {error}");
  });

  test("a missing key degrades visibly instead of rendering nothing", () => {
    expect(i18n.t("no.such.key")).toBe("⟨no.such.key⟩");
  });

  test("a missing key does not throw", () => {
    expect(() => i18n.t("no.such.key")).not.toThrow();
  });

  test("a key missing only from Thai falls back to the English wording", () => {
    i18n.use("th");
    i18n.TABLES.en!["test.onlyEnglish"] = "only in English";
    expect(i18n.t("test.onlyEnglish")).toBe("only in English");
    delete i18n.TABLES.en!["test.onlyEnglish"];
  });
});

describe("the stored preference", () => {
  const swap = (impl: unknown) => { (globalThis as any).localStorage = impl; };

  test("defaults to English when nothing is stored", () => {
    swap({ getItem: () => null, setItem: () => {} });
    expect(i18n.stored()).toBe("en");
    expect(i18n.DEFAULT).toBe("en");
  });

  test("reads a stored Thai preference", () => {
    swap({ getItem: () => "th", setItem: () => {} });
    expect(i18n.stored()).toBe("th");
  });

  test("falls back to the default when storage throws", () => {
    swap({ getItem: () => { throw new Error("storage blocked"); }, setItem: () => {} });
    expect(i18n.stored()).toBe("en");
  });

  test("falls back to the default when storage holds an unknown language", () => {
    swap({ getItem: () => "fr", setItem: () => {} });
    expect(i18n.stored()).toBe("en");
  });
});

describe("the two tables", () => {
  test("cover exactly the same keys", () => {
    const en = Object.keys(i18n.TABLES.en!).sort();
    const th = Object.keys(i18n.TABLES.th!).sort();
    expect(th).toEqual(en);
  });
});
