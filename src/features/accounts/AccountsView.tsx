import { useState } from 'react';
import { Archive, CreditCard, Plus, RotateCcw, X } from 'lucide-react';
import { CategoryIcon, getAccountIconName } from '../../components/CategoryIcon';
import {
  DEFAULT_CURRENCY_SCALE,
  formatMinorToDisplay,
  parseInputToMinor,
} from '../../domain/money';
import type { Account, AccountType, ISODate } from '../../domain/types';
import type { LedgerViewModel } from '../../hooks/useLedgerData';
import {
  cancelInstallmentPurchase,
  saveAccount,
  setAccountArchived,
} from '../../services/ledgerService';
import type { QuickEntryPrefill } from '../quickEntry/QuickEntryModal';

interface AccountsViewProps {
  data: LedgerViewModel;
  today: ISODate;
  onOpenQuickEntry: (prefill?: QuickEntryPrefill) => void;
  onNotify: (msg: string) => void;
}

export function AccountsView({
  data,
  today,
  onOpenQuickEntry,
  onNotify,
}: AccountsViewProps) {
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('bank');
  const [initialBalanceInput, setInitialBalanceInput] = useState('0');
  const [statementDay, setStatementDay] = useState(15);
  const [paymentDueDay, setPaymentDueDay] = useState(3);
  const [paymentDueOffset, setPaymentDueOffset] = useState<0 | 1>(1);
  const [creditLimitInput, setCreditLimitInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const openCreateModal = () => {
    setEditingAccount(null);
    setName('');
    setType('bank');
    setInitialBalanceInput('0');
    setStatementDay(15);
    setPaymentDueDay(3);
    setPaymentDueOffset(1);
    setCreditLimitInput('');
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (acc: Account) => {
    setEditingAccount(acc);
    setName(acc.name);
    setType(acc.type);
    setInitialBalanceInput(String(acc.initialBalance / DEFAULT_CURRENCY_SCALE));
    if (acc.creditCardConfig) {
      setStatementDay(acc.creditCardConfig.statementDay);
      setPaymentDueDay(acc.creditCardConfig.paymentDueDay);
      setPaymentDueOffset(acc.creditCardConfig.paymentDueMonthOffset);
      setCreditLimitInput(
        acc.creditCardConfig.creditLimit !== undefined
          ? String(acc.creditCardConfig.creditLimit / DEFAULT_CURRENCY_SCALE)
          : '',
      );
    }
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      const initialBalance = parseInputToMinor(initialBalanceInput || '0');
      const creditLimit = creditLimitInput.trim()
        ? parseInputToMinor(creditLimitInput)
        : undefined;

      await saveAccount({
        id: editingAccount?.id,
        name,
        type,
        initialBalance,
        creditCardConfig:
          type === 'credit_card'
            ? {
                statementDay,
                paymentDueDay,
                paymentDueMonthOffset: paymentDueOffset,
                creditLimit,
              }
            : undefined,
      });
      onNotify(editingAccount ? '已更新帳戶設定' : '已新增帳戶');
      setIsModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '儲存失敗');
    }
  };

  const assetAccounts = data.accounts.filter(
    (a) => !a.isArchived && a.type !== 'credit_card',
  );
  const creditCards = data.accounts.filter(
    (a) => !a.isArchived && a.type === 'credit_card',
  );
  const archivedAccounts = data.accounts.filter((a) => a.isArchived);

  return (
    <div className="page-stack">
      <div className="page-actions-header">
        <div>
          <h2>帳戶與信用卡週期管理</h2>
          <p className="muted-hint">
            現金、銀行與電子支付餘額即時連動；信用卡依結帳日自動區分已出帳、未出帳與未來分期
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={openCreateModal}>
          <Plus size={18} /> 新增帳戶
        </button>
      </div>

      {/* 資產帳戶 */}
      <section className="card">
        <div className="card-header">
          <h3>資產帳戶（現金 / 銀行 / 電子支付）</h3>
        </div>
        <div className="accounts-grid">
          {assetAccounts.map((acc) => {
            const bal = data.netWorthSummary.byAccountId[acc.id]?.postedBalance ?? 0;
            return (
              <div key={acc.id} className="account-tile">
                <div className="account-tile-top">
                  <span className="inline-icon">
                    <CategoryIcon name={getAccountIconName(acc.type)} size={18} />
                    <strong>{acc.name}</strong>
                  </span>
                  <div className="tile-actions">
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => openEditModal(acc)}
                    >
                      編輯
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      title="封存帳戶"
                      onClick={() => setAccountArchived(acc.id, true)}
                    >
                      <Archive size={15} />
                    </button>
                  </div>
                </div>
                <div className="account-balance tabular-nums">
                  {formatMinorToDisplay(bal)}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 信用卡專區 */}
      <section className="card">
        <div className="card-header">
          <h3 className="inline-icon">
            <CreditCard size={18} /> 信用卡帳單與分期詳情
          </h3>
        </div>
        {creditCards.length === 0 ? (
          <p className="empty-state">尚未建立信用卡帳戶，點擊上方「新增帳戶」即可設定結帳日與繳款日</p>
        ) : (
          <div className="cc-cards-stack">
            {creditCards.map((card) => {
              const summary = data.creditCardSummaries[card.id];
              const plans = data.installmentPlans.filter(
                (p) => p.accountId === card.id && p.status === 'active',
              );

              return (
                <div key={card.id} className="cc-detail-panel">
                  <div className="cc-detail-header">
                    <div>
                      <div className="cc-title-row">
                        <h4>{card.name}</h4>
                        {summary && (
                          <span className={`status-pill ${summary.status}`}>
                            {summary.status === 'overdue'
                              ? '已逾期'
                              : summary.status === 'open_due'
                                ? '待繳款'
                                : summary.status === 'paid'
                                  ? '已繳清'
                                  : '未出帳'}
                          </span>
                        )}
                      </div>
                      <p className="muted-hint">
                        每月 {card.creditCardConfig?.statementDay} 號結帳 ·{' '}
                        {card.creditCardConfig?.paymentDueMonthOffset === 1 ? '次月' : '同月'}{' '}
                        {card.creditCardConfig?.paymentDueDay} 號繳款
                      </p>
                    </div>
                    <div className="tile-actions">
                      {summary && summary.remainingStatementDue > 0 && (
                        <button
                          type="button"
                          className="btn-primary-sm"
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
                      <button
                        type="button"
                        className="btn-secondary-sm"
                        onClick={() => openEditModal(card)}
                      >
                        編輯
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        title="封存"
                        onClick={() => setAccountArchived(card.id, true)}
                      >
                        <Archive size={15} />
                      </button>
                    </div>
                  </div>

                  {summary && (
                    <div className="cc-metrics-grid">
                      <div className="cc-metric">
                        <span className="muted-label">
                          已出帳剩餘應繳（{summary.latestClosedPeriod.statementMonth}）
                        </span>
                        <strong className="tabular-nums negative">
                          {formatMinorToDisplay(summary.remainingStatementDue)}
                        </strong>
                        <small className="muted-hint">
                          繳款截止 {summary.latestClosedPeriod.dueDate}
                        </small>
                      </div>
                      <div className="cc-metric">
                        <span className="muted-label">
                          當期未出帳（{summary.currentOpenPeriod.statementMonth}）
                        </span>
                        <strong className="tabular-nums">
                          {formatMinorToDisplay(summary.unbilledSpending)}
                        </strong>
                        <small className="muted-hint">
                          結帳日 {summary.currentOpenPeriod.periodEnd}
                        </small>
                      </div>
                      <div className="cc-metric">
                        <span className="muted-label">未來未到期分期</span>
                        <strong className="tabular-nums">
                          {formatMinorToDisplay(summary.futureInstallmentTotal)}
                        </strong>
                        <small className="muted-hint">下期起陸續入帳</small>
                      </div>
                      <div className="cc-metric">
                        <span className="muted-label">可用信用額度</span>
                        <strong className="tabular-nums positive">
                          {summary.availableCredit !== undefined
                            ? formatMinorToDisplay(summary.availableCredit)
                            : '未設定額度'}
                        </strong>
                        {card.creditCardConfig?.creditLimit && (
                          <small className="muted-hint">
                            總額度 {formatMinorToDisplay(card.creditCardConfig.creditLimit)}
                          </small>
                        )}
                      </div>
                    </div>
                  )}

                  {plans.length > 0 && (
                    <div className="cc-plans">
                      <h5>進行中分期計劃</h5>
                      {plans.map((plan) => {
                        const children = data.transactions.filter(
                          (t) => t.installmentPlanId === plan.id && t.status === 'posted',
                        );
                        const postedCount = children.filter(
                          (t) => t.transactionDate <= today,
                        ).length;
                        return (
                          <div key={plan.id} className="plan-row">
                            <span>
                              {plan.note || '分期消費'} · 總額{' '}
                              {formatMinorToDisplay(plan.totalAmount)}（已入帳 {postedCount}/
                              {plan.totalInstallments} 期）
                            </span>
                            <button
                              type="button"
                              className="btn-link danger"
                              onClick={async () => {
                                const res = await cancelInstallmentPurchase(plan.id, today);
                                onNotify(
                                  `已取消該分期剩餘 ${res.voidTransactionIds.length} 期`,
                                );
                              }}
                            >
                              取消未來期數
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {archivedAccounts.length > 0 && (
        <section className="card">
          <div className="card-header">
            <h3>已封存帳戶（保留歷史交易）</h3>
          </div>
          <div className="stack-list">
            {archivedAccounts.map((acc) => (
              <div key={acc.id} className="plan-row">
                <span>{acc.name}</span>
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => setAccountArchived(acc.id, false)}
                >
                  <RotateCcw size={14} /> 恢復啟用
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {isModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="card-header">
              <h3>{editingAccount ? '編輯帳戶' : '新增帳戶'}</h3>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setIsModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSave} className="stack-form">
              <label className="field-label">
                帳戶名稱
                <input
                  type="text"
                  className="text-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：國泰世華銀行、台新黑狗卡"
                  required
                />
              </label>

              <div className="form-row">
                <label className="field-label">
                  帳戶類型
                  <select
                    className="select-input"
                    value={type}
                    onChange={(e) => setType(e.target.value as AccountType)}
                    disabled={Boolean(editingAccount)}
                  >
                    <option value="cash">現金</option>
                    <option value="bank">銀行帳戶</option>
                    <option value="ewallet">電子支付</option>
                    <option value="credit_card">信用卡</option>
                  </select>
                </label>

                <label className="field-label">
                  開帳初始餘額（信用卡欠款請填負數）
                  <input
                    type="text"
                    className="text-input"
                    value={initialBalanceInput}
                    onChange={(e) => setInitialBalanceInput(e.target.value)}
                  />
                </label>
              </div>

              {type === 'credit_card' && (
                <div className="installment-box">
                  <div className="form-row">
                    <label className="field-label">
                      每月結帳日 (1-31)
                      <input
                        type="number"
                        min={1}
                        max={31}
                        className="text-input"
                        value={statementDay}
                        onChange={(e) => setStatementDay(Number(e.target.value))}
                      />
                    </label>
                    <label className="field-label">
                      每月繳款日 (1-31)
                      <input
                        type="number"
                        min={1}
                        max={31}
                        className="text-input"
                        value={paymentDueDay}
                        onChange={(e) => setPaymentDueDay(Number(e.target.value))}
                      />
                    </label>
                  </div>
                  <div className="form-row">
                    <label className="field-label">
                      繳款月份
                      <select
                        className="select-input"
                        value={paymentDueOffset}
                        onChange={(e) =>
                          setPaymentDueOffset(Number(e.target.value) as 0 | 1)
                        }
                      >
                        <option value={1}>次月繳款</option>
                        <option value={0}>同月繳款</option>
                      </select>
                    </label>
                    <label className="field-label">
                      信用額度（選填）
                      <input
                        type="text"
                        className="text-input"
                        value={creditLimitInput}
                        onChange={(e) => setCreditLimitInput(e.target.value)}
                        placeholder="例如：100000"
                      />
                    </label>
                  </div>
                </div>
              )}

              {formError && <p className="error-text">{formError}</p>}

              <button type="submit" className="btn-primary">
                儲存帳戶
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
