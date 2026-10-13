import type { SearchRequest } from "@flight/contracts";

export function searchSignature(request: SearchRequest): string {
  return JSON.stringify({ ...request, id: "" });
}

export function mergeRecentSearches(
  current: SearchRequest[],
  request: SearchRequest,
  limit = 5
): SearchRequest[] {
  const signature = searchSignature(request);
  return [request, ...current.filter((item) => searchSignature(item) !== signature)].slice(0, limit);
}

