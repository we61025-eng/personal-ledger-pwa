import { AlertTriangle, ArrowRight, CreditCard, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { CategoryIcon } from '../../components/CategoryIcon';
import { db } from '../../db/database';
import { loadDemoPortfolioData } from '../../db/seed';
import { diffDays } from '../../domain/date';
import { formatMinorToDisplay } from '../../domain/money';
import type { ISODate, Transaction } from '../../domain/types';
import type { LedgerViewModel } from '../../hooks/useLedgerData';
import type { QuickEntryPrefill } from '../quickEntry/QuickEntryModal';

interface DashboardViewProps {
  data: LedgerViewModel;
  today: ISODate;
  onOpenQuickEntry: (prefill?: QuickEntryPrefill) => void;
  onEditTransaction: (tx: Transaction) => void;
  onNavigate: (tab: 'transactions' | 'accounts' | 'settings') => void;
  onNotify: (msg: string) => void;
}

export function DashboardView({
  data,
  today,
  onOpenQuickEntry,
  onEditTransaction,
  onNavigate,
  onNotify,
}: DashboardViewProps) {
  const {
    accounts,
    categories,
    transactions,
    netWorthSummary,
    monthlyCashflow,
    creditCardSummaries,
    budgetProgress,
  } = data;

  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const accountMap = new Map(accounts.map((a) => [a.id, a]));

  const creditCards = accounts.filter(
    (a) => !a.isArchived && a.type === 'credit_card',
  );

  const recentTransactions = transactions
    .filter((t) => t.status === 'posted' && t.transactionDate <= today)
    .slice(0, 7);

  // 圓餅圖資料
  const expenseEntries = Object.entries(monthlyCashflow.expenseByCategory)
    .map(([catId, amount]) => ({
      catId,
      amount,
      cat: categoryMap.get(catId),
    }))
    .sort((a, b) => b.amount - a.amount);

  const totalExpense = monthlyCashflow.totalExpense;
  let cumulativeAngle = 0;
  const donutSegments = expenseEntries.map((item) => {
    const ratio = totalExpense > 0 ? item.amount / totalExpense : 0;
    const startAngle = cumulativeAngle;
    cumulativeAngle += ratio * 360;
    return {
      ...item,
      ratio,
      startAngle,
      endAngle: cumulativeAngle,
      color: item.cat?.color ?? '#64748b',
      name: item.cat?.name ?? '未分類',
    };
  });

  const handleLoadDemo = async () => {
    await loadDemoPortfolioData(db, today);
    onNotify('已載入作品集示範帳本（含多帳戶、信用卡分期與預算警示）');
  };

  return (
    <div className="dashboard-grid">
      {/* 首次無交易時顯示示範資料引導 */}
      {transactions.length === 0 && (
        <section className="card demo-banner span-full">
          <div>
            <h3>歡迎使用個人多帳戶記帳本</h3>
            <p>
              目前尚未有任何交易紀錄。你可以立即點擊「新增記帳」，或一鍵載入包含信用卡分期、週期扣款與預算警示的示範資料體驗完整功能。
            </p>
          </div>
          <button type="button" className="btn-secondary" onClick={handleLoadDemo}>
            <Sparkles size={16} /> 載入示範帳本資料
          </button>
        </section>
      )}

      {/* 淨資產 Hero 卡 */}
      <section className="card hero-card">
        <div className="hero-top">
          <span className="muted-label">總淨資產（截至 {today}）</span>
          <span className="pill-neutral">本機 IndexedDB</span>
        </div>
        <div className="hero-amount tabular-nums">
          {formatMinorToDisplay(netWorthSummary.netWorth)}
        </div>
        <div className="hero-metrics">
          <div className="metric-item">
            <span className="muted-label">總資產</span>
            <strong className="positive tabular-nums">
              {formatMinorToDisplay(netWorthSummary.totalAssets)}
            </strong>
          </div>
          <div className="metric-item">
            <span className="muted-label">總負債（卡費）</span>
            <strong className="negative tabular-nums">
              {formatMinorToDisplay(netWorthSummary.totalLiabilities)}
            </strong>
          </div>
        </div>
      </section>

      {/* 本月收支總覽 */}
      <section className="card cashflow-card">
        <div className="card-header">
          <h3>{monthlyCashflow.yearMonth} 收支結算</h3>
          <span className="muted-hint">已自動排除轉帳與繳卡費</span>
        </div>
        <div className="cashflow-rows">
          <div className="cashflow-stat">
            <span className="inline-icon positive">
              <TrendingUp size={16} /> 總收入
            </span>
            <strong className="tabular-nums">
              {formatMinorToDisplay(monthlyCashflow.totalIncome)}
            </strong>
          </div>
          <div className="cashflow-stat">
            <span className="inline-icon negative">
              <TrendingDown size={16} /> 總支出
            </span>
            <strong className="tabular-nums">
              {formatMinorToDisplay(monthlyCashflow.totalExpense)}
            </strong>
          </div>
          <div className="cashflow-divider" />
          <div className="cashflow-stat">
            <span>本月淨結餘</span>
            <strong
              className={`tabular-nums ${
                monthlyCashflow.netSavings >= 0 ? 'positive' : 'negative'
              }`}
            >
              {formatMinorToDisplay(monthlyCashflow.netSavings)}
            </strong>
          </div>
        </div>
      </section>

      {/* 支出分類佔比（SVG 環圖） */}
      <section className="card chart-card">
        <div className="card-header">
          <h3>支出分類佔比</h3>
          <span className="muted-hint">{monthlyCashflow.yearMonth}</span>
        </div>
        {totalExpense === 0 ? (
          <p className="empty-state">本月尚無支出紀錄</p>
        ) : (
          <div className="donut-layout">
            <svg viewBox="0 0 120 120" className="donut-svg" aria-label="支出分類圓餅圖">
              <circle cx="60" cy="60" r="44" fill="none" stroke="var(--border)" strokeWidth="16" />
              {donutSegments.map((seg) => {
                const circumference = 2 * Math.PI * 44;
                const dash = seg.ratio * circumference;
                const offset = -(seg.startAngle / 360) * circumference;
                return (
                  <circle
                    key={seg.catId}
                    cx="60"
                    cy="60"
                    r="44"
                    fill="none"
                    stroke={seg.color}
                    strokeWidth="16"
                    strokeDasharray={`${dash} ${circumference}`}
                    strokeDashoffset={offset}
                    transform="rotate(-90 60 60)"
                  />
                );
              })}
            </svg>
            <ul className="legend-list">
              {donutSegments.slice(0, 5).map((seg) => (
                <li key={seg.catId} className="legend-item">
                  <span
                    className="legend-swatch"
                    style={{ backgroundColor: seg.color }}
                  />
                  <span className="legend-name">{seg.name}</span>
                  <span className="legend-pct tabular-nums">
                    {Math.round(seg.ratio * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* 信用卡帳期雷達 */}
      <section className="card">
        <div className="card-header">
          <h3 className="inline-icon">
            <CreditCard size={18} /> 信用卡帳單提醒
          </h3>
          <button
            type="button"
            className="btn-link"
            onClick={() => onNavigate('accounts')}
          >
            管理帳戶 <ArrowRight size={14} />
          </button>
        </div>
        {creditCards.length === 0 ? (
          <p className="empty-state">尚未建立信用卡帳戶</p>
        ) : (
          <div className="stack-list">
            {creditCards.map((card) => {
              const summary = creditCardSummaries[card.id];
              if (!summary) return null;
              const daysUntilDue = diffDays(today, summary.latestClosedPeriod.dueDate);
              return (
                <div key={card.id} className="cc-mini-row">
                  <div>
                    <div className="cc-title-row">
                      <strong>{card.name}</strong>
                      <span className={`status-pill ${summary.status}`}>
                        {summary.status === 'overdue'
                          ? '已逾期'
                          : summary.status === 'open_due'
                            ? `剩 ${daysUntilDue} 天繳款`
                            : summary.status === 'paid'
                              ? '已繳清'
                              : '累積未出帳'}
                      </span>
                    </div>
                    <div className="muted-hint tabular-nums">
                      已出帳應繳：{formatMinorToDisplay(summary.remainingStatementDue)} · 未出帳：
                      {formatMinorToDisplay(summary.unbilledSpending)}
                    </div>
                  </div>
                  {summary.remainingStatementDue > 0 && (
                    <button
                      type="button"
                      className="btn-secondary-sm"
                      onClick={() =>
                        onOpenQuickEntry({
                          type: 'transfer',
                          toAccountId: card.id,
                          amountMinor: summary.remainingStatementDue,
                          note: `繳 ${card.name} ${summary.latestClosedPeriod.statementMonth} 帳單`,
                        })
                      }
                    >
                      一鍵繳卡費
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 本月預算進度 */}
      <section className="card">
        <div className="card-header">
          <h3>本月預算控管</h3>
          <button
            type="button"
            className="btn-link"
            onClick={() => onNavigate('settings')}
          >
            設定預算 <ArrowRight size={14} />
          </button>
        </div>
        {budgetProgress.length === 0 ? (
          <p className="empty-state">尚未設定預算規則</p>
        ) : (
          <div className="stack-list">
            {budgetProgress.map((bp) => {
              const label =
                bp.categoryId === null
                  ? '全月總支出預算'
                  : (categoryMap.get(bp.categoryId)?.name ?? '分類預算');
              return (
                <div key={bp.budgetId} className="budget-item">
                  <div className="budget-top">
                    <span className="inline-icon">
                      {bp.alertLevel !== 'ok' && <AlertTriangle size={14} />}
                      {label}
                    </span>
                    <span className="tabular-nums">
                      {formatMinorToDisplay(bp.spentAmount)} /{' '}
                      {formatMinorToDisplay(bp.limitAmount)} ({bp.usagePercent}%)
                    </span>
                  </div>
                  <div className="progress-track">
                    <div
                      className={`progress-fill ${bp.alertLevel}`}
                      style={{ width: `${Math.min(100, bp.usagePercent)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 近期交易 */}
      <section className="card span-full">
        <div className="card-header">
          <h3>近期有效帳務</h3>
          <button
            type="button"
            className="btn-link"
            onClick={() => onNavigate('transactions')}
          >
            查看全部 <ArrowRight size={14} />
          </button>
        </div>
        {recentTransactions.length === 0 ? (
          <p className="empty-state">目前沒有帳務紀錄，點擊「+ 新增記帳」開始第一筆吧！</p>
        ) : (
          <div className="tx-list">
            {recentTransactions.map((tx) => {
              const cat = tx.categoryId ? categoryMap.get(tx.categoryId) : undefined;
              const acc = accountMap.get(tx.accountId);
              const toAcc = tx.toAccountId ? accountMap.get(tx.toAccountId) : undefined;
              return (
                <button
                  key={tx.id}
                  type="button"
                  className="tx-row"
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
                          ? `轉帳：${acc?.name ?? ''} → ${toAcc?.name ?? ''}`
                          : (cat?.name ?? '未分類')}
                      </span>
                      {tx.installmentPlanId && (
                        <span className="badge">
                          {tx.installmentIndex}/{tx.installmentTotal} 期
                        </span>
                      )}
                      {tx.recurringRuleId && <span className="badge muted">固定</span>}
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
