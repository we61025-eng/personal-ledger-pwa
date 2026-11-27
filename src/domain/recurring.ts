import {
  addDays,
  addMonthsWithAnchor,
  addYearsWithAnchor,
  parseISODate,
} from './date';
import type { ISODate, RecurringRule, Transaction } from './types';

export interface RecurringCatchUpResult {
  transactionsToInsert: Transaction[];
  updatedRules: RecurringRule[];
}

export function buildRecurringOccurrenceKey(
  recurringRuleId: string,
  occurrenceDate: ISODate,
): string {
  return `${recurringRuleId}::${occurrenceDate}`;
}

/** 計算週期規則從 currentRunDate 往後推進一個週期的日期（保留 anchorDay） */
export function advanceRecurringDate(
  currentRunDate: ISODate,
  rule: Pick<RecurringRule, 'frequency' | 'interval' | 'anchorDay' | 'dayOfWeek'>,
): ISODate {
  if (!Number.isInteger(rule.interval) || rule.interval < 1) {
    throw new RangeError(`Recurring interval must be >= 1, got ${rule.interval}`);
  }
  const parsed = parseISODate(currentRunDate);
  const anchor = rule.anchorDay ?? parsed.day;

  switch (rule.frequency) {
    case 'daily':
      return addDays(currentRunDate, rule.interval);
    case 'weekly':
      return addDays(currentRunDate, rule.interval * 7);
    case 'monthly':
      return addMonthsWithAnchor(currentRunDate, rule.interval, anchor);
    case 'yearly':
      return addYearsWithAnchor(currentRunDate, rule.interval, anchor);
  }
}

/** 冪等計算所有應補發的週期交易，直到 asOfDate（與 rule.endDate 較早者）為止 */
export function computeRecurringCatchUp(
  rules: readonly RecurringRule[],
  existingOccurrenceKeys: ReadonlySet<string>,
  asOfDate: ISODate,
  generateId: () => string,
  nowEpochMs: number,
): RecurringCatchUpResult {
  parseISODate(asOfDate);

  const transactionsToInsert: Transaction[] = [];
  const updatedRules: RecurringRule[] = [];

  for (const rule of rules) {
    if (!rule.isActive) continue;

    const cutoff =
      rule.endDate && rule.endDate < asOfDate ? rule.endDate : asOfDate;

    let cursor = rule.nextRunDate;
    let advanced = false;

    while (cursor <= cutoff) {
      const key = buildRecurringOccurrenceKey(rule.id, cursor);
      if (!existingOccurrenceKeys.has(key)) {
        transactionsToInsert.push({
          id: generateId(),
          type: rule.type,
          amount: rule.amount,
          accountId: rule.accountId,
          toAccountId: rule.toAccountId,
          categoryId: rule.categoryId,
          transactionDate: cursor,
          note: rule.note || rule.name,
          status: 'posted',
          recurringRuleId: rule.id,
          recurringOccurrenceDate: cursor,
          createdAt: nowEpochMs,
          updatedAt: nowEpochMs,
        });
      }
      cursor = advanceRecurringDate(cursor, rule);
      advanced = true;
    }

    if (advanced) {
      updatedRules.push({
        ...rule,
        nextRunDate: cursor,
        updatedAt: nowEpochMs,
      });
    }
  }

  return { transactionsToInsert, updatedRules };
}
