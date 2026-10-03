// 每家物流幾點來取貨（電腦波次清單、手機選波次共用）：最早要交貨的排最上面
// 自家司機一天兩班；07:30 那班是前一天先揀好的貨：下午才建的波次就排到隔天 07:30
// 主管在電腦「波次揀貨 → 設定 → 物流商」可以改（存在 settings/logistics 的 list[].pickup）
(function() {
    window.PICKUP_DEFAULT = {
        '崇文自送': ['07:30', '13:00'], '裕鵬物流': ['10:00'], '黑貓宅急便': ['13:00'], '大榮貨運': ['14:00'],
        '全日物流': ['15:00'], '科技物流': ['15:00'], '金東石': ['15:00'], '文生': ['15:30'], '阿誠': ['16:30'], '裕寶饕': ['17:00']
    };
    // 現在用的時間表（同一個物件，換內容不換物件，電腦版直接拿來用）
    window.LOGISTICS_PICKUP = window.LOGISTICS_PICKUP || JSON.parse(JSON.stringify(window.PICKUP_DEFAULT));
    // 用存在設定裡的物流商名單換掉；舊的名單沒有取貨時間就用預設的
    window.applyPickupList = function(list) {
        const m = window.LOGISTICS_PICKUP;
        Object.keys(m).forEach(function(k) { delete m[k]; });
        (list || []).forEach(function(x) {
            const name = String(x.name || '').trim();
            if (!name) return;
            const pk = Array.isArray(x.pickup) ? x.pickup : (window.PICKUP_DEFAULT[name] || []);
            if (pk.length) m[name] = pk.slice();
        });
    };
    // 這個波次的物流下一次來取貨是什麼時候（波次建立之後的第一班）；沒設定取貨時間＝null
    window.wavePickupTime = function(wave) {
        const times = window.LOGISTICS_PICKUP[wave && wave.logistics] || [];
        if (!times.length) return null;
        const from = wave.createdAt ? new Date(wave.createdAt) : new Date();
        for (let day = 0; day < 3; day++) {
            const slots = times.map(function(t) {
                const m = /^(\d{1,2}):(\d{2})$/.exec(t); if (!m) return null;
                const d = new Date(from); d.setDate(d.getDate() + day); d.setHours(+m[1], +m[2], 0, 0); return d;
            }).filter(Boolean).sort(function(a, b) { return a - b; });
            const hit = slots.find(function(d) { return d >= from; });
            if (hit) return hit;
        }
        return null;
    };
    // 取貨時間怎麼寫：{ text: '15:00 取貨・還有 35 分', level: ''|'soon'|'late' }（1 小時內 soon、過了 late）
    window.pickupInfo = function(wave, now) {
        const t = window.wavePickupTime(wave);
        if (!t || (wave && wave.status === 'done')) return null;
        now = now || new Date();
        const hm = String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
        const sameDay = t.toDateString() === now.toDateString();
        const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
        const day = sameDay ? '' : t.toDateString() === tomorrow.toDateString() ? '明天 ' : (t.getMonth() + 1) + '/' + t.getDate() + ' ';
        const left = Math.round((t - now) / 60000);
        if (left < 0) return { time: t, text: '已過 ' + day + hm, level: 'late' };
        if (left <= 60) return { time: t, text: hm + ' 取貨・還有 ' + left + ' 分', level: 'soon' };
        return { time: t, text: day + hm + ' 取貨', level: '' };
    };
})();
