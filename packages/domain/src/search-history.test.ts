import { describe, expect, it } from "vitest";
import type { Place, StandardSearchRequest } from "@flight/contracts";
import { mergeRecentSearches, searchSignature } from "./search-history";

const sfo: Place = { code: "SFO", city: "San Francisco", name: "SFO", country: "US" };
const destination = (code: string): Place => ({ code, city: code, name: code, country: "US" });
const request = (id: string, code: string): StandardSearchRequest => ({
  id,
  tripType: "one-way",
  origin: sfo,
  destinations: [destination(code)],
  dateWindow: { from: "2026-10-01", to: "2026-10-03" },
  travellers: { adults: 1, childAges: [] }
});

describe("search history", () => {
  it("ignores the request id when identifying the same search", () => {
    expect(searchSignature(request("first", "CDG"))).toBe(searchSignature(request("second", "CDG")));
  });

  it("moves a repeated search to the front without duplicating it", () => {
    const current = [request("a", "CDG"), request("b", "LHR")];
    const next = mergeRecentSearches(current, request("new", "CDG"));
    expect(next.map((item) => item.id)).toEqual(["new", "b"]);
  });

  it("keeps only the configured number of recent searches", () => {
    const current = ["A", "B", "C", "D", "E"].map((code) => request(code, code));
    expect(mergeRecentSearches(current, request("F", "F"))).toHaveLength(5);
    expect(mergeRecentSearches(current, request("F", "F"), 2).map((item) => item.id)).toEqual(["F", "A"]);
  });
});

