import { formatISODate } from '../domain/date';
import type { ISODate } from '../domain/types';

/** 取得瀏覽器本地時區的今日日期（YYYY-MM-DD） */
export function getTodayISODate(now = new Date()): ISODate {
  return formatISODate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** 產生 UUID v4 主鍵 */
export function generateId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
