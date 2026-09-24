// ============================================================
// m/js/stocktake.js — 盤點：掃板號或儲位 → 輸入實盤數 → 送出（有差異才調整）
// 每板一筆交易；掃描後到送出之間這板被別人異動過，就不覆蓋、請重盤（與桌機盤點相同）
// ============================================================
let stPallet = null;
const stToday = [];

window.pageInit.stocktake = function() { resetStocktake(); renderStToday(); };

window.resetStocktake = function() {
    stPallet = null;
    show('st-step1', true); show('st-step2', false);
    $('st-choices').innerHTML = '';
    $('st-qty').value = '';
    clearResult('st-result');
    scanNext('st-scan');
};

window.stScan = function() {
    const input = $('st-scan');
    const scanned = input.value.trim();
    if (!scanned) return;
    $('st-choices').innerHTML = '';
    const r = resolvePalletScan(scanned);
    if (r.pallet) { input.value = ''; return stSetPallet(r.pallet); }
    setResult('st-result', r.choices ? 'info' : false, (r.choices ? '' : '❌ ') + r.error);
    if (r.choices) {
        renderChoices('st-choices', r.choices, 'stPick');
        if (camScanner) closeCameraScan();
    }
    input.select();
};
window.stPick = function(id) { const p = palletById(id); if (p) stSetPallet(p); };

function stSetPallet(p) {
    stPallet = p;
    $('st-choices').innerHTML = '';
    $('st-pallet-info').innerHTML = palletInfoHtml(p);
    $('st-qty').value = '';
    $('st-loc').value = '';
    $('st-book-loc').innerText = p.locationId || '-';
    show('st-step1', false); show('st-step2', true);
    setResult('st-result', true, '✓ 請點數後輸入實際數量（確認板子真的在 ' + (p.locationId || '-') + '）');
    focusIfNoCamera('st-qty');
}

window.stSameQty = function() { if (stPallet) { $('st-qty').value = stPallet.quantity; window.submitStocktakeItem(); } };

window.submitStocktakeItem = async function() {
    const p = stPallet;
    if (!p) return;
    const raw = $('st-qty').value;
    const counted = parseFloat(raw);
    if (raw === '' || isNaN(counted) || counted < 0) { setResult('st-result', false, '❌ 請輸入實際數量'); return; }
    const book = parseFloat(p.quantity) || 0;
    const diff = counted - book;
    // 實際儲位跟系統不同：同一筆交易把位置改正（寫移板記錄）
    const locRaw = $('st-loc').value.trim();
    const realLoc = locRaw ? window.formatLocationId(locRaw) : '';
    if (realLoc && !window.isValidStorageLocation(realLoc)) { setResult('st-result', false, '❌ 儲位格式不正確：' + realLoc); return; }
    const moveTo = realLoc && realLoc !== p.locationId ? realLoc : '';
    if (diff !== 0 && counted === 0 && !confirm('實盤 0 件會刪除此板，確定？')) return;
    const ref = palletRef(p);
    try {
        await db.runTransaction(async function(tx) {
            const snap = await tx.get(ref);
            if (!snap.exists) throw new Error('此板已不存在');
            const d = snap.data();
            const cur = parseFloat(d.quantity) || 0;
            if (cur !== book) throw new Error('盤點期間有異動（帳面 ' + book + ' → 現在 ' + cur + '），請重新掃描此板');
            if (String(d.locationId || '') !== String(p.locationId || '')) throw new Error('盤點期間這板被移到 ' + d.locationId + '，請重新掃描');
            const now = new Date().toISOString();
            const base = { company: d.company, productName: d.productName, spec: d.spec, batchNo: d.batchNo, palletId: d.palletId, expDate: d.expiryDate || d.expDate };
            if (counted === 0 && diff !== 0) tx.delete(ref);
            else tx.update(ref, Object.assign({ quantity: counted, lastStocktakeAt: now }, moveTo ? { locationId: moveTo, movedAt: now } : {}, window.scaledWeight(d, cur, counted)));
            if (moveTo) tx.set(db.collection('inventoryLogs').doc(), window.buildInventoryLogEntry(Object.assign({}, base, {
                type: 'move', quantity: counted, quantityChange: 0, locationId: moveTo, fromLocation: d.locationId, toLocation: moveTo,
                note: '手機盤點：實際儲位與系統不同，更正位置'
            })));
            if (diff !== 0) tx.set(db.collection('inventoryLogs').doc(), window.buildInventoryLogEntry(Object.assign({}, base, {
                type: 'adjust', quantity: counted, quantityChange: diff, locationId: moveTo || d.locationId,
                note: '手機盤點：帳面 ' + book + ' → 實盤 ' + counted
            })));
        });
    } catch (e) {
        setResult('st-result', false, '❌ ' + e.message);
        return;
    }
    stToday.unshift({ time: new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }), name: p.productName, loc: (moveTo ? p.locationId + ' → ' + moveTo : p.locationId), book: book, counted: counted, diff: diff });
    renderStToday();
    setResult('st-result', true, (diff === 0 ? '✅ ' + p.productName + ' 相符（' + book + '）' : '✅ ' + p.productName + ' 已調整：' + book + ' → ' + counted + '（' + (diff > 0 ? '+' : '') + diff + '）') + (moveTo ? '，位置更正為 ' + moveTo : ''));
    stPallet = null;
    show('st-step2', false); show('st-step1', true);
    scanNext('st-scan');
};

function renderStToday() {
    $('st-today-count').innerText = stToday.length + ' 板';
    const el = $('st-today');
    if (stToday.length === 0) { el.innerHTML = '<div class="empty-state"><p>本次尚未盤點</p></div>'; return; }
    el.innerHTML = stToday.map(function(r) {
        const d = r.diff === 0 ? '<span style="color:#10b981">相符</span>' : '<span style="color:#fbbf24;font-weight:bold">' + (r.diff > 0 ? '+' : '') + r.diff + '</span>';
        return '<div class="list-item"><div class="item-row"><span class="item-location" style="font-size:16px">' + esc(r.loc) + '</span>' + d + '</div>' +
            '<div class="item-row"><span class="item-detail">' + esc(r.name) + ' · ' + esc(r.time) + '</span><span class="item-detail">' + r.book + ' → ' + r.counted + '</span></div></div>';
    }).join('');
}
