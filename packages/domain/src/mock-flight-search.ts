import type {
  FlightSegment,
  Itinerary,
  Money,
  MultiCitySearchRequest,
  Place,
  PricedItineraryOffer,
  SearchRequest,
  SellerQuote,
  StandardSearchRequest
} from "@flight/contracts";
import {
  isMultiCityStayValid,
  planMultiCityDates,
  planOneWayDates,
  planRoundTripDates
} from "./date-candidate-planner";
import { groupItineraryOffers, rankItineraries } from "./itinerary-services";
import { validateSearchRequest } from "./search-validation";

const TRUSTED_SELLERS = new Set(["Greenline Air", "TripNest"]);
const DAY_MS = 86_400_000;

function addDays(value: string, days: number): string {
  return new Date(new Date(`${value}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

function codeScore(code: string): number {
  return [...code].reduce((total, character) => total + character.charCodeAt(0), 0);
}

function money(amountMinor: number): Money {
  return { amountMinor, currency: "USD" };
}

function segment(origin: Place, destination: Place, date: string, flightNumber: string): FlightSegment {
  return {
    originCode: origin.code,
    destinationCode: destination.code,
    departureUtc: `${date}T15:00:00Z`,
    arrivalUtc: `${addDays(date, 1)}T01:30:00Z`,
    departureLocal: `${date}T08:00:00-07:00`,
    arrivalLocal: `${addDays(date, 1)}T10:30:00+09:00`,
    operatingCarrierCode: "GL",
    operatingCarrierName: "Greenline Air",
    flightNumber
  };
}

function quote(
  id: string,
  sellerName: string,
  price: Money,
  seatsRemaining?: number
): SellerQuote {
  return {
    id,
    sellerName,
    price,
    bookingUrl: `https://example.com/book/${id}`,
    trusted: true,
    ...(seatsRemaining === undefined ? {} : { seatsRemaining })
  };
}

function offersForSegments(
  destinationCode: string,
  segments: FlightSegment[],
  basePriceMinor: number,
  index: number,
  surfaceTransfer?: { fromCode: string; toCode: string }
): PricedItineraryOffer[] {
  const common = {
    destinationCode,
    segments,
    totalDurationMinutes: segments.length === 1 ? 630 : 1_290,
    stops: 0,
    ...(surfaceTransfer ? { surfaceTransfer } : {})
  };
  return [
    {
      ...common,
      quote: quote(`gl-${destinationCode}-${index}`, "Greenline Air", money(basePriceMinor + 2_400), index % 2 === 0 ? 4 : undefined)
    },
    {
      ...common,
      quote: quote(`tn-${destinationCode}-${index}`, "TripNest", money(basePriceMinor))
    }
  ];
}

function standardOffers(request: StandardSearchRequest): PricedItineraryOffer[] {
  const offers: PricedItineraryOffer[] = [];
  request.destinations.forEach((destination, destinationIndex) => {
    const datePairs = request.tripType === "one-way"
      ? planOneWayDates(request.dateWindow).slice(0, 3).map((date) => ({ firstDate: date }))
      : planRoundTripDates(request.dateWindow, request.stayRange!).slice(0, 3);

    datePairs.forEach((dates, dateIndex) => {
      const flightNumber = `${destinationIndex + 2}${dateIndex + 1}0`;
      const segments = [segment(request.origin, destination, dates.firstDate, flightNumber)];
      const secondDate = "secondDate" in dates && typeof dates.secondDate === "string" ? dates.secondDate : undefined;
      if (secondDate) {
        segments.push(segment(destination, request.origin, secondDate, `${flightNumber}R`));
      }
      const base = 18_000 + codeScore(destination.code) * 100 + destinationIndex * 3_000 + dateIndex * 1_700;
      offers.push(...offersForSegments(destination.code, segments, base, dateIndex));
    });
  });
  return offers;
}

function multiCityOffers(request: MultiCitySearchRequest): PricedItineraryOffer[] {
  const [firstLeg, secondLeg] = request.legs;
  const pairs = planMultiCityDates(request.dateWindow, request.stayRange)
    .filter((pair) => isMultiCityStayValid(addDays(pair.firstDate, 1), pair.secondDate, request.stayRange))
    .slice(0, 4);
  return pairs.flatMap((pair, index) => {
    const segments = [
      segment(firstLeg.origin, firstLeg.destination, pair.firstDate, `4${index + 1}0`),
      segment(secondLeg.origin, secondLeg.destination, pair.secondDate, `8${index + 1}0`)
    ];
    const base = 42_000 + codeScore(firstLeg.destination.code) * 100 + index * 2_100;
    return offersForSegments(
      firstLeg.destination.code,
      segments,
      base,
      index,
      { fromCode: firstLeg.destination.code, toCode: secondLeg.origin.code }
    );
  });
}

export function searchMockFlights(unvalidatedRequest: SearchRequest): Itinerary[] {
  const request = validateSearchRequest(unvalidatedRequest);
  const offers = request.tripType === "multi-city" ? multiCityOffers(request) : standardOffers(request);
  return rankItineraries(groupItineraryOffers(offers, { allowedSellers: TRUSTED_SELLERS }));
}
