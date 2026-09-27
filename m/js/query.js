// ============================================================
// m/js/query.js — 庫存快查：品名、規格、品號、板號、批號、儲位都可以搜（可掃儲位標籤看該儲位有什麼）
// 規格不用打完整：好幾個字用空白分開、符號可省略（例如「白仁 6070」找得到 60/70*1KG 的白仁）
// ============================================================
window.pageInit.query = function() { focusIfNoCamera('query-input'); };

// 比對用：全形轉半形、轉小寫、去掉空白和符號（60/70*1KG → 60701kg）
function qNorm(v) {
    return String(v == null ? '' : v).replace(/[\uFF01-\uFF5E]/g, function(c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
        .toLowerCase().replace(/[\s\/*＊×\-_.,，、()（）\[\]【】+~～:：'"]/g, '');
}
// 關鍵字拆開：空白分開的每一段都要有；中文和數字黏在一起的也拆開（白仁6070 → 白仁、6070）
function qTerms(raw) {
    const out = [];
    String(raw).split(/[\s,，、]+/).forEach(function(part) {
        (part.match(/[\u3400-\u9fff]+|[^\u3400-\u9fff]+/g) || []).forEach(function(t) { t = qNorm(t); if (t) out.push(t); });
    });
    return out;
}

const QUERY_EMPTY_HTML = document.getElementById('query-result') ? document.getElementById('query-result').innerHTML : '';

// live＝邊打邊查（不選取文字，不然下一個字會把前面蓋掉）
window.doInventoryQuery = function(live) {
    const input = $('query-input');
    const result = $('query-result');
    const raw = input.value.trim();
    if (!raw) { if (live === true) result.innerHTML = QUERY_EMPTY_HTML; return; }
    const key = codeKey(raw);
    const locKey = codeKey(window.formatLocationId(raw));
    const terms = qTerms(raw);

    const matches = window.pallets.filter(function(p) {
        // 板號、儲位（一整段）
        if ((key && codeKey(p.palletId).indexOf(key) >= 0) || (locKey && codeKey(p.locationId).indexOf(locKey) === 0)) return true;
        // 品名、規格、品號、批號：每個關鍵字都要出現在其中一個地方，不用完全一樣、不用照順序
        const text = qNorm(p.productName) + '|' + qNorm(p.spec) + '|' + qNorm(p.productId || p.productCode) + '|' + qNorm(p.batchNo);
        return terms.length > 0 && terms.every(function(t) { return text.indexOf(t) >= 0; });
    });
    if (matches.length === 0) {
        result.innerHTML = '<div class="empty-state"><i class="fa-solid fa-search"></i><p>找不到：' + esc(raw) + '</p></div>';
        lastResult = { ok: false, text: '找不到：' + raw };
        return;
    }
    const grouped = {};
    matches.forEach(function(p) {
        const k = p.productName + '|' + (p.spec || '');
        if (!grouped[k]) grouped[k] = { name: p.productName, spec: p.spec, items: [], total: 0 };
        grouped[k].items.push(p);
        grouped[k].total = Math.round((grouped[k].total + (parseFloat(p.quantity) || 0)) * 1000) / 1000;
    });
    result.innerHTML = '<div class="list-header"><h4>' + matches.length + ' 板</h4></div>' + Object.values(grouped).map(function(g) {
        g.items.sort(function(a, b) { return String(a.expDate || '9999').localeCompare(String(b.expDate || '9999')); });
        return '<div class="result-card"><div class="item-row"><div class="result-product">' + esc(g.name) + '</div><span class="result-qty">共 ' + g.total + ' 件</span></div>' +
            '<div class="result-spec">' + esc(g.spec || '') + '</div>' +
            g.items.map(function(p) {
                return '<div class="result-row"><span class="result-loc">' + esc(p.locationId) + '</span>' +
                    '<span class="result-qty">' + esc(p.quantity) + ' 件</span></div>' +
                    '<div class="item-detail" style="padding-bottom:6px">' + esc(p.palletId) + (p.batchNo ? ' · 批 ' + esc(p.batchNo) : '') + (p.expDate ? ' · 效 ' + esc(p.expDate) : '') + '</div>';
            }).join('') + '</div>';
    }).join('');
    lastResult = { ok: true, text: '找到 ' + matches.length + ' 板' };
    if (live !== true) input.select();
};

// 邊打邊查：停手 0.3 秒就顯示結果，不用按放大鏡（中文注音／拼音選字完才查）
(function() {
    const input = document.getElementById('query-input');
    if (!input) return;
    let timer = null;
    const later = function() { clearTimeout(timer); timer = setTimeout(function() { window.doInventoryQuery(true); }, 300); };
    input.addEventListener('input', function(e) { if (!e.isComposing) later(); });
    input.addEventListener('compositionend', later);
})();
