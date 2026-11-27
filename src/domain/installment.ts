import { addMonthsWithAnchor, parseISODate } from './date';
import { assertPositiveAmount, splitInstallmentAmounts } from './money';
import type { ISODate, InstallmentPlan, MinorUnits, Transaction } from './types';

export interface CreateInstallmentInput {
  accountId: string;
  categoryId: string;
  totalAmount: MinorUnits;
  totalInstallments: number;
  startDate: ISODate;
  note: string;
  remainderStrategy?: 'first' | 'last';
}

export interface ExpandedInstallmentResult {
  plan: InstallmentPlan;
  transactions: Transaction[];
}

export type InstallmentRebuildMode = 'replace_all' | 'keep_past_recalculate_future';

export interface RebuildInstallmentResult {
  updatedPlan: InstallmentPlan;
  voidTransactionIds: string[];
  newTransactions: Transaction[];
}

export interface CancelInstallmentResult {
  cancelledPlan: InstallmentPlan;
  voidTransactionIds: string[];
}

function buildChildTransaction(
  plan: InstallmentPlan,
  amount: MinorUnits,
  index: number,
  transactionDate: ISODate,
  generateId: () => string,
  nowEpochMs: number,
): Transaction {
  return {
    id: generateId(),
    type: 'expense',
    amount,
    accountId: plan.accountId,
    categoryId: plan.categoryId,
    transactionDate,
    note: plan.note
      ? `${plan.note} (${index}/${plan.totalInstallments})`
      : `分期付款 (${index}/${plan.totalInstallments})`,
    status: 'posted',
    installmentPlanId: plan.id,
    installmentIndex: index,
    installmentTotal: plan.totalInstallments,
    createdAt: nowEpochMs,
    updatedAt: nowEpochMs,
  };
}

/** 依起始日與 Anchor Day 保留規則展開第 1..N 期分期計劃與子交易 */
export function createInstallmentPlan(
  input: CreateInstallmentInput,
  generateId: () => string,
  nowEpochMs: number,
): ExpandedInstallmentResult {
  assertPositiveAmount(input.totalAmount, 'totalAmount');
  if (!Number.isInteger(input.totalInstallments) || input.totalInstallments < 2) {
    throw new RangeError(
      `totalInstallments must be >= 2, got ${input.totalInstallments}`,
    );
  }
  const { day: anchorDay } = parseISODate(input.startDate);
  const strategy = input.remainderStrategy ?? 'first';

  const plan: InstallmentPlan = {
    id: generateId(),
    accountId: input.accountId,
    categoryId: input.categoryId,
    totalAmount: input.totalAmount,
    totalInstallments: input.totalInstallments,
    startDate: input.startDate,
    note: input.note,
    remainderStrategy: strategy,
    status: 'active',
    createdAt: nowEpochMs,
    updatedAt: nowEpochMs,
  };

  const amounts = splitInstallmentAmounts(
    input.totalAmount,
    input.totalInstallments,
    strategy,
  );

  const transactions = amounts.map((amount, idx) => {
    const txDate = addMonthsWithAnchor(input.startDate, idx, anchorDay);
    return buildChildTransaction(
      plan,
      amount,
      idx + 1,
      txDate,
      generateId,
      nowEpochMs,
    );
  });

  return { plan, transactions };
}

/** 重新計算或調整既有的分期計劃 */
export function rebuildInstallmentTransactions(
  plan: InstallmentPlan,
  existingTransactions: readonly Transaction[],
  mode: InstallmentRebuildMode,
  asOfDate: ISODate,
  generateId: () => string,
  nowEpochMs: number,
): RebuildInstallmentResult {
  assertPositiveAmount(plan.totalAmount, 'plan.totalAmount');
  parseISODate(asOfDate);
  const { day: anchorDay } = parseISODate(plan.startDate);

  const activeChildren = existingTransactions.filter(
    (tx) => tx.installmentPlanId === plan.id && tx.status === 'posted',
  );

  const updatedPlan: InstallmentPlan = {
    ...plan,
    updatedAt: nowEpochMs,
  };

  if (mode === 'replace_all') {
    const voidTransactionIds = activeChildren.map((tx) => tx.id);
    const amounts = splitInstallmentAmounts(
      plan.totalAmount,
      plan.totalInstallments,
      plan.remainderStrategy,
    );
    const newTransactions = amounts.map((amount, idx) =>
      buildChildTransaction(
        updatedPlan,
        amount,
        idx + 1,
        addMonthsWithAnchor(plan.startDate, idx, anchorDay),
        generateId,
        nowEpochMs,
      ),
    );
    return { updatedPlan, voidTransactionIds, newTransactions };
  }

  // mode === 'keep_past_recalculate_future'
  const keptPast = activeChildren
    .filter((tx) => tx.transactionDate <= asOfDate)
    .sort((a, b) => (a.installmentIndex ?? 0) - (b.installmentIndex ?? 0));

  const futureToVoid = activeChildren.filter((tx) => tx.transactionDate > asOfDate);
  const voidTransactionIds = futureToVoid.map((tx) => tx.id);

  const keptTotal = keptPast.reduce((sum, tx) => sum + tx.amount, 0);
  const remainingAmount = plan.totalAmount - keptTotal;
  const remainingCount = plan.totalInstallments - keptPast.length;

  if (remainingCount <= 0) {
    return {
      updatedPlan,
      voidTransactionIds,
      newTransactions: [],
    };
  }

  if (remainingAmount <= 0) {
    throw new RangeError(
      `Remaining installment amount (${remainingAmount}) must be > 0 when ${remainingCount} future installments remain`,
    );
  }

  const futureAmounts =
    remainingCount === 1
      ? [remainingAmount]
      : splitInstallmentAmounts(remainingAmount, remainingCount, plan.remainderStrategy);

  const startIndex = keptPast.length; // 0-based month offset for first future installment
  const newTransactions = futureAmounts.map((amount, offset) => {
    const installmentIndex = startIndex + offset + 1;
    const txDate = addMonthsWithAnchor(plan.startDate, startIndex + offset, anchorDay);
    return buildChildTransaction(
      updatedPlan,
      amount,
      installmentIndex,
      txDate,
      generateId,
      nowEpochMs,
    );
  });

  return { updatedPlan, voidTransactionIds, newTransactions };
}

/** 取消分期計劃：作廢 effectiveAfterDate 之後尚未到期的子交易，並保留已發生帳務 */
export function cancelInstallmentPlan(
  plan: InstallmentPlan,
  existingTransactions: readonly Transaction[],
  effectiveAfterDate: ISODate,
  nowEpochMs: number,
): CancelInstallmentResult {
  parseISODate(effectiveAfterDate);

  const voidTransactionIds = existingTransactions
    .filter(
      (tx) =>
        tx.installmentPlanId === plan.id &&
        tx.status === 'posted' &&
        tx.transactionDate > effectiveAfterDate,
    )
    .map((tx) => tx.id);

  const cancelledPlan: InstallmentPlan = {
    ...plan,
    status: 'cancelled',
    updatedAt: nowEpochMs,
  };

  return { cancelledPlan, voidTransactionIds };
}
