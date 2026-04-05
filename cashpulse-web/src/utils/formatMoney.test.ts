import { describe, it, expect } from 'vitest';
import { formatMoney, formatMoneyWithSign, formatMoneyCompact } from './formatMoney';

// RUB uses non-breaking space (U+00A0) as thousands separator
// Negative sign is Unicode minus U+2212, not ASCII hyphen

describe('formatMoney', () => {
  it('formats RUB with thousands separator and ₽ symbol', () => {
    expect(formatMoney(50000, 'RUB')).toBe('50\u00a0000 ₽');
  });

  it('formats USD with dollar sign and comma separator', () => {
    expect(formatMoney(1234, 'USD')).toBe('$1,234');
  });

  it('formats EUR with euro sign and dot separator', () => {
    expect(formatMoney(1234, 'EUR')).toBe('€1.234');
  });

  it('formats negative amount with Unicode minus sign', () => {
    expect(formatMoney(-500, 'RUB')).toBe('\u2212500 ₽');
  });

  it('formats zero as 0 with currency', () => {
    expect(formatMoney(0, 'RUB')).toBe('0 ₽');
  });

  it('formats unknown currency using ru-RU locale with currency code', () => {
    // GBP: uses ru-RU number format (non-breaking space) + currency code
    expect(formatMoney(1500, 'GBP')).toBe('1\u00a0500 GBP');
  });

  it('formats large RUB amount with multiple thousands groups', () => {
    expect(formatMoney(1000000, 'RUB')).toBe('1\u00a0000\u00a0000 ₽');
  });

  it('does not show fraction digits (rounds to integer)', () => {
    expect(formatMoney(999.9, 'RUB')).toBe('1\u00a0000 ₽');
  });
});

describe('formatMoneyWithSign', () => {
  it('shows + prefix for positive RUB amount', () => {
    expect(formatMoneyWithSign(1000, 'RUB')).toBe('+1\u00a0000 ₽');
  });

  it('shows Unicode minus prefix for negative RUB amount', () => {
    expect(formatMoneyWithSign(-1000, 'RUB')).toBe('\u22121\u00a0000 ₽');
  });

  it('shows + prefix for positive USD amount', () => {
    expect(formatMoneyWithSign(500, 'USD')).toBe('+$500');
  });

  it('shows + prefix for zero EUR amount (zero is not negative)', () => {
    expect(formatMoneyWithSign(0, 'EUR')).toBe('+€0');
  });
});

describe('formatMoneyCompact', () => {
  it('returns plain number for amounts below 1000', () => {
    expect(formatMoneyCompact(500, 'RUB')).toBe('500 ₽');
  });

  it('uses к suffix for amounts in thousands range', () => {
    expect(formatMoneyCompact(1500, 'RUB')).toBe('2к ₽');
  });

  it('uses М suffix for amounts in millions range', () => {
    expect(formatMoneyCompact(2500000, 'USD')).toBe('2.5М $');
  });

  it('applies Unicode minus for negative compact values', () => {
    expect(formatMoneyCompact(-1500, 'RUB')).toBe('\u22122к ₽');
  });
});
