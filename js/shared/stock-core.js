// ============================================================
// js/shared/stock-core.js — 庫存交易核心（桌機版與手機版共用）
// 需要：window.db（Firestore compat）、js/shared/data-format.js
// 選用：window.getOperatorName、window.currentUser、window.serverTimestamp
// ============================================================

window.buildInventoryLogEntry = function(data) {
    var operator = data.operator || (window.getOperatorName ? window.getOperatorName() : 'system');
    var entry = {
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
    // 登入帳號（安全規則會驗證必須是本人，不能冒用他人名義）
    var authUser = window.auth && window.auth.currentUser;
    var email = (authUser && authUser.email) || (window.currentUser && window.currentUser.email) || '';
    if (email) entry.operatorEmail = String(email).toLowerCase();
    if (data.vendor) entry.vendor = data.vendor;   // 入庫記錄帶廠商（入庫報表依廠商統計）
    return entry;
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
                var upd = { quantity: r.after };
                // 不定重品：數量變動時總重量照比例調整（揀出一半就扣一半重量）
                var w = parseFloat(r.data.totalWeight) || 0;
                if (w > 0 && r.before > 0 && r.after !== r.before && !('totalWeight' in c.extra)) {
                    upd.totalWeight = Math.round(w * r.after / r.before * 10) / 10;
                    r.weightAfter = upd.totalWeight;
                }
                tx.update(c.ref, Object.assign(upd, c.extra));
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

// 數量從 before 變成 after 時，不定重品的總重量照比例調整（沒有重量的回傳 {}）
window.scaledWeight = function(data, before, after) {
    var w = parseFloat(data && data.totalWeight) || 0;
    if (w <= 0 || !(before > 0) || before === after) return {};
    return { totalWeight: Math.round(w * after / before * 10) / 10 };
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

// 合併前檢查：品名、規格、公司、批號不同 → 不能合併（丟錯）
// 批號不同不能合併：合併後只剩一個批號，另一批就追溯不到（召回時找不到貨）
window.checkMergeCompatible = function(source, target) {
    if (!source || !target) throw new Error('找不到要合併的棧板');
    var fields = [['productName', '品名'], ['spec', '規格'], ['company', '公司'], ['batchNo', '批號']];
    fields.forEach(function(f) {
        if (String(source[f[0]] || '') !== String(target[f[0]] || '')) {
            throw new Error('無法合併：' + f[1] + '不同（' + (source[f[0]] || '-') + ' / ' + (target[f[0]] || '-') + '）');
        }
    });
    // 留置區（品管留置／業務保留）的貨不能和一般的貨合併：合併後留置的貨就會被揀出去
    if (typeof window.isHoldLocation === 'function' && window.isHoldLocation(source.locationId) !== window.isHoldLocation(target.locationId)) {
        throw new Error('無法合併：一板在留置區（' + (window.isHoldLocation(source.locationId) ? source.locationId : target.locationId) + '），一板不在；要先把留置的貨放行');
    }
};

// 效期不同 → 可以合併，但要提醒（回傳提醒文字陣列）
window.mergeWarnings = function(source, target) {
    var warnings = [];
    var expA = normalizeDateKey(source.expiryDate || source.expDate);
    var expB = normalizeDateKey(target.expiryDate || target.expDate);
    if (expA !== expB) {
        warnings.push('效期不同（' + (expA || '-') + ' / ' + (expB || '-') + '），合併後以較早的效期為準');
    }
    return warnings;
};

function normalizeDateKey(v) {
    if (!v) return '';
    var d = v.toDate ? v.toDate() : new Date(v);
    if (isNaN(d.getTime())) return String(v);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

// 把 source 整板併入 target（同一交易：target 加上 source 的實際數量、刪除 source、寫記錄）
// opts.allowMixed：效期不同時仍合併（否則丟出 code = 'MERGE_MIXED' 的錯誤，讓畫面詢問使用者）；批號不同一律不能合併
window.mergePalletsTx = async function(sourceRef, targetRef, logExtra, opts) {
    if (sourceRef.path === targetRef.path) throw new Error('來源與目標是同一板，不能合併');
    return window.db.runTransaction(async function(tx) {
        var sSnap = await tx.get(sourceRef);
        var tSnap = await tx.get(targetRef);
        if (!sSnap.exists) throw new Error('來源棧板已不存在（可能已被其他人處理）');
        if (!tSnap.exists) throw new Error('目標棧板已不存在（可能已被其他人處理）');
        await readDispatchOp(tx, opts && opts.dispatch);
        var s = sSnap.data();
        var t = tSnap.data();
        checkExpectFrom(s, opts && opts.expectFrom, s.palletId);
        window.checkMergeCompatible(s, t);
        var warnings = window.mergeWarnings(s, t);
        if (warnings.length > 0 && !(opts && opts.allowMixed)) {
            var err = new Error('合併提醒：' + warnings.join('；'));
            err.code = 'MERGE_MIXED';
            err.warnings = warnings;
            throw err;
        }
        var sQty = parseFloat(s.quantity) || 0;
        var total = (parseFloat(t.quantity) || 0) + sQty;
        var sWeight = parseFloat(s.totalWeight) || 0;
        var totalWeight = Math.round(((parseFloat(t.totalWeight) || 0) + sWeight) * 10) / 10;
        var update = {
            quantity: total,
            mergedAt: new Date().toISOString(),
            mergedBy: window.currentUser ? window.currentUser.email : ''
        };
        var expS = normalizeDateKey(s.expiryDate || s.expDate);
        var expT = normalizeDateKey(t.expiryDate || t.expDate);
        if (expS && (!expT || expS < expT)) {
            // 混效期：以較早的效期為準，確保先進先出
            update.expiryDate = expS;
            update.expDate = expS;
        }
        if (totalWeight > 0) {
            update.totalWeight = totalWeight;
            update.unitWeight = total > 0 ? Math.round(totalWeight / total * 100) / 100 : (t.unitWeight || 0);
        }
        markDispatchOp(tx, opts && opts.dispatch);
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
            note: '合併: ' + (s.palletId || sourceRef.id) + '(' + sQty + '件)' +
                (warnings.length > 0 ? '【' + warnings.join('；') + '】' : '')
        }, logExtra || {}, logExtra && logExtra.note && warnings.length > 0 ? { note: logExtra.note + '【' + warnings.join('；') + '】' } : {})));
        return { source: s, target: t, sourceQty: sQty, total: total, totalWeight: totalWeight };
    });
};

// 移動整板到新儲位（同一交易：確認棧板還在、更新儲位、寫記錄）
// 調度工單的一項操作：在同一筆交易裡確認這項還沒做過、工單還沒結束，並標記完成
// dispatch：{ ref: 工單文件參照, opId: 操作 ID }；先 readDispatchOp（讀）再 markDispatchOp（寫）
async function readDispatchOp(tx, dispatch) {
    if (!dispatch || !dispatch.ref) return null;
    var ds = await tx.get(dispatch.ref);
    if (!ds.exists) throw new Error('調度工單已不存在');
    var d = ds.data();
    if (['completed', 'partial', 'cancelled'].indexOf(d.status) >= 0) throw new Error('調度工單已經結束，不能再執行');
    if ((d.completedOps || []).indexOf(dispatch.opId) >= 0) {
        var e = new Error('這一項已經執行過了');
        e.code = 'OP_DONE';
        throw e;
    }
    return d;
}
function markDispatchOp(tx, dispatch) {
    if (!dispatch || !dispatch.ref) return;
    tx.update(dispatch.ref, { completedOps: firebase.firestore.FieldValue.arrayUnion(dispatch.opId), status: 'in_progress' });
}
// 棧板必須還在預期的儲位（調度工單：別人已經搬走就不能照單搬，系統會記錯位置）
function checkExpectFrom(p, expectFrom, label) {
    if (!expectFrom) return;
    var now = String(p.locationId || '').toUpperCase();
    if (now !== String(expectFrom).toUpperCase()) {
        throw new Error((label || '棧板') + ' 已經不在 ' + expectFrom + '（系統上在 ' + (now || '-') + '），請先確認實際位置');
    }
}

// 儲位一律大寫、去空白；只能搬到本倉貨架、暫存區、虛擬儲位（業務保留／臨時暫存／品管留置）
// 目標那一層已經滿了會先詢問（現場常有臨時堆放，按確定就照搬）；opts.skipCapacityCheck 可略過
// opts.expectFrom：棧板必須還在這個儲位；opts.dispatch：調度工單的操作（同一筆交易標記完成、防重複執行）
window.movePalletTx = async function(palletRef, toLocation, logExtra, opts) {
    toLocation = window.formatLocationId(toLocation);   // 簡碼 IA011 → I-A-01-1F
    if (!toLocation) throw new Error('請輸入目標儲位');
    if (!(window.isValidStorageLocation(toLocation) || /^V-(SALES|TEMP|QC)$/.test(toLocation))) {
        throw new Error('儲位格式不正確：' + toLocation + '（例如 I-A-01-1F）');
    }
    if (!(opts && opts.skipCapacityCheck) && typeof window.locationFullWarning === 'function') {
        var all = window.currentPallets ? window.currentPallets() : (window.pallets || []);
        var me = all.find(function(x) { return x.id === palletRef.id; });
        var warn = window.locationFullWarning(toLocation, me, all);
        if (warn && !confirm(warn + '\n\n確定還是要放到 ' + toLocation + ' 嗎？')) {
            var cancel = new Error('已取消移板');
            cancel.code = 'CANCELLED';
            throw cancel;
        }
    }
    return window.db.runTransaction(async function(tx) {
        var snap = await tx.get(palletRef);
        await readDispatchOp(tx, opts && opts.dispatch);
        if (!snap.exists) throw new Error('棧板已不存在（可能已被其他人處理）');
        var p = snap.data();
        checkExpectFrom(p, opts && opts.expectFrom, p.palletId);
        markDispatchOp(tx, opts && opts.dispatch);
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

// 合併並在需要時詢問：效期不同會跳 confirm，按確定才合併；按取消丟出「已取消」
window.mergePalletsConfirm = async function(sourceRef, targetRef, logExtra, opts) {
    try {
        return await window.mergePalletsTx(sourceRef, targetRef, logExtra, opts);
    } catch (e) {
        if (e.code !== 'MERGE_MIXED') throw e;
        if (!confirm('⚠️ ' + e.warnings.join('\n') + '\n\n確定仍要合併嗎？')) {
            var cancel = new Error('已取消合併');
            cancel.code = 'CANCELLED';
            throw cancel;
        }
        return window.mergePalletsTx(sourceRef, targetRef, logExtra, Object.assign({}, opts || {}, { allowMixed: true }));
    }
};

// ========== 每日庫存板數快照（倉租用）==========
// 每天第一位登入的人記一次各公司在本倉（I/J/K）的板數；倉租照每天實際板數加總（板天）
// 同一天只會記一次（已有就不覆蓋）；寫入失敗不影響作業
window.countOwnPallets = function(pallets) {
    var out = { '崇文': 0, '八方': 0 };
    (pallets || []).forEach(function(p) {
        if ((parseFloat(p.quantity) || 0) <= 0 || !/^[IJK]-/.test(String(p.locationId || ''))) return;
        if (out[p.company] === undefined) out[p.company] = 0;
        out[p.company]++;
    });
    return out;
};
window.recordDailyStockSnapshot = async function(pallets) {
    try {
        var today = new Date().toLocalYMD();
        var ref = window.db.collection('stockSnapshots').doc(today);
        await window.db.runTransaction(async function(tx) {
            var snap = await tx.get(ref);
            if (snap.exists) return;
            tx.set(ref, {
                date: today,
                pallets: window.countOwnPallets(pallets),
                createdAt: new Date().toISOString(),
                createdBy: window.currentUser ? (window.currentUser.email || '') : ''
            });
        });
    } catch (e) { console.warn('每日板數快照未記錄：', e.message); }
};

// 外倉庫存是否同一批：同倉、同公司、同品名／規格／批號／效期才能合併或扣減
window.sameExternalLot = function(s, d) {
    var exp = function(x) { return window.normalizeDateValue(x.expiryDate || x.expDate) || ''; };
    return (s.warehouseId || '') === (d.warehouseId || '') && (s.company || '') === (d.company || '') &&
        (s.productName || '') === (d.productName || '') && (s.spec || '') === (d.spec || '') &&
        (s.batchNo || '') === (d.batchNo || '') && exp(s) === exp(d);
};
