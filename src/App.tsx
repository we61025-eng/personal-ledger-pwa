import { useCallback, useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  CreditCard,
  LayoutDashboard,
  ListOrdered,
  Moon,
  Plus,
  Repeat,
  Settings,
  Sun,
  WifiOff,
} from 'lucide-react';
import { formatYearMonth, parseYearMonth, shiftYearMonth, toYearMonth } from './domain/date';
import type { Transaction, YearMonth } from './domain/types';
import { AccountsView } from './features/accounts/AccountsView';
import { DashboardView } from './features/dashboard/DashboardView';
import {
  QuickEntryModal,
  type QuickEntryPrefill,
} from './features/quickEntry/QuickEntryModal';
import { RecurringView } from './features/recurring/RecurringView';
import { SettingsView } from './features/settings/SettingsView';
import { TransactionsView } from './features/transactions/TransactionsView';
import { useLedgerData } from './hooks/useLedgerData';
import { getTodayISODate } from './services/dateProvider';
import { runStartupCatchUp } from './services/startupService';

type NavTab = 'dashboard' | 'transactions' | 'accounts' | 'recurring' | 'settings';

const THEME_STORAGE_KEY = 'ledger_theme';

export function App() {
  const [today] = useState(() => getTodayISODate());
  const [selectedYearMonth, setSelectedYearMonth] = useState<YearMonth>(() =>
    toYearMonth(getTodayISODate()),
  );
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [isQuickEntryOpen, setIsQuickEntryOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [quickPrefill, setQuickPrefill] = useState<QuickEntryPrefill | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  });

  const data = useLedgerData(selectedYearMonth, today);

  const showToast = useCallback((message: string) => {
    setToast(message);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    let active = true;
    runStartupCatchUp(undefined, today).then((res) => {
      if (!active) return;
      if (res.insertedRecurringCount > 0) {
        showToast(`已自動補入 ${res.insertedRecurringCount} 筆到期固定帳務`);
      }
    });
    return () => {
      active = false;
    };
  }, [today, showToast]);

  useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const openNewEntry = useCallback((prefill?: QuickEntryPrefill) => {
    setEditingTx(null);
    setQuickPrefill(prefill ?? null);
    setIsQuickEntryOpen(true);
  }, []);

  const openEditEntry = useCallback((tx: Transaction) => {
    setQuickPrefill(null);
    setEditingTx(tx);
    setIsQuickEntryOpen(true);
  }, []);

  // 桌機快捷鍵：N 開啟快速記帳、Esc 關閉
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT';

      if (e.key === 'Escape' && isQuickEntryOpen) {
        setIsQuickEntryOpen(false);
        return;
      }
      if (!isTyping && !isQuickEntryOpen && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        openNewEntry();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isQuickEntryOpen, openNewEntry]);

  const shiftSelectedMonth = (delta: number) => {
    const { year, month } = parseYearMonth(selectedYearMonth);
    const next = shiftYearMonth(year, month, delta);
    setSelectedYearMonth(formatYearMonth(next.year, next.month));
  };

  return (
    <div className="app-layout">
      {/* 桌機左側 Sidebar */}
      <aside className="sidebar" aria-label="主導覽列">
        <div className="brand">
          <div className="brand-mark">記</div>
          <div>
            <strong>極簡多帳戶帳本</strong>
            <small>Local-first PWA</small>
          </div>
        </div>

        <nav className="side-nav">
          <button
            type="button"
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <LayoutDashboard size={18} /> 總覽 Dashboard
          </button>
          <button
            type="button"
            className={`nav-item ${activeTab === 'transactions' ? 'active' : ''}`}
            onClick={() => setActiveTab('transactions')}
          >
            <ListOrdered size={18} /> 交易明細
          </button>
          <button
            type="button"
            className={`nav-item ${activeTab === 'accounts' ? 'active' : ''}`}
            onClick={() => setActiveTab('accounts')}
          >
            <CreditCard size={18} /> 帳戶與信用卡
          </button>
          <button
            type="button"
            className={`nav-item ${activeTab === 'recurring' ? 'active' : ''}`}
            onClick={() => setActiveTab('recurring')}
          >
            <Repeat size={18} /> 固定收支
          </button>
          <button
            type="button"
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <Settings size={18} /> 預算與備份
          </button>
        </nav>

        <div className="sidebar-footer">
          <button
            type="button"
            className="btn-primary full-width"
            onClick={() => openNewEntry()}
          >
            <Plus size={18} /> 新增帳務 (N)
          </button>
        </div>
      </aside>

      {/* 主內容區 */}
      <div className="main-area">
        <header className="topbar">
          <div className="month-switcher">
            <button
              type="button"
              className="icon-btn"
              onClick={() => shiftSelectedMonth(-1)}
              aria-label="上個月"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="month-label tabular-nums">{selectedYearMonth}</span>
            <button
              type="button"
              className="icon-btn"
              onClick={() => shiftSelectedMonth(1)}
              aria-label="下個月"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="topbar-right">
            {isOffline && (
              <span className="offline-pill">
                <WifiOff size={14} /> 離線模式
              </span>
            )}
            <button
              type="button"
              className="icon-btn"
              onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
              aria-label="切換深淺色主題"
              title="切換深淺色主題"
            >
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <button
              type="button"
              className="btn-primary desktop-only-btn"
              onClick={() => openNewEntry()}
            >
              <Plus size={16} /> 快速記帳
            </button>
          </div>
        </header>

        <main className="content-area">
          {data.isLoading ? (
            <div className="card">載入本機帳務資料中...</div>
          ) : activeTab === 'dashboard' ? (
            <DashboardView
              data={data}
              today={today}
              onOpenQuickEntry={openNewEntry}
              onEditTransaction={openEditEntry}
              onNavigate={setActiveTab}
              onNotify={showToast}
            />
          ) : activeTab === 'transactions' ? (
            <TransactionsView
              data={data}
              selectedYearMonth={selectedYearMonth}
              onEditTransaction={openEditEntry}
            />
          ) : activeTab === 'accounts' ? (
            <AccountsView
              data={data}
              today={today}
              onOpenQuickEntry={openNewEntry}
              onNotify={showToast}
            />
          ) : activeTab === 'recurring' ? (
            <RecurringView data={data} today={today} onNotify={showToast} />
          ) : (
            <SettingsView
              data={data}
              today={today}
              selectedYearMonth={selectedYearMonth}
              onNotify={showToast}
            />
          )}
        </main>
      </div>

      {/* 手機底部 Tab Bar + 中央懸浮快速記帳 */}
      <nav className="mobile-tabbar" aria-label="手機導覽列">
        <button
          type="button"
          className={`mobile-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          <LayoutDashboard size={20} />
          <span>總覽</span>
        </button>
        <button
          type="button"
          className={`mobile-tab ${activeTab === 'transactions' ? 'active' : ''}`}
          onClick={() => setActiveTab('transactions')}
        >
          <ListOrdered size={20} />
          <span>明細</span>
        </button>
        <button
          type="button"
          className="mobile-fab"
          onClick={() => openNewEntry()}
          aria-label="快速記帳"
        >
          <Plus size={26} />
        </button>
        <button
          type="button"
          className={`mobile-tab ${activeTab === 'accounts' ? 'active' : ''}`}
          onClick={() => setActiveTab('accounts')}
        >
          <CreditCard size={20} />
          <span>帳戶</span>
        </button>
        <button
          type="button"
          className={`mobile-tab ${
            activeTab === 'settings' || activeTab === 'recurring' ? 'active' : ''
          }`}
          onClick={() =>
            setActiveTab((prev) => (prev === 'settings' ? 'recurring' : 'settings'))
          }
        >
          <Settings size={20} />
          <span>{activeTab === 'recurring' ? '固定' : '預算/設定'}</span>
        </button>
      </nav>

      <QuickEntryModal
        isOpen={isQuickEntryOpen}
        onClose={() => setIsQuickEntryOpen(false)}
        accounts={data.accounts}
        categories={data.categories}
        today={today}
        editingTransaction={editingTx}
        prefill={quickPrefill}
        onNotify={showToast}
      />

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
