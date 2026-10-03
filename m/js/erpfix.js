// ============================================================
// 業務要改鼎新（手機）：缺貨少出、出貨後鼎新對不上的單
// 庫管在手機按「傳業務」叫出 LINE 傳給業務；業務改好後按「改好了」（不問，按錯可以復原）
// 傳過的記下來（卡片寫「已傳 10:32」），大按鈕只傳還沒傳過的，不會一直重複傳
// 清單由 core.js 一直盯著（window.erpFixList），讀法、文字在 js/shared/erp-fix.js（電腦版也用同一份）
// ============================================================
window.pageInit.erpfix = function() { window.renderErpFix(); };

window.renderErpFix = function() {
    const list = window.erpFixList || [];
    const box = $('erpfix-list'), all = $('erpfix-all');
    if (!list.length) {
        box.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-check"></i><p>沒有要請業務改的單</p></div>';
        all.innerHTML = '';
        return;
    }
    // 分兩段：缺貨少出（請改數量）、鼎新對不上（請確認）；一張卡片：客戶＋已傳、單號、短短一行、兩個按鈕
    const card = function(o) {
        const i = list.indexOf(o), sent = window.erpSentLabel(o);
        return '<div class="ef-card' + (sent ? ' ef-sent' : '') + (o.erpFixNeeded ? '' : ' ef-ret') + '">' +
            '<div class="ef-top"><span class="ef-name">' + esc(o.customer || '') + '</span>' + (sent ? '<span class="ef-sent-tag">' + esc(sent) + '</span>' : '') + '</div>' +
            '<div class="ef-no">' + esc(o.orderNo || '') + '</div>' +
            window.erpFixCardLines(o).map(function(l) { return '<div class="ef-line">' + esc(l.text) + (l.short ? ' <b>' + esc(l.short) + '</b>' : '') + '</div>'; }).join('') +
            '<div class="ef-btns">' +
                '<button class="ef-send" onclick="sendErpFix(' + i + ')"><i class="fa-brands fa-line"></i> ' + (sent ? '再傳' : '傳業務') + '</button>' +
                '<button class="ef-done" onclick="markErpFixDone(' + i + ')"><i class="fa-solid fa-check"></i> 改好了</button>' +
            '</div></div>';
    };
    const fix = list.filter(function(o) { return o.erpFixNeeded; }), ret = list.filter(function(o) { return !o.erpFixNeeded; });
    const sec = function(cls, title, rows) { return rows.length ? '<div class="ef-sec ' + cls + '">' + title + '<span>' + rows.length + '</span></div>' + rows.map(card).join('') : ''; };
    box.innerHTML = sec('fix', '缺貨少出・請業務改數量', fix) + sec('ret', '鼎新對不上・請業務確認', ret);
    const fresh = list.filter(function(o) { return !window.erpIsSent(o); }).length;
    all.innerHTML = fresh
        ? '<button class="pk-go ef-send-all" onclick="sendErpFix()"><i class="fa-brands fa-line"></i> 傳新的給業務（' + fresh + ' 張）</button>'
        : '<button class="pk-go ef-send-all" disabled><i class="fa-solid fa-check"></i> 都傳過了，等業務改</button>';
};

// 傳給業務：i 沒給＝還沒傳過的全部；傳出去就記下已傳
window.sendErpFix = async function(i) {
    const list = window.erpFixList || [];
    const pick = i == null ? list.filter(function(o) { return !window.erpIsSent(o); }) : [list[i]];
    if (!pick.length || !pick[0]) return;
    const mark = function() { return window.markErpSent(db, pick, window.currentUser ? (window.currentUser.name || window.currentUser.email || '') : ''); };
    const r = await window.sendToSales(window.erpFixText(pick), mark);
    if (r === 'cancel' || r === 'line') return;
    if (r === 'copied') toast('✅ 已複製，可以貼到 LINE 給業務');
    try { await mark(); } catch (e) { toast('⚠️ 沒記到「已傳」：' + e.message); }
};

// 改好了：不用再問，按了就拿掉；下面出現幾秒「已拿掉［復原］」，按錯點復原就回來
let undoTimer = null;
window.markErpFixDone = async function(i) {
    const o = (window.erpFixList || [])[i];
    if (!o || !o.id) return;
    const prev = { erpFixNeeded: !!o.erpFixNeeded, erpReturnNeeded: !!o.erpReturnNeeded, erpSentKey: o.erpSentKey || '' };
    try {
        await window.markErpFixedDoc(db, o.id, window.currentUser ? (window.currentUser.name || window.currentUser.email || '') : '');
    } catch (e) { alert('❌ 儲存失敗：' + e.message); return; }
    let bar = $('ef-undo');
    if (!bar) { bar = document.createElement('div'); bar.id = 'ef-undo'; document.body.appendChild(bar); }
    bar.innerHTML = '<span>✅ 已拿掉：' + esc(o.customer || o.orderNo || '') + '</span><button>復原</button>';
    bar.querySelector('button').onclick = async function() {
        clearTimeout(undoTimer); bar.classList.remove('show');
        try { await db.collection('salesOrders').doc(o.id).update(prev); toast('↩️ 已復原：' + (o.customer || o.orderNo)); }
        catch (e) { alert('❌ 復原失敗：' + e.message); }
    };
    bar.classList.add('show');
    clearTimeout(undoTimer);
    undoTimer = setTimeout(function() { bar.classList.remove('show'); }, 6000);
};
