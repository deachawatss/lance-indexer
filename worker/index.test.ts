import { describe, expect, test } from "bun:test";
import { demoWorker } from "./index";

const env = { ASSETS: { async fetch(request: Request) { return new Response(`asset:${new URL(request.url).pathname}`); } } };
const api = (path: string, init?: RequestInit) => demoWorker.fetch(new Request(`https://demo.example${path}`, init), env);

describe("static public demo", () => {
  test("has an explicit no-storage contract", async () => {
    const response = await api("/health");
    expect(response.headers.get("x-lance-indexer-demo")).toBe("static-fixture");
    expect(await response.json()).toMatchObject({ mode: "static-fixture", storage: "none" });
  });

  test("covers every public UI data surface with fixtures", async () => {
    for (const path of ["/api/facets", "/api/search?q=vector", "/api/map", "/api/repo?name=lance-indexer", "/api/jobs", "/api/preflight?name=import"]) {
      expect((await api(path)).status).toBe(200);
    }
    const search = await (await api("/api/search?q=fixture")).json();
    expect(search.n).toBeGreaterThan(0);
    expect(search.rows[0].file).toStartWith("/fixture/");
  });

  test("makes write-looking controls deterministic simulations", async () => {
    const response = await api("/api/import", { method: "POST" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ started: true, demo: true, note: "JOB_STARTED", name: "import" });
  });

  // ข้อความที่ผู้ใช้อ่านเป็นของฝั่งเบราว์เซอร์ — API ต้องส่งโค้ดคงที่ ไม่ใช่ประโยค
  test("answers failures with a stable code, not with wording", async () => {
    const missing = await api("/api/repo?name=no-such-repo");
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "REPO_NOT_FOUND", name: "no-such-repo" });

    const unknown = await api("/api/nothing-here");
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: "NOT_FOUND" });

    const empty = await api("/api/insight", { method: "POST", body: JSON.stringify({ q: "" }) });
    expect(empty.status).toBe(400);
    expect(await empty.json()).toEqual({ error: "ASK_SOMETHING" });

    const kill = await api("/api/job-kill", { method: "POST" });
    expect(kill.status).toBe(409);
    expect(await kill.json()).toEqual({ error: "DEMO_JOBS_IMMUTABLE" });
  });

  test("no user-facing wording leaks out of an error body", async () => {
    for (const path of ["/api/repo?name=no-such-repo", "/api/nothing-here"]) {
      const body = await (await api(path)).json() as { error: string };
      expect(body.error).toMatch(/^[A-Z][A-Z_]+$/);   // เป็นโค้ด ไม่ใช่ประโยค
    }
  });
});
