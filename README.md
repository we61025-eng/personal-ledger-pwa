# 個人多帳戶記帳本（Personal Ledger PWA）

無須登入、資料完全本機儲存（IndexedDB / Dexie.js）的雙棲自適應記帳 PWA，專注於多帳戶資產管理、完整信用卡結帳週期與分期付款模擬、週期性固定收支補發與分類預算警示。

## 文件索引

* [產品與功能規格書（SPEC.md）](docs/SPEC.md)
* [系統架構與工程設計文件（ARCHITECTURE.md）](docs/ARCHITECTURE.md)

## 技術棧

* **Frontend**：React 18 + TypeScript + Vite
* **Local Persistence**：Dexie.js (IndexedDB)
* **Testing**：Vitest

## 開發指令

```bash
npm install
npm run typecheck
npm test
npm run dev
```
