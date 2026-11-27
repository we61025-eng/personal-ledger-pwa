import { useState } from 'react';
import { Pause, Play, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { parseISODate } from '../../domain/date';
import { formatMinorToDisplay, parseInputToMinor } from '../../domain/money';
import type {
  ISODate,
  RecurringFrequency,
  TransactionType,
} from '../../domain/types';
import type { LedgerViewModel } from '../../hooks/useLedgerData';
import {
  deleteRecurringRule,
  saveRecurringRule,
  toggleRecurringRule,
} from '../../services/ledgerService';
import { runStartupCatchUp } from '../../services/startupService';

interface RecurringViewProps {
  data: LedgerViewModel;
  today: ISODate;
  onNotify: (msg: string) => void;
}

const FREQ_LABEL: Record<RecurringFrequency, string> = {
  daily: '天',
  weekly: '週',
  monthly: '個月',
  yearly: '年',
};

export function RecurringView({ data, today, onNotify }: RecurringViewProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<TransactionType>('expense');
  const [amountInput, setAmountInput] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [interval, setInterval] = useState(1);
  const [startDate, setStartDate] = useState<ISODate>(today);
  const [endDate, setEndDate] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const activeAccounts = data.accounts.filter((a) => !a.isArchived);
  const activeCategories = data.categories.filter(
    (c) => !c.isArchived && c.type === (type === 'income' ? 'income' : 'expense'),
  );
  const accountMap = new Map(data.accounts.map((a) => [a.id, a]));
  const categoryMap = new Map(data.categories.map((c) => [c.id, c]));

  const openModal = () => {
    setName('');
    setType('expense');
    setAmountInput('');
    setAccountId(activeAccounts[0]?.id ?? '');
    setCategoryId(
      data.categories.find((c) => !c.isArchived && c.type === 'expense')?.id ?? '',
    );
    setFrequency('monthly');
    setInterval(1);
    setStartDate(today);
    setEndDate('');
    setNote('');
    setError(null);
    setIsOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const amount = parseInputToMinor(amountInput);
      const parsedStart = parseISODate(startDate);
      await saveRecurringRule({
        name,
        type,
        amount,
        accountId,
        categoryId,
        frequency,
        interval,
        anchorDay: parsedStart.day,
        startDate,
        endDate: endDate.trim() || undefined,
        note,
      });
      await runStartupCatchUp(undefined, today);
      onNotify('已建立週期性規則並同步檢查補發');
      setIsOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗');
    }
  };

  const handleManualCatchUp = async () => {
    const res = await runStartupCatchUp(undefined, today);
    if (res.insertedRecurringCount > 0) {
      onNotify(`已補入 ${res.insertedRecurringCount} 筆到期固定帳務`);
    } else {
      onNotify('目前所有固定帳務皆已同步至最新日期');
    }
  };

  return (
    <div className="page-stack">
      <div className="page-actions-header">
        <div>
          <h2>週期性固定收支</h2>
          <p className="muted-hint">
            房租、薪資與訂閱制規則會於每次開啟 App 時依冪等索引自動補發至今日
          </p>
        </div>
        <div className="tile-actions">
          <button type="button" className="btn-secondary" onClick={handleManualCatchUp}>
            <RefreshCw size={16} /> 立即檢查補發
          </button>
          <button type="button" className="btn-primary" onClick={openModal}>
            <Plus size={18} /> 新增固定規則
          </button>
        </div>
      </div>

      <section className="card">
        {data.recurringRules.length === 0 ? (
          <p className="empty-state">尚未設定週期性固定收支規則</p>
        ) : (
          <div className="stack-list">
            {data.recurringRules.map((rule) => {
              const acc = accountMap.get(rule.accountId);
              const cat = rule.categoryId ? categoryMap.get(rule.categoryId) : undefined;
              return (
                <div
                  key={rule.id}
                  className={`rule-row ${rule.isActive ? '' : 'paused'}`}
                >
                  <div>
                    <div className="cc-title-row">
                      <strong>{rule.name}</strong>
                      <span className={`status-pill ${rule.isActive ? 'paid' : 'unbilled'}`}>
                        {rule.isActive ? '啟用中' : '已暫停'}
                      </span>
                    </div>
                    <div className="muted-hint">
                      每 {rule.interval} {FREQ_LABEL[rule.frequency]} · {acc?.name} ·{' '}
                      {cat?.name ?? ''} · 下次執行：{rule.nextRunDate}
                      {rule.endDate ? ` · 結束：${rule.endDate}` : ''}
                    </div>
                  </div>
                  <div className="tile-actions">
                    <strong
                      className={`tabular-nums ${
                        rule.type === 'income' ? 'positive' : 'negative'
                      }`}
                    >
                      {rule.type === 'income' ? '+' : '-'}
                      {formatMinorToDisplay(rule.amount)}
                    </strong>
                    <button
                      type="button"
                      className="icon-btn"
                      title={rule.isActive ? '暫停規則' : '恢復啟用'}
                      onClick={() => toggleRecurringRule(rule.id, !rule.isActive)}
                    >
                      {rule.isActive ? <Pause size={16} /> : <Play size={16} />}
                    </button>
                    <button
                      type="button"
                      className="icon-btn danger"
                      title="刪除規則"
                      onClick={() => deleteRecurringRule(rule.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {isOpen && (
        <div className="modal-backdrop" onClick={() => setIsOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="card-header">
              <h3>新增固定收支規則</h3>
              <button type="button" className="icon-btn" onClick={() => setIsOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSave} className="stack-form">
              <div className="form-row">
                <label className="field-label grow-2">
                  規則名稱
                  <input
                    type="text"
                    className="text-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="例如：套房房租、Netflix"
                    required
                  />
                </label>
                <label className="field-label">
                  類型
                  <select
                    className="select-input"
                    value={type}
                    onChange={(e) => {
                      const next = e.target.value as TransactionType;
                      setType(next);
                      const match = data.categories.find(
                        (c) => !c.isArchived && c.type === (next === 'income' ? 'income' : 'expense'),
                      );
                      setCategoryId(match?.id ?? '');
                    }}
                  >
                    <option value="expense">固定支出</option>
                    <option value="income">固定收入</option>
                  </select>
                </label>
              </div>

              <div className="form-row">
                <label className="field-label">
                  金額（NT$）
                  <input
                    type="text"
                    className="text-input"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    placeholder="15000"
                    required
                  />
                </label>
                <label className="field-label">
                  帳戶
                  <select
                    className="select-input"
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                  >
                    {activeAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-label">
                  分類
                  <select
                    className="select-input"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                  >
                    {activeCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="form-row">
                <label className="field-label">
                  頻率
                  <select
                    className="select-input"
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
                  >
                    <option value="monthly">每月</option>
                    <option value="weekly">每週</option>
                    <option value="daily">每日</option>
                    <option value="yearly">每年</option>
                  </select>
                </label>
                <label className="field-label">
                  間隔
                  <input
                    type="number"
                    min={1}
                    className="text-input"
                    value={interval}
                    onChange={(e) => setInterval(Math.max(1, Number(e.target.value) || 1))}
                  />
                </label>
                <label className="field-label">
                  開始日期
                  <input
                    type="date"
                    className="text-input"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                </label>
                <label className="field-label">
                  結束日期（選填）
                  <input
                    type="date"
                    className="text-input"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </label>
              </div>

              <label className="field-label">
                備註
                <input
                  type="text"
                  className="text-input"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="自動產生的交易備註"
                />
              </label>

              {error && <p className="error-text">{error}</p>}
              <button type="submit" className="btn-primary">
                建立週期規則
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
