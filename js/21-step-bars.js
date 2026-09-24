// ============================================================
// js/21-step-bars.js — 主要畫面上方的步驟列（① → ② → ③ …，目前這一步會亮起來）
// 每個畫面提供 steps（標題＋小提示）與 current()（依畫面狀態判斷現在在第幾步）
// ============================================================

window.STEP_BARS = {
    'wave-picking': {
        steps: [
            { t: '選公司', h: '崇文／八方' },
            { t: '匯入訂單', h: '「匯入訂單」選 ERP Excel' },
            { t: '建立波次', h: '匯入時選自動建立，或按「自動建立」' },
            { t: '手機揀貨', h: '手機「波次揀貨」逐板掃' },
            { t: '完成波次', h: '手機或這裡按完成，扣庫存出貨' }
        ],
        current: function() {
            var num = function(label) {
                var el = [].slice.call(document.querySelectorAll('#view-wave-picking .grid > div')).find(function(d) { return d.innerText.indexOf(label) === 0; });
                return el ? parseInt(el.innerText.replace(label, '')) || 0 : 0;
            };
            if (num('揀貨中') > 0 || num('待揀貨') > 0) return 3;
            if (num('待出貨訂單') > 0) return 2;
            return 1;
        }
    },
    'transfer': {
        steps: [
            { t: '選公司與方向', h: '調撥入庫／出庫／外庫間' },
            { t: '選倉庫', h: '來源或目標外倉' },
            { t: '選品項與數量', h: '可以一次加好幾項' },
            { t: '確認執行調撥', h: '入庫的會發到手機上架' }
        ],
        current: function() {
            if ((window.transferList || []).length > 0) return 3;
            var src = document.getElementById('transfer-source');
            return src && src.value ? 2 : 1;
        }
    },
    'stocktake': {
        steps: [
            { t: '選區域與排', h: '例如 I-A、第 1～5 排' },
            { t: '載入清單', h: '可以先「列印盤點表」去點數' },
            { t: '輸入實盤數', h: '都相符就按「未盤的照帳面」' },
            { t: '送出盤點', h: '只調整有差異的板' }
        ],
        current: function() {
            var st = window._stocktake || { rows: [] };
            if (!st.rows || st.rows.length === 0) return document.getElementById('st-zone') && document.getElementById('st-zone').value ? 1 : 0;
            var counted = st.rows.filter(function(r) { return r.counted !== ''; }).length;
            return counted === 0 ? 2 : 3;
        }
    }
};

window.renderStepBar = function(viewId) {
    var cfg = window.STEP_BARS[viewId];
    var el = document.getElementById('stepbar-' + viewId);
    if (!cfg || !el) return;
    var cur = cfg.current();
    var key = cur + '';
    if (el.dataset.cur === key) return;
    el.dataset.cur = key;
    el.innerHTML = cfg.steps.map(function(s, i) {
        var state = i < cur ? 'done' : i === cur ? 'now' : 'todo';
        var bg = state === 'now' ? 'background:#2563eb;color:#fff' : state === 'done' ? 'background:rgba(16,185,129,.15);color:#6ee7b7' : 'background:#1e293b;color:#94a3b8';
        return (i ? '<i class="fa-solid fa-chevron-right" style="color:#475569;font-size:10px"></i>' : '') +
            '<div class="stepbar-item" data-state="' + state + '" style="' + bg + ';border-radius:8px;padding:6px 10px;display:flex;align-items:center;gap:8px;min-width:0">' +
            '<span style="width:20px;height:20px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;flex-shrink:0;' +
            (state === 'now' ? 'background:#fff;color:#2563eb' : state === 'done' ? 'background:#10b981;color:#fff' : 'background:#334155;color:#94a3b8') + '">' + (state === 'done' ? '✓' : i + 1) + '</span>' +
            '<span style="display:flex;flex-direction:column;line-height:1.2;min-width:0"><b style="font-size:13px">' + s.t + '</b>' +
            '<span style="font-size:11px;opacity:.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + s.h + '</span></span></div>';
    }).join('');
};

// 目前畫面的步驟列跟著狀態更新（畫面沒開時不做事）
setInterval(function() {
    Object.keys(window.STEP_BARS).forEach(function(v) {
        var panel = document.getElementById('view-' + v);
        if (panel && !panel.classList.contains('hidden')) window.renderStepBar(v);
    });
}, 700);
