import { NextResponse } from "next/server";
import type { SearchApiBookingContext } from "@flight/contracts";
import { SearchApiClient, SearchApiError, SearchApiFlightService } from "@flight/searchapi";

export const runtime = "nodejs";
export const maxDuration = 60;

function isBookingContext(value: unknown): value is SearchApiBookingContext {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SearchApiBookingContext>;
  return candidate.provider === "searchapi" &&
    typeof candidate.bookingToken === "string" &&
    Boolean(candidate.bookingToken) &&
    Boolean(candidate.searchParameters) &&
    typeof candidate.searchParameters === "object";
}

export async function POST(request: Request) {
  const apiKey = process.env.SEARCHAPI_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "Live seller lookup is not configured" }, { status: 503 });

  let context: unknown;
  try {
    context = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  if (!isBookingContext(context)) {
    return NextResponse.json({ error: "Invalid booking context" }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55_000);
  try {
    const service = new SearchApiFlightService(new SearchApiClient(apiKey));
    const quotes = await service.bookingOptions(context, controller.signal);
    return NextResponse.json({ quotes });
  } catch (error) {
    const message = error instanceof SearchApiError ? error.message : "Seller lookup failed";
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
