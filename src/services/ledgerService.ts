import type { LedgerDatabase } from '../db/database';
import { db } from '../db/database';
import { parseISODate } from '../domain/date';
import {
  cancelInstallmentPlan,
  createInstallmentPlan,
  rebuildInstallmentTransactions,
  type CreateInstallmentInput,
  type InstallmentRebuildMode,
} from '../domain/installment';
import { assertMinorUnits, assertPositiveAmount } from '../domain/money';
import type {
  Account,
  AccountType,
  Budget,
  Category,
  CreditCardConfig,
  ISODate,
  MinorUnits,
  RecurringFrequency,
  RecurringRule,
  Transaction,
  TransactionType,
  YearMonth,
} from '../domain/types';
import { generateId, getTodayISODate } from './dateProvider';

export interface SaveAccountInput {
  id?: string;
  name: string;
  type: AccountType;
  currency?: string;
  initialBalance: MinorUnits;
  creditCardConfig?: CreditCardConfig;
  sortOrder?: number;
}

export interface SaveTransactionInput {
  type: TransactionType;
  amount: MinorUnits;
  accountId: string;
  toAccountId?: string;
  categoryId?: string;
  transactionDate: ISODate;
  note: string;
}

export interface SaveRecurringRuleInput {
  id?: string;
  name: string;
  type: TransactionType;
  amount: MinorUnits;
  accountId: string;
  toAccountId?: string;
  categoryId?: string;
  frequency: RecurringFrequency;
  interval: number;
  anchorDay?: number;
  dayOfWeek?: number;
  startDate: ISODate;
  endDate?: ISODate;
  nextRunDate?: ISODate;
  isActive?: boolean;
  note: string;
}

export interface SaveBudgetInput {
  id?: string;
  categoryId: string | null;
  amount: MinorUnits;
  yearMonth: YearMonth | null;
  alertThresholdPercent?: number;
  isActive?: boolean;
}

function validateTransactionFields(input: SaveTransactionInput): void {
  assertPositiveAmount(input.amount, 'amount');
  parseISODate(input.transactionDate);
  if (!input.accountId) {
    throw new Error('accountId is required');
  }
  if (input.type === 'transfer') {
    if (!input.toAccountId) {
      throw new Error('toAccountId is required for transfer');
    }
    if (input.toAccountId === input.accountId) {
      throw new Error('Transfer source and destination accounts must differ');
    }
  } else if (!input.categoryId) {
    throw new Error('categoryId is required for income or expense');
  }
}

export async function saveAccount(
  input: SaveAccountInput,
  database: LedgerDatabase = db,
): Promise<Account> {
  const name = input.name.trim();
  if (!name) throw new Error('Account name is required');
  assertMinorUnits(input.initialBalance, 'initialBalance');

  if (input.type === 'credit_card') {
    if (!input.creditCardConfig) {
      throw new Error('creditCardConfig is required for credit_card account');
    }
    const { statementDay, paymentDueDay } = input.creditCardConfig;
    if (statementDay < 1 || statementDay > 31 || paymentDueDay < 1 || paymentDueDay > 31) {
      throw new RangeError('statementDay and paymentDueDay must be between 1 and 31');
    }
  }

  const now = Date.now();
  const existing = input.id ? await database.accounts.get(input.id) : undefined;
  const sortOrder = input.sortOrder ?? existing?.sortOrder ?? (await database.accounts.count()) + 1;

  const account: Account = {
    id: existing?.id ?? generateId(),
    name,
    type: input.type,
    currency: input.currency ?? existing?.currency ?? 'TWD',
    initialBalance: input.initialBalance,
    creditCardConfig: input.type === 'credit_card' ? input.creditCardConfig : undefined,
    isArchived: existing?.isArchived ?? false,
    sortOrder,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await database.accounts.put(account);
  return account;
}

export async function setAccountArchived(
  accountId: string,
  isArchived: boolean,
  database: LedgerDatabase = db,
): Promise<void> {
  await database.accounts.update(accountId, { isArchived, updatedAt: Date.now() });
}

export async function saveCategory(
  input: Omit<Category, 'id' | 'isArchived' | 'sortOrder'> & { id?: string; sortOrder?: number },
  database: LedgerDatabase = db,
): Promise<Category> {
  const name = input.name.trim();
  if (!name) throw new Error('Category name is required');

  const existing = input.id ? await database.categories.get(input.id) : undefined;
  const category: Category = {
    id: existing?.id ?? generateId(),
    name,
    type: input.type,
    icon: input.icon,
    color: input.color,
    isArchived: existing?.isArchived ?? false,
    sortOrder: input.sortOrder ?? existing?.sortOrder ?? (await database.categories.count()) + 1,
  };
  await database.categories.put(category);
  return category;
}

export async function setCategoryArchived(
  categoryId: string,
  isArchived: boolean,
  database: LedgerDatabase = db,
): Promise<void> {
  await database.categories.update(categoryId, { isArchived });
}

export async function createTransaction(
  input: SaveTransactionInput,
  database: LedgerDatabase = db,
): Promise<Transaction> {
  validateTransactionFields(input);
  const now = Date.now();
  const tx: Transaction = {
    id: generateId(),
    type: input.type,
    amount: input.amount,
    accountId: input.accountId,
    toAccountId: input.type === 'transfer' ? input.toAccountId : undefined,
    categoryId: input.type === 'transfer' ? undefined : input.categoryId,
    transactionDate: input.transactionDate,
    note: input.note.trim(),
    status: 'posted',
    createdAt: now,
    updatedAt: now,
  };
  await database.transactions.add(tx);
  return tx;
}

export async function updateTransaction(
  txId: string,
  patch: Partial<SaveTransactionInput>,
  database: LedgerDatabase = db,
): Promise<Transaction> {
  const existing = await database.transactions.get(txId);
  if (!existing) throw new Error(`Transaction "${txId}" not found`);

  const merged: SaveTransactionInput = {
    type: patch.type ?? existing.type,
    amount: patch.amount ?? existing.amount,
    accountId: patch.accountId ?? existing.accountId,
    toAccountId: patch.toAccountId !== undefined ? patch.toAccountId : existing.toAccountId,
    categoryId: patch.categoryId !== undefined ? patch.categoryId : existing.categoryId,
    transactionDate: patch.transactionDate ?? existing.transactionDate,
    note: patch.note !== undefined ? patch.note : existing.note,
  };
  validateTransactionFields(merged);

  const updated: Transaction = {
    ...existing,
    ...merged,
    toAccountId: merged.type === 'transfer' ? merged.toAccountId : undefined,
    categoryId: merged.type === 'transfer' ? undefined : merged.categoryId,
    isInstallmentManuallyEdited:
      existing.installmentPlanId && patch.amount !== undefined
        ? true
        : existing.isInstallmentManuallyEdited,
    updatedAt: Date.now(),
  };

  await database.transactions.put(updated);
  return updated;
}

export async function voidTransaction(
  txId: string,
  database: LedgerDatabase = db,
): Promise<void> {
  await database.transactions.update(txId, {
    status: 'void',
    updatedAt: Date.now(),
  });
}

export async function createInstallmentPurchase(
  input: CreateInstallmentInput,
  database: LedgerDatabase = db,
) {
  const now = Date.now();
  const expanded = createInstallmentPlan(input, generateId, now);

  await database.transaction(
    'rw',
    database.installmentPlans,
    database.transactions,
    async () => {
      await database.installmentPlans.add(expanded.plan);
      await database.transactions.bulkAdd(expanded.transactions);
    },
  );

  return expanded;
}

export async function rebuildInstallmentPurchase(
  planId: string,
  updates: { totalAmount?: MinorUnits; totalInstallments?: number; note?: string },
  mode: InstallmentRebuildMode,
  asOfDate: ISODate = getTodayISODate(),
  database: LedgerDatabase = db,
) {
  return database.transaction(
    'rw',
    database.installmentPlans,
    database.transactions,
    async () => {
      const plan = await database.installmentPlans.get(planId);
      if (!plan) throw new Error(`InstallmentPlan "${planId}" not found`);

      const existingTxs = await database.transactions
        .where('installmentPlanId')
        .equals(planId)
        .toArray();

      const nextPlan = {
        ...plan,
        totalAmount: updates.totalAmount ?? plan.totalAmount,
        totalInstallments: updates.totalInstallments ?? plan.totalInstallments,
        note: updates.note ?? plan.note,
      };

      const now = Date.now();
      const result = rebuildInstallmentTransactions(
        nextPlan,
        existingTxs,
        mode,
        asOfDate,
        generateId,
        now,
      );

      await database.installmentPlans.put(result.updatedPlan);
      for (const voidId of result.voidTransactionIds) {
        await database.transactions.update(voidId, { status: 'void', updatedAt: now });
      }
      if (result.newTransactions.length > 0) {
        await database.transactions.bulkAdd(result.newTransactions);
      }

      return result;
    },
  );
}

export async function cancelInstallmentPurchase(
  planId: string,
  effectiveAfterDate: ISODate = getTodayISODate(),
  database: LedgerDatabase = db,
) {
  return database.transaction(
    'rw',
    database.installmentPlans,
    database.transactions,
    async () => {
      const plan = await database.installmentPlans.get(planId);
      if (!plan) throw new Error(`InstallmentPlan "${planId}" not found`);

      const existingTxs = await database.transactions
        .where('installmentPlanId')
        .equals(planId)
        .toArray();

      const now = Date.now();
      const result = cancelInstallmentPlan(plan, existingTxs, effectiveAfterDate, now);

      await database.installmentPlans.put(result.cancelledPlan);
      for (const voidId of result.voidTransactionIds) {
        await database.transactions.update(voidId, { status: 'void', updatedAt: now });
      }

      return result;
    },
  );
}

export async function saveRecurringRule(
  input: SaveRecurringRuleInput,
  database: LedgerDatabase = db,
): Promise<RecurringRule> {
  assertPositiveAmount(input.amount, 'amount');
  parseISODate(input.startDate);
  if (input.endDate) parseISODate(input.endDate);
  if (input.interval < 1 || !Number.isInteger(input.interval)) {
    throw new RangeError('interval must be an integer >= 1');
  }

  const now = Date.now();
  const existing = input.id ? await database.recurringRules.get(input.id) : undefined;
  const parsedStart = parseISODate(input.startDate);

  const rule: RecurringRule = {
    id: existing?.id ?? generateId(),
    name: input.name.trim(),
    type: input.type,
    amount: input.amount,
    accountId: input.accountId,
    toAccountId: input.type === 'transfer' ? input.toAccountId : undefined,
    categoryId: input.type === 'transfer' ? undefined : input.categoryId,
    frequency: input.frequency,
    interval: input.interval,
    anchorDay: input.anchorDay ?? parsedStart.day,
    dayOfWeek: input.dayOfWeek,
    startDate: input.startDate,
    endDate: input.endDate,
    nextRunDate: input.nextRunDate ?? existing?.nextRunDate ?? input.startDate,
    isActive: input.isActive ?? existing?.isActive ?? true,
    note: input.note.trim(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await database.recurringRules.put(rule);
  return rule;
}

export async function toggleRecurringRule(
  ruleId: string,
  isActive: boolean,
  database: LedgerDatabase = db,
): Promise<void> {
  await database.recurringRules.update(ruleId, { isActive, updatedAt: Date.now() });
}

export async function deleteRecurringRule(
  ruleId: string,
  database: LedgerDatabase = db,
): Promise<void> {
  await database.recurringRules.delete(ruleId);
}

export async function saveBudget(
  input: SaveBudgetInput,
  database: LedgerDatabase = db,
): Promise<Budget> {
  assertPositiveAmount(input.amount, 'budget amount');
  const now = Date.now();
  const existing = input.id ? await database.budgets.get(input.id) : undefined;

  const budget: Budget = {
    id: existing?.id ?? generateId(),
    categoryId: input.categoryId,
    amount: input.amount,
    yearMonth: input.yearMonth,
    alertThresholdPercent: input.alertThresholdPercent ?? existing?.alertThresholdPercent ?? 80,
    isActive: input.isActive ?? existing?.isActive ?? true,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await database.budgets.put(budget);
  return budget;
}

export async function deleteBudget(
  budgetId: string,
  database: LedgerDatabase = db,
): Promise<void> {
  await database.budgets.delete(budgetId);
}
