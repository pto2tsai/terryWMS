// ============================================================
// m/js/scan-ops.js — 現場掃描作業：上架、出庫、移板、併板
// 全部走 js/shared/stock-core.js 的交易（讀最新數量、檢查、寫入、寫異動記錄在同一筆完成）
// 掃棧板時可掃板號、只打尾碼，或掃儲位標籤（該儲位只有一板時直接帶出）
// ============================================================

// 共用：掃棧板 → 找到就呼叫 onPallet(p)；多筆時列出讓使用者點
function scanPalletInto(inputId, resultId, choicesId, pickFn, onPallet) {
    const input = $(inputId);
    const scanned = input.value.trim();
    if (!scanned) return;
    $(choicesId).innerHTML = '';
    const r = resolvePalletScan(scanned);
    if (r.pallet) { input.value = ''; return onPallet(r.pallet); }
    setResult(resultId, false, '❌ ' + r.error);
    if (r.choices) {
        renderChoices(choicesId, r.choices, pickFn);
        if (camScanner) closeCameraScan();   // 讓使用者點選
    }
    input.select();
}

// ==================== 上架（把棧板放到儲位，可順便修正點數）====================
const shelve = { loc: null, pallet: null };

window.pageInit.shelve = function() { resetShelve(); };

window.resetShelve = function() {
    shelve.loc = null; shelve.pallet = null;
    show('shelve-step1', true); show('shelve-step2', false); show('shelve-step3', false);
    $('shelve-choices').innerHTML = '';
    clearResult('shelve-result');
    scanNext('shelve-loc');
};

window.shelveScanLoc = function() {
    const input = $('shelve-loc');
    const loc = window.formatLocationId(input.value);
    if (!loc) return;
    if (!window.isValidStorageLocation(loc)) {
        setResult('shelve-result', false, '❌ 儲位格式不正確：' + loc);
        input.select();
        return;
    }
    shelve.loc = loc;
    $('shelve-loc-show').innerText = loc;
    const here = palletsAt(loc);
    $('shelve-loc-note').innerText = here.length ? '此儲位目前有 ' + here.length + ' 板' : '此儲位目前是空的';
    show('shelve-step1', false); show('shelve-step2', true);
    setResult('shelve-result', true, '✓ 儲位 ' + loc + '，請掃棧板');
    scanNext('shelve-pallet');
};

window.shelveScanPallet = function() {
    scanPalletInto('shelve-pallet', 'shelve-result', 'shelve-choices', 'shelvePick', shelveSetPallet);
};
window.shelvePick = function(id) { const p = palletById(id); if (p) shelveSetPallet(p); };

function shelveSetPallet(p) {
    shelve.pallet = p;
    $('shelve-choices').innerHTML = '';
    $('shelve-pallet-info').innerHTML = palletInfoHtml(p);
    $('shelve-qty').value = p.quantity;
    show('shelve-step2', false); show('shelve-step3', true);
    setResult('shelve-result', true, '✓ ' + p.productName + '：' + p.locationId + ' → ' + shelve.loc);
}

window.confirmShelve = async function() {
    const p = shelve.pallet, loc = shelve.loc;
    if (!p || !loc) return;
    const qty = parseFloat($('shelve-qty').value);
    if (isNaN(qty) || qty < 0) { setResult('shelve-result', false, '❌ 請輸入正確數量'); return; }
    const delta = qty - (parseFloat(p.quantity) || 0);
    const moved = p.locationId !== loc;
    if (!moved && delta === 0) { setResult('shelve-result', 'info', '儲位與數量都沒有變動'); return resetShelve(); }
    if (delta !== 0 && !confirm('點數與帳上不同\n\n帳上：' + p.quantity + '\n實際：' + qty + '\n\n以實際數量更新？')) return;
    const extra = moved ? { locationId: loc, movedAt: new Date().toISOString(), movedBy: window.currentUser ? window.currentUser.email : '' } : {};
    try {
        await window.runStockTransaction({
            changes: [{ ref: palletRef(p), delta: delta, extra: extra, label: p.palletId }],
            validate: function(results) {
                const r = results[palletRef(p).path];
                if (r.before !== (parseFloat(p.quantity) || 0)) throw new Error('此板數量剛被其他人異動（現在 ' + r.before + '），請重新掃描');
            },
            logs: function(results) {
                const r = results[palletRef(p).path];
                const base = { company: p.company, productName: p.productName, spec: p.spec, batchNo: p.batchNo, palletId: p.palletId, expDate: p.expDate };
                const out = [];
                if (moved) out.push(Object.assign({}, base, { type: 'move', quantity: r.after, quantityChange: 0, locationId: loc, fromLocation: p.locationId, toLocation: loc, note: '手機上架' }));
                if (delta !== 0) out.push(Object.assign({}, base, { type: 'adjust', quantity: r.after, quantityChange: delta, locationId: loc, note: '手機上架點數修正：' + r.before + ' → ' + r.after }));
                return out;
            }
        });
        setResult('shelve-result', true, '✅ ' + p.productName + ' ' + qty + ' 件已上架 @ ' + loc);
        shelve.pallet = null;
        // 同一個儲位可能還要放下一板：留在掃棧板這一步
        show('shelve-step3', false); show('shelve-step2', true);
        scanNext('shelve-pallet');
    } catch (e) {
        setResult('shelve-result', false, '❌ 上架失敗：' + e.message);
    }
};

// ==================== 出庫（直接扣某一板）====================
let outPallet = null;

window.pageInit.outbound = function() { resetOutbound(); };

window.resetOutbound = function() {
    outPallet = null;
    show('out-step1', true); show('out-step2', false);
    $('out-choices').innerHTML = '';
    $('out-qty').value = '';
    $('out-note').value = '';
    clearResult('out-result');
    scanNext('out-pallet');
};

window.outScanPallet = function() {
    scanPalletInto('out-pallet', 'out-result', 'out-choices', 'outPick', outSetPallet);
};
window.outPick = function(id) { const p = palletById(id); if (p) outSetPallet(p); };

function outSetPallet(p) {
    outPallet = p;
    $('out-choices').innerHTML = '';
    $('out-pallet-info').innerHTML = palletInfoHtml(p);
    const stock = parseFloat(p.quantity) || 0;
    const nums = [1, 5, 10, 20, 50].filter(function(n) { return n < stock; });
    $('out-quick').innerHTML = nums.map(function(n) { return '<button onclick="outAddQty(' + n + ')">+' + n + '</button>'; }).join('') +
        '<button onclick="outSetQty(' + stock + ')" style="background:#9a3412">全部 ' + stock + '</button>';
    $('out-qty').value = '';
    show('out-step1', false); show('out-step2', true);
    setResult('out-result', true, '✓ ' + p.productName + '（庫存 ' + stock + '）');
    focusIfNoCamera('out-qty');
}
window.outAddQty = function(n) {
    const max = parseFloat(outPallet && outPallet.quantity) || 0;
    $('out-qty').value = Math.min((parseFloat($('out-qty').value) || 0) + n, max);
};
window.outSetQty = function(n) { $('out-qty').value = n; };

window.confirmOutbound = async function() {
    const p = outPallet;
    if (!p) return;
    const qty = parseFloat($('out-qty').value) || 0;
    if (qty <= 0) { setResult('out-result', false, '❌ 請輸入出庫數量'); return; }
    const note = $('out-note').value.trim();
    try {
        const results = await window.runStockTransaction({
            changes: [{ ref: palletRef(p), delta: -qty, deleteWhenEmpty: true, label: p.palletId }],
            logs: function(res) {
                const r = res[palletRef(p).path];
                return [{ type: 'outbound', company: p.company, productName: p.productName, spec: p.spec, batchNo: p.batchNo,
                    palletId: p.palletId, expDate: p.expDate, locationId: p.locationId, quantity: qty, quantityChange: -qty,
                    note: '手機掃描出庫' + (note ? '：' + note : '') + '（剩 ' + r.after + '）' }];
            }
        });
        const r = results[palletRef(p).path];
        setResult('out-result', true, '✅ ' + p.productName + ' 出庫 ' + qty + ' 件' + (r.deleted ? '，此板已清空' : '，剩 ' + r.after + ' 件'));
        outPallet = null;
        show('out-step2', false); show('out-step1', true);
        scanNext('out-pallet');
    } catch (e) {
        setResult('out-result', false, '❌ 出庫失敗：' + e.message);
    }
};

// ==================== 移板 ====================
let movePallet = null;

window.pageInit.move = function() { resetMove(); };

window.resetMove = function() {
    movePallet = null;
    show('move-step1', true); show('move-step2', false);
    $('move-choices').innerHTML = '';
    clearResult('move-result');
    scanNext('move-pallet');
};

window.moveScanPallet = function() {
    scanPalletInto('move-pallet', 'move-result', 'move-choices', 'movePick', moveSetPallet);
};
window.movePick = function(id) { const p = palletById(id); if (p) moveSetPallet(p); };

function moveSetPallet(p) {
    movePallet = p;
    $('move-choices').innerHTML = '';
    $('move-pallet-info').innerHTML = palletInfoHtml(p);
    show('move-step1', false); show('move-step2', true);
    setResult('move-result', true, '✓ ' + p.productName + '，請掃新儲位');
    scanNext('move-loc');
}

window.moveScanLoc = async function() {
    const input = $('move-loc');
    const loc = window.formatLocationId(input.value);
    const p = movePallet;
    if (!loc || !p) return;
    if (!window.isValidStorageLocation(loc)) { setResult('move-result', false, '❌ 儲位格式不正確：' + loc); input.select(); return; }
    if (loc === p.locationId) { setResult('move-result', false, '❌ 已經在 ' + loc + ' 了'); input.select(); return; }
    const already = palletsAt(loc).length;
    try {
        await window.movePalletTx(palletRef(p), loc, { note: '手機掃描移板' });
        setResult('move-result', true, '✅ ' + p.productName + '：' + p.locationId + ' → ' + loc + (already ? '（此儲位原有 ' + already + ' 板）' : ''));
        movePallet = null;
        show('move-step2', false); show('move-step1', true);
        scanNext('move-pallet');
    } catch (e) {
        setResult('move-result', false, '❌ 移板失敗：' + e.message);
    }
};

// ==================== 併板（把 A 板整板併入 B 板）====================
const merge = { src: null, tgt: null };

window.pageInit.merge = function() { resetMerge(); };

window.resetMerge = function() {
    merge.src = null; merge.tgt = null;
    show('merge-step1', true); show('merge-step2', false); show('merge-step3', false);
    $('merge-choices').innerHTML = '';
    clearResult('merge-result');
    scanNext('merge-src');
};

window.mergeScanSrc = function() {
    scanPalletInto('merge-src', 'merge-result', 'merge-choices', 'mergePickSrc', mergeSetSrc);
};
window.mergePickSrc = function(id) { const p = palletById(id); if (p) mergeSetSrc(p); };
function mergeSetSrc(p) {
    merge.src = p;
    $('merge-choices').innerHTML = '';
    $('merge-src-info').innerHTML = palletInfoHtml(p);
    show('merge-step1', false); show('merge-step2', true);
    setResult('merge-result', true, '✓ 要併掉的板：' + p.productName + ' ' + p.quantity + ' 件，請掃要併入的板');
    scanNext('merge-tgt');
}

window.mergeScanTgt = function() {
    scanPalletInto('merge-tgt', 'merge-result', 'merge-choices', 'mergePickTgt', mergeSetTgt);
};
window.mergePickTgt = function(id) { const p = palletById(id); if (p) mergeSetTgt(p); };
function mergeSetTgt(p) {
    const s = merge.src;
    if (p.id === s.id) { setResult('merge-result', false, '❌ 是同一板，請掃另一板'); return; }
    try { window.checkMergeCompatible(s, p); } catch (e) { setResult('merge-result', false, '❌ ' + e.message); return; }
    merge.tgt = p;
    $('merge-choices').innerHTML = '';
    const warns = window.mergeWarnings(s, p);
    const total = (parseFloat(s.quantity) || 0) + (parseFloat(p.quantity) || 0);
    $('merge-preview').innerHTML = palletInfoHtml(p) +
        '<div style="margin-top:12px;font-size:18px;text-align:center">' + esc(s.quantity) + ' + ' + esc(p.quantity) + ' = <b style="color:#fbbf24;font-size:24px">' + total + '</b> 件</div>' +
        '<div style="text-align:center;color:#94a3b8;font-size:13px">' + esc(s.locationId) + ' 的板會併到 ' + esc(p.locationId) + '，原儲位空出</div>' +
        (warns.length ? '<div style="color:#fbbf24;font-size:13px;margin-top:8px">⚠️ ' + warns.map(esc).join('<br>⚠️ ') + '</div>' : '');
    show('merge-step2', false); show('merge-step3', true);
    setResult('merge-result', true, '✓ 請確認合併');
}

window.confirmMerge = async function() {
    const s = merge.src, t = merge.tgt;
    if (!s || !t) return;
    try {
        // 效期不同已在畫面上提醒過，直接合併（效期取較早的）；批號不同在上一步就擋下
        const r = await window.mergePalletsTx(palletRef(s), palletRef(t), { note: '手機掃描併板' }, { allowMixed: true });
        setResult('merge-result', true, '✅ 已合併：' + t.productName + ' 共 ' + r.total + ' 件 @ ' + t.locationId + '，' + s.locationId + ' 已空出');
        merge.src = null; merge.tgt = null;
        show('merge-step3', false); show('merge-step1', true);
        scanNext('merge-src');
    } catch (e) {
        setResult('merge-result', false, '❌ 合併失敗：' + e.message);
    }
};
