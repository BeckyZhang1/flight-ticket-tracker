export type TripType = "one-way" | "round-trip" | "multi-city";

export interface Place {
  code: string;
  city: string;
  name: string;
  country: string;
}

export interface TravellerSelection {
  adults: number;
  childAges: number[];
}

export interface DateWindow {
  from: string;
  to: string;
}

export interface StayRange {
  minDays: number;
  maxDays: number;
}

export interface MultiCityLeg {
  origin: Place;
  destination: Place;
}

interface SearchRequestBase {
  id: string;
  tripType: TripType;
  dateWindow: DateWindow;
  travellers: TravellerSelection;
  stayRange?: StayRange;
}

export interface StandardSearchRequest extends SearchRequestBase {
  tripType: "one-way" | "round-trip";
  origin: Place;
  destinations: Place[];
}

export interface MultiCitySearchRequest extends SearchRequestBase {
  tripType: "multi-city";
  legs: [MultiCityLeg, MultiCityLeg];
  stayRange: StayRange;
}

export type SearchRequest = StandardSearchRequest | MultiCitySearchRequest;

export interface Money {
  amountMinor: number;
  currency: "USD";
}

export interface FlightSegment {
  originCode: string;
  destinationCode: string;
  departureUtc: string;
  arrivalUtc: string;
  departureLocal: string;
  arrivalLocal: string;
  operatingCarrierCode: string;
  operatingCarrierName: string;
  flightNumber: string;
  durationMinutes?: number;
}

export interface SellerQuote {
  id: string;
  sellerName: string;
  price: Money;
  bookingUrl: string;
  trusted: boolean;
  seatsRemaining?: number;
  bookingPostData?: string;
  bookingPhone?: string;
  fareType?: string;
  baggageNotes?: string[];
}

export interface PriceHistoryPoint {
  observedAt: string;
  price: Money;
}

export interface SearchApiBookingContext {
  provider: "searchapi";
  bookingToken: string;
  searchParameters: Record<string, string>;
}

export interface Itinerary {
  id: string;
  fingerprint: string;
  destinationCode: string;
  segments: FlightSegment[];
  quotes: SellerQuote[];
  lowestPrice: Money;
  totalDurationMinutes: number;
  stops: number;
  source?: "sample" | "searchapi-google-flights";
  priceHistory?: PriceHistoryPoint[];
  bookingContext?: SearchApiBookingContext;
  surfaceTransfer?: {
    fromCode: string;
    toCode: string;
  };
}

export interface StandardSearchRoute {
  id: string;
  parentSearchId: string;
  kind: "standard";
  tripType: "one-way" | "round-trip";
  origin: Place;
  destination: Place;
}

export interface MultiCitySearchRoute {
  id: string;
  parentSearchId: string;
  kind: "multi-city";
  legs: [MultiCityLeg, MultiCityLeg];
}

export type SearchRoute = StandardSearchRoute | MultiCitySearchRoute;

export interface PricedItineraryOffer {
  destinationCode: string;
  segments: FlightSegment[];
  quote: SellerQuote;
  totalDurationMinutes: number;
  stops: number;
  surfaceTransfer?: {
    fromCode: string;
    toCode: string;
  };
}
