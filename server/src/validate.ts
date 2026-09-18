// 入力検証ユーティリティ。不正入力は 400 { error: { code: 'validation', message } } になる。
import { TASK_PRIORITIES, TASK_STATUSES } from '../../shared/types.js';
import type { TaskPriority, TaskStatus } from '../../shared/types.js';
import { validationError } from './errors.js';

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const MAX_TEXT = 10_000;
export const MAX_NAME = 200;

export function asObject(value: unknown, what = 'リクエストボディ'): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw validationError(`${what}は JSON オブジェクトである必要があります`);
  }
  return value as Record<string, unknown>;
}

export function has(body: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, key) && body[key] !== undefined;
}

export function parseIdParam(raw: string | undefined, what = 'id'): number {
  const n = Number(raw);
  if (!raw || !Number.isInteger(n) || n <= 0) throw validationError(`${what} は正の整数である必要があります`);
  return n;
}

export function requireName(value: unknown, field: string): string {
  if (typeof value !== 'string') throw validationError(`${field} は文字列である必要があります`);
  const trimmed = value.trim();
  if (trimmed === '') throw validationError(`${field} を入力してください`);
  if (trimmed.length > MAX_NAME) throw validationError(`${field} は ${MAX_NAME} 文字以内で入力してください`);
  return trimmed;
}

export function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string') throw validationError(`${field} は文字列である必要があります`);
  if (value.length > MAX_TEXT) throw validationError(`${field} は ${MAX_TEXT} 文字以内で入力してください`);
  return value;
}

export function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw validationError(`${field} は真偽値である必要があります`);
  return value;
}

export function requireColor(value: unknown, field = 'color'): string {
  if (typeof value !== 'string' || !COLOR_RE.test(value)) {
    throw validationError(`${field} は #RRGGBB 形式で指定してください`);
  }
  return value.toLowerCase();
}

export function requireStatus(value: unknown, field = 'status'): TaskStatus {
  if (typeof value !== 'string' || !(TASK_STATUSES as string[]).includes(value)) {
    throw validationError(`${field} は ${TASK_STATUSES.join(' / ')} のいずれかである必要があります`);
  }
  return value as TaskStatus;
}

export function requirePriority(value: unknown, field = 'priority'): TaskPriority {
  if (typeof value !== 'string' || !(TASK_PRIORITIES as string[]).includes(value)) {
    throw validationError(`${field} は ${TASK_PRIORITIES.join(' / ')} のいずれかである必要があります`);
  }
  return value as TaskPriority;
}

export function isDateString(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const y = Number(value.slice(0, 4));
  const m = Number(value.slice(5, 7));
  const d = Number(value.slice(8, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function requireDate(value: unknown, field = 'dueDate'): string {
  if (typeof value !== 'string' || !isDateString(value)) {
    throw validationError(`${field} は YYYY-MM-DD 形式の日付である必要があります`);
  }
  return value;
}

/** ISO 8601 日時（例: 2026-01-31T00:00:00.000Z）。Date で解釈できれば正規化して返す。 */
export function requireIsoDateTime(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '' || Number.isNaN(Date.parse(value))) {
    throw validationError(`${field} は ISO 8601 形式の日時である必要があります`);
  }
  return new Date(value).toISOString();
}

export function requireNullableDate(value: unknown, field = 'dueDate'): string | null {
  if (value === null || value === '') return null;
  return requireDate(value, field);
}

export function requireId(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw validationError(`${field} は正の整数である必要があります`);
  }
  return value;
}

export function requireNullableId(value: unknown, field: string): number | null {
  if (value === null) return null;
  return requireId(value, field);
}

export function requireIdArray(value: unknown, field: string): number[] {
  if (!Array.isArray(value)) throw validationError(`${field} は配列である必要があります`);
  const out: number[] = [];
  for (const v of value) {
    const id = requireId(v, `${field} の要素`);
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

export function requireNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw validationError(`${field} は数値である必要があります`);
  }
  return value;
}

// クエリ文字列のヘルパー（Express の query は string | string[] | object）
export function queryString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

export function queryId(value: unknown, field: string): number | undefined {
  const raw = queryString(value);
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw validationError(`${field} は正の整数である必要があります`);
  return n;
}

export function queryBoolean(value: unknown, fallback: boolean): boolean {
  const raw = queryString(value);
  if (raw === undefined || raw === '') return fallback;
  if (raw === '1' || raw === 'true') return true;
  if (raw === '0' || raw === 'false') return false;
  return fallback;
}
