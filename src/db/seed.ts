import type { LedgerDatabase } from './database';
import { addMonthsWithAnchor } from '../domain/date';
import { createInstallmentPlan } from '../domain/installment';
import type { Account, Budget, Category, ISODate, RecurringRule, Transaction } from '../domain/types';
import { generateId } from '../services/dateProvider';

export const DEFAULT_CATEGORIES: readonly Omit<Category, 'isArchived'>[] = [
  { id: 'cat-food', name: '餐飲美食', type: 'expense', icon: 'utensils', color: '#f97316', sortOrder: 1 },
  { id: 'cat-transport', name: '交通通勤', type: 'expense', icon: 'train', color: '#0ea5e9', sortOrder: 2 },
  { id: 'cat-shopping', name: '購物消費', type: 'expense', icon: 'shopping-bag', color: '#ec4899', sortOrder: 3 },
  { id: 'cat-housing', name: '居家水電', type: 'expense', icon: 'home', color: '#8b5cf6', sortOrder: 4 },
  { id: 'cat-entertainment', name: '休閒娛樂', type: 'expense', icon: 'gamepad-2', color: '#14b8a6', sortOrder: 5 },
  { id: 'cat-health', name: '醫療保健', type: 'expense', icon: 'heart-pulse', color: '#ef4444', sortOrder: 6 },
  { id: 'cat-subscription', name: '訂閱服務', type: 'expense', icon: 'repeat', color: '#6366f1', sortOrder: 7 },
  { id: 'cat-other-exp', name: '其他支出', type: 'expense', icon: 'more-horizontal', color: '#64748b', sortOrder: 8 },
  { id: 'cat-salary', name: '薪資收入', type: 'income', icon: 'wallet', color: '#10b981', sortOrder: 1 },
  { id: 'cat-bonus', name: '獎金紅利', type: 'income', icon: 'award', color: '#eab308', sortOrder: 2 },
  { id: 'cat-invest', name: '投資股利', type: 'income', icon: 'trending-up', color: '#3b82f6', sortOrder: 3 },
  { id: 'cat-other-inc', name: '其他收入', type: 'income', icon: 'plus-circle', color: '#64748b', sortOrder: 4 },
];

const SEED_META_KEY = 'seeded_v1';

/** 僅於首次開啟時寫入預設分類與基礎帳戶（現金 + 銀行） */
export async function ensureDefaultSeedData(database: LedgerDatabase): Promise<boolean> {
  return database.transaction(
    'rw',
    database.appMeta,
    database.categories,
    database.accounts,
    async () => {
      const seeded = await database.appMeta.get(SEED_META_KEY);
      if (seeded) return false;

      const catCount = await database.categories.count();
      if (catCount === 0) {
        await database.categories.bulkAdd(
          DEFAULT_CATEGORIES.map((c) => ({ ...c, isArchived: false })),
        );
      }

      const accCount = await database.accounts.count();
      if (accCount === 0) {
        const now = Date.now();
        await database.accounts.bulkAdd([
          {
            id: generateId(),
            name: '日常現金',
            type: 'cash',
            currency: 'TWD',
            initialBalance: 0,
            isArchived: false,
            sortOrder: 1,
            createdAt: now,
            updatedAt: now,
          },
          {
            id: generateId(),
            name: '主力銀行帳戶',
            type: 'bank',
            currency: 'TWD',
            initialBalance: 0,
            isArchived: false,
            sortOrder: 2,
            createdAt: now,
            updatedAt: now,
          },
        ]);
      }

      await database.appMeta.put({ key: SEED_META_KEY, value: new Date().toISOString() });
      return true;
    },
  );
}

/**
 * 載入作品集示範資料（覆蓋目前資料，方便體驗多帳戶、信用卡結帳週期、分期與預算警示）
 */
export async function loadDemoPortfolioData(
  database: LedgerDatabase,
  asOfDate: ISODate,
): Promise<void> {
  const now = Date.now();
  const cashId = generateId();
  const bankId = generateId();
  const ewalletId = generateId();
  const cardMainId = generateId();
  const cardTravelId = generateId();

  const prevMonthDate = addMonthsWithAnchor(asOfDate, -1, 10);
  const currentEarlyDate = addMonthsWithAnchor(asOfDate, 0, 5);
  const lastMonthFirst = addMonthsWithAnchor(asOfDate, -1, 1);
  const nextMonthFirst = addMonthsWithAnchor(asOfDate, 1, 1);

  const accounts: Account[] = [
    {
      id: cashId,
      name: '隨身錢包',
      type: 'cash',
      currency: 'TWD',
      initialBalance: 4500_00,
      isArchived: false,
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: bankId,
      name: '玉山薪轉帳戶',
      type: 'bank',
      currency: 'TWD',
      initialBalance: 185000_00,
      isArchived: false,
      sortOrder: 2,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: ewalletId,
      name: 'LINE Pay / 一卡通',
      type: 'ewallet',
      currency: 'TWD',
      initialBalance: 3200_00,
      isArchived: false,
      sortOrder: 3,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: cardMainId,
      name: '富邦數位生活卡',
      type: 'credit_card',
      currency: 'TWD',
      initialBalance: 0,
      creditCardConfig: {
        statementDay: 15,
        paymentDueDay: 3,
        paymentDueMonthOffset: 1,
        creditLimit: 120000_00,
      },
      isArchived: false,
      sortOrder: 4,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: cardTravelId,
      name: '國泰 Cube 旅遊卡',
      type: 'credit_card',
      currency: 'TWD',
      initialBalance: 0,
      creditCardConfig: {
        statementDay: 27,
        paymentDueDay: 14,
        paymentDueMonthOffset: 1,
        creditLimit: 150000_00,
      },
      isArchived: false,
      sortOrder: 5,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const installment = createInstallmentPlan(
    {
      accountId: cardMainId,
      categoryId: 'cat-shopping',
      totalAmount: 24000_00,
      totalInstallments: 6,
      startDate: prevMonthDate,
      note: '降噪耳機與鍵盤升級',
      remainderStrategy: 'first',
    },
    generateId,
    now,
  );

  const transactions: Transaction[] = [
    {
      id: generateId(),
      type: 'income',
      amount: 68000_00,
      accountId: bankId,
      categoryId: 'cat-salary',
      transactionDate: currentEarlyDate,
      note: '本月薪資入帳',
      status: 'posted',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: generateId(),
      type: 'expense',
      amount: 16500_00,
      accountId: bankId,
      categoryId: 'cat-housing',
      transactionDate: currentEarlyDate,
      note: '套房月租',
      status: 'posted',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: generateId(),
      type: 'expense',
      amount: 320_00,
      accountId: cashId,
      categoryId: 'cat-food',
      transactionDate: asOfDate,
      note: '午間便當與手搖飲',
      status: 'posted',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: generateId(),
      type: 'expense',
      amount: 1280_00,
      accountId: ewalletId,
      categoryId: 'cat-transport',
      transactionDate: asOfDate,
      note: 'TPASS 月票儲值',
      status: 'posted',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: generateId(),
      type: 'expense',
      amount: 3850_00,
      accountId: cardMainId,
      categoryId: 'cat-food',
      transactionDate: prevMonthDate,
      note: '朋友聚餐代墊',
      status: 'posted',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: generateId(),
      type: 'expense',
      amount: 2450_00,
      accountId: cardMainId,
      categoryId: 'cat-entertainment',
      transactionDate: asOfDate,
      note: '週末電影與展覽門票',
      status: 'posted',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: generateId(),
      type: 'expense',
      amount: 4200_00,
      accountId: cardTravelId,
      categoryId: 'cat-shopping',
      transactionDate: currentEarlyDate,
      note: '冬季機能外套',
      status: 'posted',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: generateId(),
      type: 'transfer',
      amount: 5000_00,
      accountId: bankId,
      toAccountId: cashId,
      transactionDate: currentEarlyDate,
      note: 'ATM 提款補現金',
      status: 'posted',
      createdAt: now,
      updatedAt: now,
    },
    ...installment.transactions,
  ];

  const recurringRules: RecurringRule[] = [
    {
      id: generateId(),
      name: 'Netflix + Spotify 訂閱',
      type: 'expense',
      amount: 540_00,
      accountId: cardMainId,
      categoryId: 'cat-subscription',
      frequency: 'monthly',
      interval: 1,
      anchorDay: 1,
      startDate: lastMonthFirst,
      nextRunDate: nextMonthFirst,
      isActive: true,
      note: '每月自動扣款',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: generateId(),
      name: '每月薪資',
      type: 'income',
      amount: 68000_00,
      accountId: bankId,
      categoryId: 'cat-salary',
      frequency: 'monthly',
      interval: 1,
      anchorDay: 5,
      startDate: currentEarlyDate,
      nextRunDate: addMonthsWithAnchor(currentEarlyDate, 1, 5),
      isActive: true,
      note: '固定薪資',
      createdAt: now,
      updatedAt: now,
    },
  ];

  const budgets: Budget[] = [
    {
      id: generateId(),
      categoryId: null,
      amount: 35000_00,
      yearMonth: null,
      alertThresholdPercent: 80,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: generateId(),
      categoryId: 'cat-food',
      amount: 8000_00,
      yearMonth: null,
      alertThresholdPercent: 80,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: generateId(),
      categoryId: 'cat-shopping',
      amount: 9000_00,
      yearMonth: null,
      alertThresholdPercent: 80,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
  ];

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

      await database.categories.bulkAdd(
        DEFAULT_CATEGORIES.map((c) => ({ ...c, isArchived: false })),
      );
      await database.accounts.bulkAdd(accounts);
      await database.installmentPlans.add(installment.plan);
      await database.transactions.bulkAdd(transactions);
      await database.recurringRules.bulkAdd(recurringRules);
      await database.budgets.bulkAdd(budgets);
      await database.appMeta.put({ key: SEED_META_KEY, value: new Date().toISOString() });
    },
  );
}
