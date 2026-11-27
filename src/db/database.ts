import Dexie, { type EntityTable } from 'dexie';
import type {
  Account,
  AppMeta,
  Budget,
  Category,
  InstallmentPlan,
  RecurringRule,
  Transaction,
} from '../domain/types';

export class LedgerDatabase extends Dexie {
  accounts!: EntityTable<Account, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  transactions!: EntityTable<Transaction, 'id'>;
  installmentPlans!: EntityTable<InstallmentPlan, 'id'>;
  recurringRules!: EntityTable<RecurringRule, 'id'>;
  budgets!: EntityTable<Budget, 'id'>;
  appMeta!: EntityTable<AppMeta, 'key'>;

  constructor(databaseName = 'PersonalLedgerDB') {
    super(databaseName);

    this.version(1).stores({
      accounts: 'id, type, isArchived, sortOrder',
      categories: 'id, type, isArchived, sortOrder',
      transactions: [
        'id',
        'transactionDate',
        'accountId',
        'toAccountId',
        'categoryId',
        'type',
        'status',
        'installmentPlanId',
        'recurringRuleId',
        '[accountId+transactionDate]',
        '[status+transactionDate]',
        '[recurringRuleId+recurringOccurrenceDate]',
      ].join(', '),
      installmentPlans: 'id, accountId, status, startDate',
      recurringRules: 'id, isActive, frequency, nextRunDate',
      budgets: 'id, categoryId, yearMonth, [categoryId+yearMonth]',
      appMeta: 'key',
    });
  }
}

export const db = new LedgerDatabase();
