import { describe, expect, it } from "vitest";
import {
  differenceInCalendarDays,
  isMultiCityStayValid,
  planMultiCityDates,
  planOneWayDates,
  planRoundTripDates
} from "./date-candidate-planner";

describe("date candidate planning", () => {
  it("enumerates inclusive one-way dates", () => {
    expect(planOneWayDates({ from: "2026-09-10", to: "2026-09-12" })).toEqual([
      "2026-09-10",
      "2026-09-11",
      "2026-09-12"
    ]);
  });

  it("keeps both round-trip dates inside the window", () => {
    const pairs = planRoundTripDates(
      { from: "2026-09-10", to: "2026-09-20" },
      { minDays: 4, maxDays: 5 }
    );
    expect(pairs).toContainEqual({ firstDate: "2026-09-10", secondDate: "2026-09-14" });
    expect(pairs).toContainEqual({ firstDate: "2026-09-15", secondDate: "2026-09-19" });
    expect(pairs).not.toContainEqual({ firstDate: "2026-09-17", secondDate: "2026-09-21" });
    expect(pairs.every((pair) => pair.secondDate <= "2026-09-20")).toBe(true);
  });

  it("widens multi-city candidates for overnight arrival, then validates actual stay", () => {
    const pairs = planMultiCityDates(
      { from: "2026-09-10", to: "2026-09-20" },
      { minDays: 4, maxDays: 5 },
      2
    );
    expect(pairs).toContainEqual({ firstDate: "2026-09-10", secondDate: "2026-09-17" });
    expect(isMultiCityStayValid("2026-09-12", "2026-09-17", { minDays: 4, maxDays: 5 })).toBe(true);
    expect(isMultiCityStayValid("2026-09-11", "2026-09-17", { minDays: 4, maxDays: 5 })).toBe(false);
  });

  it("calculates calendar-day differences across month boundaries", () => {
    expect(differenceInCalendarDays("2026-10-02", "2026-09-29")).toBe(3);
  });
});

