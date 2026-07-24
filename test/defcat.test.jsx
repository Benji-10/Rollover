import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Planner from "../src/App.jsx";

describe("default category persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("planner-data-v1", JSON.stringify({
      tasks: [], events: [], waiting: [],
      categories: [{ id: "work", name: "Work", hours: {} }, { id: "personal", name: "Personal", hours: {} }],
      defaultCat: "personal", holidayCals: [], holidayCache: {}, country: "GB", icsCals: [], userCals: [],
    }));
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}), text: async () => "" })));
  });
  it("reads defaultCat back from the mirror after migrate", async () => {
    render(<Planner />);
    await new Promise((r) => setTimeout(r, 100));
    /* the persisted default was 'personal' — the saved mirror should round-trip it */
    const saved = JSON.parse(localStorage.getItem("planner-data-v1"));
    expect(saved.defaultCat).toBe("personal");
  });
});
