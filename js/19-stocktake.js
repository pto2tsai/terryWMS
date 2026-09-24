// ============================================================
// js/19-stocktake.js — 庫存盤點
// 選區域 → 載入棧板 → （可列印盤點表）→ 輸入實盤數 → 送出
// 只調整有差異的板；每板一個交易，盤點期間被別人異動過的板會跳過並提醒重盤。
// ============================================================

window._stocktake = { rows: [], zone: '', loadedAt: null };

function stEsc(v) {
    return String(v === undefined || v === null ? '' : v).replace(/[&<>"']/g, function(c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

window.initStocktakePage = function() {
    var sel = document.getElementById('st-zone');
    if (!sel || sel.options.length > 1) return;
    var zones = Object.keys(window.RACK_CONFIG.ZONE_LANES);
    sel.innerHTML = '<option value="">選擇區域</option>' +
        zones.map(function(z) { return '<option value="' + z + '">' + z + '（' + window.RACK_CONFIG.ZONE_LANES[z] + ' 排）</option>'; }).join('') +
        '<option value="VIRTUAL">虛擬儲位（暫存區等）</option>';
};

// 載入要盤點的棧板（依儲位排序）
window.loadStocktake = function() {
    var zone = document.getElementById('st-zone').value;
    if (!zone) { alert('請選擇區域'); return; }
    var rowFrom = parseInt(document.getElementById('st-row-from').value) || 1;
    var rowTo = parseInt(document.getElementById('st-row-to').value) || 99;

    var pallets = window.currentPallets ? window.currentPallets() : [];
    var rows = pallets.filter(function(p) {
        var loc = String(p.locationId || '');
        if (zone === 'VIRTUAL') return !/^[IJK]-[A-H]-\d{2}-/.test(loc);
        if (loc.indexOf(zone + '-') !== 0) return false;
        var row = parseInt(loc.split('-')[2], 10) || 0;
        return row >= rowFrom && row <= rowTo;
    }).map(function(p) {
        return {
            id: p.id, palletId: p.palletId || '', locationId: p.locationId || '',
            productName: p.productName || '', spec: p.spec || '', batchNo: p.batchNo || '',
            expiryDate: p.expiryDate || '', company: p.company || '',
            book: parseFloat(p.quantity) || 0, counted: ''
        };
    }).sort(function(a, b) { return a.locationId.localeCompare(b.locationId) || a.productName.localeCompare(b.productName); });

    window._stocktake = { rows: rows, zone: zone, loadedAt: new Date().toISOString() };
    renderStocktake();
};

function renderStocktake() {
    var st = window._stocktake;
    var tbody = document.getElementById('st-list');
    var summary = document.getElementById('st-summary');
    if (!tbody) return;
    if (st.rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-slate-500 py-10">' + (st.zone ? '此範圍沒有庫存' : '請選擇區域並載入') + '</td></tr>';
        summary.innerHTML = '';
        return;
    }
    tbody.innerHTML = st.rows.map(function(r, i) {
        var diff = r.counted === '' ? '' : (parseFloat(r.counted) - r.book);
        var diffHtml = diff === '' ? '<span class="text-slate-600">-</span>' :
            diff === 0 ? '<span class="text-emerald-400">✓</span>' :
            '<span class="font-bold ' + (diff > 0 ? 'text-blue-400' : 'text-red-400') + '">' + (diff > 0 ? '+' : '') + diff + '</span>';
        return '<tr class="border-b border-slate-700">' +
            '<td class="p-2 font-mono text-cyan-400">' + stEsc(r.locationId) + '</td>' +
            '<td class="p-2 font-mono text-slate-400 text-xs">' + stEsc(r.palletId) + '</td>' +
            '<td class="p-2 text-white">' + stEsc(r.productName) + '</td>' +
            '<td class="p-2 text-slate-300">' + stEsc(r.spec) + '</td>' +
            '<td class="p-2 text-slate-400 text-xs">' + stEsc(r.batchNo) + '<br>' + stEsc(r.expiryDate) + '</td>' +
            '<td class="p-2 text-right text-white">' + r.book + '</td>' +
            '<td class="p-2 text-right"><input type="number" min="0" class="st-count scan-input w-24 text-right" data-idx="' + i + '" value="' + stEsc(r.counted) + '" oninput="onStocktakeInput(' + i + ', this.value)"></td>' +
            '<td class="p-2 text-right st-diff-' + i + '">' + diffHtml + '</td>' +
            '</tr>';
    }).join('');
    updateStocktakeSummary();
}

window.onStocktakeInput = function(i, v) {
    var r = window._stocktake.rows[i];
    r.counted = v === '' ? '' : v;
    var cell = document.querySelector('.st-diff-' + i);
    if (cell) {
        var diff = r.counted === '' ? '' : (parseFloat(r.counted) - r.book);
        cell.innerHTML = diff === '' ? '<span class="text-slate-600">-</span>' :
            diff === 0 ? '<span class="text-emerald-400">✓</span>' :
            '<span class="font-bold ' + (diff > 0 ? 'text-blue-400' : 'text-red-400') + '">' + (diff > 0 ? '+' : '') + diff + '</span>';
    }
    updateStocktakeSummary();
};

function updateStocktakeSummary() {
    var rows = window._stocktake.rows;
    var counted = rows.filter(function(r) { return r.counted !== ''; });
    var diffs = counted.filter(function(r) { return parseFloat(r.counted) !== r.book; });
    var el = document.getElementById('st-summary');
    if (el) el.innerHTML = '共 ' + rows.length + ' 板｜已盤 ' + counted.length + '｜差異 <span class="' + (diffs.length ? 'text-amber-400 font-bold' : 'text-emerald-400') + '">' + diffs.length + '</span>';
}

// 未輸入的板一律填入帳面數（現場確認無誤時用）
window.fillStocktakeBook = function() {
    window._stocktake.rows.forEach(function(r) { if (r.counted === '') r.counted = String(r.book); });
    renderStocktake();
};

window.printStocktakeSheet = function() {
    var st = window._stocktake;
    if (st.rows.length === 0) { alert('請先載入盤點清單'); return; }
    var html = '<style>table{width:100%;border-collapse:collapse}th,td{border:1px solid #333;padding:6px;font-size:13px}th{background:#eee}.r{text-align:right}.blank{width:90px}</style>';
    html += '<h2 style="margin:0 0 6px">庫存盤點表　' + stEsc(st.zone) + '</h2>';
    html += '<div style="margin-bottom:8px;font-size:12px">列印時間：' + new Date().toLocaleString('zh-TW') + '　共 ' + st.rows.length + ' 板　盤點人：________</div>';
    html += '<table><thead><tr><th>儲位</th><th>板號</th><th>品名</th><th>規格</th><th>批號</th><th>效期</th><th class="r">帳面</th><th class="blank">實盤</th></tr></thead><tbody>';
    st.rows.forEach(function(r) {
        html += '<tr><td>' + stEsc(r.locationId) + '</td><td>' + stEsc(r.palletId) + '</td><td>' + stEsc(r.productName) + '</td><td>' + stEsc(r.spec) + '</td><td>' + stEsc(r.batchNo) + '</td><td>' + stEsc(r.expiryDate) + '</td><td class="r">' + r.book + '</td><td></td></tr>';
    });
    html += '</tbody></table>';
    openPrintPreview(html, '庫存盤點表 ' + st.zone, 1000, 800);
};

// 送出：只處理有輸入且與帳面不同的板
window.submitStocktake = async function() {
    var st = window._stocktake;
    var todo = st.rows.filter(function(r) { return r.counted !== '' && parseFloat(r.counted) !== r.book; });
    var bad = todo.filter(function(r) { return isNaN(parseFloat(r.counted)) || parseFloat(r.counted) < 0; });
    if (bad.length) { alert('實盤數不能是負數或非數字：' + bad.map(function(r) { return r.locationId; }).join('、')); return; }
    if (todo.length === 0) { alert('沒有差異需要調整'); return; }

    var msg = '確認調整 ' + todo.length + ' 板的盤點差異？\n';
    todo.slice(0, 15).forEach(function(r) {
        msg += '\n・' + r.locationId + ' ' + r.productName + '：帳面 ' + r.book + ' → 實盤 ' + r.counted;
    });
    if (todo.length > 15) msg += '\n…另有 ' + (todo.length - 15) + ' 板';
    if (!confirm(msg)) return;

    var done = 0, changed = [], failed = [], changedIds = {};
    for (var i = 0; i < todo.length; i++) {
        var r = todo[i];
        var counted = parseFloat(r.counted);
        var ref = window.db.collection('pallets').doc(r.id);
        try {
            await window.db.runTransaction(async function(tx) {
                var snap = await tx.get(ref);
                if (!snap.exists) throw new Error('此板已不存在');
                var cur = parseFloat(snap.data().quantity) || 0;
                var curLoc = String(snap.data().locationId || '');
                if (curLoc !== r.locationId) {
                    var em = new Error('盤點期間此板已移到 ' + curLoc + '，請到新儲位重新盤點');
                    em.changed = true;
                    throw em;
                }
                if (cur !== r.book) {
                    var e = new Error('盤點期間有異動（帳面 ' + r.book + ' → 現在 ' + cur + '），請重新盤點此板');
                    e.changed = true;
                    throw e;
                }
                if (counted === 0) tx.delete(ref);
                else tx.update(ref, Object.assign({ quantity: counted, lastStocktakeAt: new Date().toISOString() }, window.scaledWeight(snap.data(), cur, counted)));
                tx.set(window.db.collection('inventoryLogs').doc(), window.buildInventoryLogEntry({
                    type: 'adjust',
                    company: r.company,
                    productName: r.productName,
                    spec: r.spec,
                    batchNo: r.batchNo,
                    quantity: counted,
                    quantityChange: counted - r.book,
                    locationId: r.locationId,
                    palletId: r.palletId,
                    note: '盤點：帳面 ' + r.book + ' → 實盤 ' + counted
                }));
            });
            done++;
        } catch (e) {
            if (e.changed) changedIds[r.id] = true;
            (e.changed ? changed : failed).push(r.locationId + ' ' + r.productName + '：' + e.message);
        }
    }

    var result = '✅ 已調整 ' + done + ' 板';
    if (changed.length) result += '\n\n⚠️ 以下 ' + changed.length + ' 板盤點期間有異動，未調整（實盤數已清空，請重新數）：\n' + changed.join('\n');
    if (failed.length) result += '\n\n❌ 失敗 ' + failed.length + ' 板：\n' + failed.join('\n');
    alert(result);

    // 重新載入最新帳面：盤點期間有異動的板清空實盤數，一定要重新數過（不能直接再送出舊的數字蓋掉揀貨）；
    // 其他失敗的板保留已輸入的實盤數
    var keep = {};
    st.rows.forEach(function(r) { if (!changedIds[r.id]) keep[r.id] = r.counted; });
    setTimeout(function() {
        window.loadStocktake();
        window._stocktake.rows.forEach(function(r) {
            if (keep[r.id] !== undefined && parseFloat(keep[r.id]) !== r.book) r.counted = keep[r.id];
        });
        renderStocktake();
    }, 600);
};
