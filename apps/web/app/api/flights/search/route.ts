import { NextResponse } from "next/server";
import type { SearchRequest } from "@flight/contracts";
import { searchMockFlights, SearchValidationError } from "@flight/domain";
import { SearchApiClient, SearchApiError, SearchApiFlightService } from "@flight/searchapi";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  let body: SearchRequest;
  try {
    body = await request.json() as SearchRequest;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const apiKey = process.env.SEARCHAPI_API_KEY?.trim();
  if (!apiKey) {
    try {
      return NextResponse.json({ results: searchMockFlights(body), mode: "demo" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid search";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 58_000);
  try {
    const service = new SearchApiFlightService(new SearchApiClient(apiKey));
    const results = await service.search(body, controller.signal);
    return NextResponse.json({ results, mode: "live" });
  } catch (error) {
    if (error instanceof SearchValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof SearchApiError ? error.message : "Live flight search failed";
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
