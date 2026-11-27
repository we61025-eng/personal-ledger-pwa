import type { LedgerDatabase } from '../db/database';
import { db } from '../db/database';
import { ensureDefaultSeedData } from '../db/seed';
import {
  buildRecurringOccurrenceKey,
  computeRecurringCatchUp,
} from '../domain/recurring';
import type { ISODate, Transaction } from '../domain/types';
import { generateId, getTodayISODate } from './dateProvider';

export interface StartupResult {
  seededInitialData: boolean;
  insertedRecurringCount: number;
  insertedTransactions: Transaction[];
}

/**
 * App 啟動初始化與無伺服器週期補發入口：
 * 1. 確保預設分類與初始帳戶存在
 * 2. 以 Dexie 原子交易執行週期性帳務冪等補發
 */
export async function runStartupCatchUp(
  database: LedgerDatabase = db,
  asOfDate: ISODate = getTodayISODate(),
): Promise<StartupResult> {
  const seededInitialData = await ensureDefaultSeedData(database);

  const catchUpResult = await database.transaction(
    'rw',
    database.recurringRules,
    database.transactions,
    async () => {
      const rules = await database.recurringRules.toArray();
      if (rules.length === 0) {
        return { transactionsToInsert: [] as Transaction[], updatedRules: [] };
      }

      const existingRecurringTxs = await database.transactions
        .filter((tx) => Boolean(tx.recurringRuleId && tx.recurringOccurrenceDate))
        .toArray();

      const existingKeys = new Set(
        existingRecurringTxs.map((tx) =>
          buildRecurringOccurrenceKey(tx.recurringRuleId!, tx.recurringOccurrenceDate!),
        ),
      );

      const res = computeRecurringCatchUp(
        rules,
        existingKeys,
        asOfDate,
        generateId,
        Date.now(),
      );

      if (res.transactionsToInsert.length > 0) {
        await database.transactions.bulkAdd(res.transactionsToInsert);
      }
      if (res.updatedRules.length > 0) {
        await database.recurringRules.bulkPut(res.updatedRules);
      }

      return res;
    },
  );

  return {
    seededInitialData,
    insertedRecurringCount: catchUpResult.transactionsToInsert.length,
    insertedTransactions: catchUpResult.transactionsToInsert,
  };
}
