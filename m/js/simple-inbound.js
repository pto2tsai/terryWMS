// ============================================================
// m/js/simple-inbound.js — 驗收入庫（不需條碼）
// 新增驗收：選廠商 → 加品項（品名+規格+數量）→ 完成 → 建棧板記錄＋入庫紀錄
// 待辦任務：顯示電腦交辦的 inboundTasks，確認儲位後入帳
// ============================================================

let rcpVendor = '';
let rcpItems = [];
let recentVendors = [];
let rcpTab = 'receive'; // 'receive' | 'tasks'
let rcpCurrentTask = null;

window.pageInit.receive = async function() {
    rcpVendor = '';
    rcpItems = [];
    rcpTab = 'receive';
    rcpCurrentTask = null;
    recentVendors = await loadRecentVendors();
    renderReceivePage();
};

window.dataHooks.inboundTasks.push(function() {
    // 更新驗收入庫選單卡的待辦數字
    var badge = document.getElementById('badge-receive-tasks');
    if (badge) {
        var n = openInboundTasks().length;
        badge.textContent = n > 0 ? n : '';
        badge.style.display = n > 0 ? '' : 'none';
    }
    if (window.currentPage === 'receive') renderReceivePage();
});

async function loadRecentVendors() {
    try {
        const snap = await db.collection('simpleInbound')
            .orderBy('createdAt', 'desc').limit(50).get();
        const seen = new Set();
        snap.docs.forEach(d => { if (d.data().vendor) seen.add(d.data().vendor); });
        return Array.from(seen);
    } catch (e) { return []; }
}

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

function openInboundTasks() {
    return (window.inboundTasks || []).filter(window.isTaskOpen)
        .sort(function(a, b) { return String(a.createdAt || '').localeCompare(String(b.createdAt || '')); });
}

// ── 標籤列 ────────────────────────────────────────────────────

function tabBarHtml() {
    const tasks = openInboundTasks();
    const badge = tasks.length > 0
        ? ' <span style="background:#ef4444;color:#fff;border-radius:10px;padding:1px 7px;font-size:12px;font-weight:700">' + tasks.length + '</span>'
        : '';
    return '<div style="display:flex;gap:0;border-bottom:2px solid #1e293b;margin-bottom:0">' +
        '<button style="flex:1;padding:12px 0;background:' + (rcpTab === 'receive' ? '#1e293b' : 'transparent') + ';color:' + (rcpTab === 'receive' ? '#f0f0f0' : '#94a3b8') + ';border:none;font-size:15px;font-weight:700;cursor:pointer;border-bottom:' + (rcpTab === 'receive' ? '2px solid #3b82f6' : '2px solid transparent') + '" onclick="setRcpTab(\'receive\')">新增驗收</button>' +
        '<button style="flex:1;padding:12px 0;background:' + (rcpTab === 'tasks' ? '#1e293b' : 'transparent') + ';color:' + (rcpTab === 'tasks' ? '#f0f0f0' : '#94a3b8') + ';border:none;font-size:15px;font-weight:700;cursor:pointer;border-bottom:' + (rcpTab === 'tasks' ? '2px solid #3b82f6' : '2px solid transparent') + '" onclick="setRcpTab(\'tasks\')">待辦任務' + badge + '</button>' +
    '</div>';
}

window.setRcpTab = function(tab) {
    rcpTab = tab;
    rcpCurrentTask = null;
    renderReceivePage();
};

// ── 主畫面 ──────────────────────────────────────────────────

function renderReceivePage() {
    const houseLabel = myHouseLabel();
    const houseOk = !!(window.myHouse && window.myHouse());

    let content;
    if (rcpTab === 'tasks') {
        content = renderTasksTabHtml();
    } else {
        const itemsHtml = rcpItems.length === 0
            ? '<div style="padding:32px 0;text-align:center;color:#94a3b8">還沒有品項，按下方「＋ 加品項」</div>'
            : rcpItems.map(function(it, i) {
                return '<div class="rcp-item">' +
                    '<div class="rcp-item-name">' + esc(it.productName) + ' <span class="rcp-item-spec">' + esc(it.spec) + '</span></div>' +
                    '<div class="rcp-item-qty">' + it.qty + ' 件</div>' +
                    '<button class="rcp-del" onclick="rcpRemoveItem(' + i + ')" aria-label="刪除">✕</button>' +
                '</div>';
            }).join('');

        content =
            '<div class="rcp-header-row">' +
                '<div class="rcp-vendor-wrap">' +
                    '<label class="rcp-label">廠商</label>' +
                    renderVendorSelector() +
                '</div>' +
                '<button class="pk-chip" onclick="window.switchHouse && window.switchHouse()">📍 ' + esc(houseLabel) + ' ⇄</button>' +
            '</div>' +
            '<div class="rcp-items">' + itemsHtml + '</div>' +
            '<div class="rcp-actions">' +
                '<button class="pk-short" style="flex:1" onclick="openProductPicker()">＋ 加品項</button>' +
                '<button class="pk-go" style="flex:2;' + (rcpItems.length === 0 || !rcpVendor || !houseOk ? 'opacity:0.4;pointer-events:none' : '') + '" onclick="submitReceive()">✓ 完成入庫</button>' +
            '</div>';
    }

    $('receive-body').innerHTML = tabBarHtml() + '<div style="padding:0 0 120px">' + content + '</div>';
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

// ── 待辦任務分頁 ─────────────────────────────────────────────

function renderTasksTabHtml() {
    if (rcpCurrentTask) return renderTaskDetailHtml(rcpCurrentTask);
    const tasks = openInboundTasks();
    if (tasks.length === 0) {
        return '<div style="padding:48px 16px;text-align:center;color:#94a3b8">目前沒有待入庫任務<br><span style="font-size:13px">電腦「交給堆高機」後會在這裡出現</span></div>';
    }
    return '<div style="padding:8px 0">' + tasks.map(function(t) {
        return '<div class="rcp-item" onclick="rcpSelectTask(\'' + esc(t.id) + '\')" style="cursor:pointer">' +
            '<div class="rcp-item-name">' + esc(t.productName) + ' <span class="rcp-item-spec">' + esc(t.spec || '') + '</span></div>' +
            '<div style="font-size:13px;color:#94a3b8;margin-top:2px">' + esc(t.orderNo || t.palletId || '-') + (t.batchNo ? ' · ' + esc(t.batchNo) : '') + '</div>' +
            '<div class="rcp-item-qty">' + esc(String(t.quantity)) + ' 件</div>' +
        '</div>';
    }).join('') + '</div>';
}

function renderTaskDetailHtml(t) {
    const houseLabel = myHouseLabel();
    return '<div style="padding:16px 16px 0">' +
        '<div style="font-size:22px;font-weight:900;color:#f0f0f0;margin-bottom:4px">' + esc(t.productName) + (t.spec ? ' <span style="font-size:16px;color:#94a3b8">' + esc(t.spec) + '</span>' : '') + '</div>' +
        '<div style="font-size:13px;color:#94a3b8;margin-bottom:2px">單號：' + esc(t.orderNo || t.palletId || '-') + '</div>' +
        '<div style="font-size:13px;color:#94a3b8;margin-bottom:8px">批號：' + esc(t.batchNo || '-') + '</div>' +
        '<div style="font-size:28px;color:#f87171;font-weight:900;margin-bottom:12px">數量：' + esc(String(t.quantity)) + ' 件</div>' +
        (t.locationId ? '<div style="font-size:13px;color:#64748b;margin-bottom:12px">📍 指定儲位：<strong style="color:#93c5fd">' + esc(t.locationId) + '</strong></div>' : '') +
        '<div style="font-size:14px;color:#94a3b8;margin-bottom:8px">放到哪個儲位？（留空預設 ' + esc(houseLabel) + '）</div>' +
        '<input id="rcp-task-loc" class="scan-input" placeholder="掃描或輸入儲位（可留空）" autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false">' +
        '<div id="rcp-task-result" class="scan-result" style="margin:8px 0"></div>' +
        '<div class="row-btns" style="margin-top:12px">' +
            '<button class="pk-short" style="flex:1" onclick="rcpCurrentTask=null;renderReceivePage()">← 返回</button>' +
            '<button class="pk-go" style="flex:2" id="rcp-task-confirm-btn" onclick="rcpConfirmTaskLoc()">✓ 確認入庫</button>' +
        '</div>' +
    '</div>';
}

window.rcpSelectTask = function(id) {
    const t = (window.inboundTasks || []).find(function(x) { return x.id === id; });
    if (!t) return;
    rcpCurrentTask = t;
    renderReceivePage();
    setTimeout(function() { var el = $('rcp-task-loc'); if (el) el.focus(); }, 100);
};

async function findRcpOrderId(task) {
    if (task.orderId) return task.orderId;
    if (!task.orderNo) return null;
    const snap = await db.collection('inboundOrders').where('docNo', '==', task.orderNo).limit(1).get();
    return snap.empty ? null : snap.docs[0].id;
}

window.rcpConfirmTaskLoc = async function() {
    const task = rcpCurrentTask;
    if (!task) return;
    const raw = ($('rcp-task-loc') && $('rcp-task-loc').value.trim()) || '';
    const house = window.myHouse ? window.myHouse() : '';
    if (!house) { alert('請先選倉庫'); return; }

    let loc;
    if (raw) {
        loc = window.formatLocationId ? window.formatLocationId(raw) : raw.trim().toUpperCase();
        if (!window.isValidStorageLocation(loc)) {
            var res = $('rcp-task-result');
            if (res) { res.className = 'scan-result err'; res.textContent = '❌ 儲位格式不正確：' + loc; }
            return;
        }
    } else {
        loc = house + '庫';
    }

    const btn = $('rcp-task-confirm-btn');
    if (btn) btn.disabled = true;

    const who = window.currentUser ? window.currentUser.email : '';
    const taskRef = db.collection('inboundTasks').doc(task.id);

    function showTaskErr(msg) {
        var res = $('rcp-task-result');
        if (res) { res.className = 'scan-result err'; res.textContent = msg; }
        if (btn) btn.disabled = false;
    }

    function taskDone(msg) {
        rcpCurrentTask = null;
        rcpTab = 'tasks';
        renderReceivePage();
        $('receive-body').insertAdjacentHTML('afterbegin',
            '<div class="scan-result ok" style="margin:12px 16px">' + msg + '</div>');
        setTimeout(function() { var el = document.querySelector('#receive-body .scan-result'); if (el) el.remove(); }, 5000);
    }

    try {
        const orderId = await findRcpOrderId(task);
        if (!orderId) throw Object.assign(new Error('入庫單已不存在（可能已被刪除）'), { code: 'ORDER_MISSING' });
        await window.postInboundOrderTx(orderId, loc, { taskRef: taskRef, note: '驗收入庫確認' });
        taskDone('✅ ' + task.productName + ' ' + task.quantity + ' 件已入庫 @ ' + loc);
    } catch (e) {
        if (e.code === 'ALREADY_POSTED') {
            try {
                await taskRef.update({ status: 'done', confirmedAt: new Date().toISOString(), confirmedBy: who, confirmedLocation: loc });
                taskDone('✅ 已上架（此單電腦已入帳）@ ' + loc);
            } catch (e2) { showTaskErr('❌ ' + e2.message); }
        } else if (e.code === 'ORDER_CANCELLED') {
            await taskRef.update({ status: 'cancelled', note: '入庫單已取消' }).catch(function() {});
            showTaskErr('❌ ' + e.message);
        } else if (e.code === 'ORDER_MISSING') {
            if (btn) btn.disabled = false;
            // 入庫單已經不在了（被取消）：任務直接拿掉，不用再問
            await taskRef.update({ status: 'cancelled', confirmedAt: new Date().toISOString(), confirmedBy: who, note: '入庫單已不存在' }).catch(function() {});
            taskDone('這張入庫單已經取消，任務已拿掉');
        } else {
            showTaskErr('❌ 入庫失敗：' + e.message);
        }
    }
};

// ── 品項選擇器 ──────────────────────────────────────────────

let pickerQuery = '';
let pickerStep = 'list';
let pickerSelected = null;

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
    rcpItems.push({ productName: pickerSelected.productName, spec: pickerSelected.spec, qty: qty, batchNo: '', expiryDate: '', locationId: '' });
    closePicker();
    renderReceivePage();
};

// ── 送出 ──────────────────────────────────────────────────

let lastInboundLabels = [];

window.submitReceive = async function() {
    const house = window.myHouse ? window.myHouse() : '';
    if (!house) { alert('請先選倉庫'); return; }
    if (!rcpVendor || rcpVendor === '__new__') { alert('請選廠商'); return; }
    if (rcpItems.length === 0) { alert('請加品項'); return; }

    const btn = document.querySelector('#receive-body .pk-go');
    if (btn) btn.disabled = true;

    try {
        const now = new Date();
        const locId = house + '庫';
        const batch = db.batch();

        // simpleInbound 記錄（會計對帳用）
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

        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        const autoBatchNo = 'IN-' + dateStr;
        const nullLoc = house + '-0-00-00';
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

            // 入庫稽核記錄
            const logRef = db.collection('inventoryLogs').doc();
            batch.set(logRef, window.buildInventoryLogEntry({
                type: 'inbound',
                company: '崇文',
                productName: it.productName,
                spec: it.spec || '',
                quantity: it.qty,
                quantityChange: it.qty,
                vendor: rcpVendor,
                locationId: itemLoc,
                batchNo: batchNo,
                palletId: pid,
                note: '驗收入庫 - ' + rcpVendor,
                orderId: rcpRef.id
            }));
        });

        await batch.commit();

        lastInboundLabels = labels;
        if (!recentVendors.includes(rcpVendor)) recentVendors.unshift(rcpVendor);

        rcpItems = [];
        rcpVendor = '';
        renderReceivePage();

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
