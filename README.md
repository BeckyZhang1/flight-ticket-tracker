# Wanderly flight recommendation prototype

A mobile-first flight search prototype with flexible dates, up to three alternative destinations, two-leg open-jaw trips, itinerary deduplication, seller comparison, and five-item recent history.

The server integrates with SearchAPI.io's Google Flights and Google Flights Calendar endpoints. If no API key is configured, the UI clearly switches to deterministic demo inventory; it never silently substitutes demo data after a live-provider failure.

## Run locally

Requirements: Node.js 20+ and pnpm 11.

### Install the required tools on macOS

If `pnpm --version` prints `zsh: command not found: pnpm`, install Node.js and
the pnpm version used by this repository:

```bash
brew install node
npm install --global pnpm@11.19.0
exec zsh
```

Confirm that both commands are available:

```bash
node --version
pnpm --version
```

Do not add Codex's bundled pnpm runtime to your shell `PATH`; it is private to
the Codex environment. If `brew` is also unavailable, install Node.js LTS from
[nodejs.org](https://nodejs.org/), reopen Terminal, and then run:

```bash
npm install --global pnpm@11.19.0
```

### Install and start the app

```bash
pnpm install
cp .env.example .env.local
# Add your SearchAPI.io key to .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Verify

```bash
pnpm test:coverage
pnpm typecheck
pnpm lint
pnpm build
```

Coverage thresholds are enforced at 90% for statements, branches, functions, and lines across service/domain code.

## Workspace

- `apps/web`: Next.js questionnaire and results prototype.
- `packages/contracts`: shared request/result contracts.
- `packages/domain`: validation, flexible-date planning, route expansion, grouping, trust filtering, ranking, history, and mock search.
- `packages/searchapi`: server-only SearchAPI.io client, flexible-date orchestration, response normalization, multi-leg expansion, price history, and seller-option mapping.
- `docs`: product/technical design and phased implementation plan.

## Live-search behavior

- The API key remains server-only as `SEARCHAPI_API_KEY`.
- One-way and round-trip searches use the Calendar endpoint to shortlist low-price date combinations before requesting full flight details.
- Two-leg multi-city searches enumerate bounded valid date pairs and resolve both legs through SearchAPI.io departure tokens.
- Seller options are fetched only when a result drawer opens, reducing initial latency and request cost.
- Google price history is labeled as route-and-date history, not history for an exact flight number combination.
- Seat availability is displayed only when a supplier explicitly provides it; it is never inferred.
