# terryWMS 測試

使用 Firebase 模擬器（Firestore + Auth），不會連到正式資料庫。

- `rules.test.mjs`：Firestore 安全規則（各角色能讀寫什麼、大量寫入不超過規則上限）
- `e2e.test.mjs`：用 Chromium 開啟真正的 `index.html`，模擬兩台裝置同時操作，
  驗證單號不重複、庫存交易不互相覆蓋、庫存不足會整筆取消、波次/訂單不能重複出貨等

## 執行

需要 Node.js 18+ 與 Java 11+（模擬器需要）。

```bash
cd tests
npm install
npx playwright install chromium   # 第一次需要
npm test
```
