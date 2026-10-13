import { describe, expect, it } from "vitest";
import type { MultiCitySearchRequest, Place, StandardSearchRequest } from "@flight/contracts";
import { expandSearchRoutes } from "./route-expansion";

const place = (code: string): Place => ({ code, city: code, name: `${code} Airport`, country: "US" });
const base = {
  id: "search-7",
  dateWindow: { from: "2026-10-01", to: "2026-10-10" },
  travellers: { adults: 1, childAges: [] }
};

describe("expandSearchRoutes", () => {
  it("creates one independent route per destination in input order", () => {
    const request: StandardSearchRequest = {
      ...base,
      tripType: "round-trip",
      origin: place("SFO"),
      destinations: [place("CDG"), place("LHR"), place("LIS")],
      stayRange: { minDays: 3, maxDays: 5 }
    };
    const routes = expandSearchRoutes(request);
    expect(routes.map((route) => route.id)).toEqual(["search-7:CDG", "search-7:LHR", "search-7:LIS"]);
    expect(routes.every((route) => route.parentSearchId === request.id)).toBe(true);
  });

  it("creates one two-leg route for multi-city", () => {
    const request: MultiCitySearchRequest = {
      ...base,
      tripType: "multi-city",
      legs: [
        { origin: place("SFO"), destination: place("CDG") },
        { origin: place("LHR"), destination: place("SFO") }
      ],
      stayRange: { minDays: 3, maxDays: 5 }
    };
    expect(expandSearchRoutes(request)).toEqual([
      {
        id: "search-7:multi",
        parentSearchId: "search-7",
        kind: "multi-city",
        legs: request.legs
      }
    ]);
  });

  it("validates before expanding", () => {
    const request: StandardSearchRequest = {
      ...base,
      tripType: "one-way",
      origin: place("SFO"),
      destinations: []
    };
    expect(() => expandSearchRoutes(request)).toThrow("1 and 3");
  });
});

