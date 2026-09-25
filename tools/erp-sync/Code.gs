// ============================================================
// 鼎新報表自動匯入（Google Apps Script，跑在 Google 雲端）
//
// 做的事：每 10 分鐘看一次 Google 雲端硬碟的「鼎新匯出」資料夾，
//   有新的 Excel／CSV 就認出是哪一種報表（看子資料夾、檔名代碼、檔名、報表標題），整份存進 WMS 的資料庫（erpInbox），
//   處理完把檔案搬到「已匯入/年-月」；看不懂或失敗的搬到「匯入失敗」並寄信通知。
// 訂單（每日客戶銷貨明細表）由 WMS 電腦版接手：匯入訂單、依物流商建好波次。
// 只處理 WMS 要用的 4 種（每日客戶銷貨明細、庫存明細、批號明細、外倉庫存）；
// 月報（商品銷貨期、每月客戶銷貨明細、應收帳款、領料）由八方 ERP 自己的 Google 程式處理，這裡跳過不碰。
//
// 設定方式：貼上這份程式和 appsscript.json，上面選 setup 按「執行」，照畫面允許就完成了。
// 詳細說明：docs/ERP報表自動匯入設定.md
// ============================================================

// 一鍵設定（第一次執行一次就好）：
//   1. 在「我的雲端硬碟」建立「鼎新匯出」資料夾和子資料夾（已經有就沿用）
//   2. 設定每 10 分鐘自動檢查一次
//   3. 檢查能不能寫進 WMS
//   4. 寄一封信給你，寫著鼎新要輸出到哪個路徑
function setup() {
  var root = getRootFolder();
  WMS_FOLDERS.forEach(function(n) { childFolder(root, n); });
  setupTrigger();
  var check = checkWmsAccess();
  var lines = [
    '✅ 資料夾：我的雲端硬碟 / 鼎新匯出（' + root.getUrl() + '）',
    '✅ 已設定每 10 分鐘自動檢查一次',
    check.ok ? '✅ 可以寫進 WMS' : '❌ 不能寫進 WMS：' + check.msg,
    '',
    '請在鼎新 COSMOS 設定定時輸出（Excel）到：',
    '  G:\\我的雲端硬碟\\鼎新匯出\\每日客戶銷貨明細表',
    '  時間：每天 8:55、10:55、12:55、14:55；條件：最近 7 天的銷貨明細',
    '（電腦的雲端硬碟不是 G 槽、或是英文版，路徑前面換成你電腦上「鼎新匯出」資料夾的位置）'
  ];
  console.log(lines.join('\n'));
  notify(check.ok ? 'WMS 鼎新自動匯入：設定完成' : 'WMS 鼎新自動匯入：設定未完成', lines.join('\n'));
}

// WMS 要的子資料夾（目前只有訂單；庫存、批號、外倉之後做對帳時再加）
var WMS_FOLDERS = ['每日客戶銷貨明細表'];

// ---------- 設定（通常不用改）----------
var CONFIG = {
  FOLDER_ID: '',                                 // 不用填：setup 會自動建立「鼎新匯出」資料夾並記住
  PROJECT_ID: 'terrywms-2345f',                  // Firebase 專案 ID
  NOTIFY_EMAIL: '',                              // 失敗通知寄給誰（空白＝寄給執行這支程式的帳號）
  SETTLE_MINUTES: 2,                             // 檔案修改後幾分鐘內先不處理（等同步完成）
  // 鼎新匯出的檔名是代碼時，在這裡寫「代碼開頭 → 報表名稱」（沒有用子資料夾分開時才需要）
  // 例如 INVR05_20260925.xls 是庫存明細表，就寫 'INVR05': '庫存明細表'
  CODE_MAP: {
    // 'INVR05': '庫存明細表',
    // 'COPR11': '每日客戶銷貨明細表'
  }
};

// ---------- 報表種類：名稱裡有關鍵字就算（由上往下比對，先比對到的算）----------
// sensitive：含金額／帳款，只有主管、財務、管理員看得到
// process：要 WMS 接手處理（訂單）；其他只存檔、可檢視下載
var REPORTS = [
  // owner：誰負責處理。erp＝八方 ERP 自己的 Google 程式處理（seafood-system/tools/erp-sync），這支程式看到就跳過、不搬動
  { type: 'customer_sales_monthly', label: '每月客戶銷貨明細表', keys: ['每月客戶銷貨明細'], owner: 'erp' },
  { type: 'sales_daily', label: '每日客戶銷貨明細表', keys: ['每日客戶銷貨明細', '客戶銷貨明細', '銷貨明細'], process: true, owner: 'wms' },
  { type: 'product_sales_monthly', label: '商品銷貨期報表', keys: ['商品銷貨'], owner: 'erp' },
  { type: 'ar_monthly', label: '應收帳款明細表', keys: ['應收帳款', '未結案應收'], owner: 'erp' },
  { type: 'external_stock', label: '外倉庫存表', keys: ['外倉庫存'], owner: 'wms' },
  { type: 'stock_daily', label: '庫存明細表', keys: ['庫存明細'], owner: 'wms' },
  { type: 'batch_daily', label: '批號明細表', keys: ['批號明細'], owner: 'wms' },
  { type: 'material_issue', label: '領料明細表', keys: ['領料明細'], owner: 'erp' }
];

// 這支程式（WMS）要不要處理這一種報表
function isMine(report) { return !!report && report.owner === 'wms'; }

// 依檔名認報表種類；認不出來回傳 null
function detectReport(fileName) {
  var name = String(fileName || '').replace(/\s/g, '');
  for (var i = 0; i < REPORTS.length; i++) {
    for (var j = 0; j < REPORTS[i].keys.length; j++) {
      if (name.indexOf(REPORTS[i].keys[j]) >= 0) return REPORTS[i];
    }
  }
  return null;
}

// 認出報表種類，依序試：
//   1. 放在哪個子資料夾（資料夾名稱＝報表名稱，最穩）
//   2. 檔名開頭的代碼（CONFIG.CODE_MAP 對照表）
//   3. 檔名裡有報表名稱
//   4. 檔案內容最上面幾列的報表標題（鼎新報表通常會印標題）
// 回傳 { report, by }；認不出來 report 是 null
function identifyReport(fileName, folderName, rows, codeMap) {
  var r = folderName ? detectReport(folderName) : null;
  if (r) return { report: r, by: '資料夾' };
  var name = String(fileName || '').toUpperCase();
  var codes = Object.keys(codeMap || {}).sort(function(a, b) { return b.length - a.length; });   // 長的代碼先比
  for (var i = 0; i < codes.length; i++) {
    if (name.indexOf(codes[i].toUpperCase()) === 0) {
      r = detectReport(codeMap[codes[i]]);
      if (r) return { report: r, by: '代碼' };
    }
  }
  r = detectReport(fileName);
  if (r) return { report: r, by: '檔名' };
  var top = (rows || []).slice(0, 10).map(function(row) { return row.join(' '); }).join(' ');
  r = detectReport(top);
  if (r) return { report: r, by: '內容' };
  return { report: null, by: '' };
}

// 檔名有「崇文」「八方」就記下公司
function detectCompany(fileName) {
  var name = String(fileName || '');
  if (name.indexOf('八方') >= 0) return '八方';
  if (name.indexOf('崇文') >= 0) return '崇文';
  return '';
}

// 表格整理：日期轉成 2026/09/25、字串去頭尾空白、去掉最後面的空白列
function normalizeRows(values, formatDate) {
  var rows = values.map(function(r) {
    return r.map(function(v) {
      if (v instanceof Date) return formatDate(v);
      if (typeof v === 'string') return v.trim();
      if (v === null || v === undefined) return '';
      return v;
    });
  });
  var blank = function(r) { return r.every(function(v) { return v === ''; }); };
  while (rows.length && blank(rows[rows.length - 1])) rows.pop();
  return rows;
}

// 分段：每段轉成文字後不超過 maxChars 字（資料庫每筆上限約 1MB，中文一字 3 位元組）
function chunkRows(rows, maxChars) {
  maxChars = maxChars || 250000;
  var chunks = [], cur = [], size = 2;
  rows.forEach(function(r) {
    var len = JSON.stringify(r).length + 1;
    if (cur.length && size + len > maxChars) { chunks.push(cur); cur = []; size = 2; }
    cur.push(r); size += len;
  });
  if (cur.length || chunks.length === 0) chunks.push(cur);
  return chunks;
}

// 轉成資料庫的欄位格式
function toFields(obj) {
  var f = {};
  Object.keys(obj).forEach(function(k) {
    var v = obj[k];
    if (v === null || v === undefined) f[k] = { nullValue: null };
    else if (typeof v === 'boolean') f[k] = { booleanValue: v };
    else if (typeof v === 'number') f[k] = Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    else f[k] = { stringValue: String(v) };
  });
  return f;
}

// 同一個檔案、同一個修改時間 → 同一個編號（重複執行也不會重複匯入）
function inboxId(report, fileId, modifiedIso) {
  var stamp = modifiedIso.replace(/[-:T]/g, '').slice(0, 14);
  return stamp + '_' + report.type + '_' + String(fileId).slice(-10);
}

// 組出要寫進資料庫的內容：一筆主資料 + 分段的表格（全部一起寫，要嘛全成功、要嘛全不寫）
function buildInboxWrites(projectId, report, file, rows, nowIso, detectedBy) {
  var base = 'projects/' + projectId + '/databases/(default)/documents/erpInbox/';
  var id = inboxId(report, file.id, file.modified);
  var chunks = chunkRows(rows);
  var head = {
    type: report.type,
    label: report.label,
    fileName: file.name,
    driveFileId: file.id,
    fileModified: file.modified,
    company: detectCompany(file.name + ' ' + (rows || []).slice(0, 5).map(function(r) { return r.join(' '); }).join(' ')),
    detectedBy: detectedBy || '',
    receivedAt: nowIso,
    month: new Date(Date.parse(nowIso) + 8 * 3600000).toISOString().slice(0, 7),   // 台灣時間的年-月（WMS 依月份查）
    rowCount: rows.length,
    chunkCount: chunks.length,
    sensitive: !!report.sensitive,
    status: report.process ? 'pending' : 'stored',
    source: 'drive'
  };
  var writes = [{ update: { name: base + id, fields: toFields(head) }, currentDocument: { exists: false } }];
  chunks.forEach(function(c, i) {
    writes.push({ update: { name: base + id + '/chunks/' + ('000' + i).slice(-4), fields: toFields({ i: i, data: JSON.stringify(c), sensitive: !!report.sensitive }) } });
  });
  return { id: id, writes: writes };
}

// ============================================================
// 以下用到 Google 的服務（只能在 Google Apps Script 裡執行）
// ============================================================

// 主程式：由「觸發條件」每 10 分鐘執行一次
function syncErpReports() {
  var root = getRootFolder();
  var now = new Date();
  var results = [];
  // 要看的地方：主資料夾，加上每一個子資料夾（「已匯入」「匯入失敗」除外）
  var places = [{ folder: root, name: '' }];
  var subs = root.getFolders();
  while (subs.hasNext()) {
    var sub = subs.next();
    var subReport = detectReport(sub.getName());
    if (sub.getName() === '已匯入' || sub.getName() === '匯入失敗') continue;
    if (subReport && !isMine(subReport)) continue;   // 八方 ERP 的資料夾，交給它的程式
    places.push({ folder: sub, name: sub.getName() });
  }
  places.forEach(function(place) {
    var files = place.folder.getFiles();
    while (files.hasNext()) {
      var f = files.next();
      if (!/\.(xlsx|xls|csv)$/i.test(f.getName())) continue;
      if (now - f.getLastUpdated() < CONFIG.SETTLE_MINUTES * 60000) continue;   // 還在同步，下次再處理
      // 先用資料夾、檔名認（不用打開檔案）：是八方 ERP 的報表就跳過、不搬動
      var pre = identifyReport(f.getName(), place.name, [], CONFIG.CODE_MAP);
      if (pre.report && !isMine(pre.report)) continue;
      try {
        var msg = importOneFile(f, place.name);
        if (msg === null) continue;   // 看內容才認出是八方 ERP 的報表
        results.push(msg);
        moveTo(f, root, '已匯入', Utilities.formatDate(now, 'Asia/Taipei', 'yyyy-MM'));
      } catch (e) {
        results.push('❌ ' + f.getName() + '：' + e.message);
        moveTo(f, root, '匯入失敗');
        notify('鼎新報表匯入失敗：' + f.getName(), f.getName() + '\n\n' + e.message + '\n\n檔案已搬到「匯入失敗」資料夾。修正後放回原本的資料夾就會再匯入。');
      }
    }
  });
  if (results.length) console.log(results.join('\n'));
}

function importOneFile(f, folderName) {
  var rows = readRows(f);
  if (rows.length === 0) throw new Error('檔案是空的');
  var id = identifyReport(f.getName(), folderName, rows, CONFIG.CODE_MAP);
  if (id.report && !isMine(id.report)) return null;
  if (!id.report) throw new Error('看不出是哪一種報表。請用下面任一種方法：\n' +
    '1. 把這種報表放在用報表名稱命名的子資料夾，例如「鼎新匯出/庫存明細表」\n' +
    '2. 在程式最上面的 CODE_MAP 寫上檔名代碼對應的報表名稱\n' +
    '3. 檔名或報表標題包含報表名稱');
  var file = { id: f.getId(), name: f.getName(), modified: f.getLastUpdated().toISOString() };
  var built = buildInboxWrites(CONFIG.PROJECT_ID, id.report, file, rows, new Date().toISOString(), id.by);
  var res = UrlFetchApp.fetch('https://firestore.googleapis.com/v1/projects/' + CONFIG.PROJECT_ID + '/databases/(default)/documents:commit', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify({ writes: built.writes })
  });
  var code = res.getResponseCode();
  if (code === 409 || (code === 400 && /exists/i.test(res.getContentText()))) return '（已經匯入過）' + f.getName();
  if (code !== 200) throw new Error('寫入 WMS 失敗（' + code + '）：' + res.getContentText().slice(0, 300));
  return '✅ ' + id.report.label + '（依' + id.by + '認出）：' + f.getName() + '（' + rows.length + ' 列）';
}

// 讀出表格：Excel 先轉成 Google 試算表再讀；CSV 直接讀（自動判斷 UTF-8 或 Big5 編碼）
function readRows(f) {
  var fmt = function(d) { return Utilities.formatDate(d, 'Asia/Taipei', 'yyyy/MM/dd'); };
  if (/\.csv$/i.test(f.getName())) {
    var blob = f.getBlob(), text = blob.getDataAsString('UTF-8');
    if (text.indexOf('�') >= 0) text = blob.getDataAsString('Big5');
    return normalizeRows(Utilities.parseCsv(text.replace(/^﻿/, '')), fmt);
  }
  var tmp = Drive.Files.copy({ name: '_暫存_' + f.getName(), mimeType: MimeType.GOOGLE_SHEETS }, f.getId());
  try {
    var sheet = SpreadsheetApp.openById(tmp.id).getSheets()[0];
    return normalizeRows(sheet.getDataRange().getValues(), fmt);
  } finally {
    DriveApp.getFileById(tmp.id).setTrashed(true);
  }
}

function moveTo(file, parent, name, sub) {
  var dir = childFolder(parent, name);
  if (sub) dir = childFolder(dir, sub);
  file.moveTo(dir);
}

// 「鼎新匯出」資料夾：有填 FOLDER_ID 就用；否則用 setup 記住的；都沒有就在「我的雲端硬碟」找或建立
function getRootFolder() {
  var props = PropertiesService.getScriptProperties();
  var id = CONFIG.FOLDER_ID || props.getProperty('FOLDER_ID');
  if (id) return DriveApp.getFolderById(id);
  var it = DriveApp.getRootFolder().getFoldersByName('鼎新匯出');
  var f = it.hasNext() ? it.next() : DriveApp.getRootFolder().createFolder('鼎新匯出');
  props.setProperty('FOLDER_ID', f.getId());
  return f;
}

// 檢查這個 Google 帳號能不能寫進 WMS 的資料庫
function checkWmsAccess() {
  var res = UrlFetchApp.fetch('https://firestore.googleapis.com/v1/projects/' + CONFIG.PROJECT_ID + '/databases/(default)/documents/erpInbox?pageSize=1', {
    muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
  });
  var code = res.getResponseCode();
  if (code === 200) return { ok: true };
  if (code === 403 || code === 401) return { ok: false, msg: '這個 Google 帳號沒有 WMS（Firebase 專案 ' + CONFIG.PROJECT_ID + '）的權限。請用建立 Firebase 專案的帳號執行，或在 Firebase 主控台 → 專案設定 → 使用者和權限，把這個帳號加成「編輯者」。' };
  return { ok: false, msg: '連線錯誤（' + code + '）：' + res.getContentText().slice(0, 200) };
}

function childFolder(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function notify(subject, body) {
  var to = CONFIG.NOTIFY_EMAIL || Session.getEffectiveUser().getEmail();
  if (to) MailApp.sendEmail(to, subject, body);
}

// 第一次設定時執行一次：建立「每 10 分鐘執行」的觸發條件
function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'syncErpReports') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncErpReports').timeBased().everyMinutes(10).create();
  console.log('✅ 已設定：每 10 分鐘自動檢查一次');
}
