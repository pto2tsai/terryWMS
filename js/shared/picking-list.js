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
