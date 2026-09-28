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
    show('picking-actions', false);   // 「完成出貨」在全部拿完時出現在大卡片上
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
    // 全部清單（平常收起來；要看再打開）：未揀的排前面（依動線），已揀的排後面
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
window.togglePickingList = function() {
    const l = $('picking-list'), t = $('picking-list-toggle');
    l.hidden = !l.hidden;
    t.setAttribute('aria-expanded', String(!l.hidden));
    t.querySelector('h4').innerText = l.hidden ? '全部清單 ▾' : '全部清單 ▴';
};

// 冷凍庫版：一次只顯示現在要拿的一項（大字），一個大按鈕「拿好了」；不夠就按「不夠」點數字
function renderNextStop() {
    const box = $('picking-next');
    const pending = pickingItems.filter(function(i) { return !i.completed && !i.shortage; });
    const total = pickingItems.filter(function(i) { return !i.shortage || i.fieldShort; }).length;
    const done = total - pending.length;
    const pct = total ? Math.round(done / total * 100) : 0;
    let warn = '';
    if (currentWave && (currentWave.changeNotes || []).length) {
        warn = '<div class="pk-warn">🔄 鼎新改了：' + currentWave.changeNotes.map(esc).join('；') + '<br>已經自動調整，照清單做就好</div>';
    } else if (currentWave && currentWave.hasOrderChanges && (currentWave.changedOrders || []).length) {
        warn = '<div class="pk-warn" style="background:#7f1d1d">⚠️ 鼎新改了這個波次的單：' + currentWave.changedOrders.map(esc).join('、') + '<br>清單上的數量沒有跟著改，請找主管確認再揀</div>';
    }
    const top = '<div class="pk-top"><span><b>' + done + '</b> / ' + total + ' 項</span>' + (window.isPracticeMode() ? '<span class="pk-chip">練習</span>' : '') + '</div>' +
        '<div class="pk-bar"><div style="width:' + pct + '%"></div></div>';
    // 有板號可以掃的才顯示掃描框（練習模式沒有板號）
    const n = pending[0];
    show('picking-scan-box', !!(n && !n.practice));
    if (!n) {
        const nShort = pickingItems.filter(function(i) { return i.fieldShort; }).length;
        box.innerHTML = top + warn + '<div class="pk-card pk-done"><div class="big">✅ 全部拿完</div>' +
            (nShort ? '<div class="pk-sub">有 ' + nShort + ' 項不夠</div>' : '') +
            '<button class="pk-go" onclick="completePickingWave()">完成出貨</button></div>';
        return;
    }
    const ret = n.type === 'return';
    const code = n.practice ? '' : (window.locationShortCode(n.locationId) || n.locationId);
    const nx = pending[1];
    box.innerHTML = top + warn + '<div class="pk-card' + (ret ? ' ret' : '') + '">' +
        (ret ? '<div class="pk-sub" style="color:#fcd34d;font-weight:bold">↩️ 多拿了，放回去</div>' : '') +
        (code ? '<div class="pk-loc">' + esc(code) + '</div>' : '') +
        '<div class="pk-name">' + esc(n.productName) + '</div>' +
        (n.spec ? '<div class="pk-spec">' + esc(n.spec) + '</div>' : '') +
        '<div class="pk-qty">' + (ret ? '放回 ' : '拿 ') + esc(n.pickQty) + ' <small>件</small></div>' +
        '<button class="pk-go' + (ret ? ' ret' : '') + '" onclick="confirmCurrentPick()">' + (ret ? '✓ 放回了' : '✓ 拿好了') + '</button>' +
        (ret ? '' : '<button class="pk-short" onclick="shortPick()">不夠</button>') +
        '<div class="pk-next">' + (nx ? '下一項：<b>' + esc(nx.productName) + ' ' + esc(nx.spec || '') + '</b>　' + esc(nx.pickQty) + ' 件' : '這是最後一項') + '</div>' +
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

// 按大按鈕「拿好了」：現在這一項（練習模式沒有板號，只能按；有板號的也可以掃）
window.confirmCurrentPick = async function() {
    const n = pickingItems.filter(function(i) { return !i.completed && !i.shortage; })[0];
    if (n) await markPicked(n);
};
window.confirmPracticePick = window.confirmCurrentPick;

// 不夠：跳出數字鍵，點實際拿到幾件（戴手套也好按，不用打字）；不夠的記缺貨，不會再叫人去拿
window.shortPick = function() {
    const n = pickingItems.filter(function(i) { return !i.completed && !i.shortage; })[0];
    if (!n || n.type === 'return') return;
    const want = parseFloat(n.pickQty) || 0;
    if (want > 30) {   // 件數太多，數字鍵放不下：用鍵盤
        const ans = prompt(n.productName + ' 要拿 ' + want + ' 件\n實際拿到幾件？（沒有貨填 0）', '0');
        if (ans === null) return;
        const g = parseFloat(String(ans).trim());
        if (!(g >= 0 && g < want) || String(ans).trim() === '') { alert('請填 0 到 ' + (want - 1)); return; }
        return saveShort(n, g);
    }
    const nums = [];
    for (let i = 0; i < want; i++) nums.push(i);
    const pad = $('short-pad');
    pad.innerHTML = '<div class="pad-title">拿到幾件？</div>' +
        '<div class="pad-sub">' + esc(n.productName) + ' ' + esc(n.spec || '') + '　要 ' + want + ' 件</div>' +
        '<div class="pad-grid">' + nums.map(function(v) { return '<button onclick="pickShortNumber(' + v + ')">' + v + '</button>'; }).join('') + '</div>' +
        '<button class="pad-cancel" onclick="closeShortPad()">取消</button>';
    pad.hidden = false;
    window._shortItem = n;
};
window.closeShortPad = function() { $('short-pad').hidden = true; window._shortItem = null; };
window.pickShortNumber = function(v) {
    const n = window._shortItem;
    window.closeShortPad();
    if (n) return saveShort(n, v);
};
async function saveShort(n, got) {
    const want = parseFloat(n.pickQty) || 0;
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
    setResult('picking-scan-result', 'error', '⚠️ ' + n.productName + ' 拿 ' + got + '，不夠 ' + (want - got));
    renderPickingList();
}

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
    setResult('picking-scan-result', true, (found.type === 'return' ? '↩️ 放回 ' : '✓ ') + found.productName + ' ' + found.pickQty + ' 件');
    renderPickingList();
    input.value = '';
    focusIfNoCamera('picking-scan');
}

// 缺貨：不夠的給誰。預設先開單的先給，一個大按鈕「好，完成」；要改才按「改分法」
// （標籤是完成後才印、件數是實際的，不用改標籤）；缺的這次不出、之後也不補，辦公室會提醒業務改鼎新
function renderShortfallPanel() {
    const alloc = window.waveShortAllocation(currentWave, pickingItems);
    const keys = Object.keys(alloc);
    window._shortKeys = keys;
    const lines = [];
    keys.forEach(function(k) {
        alloc[k].orders.forEach(function(o) { if (o.got < o.want) lines.push('<div style="font-size:20px;margin:6px 0"><b>' + esc(o.customer) + '</b>　' + esc(alloc[k].productName) + '　' + (o.got ? '給 ' + o.got + ' 件' : '<b style="color:#fca5a5">沒有</b>') + '</div>'); });
    });
    $('picking-next').innerHTML = '<div class="pk-card" style="border-color:#ef4444"><div class="pk-name" style="font-size:24px">⚠️ 有 ' + keys.length + ' 項不夠</div>' +
        '<div class="pk-sub">先開單的先給，這幾家會少：</div>' + lines.join('') +
        '<button class="pk-go" id="short-ok-btn" onclick="finishWithShortage(true)">好，完成</button>' +
        '<button class="pk-link" id="short-edit-btn" onclick="renderShortEditor()">改分法</button></div>';
    window.scrollTo(0, 0);
}
// 改分法：每家一個數字（加起來要等於拿到的件數）
window.renderShortEditor = function() {
    const alloc = window.waveShortAllocation(currentWave, pickingItems);
    const keys = window._shortKeys = Object.keys(alloc);
    const blocks = keys.map(function(k, bi) {
        const a = alloc[k];
        return '<div style="padding:10px 0;border-bottom:1px solid #7f1d1d;text-align:left"><div style="font-size:19px;font-weight:bold">' + esc(a.productName) + ' ' + esc(a.spec) + '</div>' +
            '<div style="color:#fecaca;margin:2px 0 6px">拿到 <b>' + a.picked + ' 件</b>，要給：</div>' +
            a.orders.map(function(o) {
                return '<div style="display:flex;align-items:center;gap:8px;margin:6px 0"><div style="flex:1;font-size:18px"><b>' + esc(o.customer) + '</b><br><span style="font-size:14px;color:#fecaca">訂 ' + o.want + ' 件</span></div>' +
                    '<input type="number" inputmode="numeric" class="alloc-in qty-input" style="width:90px;margin:0;font-size:26px" data-b="' + bi + '" data-id="' + esc(o.id) + '" data-want="' + o.want + '" value="' + o.got + '" oninput="checkShortPanel()"> 件</div>';
            }).join('') + '<div class="alloc-sum" data-b="' + bi + '" data-picked="' + a.picked + '" style="font-size:16px"></div></div>';
    }).join('');
    $('picking-next').innerHTML = '<div class="pk-card" style="border-color:#ef4444">' + blocks +
        '<button id="short-done-btn" class="pk-go" disabled onclick="finishWithShortage(false)">好，完成</button>' +
        '<button class="pk-link" onclick="renderShortfallPanel()">照原本的分法</button></div>';
    checkShortPanel();
    window.scrollTo(0, 0);
};
window.checkShortPanel = function() {
    let ok = true;
    document.querySelectorAll('.alloc-sum').forEach(function(sumEl) {
        const b = sumEl.dataset.b, picked = parseFloat(sumEl.dataset.picked) || 0;
        let total = 0;
        document.querySelectorAll('.alloc-in[data-b="' + b + '"]').forEach(function(inp) {
            const v = parseFloat(inp.value), want = parseFloat(inp.dataset.want);
            if (!(v >= 0 && v <= want)) ok = false; else total += v;
        });
        const good = total === picked;
        if (!good) ok = false;
        sumEl.innerHTML = good ? '<span style="color:#86efac">✓ 分完了</span>' : '<span style="color:#fca5a5">加起來要等於 ' + picked + ' 件（現在 ' + total + '）</span>';
    });
    const btn = $('short-done-btn');
    if (btn) btn.disabled = !ok;
};
window.finishWithShortage = function(useDefault) {
    let ov = null;
    if (!useDefault) {
        ov = {};
        document.querySelectorAll('.alloc-in').forEach(function(inp) {
            const k = window._shortKeys[+inp.dataset.b];
            ov[k] = ov[k] || {};
            ov[k][inp.dataset.id] = parseFloat(inp.value) || 0;
        });
    }
    window._pendingAlloc = ov;
    return window.completePickingWave(true);
};

// 完成後：一個大按鈕「印標籤」（件數是實際出貨的）。辦公室自動印模式時，這裡只提示
function renderFinishPanel(wave) {
    show('picking-actions', false);
    show('picking-scan-box', false);
    const lb = window.buildSortingLabelsHtml(wave);
    const office = window.labelPrintMode() === 'office';
    $('picking-next').innerHTML = '<div class="pk-card pk-done"><div class="big">✅ 完成</div>' +
        (lb.skipped.length ? '<div class="pk-sub">不用貼標籤：' + esc(lb.skipped.join('、')) + '</div>' : '') +
        (office ? '<div class="pk-sub" style="font-size:20px">🏷️ 標籤在辦公室自動印出（' + lb.count + ' 張）</div>'
                : (lb.count ? '<button class="pk-go" onclick="printLabelsOnPhone()">🖨️ 印標籤（' + lb.count + ' 張）</button>' : '')) +
        '<button class="pk-link" onclick="goBack()">回到選單</button>' +
        '<div class="pk-sub" style="font-size:14px;margin-top:10px">' + (window.isPracticeMode() ? '練習模式：庫存沒有扣' : '庫存已扣除') +
        (wave.shortOrders && wave.shortOrders.length ? '　・　缺的不補，辦公室會請業務改鼎新' : '') + '</div></div>';
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
        if (labelsFixed === true && window._pendingAlloc) currentWave.allocOverride = window._pendingAlloc;   // 現場改過的分法
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
    // 有客戶會少出：先說誰會少（預設先開單的先給），按「好，完成」或改分法
    const shorts = window.waveShortfalls(currentWave, pickingItems);
    if (shorts.length && labelsFixed !== true) { window._pendingAlloc = null; renderShortfallPanel(); return; }

    try {
        window._justCompleted = currentWave.id;   // 自己完成的：不要被「其他裝置完成」的提示蓋掉
        await window.completeWaveTx(currentWave, pickingItems, window.pallets);
        currentWave.status = 'done';
        window._pendingAlloc = null;
        renderFinishPanel(currentWave);
    } catch (e) {
        window._justCompleted = null;
        alert('❌ 完成波次失敗：' + e.message + '\n\n庫存與訂單都沒有變動。');
    }
};
