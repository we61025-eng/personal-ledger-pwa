export function App() {
  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>個人多帳戶記帳本</h1>
        <p>Local-first PWA · Phase 1 專案骨架已就緒</p>
      </header>
      <section className="app-card">
        <h2>架構模組狀態</h2>
        <ul>
          <li>Domain 型別定義：<code>src/domain/types.ts</code></li>
          <li>Dexie IndexedDB Schema：<code>src/db/database.ts</code></li>
          <li>Vitest 測試環境：<code>tests/domain/</code></li>
        </ul>
      </section>
    </main>
  );
}
