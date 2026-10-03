// ============================================================
// 業務要改鼎新（手機）：缺貨少出、出貨後鼎新對不上的單
// 庫管在手機按「傳給業務」叫出 LINE 傳給業務；業務改好後按「已經改好了」
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
    box.innerHTML = list.map(function(o, i) {
        const sent = window.erpSentLabel(o);
        return '<div class="ef-card' + (sent ? ' ef-sent' : '') + '">' +
            (sent ? '<div class="ef-sent-tag">' + esc(sent) + '</div>' : '') +
            '<div class="ef-name">' + esc(o.customer || '') + '</div>' +
            '<div class="ef-no">' + esc(o.orderNo || '') + (o.waveNo ? '・波次 ' + esc(o.waveNo) : '') + '</div>' +
            window.erpFixLines(o).map(function(l) { return '<div class="ef-line">' + esc(l) + '</div>'; }).join('') +
            '<div class="ef-btns">' +
                '<button class="ef-send" onclick="sendErpFix(' + i + ')"><i class="fa-brands fa-line"></i> ' + (sent ? '再傳一次' : '傳給業務') + '</button>' +
                '<button class="ef-done" onclick="markErpFixDone(' + i + ')"><i class="fa-solid fa-check"></i> 已經改好了</button>' +
            '</div></div>';
    }).join('');
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

window.markErpFixDone = async function(i) {
    const o = (window.erpFixList || [])[i];
    if (!o || !o.id) return;
    if (!confirm('「' + (o.customer || '') + ' ' + (o.orderNo || '') + '」業務已經在鼎新改好了（或說不用改）？\n\n按確定就從清單拿掉。')) return;
    try {
        await window.markErpFixedDoc(db, o.id, window.currentUser ? (window.currentUser.name || window.currentUser.email || '') : '');
        toast('✅ 已拿掉：' + (o.customer || o.orderNo));
    } catch (e) { alert('❌ 儲存失敗：' + e.message); }
};
