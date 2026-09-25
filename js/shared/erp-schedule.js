// ============================================================
// js/shared/erp-schedule.js — 鼎新訂單檔「該到沒到」（電腦版、看板共用）
// 鼎新定時輸出「每日客戶銷貨明細表」；過了預計時間 25 分鐘還沒收到，就提醒
// （電腦沒開、鼎新沒輸出、雲端硬碟沒同步，都會這樣）
// 預計時間存在 settings/erpImport：{ times: ['09:00', ...], days: [1..5] }（0＝星期日）
// ============================================================
window.ERP_SCHEDULE_DEFAULT = { times: ['09:00', '11:00', '13:00', '15:00'], days: [1, 2, 3, 4, 5] };

// 回傳錯過的時段（例如 '11:00'），沒錯過回傳 null
// docs：本月收到的報表（erpInbox），now：現在時間
window.erpMissedSlot = function(docs, sched, now) {
    sched = sched && Array.isArray(sched.times) ? sched : window.ERP_SCHEDULE_DEFAULT;
    now = now || new Date();
    if ((sched.days || []).indexOf(now.getDay()) < 0) return null;
    var slots = sched.times.map(function(t) {
        var m = /^(\d{1,2}):(\d{2})$/.exec(String(t).trim());
        if (!m) return null;
        var d = new Date(now); d.setHours(+m[1], +m[2], 0, 0);
        return d;
    }).filter(function(d) { return d && now - d >= 25 * 60000; })
      .sort(function(a, b) { return a - b; });
    if (!slots.length) return null;
    var last = slots[slots.length - 1];
    // 鼎新在時段前幾分鐘輸出，所以時段前 15 分鐘之後收到的都算
    var got = (docs || []).some(function(r) { return r.type === 'sales_daily' && Date.parse(r.receivedAt) >= last - 15 * 60000; });
    if (got) return null;
    return String(last.getHours()).padStart(2, '0') + ':' + String(last.getMinutes()).padStart(2, '0');
};
