import type {
  FlightSegment,
  Itinerary,
  Money,
  MultiCitySearchRequest,
  PriceHistoryPoint,
  SearchApiBookingContext,
  SearchRequest,
  SellerQuote,
  StandardSearchRequest
} from "@flight/contracts";
import {
  createItineraryFingerprint,
  differenceInCalendarDays,
  isMultiCityStayValid,
  planMultiCityDates,
  planOneWayDates,
  planRoundTripDates,
  rankItineraries,
  validateSearchRequest
} from "@flight/domain";
import type {
  SearchApiClient,
  SearchApiBookingOption,
  SearchApiCalendarEntry,
  SearchApiFlight,
  SearchApiFlightResult,
  SearchApiParameters,
  SearchApiResponse
} from "./searchapi-client";

const GOOGLE_FLIGHTS_URL = "https://www.google.com/travel/flights";

export interface SearchApiFlightServiceOptions {
  maxDateCandidatesPerRoute?: number;
  maxFlightBranchesPerCandidate?: number;
}

function money(dollars: number): Money {
  return { amountMinor: Math.round(dollars * 100), currency: "USD" };
}

function passengerParameters(request: SearchRequest): SearchApiParameters {
  return {
    adults: request.travellers.adults,
    children: request.travellers.childAges.length,
    currency: "USD",
    gl: "us",
    hl: "en"
  };
}

function allFlightResults(response: SearchApiResponse): SearchApiFlightResult[] {
  return [...(response.best_flights ?? []), ...(response.other_flights ?? [])]
    .filter((result) => (result.flights?.length ?? 0) > 0 && typeof result.price === "number");
}

function localDateTime(airport: SearchApiFlight["departure_airport"]): string {
  const rawTime = airport?.time?.trim() ?? "";
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(rawTime)) {
    return rawTime.replace(" ", "T").slice(0, 16);
  }
  const date = airport?.date ?? "1970-01-01";
  const time = /^\d{2}:\d{2}/.test(rawTime) ? rawTime.slice(0, 5) : "00:00";
  return `${date}T${time}`;
}

function parseCarrier(flightNumber: string): { code: string; number: string } {
  const normalized = flightNumber.replace(/\s+/g, "").toUpperCase();
  const match = /^([A-Z0-9]{2})(.+)$/.exec(normalized);
  return match ? { code: match[1]!, number: match[2]! } : { code: "--", number: normalized || "Unknown" };
}

function mapSegment(raw: SearchApiFlight): FlightSegment {
  const departureLocal = localDateTime(raw.departure_airport);
  const arrivalLocal = localDateTime(raw.arrival_airport);
  const carrier = parseCarrier(raw.flight_number ?? "");
  return {
    originCode: raw.departure_airport?.id ?? "???",
    destinationCode: raw.arrival_airport?.id ?? "???",
    departureLocal,
    arrivalLocal,
    departureUtc: `${departureLocal}:00Z`,
    arrivalUtc: `${arrivalLocal}:00Z`,
    operatingCarrierCode: carrier.code,
    operatingCarrierName: raw.airline ?? "Airline not provided",
    flightNumber: carrier.number,
    ...(typeof raw.duration === "number" ? { durationMinutes: raw.duration } : {})
  };
}

function history(response: SearchApiResponse): PriceHistoryPoint[] | undefined {
  const values = (response.price_insights?.price_history ?? [])
    .filter((point): point is { price: number; iso_date: string } =>
      typeof point.price === "number" && typeof point.iso_date === "string")
    .map((point) => ({ observedAt: point.iso_date, price: money(point.price) }));
  return values.length ? values.slice(-30) : undefined;
}

function serializableParameters(parameters: SearchApiParameters): Record<string, string> {
  return Object.fromEntries(
    Object.entries(parameters)
      .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
      .map(([key, value]) => [key, String(value)])
  );
}

function itinerary(
  destinationCode: string,
  segments: FlightSegment[],
  price: number,
  totalDurationMinutes: number,
  legCount: number,
  bookingToken: string | undefined,
  parameters: SearchApiParameters,
  priceHistory?: PriceHistoryPoint[],
  surfaceTransfer?: { fromCode: string; toCode: string }
): Itinerary {
  const fingerprint = createItineraryFingerprint(segments);
  const bookingContext: SearchApiBookingContext | undefined = bookingToken ? {
    provider: "searchapi",
    bookingToken,
    searchParameters: serializableParameters(parameters)
  } : undefined;
  return {
    id: fingerprint,
    fingerprint,
    destinationCode,
    segments,
    quotes: [],
    lowestPrice: money(price),
    totalDurationMinutes,
    stops: Math.max(0, segments.length - legCount),
    source: "searchapi-google-flights",
    ...(bookingContext ? { bookingContext } : {}),
    ...(priceHistory ? { priceHistory } : {}),
    ...(surfaceTransfer ? { surfaceTransfer } : {})
  };
}

function deduplicate(values: Itinerary[]): Itinerary[] {
  const byFingerprint = new Map<string, Itinerary>();
  for (const value of values) {
    const existing = byFingerprint.get(value.fingerprint);
    if (!existing || value.lowestPrice.amountMinor < existing.lowestPrice.amountMinor) {
      byFingerprint.set(value.fingerprint, value);
    }
  }
  return [...byFingerprint.values()];
}

function cheapestCalendarEntries(
  entries: SearchApiCalendarEntry[],
  limit: number,
  isAllowed: (entry: SearchApiCalendarEntry) => boolean
): SearchApiCalendarEntry[] {
  return entries
    .filter((entry) => !entry.has_no_flights && typeof entry.price === "number" && isAllowed(entry))
    .sort((a, b) => a.price! - b.price!)
    .slice(0, limit);
}

export class SearchApiFlightService {
  private readonly maxDateCandidates: number;
  private readonly maxBranches: number;

  constructor(
    private readonly client: SearchApiClient,
    options: SearchApiFlightServiceOptions = {}
  ) {
    this.maxDateCandidates = options.maxDateCandidatesPerRoute ?? 2;
    this.maxBranches = options.maxFlightBranchesPerCandidate ?? 2;
  }

  async search(unvalidatedRequest: SearchRequest, signal?: AbortSignal): Promise<Itinerary[]> {
    const request = validateSearchRequest(unvalidatedRequest);
    const results = request.tripType === "multi-city"
      ? await this.searchMultiCity(request, signal)
      : (await Promise.all(request.destinations.map((destination) =>
          this.searchStandardDestination(request, destination.code, signal)
        ))).flat();
    return rankItineraries(deduplicate(results));
  }

  private async searchStandardDestination(
    request: StandardSearchRequest,
    destinationCode: string,
    signal?: AbortSignal
  ): Promise<Itinerary[]> {
    const candidates = await this.standardDateCandidates(request, destinationCode, signal);
    const results = await Promise.all(candidates.map(({ departure, returnDate }) =>
      this.searchStandardDates(request, destinationCode, departure, returnDate, signal)
    ));
    return results.flat();
  }

  private async standardDateCandidates(
    request: StandardSearchRequest,
    destinationCode: string,
    signal?: AbortSignal
  ): Promise<Array<{ departure: string; returnDate?: string }>> {
    const base = {
      engine: "google_flights_calendar",
      departure_id: request.origin.code,
      arrival_id: destinationCode,
      ...passengerParameters(request)
    };
    if (request.tripType === "one-way") {
      const response = await this.client.search({
        ...base,
        flight_type: "one_way",
        outbound_date: request.dateWindow.from,
        outbound_date_start: request.dateWindow.from,
        outbound_date_end: request.dateWindow.to
      }, signal);
      const entries = cheapestCalendarEntries(response.calendar ?? [], this.maxDateCandidates,
        (entry) => typeof entry.departure === "string");
      const dates = entries.map((entry) => entry.departure!);
      const fallback = planOneWayDates(request.dateWindow).slice(0, this.maxDateCandidates);
      return (dates.length ? dates : fallback).map((departure) => ({ departure }));
    }

    const firstPair = planRoundTripDates(request.dateWindow, request.stayRange!)[0];
    if (!firstPair) return [];
    const response = await this.client.search({
      ...base,
      flight_type: "round_trip",
      outbound_date: firstPair.firstDate,
      return_date: firstPair.secondDate,
      outbound_date_start: request.dateWindow.from,
      outbound_date_end: request.dateWindow.to,
      return_date_start: firstPair.secondDate,
      return_date_end: request.dateWindow.to
    }, signal);
    const entries = cheapestCalendarEntries(response.calendar ?? [], this.maxDateCandidates, (entry) =>
      typeof entry.departure === "string" && typeof entry.return === "string" &&
      differenceInCalendarDays(entry.return, entry.departure) >= request.stayRange!.minDays &&
      differenceInCalendarDays(entry.return, entry.departure) <= request.stayRange!.maxDays);
    if (entries.length) {
      return entries.map((entry) => ({ departure: entry.departure!, returnDate: entry.return! }));
    }
    return planRoundTripDates(request.dateWindow, request.stayRange!)
      .slice(0, this.maxDateCandidates)
      .map((pair) => ({ departure: pair.firstDate, returnDate: pair.secondDate }));
  }

  private async searchStandardDates(
    request: StandardSearchRequest,
    destinationCode: string,
    departure: string,
    returnDate: string | undefined,
    signal?: AbortSignal
  ): Promise<Itinerary[]> {
    const parameters: SearchApiParameters = {
      engine: "google_flights",
      flight_type: request.tripType === "one-way" ? "one_way" : "round_trip",
      departure_id: request.origin.code,
      arrival_id: destinationCode,
      outbound_date: departure,
      return_date: returnDate,
      sort_by: "price",
      ...passengerParameters(request)
    };
    const firstResponse = await this.client.search(parameters, signal);
    const firstResults = allFlightResults(firstResponse).slice(0, this.maxBranches);
    const priceHistory = history(firstResponse);

    if (request.tripType === "one-way") {
      return firstResults.map((result) => itinerary(
        destinationCode,
        result.flights!.map(mapSegment),
        result.price!,
        result.total_duration ?? result.flights!.reduce((sum, flight) => sum + (flight.duration ?? 0), 0),
        1,
        result.booking_token,
        parameters,
        priceHistory
      ));
    }

    const combinations = await Promise.all(firstResults
      .filter((result) => result.departure_token)
      .map(async (outbound) => {
        const response = await this.client.search({ ...parameters, departure_token: outbound.departure_token }, signal);
        return allFlightResults(response).slice(0, this.maxBranches).map((inbound) => itinerary(
          destinationCode,
          [...outbound.flights!.map(mapSegment), ...inbound.flights!.map(mapSegment)],
          inbound.price!,
          (outbound.total_duration ?? 0) + (inbound.total_duration ?? 0),
          2,
          inbound.booking_token,
          parameters,
          priceHistory
        ));
      }));
    return combinations.flat();
  }

  private async searchMultiCity(request: MultiCitySearchRequest, signal?: AbortSignal): Promise<Itinerary[]> {
    const pairs = planMultiCityDates(request.dateWindow, request.stayRange)
      .slice(0, this.maxDateCandidates);
    const results = await Promise.all(pairs.map(async (pair) => {
      const parameters: SearchApiParameters = {
        engine: "google_flights",
        flight_type: "multi_city",
        multi_city_json: JSON.stringify([
          { departure_id: request.legs[0].origin.code, arrival_id: request.legs[0].destination.code, outbound_date: pair.firstDate },
          { departure_id: request.legs[1].origin.code, arrival_id: request.legs[1].destination.code, outbound_date: pair.secondDate }
        ]),
        sort_by: "price",
        ...passengerParameters(request)
      };
      const firstResponse = await this.client.search(parameters, signal);
      const firstLegs = allFlightResults(firstResponse).slice(0, this.maxBranches);
      const combinations = await Promise.all(firstLegs
        .filter((result) => result.departure_token)
        .map(async (firstLeg) => {
          const response = await this.client.search({ ...parameters, departure_token: firstLeg.departure_token }, signal);
          return allFlightResults(response).slice(0, this.maxBranches).flatMap((secondLeg) => {
            const firstSegments = firstLeg.flights!.map(mapSegment);
            const secondSegments = secondLeg.flights!.map(mapSegment);
            const arrivalDate = firstSegments.at(-1)!.arrivalLocal.slice(0, 10);
            const nextDepartureDate = secondSegments[0]!.departureLocal.slice(0, 10);
            if (!isMultiCityStayValid(arrivalDate, nextDepartureDate, request.stayRange)) return [];
            return [itinerary(
              request.legs[0].destination.code,
              [...firstSegments, ...secondSegments],
              secondLeg.price!,
              (firstLeg.total_duration ?? 0) + (secondLeg.total_duration ?? 0),
              2,
              secondLeg.booking_token,
              parameters,
              undefined,
              { fromCode: request.legs[0].destination.code, toCode: request.legs[1].origin.code }
            )];
          });
        }));
      return combinations.flat();
    }));
    return results.flat();
  }

  async bookingOptions(context: SearchApiBookingContext, signal?: AbortSignal): Promise<SellerQuote[]> {
    const response = await this.client.search({
      ...context.searchParameters,
      booking_token: context.bookingToken
    }, signal);
    return (response.booking_options ?? [])
      .map((option, index) => this.mapBookingOption(option, index))
      .filter((quote): quote is SellerQuote => quote !== undefined)
      .sort((a, b) => a.price.amountMinor - b.price.amountMinor);
  }

  private mapBookingOption(option: SearchApiBookingOption, index: number): SellerQuote | undefined {
    if (!option.book_with || typeof option.price !== "number") return undefined;
    const bookingUrl = option.booking_request?.url ?? GOOGLE_FLIGHTS_URL;
    let trusted = false;
    try {
      trusted = new URL(bookingUrl).protocol === "https:";
    } catch {
      return undefined;
    }
    return {
      id: `searchapi-${index}-${option.book_with}-${option.price}`,
      sellerName: option.book_with,
      price: money(option.price),
      bookingUrl,
      trusted,
      ...(option.booking_request?.post_data ? { bookingPostData: option.booking_request.post_data } : {}),
      ...(option.booking_phone ? { bookingPhone: option.booking_phone } : {}),
      ...(option.fare_type ? { fareType: option.fare_type } : {}),
      ...(option.baggage_prices ? { baggageNotes: option.baggage_prices } : {})
    };
  }
}
