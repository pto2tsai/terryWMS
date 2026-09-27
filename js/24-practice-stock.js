// ============================================================
// js/24-practice-stock.js — 練習庫存：每天用鼎新的「批號庫存表」更新 OTHER 儲位的庫存
// 練習模式（還沒有儲位）時，所有庫存都放在 OTHER，讓現場先習慣用手機查庫存。
// 鼎新每天的批號庫存表進到 erpInbox（batch_daily）後，由 23-erp-inbox.js 呼叫 syncPracticeStock：
//   OTHER 的庫存改成跟鼎新一樣（同一品號＋批號用同一個板號，每天更新件數；鼎新沒有的刪掉）
//   只動 OTHER；放在真正儲位的板不碰。練習模式沒開時不動，只存檔。
// ============================================================

// 要放進 WMS 的鼎新庫別 → 公司（外倉、寄庫倉不放）
window.PRACTICE_WAREHOUSES = { '崇文一廠': '崇文', '八方一廠': '八方' };
window.PRACTICE_STOCK_LOC = 'OTHER';

// 讀鼎新「批號庫存（異動明細）表」：每頁都有表頭（品號、品名、規格、批號、庫別、庫存、單位），小計列沒有品號
// 回傳 { items: [{ company, productId, productName, spec, batchNo, quantity, unit, warehouse }], error }
window.parseErpBatchStock = function(rows) {
    var hi = -1;
    for (var i = 0; i < Math.min((rows || []).length, 30); i++) {
        var r = (rows[i] || []).map(function(v) { return String(v).trim(); });
        if (r.indexOf('品號') >= 0 && r.indexOf('批號') >= 0 && r.indexOf('庫別') >= 0) { hi = i; break; }
    }
    if (hi < 0) return { items: [], error: '看不懂這份批號庫存表：找不到「品號、批號、庫別」這幾欄' };
    var h = rows[hi].map(function(v) { return String(v).trim(); });
    var col = function(names) { for (var k = 0; k < names.length; k++) { var j = h.indexOf(names[k]); if (j >= 0) return j; } return -1; };
    var c = { id: col(['品號']), name: col(['品名']), spec: col(['規格']), batch: col(['批號']), wh: col(['庫別', '庫別名稱']), qty: col(['庫存', '庫存數量', '數量']), unit: col(['單位']) };
    if (c.qty < 0) return { items: [], error: '看不懂這份批號庫存表：找不到「庫存」數量欄' };
    var items = [];
    rows.slice(hi + 1).forEach(function(r) {
        var id = String(r[c.id] == null ? '' : r[c.id]).trim();
        if (!id || id === '品號') return;
        var company = window.PRACTICE_WAREHOUSES[String(r[c.wh] || '').trim()];
        if (!company) return;
        var q = parseFloat(String(r[c.qty]).replace(/,/g, ''));
        if (!(q > 0)) return;
        items.push({
            company: company, productId: id, productName: String(r[c.name] || '').trim(), spec: c.spec >= 0 ? String(r[c.spec] || '').trim() : '',
            batchNo: c.batch >= 0 ? String(r[c.batch] == null ? '' : r[c.batch]).trim() : '', quantity: Math.round(q * 1000) / 1000,
            unit: c.unit >= 0 ? String(r[c.unit] || '').trim() || '件' : '件', warehouse: String(r[c.wh]).trim()
        });
    });
    return { items: items, error: '' };
};

// 同一公司＋品號＋批號 → 固定的板號（每天更新同一板，現場看到的板號不會一直變）
window.practicePalletId = function(it) {
    var s = it.company + '|' + it.productId + '|' + it.batchNo, h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return 'PR' + ('0000000' + h.toString(36).toUpperCase()).slice(-7);
};

// 把 OTHER 的庫存改成跟鼎新一樣。回傳一行摘要
window.syncPracticeStock = async function(rows) {
    var parsed = window.parseErpBatchStock(rows);
    if (parsed.error) throw new Error(parsed.error);
    if (!parsed.items.length) throw new Error('這份批號庫存表裡沒有「' + Object.keys(window.PRACTICE_WAREHOUSES).join('、') + '」的庫存');
    var db = window.db, loc = window.PRACTICE_STOCK_LOC;
    // 同一品號＋批號出現兩次（不同頁）：件數加起來
    var want = {};
    parsed.items.forEach(function(it) {
        var id = window.practicePalletId(it);
        while (want[id] && (want[id].productId !== it.productId || want[id].batchNo !== it.batchNo || want[id].company !== it.company)) id += 'X';
        if (want[id]) want[id].quantity = Math.round((want[id].quantity + it.quantity) * 1000) / 1000;
        else want[id] = Object.assign({}, it);
    });
    var snap = await db.collection('pallets').where('locationId', '==', loc).get();
    var have = {};
    snap.forEach(function(d) { have[d.id] = d.data(); });
    var now = new Date().toISOString();
    var ops = [], added = 0, changed = 0, removed = 0;
    Object.keys(want).forEach(function(id) {
        var it = want[id], cur = have[id];
        if (cur && parseFloat(cur.quantity) === it.quantity && cur.productName === it.productName && (cur.spec || '') === it.spec) return;
        if (cur) changed++; else added++;
        ops.push({ ref: db.collection('pallets').doc(id), data: {
            palletId: id, company: it.company, productId: it.productId, productName: it.productName, spec: it.spec,
            quantity: it.quantity, unit: it.unit, locationId: loc, batchNo: it.batchNo, expiryDate: '', expDate: '',
            status: 'stored', source: 'erp-practice', practiceStock: true, erpWarehouse: it.warehouse, updatedAt: now,
            createdAt: cur && cur.createdAt ? cur.createdAt : now
        } });
    });
    Object.keys(have).forEach(function(id) {
        if (want[id]) return;
        removed++;
        ops.push({ ref: db.collection('pallets').doc(id), del: true });
    });
    for (var i = 0; i < ops.length; i += 400) {
        var b = db.batch();
        ops.slice(i, i + 400).forEach(function(o) { if (o.del) b.delete(o.ref); else b.set(o.ref, o.data); });
        await b.commit();
    }
    var by = {};
    Object.keys(want).forEach(function(id) { by[want[id].company] = (by[want[id].company] || 0) + 1; });
    return '練習庫存（' + loc + '）已更新成鼎新的數字：' + Object.keys(by).map(function(k) { return k + ' ' + by[k] + ' 筆'; }).join('、') +
        '（新增 ' + added + '、改件數 ' + changed + '、刪除 ' + removed + '）';
};

// ---------- 清空舊庫存（管理員；練習前用）----------
// 刪掉 OTHER 以外的所有棧板（之前測試或手動建的庫存），練習庫存（OTHER）留著。
// 刪之前先把「所有棧板」存一份雲端備份（備份與維護 → 雲端備份「列表」，可以還原回來）；每一板寫一筆異動記錄。
window.clearOldStock = async function() {
    var r = window.currentUser && window.currentUser.role;
    if (r !== 'admin') { alert('只有管理員可以清空庫存'); return; }
    var db = window.db;
    var snap = await db.collection('pallets').get();
    var all = [], old = [];
    snap.forEach(function(d) { all.push({ id: d.id, data: d.data() }); if (d.data().locationId !== window.PRACTICE_STOCK_LOC) old.push(d); });
    if (!old.length) { alert('除了練習庫存（OTHER）以外，沒有其他庫存，不用清空'); return; }
    var qty = old.reduce(function(t, d) { return t + (parseFloat(d.data().quantity) || 0); }, 0);
    if (!confirm('清空舊庫存？\n\n會刪掉 OTHER 以外的所有棧板：' + old.length + ' 板、共 ' + Math.round(qty * 1000) / 1000 + ' 件\n練習庫存（OTHER，' + (all.length - old.length) + ' 板）不會動\n\n刪之前會先自動存一份雲端備份，刪錯可以還原。')) return;
    if (prompt('確定要刪除，請輸入「清空」兩個字') !== '清空') { alert('沒有刪除'); return; }
    var now = new Date().toISOString(), backupId = 'before-clear-' + now.replace(/[:.]/g, '-');
    try {
        var ser = window.serializeFirestoreData || function(x) { return x; };
        var payload = { id: backupId, timestamp: now, version: '清空舊庫存前', collections: { pallets: all.map(function(p) { return { id: p.id, data: ser(p.data) }; }) } };
        await db.collection('backups').doc(backupId).set({ timestamp: now, version: '清空舊庫存前（只有棧板）', summary: { pallets: all.length }, data: JSON.stringify(payload) });
    } catch (e) { alert('❌ 備份失敗，沒有刪除：' + e.message); return; }
    try {
        for (var i = 0; i < old.length; i += 200) {
            var b = db.batch();
            old.slice(i, i + 200).forEach(function(d) {
                var p = d.data();
                b.delete(d.ref);
                b.set(db.collection('inventoryLogs').doc(), window.buildInventoryLogEntry({
                    type: 'adjust', palletId: p.palletId || d.id, company: p.company, productName: p.productName, spec: p.spec, batchNo: p.batchNo,
                    quantity: 0, quantityChange: -(parseFloat(p.quantity) || 0), locationId: p.locationId, note: '練習前清空舊庫存（備份 ' + backupId + '）'
                }));
            });
            await b.commit();
        }
    } catch (e) { alert('❌ 刪到一半失敗：' + e.message + '\n\n可以到「備份與維護 → 雲端備份 → 列表」還原「' + backupId + '」'); return; }
    alert('✅ 已清空舊庫存 ' + old.length + ' 板\n\n備份：' + backupId + '（在「備份與維護 → 雲端備份 → 列表」，刪錯可以還原）');
};
