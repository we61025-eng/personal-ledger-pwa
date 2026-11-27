import { parseYearMonth, toYearMonth } from './date';
import type { Budget, MinorUnits, Transaction, YearMonth } from './types';

export type BudgetAlertLevel = 'ok' | 'warning' | 'exceeded';

export interface BudgetProgress {
  budgetId: string;
  /** null 代表全月總支出預算 */
  categoryId: string | null;
  yearMonth: YearMonth;
  limitAmount: MinorUnits;
  spentAmount: MinorUnits;
  remainingAmount: MinorUnits;
  /** 百分比數值（例如 80 代表 80%） */
  usagePercent: number;
  alertLevel: BudgetAlertLevel;
}

/**
 * 解析指定月份有效預算（同分類若有指定 yearMonth 的單月覆寫，優先於通用預算）
 * 並依當月有效 expense 交易計算進度與警示等級（排除 transfer 與 void）。
 */
export function evaluateMonthlyBudgets(
  budgets: readonly Budget[],
  transactions: readonly Transaction[],
  yearMonth: YearMonth,
): BudgetProgress[] {
  parseYearMonth(yearMonth);

  // 同一個 categoryId（包含 null 總預算）最多只套用一筆：指定月份覆寫 > 通用預算
  const effectiveByCategory = new Map<string | null, Budget>();
  for (const budget of budgets) {
    if (!budget.isActive) continue;
    if (budget.yearMonth !== null && budget.yearMonth !== yearMonth) continue;

    const existing = effectiveByCategory.get(budget.categoryId);
    if (!existing || (existing.yearMonth === null && budget.yearMonth === yearMonth)) {
      effectiveByCategory.set(budget.categoryId, budget);
    }
  }

  let totalMonthlyExpense = 0;
  const expenseByCategory = new Map<string, MinorUnits>();

  for (const tx of transactions) {
    if (tx.status !== 'posted' || tx.type !== 'expense') continue;
    if (toYearMonth(tx.transactionDate) !== yearMonth) continue;

    totalMonthlyExpense += tx.amount;
    if (tx.categoryId) {
      expenseByCategory.set(
        tx.categoryId,
        (expenseByCategory.get(tx.categoryId) ?? 0) + tx.amount,
      );
    }
  }

  const results: BudgetProgress[] = [];
  for (const budget of effectiveByCategory.values()) {
    const spentAmount =
      budget.categoryId === null
        ? totalMonthlyExpense
        : (expenseByCategory.get(budget.categoryId) ?? 0);

    const remainingAmount = budget.amount - spentAmount;
    const usagePercent =
      budget.amount > 0
        ? Math.round((spentAmount / budget.amount) * 10000) / 100
        : spentAmount > 0
          ? 100
          : 0;

    let alertLevel: BudgetAlertLevel = 'ok';
    if (spentAmount > budget.amount) {
      alertLevel = 'exceeded';
    } else if (usagePercent >= budget.alertThresholdPercent) {
      alertLevel = 'warning';
    }

    results.push({
      budgetId: budget.id,
      categoryId: budget.categoryId,
      yearMonth,
      limitAmount: budget.amount,
      spentAmount,
      remainingAmount,
      usagePercent,
      alertLevel,
    });
  }

  return results;
}
