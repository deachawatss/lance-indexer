// ค่าคาดหวังเขียนเป็น literal จากรูปเรคอร์ดจริงในคลัง (ดู issue #9) ไม่ได้คำนวณซ้ำด้วย logic ตัวที่ทดสอบ
import { describe, expect, test } from "bun:test";
import { pickSessionTitle, type TitleRecord } from "./session-title";

const ai = (line: number, aiTitle: string): TitleRecord => ({ type: "ai-title", aiTitle, line });
const custom = (line: number, customTitle: string): TitleRecord => ({ type: "custom-title", customTitle, line });

describe("pickSessionTitle", () => {
  test("a session with no title record has no title", () => {
    expect(pickSessionTitle([])).toBeNull();
  });

  test("a single ai-title is the title", () => {
    expect(pickSessionTitle([ai(12, "Add secret scanner GitHub workflow")]))
      .toEqual({ text: "Add secret scanner GitHub workflow", line: 12 });
  });

  // ai-title ถูกเขียนทับเรื่อยๆ ระหว่าง session — เฉลี่ย 29 ครั้งต่อไฟล์ ตัวที่ใช้คือตัวท้ายสุด
  test("the last ai-title wins, because earlier ones were superseded", () => {
    expect(pickSessionTitle([ai(4, "Debugging a thing"), ai(90, "Fix the import path"), ai(300, "Ship the map scope")]))
      .toEqual({ text: "Ship the map scope", line: 300 });
  });

  test("a custom title beats an ai title even when it came first", () => {
    expect(pickSessionTitle([custom(3, "Excalidraw MCP installation"), ai(88, "Install an MCP server")]))
      .toEqual({ text: "Excalidraw MCP installation", line: 3 });
  });

  test("the last custom title wins over earlier custom titles", () => {
    expect(pickSessionTitle([custom(3, "first name"), custom(140, "renamed later")]))
      .toEqual({ text: "renamed later", line: 140 });
  });

  test("a blank title is not a title", () => {
    expect(pickSessionTitle([ai(5, "   ")])).toBeNull();
    expect(pickSessionTitle([ai(5, "")])).toBeNull();
  });

  test("a blank custom title falls back to the ai title rather than blanking the session", () => {
    expect(pickSessionTitle([ai(10, "Real work happened here"), custom(20, "  ")]))
      .toEqual({ text: "Real work happened here", line: 10 });
  });

  test("record types that are not titles are ignored", () => {
    const noise = [
      { type: "assistant", line: 1 },
      { type: "last-prompt", line: 2 },
      { type: "summary", line: 3 },
    ] as TitleRecord[];
    expect(pickSessionTitle(noise)).toBeNull();
    expect(pickSessionTitle([...noise, ai(4, "the only real title")]))
      .toEqual({ text: "the only real title", line: 4 });
  });

  test("the retired summary record still counts, so old files do not lose their titles", () => {
    expect(pickSessionTitle([{ type: "summary", summary: "An older session summary", line: 7 }]))
      .toEqual({ text: "An older session summary", line: 7 });
  });

  test("a modern title supersedes a retired summary record in the same file", () => {
    expect(pickSessionTitle([{ type: "summary", summary: "old shape", line: 2 }, ai(50, "new shape")]))
      .toEqual({ text: "new shape", line: 50 });
  });
});
