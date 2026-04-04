export function formatMoney(amount: number, currency: string): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '−' : '';

  if (currency === 'RUB') {
    return `${sign}${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(abs)} ₽`;
  }
  if (currency === 'USD') {
    return `${sign}$${new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(abs)}`;
  }
  if (currency === 'EUR') {
    return `${sign}€${new Intl.NumberFormat('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(abs)}`;
  }
  return `${sign}${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(abs)} ${currency}`;
}

export function formatMoneyWithSign(amount: number, currency: string): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '−' : '+';

  if (currency === 'RUB') {
    return `${sign}${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(abs)} ₽`;
  }
  if (currency === 'USD') {
    return `${sign}$${new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(abs)}`;
  }
  if (currency === 'EUR') {
    return `${sign}€${new Intl.NumberFormat('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(abs)}`;
  }
  return `${sign}${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(abs)} ${currency}`;
}

export function formatMoneyCompact(amount: number, currency: string): string {
  const symbol =
    currency === 'RUB' ? '₽' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency;
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '−' : '';
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toFixed(1)}М ${symbol}`;
  }
  if (abs >= 1000) {
    return `${sign}${(abs / 1000).toFixed(0)}к ${symbol}`;
  }
  return `${sign}${abs} ${symbol}`;
}
