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
        if (window._justCompleted === w.id) return;   // 自己剛完成的，畫面上正在印標籤
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
    const shortBtn = n.type === 'return' ? '' : '<button class="action-btn secondary" style="margin-top:8px;background:#7f1d1d" onclick="shortPick()">⚠️ 不夠（只拿到一部分／沒有貨）</button>';
    if (window.isPracticeMode()) warn += '<div class="warn-line" style="margin:0 0 10px;padding:8px 10px;border-radius:10px;background:#4c1d95;color:#fff">📝 練習模式：照訂單數量去拿，拿好按「✓ 拿好了」。不會扣庫存</div>';
    if (n.practice) {
        box.innerHTML = warn + '<div class="next-stop">' +
            '<div class="ns-label">現在拿（還剩 ' + pending.length + ' 項）</div>' +
            '<div class="ns-item" style="font-size:22px"><span>' + esc(n.productName) + ' ' + esc(n.spec || '') + '</span><span class="ns-qty">' + (n.type === 'return' ? '↩️ 放回 ' : '拿 ') + esc(n.pickQty) + ' 件</span></div>' +
            '<button class="action-btn success" style="margin-top:10px" onclick="confirmPracticePick()">' + (n.type === 'return' ? '✓ 放回了' : '✓ 拿好了') + '</button>' +
            shortBtn + nextHtml + '</div>';
        return;
    }
    box.innerHTML = warn + '<div class="next-stop">' +
        '<div class="ns-label">' + (n.type === 'return' ? '↩️ 先放回（鼎新減量，多拿的貨）' : '下一站') + '（還剩 ' + pending.length + ' 項）</div>' +
        '<div class="ns-code">' + esc(code) + '</div>' +
        (code !== n.locationId ? '<div class="ns-loc">' + esc(n.locationId) + '</div>' : '') +
        '<div class="ns-item"><span>' + esc(n.productName) + ' ' + esc(n.spec || '') + ' ' + companyTag(n.company) + '</span><span class="ns-qty">' + (n.type === 'return' ? '放回 ' : '拿 ') + esc(n.pickQty) + ' 件</span></div>' +
        '<div class="ns-sub">板號 <span class="pid">' + pidHtml(n.palletId) + '</span>' + (n.expDate ? '　效期 ' + esc(n.expDate) : '') + (sameLoc > 1 ? '　（這個儲位要揀 ' + sameLoc + ' 板）' : '') + '</div>' +
        shortBtn + nextHtml +
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

// 現場不夠：輸入實際拿到幾件；不夠的記成缺貨（完成時相關訂單部分出貨，欠的下次補）
window.shortPick = async function() {
    const n = pickingItems.filter(function(i) { return !i.completed && !i.shortage; })[0];
    if (!n || n.type === 'return') return;
    const want = parseFloat(n.pickQty) || 0;
    const ans = prompt(n.productName + ' ' + (n.spec || '') + '\n要拿 ' + want + ' 件，實際拿到幾件？\n（沒有貨就填 0）', '0');
    if (ans === null) return;
    const got = parseFloat(String(ans).trim());
    if (!(got >= 0 && got < want) || String(ans).trim() === '') { alert('請填 0 到 ' + (want - 1) + ' 之間的數字（拿到 ' + want + ' 件就按「✓ 拿好了」）'); return; }
    const by = window.currentUser ? (window.currentUser.name || window.currentUser.email || '') : '';
    const upd = {
        shortLog: FieldValue.arrayUnion({ id: n.id + '-short-' + Date.now(), key: n.key, qty: want - got, productName: n.productName || '', spec: n.spec || '', by: by, at: new Date().toISOString() }),
        status: 'picking'
    };
    if (got > 0) {
        const part = Object.assign({}, n, { pickQty: got });
        upd.completedItems = FieldValue.arrayUnion(n.id);
        upd.pickLog = FieldValue.arrayUnion(window.pickLogEntry(part));
    }
    try { await db.collection('waves').doc(currentWave.id).update(upd); }
    catch (e) { setResult('picking-scan-result', false, '❌ 儲存失敗：' + e.message); return; }
    const snap = await db.collection('waves').doc(currentWave.id).get();
    currentWave = Object.assign({ id: snap.id }, snap.data());
    pickingItems = window.buildWavePickingList(currentWave, window.pallets);
    setResult('picking-scan-result', 'error', '⚠️ ' + n.productName + ' 拿到 ' + got + ' 件，不夠 ' + (want - got) + ' 件（已記缺貨）');
    renderPickingList();
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

// 缺貨：不夠的品項要分給誰（預設先開單的先給，現場可以改），每張訂單的標籤要改成幾件；
// 缺的這次不出、之後也不補，辦公室會收到提醒請業務改鼎新銷貨單
function renderShortfallPanel() {
    const alloc = window.waveShortAllocation(currentWave, pickingItems);
    const keys = Object.keys(alloc);
    const blocks = keys.map(function(k, bi) {
        const a = alloc[k];
        return '<div style="padding:10px 0;border-bottom:1px solid #7f1d1d"><div style="font-size:17px;font-weight:bold">' + esc(a.productName) + ' ' + esc(a.spec) + '</div>' +
            '<div style="color:#fecaca;margin:2px 0 6px">共訂 ' + a.orders.reduce(function(t, o) { return t + o.want; }, 0) + ' 件，只拿到 <b>' + a.picked + ' 件</b>' + (a.orders.length > 1 ? '，要怎麼分？' : '') + '</div>' +
            a.orders.map(function(o) {
                return '<div style="display:flex;align-items:center;gap:8px;margin:6px 0"><div style="flex:1"><b>' + esc(o.customer) + '</b>（' + esc(o.orderNo) + '）<br><span style="font-size:13px;color:#fecaca">訂 ' + o.want + ' 件</span></div>' +
                    '<input type="number" inputmode="numeric" class="alloc-in qty-input" style="width:80px;margin:0" data-b="' + bi + '" data-id="' + esc(o.id) + '" data-want="' + o.want + '" value="' + o.got + '" oninput="checkShortPanel()"' + (a.orders.length > 1 ? '' : ' readonly') + '> 件</div>' +
                    '<div class="alloc-note" data-b="' + bi + '" data-id="' + esc(o.id) + '" style="font-size:14px;margin-bottom:4px"></div>';
            }).join('') + '<div class="alloc-sum" data-b="' + bi + '" data-picked="' + a.picked + '" style="font-size:14px"></div></div>';
    }).join('');
    $('picking-next').innerHTML = '<div class="err-line" style="margin:0 0 10px;padding:12px;border:2px solid #ef4444;border-radius:10px;background:#450a0a;color:#fff">' +
        '<div style="font-size:18px;font-weight:bold;margin-bottom:4px">⚠️ 有 ' + keys.length + ' 項不夠，請決定給誰、改分貨標籤</div>' + blocks +
        '<div style="font-size:13px;color:#fecaca;margin-top:8px">缺的這次不出、之後也不補；辦公室會收到提醒，請業務在鼎新改銷貨單數量</div>' +
        '<label style="display:flex;gap:10px;align-items:center;margin-top:12px;font-size:17px"><input type="checkbox" id="short-labels-ok" style="width:24px;height:24px" onchange="checkShortPanel()"> 標籤都改好了</label>' +
        '<button id="short-done-btn" class="action-btn success" style="margin-top:10px" disabled onclick="finishWithShortage()">確認，完成波次</button></div>';
    window._shortKeys = keys;
    checkShortPanel();
    window.scrollTo(0, Math.max(0, $('picking-next').getBoundingClientRect().top + window.scrollY - 80));   // 上方標題列會擋住，往下留一點
}
window.checkShortPanel = function() {
    let ok = true;
    document.querySelectorAll('.alloc-sum').forEach(function(sumEl) {
        const b = sumEl.dataset.b, picked = parseFloat(sumEl.dataset.picked) || 0;
        let total = 0;
        document.querySelectorAll('.alloc-in[data-b="' + b + '"]').forEach(function(inp) {
            const v = parseFloat(inp.value), want = parseFloat(inp.dataset.want);
            const bad = !(v >= 0 && v <= want);
            if (bad) ok = false;
            total += bad ? 0 : v;
            const note = document.querySelector('.alloc-note[data-b="' + b + '"][data-id="' + inp.dataset.id + '"]');
            if (note) note.innerHTML = bad ? '<span style="color:#fca5a5">要填 0～' + want + '</span>' : v < want ? '→ 標籤改成 <b>' + v + ' 件</b>' + (v === 0 ? '（這一項劃掉）' : '') : '→ 標籤不用改';
        });
        const good = total === picked;
        if (!good) ok = false;
        sumEl.innerHTML = good ? '<span style="color:#86efac">✓ 分完了（' + total + '／' + picked + ' 件）</span>' : '<span style="color:#fca5a5">加起來要等於拿到的 ' + picked + ' 件（現在 ' + total + ' 件）</span>';
    });
    const chk = $('short-labels-ok');
    $('short-done-btn').disabled = !(ok && chk && chk.checked);
};
window.finishWithShortage = function() {
    const ov = {};
    document.querySelectorAll('.alloc-in').forEach(function(inp) {
        const k = window._shortKeys[+inp.dataset.b];
        ov[k] = ov[k] || {};
        ov[k][inp.dataset.id] = parseFloat(inp.value) || 0;
    });
    window._pendingAlloc = ov;
    return window.completePickingWave(true);
};

// 完成後：印分貨標籤（件數是實際出貨的）。辦公室自動印模式時，這裡只提示
function renderFinishPanel(wave, nShort) {
    show('picking-actions', false);
    const n = (wave.orders || []).length;
    const office = window.labelPrintMode() === 'office';
    $('picking-next').innerHTML = '<div class="next-stop done" style="text-align:left">' +
        '<div style="font-size:20px;font-weight:bold">✅ 波次 ' + esc(wave.waveNo) + ' 完成</div>' +
        '<div style="margin:6px 0 12px;font-size:15px">' + (window.isPracticeMode() ? '練習模式：庫存沒有扣' : '庫存已扣除') +
        (nShort ? '<br>⚠️ 不夠的這次不出、之後也不補；辦公室和看板會提醒業務在鼎新改銷貨單' : '') + '</div>' +
        (office ? '<div style="font-size:17px;padding:10px;border-radius:10px;background:#1e3a8a">🏷️ 分貨標籤會在<b>辦公室自動印出</b>（' + n + ' 張），件數是實際出貨的</div>'
                : '<button class="action-btn success" style="font-size:20px;padding:18px" onclick="printLabelsOnPhone()">🖨️ 印分貨標籤（' + n + ' 張）</button>' +
                  '<div style="font-size:13px;color:#cbd5e1;margin-top:6px">件數是實際出貨的，不用再改。按了會跳出手機的列印畫面，選標籤機</div>') +
        '<button class="action-btn secondary" style="margin-top:12px" onclick="goBack()">回到選單</button></div>';
    window._finishedWave = wave;
    window.scrollTo(0, 0);
}
window.printLabelsOnPhone = async function() {
    const wave = window._finishedWave;
    if (!wave) return;
    const lb = window.buildSortingLabelsHtml(wave);
    $('label-print-area').innerHTML = '<style>' + window.sortingLabelsPrintCss(lb) + '</style>' + lb.body;
    window.print();
    try {
        await db.collection('waves').doc(wave.id).update({ labelsPrintedAt: new Date().toISOString(), labelsPrintedBy: window.currentUser ? (window.currentUser.name || window.currentUser.email || '') : '', labelsPrintedOn: 'phone' });
    } catch (e) { console.warn('記錄已印標籤失敗', e); }
};

// 主管在電腦版切換練習模式：清單馬上重算
window.onPracticeModeChange = function() {
    const btn = $('picking-complete-btn');
    if (btn) btn.innerHTML = '<i class="fa-solid fa-flag-checkered"></i> ' + (window.isPracticeMode() ? '完成波次（練習：不扣庫存）' : '完成波次（扣庫存出貨）');
    if (window.currentPage !== 'picking' || !currentWave) return;
    pickingItems = window.buildWavePickingList(currentWave, window.pallets);
    renderPickingList();
};

window.completePickingWave = async function(labelsFixed) {
    if (!currentWave) return;
    try {
        // 先取最新進度（電腦或其他手機掃過的也算）
        const snap = await db.collection('waves').doc(currentWave.id).get();
        if (!snap.exists) { alert('波次已不存在'); return; }
        currentWave = Object.assign({ id: snap.id }, snap.data());
        pickingItems = window.buildWavePickingList(currentWave, window.pallets);
        if (labelsFixed === true && window._pendingAlloc) currentWave.allocOverride = window._pendingAlloc;   // 現場決定的分法
    } catch (e) {
        alert('❌ 讀取波次失敗：' + e.message);
        return;
    }
    if (currentWave.status === 'done') { alert('此波次已經完成'); return goBack(); }

    const completed = pickingItems.filter(function(i) { return i.completed; }).length;
    const total = pickingItems.filter(function(i) { return !i.shortage; }).length;
    const shortage = pickingItems.filter(function(i) { return i.shortage; }).length;
    if (completed === 0 && !pickingItems.some(function(i) { return i.fieldShort; })) { alert('尚未揀貨任何項目'); return; }
    const toReturn = pickingItems.filter(function(i) { return i.type === 'return' && !i.completed; });
    if (toReturn.length) { alert('↩️ 還有 ' + toReturn.length + ' 項要放回（鼎新減量，多拿的貨），請先放回再完成波次：\n\n' + toReturn.map(function(i) { return i.productName + ' ' + (i.spec || '') + ' ' + i.pickQty + ' 件 → ' + i.locationId; }).join('\n')); return; }
    // 有客戶會少出：先列出來，現場改好標籤、勾選後才完成
    const shorts = window.waveShortfalls(currentWave, pickingItems);
    if (shorts.length && labelsFixed !== true) { window._pendingAlloc = null; renderShortfallPanel(); return; }
    let msg = '完成波次並出貨？\n\n已揀：' + completed + '/' + total;
    if (completed < total) msg += '\n未揀 ' + (total - completed) + ' 項會記為缺貨';
    if (shortage > 0) msg += '\n庫存不足 ' + shortage + ' 項';
    if (completed < total || shortage > 0) msg += '\n（相關訂單標為部分出貨，缺的貨之後可以再排波次）';
    if (!shorts.length && !confirm(msg)) return;

    try {
        window._justCompleted = currentWave.id;   // 自己完成的：不要被「其他裝置完成」的提示蓋掉
        await window.completeWaveTx(currentWave, pickingItems, window.pallets);
        currentWave.status = 'done';
        window._pendingAlloc = null;
        renderFinishPanel(currentWave, shorts.length);
    } catch (e) {
        window._justCompleted = null;
        alert('❌ 完成波次失敗：' + e.message + '\n\n庫存與訂單都沒有變動。');
    }
};
