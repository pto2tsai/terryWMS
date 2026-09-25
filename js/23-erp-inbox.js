// ============================================================
// js/23-erp-inbox.js — 鼎新報表收件匣（ERP 報表）
// Google 雲端的自動程式（tools/erp-sync）把鼎新定時匯出的報表整份存進 erpInbox：
//   - 每日客戶銷貨明細表：電腦版開著時自動接手 → 匯入訂單、依物流商建好波次（不跳視窗）
//     件數換算不出來的單留著，按「手動匯入」補填；沒有物流商的單在「建立波次」清單指定
//   - 庫存明細、批號明細、外倉庫存只存檔，可在這頁檢視、下載 Excel（之後拿來對帳）
// 月報與應收帳款由八方 ERP 自己接收，不進 WMS；萬一有含金額的報表進來（sensitive），只有主管、財務、管理員看得到
// ============================================================

// WMS 目前只用「每日客戶銷貨明細表」（匯入訂單、建波次）。
// 庫存明細、批號明細、外倉庫存之後做對帳時才需要：鼎新開始輸出就會收進來存檔，這裡先不列。
window.ERP_REPORT_TYPES = [
    { type: 'sales_daily', label: '每日客戶銷貨明細表', freq: '每天 4 次' }
];

var ERP_STATUS = {
    pending: { text: '等待處理', cls: 'bg-slate-600 text-white' },
    processing: { text: '處理中', cls: 'bg-blue-600 text-white' },
    done: { text: '完成', cls: 'bg-emerald-700 text-white' },
    attention: { text: '要處理', cls: 'bg-amber-500 text-black' },
    error: { text: '失敗', cls: 'bg-red-600 text-white' },
    stored: { text: '已存檔', cls: 'bg-slate-700 text-slate-200' }
};

function erpEsc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function erpCanSeeSensitive() { var r = window.currentUser && window.currentUser.role; return r === 'admin' || r === 'supervisor' || r === 'finance'; }
function erpCanOperate() { var r = window.currentUser && window.currentUser.role; return !!r && r !== 'readonly'; }
function erpMonth(d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }

// 讀出整份報表（分段存的表格接回來）
window.loadErpRows = async function(id) {
    var q = window.db.collection('erpInbox').doc(id).collection('chunks');
    if (!erpCanSeeSensitive()) q = q.where('sensitive', '==', false);   // 一般人員的查詢要明講只看一般報表，安全規則才會放行
    var snap = await q.get();
    var parts = snap.docs.map(function(d) { return d.data(); }).sort(function(a, b) { return a.i - b.i; });
    var rows = [];
    parts.forEach(function(p) { rows = rows.concat(JSON.parse(p.data || '[]')); });
    return window.sanitizeDeep ? window.sanitizeDeep(rows) : rows;   // 跟其他資料一樣做文字安全處理
};

// ---------- 自動匯入訂單（不跳視窗）----------
// 回傳 { result: 一行摘要, issues: [要人處理的事] }
window.autoImportErpOrderRows = async function(rows) {
    if (window.loadWavesFromFirebase) await window.loadWavesFromFirebase();
    await loadOrdersFromFirebase();
    var parsed = window.parseErpOrderRows(rows);
    if (parsed.error) throw new Error(parsed.error);
    // 件數換算不出來的單先不匯入（沒有人可以回答），留給「手動匯入」
    var bad = [];
    parsed.needPkg.forEach(function(n) { if (bad.indexOf(n.order) < 0) bad.push(n.order); });
    var orders = parsed.orders.filter(function(o) { return bad.indexOf(o) < 0; });
    // 鼎新已經取消的單：檔案涵蓋的日期裡，之前匯入過、現在檔案裡不見了、還沒出貨的單
    var fileNos = {}, fileDates = {};
    parsed.orders.forEach(function(o) { fileNos[o.orderNo] = true; if (o.orderDate) fileDates[String(o.orderDate)] = true; });
    var missing = window._orderData.orders.filter(function(o) {
        return o.id && o.importedAt && fileDates[String(o.orderDate || '')] && !fileNos[o.orderNo] &&
            ['pending', 'confirmed', 'inWave'].indexOf(o.status) >= 0;
    });
    var r = await window.saveErpOrders(orders);
    var w = await autoCreateWavesByLogistics({ skipConfirm: true, silent: true });
    renderOrderList();
    if (window.refreshWaveList) refreshWaveList();

    var issues = [];
    var badNew = bad.filter(function(o) { return !window._orderData.orders.some(function(x) { return x.orderNo === o.orderNo; }); });
    if (badNew.length) issues.push('件數換算不出來，還沒匯入（' + badNew.length + ' 張）：' + badNew.map(function(o) { return o.orderNo; }).join('、') + '。請按「手動匯入」填件數');
    var noLg = window._orderData.orders.filter(function(o) { return window.orderWaveable(o) && (!o.logistics || o.logistics === '未指定'); });
    if (noLg.length) issues.push('沒有物流商，還沒排波次（' + noLg.length + ' 張）：' + noLg.map(function(o) { return o.orderNo; }).join('、') + '。請到「波次揀貨 → 建立波次」指定物流商');
    if (r.shippedChanged.length) issues.push('已出貨的單在鼎新有修改，沒有套用：' + r.shippedChanged.join('、') + '。請在鼎新處理');
    if (w.failed && w.failed.length) issues.push('波次建立失敗：' + w.failed.join('；'));
    // 鼎新改了已匯入的單：沒排波次的直接改好；還沒開始揀的波次自動更新；已經開始揀的要現場處理
    var desc = window.describeOrderChanges(r.orderChanges);
    var updated = [], started = [];
    r.orderChanges.forEach(function(c, i) {
        if (c.waveState === 'updated') updated.push(desc[i]);
        else if (c.waveState === 'started' || c.waveState === 'error') started.push(desc[i]);
    });
    if (updated.length) issues.push('鼎新改了已排波次的單，還沒開始揀，波次已自動更新（已印的揀貨單要重印）：' + updated.join('；'));
    if (started.length) issues.push('鼎新改了已經開始揀貨的單，沒有自動改，請到現場處理：' + started.join('；'));
    if (missing.length) issues.push(ERP_MISSING_PREFIX + '（' + missing.length + ' 張）：' + missing.map(function(o) { return o.orderNo; }).join('、') + '。確定鼎新已取消，請按「在 WMS 也取消」');

    var result = '新增 ' + r.savedCount + ' 張訂單' + (r.modifiedCount ? '、異動 ' + r.modifiedCount + ' 張' : '') + (r.skipCount ? '、' + r.skipCount + ' 張沒變' : '') +
        '；建立 ' + w.created.length + ' 個波次' + (w.created.length ? '（' + w.created.map(function(x) { return x.logistics + ' ' + x.orderCount + ' 單'; }).join('、') + '）' : '');
    return { result: result, issues: issues, missingOrders: missing.map(function(o) { return { id: o.id, orderNo: o.orderNo }; }) };
};
var ERP_MISSING_PREFIX = '鼎新的最新檔案裡沒有這些單（可能已在鼎新取消），還沒出貨';

// ---------- 接手處理：一次處理一份，多台電腦同時開著也只會有一台處理 ----------
var erpBusy = false, erpAgain = false;
async function erpClaim(ref) {
    var me = (window.currentUser && window.currentUser.email) || '';
    return window.db.runTransaction(async function(tx) {
        var s = await tx.get(ref);
        if (!s.exists) return false;
        var d = s.data();
        var stale = d.status === 'processing' && (Date.now() - Date.parse(d.processingAt || 0) > 15 * 60000);
        if (d.status !== 'pending' && !stale) return false;
        tx.update(ref, { status: 'processing', processingBy: me, processingAt: new Date().toISOString() });
        return true;
    });
}

window.processErpInbox = async function() {
    if (!erpCanOperate()) return;
    if (erpBusy) { erpAgain = true; return; }
    erpBusy = true;
    try {
        var base = window.db.collection('erpInbox').where('sensitive', '==', false);
        var snaps = await Promise.all([base.where('status', '==', 'pending').get(), base.where('status', '==', 'processing').get()]);
        var docs = snaps[0].docs.concat(snaps[1].docs).filter(function(d) { return d.data().type === 'sales_daily'; })
            .sort(function(a, b) { return String(a.data().receivedAt).localeCompare(String(b.data().receivedAt)); });
        for (var i = 0; i < docs.length; i++) {
            var ref = docs[i].ref;
            if (!(await erpClaim(ref))) continue;
            var upd;
            try {
                var out = await window.autoImportErpOrderRows(await window.loadErpRows(ref.id));
                upd = { status: out.issues.length ? 'attention' : 'done', result: out.result, issues: out.issues, missingOrders: out.missingOrders };
            } catch (e) {
                console.error('自動匯入失敗', e);
                upd = { status: 'error', result: '匯入失敗：' + e.message, issues: [] };
            }
            upd.processedAt = new Date().toISOString();
            upd.processedBy = (window.currentUser && window.currentUser.email) || '';
            await ref.update(upd);
            if (window.showToast) window.showToast('📥 鼎新訂單自動匯入：' + upd.result);
        }
    } catch (e) {
        console.warn('ERP 收件匣處理失敗', e);
    } finally {
        erpBusy = false;
        if (erpAgain) { erpAgain = false; setTimeout(window.processErpInbox, 500); }
    }
};

// 登入後監聽：有新的訂單檔進來就自動處理
var erpUnsub = null;
window.onLogin(function() {
    if (erpUnsub) { erpUnsub(); erpUnsub = null; }
    if (!erpCanOperate()) return;
    erpUnsub = window.db.collection('erpInbox').where('sensitive', '==', false).where('status', '==', 'pending')
        .onSnapshot(function(s) { if (!s.empty) window.processErpInbox(); }, function(e) { console.warn('ERP 收件匣監聽失敗', e); });
});

// ---------- ERP 報表頁 ----------
var erpList = [];

// ---------- 預計收到訂單檔的時間（主管可以改）----------
var ERP_DAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];
async function loadErpSchedule() {
    var d = await window.db.collection('settings').doc('erpImport').get().catch(function() { return null; });
    var sc = d && d.exists ? d.data() : window.ERP_SCHEDULE_DEFAULT;
    var canEdit = erpCanSeeSensitive();
    document.getElementById('erp-sched-times').value = (sc.times || []).join(', ');
    document.getElementById('erp-sched-times').disabled = !canEdit;
    document.getElementById('erp-sched-days').innerHTML = ERP_DAY_NAMES.map(function(n, i) {
        return '<label class="text-slate-300"><input type="checkbox" class="erp-sched-day" value="' + i + '"' + ((sc.days || []).indexOf(i) >= 0 ? ' checked' : '') + (canEdit ? '' : ' disabled') + '>' + n + '</label>';
    }).join('');
    document.getElementById('erp-sched-save').style.display = canEdit ? '' : 'none';
    return sc;
}
window.saveErpSchedule = async function() {
    var times = document.getElementById('erp-sched-times').value.split(/[,，、\s]+/).map(function(t) { return t.trim(); }).filter(Boolean);
    var bad = times.filter(function(t) { return !/^([01]?\d|2[0-3]):[0-5]\d$/.test(t); });
    var msg = document.getElementById('erp-sched-msg');
    if (bad.length) { msg.innerText = '時間格式不對：' + bad.join('、') + '（例如 09:00）'; return; }
    var days = Array.prototype.map.call(document.querySelectorAll('.erp-sched-day:checked'), function(c) { return +c.value; });
    times = times.map(function(t) { return t.length === 4 ? '0' + t : t; }).sort();
    try {
        await window.db.collection('settings').doc('erpImport').set({ times: times, days: days, updatedAt: new Date().toISOString() });
        msg.innerText = '✅ 已儲存';
    } catch (e) { msg.innerText = '❌ 儲存失敗：' + e.message; }
};

window.initErpInboxPage = async function() {
    var m = document.getElementById('erp-month');
    if (m && !m.value) m.value = erpMonth();
    var sel = document.getElementById('erp-type');
    if (sel && sel.options.length <= 1) {
        window.ERP_REPORT_TYPES.forEach(function(t) {
            if (t.sensitive && !erpCanSeeSensitive()) return;
            sel.innerHTML += '<option value="' + t.type + '">' + erpEsc(t.label) + '</option>';
        });
    }
    erpSchedule = await loadErpSchedule();
    await window.loadErpInbox();
};
var erpSchedule = null;

window.loadErpInbox = async function() {
    var tbody = document.getElementById('erp-inbox-body');
    if (!tbody) return;
    var month = document.getElementById('erp-month').value || erpMonth();
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-slate-500 py-8">載入中…</td></tr>';
    try {
        var q = window.db.collection('erpInbox').where('month', '==', month);
        if (!erpCanSeeSensitive()) q = q.where('sensitive', '==', false);
        var snap = await q.get();
        erpList = snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); })
            .sort(function(a, b) { return String(b.receivedAt).localeCompare(String(a.receivedAt)); });
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-red-400 py-8">讀取失敗：' + erpEsc(e.message) + '</td></tr>';
        return;
    }
    window.renderErpInbox();
};

window.renderErpInbox = function() {
    var tbody = document.getElementById('erp-inbox-body');
    var type = document.getElementById('erp-type').value;
    var rows = erpList.filter(function(r) { return !type || r.type === type; });
    // 上方摘要：每種報表最近一次收到的時間
    var sum = document.getElementById('erp-summary');
    if (sum) {
        sum.innerHTML = window.ERP_REPORT_TYPES.filter(function(t) { return !t.sensitive || erpCanSeeSensitive(); }).map(function(t) {
            var last = erpList.find(function(r) { return r.type === t.type; });
            return '<div class="glass-panel p-3"><div class="text-slate-300 text-sm">' + erpEsc(t.label) + '</div>' +
                '<div class="text-xs text-slate-500">' + t.freq + '</div>' +
                '<div class="mt-1 text-sm ' + (last ? 'text-white' : 'text-slate-500') + '">' + (last ? '最近：' + new Date(last.receivedAt).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '本月還沒收到') + '</div></div>';
        }).join('');
    }
    var missed = window.erpMissedSlot(erpList, erpSchedule, new Date());
    if (sum && missed) sum.innerHTML += '<div class="glass-panel p-3 border border-red-500 text-red-300 font-bold">📭 ' + missed + ' 的訂單檔還沒收到：請檢查鼎新輸出、Google 雲端硬碟同步</div>';
    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-slate-500 py-8">這個月還沒有收到報表</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map(function(r) {
        var st = ERP_STATUS[r.status] || { text: r.status, cls: 'bg-slate-600' };
        var canManual = r.type === 'sales_daily' && erpCanOperate() && ['attention', 'error', 'pending'].indexOf(r.status) >= 0;
        return '<tr class="border-b border-slate-700/50 align-top">' +
            '<td class="p-2 text-slate-300 text-xs whitespace-nowrap">' + new Date(r.receivedAt).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + '</td>' +
            '<td class="p-2 text-white">' + erpEsc(r.label) + (r.company ? ' <span class="text-xs px-1 rounded ' + (r.company === '八方' ? 'bg-purple-700' : 'bg-blue-700') + '">' + erpEsc(r.company) + '</span>' : '') + '</td>' +
            '<td class="p-2 text-slate-400 text-xs">' + erpEsc(r.fileName) + '</td>' +
            '<td class="p-2 text-right text-slate-300">' + (r.rowCount || 0) + '</td>' +
            '<td class="p-2"><span class="erp-status px-2 py-0.5 rounded text-xs font-bold ' + st.cls + '">' + st.text + '</span></td>' +
            '<td class="p-2 text-sm"><div class="text-slate-200">' + erpEsc(r.result || '') + '</div>' +
                (r.issues || []).map(function(x) { return '<div class="text-amber-300 text-xs mt-1">⚠️ ' + erpEsc(x) + '</div>'; }).join('') + '</td>' +
            '<td class="p-2 whitespace-nowrap">' +
                '<button onclick="viewErpReport(\'' + r.id + '\')" class="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs mr-1">檢視</button>' +
                '<button onclick="downloadErpReport(\'' + r.id + '\')" class="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs mr-1">下載</button>' +
                (canManual ? '<button onclick="manualImportErp(\'' + r.id + '\')" class="px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs mr-1">手動匯入</button>' : '') +
                ((r.missingOrders || []).length && erpCanOperate() ? '<button onclick="cancelMissingErpOrders(\'' + r.id + '\')" class="px-2 py-1 bg-red-700 hover:bg-red-600 text-white rounded text-xs">在 WMS 也取消（' + r.missingOrders.length + ' 張）</button>' : '') +
            '</td></tr>';
    }).join('');
};

window.viewErpReport = async function(id) {
    var r = erpList.find(function(x) { return x.id === id; });
    var rows = await window.loadErpRows(id);
    var show = rows.slice(0, 300);
    var html = '<div class="text-sm text-slate-400 mb-2">' + erpEsc(r ? r.fileName : '') + '　共 ' + rows.length + ' 列' + (rows.length > 300 ? '（只顯示前 300 列，按「下載」看全部）' : '') + '</div>' +
        '<div class="max-h-[65vh] overflow-auto"><table class="text-xs w-full">' + show.map(function(row) {
            return '<tr class="border-b border-slate-800">' + row.map(function(c) { return '<td class="p-1 text-slate-200 whitespace-nowrap">' + erpEsc(c) + '</td>'; }).join('') + '</tr>';
        }).join('') + '</table></div>';
    WMS.createModal('modal-erp-view', { title: r ? r.label : '報表', icon: 'fa-solid fa-table text-cyan-400', content: html, width: '1100px' });
};

window.downloadErpReport = async function(id) {
    var r = erpList.find(function(x) { return x.id === id; });
    var rows = await window.loadErpRows(id);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), '報表');
    XLSX.writeFile(wb, String((r && r.fileName) || '鼎新報表').replace(/\.(xlsx|xls|csv)$/i, '') + '.xlsx');
};

// 鼎新已取消的單：在 WMS 也取消（還沒開始揀的波次會一起移出）
window.cancelMissingErpOrders = async function(id) {
    var r = erpList.find(function(x) { return x.id === id; });
    if (!r || !(r.missingOrders || []).length) return;
    if (!confirm('確定這些單在鼎新已經取消了嗎？\n\n' + r.missingOrders.map(function(o) { return o.orderNo; }).join('、') +
        '\n\nWMS 也會取消；還沒開始揀的波次會把它們移出。')) return;
    await loadOrdersFromFirebase();
    var out = await window.cancelSalesOrders(r.missingOrders.map(function(o) { return o.id; }), '鼎新已取消（自動匯入發現）');
    var issues = (r.issues || []).filter(function(x) { return x.indexOf(ERP_MISSING_PREFIX) !== 0; });
    if (out.skipped.length) issues.push('這些單沒有取消：' + out.skipped.join('；'));
    await window.db.collection('erpInbox').doc(id).update({
        missingOrders: [], issues: issues, status: issues.length ? 'attention' : 'done',
        result: (r.result || '') + '；已取消 ' + out.cancelled.length + ' 張（鼎新已取消）'
    });
    alert('✅ 已取消 ' + out.cancelled.length + ' 張' + (out.skipped.length ? '\n\n⚠️ 沒有取消：\n' + out.skipped.join('\n') : ''));
    if (window.refreshWaveList) refreshWaveList();
    await window.loadErpInbox();
};

// 手動匯入：用同一份資料跑一次人工匯入（會問件數、物流商）
window.manualImportErp = async function(id) {
    var ref = window.db.collection('erpInbox').doc(id);
    var rows = await window.loadErpRows(id);
    if (window.loadWavesFromFirebase) await window.loadWavesFromFirebase();
    await loadOrdersFromFirebase();
    var ok = await window.importErpOrderRows(rows);
    if (!ok) return;
    await ref.update({ status: 'done', result: '已手動匯入（' + ((window.currentUser && (window.currentUser.name || window.currentUser.email)) || '') + '）', issues: [],
        processedAt: new Date().toISOString(), processedBy: (window.currentUser && window.currentUser.email) || '' });
    await window.loadErpInbox();
};

// 首頁「今日工作」用：本月要人處理的報表數＋沒有物流商的訂單數
window.countErpAttention = async function() {
    try {
        var snap = await window.db.collection('erpInbox').where('month', '==', erpMonth()).where('sensitive', '==', false).get();
        var n = snap.docs.filter(function(d) { return ['attention', 'error'].indexOf(d.data().status) >= 0; }).length;
        var sched = await window.db.collection('settings').doc('erpImport').get();
        if (window.erpMissedSlot(snap.docs.map(function(d) { return d.data(); }), sched.exists ? sched.data() : null, new Date())) n++;
        var o = await window.db.collection('salesOrders').where('logistics', '==', '未指定').get();
        return n + o.docs.filter(function(d) { return window.orderWaveable(d.data()); }).length;
    } catch (e) { console.warn('ERP 待處理數讀取失敗', e); return null; }
};
