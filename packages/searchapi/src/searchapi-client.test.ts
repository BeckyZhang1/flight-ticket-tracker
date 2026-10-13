import { describe, expect, it, vi } from "vitest";
import { SearchApiClient, SearchApiError } from "./searchapi-client";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("SearchApiClient", () => {
  it("requires a non-empty API key", () => {
    expect(() => new SearchApiClient("  ")).toThrow(SearchApiError);
  });

  it("sends parameters, omits undefined values, and forwards the abort signal", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ calendar: [] }));
    const client = new SearchApiClient("secret", fetcher, "https://search.test/api");
    const controller = new AbortController();
    await expect(client.search({ engine: "flights", adults: 2, optional: undefined }, controller.signal))
      .resolves.toEqual({ calendar: [] });
    const [url, init] = fetcher.mock.calls[0]!;
    const parsed = new URL(String(url));
    expect(parsed.searchParams.get("api_key")).toBe("secret");
    expect(parsed.searchParams.get("adults")).toBe("2");
    expect(parsed.searchParams.has("optional")).toBe(false);
    expect(init?.signal).toBe(controller.signal);
  });

  it("works without an abort signal", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ best_flights: [] }));
    const client = new SearchApiClient("key", fetcher);
    await client.search({ engine: "google_flights" });
    expect(fetcher.mock.calls[0]?.[1]).toBeUndefined();
  });

  it("turns HTTP and provider errors into SearchApiError", async () => {
    const httpClient = new SearchApiClient("key", vi.fn<typeof fetch>().mockResolvedValue(response({}, 429)));
    await expect(httpClient.search({})).rejects.toMatchObject({ status: 429, message: "SearchAPI returned HTTP 429" });

    const apiClient = new SearchApiClient("key", vi.fn<typeof fetch>().mockResolvedValue(response({ error: "bad query" })));
    await expect(apiClient.search({})).rejects.toThrow("SearchAPI error: bad query");
  });

  it("wraps Error and non-Error network failures", async () => {
    const errorClient = new SearchApiClient("key", vi.fn<typeof fetch>().mockRejectedValue(new Error("offline")));
    await expect(errorClient.search({})).rejects.toThrow("SearchAPI request failed: offline");
    const unknownClient = new SearchApiClient("key", vi.fn<typeof fetch>().mockRejectedValue("offline"));
    await expect(unknownClient.search({})).rejects.toThrow("SearchAPI request failed: Unknown network failure");
  });
});
