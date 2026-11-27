import { parseISODate } from '../domain/date';
import { assertMinorUnits, assertPositiveAmount } from '../domain/money';
import type {
  Account,
  Budget,
  Category,
  InstallmentPlan,
  RecurringRule,
  Transaction,
} from '../domain/types';
import type { LedgerDatabase } from './database';

export interface LedgerBackupPayload {
  schemaVersion: 1;
  exportedAt: string;
  appVersion: string;
  data: {
    accounts: Account[];
    categories: Category[];
    transactions: Transaction[];
    installmentPlans: InstallmentPlan[];
    recurringRules: RecurringRule[];
    budgets: Budget[];
  };
}

export interface BackupImportResult {
  counts: {
    accounts: number;
    categories: number;
    transactions: number;
    installmentPlans: number;
    recurringRules: number;
    budgets: number;
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid or missing string field: ${field}`);
  }
  return value;
}

export async function exportLedgerBackup(
  database: LedgerDatabase,
  appVersion = '0.1.0',
): Promise<LedgerBackupPayload> {
  const [accounts, categories, transactions, installmentPlans, recurringRules, budgets] =
    await database.transaction(
      'r',
      [
        database.accounts,
        database.categories,
        database.transactions,
        database.installmentPlans,
        database.recurringRules,
        database.budgets,
      ],
      async () =>
        Promise.all([
          database.accounts.toArray(),
          database.categories.toArray(),
          database.transactions.toArray(),
          database.installmentPlans.toArray(),
          database.recurringRules.toArray(),
          database.budgets.toArray(),
        ]),
    );

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    appVersion,
    data: {
      accounts,
      categories,
      transactions,
      installmentPlans,
      recurringRules,
      budgets,
    },
  };
}

/** 嚴格校驗匯入 JSON 的結構、金額整數不變量與帳戶參照完整性 */
export function validateBackupPayload(raw: unknown): LedgerBackupPayload {
  if (!isObject(raw)) {
    throw new Error('Backup JSON must be an object');
  }
  if (raw.schemaVersion !== 1) {
    throw new Error(`Unsupported backup schemaVersion: ${String(raw.schemaVersion)}`);
  }
  if (!isObject(raw.data)) {
    throw new Error('Backup payload missing "data" object');
  }

  const requiredTables = [
    'accounts',
    'categories',
    'transactions',
    'installmentPlans',
    'recurringRules',
    'budgets',
  ] as const;

  for (const table of requiredTables) {
    if (!Array.isArray(raw.data[table])) {
      throw new Error(`Backup data.${table} must be an array`);
    }
  }

  const accounts = raw.data.accounts as Account[];
  const categories = raw.data.categories as Category[];
  const transactions = raw.data.transactions as Transaction[];
  const installmentPlans = raw.data.installmentPlans as InstallmentPlan[];
  const recurringRules = raw.data.recurringRules as RecurringRule[];
  const budgets = raw.data.budgets as Budget[];

  const accountIds = new Set<string>();
  for (const acc of accounts) {
    if (!isObject(acc)) throw new Error('Invalid account record');
    const id = assertNonEmptyString(acc.id, 'account.id');
    assertNonEmptyString(acc.name, 'account.name');
    assertMinorUnits(acc.initialBalance, 'account.initialBalance');
    accountIds.add(id);
  }

  for (const cat of categories) {
    if (!isObject(cat)) throw new Error('Invalid category record');
    assertNonEmptyString(cat.id, 'category.id');
    assertNonEmptyString(cat.name, 'category.name');
  }

  for (const tx of transactions) {
    if (!isObject(tx)) throw new Error('Invalid transaction record');
    assertNonEmptyString(tx.id, 'transaction.id');
    assertPositiveAmount(tx.amount, 'transaction.amount');
    const accId = assertNonEmptyString(tx.accountId, 'transaction.accountId');
    if (!accountIds.has(accId)) {
      throw new Error(`Transaction "${tx.id}" references missing account "${accId}"`);
    }
    if (tx.type === 'transfer') {
      const toId = assertNonEmptyString(tx.toAccountId, 'transaction.toAccountId');
      if (!accountIds.has(toId)) {
        throw new Error(`Transfer "${tx.id}" references missing toAccountId "${toId}"`);
      }
      if (toId === accId) {
        throw new Error(`Transfer "${tx.id}" cannot have identical source and destination`);
      }
    }
    parseISODate(assertNonEmptyString(tx.transactionDate, 'transaction.transactionDate'));
  }

  for (const plan of installmentPlans) {
    if (!isObject(plan)) throw new Error('Invalid installmentPlan record');
    assertNonEmptyString(plan.id, 'installmentPlan.id');
    assertPositiveAmount(plan.totalAmount, 'installmentPlan.totalAmount');
    parseISODate(assertNonEmptyString(plan.startDate, 'installmentPlan.startDate'));
  }

  for (const rule of recurringRules) {
    if (!isObject(rule)) throw new Error('Invalid recurringRule record');
    assertNonEmptyString(rule.id, 'recurringRule.id');
    assertPositiveAmount(rule.amount, 'recurringRule.amount');
    parseISODate(assertNonEmptyString(rule.startDate, 'recurringRule.startDate'));
    parseISODate(assertNonEmptyString(rule.nextRunDate, 'recurringRule.nextRunDate'));
  }

  for (const budget of budgets) {
    if (!isObject(budget)) throw new Error('Invalid budget record');
    assertNonEmptyString(budget.id, 'budget.id');
    assertPositiveAmount(budget.amount, 'budget.amount');
  }

  return raw as unknown as LedgerBackupPayload;
}

/** 驗證通過後於單一原子交易內清空並還原所有本機資料 */
export async function importLedgerBackup(
  database: LedgerDatabase,
  raw: unknown,
): Promise<BackupImportResult> {
  const payload = validateBackupPayload(raw);
  const { data } = payload;

  await database.transaction(
    'rw',
    [
      database.accounts,
      database.categories,
      database.transactions,
      database.installmentPlans,
      database.recurringRules,
      database.budgets,
      database.appMeta,
    ],
    async () => {
      await Promise.all([
        database.accounts.clear(),
        database.categories.clear(),
        database.transactions.clear(),
        database.installmentPlans.clear(),
        database.recurringRules.clear(),
        database.budgets.clear(),
      ]);

      await Promise.all([
        database.accounts.bulkAdd(data.accounts),
        database.categories.bulkAdd(data.categories),
        database.transactions.bulkAdd(data.transactions),
        database.installmentPlans.bulkAdd(data.installmentPlans),
        database.recurringRules.bulkAdd(data.recurringRules),
        database.budgets.bulkAdd(data.budgets),
      ]);

      await database.appMeta.put({ key: 'seeded_v1', value: new Date().toISOString() });
      await database.appMeta.put({
        key: 'lastRestoredAt',
        value: new Date().toISOString(),
      });
    },
  );

  return {
    counts: {
      accounts: data.accounts.length,
      categories: data.categories.length,
      transactions: data.transactions.length,
      installmentPlans: data.installmentPlans.length,
      recurringRules: data.recurringRules.length,
      budgets: data.budgets.length,
    },
  };
}
