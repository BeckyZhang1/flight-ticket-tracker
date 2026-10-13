"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  Itinerary,
  MultiCitySearchRequest,
  Place,
  SearchRequest,
  StandardSearchRequest,
  TripType
} from "@flight/contracts";
import { mergeRecentSearches } from "@flight/domain";

const PLACES: Place[] = [
  { code: "SFO", city: "San Francisco", name: "San Francisco International", country: "United States" },
  { code: "LAX", city: "Los Angeles", name: "Los Angeles International", country: "United States" },
  { code: "JFK", city: "New York", name: "John F. Kennedy International", country: "United States" },
  { code: "CDG", city: "Paris", name: "Charles de Gaulle", country: "France" },
  { code: "LHR", city: "London", name: "Heathrow", country: "United Kingdom" },
  { code: "LIS", city: "Lisbon", name: "Humberto Delgado", country: "Portugal" },
  { code: "NRT", city: "Tokyo", name: "Narita International", country: "Japan" },
  { code: "FCO", city: "Rome", name: "Fiumicino", country: "Italy" }
];

const placeByCode = (code: string): Place => PLACES.find((place) => place.code === code) ?? PLACES[0]!;
const formatMoney = (minor: number): string => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(minor / 100);
const localDateValue = (value: string): Date => new Date(`${value.slice(0, 10)}T00:00:00Z`);
const formatDate = (value: string): string => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(localDateValue(value));
const formatFullDate = (value: string): string => new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(localDateValue(value));
const formatTime = (value: string): string => {
  const [hour = 0, minute = 0] = value.slice(11, 16).split(":").map(Number);
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(1970, 0, 1, hour, minute)));
};
const formatDuration = (minutes: number): string => `${Math.floor(minutes / 60)}h ${minutes % 60 ? `${minutes % 60}m` : ""}`.trim();

type Screen = "welcome" | "questions" | "loading" | "results" | "error";
type DataMode = "live" | "demo" | null;
type Step = "trip" | "route" | "dates" | "stay" | "travellers" | "review";

const HISTORY_KEY = "wanderly:recent-searches:v1";

function readHistory(): SearchRequest[] {
  try {
    const value = window.localStorage.getItem(HISTORY_KEY);
    return value ? (JSON.parse(value) as SearchRequest[]).slice(0, 5) : [];
  } catch {
    return [];
  }
}

function writeHistory(request: SearchRequest): SearchRequest[] {
  const current = readHistory();
  const next = mergeRecentSearches(current, request);
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}

function routeLabel(request: SearchRequest): string {
  if (request.tripType === "multi-city") {
    return request.legs.map((leg) => `${leg.origin.code} → ${leg.destination.code}`).join(" · ");
  }
  return `${request.origin.code} → ${request.destinations.map((place) => place.code).join(" / ")}`;
}

export function FlightSearchPrototype() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [stepIndex, setStepIndex] = useState(0);
  const [tripType, setTripType] = useState<TripType>("round-trip");
  const [originCode, setOriginCode] = useState("SFO");
  const [destinationCodes, setDestinationCodes] = useState<string[]>(["CDG"]);
  const [legOneDestination, setLegOneDestination] = useState("CDG");
  const [legTwoOrigin, setLegTwoOrigin] = useState("LHR");
  const [legTwoDestination, setLegTwoDestination] = useState("SFO");
  const [dateFrom, setDateFrom] = useState("2026-10-05");
  const [dateTo, setDateTo] = useState("2026-10-20");
  const [minStay, setMinStay] = useState(4);
  const [maxStay, setMaxStay] = useState(7);
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [results, setResults] = useState<Itinerary[]>([]);
  const [activeDestination, setActiveDestination] = useState("ALL");
  const [selectedItinerary, setSelectedItinerary] = useState<Itinerary | null>(null);
  const [recent, setRecent] = useState<SearchRequest[]>([]);
  const [dataMode, setDataMode] = useState<DataMode>(null);
  const [searchError, setSearchError] = useState("");
  const [sellerLoading, setSellerLoading] = useState(false);
  const [sellerError, setSellerError] = useState("");

  useEffect(() => setRecent(readHistory()), []);

  const steps = useMemo<Step[]>(() => {
    const base: Step[] = ["trip", "route", "dates"];
    if (tripType !== "one-way") base.push("stay");
    return [...base, "travellers", "review"];
  }, [tripType]);
  const step = steps[stepIndex] ?? "review";
  const progress = ((stepIndex + 1) / steps.length) * 100;

  const request = useMemo<SearchRequest>(() => {
    const shared = {
      id: `search-${dateFrom}-${tripType}`,
      dateWindow: { from: dateFrom, to: dateTo },
      travellers: { adults, childAges: Array.from({ length: children }, () => 8) }
    };
    if (tripType === "multi-city") {
      const value: MultiCitySearchRequest = {
        ...shared,
        tripType,
        legs: [
          { origin: placeByCode(originCode), destination: placeByCode(legOneDestination) },
          { origin: placeByCode(legTwoOrigin), destination: placeByCode(legTwoDestination) }
        ],
        stayRange: { minDays: minStay, maxDays: maxStay }
      };
      return value;
    }
    const value: StandardSearchRequest = {
      ...shared,
      tripType,
      origin: placeByCode(originCode),
      destinations: destinationCodes.map(placeByCode),
      ...(tripType === "round-trip" ? { stayRange: { minDays: minStay, maxDays: maxStay } } : {})
    };
    return value;
  }, [adults, children, dateFrom, dateTo, destinationCodes, legOneDestination, legTwoDestination, legTwoOrigin, maxStay, minStay, originCode, tripType]);

  const canContinue = useMemo(() => {
    if (step === "route") {
      if (tripType === "multi-city") {
        return originCode !== legOneDestination && legTwoOrigin !== legTwoDestination;
      }
      return destinationCodes.length >= 1 && destinationCodes.length <= 3 && !destinationCodes.includes(originCode);
    }
    if (step === "dates") return Boolean(dateFrom && dateTo && dateFrom <= dateTo);
    if (step === "stay") return minStay >= 1 && maxStay >= minStay;
    return true;
  }, [dateFrom, dateTo, destinationCodes, legOneDestination, legTwoDestination, legTwoOrigin, maxStay, minStay, originCode, step, tripType]);

  function startQuestions() {
    setStepIndex(0);
    setScreen("questions");
  }

  function next() {
    if (!canContinue) return;
    setStepIndex((current) => Math.min(current + 1, steps.length - 1));
  }

  function back() {
    if (stepIndex === 0) setScreen("welcome");
    else setStepIndex((current) => current - 1);
  }

  function toggleDestination(code: string) {
    if (code === originCode) return;
    setDestinationCodes((current) => {
      if (current.includes(code)) return current.filter((item) => item !== code);
      return current.length < 3 ? [...current, code] : current;
    });
  }

  async function runSearch(value: SearchRequest = request) {
    setScreen("loading");
    setSelectedItinerary(null);
    setActiveDestination("ALL");
    setSearchError("");
    try {
      const response = await fetch("/api/flights/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(value),
        signal: AbortSignal.timeout(60_000)
      });
      const payload = await response.json() as { results?: Itinerary[]; mode?: DataMode; error?: string };
      if (!response.ok || !payload.results) throw new Error(payload.error ?? "Flight search failed");
      const nextResults = payload.results;
      setResults(nextResults);
      setDataMode(payload.mode ?? null);
      setRecent(writeHistory(value));
      setScreen("results");
    } catch (error) {
      setSearchError(error instanceof Error && error.name === "TimeoutError"
        ? "The live search reached its 60-second limit. Please try a narrower date range."
        : error instanceof Error ? error.message : "Flight search failed");
      setScreen("error");
    }
  }

  async function openItinerary(itinerary: Itinerary) {
    setSelectedItinerary(itinerary);
    setSellerError("");
    if (!itinerary.bookingContext || itinerary.quotes.length) return;
    setSellerLoading(true);
    try {
      const response = await fetch("/api/flights/booking-options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(itinerary.bookingContext),
        signal: AbortSignal.timeout(60_000)
      });
      const payload = await response.json() as { quotes?: Itinerary["quotes"]; error?: string };
      if (!response.ok || !payload.quotes) throw new Error(payload.error ?? "Seller lookup failed");
      setSelectedItinerary((current) => current?.fingerprint === itinerary.fingerprint
        ? { ...current, quotes: payload.quotes! }
        : current);
      setResults((current) => current.map((item) => item.fingerprint === itinerary.fingerprint
        ? { ...item, quotes: payload.quotes! }
        : item));
    } catch (error) {
      setSellerError(error instanceof Error ? error.message : "Seller lookup failed");
    } finally {
      setSellerLoading(false);
    }
  }

  function reset() {
    setScreen("welcome");
    setStepIndex(0);
  }

  const filteredResults = activeDestination === "ALL" ? results : results.filter((item) => item.destinationCode === activeDestination);
  const resultDestinations = [...new Set(results.map((item) => item.destinationCode))];

  return (
    <main className="app-shell">
      <header className="brand-bar">
        <button className="brand" onClick={reset} aria-label="Wanderly home">
          <span className="brand-mark" aria-hidden="true">↗</span>
          <span>Wanderly</span>
        </button>
        <span className="prototype-pill">{dataMode === "live" ? "Live · Google Flights data" : dataMode === "demo" ? "Demo · add API key for live data" : "Prototype · SearchAPI.io ready"}</span>
      </header>

      {screen === "welcome" && (
        <section className="welcome-layout">
          <div className="hero-card">
            <div className="mascot" aria-hidden="true"><span>✦</span><span>↗</span></div>
            <p className="eyebrow">Flexible flight finder</p>
            <h1>More places.<br />Better possibilities.</h1>
            <p className="hero-copy">Pick up to three destinations and we’ll compare flexible dates, distinct flights, and trusted sellers in one cheerful list.</p>
            <button className="primary-button" onClick={startQuestions}>Plan a trip <span>→</span></button>
            <div className="trust-row"><span>✓ Distinct flights</span><span>✓ Seller comparison</span><span>✓ Flexible dates</span></div>
          </div>
          <aside className="recent-panel">
            <div className="recent-heading"><div><p className="eyebrow">Quick restart</p><h2>Recent searches</h2></div><span className="history-count">{recent.length}/5</span></div>
            {recent.length === 0 ? (
              <div className="empty-history"><span aria-hidden="true">⌁</span><p>Your latest five adventures will live here.</p></div>
            ) : recent.map((item) => (
              <button key={`${item.id}-${routeLabel(item)}`} className="history-card" onClick={() => runSearch(item)}>
                <span className="history-icon">↗</span><span><strong>{routeLabel(item)}</strong><small>{item.dateWindow.from} – {item.dateWindow.to}</small></span><span>›</span>
              </button>
            ))}
          </aside>
        </section>
      )}

      {screen === "questions" && (
        <section className="question-layout">
          <div className="progress-header">
            <button className="back-button" onClick={back} aria-label="Go back">←</button>
            <div className="progress-track" aria-label={`Step ${stepIndex + 1} of ${steps.length}`}><span style={{ width: `${progress}%` }} /></div>
            <span className="step-count">{stepIndex + 1}/{steps.length}</span>
          </div>
          <div className="question-card">
            {step === "trip" && <TripStep value={tripType} onChange={(value) => { setTripType(value); setStepIndex(0); }} />}
            {step === "route" && (
              <RouteStep
                tripType={tripType} originCode={originCode} setOriginCode={setOriginCode}
                destinationCodes={destinationCodes} toggleDestination={toggleDestination}
                legOneDestination={legOneDestination} setLegOneDestination={setLegOneDestination}
                legTwoOrigin={legTwoOrigin} setLegTwoOrigin={setLegTwoOrigin}
                legTwoDestination={legTwoDestination} setLegTwoDestination={setLegTwoDestination}
              />
            )}
            {step === "dates" && <DateStep from={dateFrom} to={dateTo} setFrom={setDateFrom} setTo={setDateTo} />}
            {step === "stay" && <StayStep min={minStay} max={maxStay} setMin={setMinStay} setMax={setMaxStay} multiCity={tripType === "multi-city"} />}
            {step === "travellers" && <TravellerStep adults={adults} children={children} setAdults={setAdults} setChildren={setChildren} />}
            {step === "review" && <ReviewStep request={request} />}
            <div className="question-actions">
              <button className="primary-button" disabled={!canContinue} onClick={step === "review" ? () => runSearch() : next}>
                {step === "review" ? "Search flights" : "Continue"} <span>→</span>
              </button>
              {!canContinue && <p className="validation-hint">Check this answer before continuing.</p>}
            </div>
          </div>
        </section>
      )}

      {screen === "loading" && (
        <section className="loading-card" aria-live="polite">
          <div className="orbit"><span>↗</span></div>
          <p className="eyebrow">Building your shortlist</p>
          <h1>Comparing every possibility…</h1>
          <p>Checking flexible dates, grouping identical flights, and sorting trusted seller prices.</p>
          <div className="loading-lines"><span /><span /><span /></div>
        </section>
      )}

      {screen === "error" && (
        <section className="loading-card error-card" role="alert">
          <div className="orbit"><span>!</span></div>
          <p className="eyebrow">Search interrupted</p>
          <h1>We couldn’t finish that search.</h1>
          <p>{searchError}</p>
          <button className="primary-button" onClick={() => runSearch()}>Try again <span>→</span></button>
          <button className="text-button" onClick={startQuestions}>Edit search</button>
        </section>
      )}

      {screen === "results" && (
        <section className="results-layout">
          <div className="results-heading">
            <div><button className="text-button" onClick={startQuestions}>← Edit search</button><p className="eyebrow">{dataMode === "live" ? "Live results" : "Demo results"}</p><h1>{results.length} flight combinations</h1><p>Distinct itineraries, sorted by lowest total price.</p></div>
            <button className="secondary-button" onClick={() => runSearch()}>Refresh search</button>
          </div>
          <div className="filter-row" aria-label="Filter by destination">
            <button className={activeDestination === "ALL" ? "active" : ""} onClick={() => setActiveDestination("ALL")}>All <span>{results.length}</span></button>
            {resultDestinations.map((code) => <button key={code} className={activeDestination === code ? "active" : ""} onClick={() => setActiveDestination(code)}>{code} <span>{results.filter((item) => item.destinationCode === code).length}</span></button>)}
          </div>
          <div className="results-grid">
            {filteredResults.map((itinerary, index) => <ResultCard key={itinerary.id} itinerary={itinerary} index={index} onOpen={() => openItinerary(itinerary)} />)}
          </div>
          <p className="mock-note">{dataMode === "live" ? "Live Google Flights data supplied through SearchAPI.io. Prices and availability can change before booking." : "Deterministic demo results are shown because SEARCHAPI_API_KEY is not configured."}</p>
          {selectedItinerary && <ItineraryDetail itinerary={selectedItinerary} sellerLoading={sellerLoading} sellerError={sellerError} onClose={() => setSelectedItinerary(null)} />}
        </section>
      )}
    </main>
  );
}

function TripStep({ value, onChange }: { value: TripType; onChange: (value: TripType) => void }) {
  const options: Array<{ value: TripType; icon: string; title: string; copy: string }> = [
    { value: "round-trip", icon: "⇄", title: "Round trip", copy: "Come home after a flexible stay" },
    { value: "one-way", icon: "→", title: "One way", copy: "Find the best departure day" },
    { value: "multi-city", icon: "⌁", title: "Two-leg trip", copy: "Fly into one place and out of another" }
  ];
  return <><p className="eyebrow">First things first</p><h1>What kind of trip is this?</h1><p className="question-copy">Choose the shape of your adventure. You can change it later.</p><div className="option-grid">{options.map((option) => <button key={option.value} className={`option-card ${value === option.value ? "selected" : ""}`} onClick={() => onChange(option.value)}><span className="option-icon">{option.icon}</span><span><strong>{option.title}</strong><small>{option.copy}</small></span><span className="radio-dot" /></button>)}</div></>;
}

function PlaceSelect({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{PLACES.map((place) => <option key={place.code} value={place.code}>{place.city} ({place.code})</option>)}</select></label>;
}

interface RouteStepProps {
  tripType: TripType; originCode: string; setOriginCode: (value: string) => void;
  destinationCodes: string[]; toggleDestination: (code: string) => void;
  legOneDestination: string; setLegOneDestination: (value: string) => void;
  legTwoOrigin: string; setLegTwoOrigin: (value: string) => void;
  legTwoDestination: string; setLegTwoDestination: (value: string) => void;
}

function RouteStep(props: RouteStepProps) {
  if (props.tripType === "multi-city") {
    return <><p className="eyebrow">Two flight legs</p><h1>Where will each flight take you?</h1><p className="question-copy">The trip between leg 1’s destination and leg 2’s origin is yours to arrange.</p><div className="leg-box"><span className="leg-label">Leg 1</span><div className="field-row"><PlaceSelect label="From" value={props.originCode} onChange={props.setOriginCode} /><PlaceSelect label="To" value={props.legOneDestination} onChange={props.setLegOneDestination} /></div></div><div className="surface-note">⌁ Surface transfer arranged separately</div><div className="leg-box"><span className="leg-label">Leg 2</span><div className="field-row"><PlaceSelect label="From" value={props.legTwoOrigin} onChange={props.setLegTwoOrigin} /><PlaceSelect label="To" value={props.legTwoDestination} onChange={props.setLegTwoDestination} /></div></div></>;
  }
  return <><p className="eyebrow">Explore your options</p><h1>Where could you go?</h1><p className="question-copy">Choose one origin and up to three destinations. We’ll compare them as independent searches.</p><PlaceSelect label="Flying from" value={props.originCode} onChange={props.setOriginCode} /><div className="destination-heading"><span>Possible destinations</span><strong>{props.destinationCodes.length}/3</strong></div><div className="destination-grid">{PLACES.filter((place) => place.code !== props.originCode).map((place) => <button key={place.code} className={`destination-chip ${props.destinationCodes.includes(place.code) ? "selected" : ""}`} onClick={() => props.toggleDestination(place.code)}><span><strong>{place.city}</strong><small>{place.name}</small></span><b>{place.code}</b></button>)}</div></>;
}

function DateStep({ from, to, setFrom, setTo }: { from: string; to: string; setFrom: (value: string) => void; setTo: (value: string) => void }) {
  return <><p className="eyebrow">Flexible dates</p><h1>What’s your travel window?</h1><p className="question-copy">Every flight departure will stay inside this range.</p><div className="date-card"><label><span>Earliest date</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><span className="date-arrow">→</span><label><span>Latest date</span><input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} /></label></div><div className="tip-box"><span>✦</span><p><strong>Flexible saves.</strong> A wider window gives us more combinations to compare.</p></div></>;
}

function StayStep({ min, max, setMin, setMax, multiCity }: { min: number; max: number; setMin: (value: number) => void; setMax: (value: number) => void; multiCity: boolean }) {
  return <><p className="eyebrow">Set the rhythm</p><h1>{multiCity ? "How long between your flights?" : "How long would you like to stay?"}</h1><p className="question-copy">Choose a range so we can try more useful date combinations.</p><div className="stay-display"><div><strong>{min}</strong><span>minimum days</span></div><span>to</span><div><strong>{max}</strong><span>maximum days</span></div></div><label className="range-field"><span>Minimum</span><input type="range" min="1" max="20" value={min} onChange={(event) => setMin(Math.min(Number(event.target.value), max))} /></label><label className="range-field"><span>Maximum</span><input type="range" min="1" max="21" value={max} onChange={(event) => setMax(Math.max(Number(event.target.value), min))} /></label>{multiCity && <div className="tip-box warning"><span>⌁</span><p>This measures from leg 1’s arrival date to leg 2’s departure date. Travel between the two cities is not included.</p></div>}</>;
}

function Counter({ label, hint, value, min, max, onChange }: { label: string; hint: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <div className="counter-row"><span><strong>{label}</strong><small>{hint}</small></span><div className="counter"><button onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Remove ${label}`}>−</button><b>{value}</b><button onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`Add ${label}`}>+</button></div></div>;
}

function TravellerStep({ adults, children, setAdults, setChildren }: { adults: number; children: number; setAdults: (value: number) => void; setChildren: (value: number) => void }) {
  return <><p className="eyebrow">Your travel crew</p><h1>Who’s coming along?</h1><p className="question-copy">Prices in the results are totals for everyone.</p><div className="counter-list"><Counter label="Adults" hint="Age 18+" value={adults} min={1} max={8} onChange={setAdults} /><Counter label="Children" hint="Prototype uses age 8" value={children} min={0} max={7} onChange={setChildren} /></div><div className="tip-box"><span>i</span><p>Live search will ask for each child’s exact age because airline pricing varies.</p></div></>;
}

function ReviewStep({ request }: { request: SearchRequest }) {
  const stay = request.stayRange;
  return <><p className="eyebrow">Ready for takeoff</p><h1>Give it one last look.</h1><p className="question-copy">We’ll compare flexible dates with Google Flights data through SearchAPI.io.</p><div className="review-card"><ReviewRow icon="↗" label="Route" value={routeLabel(request)} /><ReviewRow icon="□" label="Travel window" value={`${request.dateWindow.from} – ${request.dateWindow.to}`} />{stay && <ReviewRow icon="↔" label="Stay range" value={`${stay.minDays}–${stay.maxDays} days`} />}<ReviewRow icon="♙" label="Travellers" value={`${request.travellers.adults} adult${request.travellers.adults === 1 ? "" : "s"}${request.travellers.childAges.length ? `, ${request.travellers.childAges.length} child${request.travellers.childAges.length === 1 ? "" : "ren"}` : ""}`} /></div>{request.tripType === "multi-city" && <div className="tip-box warning"><span>!</span><p>{request.legs[0].destination.code} → {request.legs[1].origin.code} is a separate surface transfer and is not priced or protected.</p></div>}</>;
}

function ReviewRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return <div className="review-row"><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>;
}

function ResultCard({ itinerary, index, onOpen }: { itinerary: Itinerary; index: number; onOpen: () => void }) {
  const first = itinerary.segments[0]!;
  const last = itinerary.segments.at(-1)!;
  const sellerLabel = itinerary.quotes.length ? `${itinerary.quotes.length} seller option${itinerary.quotes.length === 1 ? "" : "s"}` : "Seller options on demand";
  return <article className="result-card"><button className="result-card-main" onClick={onOpen} aria-label={`View full details for flights to ${itinerary.destinationCode}`}><div className="result-top"><span className="result-rank">#{index + 1}</span><span className="destination-badge">{itinerary.destinationCode}</span><span className="price"><small>total from</small>{formatMoney(itinerary.lowestPrice.amountMinor)}</span></div><div className="flight-line"><div><strong>{formatTime(first.departureLocal)}</strong><small>{first.originCode} · {formatDate(first.departureLocal)}</small></div><div className="flight-path"><span /><b>↗</b><span /><small>{itinerary.segments.length} flight{itinerary.segments.length === 1 ? "" : "s"} · {formatDuration(itinerary.totalDurationMinutes)} total</small></div><div className="align-right"><strong>{formatTime(last.arrivalLocal)}</strong><small>{last.destinationCode} · {formatDate(last.arrivalLocal)}</small></div></div><div className="carrier-row"><span className="airline-logo">{first.operatingCarrierCode}</span><span><strong>{first.operatingCarrierName}</strong><small>{itinerary.segments.map((item) => `${item.operatingCarrierCode}${item.flightNumber}`).join(" · ")}</small></span>{itinerary.surfaceTransfer && <span className="warning-badge">Surface transfer</span>}</div></button><button className="seller-button" onClick={onOpen}>{sellerLabel} <span>View full details →</span></button></article>;
}

function SellerAction({ quote }: { quote: Itinerary["quotes"][number] }) {
  if (quote.bookingPostData) {
    const fields = [...new URLSearchParams(quote.bookingPostData).entries()];
    return <form action={quote.bookingUrl} method="post" target="_blank">{fields.map(([name, value], index) => <input key={`${name}-${index}`} type="hidden" name={name} value={value} />)}<button type="submit">View seller ↗</button></form>;
  }
  return <a href={quote.bookingUrl} target="_blank" rel="noreferrer">View seller ↗</a>;
}

function ItineraryDetail({ itinerary, sellerLoading, sellerError, onClose }: { itinerary: Itinerary; sellerLoading: boolean; sellerError: string; onClose: () => void }) {
  const history = itinerary.priceHistory ?? [];
  const historyMax = Math.max(...history.map((point) => point.price.amountMinor), 1);
  return <div className="detail-layer"><button className="detail-backdrop" onClick={onClose} aria-label="Close itinerary details" /><aside className="detail-drawer" role="dialog" aria-modal="true" aria-labelledby="detail-title"><div className="detail-header"><div><p className="eyebrow">Complete itinerary</p><h2 id="detail-title">Your flights</h2><p>{itinerary.segments[0]?.originCode} → {itinerary.destinationCode} · {itinerary.segments.length} flight{itinerary.segments.length === 1 ? "" : "s"}</p></div><button className="detail-close" onClick={onClose} aria-label="Close details">×</button></div><div className="detail-price"><span><small>Lowest total price</small><strong>{formatMoney(itinerary.lowestPrice.amountMinor)}</strong></span><span><small>Seller options</small><strong>{sellerLoading ? "…" : itinerary.quotes.length || "—"}</strong></span></div><section className="detail-section"><div className="section-heading"><h3>Flight itinerary</h3><span>{formatDuration(itinerary.totalDurationMinutes)} total</span></div><div className="leg-list">{itinerary.segments.map((flight, index) => <div key={`${flight.flightNumber}-${flight.departureUtc}`}><article className="leg-detail"><div className="leg-detail-top"><span className="leg-number">{itinerary.surfaceTransfer ? `Leg ${index + 1}` : index === 0 ? "Outbound" : "Return"}</span><span className="direct-tag">Flight {index + 1}</span></div><div className="segment-route"><div className="segment-point"><span className="timeline-dot" /><strong>{formatTime(flight.departureLocal)}</strong><b>{flight.originCode}</b><small>{formatFullDate(flight.departureLocal)}</small></div><div className="segment-duration"><span /><small>{formatDuration(flight.durationMinutes ?? Math.max(0, Math.round((Date.parse(flight.arrivalUtc) - Date.parse(flight.departureUtc)) / 60_000)))}</small><span /></div><div className="segment-point arrival"><span className="timeline-dot" /><strong>{formatTime(flight.arrivalLocal)}</strong><b>{flight.destinationCode}</b><small>{formatFullDate(flight.arrivalLocal)}</small></div></div><div className="flight-metadata"><span className="airline-logo">{flight.operatingCarrierCode}</span><div><strong>{flight.operatingCarrierName} {flight.operatingCarrierCode}{flight.flightNumber}</strong><small>Operated by {flight.operatingCarrierName}</small></div><div className="metadata-pills"><span>Economy</span><span>{itinerary.source === "searchapi-google-flights" ? "Live fare" : "Sample fare"}</span></div></div></article>{index === 0 && itinerary.surfaceTransfer && <div className="surface-detail"><span>⌁</span><div><strong>Surface transfer: {itinerary.surfaceTransfer.fromCode} → {itinerary.surfaceTransfer.toCode}</strong><p>You arrange this journey separately. It is not included in the ticket price or protected by either flight booking.</p></div></div>}</div>)}</div></section><section className="detail-section"><div className="section-heading"><h3>Seller options</h3><span>Lowest price first</span></div>{sellerLoading && <div className="seller-status">Fetching current sellers and prices…</div>}{sellerError && <div className="seller-status error">{sellerError}</div>}<div className="detail-sellers">{itinerary.quotes.map((quote, index) => <article className="detail-seller" key={quote.id}><span className="seller-rank">{index + 1}</span><div><strong>{quote.sellerName}</strong><small>{quote.seatsRemaining ? `${quote.seatsRemaining} seats reported by seller` : "Seat availability not provided"}</small><small>{quote.fareType ?? (itinerary.source === "searchapi-google-flights" ? "Google Flights booking option" : "Sample price")} · Taxes may vary</small>{quote.baggageNotes?.length ? <small>{quote.baggageNotes.join(" · ")}</small> : null}{quote.bookingPhone ? <small>Phone: {quote.bookingPhone}</small> : null}</div><b>{formatMoney(quote.price.amountMinor)}</b><SellerAction quote={quote} /></article>)}</div>{!sellerLoading && !sellerError && itinerary.quotes.length === 0 && <div className="seller-status">No seller options were returned for this itinerary.</div>}</section><section className="detail-section"><div className="section-heading"><h3>Price history</h3><span>Route and dates · up to 30 days</span></div>{history.length ? <div className="price-history" aria-label="Price history chart">{history.map((point) => <span key={point.observedAt} title={`${point.observedAt.slice(0, 10)} · ${formatMoney(point.price.amountMinor)}`} style={{ height: `${Math.max(8, point.price.amountMinor / historyMax * 100)}%` }} />)}</div> : <div className="history-placeholder detail-history"><span>⌁</span><p><strong>No history available</strong><br />SearchAPI.io did not return route-and-date price observations for this result.</p></div>}</section></aside></div>;
}
