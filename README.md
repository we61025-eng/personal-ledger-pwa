# 個人多帳戶記帳本（Personal Ledger PWA）

無須登入、資料完全本機儲存（IndexedDB / Dexie.js）的雙棲自適應記帳 PWA，專注於多帳戶資產管理、完整信用卡結帳週期與分期付款模擬、週期性固定收支補發與分類預算警示。

## 核心特色

* **Local-first 離線可用**：基於 IndexedDB（Dexie.js）與 Service Worker，開啟即用且不依賴雲端伺服器。
* **多帳戶資產與淨資產計算**：支援現金、銀行、電子支付與信用卡；轉帳與繳卡費自動隔離於收支報表之外。
* **完整信用卡週期模擬**：結帳日（含當天）與大小月（28/29/30/31 號）自動對齊、跨月繳款截止日、已出帳 / 未出帳 / 未來分期拆算、一鍵繳卡費精靈。
* **分期付款與餘數策略**：支援自訂期數、`first` / `last` 餘數分配、Anchor Day 防日期漂移，以及單期微調與未來期數提前取消。
* **週期性固定收支冪等補發**：App 啟動時自動依 `[recurringRuleId + recurringOccurrenceDate]` 複合索引冪等補齊漏記帳務。
* **雙棲自適應體驗**：手機端 Bottom Sheet + 內建加減計算鍵盤 3 秒快速記帳；桌機端 Bento Dashboard + SVG 支出圓餅圖 + `N` / `Esc` 快捷鍵 + 深淺色主題切換。
* **JSON 備份與還原**：支援結構與外鍵完整性校驗的原子化匯出 / 還原，並內建一鍵載入示範帳本功能。

## 文件索引

* [產品與功能規格書（SPEC.md）](docs/SPEC.md)
* [系統架構與工程設計文件（ARCHITECTURE.md）](docs/ARCHITECTURE.md)

## 技術棧

* **Frontend**：React 18 + TypeScript + Vite
* **Local Persistence**：Dexie.js + `dexie-react-hooks`
* **Testing**：Vitest + `fake-indexeddb`
* **Icons & PWA**：`lucide-react` + Web App Manifest + Service Worker

## 開發與測試指令

```bash
npm install
npm run typecheck
npm test
npm run build
npm run dev
```
