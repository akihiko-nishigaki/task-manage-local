// 日付ユーティリティ: すべてローカルタイム・ja-JP 表示。外部ライブラリは使わない。

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 'YYYY-MM-DD'（ローカル日付） */
export function toDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 今日の日付 'YYYY-MM-DD' */
export function today(): string {
  return toDateString(new Date());
}

/** 今日から days 日後の 'YYYY-MM-DD' */
export function addDays(dateStr: string, days: number): string {
  const d = parseDate(dateStr) ?? new Date();
  d.setDate(d.getDate() + days);
  return toDateString(d);
}

/** 'YYYY-MM-DD' を Date に。不正値は null */
export function parseDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 期限超過（今日より前）か */
export function isOverdue(dueDate: string | null | undefined): boolean {
  if (!dueDate) return false;
  return dueDate < today();
}

/** 今日が期限か */
export function isToday(dueDate: string | null | undefined): boolean {
  return !!dueDate && dueDate.slice(0, 10) === today();
}

/** 今週（今日から 7 日以内、超過は含まない）か */
export function isWithinDays(dueDate: string | null | undefined, days: number): boolean {
  if (!dueDate) return false;
  const d = dueDate.slice(0, 10);
  return d >= today() && d <= addDays(today(), days);
}

/** 期限までの残日数（負なら超過） */
export function daysUntil(dueDate: string | null | undefined): number | null {
  const d = parseDate(dueDate);
  if (!d) return null;
  const base = parseDate(today());
  if (!base) return null;
  return Math.round((d.getTime() - base.getTime()) / 86_400_000);
}

const dateFmt = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});
const dateTimeFmt = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** 'YYYY-MM-DD' → 「2026年9月16日」 */
export function formatDate(dateStr: string | null | undefined): string {
  const d = parseDate(dateStr);
  return d ? dateFmt.format(d) : '';
}

/** ISO 日時 → 「2026年9月16日 09:30」 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : dateTimeFmt.format(d);
}

/** 期限の短縮表示（「9/16」）＋相対情報 */
export function formatDueShort(dueDate: string | null | undefined): string {
  const d = parseDate(dueDate);
  if (!d) return '';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 期限の説明文（今日 / 明日 / 3日超過 など） */
export function describeDue(dueDate: string | null | undefined): string {
  const diff = daysUntil(dueDate);
  if (diff === null) return '';
  if (diff === 0) return '今日';
  if (diff === 1) return '明日';
  if (diff === -1) return '昨日';
  if (diff < 0) return `${-diff}日超過`;
  return `あと${diff}日`;
}
