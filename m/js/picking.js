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
    // 重算整份清單（鼎新改單時數量會跟著變；已經揀的照記錄，不會被改）
    pickingItems = window.buildWavePickingList(currentWave, window.pallets);
    renderPickingList();
});

function renderPickingList() {
    const list = $('picking-list');
    const completed = pickingItems.filter(function(i) { return i.completed; }).length;
    const total = pickingItems.filter(function(i) { return !i.shortage; }).length;
    $('picking-progress').innerText = completed + '/' + total;
    if (!currentWave) {
        $('picking-next').innerHTML = '';
        list.innerHTML = '<div class="empty-state"><i class="fa-solid fa-clipboard-list"></i><p>請先選擇波次</p></div>';
        return;
    }
    if (pickingItems.length === 0) {
        list.innerHTML = '<div class="empty-state"><i class="fa-solid fa-clipboard-list"></i><p>無揀貨項目</p></div>';
        return;
    }
    renderNextStop();
    // 未揀的排前面（依動線），已揀的排後面
    const ordered = pickingItems.filter(function(i) { return !i.completed && !i.shortage; })
        .concat(pickingItems.filter(function(i) { return i.shortage; }))
        .concat(pickingItems.filter(function(i) { return i.completed; }));
    list.innerHTML = ordered.map(function(item) {
        const cls = item.completed ? 'completed' : item.shortage ? 'shortage' : '';
        const status = item.completed ? '<span class="item-status done">' + (item.type === 'return' ? '↩️ 已放回' : '✓ 完成') + '</span>' :
            item.shortage ? '<span class="item-status shortage">缺貨</span>' :
            item.type === 'return' ? '<span class="item-status shortage">↩️ 要放回</span>' :
            '<span class="item-status pending">待揀</span>';
        return '<div class="list-item ' + cls + '">' +
            '<div class="item-row"><span class="item-location">' + esc(item.locationId) + '</span>' + status + '</div>' +
            '<div class="item-product">' + esc(item.productName) + ' ' + esc(item.spec || '') +
                ' ' + companyTag(item.company) + '</div>' +
            (item.shortage && item.note ? '<div class="item-detail" style="color:#fbbf24">' + esc(item.note) + '</div>' : '') +
            '<div class="item-row"><span class="item-detail"><span class="pid">' + pidHtml(item.palletId) + '</span> | ' + esc(item.batchNo || '') + ' ' + esc(item.expDate || '') + '</span>' +
            '<span class="item-qty">' + esc(item.pickQty) + '</span></div></div>';
    }).join('');
}

// 下一站：依動線的第一個待揀項目，大字顯示儲位簡碼、品項、件數；後面幾站的儲位
function renderNextStop() {
    const box = $('picking-next');
    // 揀到一半，鼎新改了這個波次裡的單：數量沒有自動改，提醒找主管確認
    let warn = '';
    if (currentWave && (currentWave.changeNotes || []).length) {
        // 已經自動調整好：照清單做就好
        warn = '<div class="warn-line" style="margin:0 0 10px;padding:10px;border:2px solid #3b82f6;border-radius:10px;background:#1e3a8a;color:#fff">🔄 鼎新改了：' + currentWave.changeNotes.map(esc).join('；') + '<br>清單已經自動調整，照清單做就好</div>';
    } else if (currentWave && currentWave.hasOrderChanges && (currentWave.changedOrders || []).length) {
        // 改版前就開始揀的舊波次，沒辦法自動調整
        warn = '<div class="err-line" style="margin:0 0 10px;padding:10px;border:2px solid #ef4444;border-radius:10px;background:#7f1d1d">⚠️ 鼎新改了這個波次的單：' + currentWave.changedOrders.map(esc).join('、') + '<br>清單上的數量沒有跟著改，請找主管確認再揀</div>';
    }
    const pending = pickingItems.filter(function(i) { return !i.completed && !i.shortage; });
    if (pending.length === 0) {
        box.innerHTML = warn + (pickingItems.length ? '<div class="next-stop done">🎉 全部揀完，按下面「完成波次」</div>' : '');
        return;
    }
    const n = pending[0];
    const code = window.locationShortCode(n.locationId) || n.locationId;
    const sameLoc = pending.filter(function(i) { return i.locationId === n.locationId; }).length;
    const stops = [];
    pending.forEach(function(i) {
        const c = window.locationShortCode(i.locationId) || i.locationId;
        if (i.locationId !== n.locationId && stops.indexOf(c) < 0) stops.push(c);
    });
    // 下一項是什麼（拿好這一項就知道接著要拿什麼）
    const nx = pending[1];
    const nextHtml = nx ? '<div class="ns-after" style="font-size:15px;color:#e2e8f0">下一項：' + (nx.type === 'return' ? '↩️ 放回 ' : '') + esc(nx.productName) + ' ' + esc(nx.spec || '') + '　<b>' + esc(nx.pickQty) + ' 件</b>' +
        (nx.practice ? '' : '（' + esc(window.locationShortCode(nx.locationId) || nx.locationId) + '）') + '</div>' : '<div class="ns-after">這是最後一項</div>';
    if (window.isPracticeMode()) warn += '<div class="warn-line" style="margin:0 0 10px;padding:8px 10px;border-radius:10px;background:#4c1d95;color:#fff">📝 練習模式：照訂單數量去拿，拿好按「✓ 拿好了」。不會扣庫存</div>';
    if (n.practice) {
        box.innerHTML = warn + '<div class="next-stop">' +
            '<div class="ns-label">現在拿（還剩 ' + pending.length + ' 項）</div>' +
            '<div class="ns-item" style="font-size:22px"><span>' + esc(n.productName) + ' ' + esc(n.spec || '') + '</span><span class="ns-qty">' + (n.type === 'return' ? '↩️ 放回 ' : '拿 ') + esc(n.pickQty) + ' 件</span></div>' +
            '<button class="action-btn success" style="margin-top:10px" onclick="confirmPracticePick()">' + (n.type === 'return' ? '✓ 放回了' : '✓ 拿好了') + '</button>' +
            nextHtml + '</div>';
        return;
    }
    box.innerHTML = warn + '<div class="next-stop">' +
        '<div class="ns-label">' + (n.type === 'return' ? '↩️ 先放回（鼎新減量，多拿的貨）' : '下一站') + '（還剩 ' + pending.length + ' 項）</div>' +
        '<div class="ns-code">' + esc(code) + '</div>' +
        (code !== n.locationId ? '<div class="ns-loc">' + esc(n.locationId) + '</div>' : '') +
        '<div class="ns-item"><span>' + esc(n.productName) + ' ' + esc(n.spec || '') + ' ' + companyTag(n.company) + '</span><span class="ns-qty">' + (n.type === 'return' ? '放回 ' : '拿 ') + esc(n.pickQty) + ' 件</span></div>' +
        '<div class="ns-sub">板號 <span class="pid">' + pidHtml(n.palletId) + '</span>' + (n.expDate ? '　效期 ' + esc(n.expDate) : '') + (sameLoc > 1 ? '　（這個儲位要揀 ' + sameLoc + ' 板）' : '') + '</div>' +
        nextHtml +
        (stops.length > 1 ? '<div class="ns-after">接著：' + stops.slice(0, 4).map(esc).join(' → ') + (stops.length > 4 ? ' …' : '') + '</div>' : '') +
        '</div>';
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
    await markPicked(found);
};

// 練習模式：照訂單揀的那一行沒有板號可以掃，拿好了按按鈕
window.confirmPracticePick = async function() {
    const n = pickingItems.filter(function(i) { return !i.completed && !i.shortage; })[0];
    if (n && n.practice) await markPicked(n);
};

async function markPicked(found) {
    const input = $('picking-scan');
    try {
        // 記下這一項實際揀（或放回）了幾件、哪一板：鼎新改單重算時，已經揀的不會被改掉
        await db.collection('waves').doc(currentWave.id).update({
            completedItems: FieldValue.arrayUnion(found.id),
            pickLog: FieldValue.arrayUnion(window.pickLogEntry(found)),
            status: currentWave.status === 'sorting' ? 'sorting' : 'picking'
        });
    } catch (e) {
        setResult('picking-scan-result', false, '❌ 儲存進度失敗：' + e.message);
        return;
    }
    found.completed = true;
    const left = pickingItems.filter(function(i) { return !i.completed && !i.shortage; }).length;
    setResult('picking-scan-result', true, (found.type === 'return' ? '↩️ 已放回 ' : '✓ ') + found.productName + ' x ' + found.pickQty + '（' + found.locationId + '）' + (left ? '　還剩 ' + left + ' 項' : '　🎉 全部揀完'));
    renderPickingList();
    input.value = '';
    focusIfNoCamera('picking-scan');
}

// 主管在電腦版切換練習模式：清單馬上重算
window.onPracticeModeChange = function() {
    const btn = $('picking-complete-btn');
    if (btn) btn.innerHTML = '<i class="fa-solid fa-flag-checkered"></i> ' + (window.isPracticeMode() ? '完成波次（練習：不扣庫存）' : '完成波次（扣庫存出貨）');
    if (window.currentPage !== 'picking' || !currentWave) return;
    pickingItems = window.buildWavePickingList(currentWave, window.pallets);
    renderPickingList();
};

window.completePickingWave = async function() {
    if (!currentWave) return;
    try {
        // 先取最新進度（電腦或其他手機掃過的也算）
        const snap = await db.collection('waves').doc(currentWave.id).get();
        if (!snap.exists) { alert('波次已不存在'); return; }
        currentWave = Object.assign({ id: snap.id }, snap.data());
        pickingItems = window.buildWavePickingList(currentWave, window.pallets);
    } catch (e) {
        alert('❌ 讀取波次失敗：' + e.message);
        return;
    }
    if (currentWave.status === 'done') { alert('此波次已經完成'); return goBack(); }

    const completed = pickingItems.filter(function(i) { return i.completed; }).length;
    const total = pickingItems.filter(function(i) { return !i.shortage; }).length;
    const shortage = pickingItems.filter(function(i) { return i.shortage; }).length;
    if (completed === 0) { alert('尚未揀貨任何項目'); return; }
    const toReturn = pickingItems.filter(function(i) { return i.type === 'return' && !i.completed; });
    if (toReturn.length) { alert('↩️ 還有 ' + toReturn.length + ' 項要放回（鼎新減量，多拿的貨），請先放回再完成波次：\n\n' + toReturn.map(function(i) { return i.productName + ' ' + (i.spec || '') + ' ' + i.pickQty + ' 件 → ' + i.locationId; }).join('\n')); return; }
    let msg = '完成波次並出貨？\n\n已揀：' + completed + '/' + total;
    if (completed < total) msg += '\n未揀 ' + (total - completed) + ' 項會記為缺貨';
    if (shortage > 0) msg += '\n庫存不足 ' + shortage + ' 項';
    if (completed < total || shortage > 0) msg += '\n（相關訂單標為部分出貨，缺的貨之後可以再排波次）';
    if (!confirm(msg)) return;

    try {
        await window.completeWaveTx(currentWave, pickingItems, window.pallets);
        alert('✅ 波次 ' + currentWave.waveNo + ' 已完成' + (window.isPracticeMode() ? '（練習模式：庫存沒有扣）' : '，庫存已扣除'));
        goBack();
    } catch (e) {
        alert('❌ 完成波次失敗：' + e.message + '\n\n庫存與訂單都沒有變動。');
    }
};
