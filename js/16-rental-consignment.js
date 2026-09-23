// ============================================================
// js/16-rental-consignment.js — 倉租、寄倉
// 由原 app.js 第 22748–24728 行拆出；各檔依 index.html 的順序載入，共用全域（window）
// ============================================================
// ========== 倉租管理模組 ==========

window.rentalSettings = {
    chargeOwnStock: {
        chungwen: false,
        bafang: false,
        effectiveDate: null
    },
    storageRate: {
        bafang: 22,
        chungwen: {
            tier1Max: 300,
            tier1Rate: 22,
            tier2Rate: 20
        }
    },
    handlingFee: {
        inbound: 200,
        outbound: 0
    },
    tempZone: {
        freeHours: 4
    },
    settlement: {
        settleDay: 25,
        freeUntilDay: 25
    }
};

window.consignmentData = [];

window.loadRentalSettingsFromFirebase = async function() {
    try {
        if (!window.db || !window.getDoc) {
            console.log('Firebase 尚未初始化，使用 localStorage');
            var stored = localStorage.getItem('wms_rental_settings');
            if (stored) window.rentalSettings = JSON.parse(stored);
            loadRentalSettingsUI();
            return;
        }

        var docRef = window.doc(window.db, 'settings', 'rentalSettings');
        var docSnap = await window.getDoc(docRef);

        if (docSnap.exists) {
            window.rentalSettings = docSnap.data();
            console.log('倉租設定已從 Firebase 載入');
        }

        localStorage.setItem('wms_rental_settings', JSON.stringify(window.rentalSettings));

        loadRentalSettingsUI();
    } catch(e) {
        console.error('載入倉租設定失敗:', e);
        var stored = localStorage.getItem('wms_rental_settings');
        if (stored) window.rentalSettings = JSON.parse(stored);
        loadRentalSettingsUI();
    }
};

window.loadConsignmentsFromFirebase = async function() {
    try {
        if (!window.db || !window.getDocs) {
            console.log('Firebase 尚未初始化，使用 localStorage');
            window.consignmentData = JSON.parse(localStorage.getItem('wms_consignments') || '[]');
            loadConsignmentList();
            // 重新渲染庫存表格以顯示寄庫資訊
            if (typeof window.refreshInventoryTableWithConsignment === 'function') {
                window.refreshInventoryTableWithConsignment();
            }
            return;
        }

        var snapshot = await window.getDocs(window.collection(window.db, 'consignments'));
        window.consignmentData = [];
        snapshot.forEach(function(doc) {
            window.consignmentData.push({ id: doc.id, ...doc.data() });
        });

        console.log('寄倉資料已載入:', window.consignmentData.length, '筆');

        localStorage.setItem('wms_consignments', JSON.stringify(window.consignmentData));

        loadConsignmentList();
        
        // 重新渲染庫存表格以顯示寄庫資訊
        if (typeof window.refreshInventoryTableWithConsignment === 'function') {
            window.refreshInventoryTableWithConsignment();
        }
    } catch(e) {
        console.error('載入寄倉資料失敗:', e);
        window.consignmentData = JSON.parse(localStorage.getItem('wms_consignments') || '[]');
        loadConsignmentList();
    }
};

window.saveRentalSettingsToFirebase = async function() {
    try {
        if (window.db && window.setDoc) {
            var docRef = window.doc(window.db, 'settings', 'rentalSettings');
            await window.setDoc(docRef, window.rentalSettings);
            console.log('倉租設定已儲存到 Firebase');
        }
        localStorage.setItem('wms_rental_settings', JSON.stringify(window.rentalSettings));
    } catch(e) {
        console.error('儲存倉租設定失敗:', e);
        localStorage.setItem('wms_rental_settings', JSON.stringify(window.rentalSettings));
    }
};

window.saveConsignmentToFirebase = async function(consignment) {
    try {
        if (window.db && window.addDoc) {
            var docRef = await window.addDoc(window.collection(window.db, 'consignments'), consignment);
            consignment.id = docRef.id;
            console.log('寄倉資料已儲存到 Firebase');
        }
        window.consignmentData.push(consignment);
        localStorage.setItem('wms_consignments', JSON.stringify(window.consignmentData));
        return consignment;
    } catch(e) {
        console.error('儲存寄倉資料失敗:', e);
        window.consignmentData.push(consignment);
        localStorage.setItem('wms_consignments', JSON.stringify(window.consignmentData));
        return consignment;
    }
};

window.updateConsignmentInFirebase = async function(id, data) {
    try {
        if (window.db && window.updateDoc) {
            await window.updateDoc(window.doc(window.db, 'consignments', id), data);
        }
        var idx = window.consignmentData.findIndex(function(c) { return c.id === id; });
        if (idx >= 0) {
            Object.assign(window.consignmentData[idx], data);
        }
        localStorage.setItem('wms_consignments', JSON.stringify(window.consignmentData));
    } catch(e) {
        console.error('更新寄倉資料失敗:', e);
    }
};

window.deleteConsignmentFromFirebase = async function(id) {
    try {
        if (window.db && window.deleteDoc) {
            await window.deleteDoc(window.doc(window.db, 'consignments', id));
        }
        window.consignmentData = window.consignmentData.filter(function(c) { return c.id !== id; });
        localStorage.setItem('wms_consignments', JSON.stringify(window.consignmentData));
    } catch(e) {
        console.error('刪除寄倉資料失敗:', e);
    }
};

window.updateRentalSettings = function() {
    window.rentalSettings.chargeOwnStock.chungwen = document.querySelector('input[name="charge-cw"]:checked')?.value === 'yes';
    window.rentalSettings.chargeOwnStock.bafang = document.querySelector('input[name="charge-bf"]:checked')?.value === 'yes';
    window.rentalSettings.chargeOwnStock.effectiveDate = document.getElementById('charge-effective-date')?.value || null;

    window.rentalSettings.storageRate.bafang = parseInt(document.getElementById('rate-bf-normal')?.value) || 22;
    window.rentalSettings.storageRate.chungwen.tier1Max = parseInt(document.getElementById('rate-cw-tier1-max')?.value) || 300;
    window.rentalSettings.storageRate.chungwen.tier1Rate = parseInt(document.getElementById('rate-cw-tier1')?.value) || 22;
    window.rentalSettings.storageRate.chungwen.tier2Rate = parseInt(document.getElementById('rate-cw-tier2')?.value) || 20;

    window.rentalSettings.handlingFee.inbound = parseInt(document.getElementById('fee-inbound')?.value) || 200;
    window.rentalSettings.handlingFee.outbound = parseInt(document.getElementById('fee-outbound')?.value) || 0;

    window.rentalSettings.tempZone.freeHours = parseInt(document.getElementById('temp-free-hours')?.value) || 4;

    window.rentalSettings.settlement.settleDay = parseInt(document.getElementById('settle-day')?.value) || 25;
    window.rentalSettings.settlement.freeUntilDay = parseInt(document.getElementById('free-until-day')?.value) || 25;
};

window.saveRentalSettings = async function() {
    updateRentalSettings();
    await saveRentalSettingsToFirebase();
    showNotification('✅ 費率設定已儲存', 'success');
};

window.loadRentalSettingsUI = function() {
    const s = window.rentalSettings;

    const cwRadio = document.querySelector(`input[name="charge-cw"][value="${s.chargeOwnStock.chungwen ? 'yes' : 'no'}"]`);
    if (cwRadio) cwRadio.checked = true;
    const bfRadio = document.querySelector(`input[name="charge-bf"][value="${s.chargeOwnStock.bafang ? 'yes' : 'no'}"]`);
    if (bfRadio) bfRadio.checked = true;
    if (document.getElementById('charge-effective-date')) {
        document.getElementById('charge-effective-date').value = s.chargeOwnStock.effectiveDate || '';
    }

    if (document.getElementById('rate-bf-normal')) document.getElementById('rate-bf-normal').value = s.storageRate.bafang;
    if (document.getElementById('rate-cw-tier1-max')) document.getElementById('rate-cw-tier1-max').value = s.storageRate.chungwen.tier1Max;
    if (document.getElementById('rate-cw-tier1')) document.getElementById('rate-cw-tier1').value = s.storageRate.chungwen.tier1Rate;
    if (document.getElementById('rate-cw-tier2')) document.getElementById('rate-cw-tier2').value = s.storageRate.chungwen.tier2Rate;

    if (document.getElementById('fee-inbound')) document.getElementById('fee-inbound').value = s.handlingFee.inbound;
    if (document.getElementById('fee-outbound')) document.getElementById('fee-outbound').value = s.handlingFee.outbound;

    if (document.getElementById('temp-free-hours')) document.getElementById('temp-free-hours').value = s.tempZone.freeHours;

    if (document.getElementById('settle-day')) document.getElementById('settle-day').value = s.settlement.settleDay;
    if (document.getElementById('free-until-day')) document.getElementById('free-until-day').value = s.settlement.freeUntilDay;
};

window.getStorageRate = function(company, palletCount) {
    const s = window.rentalSettings.storageRate;
    if (company === '八方') {
        return s.bafang;
    } else {
        if (palletCount > s.chungwen.tier1Max) {
            return s.chungwen.tier2Rate;
        }
        return s.chungwen.tier1Rate;
    }
};

window.getConsignmentRate = function(company, palletCount, unitsPerPallet) {
    const ratePerPallet = getStorageRate(company, palletCount);
    return ratePerPallet / unitsPerPallet;
};

window.openNewConsignmentModal = async function() {
    try {
        const today = new Date();
        const freeUntilDay = (window.rentalSettings && window.rentalSettings.settlement) ? window.rentalSettings.settlement.freeUntilDay : 25;
        let freeUntil = new Date(today.getFullYear(), today.getMonth(), freeUntilDay);
        if (today.getDate() > freeUntilDay) {
            freeUntil = new Date(today.getFullYear(), today.getMonth() + 1, freeUntilDay);
        }
        const freeUntilStr = freeUntil.toLocalYMD();
        const todayStr = today.toLocalYMD();

    const content = `
        <div class="flex flex-col" style="height: 580px;">
            <!-- 上方：客戶資訊 -->
            <div class="bg-slate-800 rounded-lg p-3 mb-3">
                <div class="grid grid-cols-5 gap-3 items-end">
                    <div>
                        <label class="text-[10px] text-slate-500">客戶名稱 *</label>
                        <input type="text" id="consign-customer" class="scan-input w-full" placeholder="輸入客戶名稱...">
                    </div>
                    <div>
                        <label class="text-[10px] text-slate-500">費率 (元/件/天)</label>
                        <input type="number" id="consign-rate" class="scan-input w-full" step="0.01" value="0.37">
                    </div>
                    <div>
                        <label class="text-[10px] text-slate-500">寄倉日</label>
                        <input type="date" id="consign-date" class="scan-input w-full" value="${todayStr}">
                    </div>
                    <div>
                        <label class="text-[10px] text-slate-500">免費至</label>
                        <input type="date" id="consign-free-until" class="scan-input w-full" value="${freeUntilStr}">
                    </div>
                    <div>
                        <button onclick="saveNewConsignment()" id="btn-save-consignment" class="w-full px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded font-bold disabled:opacity-50" disabled>
                            <i class="fa-solid fa-check mr-1"></i>確認寄庫 (<span id="consign-selected-total">0</span>)
                        </button>
                    </div>
                </div>
            </div>

            <!-- 工具列 -->
            <div class="flex gap-2 mb-2 items-center">
                <div class="flex gap-1 bg-slate-800 rounded p-1">
                    <button onclick="filterConsignStock('all')" id="btn-cs-all" class="px-3 py-1 rounded text-xs font-bold bg-slate-600 text-white">全部</button>
                    <button onclick="filterConsignStock('internal')" id="btn-cs-internal" class="px-3 py-1 rounded text-xs font-bold bg-slate-700 text-slate-300 hover:bg-slate-600">內倉</button>
                    <button onclick="filterConsignStock('external')" id="btn-cs-external" class="px-3 py-1 rounded text-xs font-bold bg-slate-700 text-slate-300 hover:bg-slate-600">外倉</button>
                </div>
                <div class="relative flex-1">
                    <i class="fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"></i>
                    <input type="text" id="consign-stock-search" class="scan-input pl-9 w-full" placeholder="搜尋品名、規格、批號..." oninput="renderConsignStockTable()">
                </div>
                <div class="flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded border border-emerald-500/50">
                    <span class="text-emerald-300 text-xs">已選</span>
                    <span class="text-emerald-400 font-bold" id="consign-selected-count">0</span>
                    <span class="text-emerald-300 text-xs">筆 /</span>
                    <span class="text-amber-400 font-bold" id="consign-selected-qty">0</span>
                    <span class="text-amber-300 text-xs">件</span>
                </div>
            </div>

            <!-- 庫存表格 -->
            <div class="flex-1 overflow-auto bg-slate-900/50 rounded-lg">
                <table class="w-full text-sm">
                    <thead class="sticky top-0 bg-slate-800 z-10">
                        <tr class="text-slate-400 text-xs">
                            <th class="p-2 text-center w-8"><input type="checkbox" id="consign-check-all" onchange="toggleConsignAll(this.checked)"></th>
                            <th class="p-2 text-left">類型</th>
                            <th class="p-2 text-left">品名</th>
                            <th class="p-2 text-left">規格</th>
                            <th class="p-2 text-left">批號</th>
                            <th class="p-2 text-right">庫存</th>
                            <th class="p-2 text-right">已寄</th>
                            <th class="p-2 text-right">可寄</th>
                            <th class="p-2 text-left">位置</th>
                            <th class="p-2 text-left">效期</th>
                            <th class="p-2 text-center w-24">數量</th>
                        </tr>
                    </thead>
                    <tbody id="consign-stock-tbody">
                        <tr><td colspan="11" class="text-center text-slate-500 py-10">載入中...</td></tr>
                    </tbody>
                </table>
            </div>

            <div class="text-[10px] text-slate-500 mt-2 text-center">
                💡 勾選品項 → 輸入數量 → 確認寄庫 ｜ <span class="text-blue-400">藍=內倉</span> <span class="text-purple-400">紫=外倉</span>
            </div>
        </div>
    `;

    WMS.createModal('consignment-modal', {
        title: '新增客戶寄庫',
        icon: 'fa-solid fa-box-archive text-amber-400',
        content: content,
        width: '1050px'
    });

    // 初始化
    window.consignStockData = [];
    window.consignStockSelected = {};
    window.consignStockFilter = 'all';
    
    // 載入庫存資料
    loadConsignStockData();
    
    } catch(e) {
        console.error('❌ 開啟新增寄倉視窗失敗:', e);
        alert('開啟視窗失敗：' + e.message);
    }
};

// 載入庫存資料
window.loadConsignStockData = function() {
    const internalInventory = window.currentInventory ? window.currentInventory() : [];
    const externalInventory = window.externalStock || [];
    
    // 建立已寄倉對照表
    // 內倉用 品名|規格|批號|儲位 匹配
    // 外倉用 品名|規格|批號|倉庫名稱 匹配
    const consignedMap = {};
    if (window.consignmentData && Array.isArray(window.consignmentData)) {
        window.consignmentData.forEach(c => {
            if (c.status !== 'active') return;
            var key;
            if (c.locationId) {
                // 內倉：用儲位區分
                key = `${c.productName || ''}|${c.spec || ''}|${c.batchNo || ''}|${c.locationId}`;
            } else {
                // 外倉：用倉庫名稱區分
                key = `${c.productName || ''}|${c.spec || ''}|${c.batchNo || ''}|${c.sourceWarehouse || ''}`;
            }
            consignedMap[key] = (consignedMap[key] || 0) + (c.remainingQty || 0);
        });
    }
    
    console.log('📋 寄庫對照表:', consignedMap);
    
    const allItems = [];
    
    // 內倉
    internalInventory.forEach(item => {
        if (!item.productName || (item.quantity || 0) <= 0) return;
        const status = (item.status || '').toLowerCase();
        if (status === 'shipped' || status === 'outbound' || status === 'deleted') return;
        
        const warehouseName = item.warehouse || item.company || '內倉';
        const locationId = item.locationId || '';
        // 內倉用儲位匹配
        const consignKey = `${item.productName}|${item.spec || ''}|${item.batchNo || ''}|${locationId}`;
        const consigned = consignedMap[consignKey] || 0;
        
        // 用於選擇的唯一 key（加入 id 確保唯一）
        const uniqueKey = `internal_${item.id}`;
        
        allItems.push({
            id: item.id,
            stockType: 'internal',
            productName: item.productName,
            spec: item.spec || '',
            batchNo: item.batchNo || '',
            quantity: item.quantity || 0,
            consigned: consigned,
            available: Math.max(0, (item.quantity || 0) - consigned),
            locationId: locationId,
            warehouseName: warehouseName,
            expDate: item.expiryDate ? (item.expiryDate.toDate ? item.expiryDate.toDate().toLocaleDateString('zh-TW') : new Date(item.expiryDate).toLocaleDateString('zh-TW')) : '-',
            key: uniqueKey
        });
    });
    
    // 外倉
    externalInventory.forEach(item => {
        if (!item.productName || (item.quantity || 0) <= 0) return;
        
        let warehouseName = item.warehouseId || '';
        const wh = (window.warehousesData || []).find(w => w.code === item.warehouseId || w.id === item.warehouseId);
        if (wh) warehouseName = wh.company + '_' + wh.name;
        else if (item.company) warehouseName = item.company + '_' + (item.warehouseId || '外倉');
        
        // 外倉用倉庫名稱匹配
        const consignKey = `${item.productName}|${item.spec || ''}|${item.batchNo || ''}|${warehouseName}`;
        const consigned = consignedMap[consignKey] || 0;
        
        // 用於選擇的唯一 key（加入 id 確保唯一）
        const uniqueKey = `external_${item.id}`;
        
        allItems.push({
            id: item.id,
            stockType: 'external',
            productName: item.productName,
            spec: item.spec || '',
            batchNo: item.batchNo || '',
            quantity: item.quantity || 0,
            consigned: consigned,
            available: Math.max(0, (item.quantity || 0) - consigned),
            locationId: warehouseName,
            warehouseName: warehouseName,
            expDate: item.expDate || '-',
            key: uniqueKey
        });
    });
    
    // 排序
    allItems.sort((a, b) => {
        const n = (a.productName || '').localeCompare(b.productName || '', 'zh-TW');
        if (n !== 0) return n;
        return (a.spec || '').localeCompare(b.spec || '', 'zh-TW');
    });
    
    window.consignStockData = allItems;
    renderConsignStockTable();
};

// 渲染表格
window.renderConsignStockTable = function() {
    const tbody = document.getElementById('consign-stock-tbody');
    if (!tbody) return;
    
    const searchText = (document.getElementById('consign-stock-search')?.value || '').toLowerCase().trim();
    const typeFilter = window.consignStockFilter || 'all';
    
    let filtered = window.consignStockData.filter(item => {
        if (typeFilter === 'internal' && item.stockType !== 'internal') return false;
        if (typeFilter === 'external' && item.stockType !== 'external') return false;
        if (searchText) {
            return (item.productName || '').toLowerCase().includes(searchText) ||
                   (item.spec || '').toLowerCase().includes(searchText) ||
                   (item.batchNo || '').toLowerCase().includes(searchText) ||
                   (item.locationId || '').toLowerCase().includes(searchText);
        }
        return true;
    });
    
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="text-center text-slate-500 py-10">無符合條件的庫存</td></tr>';
        return;
    }
    
    let html = '';
    filtered.forEach((item, idx) => {
        const isInternal = item.stockType === 'internal';
        const typeClass = isInternal ? 'bg-blue-600' : 'bg-purple-600';
        const typeLabel = isInternal ? '內' : '外';
        const disabled = item.available <= 0;
        const selected = window.consignStockSelected[item.key];
        const isChecked = !!selected;
        const rowBg = isChecked ? 'bg-emerald-900/30' : '';
        
        // 效期顏色
        let expClass = 'text-slate-400';
        if (item.expDate && item.expDate !== '-') {
            try {
                const parts = item.expDate.split('/');
                if (parts.length === 3) {
                    const expDate = new Date(parts[0], parts[1]-1, parts[2]);
                    const diffDays = Math.ceil((expDate - new Date()) / 86400000);
                    if (diffDays < 0) expClass = 'text-red-500';
                    else if (diffDays < 30) expClass = 'text-orange-400';
                    else if (diffDays < 90) expClass = 'text-yellow-400';
                }
            } catch(e) {}
        }
        
        html += `
            <tr class="border-b border-slate-700/50 hover:bg-slate-800/50 ${rowBg}" data-key="${item.key}">
                <td class="p-2 text-center">
                    <input type="checkbox" class="cs-checkbox" data-idx="${idx}" ${isChecked ? 'checked' : ''} ${disabled ? 'disabled' : ''} onchange="toggleConsignItem(${idx}, this.checked)">
                </td>
                <td class="p-2"><span class="px-1.5 py-0.5 rounded text-[10px] ${typeClass}">${typeLabel}</span></td>
                <td class="p-2 text-white">${item.productName}</td>
                <td class="p-2 text-yellow-400">${item.spec || '-'}</td>
                <td class="p-2 text-slate-400 font-mono text-xs">${item.batchNo || '-'}</td>
                <td class="p-2 text-right text-white">${item.quantity}</td>
                <td class="p-2 text-right ${item.consigned > 0 ? 'text-amber-400' : 'text-slate-600'}">${item.consigned || '-'}</td>
                <td class="p-2 text-right ${item.available > 0 ? 'text-emerald-400 font-bold' : 'text-red-400'}">${item.available}</td>
                <td class="p-2 ${isInternal ? 'text-cyan-400' : 'text-teal-400'} font-mono text-xs">${item.locationId || '-'}</td>
                <td class="p-2 ${expClass} text-xs">${item.expDate}</td>
                <td class="p-2 text-center">
                    <input type="number" class="scan-input w-20 py-1 text-center text-xs ${disabled ? 'opacity-40' : ''}" 
                        data-idx="${idx}" min="1" max="${item.available}" 
                        value="${selected?.qty || ''}" placeholder="${item.available}"
                        ${disabled ? 'disabled' : ''} 
                        onchange="updateConsignQty(${idx}, this.value)" onfocus="this.select()">
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
    updateConsignSummary();
};

// 篩選類型
window.filterConsignStock = function(type) {
    window.consignStockFilter = type;
    ['all', 'internal', 'external'].forEach(t => {
        const btn = document.getElementById(`btn-cs-${t}`);
        if (btn) btn.className = t === type 
            ? 'px-3 py-1 rounded text-xs font-bold bg-slate-600 text-white'
            : 'px-3 py-1 rounded text-xs font-bold bg-slate-700 text-slate-300 hover:bg-slate-600';
    });
    renderConsignStockTable();
};

// 全選
window.toggleConsignAll = function(checked) {
    document.querySelectorAll('.cs-checkbox:not(:disabled)').forEach(cb => {
        const idx = parseInt(cb.dataset.idx);
        cb.checked = checked;
        toggleConsignItem(idx, checked, false);
    });
    updateConsignSummary();
};

// 單選
window.toggleConsignItem = function(idx, checked, update = true) {
    const searchText = (document.getElementById('consign-stock-search')?.value || '').toLowerCase().trim();
    const typeFilter = window.consignStockFilter || 'all';
    
    const filtered = window.consignStockData.filter(item => {
        if (typeFilter === 'internal' && item.stockType !== 'internal') return false;
        if (typeFilter === 'external' && item.stockType !== 'external') return false;
        if (searchText) {
            return (item.productName || '').toLowerCase().includes(searchText) ||
                   (item.spec || '').toLowerCase().includes(searchText) ||
                   (item.batchNo || '').toLowerCase().includes(searchText);
        }
        return true;
    });
    
    const item = filtered[idx];
    if (!item) return;
    
    const row = document.querySelector(`tr[data-key="${item.key}"]`);
    
    if (checked) {
        const qtyInput = document.querySelector(`input[type="number"][data-idx="${idx}"]`);
        let qty = parseInt(qtyInput?.value);
        // 如果輸入框為空或無效，使用可寄數量
        if (isNaN(qty) || qty <= 0) {
            qty = item.available;
        }
        qty = Math.min(qty, item.available);
        
        window.consignStockSelected[item.key] = { item: item, qty: qty };
        
        // 更新輸入框顯示
        if (qtyInput) qtyInput.value = qty;
        if (row) row.classList.add('bg-emerald-900/30');
    } else {
        delete window.consignStockSelected[item.key];
        if (row) row.classList.remove('bg-emerald-900/30');
    }
    
    if (update) updateConsignSummary();
};

// 更新數量
window.updateConsignQty = function(idx, value) {
    const searchText = (document.getElementById('consign-stock-search')?.value || '').toLowerCase().trim();
    const typeFilter = window.consignStockFilter || 'all';
    
    const filtered = window.consignStockData.filter(item => {
        if (typeFilter === 'internal' && item.stockType !== 'internal') return false;
        if (typeFilter === 'external' && item.stockType !== 'external') return false;
        if (searchText) {
            return (item.productName || '').toLowerCase().includes(searchText) ||
                   (item.spec || '').toLowerCase().includes(searchText) ||
                   (item.batchNo || '').toLowerCase().includes(searchText);
        }
        return true;
    });
    
    const item = filtered[idx];
    if (!item) return;
    
    const qty = parseInt(value) || 0;
    const checkbox = document.querySelector(`.cs-checkbox[data-idx="${idx}"]`);
    const row = document.querySelector(`tr[data-key="${item.key}"]`);
    
    if (qty > 0 && qty <= item.available) {
        if (checkbox && !checkbox.checked) checkbox.checked = true;
        window.consignStockSelected[item.key] = { item, qty };
        if (row) row.classList.add('bg-emerald-900/30');
    } else if (qty > item.available) {
        const qtyInput = document.querySelector(`input[type="number"][data-idx="${idx}"]`);
        if (qtyInput) qtyInput.value = item.available;
        updateConsignQty(idx, item.available);
        return;
    } else {
        if (checkbox) checkbox.checked = false;
        delete window.consignStockSelected[item.key];
        if (row) row.classList.remove('bg-emerald-900/30');
    }
    
    updateConsignSummary();
};

// 更新統計
window.updateConsignSummary = function() {
    const keys = Object.keys(window.consignStockSelected || {});
    let totalQty = 0;
    
    keys.forEach(k => {
        const sel = window.consignStockSelected[k];
        const qty = parseInt(sel?.qty) || 0;
        totalQty += qty;
    });
    
    const countEl = document.getElementById('consign-selected-count');
    const qtyEl = document.getElementById('consign-selected-qty');
    const totalEl = document.getElementById('consign-selected-total');
    const btn = document.getElementById('btn-save-consignment');
    
    if (countEl) countEl.textContent = keys.length;
    if (qtyEl) qtyEl.textContent = totalQty.toLocaleString();
    if (totalEl) totalEl.textContent = keys.length;
    if (btn) btn.disabled = keys.length === 0;
    
    console.log('📊 統計更新:', keys.length, '筆,', totalQty, '件');
};

// 儲存寄庫
window.saveNewConsignment = async function() {
    const customer = document.getElementById('consign-customer')?.value.trim();
    const rate = parseFloat(document.getElementById('consign-rate')?.value) || 0.37;
    const consignDate = document.getElementById('consign-date')?.value;
    const freeUntil = document.getElementById('consign-free-until')?.value;
    
    if (!customer) { alert('請輸入客戶名稱'); return; }
    
    const keys = Object.keys(window.consignStockSelected);
    if (keys.length === 0) { alert('請選擇品項'); return; }
    
    const freeUntilDate = new Date(freeUntil);
    const chargeStartDate = new Date(freeUntilDate);
    chargeStartDate.setDate(chargeStartDate.getDate() + 1);
    const chargeStartStr = chargeStartDate.toLocalYMD();
    
    try {
        let count = 0, totalQty = 0;
        
        for (const key of keys) {
            const sel = window.consignStockSelected[key];
            const item = sel.item;
            
            await window.saveConsignmentToFirebase({
                source: item.stockType,
                sourceWarehouse: item.warehouseName,
                locationId: item.stockType === 'internal' ? (item.locationId || '') : '',
                productName: item.productName,
                spec: item.spec || '',
                batchNo: item.batchNo || '',
                expDate: item.expDate || '',
                customer: customer,
                originalQty: sel.qty,
                remainingQty: sel.qty,
                consignmentDate: consignDate,
                freeUntil: freeUntil,
                chargeStartDate: chargeStartStr,
                ratePerUnit: rate,
                note: '',
                pickups: [],
                status: 'active',
                createdAt: new Date().toISOString()
            });
            console.log('💾 儲存寄庫: stockType=' + item.stockType + ' locationId=' + (item.stockType === 'internal' ? (item.locationId || '') : '') + ' customer=' + customer);
            count++;
            totalQty += sel.qty;
        }
        
        WMS.closeModal('consignment-modal');
        showNotification(`✅ 已寄庫 ${count} 筆，共 ${totalQty.toLocaleString()} 件 → ${customer}`, 'success');
        
        if (typeof loadConsignmentList === 'function') setTimeout(loadConsignmentList, 100);
        
    } catch (e) {
        console.error('寄庫失敗:', e);
        alert('❌ 寄庫失敗：' + e.message);
    }
};

window.warehouseConfig = {
    internal: [
        '崇文_成品', '崇文_原料', '崇文_白蝦', '崇文_半成品庫', '崇文_退貨庫',
        '八方_成品', '八方_原料', '八方_白蝦'
    ],
    external: [
        '崇文_洽通', '崇文_有興', '崇文_品順', '崇文_富崐', '崇文_景山1號', '崇文_景山2號',
        '八方_洽通', '八方_有興', '八方_品順', '八方_富崐', '八方_景山1號',
        '張春梅_有興', '張春梅_原料', '張春梅_景山1號',
        '客戶代工倉', '貨品暫存庫'
    ],
    consign: [
        '(惠敏)客戶寄庫倉', '崇文(惠-布袋)客戶寄庫倉', '崇文(業務)客戶寄庫倉',
        '崇文_寄庫倉', 'PCHOME寄倉'
    ]
};

// ========== 寄庫作業分頁功能 ==========

// 全域變數
window.consignOpData = [];          // 庫存資料
window.consignOpSelected = {};      // 已選項目 { key: { item, qty } }
window.consignOpFilter = 'all';     // 篩選：all / internal / external

// 載入寄庫作業頁面
window.loadConsignOpList = function() {
    const tbody = document.getElementById('consign-op-list');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="12" class="text-center text-slate-500 py-10"><i class="fa-solid fa-spinner fa-spin mr-2"></i>載入中...</td></tr>';
    
    // 合併內倉和外倉庫存
    const internalInventory = window.currentInventory ? window.currentInventory() : [];
    const externalInventory = window.externalStock || [];
    
    // 建立已寄倉數量對照表
    const consignedMap = {};
    if (window.consignmentData && Array.isArray(window.consignmentData)) {
        window.consignmentData.forEach(c => {
            if (c.status !== 'active') return;
            const key = `${c.productName || ''}|${c.spec || ''}|${c.batchNo || ''}|${c.sourceWarehouse || ''}`;
            consignedMap[key] = (consignedMap[key] || 0) + (c.remainingQty || 0);
        });
    }
    
    const allItems = [];
    
    // 處理內倉庫存
    internalInventory.forEach(item => {
        if (!item.productName || (item.quantity || 0) <= 0) return;
        const status = (item.status || '').toLowerCase();
        if (status === 'shipped' || status === 'outbound' || status === 'deleted') return;
        
        const warehouseName = item.warehouse || item.company || '內倉';
        const key = `${item.productName}|${item.spec || ''}|${item.batchNo || ''}|${warehouseName}`;
        const consigned = consignedMap[key] || 0;
        const available = Math.max(0, (item.quantity || 0) - consigned);
        
        allItems.push({
            id: item.id,
            stockType: 'internal',
            company: item.company || '崇文',
            productName: item.productName,
            spec: item.spec || '',
            batchNo: item.batchNo || '',
            quantity: item.quantity || 0,
            consigned: consigned,
            available: available,
            locationId: item.locationId || '',
            warehouseName: warehouseName,
            expDate: item.expiryDate ? (item.expiryDate.toDate ? item.expiryDate.toDate().toLocaleDateString('zh-TW') : new Date(item.expiryDate).toLocaleDateString('zh-TW')) : '-',
            key: key
        });
    });
    
    // 處理外倉庫存
    externalInventory.forEach(item => {
        if (!item.productName || (item.quantity || 0) <= 0) return;
        
        let warehouseName = item.warehouseId || '';
        const wh = (window.warehousesData || []).find(w => w.code === item.warehouseId || w.id === item.warehouseId);
        if (wh) {
            warehouseName = wh.company + '_' + wh.name;
        } else if (item.company) {
            warehouseName = item.company + '_' + (item.warehouseId || '外倉');
        }
        
        const key = `${item.productName}|${item.spec || ''}|${item.batchNo || ''}|${warehouseName}`;
        const consigned = consignedMap[key] || 0;
        const available = Math.max(0, (item.quantity || 0) - consigned);
        
        allItems.push({
            id: item.id,
            stockType: 'external',
            company: item.company || '崇文',
            productName: item.productName,
            spec: item.spec || '',
            batchNo: item.batchNo || '',
            quantity: item.quantity || 0,
            consigned: consigned,
            available: available,
            locationId: warehouseName,
            warehouseName: warehouseName,
            expDate: item.expDate || '-',
            key: key
        });
    });
    
    // 排序：品名 → 規格 → 批號
    allItems.sort((a, b) => {
        const nameCompare = (a.productName || '').localeCompare(b.productName || '', 'zh-TW');
        if (nameCompare !== 0) return nameCompare;
        const specCompare = (a.spec || '').localeCompare(b.spec || '', 'zh-TW');
        if (specCompare !== 0) return specCompare;
        return (a.batchNo || '').localeCompare(b.batchNo || '', 'zh-TW');
    });
    
    window.consignOpData = allItems;
    
    renderConsignOpList();
};

// 渲染庫存清單
window.renderConsignOpList = function() {
    const tbody = document.getElementById('consign-op-list');
    if (!tbody) return;
    
    const searchText = (document.getElementById('consign-op-search')?.value || '').toLowerCase().trim();
    const typeFilter = window.consignOpFilter || 'all';
    
    // 過濾
    let filtered = window.consignOpData.filter(item => {
        // 類型篩選
        if (typeFilter === 'internal' && item.stockType !== 'internal') return false;
        if (typeFilter === 'external' && item.stockType !== 'external') return false;
        
        // 搜尋
        if (searchText) {
            const match = 
                (item.productName || '').toLowerCase().includes(searchText) ||
                (item.spec || '').toLowerCase().includes(searchText) ||
                (item.batchNo || '').toLowerCase().includes(searchText) ||
                (item.locationId || '').toLowerCase().includes(searchText) ||
                (item.warehouseName || '').toLowerCase().includes(searchText);
            if (!match) return false;
        }
        
        return true;
    });
    
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" class="text-center text-slate-500 py-10">無符合條件的庫存</td></tr>';
        return;
    }
    
    let html = '';
    filtered.forEach((item, idx) => {
        const isInternal = item.stockType === 'internal';
        const typeClass = isInternal ? 'bg-blue-600' : 'bg-purple-600';
        const typeLabel = isInternal ? '內倉' : '外倉';
        const companyClass = item.company === '八方' ? 'bg-purple-900/50 text-purple-300' : 'bg-blue-900/50 text-blue-300';
        const availableClass = item.available > 0 ? 'text-emerald-400' : 'text-red-400';
        const disabled = item.available <= 0;
        
        // 檢查是否已選
        const selected = window.consignOpSelected[item.key];
        const isChecked = !!selected;
        const currentQty = selected ? selected.qty : '';
        const rowClass = isChecked ? 'bg-emerald-900/30' : '';
        
        // 效期顏色
        let expClass = 'text-slate-400';
        if (item.expDate && item.expDate !== '-') {
            try {
                const expDate = new Date(item.expDate);
                const today = new Date();
                const diffDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
                if (diffDays < 0) expClass = 'text-red-500 font-bold';
                else if (diffDays < 30) expClass = 'text-red-400';
                else if (diffDays < 90) expClass = 'text-yellow-400';
            } catch(e) {}
        }
        
        html += `
            <tr class="border-b border-slate-700 hover:bg-slate-800 ${rowClass}" data-key="${item.key}">
                <td class="p-2 text-center">
                    <input type="checkbox" 
                        class="consign-op-checkbox w-4 h-4"
                        data-idx="${idx}"
                        ${isChecked ? 'checked' : ''}
                        ${disabled ? 'disabled' : ''}
                        onchange="toggleConsignOpItem(${idx}, this.checked)"
                    >
                </td>
                <td class="p-2"><span class="px-1.5 py-0.5 rounded text-[10px] ${typeClass}">${typeLabel}</span></td>
                <td class="p-2"><span class="px-1.5 py-0.5 rounded text-xs ${companyClass}">${item.company}</span></td>
                <td class="p-2 text-white">${item.productName}</td>
                <td class="p-2 text-yellow-400">${item.spec || '-'}</td>
                <td class="p-2 text-slate-400 font-mono text-sm">${item.batchNo || '-'}</td>
                <td class="p-2 text-right text-white">${item.quantity}</td>
                <td class="p-2 text-right ${item.consigned > 0 ? 'text-amber-400' : 'text-slate-500'}">${item.consigned || '-'}</td>
                <td class="p-2 text-right ${availableClass} font-bold">${item.available}</td>
                <td class="p-2 ${isInternal ? 'text-cyan-400' : 'text-teal-400'} font-mono text-sm">${item.locationId || '-'}</td>
                <td class="p-2 ${expClass}">${item.expDate}</td>
                <td class="p-2 text-center">
                    <input type="number" 
                        class="scan-input w-20 py-1 text-center text-sm ${disabled ? 'opacity-50' : ''}"
                        data-idx="${idx}"
                        min="1"
                        max="${item.available}"
                        value="${currentQty}"
                        placeholder="${item.available}"
                        ${disabled ? 'disabled' : ''}
                        onchange="updateConsignOpQty(${idx}, this.value)"
                        onfocus="this.select()"
                    >
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
    
    updateConsignOpSummary();
};

// 篩選類型
window.setConsignStockType = function(type) {
    window.consignOpFilter = type;
    
    // 更新按鈕樣式
    ['all', 'internal', 'external'].forEach(t => {
        const btn = document.getElementById(`btn-consign-${t}`);
        if (btn) {
            if (t === type) {
                btn.className = 'px-3 py-1.5 rounded text-xs font-bold bg-slate-600 text-white';
            } else {
                btn.className = 'px-3 py-1.5 rounded text-xs font-bold bg-slate-700 text-slate-300 hover:bg-slate-600';
            }
        }
    });
    
    renderConsignOpList();
};

// 搜尋過濾
window.filterConsignOpList = function() {
    renderConsignOpList();
};

// 全選/取消全選
window.toggleConsignOpAll = function(checked) {
    const checkboxes = document.querySelectorAll('.consign-op-checkbox:not(:disabled)');
    checkboxes.forEach(cb => {
        const idx = parseInt(cb.dataset.idx);
        cb.checked = checked;
        toggleConsignOpItem(idx, checked, false);
    });
    updateConsignOpSummary();
};

// 單選項目
window.toggleConsignOpItem = function(idx, checked, updateSummary = true) {
    const searchText = (document.getElementById('consign-op-search')?.value || '').toLowerCase().trim();
    const typeFilter = window.consignOpFilter || 'all';
    
    // 取得過濾後的資料
    let filtered = window.consignOpData.filter(item => {
        if (typeFilter === 'internal' && item.stockType !== 'internal') return false;
        if (typeFilter === 'external' && item.stockType !== 'external') return false;
        if (searchText) {
            const match = 
                (item.productName || '').toLowerCase().includes(searchText) ||
                (item.spec || '').toLowerCase().includes(searchText) ||
                (item.batchNo || '').toLowerCase().includes(searchText) ||
                (item.locationId || '').toLowerCase().includes(searchText);
            if (!match) return false;
        }
        return true;
    });
    
    const item = filtered[idx];
    if (!item) return;
    
    if (checked) {
        // 取得數量輸入框的值
        const qtyInput = document.querySelector(`input[type="number"][data-idx="${idx}"]`);
        const qty = parseInt(qtyInput?.value) || item.available;
        
        window.consignOpSelected[item.key] = {
            item: item,
            qty: Math.min(qty, item.available)
        };
        
        // 更新輸入框
        if (qtyInput && !qtyInput.value) {
            qtyInput.value = item.available;
        }
        
        // 更新列樣式
        const row = document.querySelector(`tr[data-key="${item.key}"]`);
        if (row) row.classList.add('bg-emerald-900/30');
    } else {
        delete window.consignOpSelected[item.key];
        
        // 更新列樣式
        const row = document.querySelector(`tr[data-key="${item.key}"]`);
        if (row) row.classList.remove('bg-emerald-900/30');
    }
    
    if (updateSummary) {
        updateConsignOpSummary();
    }
};

// 更新數量
window.updateConsignOpQty = function(idx, value) {
    const searchText = (document.getElementById('consign-op-search')?.value || '').toLowerCase().trim();
    const typeFilter = window.consignOpFilter || 'all';
    
    let filtered = window.consignOpData.filter(item => {
        if (typeFilter === 'internal' && item.stockType !== 'internal') return false;
        if (typeFilter === 'external' && item.stockType !== 'external') return false;
        if (searchText) {
            const match = 
                (item.productName || '').toLowerCase().includes(searchText) ||
                (item.spec || '').toLowerCase().includes(searchText) ||
                (item.batchNo || '').toLowerCase().includes(searchText) ||
                (item.locationId || '').toLowerCase().includes(searchText);
            if (!match) return false;
        }
        return true;
    });
    
    const item = filtered[idx];
    if (!item) return;
    
    const qty = parseInt(value) || 0;
    
    if (qty > 0 && qty <= item.available) {
        // 自動勾選
        const checkbox = document.querySelector(`.consign-op-checkbox[data-idx="${idx}"]`);
        if (checkbox && !checkbox.checked) {
            checkbox.checked = true;
        }
        
        window.consignOpSelected[item.key] = {
            item: item,
            qty: qty
        };
        
        const row = document.querySelector(`tr[data-key="${item.key}"]`);
        if (row) row.classList.add('bg-emerald-900/30');
    } else if (qty <= 0) {
        // 取消勾選
        const checkbox = document.querySelector(`.consign-op-checkbox[data-idx="${idx}"]`);
        if (checkbox) checkbox.checked = false;
        
        delete window.consignOpSelected[item.key];
        
        const row = document.querySelector(`tr[data-key="${item.key}"]`);
        if (row) row.classList.remove('bg-emerald-900/30');
    } else if (qty > item.available) {
        // 超過可寄數量
        const qtyInput = document.querySelector(`input[type="number"][data-idx="${idx}"]`);
        if (qtyInput) qtyInput.value = item.available;
        updateConsignOpQty(idx, item.available);
        return;
    }
    
    updateConsignOpSummary();
};

// 更新統計
window.updateConsignOpSummary = function() {
    const countEl = document.getElementById('consign-op-selected-count');
    const qtyEl = document.getElementById('consign-op-selected-qty');
    const btnConfirm = document.getElementById('btn-consign-op-confirm');
    
    const selectedKeys = Object.keys(window.consignOpSelected);
    const totalQty = selectedKeys.reduce((sum, key) => sum + (window.consignOpSelected[key]?.qty || 0), 0);
    
    if (countEl) countEl.textContent = selectedKeys.length;
    if (qtyEl) qtyEl.textContent = totalQty.toLocaleString();
    
    if (btnConfirm) {
        btnConfirm.disabled = selectedKeys.length === 0;
    }
};

// 開啟確認寄庫視窗
window.openConsignOpConfirm = function() {
    const selectedKeys = Object.keys(window.consignOpSelected);
    if (selectedKeys.length === 0) {
        alert('請先選擇要寄庫的品項');
        return;
    }
    
    const totalQty = selectedKeys.reduce((sum, key) => sum + (window.consignOpSelected[key]?.qty || 0), 0);
    
    // 取得預設日期
    const today = new Date();
    const freeUntilDay = (window.rentalSettings && window.rentalSettings.settlement) ? window.rentalSettings.settlement.freeUntilDay : 25;
    let freeUntil = new Date(today.getFullYear(), today.getMonth(), freeUntilDay);
    if (today.getDate() > freeUntilDay) {
        freeUntil = new Date(today.getFullYear(), today.getMonth() + 1, freeUntilDay);
    }
    const freeUntilStr = freeUntil.toLocalYMD();
    const todayStr = today.toLocalYMD();
    
    // 建立已選清單
    let itemsHtml = '';
    selectedKeys.forEach(key => {
        const sel = window.consignOpSelected[key];
        const item = sel.item;
        const isInternal = item.stockType === 'internal';
        const typeClass = isInternal ? 'text-blue-400' : 'text-purple-400';
        
        itemsHtml += `
            <div class="flex items-center justify-between py-1 border-b border-slate-700">
                <div class="flex-1 min-w-0">
                    <div class="text-white text-sm truncate">${item.productName}</div>
                    <div class="text-slate-500 text-xs">${item.spec || '-'} | ${item.batchNo || '-'}</div>
                    <div class="${typeClass} text-xs">${item.warehouseName}</div>
                </div>
                <div class="text-emerald-400 font-bold ml-2">${sel.qty}</div>
            </div>
        `;
    });
    
    const content = `
        <div class="flex gap-4" style="max-height: 500px;">
            <!-- 左側：寄庫資訊 -->
            <div class="w-72 space-y-3">
                <div>
                    <label class="text-slate-400 text-sm">客戶名稱 *</label>
                    <input type="text" id="consign-op-customer" class="scan-input w-full mt-1" placeholder="輸入客戶名稱...">
                </div>
                <div class="grid grid-cols-2 gap-2">
                    <div>
                        <label class="text-slate-400 text-sm">費率</label>
                        <input type="number" id="consign-op-rate" class="scan-input w-full mt-1" value="0.37" step="0.01">
                    </div>
                    <div>
                        <label class="text-slate-400 text-sm">寄倉日</label>
                        <input type="date" id="consign-op-date" class="scan-input w-full mt-1" value="${todayStr}">
                    </div>
                </div>
                <div>
                    <label class="text-slate-400 text-sm">免費至</label>
                    <input type="date" id="consign-op-free-until" class="scan-input w-full mt-1" value="${freeUntilStr}">
                </div>
                <div class="pt-2 border-t border-slate-700">
                    <div class="flex justify-between text-sm">
                        <span class="text-slate-400">共 ${selectedKeys.length} 筆</span>
                        <span class="text-emerald-400 font-bold">${totalQty.toLocaleString()} 件</span>
                    </div>
                </div>
            </div>
            
            <!-- 右側：已選清單 -->
            <div class="flex-1 flex flex-col min-w-0">
                <div class="text-slate-400 text-sm mb-2">已選品項</div>
                <div class="flex-1 overflow-y-auto bg-slate-800/50 rounded p-2 space-y-1" style="max-height: 350px;">
                    ${itemsHtml}
                </div>
            </div>
        </div>
        
        <div class="flex justify-end gap-2 mt-4 pt-3 border-t border-slate-700">
            <button onclick="WMS.closeModal('consign-op-confirm-modal')" class="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded">取消</button>
            <button onclick="saveConsignOp()" class="px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded font-bold">
                <i class="fa-solid fa-check mr-1"></i>確認寄庫
            </button>
        </div>
    `;
    
    WMS.createModal('consign-op-confirm-modal', {
        title: '確認寄庫',
        icon: 'fa-solid fa-box-archive text-amber-400',
        content: content,
        width: '650px'
    });
    
    setTimeout(() => {
        document.getElementById('consign-op-customer')?.focus();
    }, 100);
};

// 儲存寄庫
window.saveConsignOp = async function() {
    const customer = document.getElementById('consign-op-customer')?.value.trim();
    const rate = parseFloat(document.getElementById('consign-op-rate')?.value) || 0.37;
    const consignDate = document.getElementById('consign-op-date')?.value;
    const freeUntil = document.getElementById('consign-op-free-until')?.value;
    
    if (!customer) {
        alert('請輸入客戶名稱');
        document.getElementById('consign-op-customer')?.focus();
        return;
    }
    
    const selectedKeys = Object.keys(window.consignOpSelected);
    if (selectedKeys.length === 0) {
        alert('無選擇品項');
        return;
    }
    
    // 計算計費開始日
    const freeUntilDate = new Date(freeUntil);
    const chargeStartDate = new Date(freeUntilDate);
    chargeStartDate.setDate(chargeStartDate.getDate() + 1);
    const chargeStartStr = chargeStartDate.toLocalYMD();
    
    try {
        let savedCount = 0;
        let totalQty = 0;
        
        for (const key of selectedKeys) {
            const sel = window.consignOpSelected[key];
            const item = sel.item;
            
            const consignment = {
                source: item.stockType,
                sourceWarehouse: item.warehouseName,
                locationId: item.stockType === 'internal' ? (item.locationId || '') : '',
                productName: item.productName,
                spec: item.spec || '',
                batchNo: item.batchNo || '',
                expDate: item.expDate || '',
                customer: customer,
                originalQty: sel.qty,
                remainingQty: sel.qty,
                consignmentDate: consignDate,
                freeUntil: freeUntil,
                chargeStartDate: chargeStartStr,
                ratePerUnit: rate,
                note: '',
                pickups: [],
                status: 'active',
                createdAt: new Date().toISOString()
            };
            
            await window.saveConsignmentToFirebase(consignment);
            savedCount++;
            totalQty += sel.qty;
        }
        
        WMS.closeModal('consign-op-confirm-modal');
        showNotification(`✅ 已寄庫 ${savedCount} 筆，共 ${totalQty.toLocaleString()} 件 → ${customer}`, 'success');
        
        // 清空已選
        window.consignOpSelected = {};
        
        // 重新載入
        loadConsignOpList();
        
        // 刷新寄倉管理
        if (typeof loadConsignmentList === 'function') {
            setTimeout(() => loadConsignmentList(), 100);
        }
        
    } catch (e) {
        console.error('寄庫失敗:', e);
        alert('❌ 寄庫失敗：' + e.message);
    }
};

// 頁籤切換時自動載入
(function() {
    const _origSwitchTabForConsignOp = window.switchTab;
    window.switchTab = function(tab, event) {
        if (typeof _origSwitchTabForConsignOp === 'function') {
            _origSwitchTabForConsignOp(tab, event);
        }
        
        if (tab === 'consign-operation') {
            setTimeout(() => {
                loadConsignOpList();
            }, 100);
        }
    };
})();

window.loadConsignmentList = function() {
    const tbody = document.getElementById('consignment-list');
    if (!tbody) return;

    const statusFilter = document.getElementById('consign-status-filter')?.value || 'all';
    const sourceFilter = document.getElementById('consign-source-filter')?.value || 'all';
    const searchText = (document.getElementById('consign-search')?.value || '').toLowerCase();

    let data = [...window.consignmentData]; // 複製陣列避免排序影響原資料

    data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const today = new Date();
    const todayStr = today.toLocalYMD();

    if (statusFilter === 'free') {
        data = data.filter(c => c.status === 'active' && c.freeUntil >= todayStr);
    } else if (statusFilter === 'charging') {
        data = data.filter(c => c.status === 'active' && c.freeUntil < todayStr);
    } else if (statusFilter === 'completed') {
        data = data.filter(c => c.status === 'completed');
    }

    if (sourceFilter === 'internal') {
        data = data.filter(c => c.source !== 'external');
    } else if (sourceFilter === 'external') {
        data = data.filter(c => c.source === 'external');
    }

    if (searchText) {
        data = data.filter(c =>
            (c.customer || '').toLowerCase().includes(searchText) ||
            (c.productName || '').toLowerCase().includes(searchText) ||
            (c.batchNo || '').toLowerCase().includes(searchText) ||
            (c.sourceWarehouse || '').toLowerCase().includes(searchText) ||
            (c.targetWarehouse || '').toLowerCase().includes(searchText)
        );
    }

    let freeCount = 0, chargingCount = 0, expiringCount = 0, totalUnits = 0, totalRent = 0;
    const thisMonth = today.getMonth();

    window.consignmentData.forEach(c => {
        if (c.status !== 'active') return;
        totalUnits += c.remainingQty;

        if (c.freeUntil >= todayStr) {
            freeCount++;
        } else {
            chargingCount++;
            const chargeStart = new Date(c.chargeStartDate);
            const daysDiff = Math.max(0, Math.floor((today - chargeStart) / (1000 * 60 * 60 * 24)));
            totalRent += c.remainingQty * c.ratePerUnit * daysDiff;
        }

        const freeUntilDate = new Date(c.freeUntil);
        if (freeUntilDate.getMonth() === thisMonth) {
            expiringCount++;
        }
    });

    const el = (id) => document.getElementById(id);
    if (el('consign-free-count')) el('consign-free-count').textContent = freeCount;
    if (el('consign-charging-count')) el('consign-charging-count').textContent = chargingCount;
    if (el('consign-expiring-count')) el('consign-expiring-count').textContent = expiringCount;
    if (el('consign-total-units')) el('consign-total-units').textContent = totalUnits.toLocaleString();
    if (el('consign-total-rent')) el('consign-total-rent').textContent = '$' + Math.round(totalRent).toLocaleString();

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" class="text-center text-slate-500 py-10">尚無寄倉資料</td></tr>';
        return;
    }

    let html = '';
    data.forEach(c => {
        const isFree = c.freeUntil >= todayStr;
        const statusBadge = c.status === 'completed'
            ? '<span class="badge badge-slate">已結清</span>'
            : isFree
                ? '<span class="badge badge-green">免費期</span>'
                : '<span class="badge badge-yellow">計費中</span>';

        const sourceWarehouse = c.sourceWarehouse || (c.source === 'external' ? '外倉' : '內倉');
        const isInternal = c.source !== 'external';
        const sourceClass = isInternal ? 'text-blue-400' : 'text-purple-400';

        const targetWarehouse = c.targetWarehouse || '-';

        let chargeDays = 0;
        let accumulatedRent = 0;
        if (!isFree && c.status === 'active') {
            const chargeStart = new Date(c.chargeStartDate);
            chargeDays = Math.max(0, Math.floor((today - chargeStart) / (1000 * 60 * 60 * 24)));
            accumulatedRent = c.remainingQty * c.ratePerUnit * chargeDays;
        }

        html += `
            <tr class="border-b border-slate-700 hover:bg-slate-800">
                <td class="p-2 text-xs ${sourceClass}">${sourceWarehouse}</td>
                <td class="p-2 text-xs text-amber-400">${targetWarehouse}</td>
                <td class="p-2 font-bold text-white">${c.customer}</td>
                <td class="p-2 text-white text-sm">${c.productName}<span class="text-slate-500 text-xs ml-1">${c.spec || ''}</span></td>
                <td class="p-2 text-slate-400 text-xs font-mono">${c.batchNo || '-'}</td>
                <td class="p-2 text-right text-slate-400">${c.originalQty}</td>
                <td class="p-2 text-right font-bold text-white">${c.remainingQty}</td>
                <td class="p-2 text-xs ${isFree ? 'text-emerald-400' : 'text-orange-400'}">${c.freeUntil}</td>
                <td class="p-2 text-right text-slate-400">${chargeDays}</td>
                <td class="p-2 text-right font-bold text-yellow-400">$${Math.round(accumulatedRent).toLocaleString()}</td>
                <td class="p-2">${statusBadge}</td>
                <td class="p-2 text-center">
                    ${c.status === 'active' ? `
                        <button onclick="openPickupModal('${c.id}')" class="text-blue-400 hover:bg-blue-500/20 rounded px-2 py-1 mr-1" title="提貨">
                            <i class="fa-solid fa-truck-ramp-box"></i>
                        </button>
                        <button onclick="deleteConsignment('${c.id}')" class="text-red-400 hover:bg-red-500/20 rounded px-2 py-1" title="刪除">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    ` : '-'}
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
};

window.filterConsignments = function() {
    loadConsignmentList();
};

window.openPickupModal = function(consignmentId) {
    const c = window.consignmentData.find(item => item.id === consignmentId);
    if (!c) return;

    const todayStr = new Date().toLocalYMD();

    const content = `
        <div class="space-y-4">
            <div class="bg-slate-800 rounded-lg p-3">
                <div class="text-white font-bold">${c.customer}</div>
                <div class="text-sm text-slate-400">${c.productName} | ${c.spec || '-'}</div>
                <div class="text-sm text-slate-400">剩餘：<span class="text-emerald-400 font-bold">${c.remainingQty}</span> 件</div>
            </div>
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="text-sm text-slate-400 mb-1 block">提貨日期</label>
                    <input type="date" id="pickup-date" class="scan-input" value="${todayStr}">
                </div>
                <div>
                    <label class="text-sm text-slate-400 mb-1 block">提貨件數 *</label>
                    <input type="number" id="pickup-qty" class="scan-input" placeholder="${c.remainingQty}" min="1" max="${c.remainingQty}">
                </div>
            </div>
            <div class="flex gap-2">
                <button onclick="savePickup('${consignmentId}')" class="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold">
                    <i class="fa-solid fa-truck-ramp-box mr-1"></i>確認提貨
                </button>
                <button onclick="WMS.closeModal('pickup-modal')" class="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg">
                    取消
                </button>
            </div>
        </div>
    `;

    WMS.createModal('pickup-modal', {
        title: '客戶提貨',
        icon: 'fa-solid fa-truck-ramp-box text-blue-400',
        content: content,
        width: '400px'
    });
};

window.savePickup = async function(consignmentId) {
    const pickupDate = document.getElementById('pickup-date')?.value;
    const pickupQty = parseInt(document.getElementById('pickup-qty')?.value) || 0;

    const c = window.consignmentData.find(item => item.id === consignmentId);
    if (!c) return;

    if (pickupQty <= 0) {
        alert('請輸入提貨件數');
        return;
    }
    if (pickupQty > c.remainingQty) {
        alert(`提貨件數不能超過剩餘 ${c.remainingQty} 件`);
        return;
    }

    c.pickups.push({
        date: pickupDate,
        qty: pickupQty
    });

    c.remainingQty -= pickupQty;

    if (c.remainingQty <= 0) {
        c.status = 'completed';
        c.completedAt = new Date().toISOString();
    }

    try {
        await window.updateConsignmentInFirebase(consignmentId, {
            pickups: c.pickups,
            remainingQty: c.remainingQty,
            status: c.status,
            completedAt: c.completedAt || null
        });

        WMS.closeModal('pickup-modal');
        showNotification(`✅ 已提貨 ${pickupQty} 件`, 'success');
        loadConsignmentList();
    } catch(e) {
        console.error('提貨儲存失敗:', e);
        alert('❌ 儲存失敗：' + e.message);
    }
};

window.deleteConsignment = async function(consignmentId) {
    if (!confirm('確定要刪除此寄倉記錄嗎？')) return;

    try {
        await window.deleteConsignmentFromFirebase(consignmentId);
        showNotification('✅ 已刪除寄倉記錄', 'success');
        loadConsignmentList();
    } catch(e) {
        console.error('刪除失敗:', e);
        alert('❌ 刪除失敗：' + e.message);
    }
};

// 展開/收合客戶明細
window.toggleCustomerDetail = function(detailId) {
    const detail = document.getElementById(detailId);
    const icon = document.getElementById(detailId + '-icon');
    if (detail && icon) {
        if (detail.classList.contains('hidden')) {
            detail.classList.remove('hidden');
            icon.style.transform = 'rotate(90deg)';
        } else {
            detail.classList.add('hidden');
            icon.style.transform = 'rotate(0deg)';
        }
    }
};

window.loadRentalReport = async function() {
    const monthInput = document.getElementById('rental-month');
    if (!monthInput || !monthInput.value) return;

    const [year, month] = monthInput.value.split('-').map(Number);
    const settleDay = (window.rentalSettings && window.rentalSettings.settlement) ? window.rentalSettings.settlement.settleDay : 25;

    // 計算結算期間（上月結算日+1 到 本月結算日）
    // 例如：選擇 2025-01，期間為 2024/12/26 ~ 2025/01/25
    const startDate = new Date(year, month - 2, settleDay + 1);
    const endDate = new Date(year, month - 1, settleDay);
    const today = new Date();
    
    // 如果結算日還沒到，用今天作為結束日
    const actualEndDate = endDate > today ? today : endDate;
    const daysInPeriod = Math.max(1, Math.floor((actualEndDate - startDate) / (1000 * 60 * 60 * 24)) + 1);

    console.log('📊 倉租計算期間:', startDate.toLocaleDateString(), '~', actualEndDate.toLocaleDateString(), '共', daysInPeriod, '天');

    // ========== 1. 計算自有庫存倉租（崇文/八方）==========
    // 這是本倉庫中，崇文和八方自己的庫存的帳面成本
    let ownStockData = { '崇文': { pallets: 0, palletDays: 0, rent: 0, rate: 22 }, '八方': { pallets: 0, palletDays: 0, rent: 0, rate: 22 } };
    
    try {
        // 取得目前庫存（只計算本倉，排除外倉和寄倉）
        let currentPallets = [];
        if (window.db && window.collection && window.getDocs) {
            const snapshot = await window.getDocs(window.collection(window.db, 'pallets'));
            snapshot.forEach(doc => {
                const data = doc.data();
                // 只計算有數量且在本倉（I/J/K 區）的庫存
                if (data.quantity > 0 && data.locationId && /^[IJK]-/.test(data.locationId)) {
                    currentPallets.push(data);
                }
            });
        }

        // 計算各公司的板數和倉租
        const companies = ['崇文', '八方'];
        companies.forEach(company => {
            const companyPallets = currentPallets.filter(p => p.company === company);
            const palletCount = companyPallets.length;
            const palletDays = palletCount * daysInPeriod;
            
            // 取得費率設定
            let rate = 22; // 預設費率
            if (company === '八方' && window.rentalSettings && window.rentalSettings.storageRate) {
                rate = window.rentalSettings.storageRate.bafang || 22;
            } else if (company === '崇文' && window.rentalSettings && window.rentalSettings.storageRate) {
                const cwRates = window.rentalSettings.storageRate.chungwen;
                if (cwRates && palletCount > (cwRates.tier1Max || 300)) {
                    rate = cwRates.tier2Rate || 20;
                } else {
                    rate = cwRates ? (cwRates.tier1Rate || 22) : 22;
                }
            }
            
            const rent = palletDays * rate;
            
            ownStockData[company] = {
                pallets: palletCount,
                palletDays: palletDays,
                rent: rent,
                rate: rate
            };
        });
        
        console.log('📦 自有庫存:', ownStockData);
        
    } catch(e) {
        console.error('計算自有庫存失敗:', e);
    }

    // 顯示自有庫存倉租（改善顯示格式）
    let ownStockHtml = '';
    let totalOwnRent = 0;
    
    Object.entries(ownStockData).forEach(([company, data]) => {
        // 計算說明：板數 × 天數 = 板天數，板天數 × 費率 = 金額
        const calculation = data.pallets > 0 ? 
            `${data.pallets}板 × ${daysInPeriod}天 × $${data.rate}` : '-';
        ownStockHtml += `
            <tr class="border-b border-slate-700">
                <td class="p-2 text-white font-bold">${company}</td>
                <td class="p-2 text-right">${data.pallets > 0 ? data.pallets + ' 板' : '-'}</td>
                <td class="p-2 text-right text-slate-400 text-xs">${data.pallets > 0 ? data.palletDays.toLocaleString() + ' 板天' : '-'}</td>
                <td class="p-2 text-right text-blue-400">${data.rent > 0 ? '$' + Math.round(data.rent).toLocaleString() : '-'}</td>
            </tr>
        `;
        totalOwnRent += data.rent;
    });
    
    // 加入計費說明
    ownStockHtml += `
        <tr class="border-t border-slate-600">
            <td colspan="4" class="p-2 text-slate-500 text-xs">
                📅 計費期間：${startDate.toLocaleDateString('zh-TW')} ~ ${actualEndDate.toLocaleDateString('zh-TW')}（${daysInPeriod} 天）
            </td>
        </tr>
    `;
    
    document.getElementById('own-stock-rental-body').innerHTML = ownStockHtml;
    document.getElementById('own-stock-total').textContent = totalOwnRent > 0 ? '$' + Math.round(totalOwnRent).toLocaleString() : '$0';

    // ========== 2. 計算客戶寄倉費用（含詳細明細）==========
    const customerDetails = {}; // 按客戶分組的明細
    const allDetails = []; // 所有明細（用於匯出）

    if (window.consignmentData && window.consignmentData.length > 0) {
        window.consignmentData.forEach(c => {
            if (c.status !== 'active') return;
            if (!c.remainingQty || c.remainingQty <= 0) return;
            
            const freeUntil = new Date(c.freeUntil);
            
            // 只計算免費期已過的
            if (freeUntil >= actualEndDate) return;
            
            // 計費開始日 = 免費期結束後一天 或 計費期間開始日（取較晚者）
            const chargeStartDate = new Date(freeUntil);
            chargeStartDate.setDate(chargeStartDate.getDate() + 1);
            const effectiveStart = new Date(Math.max(chargeStartDate.getTime(), startDate.getTime()));
            const effectiveEnd = actualEndDate;
            
            if (effectiveStart >= effectiveEnd) return;
            
            const days = Math.max(0, Math.floor((effectiveEnd - effectiveStart) / (1000 * 60 * 60 * 24)) + 1);
            const ratePerUnit = c.ratePerUnit || 0.37; // 預設費率
            const rent = c.remainingQty * ratePerUnit * days;

            // 建立明細記錄
            const detail = {
                customer: c.customer,
                productName: c.productName,
                spec: c.spec || '',
                batchNo: c.batchNo || '',
                qty: c.remainingQty,
                ratePerUnit: ratePerUnit,
                chargeStart: effectiveStart,
                chargeEnd: effectiveEnd,
                days: days,
                rent: rent,
                freeUntil: c.freeUntil
            };
            
            allDetails.push(detail);

            // 按客戶分組
            if (!customerDetails[c.customer]) {
                customerDetails[c.customer] = { items: [], totalQty: 0, totalDays: 0, totalRent: 0 };
            }
            customerDetails[c.customer].items.push(detail);
            customerDetails[c.customer].totalQty += c.remainingQty;
            customerDetails[c.customer].totalDays += c.remainingQty * days;
            customerDetails[c.customer].totalRent += rent;
        });
    }

    // 顯示客戶列表（可展開明細）
    let detailHtml = '';
    let totalConsignRent = 0;
    let customerIndex = 0;

    if (Object.keys(customerDetails).length === 0) {
        detailHtml = '<div class="text-center text-slate-500 py-6">本月無客戶寄倉費用</div>';
    } else {
        Object.entries(customerDetails).forEach(([customer, data]) => {
            totalConsignRent += data.totalRent;
            customerIndex++;
            const detailId = 'customer-detail-' + customerIndex;
            
            // 客戶標題列（點擊展開）
            detailHtml += `
                <div class="mb-2 bg-slate-800/50 rounded-lg overflow-hidden">
                    <div class="flex justify-between items-center p-3 cursor-pointer hover:bg-slate-700/50 transition-colors"
                         onclick="toggleCustomerDetail('${detailId}')">
                        <div class="flex items-center gap-2">
                            <i class="fa-solid fa-chevron-right text-slate-500 text-xs transition-transform" id="${detailId}-icon"></i>
                            <span class="text-white font-bold">${customer}</span>
                            <span class="text-slate-500 text-xs">(${data.items.length} 筆)</span>
                        </div>
                        <span class="text-amber-400 font-bold text-lg">$${Math.round(data.totalRent).toLocaleString()}</span>
                    </div>
                    
                    <!-- 明細（預設隱藏）-->
                    <div id="${detailId}" class="hidden border-t border-slate-700 p-3 bg-slate-900/30">
                        <table class="w-full text-xs">
                            <thead>
                                <tr class="text-slate-500">
                                    <th class="text-left py-1">品名</th>
                                    <th class="text-right py-1">件數</th>
                                    <th class="text-right py-1">費率</th>
                                    <th class="text-right py-1">天數</th>
                                    <th class="text-right py-1">金額</th>
                                </tr>
                            </thead>
                            <tbody>`;
            
            // 排序明細（相同品項排在一起）
            data.items.sort(function(a, b) {
                var nameCompare = (a.productName || '').localeCompare(b.productName || '', 'zh-TW');
                if (nameCompare !== 0) return nameCompare;
                var specCompare = (a.spec || '').localeCompare(b.spec || '', 'zh-TW');
                if (specCompare !== 0) return specCompare;
                return (a.batchNo || '').localeCompare(b.batchNo || '', 'zh-TW');
            });
            
            data.items.forEach(item => {
                const startStr = item.chargeStart.toLocaleDateString('zh-TW', {month:'numeric', day:'numeric'});
                const endStr = item.chargeEnd.toLocaleDateString('zh-TW', {month:'numeric', day:'numeric'});
                detailHtml += `
                                <tr class="text-slate-300 border-t border-slate-700/50">
                                    <td class="py-1.5">
                                        <div>${item.productName}</div>
                                        <div class="text-slate-500 text-[10px]">${startStr}~${endStr}</div>
                                    </td>
                                    <td class="text-right">${item.qty}</td>
                                    <td class="text-right text-slate-400">$${item.ratePerUnit.toFixed(2)}</td>
                                    <td class="text-right">${item.days}</td>
                                    <td class="text-right text-white">$${Math.round(item.rent).toLocaleString()}</td>
                                </tr>`;
            });
            
            detailHtml += `
                            </tbody>
                            <tfoot>
                                <tr class="border-t border-slate-600 text-slate-400">
                                    <td class="py-1.5 font-bold">小計</td>
                                    <td class="text-right">${data.totalQty} 件</td>
                                    <td></td>
                                    <td class="text-right text-[10px]">${data.totalDays} 件天</td>
                                    <td class="text-right text-amber-400 font-bold">$${Math.round(data.totalRent).toLocaleString()}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>`;
        });
        
        // 計算說明
        detailHtml += `
            <div class="text-slate-500 text-[10px] mt-2 p-2 bg-slate-800/30 rounded">
                💡 計算方式：件數 × 費率(元/件/天) × 計費天數 = 倉租金額<br>
                📅 計費期間：${startDate.toLocaleDateString('zh-TW')} ~ ${actualEndDate.toLocaleDateString('zh-TW')}
            </div>`;
    }

    document.getElementById('consign-rental-detail').innerHTML = detailHtml;
    document.getElementById('consign-total').textContent = '$' + Math.round(totalConsignRent).toLocaleString();

    // 儲存明細供匯出使用
    window._rentalReportDetails = allDetails;

    // ========== 3. 計算理貨費用 ==========
    let inboundCount = 0;
    try {
        if (window.db && window.collection && window.getDocs) {
            const logsSnapshot = await window.getDocs(window.collection(window.db, 'inventoryLogs'));
            logsSnapshot.forEach(doc => {
                const data = doc.data();
                if (data.type === 'inbound' && data.timestamp) {
                    const logDate = new Date(data.timestamp);
                    if (logDate >= startDate && logDate <= actualEndDate) {
                        inboundCount++;
                    }
                }
            });
        }
    } catch(e) {
        console.error('計算理貨費用失敗:', e);
    }
    
    const inboundFee = inboundCount * (window.rentalSettings && window.rentalSettings.handlingFee ? window.rentalSettings.handlingFee.inbound : 200);
    document.getElementById('handling-inbound-count').textContent = inboundCount;
    document.getElementById('handling-inbound-fee').textContent = '$' + inboundFee.toLocaleString();

    // ========== 4. 計算總計 ==========
    const monthlyTotal = totalConsignRent + inboundFee;
    document.getElementById('monthly-total').textContent = '$' + Math.round(monthlyTotal).toLocaleString();
    
    // 儲存計算結果供匯出使用
    window._rentalReportData = {
        period: { start: startDate, end: actualEndDate, days: daysInPeriod },
        ownStock: ownStockData,
        consignmentDetails: customerDetails,
        handling: { inboundCount, inboundFee },
        totals: { ownRent: totalOwnRent, consignRent: totalConsignRent, handling: inboundFee, grand: monthlyTotal }
    };
};

window.generateMonthlyBill = function() {
    const monthInput = document.getElementById('rental-month');
    if (!monthInput || !monthInput.value) {
        alert('請先選擇月份');
        return;
    }

    if (!window._rentalReportData) {
        alert('請先載入報表資料');
        return;
    }

    const data = window._rentalReportData;
    const [year, month] = monthInput.value.split('-').map(Number);
    const monthStr = year + '年' + month + '月';
    const periodStr = data.period.start.toLocaleDateString('zh-TW') + ' ~ ' + data.period.end.toLocaleDateString('zh-TW');

    // 建立 Excel 資料
    const wb = XLSX.utils.book_new();
    
    // ===== 工作表1：費用總表 =====
    const summaryRows = [
        ['倉租費用總表'],
        ['計費月份：' + monthStr],
        ['計費期間：' + periodStr],
        [],
        ['項目', '說明', '金額'],
        ['自有庫存倉租', '帳面成本，不收費', data.totals.ownRent],
        ['客戶寄倉費用', '應收帳款', data.totals.consignRent],
        ['理貨費用', '入庫 ' + data.handling.inboundCount + ' 板 × $200', data.totals.handling],
        [],
        ['本月應收總計', '', data.totals.consignRent + data.totals.handling],
        [],
        [],
        ['【自有庫存明細】'],
        ['公司', '現有板數', '板天數', '費率(元/板/天)', '倉租金額'],
    ];
    
    Object.entries(data.ownStock).forEach(([company, info]) => {
        if (info.pallets > 0) {
            summaryRows.push([company, info.pallets, info.palletDays, info.rate || 22, info.rent]);
        } else {
            summaryRows.push([company, 0, '-', '-', 0]);
        }
    });
    
    const ws1 = XLSX.utils.aoa_to_sheet(summaryRows);
    ws1['!cols'] = [{wch:20}, {wch:15}, {wch:15}];
    XLSX.utils.book_append_sheet(wb, ws1, '費用總表');
    
    // ===== 每個客戶一個獨立工作表 =====
    if (data.consignmentDetails && Object.keys(data.consignmentDetails).length > 0) {
        Object.entries(data.consignmentDetails).forEach(([customer, custData]) => {
            const custRows = [
                ['客戶寄倉帳單'],
                ['客戶名稱：' + customer],
                ['計費月份：' + monthStr],
                ['計費期間：' + periodStr],
                [],
                ['品名', '規格', '件數', '費率(元/件/天)', '計費起日', '計費迄日', '天數', '金額'],
            ];
            
            custData.items.forEach(item => {
                const startStr = item.chargeStart.toLocaleDateString('zh-TW');
                const endStr = item.chargeEnd.toLocaleDateString('zh-TW');
                
                custRows.push([
                    item.productName,
                    item.spec || '',
                    item.qty,
                    item.ratePerUnit.toFixed(4),
                    startStr,
                    endStr,
                    item.days,
                    Math.round(item.rent)
                ]);
            });
            
            custRows.push([]);
            custRows.push(['', '', custData.totalQty + ' 件', '', '', '合計', custData.totalDays + ' 件天', Math.round(custData.totalRent)]);
            custRows.push([]);
            custRows.push(['計算公式：件數 × 費率(元/件/天) × 計費天數 = 倉租金額']);
            
            // 工作表名稱（Excel 限制 31 字元，且不能有特殊字元）
            let sheetName = customer.replace(/[\\\/\?\*\[\]:]/g, '').substring(0, 28);
            if (!sheetName) sheetName = '客戶';
            
            const wsCustomer = XLSX.utils.aoa_to_sheet(custRows);
            wsCustomer['!cols'] = [{wch:18}, {wch:12}, {wch:8}, {wch:14}, {wch:12}, {wch:12}, {wch:8}, {wch:12}];
            XLSX.utils.book_append_sheet(wb, wsCustomer, sheetName);
        });
    }

    // 下載檔案
    const fileName = '倉租報表_' + year + ('0'+month).slice(-2) + '.xlsx';
    XLSX.writeFile(wb, fileName);
    
    showNotification('✅ 已產生帳單：' + fileName, 'success');
};

window.exportConsignments = function() {
    if (window.consignmentData.length === 0) {
        alert('沒有資料可匯出');
        return;
    }

    const data = window.consignmentData.map(c => ({
        '客戶': c.customer,
        '品名': c.productName,
        '規格': c.spec || '',
        '原始數量': c.originalQty,
        '剩餘數量': c.remainingQty,
        '寄倉日期': c.consignmentDate,
        '免費截止': c.freeUntil,
        '費率(元/件/天)': c.ratePerUnit?.toFixed(4) || '',
        '狀態': c.status === 'completed' ? '已結清' : '進行中',
        '備註': c.note || ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '寄倉清單');
    XLSX.writeFile(wb, `寄倉清單_${new Date().toLocalYMD()}.xlsx`);

    showNotification('✅ 已匯出寄倉清單', 'success');
};

const originalSwitchTab = window.switchTab;
window.switchTab = function(viewId, event) {
    originalSwitchTab(viewId, event);

    if (viewId === 'consignment') {
        loadConsignmentList();
    } else if (viewId === 'rental-settings') {
        loadRentalSettingsUI();
    } else if (viewId === 'rental-report') {
        const monthInput = document.getElementById('rental-month');
        if (monthInput && !monthInput.value) {
            const today = new Date();
            monthInput.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        }
    } else if (viewId === 'transfer') {
        if (window.initTransferPage) {
            window.initTransferPage();
        }
    } else if (viewId === 'picking-rm') {
        // 切換到原料領用頁面時自動載入
        setTimeout(function() {
            if (typeof window.loadRmStockData === 'function') {
                window.loadRmStockData();
            }
        }, 100);
    }
};

console.log('💰 倉租管理模組已載入');


