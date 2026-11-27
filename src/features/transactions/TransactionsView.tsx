import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { CategoryIcon } from '../../components/CategoryIcon';
import { toYearMonth } from '../../domain/date';
import { formatMinorToDisplay } from '../../domain/money';
import type { Transaction, TransactionType, YearMonth } from '../../domain/types';
import type { LedgerViewModel } from '../../hooks/useLedgerData';

interface TransactionsViewProps {
  data: LedgerViewModel;
  selectedYearMonth: YearMonth;
  onEditTransaction: (tx: Transaction) => void;
}

export function TransactionsView({
  data,
  selectedYearMonth,
  onEditTransaction,
}: TransactionsViewProps) {
  const [filterMonthOnly, setFilterMonthOnly] = useState(true);
  const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [includeVoid, setIncludeVoid] = useState(false);

  const accountMap = useMemo(
    () => new Map(data.accounts.map((a) => [a.id, a])),
    [data.accounts],
  );
  const categoryMap = useMemo(
    () => new Map(data.categories.map((c) => [c.id, c])),
    [data.categories],
  );

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return data.transactions.filter((tx) => {
      if (!includeVoid && tx.status === 'void') return false;
      if (filterMonthOnly && toYearMonth(tx.transactionDate) !== selectedYearMonth) {
        return false;
      }
      if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
      if (
        accountFilter !== 'all' &&
        tx.accountId !== accountFilter &&
        tx.toAccountId !== accountFilter
      ) {
        return false;
      }
      if (q) {
        const catName = tx.categoryId ? (categoryMap.get(tx.categoryId)?.name ?? '') : '';
        const accName = accountMap.get(tx.accountId)?.name ?? '';
        const haystack = `${tx.note} ${catName} ${accName}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [
    data.transactions,
    includeVoid,
    filterMonthOnly,
    selectedYearMonth,
    typeFilter,
    accountFilter,
    searchText,
    categoryMap,
    accountMap,
  ]);

  return (
    <div className="page-stack">
      <section className="card filter-bar">
        <div className="search-box">
          <Search size={16} />
          <input
            type="text"
            placeholder="搜尋備註、分類或帳戶..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
        <div className="filter-controls">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as 'all' | TransactionType)}
            className="select-input"
          >
            <option value="all">全部類型</option>
            <option value="expense">支出</option>
            <option value="income">收入</option>
            <option value="transfer">轉帳 / 繳卡費</option>
          </select>

          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className="select-input"
          >
            <option value="all">全部帳戶</option>
            {data.accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name}
              </option>
            ))}
          </select>

          <label className="checkbox-inline">
            <input
              type="checkbox"
              checked={filterMonthOnly}
              onChange={(e) => setFilterMonthOnly(e.target.checked)}
            />
            僅顯示 {selectedYearMonth}
          </label>

          <label className="checkbox-inline">
            <input
              type="checkbox"
              checked={includeVoid}
              onChange={(e) => setIncludeVoid(e.target.checked)}
            />
            含作廢紀錄
          </label>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <h3>交易明細（共 {filtered.length} 筆）</h3>
          <span className="muted-hint">點擊任一筆可編輯或作廢，餘額即時重算</span>
        </div>

        {filtered.length === 0 ? (
          <p className="empty-state">找不到符合條件的交易紀錄</p>
        ) : (
          <div className="tx-list">
            {filtered.map((tx) => {
              const cat = tx.categoryId ? categoryMap.get(tx.categoryId) : undefined;
              const acc = accountMap.get(tx.accountId);
              const toAcc = tx.toAccountId ? accountMap.get(tx.toAccountId) : undefined;
              return (
                <button
                  key={tx.id}
                  type="button"
                  className={`tx-row ${tx.status === 'void' ? 'is-void' : ''}`}
                  onClick={() => onEditTransaction(tx)}
                >
                  <div
                    className="tx-icon"
                    style={{
                      backgroundColor: cat?.color ? `${cat.color}20` : 'var(--surface-alt)',
                      color: cat?.color ?? 'var(--text-muted)',
                    }}
                  >
                    <CategoryIcon
                      name={tx.type === 'transfer' ? 'repeat' : (cat?.icon ?? 'more-horizontal')}
                      size={18}
                    />
                  </div>
                  <div className="tx-main">
                    <div className="tx-title">
                      <span>
                        {tx.type === 'transfer'
                          ? `${acc?.name ?? ''} → ${toAcc?.name ?? ''}`
                          : (cat?.name ?? '未分類')}
                      </span>
                      {tx.installmentPlanId && (
                        <span className="badge">
                          {tx.installmentIndex}/{tx.installmentTotal} 期
                        </span>
                      )}
                      {tx.recurringRuleId && <span className="badge muted">固定</span>}
                      {tx.status === 'void' && <span className="badge danger">已作廢</span>}
                    </div>
                    <div className="tx-sub">
                      {tx.transactionDate} · {acc?.name}
                      {tx.note ? ` · ${tx.note}` : ''}
                    </div>
                  </div>
                  <div
                    className={`tx-amount tabular-nums ${
                      tx.type === 'income'
                        ? 'positive'
                        : tx.type === 'expense'
                          ? 'negative'
                          : ''
                    }`}
                  >
                    {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}
                    {formatMinorToDisplay(tx.amount)}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
