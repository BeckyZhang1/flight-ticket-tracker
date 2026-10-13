import { describe, expect, it, vi } from "vitest";
import type {
  MultiCitySearchRequest,
  Place,
  SearchApiBookingContext,
  StandardSearchRequest
} from "@flight/contracts";
import type { SearchApiClient, SearchApiResponse } from "./searchapi-client";
import { SearchApiFlightService } from "./searchapi-flight-service";

const place = (code: string): Place => ({ code, city: code, name: `${code} Airport`, country: "US" });
const shared = {
  id: "live-search",
  dateWindow: { from: "2026-10-01", to: "2026-10-08" },
  travellers: { adults: 2, childAges: [8] }
};

function flight(
  from: string,
  to: string,
  date: string,
  number = "AA 101",
  arrivalDate = date
) {
  return {
    departure_airport: { id: from, date, time: "08:00" },
    arrival_airport: { id: to, date: arrivalDate, time: "11:00" },
    duration: 180,
    airline: "Example Air",
    flight_number: number
  };
}

function fakeClient(responses: SearchApiResponse[]) {
  const search = vi.fn().mockImplementation(async () => {
    const next = responses.shift();
    if (!next) throw new Error("Unexpected SearchAPI call");
    return next;
  });
  return { client: { search } as unknown as SearchApiClient, search };
}

describe("SearchApiFlightService", () => {
  it("uses the flexible calendar, combines result lists, maps metadata, and retains 30 history points", async () => {
    const priceHistory = Array.from({ length: 32 }, (_, index) => ({ price: 300 + index, iso_date: `2026-09-${String(index + 1).padStart(2, "0")}` }));
    const { client, search } = fakeClient([
      { calendar: [
        { departure: "2026-10-03", price: 220 },
        { departure: "2026-10-02", price: 180 },
        { departure: "2026-10-01", price: 100, has_no_flights: true },
        { departure: "2026-10-04" }
      ] },
      {
        best_flights: [{ flights: [flight("SFO", "CDG", "2026-10-02")], total_duration: 180, price: 450, booking_token: "book-1" }],
        other_flights: [
          { flights: [flight("SFO", "CDG", "2026-10-02", "X")], price: 430, booking_token: "book-2" },
          { flights: [], price: 100 },
          { flights: [flight("SFO", "CDG", "2026-10-02") ] }
        ],
        price_insights: { price_history: [...priceHistory, { iso_date: "bad" }] }
      }
    ]);
    const request: StandardSearchRequest = {
      ...shared,
      tripType: "one-way",
      origin: place("SFO"),
      destinations: [place("CDG")]
    };
    const service = new SearchApiFlightService(client, { maxDateCandidatesPerRoute: 1, maxFlightBranchesPerCandidate: 2 });
    const results = await service.search(request);
    expect(results).toHaveLength(2);
    expect(results[0]?.lowestPrice.amountMinor).toBe(43_000);
    expect(results[0]?.segments[0]).toMatchObject({ operatingCarrierCode: "--", flightNumber: "X", durationMinutes: 180 });
    expect(results[0]?.priceHistory).toHaveLength(30);
    expect(results[0]?.bookingContext?.bookingToken).toBe("book-2");
    expect(search.mock.calls[0]?.[0]).toMatchObject({ engine: "google_flights_calendar", adults: 2, children: 1 });
    expect(search.mock.calls[1]?.[0]).toMatchObject({ outbound_date: "2026-10-02", sort_by: "price" });
  });

  it("falls back to planned one-way dates when calendar data is empty", async () => {
    const { client, search } = fakeClient([
      {},
      { best_flights: [{ flights: [flight("SFO", "LAX", "2026-10-01")], price: 99 }] }
    ]);
    const request: StandardSearchRequest = { ...shared, tripType: "one-way", origin: place("SFO"), destinations: [place("LAX")] };
    const results = await new SearchApiFlightService(client, { maxDateCandidatesPerRoute: 1 }).search(request);
    expect(results[0]?.segments[0]?.departureLocal).toBe("2026-10-01T08:00");
    expect(results[0]?.bookingContext).toBeUndefined();
    expect(search).toHaveBeenCalledTimes(2);
  });

  it("tolerates sparse flight fields, full datetime strings, and keeps the cheapest duplicate", async () => {
    const sparseFlight = {
      departure_airport: { time: "2026-10-01 09:30" },
      arrival_airport: {},
      flight_number: ""
    };
    const { client } = fakeClient([
      {},
      {
        other_flights: [
          { flights: [sparseFlight], price: 300 },
          { flights: [sparseFlight], price: 250 },
          { price: 100 }
        ]
      }
    ] as SearchApiResponse[]);
    const request: StandardSearchRequest = { ...shared, tripType: "one-way", origin: place("SFO"), destinations: [place("LAX")] };
    const [result] = await new SearchApiFlightService(client, { maxDateCandidatesPerRoute: 1, maxFlightBranchesPerCandidate: 3 }).search(request);
    expect(result?.lowestPrice.amountMinor).toBe(25_000);
    expect(result?.segments[0]).toMatchObject({
      originCode: "???",
      destinationCode: "???",
      departureLocal: "2026-10-01T09:30",
      arrivalLocal: "1970-01-01T00:00",
      operatingCarrierCode: "--",
      operatingCarrierName: "Airline not provided",
      flightNumber: "Unknown"
    });
    expect(result?.segments[0]?.durationMinutes).toBeUndefined();
  });

  it("selects valid round-trip calendar pairs and combines outbound and inbound flights", async () => {
    const { client, search } = fakeClient([
      { calendar: [
        { departure: "2026-10-01", return: "2026-10-02", price: 100 },
        { departure: "2026-10-02", return: "2026-10-06", price: 350 }
      ] },
      { best_flights: [{ flights: [flight("SFO", "CDG", "2026-10-02")], total_duration: 180, price: 350, departure_token: "depart" }] },
      { best_flights: [{ flights: [flight("CDG", "SFO", "2026-10-06")], total_duration: 200, price: 390, booking_token: "book" }] }
    ]);
    const request: StandardSearchRequest = {
      ...shared,
      tripType: "round-trip",
      origin: place("SFO"), destinations: [place("CDG")], stayRange: { minDays: 4, maxDays: 5 }
    };
    const [result] = await new SearchApiFlightService(client, { maxDateCandidatesPerRoute: 1, maxFlightBranchesPerCandidate: 1 }).search(request);
    expect(result?.segments.map((item) => `${item.originCode}-${item.destinationCode}`)).toEqual(["SFO-CDG", "CDG-SFO"]);
    expect(result?.stops).toBe(0);
    expect(result?.totalDurationMinutes).toBe(380);
    expect(search.mock.calls[2]?.[0]).toMatchObject({ departure_token: "depart" });
  });

  it("uses planned round-trip pairs if the calendar has no usable combinations", async () => {
    const { client } = fakeClient([
      { calendar: [{ departure: "2026-10-01", return: "2026-10-08", price: 200 }] },
      { best_flights: [] }
    ]);
    const request: StandardSearchRequest = {
      ...shared,
      tripType: "round-trip", origin: place("SFO"), destinations: [place("CDG")], stayRange: { minDays: 2, maxDays: 2 }
    };
    await expect(new SearchApiFlightService(client, { maxDateCandidatesPerRoute: 1 }).search(request)).resolves.toEqual([]);
  });

  it("returns no round-trip candidates when the date window cannot fit the stay", async () => {
    const { client, search } = fakeClient([]);
    const request: StandardSearchRequest = {
      ...shared,
      dateWindow: { from: "2026-10-01", to: "2026-10-01" },
      tripType: "round-trip", origin: place("SFO"), destinations: [place("CDG")], stayRange: { minDays: 2, maxDays: 3 }
    };
    await expect(new SearchApiFlightService(client).search(request)).resolves.toEqual([]);
    expect(search).not.toHaveBeenCalled();
  });

  it("builds a valid two-leg multi-city itinerary and discloses the surface transfer", async () => {
    const { client } = fakeClient([
      { best_flights: [{ flights: [flight("SFO", "CDG", "2026-10-01")], total_duration: 180, price: 400, departure_token: "next" }] },
      { best_flights: [{ flights: [flight("LHR", "SFO", "2026-10-05")], total_duration: 600, price: 510, booking_token: "book" }] }
    ]);
    const request: MultiCitySearchRequest = {
      ...shared,
      tripType: "multi-city",
      legs: [
        { origin: place("SFO"), destination: place("CDG") },
        { origin: place("LHR"), destination: place("SFO") }
      ],
      stayRange: { minDays: 4, maxDays: 4 }
    };
    const [result] = await new SearchApiFlightService(client, { maxDateCandidatesPerRoute: 1, maxFlightBranchesPerCandidate: 1 }).search(request);
    expect(result?.surfaceTransfer).toEqual({ fromCode: "CDG", toCode: "LHR" });
    expect(result?.segments).toHaveLength(2);
    expect(result?.bookingContext?.searchParameters.multi_city_json).toContain("CDG");
  });

  it("drops multi-city combinations whose actual arrival-to-departure stay is invalid", async () => {
    const { client } = fakeClient([
      { best_flights: [{ flights: [flight("SFO", "CDG", "2026-10-01", "AA 1", "2026-10-02")], price: 400, departure_token: "next" }] },
      { best_flights: [{ flights: [flight("LHR", "SFO", "2026-10-05")], price: 510 }] }
    ]);
    const request: MultiCitySearchRequest = {
      ...shared, tripType: "multi-city",
      legs: [{ origin: place("SFO"), destination: place("CDG") }, { origin: place("LHR"), destination: place("SFO") }],
      stayRange: { minDays: 4, maxDays: 4 }
    };
    await expect(new SearchApiFlightService(client, { maxDateCandidatesPerRoute: 1 }).search(request)).resolves.toEqual([]);
  });

  it("maps, filters, and sorts lazy booking options", async () => {
    const { client } = fakeClient([{ booking_options: [
      { book_with: "Expensive", price: 500, booking_request: { url: "https://google.test/book", post_data: "u=abc" }, fare_type: "FLEX", baggage_prices: ["1 bag"], booking_phone: "555" },
      { book_with: "Cheap", price: 450 },
      { price: 100 },
      { book_with: "Bad URL", price: 200, booking_request: { url: "not a url" } }
    ] }]);
    const context: SearchApiBookingContext = { provider: "searchapi", bookingToken: "token", searchParameters: { engine: "google_flights" } };
    const quotes = await new SearchApiFlightService(client).bookingOptions(context);
    expect(quotes.map((quote) => quote.sellerName)).toEqual(["Cheap", "Expensive"]);
    expect(quotes[0]).toMatchObject({ bookingUrl: "https://www.google.com/travel/flights", trusted: true });
    expect(quotes[1]).toMatchObject({ bookingPostData: "u=abc", fareType: "FLEX", baggageNotes: ["1 bag"], bookingPhone: "555" });
  });

  it("returns an empty seller list when booking options are absent", async () => {
    const { client } = fakeClient([{}]);
    const context: SearchApiBookingContext = { provider: "searchapi", bookingToken: "token", searchParameters: {} };
    await expect(new SearchApiFlightService(client).bookingOptions(context)).resolves.toEqual([]);
  });
});
