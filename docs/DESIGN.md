# Flight Ticket Recommendation App — Product and Technical Design

Status: proposed for implementation  
Last updated: 2026-09-18

## 1. Purpose

Build a responsive flight recommendation web app that helps a traveller explore flexible travel dates, compare distinct flight combinations, and see the available sellers for each combination. The experience should feel friendly and guided: one focused question at a time, clear progress, playful but restrained motion, and simple results.

This document is the implementation contract for the first release. It separates requirements we can guarantee in our code from data that depends on a licensed flight supplier.

## 2. Product goals

- Let a user describe a one-way, round-trip, or two-leg multi-city trip in a questionnaire flow.
- Let one-way and round-trip users compare several possible destination cities/airports in one search.
- Search a flexible date window and return up to 20 distinct itineraries, ordered by total price ascending.
- Group seller quotes for the same physical flights under one itinerary.
- Show accurate flight, price, seller, and availability details without fabricating missing supplier data.
- Return useful initial results quickly, continue gathering results for completeness, and stop at a 60-second application timeout.
- Remember the five most recent searches and let the user rerun any of them.
- Keep supplier integration, ranking, persistence, and UI concerns replaceable and independently testable.

## 3. Important scope clarifications

### 3.1 Origin is required; destinations are a list

The requested fields name a destination but not an origin. A live flight search cannot run without an origin. The questionnaire will therefore ask for an origin and one or more possible destinations, each accepting a city or airport.

For one-way and round-trip searches, every destination is searched independently with the same dates, stay range, and travellers. The normalized results are merged into one pool, deduplicated, globally sorted by lowest total price, and capped at 20 overall. Destination badges, filter chips, and counts make the mixed result set understandable; strict global price ordering means a destination is not guaranteed a slot when all of its options fall below the top 20. The v1 input accepts one to three distinct destinations.

### 3.2 Multi-city is a two-leg flexible-date search

Multi-city is limited to exactly two legs in v1. Each leg has one origin and one destination, so the user enters four place values in order:

```text
leg 1: origin 1 -> destination 1
leg 2: origin 2 -> destination 2
```

For example: `home -> Paris`, followed by `London -> home`. A single outer date window applies to both departures, and a minimum/maximum stay controls the number of calendar days from the first leg's arrival date to the second leg's departure date. Both departure dates must remain inside the outer date window.

The Paris-to-London surface journey is not part of the flight itinerary, price, or protection. The review and result detail screens must call out this open gap and tell the user they are responsible for travelling between those cities/airports.

Multiple alternatives per multi-city leg endpoint are not included in v1. Combining destination lists on both legs would multiply route combinations by date pairs and provider sessions. The general multi-destination field therefore applies to one-way and round-trip searches; multi-city uses one place per endpoint.

### 3.3 Flexible dates are bounded exploration

- One-way: any departure date inside `dateFrom...dateTo`.
- Round-trip: outbound and inbound must both be inside the selected window; `minNights <= inbound - outbound <= maxNights`.
- Multi-city: the two departure dates are selected from the shared window and must satisfy the stay range between leg 1 arrival and leg 2 departure.

For example, with September 10–20 and a 4–5 night trip, September 10/14 and September 15/19 are valid; September 17/21 is not.

### 3.4 “Best value” in v1 means cheapest trusted offer

Only itineraries with at least one accepted seller quote participate. They are sorted by the cheapest current total price for all travellers, including supplier-reported taxes and mandatory fees. Duration, stops, baggage, and self-transfer risk are shown but do not secretly alter the requested ascending-price order. A configurable value score can be added later as a separate sort.

### 3.5 Supplier limitations are visible

- “Seats left” is shown only when the supplier returns an explicit bookable-seat count. Otherwise the UI says “Seat availability not provided.” It must not infer scarcity from fare classes or marketing text.
- A 30-day chart is exact-itinerary history collected by this application. It appears only when observations exist and includes a coverage label such as “8 observations over 30 days.”
- Prices are volatile. Before redirecting, the app refreshes the selected itinerary when the supplier supports it and displays “last checked” time.
- “All places to purchase” means all seller options returned by the licensed provider for that itinerary, not every seller on the internet.

## 4. Data-source strategy

### Primary production candidate: Skyscanner Flights Live Prices

Skyscanner’s partner API is the best match for the metasearch requirements:

- `/create` returns an initial cached subset and a session token.
- `/poll` progressively returns fuller live results.
- Itineraries include pricing options, agents, and deep links.
- Cities and airports are valid place types.
- The provider supports multi-city query legs; this product intentionally limits the first release to two.
- An itinerary refresh flow can recheck a selected price.

Access is not self-serve: an API key requires partnership approval. Until credentials are available, development uses a realistic deterministic `MockFlightProvider` and contract fixtures. We will not scrape airline, OTA, Google Flights, or consumer metasearch pages; scraping is brittle and may violate terms or redistribution rights.

### Optional provider alternatives

- `DuffelProvider`: useful if the product later books directly. It exposes airline offers and supports supplier timeouts, but it is not a complete “compare every seller” metasearch substitute.
- Another licensed GDS/metasearch feed can be added behind the same provider contract.

### Provider trust policy

`SellerTrustPolicy` evaluates supplier-provided agent metadata and our configuration:

1. require a licensed provider record and HTTPS booking link;
2. allow airlines by default;
3. allow configured OTAs with supported market coverage;
4. block a seller immediately through a denylist;
5. preserve provider-required attribution and redirect tracking;
6. log, but never display, rejected quote reasons.

The initial allowlist is a product/operations configuration, not hard-coded business logic.

## 5. User experience

### 5.1 Visual direction

The supplied Duolingo reference is inspiration for interaction and mood, not a template to copy. The app will use an original identity with:

- a warm off-white canvas, fresh green primary color, dark ink text, and a small sky-blue accent;
- rounded cards and pill controls with clear borders and subtle depth;
- a compact progress rail and back button at the top;
- large question headings, concise helper text, and one dominant action;
- a simple original travel mascot/illustration only if we create or license it;
- spring-like transitions that respect `prefers-reduced-motion`;
- AA contrast, visible focus states, full keyboard operation, and 44 px minimum targets.

No Duolingo logo, owl, copy, or proprietary asset will be used.

### 5.2 Questionnaire flow

The order reduces rework because trip type changes the questions that follow:

1. Welcome / start, with up to five recent searches when available.
2. Trip type: one-way, round-trip, or two-leg multi-city.
3. Route:
   - one-way/round-trip: one origin plus a multi-select of destination cities/airports;
   - multi-city: exactly two rows, each with a single origin and destination.
4. Travel window:
   - one-way: date-range calendar representing eligible departure dates;
   - round-trip: outer date window for both flights;
   - multi-city: outer date window for both leg departures.
5. Stay range: a dual-thumb slider plus editable values for round-trip and multi-city. For multi-city it measures the gap from leg 1 arrival date to leg 2 departure date.
6. Travellers: adults and children; child ages are requested because suppliers price them by age. Infants are represented by age 0/1.
7. Review: human-readable summary with edit links, destination alternatives, and any multi-city surface gap.
8. Search action.

State survives back/forward navigation and a page reload during an unfinished questionnaire. Validation is local and immediate; the Continue button remains disabled until the step is valid, with an accessible explanation.

### 5.3 Loading and results

The loading view keeps the progress rail, shows an original lightweight travel animation, and cycles through truthful states such as “Checking date combinations” and “Comparing seller prices.” It never displays fake numeric progress.

Results render progressively:

- show skeletons immediately;
- display the first valid results as soon as the provider create response arrives;
- merge poll updates without moving a focused card unexpectedly;
- continue polling completed provider sessions while showing usable results;
- finalize when all planned provider work completes or at the 60-second application timeout, and label genuinely incomplete supplier work if the timeout is reached.

Each card shows total trip price, per-person price, dates, local departure/arrival times with airport time zones, operating and marketing carriers, flight numbers, stops, total duration, transfer warning, baggage when supplied, and explicit seat-availability status. The default list is price ascending and contains at most 20 cards.

For a search with alternative destinations, each card also has a prominent destination badge and the results header offers destination filter chips without changing the underlying price order.

Selecting a card opens an itinerary detail route (shareable by app itinerary ID) with:

- complete leg and segment timeline;
- fare/baggage/refund facts when supplied;
- seller quotes sorted by price ascending;
- seller name, quote total, last checked time, and outbound booking link;
- warnings for self-transfer, protected self-transfer, or multiple-booking “mash-up” options;
- the 30-day observed-price chart or an honest empty state.

### 5.4 Search history

The latest five unique normalized searches are kept in browser storage for anonymous users. Repeating a search moves it to the front. Clicking history restores the questionnaire values and starts a fresh live search; cached old prices are never presented as current. A later account feature can sync history server-side without changing the UI contract.

## 6. Architecture

### 6.1 Repository layout

Use a TypeScript pnpm monorepo:

```text
apps/
  web/                 Next.js App Router UI and browser tests
  api/                 Fastify HTTP/SSE API
  worker/              background price-observation and maintenance jobs
packages/
  domain/              pure trip, itinerary, money, and ranking rules
  flight-providers/    provider port, Skyscanner adapter, mock adapter
  contracts/           versioned request/response schemas and generated types
  db/                  schema, migrations, repositories
  ui/                  tokens and reusable accessible components
  config/              typed environment/config loading
docs/
```

The UI never calls a flight provider directly. Provider secrets and raw responses stay server-side.

### 6.2 Runtime components

```text
Browser
  -> Web app
  -> API / SearchOrchestrator
       -> RouteExpansionService
       -> DateCandidatePlanner
       -> FlightProvider adapter(s)
       -> Normalizer + SellerTrustPolicy
       -> ItineraryGrouper
       -> ResultRanker
       -> Redis search/session cache
       -> PostgreSQL observations
  -> SSE search updates
```

Start as a modular monolith deployed as three processes (web, API, worker), not distributed microservices. Boundaries are expressed through package interfaces so components can split later only when load justifies it.

### 6.3 Core services

- `SearchOrchestrator`: owns the deadline, cancellation, concurrency, partial results, and telemetry.
- `RouteExpansionService`: expands one origin plus destination alternatives into independent route searches while preserving one parent search.
- `DateCandidatePlanner`: generates only valid one-way dates, round-trip pairs, and two-leg multi-city date pairs.
- `FlightProvider`: starts, polls, refreshes, and maps a licensed provider session.
- `OfferNormalizer`: converts provider-specific objects into domain records and preserves raw IDs for traceability.
- `SellerTrustPolicy`: admits or rejects seller quotes.
- `ItineraryGrouper`: creates one result per physical flight combination and attaches quotes.
- `ResultRanker`: selects each group’s lowest accepted quote and sorts groups.
- `PriceObservationService`: stores observed minimum prices and queries the last 30 days.
- `SearchHistoryRepository`: browser implementation in v1; account implementation later.

### 6.4 Route expansion, search timeout, and flexible-date algorithm

A naive live query for every destination and possible date pair can still exceed provider rate limits even with 60 seconds. The orchestrator favors completeness within a bounded search space:

1. Normalize and deduplicate destination selections.
2. Expand each one-way/round-trip destination into an independent child route search under the same parent search ID. Multi-city has one two-leg route.
3. Enumerate all mathematically valid date or date-pair candidates per child route.
4. Use a fast indicative-price endpoint, when available, to score candidates. Because the selected provider documents multi-city only for live pricing, two-leg multi-city planning must not assume indicative multi-city prices exist.
5. Select a bounded, date-diverse set for live search. Candidate and destination caps are tuned to provider quotas and the 60-second timeout.
6. Start live searches with bounded concurrency and fair scheduling across destinations so one route cannot consume the entire timeout.
7. Normalize, filter, group, globally sort, and stream the current top 20 after every meaningful update.
8. Continue polling until all planned sessions complete. Stop starting new work shortly before 60 seconds, drain useful in-flight responses, cancel remaining work at the timeout, and finalize.

Candidate generation for round-trip is:

```text
for outbound in eachDay(dateFrom, dateTo):
  for nights in minNights..maxNights:
    inbound = outbound + nights
    if inbound <= dateTo:
      emit(outbound, inbound)
```

Two-leg multi-city uses the same pair shape, except `firstDeparture` is leg 1 and `secondDeparture` is leg 2. The gap is checked in local calendar dates using leg 1's arrival date rather than assuming leg 1 arrives on its departure date:

```text
for firstDeparture in eachDay(dateFrom, dateTo):
  for secondDeparture in eachDay(firstDeparture, dateTo):
    candidate = (leg1 on firstDeparture, leg2 on secondDeparture)
    after leg 1 schedule is known:
      stayDays = secondDeparture - leg1.arrivalLocalDate
      keep candidate only when minStay <= stayDays <= maxStay
```

The provider request uses a preliminary departure-date gap; normalization performs the definitive arrival-aware validation and rejects results outside the requested stay range.

This two-leg feature is implementable without a fundamentally new architecture: it is comparable to flexible round-trip search plus explicit open-jaw routing. It is heavier than round-trip because indicative multi-city pricing may be unavailable, so more live sessions may be needed. It remains practical with exactly two legs, one place per endpoint, a maximum outer window (initially 31 days), bounded candidate selection, concurrency/rate limits, and the 60-second timeout. An exhaustive guarantee across every pair is still impossible when supplier quotas or latency intervene; any incomplete work is disclosed rather than hidden.

### 6.5 Canonical itinerary identity and deduplication

Seller offers are grouped by a canonical fingerprint of the physical flights, independent of seller and price.

For every leg and ordered segment, include:

- origin and destination IATA/entity identity;
- scheduled departure and arrival instants normalized to UTC;
- operating carrier and operating flight number;
- marketing carrier/flight number when present.

Hash the versioned canonical serialization (for example `itinerary:v1:<sha256>`). Do not include provider offer ID, seller, price, baggage, or fare brand. This means the same flights sold by three websites become one itinerary with three or more quotes. Different physical segments, times, or flight numbers remain distinct.

Because fare conditions can differ by seller, every quote retains its own baggage, change/refund, transfer, and booking-unit information. The detail page never implies that the cheapest quote’s conditions apply to every seller.

### 6.6 Money, dates, and localization

- Store money as integer minor units plus ISO 4217 currency; never use floating point.
- The API returns a single user-selected currency when the supplier supports it. Do not locally compare unconverted currencies.
- Store instants in UTC and retain airport IANA time zone/local ISO text for display.
- Compute trip nights from destination-local calendar dates, not elapsed hours, avoiding DST errors.
- All public timestamps and schemas use ISO 8601.

## 7. Domain model

Key records (abridged):

```text
SearchRequest
  id, tripType, origin?, destinations[1..3]?, dateWindow, stayRange?,
  multiCityLegs[2]?, travellers, cabinClass, market, locale, currency

SearchRoute
  id, parentSearchId, routeKey, destination?, legs[2]?, status

SearchSession
  id, status, startedAt, timeoutAt, routes[], providerSessions[], isPartial, errors[]

Itinerary
  id, fingerprintVersion, fingerprint, legs[], quotes[], lowestPrice,
  seatsRemaining?, availabilityDisclosure, observedAt

Leg
  origin, destination, departureLocal, arrivalLocal, durationMinutes, segments[]

Segment
  operatingCarrier, marketingCarrier?, flightNumber, origin, destination,
  departureInstant, arrivalInstant, aircraft?, durationMinutes

SellerQuote
  id, provider, agentId, sellerName, totalMoney, deepLinks[], transferType,
  baggage?, conditions?, expiresAt?, observedAt, trusted

PriceObservation
  itineraryFingerprint, travellerSignature, cabinClass, market, currency,
  lowestPriceMinor, sellerCount, observedAt
```

Database constraints enforce idempotency on observations and uniqueness on `(search_session_id, itinerary_fingerprint)`.

## 8. API surface

All inputs and outputs are runtime-validated against schemas in `packages/contracts`.

```text
GET  /v1/places?q=...&market=...
POST /v1/searches
GET  /v1/searches/:searchId
GET  /v1/searches/:searchId/events        SSE
GET  /v1/searches/:searchId/itineraries
GET  /v1/itineraries/:itineraryId
POST /v1/itineraries/:itineraryId/refresh
GET  /v1/itineraries/:itineraryId/history?days=30
```

`POST /searches` returns `202 Accepted`, the search ID, an initial state, and event URL. SSE events are versioned and idempotent:

```text
search.started
search.progress
results.replaced
search.completed
search.partial
search.failed
```

If SSE disconnects, the client reconnects with `Last-Event-ID` or falls back to bounded polling. Search creation uses an idempotency key so retries do not multiply provider calls.

## 9. Storage and caching

### PostgreSQL

Persist normalized itineraries needed for stable detail routes, quote snapshots with short retention, price observations, provider audit IDs, and operational configuration history. Raw supplier payload retention must follow the provider agreement; default to encrypted short retention or no storage.

### Redis

- normalized search-key cache (short TTL, initially 5–10 minutes subject to provider rules);
- live search session state and SSE event replay;
- distributed single-flight lock so identical concurrent searches share provider work;
- provider rate-limit counters.

Browser `localStorage` holds only the five normalized search inputs, schema version, and timestamps—never API secrets or raw provider responses.

## 10. Reliability, performance, and observability

### Performance targets

- UI response to input: under 100 ms.
- API acknowledgement: p95 under 300 ms.
- first useful result: p75 under 3 seconds when provider create data is available.
- search finalization: 100% by 60 seconds at our boundary; partial only when planned supplier work has not completed or failed.
- cached repeat search: p95 under 1 second.

### Controls

- per-provider timeout, concurrency limit, circuit breaker, and exponential backoff only where safe;
- request cancellation propagated when the user starts another search;
- stale-if-error cache clearly timestamped, never silently called live;
- rate limiting by IP/session plus bounded date window and passenger count;
- structured logs with search ID, provider, stage, duration, counts, and rejection reasons;
- metrics for time to first result, total latency, supplier completion, cache hit rate, dedupe ratio, quote freshness, and error rate;
- traces across place lookup, candidate planning, supplier calls, normalization, and streaming.

## 11. Security, privacy, and compliance

- Keep provider keys in server-side secret storage and rotate them.
- Validate every URL and allow only HTTPS redirect destinations returned by the provider/allowlist.
- Validate and cap all arrays, strings, dates, windows, passenger counts, and multi-city legs.
- Apply CSP, secure headers, output encoding, CSRF protection where cookie auth is introduced, and dependency scanning.
- Do not collect traveller names, passport details, or payment data in v1.
- Provide privacy/cookie notices appropriate to analytics and affiliate tracking.
- Meet provider display, attribution, redirect, and operating-carrier disclosure rules.
- Record consent before non-essential analytics; redact IPs and provider tokens from logs.

## 12. Failure and empty states

- No flights: preserve the search and suggest widening dates or nearby airports; do not rewrite inputs automatically.
- Some candidate searches fail: show successful results with a partial-results notice.
- All providers fail: show a retry action and stable error code; keep the questionnaire data.
- Quote expired/changed: refresh, show the new price clearly, and require the user to choose again.
- No price history: state “We haven’t observed this exact itinerary enough yet.”
- No seat count: state “Seat availability not provided by seller.”
- Seller rejected by trust policy: omit it; if no trusted quote remains, omit the itinerary.

## 13. Testing strategy

- Unit: date-pair boundaries, DST/night calculations, money, canonical fingerprint, grouping, sorting, trust policy, and five-item history.
- Property-based: every generated round-trip or multi-city pair is in range and satisfies its stay constraint; equivalent supplier offers create the same fingerprint.
- Contract: captured/redacted provider fixtures and schema drift detection.
- Integration: provider mock -> orchestrator -> Redis/PostgreSQL -> SSE.
- End-to-end: all three trip types, back/edit flow, progressive results, detail/sellers, history replay, empty/partial/failure states.
- Accessibility: automated checks plus keyboard and screen-reader smoke tests.
- Visual regression: mobile, tablet, desktop, reduced motion, high zoom, long airport names, and localized prices.
- Performance: broad windows multiplied by several destinations, fair route scheduling, identical-search coalescing, slow provider, and 60-second timeout cancellation.
- Security: input fuzzing, redirect allowlist tests, secret scanning, and authorization tests when accounts exist.

## 14. Decisions deferred from v1

- Account login and cross-device history.
- Direct booking/payment inside the app.
- Fare alerts and scheduled notifications.
- More than two multi-city legs or multiple alternative endpoints inside a multi-city leg.
- Personalized value ranking.
- Nearby-origin/destination radius and open-ended “anywhere” discovery.
- Native mobile apps; the first release is a responsive/PWA-ready web app.

## 15. External references

- [Skyscanner Flights Live Prices overview](https://developers.skyscanner.net/docs/flights-live-prices/overview)
- [Skyscanner query object](https://developers.skyscanner.net/docs/flights-live-prices/query-object)
- [Skyscanner booking and transfer types](https://developers.skyscanner.net/docs/flights-live-prices/booking-types)
- [Skyscanner refresh prices](https://developers.skyscanner.net/docs/flights-live-prices/refresh-prices)
- [Skyscanner API authentication and partnership access](https://developers.skyscanner.net/docs/getting-started/authentication)
- [Duffel offer requests and supplier timeout](https://duffel.com/docs/api/offer-requests)
