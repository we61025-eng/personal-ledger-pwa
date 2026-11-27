import type { ISODate, YearMonth } from './types';

export interface ParsedISODate {
  year: number;
  month: number; // 1-12
  day: number;   // 1-31
}

export interface ParsedYearMonth {
  year: number;
  month: number; // 1-12
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const YEAR_MONTH_RE = /^(\d{4})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`Invalid month: ${month}`);
  }
  switch (month) {
    case 2:
      return isLeapYear(year) ? 29 : 28;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    default:
      return 31;
  }
}

export function formatISODate(year: number, month: number, day: number): ISODate {
  const maxDay = daysInMonth(year, month);
  if (!Number.isInteger(day) || day < 1 || day > maxDay) {
    throw new RangeError(`Invalid calendar date: ${year}-${month}-${day}`);
  }
  const y = String(year).padStart(4, '0');
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatYearMonth(year: number, month: number): YearMonth {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`Invalid month: ${month}`);
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

export function parseISODate(date: ISODate): ParsedISODate {
  const match = ISO_DATE_RE.exec(date);
  if (!match) {
    throw new RangeError(`Invalid ISODate format (expected YYYY-MM-DD): "${date}"`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const maxDay = daysInMonth(year, month);
  if (day < 1 || day > maxDay) {
    throw new RangeError(`Invalid calendar date: "${date}"`);
  }
  return { year, month, day };
}

export function parseYearMonth(ym: YearMonth): ParsedYearMonth {
  const match = YEAR_MONTH_RE.exec(ym);
  if (!match) {
    throw new RangeError(`Invalid YearMonth format (expected YYYY-MM): "${ym}"`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new RangeError(`Invalid YearMonth month: "${ym}"`);
  }
  return { year, month };
}

export function toYearMonth(date: ISODate): YearMonth {
  const { year, month } = parseISODate(date);
  return formatYearMonth(year, month);
}

/** 將目標日（1-31）對齊至指定年月的有效天數內 */
export function clampDayToMonth(year: number, month: number, targetDay: number): ISODate {
  if (!Number.isInteger(targetDay) || targetDay < 1 || targetDay > 31) {
    throw new RangeError(`targetDay must be an integer between 1 and 31, got ${targetDay}`);
  }
  const day = Math.min(targetDay, daysInMonth(year, month));
  return formatISODate(year, month, day);
}

/** 推算基準年月加上 monthsOffset 個月後的年月（支援負數） */
export function shiftYearMonth(
  year: number,
  month: number,
  monthsOffset: number,
): ParsedYearMonth {
  const totalMonths = year * 12 + (month - 1) + monthsOffset;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12 + 1;
  return { year: targetYear, month: targetMonth };
}

/** 使用 UTC 毫秒運算加減天數，徹底隔離本地時區與夏令時間影響 */
export function addDays(date: ISODate, days: number): ISODate {
  const { year, month, day } = parseISODate(date);
  const utc = Date.UTC(year, month - 1, day + days);
  const d = new Date(utc);
  return formatISODate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** 以 anchorDay 為基準加減月份，避免經過 2 月後日期永遠降級為 28 號 */
export function addMonthsWithAnchor(
  startDate: ISODate,
  monthsToAdd: number,
  anchorDay?: number,
): ISODate {
  const parsed = parseISODate(startDate);
  const anchor = anchorDay ?? parsed.day;
  const { year, month } = shiftYearMonth(parsed.year, parsed.month, monthsToAdd);
  return clampDayToMonth(year, month, anchor);
}

export function addYearsWithAnchor(
  startDate: ISODate,
  yearsToAdd: number,
  anchorDay?: number,
): ISODate {
  return addMonthsWithAnchor(startDate, yearsToAdd * 12, anchorDay);
}

export function diffDays(from: ISODate, to: ISODate): number {
  const a = parseISODate(from);
  const b = parseISODate(to);
  const utcA = Date.UTC(a.year, a.month - 1, a.day);
  const utcB = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((utcB - utcA) / MS_PER_DAY);
}
