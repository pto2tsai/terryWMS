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
    show('st-step1', false); show('st-step2', true);
    setResult('st-result', true, '✓ 請點數後輸入實際數量');
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
    if (diff !== 0 && counted === 0 && !confirm('實盤 0 件會刪除此板，確定？')) return;
    const ref = palletRef(p);
    try {
        if (diff !== 0) {
            await db.runTransaction(async function(tx) {
                const snap = await tx.get(ref);
                if (!snap.exists) throw new Error('此板已不存在');
                const cur = parseFloat(snap.data().quantity) || 0;
                if (cur !== book) throw new Error('盤點期間有異動（帳面 ' + book + ' → 現在 ' + cur + '），請重新掃描此板');
                if (counted === 0) tx.delete(ref);
                else tx.update(ref, Object.assign({ quantity: counted, lastStocktakeAt: new Date().toISOString() }, window.scaledWeight(snap.data(), cur, counted)));
                tx.set(db.collection('inventoryLogs').doc(), window.buildInventoryLogEntry({
                    type: 'adjust', company: p.company, productName: p.productName, spec: p.spec, batchNo: p.batchNo,
                    quantity: counted, quantityChange: diff, locationId: p.locationId, palletId: p.palletId, expDate: p.expDate,
                    note: '手機盤點：帳面 ' + book + ' → 實盤 ' + counted
                }));
            });
        } else {
            await ref.update({ lastStocktakeAt: new Date().toISOString() });
        }
    } catch (e) {
        setResult('st-result', false, '❌ ' + e.message);
        return;
    }
    stToday.unshift({ time: new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }), name: p.productName, loc: p.locationId, book: book, counted: counted, diff: diff });
    renderStToday();
    setResult('st-result', true, diff === 0 ? '✅ ' + p.productName + ' 相符（' + book + '）' : '✅ ' + p.productName + ' 已調整：' + book + ' → ' + counted + '（' + (diff > 0 ? '+' : '') + diff + '）');
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
