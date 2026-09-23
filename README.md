# terryWMS

崇文／八方倉儲管理系統（WMS）。純前端網頁 + Firebase（Firestore、Auth）。

## 檔案結構

| 檔案 | 說明 |
|---|---|
| `index.html` | 桌機版所有畫面 |
| `m/` | **手機版**（網址 `/m/`）：波次揀貨、入庫任務、調度工單、盤點、上架、出庫、移板、併板、庫存快查；相機掃碼；可加到主畫面（PWA） |
| `mobile.html` | 舊網址，自動轉到 `m/` |
| `firebase-init.js` | 桌機版 Firebase 初始化、登入、庫存即時監聽 |
| `js/shared/*.js` | 桌機與手機共用：Firebase 設定、資料格式、庫存交易核心、揀貨清單 |
| `js/01-core.js` … `js/18-data-migration.js` | 桌機應用程式模組，依編號順序載入 |
| `firestore.rules` | Firestore 安全規則（**需要另外發布到 Firebase 才會生效**） |
| `tests/` | 安全規則測試與端對端測試（Firebase 模擬器） |

### 共用模組（js/shared）

| 檔案 | 內容 |
|---|---|
| firebase-config.js | Firebase 專案設定（只此一份） |
| data-format.js | 日期／效期／數量格式統一（`normalizeDateValue`、`normalizeStockRecord`、`Date#toLocalYMD`）；文字安全（讀寫 Firestore 時 `< > " ' ` \` 轉全形，防 XSS） |
| stock-core.js | 庫存交易（`runStockTransaction`、`mergePalletsTx`、`movePalletTx`、`buildInventoryLogEntry`） |
| inbound-core.js | 入庫單入帳（`postInboundOrderTx`：建立棧板、入庫單完成、入庫任務完成在同一筆交易） |
| picking-list.js | 波次揀貨清單（`buildWavePickingList`，先進先出、依動線排序） |

載入順序：`firebase-config` → `data-format` → `firebase-init`（桌機）→ `stock-core` → `inbound-core` → `picking-list` → 桌機模組。

### 手機版（m/）

原本獨立的 terryWMS-MOBILE 已搬進來（2026-09），兩邊共用 `js/shared` 的交易核心，不再各寫一套。

| 檔案 | 內容 |
|---|---|
| m/index.html、app.css | 畫面 |
| m/js/core.js | 登入、即時資料（pallets / waves / dispatchOrders / inboundTasks）、掃描比對、相機、回饋 |
| m/js/picking.js | 波次揀貨：清單用 `buildWavePickingList`，完成用 `completeWaveTx`（與桌機相同） |
| m/js/inbound.js | 入庫任務：掃儲位即入帳（`postInboundOrderTx`）；電腦已入帳的任務只更新儲位 |
| m/js/dispatch.js | 調度工單：桌機「發布到手機」的移板／併板 |
| m/js/scan-ops.js | 上架、出庫、移板、併板（`runStockTransaction`、`movePalletTx`、`mergePalletsTx`） |
| m/js/stocktake.js | 盤點（盤點期間被異動的板不覆蓋） |
| m/js/query.js | 庫存快查 |
| m/sw.js | 網路優先的 Service Worker：有網路一律拿最新版，離線才用快取 |

掃描比對：不分大小寫、忽略 `-` 等符號；可只打板號尾碼（≥3 碼且唯一）；掃棧板的地方也可以掃儲位標籤（只有一板時直接帶出，多板讓使用者選）。
儲位可手打縮寫：`IA011` → `I-A-01-1F`。

### 手機與桌機的分工

- **揀貨**：手機讀桌機建立的波次，掃描進度即時寫回 `waves.completedItems`（兩邊看到同一份進度）；
  手機或桌機都可以「完成波次」，兩邊呼叫同一個 `completeWaveTx`（扣庫存、訂單出貨、缺貨記錄在同一筆交易）。
- **入庫**：桌機建立入庫單時發布 `inboundTasks`；堆高機上架後在手機掃儲位 → 直接入帳（放的儲位不同會先確認，以實際儲位入帳）。
  桌機「待入帳」仍可入帳，入帳後手機上的任務自動結案。

### 作業原則：會讓帳變錯的才擋，其他只提醒

- 併板：品名／規格／公司不同 → 擋；批號／效期不同 → 提醒後可合併（效期取較早者）
- 訂單出貨庫存不足 → 提醒後照可揀數量部分出貨，缺貨記在訂單 `shortages`
- 波次有未揀或缺貨 → 提醒後可完成，缺貨記在波次 `shortages`
- 出貨只走「波次」（舊的「訂單出貨」畫面已移除，避免兩套出貨流程）
- 盤點：盤點期間該板被異動過就不覆蓋，提醒重盤
- **調度**：桌機「發布到手機」寫入 `dispatchOrders`；手機掃描後直接以交易執行移板／併板並寫異動記錄。

### js 模組

模組是一般的 `<script>`（不是 ES module），共用全域 `window`，
**載入順序就是 `index.html` 裡的順序，不可任意調換**：後面的檔案會使用或包裝前面定義的函數
（例如 `17-v56-patch.js` 會包裝 `switchTab`、`onWarehouseChange` 等）。

| 模組 | 內容 |
|---|---|
| 01-core | 通知、共用工具、列印預覽、單號產生器、貨架容量設定（`RACK_CONFIG`） |
| 02-map-inbound | 排序、倉庫地圖、入庫單 |
| 03-container-inbound | 貨櫃入庫與智能儲位分配 |
| 04-warehouse-dispatch | 倉庫管理、棧板移動、智能調度與調度工單 |
| 05-wave-picking | 波次揀貨、原料領用 |
| 06-tools-backup | 棧板堆疊規劃、常用功能、備份還原、清除資料 |
| 07-stock-transactions | 異動記錄、審計日誌、**庫存交易**（`runStockTransaction`、`mergePalletsTx`、`movePalletTx`） |
| 08-analysis-shipping | 出貨分析、熱力圖、訂單出貨、板號異動、現場掃描、備案查詢 |
| 09-workboard-picking | 工單看板、品項選擇、智能入庫建議、揀貨 |
| 10-external-inbound | 外倉管理、入庫單流程、效期檢查、審核流程 |
| 11-transfer | 倉庫調撥 |
| 12-users-labels | 權限、標籤列印、使用者管理、外倉操作 |
| 13-expiry-product-master | 效期管理、品項主檔、Excel 匯入 |
| 14-orders | 訂單管理、訂單異動偵測、波次 |
| 15-reports-import | 報表中心、虛擬儲位、Excel 匯入庫存 |
| 16-rental-consignment | 倉租、寄倉 |
| 17-v56-patch | V56 升級補丁 |
| 18-data-migration | 資料格式遷移（系統維護頁的「資料格式統一」、清除調撥出庫重複計算） |
| 19-stocktake | 庫存盤點（選區域、列印盤點表、輸入實盤、差異以交易調整） |

## 開發規則

- **庫存數量的任何變動都要走交易**：用 `runStockTransaction`（扣／加數量）、`mergePalletsTx`（併板）、
  `movePalletTx`（移板）。它們會讀最新數量、檢查不足、寫入並寫異動記錄，全部在同一筆交易完成。
  不要用「讀快取 → 算新數量 → updateDoc」的寫法，多人同時操作會互相覆蓋。
- **單號**用 `generateDocNo(type)`（同步）或 `await nextDocNo(type)`（async 流程），由 Firestore 計數器發號，不會重複。
- **效期**一律是本地日期字串 `'YYYY-MM-DD'`，同時存在 `expiryDate` 與 `expDate`；
  日期轉字串用 `date.toLocalYMD()`，不要用 `toISOString().split('T')[0]`（那是 UTC 日期）。
- **貨架容量**只從 `RACK_CONFIG` 取得；判斷某層還能放幾板用 `levelRemaining` / `canLevelFit`（支援混放不同板型）。
- **XSS**：所有從 Firestore 讀出的文字已在資料層轉全形（`sanitizeDeep`），所以既有的 `innerHTML` 拼接不會被注入；
  但從**使用者輸入框直接拿值**再用 `innerHTML` 顯示時，請用 `escapeHtml()`。
- 查詢用 `window.query(collection, where(...), orderBy(...), limit(...))`；
  等值條件加上另一個欄位的範圍或排序需要 Firestore 複合索引，沒有建索引就改成在前端篩選。

## 部署安全規則

Firebase 主控台 → Firestore Database → 規則 → 貼上 `firestore.rules` 內容 → 發布
（或 `firebase deploy --only firestore:rules`）。

發布前確認：`users` 集合的文件 ID 都是**小寫 email**，且欄位 `role` 正確。
啟用規則後，第一位管理員必須在主控台手動建立 `users/{email}`（`role: 'admin'`）。

## 伺服器端（Cloud Functions）評估

目前的保護：所有庫存異動走 Firestore 交易（不會互相覆蓋、不會只扣一半），
安全規則限制角色權限、數量不可為負、異動記錄的 `operatorEmail` 必須是登入者本人。

尚未做到、需要 Cloud Functions 才能完全解決的：規則無法驗證「業務規則」本身
（例如倉管人員從瀏覽器主控台直接把某板數量改大），因為前端程式可以被繞過。
若要做到，建議把 `runStockTransaction` 等核心搬到 Cloud Functions（callable functions），
並把 `pallets` / `externalStock` / `inventoryLogs` 的寫入權限在規則中關閉、只允許函數寫入。
這需要 Firebase **Blaze（付費）方案**，且所有前端寫入點都要改成呼叫函數，屬於較大的改動。

## 測試

見 [`tests/README.md`](tests/README.md)。

上線後人工驗收（入庫 → 波次出貨 → 調撥 → 盤點）：見 [`docs/上線驗收步驟.md`](docs/上線驗收步驟.md)。
