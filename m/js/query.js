// ============================================================
// m/js/query.js — 庫存快查：品名、規格、板號、批號、儲位都可以搜（可掃儲位標籤看該儲位有什麼）
// ============================================================
window.pageInit.query = function() { focusIfNoCamera('query-input'); };

window.doInventoryQuery = function() {
    const input = $('query-input');
    const result = $('query-result');
    const raw = input.value.trim();
    if (!raw) return;
    const kw = raw.toLowerCase();
    const key = codeKey(raw);
    const locKey = codeKey(window.formatLocationId(raw));

    const matches = window.pallets.filter(function(p) {
        return String(p.productName || '').toLowerCase().indexOf(kw) >= 0 ||
            String(p.spec || '').toLowerCase().indexOf(kw) >= 0 ||
            (key && codeKey(p.palletId).indexOf(key) >= 0) ||
            (key && codeKey(p.batchNo).indexOf(key) >= 0) ||
            (key && codeKey(p.productCode) === key) ||
            (locKey && codeKey(p.locationId).indexOf(locKey) === 0);
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
        grouped[k].total += parseFloat(p.quantity) || 0;
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
    input.select();
};
