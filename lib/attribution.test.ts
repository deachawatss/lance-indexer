// ค่าที่คาดหวังทุกตัวเขียนเป็น literal จาก path จริงในคลัง — ไม่ได้คำนวณซ้ำด้วย logic ตัวที่กำลังทดสอบ
// path ตัวอย่างมาจากการสำรวจ ~/.claude/projects จริง (ดู issue #2)
import { describe, expect, test } from "bun:test";
import { UNGROUPED, deriveOrgRepo, groupOf, resolveGroups } from "./attribution";

describe("deriveOrgRepo", () => {
  test("a plain repository path yields its org and repo", () => {
    expect(deriveOrgRepo("/home/deachawat/ghq/github.com/deachawatss/lance-indexer"))
      .toEqual({ org: "deachawatss", repo: "lance-indexer" });
  });

  test("the maw worktree convention folds to the parent repo", () => {
    expect(deriveOrgRepo("/home/deachawat/ghq/github.com/NWFTH-Software/NWFTH-ProductionDashboard/agents/dead-code"))
      .toEqual({ org: "NWFTH-Software", repo: "NWFTH-ProductionDashboard" });
  });

  test("the Claude Code worktree convention folds to the parent repo", () => {
    expect(deriveOrgRepo("/home/deachawat/ghq/github.com/deachawatss/odoo-yd/.claude-worktrees/agent-a408d742f3a200674"))
      .toEqual({ org: "deachawatss", repo: "odoo-yd" });
  });

  test("the retired wt worktree convention folds to the parent repo", () => {
    expect(deriveOrgRepo("/home/deachawat/ghq/github.com/deachawatss/BME-Putaway/BME-Putaway.wt-2-tablet-enter"))
      .toEqual({ org: "deachawatss", repo: "BME-Putaway" });
  });

  test("a path deeper than the repository root still stops at two segments", () => {
    expect(deriveOrgRepo("/home/deachawat/ghq/github.com/NWFTH-Software/NWFTH-Software/docs/NWFTH-FGlabel"))
      .toEqual({ org: "NWFTH-Software", repo: "NWFTH-Software" });
  });

  test("a path where org and repo share a name resolves correctly", () => {
    expect(deriveOrgRepo("/home/deachawat/ghq/github.com/NWFTH-Software/NWFTH-Software"))
      .toEqual({ org: "NWFTH-Software", repo: "NWFTH-Software" });
  });

  test("a ghq host other than github.com still resolves", () => {
    expect(deriveOrgRepo("/Users/wind/ghq/gitlab.com/acme/widget"))
      .toEqual({ org: "acme", repo: "widget" });
  });

  test("a non-ghq path yields no org and no repo", () => {
    expect(deriveOrgRepo("/home/deachawat/dev-projects/NWFTH/BME-Bulk-Picking"))
      .toEqual({ org: "", repo: "" });
  });

  test("a bare home directory yields no org and no repo", () => {
    expect(deriveOrgRepo("/Users/wind")).toEqual({ org: "", repo: "" });
  });

  test("a ghq path stopping at the org yields no org and no repo", () => {
    expect(deriveOrgRepo("/Users/wind/ghq/github.com/deachawatss")).toEqual({ org: "", repo: "" });
  });

  test("an empty working directory yields no org and no repo", () => {
    expect(deriveOrgRepo("")).toEqual({ org: "", repo: "" });
  });
});

describe("resolveGroups", () => {
  test("a repo seen under two orgs resolves to one group — the org it was seen under last", () => {
    const groups = resolveGroups([
      { org: "deachawatss", repo: "NWFTH-ProductionDashboard", lastSeen: "2026-04-18T09:00:00Z" },
      { org: "NWFTH-Software", repo: "NWFTH-ProductionDashboard", lastSeen: "2026-08-30T09:00:00Z" },
    ]);
    expect([...groups.keys()]).toEqual(["NWFTH-ProductionDashboard"]);
    expect(groups.get("NWFTH-ProductionDashboard")).toBe("NWFTH-Software");
  });

  test("the order the sightings arrive in does not change the group", () => {
    const groups = resolveGroups([
      { org: "NWFTH-Software", repo: "BME-Putaway", lastSeen: "2026-08-30T09:00:00Z" },
      { org: "deachawatss", repo: "BME-Putaway", lastSeen: "2026-04-18T09:00:00Z" },
    ]);
    expect(groups.get("BME-Putaway")).toBe("NWFTH-Software");
  });

  test("a tie on last-seen breaks on org name, so the answer is stable", () => {
    const same = "2026-08-30T09:00:00Z";
    const forward = resolveGroups([
      { org: "deachawatss", repo: "BME-Putaway", lastSeen: same },
      { org: "NWFTH-Software", repo: "BME-Putaway", lastSeen: same },
    ]);
    const reversed = resolveGroups([
      { org: "NWFTH-Software", repo: "BME-Putaway", lastSeen: same },
      { org: "deachawatss", repo: "BME-Putaway", lastSeen: same },
    ]);
    expect(forward.get("BME-Putaway")).toBe("NWFTH-Software");
    expect(reversed.get("BME-Putaway")).toBe("NWFTH-Software");
  });

  test("a repo unique to one org is unaffected", () => {
    const groups = resolveGroups([
      { org: "deachawatss", repo: "gale-oracle", lastSeen: "2026-08-30T09:00:00Z" },
    ]);
    expect(groups.get("gale-oracle")).toBe("deachawatss");
  });

  test("a repo whose name carries no group prefix still joins the group it was seen under", () => {
    const groups = resolveGroups([
      { org: "NWFTH-Software", repo: "odoo-nwf", lastSeen: "2026-08-30T09:00:00Z" },
    ]);
    expect(groups.get("odoo-nwf")).toBe("NWFTH-Software");
  });

  test("a group holding one repo is still a group", () => {
    const groups = resolveGroups([
      { org: "deachawatss", repo: "gale-oracle", lastSeen: "2026-08-30T09:00:00Z" },
      { org: "vibe-hub-co", repo: "vibe-site", lastSeen: "2026-05-01T09:00:00Z" },
    ]);
    expect(new Set(groups.values())).toEqual(new Set(["deachawatss", "vibe-hub-co"]));
  });

  test("a group with no local checkout is still a group", () => {
    const groups = resolveGroups([
      { org: "Gale-Build-with-Oracle", repo: "Gale-Framework", lastSeen: "2026-03-11T09:00:00Z" },
    ]);
    expect(groups.get("Gale-Framework")).toBe("Gale-Build-with-Oracle");
  });

  test("a sighting with no org contributes no group", () => {
    const groups = resolveGroups([
      { org: "", repo: "", lastSeen: "2026-08-30T09:00:00Z" },
    ]);
    expect(groups.size).toBe(0);
  });
});

describe("groupOf", () => {
  const groups = resolveGroups([
    { org: "deachawatss", repo: "gale-oracle", lastSeen: "2026-08-30T09:00:00Z" },
  ]);

  test("a known repo reads its group", () => {
    expect(groupOf("gale-oracle", groups)).toBe("deachawatss");
  });

  test("a repo with no recoverable org reads as Ungrouped", () => {
    expect(groupOf("", groups)).toBe(UNGROUPED);
  });

  test("a repo absent from the map reads as Ungrouped", () => {
    expect(groupOf("never-seen", groups)).toBe(UNGROUPED);
  });
});
