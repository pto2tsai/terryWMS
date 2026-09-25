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

// ========== 儲位簡碼 ==========
// 登打時不用打「-」：IA011 → I-A-01-1F、ia123 → I-A-12-3F、KE221 → K-E-22-1F（倉＋區＋排 1～2 碼＋層 1～3，最後的 F 可省略）
// tempin → TEMP-IN、vqc → V-QC；已經是標準格式的只轉大寫、去空白；其他看不懂的原樣（大寫）回傳，交給格式檢查擋下
var LOC_SPECIAL = { TEMPIN: 'TEMP-IN', TEMPOUT: 'TEMP-OUT', VQC: 'V-QC', VSALES: 'V-SALES', VTEMP: 'V-TEMP', OTHER: 'OTHER' };
window.formatLocationId = function(input) {
    var s = String(input == null ? '' : input).trim().toUpperCase().replace(/\s+/g, '');
    if (!s) return '';
    var flat = s.replace(/[^A-Z0-9]/g, '');
    if (LOC_SPECIAL[flat]) return LOC_SPECIAL[flat];
    var m = flat.match(/^([A-Z])([A-Z])(\d{1,2})([1-3])F?$/);
    if (m) return m[1] + '-' + m[2] + '-' + ('0' + m[3]).slice(-2) + '-' + m[4] + 'F';
    return s;
};
// 標準儲位 → 簡碼（印在儲位標籤上，照著打就好）：I-A-01-1F → IA011
window.locationShortCode = function(loc) {
    var m = /^([A-Z])-([A-Z])-(\d{2})-(\d)F$/.exec(String(loc || ''));
    return m ? m[1] + m[2] + m[3] + m[4] : '';
};

// 本地日期 'YYYY-MM-DD'（取代 toISOString().split('T')[0]：那是 UTC 日期，台灣早上 8 點前會變成前一天）
Date.prototype.toLocalYMD = function() {
    return this.getFullYear() + '-' + pad2(this.getMonth() + 1) + '-' + pad2(this.getDate());
};

// 距離某天還有幾天（以本地日期算：今天到期＝0、昨天到期＝-1；不受現在幾點影響）
window.daysUntil = function(v) {
    var ymd = window.normalizeDateValue(v);
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
    if (!m) return null;
    var t = new Date(); t.setHours(0, 0, 0, 0);
    return Math.round((new Date(+m[1], +m[2] - 1, +m[3]) - t) / 86400000);
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
    if (!data || coll === 'backups') return data;
    var out = window.sanitizeDeep ? window.sanitizeDeep(data) : data;
    if (NORMALIZED_COLLECTIONS.indexOf(coll) === -1) return out;
    return window.normalizeStockRecord(Object.assign({}, out));
}

// ========== 文字安全（XSS 防護）==========
// 畫面大量以 innerHTML / onclick 字串拼接資料。為了不必逐處修改，在資料層統一處理：
// 從 Firestore 讀出（以及寫入）的文字，把 < > " ' ` \ 換成全形字元。
// 畫面上看起來幾乎一樣，但無法再組成 HTML 標籤或跳出 onclick 的字串。
// backups、鼎新報表的分段（chunks）內容是 JSON 字串，轉換會破壞格式，所以排除（報表內容解開後再轉換）。
var SANITIZE_MAP = { '<': '＜', '>': '＞', '"': '＂', "'": '＇', '`': '｀', '\\': '＼' };
var SANITIZE_SKIP = { backups: true, chunks: true };

window.sanitizeText = function(s) {
    return typeof s === 'string' ? s.replace(/[<>"'`\\]/g, function(c) { return SANITIZE_MAP[c]; }) : s;
};

function isPlainObject(v) {
    if (!v || typeof v !== 'object') return false;
    var proto = Object.getPrototypeOf(v);
    return proto === Object.prototype || proto === null;
}

// 只處理一般物件、陣列、字串；Timestamp、FieldValue、DocumentReference 等保持原樣
window.sanitizeDeep = function(v) {
    if (typeof v === 'string') return window.sanitizeText(v);
    if (Array.isArray(v)) return v.map(window.sanitizeDeep);
    if (isPlainObject(v)) {
        var out = {};
        Object.keys(v).forEach(function(k) { out[k] = window.sanitizeDeep(v[k]); });
        return out;
    }
    return v;
};

(function patchSnapshotData() {
    if (!window.firebase || !firebase.firestore) return;
    [firebase.firestore.DocumentSnapshot, firebase.firestore.QueryDocumentSnapshot].forEach(function(Cls) {
        if (!Cls || !Cls.prototype || !Object.prototype.hasOwnProperty.call(Cls.prototype, 'data')) return;
        var orig = Cls.prototype.data;
        Cls.prototype.data = function(options) {
            var d = orig.call(this, options);
            var coll = this.ref && this.ref.parent ? this.ref.parent.id : '';
            if (!d || SANITIZE_SKIP[coll]) return d;
            return window.sanitizeDeep(d);
        };
    });
})();
