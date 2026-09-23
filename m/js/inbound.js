// ============================================================
// m/js/inbound.js — 入庫任務（桌機建立入庫單時發布到 inboundTasks）
// 堆高機把貨放上儲位 → 掃儲位確認 → 直接入帳（建立棧板、入庫單完成、任務完成，同一筆交易）
// 放的儲位和指定的不同也可以（會先確認），以實際放的儲位入帳。
// ============================================================
let currentTask = null;

window.pageInit.inbound = function() {
    resetInboundTask();
    renderInboundTasks();
};
window.dataHooks.inboundTasks.push(function() { if (window.currentPage === 'inbound') renderInboundTasks(); });

function openTasks() {
    return window.inboundTasks.filter(window.isTaskOpen)
        .sort(function(a, b) { return String(a.createdAt || '').localeCompare(String(b.createdAt || '')); });
}

function renderInboundTasks() {
    const tasks = openTasks();
    $('inbound-count').innerText = tasks.length + ' 筆待入庫';
    const list = $('inbound-list');
    if (tasks.length === 0) {
        list.innerHTML = '<div class="empty-state"><i class="fa-solid fa-inbox"></i><p>目前沒有待入庫任務</p></div>';
        return;
    }
    list.innerHTML = tasks.map(function(t) {
        const sel = currentTask && currentTask.id === t.id;
        return '<div class="list-item clickable' + (sel ? ' completed' : '') + '" onclick="selectInboundTask(\'' + esc(t.id) + '\')">' +
            '<div class="item-row"><span class="item-location">' + esc(t.locationId || '待指定') + '</span>' +
            '<span class="item-status pending">' + (t.approvalStatus === 'pending' ? '待核准' : '點選執行') + '</span></div>' +
            '<div class="item-product">' + esc(t.productName) + ' ' + esc(t.spec || '') + '</div>' +
            '<div class="item-row"><span class="item-detail">' + esc(t.palletId || t.orderNo || '-') + ' | ' + esc(t.batchNo || '-') + '</span>' +
            '<span class="item-qty">' + esc(t.quantity) + '</span></div></div>';
    }).join('');
}

// 掃棧板單（入庫單號）選任務
window.scanInboundTask = function() {
    const input = $('inbound-task-scan');
    const scanned = input.value.trim();
    if (!scanned) return;
    const m = findByScan(openTasks(), scanned, ['palletId', 'orderNo']);
    if (!m.item) {
        setResult('inbound-result', false, m.error ? '❌ ' + m.error : '❌ 找不到此單號的入庫任務：' + normCode(scanned));
        input.select();
        return;
    }
    input.value = '';
    selectInboundTask(m.item.id);
};

window.selectInboundTask = function(id) {
    const t = window.inboundTasks.find(function(x) { return x.id === id; });
    if (!t) { toast('找不到任務'); return; }
    currentTask = t;
    $('inbound-task-info').innerHTML = '<div class="info-grid">' +
        '<span class="k">品名</span><span class="v">' + esc(t.productName) + ' ' + esc(t.spec || '') + '</span>' +
        '<span class="k">單號</span><span class="v">' + esc(t.orderNo || t.palletId || '-') + '</span>' +
        '<span class="k">批號</span><span class="v">' + esc(t.batchNo || '-') + '</span>' +
        '<span class="k">數量</span><span class="v qty">' + esc(t.quantity) + ' 件</span>' +
        '<span class="k">放到</span><span class="v loc">' + esc(t.locationId || '待指定') + '</span></div>' +
        (t.approvalStatus === 'pending' ? '<div style="color:#fbbf24;font-size:13px;margin-top:8px">⚠️ 此單尚待主管／財務核准，仍可先上架</div>' : '');
    show('inbound-step1', false);
    show('inbound-step2', true);
    setResult('inbound-result', 'info', '📍 放到儲位後，掃描儲位標籤確認');
    renderInboundTasks();
    scanNext('inbound-loc-scan');
};

window.resetInboundTask = function() {
    currentTask = null;
    show('inbound-step1', true);
    show('inbound-step2', false);
    $('inbound-task-scan').value = '';
    $('inbound-loc-scan').value = '';
    clearResult('inbound-result');
    renderInboundTasks();
};

async function findInboundOrderId(task) {
    if (task.orderId) return task.orderId;
    if (!task.orderNo) return null;
    const snap = await db.collection('inboundOrders').where('docNo', '==', task.orderNo).limit(1).get();
    return snap.empty ? null : snap.docs[0].id;
}

window.confirmInboundLocation = async function() {
    const input = $('inbound-loc-scan');
    const raw = input.value.trim();
    if (!raw || !currentTask) return;
    const loc = window.formatLocationId(raw);
    if (!window.isValidStorageLocation(loc)) {
        setResult('inbound-result', false, '❌ 儲位格式不正確：' + loc + '\n請掃描儲位標籤（例：I-A-01-1F）');
        input.select();
        return;
    }
    const task = currentTask;
    const planned = String(task.locationId || '').toUpperCase();
    if (window.isValidStorageLocation(planned) && planned !== loc) {
        if (camScanner) await closeCameraScan();
        if (!confirm('放的儲位和指定的不同\n\n指定：' + planned + '\n實際：' + loc + '\n\n以實際儲位 ' + loc + ' 入帳？')) {
            setResult('inbound-result', 'info', '請放到 ' + planned + ' 後再掃一次');
            input.value = '';
            return;
        }
    }

    const taskRef = db.collection('inboundTasks').doc(task.id);
    const who = window.currentUser ? window.currentUser.email : '';
    try {
        const orderId = await findInboundOrderId(task);
        if (!orderId) {
            const e = new Error('入庫單已不存在（可能已被刪除）'); e.code = 'ORDER_MISSING'; throw e;
        }
        await window.postInboundOrderTx(orderId, loc, { taskRef: taskRef, note: '手機上架入帳' });
        setResult('inbound-result', true, '✅ ' + task.productName + ' ' + task.quantity + ' 件已入庫 @ ' + loc);
    } catch (e) {
        if (e.code === 'ALREADY_POSTED') {
            // 電腦已先入帳：棧板已存在，放的位置不同就移過去，任務結案
            try {
                const pid = (e.order && e.order.docNo) || task.palletId;
                const p = window.pallets.find(function(x) { return codeKey(x.palletId) === codeKey(pid); });
                if (p && p.locationId !== loc) await window.movePalletTx(palletRef(p), loc, { note: '手機上架（已入帳，更新儲位）' });
                await taskRef.update({ status: 'done', confirmedAt: new Date().toISOString(), confirmedBy: who, confirmedLocation: loc });
                setResult('inbound-result', true, '✅ 已上架 @ ' + loc + '（此單電腦已入帳' + (p && p.locationId !== loc ? '，儲位已更新' : '') + '）');
            } catch (e2) {
                setResult('inbound-result', false, '❌ ' + e2.message);
                return;
            }
        } else if (e.code === 'ORDER_MISSING') {
            if (camScanner) await closeCameraScan();
            if (confirm('此任務的入庫單已不存在（可能已取消）\n\n要把這個任務移除嗎？')) {
                await taskRef.update({ status: 'cancelled', confirmedAt: new Date().toISOString(), confirmedBy: who, note: '入庫單已不存在' });
                setResult('inbound-result', 'info', '已移除任務');
            } else {
                setResult('inbound-result', false, '❌ ' + e.message);
                return;
            }
        } else {
            setResult('inbound-result', false, '❌ 入庫失敗：' + e.message);
            return;
        }
    }
    // 回到任務清單，可以直接掃下一張棧板單
    currentTask = null;
    show('inbound-step1', true);
    show('inbound-step2', false);
    $('inbound-loc-scan').value = '';
    renderInboundTasks();
    scanNext('inbound-task-scan');
};
