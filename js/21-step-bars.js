// ============================================================
// js/21-step-bars.js — 主要畫面上方的步驟列（① → ② → ③ …，目前這一步會亮起來）
// 每個畫面提供 steps（標題＋小提示）與 current()（依畫面狀態判斷現在在第幾步）
// ============================================================

window.STEP_BARS = {
    'wave-picking': {
        steps: [
            { t: '匯入訂單', h: '「匯入訂單」選 ERP Excel' },
            { t: '建立波次', h: '匯入時會問；之後按「建立波次」' },
            { t: '手機揀貨', h: '手機「波次揀貨」逐板掃' },
            { t: '完成波次', h: '手機或這裡按完成，扣庫存出貨' }
        ],
        current: function() {
            var num = function(id) { var el = document.getElementById('wave-stat-' + id); return el ? parseInt(el.innerText) || 0 : 0; };
            if (num('picking') > 0 || num('pending') > 0) return 2;
            if (num('orders') > 0) return 1;
            return 0;
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
        return (i ? '<span class="ds-step-line"></span>' : '') +
            '<div class="stepbar-item ds-step" data-state="' + state + '">' +
            '<span class="ds-step-n">' + (state === 'done' ? '<i class="fa-solid fa-check"></i>' : i + 1) + '</span>' +
            '<span style="min-width:0"><b>' + s.t + '</b><small>' + s.h + '</small></span></div>';
    }).join('');
};

// 目前畫面的步驟列跟著狀態更新（畫面沒開時不做事）
setInterval(function() {
    Object.keys(window.STEP_BARS).forEach(function(v) {
        var panel = document.getElementById('view-' + v);
        if (panel && !panel.classList.contains('hidden')) window.renderStepBar(v);
    });
}, 700);
