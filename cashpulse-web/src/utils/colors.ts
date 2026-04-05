const TAG_COLORS = [
  'blue',
  'cyan',
  'teal',
  'green',
  'lime',
  'yellow',
  'orange',
  'red',
  'pink',
  'grape',
  'violet',
  'indigo',
];

export function tagColor(name: string): string {
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + char.charCodeAt(0)) % TAG_COLORS.length;
  }
  return TAG_COLORS[Math.abs(hash)];
}

export const accountTypeColors: Record<string, string> = {
  debit: 'blue',
  credit: 'orange',
  investment: 'green',
  cash: 'gray',
  deposit: 'teal',
};

export const accountTypeLabels: Record<string, string> = {
  debit: 'Дебетовый',
  credit: 'Кредитный',
  investment: 'Инвестиционный',
  cash: 'Наличные',
  deposit: 'Вклад',
};
