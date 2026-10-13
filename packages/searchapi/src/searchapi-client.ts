export type SearchApiParameters = Record<string, string | number | boolean | undefined>;

export interface SearchApiAirport {
  id?: string;
  name?: string;
  date?: string;
  time?: string;
}

export interface SearchApiFlight {
  departure_airport?: SearchApiAirport;
  arrival_airport?: SearchApiAirport;
  duration?: number;
  airline?: string;
  flight_number?: string;
}

export interface SearchApiFlightResult {
  flights?: SearchApiFlight[];
  total_duration?: number;
  price?: number;
  departure_token?: string;
  booking_token?: string;
}

export interface SearchApiCalendarEntry {
  departure?: string;
  return?: string;
  price?: number;
  has_no_flights?: boolean;
}

export interface SearchApiBookingOption {
  book_with?: string;
  price?: number;
  fare_type?: string;
  baggage_prices?: string[];
  booking_phone?: string;
  booking_request?: {
    url?: string;
    post_data?: string;
  };
}

export interface SearchApiResponse {
  best_flights?: SearchApiFlightResult[];
  other_flights?: SearchApiFlightResult[];
  calendar?: SearchApiCalendarEntry[];
  booking_options?: SearchApiBookingOption[];
  price_insights?: {
    price_history?: Array<{ price?: number; iso_date?: string }>;
  };
  error?: string;
}

export class SearchApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "SearchApiError";
  }
}

export class SearchApiClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly endpoint = "https://www.searchapi.io/api/v1/search"
  ) {
    if (!apiKey.trim()) throw new SearchApiError("SEARCHAPI_API_KEY is required");
  }

  async search(parameters: SearchApiParameters, signal?: AbortSignal): Promise<SearchApiResponse> {
    const url = new URL(this.endpoint);
    url.searchParams.set("api_key", this.apiKey);
    for (const [key, value] of Object.entries(parameters)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    let response: Response;
    try {
      response = await this.fetcher(url, signal ? { signal } : undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown network failure";
      throw new SearchApiError(`SearchAPI request failed: ${message}`);
    }
    if (!response.ok) {
      throw new SearchApiError(`SearchAPI returned HTTP ${response.status}`, response.status);
    }

    const payload = await response.json() as SearchApiResponse;
    if (payload.error) throw new SearchApiError(`SearchAPI error: ${payload.error}`, response.status);
    return payload;
  }
}
