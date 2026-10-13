import { describe, expect, it } from "vitest";
import type { MultiCitySearchRequest, Place, StandardSearchRequest } from "@flight/contracts";
import { SearchValidationError, validateSearchRequest } from "./search-validation";

const sfo: Place = { code: "SFO", city: "San Francisco", name: "San Francisco International", country: "US" };
const lax: Place = { code: "LAX", city: "Los Angeles", name: "Los Angeles International", country: "US" };
const cdg: Place = { code: "CDG", city: "Paris", name: "Charles de Gaulle", country: "FR" };
const lhr: Place = { code: "LHR", city: "London", name: "Heathrow", country: "GB" };

function standard(overrides: Partial<StandardSearchRequest> = {}): StandardSearchRequest {
  return {
    id: "search-1",
    tripType: "round-trip",
    origin: sfo,
    destinations: [lax, cdg],
    dateWindow: { from: "2026-10-01", to: "2026-10-20" },
    stayRange: { minDays: 4, maxDays: 6 },
    travellers: { adults: 1, childAges: [] },
    ...overrides
  };
}

describe("validateSearchRequest", () => {
  it("accepts one to three distinct destinations", () => {
    expect(validateSearchRequest(standard())).toEqual(standard());
    expect(validateSearchRequest(standard({ destinations: [lax] }))).toBeTruthy();
    expect(validateSearchRequest(standard({ destinations: [lax, cdg, lhr] }))).toBeTruthy();
  });

  it("rejects invalid destination lists", () => {
    expect(() => validateSearchRequest(standard({ destinations: [] }))).toThrow("1 and 3");
    expect(() => validateSearchRequest(standard({ destinations: [lax, lax] }))).toThrow("distinct");
    expect(() => validateSearchRequest(standard({ destinations: [lax, cdg, lhr, { ...lhr, code: "JFK" }] }))).toThrow("1 and 3");
    expect(() => validateSearchRequest(standard({ destinations: [sfo] }))).toThrow("Origin");
  });

  it("validates dates, travellers, child ages, and stay range", () => {
    expect(() => validateSearchRequest(standard({ dateWindow: { from: "bad", to: "2026-10-20" } }))).toThrow("ISO date");
    expect(() => validateSearchRequest(standard({ dateWindow: { from: "2026-02-31", to: "2026-10-20" } }))).toThrow("ISO date");
    expect(() => validateSearchRequest(standard({ dateWindow: { from: "2026-10-20", to: "2026-10-01" } }))).toThrow("on or before");
    expect(() => validateSearchRequest(standard({ travellers: { adults: 0, childAges: [] } }))).toThrow("Adults");
    expect(() => validateSearchRequest(standard({ travellers: { adults: 9, childAges: [] } }))).toThrow("Adults");
    expect(() => validateSearchRequest(standard({ travellers: { adults: 1, childAges: [18] } }))).toThrow("Child ages");
    expect(() => validateSearchRequest(standard({ stayRange: { minDays: 7, maxDays: 4 } }))).toThrow("Stay range");
  });

  it("allows one-way without a stay range", () => {
    const request: StandardSearchRequest = {
      id: "one-way-1",
      tripType: "one-way",
      origin: sfo,
      destinations: [lax],
      dateWindow: { from: "2026-10-01", to: "2026-10-20" },
      travellers: { adults: 1, childAges: [] }
    };
    expect(validateSearchRequest(request)).toBe(request);
  });

  it("accepts exactly two multi-city legs", () => {
    const request: MultiCitySearchRequest = {
      id: "multi-1",
      tripType: "multi-city",
      legs: [
        { origin: sfo, destination: cdg },
        { origin: lhr, destination: sfo }
      ],
      dateWindow: { from: "2026-10-01", to: "2026-10-20" },
      stayRange: { minDays: 4, maxDays: 6 },
      travellers: { adults: 2, childAges: [12] }
    };
    expect(validateSearchRequest(request)).toBe(request);
    const malformed = { ...request, legs: [request.legs[0]] } as unknown as MultiCitySearchRequest;
    expect(() => validateSearchRequest(malformed)).toThrow("exactly two legs");
  });

  it("uses a typed validation error", () => {
    expect(() => validateSearchRequest(standard({ destinations: [] }))).toThrow(SearchValidationError);
  });
});
