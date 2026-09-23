# terryWMS 測試

使用 Firebase 模擬器（Firestore + Auth），不會連到正式資料庫。

- `rules.test.mjs`：Firestore 安全規則（各角色能讀寫什麼、大量寫入不超過規則上限）
- `e2e.test.mjs`：用 Chromium 開啟真正的 `index.html`，模擬兩台裝置同時操作，
  驗證單號不重複、庫存交易不互相覆蓋、庫存不足會整筆取消、波次/訂單不能重複出貨等
- `ui/`：**畫面走查**，像使用者一樣點選單、填表單、按按鈕，走完入庫、貨櫃入庫、
  ERP 匯入→波次出貨、原料領用、倉庫調撥、板號異動、智能調度（桌機發布→手機執行）、外倉管理、庫存編輯、盤點、
  手機相機掃碼（Chromium 假鏡頭播放含板號 QR code 的影片）、手機全部作業（入庫任務、上架、出庫、移板、併板、盤點、快查、波次）

## 執行

需要 Node.js 18+ 與 Java 11+（模擬器需要）。

```bash
cd tests
npm install
npx playwright install chromium   # 第一次需要
npm test        # 安全規則 + 端對端
npm run ui      # 畫面走查
```
