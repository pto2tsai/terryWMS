// ============================================================
// 業務要改鼎新（手機）：缺貨少出、已出貨要開銷退的單
// 庫管在手機按「傳給業務」叫出 LINE 傳給業務；業務改好後按「已經改好了」
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
        return '<div class="ef-card">' +
            '<div class="ef-name">' + esc(o.customer || '') + '</div>' +
            '<div class="ef-no">' + esc(o.orderNo || '') + (o.waveNo ? '・波次 ' + esc(o.waveNo) : '') + '</div>' +
            window.erpFixLines(o).map(function(l) { return '<div class="ef-line">' + esc(l) + '</div>'; }).join('') +
            '<div class="ef-btns">' +
                '<button class="ef-send" onclick="sendErpFix(' + i + ')"><i class="fa-brands fa-line"></i> 傳給業務</button>' +
                '<button class="ef-done" onclick="markErpFixDone(' + i + ')"><i class="fa-solid fa-check"></i> 已經改好了</button>' +
            '</div></div>';
    }).join('');
    all.innerHTML = '<button class="pk-go ef-send-all" onclick="sendErpFix()"><i class="fa-brands fa-line"></i> 全部傳給業務（' + list.length + ' 張）</button>';
};

// 傳給業務：i 沒給＝全部
window.sendErpFix = async function(i) {
    const list = window.erpFixList || [];
    const pick = i == null ? list : [list[i]];
    if (!pick.length || !pick[0]) return;
    const r = await window.sendToSales(window.erpFixText(pick));
    if (r === 'copied') toast('✅ 已複製，可以貼到 LINE 給業務');
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
