// 業務要處理的缺貨（電腦「業務看板」、手機揀貨、現場看板共用）
//   揀貨時按「不夠」（wave.shortLog）當下就是一件「業務要處理的事」，不用等波次完成、不用靠人記得傳 LINE
//   業務按「我來處理」、回覆現場（先出不補／等一下有貨…），記在波次上：wave.salesCases[品項代號] = { by, at, reply, replyBy, replyAt }
//   波次完成後，記錄跟著搬到銷貨單（salesOrders.salesCase），等業務改好鼎新、重新匯入後自動結案
(function() {
    window.SALES_REPLIES = ['先出不補', '等一下有貨，先別封箱', '換品項（看說明）'];
    window.salesCaseId = function(key) { return encodeURIComponent(String(key || '')); };
    // 一個波次裡現場回報不夠的每一樣：[{ id, key, productName, spec, want, short, by, at, orders, info }]
    window.waveSalesCases = function(wave) {
        const byKey = {};
        (wave && wave.shortLog || []).forEach(function(x) {
            if (!x || !x.key) return;
            const c = byKey[x.key] || (byKey[x.key] = { key: x.key, productName: x.productName || '', spec: x.spec || '', short: 0, by: x.by || '', at: x.at || '' });
            c.short = Math.round((c.short + (parseFloat(x.qty) || 0)) * 1000) / 1000;
            if (x.at && (!c.at || x.at < c.at)) { c.at = x.at; c.by = x.by || c.by; }
        });
        const cases = (wave && wave.salesCases) || {};
        return Object.keys(byKey).map(function(k) {
            const c = byKey[k], sm = (wave.summary || []).find(function(s) { return (s.productName + '|||' + (s.spec || '')) === k; }) || {};
            c.id = window.salesCaseId(k);
            c.want = (sm.orders || []).reduce(function(t, o) { return t + (parseFloat(o.quantity) || 0); }, 0) || parseFloat(sm.totalQty) || 0;
            c.orders = (sm.orders || []).filter(function(o) { return parseFloat(o.quantity) > 0; });
            c.info = cases[c.id] || {};
            return c;
        }).sort(function(a, b) { return String(a.at).localeCompare(String(b.at)); });
    };
    // 狀態：new＝還沒人接、claimed＝業務處理中、replied＝業務已回覆現場
    window.salesCaseStatus = function(info) { return !info ? 'new' : info.reply ? 'replied' : info.by ? 'claimed' : 'new'; };
    window.salesCaseLabel = function(info) {
        const s = window.salesCaseStatus(info);
        return s === 'replied' ? '業務：' + info.reply : s === 'claimed' ? '業務處理中（' + info.by + '）' : '等業務處理';
    };
    // 寫回波次（只改這一樣，不動其他的）
    window.saveWaveSalesCase = function(db, waveId, caseId, patch) {
        const ref = db.collection('waves').doc(waveId);
        return db.runTransaction(function(tx) {
            return tx.get(ref).then(function(s) {
                const cur = ((s.data() || {}).salesCases || {})[caseId] || {};
                tx.update(ref, new firebase.firestore.FieldPath('salesCases', caseId), Object.assign({}, cur, patch));
            });
        });
    };
})();
