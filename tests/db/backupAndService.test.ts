import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  exportLedgerBackup,
  importLedgerBackup,
  validateBackupPayload,
} from '../../src/db/backup';
import { LedgerDatabase } from '../../src/db/database';
import { loadDemoPortfolioData } from '../../src/db/seed';
import { calculateCreditCardSummary } from '../../src/domain/creditCardCycle';
import { calculateBalancesAndNetWorth } from '../../src/domain/ledger';
import {
  cancelInstallmentPurchase,
  createInstallmentPurchase,
  createTransaction,
  saveAccount,
  saveRecurringRule,
} from '../../src/services/ledgerService';
import { runStartupCatchUp } from '../../src/services/startupService';

const createdDbs: LedgerDatabase[] = [];

function createTestDb(): LedgerDatabase {
  const db = new LedgerDatabase(`TestLedgerDB_${Math.random().toString(36).slice(2)}`);
  createdDbs.push(db);
  return db;
}

afterEach(async () => {
  while (createdDbs.length > 0) {
    const db = createdDbs.pop()!;
    await db.delete();
  }
});

describe('DB Services, Startup Catch-Up & JSON Backup Integration', () => {
  it('seeds initial categories/accounts once and runs idempotent recurring catch-up', async () => {
    const db = createTestDb();

    const boot1 = await runStartupCatchUp(db, '2026-11-27');
    expect(boot1.seededInitialData).toBe(true);
    expect(await db.categories.count()).toBeGreaterThanOrEqual(10);
    expect(await db.accounts.count()).toBe(2);

    const accounts = await db.accounts.toArray();
    const bank = accounts.find((a) => a.type === 'bank')!;

    await saveRecurringRule(
      {
        name: '房租',
        type: 'expense',
        amount: 12000_00,
        accountId: bank.id,
        categoryId: 'cat-housing',
        frequency: 'monthly',
        interval: 1,
        startDate: '2026-10-01',
        nextRunDate: '2026-10-01',
        note: '固定房租',
      },
      db,
    );

    const boot2 = await runStartupCatchUp(db, '2026-11-27');
    expect(boot2.seededInitialData).toBe(false);
    expect(boot2.insertedRecurringCount).toBe(2); // 10-01 and 11-01

    // Running catch-up again must produce 0 duplicates
    const boot3 = await runStartupCatchUp(db, '2026-11-27');
    expect(boot3.insertedRecurringCount).toBe(0);
    expect(await db.transactions.count()).toBe(2);
  });

  it('handles atomic installment creation, repayment transfer, and cancellation', async () => {
    const db = createTestDb();
    await runStartupCatchUp(db, '2026-11-27');

    const bank = await saveAccount(
      { name: 'Bank', type: 'bank', initialBalance: 50000_00 },
      db,
    );
    const card = await saveAccount(
      {
        name: 'Card',
        type: 'credit_card',
        initialBalance: 0,
        creditCardConfig: {
          statementDay: 15,
          paymentDueDay: 3,
          paymentDueMonthOffset: 1,
          creditLimit: 60000_00,
        },
      },
      db,
    );

    const { plan } = await createInstallmentPurchase(
      {
        accountId: card.id,
        categoryId: 'cat-shopping',
        totalAmount: 9000_00,
        totalInstallments: 3,
        startDate: '2026-11-10',
        note: '螢幕',
      },
      db,
    );

    // Pay off first closed statement (3000)
    await createTransaction(
      {
        type: 'transfer',
        amount: 3000_00,
        accountId: bank.id,
        toAccountId: card.id,
        transactionDate: '2026-11-20',
        note: '繳卡費',
      },
      db,
    );

    // Cancel future installment (2027-01-10) after 2026-12-15
    const cancelRes = await cancelInstallmentPurchase(plan.id, '2026-12-15', db);
    expect(cancelRes.voidTransactionIds).toHaveLength(1);

    const allTxs = await db.transactions.toArray();
    const summary = calculateCreditCardSummary(card, allTxs, '2026-11-27');
    expect(summary.remainingStatementDue).toBe(0);
    expect(summary.futureInstallmentTotal).toBe(3000_00); // Only 2026-12-10 remains active
  });

  it('exports and atomically restores a validated JSON backup snapshot', async () => {
    const db1 = createTestDb();
    await loadDemoPortfolioData(db1, '2026-11-27');

    const snapshot = await exportLedgerBackup(db1);
    expect(() => validateBackupPayload(snapshot)).not.toThrow();

    const db2 = createTestDb();
    const restored = await importLedgerBackup(db2, snapshot);
    expect(restored.counts.accounts).toBe(snapshot.data.accounts.length);
    expect(restored.counts.transactions).toBe(snapshot.data.transactions.length);

    const [a1, t1, a2, t2] = await Promise.all([
      db1.accounts.toArray(),
      db1.transactions.toArray(),
      db2.accounts.toArray(),
      db2.transactions.toArray(),
    ]);

    const nw1 = calculateBalancesAndNetWorth(a1, t1, '2026-11-27');
    const nw2 = calculateBalancesAndNetWorth(a2, t2, '2026-11-27');
    expect(nw2.netWorth).toBe(nw1.netWorth);
  });

  it('rejects corrupted backup payloads before touching database', async () => {
    expect(() => validateBackupPayload({ schemaVersion: 99, data: {} })).toThrow();
    expect(() =>
      validateBackupPayload({
        schemaVersion: 1,
        data: {
          accounts: [],
          categories: [],
          transactions: [
            {
              id: 't1',
              type: 'expense',
              amount: -100,
              accountId: 'missing',
              transactionDate: '2026-11-27',
            },
          ],
          installmentPlans: [],
          recurringRules: [],
          budgets: [],
        },
      }),
    ).toThrow();
  });
});
