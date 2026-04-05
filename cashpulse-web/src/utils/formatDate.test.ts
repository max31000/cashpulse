import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatDateFull,
  formatDateCompact,
  formatDateWithWeekday,
  formatMonth,
  formatXAxisDate,
  formatRelativeDate,
  toISODateString,
  getDateRange,
} from './formatDate';

// formatDate.ts uses Intl with locale 'ru-RU' — results depend on the runtime locale support.
// We pin dates to known values and assert on the known Russian output.

describe('formatDateFull', () => {
  it('formats a string date into Russian long format', () => {
    // 2024-01-15 → "15 января 2024 г."
    const result = formatDateFull('2024-01-15');
    expect(result).toMatch(/15/);
    expect(result).toMatch(/январ/i);
    expect(result).toMatch(/2024/);
  });

  it('accepts a Date object', () => {
    const d = new Date(2024, 5, 1); // June 1 2024
    const result = formatDateFull(d);
    expect(result).toMatch(/1/);
    expect(result).toMatch(/июн/i);
    expect(result).toMatch(/2024/);
  });
});

describe('formatDateCompact', () => {
  it('formats a date without a year and removes trailing dot', () => {
    // e.g. "15 янв" — no trailing dot, no year
    const result = formatDateCompact('2024-01-15');
    expect(result).toMatch(/15/);
    expect(result).toMatch(/янв/i);
    // No trailing dot after abbreviated month
    expect(result).not.toMatch(/\.$/);
    // No year
    expect(result).not.toMatch(/2024/);
  });

  it('formats December correctly', () => {
    const result = formatDateCompact('2024-12-31');
    expect(result).toMatch(/31/);
    expect(result).toMatch(/дек/i);
  });
});

describe('formatDateWithWeekday', () => {
  it('includes the long date and a capitalized weekday separated by ·', () => {
    // 2024-01-15 is Monday (Понедельник)
    const result = formatDateWithWeekday('2024-01-15');
    expect(result).toContain('·');
    expect(result).toMatch(/янв/i);
    expect(result).toMatch(/2024/);
    // Weekday starts with uppercase letter
    const parts = result.split('·');
    expect(parts).toHaveLength(2);
    const weekday = parts[1].trim();
    expect(weekday[0]).toBe(weekday[0].toUpperCase());
  });
});

describe('formatMonth', () => {
  it('formats YYYY-MM string into capitalized Russian month+year', () => {
    const result = formatMonth('2024-01');
    expect(result).toMatch(/январ/i);
    expect(result).toMatch(/2024/);
    // First letter is uppercase
    expect(result[0]).toBe(result[0].toUpperCase());
  });

  it('formats December 2023', () => {
    const result = formatMonth('2023-12');
    expect(result).toMatch(/декабр/i);
    expect(result).toMatch(/2023/);
  });

  it('capitalizes the first letter', () => {
    const result = formatMonth('2024-03');
    expect(result[0]).toMatch(/[А-ЯЁ]/);
  });
});

describe('formatXAxisDate', () => {
  it('replaces "г." and converts dot to apostrophe', () => {
    const result = formatXAxisDate('2024-01-01');
    // Should NOT end with " г."
    expect(result).not.toContain(' г.');
    // The dot in abbreviated month should be replaced by apostrophe
    // e.g. "янв '24"
    expect(result).not.toMatch(/\.\s*\d/);
    expect(result).toMatch(/\d{2}/); // two-digit year
  });
});

describe('formatRelativeDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "сегодня" for today', () => {
    vi.setSystemTime(new Date('2024-06-15T12:00:00'));
    expect(formatRelativeDate('2024-06-15')).toBe('сегодня');
  });

  it('returns "вчера" for yesterday', () => {
    vi.setSystemTime(new Date('2024-06-15T12:00:00'));
    expect(formatRelativeDate('2024-06-14')).toBe('вчера');
  });

  it('returns "завтра" for tomorrow', () => {
    vi.setSystemTime(new Date('2024-06-15T12:00:00'));
    expect(formatRelativeDate('2024-06-16')).toBe('завтра');
  });

  it('returns "через N дней" for 2–7 days ahead', () => {
    vi.setSystemTime(new Date('2024-06-15T12:00:00'));
    const result = formatRelativeDate('2024-06-17'); // +2 days
    expect(result).toMatch(/через 2 дня/);
  });

  it('returns "через 5 дней" for 5 days ahead', () => {
    vi.setSystemTime(new Date('2024-06-15T12:00:00'));
    const result = formatRelativeDate('2024-06-20'); // +5 days
    expect(result).toMatch(/через 5 дней/);
  });

  it('returns "N дней назад" for 2–3 days in the past', () => {
    vi.setSystemTime(new Date('2024-06-15T12:00:00'));
    const result = formatRelativeDate('2024-06-13'); // -2 days
    expect(result).toMatch(/2 дня назад/);
  });

  it('returns compact date for dates more than 7 days ahead', () => {
    vi.setSystemTime(new Date('2024-06-15T12:00:00'));
    const result = formatRelativeDate('2024-06-30'); // +15 days
    // Should fall back to formatDateCompact — contains day and month, no year
    expect(result).toMatch(/30/);
    expect(result).toMatch(/июн/i);
    expect(result).not.toMatch(/2024/);
  });

  it('returns compact date for dates more than 3 days in the past', () => {
    vi.setSystemTime(new Date('2024-06-15T12:00:00'));
    const result = formatRelativeDate('2024-06-01'); // -14 days
    expect(result).toMatch(/1/);
    expect(result).toMatch(/июн/i);
  });
});

describe('toISODateString', () => {
  it('returns YYYY-MM-DD from a Date', () => {
    // Use UTC date to avoid timezone issues in the ISO string
    const d = new Date('2024-03-05T00:00:00.000Z');
    const result = toISODateString(d);
    // Result is always 10 chars YYYY-MM-DD
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('preserves the correct year-month-day for a known UTC date', () => {
    const d = new Date('2024-07-20T00:00:00.000Z');
    expect(toISODateString(d)).toBe('2024-07-20');
  });
});

describe('getDateRange', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T00:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty object for "all"', () => {
    expect(getDateRange('all')).toEqual({});
  });

  it('"week" range: to === today, from === 7 days ago', () => {
    const { from, to } = getDateRange('week');
    expect(to).toBe('2024-06-15');
    expect(from).toBe('2024-06-08');
  });

  it('"month" range: from === 1 month ago', () => {
    const { from, to } = getDateRange('month');
    expect(to).toBe('2024-06-15');
    expect(from).toBe('2024-05-15');
  });

  it('"quarter" range: from === 3 months ago', () => {
    const { from, to } = getDateRange('quarter');
    expect(to).toBe('2024-06-15');
    expect(from).toBe('2024-03-15');
  });

  it('"year" range: from === 1 year ago', () => {
    const { from, to } = getDateRange('year');
    expect(to).toBe('2024-06-15');
    expect(from).toBe('2023-06-15');
  });

  it('all range values are valid YYYY-MM-DD strings', () => {
    const isoPattern = /^\d{4}-\d{2}-\d{2}$/;
    for (const period of ['week', 'month', 'quarter', 'year'] as const) {
      const { from, to } = getDateRange(period);
      expect(from).toMatch(isoPattern);
      expect(to).toMatch(isoPattern);
    }
  });
});
