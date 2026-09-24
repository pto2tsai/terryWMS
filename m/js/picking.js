// ============================================================
// m/js/picking.js — 波次揀貨
// 揀貨清單與桌機用同一套邏輯（js/shared/picking-list.js），進度寫回 waves.completedItems，兩邊互通；
// 完成波次與桌機呼叫同一個交易：扣庫存、訂單標記出貨、缺貨留記錄。
// ============================================================
let currentWave = null;
let pickingItems = [];

window.pageInit.picking = function() {
    currentWave = null;
    pickingItems = [];
    renderWaveOptions();
    $('picking-wave-select').value = '';
    show('picking-scan-area', false);
    show('picking-actions', false);
    clearResult('picking-scan-result');
    renderPickingList();
};

function renderWaveOptions() {
    const select = $('picking-wave-select');
    const keep = select.value;
    const list = window.waves.filter(window.isWaveOpen)
        .sort(function(a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
    select.innerHTML = '<option value="">' + (list.length ? '-- 請選擇（' + list.length + ' 個待揀）--' : '目前沒有待揀波次') + '</option>' +
        list.map(function(w) {
            const done = (w.completedItems || []).length;
            return '<option value="' + esc(w.id) + '">' + esc(w.waveNo) + ' - ' + esc(w.logistics || '') + '（' + esc(w.totalQty || 0) + '件）' +
                (w.status === 'sorting' ? '【已揀完】' : done ? '【進行中】' : '') + '</option>';
        }).join('');
    if (keep && list.some(function(w) { return w.id === keep; })) select.value = keep;
}

window.loadPickingWave = async function() {
    const waveId = $('picking-wave-select').value;
    clearResult('picking-scan-result');
    if (!waveId) {
        currentWave = null; pickingItems = [];
        show('picking-scan-area', false); show('picking-actions', false);
        renderPickingList();
        return;
    }
    // 讀最新的波次（含其他裝置的揀貨進度）
    const snap = await db.collection('waves').doc(waveId).get();
    if (!snap.exists) { alert('波次已不存在'); return window.pageInit.picking(); }
    currentWave = Object.assign({ id: snap.id }, snap.data());
    pickingItems = window.buildWavePickingList(currentWave, window.pallets);
    renderPickingList();
    show('picking-scan-area', true);
    show('picking-actions', true);
    focusIfNoCamera('picking-scan');
};

// 其他裝置（桌機或別支手機）揀了，這邊即時打勾
window.dataHooks.waves.push(function() {
    if (window.currentPage !== 'picking') return;
    renderWaveOptions();
    if (!currentWave) return;
    const w = window.waves.find(function(x) { return x.id === currentWave.id; });
    if (!w) return;
    if (w.status === 'done') {
        currentWave = null; pickingItems = [];
        show('picking-scan-area', false); show('picking-actions', false);
        setResult('picking-scan-result', 'info', '此波次已在其他裝置完成');
        renderPickingList();
        return;
    }
    currentWave = w;
    const done = w.completedItems || [];
    pickingItems.forEach(function(i) { if (done.indexOf(i.id) >= 0) i.completed = true; });
    renderPickingList();
});

function renderPickingList() {
    const list = $('picking-list');
    const completed = pickingItems.filter(function(i) { return i.completed; }).length;
    const total = pickingItems.filter(function(i) { return !i.shortage; }).length;
    $('picking-progress').innerText = completed + '/' + total;
    if (!currentWave) {
        list.innerHTML = '<div class="empty-state"><i class="fa-solid fa-clipboard-list"></i><p>請先選擇波次</p></div>';
        return;
    }
    if (pickingItems.length === 0) {
        list.innerHTML = '<div class="empty-state"><i class="fa-solid fa-clipboard-list"></i><p>無揀貨項目</p></div>';
        return;
    }
    // 未揀的排前面（依動線），已揀的排後面
    const ordered = pickingItems.filter(function(i) { return !i.completed && !i.shortage; })
        .concat(pickingItems.filter(function(i) { return i.shortage; }))
        .concat(pickingItems.filter(function(i) { return i.completed; }));
    list.innerHTML = ordered.map(function(item) {
        const cls = item.completed ? 'completed' : item.shortage ? 'shortage' : '';
        const status = item.completed ? '<span class="item-status done">✓ 完成</span>' :
            item.shortage ? '<span class="item-status shortage">缺貨</span>' :
            '<span class="item-status pending">待揀</span>';
        return '<div class="list-item ' + cls + '">' +
            '<div class="item-row"><span class="item-location">' + esc(item.locationId) + '</span>' + status + '</div>' +
            '<div class="item-product">' + esc(item.productName) + ' ' + esc(item.spec || '') +
                (item.company ? ' <span style="font-size:11px;padding:1px 6px;border-radius:4px;background:' + (item.company === '八方' ? '#581c87' : '#1e3a8a') + '">' + esc(item.company) + '</span>' : '') + '</div>' +
            (item.shortage && item.note ? '<div class="item-detail" style="color:#fbbf24">' + esc(item.note) + '</div>' : '') +
            '<div class="item-row"><span class="item-detail">' + esc(item.palletId || '-') + ' | ' + esc(item.batchNo || '') + ' ' + esc(item.expDate || '') + '</span>' +
            '<span class="item-qty">' + esc(item.pickQty) + '</span></div></div>';
    }).join('');
}

// 掃板號（或尾碼）或儲位標籤都可以
window.confirmPickingScan = async function() {
    const input = $('picking-scan');
    const scanned = input.value.trim();
    if (!scanned || !currentWave) return;

    const pending = pickingItems.filter(function(i) { return !i.completed && !i.shortage; });
    let match = findByScan(pending, scanned, ['palletId']);
    if (!match.item && !match.error) {
        // 儲位標籤：該儲位只有一項待揀時直接確認
        const loc = window.formatLocationId(scanned);
        const here = pending.filter(function(i) { return codeKey(i.locationId) === codeKey(loc); });
        if (here.length === 1) match = { item: here[0] };
        else if (here.length > 1) match = { item: null, error: '儲位 ' + loc + ' 有 ' + here.length + ' 板要揀，請掃板號' };
    }
    const found = match.item;
    if (!found) {
        const already = findByScan(pickingItems.filter(function(i) { return i.completed; }), scanned, ['palletId']).item;
        setResult('picking-scan-result', false, match.error ? '❌ ' + match.error : already ? '⚠️ 已揀過：' + already.palletId : '❌ 不在揀貨清單：' + normCode(scanned));
        input.select();
        return;
    }

    try {
        await db.collection('waves').doc(currentWave.id).update({
            completedItems: FieldValue.arrayUnion(found.id),
            status: currentWave.status === 'sorting' ? 'sorting' : 'picking'
        });
    } catch (e) {
        setResult('picking-scan-result', false, '❌ 儲存進度失敗：' + e.message);
        return;
    }
    found.completed = true;
    const left = pickingItems.filter(function(i) { return !i.completed && !i.shortage; }).length;
    setResult('picking-scan-result', true, '✓ ' + found.productName + ' x ' + found.pickQty + '（' + found.locationId + '）' + (left ? '　還剩 ' + left + ' 項' : '　🎉 全部揀完'));
    renderPickingList();
    input.value = '';
    focusIfNoCamera('picking-scan');
};

window.completePickingWave = async function() {
    if (!currentWave) return;
    try {
        // 先取最新進度（電腦或其他手機掃過的也算）
        const snap = await db.collection('waves').doc(currentWave.id).get();
        if (!snap.exists) { alert('波次已不存在'); return; }
        currentWave = Object.assign({ id: snap.id }, snap.data());
        const done = currentWave.completedItems || [];
        pickingItems.forEach(function(i) { if (done.indexOf(i.id) >= 0) i.completed = true; });
    } catch (e) {
        alert('❌ 讀取波次失敗：' + e.message);
        return;
    }
    if (currentWave.status === 'done') { alert('此波次已經完成'); return goBack(); }

    const completed = pickingItems.filter(function(i) { return i.completed; }).length;
    const total = pickingItems.filter(function(i) { return !i.shortage; }).length;
    const shortage = pickingItems.filter(function(i) { return i.shortage; }).length;
    if (completed === 0) { alert('尚未揀貨任何項目'); return; }
    let msg = '完成波次並出貨？\n\n已揀：' + completed + '/' + total;
    if (completed < total) msg += '\n未揀 ' + (total - completed) + ' 項會記為缺貨';
    if (shortage > 0) msg += '\n庫存不足 ' + shortage + ' 項';
    if (completed < total || shortage > 0) msg += '\n（相關訂單標為部分出貨，缺的貨之後可以再排波次）';
    if (!confirm(msg)) return;

    try {
        await window.completeWaveTx(currentWave, pickingItems, window.pallets);
        alert('✅ 波次 ' + currentWave.waveNo + ' 已完成，庫存已扣除');
        goBack();
    } catch (e) {
        alert('❌ 完成波次失敗：' + e.message + '\n\n庫存與訂單都沒有變動。');
    }
};
