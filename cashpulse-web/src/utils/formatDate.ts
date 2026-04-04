export function formatDateFull(date: string | Date): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(date));
}

export function formatDateCompact(date: string | Date): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
  })
    .format(new Date(date))
    .replace('.', '');
}

export function formatDateWithWeekday(date: string | Date): string {
  const d = new Date(date);
  const dateStr = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
  const weekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'long' }).format(d);
  return `${dateStr} · ${weekday.charAt(0).toUpperCase() + weekday.slice(1)}`;
}

export function formatMonth(monthStr: string): string {
  const [year, month] = monthStr.split('-');
  const d = new Date(parseInt(year), parseInt(month) - 1, 1);
  const result = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(d);
  return result.charAt(0).toUpperCase() + result.slice(1);
}

export function formatXAxisDate(dateStr: string): string {
  const d = new Date(dateStr);
  return new Intl.DateTimeFormat('ru-RU', { month: 'short', year: '2-digit' })
    .format(d)
    .replace(' г.', '')
    .replace('.', "'");
}

export function formatRelativeDate(date: string | Date): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'сегодня';
  if (diffDays === -1) return 'вчера';
  if (diffDays === 1) return 'завтра';
  if (diffDays > 1 && diffDays <= 7) return `через ${diffDays} ${pluralDays(diffDays)}`;
  if (diffDays < -1 && diffDays >= -3) return `${Math.abs(diffDays)} ${pluralDays(Math.abs(diffDays))} назад`;
  return formatDateCompact(date);
}

function pluralDays(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return 'день';
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return 'дня';
  return 'дней';
}

export function toISODateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function getDateRange(period: 'week' | 'month' | 'quarter' | 'year' | 'all'): { from?: string; to?: string } {
  const now = new Date();
  const to = toISODateString(now);
  switch (period) {
    case 'week': {
      const from = new Date(now);
      from.setDate(from.getDate() - 7);
      return { from: toISODateString(from), to };
    }
    case 'month': {
      const from = new Date(now);
      from.setMonth(from.getMonth() - 1);
      return { from: toISODateString(from), to };
    }
    case 'quarter': {
      const from = new Date(now);
      from.setMonth(from.getMonth() - 3);
      return { from: toISODateString(from), to };
    }
    case 'year': {
      const from = new Date(now);
      from.setFullYear(from.getFullYear() - 1);
      return { from: toISODateString(from), to };
    }
    case 'all':
      return {};
  }
}
