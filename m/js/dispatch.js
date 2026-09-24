// ============================================================
// m/js/dispatch.js — 調度工單（桌機「發布到手機」的移板／併板工單）
// 掃到一板就以交易執行（確認棧板還在、更新儲位或合併數量、寫異動記錄）
// ============================================================
let currentDispatch = null;

window.pageInit.dispatch = function() {
    currentDispatch = null;
    renderDispatchOptions();
    $('dispatch-order-select').value = '';
    show('dispatch-scan-area', false);
    show('dispatch-actions', false);
    clearResult('dispatch-scan-result');
    renderDispatchList();
};

function renderDispatchOptions() {
    const select = $('dispatch-order-select');
    const keep = select.value;
    const list = window.dispatchOrders.filter(window.isDispatchOpen)
        .sort(function(a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
    select.innerHTML = '<option value="">' + (list.length ? '-- 請選擇（' + list.length + ' 張待執行）--' : '目前沒有待執行工單') + '</option>' +
        list.map(function(o) {
            return '<option value="' + esc(o.id) + '">' + esc(o.orderNo || o.id) + ' - ' + esc(o.productName || '') +
                '（' + (o.completedOps || []).length + '/' + o.operations.length + '）</option>';
        }).join('');
    if (keep && list.some(function(o) { return o.id === keep; })) select.value = keep;
}

window.dataHooks.dispatchOrders.push(function() {
    if (window.currentPage !== 'dispatch') return;
    renderDispatchOptions();
    if (!currentDispatch) return;
    const o = window.dispatchOrders.find(function(x) { return x.id === currentDispatch.id; });
    if (o) { currentDispatch = o; renderDispatchList(); }
});

window.loadDispatchOrder = async function() {
    const id = $('dispatch-order-select').value;
    clearResult('dispatch-scan-result');
    if (!id) {
        currentDispatch = null;
        show('dispatch-scan-area', false); show('dispatch-actions', false);
        renderDispatchList();
        return;
    }
    const snap = await db.collection('dispatchOrders').doc(id).get();
    if (!snap.exists) { alert('工單已不存在'); return window.pageInit.dispatch(); }
    currentDispatch = Object.assign({ id: snap.id }, snap.data());
    renderDispatchList();
    show('dispatch-scan-area', true);
    show('dispatch-actions', true);
    focusIfNoCamera('dispatch-scan');
};

function isMergeOp(op) { return op.type === '合併' || op.type === 'merge'; }

function renderDispatchList() {
    const list = $('dispatch-list');
    const ops = currentDispatch ? currentDispatch.operations || [] : [];
    const done = currentDispatch ? currentDispatch.completedOps || [] : [];
    $('dispatch-progress').innerText = done.length + '/' + ops.length;
    if (!currentDispatch) {
        list.innerHTML = '<div class="empty-state"><i class="fa-solid fa-clipboard-list"></i><p>請先選擇工單</p></div>';
        return;
    }
    if (ops.length === 0) {
        list.innerHTML = '<div class="empty-state"><i class="fa-solid fa-clipboard-list"></i><p>無調度項目</p></div>';
        return;
    }
    const pending = ops.filter(function(op) { return done.indexOf(op.id) < 0; });
    const finished = ops.filter(function(op) { return done.indexOf(op.id) >= 0; });
    list.innerHTML = pending.concat(finished).map(function(op) {
        const completed = done.indexOf(op.id) >= 0;
        const status = completed ? '<span class="item-status done">✓ 完成</span>' :
            '<span class="item-status pending">' + esc(isMergeOp(op) ? '併板' : '移板') + '</span>';
        return '<div class="list-item ' + (completed ? 'completed' : '') + '">' +
            '<div class="item-row"><span class="item-location">' + esc(op.from) + '</span>' + status + '</div>' +
            '<div class="item-product">' + esc(op.palletId || '-') + ' ' + (isMergeOp(op) ? '併入' : '→') + ' ' + esc(op.to) + '</div>' +
            '<div class="item-row"><span class="item-detail">' + esc(op.productName || op.reason || '') + '</span>' +
            '<span class="item-qty">' + esc(op.qty) + '</span></div></div>';
    }).join('');
}

// 合併的目標板：優先用文件 ID；舊工單沒有時，在目標儲位找同品名/規格/批號的一板
async function resolveMergeTarget(op, sourceRef) {
    if (op.toDocId || op.toPalletId) return window.resolvePalletRef(op.toDocId, op.toPalletId, op.to);
    const src = (await sourceRef.get()).data() || {};
    const candidates = window.pallets.filter(function(p) {
        return p.locationId === op.to && p.id !== sourceRef.id &&
            p.productName === src.productName && (p.spec || '') === (src.spec || '') && (p.batchNo || '') === (src.batchNo || '');
    });
    if (candidates.length !== 1) throw new Error('目標儲位 ' + op.to + ' 找不到唯一的合併目標，請在電腦確認');
    return db.collection('pallets').doc(candidates[0].id);
}

window.confirmDispatchScan = async function() {
    const input = $('dispatch-scan');
    const scanned = input.value.trim();
    if (!scanned || !currentDispatch) return;
    const done = currentDispatch.completedOps || [];
    const pending = (currentDispatch.operations || []).filter(function(o) { return done.indexOf(o.id) < 0; });
    let match = findByScan(pending, scanned, ['palletId']);
    if (!match.item && !match.error) {
        const loc = window.formatLocationId(scanned);
        const here = pending.filter(function(o) { return codeKey(o.from) === codeKey(loc); });
        if (here.length === 1) match = { item: here[0] };
        else if (here.length > 1) match = { item: null, error: '儲位 ' + loc + ' 有 ' + here.length + ' 項，請掃板號' };
    }
    const op = match.item;
    if (!op) {
        setResult('dispatch-scan-result', false, match.error ? '❌ ' + match.error : '❌ 不在此工單：' + normCode(scanned));
        input.select();
        return;
    }

    try {
        const note = '手機調度工單 ' + (currentDispatch.orderNo || '') + (op.reason ? '：' + op.reason : '');
        const sourceRef = await window.resolvePalletRef(op.docId, op.palletId, op.from);
        // 同一筆交易：確認棧板還在工單上的儲位、這一項沒被別台手機做過，搬完同時標記完成
        const txOpts = { expectFrom: op.from, dispatch: { ref: db.collection('dispatchOrders').doc(currentDispatch.id), opId: op.id } };
        if (isMergeOp(op)) {
            const targetRef = await resolveMergeTarget(op, sourceRef);
            await window.mergePalletsConfirm(sourceRef, targetRef, { note: note }, txOpts);
        } else {
            await window.movePalletTx(sourceRef, op.to, { note: note }, txOpts);
        }
        currentDispatch.completedOps = done.concat([op.id]);
        const left = pending.length - 1;
        setResult('dispatch-scan-result', true, '✓ ' + (isMergeOp(op) ? '併板' : '移板') + '：' + op.from + ' → ' + op.to + (left ? '　還剩 ' + left + ' 項' : '　🎉 全部完成'));
    } catch (e) {
        console.error(e);
        if (e.code === 'OP_DONE' && currentDispatch.completedOps.indexOf(op.id) < 0) currentDispatch.completedOps = done.concat([op.id]);
        setResult('dispatch-scan-result', false, '❌ ' + e.message);
        renderDispatchList();
        return;
    }
    renderDispatchList();
    input.value = '';
    focusIfNoCamera('dispatch-scan');
};

window.completeDispatchOrder = async function() {
    const ops = currentDispatch ? currentDispatch.operations || [] : [];
    const done = currentDispatch ? currentDispatch.completedOps || [] : [];
    if (done.length === 0) { alert('尚未執行任何操作'); return; }
    let msg = '完成工單？\n\n已執行：' + done.length + '/' + ops.length;
    if (done.length < ops.length) msg += '\n未執行的 ' + (ops.length - done.length) + ' 項不做了';
    if (!confirm(msg)) return;
    try {
        await db.collection('dispatchOrders').doc(currentDispatch.id).update({
            status: done.length >= ops.length ? 'completed' : 'partial',
            completedAt: new Date().toISOString()
        });
        alert('✅ 工單完成！');
        goBack();
    } catch (e) {
        alert('❌ 更新失敗：' + e.message);
    }
};
