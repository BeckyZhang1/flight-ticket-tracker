import { describe, expect, it } from "vitest";
import type { MultiCitySearchRequest, Place, StandardSearchRequest } from "@flight/contracts";
import { searchMockFlights } from "./mock-flight-search";

const place = (code: string): Place => ({ code, city: code, name: `${code} Airport`, country: "US" });
const base = {
  id: "mock-1",
  dateWindow: { from: "2026-10-01", to: "2026-10-14" },
  travellers: { adults: 1, childAges: [] }
};

describe("searchMockFlights", () => {
  it("returns globally sorted, grouped results for several destinations", () => {
    const request: StandardSearchRequest = {
      ...base,
      tripType: "round-trip",
      origin: place("SFO"),
      destinations: [place("CDG"), place("LHR")],
      stayRange: { minDays: 4, maxDays: 5 }
    };
    const results = searchMockFlights(request);
    expect(new Set(results.map((result) => result.destinationCode))).toEqual(new Set(["CDG", "LHR"]));
    expect(results.every((result) => result.quotes.length === 2)).toBe(true);
    expect(results.every((result) => result.quotes[0]!.price.amountMinor === result.lowestPrice.amountMinor)).toBe(true);
    expect(results.map((result) => result.lowestPrice.amountMinor)).toEqual(
      [...results].map((result) => result.lowestPrice.amountMinor).sort((a, b) => a - b)
    );
  });

  it("supports one-way dates and optional seat counts", () => {
    const request: StandardSearchRequest = {
      ...base,
      tripType: "one-way",
      origin: place("SFO"),
      destinations: [place("LAX")]
    };
    const results = searchMockFlights(request);
    expect(results).toHaveLength(3);
    expect(results[0]?.segments).toHaveLength(1);
    expect(results.some((result) => result.quotes.some((item) => item.seatsRemaining === 4))).toBe(true);
  });

  it("returns two-leg multi-city results with a disclosed surface transfer", () => {
    const request: MultiCitySearchRequest = {
      ...base,
      tripType: "multi-city",
      legs: [
        { origin: place("SFO"), destination: place("CDG") },
        { origin: place("LHR"), destination: place("SFO") }
      ],
      stayRange: { minDays: 4, maxDays: 5 }
    };
    const results = searchMockFlights(request);
    expect(results).toHaveLength(4);
    expect(results[0]?.segments).toHaveLength(2);
    expect(results[0]?.surfaceTransfer).toEqual({ fromCode: "CDG", toCode: "LHR" });
  });

  it("is deterministic and enforces request validation", () => {
    const request: StandardSearchRequest = {
      ...base,
      tripType: "one-way",
      origin: place("SFO"),
      destinations: [place("LAX")]
    };
    expect(searchMockFlights(request)).toEqual(searchMockFlights(request));
    expect(() => searchMockFlights({ ...request, destinations: [] })).toThrow("1 and 3");
  });
});

