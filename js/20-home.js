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
        return '<div onclick="goTab(\'' + f.id + '\')" class="ds-card ds-flow" style="--c:' + f.color + '">' +
            '<div class="ds-flow-title"><span class="ds-todo-icon"><i class="fa-solid ' + f.icon + '"></i></span>' + f.title + '<i class="fa-solid fa-arrow-right ds-arrow"></i></div>' +
            '<ol>' + f.steps.map(function(s) { return '<li>' + s + '</li>'; }).join('') + '</ol></div>';
    }).join('');
}

// 待辦：{ key, icon, label, hint, count, action, urgent }
// 有事要做的放成大卡片（數字大、點了直接去處理）；是 0 的收成下面一排小標籤，不佔位置
function renderHomeTodos(todos) {
    var el = document.getElementById('home-todos');
    var clearEl = document.getElementById('home-todos-clear');
    if (!el) return;
    var open = todos.filter(function(t) { return t.count !== 0; });
    var clear = todos.filter(function(t) { return t.count === 0; });
    el.innerHTML = open.map(function(t) {
        var n = t.count == null ? '<span style="color:var(--ds-text-3)">—</span>' : t.count;
        return '<div onclick="' + t.action + '" class="ds-card ds-todo' + (t.urgent ? ' is-urgent' : '') + '" style="--c:' + t.color + '">' +
            '<div class="ds-todo-head"><span class="ds-todo-icon"><i class="fa-solid ' + t.icon + '"></i></span>' + t.label + '</div>' +
            '<div class="ds-todo-n ds-num">' + n + '</div>' +
            '<div class="ds-todo-hint">' + (t.hint || '') + '</div>' +
            '<div class="ds-todo-go">去處理<i class="fa-solid fa-arrow-right"></i></div></div>';
    }).join('');
    if (!open.length) el.innerHTML = '<div class="ds-card ds-allclear" style="grid-column:1/-1"><span class="ds-allclear-icon"><i class="fa-solid fa-check"></i></span>' +
        '<div><div style="color:var(--ds-text);font-weight:600;font-size:16px">今天的待辦都處理完了</div><div style="color:var(--ds-text-3);font-size:14px;margin-top:2px">有新的訂單或入庫單進來，會自動出現在這裡</div></div></div>';
    // 這些事目前都沒有要處理（打勾）；有事時會變成上面的大卡片
    if (clearEl) clearEl.innerHTML = (clear.length ? '<span class="ds-clear-label">目前都沒有要處理：</span>' : '') + clear.map(function(t) {
        return '<button onclick="' + t.action + '" class="ds-clear" title="' + t.label + '：目前沒有要處理的（點了可以進去看）"><i class="fa-solid fa-check"></i>' + t.label + '</button>';
    }).join('');
    var sum = document.getElementById('home-summary');
    if (sum) {
        var busy = open.filter(function(t) { return t.count > 0; }).length;
        sum.innerHTML = busy ? '<span class="ds-pill ds-pill-primary">' + busy + ' 件事要處理</span>' : '<span class="ds-pill ds-pill-success">待辦都清空了</span>';
    }
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
    drawMobileQr(location.origin + location.pathname.replace(/[^/]*$/, '') + 'm/');
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
          action: "goTab('erp-inbox')" },
        { icon: 'fa-arrow-trend-down', color: '#dc2626', label: '業務要改鼎新', hint: '缺貨少出要改數量、出貨後鼎新又改了要確認：請業務在鼎新處理',
          action: "openErpFixList()" }
    ];
    todos[7].hint = '已過期 ' + expired + ' 板（不會被揀貨）、即將到期 ' + expiring + ' 板';
    todos[7].urgent = expired > 0;
    todos[9].urgent = true;

    var r = await Promise.all([
        countWhere('inboundOrders', 'status', '==', 'pending', function(o) { return !o.isExternal; }),
        countWhere('inboundTasks', 'status', '==', 'pending'),
        countWhere('inboundOrders', 'approvalStatus', '==', 'pending'),
        countWhere('salesOrders', 'status', 'in', ['pending', 'confirmed', 'partial'], function(o) { return !o.waveNo; }),
        countWhere('waves', 'status', 'in', ['pending', 'picking', 'sorting']),
        countWhere('dispatchOrders', 'status', 'in', ['pending', 'in_progress']),
        window.countErpAttention ? window.countErpAttention() : null,
        shortOrdersToFix()
    ]);
    todos[0].count = r[0]; todos[1].count = r[1]; todos[3].count = r[2];
    todos[4].count = r[3]; todos[5].count = r[4]; todos[6].count = r[5]; todos[8].count = r[6];
    if (r[7]) {
        todos[9].count = r[7].length;
        if (r[7].length) todos[9].hint = r[7].slice(0, 3).map(function(o) {
            return o.customer + '（' + o.orderNo + '）' + (o.erpFixNeeded ? (o.shortShipped || []).filter(function(x) { return (x.want - x.got) >= 0.001; }).map(function(x) { return x.productName + ' ' + Math.round(x.want * 1000) / 1000 + '→' + Math.round(x.got * 1000) / 1000; }).join('、') : '') +
                (o.erpReturnNeeded ? (o.erpFixNeeded ? '、' : '') + '鼎新對不上要確認' : '');
        }).join('；') + (r[7].length > 3 ? ' 等' : '') + '：請業務在鼎新處理';
    }
    renderHomeTodos(todos);
};

// 要請業務在鼎新處理的銷貨單（讀法、文字在 js/shared/erp-fix.js，手機版也用同一份）
async function shortOrdersToFix() {
    try { return await window.loadErpFixList(window.db); }
    catch (e) { console.warn('讀取要改鼎新的訂單失敗', e); return null; }
}
var erpEsc = function(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
function shortLines(o) { return window.erpFixLines(o); }
window.openErpFixList = async function() {
    var list = await shortOrdersToFix();
    if (list === null) { alert('❌ 讀取失敗，請稍後再試'); return; }
    window._erpFixList = list;
    var cards = list.length ? list.map(function(o, i) {
        var sent = window.erpSentLabel(o);
        return '<div class="ds-pick-row" style="cursor:default;align-items:flex-start' + (sent ? ';opacity:.75' : '') + '">' +
            '<div style="flex:1;min-width:0"><div style="color:var(--ds-text);font-weight:700;font-size:16px">' + erpEsc(o.customer) +
            (sent ? ' <span class="erp-sent-tag" style="font-size:12px;font-weight:400;color:var(--ds-text-3);background:var(--ds-surface-2);border-radius:6px;padding:1px 6px;margin-left:6px">' + erpEsc(sent) + '</span>' : '') + '</div>' +
            '<div style="font-size:12px;color:var(--ds-text-3);margin:2px 0 8px">' + erpEsc(o.orderNo) + (o.waveNo ? '・波次 ' + erpEsc(o.waveNo) : '') + '</div>' +
            shortLines(o).map(function(l) { return '<div style="font-size:14px;color:var(--ds-text-2);line-height:1.7"><i class="fa-solid ' + (/確認|不見|沒有這張/.test(l) ? 'fa-circle-question' : 'fa-arrow-trend-down') + '" style="color:var(--c-red);margin-right:6px"></i>' + erpEsc(l) + '</div>'; }).join('') + '</div>' +
            '<div style="display:flex;flex-direction:column;gap:6px"><button class="ds-btn ds-btn-secondary ds-btn-sm" onclick="copyErpFix(' + i + ')"><i class="fa-regular fa-copy"></i>' + (sent ? '再複製一次' : '複製這張') + '</button>' +
            '<button class="ds-btn ds-btn-ghost ds-btn-sm" onclick="markErpFixed(' + i + ')"><i class="fa-solid fa-check"></i>已經改好了</button></div></div>';
    }).join('') : '<div class="ds-empty" style="padding:32px"><div class="ds-empty-icon"><i class="fa-solid fa-check"></i></div><div class="ds-empty-title">沒有要改的單</div></div>';
    var fresh = list.filter(function(o) { return !window.erpIsSent(o); }).length;
    WMS.closeModal('modal-erp-fix');
    WMS.createModal('modal-erp-fix', {
        title: '業務要改鼎新（' + list.length + ' 張）', icon: 'fa-solid fa-arrow-trend-down', width: '720px', maxHeight: '88vh',
        content: '<div style="font-size:14px;color:var(--ds-text-2);line-height:1.7;margin-bottom:14px;padding:12px 14px;border-radius:10px;background:var(--ds-surface-2)">' +
            '<b style="color:var(--ds-text)">要做的事：</b><br>・<b style="color:var(--ds-text)">缺貨少出</b>：請業務在鼎新把銷貨單改成實際出貨的數量（缺的這次不出、之後也不補）。改好、重新匯入後會<b style="color:var(--ds-text)">自動消失</b>。<br>' +
            '・<b style="color:var(--ds-text)">出貨後鼎新又改了</b>：我們都是改好才出貨，這種通常是鼎新改錯或刪錯，請業務<b style="color:var(--ds-text)">確認鼎新</b>。確認好後按「已經改好了」。<br>' +
            '業務說不用改的，按「已經改好了」也會消失。傳過的會寫「已傳」，「複製新的」只複製還沒傳過的。</div>' + cards,
        footer: list.length ? '<button class="ds-btn ds-btn-secondary" onclick="WMS.closeModal(\'modal-erp-fix\')">關閉</button>' + (fresh
            ? '<button class="ds-btn ds-btn-primary" onclick="copyErpFix()"><i class="fa-regular fa-copy"></i>複製新的給業務（' + fresh + ' 張，貼到 LINE）</button>'
            : '<button class="ds-btn ds-btn-primary" disabled><i class="fa-solid fa-check"></i>都傳過了，等業務改</button>') : ''
    });
};
window.copyErpFix = async function(i) {
    // i 沒給＝還沒傳過的全部；複製了就記下已傳
    var list = window._erpFixList || [];
    var pick = i == null ? list.filter(function(o) { return !window.erpIsSent(o); }) : [list[i]];
    if (!pick.length || !pick[0]) return;
    var text = window.erpFixText(pick);
    try { await navigator.clipboard.writeText(text); if (window.showToast) window.showToast('✅ 已複製，可以貼到 LINE 給業務'); else alert('✅ 已複製，可以貼到 LINE 給業務'); }
    catch (e) { window.prompt('請全選複製這段文字：', text); }
    try { await window.markErpSent(window.db, pick, window.getOperatorName ? window.getOperatorName() : ''); } catch (e) { console.warn('記下已傳失敗', e); return; }
    window.openErpFixList();
};
window.markErpFixed = async function(i) {
    var o = (window._erpFixList || [])[i];
    if (!o || !o.id) return;
    if (!confirm('「' + (o.customer || '') + ' ' + (o.orderNo || '') + '」已經在鼎新改好（或業務說不用改）？\n\n按確定後就從清單拿掉。')) return;
    try {
        await window.markErpFixedDoc(window.db, o.id, window.getOperatorName ? window.getOperatorName() : '');
    } catch (e) { alert('❌ 儲存失敗：' + e.message); return; }
    window.openErpFixList();
    if (window.refreshHome) window.refreshHome();
};

// 手機版的 QR code（用到才去載入產生 QR code 的小工具；載不到就只顯示網址）
function drawMobileQr(url) {
    var box = document.getElementById('home-mobile-qr');
    if (!box || box.dataset.url === url) return;
    var draw = function() {
        if (typeof window.QRCode !== 'function') return;
        box.innerHTML = '';
        try { new window.QRCode(box, { text: url, width: 96, height: 96, correctLevel: window.QRCode.CorrectLevel.M }); box.dataset.url = url; box.classList.add('is-qr'); }
        catch (e) { console.warn('QR code 產生失敗', e); }
    };
    if (typeof window.QRCode === 'function') return draw();
    if (document.getElementById('qrcode-lib')) return;
    var sc = document.createElement('script');
    sc.id = 'qrcode-lib'; sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    sc.onload = draw;
    document.head.appendChild(sc);
}

// 倉庫電視的現場看板：在接電視的筆電上，Windows 鍵＋R 貼上這行，就自動建好捷徑、開機自動開、電視全螢幕、可出聲、不睡眠
// （自動設定的小程式在 tools/board-setup.txt）
// wh：'K'＝K 庫的看板，不給＝I、J 庫
window.boardSetupCommand = function(wh) {
    var base = location.origin + location.pathname.replace(/[^/]*$/, '');
    // 舊電腦（Windows 7 的 PowerShell 2）也能跑：不用 irm，先開 TLS 1.2 再下載
    return 'powershell -NoExit -ExecutionPolicy Bypass -c "[Net.ServicePointManager]::SecurityProtocol=3072;$u=\'' + base + '\';$w=\'' + (wh === 'K' ? 'K' : '') + '\';iex (New-Object Net.WebClient).DownloadString($u+\'tools/board-setup.txt\')"';
};
window.openBoardSetup = function() {
    var step = function(n, html) { return '<div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:12px"><span style="flex:none;width:28px;height:28px;border-radius:50%;background:var(--ds-primary,#2563eb);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700">' + n + '</span><div style="font-size:15px;line-height:1.7;color:var(--ds-text-2)">' + html + '</div></div>'; };
    WMS.closeModal('modal-board-setup');
    WMS.createModal('modal-board-setup', {
        title: '設定看板電腦', icon: 'fa-solid fa-tv', width: '640px',
        content: '<div style="font-size:14px;color:var(--ds-text-3);margin-bottom:14px">這些步驟要在<b style="color:var(--ds-text)">接電視的那台筆電</b>上做。</div>' +
            step(1, '筆電用 HDMI 線接好電視，按 <b style="color:var(--ds-text)">Windows 鍵 + P</b> 選「<b style="color:var(--ds-text)">延伸</b>」。') +
            step(2, '這台筆電在哪個倉庫？按下面對應的「<b style="color:var(--ds-text)">複製</b>」按鈕。') +
            step(3, '按 <b style="color:var(--ds-text)">Windows 鍵 + R</b>，跳出「執行」小視窗，按 <b style="color:var(--ds-text)">Ctrl + V</b> 貼上，再按 <b style="color:var(--ds-text)">Enter</b>。') +
            step(4, '等藍色視窗跑完，電視會自動打開看板。用<b style="color:var(--ds-text)">看板帳號</b>登入，就完成了。以後筆電開機會自己打開。') +
            '<div style="font-size:13px;color:var(--ds-text-3);margin-top:4px">要關掉看板：點一下電視畫面，按 Alt + F4。</div>',
        footer: '<button class="ds-btn ds-btn-secondary" onclick="WMS.closeModal(\'modal-board-setup\')">關閉</button>' +
            '<button class="ds-btn ds-btn-primary" id="board-setup-copy-IJ" onclick="copyBoardSetup(\'IJ\')"><i class="fa-regular fa-copy"></i>複製（I、J 庫的電腦）</button>' +
            '<button class="ds-btn ds-btn-primary" id="board-setup-copy-K" onclick="copyBoardSetup(\'K\')"><i class="fa-regular fa-copy"></i>複製（K 庫的電腦）</button>'
    });
};
window.copyBoardSetup = async function(wh) {
    var cmd = window.boardSetupCommand(wh);
    try { await navigator.clipboard.writeText(cmd); }
    catch (e) { window.prompt('請全選複製這段文字：', cmd); return; }
    var b = document.getElementById('board-setup-copy-' + (wh === 'K' ? 'K' : 'IJ'));
    if (b) b.innerHTML = '<i class="fa-solid fa-check"></i>已複製，到第 3 步貼上';
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
