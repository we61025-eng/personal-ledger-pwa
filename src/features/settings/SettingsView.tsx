import { useRef, useState } from 'react';
import { Download, Plus, Sparkles, Trash2, Upload } from 'lucide-react';
import {
  exportLedgerBackup,
  importLedgerBackup,
  validateBackupPayload,
  type LedgerBackupPayload,
} from '../../db/backup';
import { db } from '../../db/database';
import { loadDemoPortfolioData } from '../../db/seed';
import { formatMinorToDisplay, parseInputToMinor } from '../../domain/money';
import type { ISODate, YearMonth } from '../../domain/types';
import type { LedgerViewModel } from '../../hooks/useLedgerData';
import {
  deleteBudget,
  saveBudget,
  saveCategory,
  setCategoryArchived,
} from '../../services/ledgerService';

interface SettingsViewProps {
  data: LedgerViewModel;
  today: ISODate;
  selectedYearMonth: YearMonth;
  onNotify: (msg: string) => void;
}

export function SettingsView({
  data,
  today,
  selectedYearMonth,
  onNotify,
}: SettingsViewProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 預算表單
  const [budgetCatId, setBudgetCatId] = useState<string>('ALL');
  const [budgetAmountInput, setBudgetAmountInput] = useState('');
  const [budgetMonthOnly, setBudgetMonthOnly] = useState(false);
  const [alertPct, setAlertPct] = useState(80);

  // 新增分類表單
  const [catName, setCatName] = useState('');
  const [catType, setCatType] = useState<'expense' | 'income'>('expense');
  const [catColor, setCatColor] = useState('#6366f1');

  // 還原預覽
  const [pendingRestore, setPendingRestore] = useState<LedgerBackupPayload | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const expenseCategories = data.categories.filter(
    (c) => !c.isArchived && c.type === 'expense',
  );
  const categoryMap = new Map(data.categories.map((c) => [c.id, c]));

  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const amount = parseInputToMinor(budgetAmountInput);
      await saveBudget({
        categoryId: budgetCatId === 'ALL' ? null : budgetCatId,
        amount,
        yearMonth: budgetMonthOnly ? selectedYearMonth : null,
        alertThresholdPercent: alertPct,
      });
      setBudgetAmountInput('');
      onNotify('已儲存預算規則');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : '預算格式錯誤');
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;
    await saveCategory({
      name: catName,
      type: catType,
      icon: catType === 'expense' ? 'shopping-bag' : 'wallet',
      color: catColor,
    });
    setCatName('');
    onNotify('已新增分類');
  };

  const handleExportJson = async () => {
    const payload = await exportLedgerBackup(db);
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ledger-backup-${today}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify(`已匯出備份檔 ledger-backup-${today}.json`);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setRestoreError(null);
    setPendingRestore(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const validated = validateBackupPayload(parsed);
      setPendingRestore(validated);
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : '備份檔案格式無效');
    } finally {
      e.target.value = '';
    }
  };

  const confirmRestore = async () => {
    if (!pendingRestore) return;
    const result = await importLedgerBackup(db, pendingRestore);
    setPendingRestore(null);
    onNotify(
      `還原成功：${result.counts.accounts} 個帳戶、${result.counts.transactions} 筆交易`,
    );
  };

  return (
    <div className="page-stack">
      {/* 預算設定 */}
      <section className="card">
        <div className="card-header">
          <h3>預算設定與警示門檻</h3>
          <span className="muted-hint">單月覆寫預算優先於每月預設預算</span>
        </div>

        <form onSubmit={handleSaveBudget} className="inline-form">
          <select
            className="select-input"
            value={budgetCatId}
            onChange={(e) => setBudgetCatId(e.target.value)}
          >
            <option value="ALL">全月總支出預算</option>
            {expenseCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <input
            type="text"
            className="text-input"
            placeholder="預算金額 (NT$)"
            value={budgetAmountInput}
            onChange={(e) => setBudgetAmountInput(e.target.value)}
            required
          />

          <input
            type="number"
            className="mini-number"
            min={1}
            max={100}
            value={alertPct}
            onChange={(e) => setAlertPct(Number(e.target.value) || 80)}
            title="警示門檻百分比"
          />

          <label className="checkbox-inline">
            <input
              type="checkbox"
              checked={budgetMonthOnly}
              onChange={(e) => setBudgetMonthOnly(e.target.checked)}
            />
            僅套用 {selectedYearMonth}
          </label>

          <button type="submit" className="btn-primary-sm">
            <Plus size={16} /> 新增預算
          </button>
        </form>

        <div className="stack-list mt-1">
          {data.budgets.map((b) => (
            <div key={b.id} className="plan-row">
              <span>
                <strong>
                  {b.categoryId === null
                    ? '全月總支出預算'
                    : (categoryMap.get(b.categoryId)?.name ?? '分類')}
                </strong>{' '}
                · {b.yearMonth ?? '每月預設'} · 上限 {formatMinorToDisplay(b.amount)}（達{' '}
                {b.alertThresholdPercent}% 警示）
              </span>
              <button
                type="button"
                className="icon-btn danger"
                onClick={() => deleteBudget(b.id)}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* 分類管理 */}
      <section className="card">
        <div className="card-header">
          <h3>收支分類管理</h3>
        </div>
        <form onSubmit={handleAddCategory} className="inline-form">
          <input
            type="text"
            className="text-input"
            placeholder="新分類名稱"
            value={catName}
            onChange={(e) => setCatName(e.target.value)}
            required
          />
          <select
            className="select-input"
            value={catType}
            onChange={(e) => setCatType(e.target.value as 'expense' | 'income')}
          >
            <option value="expense">支出</option>
            <option value="income">收入</option>
          </select>
          <input
            type="color"
            value={catColor}
            onChange={(e) => setCatColor(e.target.value)}
            className="color-input"
            title="選擇代表色"
          />
          <button type="submit" className="btn-secondary-sm">
            新增分類
          </button>
        </form>

        <div className="category-pills mt-1">
          {data.categories.map((cat) => (
            <span
              key={cat.id}
              className={`cat-manage-pill ${cat.isArchived ? 'archived' : ''}`}
            >
              <span
                className="legend-swatch"
                style={{ backgroundColor: cat.color }}
              />
              {cat.name} ({cat.type === 'expense' ? '支' : '收'})
              <button
                type="button"
                className="btn-link"
                onClick={() => setCategoryArchived(cat.id, !cat.isArchived)}
              >
                {cat.isArchived ? '恢復' : '封存'}
              </button>
            </span>
          ))}
        </div>
      </section>

      {/* JSON 備份還原與示範資料 */}
      <section className="card">
        <div className="card-header">
          <h3>本機資料備份與還原（JSON Snapshot）</h3>
          <span className="muted-hint">清除瀏覽器快取前請先匯出備份</span>
        </div>

        <div className="tile-actions wrap">
          <button type="button" className="btn-primary" onClick={handleExportJson}>
            <Download size={16} /> 匯出 JSON 備份
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={16} /> 匯入 JSON 還原
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={async () => {
              await loadDemoPortfolioData(db, today);
              onNotify('已重設並載入作品集示範帳本');
            }}
          >
            <Sparkles size={16} /> 載入示範帳本資料
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFileChange}
            hidden
          />
        </div>

        {restoreError && <p className="error-text mt-1">{restoreError}</p>}

        {pendingRestore && (
          <div className="info-banner mt-1">
            <div>
              <strong>檔案校驗通過</strong>（匯出時間：{pendingRestore.exportedAt}）：含{' '}
              {pendingRestore.data.accounts.length} 個帳戶、
              {pendingRestore.data.transactions.length} 筆交易、
              {pendingRestore.data.installmentPlans.length} 筆分期計劃。確認後將覆蓋目前本機資料！
            </div>
            <div className="tile-actions">
              <button
                type="button"
                className="btn-danger-outline"
                onClick={() => setPendingRestore(null)}
              >
                取消
              </button>
              <button type="button" className="btn-primary-sm" onClick={confirmRestore}>
                確認覆蓋還原
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
