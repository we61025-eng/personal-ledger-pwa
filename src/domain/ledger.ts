import { parseISODate, parseYearMonth, toYearMonth } from './date';
import type { Account, ISODate, MinorUnits, Transaction, YearMonth } from './types';

export interface AccountBalanceResult {
  accountId: string;
  /** 截至 asOfDate 的帳面餘額（只計算 transactionDate <= asOfDate） */
  postedBalance: MinorUnits;
  /** 包含未到期未來交易（例如尚未入帳分期）的預估最終餘額 */
  projectedBalance: MinorUnits;
}

export interface NetWorthSummary {
  byAccountId: Record<string, AccountBalanceResult>;
  totalAssets: MinorUnits;
  totalLiabilities: MinorUnits;
  netWorth: MinorUnits;
}

export interface MonthlyCashflowSummary {
  yearMonth: YearMonth;
  totalIncome: MinorUnits;
  totalExpense: MinorUnits;
  netSavings: MinorUnits;
  expenseByCategory: Record<string, MinorUnits>;
  incomeByCategory: Record<string, MinorUnits>;
}

/** 計算所有帳戶截至 asOfDate 的餘額與總淨資產 */
export function calculateBalancesAndNetWorth(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
  asOfDate: ISODate,
): NetWorthSummary {
  parseISODate(asOfDate);

  const byAccountId: Record<string, AccountBalanceResult> = {};
  for (const acc of accounts) {
    byAccountId[acc.id] = {
      accountId: acc.id,
      postedBalance: acc.initialBalance,
      projectedBalance: acc.initialBalance,
    };
  }

  const applyDelta = (accountId: string | undefined, delta: MinorUnits, isPostedAsOf: boolean) => {
    if (!accountId || delta === 0) return;
    const entry = byAccountId[accountId];
    if (!entry) return;
    entry.projectedBalance += delta;
    if (isPostedAsOf) {
      entry.postedBalance += delta;
    }
  };

  for (const tx of transactions) {
    if (tx.status !== 'posted') continue;
    const isPostedAsOf = tx.transactionDate <= asOfDate;

    switch (tx.type) {
      case 'expense':
        applyDelta(tx.accountId, -tx.amount, isPostedAsOf);
        break;
      case 'income':
        applyDelta(tx.accountId, tx.amount, isPostedAsOf);
        break;
      case 'transfer':
        applyDelta(tx.accountId, -tx.amount, isPostedAsOf);
        applyDelta(tx.toAccountId, tx.amount, isPostedAsOf);
        break;
    }
  }

  let totalAssets = 0;
  let totalLiabilities = 0;

  for (const acc of accounts) {
    if (acc.isArchived) continue;
    const bal = byAccountId[acc.id].postedBalance;
    if (bal >= 0) {
      totalAssets += bal;
    } else {
      totalLiabilities += -bal;
    }
  }

  return {
    byAccountId,
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
  };
}

/** 計算指定月份收支統計（嚴格排除 void 與 transfer） */
export function calculateMonthlyCashflow(
  transactions: readonly Transaction[],
  yearMonth: YearMonth,
): MonthlyCashflowSummary {
  parseYearMonth(yearMonth);

  let totalIncome = 0;
  let totalExpense = 0;
  const expenseByCategory: Record<string, MinorUnits> = {};
  const incomeByCategory: Record<string, MinorUnits> = {};

  for (const tx of transactions) {
    if (tx.status !== 'posted') continue;
    if (tx.type === 'transfer') continue;
    if (toYearMonth(tx.transactionDate) !== yearMonth) continue;

    const categoryKey = tx.categoryId ?? 'uncategorized';
    if (tx.type === 'expense') {
      totalExpense += tx.amount;
      expenseByCategory[categoryKey] = (expenseByCategory[categoryKey] ?? 0) + tx.amount;
    } else if (tx.type === 'income') {
      totalIncome += tx.amount;
      incomeByCategory[categoryKey] = (incomeByCategory[categoryKey] ?? 0) + tx.amount;
    }
  }

  return {
    yearMonth,
    totalIncome,
    totalExpense,
    netSavings: totalIncome - totalExpense,
    expenseByCategory,
    incomeByCategory,
  };
}
