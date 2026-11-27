import { useEffect, useMemo, useState } from 'react';
import { Calendar, Check, Delete, Layers, X } from 'lucide-react';
import { CategoryIcon } from '../../components/CategoryIcon';
import { addMonthsWithAnchor } from '../../domain/date';
import {
  DEFAULT_CURRENCY_SCALE,
  formatMinorToDisplay,
  parseInputToMinor,
  splitInstallmentAmounts,
} from '../../domain/money';
import type {
  Account,
  Category,
  ISODate,
  MinorUnits,
  Transaction,
  TransactionType,
} from '../../domain/types';
import {
  cancelInstallmentPurchase,
  createInstallmentPurchase,
  createTransaction,
  updateTransaction,
  voidTransaction,
} from '../../services/ledgerService';
import { evaluateSimpleExpression } from '../../utils/calcExpression';

const LAST_ACCOUNT_KEY = 'ledger_last_account_id';

export interface QuickEntryPrefill {
  type?: TransactionType;
  accountId?: string;
  toAccountId?: string;
  amountMinor?: MinorUnits;
  note?: string;
}

interface QuickEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: Account[];
  categories: Category[];
  today: ISODate;
  editingTransaction?: Transaction | null;
  prefill?: QuickEntryPrefill | null;
  onNotify: (message: string) => void;
}

const KEYPAD_BUTTONS = [
  '7', '8', '9', 'DEL',
  '4', '5', '6', '+',
  '1', '2', '3', '-',
  'AC', '0', '.', '=',
] as const;

export function QuickEntryModal({
  isOpen,
  onClose,
  accounts,
  categories,
  today,
  editingTransaction,
  prefill,
  onNotify,
}: QuickEntryModalProps) {
  const activeAccounts = useMemo(
    () => accounts.filter((a) => !a.isArchived),
    [accounts],
  );
  const activeCategories = useMemo(
    () => categories.filter((c) => !c.isArchived),
    [categories],
  );

  const [type, setType] = useState<TransactionType>('expense');
  const [amountExpr, setAmountExpr] = useState('');
  const [accountId, setAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [transactionDate, setTransactionDate] = useState<ISODate>(today);
  const [note, setNote] = useState('');

  // 分期設定（僅限新增信用卡支出）
  const [isInstallment, setIsInstallment] = useState(false);
  const [installments, setInstallments] = useState(3);
  const [remainderStrategy, setRemainderStrategy] = useState<'first' | 'last'>('first');

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setSubmitting(false);

    if (editingTransaction) {
      setType(editingTransaction.type);
      const major = editingTransaction.amount / DEFAULT_CURRENCY_SCALE;
      setAmountExpr(String(major));
      setAccountId(editingTransaction.accountId);
      setToAccountId(editingTransaction.toAccountId ?? '');
      setCategoryId(editingTransaction.categoryId ?? '');
      setTransactionDate(editingTransaction.transactionDate);
      setNote(editingTransaction.note);
      setIsInstallment(false);
      return;
    }

    const nextType = prefill?.type ?? 'expense';
    setType(nextType);
    setAmountExpr(
      prefill?.amountMinor
        ? String(prefill.amountMinor / DEFAULT_CURRENCY_SCALE)
        : '',
    );

    const savedAccId = localStorage.getItem(LAST_ACCOUNT_KEY);
    const defaultSource =
      prefill?.accountId ??
      (activeAccounts.some((a) => a.id === savedAccId)
        ? savedAccId!
        : (activeAccounts.find((a) => a.type !== 'credit_card')?.id ??
          activeAccounts[0]?.id ??
          ''));
    setAccountId(defaultSource);

    const defaultDest =
      prefill?.toAccountId ??
      (activeAccounts.find((a) => a.id !== defaultSource)?.id ?? '');
    setToAccountId(defaultDest);

    const matchingCats = activeCategories.filter(
      (c) => c.type === (nextType === 'income' ? 'income' : 'expense'),
    );
    setCategoryId(matchingCats[0]?.id ?? '');
    setTransactionDate(today);
    setNote(prefill?.note ?? '');
    setIsInstallment(false);
    setInstallments(3);
  }, [isOpen, editingTransaction, prefill, activeAccounts, activeCategories, today]);

  useEffect(() => {
    if (type === 'transfer') {
      setIsInstallment(false);
      return;
    }
    const matching = activeCategories.filter((c) => c.type === type);
    if (!matching.some((c) => c.id === categoryId)) {
      setCategoryId(matching[0]?.id ?? '');
    }
  }, [type, activeCategories, categoryId]);

  const selectedAccount = useMemo(
    () => activeAccounts.find((a) => a.id === accountId),
    [activeAccounts, accountId],
  );
  const canUseInstallment =
    !editingTransaction &&
    type === 'expense' &&
    selectedAccount?.type === 'credit_card';

  useEffect(() => {
    if (!canUseInstallment) setIsInstallment(false);
  }, [canUseInstallment]);

  const resolvedMinorAmount = useMemo(() => {
    const evaluated = evaluateSimpleExpression(amountExpr);
    if (!evaluated) return null;
    try {
      const minor = parseInputToMinor(evaluated);
      return minor > 0 ? minor : null;
    } catch {
      return null;
    }
  }, [amountExpr]);

  const installmentPreview = useMemo(() => {
    if (!isInstallment || !resolvedMinorAmount || installments < 2) return null;
    try {
      const parts = splitInstallmentAmounts(
        resolvedMinorAmount,
        installments,
        remainderStrategy,
      );
      const lastDate = addMonthsWithAnchor(transactionDate, installments - 1);
      return {
        firstAmount: parts[0],
        regularAmount: parts[1],
        lastAmount: parts[parts.length - 1],
        lastDate,
      };
    } catch {
      return null;
    }
  }, [isInstallment, resolvedMinorAmount, installments, remainderStrategy, transactionDate]);

  if (!isOpen) return null;

  const filteredCategories =
    type === 'transfer'
      ? []
      : activeCategories.filter((c) => c.type === type);

  const handleKeypad = (key: string) => {
    setError(null);
    if (key === 'AC') {
      setAmountExpr('');
      return;
    }
    if (key === 'DEL') {
      setAmountExpr((prev) => prev.slice(0, -1));
      return;
    }
    if (key === '=') {
      const result = evaluateSimpleExpression(amountExpr);
      if (result !== null) setAmountExpr(result === '0' ? '' : result);
      return;
    }
    setAmountExpr((prev) => {
      if ((key === '+' || key === '-') && (prev === '' || /[+-]$/.test(prev))) {
        return prev;
      }
      if (key === '.') {
        const lastSegment = prev.split(/[+-]/).pop() ?? '';
        if (lastSegment.includes('.')) return prev;
        return prev === '' || /[+-]$/.test(prev) ? `${prev}0.` : `${prev}.`;
      }
      return `${prev}${key}`;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!resolvedMinorAmount) {
      setError('請輸入大於 0 的有效金額');
      return;
    }
    if (!accountId) {
      setError('請選擇帳戶');
      return;
    }
    if (type === 'transfer') {
      if (!toAccountId || toAccountId === accountId) {
        setError('轉帳的轉出與轉入帳戶不可相同');
        return;
      }
    } else if (!categoryId) {
      setError('請選擇分類');
      return;
    }

    setSubmitting(true);
    try {
      if (editingTransaction) {
        await updateTransaction(editingTransaction.id, {
          type,
          amount: resolvedMinorAmount,
          accountId,
          toAccountId: type === 'transfer' ? toAccountId : undefined,
          categoryId: type === 'transfer' ? undefined : categoryId,
          transactionDate,
          note,
        });
        onNotify('已更新帳務紀錄');
      } else if (isInstallment && canUseInstallment) {
        await createInstallmentPurchase({
          accountId,
          categoryId,
          totalAmount: resolvedMinorAmount,
          totalInstallments: installments,
          startDate: transactionDate,
          note,
          remainderStrategy,
        });
        localStorage.setItem(LAST_ACCOUNT_KEY, accountId);
        onNotify(`已建立 ${installments} 期信用卡分期`);
      } else {
        await createTransaction({
          type,
          amount: resolvedMinorAmount,
          accountId,
          toAccountId: type === 'transfer' ? toAccountId : undefined,
          categoryId: type === 'transfer' ? undefined : categoryId,
          transactionDate,
          note,
        });
        localStorage.setItem(LAST_ACCOUNT_KEY, accountId);
        onNotify('已記下一筆帳務');
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoid = async () => {
    if (!editingTransaction) return;
    setSubmitting(true);
    try {
      await voidTransaction(editingTransaction.id);
      onNotify('已作廢該筆帳務');
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelFutureInstallments = async () => {
    if (!editingTransaction?.installmentPlanId) return;
    setSubmitting(true);
    try {
      const res = await cancelInstallmentPurchase(
        editingTransaction.installmentPlanId,
        today,
      );
      onNotify(`已取消 ${res.voidTransactionIds.length} 筆未來分期`);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="quick-entry-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={editingTransaction ? '編輯帳務' : '快速記帳'}
      >
        <div className="sheet-header">
          <div className="type-tabs" role="tablist">
            {(['expense', 'income', 'transfer'] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={`type-tab ${type === t ? `active ${t}` : ''}`}
                onClick={() => setType(t)}
                disabled={Boolean(editingTransaction?.installmentPlanId)}
              >
                {t === 'expense' ? '支出' : t === 'income' ? '收入' : '轉帳 / 繳卡費'}
              </button>
            ))}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="關閉">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="sheet-body">
          {editingTransaction?.installmentPlanId && (
            <div className="info-banner">
              <span>
                此筆為分期子帳務（第 {editingTransaction.installmentIndex}/
                {editingTransaction.installmentTotal} 期），修改僅調整本期金額。
              </span>
              <button
                type="button"
                className="btn-link danger"
                onClick={handleCancelFutureInstallments}
              >
                取消尚未到期期數
              </button>
            </div>
          )}

          {/* 金額輸入區 */}
          <div className="amount-display-box">
            <span className="currency-prefix">NT$</span>
            <input
              type="text"
              inputMode="decimal"
              className="amount-input"
              placeholder="0"
              value={amountExpr}
              onChange={(e) => setAmountExpr(e.target.value)}
              autoFocus
            />
            {resolvedMinorAmount !== null && /[+-]/.test(amountExpr) && (
              <span className="amount-preview">
                = {formatMinorToDisplay(resolvedMinorAmount)}
              </span>
            )}
          </div>

          {/* 帳戶選擇 */}
          <div className="form-row">
            <label className="field-label">
              {type === 'transfer' ? '轉出帳戶' : type === 'income' ? '入帳帳戶' : '付款帳戶'}
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="select-input"
              >
                {activeAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                    {acc.type === 'credit_card' ? ' (信用卡)' : ''}
                  </option>
                ))}
              </select>
            </label>

            {type === 'transfer' && (
              <label className="field-label">
                轉入帳戶
                <select
                  value={toAccountId}
                  onChange={(e) => setToAccountId(e.target.value)}
                  className="select-input"
                >
                  {activeAccounts
                    .filter((a) => a.id !== accountId)
                    .map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name}
                        {acc.type === 'credit_card' ? ' (信用卡)' : ''}
                      </option>
                    ))}
                </select>
              </label>
            )}
          </div>

          {/* 分類網格 */}
          {type !== 'transfer' && (
            <div className="category-grid">
              {filteredCategories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className={`category-chip ${categoryId === cat.id ? 'selected' : ''}`}
                  onClick={() => setCategoryId(cat.id)}
                  style={{
                    '--cat-color': cat.color,
                  } as React.CSSProperties}
                >
                  <span className="cat-dot">
                    <CategoryIcon name={cat.icon} size={16} />
                  </span>
                  <span>{cat.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* 日期與備註 */}
          <div className="form-row">
            <label className="field-label">
              <span className="inline-icon">
                <Calendar size={14} /> 日期
              </span>
              <input
                type="date"
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
                className="text-input"
                required
              />
            </label>
            <label className="field-label grow-2">
              備註
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={type === 'transfer' ? '例如：繳 11 月卡費' : '輸入消費摘要...'}
                className="text-input"
              />
            </label>
          </div>

          {/* 信用卡分期付款切換 */}
          {canUseInstallment && (
            <div className="installment-box">
              <label className="toggle-row">
                <span className="inline-icon">
                  <Layers size={16} /> 啟用信用卡分期付款
                </span>
                <input
                  type="checkbox"
                  checked={isInstallment}
                  onChange={(e) => setIsInstallment(e.target.checked)}
                />
              </label>

              {isInstallment && (
                <div className="installment-controls">
                  <div className="preset-pills">
                    {[3, 6, 12, 24].map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={`pill-btn ${installments === n ? 'active' : ''}`}
                        onClick={() => setInstallments(n)}
                      >
                        {n} 期
                      </button>
                    ))}
                    <input
                      type="number"
                      min={2}
                      max={60}
                      value={installments}
                      onChange={(e) =>
                        setInstallments(Math.max(2, Number(e.target.value) || 2))
                      }
                      className="mini-number"
                      aria-label="自訂期數"
                    />
                  </div>
                  <div className="strategy-row">
                    <span>除不盡餘數：</span>
                    <button
                      type="button"
                      className={`pill-btn ${remainderStrategy === 'first' ? 'active' : ''}`}
                      onClick={() => setRemainderStrategy('first')}
                    >
                      併入首期
                    </button>
                    <button
                      type="button"
                      className={`pill-btn ${remainderStrategy === 'last' ? 'active' : ''}`}
                      onClick={() => setRemainderStrategy('last')}
                    >
                      併入末期
                    </button>
                  </div>
                  {installmentPreview && (
                    <p className="installment-summary">
                      首期 {formatMinorToDisplay(installmentPreview.firstAmount)} · 末期{' '}
                      {formatMinorToDisplay(installmentPreview.lastAmount)} · 最後入帳{' '}
                      {installmentPreview.lastDate}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 手機快速數字鍵盤 */}
          <div className="keypad-grid" aria-label="數字計算鍵盤">
            {KEYPAD_BUTTONS.map((key) => (
              <button
                key={key}
                type="button"
                className={`keypad-btn ${key === '=' ? 'accent' : ''}`}
                onClick={() => handleKeypad(key)}
              >
                {key === 'DEL' ? <Delete size={18} /> : key}
              </button>
            ))}
          </div>

          {error && <p className="error-text">{error}</p>}

          <div className="sheet-actions">
            {editingTransaction && (
              <button
                type="button"
                className="btn-danger-outline"
                onClick={handleVoid}
                disabled={submitting}
              >
                作廢此筆
              </button>
            )}
            <button
              type="submit"
              className="btn-primary full-grow"
              disabled={submitting}
            >
              <Check size={18} />
              {submitting
                ? '儲存中...'
                : editingTransaction
                  ? '儲存變更'
                  : isInstallment
                    ? `建立 ${installments} 期分期`
                    : '完成記帳'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
