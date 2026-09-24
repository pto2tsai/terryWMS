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

    var palletIds = {};
    var orderFixes = 0;
    // 已經入帳過的單：看入庫異動記錄（棧板可能已經出完貨被刪掉，只看現有棧板會誤判成沒入帳，又被放回待入帳）
    var logSnap = await window.db.collection('inventoryLogs').get();
    var postedIds = {};
    logSnap.forEach(function(d) { var l = d.data(); if (l.type === 'inbound' && l.palletId) postedIds[l.palletId] = true; });
    for (var coll of ['pallets', 'externalStock', 'inboundOrders']) {
        var snap = await window.db.collection(coll).get();
        var changed = 0;
        snap.forEach(function(d) {
            var orig = d.data();
            if (coll === 'pallets' && orig.palletId) palletIds[orig.palletId] = true;
            var norm = window.normalizeStockRecord(Object.assign({}, orig));
            var update = {};
            ['expiryDate', 'expDate', 'quantity'].forEach(function(f) {
                if (norm[f] !== undefined && !sameValue(orig[f], norm[f])) update[f] = norm[f];
            });
            if (coll === 'inboundOrders') {
                // 舊版「重新送審」把狀態改成 pending_approval：單子從待核准、待入帳兩邊都消失
                if (orig.status === 'pending_approval') {
                    update.approvalStatus = 'pending';
                    update.status = (palletIds[orig.docNo] || postedIds[orig.docNo]) ? 'completed' : 'pending';
                }
                // 舊版外倉入庫單停在「待執行」：建立時已加到外倉庫存，不能再入帳到本倉
                if (orig.isExternal && orig.status === 'pending') update.status = 'completed';
                if (update.status || update.approvalStatus) orderFixes++;
            }
            if (Object.keys(update).length > 0) {
                changed++;
                pending.push({ ref: d.ref, data: update });
            }
        });
        report[coll] = { total: snap.size, changed: changed };
    }

    var logChanged = 0;
    logSnap.forEach(function(d) {
        var ts = d.data().timestamp;
        // 沒有 timestamp 的舊記錄（期初匯入等）：用 createdAt 補上，異動記錄查詢才查得到
        if (!ts && d.data().createdAt) ts = d.data().createdAt;
        else if (!ts) return;
        if (typeof ts !== 'string' || !d.data().timestamp) {
            var date = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
            if (!isNaN(date.getTime())) {
                logChanged++;
                pending.push({ ref: d.ref, data: { timestamp: date.toISOString() } });
            }
        }
    });
    report.inventoryLogs = { total: logSnap.size, changed: logChanged };
    report.orderFixes = orderFixes;

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
        html += '<div>其中入庫單狀態修正（卡住的重新送審單、外倉入庫單）：' + r.orderFixes + ' 筆</div>';
        if (out) out.innerHTML = html;
    } catch (e) {
        console.error('資料遷移失敗:', e);
        if (out) out.innerHTML = '<span class="text-red-400">❌ ' + e.message + '</span>';
    }
};

// ========== 清除「調撥出庫」重複計算（一次性，限管理員）==========
// 舊版調撥出庫會同時：①在 TEMP-OUT 建一板 ②加到外倉庫存，且沒有後續步驟清掉 ①，
// 同一批貨在本倉與外倉各算一次。外倉那筆是對的，這裡移除 ① 並留下調整記錄。
// 已被移到其他儲位的板不會自動刪除，只列出來請人工確認。
window.cleanupTransferOutDuplicates = async function(dryRun) {
    if (!window.currentUser || window.currentUser.role !== 'admin') {
        throw new Error('只有管理員可以執行');
    }
    var snap = await window.db.collection('pallets').where('source', '==', '調撥出庫').get();
    var toRemove = [];
    var needCheck = [];
    snap.forEach(function(d) {
        var p = Object.assign({ id: d.id, ref: d.ref }, d.data());
        if (p.locationId === 'TEMP-OUT') toRemove.push(p);
        else needCheck.push(p);
    });

    if (!dryRun) {
        for (var i = 0; i < toRemove.length; i += 200) {
            var batch = window.db.batch();
            toRemove.slice(i, i + 200).forEach(function(p) {
                batch.delete(p.ref);
                batch.set(window.db.collection('inventoryLogs').doc(), window.buildInventoryLogEntry({
                    type: 'adjust',
                    company: p.company || '',
                    productName: p.productName,
                    spec: p.spec || '',
                    batchNo: p.batchNo || '',
                    quantity: 0,
                    quantityChange: -(parseFloat(p.quantity) || 0),
                    locationId: 'TEMP-OUT',
                    palletId: p.palletId || p.id,
                    note: '清除調撥出庫重複計算（已計入外倉 ' + (p.targetWarehouse || p.targetWarehouseId || '') + '）'
                }));
            });
            await batch.commit();
        }
    }

    function brief(p) {
        return { palletId: p.palletId, productName: p.productName, spec: p.spec || '', quantity: p.quantity,
                 locationId: p.locationId, targetWarehouse: p.targetWarehouse || p.targetWarehouseId || '' };
    }
    return { dryRun: !!dryRun, removed: toRemove.map(brief), needCheck: needCheck.map(brief) };
};

window.runTransferOutCleanupUI = async function(dryRun) {
    var out = document.getElementById('dev-transfer-cleanup-result');
    if (!dryRun && !confirm('確定移除 TEMP-OUT 中「調撥出庫」重複計算的棧板？\n\n外倉庫存不受影響。建議先按「預覽」並先做一次備份。')) return;
    if (out) out.innerHTML = '<span class="text-yellow-400"><i class="fa-solid fa-spinner fa-spin mr-1"></i>處理中...</span>';
    try {
        var r = await window.cleanupTransferOutDuplicates(dryRun);
        var esc = window.escapeHtml || function(v) { return String(v == null ? '' : v); };
        var html = '<div class="text-white font-bold mb-1">' + (r.dryRun ? '預覽（尚未刪除）' : '✅ 已完成') + '：' +
            (r.dryRun ? '將移除 ' : '已移除 ') + r.removed.length + ' 板</div>';
        r.removed.slice(0, 30).forEach(function(p) {
            html += '<div>' + esc(p.palletId) + '　' + esc(p.productName) + ' ' + esc(p.spec) + '　' + esc(p.quantity) + ' 件 → ' + esc(p.targetWarehouse) + '</div>';
        });
        if (r.removed.length > 30) html += '<div>…另有 ' + (r.removed.length - 30) + ' 板</div>';
        if (r.needCheck.length > 0) {
            html += '<div class="text-amber-400 font-bold mt-2">⚠️ 以下 ' + r.needCheck.length + ' 板已被移出 TEMP-OUT，未自動處理，請人工確認：</div>';
            r.needCheck.forEach(function(p) {
                html += '<div>' + esc(p.palletId) + '　' + esc(p.productName) + '　' + esc(p.quantity) + ' 件 @ ' + esc(p.locationId) + '（原目標 ' + esc(p.targetWarehouse) + '）</div>';
            });
        }
        if (out) out.innerHTML = html;
    } catch (e) {
        console.error('清除失敗:', e);
        if (out) out.innerHTML = '<span class="text-red-400">❌ ' + (e.message || e) + '</span>';
    }
};
