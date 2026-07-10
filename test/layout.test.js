import { describe, it, expect } from "vitest";
import { layoutDay } from "../src/scheduler.js";

describe("layoutDay overlap rules", () => {
  it("staggered overlaps cascade and cap the earlier block's text", () => {
    const a = { id: "a", start: 600, end: 780 };
    const b = { id: "b", start: 690, end: 800 };
    const out = layoutDay([a, b], 45); /* 90min stagger > 45min clearance */
    const la = out.find((l) => l.item.id === "a");
    const lb = out.find((l) => l.item.id === "b");
    expect(la.mode).toBe("indent");
    expect(la.capMin).toBe(690);   /* text stops where b begins */
    expect(lb.capMin).toBeNull();  /* b is on top — uncapped */
  });
  it("near-simultaneous overlaps split side by side, uncapped", () => {
    const out = layoutDay([{ id: "a", start: 600, end: 700 }, { id: "b", start: 615, end: 720 }], 45);
    expect(out.every((l) => l.mode === "split")).toBe(true);
    expect(out.every((l) => l.capMin == null)).toBe(true);
  });
  it("non-overlapping blocks stay full width", () => {
    const out = layoutDay([{ id: "a", start: 600, end: 660 }, { id: "b", start: 660, end: 720 }], 45);
    expect(out.every((l) => l.mode === "full")).toBe(true);
  });
});
