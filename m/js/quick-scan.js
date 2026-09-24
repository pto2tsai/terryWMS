// ============================================================
// m/js/quick-scan.js — 掃一下：不用先想要進哪一頁
// 掃板號 → 顯示這板，列出可以做的事（搬到別的儲位、出庫、盤點、併到別板）
// 掃儲位 → 列出這個儲位上有哪些板（點一板再選要做什麼），也可以「在這裡上架一板」
// 選了動作就帶著這一板直接跳到那一頁的下一步，不用再掃一次
// ============================================================
window.pageInit.scan = function() {
    $('qs-body').innerHTML = '<div class="empty-state"><i class="fa-solid fa-qrcode"></i><p>掃棧板單或儲位標籤</p></div>';
    clearResult('qs-result');
    scanNext('qs-input');
};

window.quickScan = function() {
    const input = $('qs-input');
    const raw = input.value.trim();
    if (!raw) return;
    const m = findByScan(window.pallets, raw, ['palletId', 'id']);
    if (m.item) { input.value = ''; return qsShowPallet(m.item); }
    const loc = window.formatLocationId(raw);
    if (window.isValidStorageLocation(loc) || /^V-(SALES|TEMP|QC)$/.test(loc)) { input.value = ''; return qsShowLocation(loc); }
    if (m.items) {   // 板號尾碼對到好幾板
        setResult('qs-result', 'info', m.error);
        $('qs-body').innerHTML = qsPalletList(m.items);
        return;
    }
    setResult('qs-result', false, '❌ 找不到這個板號或儲位：' + normCode(raw));
    input.select();
};

function qsPalletList(list) {
    return list.map(function(p) {
        return '<div class="list-item clickable" onclick="qsPick(\'' + esc(p.id) + '\')">' +
            '<div class="item-row"><span class="item-location">' + esc(p.locationId) + '</span><span class="item-qty">' + esc(p.quantity) + ' 件</span></div>' +
            '<div class="item-product">' + esc(p.productName) + ' ' + esc(p.spec || '') + '</div>' +
            '<div class="item-detail">' + esc(p.palletId) + (p.batchNo ? ' · 批 ' + esc(p.batchNo) : '') + (p.expDate ? ' · 效 ' + esc(p.expDate) : '') + '</div></div>';
    }).join('');
}

window.qsPick = function(id) { const p = palletById(id); if (p) qsShowPallet(p); };

function qsShowPallet(p) {
    clearResult('qs-result');
    const hold = window.isHoldLocation(p.locationId);
    const btn = function(action, icon, text, color, disabled) {
        return '<button class="action-btn" style="background:' + color + ';color:#fff' + (disabled ? ';opacity:.4' : '') + '"' + (disabled ? ' disabled' : '') +
            ' onclick="qsDo(\'' + action + '\', \'' + esc(p.id) + '\')"><i class="fa-solid ' + icon + '"></i> ' + text + '</button>';
    };
    $('qs-body').innerHTML = '<div class="step-card">' + palletInfoHtml(p) +
        (hold ? '<div class="warn-line">⚠️ 這板在留置區（' + esc(p.locationId) + '），不能出庫</div>' : '') +
        '<div style="margin-top:12px">' +
        btn('move', 'fa-right-left', '搬到別的儲位', '#6366f1') +
        btn('out', 'fa-dolly', '出庫', '#ea580c', hold) +
        btn('count', 'fa-clipboard-check', '盤點這板', '#0284c7') +
        btn('merge', 'fa-object-group', '併到別的板', '#a855f7') +
        '</div></div>';
    scanNext('qs-input');
}

function qsShowLocation(loc) {
    const here = palletsAt(loc);
    setResult('qs-result', true, '📍 ' + loc + (here.length ? '：' + here.length + ' 板（點一板選要做什麼）' : '：目前是空的'));
    $('qs-body').innerHTML = qsPalletList(here) +
        '<button class="action-btn" style="background:#14b8a6;color:#fff;margin-top:10px" onclick="qsDo(\'shelve\', \'' + esc(loc) + '\')"><i class="fa-solid fa-boxes-stacked"></i> 在這裡上架一板</button>';
    scanNext('qs-input');
}

// 帶著這一板（或儲位）跳到那一頁的下一步
window.qsDo = function(action, id) {
    if (action === 'shelve') {
        openPage('shelve');
        $('shelve-loc').value = id;
        return window.shelveScanLoc();
    }
    const p = palletById(id);
    if (!p) { toast('這板已經不在了，請重新掃描'); return; }
    if (action === 'move') { openPage('move'); moveSetPallet(p); }
    else if (action === 'out') { openPage('outbound'); outSetPallet(p); }
    else if (action === 'count') { openPage('stocktake'); stSetPallet(p); }
    else if (action === 'merge') { openPage('merge'); mergeSetSrc(p); }
};
