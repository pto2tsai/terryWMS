// ============================================================
// m/js/simple-inbound.js — 驗收入庫（不需條碼）
// 選廠商 → 加品項（品名+規格+數量）→ 完成 → 建棧板記錄＋入庫紀錄
// ============================================================

// 目前正在填的入庫單
let rcpVendor = '';
let rcpItems = []; // [{ productName, spec, qty }]

// 最近用過的廠商（從 simpleInbound 歷史撈）
let recentVendors = [];

window.pageInit.receive = async function() {
    rcpVendor = '';
    rcpItems = [];
    recentVendors = await loadRecentVendors();
    renderReceivePage();
};

async function loadRecentVendors() {
    try {
        const snap = await db.collection('simpleInbound')
            .orderBy('createdAt', 'desc').limit(50).get();
        const seen = new Set();
        snap.docs.forEach(d => { if (d.data().vendor) seen.add(d.data().vendor); });
        return Array.from(seen);
    } catch (e) { return []; }
}

// 從 window.pallets 取出所有品名規格組合，有庫存的排前面
function productCatalog() {
    const map = {};
    (window.pallets || []).forEach(function(p) {
        if (!p.productName) return;
        const key = p.productName + '|||' + (p.spec || '');
        if (!map[key]) map[key] = { productName: p.productName, spec: p.spec || '', qty: 0 };
        map[key].qty += parseFloat(p.quantity) || 0;
    });
    return Object.values(map).sort(function(a, b) {
        if (b.qty !== a.qty) return b.qty - a.qty;
        return a.productName.localeCompare(b.productName);
    });
}

function myHouseLabel() {
    const h = window.myHouse ? window.myHouse() : '';
    return h ? (h + '庫') : '選倉庫';
}

// ── 主畫面 ──────────────────────────────────────────────────

function renderReceivePage() {
    const houseLabel = myHouseLabel();
    const houseOk = !!(window.myHouse && window.myHouse());

    const itemsHtml = rcpItems.length === 0
        ? '<div style="padding:32px 0;text-align:center;color:#94a3b8">還沒有品項，按下方「＋ 加品項」</div>'
        : rcpItems.map(function(it, i) {
            return '<div class="rcp-item">' +
                '<div class="rcp-item-name">' + esc(it.productName) + ' <span class="rcp-item-spec">' + esc(it.spec) + '</span></div>' +
                '<div class="rcp-item-qty">' + it.qty + ' 件</div>' +
                '<button class="rcp-del" onclick="rcpRemoveItem(' + i + ')" aria-label="刪除">✕</button>' +
            '</div>';
        }).join('');

    $('receive-body').innerHTML =
        // 廠商行
        '<div class="rcp-header-row">' +
            '<div class="rcp-vendor-wrap">' +
                '<label class="rcp-label">廠商</label>' +
                renderVendorSelector() +
            '</div>' +
            '<button class="pk-chip" onclick="window.switchHouse && window.switchHouse()">📍 ' + esc(houseLabel) + ' ⇄</button>' +
        '</div>' +
        // 品項清單
        '<div class="rcp-items">' + itemsHtml + '</div>' +
        // 按鈕
        '<div class="rcp-actions">' +
            '<button class="pk-short" style="flex:1" onclick="openProductPicker()">＋ 加品項</button>' +
            '<button class="pk-go" style="flex:2;' + (rcpItems.length === 0 || !rcpVendor || !houseOk ? 'opacity:0.4;pointer-events:none' : '') + '" onclick="submitReceive()">✓ 完成入庫</button>' +
        '</div>';
}

function renderVendorSelector() {
    if (recentVendors.length === 0) {
        return '<input id="rcp-vendor-input" class="rcp-vendor-input" type="text" placeholder="輸入廠商名稱" value="' + esc(rcpVendor) + '" oninput="rcpVendor=this.value;renderReceivePage()">';
    }
    const options = recentVendors.map(function(v) {
        return '<option value="' + esc(v) + '"' + (rcpVendor === v ? ' selected' : '') + '>' + esc(v) + '</option>';
    }).join('');
    return '<select class="rcp-vendor-select" onchange="rcpVendor=this.value;renderReceivePage()">' +
        '<option value="">選廠商…</option>' +
        options +
        '<option value="__new__">＋ 新廠商</option>' +
    '</select>';
}

window.rcpRemoveItem = function(i) {
    rcpItems.splice(i, 1);
    renderReceivePage();
};

// ── 品項選擇器 ──────────────────────────────────────────────

let pickerQuery = '';
let pickerStep = 'list'; // 'list' | 'qty'
let pickerSelected = null; // { productName, spec }

function openProductPicker() {
    if (rcpVendor === '__new__') {
        const v = prompt('輸入廠商名稱：');
        if (!v) return;
        rcpVendor = v.trim();
        if (rcpVendor && !recentVendors.includes(rcpVendor)) recentVendors.unshift(rcpVendor);
        renderReceivePage();
        return;
    }
    pickerQuery = '';
    pickerStep = 'list';
    pickerSelected = null;
    $('picker-overlay').style.display = 'flex';
    renderPickerList();
    setTimeout(function() { var el = $('picker-search'); if (el) el.focus(); }, 100);
}

window.closePicker = function() {
    $('picker-overlay').style.display = 'none';
};

window.pickerSearch = function(val) {
    pickerQuery = val;
    renderPickerList();
};

function renderPickerList() {
    const q = pickerQuery.trim().toLowerCase();
    let catalog = productCatalog();

    // 加入目前清單裡已輸入但 pallets 沒有的品項（讓它能被再次選）
    // 也加入可以手動輸入的空項
    if (q) {
        catalog = catalog.filter(function(p) {
            return p.productName.toLowerCase().includes(q) || (p.spec || '').toLowerCase().includes(q);
        });
    }

    const hasExact = catalog.some(function(p) {
        return p.productName.toLowerCase() === q && !p.spec;
    });

    let html = catalog.map(function(p) {
        const qtyStr = p.qty > 0 ? '<span style="color:#94a3b8;font-size:13px">現有 ' + p.qty + ' 件</span>' : '';
        return '<div class="picker-item" onclick="pickerSelectProduct(' + JSON.stringify(esc(p.productName)) + ',' + JSON.stringify(esc(p.spec)) + ')">' +
            '<div class="picker-name">' + esc(p.productName) + (p.spec ? ' <span class="picker-spec">' + esc(p.spec) + '</span>' : '') + '</div>' +
            qtyStr +
        '</div>';
    }).join('');

    // 可以手動輸入新品項
    if (q && !hasExact) {
        html += '<div class="picker-item picker-new" onclick="pickerNewProduct()">' +
            '<div class="picker-name">＋ 新品項：' + esc(pickerQuery) + '</div>' +
        '</div>';
    }

    if (!html) {
        html = '<div style="padding:32px;text-align:center;color:#94a3b8">輸入品名搜尋</div>';
    }

    $('picker-list').innerHTML = html;
}

window.pickerSelectProduct = function(productName, spec) {
    pickerSelected = { productName: productName, spec: spec };
    pickerStep = 'qty';
    renderPickerQty();
};

window.pickerNewProduct = function() {
    // 讓用戶輸入品名和規格
    const nameInput = $('picker-search').value.trim();
    pickerSelected = { productName: nameInput, spec: '', isNew: true };
    pickerStep = 'qty';
    renderPickerQty();
};

function renderPickerQty() {
    $('picker-list').innerHTML =
        '<div style="padding:16px">' +
            '<div class="pk-name" style="font-size:22px;margin-bottom:4px">' + esc(pickerSelected.productName) + '</div>' +
            '<div class="pk-spec" style="margin-bottom:16px">' + esc(pickerSelected.spec) + '</div>' +
            (pickerSelected.isNew ? '<input id="picker-spec-input" class="rcp-vendor-input" placeholder="規格（可留空）" style="margin-bottom:12px">' : '') +
            '<div style="font-size:14px;color:#94a3b8;margin-bottom:8px">收了幾件？</div>' +
            '<input id="picker-qty" type="number" inputmode="numeric" class="qty-input" style="font-size:48px;width:120px;text-align:center" min="1" value="">' +
            '<div class="row-btns" style="margin-top:16px">' +
                '<button class="pk-short" style="flex:1" onclick="pickerStep=\'list\';renderPickerList()">← 返回</button>' +
                '<button class="pk-go" style="flex:2" onclick="pickerConfirmQty()">加入</button>' +
            '</div>' +
        '</div>';
    setTimeout(function() { var el = $('picker-qty'); if (el) { el.focus(); el.select(); } }, 100);
}

window.pickerConfirmQty = function() {
    const qty = parseInt($('picker-qty').value, 10);
    if (!qty || qty <= 0) { alert('請輸入數量'); return; }
    if (pickerSelected.isNew) {
        const specEl = $('picker-spec-input');
        if (specEl) pickerSelected.spec = specEl.value.trim();
    }
    // 預留 batchNo / expiryDate / locationId 給未來有儲位、效期時填
    rcpItems.push({ productName: pickerSelected.productName, spec: pickerSelected.spec, qty: qty, batchNo: '', expiryDate: '', locationId: '' });
    closePicker();
    renderReceivePage();
};

// ── 送出 ──────────────────────────────────────────────────

window.submitReceive = async function() {
    const house = window.myHouse ? window.myHouse() : '';
    if (!house) { alert('請先選倉庫'); return; }
    if (!rcpVendor || rcpVendor === '__new__') { alert('請選廠商'); return; }
    if (rcpItems.length === 0) { alert('請加品項'); return; }

    const btn = document.querySelector('#page-receive .pk-go');
    if (btn) btn.disabled = true;

    try {
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10);
        const locId = house + '庫'; // e.g. 'J庫'
        const batch = db.batch();

        // 1. simpleInbound 記錄（會計對帳用）
        const rcpRef = db.collection('simpleInbound').doc();
        batch.set(rcpRef, {
            vendor: rcpVendor,
            date: now.toISOString().slice(0, 10),
            house: house,
            // 每個品項：qty／batchNo／expiryDate／locationId 未來有儲位時再填
            items: rcpItems.map(function(it) {
                return { productName: it.productName, spec: it.spec || '', qty: it.qty,
                    batchNo: it.batchNo || '', expiryDate: it.expiryDate || '', locationId: it.locationId || '' };
            }),
            createdAt: now.toISOString(),
            createdBy: (window.currentUser && window.currentUser.email) || ''
        });

        // 2. 每個品項建 pallets 記錄（庫存快查＋揀貨系統看得到）
        // palletId 目前自動產生；未來有條碼時可印出條碼取代
        // locationId 目前用「J庫」/「I庫」；未來有儲位時用實際儲位
        rcpItems.forEach(function(it, i) {
            const pid = 'SIN-' + now.getTime() + '-' + i;
            const itemLoc = it.locationId || locId;
            const palletRef = db.collection('pallets').doc();
            batch.set(palletRef, {
                palletId: pid,
                productName: it.productName,
                spec: it.spec || '',
                quantity: it.qty,
                locationId: itemLoc,
                vendor: rcpVendor,
                batchNo: it.batchNo || '',
                expDate: it.expiryDate || '',
                expiryDate: it.expiryDate || '',
                source: 'SimpleInbound',
                inboundDate: now.toISOString().slice(0, 10),
                createdAt: now.toISOString(),
                status: 'Available',
                company: '崇文'
            });
        });

        await batch.commit();

        // 記錄廠商以供下次使用
        if (!recentVendors.includes(rcpVendor)) recentVendors.unshift(rcpVendor);

        // 重置
        rcpItems = [];
        rcpVendor = '';
        renderReceivePage();

        // 顯示成功
        $('receive-body').insertAdjacentHTML('afterbegin',
            '<div class="scan-result ok" style="margin:12px 16px">✓ 入庫完成！庫存已更新。</div>');
        setTimeout(function() {
            const el = document.querySelector('#receive-body .scan-result');
            if (el) el.remove();
        }, 3000);

    } catch (e) {
        console.error(e);
        alert('入庫失敗：' + e.message);
    } finally {
        if (btn) btn.disabled = false;
    }
};
