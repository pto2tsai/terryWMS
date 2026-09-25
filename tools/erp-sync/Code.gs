// ============================================================
// 鼎新報表自動匯入（Google Apps Script，跑在 Google 雲端）
//
// 做的事：每 10 分鐘看一次 Google 雲端硬碟的「鼎新匯出」資料夾，
//   有新的 Excel／CSV 就依檔名認出是哪一種報表，整份存進 WMS 的資料庫（erpInbox），
//   處理完把檔案搬到「已匯入/年-月」；看不懂或失敗的搬到「匯入失敗」並寄信通知。
// 訂單（每日客戶銷貨明細表）由 WMS 電腦版接手：匯入訂單、依物流商建好波次。
//
// 設定方式請看 docs/ERP報表自動匯入設定.md
// ============================================================

// ---------- 要改的設定 ----------
var CONFIG = {
  FOLDER_ID: '請貼上「鼎新匯出」資料夾的 ID',   // 資料夾網址 folders/ 後面那一串
  PROJECT_ID: 'terrywms-2345f',                  // Firebase 專案 ID
  NOTIFY_EMAIL: '',                              // 失敗通知寄給誰（空白＝寄給執行這支程式的帳號）
  SETTLE_MINUTES: 2                              // 檔案修改後幾分鐘內先不處理（等同步完成）
};

// ---------- 報表種類：依檔名認（由上往下比對，先比對到的算）----------
// sensitive：含金額／帳款，只有主管、財務、管理員看得到
// process：要 WMS 接手處理（訂單）；其他只存檔、可檢視下載
var REPORTS = [
  { type: 'customer_sales_monthly', label: '每月客戶銷貨明細表', keys: ['每月客戶銷貨明細'], sensitive: true },
  { type: 'sales_daily', label: '每日客戶銷貨明細表', keys: ['每日客戶銷貨明細', '客戶銷貨明細', '銷貨明細'], process: true },
  { type: 'product_sales_monthly', label: '商品銷貨期報表', keys: ['商品銷貨'], sensitive: true },
  { type: 'ar_monthly', label: '應收帳款明細表', keys: ['應收帳款'], sensitive: true },
  { type: 'external_stock', label: '外倉庫存表', keys: ['外倉庫存'] },
  { type: 'stock_daily', label: '庫存明細表', keys: ['庫存明細'] },
  { type: 'batch_daily', label: '批號明細表', keys: ['批號明細'] },
  { type: 'material_issue', label: '領料明細表', keys: ['領料明細'] }
];

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
function buildInboxWrites(projectId, report, file, rows, nowIso) {
  var base = 'projects/' + projectId + '/databases/(default)/documents/erpInbox/';
  var id = inboxId(report, file.id, file.modified);
  var chunks = chunkRows(rows);
  var head = {
    type: report.type,
    label: report.label,
    fileName: file.name,
    driveFileId: file.id,
    fileModified: file.modified,
    company: detectCompany(file.name),
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
  var folder = DriveApp.getFolderById(CONFIG.FOLDER_ID);
  var files = folder.getFiles();
  var now = new Date();
  var results = [];
  while (files.hasNext()) {
    var f = files.next();
    if (!/\.(xlsx|xls|csv)$/i.test(f.getName())) continue;
    if (now - f.getLastUpdated() < CONFIG.SETTLE_MINUTES * 60000) continue;   // 還在同步，下次再處理
    try {
      results.push(importOneFile(f));
      moveTo(f, folder, '已匯入', Utilities.formatDate(now, 'Asia/Taipei', 'yyyy-MM'));
    } catch (e) {
      results.push('❌ ' + f.getName() + '：' + e.message);
      moveTo(f, folder, '匯入失敗');
      notify('鼎新報表匯入失敗：' + f.getName(), f.getName() + '\n\n' + e.message + '\n\n檔案已搬到「匯入失敗」資料夾。修正後放回「鼎新匯出」資料夾就會再匯入。');
    }
  }
  if (results.length) console.log(results.join('\n'));
}

function importOneFile(f) {
  var report = detectReport(f.getName());
  if (!report) throw new Error('看不出是哪一種報表。檔名要包含報表名稱，例如「庫存明細表」「每日客戶銷貨明細表」。');
  var rows = readRows(f);
  if (rows.length === 0) throw new Error('檔案是空的');
  var file = { id: f.getId(), name: f.getName(), modified: f.getLastUpdated().toISOString() };
  var built = buildInboxWrites(CONFIG.PROJECT_ID, report, file, rows, new Date().toISOString());
  var res = UrlFetchApp.fetch('https://firestore.googleapis.com/v1/projects/' + CONFIG.PROJECT_ID + '/databases/(default)/documents:commit', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify({ writes: built.writes })
  });
  var code = res.getResponseCode();
  if (code === 409 || (code === 400 && /exists/i.test(res.getContentText()))) return '（已經匯入過）' + f.getName();
  if (code !== 200) throw new Error('寫入 WMS 失敗（' + code + '）：' + res.getContentText().slice(0, 300));
  return '✅ ' + report.label + '：' + f.getName() + '（' + rows.length + ' 列）';
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
