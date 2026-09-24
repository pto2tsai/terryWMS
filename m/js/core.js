// ============================================================
// m/js/core.js — 手機版核心：登入、即時資料、掃描比對、相機、回饋
// 與桌機版共用同一個 Firestore 與 js/shared 的庫存交易核心
// ============================================================
window.APP_VERSION = '2026.09.23';

firebase.initializeApp(window.FIREBASE_CONFIG);
const db = firebase.firestore();
const auth = firebase.auth();
const FieldValue = firebase.firestore.FieldValue;
window.db = db;
window.auth = auth;
window.serverTimestamp = function() { return FieldValue.serverTimestamp(); };
window.getOperatorName = function() {
    const u = window.currentUser;
    return u ? (u.name || u.email) : 'mobile';
};

window.pallets = [];
window.waves = [];
window.dispatchOrders = [];
window.inboundTasks = [];
// 各頁在資料更新時要重畫：dataHooks.pallets.push(fn)
window.dataHooks = { pallets: [], waves: [], dispatchOrders: [], inboundTasks: [], consignmentData: [] };
// 各頁開啟時的初始化：pageInit['picking'] = fn
window.pageInit = {};

// ---------- 小工具 ----------
function esc(v) {
    return String(v === undefined || v === null ? '' : v).replace(/[&<>"']/g, function(c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}
function $(id) { return document.getElementById(id); }
function show(id, on) { const el = $(id); if (el) el.style.display = on ? '' : 'none'; }

let toastTimer = null;
function toast(msg) {
    let el = $('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
    el.innerText = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function() { el.classList.remove('show'); }, 2500);
}

// 震動＋嗶聲
function beep(type) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = type === 'error' ? 220 : 880;
        gain.gain.value = 0.25;
        osc.start();
        setTimeout(function() { osc.stop(); ctx.close(); }, type === 'error' ? 300 : 120);
    } catch (e) {}
}
function feedback(ok) {
    if (navigator.vibrate) navigator.vibrate(ok ? 80 : [150, 80, 150]);
    beep(ok ? 'success' : 'error');
}

// 結果訊息：kind = 'success' | 'error' | 'info'；相機畫面會顯示最後一則
let lastResult = null;
function setResult(id, kind, text) {
    if (kind === true) kind = 'success';
    if (kind === false) kind = 'error';
    const el = $(id);
    if (el) { el.className = 'scan-result ' + kind; el.innerText = text; }
    lastResult = { ok: kind !== 'error', text: text };
    if (kind !== 'info') feedback(kind === 'success');
}
function clearResult(id) { const el = $(id); if (el) { el.className = 'scan-result'; el.innerHTML = ''; } }

// ---------- 掃描比對 ----------
// 比對用的鍵：大寫、去掉 - 空白等符號（IN-20260923-001 與 IN20260923001 視為相同）
function codeKey(v) { return String(v || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function normCode(v) { return String(v || '').trim().toUpperCase(); }

// 在 list 中找掃到的碼：先完整比對 keys；找不到時允許只打板號尾碼（至少 3 碼且只有一筆符合）
function findByScan(list, scanned, keys, tailKey) {
    const code = codeKey(scanned);
    if (!code) return { item: null };
    const exact = list.filter(function(it) { return keys.some(function(k) { return codeKey(it[k]) === code; }); });
    if (exact.length === 1) return { item: exact[0] };
    if (exact.length > 1) return { item: null, items: exact, error: '有 ' + exact.length + ' 筆符合 ' + normCode(scanned) };
    tailKey = tailKey || 'palletId';
    if (code.length >= 3) {
        const tail = list.filter(function(it) { return codeKey(it[tailKey]).endsWith(code); });
        if (tail.length === 1) return { item: tail[0] };
        if (tail.length > 1) return { item: null, items: tail, error: '有 ' + tail.length + ' 板尾碼都是 ' + normCode(scanned) + '，請多輸入幾碼' };
    }
    return { item: null };
}

// 儲位：I-A-01-1F；手打可省略符號（IA011、ia011f → I-A-01-1F）
// 儲位簡碼轉換 window.formatLocationId 在 js/shared/data-format.js（電腦版與手機版共用）

function palletsAt(loc) {
    const key = codeKey(loc);
    return window.pallets.filter(function(p) { return codeKey(p.locationId) === key; });
}

// 掃棧板：可掃板號（或尾碼），也可掃儲位標籤（該儲位只有一板時直接帶出，多板時讓使用者選）
// 回傳 { pallet } | { choices: [...] } | { error }
function resolvePalletScan(scanned) {
    const m = findByScan(window.pallets, scanned, ['palletId', 'id']);
    if (m.item) return { pallet: m.item };
    const here = palletsAt(window.formatLocationId(scanned));
    if (here.length === 1) return { pallet: here[0] };
    if (here.length > 1) return { choices: here, error: '儲位 ' + window.formatLocationId(scanned) + ' 有 ' + here.length + ' 板，請選一板' };
    if (m.items) return { choices: m.items, error: m.error };
    return { error: '找不到棧板：' + normCode(scanned) };
}

// 多筆符合時列出讓使用者點選；pickFn(pallet 文件 ID)
function renderChoices(containerId, choices, pickFn) {
    const el = $(containerId);
    if (!el) return;
    el.className = '';
    el.innerHTML = choices.map(function(p) {
        return '<div class="list-item clickable pick-choice" onclick="' + pickFn + '(\'' + esc(p.id) + '\')">' +
            '<div class="item-row"><span class="item-location">' + esc(p.locationId) + '</span><span class="item-qty">' + esc(p.quantity) + '</span></div>' +
            '<div class="item-product">' + esc(p.productName) + ' ' + esc(p.spec || '') + '</div>' +
            '<div class="item-detail">' + esc(p.palletId) + ' | ' + esc(p.batchNo || '-') + ' ' + esc(p.expDate || '') + '</div></div>';
    }).join('');
}
function palletById(id) { return window.pallets.find(function(p) { return p.id === id; }); }
function palletRef(p) { return db.collection('pallets').doc(p.id); }

function palletInfoHtml(p) {
    return '<div class="info-grid">' +
        '<span class="k">品名</span><span class="v">' + esc(p.productName) + ' ' + esc(p.spec || '') + '</span>' +
        '<span class="k">儲位</span><span class="v loc">' + esc(p.locationId) + '</span>' +
        '<span class="k">板號</span><span class="v">' + esc(p.palletId) + '</span>' +
        '<span class="k">批號</span><span class="v">' + esc(p.batchNo || '-') + '</span>' +
        '<span class="k">效期</span><span class="v">' + esc(p.expDate || '-') + '</span>' +
        '<span class="k">數量</span><span class="v qty">' + esc(p.quantity) + ' 件</span></div>';
}

// ---------- 登入 ----------
function showLoginError(msg) { const el = $('login-error'); el.innerText = msg; el.style.display = 'block'; }
let unsubs = [];

auth.onAuthStateChanged(async function(user) {
    if (!user) {
        window.currentUser = null;
        unsubs.forEach(function(u) { u(); }); unsubs = [];
        $('login-page').style.display = 'flex';
        $('app-main').classList.remove('active');
        document.querySelectorAll('.func-page').forEach(function(p) { p.classList.remove('active'); });
        return;
    }
    // 帳號須已開通、未停用（與桌機版相同規則）
    try {
        const snap = await db.collection('users').doc(String(user.email).toLowerCase()).get();
        if (!snap.exists) { showLoginError('此帳號尚未開通，請聯絡系統管理員'); return auth.signOut(); }
        const profile = Object.assign({ id: snap.id }, snap.data());
        if (profile.active === false) { showLoginError('此帳號已停用，請聯絡系統管理員'); return auth.signOut(); }
        window.currentUser = profile;
    } catch (e) {
        console.error(e);
        showLoginError('無法載入使用者資料，請檢查網路後再登入');
        return auth.signOut();
    }
    $('login-error').style.display = 'none';
    $('login-page').style.display = 'none';
    $('app-main').classList.add('active');
    $('display-user').innerText = window.currentUser.name || user.email.split('@')[0];
    // 帳號被停用：馬上登出（不用等下次登入）
    if (window._userWatch) window._userWatch();
    window._userWatch = db.collection('users').doc(String(user.email).toLowerCase()).onSnapshot(function(snap) {
        const d = snap.exists ? snap.data() : null;
        if (d && d.active === false) { alert('此帳號已被停用，系統將登出'); auth.signOut().then(function() { location.reload(); }); return; }
        if (d && d.role) window.currentUser.role = d.role;
    }, function(err) { console.warn('帳號狀態監聽失敗', err); });
    initData();
});

window.doLogin = async function() {
    const email = $('login-email').value.trim();
    const pwd = $('login-pwd').value;
    $('login-error').style.display = 'none';
    if (!email || !pwd) { showLoginError('請輸入帳號與密碼'); return; }
    try {
        await auth.signInWithEmailAndPassword(email, pwd);
    } catch (err) {
        if (err.code === 'auth/user-not-found') showLoginError('帳號不存在');
        else if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') showLoginError('帳號或密碼錯誤');
        else if (err.code === 'auth/too-many-requests') showLoginError('嘗試太多次，請稍後再試');
        else showLoginError('登入失敗：' + (err.message || err.code));
    }
};
window.doLogout = function() { if (confirm('確定登出？')) auth.signOut(); };

// ---------- 即時資料 ----------
const prevCounts = {};
function watch(coll, key, mapFn, activeFn, badgeId, notifyText) {
    unsubs.push(db.collection(coll).onSnapshot(function(snap) {
        const list = [];
        snap.forEach(function(d) { const x = mapFn(Object.assign({ id: d.id }, d.data())); if (x) list.push(x); });
        window[key] = list;
        if (activeFn) {
            const n = list.filter(activeFn).length;
            const b = badgeId && $(badgeId);
            if (b) { b.innerText = n; b.classList.toggle('show', n > 0); }
            if (notifyText && prevCounts[key] !== undefined && n > prevCounts[key]) notify(notifyText + '（' + (n - prevCounts[key]) + '）');
            prevCounts[key] = n;
        }
        (window.dataHooks[key] || []).forEach(function(fn) { try { fn(); } catch (e) { console.error(e); } });
    }, function(err) { console.error(coll, err); toast('⚠️ ' + coll + ' 讀取失敗：' + err.message); }));
}

window.isWaveOpen = function(w) { return ['pending', 'picking', 'sorting'].indexOf(w.status || 'pending') >= 0; };
window.isDispatchOpen = function(o) { return ['completed', 'partial', 'done', 'cancelled'].indexOf(o.status) < 0 && (o.operations || []).length > 0; };
window.isTaskOpen = function(t) { return t.status !== 'done' && t.status !== 'cancelled'; };

function initData() {
    unsubs.forEach(function(u) { u(); }); unsubs = [];
    watch('pallets', 'pallets', function(p) {
        p = window.normalizeStockRecord(p);
        return ((p.quantity || 0) > 0 || (p.totalWeight || 0) > 0) ? p : null;
    });
    // 第一次拿到庫存：記錄今天的板數（倉租用，一天一次）
    window.dataHooks.pallets.push(function() {
        if (window._snapshotRecorded) return;
        window._snapshotRecorded = true;
        window.recordDailyStockSnapshot(window.pallets);
    });
    watch('waves', 'waves', function(w) { return w; }, window.isWaveOpen, 'badge-picking', '新的波次待揀貨');
    watch('dispatchOrders', 'dispatchOrders', function(o) { return o; }, window.isDispatchOpen, 'badge-dispatch', '新的調度工單');
    watch('inboundTasks', 'inboundTasks', function(t) { return t; }, window.isTaskOpen, 'badge-inbound', '新的入庫任務');
    // 寄倉：揀貨時保留已賣給客戶的件數（與桌機相同規則）
    watch('consignments', 'consignmentData', function(c) { return c; });
}

function notify(text) {
    toast('🔔 ' + text);
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    try { if ('Notification' in window && Notification.permission === 'granted' && document.hidden) new Notification('Terry WMS', { body: text }); } catch (e) {}
}

// ---------- 頁面切換 ----------
window.openPage = function(page) {
    document.querySelectorAll('.func-page').forEach(function(p) { p.classList.remove('active'); });
    $('app-main').classList.remove('active');
    $('page-' + page).classList.add('active');
    window.currentPage = page;
    window.scrollTo(0, 0);
    // 記一筆瀏覽紀錄：手機的「返回」手勢／按鍵會回主選單，而不是直接離開程式
    try {
        if (history.state && history.state.page) history.replaceState({ page: page }, '');
        else history.pushState({ page: page }, '');
    } catch (e) {}
    if (window.pageInit[page]) window.pageInit[page]();
};
function showMenu() {
    closeCameraScan();
    document.querySelectorAll('.func-page').forEach(function(p) { p.classList.remove('active'); });
    $('app-main').classList.add('active');
    window.currentPage = null;
}
let ignoreNextPop = false;
window.goBack = function() {
    showMenu();
    if (history.state && history.state.page) { ignoreNextPop = true; history.back(); }
};
window.addEventListener('popstate', function() {
    if (ignoreNextPop) { ignoreNextPop = false; return; }
    // 相機開著時，返回先關相機
    if (camScanner) { closeCameraScan(); if (window.currentPage) history.pushState({ page: window.currentPage }, ''); return; }
    if (window.currentPage) showMenu();
});

// 下一步要掃哪一格：相機開著就直接換目標，否則把游標移過去
function scanNext(inputId) {
    const input = $(inputId);
    if (!input) return;
    input.value = '';
    if (camScanner) { camTarget = inputId; $('cam-title').innerText = input.dataset.camTitle || input.placeholder || '相機掃描'; }
    else setTimeout(function() { input.focus(); }, 50);
}
function focusIfNoCamera(inputId) { if (!camScanner) setTimeout(function() { const el = $(inputId); if (el) el.focus(); }, 50); }

// 掃描欄按 Enter（條碼槍也會送 Enter）→ 執行 data-enter 指定的函數
document.addEventListener('keydown', function(e) {
    if (e.key !== 'Enter') return;
    const el = document.activeElement;
    if (!el) return;
    if (el.id === 'login-pwd' || el.id === 'login-email') { e.preventDefault(); return window.doLogin(); }
    const fn = el.dataset && el.dataset.enter;
    if (fn && window[fn]) { e.preventDefault(); window[fn](); }
});

// ---------- 相機掃描 ----------
let camScanner = null, camTarget = null, camBusy = false, camLast = { code: '', at: 0, ok: false }, camTorchOn = false;

window.openCameraScan = async function(targetId) {
    if (!window.Html5Qrcode) { alert('相機掃描元件載入失敗，請確認網路後重新整理'); return; }
    if (camScanner) return;
    camTarget = targetId;
    camLast = { code: '', at: 0, ok: false };
    const input = $(targetId);
    $('cam-title').innerText = (input && (input.dataset.camTitle || input.placeholder)) || '相機掃描';
    $('cam-result').className = 'cam-result';
    $('cam-result').innerText = '對準 QR code 或條碼';
    $('cam-overlay').classList.add('active');
    if (document.activeElement) document.activeElement.blur();
    try {
        camScanner = new Html5Qrcode('cam-reader', {
            formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE, Html5QrcodeSupportedFormats.CODE_128],
            experimentalFeatures: { useBarCodeDetectorIfSupported: true },
            verbose: false
        });
        // facingMode: environment 讓瀏覽器自己挑主鏡頭（依名稱挑常會挑到超廣角或微距，對不到焦）
        await camScanner.start(
            { facingMode: 'environment' },
            { fps: 12, qrbox: function(w, h) { const s = Math.floor(Math.min(w, h) * 0.85); return { width: s, height: s }; } },
            onCameraDecoded,
            function() {}
        );
        try {
            const caps = camScanner.getRunningTrackCapabilities ? camScanner.getRunningTrackCapabilities() : {};
            $('cam-torch').style.display = caps && caps.torch ? '' : 'none';
            // 支援連續對焦的裝置開啟連續對焦
            if (caps && caps.focusMode && caps.focusMode.indexOf('continuous') >= 0) {
                camScanner.applyVideoConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(function() {});
            }
        } catch (e) { $('cam-torch').style.display = 'none'; }
    } catch (e) {
        console.error(e);
        await closeCameraScan();
        alert('無法開啟相機：' + (e && e.message ? e.message : e) + '\n\n請確認已允許瀏覽器使用相機（網址需為 https）');
    }
};

async function onCameraDecoded(text) {
    const code = normCode(text);
    const now = Date.now();
    // 處理中不收；同一個碼成功過就不再處理（直到掃到別的碼），失敗的 2.5 秒後可重試
    if (camBusy || (code === camLast.code && (camLast.ok || now - camLast.at < 2500))) return;
    camLast = { code: code, at: now, ok: false };
    camBusy = true;
    try { camLast.ok = await handleCameraCode(code); } finally { camBusy = false; }
}

async function handleCameraCode(code) {
    const target = camTarget;
    const input = $(target);
    if (!input) return false;
    const fn = window[input.dataset.enter];
    if (!fn) return false;
    input.value = code;
    lastResult = null;
    try { await fn(); } catch (e) { console.error(e); lastResult = { ok: false, text: '❌ ' + e.message }; }
    const res = lastResult || { ok: true, text: '已掃描：' + code };
    const camRes = $('cam-result');
    camRes.className = 'cam-result ' + (res.ok ? 'ok' : 'err');
    camRes.innerText = res.text;
    const bottom = $('cam-bottom');
    bottom.classList.remove('cam-flash'); void bottom.offsetWidth; if (res.ok) bottom.classList.add('cam-flash');
    // 連續掃描（揀貨、調度等），或下一步還要掃（例如先掃板再掃儲位）→ 相機保持開著；否則成功就關閉，讓使用者輸入數量等
    const keepOpen = input.dataset.continuous === '1' || camTarget !== target;
    if (res.ok && !keepOpen) setTimeout(closeCameraScan, 500);
    return res.ok;
}

window.toggleTorch = async function() {
    if (!camScanner) return;
    camTorchOn = !camTorchOn;
    try { await camScanner.applyVideoConstraints({ advanced: [{ torch: camTorchOn }] }); } catch (e) { camTorchOn = false; }
};

window.closeCameraScan = async function() {
    $('cam-overlay').classList.remove('active');
    const s = camScanner;
    camScanner = null;
    camTorchOn = false;
    if (s) { try { if (s.isScanning) await s.stop(); s.clear(); } catch (e) {} }
};

// ---------- 離線快取與更新提示 ----------
if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('sw.js').then(function(reg) {
            reg.addEventListener('updatefound', function() {
                const w = reg.installing;
                if (!w) return;
                w.addEventListener('statechange', function() {
                    if (w.state === 'installed' && navigator.serviceWorker.controller) $('update-bar').classList.add('show');
                });
            });
        }).catch(function(e) { console.warn('SW 註冊失敗', e); });
    });
}
document.addEventListener('DOMContentLoaded', function() {
    const v = $('app-version'); if (v) v.innerText = 'v' + window.APP_VERSION;
});
