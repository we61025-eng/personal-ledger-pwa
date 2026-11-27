import {
  addDays,
  clampDayToMonth,
  formatYearMonth,
  parseISODate,
  shiftYearMonth,
} from './date';
import type {
  Account,
  CreditCardConfig,
  ISODate,
  MinorUnits,
  Transaction,
} from './types';

export interface BillingPeriod {
  /** 帳單所屬月份識別，例如 '2026-11'（以結帳日所在年月為準） */
  statementMonth: string;
  periodStart: ISODate;
  periodEnd: ISODate;
  dueDate: ISODate;
}

export type StatementStatus = 'unbilled' | 'open_due' | 'paid' | 'overdue';

export interface CreditCardStatementSummary {
  accountId: string;
  asOfDate: ISODate;
  latestClosedPeriod: BillingPeriod;
  currentOpenPeriod: BillingPeriod;
  /** 截至 latestClosedPeriod.periodEnd 的已出帳應繳總額（含前期未繳滾入） */
  closedStatementBalance: MinorUnits;
  /** 最新結帳日後至 asOfDate 期間的還款轉入金額 */
  repaidSinceStatementClose: MinorUnits;
  /** 最新一期已出帳仍須繳納的剩餘金額（>= 0） */
  remainingStatementDue: MinorUnits;
  /** 當期未出帳新增消費（periodStart <= date <= asOfDate） */
  unbilledSpending: MinorUnits;
  /** 尚未到期的未來分期總額（transactionDate > asOfDate） */
  futureInstallmentTotal: MinorUnits;
  /** 截至 asOfDate 的帳面餘額（負數代表欠款，正數代表溢繳） */
  postedBalance: MinorUnits;
  status: StatementStatus;
  availableCredit?: MinorUnits;
}

/** 計算指定年月與設定下的實際結帳日、起訖區間與繳款日 */
export function resolveStatementPeriod(
  statementYear: number,
  statementMonth: number,
  config: CreditCardConfig,
): BillingPeriod {
  const periodEnd = clampDayToMonth(statementYear, statementMonth, config.statementDay);
  const prev = shiftYearMonth(statementYear, statementMonth, -1);
  const prevStatementEnd = clampDayToMonth(prev.year, prev.month, config.statementDay);
  const periodStart = addDays(prevStatementEnd, 1);

  const dueYM = shiftYearMonth(statementYear, statementMonth, config.paymentDueMonthOffset);
  const dueDate = clampDayToMonth(dueYM.year, dueYM.month, config.paymentDueDay);

  return {
    statementMonth: formatYearMonth(statementYear, statementMonth),
    periodStart,
    periodEnd,
    dueDate,
  };
}

/** 給定任一消費日期，推斷該筆交易歸屬哪一期帳單（結帳日當天含在當期） */
export function getBillingPeriodForDate(
  date: ISODate,
  config: CreditCardConfig,
): BillingPeriod {
  const { year, month } = parseISODate(date);
  const candidate = resolveStatementPeriod(year, month, config);
  if (date <= candidate.periodEnd) {
    return candidate;
  }
  const next = shiftYearMonth(year, month, 1);
  return resolveStatementPeriod(next.year, next.month, config);
}

/** 計算單筆交易對指定帳戶帶符號餘額的變動量 */
function getAccountDelta(accountId: string, tx: Transaction): MinorUnits {
  if (tx.status !== 'posted') return 0;

  if (tx.type === 'expense' && tx.accountId === accountId) {
    return -tx.amount;
  }
  if (tx.type === 'income' && tx.accountId === accountId) {
    return tx.amount;
  }
  if (tx.type === 'transfer') {
    let delta = 0;
    if (tx.accountId === accountId) delta -= tx.amount;
    if (tx.toAccountId === accountId) delta += tx.amount;
    return delta;
  }
  return 0;
}

/** 計算截至 asOfDate 的信用卡完整帳務摘要 */
export function calculateCreditCardSummary(
  account: Account,
  transactions: readonly Transaction[],
  asOfDate: ISODate,
): CreditCardStatementSummary {
  if (account.type !== 'credit_card' || !account.creditCardConfig) {
    throw new Error(`Account "${account.id}" is not configured as a credit_card`);
  }

  const config = account.creditCardConfig;
  parseISODate(asOfDate);

  const periodContainingAsOf = getBillingPeriodForDate(asOfDate, config);
  const { year: pYear, month: pMonth } = parseISODate(periodContainingAsOf.periodEnd);

  let latestClosedPeriod: BillingPeriod;
  let currentOpenPeriod: BillingPeriod;

  if (asOfDate === periodContainingAsOf.periodEnd) {
    latestClosedPeriod = periodContainingAsOf;
    const next = shiftYearMonth(pYear, pMonth, 1);
    currentOpenPeriod = resolveStatementPeriod(next.year, next.month, config);
  } else {
    currentOpenPeriod = periodContainingAsOf;
    const prev = shiftYearMonth(pYear, pMonth, -1);
    latestClosedPeriod = resolveStatementPeriod(prev.year, prev.month, config);
  }

  let balanceAtClose = account.initialBalance;
  let postedBalance = account.initialBalance;
  let repaidSinceStatementClose = 0;
  let unbilledSpending = 0;
  let futureInstallmentTotal = 0;

  for (const tx of transactions) {
    if (tx.status !== 'posted') continue;
    const delta = getAccountDelta(account.id, tx);
    const touchesAccount = delta !== 0;
    if (!touchesAccount) continue;

    if (tx.transactionDate <= latestClosedPeriod.periodEnd) {
      balanceAtClose += delta;
    }

    if (tx.transactionDate <= asOfDate) {
      postedBalance += delta;
      if (tx.transactionDate > latestClosedPeriod.periodEnd) {
        if (delta > 0) {
          repaidSinceStatementClose += delta;
        } else {
          unbilledSpending += -delta;
        }
      }
    } else if (delta < 0) {
      futureInstallmentTotal += -delta;
    }
  }

  const closedStatementBalance = Math.max(0, -balanceAtClose);
  const remainingStatementDue = Math.max(
    0,
    closedStatementBalance - repaidSinceStatementClose,
  );

  let status: StatementStatus;
  if (remainingStatementDue > 0) {
    status = asOfDate > latestClosedPeriod.dueDate ? 'overdue' : 'open_due';
  } else if (closedStatementBalance > 0) {
    status = 'paid';
  } else if (unbilledSpending > 0) {
    status = 'unbilled';
  } else {
    status = 'paid';
  }

  const availableCredit =
    config.creditLimit !== undefined
      ? config.creditLimit + postedBalance - futureInstallmentTotal
      : undefined;

  return {
    accountId: account.id,
    asOfDate,
    latestClosedPeriod,
    currentOpenPeriod,
    closedStatementBalance,
    repaidSinceStatementClose,
    remainingStatementDue,
    unbilledSpending,
    futureInstallmentTotal,
    postedBalance,
    status,
    availableCredit,
  };
}
