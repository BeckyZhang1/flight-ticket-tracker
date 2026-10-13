# Flight Ticket Recommendation App — Implementation Plan

This plan implements [DESIGN.md](./DESIGN.md) in independently verifiable slices. Live-provider work can proceed only after credentials and commercial terms are available; all other phases use the same provider contract with deterministic fixtures.

## Phase 0 — Product decisions and provider access

### Work

1. Record the v1 route rules: one to three destinations for one-way/round-trip, and exactly two legs with one place per endpoint for multi-city.
2. Choose product name, original visual identity, default market/currency, and whether cabin class remains fixed to economy in v1.
3. Apply for Skyscanner partner API access and review its current UX, attribution, caching, data-retention, and redirect rules.
4. Decide the initial airline/OTA trust allowlist and owner for ongoing review.
5. Define supported browsers, deployment region, analytics/privacy policy, and production SLOs.

### Exit criteria

- Open decisions are recorded.
- Provider access is either approved or the first release is explicitly accepted as demo/mock data.
- No implementation claims that a demo supplier is live inventory.

## Phase 1 — Foundation and executable contracts

### Work

1. Initialize pnpm workspace, TypeScript strict mode, shared lint/format/test config, and CI.
2. Scaffold `apps/web`, `apps/api`, `apps/worker`, and the shared packages from the design.
3. Add typed, runtime-validated environment configuration with `.env.example`; keep secrets out of Git.
4. Define versioned schemas for places, searches, progressive events, itineraries, quotes, and history.
5. Implement domain value objects for money, places, travellers, date windows, durations, legs, and search status.
6. Add PostgreSQL and Redis local development services plus health checks and migrations.
7. Add request IDs, structured logging, error envelopes, and baseline metrics.

### Verification

- clean install and build from a fresh checkout;
- typecheck, lint, unit tests, migration up/down, and health endpoints in CI;
- invalid configuration fails at startup with a useful message;
- secrets and generated files are ignored.

## Phase 2 — Search domain and provider simulator

### Work

1. Implement and property-test `DateCandidatePlanner` for one-way, round-trip, and arrival-aware two-leg multi-city searches.
2. Implement `RouteExpansionService` to normalize/deduplicate destination lists, create one child route search per destination, and schedule them fairly.
3. Define `FlightProvider` operations: place suggestions, indicative candidates, start live search, poll, refresh, and cancel.
4. Create deterministic mock fixtures covering multiple destinations, two-leg open-jaw routes, overnight leg 1 arrival, direct, connection, codeshare, self-transfer, multi-seller, changing price, no seats field, partial failure, and no results.
5. Implement normalization into provider-independent domain records, including definitive multi-city stay validation from leg 1 local arrival date.
6. Implement versioned itinerary fingerprinting and quote grouping.
7. Implement seller trust filtering, merged cross-destination ranking, and per-destination result counts.
8. Build `SearchOrchestrator` with fair route concurrency, idempotency, caching, shared 60-second timeout, and cancellation.
9. Expose create/read/SSE/detail/history API endpoints.

### Verification

- the September 10–20 / 4–5 night example emits only valid pairs;
- several destinations produce independent child searches and one globally price-sorted result pool;
- one-way/round-trip requests reject a fourth distinct destination at both contract and UI boundaries;
- two-leg multi-city candidates keep both departures in range and validate the stay against leg 1 arrival;
- a Paris-to-London surface gap is preserved and never included in the flight price;
- identical flights from multiple sellers produce one itinerary with sorted quotes;
- different physical segments never collapse;
- top 20 is stable and price ascending;
- completed provider sessions are allowed to run while usable results stream, and a simulated hung supplier is cancelled at 60 seconds;
- duplicate client retries share one supplier search.

## Phase 3 — Questionnaire UI and design system

### Work

1. Create original color, typography, spacing, radius, shadow, and motion tokens based on the design direction.
2. Build accessible primitives: button, card, progress rail, combobox, calendar, traveller stepper, dual-thumb duration slider, toast, skeleton, and dialog/drawer.
3. Implement a URL-aware questionnaire state machine with back/edit and reload recovery.
4. Build trip-type branching, origin/destination suggestions, destination multi-select, date validation, round-trip stay range, fixed two-leg multi-city route and stay range, travellers, and review.
5. Implement recent-search storage: schema migration, normalize destination lists and two-leg routes, dedupe, cap at five, restore, rerun, and clear.
6. Create responsive layouts and reduced-motion behavior.

### Verification

- complete every flow using only a keyboard;
- back navigation never loses valid answers;
- invalid date/stay combinations cannot submit, and duplicate destinations collapse cleanly;
- multi-city review clearly shows all four endpoints and any unpriced surface gap;
- long airport/city names, 200% zoom, narrow phones, and desktop layouts remain usable;
- automated accessibility and visual-regression suites pass.

## Phase 4 — Progressive results and itinerary details

### Work

1. Connect search submission to API creation and SSE updates.
2. Build truthful loading states, cancellation, reconnect, and polling fallback.
3. Build result cards and a globally price-ascending list with destination badges, filter chips/counts, stable updates, and a 20-item overall cap.
4. Build itinerary detail timeline and per-quote fare facts.
5. Build seller list sorted by price, safe external redirect, and transfer/multiple-booking warnings.
6. Implement refresh-before-redirect and changed/expired quote flows.
7. Build 30-day chart with coverage and empty states.
8. Add empty, partial, timeout, provider-down, and stale-cache states.

### Verification

- first mock results stream without waiting for completion;
- focus and scroll position remain stable as updates arrive;
- seller conditions stay associated with the correct quote;
- links cannot redirect to an unapproved/non-HTTPS host;
- price changes are visible before the user leaves the app;
- history replay runs a new search rather than displaying an old price.

## Phase 5 — Production provider integration

### Work

1. Implement the Skyscanner adapter from current official schemas and contract fixtures.
2. Map Autosuggest places, create/poll sessions, result actions, agents, carriers, legs, segments, pricing options, deep links, transfer types, and refresh sessions.
3. Implement provider-specific rate limiting, retry classification, circuit breaker, caching, attribution, and required tracking.
4. Validate passenger, market, locale, currency, nearby-airport, destination-count, and exactly-two-leg product rules.
5. Run shadow comparison between raw fixtures and normalized output; alert on schema drift.
6. Confirm production terms for caching quote snapshots and recording aggregated historical observations.

### Verification

- sandbox/partner certification cases pass;
- operating carriers and transfer risks render per provider rules;
- no raw token/key reaches browser logs or payloads;
- create/poll replacement semantics do not duplicate stale results;
- refresh failures degrade safely to a timestamped quote with a warning or block redirect, per provider rules.

## Phase 6 — Price observation worker

### Work

1. Record idempotent observations from successful user searches.
2. Aggregate daily minimum price by exact itinerary fingerprint, traveller signature, cabin, market, and currency.
3. Add retention and cleanup jobs consistent with supplier terms.
4. Optionally schedule only policy-approved refreshes for popular itineraries; do not create unbounded polling.
5. Add chart coverage thresholds and anomaly detection.

### Verification

- duplicate processing creates no duplicate daily point;
- prices for different traveller counts/currencies never mix;
- a fingerprint version change remains queryable and explicit;
- cleanup respects configured retention.

## Phase 7 — Hardening and launch

### Work

1. Run end-to-end, accessibility, compatibility, load, failure-injection, and security suites.
2. Tune per-destination candidate count, fair concurrency, and route caps using real provider latency and quotas.
3. Create dashboards and alerts for latency, provider errors, partial rate, cache, dedupe, quote freshness, and redirect failures.
4. Add CSP/security headers, rate limits, backup/restore checks, secret rotation, and incident runbooks.
5. Review copy for price volatility, transfer risk, seller scope, seat availability, history coverage, and affiliate disclosure.
6. Roll out behind a feature flag: internal -> small public cohort -> full release.

### Launch gates

- p95 and deadline targets pass with expected production traffic;
- no critical/high security or accessibility issue is open;
- provider contractual review is complete;
- partial and outage behavior has been exercised;
- dashboards, alerts, rollback, and on-call ownership exist.

## Suggested build order by user-visible increment

1. **Clickable shell:** questionnaire with local mock results.
2. **Correct search core:** flexible-date generation, grouping, and sorting.
3. **Complete comparison:** details, sellers, refresh, and history empty state.
4. **Real data:** approved provider adapter and policy compliance.
5. **Learning over time:** observed-price history.
6. **Production readiness:** performance, security, accessibility, and rollout.

Each increment must remain demoable and tested; provider approval should not block development of the domain or UI.

## Definition of done for the first release

- All three trip types can be completed from the guided flow.
- One-way and round-trip searches accept one to three destinations and merge their independent results.
- Round-trip and two-leg multi-city candidates obey both date-window and stay-range constraints.
- Multi-city shows the four entered endpoints and discloses any surface transfer not covered by the flight search.
- Up to 20 trusted, distinct itineraries display in ascending total price.
- Equivalent seller offers group beneath one physical itinerary.
- Every displayed fact is supplier-backed or explicitly unavailable.
- Detail pages show sorted seller links and exact-itinerary history when collected.
- The latest five searches can be restored and rerun.
- The app waits for planned work when possible, finalizes by 60 seconds at its boundary, and clearly marks genuinely incomplete results.
- Core flows meet accessibility, security, observability, and test gates.
