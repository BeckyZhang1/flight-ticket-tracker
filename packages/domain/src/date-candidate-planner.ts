import type { DateWindow, StayRange } from "@flight/contracts";

const DAY_MS = 86_400_000;

export interface DatePairCandidate {
  firstDate: string;
  secondDate: string;
}

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  return formatDate(new Date(parseDate(value).getTime() + days * DAY_MS));
}

export function differenceInCalendarDays(later: string, earlier: string): number {
  return Math.round((parseDate(later).getTime() - parseDate(earlier).getTime()) / DAY_MS);
}

export function planOneWayDates(window: DateWindow): string[] {
  const dates: string[] = [];
  for (let current = window.from; current <= window.to; current = addDays(current, 1)) {
    dates.push(current);
  }
  return dates;
}

export function planRoundTripDates(window: DateWindow, range: StayRange): DatePairCandidate[] {
  const pairs: DatePairCandidate[] = [];
  for (const firstDate of planOneWayDates(window)) {
    for (let stay = range.minDays; stay <= range.maxDays; stay += 1) {
      const secondDate = addDays(firstDate, stay);
      if (secondDate <= window.to) {
        pairs.push({ firstDate, secondDate });
      }
    }
  }
  return pairs;
}

export function planMultiCityDates(
  window: DateWindow,
  range: StayRange,
  maxArrivalOffsetDays = 2
): DatePairCandidate[] {
  const widenedRange = { minDays: range.minDays, maxDays: range.maxDays + maxArrivalOffsetDays };
  return planRoundTripDates(window, widenedRange);
}

export function isMultiCityStayValid(
  firstArrivalLocalDate: string,
  secondDepartureLocalDate: string,
  range: StayRange
): boolean {
  const stay = differenceInCalendarDays(secondDepartureLocalDate, firstArrivalLocalDate);
  return stay >= range.minDays && stay <= range.maxDays;
}

