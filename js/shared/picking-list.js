// ============================================================
// js/shared/picking-list.js — 依波次彙總產生揀貨清單（桌機版與手機版共用）
// 先進先出（效期早的先揀），同品項依效期排序；庫存不足的項目標記 shortage
// ============================================================

window.buildWavePickingList = function(wave, pallets) {
    const pickingList = [];

    (wave.summary || []).forEach(item => {
        let needed = item.totalQty;
        const productName = item.productName;
        const spec = item.spec || '';

        const matchingPallets = pallets.filter(p => {
            const pName = p.productName || '';
            const pSpec = p.spec || '';
            // 規格：訂單沒填規格時不限；有填時棧板規格不能是空的，且需互相包含
            return pName === productName &&
                (spec === '' || (pSpec !== '' && (pSpec.includes(spec) || spec.includes(pSpec))));
        }).sort((a, b) => {
            const dateA = window.normalizeDateValue(a.expiryDate || a.expDate) || '9999-12-31';
            const dateB = window.normalizeDateValue(b.expiryDate || b.expDate) || '9999-12-31';
            return dateA.localeCompare(dateB);
        });

        matchingPallets.forEach(pallet => {
            if (needed <= 0) return;

            const available = parseInt(pallet.quantity) || 0;
            const pick = Math.min(available, needed);

            if (pick > 0) {
                pickingList.push({
                    id: pallet.palletId + '-' + item.productName,
                    palletId: pallet.palletId,
                    locationId: pallet.locationId,
                    productName: pallet.productName,
                    spec: pallet.spec || '',
                    batchNo: pallet.batchNo || '',
                    expDate: pallet.expDate || '',
                    pickQty: pick,
                    availableQty: available,
                    orders: item.orders,  // 需要這個品項的訂單列表
                    completed: false
                });
                needed -= pick;
            }
        });

        if (needed > 0) {
            pickingList.push({
                id: 'shortage-' + item.productName,
                palletId: '-',
                locationId: '⚠️ 庫存不足',
                productName: item.productName,
                spec: item.spec || '',
                batchNo: '',
                pickQty: needed,
                availableQty: 0,
                orders: item.orders,
                completed: false,
                shortage: true
            });
        }
    });

    (wave.completedItems || []).forEach(itemId => {
        const item = pickingList.find(p => p.id === itemId);
        if (item) item.completed = true;
    });

    pickingList.sort(function(a, b) {
        if (a.shortage && !b.shortage) return 1;
        if (!a.shortage && b.shortage) return -1;

        // 儲位格式：倉-區-排-層（例如 I-A-01-3F），依揀貨動線排序：倉 → 區 → 排 → 層（低層先）
        var parseLocation = function(loc) {
            var parts = String(loc || '').split('-');
            if (parts.length < 4) return { warehouse: 'Z', zone: 'Z', row: 999, level: 9 };
            return {
                warehouse: parts[0].toUpperCase(),
                zone: parts[1].toUpperCase(),
                row: parseInt(parts[2], 10) || 999,
                level: parseInt(parts[3], 10) || 9
            };
        };

        var locA = parseLocation(a.locationId);
        var locB = parseLocation(b.locationId);

        if (locA.warehouse !== locB.warehouse) return locA.warehouse.localeCompare(locB.warehouse);
        if (locA.zone !== locB.zone) return locA.zone.localeCompare(locB.zone);
        if (locA.row !== locB.row) return locA.row - locB.row;
        return locA.level - locB.level;
    });

    return pickingList;
};

// ============================================================
// 完成波次（桌機與手機共用）：扣庫存、訂單標記出貨、波次標記完成、寫異動記錄，
// 全部在同一筆交易裡。任何一板庫存不足或波次已被別人完成，就整筆取消。
// 未揀的項目（含缺貨）記在 wave.shortages，留下缺貨記錄。
// 回傳完成時間；失敗時丟出錯誤（庫存與訂單都不會變動）。
// ============================================================
window.completeWaveTx = async function(wave, pickingList, pallets) {
    const db = window.db;
    const pickedItems = pickingList.filter(i => i.completed && !i.shortage);
    if (pickedItems.length === 0) throw new Error('尚未揀貨任何項目');

    const missing = [];
    const changes = [];
    pickedItems.forEach(item => {
        const pallet = pallets.find(p => p.palletId === item.palletId);
        if (!pallet || !pallet.id) { missing.push(item.palletId || item.productName); return; }
        changes.push({
            ref: db.collection('pallets').doc(pallet.id),
            delta: -(parseInt(item.pickQty) || 0),
            deleteWhenEmpty: true,
            label: item.palletId
        });
    });
    if (missing.length > 0) {
        throw new Error('找不到以下棧板（可能已被移動或出庫）：' + missing.slice(0, 10).join('、'));
    }

    const shortages = pickingList.filter(i => !i.completed || i.shortage).map(i => ({
        productName: i.productName || '',
        spec: i.spec || '',
        qty: parseInt(i.pickQty) || 0,
        reason: i.shortage ? '庫存不足' : '未揀'
    }));

    const waveRef = wave.id ? db.collection('waves').doc(wave.id) : null;
    const orderIds = [];
    (wave.orders || []).forEach(order => {
        const oid = order.id || order.orderId;
        if (oid && orderIds.indexOf(oid) === -1) orderIds.push(oid);
    });
    const orderRefs = orderIds.map(oid => db.collection('salesOrders').doc(oid));
    const completedAt = new Date().toISOString();

    await window.runStockTransaction({
        changes: changes,
        reads: (waveRef ? [waveRef] : []).concat(orderRefs),
        validate: function(results, readSnaps) {
            if (waveRef && readSnaps[0].exists && readSnaps[0].data().status === 'done') {
                throw new Error('此波次已經完成過，不能重複扣庫存');
            }
        },
        updates: function(results, readSnaps) {
            const ups = [];
            const orderSnaps = waveRef ? readSnaps.slice(1) : readSnaps;
            orderSnaps.forEach((snap, idx) => {
                if (snap.exists) {
                    ups.push({ ref: orderRefs[idx], data: { status: 'shipped', shippedAt: completedAt, waveNo: wave.waveNo } });
                }
            });
            if (waveRef && readSnaps[0].exists) {
                ups.push({ ref: waveRef, data: { status: 'done', completedAt: completedAt, shortages: shortages } });
            }
            return ups;
        },
        logs: function() {
            return pickedItems.map(item => ({
                type: 'outbound',
                productName: item.productName,
                spec: item.spec,
                quantity: item.pickQty,
                quantityChange: -item.pickQty,
                locationId: item.locationId,
                batchNo: item.batchNo,
                palletId: item.palletId,
                note: '波次揀貨 ' + wave.waveNo
            }));
        }
    });
    return completedAt;
};
