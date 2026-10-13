import type { FlightSegment, Itinerary, PricedItineraryOffer } from "@flight/contracts";

export interface SellerTrustConfig {
  allowedSellers: ReadonlySet<string>;
}

export function createItineraryFingerprint(segments: FlightSegment[]): string {
  const canonical = segments.map((segment) =>
    [
      segment.originCode,
      segment.destinationCode,
      segment.departureUtc,
      segment.arrivalUtc,
      segment.operatingCarrierCode,
      segment.flightNumber
    ].join("|")
  );
  return `itinerary:v1:${canonical.join(">")}`;
}

export function isTrustedOffer(offer: PricedItineraryOffer, config: SellerTrustConfig): boolean {
  if (!offer.quote.trusted || !config.allowedSellers.has(offer.quote.sellerName)) {
    return false;
  }
  try {
    return new URL(offer.quote.bookingUrl).protocol === "https:";
  } catch {
    return false;
  }
}

export function groupItineraryOffers(
  offers: PricedItineraryOffer[],
  config: SellerTrustConfig
): Itinerary[] {
  const groups = new Map<string, Itinerary>();
  for (const offer of offers) {
    if (!isTrustedOffer(offer, config)) continue;
    const fingerprint = createItineraryFingerprint(offer.segments);
    const existing = groups.get(fingerprint);
    if (existing) {
      if (!existing.quotes.some((quote) => quote.id === offer.quote.id)) {
        existing.quotes.push(offer.quote);
        existing.quotes.sort((a, b) => a.price.amountMinor - b.price.amountMinor);
        existing.lowestPrice = existing.quotes[0]!.price;
      }
      continue;
    }
    groups.set(fingerprint, {
      id: fingerprint,
      fingerprint,
      destinationCode: offer.destinationCode,
      segments: offer.segments,
      quotes: [offer.quote],
      lowestPrice: offer.quote.price,
      totalDurationMinutes: offer.totalDurationMinutes,
      stops: offer.stops,
      ...(offer.surfaceTransfer ? { surfaceTransfer: offer.surfaceTransfer } : {})
    });
  }
  return [...groups.values()];
}

export function rankItineraries(itineraries: Itinerary[], limit = 20): Itinerary[] {
  return [...itineraries]
    .sort((a, b) =>
      a.lowestPrice.amountMinor - b.lowestPrice.amountMinor ||
      a.totalDurationMinutes - b.totalDurationMinutes ||
      a.fingerprint.localeCompare(b.fingerprint)
    )
    .slice(0, limit);
}

