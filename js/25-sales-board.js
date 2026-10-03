// ============================================================
// 業務看板（電腦）：現場揀貨按「不夠」當下就出現在這裡，業務不用等 LINE、不用接電話
//   依物流來取貨的時間排，最急的在上面；新的會響、跳 Windows 通知
//   業務按「我來處理」→ 回覆現場（手機、現場看板馬上看到）→ 去鼎新改 → 重新匯入後自動結案
//   資料：揀貨中的在波次上（wave.shortLog／salesCases，js/shared/sales-case.js），波次完成後在銷貨單（erpFixNeeded／salesCase）
// ============================================================
(function() {
    var waves = [], fixList = [], printList = [], seen = null, unsubs = [], undoTimer = null;
    var esc = function(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var r3 = function(n) { return Math.round((parseFloat(n) || 0) * 1000) / 1000; };
    function me() { return window.getOperatorName ? window.getOperatorName() : ((window.currentUser || {}).name || ''); }
    function hm(iso) { if (!iso) return ''; var d = new Date(iso); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
    function shortName(n, sp) { return (n || '') + (sp ? ' ' + String(sp).split(/[*＊(（\s]/)[0] : ''); }

    // ---------- 通知：這台電腦要不要收（系統的聲音一律預設開著，關掉才記下來） ----------
    function notifyOn() {
        try { return localStorage.getItem('wms-sales-notify') !== '0'; } catch (e) { return true; }
    }
    window.toggleSalesNotify = function() {
        var on = !notifyOn();
        try { localStorage.setItem('wms-sales-notify', on ? '1' : '0'); } catch (e) {}
        if (on && window.Notification && Notification.permission === 'default') Notification.requestPermission().then(renderSalesBoard);
        if (on) chime();
        renderSalesBoard();
    };
    var actx = null;
    function chime() {
        try {
            actx = actx || new (window.AudioContext || window.webkitAudioContext)();
            if (actx.state === 'suspended') actx.resume();
            [[880, 0], [660, .35]].forEach(function(n) {
                var o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + n[1];
                o.type = 'sine'; o.frequency.value = n[0]; o.connect(g); g.connect(actx.destination);
                g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
                o.start(t); o.stop(t + 1.3);
            });
        } catch (e) {}
    }
    function notifyNew(list) {
        if (!list.length) return;
        window._salesNotified = (window._salesNotified || []).concat(list.map(function(x) { return x.title + '｜' + x.body; }));
        if (!notifyOn()) return;
        chime();
        if (window.showToast) window.showToast('🔴 業務要處理：' + list[0].body + (list.length > 1 ? ' 等 ' + list.length + ' 件' : ''), 6000);
        if (window.Notification && Notification.permission === 'granted') {
            list.slice(0, 3).forEach(function(x) {
                try {
                    var n = new Notification(x.title, { body: x.body, tag: x.uid, requireInteraction: true });
                    n.onclick = function() { window.focus(); if (window.switchTab) window.switchTab('sales-board'); n.close(); };
                } catch (e) {}
            });
        }
    }

    // ---------- 整理成一張一張卡片 ----------
    function allCases() {
        var a = [];
        waves.forEach(function(w) {
            var pk = window.wavePickupTime ? window.wavePickupTime(w) : null;
            window.waveSalesCases(w).forEach(function(c) { a.push({ kind: 'wave', uid: 'w:' + w.id + ':' + c.id, w: w, c: c, info: c.info, pk: pk ? pk.getTime() : 9e15 }); });
        });
        fixList.forEach(function(o) { a.push({ kind: 'order', uid: 'o:' + o.id, o: o, info: o.salesCase || {}, pk: 9.5e15 }); });
        var rank = { new: 0, claimed: 1, replied: 2 };
        return a.sort(function(x, y) {
            return (x.kind === 'order') - (y.kind === 'order') || x.pk - y.pk || rank[window.salesCaseStatus(x.info)] - rank[window.salesCaseStatus(y.info)];
        });
    }
    function cardHtml(x) {
        var st = window.salesCaseStatus(x.info), i = x.info || {};
        var pill = st === 'new' ? '<span class="ds-pill ds-pill-danger">新的</span>' : st === 'claimed' ? '<span class="ds-pill ds-pill-warn">處理中・' + esc(i.by) + '</span>' : '<span class="ds-pill ds-pill-primary">已回覆現場</span>';
        var head, body, meta, btns;
        if (x.kind === 'wave') {
            var w = x.w, c = x.c, p = window.pickupInfo ? window.pickupInfo(w) : null;
            head = '<b>' + esc(String(w.logistics || '').replace(/宅急便|貨運|物流$/g, '')) + '</b>' + (p ? '<span class="sb-pk sb-' + (p.level || 'ok') + '">' + esc(p.text) + '</span>' : '') + '<span class="sb-wave">' + esc(w.waveNo || '') + '・揀貨中</span>';
            body = '<div class="sb-item">' + esc(shortName(c.productName, c.spec)) + '　要 ' + r3(c.want) + ' 只有 ' + r3(c.want - c.short) + '<b class="sb-short">（少 ' + r3(c.short) + '）</b></div>' +
                c.orders.map(function(o) { return '<div class="sb-order">' + esc(o.orderNo || '') + '　' + esc(o.customer || '') + '　訂 ' + r3(o.quantity) + '</div>'; }).join('');
            meta = '現場回報：' + esc(c.by) + ' ' + hm(c.at);
            var arg = "'" + w.id + "','" + c.id + "'";
            btns = st === 'new' ? '<button class="ds-btn ds-btn-primary ds-btn-sm" onclick="salesClaim(' + arg + ')"><i class="fa-solid fa-hand"></i>我來處理</button>' :
                window.SALES_REPLIES.map(function(r, k) { return '<button class="ds-btn ' + (i.reply === r ? 'ds-btn-primary' : 'ds-btn-secondary') + ' ds-btn-sm" onclick="salesReply(' + arg + ',' + k + ')">' + esc(r) + '</button>'; }).join('') +
                '<button class="ds-btn ds-btn-ghost ds-btn-sm" onclick="salesReply(' + arg + ',-1)">其他…</button>';
        } else {
            var o = x.o;
            head = '<b>已出貨・等鼎新改</b><span class="sb-wave">' + esc(o.waveNo || '') + '</span>';
            body = '<div class="sb-order" style="color:var(--ds-text);font-weight:600">' + esc(o.orderNo || '') + '　' + esc(o.customer || '') + '</div>' +
                window.erpFixLines(o).map(function(l) { return '<div class="sb-item" style="font-size:15px">' + esc(l) + '</div>'; }).join('');
            meta = (o.checkStatus === 'issue' ? '第二關核對發現數量不對（' + esc(o.checkedBy || '') + ' ' + hm(o.checkedAt) + '）・' : '') + '鼎新改好、重新匯入後會自動消失';
            btns = (st === 'new' ? '<button class="ds-btn ds-btn-primary ds-btn-sm" onclick="salesClaimOrder(\'' + o.id + '\')"><i class="fa-solid fa-hand"></i>我來處理</button>' : '') +
                '<button class="ds-btn ds-btn-secondary ds-btn-sm" onclick="salesOrderDone(\'' + o.id + '\')"><i class="fa-solid fa-check"></i>已經改好了</button>';
        }
        if (i.by) meta += '　・　處理：' + esc(i.by) + ' ' + hm(i.at);
        if (i.reply) meta += '　・　回覆：<b style="color:var(--ds-text)">' + esc(i.reply) + '</b> ' + hm(i.replyAt);
        return '<div class="sb-card sb-' + st + '"><div class="sb-top">' + pill + head + '</div>' + body + '<div class="sb-meta">' + meta + '</div><div class="sb-btns">' + btns + '</div></div>';
    }
    window.renderSalesBoard = function() {
        var list = allCases(), box = document.getElementById('sales-board-list');
        var fresh = list.filter(function(x) { return window.salesCaseStatus(x.info) === 'new'; }).length;
        // 左邊選單、分頁標題上的數字（還沒人接的）
        var badge = document.getElementById('nav-sales-badge');
        if (badge) { badge.textContent = fresh || ''; badge.style.display = fresh ? '' : 'none'; }
        document.title = (fresh ? '(' + fresh + ') ' : '') + document.title.replace(/^\(\d+\) /, '');
        if (!box) return;
        var on = notifyOn(), perm = window.Notification ? Notification.permission : 'denied';
        document.getElementById('sales-board-notify').innerHTML =
            '<button class="ds-btn ' + (on ? 'ds-btn-primary' : 'ds-btn-secondary') + ' ds-btn-sm" onclick="toggleSalesNotify()"><i class="fa-solid ' + (on ? 'fa-bell' : 'fa-bell-slash') + '"></i>' + (on ? '這台電腦會響、跳通知' : '這台電腦不通知') + '</button>' +
            (on && perm === 'default' ? '<button class="ds-btn ds-btn-secondary ds-btn-sm" onclick="Notification.requestPermission().then(renderSalesBoard)">允許 Windows 通知</button>' : '') +
            (on && perm === 'denied' ? '<span style="font-size:13px;color:var(--ds-warn)">瀏覽器擋了通知：只會響、不會跳 Windows 通知</span>' : '');
        var pl = document.getElementById('sales-print-list');
        if (pl) pl.innerHTML = printHtml();
        box.innerHTML = list.length ? list.map(cardHtml).join('') :
            '<div class="ds-empty" style="padding:48px"><div class="ds-empty-icon"><i class="fa-solid fa-check"></i></div><div class="ds-empty-title">目前沒有要處理的</div><div style="font-size:14px;color:var(--ds-text-3);margin-top:6px">現場一按「不夠」就會出現在這裡，會響、跳通知</div></div>';
    };

    // ---------- 可以從鼎新印給司機：現場核對過、鼎新也對了（數量不對的要等鼎新改好、重新匯入） ----------
    function printHtml() {
        if (!printList.length) return '';
        var rows = printList.slice().sort(function(a, b) { return String(a.logistics || '').localeCompare(String(b.logistics || '')) || String(a.orderNo || '').localeCompare(String(b.orderNo || '')); });
        return '<div class="sb-print"><div class="sb-print-head"><i class="fa-solid fa-print"></i> 可以從鼎新印給司機（' + rows.length + ' 張）<span>印三聯、放進信封，印好按「印好了」</span></div>' +
            rows.map(function(o) {
                var again = o.checkStatus === 'issue';
                return '<div class="sb-print-row"><b>' + esc(String(o.logistics || '').replace(/宅急便|貨運|物流$/g, '')) + '</b><span class="sb-print-no">' + esc(o.orderNo || '') + '</span><span>' + esc(o.customer || '') + '</span>' +
                    '<span class="ds-pill ' + (again ? 'ds-pill-warn">鼎新改好了・重印' : 'ds-pill-success">核對好了') + '</span>' +
                    '<button class="ds-btn ds-btn-secondary ds-btn-sm" onclick="salesPrinted(\'' + o.id + '\')"><i class="fa-solid fa-check"></i>印好了</button></div>';
            }).join('') + '</div>';
    }
    window.salesPrinted = async function(id) {
        var o = printList.find(function(x) { return x.id === id; });
        if (!o) return;
        var prev = { checkStatus: o.checkStatus };
        try { await window.db.collection('salesOrders').doc(id).update({ checkStatus: 'printed', printedAt: new Date().toISOString(), printedBy: me() }); }
        catch (e) { alert('❌ 儲存失敗：' + e.message); return; }
        showUndo('✅ 印好了：' + (o.customer || o.orderNo), function() { return window.db.collection('salesOrders').doc(id).update(prev); });
    };
    function showUndo(text, undo) {
        var bar = document.getElementById('sb-undo');
        bar.innerHTML = '<span>' + esc(text) + '</span><button class="ds-btn ds-btn-secondary ds-btn-sm">復原</button>';
        bar.querySelector('button').onclick = async function() {
            clearTimeout(undoTimer); bar.style.display = 'none';
            try { await undo(); } catch (e) { alert('❌ 復原失敗：' + e.message); }
        };
        bar.style.display = 'flex';
        clearTimeout(undoTimer); undoTimer = setTimeout(function() { bar.style.display = 'none'; }, 6000);
    }

    // ---------- 業務的動作 ----------
    window.salesClaim = async function(waveId, caseId) {
        try { await window.saveWaveSalesCase(window.db, waveId, caseId, { by: me(), at: new Date().toISOString() }); }
        catch (e) { alert('❌ 儲存失敗：' + e.message); }
    };
    window.salesReply = async function(waveId, caseId, k) {
        var text = k >= 0 ? window.SALES_REPLIES[k] : '';
        if (k < 0 || /看說明/.test(text)) {
            var more = window.prompt(k < 0 ? '要跟現場說什麼？' : '換成什麼？（例：換 40/60 白蝦 2 件）', '');
            if (more == null || !more.trim()) return;
            text = k < 0 ? more.trim() : '換品項：' + more.trim();
        }
        var now = new Date().toISOString();
        try { await window.saveWaveSalesCase(window.db, waveId, caseId, { reply: text, replyBy: me(), replyAt: now, by: me(), at: now }); }
        catch (e) { alert('❌ 儲存失敗：' + e.message); }
    };
    window.salesClaimOrder = async function(id) {
        var o = fixList.find(function(x) { return x.id === id; }) || {};
        try { await window.db.collection('salesOrders').doc(id).update({ salesCase: Object.assign({}, o.salesCase || {}, { by: me(), at: new Date().toISOString() }) }); }
        catch (e) { alert('❌ 儲存失敗：' + e.message); }
    };
    // 已經改好了：不用再問，直接拿掉；下面給「復原」
    window.salesOrderDone = async function(id) {
        var o = fixList.find(function(x) { return x.id === id; });
        if (!o) return;
        var prev = { erpFixNeeded: !!o.erpFixNeeded, erpReturnNeeded: !!o.erpReturnNeeded, erpSentKey: o.erpSentKey || '' };
        try { await window.markErpFixedDoc(window.db, id, me()); } catch (e) { alert('❌ 儲存失敗：' + e.message); return; }
        showUndo('✅ 已拿掉：' + (o.customer || o.orderNo), function() { return window.db.collection('salesOrders').doc(id).update(prev); });
    };

    // ---------- 一直盯著：揀貨中的波次、等鼎新改的銷貨單 ----------
    function onData() {
        var list = allCases();
        var now = {};
        list.forEach(function(x) { now[x.uid] = x; });
        if (seen) {
            var fresh = list.filter(function(x) { return !seen[x.uid] && window.salesCaseStatus(x.info) === 'new'; }).map(function(x) {
                if (x.kind === 'wave') return { uid: x.uid, title: '🔴 缺貨・' + String(x.w.logistics || '').replace(/宅急便|貨運|物流$/g, '') + (window.pickupInfo && window.pickupInfo(x.w) ? ' ' + window.pickupInfo(x.w).text : ''), body: shortName(x.c.productName, x.c.spec) + ' 少 ' + r3(x.c.short) + '（' + x.c.orders.map(function(o) { return o.customer; }).join('、') + '）' };
                return { uid: x.uid, title: '🧾 已出貨・要改鼎新', body: (x.o.customer || '') + ' ' + (x.o.orderNo || '') };
            });
            notifyNew(fresh);
        }
        seen = now;
        window.renderSalesBoard();
    }
    function start() {
        if (unsubs.length || !window.db) return;
        var db = window.db, ready = { w: false, o: false };
        unsubs.push(db.collection('waves').where('status', 'in', ['pending', 'picking', 'sorting']).onSnapshot(function(s) {
            waves = s.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
            ready.w = true; if (ready.o) onData();
        }, function(e) { console.warn('業務看板讀取波次失敗', e); }));
        unsubs.push(window.watchErpFix(db, function(list) { fixList = list; ready.o = true; if (ready.w) onData(); }));
        unsubs.push(db.collection('salesOrders').where('checkStatus', 'in', ['ok', 'issue']).onSnapshot(function(snap) {
            printList = snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); }).filter(window.orderPrintable);
            if (seen) window.renderSalesBoard();
        }, function(e) { console.warn('業務看板讀取可以印的單失敗', e); }));
    }
    // 每分鐘更新「還有幾分」
    setInterval(function() { if (seen) window.renderSalesBoard(); }, 60000);
    if (window.onLogin) window.onLogin(start);
})();
