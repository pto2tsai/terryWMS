// ============================================================
// js/shared/data-format.js — 資料格式工具（桌機版與手機版共用）
// 必須在 firebase-init.js 之前載入
// ============================================================

// ========== 資料格式統一 ==========
// 效期欄位歷史上有 expDate / expiryDate 兩種名稱，格式有 Timestamp、Date、
// 'YYYY/MM/DD'、'YYYY-MM-DD'、ISO 時間字串。一律轉成本地日期 'YYYY-MM-DD'，
// 並同時放在 expiryDate 與 expDate，讓新舊程式都讀得到。
function pad2(n) { return (n < 10 ? '0' : '') + n; }

window.normalizeDateValue = function(v) {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'object' && typeof v.toDate === 'function') v = v.toDate();
    if (v instanceof Date) {
        if (isNaN(v.getTime())) return '';
        return v.getFullYear() + '-' + pad2(v.getMonth() + 1) + '-' + pad2(v.getDate());
    }
    if (typeof v === 'object' && typeof v.seconds === 'number') {
        return window.normalizeDateValue(new Date(v.seconds * 1000));
    }
    if (typeof v === 'number') {
        // Excel 日期序號（1900 系統）
        if (v > 20000 && v < 80000) return window.normalizeDateValue(new Date(Math.round((v - 25569) * 86400000) + new Date().getTimezoneOffset() * 60000));
        return window.normalizeDateValue(new Date(v));
    }
    var s = String(v).trim();
    var m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
    if (m) return m[1] + '-' + pad2(parseInt(m[2], 10)) + '-' + pad2(parseInt(m[3], 10));
    var d = new Date(s);
    if (!isNaN(d.getTime())) return window.normalizeDateValue(d);
    return s;
};

// 本地日期 'YYYY-MM-DD'（取代 toISOString().split('T')[0]：那是 UTC 日期，台灣早上 8 點前會變成前一天）
Date.prototype.toLocalYMD = function() {
    return this.getFullYear() + '-' + pad2(this.getMonth() + 1) + '-' + pad2(this.getDate());
};

// 本地日期區間 → UTC ISO 字串（異動記錄的 timestamp 是 UTC ISO，比較前要先換算）
window.localDayStartISO = function(ymd) { return new Date(ymd + 'T00:00:00').toISOString(); };
window.localDayEndISO = function(ymd) { return new Date(ymd + 'T23:59:59.999').toISOString(); };

// 統一單筆庫存資料（棧板、外倉庫存、入庫單）：效期欄位與數量型別
window.normalizeStockRecord = function(rec) {
    if (!rec || typeof rec !== 'object') return rec;
    var exp = window.normalizeDateValue(rec.expiryDate || rec.expDate);
    if (exp) {
        rec.expiryDate = exp;
        rec.expDate = exp;
    }
    if (typeof rec.quantity === 'string' && rec.quantity.trim() !== '' && !isNaN(Number(rec.quantity))) {
        rec.quantity = Number(rec.quantity);
    }
    // 品號：沒填時依品名＋規格從品項主檔帶入（品名相同且主檔只有一筆時也帶入）
    if (!rec.productCode && rec.productName && Array.isArray(window.productMasterData)) {
        var sameName = window.productMasterData.filter(function(p) { return p.name === rec.productName && p.code; });
        var exact = sameName.filter(function(p) { return (p.spec || '') === (rec.spec || ''); });
        var pm = exact.length === 1 ? exact[0] : (sameName.length === 1 ? sameName[0] : null);
        if (pm) rec.productCode = pm.code;
    }
    return rec;
};

var NORMALIZED_COLLECTIONS = ['pallets', 'externalStock', 'inboundOrders'];
function normalizeForWrite(ref, data) {
    var coll = ref && (ref.parent ? ref.parent.id : ref.id);
    if (NORMALIZED_COLLECTIONS.indexOf(coll) === -1 || !data) return data;
    return window.normalizeStockRecord(Object.assign({}, data));
}
