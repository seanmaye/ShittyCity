import { describe, expect, it } from 'vitest';
import { dateOfDay, dayOfYear, formatDay } from '../js/scene/season.ts';

// local dates throughout, as the app uses them: the results do not depend on the machine's time zone

describe('dayOfYear and dateOfDay', () => {
  it('count days from 1 January (day 0), leap years included', () => {
    expect(dayOfYear(new Date(2025, 0, 1))).toBe(0);
    expect(dayOfYear(new Date(2025, 2, 1))).toBe(59);
    expect(dayOfYear(new Date(2024, 2, 1))).toBe(60);
    expect(dayOfYear(new Date(2025, 2, 10, 23, 59))).toBe(68);   // the day after US daylight saving starts
    expect(dayOfYear(new Date(2025, 11, 31))).toBe(364);
    expect(dayOfYear(new Date(2024, 11, 31))).toBe(365);
  });
  it('dateOfDay is noon on that day, and the two round-trip', () => {
    const d = dateOfDay(59, 2024);
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2024, 1, 29, 12]);
    expect(dateOfDay(365, 2025).getFullYear()).toBe(2026);   // past the end: rolls into the next year
    for (const [year, days] of [[2024, 366], [2025, 365]]) for (let day = 0; day < days; day++) expect(dayOfYear(dateOfDay(day, year))).toBe(day);
  });
});

describe('formatDay', () => {
  it('names the date and the astronomical season', () => {
    expect(formatDay(0, 2025)).toBe('Jan 1 · winter');
    expect(formatDay(78, 2025)).toBe('Mar 20 · spring');
    expect(formatDay(171, 2025)).toBe('Jun 21 · summer');
    expect(formatDay(264, 2025)).toBe('Sep 22 · fall');
    expect(formatDay(354, 2025)).toBe('Dec 21 · winter');
  });
  it('keeps the seasons on the same dates in a leap year', () => {
    expect(formatDay(59, 2024)).toBe('Feb 29 · winter');
    expect(formatDay(78, 2024)).toBe('Mar 19 · winter');
    expect(formatDay(79, 2024)).toBe('Mar 20 · spring');
  });
});
