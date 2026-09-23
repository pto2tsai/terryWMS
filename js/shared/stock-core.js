// ============================================================
// js/shared/stock-core.js — 庫存交易核心（桌機版與手機版共用）
// 需要：window.db（Firestore compat）、js/shared/data-format.js
// 選用：window.getOperatorName、window.currentUser、window.serverTimestamp
// ============================================================

window.buildInventoryLogEntry = function(data) {
    var operator = data.operator || (window.getOperatorName ? window.getOperatorName() : 'system');
    return {
        timestamp: new Date().toISOString(),
        type: data.type,
        company: data.company || '',
        productName: data.productName || '',
        spec: data.spec || '',
        quantity: data.quantity || 0,
        quantityChange: data.quantityChange || 0,
        weight: data.weight || 0,
        weightChange: data.weightChange || 0,
        locationId: data.locationId || '',
        fromLocation: data.fromLocation || '',
        toLocation: data.toLocation || '',
        batchNo: data.batchNo || '',
        palletId: data.palletId || '',
        expDate: data.expDate || '',
        note: data.note || '',
        operator: operator,
        orderId: data.orderId || '',
        createdAt: window.serverTimestamp ? window.serverTimestamp() : new Date()
    };
};

// ========== 庫存交易（stock transaction）==========
// 在同一筆 Firestore 交易裡：讀最新數量 → 檢查 → 寫入數量 → 寫異動記錄。
// 兩個人同時操作同一板時，Firestore 會自動重試，不會互相覆蓋；
// 任何一步失敗，整筆都不會寫入（不會只扣一半）。
//
// changes: [{ ref, delta, deleteWhenEmpty, extra, label }]
//   delta 為數量增減；同一個 ref 出現多次會先合併
// creates: [{ ref, data }]  同一交易內新增的文件
// reads:   [ref]  額外要讀的文件（例如波次狀態），交給 validate / updates 使用
// validate: function(results, readSnaps)  丟出錯誤即取消整筆交易
// updates: [{ ref, data }] 或 function(results, readSnaps) → 同格式（一般欄位更新）
// logs:    function(results) → [logData...]（results 以 ref.path 為 key）
window.runStockTransaction = async function(opts) {
    var changes = opts.changes || [];
    var merged = {};
    var order = [];
    changes.forEach(function(c) {
        var key = c.ref.path;
        if (!merged[key]) {
            merged[key] = { ref: c.ref, delta: 0, deleteWhenEmpty: false, extra: {}, label: c.label };
            order.push(key);
        }
        merged[key].delta += (c.delta || 0);
        if (c.deleteWhenEmpty) merged[key].deleteWhenEmpty = true;
        Object.assign(merged[key].extra, c.extra || {});
    });

    return window.db.runTransaction(async function(tx) {
        var readSnaps = await Promise.all((opts.reads || []).map(function(ref) { return tx.get(ref); }));
        var snaps = await Promise.all(order.map(function(key) { return tx.get(merged[key].ref); }));
        var results = {};
        snaps.forEach(function(snap, i) {
            var c = merged[order[i]];
            if (!snap.exists) {
                throw new Error('資料已不存在（可能已被其他人處理）：' + (c.label || c.ref.id));
            }
            var data = snap.data();
            var before = parseFloat(data.quantity) || 0;
            var after = before + c.delta;
            if (after < 0) {
                throw new Error('庫存不足：' + (data.productName || c.label || c.ref.id) +
                    ' 目前 ' + before + '，需要 ' + (-c.delta));
            }
            results[order[i]] = { ref: c.ref, data: data, before: before, after: after };
        });

        if (opts.validate) opts.validate(results, readSnaps);

        order.forEach(function(key) {
            var c = merged[key];
            var r = results[key];
            if (r.after === 0 && c.deleteWhenEmpty) {
                tx.delete(c.ref);
                r.deleted = true;
            } else {
                tx.update(c.ref, Object.assign({ quantity: r.after }, c.extra));
            }
        });

        (opts.creates || []).forEach(function(cr) { tx.set(cr.ref, normalizeForWrite(cr.ref, cr.data)); });

        var updates = typeof opts.updates === 'function' ? opts.updates(results, readSnaps) : (opts.updates || []);
        updates.forEach(function(u) { tx.update(u.ref, u.data); });

        var logs = opts.logs ? opts.logs(results) : [];
        logs.forEach(function(logData) {
            tx.set(window.db.collection('inventoryLogs').doc(), window.buildInventoryLogEntry(logData));
        });

        return results;
    });
};

// 找出棧板的文件參照：優先用文件 ID；只有板號時必須剛好找到一筆
window.resolvePalletRef = async function(docId, palletId, locationId) {
    if (docId) return window.db.collection('pallets').doc(docId);
    if (!palletId) throw new Error('缺少板號，無法確認要操作哪一板');
    var snap = await window.db.collection('pallets').where('palletId', '==', palletId).get();
    var docs = snap.docs;
    if (docs.length > 1 && locationId) {
        docs = docs.filter(function(d) { return d.data().locationId === locationId; });
    }
    if (docs.length === 0) throw new Error('找不到棧板 ' + palletId);
    if (docs.length > 1) throw new Error('板號 ' + palletId + ' 有 ' + docs.length + ' 筆重複，請先人工確認');
    return docs[0].ref;
};

// 合併前檢查：品名、規格、公司、批號、效期必須相同，且不能是同一板
window.checkMergeCompatible = function(source, target) {
    if (!source || !target) throw new Error('找不到要合併的棧板');
    var fields = [['productName', '品名'], ['spec', '規格'], ['company', '公司'], ['batchNo', '批號']];
    fields.forEach(function(f) {
        if (String(source[f[0]] || '') !== String(target[f[0]] || '')) {
            throw new Error('無法合併：' + f[1] + '不同（' + (source[f[0]] || '-') + ' / ' + (target[f[0]] || '-') + '）');
        }
    });
    var expA = normalizeDateKey(source.expiryDate || source.expDate);
    var expB = normalizeDateKey(target.expiryDate || target.expDate);
    if (expA !== expB) {
        throw new Error('無法合併：效期不同（' + (expA || '-') + ' / ' + (expB || '-') + '）');
    }
};

function normalizeDateKey(v) {
    if (!v) return '';
    var d = v.toDate ? v.toDate() : new Date(v);
    if (isNaN(d.getTime())) return String(v);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

// 把 source 整板併入 target（同一交易：target 加上 source 的實際數量、刪除 source、寫記錄）
window.mergePalletsTx = async function(sourceRef, targetRef, logExtra) {
    if (sourceRef.path === targetRef.path) throw new Error('來源與目標是同一板，不能合併');
    return window.db.runTransaction(async function(tx) {
        var sSnap = await tx.get(sourceRef);
        var tSnap = await tx.get(targetRef);
        if (!sSnap.exists) throw new Error('來源棧板已不存在（可能已被其他人處理）');
        if (!tSnap.exists) throw new Error('目標棧板已不存在（可能已被其他人處理）');
        var s = sSnap.data();
        var t = tSnap.data();
        window.checkMergeCompatible(s, t);
        var sQty = parseFloat(s.quantity) || 0;
        var total = (parseFloat(t.quantity) || 0) + sQty;
        var sWeight = parseFloat(s.totalWeight) || 0;
        var totalWeight = Math.round(((parseFloat(t.totalWeight) || 0) + sWeight) * 10) / 10;
        var update = {
            quantity: total,
            mergedAt: new Date().toISOString(),
            mergedBy: window.currentUser ? window.currentUser.email : ''
        };
        if (totalWeight > 0) {
            update.totalWeight = totalWeight;
            update.unitWeight = total > 0 ? Math.round(totalWeight / total * 100) / 100 : (t.unitWeight || 0);
        }
        tx.update(targetRef, update);
        tx.delete(sourceRef);
        tx.set(window.db.collection('inventoryLogs').doc(), window.buildInventoryLogEntry(Object.assign({
            type: 'merge',
            company: t.company || '',
            productName: t.productName,
            spec: t.spec || '',
            quantity: total,
            quantityChange: sQty,
            weight: totalWeight,
            weightChange: sWeight,
            locationId: t.locationId || '',
            fromLocation: s.locationId || '',
            toLocation: t.locationId || '',
            batchNo: t.batchNo || '',
            palletId: t.palletId || targetRef.id,
            note: '合併: ' + (s.palletId || sourceRef.id) + '(' + sQty + '件)'
        }, logExtra || {})));
        return { source: s, target: t, sourceQty: sQty, total: total, totalWeight: totalWeight };
    });
};

// 移動整板到新儲位（同一交易：確認棧板還在、更新儲位、寫記錄）
window.movePalletTx = async function(palletRef, toLocation, logExtra) {
    if (!toLocation) throw new Error('請輸入目標儲位');
    return window.db.runTransaction(async function(tx) {
        var snap = await tx.get(palletRef);
        if (!snap.exists) throw new Error('棧板已不存在（可能已被其他人處理）');
        var p = snap.data();
        tx.update(palletRef, {
            locationId: toLocation,
            movedAt: new Date().toISOString(),
            movedBy: window.currentUser ? window.currentUser.email : ''
        });
        tx.set(window.db.collection('inventoryLogs').doc(), window.buildInventoryLogEntry(Object.assign({
            type: 'move',
            company: p.company || '',
            productName: p.productName,
            spec: p.spec || '',
            quantity: p.quantity,
            quantityChange: 0,
            weight: p.totalWeight || 0,
            locationId: toLocation,
            fromLocation: p.locationId || '',
            toLocation: toLocation,
            batchNo: p.batchNo || '',
            palletId: p.palletId || palletRef.id
        }, logExtra || {})));
        return p;
    });
};
