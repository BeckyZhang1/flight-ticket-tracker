import { describe, expect, it } from "vitest";
import type { FlightSegment, PricedItineraryOffer, SellerQuote } from "@flight/contracts";
import {
  createItineraryFingerprint,
  groupItineraryOffers,
  isTrustedOffer,
  rankItineraries
} from "./itinerary-services";

const segment = (flightNumber = "101"): FlightSegment => ({
  originCode: "SFO",
  destinationCode: "CDG",
  departureUtc: "2026-10-01T17:00:00Z",
  arrivalUtc: "2026-10-02T03:00:00Z",
  departureLocal: "2026-10-01T10:00:00-07:00",
  arrivalLocal: "2026-10-02T05:00:00+02:00",
  operatingCarrierCode: "GF",
  operatingCarrierName: "Green Flights",
  flightNumber
});

const quote = (id: string, sellerName: string, amountMinor: number, bookingUrl = "https://seller.test/book"): SellerQuote => ({
  id,
  sellerName,
  price: { amountMinor, currency: "USD" },
  bookingUrl,
  trusted: true
});

const offer = (sellerQuote: SellerQuote, flightNumber = "101"): PricedItineraryOffer => ({
  destinationCode: "CDG",
  segments: [segment(flightNumber)],
  quote: sellerQuote,
  totalDurationMinutes: 600,
  stops: 0
});

const config = { allowedSellers: new Set(["Airline", "Trusted OTA"]) };

describe("itinerary services", () => {
  it("fingerprints physical flights without seller or price", () => {
    expect(createItineraryFingerprint([segment()])).toBe(createItineraryFingerprint(offer(quote("q", "Airline", 100)).segments));
    expect(createItineraryFingerprint([segment("102")])).not.toBe(createItineraryFingerprint([segment()]));
  });

  it("accepts only trusted, allowed HTTPS seller offers", () => {
    expect(isTrustedOffer(offer(quote("a", "Airline", 100)), config)).toBe(true);
    expect(isTrustedOffer(offer({ ...quote("a", "Airline", 100), trusted: false }), config)).toBe(false);
    expect(isTrustedOffer(offer(quote("a", "Unknown", 100)), config)).toBe(false);
    expect(isTrustedOffer(offer(quote("a", "Airline", 100, "http://seller.test")), config)).toBe(false);
    expect(isTrustedOffer(offer(quote("a", "Airline", 100, "not-a-url")), config)).toBe(false);
  });

  it("groups the same flights, sorts seller quotes, and ignores duplicate quotes", () => {
    const surfaceTransfer = { fromCode: "CDG", toCode: "LHR" };
    const offers = [
      { ...offer(quote("expensive", "Airline", 54_000)), surfaceTransfer },
      offer(quote("cheap", "Trusted OTA", 49_000)),
      offer(quote("cheap", "Trusted OTA", 49_000)),
      offer(quote("blocked", "Unknown", 40_000))
    ];
    const [group] = groupItineraryOffers(offers, config);
    expect(group?.quotes.map((item) => item.id)).toEqual(["cheap", "expensive"]);
    expect(group?.lowestPrice.amountMinor).toBe(49_000);
    expect(group?.surfaceTransfer).toEqual(surfaceTransfer);
  });

  it("keeps different flights distinct and ranks by price, duration, then fingerprint", () => {
    const groups = groupItineraryOffers([
      offer(quote("b", "Airline", 50_000), "102"),
      { ...offer(quote("a", "Airline", 50_000), "101"), totalDurationMinutes: 500 },
      offer(quote("c", "Airline", 40_000), "103")
    ], config);
    const ranked = rankItineraries(groups, 2);
    expect(ranked.map((item) => item.lowestPrice.amountMinor)).toEqual([40_000, 50_000]);
    expect(ranked[1]?.segments[0]?.flightNumber).toBe("101");
    expect(rankItineraries(groups, 20)).toHaveLength(3);
  });
});

