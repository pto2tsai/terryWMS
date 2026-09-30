// ============================================================
// m/js/picking.js — 波次揀貨
// 揀貨清單與桌機用同一套邏輯（js/shared/picking-list.js），進度寫回 waves.completedItems，兩邊互通；
// 完成波次與桌機呼叫同一個交易：扣庫存、訂單標記出貨、缺貨留記錄。
// ============================================================
let currentWave = null;
let pickingItems = [];
// 先跳過的項目（只影響這支手機的順序）：排到最後，其他拿完再回來拿
let skipOrder = [];
function skipKey(i) { return i.id || (i.key + '@' + i.palletId); }
function bySkip(list) {
    return list.slice().sort(function(a, b) { return skipOrder.indexOf(skipKey(a)) - skipOrder.indexOf(skipKey(b)); });
}

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

// 誰正在揀：選波次時記下名字，每按一次「拿好了／不夠」更新時間；60 分鐘沒動作就不算
const PICKER_ACTIVE_MS = 60 * 60 * 1000;
function myPickerKey() { return (typeof auth !== 'undefined' && auth.currentUser && auth.currentUser.uid) || ''; }
function myPickerName() { const u = window.currentUser || {}; return u.name || String(u.email || u.id || '').split('@')[0] || '有人'; }
// 回傳 [{ name, house }]；sameHouse：只要跟我同一間（或不知道在哪間）的
function otherPickers(w, sameHouse) {
    const me = myPickerKey(), now = Date.now(), p = (w && w.pickers) || {}, mine = myHouse();
    return Object.keys(p).filter(function(k) { return k !== me && p[k] && now - Date.parse(p[k].at) < PICKER_ACTIVE_MS; })
        .map(function(k) { return { name: p[k].name || '有人', house: p[k].house || '' }; })
        .filter(function(x) { return !sameHouse || !x.house || !mine || x.house === mine; });
}
function pickerLabel(x) { return x.name + (x.house ? '（' + window.houseName(x.house) + '）' : ''); }
function pickerTouch() {
    const k = myPickerKey(), o = {};
    if (k) o['pickers.' + k] = { name: myPickerName(), house: myHouse(), at: new Date().toISOString() };
    return o;
}

// 我在哪一間倉庫：這支手機記住（選一次就好，揀貨畫面上方可以切換）
function myHouse() { try { const h = localStorage.getItem('wms_pick_house') || ''; return window.houseName(h) ? h : ''; } catch (e) { return ''; } }
window.chooseHouse = function(id) {
    try { localStorage.setItem('wms_pick_house', id); } catch (e) {}
    if (currentWave) {
        db.collection('waves').doc(currentWave.id).update(pickerTouch()).catch(function() {});
        renderPickingList();
    } else if ($('picking-wave-select').value) window.loadPickingWave();
};
window.switchHouse = function() {
    const hs = window.PICK_HOUSES, i = hs.findIndex(function(h) { return h.id === myHouse(); });
    window.chooseHouse(hs[(i + 1) % hs.length].id);
};
function renderHouseChooser() {
    $('picking-next').innerHTML = '<div class="pk-card"><div class="pk-name">你在哪一間？</div>' +
        '<div class="pk-sub">選一次就記住，之後在上面可以切換</div>' +
        window.PICK_HOUSES.map(function(h) { return '<button class="pk-go" onclick="chooseHouse(\'' + h.id + '\')">📍 ' + esc(h.name) + '</button>'; }).join('') + '</div>';
}
// 商品在哪一間有變（別支手機記起來的）：重畫
window.onProductHomesChange = function() { if (currentWave && window.currentPage === 'picking') renderPickingList(); };
// 還不知道在哪一間的商品，在這間拿到了：記起來
function learnHome(item) {
    if (!item || !item.key || window.homeOf(item.key) || !myHouse()) return;
    window.setProductHome(item, myHouse()).catch(function(e) { console.warn('記住商品所在倉庫失敗', e); });
}
function pickerLeave(waveId) {
    const k = myPickerKey();
    if (!k || !waveId) return;
    const o = {}; o['pickers.' + k] = FieldValue.delete();
    db.collection('waves').doc(waveId).update(o).catch(function() {});
}

function renderWaveOptions() {
    const select = $('picking-wave-select');
    const keep = select.value;
    const list = window.waves.filter(window.isWaveOpen)
        .sort(function(a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
    select.innerHTML = '<option value="">' + (list.length ? '-- 請選擇（' + list.length + ' 個待揀）--' : '目前沒有待揀波次') + '</option>' +
        list.map(function(w) {
            const done = (w.completedItems || []).length;
            const who = otherPickers(w);
            return '<option value="' + esc(w.id) + '">' + esc(w.waveNo) + ' - ' + esc(w.logistics || '') + '（' + esc(w.totalQty || 0) + '件）' +
                (w.status === 'sorting' ? '【已揀完】' : who.length ? '【' + who.map(pickerLabel).join('、') + ' 揀貨中】' : done ? '【進行中】' : '') + '</option>';
        }).join('');
    if (keep && list.some(function(w) { return w.id === keep; })) select.value = keep;
}

window.loadPickingWave = async function() {
    const waveId = $('picking-wave-select').value;
    clearResult('picking-scan-result');
    if (currentWave && currentWave.id !== waveId) { pickerLeave(currentWave.id); skipOrder = []; }   // 換波次：原本的波次不再顯示我在揀
    if (!waveId) {
        currentWave = null; pickingItems = [];
        show('picking-scan-area', false); show('picking-actions', false);
        renderPickingList();
        return;
    }
    // 讀最新的波次（含其他裝置的揀貨進度）
    const snap = await db.collection('waves').doc(waveId).get();
    if (!snap.exists) { alert('波次已不存在'); return window.pageInit.picking(); }
    const w = Object.assign({ id: snap.id }, snap.data());
    // 第一次用：先問在哪一間
    if (!myHouse()) {
        currentWave = null; pickingItems = [];
        show('picking-scan-area', true); show('picking-scan-box', false);
        return renderHouseChooser();
    }
    // 同一間有別人正在揀這個波次：先提醒，避免兩個人拿同一項（另一間的人在揀不用提醒，各拿各的）
    const who = otherPickers(w, true);
    if (who.length && w.status !== 'done' && !confirm('👷 ' + who.map(pickerLabel).join('、') + ' 正在揀這個波次\n\n確定要一起揀嗎？（兩個人會拿到同一項）')) {
        $('picking-wave-select').value = '';
        currentWave = null; pickingItems = [];
        show('picking-scan-area', false);
        return renderPickingList();
    }
    currentWave = w;
    if (w.status !== 'done') db.collection('waves').doc(w.id).update(pickerTouch()).catch(function() {});
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
    const house = myHouse();
    const top = '<div class="pk-top"><span><b>' + done + '</b> / ' + total + ' 項</span>' +
        '<span>' + (window.isPracticeMode() ? '<span class="pk-chip">練習</span> ' : '') +
        '<button class="pk-chip pk-house" onclick="switchHouse()">📍 ' + esc(window.houseName(house)) + ' ⇄</button></span></div>' +
        '<div class="pk-bar"><div style="width:' + pct + '%"></div></div>';
    // 只叫人拿這一間的貨；還不知道在哪一間的，兩間都會出現（先拿到的那間記起來）
    const mine = bySkip(pending.filter(function(i) { const h = window.homeOf(i.key); return !h || h === house; }));
    const other = pending.length - mine.length;
    // 有板號可以掃的才顯示掃描框（練習模式沒有板號）
    const n = mine[0];
    show('picking-scan-box', !!(n && !n.practice));
    if (!n && other) {
        const oh = window.PICK_HOUSES.filter(function(h) { return h.id !== house; }).map(function(h) { return h.name; }).join('、');
        const who = otherPickers(currentWave).filter(function(x) { return x.house && x.house !== house; });
        box.innerHTML = top + warn + '<div class="pk-card pk-done"><div class="big">✅ 這間拿完了</div>' +
            '<div class="pk-sub" style="font-size:22px">' + esc(oh) + '還有 <b>' + other + '</b> 項' + (who.length ? '（' + esc(who.map(function(x) { return x.name; }).join('、')) + ' 揀貨中）' : '') + '</div>' +
            '<div class="pk-sub">兩間都拿完，最後一個人按「完成出貨」</div></div>';
        return;
    }
    if (!n) {
        const nShort = pickingItems.filter(function(i) { return i.fieldShort; }).length;
        box.innerHTML = top + warn + '<div class="pk-card pk-done"><div class="big">✅ 全部拿完</div>' +
            (nShort ? '<div class="pk-sub">有 ' + nShort + ' 項不夠</div>' : '') +
            '<button class="pk-go" onclick="completePickingWave()">完成出貨</button></div>';
        return;
    }
    const ret = n.type === 'return';
    const code = n.practice ? '' : (window.locationShortCode(n.locationId) || n.locationId);
    const nx = mine[1];
    box.innerHTML = top + warn + '<div class="pk-card' + (ret ? ' ret' : '') + '">' +
        (ret ? '<div class="pk-sub" style="color:#fcd34d;font-weight:bold">↩️ 多拿了，放回去</div>' : '') +
        (code ? '<div class="pk-loc">' + esc(code) + '</div>' : '') +
        '<div class="pk-name">' + esc(n.productName) + '</div>' +
        (n.spec ? '<div class="pk-spec">' + esc(n.spec) + '</div>' : '') +
        '<div class="pk-qty">' + (ret ? '放回 ' : '拿 ') + esc(n.pickQty) + ' <small>件</small></div>' +
        '<button class="pk-go' + (ret ? ' ret' : '') + '" onclick="confirmCurrentPick()">' + (ret ? '✓ 放回了' : '✓ 拿好了') + '</button>' +
        (ret ? '' : '<button class="pk-short" onclick="shortPick()">不夠</button>') +
        (mine.length > 1 ? '<button class="pk-skip" onclick="skipCurrentPick()">⏭ 先跳過，等一下再拿</button>' : '') +
        '<div class="pk-next">' + (nx ? '下一項：<b>' + esc(nx.productName) + ' ' + esc(nx.spec || '') + '</b>　' + esc(nx.pickQty) + ' 件' : other ? '這間最後一項' : '這是最後一項') + '</div>' +
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
// 現在這支手機要拿的那一項（這一間的，或還不知道在哪一間的）
function currentItem() {
    const h = myHouse();
    return bySkip(pickingItems.filter(function(i) { const x = window.homeOf(i.key); return !i.completed && !i.shortage && (!x || x === h); }))[0];
}
window.skipCurrentPick = function() {
    const n = currentItem();
    if (!n) return;
    const k = skipKey(n);
    skipOrder = skipOrder.filter(function(x) { return x !== k; }).concat([k]);
    toast('⏭ ' + n.productName + ' 排到最後，等一下再拿');
    renderPickingList();
};
window.confirmCurrentPick = async function() {
    const n = currentItem();
    if (n) await markPicked(n);
};
window.confirmPracticePick = window.confirmCurrentPick;

// 不夠：跳出數字鍵，點實際拿到幾件（戴手套也好按，不用打字）；不夠的記缺貨，不會再叫人去拿
window.shortPick = function() {
    const n = currentItem();
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
    // 還不知道在哪一間的商品，這間一件都沒有：應該在另一間，交給另一間的人拿（不算缺貨）
    const others = window.PICK_HOUSES.filter(function(h) { return h.id !== myHouse(); });
    if (got === 0 && !window.homeOf(n.key) && myHouse() && others.length === 1) {
        try { await window.setProductHome(n, others[0].id); }
        catch (e) { setResult('picking-scan-result', false, '❌ 儲存失敗：' + e.message); return; }
        setResult('picking-scan-result', 'info', '↪️ ' + n.productName + ' 這間沒有，交給 ' + others[0].name);
        return renderPickingList();
    }
    const by = window.currentUser ? (window.currentUser.name || window.currentUser.email || '') : '';
    const upd = Object.assign(pickerTouch(), {
        shortLog: FieldValue.arrayUnion({ id: n.id + '-short-' + Date.now(), key: n.key, qty: want - got, productName: n.productName || '', spec: n.spec || '', by: by, at: new Date().toISOString() }),
        status: 'picking'
    });
    if (got > 0) {
        const part = Object.assign({}, n, { pickQty: got });
        upd.completedItems = FieldValue.arrayUnion(n.id);
        upd.pickLog = FieldValue.arrayUnion(window.pickLogEntry(part));
    }
    try { await db.collection('waves').doc(currentWave.id).update(upd); }
    catch (e) { setResult('picking-scan-result', false, '❌ 儲存失敗：' + e.message); return; }
    if (got > 0) learnHome(n);   // 一件都沒有的不記（可能在另一間）
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
        await db.collection('waves').doc(currentWave.id).update(Object.assign(pickerTouch(), {
            completedItems: FieldValue.arrayUnion(found.id),
            pickLog: FieldValue.arrayUnion(window.pickLogEntry(found)),
            status: currentWave.status === 'sorting' ? 'sorting' : 'picking'
        }));
    } catch (e) {
        setResult('picking-scan-result', false, '❌ 儲存進度失敗：' + e.message);
        return;
    }
    found.completed = true;
    learnHome(found);
    setResult('picking-scan-result', true, (found.type === 'return' ? '↩️ 已放回 ' : '✓ ') + found.productName + ' ' + found.pickQty + ' 件');
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
    const needLb = window.waveNeedsLabels(wave);
    const nSort = sortList(wave).length;
    const sorted = sortList(wave).filter(function(o) { return (wave.sortedOrders || []).indexOf(o.orderNo) >= 0; }).length;
    $('picking-next').innerHTML = '<div class="pk-card pk-done"><div class="big">✅ 完成</div>' +
        // 好幾家的貨一起揀的：要分成一家一堆
        (nSort > 1 ? '<button class="pk-go" style="background:#2563eb" onclick="openSortPanel()">📦 分貨（' + nSort + ' 家）' + (sorted ? ' ' + sorted + '/' + nSort : '') + '</button>' : '') +
        (!needLb ? '<div class="pk-sub" style="font-size:20px">🚚 ' + esc(wave.logistics || '') + '：貼托運單就好，不用印標籤</div>'
            : (lb.skipped.length ? '<div class="pk-sub">不用貼標籤：' + esc(lb.skipped.join('、')) + '</div>' : '') +
              (office ? '<div class="pk-sub" style="font-size:20px">🏷️ 標籤在辦公室自動印出（' + lb.count + ' 張）</div>'
                : (lb.count ? '<button class="pk-go" onclick="printLabelsOnPhone()">🖨️ 印標籤（' + lb.count + ' 張）</button>' : ''))) +
        '<button class="pk-link" onclick="goBack()">回到選單</button>' +
        '<div class="pk-sub" style="font-size:14px;margin-top:10px">' + (window.isPracticeMode() ? '練習模式：庫存沒有扣' : '庫存已扣除') +
        (wave.shortOrders && wave.shortOrders.length ? '　・　缺的不補，辦公室會請業務改鼎新' : '') + '</div></div>';
    window._finishedWave = wave;
    window.scrollTo(0, 0);
}
window.renderFinishPanel = renderFinishPanel;

// 分貨：一家一張卡片，寫這家要幾件（實際出貨的），分好一家按一下
function sortList(wave) { return (wave.shipped || []).filter(function(o) { return (o.items || []).length; }); }
window.openSortPanel = function() {
    const wave = window._finishedWave;
    if (!wave) return;
    const list = sortList(wave), done = wave.sortedOrders || [];
    const left = list.filter(function(o) { return done.indexOf(o.orderNo) < 0; }).length;
    $('picking-next').innerHTML = '<div class="pk-top"><span>📦 分貨　<b>' + (list.length - left) + '</b> / ' + list.length + ' 家</span></div>' +
        list.map(function(o, i) {
            const ok = done.indexOf(o.orderNo) >= 0;
            return '<div class="pk-card sort-card' + (ok ? ' ok' : '') + '"><div class="pk-name" style="font-size:26px">' + esc(o.customer || o.orderNo) + '</div>' +
                (ok ? '<div class="pk-sub">✓ 分好了</div>'
                    : o.items.map(function(it) { return '<div class="sort-line"><span>' + esc(it.productName) + ' ' + esc(it.spec || '') + '</span><b>' + esc(it.qty) + ' 件</b></div>'; }).join('') +
                      '<button class="pk-go" onclick="markSorted(' + i + ')">✓ 這家分好了</button>') + '</div>';
        }).join('') +
        (left ? '' : '<div class="pk-card pk-done"><div class="big">✅ 全部分好了</div></div>') +
        '<button class="pk-link" onclick="renderFinishPanel(window._finishedWave)">← 回上一頁</button>';
};
window.markSorted = async function(i) {
    const wave = window._finishedWave, o = wave && sortList(wave)[i];
    if (!o) return;
    wave.sortedOrders = (wave.sortedOrders || []).concat([o.orderNo]);
    window.openSortPanel();
    try { await db.collection('waves').doc(wave.id).update({ sortedOrders: FieldValue.arrayUnion(o.orderNo) }); }
    catch (e) { console.warn('記錄分貨失敗', e); }
};
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
