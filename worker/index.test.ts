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
    expect(await response.json()).toMatchObject({ started: true, demo: true });
  });
});
