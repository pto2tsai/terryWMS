// ============================================================
// js/shared/picking-list.js — 依波次彙總產生揀貨清單（桌機版與手機版共用）
// 先進先出（效期早的先揀），同品項依效期排序；庫存不足的項目標記 shortage
// 不揀：已過期的板、品管留置（V-QC）與業務保留（V-SALES）儲位的板
// 崇文／八方的庫存可以互相調用，揀貨項目帶 company 讓現場看得出是哪家的貨
// 寄倉（已賣給客戶、寄放在倉庫）的件數保留，不分給別人的訂單；
// 寄倉客戶自己的訂單（ERP 開單提貨）可以揀自己的寄倉貨，波次完成時自動扣寄倉件數
// ============================================================

// 寄倉保留：每板保留幾件 { 棧板文件 ID: 件數 }
// 先扣寄倉登記的那個儲位上同品名／規格／批號的板，不夠再扣其他同批的板（效期晚的先扣，早的留給出貨）
window.consignReserve = function(pallets, consignments) {
    const reserve = {};
    (consignments || []).forEach(c => {
        if (c.status && c.status !== 'active') return;
        if (c.source && c.source !== 'internal') return;
        let left = parseFloat(c.remainingQty) || 0;
        if (left <= 0) return;
        const same = p => (p.productName || '') === (c.productName || '') && (p.spec || '') === (c.spec || '') &&
            (!c.batchNo || (p.batchNo || '') === c.batchNo);
        const exp = p => window.normalizeDateValue(p.expiryDate || p.expDate) || '9999-12-31';
        const cands = pallets.filter(same).sort((a, b) => {
            const la = c.locationId && a.locationId === c.locationId ? 0 : 1, lb = c.locationId && b.locationId === c.locationId ? 0 : 1;
            return la - lb || exp(b).localeCompare(exp(a));
        });
        cands.forEach(p => {
            if (left <= 0) return;
            const free = (parseFloat(p.quantity) || 0) - (reserve[p.id] || 0);
            const take = Math.min(free, left);
            if (take > 0) { reserve[p.id] = (reserve[p.id] || 0) + take; left -= take; }
        });
    });
    return reserve;
};

// 客戶名稱比對：去空白後相同，或一方包含另一方（「海霸王」／「海霸王股份有限公司」）
window.consignCustomerMatch = function(a, b) {
    a = String(a || '').replace(/\s+/g, ''); b = String(b || '').replace(/\s+/g, '');
    return !!a && !!b && (a === b || a.includes(b) || b.includes(a));
};

// 波次裡哪些訂單是寄倉客戶來提自己的貨：[{ id, customer, orderNo, productName, spec, qty }]
window.consignWaveUse = function(wave, consignments) {
    const left = {};
    const list = (consignments || []).filter(c => (!c.status || c.status === 'active') && (!c.source || c.source === 'internal') &&
        (parseFloat(c.remainingQty) || 0) > 0);
    list.forEach(c => { left[c.id] = parseFloat(c.remainingQty) || 0; });
    const uses = [];
    (wave.summary || []).forEach(item => {
        const spec = item.spec || '';
        (item.orders || []).forEach(o => {
            let need = parseFloat(o.quantity) || 0;
            list.forEach(c => {
                if (need <= 0 || !(left[c.id] > 0)) return;
                const cs = c.spec || '';
                if ((c.productName || '') !== item.productName) return;
                if (spec !== '' && cs !== '' && !cs.includes(spec) && !spec.includes(cs)) return;
                if (!window.consignCustomerMatch(o.customer, c.customer)) return;
                const take = Math.min(need, left[c.id]);
                left[c.id] -= take; need -= take;
                uses.push({ id: c.id, customer: c.customer, orderNo: o.orderNo || '', productName: item.productName, spec: spec, qty: take });
            });
        });
    });
    return uses;
};

// 練習模式（settings/practice.enabled）：還沒有儲位、庫存不準的時候用
// 揀貨單照訂單數量列出（不分配棧板、不標缺貨），完成波次不扣庫存；波次、訂單、分貨標籤、看板照常
window.isPracticeMode = function() { return window.wmsPractice === true; };
window.PRACTICE_LOC = '照訂單揀';
window.watchPracticeMode = function(onChange) {
    return window.db.collection('settings').doc('practice').onSnapshot(function(d) {
        window.wmsPractice = !!(d.exists && d.data().enabled === true);
        if (onChange) onChange(window.wmsPractice);
    }, function() {});
};

// 這些儲位的貨不能拿去出貨
window.isHoldLocation = function(loc) { return /^V-(QC|SALES)/.test(String(loc || '').toUpperCase()); };

// 揀貨記錄：每揀一項（或放回一項）就記下實際件數和哪一板，之後鼎新改單重算清單時，已經揀的不會被改掉
// wave.pickLog = [{ id, qty, key, type: 'pick'|'return', palletId, docId, locationId, productName, spec, batchNo, expDate, company }]
window.pickLogEntry = function(item) {
    return JSON.parse(JSON.stringify({
        id: item.id, qty: parseFloat(item.pickQty) || 0, key: item.key, type: item.type === 'return' ? 'return' : 'pick',
        palletId: item.palletId || '', docId: item.docId || '', locationId: item.locationId || '',
        productName: item.productName || '', spec: item.spec || '', batchNo: item.batchNo || '', expDate: item.expDate || '', company: item.company || ''
    }));
};
// 這個波次有沒有完整的揀貨記錄（新波次都有；改版前就開始揀的舊波次沒有，照舊方式算）
window.waveHasPickLog = function(wave) {
    const log = wave.pickLog;
    if (!Array.isArray(log)) return !(wave.completedItems || []).length;
    return (wave.completedItems || []).every(id => log.some(e => e.id === id));
};

window.buildWavePickingList = function(wave, pallets, consignments) {
    const pickingList = [];
    const useLog = window.waveHasPickLog(wave);
    const log = useLog ? (wave.pickLog || []) : [];
    const takenOn = {};   // 每一板已經被這個波次揀走（還沒扣庫存）的件數
    log.forEach(e => { const k = e.docId || e.palletId; takenOn[k] = (takenOn[k] || 0) + (e.type === 'return' ? -e.qty : e.qty); });
    const usedIds = {};
    log.forEach(e => { usedIds[e.id] = true; });
    const shortByKey = {};   // 現場回報不夠的件數（wave.shortLog）
    (wave.shortLog || []).forEach(e => { shortByKey[e.key] = (shortByKey[e.key] || 0) + (parseFloat(e.qty) || 0); });
    const uniqueId = base => { let id = base, n = 2; while (usedIds[id]) id = base + '#' + (n++); usedIds[id] = true; return id; };
    const today = new Date().toLocalYMD();
    // 寄倉客戶自己的訂單要提的件數不保留（讓他的訂單揀得到）
    const consigns = consignments || window.consignmentData || [];
    const own = {};
    window.consignWaveUse(wave, consigns).forEach(u => { own[u.id] = (own[u.id] || 0) + u.qty; });
    const reserve = window.consignReserve(pallets, consigns.map(c => own[c.id] ? Object.assign({}, c, { remainingQty: (parseFloat(c.remainingQty) || 0) - own[c.id] }) : c));

    // 鼎新把某個品項整個刪掉，但已經揀了：也要列出來（需要 0 件 → 全部放回）
    const summaryItems = (wave.summary || []).slice();
    log.forEach(e => {
        if (!summaryItems.some(sm => (sm.productName + '|||' + (sm.spec || '')) === e.key)) {
            summaryItems.push({ productName: e.productName, spec: e.spec, totalQty: 0, orders: [] });
        }
    });

    summaryItems.forEach(item => {
        // 冷藏、包材、費用等不從倉庫揀（沒有庫存），不列入揀貨也不算缺貨
        if (typeof window.isExcludedFromPickingList === 'function' && window.isExcludedFromPickingList(item.productName)) return;
        let needed = item.totalQty;
        const productName = item.productName;
        const spec = item.spec || '';
        const key = productName + '|||' + spec;

        // 已經揀的（有記錄）：照記錄列出來、打勾，件數不會因為重算而改變
        if (useLog) {
            const mine = log.filter(e => e.key === key);
            let net = 0;
            const netOn = {};
            mine.forEach(e => {
                const q = e.type === 'return' ? -e.qty : e.qty;
                net += q;
                netOn[e.docId || e.palletId] = (netOn[e.docId || e.palletId] || 0) + q;
                pickingList.push(Object.assign({}, e, { pickQty: e.qty, orders: item.orders, completed: true }));
            });
            needed = item.totalQty - net;
            // 揀多了（鼎新減量）：放回，從最後揀的那幾板放回去
            if (needed < 0) {
                let extra = -needed;
                mine.filter(e => e.type !== 'return').reverse().forEach(e => {
                    const k = e.docId || e.palletId;
                    const q = Math.min(extra, netOn[k] || 0);
                    if (q <= 0) return;
                    netOn[k] -= q; extra -= q;
                    pickingList.push({
                        id: uniqueId('return-' + e.palletId + '-' + productName), type: 'return', practice: !e.palletId,
                        docId: e.docId, palletId: e.palletId, company: e.company, locationId: e.locationId || window.PRACTICE_LOC,
                        productName: e.productName, spec: e.spec, batchNo: e.batchNo, expDate: e.expDate,
                        key: key, pickQty: q, orders: item.orders, completed: false
                    });
                });
                return;
            }
            if (needed === 0) return;
        }

        // 現場回報「不夠」的數量：不再叫人去揀，列一行缺貨（完成波次時照缺貨處理：訂單部分出貨、欠貨下次補）
        const shortQty = Math.min(needed, shortByKey[key] || 0);
        if (shortQty > 0) {
            needed -= shortQty;
            pickingList.push({
                id: 'short-' + key, palletId: '-', locationId: '⚠️ 現場不夠', note: '現場回報不夠 ' + shortQty + ' 件',
                productName: productName, spec: spec, batchNo: '', key: key, pickQty: shortQty, availableQty: 0,
                orders: item.orders, completed: false, shortage: true, fieldShort: true
            });
            if (needed <= 0) return;
        }

        // 練習模式：不看庫存，照訂單數量列一行（人自己去找貨）
        if (window.isPracticeMode()) {
            if (needed > 0) {
                pickingList.push({
                    id: useLog ? uniqueId('practice-' + key) : 'practice-' + key, practice: true,
                    docId: '', palletId: '', company: '', locationId: window.PRACTICE_LOC,
                    productName: productName, spec: spec, batchNo: '', expDate: '',
                    key: key, pickQty: needed, availableQty: needed, orders: item.orders, completed: false
                });
            }
            return;
        }

        let expiredQty = 0, heldQty = 0, consignQty = 0;
        const matchingPallets = pallets.filter(p => {
            const pName = p.productName || '';
            const pSpec = p.spec || '';
            // 規格：訂單沒填規格時不限；有填時棧板規格不能是空的，且需互相包含
            const same = pName === productName &&
                (spec === '' || (pSpec !== '' && (pSpec.includes(spec) || spec.includes(pSpec))));
            if (!same) return false;
            const exp = window.normalizeDateValue(p.expiryDate || p.expDate);
            if (exp && exp < today) { expiredQty += parseInt(p.quantity) || 0; return false; }
            if (window.isHoldLocation(p.locationId)) { heldQty += parseInt(p.quantity) || 0; return false; }
            return true;
        }).sort((a, b) => {
            const dateA = window.normalizeDateValue(a.expiryDate || a.expDate) || '9999-12-31';
            const dateB = window.normalizeDateValue(b.expiryDate || b.expDate) || '9999-12-31';
            return dateA.localeCompare(dateB);
        });

        matchingPallets.forEach(pallet => {
            const reserved = reserve[pallet.id] || 0;
            if (needed <= 0) return;
            consignQty += reserved;

            const available = (parseInt(pallet.quantity) || 0) - reserved - (takenOn[pallet.id] || takenOn[pallet.palletId] || 0);
            const pick = Math.min(available, needed);

            if (pick > 0) {
                pickingList.push({
                    id: useLog ? uniqueId(pallet.palletId + '-' + item.productName) : pallet.palletId + '-' + item.productName,
                    docId: pallet.id || '',
                    palletId: pallet.palletId,
                    company: pallet.company || '',
                    totalWeight: parseFloat(pallet.totalWeight) || 0,
                    locationId: pallet.locationId,
                    productName: pallet.productName,
                    spec: pallet.spec || '',
                    batchNo: pallet.batchNo || '',
                    expDate: pallet.expDate || '',
                    key: key,
                    pickQty: pick,
                    availableQty: available,
                    orders: item.orders,  // 需要這個品項的訂單列表
                    completed: false
                });
                needed -= pick;
            }
        });

        if (needed > 0) {
            pickingList.push({
                id: 'shortage-' + item.productName,
                palletId: '-',
                locationId: '⚠️ 庫存不足',
                note: [expiredQty ? '過期 ' + expiredQty + ' 件未揀' : '', heldQty ? '留置／保留 ' + heldQty + ' 件未揀' : '', consignQty ? '寄倉保留 ' + consignQty + ' 件' : ''].filter(Boolean).join('、'),
                productName: item.productName,
                spec: item.spec || '',
                batchNo: '',
                key: key,
                pickQty: needed,
                availableQty: 0,
                orders: item.orders,
                completed: false,
                shortage: true
            });
        }
    });

    if (!useLog) {
        (wave.completedItems || []).forEach(itemId => {
            const item = pickingList.find(p => p.id === itemId);
            if (item) item.completed = true;
        });
    }

    pickingList.sort(function(a, b) {
        // 要放回的排最前面（先把多拿的放回去）
        if (a.type === 'return' && b.type !== 'return') return -1;
        if (a.type !== 'return' && b.type === 'return') return 1;
        if (a.shortage && !b.shortage) return 1;
        if (!a.shortage && b.shortage) return -1;

        // 儲位格式：倉-區-排-層（例如 I-A-01-3F）。面對面的兩區（A/B、C/D、E/F、G/H）共用一條主通道，
        // 沿通道走一趟兩邊一起揀：倉 → 通道 → 排 → 區（A 側、B 側）→ 層（低層先），即 IA01 → IB01 → IA02 → IB02…
        var parseLocation = function(loc) {
            var parts = String(loc || '').split('-');
            if (parts.length < 4) return { warehouse: 'Z', zone: 'Z', row: 999, level: 9 };
            return {
                warehouse: parts[0].toUpperCase(),
                zone: parts[1].toUpperCase(),
                row: parseInt(parts[2], 10) || 999,
                level: parseInt(parts[3], 10) || 9
            };
        };

        var locA = parseLocation(a.locationId);
        var locB = parseLocation(b.locationId);

        if (locA.warehouse !== locB.warehouse) return locA.warehouse.localeCompare(locB.warehouse);
        var aisle = function(z) { return z.length === 1 && z >= 'A' && z <= 'Z' ? Math.floor((z.charCodeAt(0) - 65) / 2) : 99; };
        if (aisle(locA.zone) !== aisle(locB.zone)) return aisle(locA.zone) - aisle(locB.zone);
        if (locA.row !== locB.row) return locA.row - locB.row;
        if (locA.zone !== locB.zone) return locA.zone.localeCompare(locB.zone);
        return locA.level - locB.level;
    });

    return pickingList;
};

// 每張訂單實際出多少、欠多少（完成波次、手機完成前的缺貨清單共用，兩邊一定一樣）
// 揀到的件數依彙總裡的訂單順序分給各訂單（先開單的先給）
// 回傳 { 訂單 ID: { entry, sent: [{productName, spec, qty}], back: [欠貨品項], any, short: [{productName, spec, want, got}] } }
window.waveOrderOutcomes = function(wave, pickingList) {
    const keyOf = (name, spec) => (name || '') + '|||' + (spec || '');
    const excluded = name => typeof window.isExcludedFromPickingList === 'function' && window.isExcludedFromPickingList(name);
    const pickedByKey = {};
    (pickingList || []).forEach(i => {
        if (!i.completed || i.shortage) return;
        const k = i.key || keyOf(i.productName, i.spec);
        pickedByKey[k] = (pickedByKey[k] || 0) + (parseFloat(i.pickQty) || 0) * (i.type === 'return' ? -1 : 1);
    });
    const shippedTo = {};  // 訂單 ID 或單號 → { 品項 key: 件數 }
    const override = wave.allocOverride || {};   // 不夠時現場指定給誰：{ 品項 key: { 訂單 ID 或單號: 件數 } }
    (wave.summary || []).forEach(sm => {
        const k = keyOf(sm.productName, sm.spec);
        let avail = pickedByKey[k] || 0;
        const ov = override[k];
        if (ov && !excluded(sm.productName)) {
            (sm.orders || []).forEach(o => {
                const ok = o.orderId || o.orderNo;
                const q = Math.max(0, Math.min(parseFloat(o.quantity) || 0, parseFloat(ov[ok]) || 0, avail));
                avail -= q;
                shippedTo[ok] = shippedTo[ok] || {};
                shippedTo[ok][k] = (shippedTo[ok][k] || 0) + q;
            });
            return;
        }
        (sm.orders || []).forEach(o => {
            const want = parseFloat(o.quantity) || 0;
            const q = excluded(sm.productName) ? want : Math.max(0, Math.min(avail, want));
            if (!excluded(sm.productName)) avail -= q;
            const ok = o.orderId || o.orderNo;
            shippedTo[ok] = shippedTo[ok] || {};
            shippedTo[ok][k] = (shippedTo[ok][k] || 0) + q;
        });
    });
    const out = {};
    (wave.orders || []).forEach(entry => {
        const oid = entry.id || entry.orderId;
        if (!oid || out[oid]) return;
        const got = Object.assign({}, shippedTo[oid] || shippedTo[entry.orderNo] || {});
        const back = [], sent = [], short = [];
        let any = false;
        (entry.items || []).forEach(it => {
            const k = keyOf(it.productName, it.spec);
            const need = parseFloat(it.packageQty) || 1;
            const g = Math.min(need, got[k] || 0);
            got[k] = (got[k] || 0) - g;
            if (g > 0) { any = true; sent.push({ productName: it.productName || '', spec: it.spec || '', qty: g }); }
            if (need - g > 0) {
                const b = Object.assign({}, it, { packageQty: need - g });
                if (parseFloat(it.quantity) > 0) b.quantity = Math.round(parseFloat(it.quantity) * (need - g) / need * 100) / 100;
                back.push(JSON.parse(JSON.stringify(b)));
                short.push({ productName: it.productName || '', spec: it.spec || '', want: need, got: g });
            }
        });
        out[oid] = { entry: entry, back: back, any: any, sent: sent, short: short };
    });
    return out;
};

// 不夠的品項要分給誰（現場可以改）：{ 品項 key: { productName, spec, picked, orders: [{ id, orderNo, customer, want, got }] } }
// got 是照訂單順序先給的預設值；只列「訂的比拿到的多」的品項
window.waveShortAllocation = function(wave, pickingList) {
    const keyOf = (name, spec) => (name || '') + '|||' + (spec || '');
    const excluded = name => typeof window.isExcludedFromPickingList === 'function' && window.isExcludedFromPickingList(name);
    const picked = {};
    (pickingList || []).forEach(i => {
        if (!i.completed || i.shortage) return;
        const k = i.key || keyOf(i.productName, i.spec);
        picked[k] = (picked[k] || 0) + (parseFloat(i.pickQty) || 0) * (i.type === 'return' ? -1 : 1);
    });
    const out = {};
    (wave.summary || []).forEach(sm => {
        if (excluded(sm.productName)) return;
        const k = keyOf(sm.productName, sm.spec);
        const want = (sm.orders || []).reduce((t, o) => t + (parseFloat(o.quantity) || 0), 0);
        const have = Math.max(0, picked[k] || 0);
        if (want <= have) return;
        let avail = have;
        out[k] = { productName: sm.productName, spec: sm.spec || '', picked: have, orders: (sm.orders || []).map(o => {
            const w = parseFloat(o.quantity) || 0, g = Math.min(w, avail); avail -= g;
            const entry = (wave.orders || []).find(x => (x.id || x.orderId) === o.orderId || x.orderNo === o.orderNo) || {};
            return { id: o.orderId || o.orderNo, orderNo: o.orderNo || entry.orderNo || '', customer: o.customer || entry.customer || '', want: w, got: g };
        }) };
    });
    return out;
};

// 缺貨清單（給現場改標籤、給辦公室看）：[{ orderNo, customer, productName, spec, want, got }]
window.waveShortfalls = function(wave, pickingList) {
    const o = window.waveOrderOutcomes(wave, pickingList), rows = [];
    Object.keys(o).forEach(oid => o[oid].short.forEach(x => rows.push(Object.assign({ orderNo: o[oid].entry.orderNo || '', customer: o[oid].entry.customer || '' }, x))));
    return rows;
};

// ============================================================
// 完成波次（桌機與手機共用）：扣庫存、訂單標記出貨、波次標記完成、寫異動記錄，
// 全部在同一筆交易裡。任何一板庫存不足或波次已被別人完成，就整筆取消。
// 未揀的項目（含缺貨）記在 wave.shortages，留下缺貨記錄。
// 每張訂單依實際揀到的件數判斷：全部出齊＝已出貨；只出一部分＝部分出貨（欠貨記在 backorderItems，可以再排波次）；
// 完全沒出到＝回到待處理。結果放在 wave.orderResults { 訂單 ID: 狀態 }。
// 回傳完成時間；失敗時丟出錯誤（庫存與訂單都不會變動）。
// ============================================================
window.completeWaveTx = async function(wave, pickingList, pallets) {
    const db = window.db;
    const notReturned = pickingList.filter(i => i.type === 'return' && !i.completed);
    if (notReturned.length) {
        throw new Error('還有 ' + notReturned.length + ' 項要放回（鼎新減量，多拿的貨）：\n' +
            notReturned.map(i => i.productName + ' ' + (i.spec || '') + ' ' + i.pickQty + ' 件 → ' + i.locationId).join('\n') + '\n\n請先放回再完成波次');
    }
    const pickedItems = pickingList.filter(i => i.completed && !i.shortage && i.type !== 'return');
    const returnedItems = pickingList.filter(i => i.completed && i.type === 'return');
    if (pickedItems.length === 0 && !pickingList.some(i => i.fieldShort)) throw new Error('尚未揀貨任何項目');

    // 每一板實際扣掉的件數＝揀的－放回的（同一板可能揀兩次或放回，合併成一筆）
    const missing = [];
    const changes = [];
    const netByPallet = {};
    // 練習模式不扣庫存；照訂單揀的行沒有棧板，也不扣
    const practice = window.isPracticeMode();
    pickedItems.concat(returnedItems).forEach(item => {
        if (practice || item.practice) return;
        const pallet = (item.docId && pallets.find(p => p.id === item.docId)) || pallets.find(p => p.palletId === item.palletId);
        if (!pallet || !pallet.id) { missing.push(item.palletId || item.productName); return; }
        const q = (parseInt(item.pickQty) || 0) * (item.type === 'return' ? -1 : 1);
        if (!netByPallet[pallet.id]) netByPallet[pallet.id] = { qty: 0, item: item };
        netByPallet[pallet.id].qty += q;
    });
    Object.keys(netByPallet).forEach(pid => {
        const n = netByPallet[pid];
        if (n.qty <= 0) return;
        changes.push({ ref: db.collection('pallets').doc(pid), delta: -n.qty, deleteWhenEmpty: true, label: n.item.palletId });
    });
    if (missing.length > 0) {
        throw new Error('找不到以下棧板（可能已被移動或出庫）：' + missing.slice(0, 10).join('、'));
    }

    const shortages = pickingList.filter(i => (!i.completed || i.shortage) && i.type !== 'return').map(i => ({
        productName: i.productName || '',
        spec: i.spec || '',
        qty: parseInt(i.pickQty) || 0,
        reason: i.fieldShort ? '現場不夠' : i.shortage ? '庫存不足' + (i.note ? '（' + i.note + '）' : '') : '未揀'
    }));

    const waveRef = wave.id ? db.collection('waves').doc(wave.id) : null;
    const orderIds = [];
    const orderEntry = {};
    (wave.orders || []).forEach(order => {
        const oid = order.id || order.orderId;
        if (oid && orderIds.indexOf(oid) === -1) { orderIds.push(oid); orderEntry[oid] = order; }
    });

    const outcomes = window.waveOrderOutcomes(wave, pickingList);
    const orderOutcome = oid => outcomes[oid];
    wave.orderResults = {};
    // 實際出貨明細（報表用：規劃的件數扣掉缺貨；部分出貨的訂單再排波次時不會重複計算）
    const shipped = orderIds.map(oid => {
        const e = orderEntry[oid], r = orderOutcome(oid);
        return { orderId: oid, orderNo: e.orderNo || '', customer: e.customer || '', logistics: e.logistics || '', items: r.sent };
    }).filter(x => x.items.length > 0);
    // 哪個客戶少幾件（看板、首頁提醒、重印標籤用）
    const shortOrders = [];
    orderIds.forEach(oid => { const r = orderOutcome(oid); if (r) r.short.forEach(x => shortOrders.push(Object.assign({ orderNo: r.entry.orderNo || '', customer: r.entry.customer || '' }, x))); });
    const shippedQty = shipped.reduce((t, x) => t + x.items.reduce((u, i) => u + i.qty, 0), 0);
    const orderRefs = orderIds.map(oid => db.collection('salesOrders').doc(oid));
    const completedAt = new Date().toISOString();

    // 寄倉客戶自己的訂單：出貨的件數同時扣寄倉剩餘件數（以實際揀到的件數為上限）
    let consUses = [];
    if (!practice) try {
        const snap = await db.collection('consignments').where('status', '==', 'active').get();
        const active = []; snap.forEach(d => active.push(Object.assign({ id: d.id }, d.data())));
        const pickedBy = {};
        pickedItems.forEach(i => { pickedBy[i.productName] = (pickedBy[i.productName] || 0) + (parseInt(i.pickQty) || 0); });
        window.consignWaveUse(wave, active).forEach(u => {
            const q = Math.min(u.qty, pickedBy[u.productName] || 0);
            if (q > 0) { pickedBy[u.productName] -= q; consUses.push(Object.assign({}, u, { qty: q })); }
        });
    } catch (e) { console.warn('讀取寄倉資料失敗，這次出貨不扣寄倉件數', e); consUses = []; }
    const consIds = [];
    consUses.forEach(u => { if (consIds.indexOf(u.id) === -1) consIds.push(u.id); });
    const consRefs = consIds.map(id => db.collection('consignments').doc(id));
    const by = window.currentUser ? (window.currentUser.name || window.currentUser.email || '') : '';

    await window.runStockTransaction({
        changes: changes,
        reads: (waveRef ? [waveRef] : []).concat(orderRefs, consRefs),
        validate: function(results, readSnaps) {
            if (waveRef && !readSnaps[0].exists) {
                throw new Error('此波次已被刪除（訂單可能已排進其他波次），請重新整理');
            }
            if (waveRef && readSnaps[0].data().status === 'done') {
                throw new Error('此波次已經完成過，不能重複扣庫存');
            }
        },
        updates: function(results, readSnaps) {
            const ups = [];
            const orderSnaps = (waveRef ? readSnaps.slice(1) : readSnaps).slice(0, orderRefs.length);
            const consSnaps = readSnaps.slice(readSnaps.length - consRefs.length);
            consSnaps.forEach((snap, idx) => {
                if (!snap.exists) return;
                const cur = snap.data();
                let remaining = parseFloat(cur.remainingQty) || 0;
                const pickups = (cur.pickups || []).slice();
                consUses.filter(u => u.id === consIds[idx]).forEach(u => {
                    const q = Math.min(u.qty, remaining);
                    if (q <= 0) return;
                    remaining -= q;
                    pickups.push({ date: new Date().toLocalYMD(), qty: q, by: by, waveNo: wave.waveNo || '', orderNo: u.orderNo, auto: true });
                });
                if (pickups.length === (cur.pickups || []).length) return;
                const data = { pickups: pickups, remainingQty: remaining, status: remaining <= 0 ? 'completed' : 'active' };
                if (remaining <= 0) data.completedAt = completedAt;
                ups.push({ ref: consRefs[idx], data: data });
            });
            const FV = firebase.firestore.FieldValue;
            orderSnaps.forEach((snap, idx) => {
                if (!snap.exists) return;
                const oid = orderIds[idx];
                const cur = snap.data();
                const r = orderOutcome(oid);
                let data;
                if (r.back.length === 0) {
                    data = { status: 'shipped', shippedAt: completedAt, waveNo: wave.waveNo, backorderItems: FV.delete() };
                } else {
                    // 缺貨：這次不出、之後也不補（使用者決定），訂單結案；記下少出多少，請業務在鼎新改銷貨單數量
                    const prev = Array.isArray(cur.shortShipped) ? cur.shortShipped : [];
                    data = { status: 'shipped', shippedAt: completedAt, waveNo: wave.waveNo, backorderItems: FV.delete(),
                        shortShipped: prev.concat(r.short.map(x => ({ productName: x.productName, spec: x.spec, want: x.want, got: x.got, short: x.want - x.got, waveNo: wave.waveNo }))),
                        erpFixNeeded: true };
                }
                wave.orderResults[oid] = { status: data.status, backorderItems: null, short: r.short };
                ups.push({ ref: orderRefs[idx], data: data });
            });
            if (waveRef && readSnaps[0].exists) {
                ups.push({ ref: waveRef, data: { status: 'done', completedAt: completedAt, shortages: shortages, shipped: shipped, shippedQty: shippedQty, practice: practice, shortOrders: shortOrders, allocOverride: wave.allocOverride || null } });
            }
            return ups;
        },
        logs: function() {
            return Object.keys(netByPallet).filter(pid => netByPallet[pid].qty > 0).map(pid => {
                const item = netByPallet[pid].item, q = netByPallet[pid].qty;
                return {
                    type: 'outbound',
                    company: item.company || '',
                    productName: item.productName,
                    spec: item.spec,
                    quantity: q,
                    quantityChange: -q,
                    locationId: item.locationId,
                    batchNo: item.batchNo,
                    palletId: item.palletId,
                    note: '波次揀貨 ' + wave.waveNo
                };
            });
        }
    });
    wave.shipped = shipped;
    wave.shippedQty = shippedQty;
    wave.shortOrders = shortOrders;
    return completedAt;
};
