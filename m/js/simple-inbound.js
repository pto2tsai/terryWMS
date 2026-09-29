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

// 最近一次入庫的插單資料（給印單按鈕用）
let lastInboundLabels = [];

window.submitReceive = async function() {
    const house = window.myHouse ? window.myHouse() : '';
    if (!house) { alert('請先選倉庫'); return; }
    if (!rcpVendor || rcpVendor === '__new__') { alert('請選廠商'); return; }
    if (rcpItems.length === 0) { alert('請加品項'); return; }

    const btn = document.querySelector('#page-receive .pk-go');
    if (btn) btn.disabled = true;

    try {
        const now = new Date();
        const locId = house + '庫'; // e.g. 'J庫'
        const batch = db.batch();

        // 1. simpleInbound 記錄（會計對帳用）
        const rcpRef = db.collection('simpleInbound').doc();
        batch.set(rcpRef, {
            vendor: rcpVendor,
            date: now.toISOString().slice(0, 10),
            house: house,
            items: rcpItems.map(function(it) {
                return { productName: it.productName, spec: it.spec || '', qty: it.qty,
                    batchNo: it.batchNo || '', expiryDate: it.expiryDate || '', locationId: it.locationId || '' };
            }),
            createdAt: now.toISOString(),
            createdBy: (window.currentUser && window.currentUser.email) || ''
        });

        // 2. 每個品項建 pallets 記錄，同時收集插單資料
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        const autoBatchNo = 'IN-' + dateStr; // e.g. IN-20260929
        const nullLoc = house + '-0-00-00';  // e.g. J-0-00-00（未指定細儲位）
        const labels = [];
        rcpItems.forEach(function(it, i) {
            const pid = 'SIN-' + now.getTime() + '-' + i;
            const itemLoc = it.locationId || locId;
            const printLoc = it.locationId || nullLoc;
            const batchNo = it.batchNo || autoBatchNo;
            labels.push({
                palletId: pid, productName: it.productName, spec: it.spec || '',
                quantity: it.qty, locationId: printLoc, vendor: rcpVendor,
                batchNo: batchNo, expiryDate: it.expiryDate || '', company: '崇文'
            });
            const palletRef = db.collection('pallets').doc();
            batch.set(palletRef, {
                palletId: pid,
                productName: it.productName,
                spec: it.spec || '',
                quantity: it.qty,
                locationId: itemLoc,
                vendor: rcpVendor,
                batchNo: batchNo,
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

        // 儲存插單資料供印單按鈕使用
        lastInboundLabels = labels;

        // 記錄廠商以供下次使用
        if (!recentVendors.includes(rcpVendor)) recentVendors.unshift(rcpVendor);

        // 重置
        rcpItems = [];
        rcpVendor = '';
        renderReceivePage();

        // 顯示成功＋印單按鈕
        $('receive-body').insertAdjacentHTML('afterbegin',
            '<div class="scan-result ok" style="margin:12px 16px;display:flex;align-items:center;gap:12px">' +
                '<span>✓ 入庫完成！庫存已更新。</span>' +
                '<button onclick="printLastInboundLabels()" style="background:#fff;color:#16a34a;border:2px solid #16a34a;border-radius:8px;padding:6px 14px;font-size:14px;font-weight:bold;white-space:nowrap">🖨️ 印插單</button>' +
            '</div>');
        setTimeout(function() {
            const el = document.querySelector('#receive-body .scan-result');
            if (el) el.remove();
        }, 8000);

    } catch (e) {
        console.error(e);
        alert('入庫失敗：' + e.message);
    } finally {
        if (btn) btn.disabled = false;
    }
};

window.printLastInboundLabels = function() {
    if (!lastInboundLabels.length) { alert('沒有可印的插單'); return; }
    printSimpleInboundLabels(lastInboundLabels);
};

function printSimpleInboundLabels(labels) {
    var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>棧板插單</title>';
    html += '<style>';
    html += '@page { size: A4 landscape; margin: 0; }';
    html += '* { margin: 0; padding: 0; box-sizing: border-box; }';
    html += 'body { font-family: Microsoft JhengHei, Arial, sans-serif; background: #fff; }';
    html += '.label-page { width: 297mm; height: 210mm; padding: 5mm; box-sizing: border-box; page-break-after: always; overflow: hidden; }';
    html += '.label-page:last-of-type { page-break-after: auto; }';
    html += '.label-content { width: 100%; height: 100%; border: 3px solid #000; display: flex; flex-direction: column; overflow: hidden; }';
    html += '.row-1 { height: 85mm; display: flex; border-bottom: 3px solid #000; }';
    html += '.qr-section { width: 90mm; border-right: 2px solid #000; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 3mm; }';
    html += '.qr-box { width: 80mm; height: 80mm; }';
    html += '.qr-box svg { width: 100% !important; height: 100% !important; }';
    html += '.pallet-no { font-size: 14px; font-weight: bold; color: #333; margin-top: 2mm; text-align: center; }';
    html += '.name-section { flex: 1; display: flex; align-items: center; justify-content: center; padding: 5mm; overflow: hidden; }';
    html += '.product-name { font-weight: 900; text-align: center; line-height: 1.1; word-break: break-word; }';
    html += '.row-2 { height: 40mm; display: flex; align-items: center; justify-content: center; border-bottom: 3px solid #000; padding: 3mm 8mm; overflow: hidden; }';
    html += '.product-spec { font-weight: 700; color: #333; text-align: center; line-height: 1.2; word-break: break-word; }';
    html += '.row-3 { height: 45mm; display: flex; border-bottom: 3px solid #000; }';
    html += '.cell-qty { width: 20%; border-right: 2px solid #000; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 2mm; }';
    html += '.cell-batch { width: 40%; border-right: 2px solid #000; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 2mm; }';
    html += '.cell-vendor { width: 40%; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 2mm; }';
    html += '.cell-label { font-size: 14px; color: #666; margin-bottom: 2mm; }';
    html += '.cell-value { font-weight: 900; white-space: nowrap; }';
    html += '.cell-value.qty { color: #dc2626; font-size: 64px; }';
    html += '.cell-value.batch { font-size: 48px; }';
    html += '.cell-value.vendor { font-size: 56px; }';
    html += '.row-4 { flex: 1; display: flex; align-items: center; padding: 3mm 8mm; gap: 15mm; }';
    html += '.location-box { background: #000; color: #fff; font-size: 64px; font-weight: 900; padding: 4mm 15mm; }';
    html += '.company-box { font-size: 64px; font-weight: 700; color: #333; }';
    html += '.no-print { text-align: center; padding: 20px; background: #f0f0f0; }';
    html += '.no-print button { padding: 15px 40px; font-size: 18px; border: none; cursor: pointer; font-weight: bold; margin: 0 10px; border-radius: 8px; }';
    html += '.btn-print { background: #059669; color: white; }';
    html += '.btn-close { background: #666; color: white; }';
    html += '@media print { .no-print { display: none !important; } }';
    html += '</style></head><body>';

    labels.forEach(function(label, idx) {
        var productName = label.productName || '-';
        var specText = label.spec || '0';
        var nameFontSize = 144;
        if (productName.length > 6) nameFontSize = 72;
        if (productName.length > 12) nameFontSize = 56;
        if (productName.length > 18) nameFontSize = 42;
        var specFontSize = 120;
        if (specText.length > 8) specFontSize = 100;
        if (specText.length > 16) specFontSize = 60;
        if (specText.length > 24) specFontSize = 44;

        html += '<div class="label-page"><div class="label-content">';
        html += '<div class="row-1">';
        html += '<div class="qr-section"><div id="qrcode-' + idx + '" class="qr-box"></div>';
        html += '<div class="pallet-no">' + label.palletId + '</div></div>';
        html += '<div class="name-section"><div class="product-name" style="font-size:' + nameFontSize + 'px;">' + label.productName + '</div></div>';
        html += '</div>';
        html += '<div class="row-2"><div class="product-spec" style="font-size:' + specFontSize + 'px;">' + specText + '</div></div>';
        html += '<div class="row-3">';
        html += '<div class="cell-qty"><div class="cell-label">數量</div><div class="cell-value qty">' + label.quantity + '</div></div>';
        html += '<div class="cell-batch"><div class="cell-label">批號</div><div class="cell-value batch">' + (label.batchNo || '0') + '</div></div>';
        html += '<div class="cell-vendor"><div class="cell-label">廠商</div><div class="cell-value vendor">' + (label.vendor || '0') + '</div></div>';
        html += '</div>';
        html += '<div class="row-4">';
        html += '<div class="location-box">' + label.locationId + '</div>';
        html += '<div class="company-box">' + label.company + '</div>';
        html += '</div>';
        html += '</div></div>';
    });

    html += '<div class="no-print">';
    html += '<button class="btn-print" onclick="window.print()">🖨️ 列印全部 ' + labels.length + ' 張插單</button>';
    html += '<button class="btn-close" onclick="window.close()">關閉</button>';
    html += '</div>';

    html += '<script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"><\/script>';
    html += '<script>window.onload = function() {';
    labels.forEach(function(label, idx) {
        html += 'try { var qr' + idx + ' = qrcode(0,"L"); qr' + idx + '.addData("' + label.palletId + '"); qr' + idx + '.make(); document.getElementById("qrcode-' + idx + '").innerHTML = qr' + idx + '.createSvgTag(8,0); } catch(e) {}';
    });
    html += '};<\/script>';
    html += '</body></html>';

    var w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
    else { alert('請允許彈出視窗，或改用電腦印插單'); }
}
