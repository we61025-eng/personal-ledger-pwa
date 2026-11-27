/** 以最小貨幣單位表示的整數金額（例如 scale=100 時，10000 代表 100.00 元） */
export type MinorUnits = number;

/** 本地日曆日期格式：YYYY-MM-DD */
export type ISODate = string;

/** 年月格式：YYYY-MM */
export type YearMonth = string;

export type AccountType = 'cash' | 'bank' | 'ewallet' | 'credit_card';

export interface CreditCardConfig {
  /** 每月結帳日（1-31）；若當月天數不足則自動對齊月底（如 31 號在 2 月為 28/29 號） */
  statementDay: number;
  /** 每月繳款截止日（1-31） */
  paymentDueDay: number;
  /**
   * 繳款日相對於結帳日的月份偏移量：
   * - 0: 同月繳款（例如 5 號結帳、25 號繳款）
   * - 1: 次月繳款（例如 15 號結帳、次月 3 號繳款）
   */
  paymentDueMonthOffset: 0 | 1;
  /** 信用額度（選填，MinorUnits） */
  creditLimit?: MinorUnits;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  /** 開帳初始餘額；信用卡若開帳時已有未繳餘額則填負數 */
  initialBalance: MinorUnits;
  creditCardConfig?: CreditCardConfig;
  isArchived: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface Category {
  id: string;
  name: string;
  type: 'expense' | 'income';
  icon: string;
  color: string;
  isArchived: boolean;
  sortOrder: number;
}

export type TransactionType = 'expense' | 'income' | 'transfer';
export type TransactionStatus = 'posted' | 'void';

export interface Transaction {
  id: string;
  type: TransactionType;
  /** 恆為正整數 (> 0) */
  amount: MinorUnits;
  /** 支出/轉出的來源帳戶，或收入的目標帳戶 */
  accountId: string;
  /** 僅 type === 'transfer' 時有值 */
  toAccountId?: string;
  /** 僅 type !== 'transfer' 時有值 */
  categoryId?: string;
  transactionDate: ISODate;
  note: string;
  status: TransactionStatus;

  // --- 分期付款關聯欄位 ---
  installmentPlanId?: string;
  /** 第幾期（1-based） */
  installmentIndex?: number;
  /** 總期數 */
  installmentTotal?: number;
  /** 若使用者手動微調過單期金額，標記為 true */
  isInstallmentManuallyEdited?: boolean;

  // --- 週期性帳務關聯欄位 ---
  recurringRuleId?: string;
  /** 該筆交易對應的「應發生日期」，作為冪等唯一鍵防止重複補發 */
  recurringOccurrenceDate?: ISODate;

  createdAt: number;
  updatedAt: number;
}

export interface InstallmentPlan {
  id: string;
  accountId: string;
  categoryId: string;
  totalAmount: MinorUnits;
  totalInstallments: number;
  startDate: ISODate;
  note: string;
  remainderStrategy: 'first' | 'last';
  status: 'active' | 'cancelled';
  createdAt: number;
  updatedAt: number;
}

export type RecurringFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface RecurringRule {
  id: string;
  name: string;
  type: TransactionType;
  amount: MinorUnits;
  accountId: string;
  toAccountId?: string;
  categoryId?: string;
  frequency: RecurringFrequency;
  interval: number;
  /** frequency 為 monthly / yearly 時的基準日（1-31） */
  anchorDay?: number;
  /** frequency 為 weekly 時的星期幾（0=週日 .. 6=週六） */
  dayOfWeek?: number;
  startDate: ISODate;
  endDate?: ISODate;
  /** 下一次應產生交易的日期 */
  nextRunDate: ISODate;
  isActive: boolean;
  note: string;
  createdAt: number;
  updatedAt: number;
}

export interface Budget {
  id: string;
  /** null 代表「全月總支出預算」；有值代表指定分類預算 */
  categoryId: string | null;
  amount: MinorUnits;
  /** null 代表預設每月套用；指定 'YYYY-MM' 代表該月覆寫預算 */
  yearMonth: YearMonth | null;
  /** 警示門檻百分比（例如 80 代表達 80% 顯示警告） */
  alertThresholdPercent: number;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AppMeta {
  key: string;
  value: string;
}
