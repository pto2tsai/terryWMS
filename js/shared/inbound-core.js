// ============================================================
// js/shared/inbound-core.js — 入庫單入帳（桌機版與手機版共用）
// 建立棧板、寫異動記錄、入庫單標記完成（可一併把入庫任務標記完成），全部在同一筆交易。
// 兩人同時入帳同一張單時只會成功一次，另一人會收到 code = 'ALREADY_POSTED' 的錯誤。
// ============================================================

window.isValidStorageLocation = function(loc) {
    loc = String(loc || '').trim();
    return /^[IJK]-[A-H]-\d{2}-[123]F$/.test(loc) || /^(TEMP-IN|TEMP-OUT|[A-D]00|[A-D]99|OTHER)$/.test(loc);
};

// orderId：inboundOrders 文件 ID；loc：實際放置的儲位
// opts.taskRef：入庫任務（inboundTasks）的文件參照，一併標記完成
// opts.note：異動記錄備註
window.postInboundOrderTx = async function(orderId, loc, opts) {
    opts = opts || {};
    loc = window.formatLocationId(loc);   // 簡碼 IA011 → I-A-01-1F
    if (!window.isValidStorageLocation(loc)) throw new Error('儲位格式不正確：' + (loc || '空白'));
    var db = window.db;
    var orderRef = db.collection('inboundOrders').doc(orderId);
    var palletRef = db.collection('pallets').doc();
    var nowIso = new Date().toISOString();
    var who = window.currentUser ? (window.currentUser.email || '') : '';

    return db.runTransaction(async function(tx) {
        var snap = await tx.get(orderRef);
        if (!snap.exists) {
            var gone = new Error('入庫單已不存在（可能已被刪除）');
            gone.code = 'ORDER_MISSING';
            throw gone;
        }
        var order = snap.data();
        if (order.status === 'completed') {
            var dup = new Error('此入庫單已經入帳過了');
            dup.code = 'ALREADY_POSTED';
            dup.order = order;
            throw dup;
        }
        if (order.isExternal) {
            var ext = new Error('這是外倉入庫單，建立時已加到外倉庫存，不能再入帳到本倉');
            ext.code = 'EXTERNAL_ORDER';
            throw ext;
        }
        var palletId = order.docNo || order.orderNo || palletRef.id;
        var exp = window.normalizeDateValue(order.expiryDate || order.expDate);
        var pallet = {
            palletId: palletId,
            company: order.company || '崇文',
            productCode: order.productCode || '',
            productName: order.productName,
            spec: order.spec || '',
            batchNo: order.batchNo || '',
            expDate: exp,
            expiryDate: exp,
            quantity: parseFloat(order.quantity) || 0,
            locationId: loc,
            category: order.type || order.category || 'Raw',
            vendor: order.vendor || '',
            source: order.source || 'Inbound',
            inboundDate: nowIso,
            createdAt: nowIso,
            status: 'Available'
        };
        // 不定重品：保留重量
        if (parseFloat(order.totalWeight) > 0) {
            pallet.totalWeight = parseFloat(order.totalWeight);
            pallet.unitWeight = parseFloat(order.unitWeight) || 0;
            pallet.productType = order.productType || '';
        }
        tx.set(palletRef, window.normalizeStockRecord(pallet));
        tx.set(db.collection('inventoryLogs').doc(), window.buildInventoryLogEntry({
            type: 'inbound',
            company: pallet.company,
            productName: order.productName,
            spec: order.spec || '',
            quantity: pallet.quantity,
            quantityChange: pallet.quantity,
            weight: pallet.totalWeight || 0,
            weightChange: pallet.totalWeight || 0,
            vendor: pallet.vendor || '',
            locationId: loc,
            batchNo: order.batchNo || '',
            palletId: palletId,
            expDate: exp,
            note: opts.note || ('入庫 - ' + (order.vendor || order.source || '')),
            orderId: orderId
        }));
        tx.update(orderRef, { status: 'completed', locationId: loc, completedAt: nowIso, completedBy: who });
        if (opts.taskRef) {
            tx.update(opts.taskRef, { status: 'done', confirmedAt: nowIso, confirmedBy: who, confirmedLocation: loc });
        }
        return { palletId: palletId, palletDocId: palletRef.id, loc: loc, order: order };
    });
};
