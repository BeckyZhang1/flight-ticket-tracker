import type { SearchRequest } from "@flight/contracts";

export class SearchValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SearchValidationError";
  }
}

function assertIsoDate(value: string, label: string): void {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new SearchValidationError(`${label} must be a valid ISO date`);
  }
}

export function validateSearchRequest(request: SearchRequest): SearchRequest {
  assertIsoDate(request.dateWindow.from, "Date from");
  assertIsoDate(request.dateWindow.to, "Date to");

  if (request.dateWindow.from > request.dateWindow.to) {
    throw new SearchValidationError("Date from must be on or before date to");
  }

  if (request.travellers.adults < 1 || request.travellers.adults > 8) {
    throw new SearchValidationError("Adults must be between 1 and 8");
  }

  if (request.travellers.childAges.some((age) => age < 0 || age > 17)) {
    throw new SearchValidationError("Child ages must be between 0 and 17");
  }

  if (request.tripType === "multi-city") {
    if (request.legs.length !== 2) {
      throw new SearchValidationError("Multi-city searches require exactly two legs");
    }
  } else {
    const codes = new Set(request.destinations.map((place) => place.code));
    if (codes.size < 1 || codes.size > 3 || codes.size !== request.destinations.length) {
      throw new SearchValidationError("Choose between 1 and 3 distinct destinations");
    }
    if (codes.has(request.origin.code)) {
      throw new SearchValidationError("Origin cannot also be a destination");
    }
  }

  if (request.tripType !== "one-way") {
    const range = request.stayRange;
    if (!range || range.minDays < 1 || range.maxDays < range.minDays) {
      throw new SearchValidationError("Stay range must be valid");
    }
  }

  return request;
}
