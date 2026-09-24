# terryWMS

崇文／八方倉儲管理系統（WMS）。純前端網頁 + Firebase（Firestore、Auth）。

## 檔案結構

| 檔案 | 說明 |
|---|---|
| `index.html` | 桌機版所有畫面 |
| `m/` | **手機版**（網址 `/m/`）：波次揀貨、入庫任務、調度工單、盤點、上架、出庫、移板、併板、庫存快查；相機掃碼；可加到主畫面（PWA） |
| `mobile.html` | 舊網址，自動轉到 `m/` |
| `firebase-init.js` | 桌機版 Firebase 初始化、登入、庫存即時監聽 |
| `js/shared/*.js` | 桌機與手機共用：Firebase 設定、資料格式、貨架容量、庫存交易核心、揀貨清單 |
| `js/01-core.js` … `js/22-report-print.js` | 桌機應用程式模組，依編號順序載入 |
| `firestore.rules` | Firestore 安全規則（**需要另外發布到 Firebase 才會生效**） |
| `tests/` | 安全規則測試與端對端測試（Firebase 模擬器） |

### 共用模組（js/shared）

| 檔案 | 內容 |
|---|---|
| firebase-config.js | Firebase 專案設定（只此一份） |
| data-format.js | 日期／效期／數量格式統一（`normalizeDateValue`、`normalizeStockRecord`、`Date#toLocalYMD`）；文字安全（讀寫 Firestore 時 `< > " ' ` \` 轉全形，防 XSS） |
| stock-core.js | 庫存交易（`runStockTransaction`、`mergePalletsTx`、`movePalletTx`、`buildInventoryLogEntry`） |
| inbound-core.js | 入庫單入帳（`postInboundOrderTx`：建立棧板、入庫單完成、入庫任務完成在同一筆交易） |
| picking-list.js | 波次揀貨清單（`buildWavePickingList`，先進先出、依動線排序：面對面的 A/B、C/D… 區沿通道一起揀） |

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

- 併板：品名／規格／公司／批號不同 → 擋（批號不同合併後會追溯不到）；效期不同 → 提醒後可合併（效期取較早者）
- 訂單出貨庫存不足 → 提醒後照可揀數量部分出貨，缺貨記在訂單 `shortages`
- 波次有未揀或缺貨 → 提醒後可完成，缺貨記在波次 `shortages`；每張訂單依實際揀到的件數判斷：
  出齊＝`shipped`；只出一部分＝`partial`（欠貨記在 `backorderItems`，可以再排波次，只排欠的）；一件都沒出＝回到 `pending`
- 建立波次（手動勾選、依物流自動、追加訂單）都在交易裡確認訂單還沒被排走（`createWaveFromOrders`／`addOrdersToWaveTx`），
  同一張訂單不會進兩個波次；波次編號＝今天資料庫裡最大號碼＋1（波次文件 ID 就是波次編號）
- 刪除／清除波次：只處理資料庫裡仍「待揀貨」且沒人開始揀的波次；已完成的波次是出貨記錄，不清除、已出貨的訂單不改回
- 完成波次：資料庫裡的波次已被刪除或已完成就擋下；電腦完成時會先讀手機掃過的進度
- 訂單匯入：同一單號＝同一張訂單（不依物流商拆開）；件數換算不出來（包裝數量空白、品名沒有 *N盒、單位不是件／箱）要人工填；
  已出貨（含部分出貨）的訂單在 Excel 有變動不套用、提醒到 ERP 處理
- 鼎新訂單匯入：欄位依標題找（多一欄、換順序也讀得對；少了單號／品名／數量／備註就擋下並說明）；
  備註看不出物流商的新訂單當場列出來選（可選「先不排」）；匯入後只問一次，依物流商一次建好波次，沒物流商的單不排，可在「建立波次」清單指定。
  建議作業：每天固定時間（例如 10:00、14:00）匯出「今天全部」訂單匯入，重複的單會自動略過；業務開單時物流商寫在備註（黑貓、新竹、大榮、自取…）
- 出貨只走「波次」（舊的「訂單出貨」畫面已移除，避免兩套出貨流程）
- 波次揀貨不揀：已過期的板、品管留置（V-QC）與業務保留（V-SALES）的板；因此不足的記為缺貨並註明原因
- 崇文／八方庫存可互相調用，揀貨清單標示每板屬於哪家公司
- 不定重品數量變動時，總重量照比例調整（`runStockTransaction`、盤點）
- 財務核准只是對帳，不擋入帳；駁回或重新送審已入帳的單會提醒另外調整庫存
- 外倉入庫單建立時就加到外倉庫存並標記完成，不能再入帳到本倉
- 寄倉（已賣給客戶、寄放在倉庫）：波次揀貨保留寄倉件數，不給別人的訂單；寄倉客戶自己的訂單（ERP 開單提貨，客戶名稱相同或互相包含）可以揀自己的寄倉貨，波次完成時同一筆交易自動扣寄倉剩餘件數。寄倉頁的「提貨」只補記寄倉件數，不扣庫存
- 倉租：寄倉依每天實際剩餘件數計費（提貨當天仍計費）；自有庫存依每日板數快照 `stockSnapshots/{日期}` 加總板天
  （每天第一位登入的人自動記錄；沒有紀錄的日子沿用前一天，紀錄開始前用目前板數估算並標示）
- 權限：所有人功能相同；角色只決定能不能改資料（只讀不能改）、能不能核准與管理（主管／管理員）
- 盤點：盤點期間該板數量變了或被移到別的儲位就不覆蓋；實盤數清空，一定要重新數
- 編輯棧板：只寫入真的改過的欄位；改的欄位在編輯期間也被別人改了 → 擋下請重開
- 儲位簡碼：登打不用打「-」，`IA011` → `I-A-01-1F`（倉＋區＋排 1～2 碼＋層，F 可省略；`tempin` → `TEMP-IN`、`vqc` → `V-QC`）。
  `formatLocationId`（js/shared/data-format.js）電腦與手機共用；電腦的儲位輸入框即時顯示轉換結果，寫入庫存的共用函數也會再轉一次。
  儲位標籤（標籤列印 → 儲位條碼）印出儲位、簡碼與 QR 碼，可選標籤機 60×40mm 或 A4 一頁 8 張，可加印暫存區／留置區
- 搬板：儲位一律大寫並檢查格式；目標那一層已滿（`locationFullWarning`，容量表在 `js/shared/rack-config.js`）先提醒，按確定照搬
- 外倉庫存同一批＝同倉、同公司、同品名／規格／批號／效期（`sameExternalLot`）；外倉入庫以交易加數量；調撥時重量依件數比例跟著走
- 馬上入帳也檢查儲位格式與效期（過期擋、即期要核准、快到期提醒）
- **調度**：桌機「發布到手機」寫入 `dispatchOrders`；手機掃描後以交易執行移板／併板並寫異動記錄，
  同一筆交易確認棧板還在工單上的儲位（`expectFrom`）、這一項沒做過並標記完成（`dispatch`），不會重複執行；
  已發布到手機的調度電腦只看進度、不能執行；調度建議的併板不跨公司、不跨批號
- 貨櫃入庫：插單印出後（`labelsPrinted`）不再整批重新產生板號，改品項只補新的、作廢的會提醒撕掉；
  入帳寫到一半失敗可以直接重試（已寫入的板略過）；貨架排不下的板放進貨暫存區 TEMP-IN
- 領用出庫：品管留置／業務保留的板不能選；過期的可以選（報廢用）但會提醒；同一板分次加入會加總
- 報表：日期一律用本地日期；出貨統計用波次完成時記下的實際出貨（`waves.shipped`，已扣缺貨）；
  入庫統計依入庫異動記錄（出完貨的板也算）；領料包含 `picking-rm` 與 `picking`
- 期初匯入：Excel 日期格子（數字）會轉成日期，看不懂的效期列為錯誤；重複判斷含公司／批號／效期；分批寫入
- 即期品入庫：主管／管理員建單即核准；其他人建的入庫單標 `expiryApproval: 'pending'`，主管在「入庫核准」頁同意前不能入帳（`postInboundOrderTx` 擋下）；拒收＝取消入庫單
- 入庫單可以取消（還沒入帳的）：入庫單與手機任務一起取消；改已入帳的入庫單會同步調整那一板（入帳時記下 `palletDocId`），那板已出貨就擋下
- 財務核准／駁回在交易裡確認單子仍是待審核、沒被修改過
- 還原備份：先檢查檔案、顯示筆數確認；只清空備份裡有的資料表；異動記錄不清空只補回缺少的；時間戳記加標記還原，字串保持字串
- 清除訂單只刪沒出貨的訂單與還沒開始揀的波次；作業看板用自己的資料（待上架任務、進行中波次、調度工單）
- 手機：留置區的板不能出庫；過期、寄倉保留的件數出庫要確認；盤點可填實際儲位一起更正；上架點數 0 件刪板並提醒容量；留置與一般的貨不能合併
- 帳號停用或角色改變即時生效（登入中的人會被登出）
- 減少繁瑣（導入初期）：
  - 精簡選單：一般人員預設只看到每天會用的功能（`SIMPLE_MENU_TABS`，js/20-home.js），主管／管理員／財務預設看全部；左下角可切換，不影響權限
  - 手機「掃一下」（m/js/quick-scan.js）：掃板號 → 列出搬／出庫／盤點／併板，掃儲位 → 列出這裡的板或在這裡上架；選了就帶著這板跳到那一頁的下一步
  - 例行、可以再改回來的動作不再跳確認：電腦搬板、「是否繼續下一筆」、批號沒填、效期 90 天內（改提示）、手機上架放的儲位和指定不同、交給堆高機；完成波次只確認一次。
    會動到帳或很難復原的（馬上入帳、完成波次、點數不同、刪板、過期／寄倉出庫、放到滿的儲位、刪除清除還原）照樣確認
- 現場看板 `board.html`：放在倉庫現場電視／大螢幕。沒有選單、全螢幕大字；待上架、揀貨波次、調度工單、今天完成、7 天內到期即時更新（Firestore 監聽），
  斷線自動重連、依螢幕大小顯示放得下的張數、20:00～06:30 自動調暗（`?night=off` 關閉）、防螢幕休眠。建議用唯讀角色的專用帳號登入
- 手機版在 `/m/`；用手機打開電腦版會提示「切換到手機版」（可選「留在電腦版」）
- 所有異動記錄都經過 `buildInventoryLogEntry`（有字串 `timestamp`）；資料格式統一會替舊記錄補 `timestamp`

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
| 20-home | 今日工作（登入後第一頁）：待辦卡片、常用流程；`goTab()` 切畫面並同步選單 |
| 21-step-bars | 波次、調撥、盤點畫面上方的步驟列（依畫面狀態亮起目前這一步） |
| 22-report-print | 報表列印與 Excel 匯出：`printTableReport`（A4 分頁，每頁抬頭／表頭／頁碼，最後一頁合計與簽核欄）、`exportTableReportXlsx`（上方抬頭與查詢條件、合計列）、`sheetToJsonSmart`（匯入時跳過抬頭） |

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
