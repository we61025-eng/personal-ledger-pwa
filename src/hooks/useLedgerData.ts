import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from '../db/database';
import { evaluateMonthlyBudgets, type BudgetProgress } from '../domain/budget';
import {
  calculateCreditCardSummary,
  type CreditCardStatementSummary,
} from '../domain/creditCardCycle';
import {
  calculateBalancesAndNetWorth,
  calculateMonthlyCashflow,
  type MonthlyCashflowSummary,
  type NetWorthSummary,
} from '../domain/ledger';
import type {
  Account,
  Budget,
  Category,
  ISODate,
  InstallmentPlan,
  RecurringRule,
  Transaction,
  YearMonth,
} from '../domain/types';

export interface LedgerViewModel {
  isLoading: boolean;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  installmentPlans: InstallmentPlan[];
  recurringRules: RecurringRule[];
  budgets: Budget[];
  netWorthSummary: NetWorthSummary;
  monthlyCashflow: MonthlyCashflowSummary;
  creditCardSummaries: Record<string, CreditCardStatementSummary>;
  budgetProgress: BudgetProgress[];
}

export function useLedgerData(
  selectedYearMonth: YearMonth,
  asOfDate: ISODate,
): LedgerViewModel {
  const accountsRaw = useLiveQuery(() => db.accounts.orderBy('sortOrder').toArray(), []);
  const categoriesRaw = useLiveQuery(() => db.categories.orderBy('sortOrder').toArray(), []);
  const transactionsRaw = useLiveQuery(
    () => db.transactions.orderBy('transactionDate').reverse().toArray(),
    [],
  );
  const installmentPlansRaw = useLiveQuery(() => db.installmentPlans.toArray(), []);
  const recurringRulesRaw = useLiveQuery(() => db.recurringRules.toArray(), []);
  const budgetsRaw = useLiveQuery(() => db.budgets.toArray(), []);

  const isLoading =
    accountsRaw === undefined ||
    categoriesRaw === undefined ||
    transactionsRaw === undefined ||
    installmentPlansRaw === undefined ||
    recurringRulesRaw === undefined ||
    budgetsRaw === undefined;

  const accounts = accountsRaw ?? [];
  const categories = categoriesRaw ?? [];
  const transactions = transactionsRaw ?? [];
  const installmentPlans = installmentPlansRaw ?? [];
  const recurringRules = recurringRulesRaw ?? [];
  const budgets = budgetsRaw ?? [];

  const netWorthSummary = useMemo(
    () => calculateBalancesAndNetWorth(accounts, transactions, asOfDate),
    [accounts, transactions, asOfDate],
  );

  const monthlyCashflow = useMemo(
    () => calculateMonthlyCashflow(transactions, selectedYearMonth),
    [transactions, selectedYearMonth],
  );

  const creditCardSummaries = useMemo(() => {
    const map: Record<string, CreditCardStatementSummary> = {};
    for (const acc of accounts) {
      if (acc.type === 'credit_card' && acc.creditCardConfig) {
        map[acc.id] = calculateCreditCardSummary(acc, transactions, asOfDate);
      }
    }
    return map;
  }, [accounts, transactions, asOfDate]);

  const budgetProgress = useMemo(
    () => evaluateMonthlyBudgets(budgets, transactions, selectedYearMonth),
    [budgets, transactions, selectedYearMonth],
  );

  return {
    isLoading,
    accounts,
    categories,
    transactions,
    installmentPlans,
    recurringRules,
    budgets,
    netWorthSummary,
    monthlyCashflow,
    creditCardSummaries,
    budgetProgress,
  };
}
