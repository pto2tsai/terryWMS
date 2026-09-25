// ============================================================
// js/20-home.js — 今日工作（登入後第一頁）
// 上半部：待辦卡片（數字＋點了直接去處理）；下半部：四個常用流程（入庫、出貨、調撥、盤點）
// ============================================================

// 切到某個畫面（同時更新左側選單的選取狀態與頁面標題）；then 是切過去後要做的事
window.goTab = function(viewId, then) {
    var item = document.querySelector('.nav-item[onclick^="switchTab(\'' + viewId + '\'"]');
    // 所在的選單群組收合著就打開，讓使用者看得到自己在哪
    var grp = item && item.closest('.nav-group-items');
    if (grp && grp.classList.contains('collapsed') && window.toggleNavGroup) window.toggleNavGroup(grp.id);
    if (item) item.click(); else window.switchTab(viewId, null);
    if (then) setTimeout(then, 300);
};

var HOME_FLOWS = [
    { id: 'unified-inbound', icon: 'fa-truck-ramp-box', color: '#10b981', title: '入庫',
      steps: ['選品項、填數量與效期', '選儲位', '馬上入帳，或交給堆高機用手機上架'] },
    { id: 'wave-picking', icon: 'fa-dolly', color: '#f97316', title: '出貨',
      steps: ['匯入 ERP 訂單（自動建波次）', '手機「波次揀貨」逐板掃', '完成波次（扣庫存、訂單出貨）'] },
    { id: 'transfer', icon: 'fa-right-left', color: '#3b82f6', title: '調撥',
      steps: ['選方向：調撥出庫／入庫／外庫間', '選倉庫與品項數量', '確認執行'] },
    { id: 'stocktake', icon: 'fa-clipboard-check', color: '#0ea5e9', title: '盤點',
      steps: ['選區域與排', '列印盤點表去點數', '輸入實盤數送出（或用手機逐板盤）'] }
];

function renderHomeFlows() {
    var el = document.getElementById('home-flows');
    if (!el) return;
    el.innerHTML = HOME_FLOWS.map(function(f) {
        return '<div onclick="goTab(\'' + f.id + '\')" class="glass-panel p-5 cursor-pointer hover:bg-slate-800 transition-colors" style="border-top:4px solid ' + f.color + '">' +
            '<div class="flex items-center gap-3 mb-3"><i class="fa-solid ' + f.icon + ' text-3xl" style="color:' + f.color + '"></i>' +
            '<span class="text-2xl font-bold text-white">' + f.title + '</span><i class="fa-solid fa-arrow-right ml-auto text-slate-500"></i></div>' +
            '<ol class="text-slate-300 text-sm space-y-1">' + f.steps.map(function(s, i) {
                return '<li><span class="inline-block w-5 h-5 rounded-full text-center text-xs leading-5 mr-1 text-white" style="background:' + f.color + '">' + (i + 1) + '</span>' + s + '</li>';
            }).join('') + '</ol></div>';
    }).join('');
}

// 待辦：{ key, icon, color, label, hint, count, action }
function renderHomeTodos(todos) {
    var el = document.getElementById('home-todos');
    if (!el) return;
    el.innerHTML = todos.map(function(t) {
        var zero = !t.count;
        return '<div onclick="' + t.action + '" class="glass-panel p-4 cursor-pointer hover:bg-slate-800 transition-colors ' + (zero ? 'opacity-50' : '') + '" style="border-left:4px solid ' + (zero ? '#475569' : t.color) + '">' +
            '<div class="flex items-center justify-between"><span class="text-slate-300 text-sm"><i class="fa-solid ' + t.icon + ' mr-1" style="color:' + t.color + '"></i>' + t.label + '</span>' +
            (zero ? '<i class="fa-solid fa-check text-emerald-500"></i>' : '') + '</div>' +
            '<div class="text-3xl font-bold mt-1 ' + (zero ? 'text-slate-500' : 'text-white') + '">' + (t.count == null ? '…' : t.count) + '</div>' +
            '<div class="text-xs text-slate-500 mt-1">' + t.hint + '</div></div>';
    }).join('');
}

async function countWhere(coll, field, op, value, filterFn) {
    try {
        var snap = await window.db.collection(coll).where(field, op, value).get();
        return filterFn ? snap.docs.filter(function(d) { return filterFn(d.data()); }).length : snap.size;
    } catch (e) { console.warn('今日工作：讀取 ' + coll + ' 失敗', e); return null; }
}

window.refreshHome = async function() {
    var u = window.currentUser;
    var h = new Date().getHours();
    var greet = h < 11 ? '早安' : h < 14 ? '午安' : '辛苦了';
    var g = document.getElementById('home-greeting');
    if (g) g.innerText = greet + (u ? '，' + (u.name || u.email) : '') ;
    var d = document.getElementById('home-date');
    if (d) d.innerText = new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    var m = document.getElementById('home-mobile-url');
    if (m) m.innerText = location.origin + location.pathname.replace(/[^/]*$/, '') + 'm/';
    renderHomeFlows();

    var pallets = window.currentPallets ? window.currentPallets() : [];
    var today = new Date().toLocalYMD();
    var soon = new Date(Date.now() + 30 * 86400000).toLocalYMD();
    var expired = 0, expiring = 0, tempIn = 0;
    pallets.forEach(function(p) {
        var exp = window.normalizeDateValue(p.expiryDate || p.expDate);
        if (exp && exp < today) expired++;
        else if (exp && exp <= soon) expiring++;
        if (p.locationId === 'TEMP-IN') tempIn++;
    });

    var todos = [
        { icon: 'fa-inbox', color: '#10b981', label: '待入帳入庫單', hint: '貨到了還沒入帳（手機上架也會自動入帳）',
          action: "goTab('unified-inbound', function(){ showPendingInbounds(); })" },
        { icon: 'fa-truck-ramp-box', color: '#14b8a6', label: '等堆高機上架', hint: '已發布到手機「入庫任務」',
          action: "goTab('unified-inbound', function(){ showPendingInbounds(); })" },
        { icon: 'fa-boxes-stacked', color: '#eab308', label: '暫存區待上架', hint: 'TEMP-IN 的板，手機「上架」掃儲位即可', count: tempIn,
          action: "goTab('visual-map')" },
        { icon: 'fa-clipboard-check', color: '#f59e0b', label: '待財務核准', hint: '採購進貨對帳（不影響入帳）',
          action: "goTab('approval')" },
        { icon: 'fa-file-invoice', color: '#a855f7', label: '訂單未排波次', hint: '已匯入、還沒建波次的訂單',
          action: "goTab('wave-picking')" },
        { icon: 'fa-layer-group', color: '#f97316', label: '待揀波次', hint: '手機「波次揀貨」處理',
          action: "goTab('wave-picking')" },
        { icon: 'fa-arrows-rotate', color: '#3b82f6', label: '調度工單未完成', hint: '已發布到手機「調度工單」',
          action: "goTab('move')" },
        { icon: 'fa-calendar-xmark', color: '#ef4444', label: '過期／30 天內到期', hint: '', count: expired + expiring,
          action: "goTab('expiry-management')" },
        { icon: 'fa-cloud-arrow-down', color: '#0ea5e9', label: '鼎新匯入要處理', hint: '訂單檔沒收到、匯入失敗、件數待確認、沒有物流商、鼎新已取消的單',
          action: "goTab('erp-inbox')" }
    ];
    todos[7].hint = '已過期 ' + expired + ' 板（不會被揀貨）、即將到期 ' + expiring + ' 板';
    renderHomeTodos(todos);

    var r = await Promise.all([
        countWhere('inboundOrders', 'status', '==', 'pending', function(o) { return !o.isExternal; }),
        countWhere('inboundTasks', 'status', '==', 'pending'),
        countWhere('inboundOrders', 'approvalStatus', '==', 'pending'),
        countWhere('salesOrders', 'status', 'in', ['pending', 'confirmed', 'partial'], function(o) { return !o.waveNo; }),
        countWhere('waves', 'status', 'in', ['pending', 'picking', 'sorting']),
        countWhere('dispatchOrders', 'status', 'in', ['pending', 'in_progress']),
        window.countErpAttention ? window.countErpAttention() : null
    ]);
    todos[0].count = r[0]; todos[1].count = r[1]; todos[3].count = r[2];
    todos[4].count = r[3]; todos[5].count = r[4]; todos[6].count = r[5]; todos[8].count = r[6];
    renderHomeTodos(todos);
};

// 切到今日工作時更新數字
(function() {
    var orig = window.switchTab;
    window.switchTab = function(viewId, evt) {
        orig(viewId, evt);
        if (viewId === 'home' && window.currentUser) window.refreshHome();
    };
})();

window.onLogin(function() {
    renderHomeFlows();
    // 庫存監聽剛啟動，稍等讓棧板資料進來再算（使用者已經切到別頁就不打擾）
    setTimeout(function() {
        var v = document.getElementById('view-home');
        if (v && !v.classList.contains('hidden')) window.refreshHome();
    }, 800);
});


// ========== 精簡選單 ==========
// 一般人員預設只看到每天會用到的功能，選單短、比較不會迷路；主管／管理員／財務預設看全部。
// 左下角可以隨時切換「顯示全部功能／只顯示常用」（記在這台電腦，不影響權限：所有人都能用所有功能）
var SIMPLE_MENU_TABS = ['unified-inbound', 'pre-inbound', 'wave-picking', 'picking-rm', 'stocktake', 'merge', 'inventory-query', 'label-print'];

function menuModeKey() { return 'wms_menu_full_' + ((window.currentUser && window.currentUser.email) || ''); }

window.isFullMenu = function() {
    var v = null;
    try { v = localStorage.getItem(menuModeKey()); } catch (e) {}
    if (v === '1') return true;
    if (v === '0') return false;
    var r = window.currentUser && window.currentUser.role;
    return r === 'admin' || r === 'supervisor' || r === 'finance';
};

window.applyMenuMode = function() {
    var full = window.isFullMenu();
    document.querySelectorAll('nav .nav-group-items .nav-item').forEach(function(el) {
        var m = /switchTab\('([^']+)'/.exec(el.getAttribute('onclick') || '');
        var show = full || (m && SIMPLE_MENU_TABS.indexOf(m[1]) >= 0);
        el.style.display = show ? '' : 'none';
    });
    // 整組都藏起來的就連標題一起藏；精簡模式時把組展開（只剩幾項，不用再點開）
    document.querySelectorAll('nav .nav-group-items').forEach(function(g) {
        var any = Array.prototype.some.call(g.querySelectorAll('.nav-item'), function(el) { return el.style.display !== 'none'; });
        var header = g.previousElementSibling;
        if (header && header.classList.contains('nav-group-header')) header.style.display = any ? '' : 'none';
        g.style.display = any ? '' : 'none';
        if (!full && any) g.classList.remove('collapsed');
    });
    var t = document.getElementById('menu-mode-text');
    if (t) t.textContent = full ? '只顯示常用功能' : '顯示全部功能';
};

window.toggleMenuMode = function() {
    try { localStorage.setItem(menuModeKey(), window.isFullMenu() ? '0' : '1'); } catch (e) {}
    window.applyMenuMode();
};

if (window.onLogin) window.onLogin(function() { window.applyMenuMode(); });
