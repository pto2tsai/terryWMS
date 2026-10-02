// 業務要改鼎新（電腦首頁、手機、看板共用）
//   缺貨少出要改數量（salesOrders.erpFixNeeded；鼎新改好、重新匯入後會變 false）
//   出貨後鼎新又改少或刪單，跟實際出貨對不上，請業務確認鼎新（salesOrders.erpReturnNeeded；確認好按「已經改好了」）
//   （我們都是先在鼎新改好才出貨，這種通常是鼎新改錯；只有客戶反應品質問題才會開銷退）
(function() {
    const r3 = function(n) { return Math.round((parseFloat(n) || 0) * 1000) / 1000; };
    // 以前存的舊說法（請開銷退）換成新的（請業務確認鼎新）
    const newWording = function(l) {
        return String(l).replace(/（已經出貨，鼎新改少了）→ 請開銷退$/, ' → 跟實際出貨對不上，請業務確認鼎新是不是改錯')
            .replace(/^整張單在鼎新不見了，但貨已經出了 → .*$/, '貨已經出了，鼎新卻沒有這張單 → 請業務確認鼎新是不是刪錯');
    };
    // 一張單要改的每一行（少 0 的不算：以前小數誤差留下來的「訂 2 → 出 1.9999999」）
    window.erpFixLines = function(o) {
        const a = o.erpFixNeeded ? (o.shortShipped || []).filter(function(x) { return r3(x.want) - r3(x.got) >= 0.001; }).map(function(x) {
            return (x.productName || '') + (x.spec ? ' ' + x.spec : '') + '：訂 ' + r3(x.want) + ' → 出 ' + r3(x.got) + '（少 ' + r3(x.want - x.got) + '）';
        }) : [];
        return a.concat(o.erpReturnNeeded ? (o.erpReturnLines || []).map(newWording) : []);
    };
    // 複製／傳給業務的文字（分兩段：缺貨少出、出貨後鼎新對不上）
    window.erpFixText = function(list) {
        const group = function(title, rows) {
            return rows.length ? title + '\n' + rows.map(function(o) {
                return '\n' + (o.customer || '') + '　' + (o.orderNo || '') + '\n' + o.lines.map(function(l) { return '・' + l; }).join('\n');
            }).join('\n') : '';
        };
        const fix = list.filter(function(o) { return o.erpFixNeeded; })
            .map(function(o) { return { customer: o.customer, orderNo: o.orderNo, lines: window.erpFixLines(Object.assign({}, o, { erpReturnNeeded: false })) }; })
            .filter(function(o) { return o.lines.length; });
        const ret = list.filter(function(o) { return o.erpReturnNeeded; }).map(function(o) { return { customer: o.customer, orderNo: o.orderNo, lines: (o.erpReturnLines || []).map(newWording) }; });
        return [group('【缺貨少出，請在鼎新改成實際出貨的數量】', fix), group('【出貨後鼎新又改了，跟實際出貨對不上：請確認鼎新是不是改錯】', ret)].filter(Boolean).join('\n\n');
    };
    function merge(a, b) {
        const byId = {};
        a.concat(b).forEach(function(o) { byId[o.id] = o; });
        return Object.keys(byId).map(function(k) { return byId[k]; }).filter(function(o) { return window.erpFixLines(o).length; })
            .sort(function(x, y) { return String(x.orderNo || '').localeCompare(String(y.orderNo || '')); });
    }
    const rows = function(snap) { return snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); }); };
    // 讀一次（電腦首頁）
    window.loadErpFixList = async function(db) {
        const s = await Promise.all([
            db.collection('salesOrders').where('erpFixNeeded', '==', true).get(),
            db.collection('salesOrders').where('erpReturnNeeded', '==', true).get()
        ]);
        return merge(rows(s[0]), rows(s[1]));
    };
    // 一直盯著（手機、看板）：有變就呼叫 cb(list)；回傳取消的函式
    window.watchErpFix = function(db, cb) {
        let a = [], b = [];
        const u1 = db.collection('salesOrders').where('erpFixNeeded', '==', true).onSnapshot(function(s) { a = rows(s); cb(merge(a, b)); }, function() {});
        const u2 = db.collection('salesOrders').where('erpReturnNeeded', '==', true).onSnapshot(function(s) { b = rows(s); cb(merge(a, b)); }, function() {});
        return function() { u1(); u2(); };
    };
    // 業務改好了（或說不用改）：從清單拿掉
    window.markErpFixedDoc = function(db, id, who) {
        return db.collection('salesOrders').doc(id).update({ erpFixNeeded: false, erpReturnNeeded: false, erpFixedAt: new Date().toISOString(), erpFixedBy: who || '' });
    };
    // 傳給業務：手機叫出分享（選 LINE）；不支援分享的直接開 LINE；電腦複製到剪貼簿
    window.sendToSales = async function(text) {
        const phone = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        if (phone && navigator.share) {
            try { await navigator.share({ text: text }); return 'shared'; }
            catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
        }
        if (phone) { location.href = 'https://line.me/R/share?text=' + encodeURIComponent(text); return 'line'; }
        try { await navigator.clipboard.writeText(text); return 'copied'; }
        catch (e) { window.prompt('請全選複製這段文字：', text); return 'prompt'; }
    };
})();
