// ============================================================
// js/18-data-migration.js — 資料格式遷移
// 由原 app.js 第 25924–26001 行拆出；各檔依 index.html 的順序載入，共用全域（window）
// ============================================================
// ========== 資料格式遷移（一次性，限管理員）==========
// 把既有資料統一成目前的格式：
//   pallets / externalStock / inboundOrders：效期統一為 'YYYY-MM-DD' 並同時寫入 expiryDate、expDate；數量字串轉數字
//   inventoryLogs：timestamp 統一為 ISO 字串（現場掃描舊記錄是 Timestamp，日期查詢查不到）
// dryRun = true 只統計不寫入
window.migrateDataFormats = async function(dryRun) {
    if (!window.currentUser || window.currentUser.role !== 'admin') {
        throw new Error('只有管理員可以執行資料遷移');
    }
    var report = {};
    var pending = [];

    function sameValue(a, b) {
        return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
    }

    for (var coll of ['pallets', 'externalStock', 'inboundOrders']) {
        var snap = await window.db.collection(coll).get();
        var changed = 0;
        snap.forEach(function(d) {
            var orig = d.data();
            var norm = window.normalizeStockRecord(Object.assign({}, orig));
            var update = {};
            ['expiryDate', 'expDate', 'quantity'].forEach(function(f) {
                if (norm[f] !== undefined && !sameValue(orig[f], norm[f])) update[f] = norm[f];
            });
            if (Object.keys(update).length > 0) {
                changed++;
                pending.push({ ref: d.ref, data: update });
            }
        });
        report[coll] = { total: snap.size, changed: changed };
    }

    var logSnap = await window.db.collection('inventoryLogs').get();
    var logChanged = 0;
    logSnap.forEach(function(d) {
        var ts = d.data().timestamp;
        if (ts && typeof ts !== 'string') {
            var date = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
            if (!isNaN(date.getTime())) {
                logChanged++;
                pending.push({ ref: d.ref, data: { timestamp: date.toISOString() } });
            }
        }
    });
    report.inventoryLogs = { total: logSnap.size, changed: logChanged };

    if (!dryRun) {
        for (var i = 0; i < pending.length; i += 400) {
            var batch = window.db.batch();
            pending.slice(i, i + 400).forEach(function(p) { batch.update(p.ref, p.data); });
            await batch.commit();
        }
    }
    report.dryRun = !!dryRun;
    report.totalChanged = pending.length;
    return report;
};

window.runDataMigrationUI = async function(dryRun) {
    var out = document.getElementById('dev-migrate-result');
    if (!dryRun && !confirm('確定要把既有資料轉成統一格式？\n\n建議先按「預覽」確認筆數，並先做一次備份。')) return;
    if (out) out.innerHTML = '<span class="text-yellow-400"><i class="fa-solid fa-spinner fa-spin mr-1"></i>處理中...</span>';
    try {
        var r = await window.migrateDataFormats(dryRun);
        var names = { pallets: '庫存棧板', externalStock: '外倉庫存', inboundOrders: '入庫單', inventoryLogs: '異動記錄' };
        var html = '<div class="text-white font-bold mb-1">' + (r.dryRun ? '預覽（尚未寫入）' : '✅ 已完成') + '</div>';
        Object.keys(names).forEach(function(k) {
            html += '<div>' + names[k] + '：' + r[k].changed + ' / ' + r[k].total + ' 筆需要轉換</div>';
        });
        if (out) out.innerHTML = html;
    } catch (e) {
        console.error('資料遷移失敗:', e);
        if (out) out.innerHTML = '<span class="text-red-400">❌ ' + e.message + '</span>';
    }
};
