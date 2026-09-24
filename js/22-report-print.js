// ============================================================
// js/22-report-print.js — 報表列印與 Excel 匯出（共用）
// 列印：A4 分頁，每頁有抬頭、報表名稱、查詢條件、欄位表頭、頁碼；最後一頁有合計與簽核欄
// Excel：表格上方加抬頭、報表名稱、查詢條件、製表時間與製表人，最下面加合計列
//
// 用法：
//   window.printTableReport({ title, meta: [['查詢期間','2026-09-01 ~ 2026-09-24'], ...],
//       columns: [{ key, label, num }], rows: [...], totals: 'auto' | { key: 值 } | null,
//       orientation: 'auto' | 'portrait' | 'landscape', signatures: true })
//   window.exportTableReportXlsx({ 同上, fileName, sheetName })
// ============================================================

// 報表抬頭（公司名稱）：系統設定 settings/report.orgName，沒設定時用預設
window.getReportOrgName = function() {
    return (window.reportSettings && window.reportSettings.orgName) || 'TERRY WMS 倉儲管理系統';
};
window.onLogin && window.onLogin(async function() {
    try {
        var snap = await window.db.collection('settings').doc('report').get();
        if (snap.exists) window.reportSettings = snap.data();
    } catch (e) {}
});
window.setReportOrgName = async function() {
    var v = prompt('報表抬頭（印在每張報表最上面，例如公司全名）：', window.getReportOrgName());
    if (v === null) return;
    v = v.trim();
    try {
        await window.db.collection('settings').doc('report').set({ orgName: v }, { merge: true });
        window.reportSettings = Object.assign({}, window.reportSettings, { orgName: v });
        alert('✅ 已儲存報表抬頭');
    } catch (e) { alert('❌ 儲存失敗（需主管以上權限）：' + e.message); }
};

function rpEsc(v) {
    return String(v === undefined || v === null ? '' : v).replace(/[&<>"']/g, function(c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

function rpNow() {
    var d = new Date();
    return d.toLocalYMD() + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
}
function rpUser() {
    var u = window.currentUser;
    return u ? (u.name || u.email || '') : '';
}

// 欄位：字串陣列也可以；數字欄位依第一筆有值的資料判斷
function rpColumns(columns, rows) {
    return columns.map(function(c) {
        if (typeof c === 'string') c = { key: c, label: c };
        if (c.num === undefined) {
            var sample = rows.find(function(r) { return r[c.key] !== undefined && r[c.key] !== '' && r[c.key] !== null; });
            c.num = !!sample && typeof sample[c.key] === 'number';
        }
        return c;
    });
}

// 合計：只加「數量、件數、板數、重量、金額」這類欄位（單價、比率、天數、排名不加）
function rpTotals(cols, rows, totals) {
    if (totals === null || totals === false) return null;
    if (totals && totals !== 'auto') return totals;
    var out = {}, any = false;
    cols.forEach(function(c) {
        if (!c.num) return;
        if (/(率|比|價|平均|排名|序|天數|天$|日$|容)/.test(c.label)) return;
        if (!/(數|量|重|金額|板|件|筆|總|合計|租)/.test(c.label)) return;
        var sum = rows.reduce(function(s, r) { return s + (parseFloat(r[c.key]) || 0); }, 0);
        out[c.key] = Math.round(sum * 100) / 100;
        any = true;
    });
    return any ? out : null;
}

function rpFmt(v) {
    if (typeof v === 'number') return v.toLocaleString('zh-TW', { maximumFractionDigits: 2 });
    return v === undefined || v === null ? '' : v;
}

// ---------- 列印（A4 分頁）----------
window.printTableReport = function(opts) {
    var rows = opts.rows || [];
    if (rows.length === 0) { alert('沒有資料可列印'); return; }
    var cols = rpColumns(opts.columns, rows);
    var totals = rpTotals(cols, rows, opts.totals);
    var landscape = opts.orientation === 'landscape' || (opts.orientation !== 'portrait' && cols.length > 7);
    var W = landscape ? 1123 : 794, H = landscape ? 794 : 1123;
    var meta = (opts.meta || []).concat([['製表時間', rpNow()], ['製表人', rpUser()], ['筆數', rows.length + ' 筆']]);

    var payload = {
        org: window.getReportOrgName(), title: opts.title || '報表', meta: meta,
        cols: cols.map(function(c) { return { key: c.key, label: c.label, num: c.num }; }),
        rows: rows.map(function(r) { var o = {}; cols.forEach(function(c) { o[c.key] = rpFmt(r[c.key]); }); return o; }),
        totals: totals ? (function() { var o = {}; cols.forEach(function(c) { o[c.key] = totals[c.key] !== undefined ? rpFmt(totals[c.key]) : ''; }); return o; })() : null,
        signatures: opts.signatures !== false, W: W, H: H
    };

    var css = [
        '@page{size:A4 ' + (landscape ? 'landscape' : 'portrait') + ';margin:0}',
        '*{box-sizing:border-box}',
        'body{margin:0;background:#475569;font-family:"Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif;color:#111}',
        '.bar{position:sticky;top:0;z-index:10;background:#1e3a8a;color:#fff;padding:10px 20px;display:flex;align-items:center;gap:12px}',
        '.bar b{font-size:16px;flex:1}.bar button{padding:8px 20px;border:0;border-radius:6px;font-size:15px;font-weight:bold;cursor:pointer}',
        '.bar .p{background:#10b981;color:#fff}.bar .c{background:#64748b;color:#fff}',
        '#pages{padding:20px 0;display:flex;flex-direction:column;align-items:center;gap:20px}',
        '.page{width:' + W + 'px;height:' + H + 'px;overflow:hidden;position:relative;background:#fff;box-shadow:0 4px 20px rgba(0,0,0,.4)}',
        '.content{padding:36px 40px 0}',
        '.org{font-size:13px;color:#475569;text-align:center;letter-spacing:2px}',
        '.title{font-size:22px;font-weight:bold;text-align:center;margin:4px 0 10px}',
        '.meta{display:flex;flex-wrap:wrap;gap:4px 18px;font-size:12px;color:#334155;border-top:2px solid #111;border-bottom:1px solid #94a3b8;padding:6px 0;margin-bottom:8px}',
        '.meta span b{color:#111;margin-left:4px}',
        'table{width:100%;border-collapse:collapse;font-size:12px}',
        'th{background:#e2e8f0;border:1px solid #64748b;padding:6px 6px;text-align:left;white-space:nowrap}',
        'td{border:1px solid #94a3b8;padding:5px 6px;vertical-align:top;word-break:break-all}',
        'td.n,th.n{text-align:right;white-space:nowrap}',
        'tr.tot td{background:#f1f5f9;font-weight:bold;border-top:2px solid #111}',
        '.sign{display:flex;gap:16px;margin-top:18px;font-size:13px}',
        '.sign div{flex:1;border:1px solid #64748b;height:64px;padding:4px 8px;color:#475569}',
        '.foot{position:absolute;bottom:0;left:0;right:0;height:36px;padding:0 40px;display:flex;align-items:center;justify-content:space-between;font-size:11px;color:#64748b;border-top:1px solid #cbd5e1;background:#fff}',
        '@media print{body{background:#fff}.bar{display:none}#pages{padding:0;gap:0;display:block}.page{box-shadow:none;page-break-after:always}.page:last-child{page-break-after:auto}}'
    ].join('');

    // 分頁：等字型與排版定案（load + rAF）後逐列放入，超出可用高度就換頁；
    // 最後一頁放合計與簽核欄，放不下就把前一列一起移到新頁，避免只剩合計的孤頁
    var script = function() {
        var D = window.__RP;
        function h(s) { return String(s).replace(/[&<>"]/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
        var pagesEl = document.getElementById('pages');
        function newPage(cont) {
            var p = document.createElement('div'); p.className = 'page';
            p.innerHTML = '<div class="content"><div class="org">' + h(D.org) + '</div>' +
                '<div class="title">' + h(D.title) + (cont ? '（續）' : '') + '</div>' +
                '<div class="meta">' + D.meta.map(function(m) { return '<span>' + h(m[0]) + '：<b>' + h(m[1]) + '</b></span>'; }).join('') + '</div>' +
                '<table><thead><tr>' + D.cols.map(function(c) { return '<th class="' + (c.num ? 'n' : '') + '">' + h(c.label) + '</th>'; }).join('') + '</tr></thead><tbody></tbody></table>' +
                '<div class="tail"></div></div><div class="foot"><span>' + h(D.org) + '　' + h(D.title) + '</span><span class="pn"></span></div>';
            pagesEl.appendChild(p);
            return p;
        }
        function rowHtml(r) { return D.cols.map(function(c) { return '<td class="' + (c.num ? 'n' : '') + '">' + h(r[c.key]) + '</td>'; }).join(''); }
        function limit(p) { var f = p.querySelector('.foot'); var v = f.offsetTop - 14; return (v > 0 && v < D.H) ? v : D.H - f.offsetHeight - 14; }
        function used(p) { var c = p.querySelector('.content'); return c.offsetTop + c.offsetHeight; }
        function fits(p) { return used(p) <= limit(p); }
        function addRow(p, r) { var tr = document.createElement('tr'); tr.innerHTML = rowHtml(r); tr.__r = r; p.querySelector('tbody').appendChild(tr); return tr; }
        function tailHtml() {
            var s = '';
            if (D.totals) s += '<table><tbody><tr class="tot">' + D.cols.map(function(c, i) { return '<td class="' + (c.num ? 'n' : '') + '">' + (i === 0 && !D.totals[c.key] ? '合計' : h(D.totals[c.key])) + '</td>'; }).join('') + '</tr></tbody></table>';
            if (D.signatures) s += '<div class="sign"><div>製表</div><div>覆核</div><div>主管</div></div>';
            return s;
        }
        function layout() {
            pagesEl.innerHTML = '';
            var page = newPage(false);
            D.rows.forEach(function(r) {
                var tr = addRow(page, r);
                if (!fits(page) && page.querySelector('tbody').children.length > 1) { tr.remove(); page = newPage(true); addRow(page, r); }
            });
            // 合計與簽核：放在最後一頁的表格下方；放不下就換頁並帶一列過去
            var tail = page.querySelector('.tail');
            tail.innerHTML = tailHtml();
            if (D.totals) syncWidths(page);
            if (!fits(page)) {
                tail.innerHTML = '';
                var body = page.querySelector('tbody');
                var last = body.lastElementChild;
                var np = newPage(true);
                if (last && body.children.length > 1) { np.querySelector('tbody').appendChild(last); }
                np.querySelector('.tail').innerHTML = tailHtml();
                if (D.totals) syncWidths(np);
            }
            numberPages();
        }
        // 合計列是另一張表，欄寬對齊上面的表格
        function syncWidths(p) {
            var ths = p.querySelectorAll('thead th'); var tds = p.querySelectorAll('.tail tr.tot td');
            ths.forEach(function(th, i) { if (tds[i]) tds[i].style.width = th.getBoundingClientRect().width + 'px'; });
            var tt = p.querySelector('.tail table'); if (tt) tt.style.tableLayout = 'fixed';
        }
        function numberPages() {
            var ps = pagesEl.querySelectorAll('.page');
            ps.forEach(function(p, i) { p.querySelector('.pn').textContent = '第 ' + (i + 1) + ' / ' + ps.length + ' 頁'; });
        }
        // 安全網：以實際排版高度為準，超出的列往下一頁推
        function settle() {
            for (var guard = 0; guard < 500; guard++) {
                var ps = pagesEl.querySelectorAll('.page'), moved = false;
                for (var i = 0; i < ps.length; i++) {
                    if (fits(ps[i])) continue;
                    var body = ps[i].querySelector('tbody');
                    if (body.children.length <= 1) continue;
                    var next = ps[i + 1] || newPage(true);
                    var nb = next.querySelector('tbody');
                    nb.insertBefore(body.lastElementChild, nb.firstChild);
                    moved = true; break;
                }
                if (!moved) break;
            }
            numberPages();
        }
        function run() { layout(); settle(); document.body.setAttribute('data-ready', '1'); }
        if (document.readyState === 'complete') requestAnimationFrame(run);
        else window.addEventListener('load', function() { requestAnimationFrame(run); });
        window.addEventListener('beforeprint', settle);
    };

    var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + rpEsc(opts.title) + '</title><style>' + css + '</style></head><body>' +
        '<div class="bar"><b>🖨️ ' + rpEsc(opts.title) + '</b><button class="p" onclick="window.print()">列印</button><button class="c" onclick="window.close()">關閉</button></div>' +
        '<div id="pages"></div>' +
        '<script>window.__RP=' + JSON.stringify(payload).replace(/</g, '\\u003c') + ';(' + script.toString() + ')();<\/script></body></html>';
    var win = window.open('', '_blank', 'width=' + Math.min(W + 80, 1300) + ',height=900');
    if (!win) { alert('瀏覽器擋住了列印視窗，請允許彈出視窗後再試一次'); return; }
    win.document.open(); win.document.write(html); win.document.close();
    return win;
};

// ---------- Excel（表格上方加抬頭與查詢條件，最下面加合計）----------
window.exportTableReportXlsx = function(opts) {
    var rows = opts.rows || [];
    if (rows.length === 0) { alert('沒有資料可匯出'); return; }
    var cols = rpColumns(opts.columns, rows);
    var totals = rpTotals(cols, rows, opts.totals);
    var meta = (opts.meta || []).concat([['製表時間', rpNow()], ['製表人', rpUser()], ['筆數', rows.length]]);

    var aoa = [[window.getReportOrgName()], [opts.title || '報表']];
    meta.forEach(function(m) { aoa.push([m[0], m[1]]); });
    aoa.push([]);
    var headerRow = aoa.length;
    aoa.push(cols.map(function(c) { return c.label; }));
    rows.forEach(function(r) { aoa.push(cols.map(function(c) { var v = r[c.key]; return v === undefined || v === null ? '' : v; })); });
    if (totals) aoa.push(cols.map(function(c, i) { return totals[c.key] !== undefined ? totals[c.key] : (i === 0 ? '合計' : ''); }));

    var ws = XLSX.utils.aoa_to_sheet(aoa);
    var last = Math.max(cols.length - 1, 1);
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: last } }, { s: { r: 1, c: 0 }, e: { r: 1, c: last } }];
    ws['!cols'] = cols.map(function(c) {
        var w = String(c.label).length * 2 + 2;
        rows.slice(0, 200).forEach(function(r) { var s = String(r[c.key] === undefined ? '' : r[c.key]); w = Math.max(w, Math.min(40, s.replace(/[^\x00-\xff]/g, 'xx').length + 2)); });
        return { wch: w };
    });
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: headerRow, c: 0 }, e: { r: headerRow + rows.length, c: cols.length - 1 } }) };
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, (opts.sheetName || opts.title || '報表').slice(0, 31).replace(/[\\/?*\[\]:]/g, ''));
    XLSX.writeFile(wb, opts.fileName || ((opts.title || '報表') + '_' + new Date().toLocalYMD() + '.xlsx'));
};

// 匯入時找出真正的表頭列（匯出的報表上方有抬頭，匯入要跳過）
window.sheetToJsonSmart = function(sheet, mustHave) {
    var aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    var need = mustHave || '品名';
    var hi = aoa.findIndex(function(r) { return r.some(function(c) { return String(c).trim() === need; }); });
    if (hi < 0) return XLSX.utils.sheet_to_json(sheet, { defval: '' });
    var head = aoa[hi].map(function(c) { return String(c).trim(); });
    return aoa.slice(hi + 1).filter(function(r) {
        return r.some(function(c) { return String(c).trim() !== ''; }) && String(r[0]).trim() !== '合計';
    }).map(function(r) {
        var o = {}; head.forEach(function(k, i) { if (k) o[k] = r[i] === undefined ? '' : r[i]; }); return o;
    });
};
