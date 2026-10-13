import type { SearchRequest, SearchRoute } from "@flight/contracts";
import { validateSearchRequest } from "./search-validation";

export function expandSearchRoutes(unvalidatedRequest: SearchRequest): SearchRoute[] {
  const request = validateSearchRequest(unvalidatedRequest);
  if (request.tripType === "multi-city") {
    return [
      {
        id: `${request.id}:multi`,
        parentSearchId: request.id,
        kind: "multi-city",
        legs: request.legs
      }
    ];
  }

  return request.destinations.map((destination) => ({
    id: `${request.id}:${destination.code}`,
    parentSearchId: request.id,
    kind: "standard" as const,
    tripType: request.tripType,
    origin: request.origin,
    destination
  }));
}

