// ============================================================
// js/15-reports-import.js — 報表中心、虛擬儲位、Excel 匯入庫存
// 由原 app.js 第 21246–22747 行拆出；各檔依 index.html 的順序載入，共用全域（window）
// ============================================================
// ========== 報表中心功能 ==========

window._reportData = { currentType: null, currentData: [], dateFrom: null, dateTo: null };

function initReportDates() {
    var today = new Date().toLocalYMD();
    var fromEl = document.getElementById('report-date-from');
    var toEl = document.getElementById('report-date-to');
    if (fromEl) fromEl.value = today;
    if (toEl) toEl.value = today;
}

// 報表中心 Tab 切換
window.switchReportTab = function(tab) {
    // 更新 Tab 樣式
    document.querySelectorAll('.report-tab').forEach(function(btn) {
        if (btn.dataset.tab === tab) {
            btn.className = 'report-tab flex-1 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 text-white';
            if (tab === 'shipping') btn.classList.add('bg-blue-600');
            else if (tab === 'inbound') btn.classList.add('bg-emerald-600');
            else if (tab === 'inventory') btn.classList.add('bg-orange-600');
            else if (tab === 'wave') btn.classList.add('bg-purple-600');
            else if (tab === 'order') btn.classList.add('bg-yellow-600');
            else if (tab === 'picking') btn.classList.add('bg-cyan-600');
        } else {
            btn.className = 'report-tab flex-1 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 text-slate-400 hover:bg-slate-700';
        }
    });
    
    // 切換卡片顯示
    document.querySelectorAll('.report-card-group').forEach(function(group) {
        group.classList.add('hidden');
    });
    var targetGroup = document.getElementById('report-cards-' + tab);
    if (targetGroup) targetGroup.classList.remove('hidden');
};

// 報表日期快速選擇（按鈕版本）
window.setReportQuickDate = function(range) {
    var today = new Date();
    var from, to;

    if (range === 'today') {
        from = to = today;
    } else if (range === 'yesterday') {
        from = to = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    } else if (range === 'week') {
        var day = today.getDay();
        from = new Date(today.getTime() - day * 24 * 60 * 60 * 1000);
        to = today;
    } else if (range === 'month') {
        from = new Date(today.getFullYear(), today.getMonth(), 1);
        to = today;
    } else if (range === 'lastmonth') {
        from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        to = new Date(today.getFullYear(), today.getMonth(), 0);
    } else {
        return;
    }

    document.getElementById('report-date-from').value = from.toLocalYMD();
    document.getElementById('report-date-to').value = to.toLocalYMD();
    
    // 更新按鈕樣式
    document.querySelectorAll('.report-date-btn').forEach(function(btn) {
        if (btn.dataset.range === range) {
            btn.className = 'report-date-btn px-3 py-1.5 rounded text-xs font-bold bg-emerald-600 text-white';
        } else {
            btn.className = 'report-date-btn px-3 py-1.5 rounded text-xs font-bold text-slate-400 hover:bg-slate-600';
        }
    });
};

window.setQuickDateRange = function() {
    var range = document.getElementById('report-quick-date').value;
    var today = new Date();
    var from, to;

    if (range === 'today') {
        from = to = today;
    } else if (range === 'yesterday') {
        from = to = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    } else if (range === 'week') {
        var day = today.getDay();
        from = new Date(today.getTime() - day * 24 * 60 * 60 * 1000);
        to = today;
    } else if (range === 'month') {
        from = new Date(today.getFullYear(), today.getMonth(), 1);
        to = today;
    } else if (range === 'lastmonth') {
        from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        to = new Date(today.getFullYear(), today.getMonth(), 0);
    } else {
        return;
    }

    document.getElementById('report-date-from').value = from.toLocalYMD();
    document.getElementById('report-date-to').value = to.toLocalYMD();
};

// 從下拉選單產生報表
window.generateReportFromSelect = function() {
    var select = document.getElementById('report-type-select');
    var reportType = select.value;
    
    if (!reportType) {
        alert('請先選擇報表類型');
        return;
    }
    
    // 特殊報表處理
    if (reportType === 'today-report') {
        generateTodayReport();
        return;
    }
    if (reportType === 'low-stock') {
        generateLowStockReport();
        return;
    }
    
    // 一般報表
    generateReport(reportType);
};

window.generateReport = function(reportType) {
    var dateFrom = document.getElementById('report-date-from').value;
    var dateTo = document.getElementById('report-date-to').value;

    if (!dateFrom || !dateTo) {
        alert('請選擇日期區間');
        return;
    }

    window._reportData.currentType = reportType;
    window._reportData.dateFrom = dateFrom;
    window._reportData.dateTo = dateTo;

    var preview = document.getElementById('report-preview-area');
    preview.innerHTML = '<div class="text-center py-10"><i class="fa-solid fa-spinner fa-spin text-4xl text-emerald-400"></i><div class="mt-4 text-slate-400">產生報表中...</div></div>';

    setTimeout(function() {
        if (reportType === 'shipping-logistics') generateShippingByLogistics(dateFrom, dateTo);
        else if (reportType === 'shipping-customer') generateShippingByCustomer(dateFrom, dateTo);
        else if (reportType === 'shipping-product') generateShippingByProduct(dateFrom, dateTo);
        else if (reportType === 'inbound-summary') generateInboundSummary(dateFrom, dateTo);
        else if (reportType === 'inbound-detail') generateInboundDetail(dateFrom, dateTo);
        else if (reportType === 'inbound-by-product') generateInboundByProduct(dateFrom, dateTo);
        else if (reportType === 'inbound-by-vendor') generateInboundByVendor(dateFrom, dateTo);
        else if (reportType === 'inventory-summary') generateInventorySummary();
        else if (reportType === 'inventory-expiry') generateExpiryReport();
        else if (reportType === 'inventory-location') generateInventoryLocation();
        else if (reportType === 'wave-summary') generateWaveSummary(dateFrom, dateTo);
        else if (reportType === 'wave-efficiency') generateWaveEfficiency(dateFrom, dateTo);
        else if (reportType === 'order-status') generateOrderStatus(dateFrom, dateTo);
        else if (reportType === 'pending-orders') generatePendingOrders();
        else if (reportType === 'picking-summary') generatePickingSummary(dateFrom, dateTo);
        else if (reportType === 'picking-detail') generatePickingDetail(dateFrom, dateTo);
        else if (reportType === 'picking-by-user') generatePickingByUser(dateFrom, dateTo);
        else if (reportType === 'picking-by-product') generatePickingByProduct(dateFrom, dateTo);
        else preview.innerHTML = '<div class="text-center text-red-400 py-10">未知的報表類型</div>';
    }, 200);
};

// 報表日期一律用本地日期（completedAt／inboundDate 是 UTC 時間，台灣早上 8 點前直接切字串會變成前一天）
function repDay(v) { return window.normalizeDateValue(v) || ''; }

// 期間內已完成的波次（依完成日）
function doneWavesIn(dateFrom, dateTo) {
    return (window._waveData.waves || []).filter(function(w) {
        if (w.status !== 'done') return false;
        var date = repDay(w.completedAt || w.createdAt);
        return date >= dateFrom && date <= dateTo;
    });
}

// 波次實際出貨的明細：新波次完成時記在 shipped（已扣掉缺貨）；舊波次沒有就用規劃的件數
function waveShippedOrders(w) {
    if (Array.isArray(w.shipped)) return w.shipped;
    return (w.orders || []).map(function(o) {
        return { orderNo: o.orderNo, customer: o.customer, logistics: o.logistics, items: (o.items || []).map(function(i) {
            return { productName: i.productName, spec: i.spec || '', qty: i.packageQty || i.quantity || 0 };
        }) };
    });
}

function generateShippingByLogistics(dateFrom, dateTo) {
    var waves = doneWavesIn(dateFrom, dateTo);

    var stats = {};
    waves.forEach(function(w) {
        var logistics = w.logistics || '未指定';
        if (!stats[logistics]) stats[logistics] = { waveCount: 0, orderCount: 0, totalQty: 0 };
        var sh = waveShippedOrders(w);
        stats[logistics].waveCount++;
        stats[logistics].orderCount += sh.length;
        sh.forEach(function(o) { o.items.forEach(function(i) { stats[logistics].totalQty += i.qty || 0; }); });
    });

    var data = Object.keys(stats).map(function(logistics) {
        var s = stats[logistics];
        return { '物流商': logistics, '波次數': s.waveCount, '訂單數': s.orderCount, '總件數': s.totalQty };
    });

    window._reportData.currentData = data;
    renderReportTable('出貨統計 - 依物流商', ['物流商', '波次數', '訂單數', '總件數'], data);
}

function generateShippingByCustomer(dateFrom, dateTo) {
    var waves = doneWavesIn(dateFrom, dateTo);

    var stats = {};
    waves.forEach(function(w) {
        waveShippedOrders(w).forEach(function(order) {
            var customer = order.customer || '未知';
            if (!stats[customer]) stats[customer] = { orderCount: 0, totalQty: 0 };
            stats[customer].orderCount++;
            order.items.forEach(function(item) { stats[customer].totalQty += item.qty || 0; });
        });
    });

    var data = Object.keys(stats).map(function(customer) {
        var s = stats[customer];
        return { '客戶': customer, '訂單數': s.orderCount, '總件數': s.totalQty };
    }).sort(function(a, b) { return b['總件數'] - a['總件數']; });

    window._reportData.currentData = data;
    renderReportTable('出貨統計 - 依客戶', ['客戶', '訂單數', '總件數'], data);
}

function generateShippingByProduct(dateFrom, dateTo) {
    var waves = doneWavesIn(dateFrom, dateTo);

    var stats = {};
    waves.forEach(function(w) {
        waveShippedOrders(w).forEach(function(order) {
            order.items.forEach(function(item) {
                var key = item.productName + '|||' + (item.spec || '');
                if (!stats[key]) stats[key] = { productName: item.productName, spec: item.spec || '', count: 0, totalQty: 0 };
                stats[key].count++;
                stats[key].totalQty += item.qty || 0;
            });
        });
    });

    var data = Object.values(stats).map(function(s) {
        return { '品名': s.productName, '規格': s.spec, '出貨次數': s.count, '總件數': s.totalQty };
    }).sort(function(a, b) {
        // 先按品名/規格排序（相同品項排在一起）
        var nameCompare = (a['品名'] || '').localeCompare(b['品名'] || '', 'zh-TW');
        if (nameCompare !== 0) return nameCompare;
        return (a['規格'] || '').localeCompare(b['規格'] || '', 'zh-TW');
    });

    window._reportData.currentData = data;
    renderReportTable('出貨統計 - 依產品', ['品名', '規格', '出貨次數', '總件數'], data);
}

// ========== 入庫報表函數 ==========
// 依「入庫異動記錄」統計（不是看目前的庫存：出完貨、合併掉的板也要算；數量是當時入庫的數量）
async function inboundLogsBetween(dateFrom, dateTo) {
    var logs = await fetchLogsBetween(['inbound'], dateFrom, dateTo);
    // 舊記錄沒有廠商：用目前還在的棧板補
    var byPallet = {};
    (window.currentPallets ? window.currentPallets() : []).forEach(function(p) { if (p.palletId) byPallet[p.palletId] = p; });
    return logs.map(function(l) {
        var p = byPallet[l.palletId] || {};
        return { date: logDay(l), productName: l.productName || '', spec: l.spec || '', batchNo: l.batchNo || '',
            qty: parseFloat(l.quantityChange) || parseFloat(l.quantity) || 0, weight: parseFloat(l.weightChange) || parseFloat(l.weight) || 0,
            locationId: l.locationId || '', vendor: l.vendor || p.vendor || '', palletId: l.palletId || '' };
    });
}

async function generateInboundSummary(dateFrom, dateTo) {
    var rows = await inboundLogsBetween(dateFrom, dateTo);
    var stats = {};
    rows.forEach(function(r) {
        if (!stats[r.date]) stats[r.date] = { date: r.date, palletCount: 0, totalQty: 0, totalWeight: 0 };
        stats[r.date].palletCount++;
        stats[r.date].totalQty += r.qty;
        stats[r.date].totalWeight += r.weight;
    });
    var data = Object.values(stats).sort(function(a, b) { return b.date.localeCompare(a.date); }).map(function(s) {
        return { '日期': s.date, '板數': s.palletCount, '總件數': s.totalQty, '總重量(kg)': Math.round(s.totalWeight * 10) / 10 };
    });
    window._reportData.currentData = data;
    renderReportTable('入庫統計 - 按日期', ['日期', '板數', '總件數', '總重量(kg)'], data);
}

async function generateInboundDetail(dateFrom, dateTo) {
    var rows = await inboundLogsBetween(dateFrom, dateTo);
    var data = rows.sort(function(a, b) { return b.date.localeCompare(a.date); }).map(function(r) {
        return { '入庫日期': r.date, '品名': r.productName, '規格': r.spec, '批號': r.batchNo, '數量': r.qty, '儲位': r.locationId, '廠商': r.vendor };
    });
    window._reportData.currentData = data;
    renderReportTable('入庫明細', ['入庫日期', '品名', '規格', '批號', '數量', '儲位', '廠商'], data);
}

async function generateInboundByProduct(dateFrom, dateTo) {
    var rows = await inboundLogsBetween(dateFrom, dateTo);
    var stats = {};
    rows.forEach(function(r) {
        var key = r.productName + '|||' + r.spec;
        if (!stats[key]) stats[key] = { productName: r.productName, spec: r.spec, palletCount: 0, totalQty: 0, totalWeight: 0 };
        stats[key].palletCount++;
        stats[key].totalQty += r.qty;
        stats[key].totalWeight += r.weight;
    });
    var data = Object.values(stats).sort(function(a, b) {
        return a.productName.localeCompare(b.productName, 'zh-TW') || a.spec.localeCompare(b.spec, 'zh-TW');
    }).map(function(s) {
        return { '品名': s.productName, '規格': s.spec, '板數': s.palletCount, '總件數': s.totalQty, '總重量(kg)': Math.round(s.totalWeight * 10) / 10 };
    });
    window._reportData.currentData = data;
    renderReportTable('入庫統計 - 依品項', ['品名', '規格', '板數', '總件數', '總重量(kg)'], data);
}

async function generateInboundByVendor(dateFrom, dateTo) {
    var rows = await inboundLogsBetween(dateFrom, dateTo);
    var stats = {};
    rows.forEach(function(r) {
        var vendor = r.vendor || '未指定';
        if (!stats[vendor]) stats[vendor] = { vendor: vendor, palletCount: 0, totalQty: 0, totalWeight: 0, productCount: {} };
        stats[vendor].palletCount++;
        stats[vendor].totalQty += r.qty;
        stats[vendor].totalWeight += r.weight;
        stats[vendor].productCount[r.productName] = true;
    });
    var data = Object.values(stats).sort(function(a, b) { return b.totalQty - a.totalQty; }).map(function(s) {
        return { '廠商': s.vendor, '品項種類': Object.keys(s.productCount).length, '板數': s.palletCount, '總件數': s.totalQty, '總重量(kg)': Math.round(s.totalWeight * 10) / 10 };
    });
    window._reportData.currentData = data;
    renderReportTable('入庫統計 - 依廠商', ['廠商', '品項種類', '板數', '總件數', '總重量(kg)'], data);
}

function generateInventorySummary() {
    var pallets = window.currentPallets ? window.currentPallets() : [];

    var stats = {};
    pallets.forEach(function(p) {
        var key = p.productName + '|||' + (p.spec || '');
        if (!stats[key]) stats[key] = { productName: p.productName, spec: p.spec || '', totalQty: 0, palletCount: 0 };
        stats[key].totalQty += parseInt(p.quantity) || 0;
        stats[key].palletCount++;
    });

    // 排序：先按品名、再按規格（相同品項排在一起）
    var data = Object.values(stats).map(function(s) {
        return { '品名': s.productName, '規格': s.spec, '總數量': s.totalQty, '板數': s.palletCount };
    }).sort(function(a, b) {
        var nameCompare = (a['品名'] || '').localeCompare(b['品名'] || '', 'zh-TW');
        if (nameCompare !== 0) return nameCompare;
        return (a['規格'] || '').localeCompare(b['規格'] || '', 'zh-TW');
    });

    window._reportData.currentData = data;
    window._reportData.dateFrom = '-';
    window._reportData.dateTo = '-';
    renderReportTable('庫存彙總', ['品名', '規格', '總數量', '板數'], data);
}

function generateExpiryReport() {
    var pallets = window.currentPallets ? window.currentPallets() : [];
    var today = new Date();

    var data = pallets.filter(function(p) { return p.expDate || p.expiryDate; }).map(function(p) {
        // 與效期管理、首頁同一個算法：今天到期＝0 天（還沒過期），昨天到期＝-1
        var daysLeft = window.daysUntil(p.expiryDate || p.expDate);
        var status = daysLeft < 0 ? '已過期' : daysLeft <= 30 ? '30天內' : daysLeft <= 60 ? '60天內' : '正常';
        return { '品名': p.productName, '規格': p.spec || '', '效期': p.expDate, '剩餘天數': daysLeft, '狀態': status, '數量': p.quantity };
    }).filter(function(p) { return p['剩餘天數'] <= 60; }).sort(function(a, b) {
        // 先按剩餘天數排序，再按品名/規格分組
        if (a['剩餘天數'] !== b['剩餘天數']) return a['剩餘天數'] - b['剩餘天數'];
        var nameCompare = (a['品名'] || '').localeCompare(b['品名'] || '', 'zh-TW');
        if (nameCompare !== 0) return nameCompare;
        return (a['規格'] || '').localeCompare(b['規格'] || '', 'zh-TW');
    });

    window._reportData.currentData = data;
    window._reportData.dateFrom = '-';
    window._reportData.dateTo = '-';
    renderReportTable('效期預警報表', ['品名', '規格', '效期', '剩餘天數', '狀態', '數量'], data);
}

function generateInventoryLocation() {
    var pallets = window.currentPallets ? window.currentPallets() : [];
    
    var byLocation = {};
    pallets.forEach(function(p) {
        var loc = p.locationId || '未指定';
        if (!byLocation[loc]) byLocation[loc] = { palletCount: 0, totalQty: 0, products: {} };
        byLocation[loc].palletCount++;
        byLocation[loc].totalQty += parseInt(p.quantity) || 0;
        var prodKey = p.productName || '未知';
        if (!byLocation[loc].products[prodKey]) byLocation[loc].products[prodKey] = 0;
        byLocation[loc].products[prodKey] += parseInt(p.quantity) || 0;
    });
    
    var data = Object.keys(byLocation).sort().map(function(loc) {
        var info = byLocation[loc];
        var topProducts = Object.entries(info.products)
            .sort(function(a, b) { return b[1] - a[1]; })
            .slice(0, 3)
            .map(function(e) { return e[0]; })
            .join(', ');
        return {
            '儲位': loc,
            '棧板數': info.palletCount,
            '總數量': info.totalQty,
            '主要品項': topProducts || '-'
        };
    });
    
    window._reportData.currentData = data;
    window._reportData.dateFrom = '-';
    window._reportData.dateTo = '-';
    renderReportTable('儲位分布報表', ['儲位', '棧板數', '總數量', '主要品項'], data);
}

function generateWaveSummary(dateFrom, dateTo) {
    var waves = (window._waveData.waves || []).filter(function(w) {
        var date = repDay(w.createdAt);
        return date >= dateFrom && date <= dateTo;
    });

    var statusMap = { pending: '待揀貨', picking: '揀貨中', sorting: '待分貨', done: '已出貨' };

    var data = waves.map(function(w) {
        var duration = '-';
        if (w.completedAt && w.createdAt) {
            duration = Math.round((new Date(w.completedAt) - new Date(w.createdAt)) / 60000) + ' 分鐘';
        }
        return {
            '波次編號': w.waveNo,
            '物流商': w.logistics,
            '狀態': statusMap[w.status] || w.status,
            '訂單數': (w.orders || []).length,
            '總件數': w.totalQty || 0,
            '建立時間': new Date(w.createdAt).toLocaleString('zh-TW'),
            '耗時': duration
        };
    });

    window._reportData.currentData = data;
    renderReportTable('波次統計', ['波次編號', '物流商', '狀態', '訂單數', '總件數', '建立時間', '耗時'], data);
}

function generateWaveEfficiency(dateFrom, dateTo) {
    var waves = (window._waveData.waves || []).filter(function(w) {
        if (w.status !== 'done') return false;
        var date = repDay(w.completedAt);
        return date >= dateFrom && date <= dateTo;
    });

    var data = waves.map(function(w) {
        var minutes = w.completedAt && w.createdAt ? Math.round((new Date(w.completedAt) - new Date(w.createdAt)) / 60000) : 0;
        var efficiency = minutes > 0 ? ((w.totalQty || 0) / minutes).toFixed(1) : '-';
        return { '波次編號': w.waveNo, '物流商': w.logistics, '總件數': w.totalQty || 0, '耗時分鐘': minutes, '效率': efficiency + ' 件/分' };
    });

    window._reportData.currentData = data;
    renderReportTable('揀貨效率分析', ['波次編號', '物流商', '總件數', '耗時分鐘', '效率'], data);
}

function reportMeta() {
    var r = window._reportData, meta = [];
    // 庫存類報表是「目前」的狀況，不看日期區間
    var snapshot = ['inventory-summary', 'inventory-expiry', 'inventory-location', 'low-stock', 'pending-orders', 'order-status'].indexOf(r.currentType) >= 0;
    if (!snapshot && r.dateFrom && r.dateFrom !== '-') meta.push(['查詢期間', r.dateFrom === r.dateTo ? r.dateFrom : r.dateFrom + ' ～ ' + r.dateTo]);
    else meta.push(['資料時間', '截至 ' + new Date().toLocalYMD()]);
    return meta;
}

function renderReportTable(title, columns, data) {
    window._reportData.title = title;
    window._reportData.columns = columns;
    var preview = document.getElementById('report-preview-area');
    var titleEl = document.getElementById('report-preview-title');
    var dateInfoEl = document.getElementById('report-date-info');
    var countInfoEl = document.getElementById('report-count-info');
    
    // 更新頂部標題列
    if (titleEl) {
        titleEl.innerHTML = '<i class="fa-solid fa-chart-pie mr-2 text-emerald-400"></i>' + title;
    }
    
    if (data.length === 0) {
        if (dateInfoEl) { dateInfoEl.classList.add('hidden'); }
        if (countInfoEl) { countInfoEl.classList.add('hidden'); }
        preview.innerHTML = '<div class="h-full flex flex-col items-center justify-center text-slate-500"><i class="fa-solid fa-inbox text-6xl mb-4 opacity-50"></i><div class="text-lg">查無資料</div><div class="text-sm text-slate-600 mt-2">請調整查詢條件後重試</div></div>';
        return;
    }
    
    // 更新日期區間和筆數
    if (dateInfoEl) {
        dateInfoEl.innerHTML = '<i class="fa-solid fa-calendar mr-1"></i>' + reportMeta()[0][1];
        dateInfoEl.classList.remove('hidden');
    }
    if (countInfoEl) {
        countInfoEl.innerHTML = '<i class="fa-solid fa-database mr-1"></i>' + data.length + ' 筆';
        countInfoEl.classList.remove('hidden');
    }

    // 預先檢查每個欄位是否為數字欄位（根據第一筆資料判斷）
    var numericColumns = {};
    if (data.length > 0) {
        columns.forEach(function(col) {
            numericColumns[col] = typeof data[0][col] === 'number';
        });
    }

    // 報表抬頭：公司、報表名稱、查詢條件、製表時間（列印與 Excel 也有同樣的抬頭）
    var metaHtml = reportMeta().concat([['製表時間', new Date().toLocaleString('zh-TW', { hour12: false })], ['筆數', data.length + ' 筆']])
        .map(function(m) { return '<span style="margin:0 12px;white-space:nowrap">' + m[0] + '：<b class="text-white">' + m[1] + '</b></span>'; }).join('');
    var html = '<div class="px-4 pt-4 pb-3 border-b border-slate-700 mb-1">' +
        '<div class="text-center text-slate-400 text-xs tracking-widest">' + window.getReportOrgName() + '</div>' +
        '<div class="text-center text-white text-xl font-bold my-1">' + title + '</div>' +
        '<div class="text-slate-400 text-xs text-center">' + metaHtml + '</div></div>';

    html += '<table class="w-full text-sm"><thead class="bg-slate-700/80 sticky top-0 z-10"><tr>';

    // 標題列：數字欄位靠右對齊，文字欄位靠左對齊
    columns.forEach(function(col) {
        var alignClass = numericColumns[col] ? 'text-right' : 'text-left';
        html += '<th class="px-4 py-3 ' + alignClass + ' text-slate-300 font-semibold">' + col + '</th>';
    });
    html += '</tr></thead><tbody>';

    data.forEach(function(row, idx) {
        var bgClass = idx % 2 === 0 ? 'bg-slate-800/30' : '';
        html += '<tr class="' + bgClass + ' hover:bg-slate-700/50 border-b border-slate-700/50">';
        columns.forEach(function(col) {
            var value = row[col] !== undefined ? row[col] : '';
            var cellClass = typeof value === 'number' ? 'text-right text-yellow-400 font-mono' : 'text-slate-300';
            if (col === '狀態' && value === '已過期') cellClass = 'text-red-400 font-bold';
            html += '<td class="px-4 py-2.5 ' + cellClass + '">' + value + '</td>';
        });
        html += '</tr>';
    });

    // 合計列（數量、件數、重量、金額等欄位）
    var sumCols = columns.filter(function(col) {
        return numericColumns[col] && !/(率|比|價|平均|排名|序|天數|天$|日$|容)/.test(col) && /(數|量|重|金額|板|件|筆|總|合計|租)/.test(col);
    });
    if (sumCols.length > 0) {
        html += '<tr class="bg-slate-700/60 font-bold border-t-2 border-slate-400">';
        columns.forEach(function(col, i) {
            if (sumCols.indexOf(col) >= 0) {
                var sum = data.reduce(function(t, r) { return t + (parseFloat(r[col]) || 0); }, 0);
                html += '<td class="px-4 py-2.5 text-right text-yellow-300 font-mono">' + (Math.round(sum * 100) / 100).toLocaleString() + '</td>';
            } else html += '<td class="px-4 py-2.5 text-white">' + (i === 0 ? '合計' : '') + '</td>';
        });
        html += '</tr>';
    }
    html += '</tbody></table>';
    preview.innerHTML = html;
}

window.exportReportExcel = function() {
    var r = window._reportData;
    if (!r.currentData || r.currentData.length === 0) { alert('沒有資料可匯出'); return; }
    var title = r.title || '報表';
    window.exportTableReportXlsx({
        title: title, meta: reportMeta(), columns: r.columns || Object.keys(r.currentData[0]), rows: r.currentData,
        fileName: title + '_' + (r.dateFrom && r.dateFrom !== '-' ? r.dateFrom + '_' + r.dateTo : new Date().toLocalYMD()) + '.xlsx'
    });
};

window.printReport = function() {
    var r = window._reportData;
    if (!r.currentData || r.currentData.length === 0) { alert('沒有報表可列印'); return; }
    window.printTableReport({ title: r.title || '報表', meta: reportMeta(), columns: r.columns || Object.keys(r.currentData[0]), rows: r.currentData });
};

window.generateTodayReport = function() {
    var today = new Date().toLocalYMD();
    document.getElementById('report-date-from').value = today;
    document.getElementById('report-date-to').value = today;
    generateReport('shipping-logistics');
};

function generateOrderStatus(dateFrom, dateTo) {
    var orders = window._orderData.orders || [];

    var stats = { pending: 0, inWave: 0, shipped: 0, confirmed: 0, partial: 0 };
    orders.forEach(function(o) {
        var status = o.status || 'pending';
        if (stats[status] !== undefined) stats[status]++;
        else if (o.waveNo && status !== 'shipped') stats.inWave++;
    });

    var total = orders.length || 1;
    var data = [
        { '狀態': '待處理', '數量': stats.pending, '佔比': (stats.pending / total * 100).toFixed(1) + '%' },
        { '狀態': '已建波次', '數量': stats.inWave, '佔比': (stats.inWave / total * 100).toFixed(1) + '%' },
        { '狀態': '已出貨', '數量': stats.shipped, '佔比': (stats.shipped / total * 100).toFixed(1) + '%' },
        { '狀態': '部分出貨（欠貨）', '數量': stats.partial, '佔比': (stats.partial / total * 100).toFixed(1) + '%' },
        { '狀態': '已確認', '數量': stats.confirmed, '佔比': (stats.confirmed / total * 100).toFixed(1) + '%' }
    ];

    window._reportData.currentData = data;
    window._reportData.dateFrom = '-';
    window._reportData.dateTo = '-';
    renderReportTable('訂單狀態統計', ['狀態', '數量', '佔比'], data);
}

function generatePendingOrders() {
    var orders = (window._orderData.orders || []).filter(window.orderWaveable);

    var data = orders.map(function(o) {
        var itemCount = window.orderOpenItems(o).length;
        var totalQty = window.orderOpenItems(o).reduce(function(sum, item) {
            return sum + (item.packageQty || item.quantity || 0);
        }, 0);
        return {
            '訂單編號': o.orderNo,
            '客戶': o.customer,
            '物流商': o.logistics || '-',
            '品項數': itemCount,
            '總件數': totalQty,
            '訂單日期': o.orderDate || '-'
        };
    });

    window._reportData.currentData = data;
    window._reportData.dateFrom = '-';
    window._reportData.dateTo = '-';
    renderReportTable('待處理訂單', ['訂單編號', '客戶', '物流商', '品項數', '總件數', '訂單日期'], data);
}

// ========== 領料報表 ==========
async function generatePickingSummary(dateFrom, dateTo) {
    // 先從 Firebase 載入資料
    await loadPickingLogsFromFirebase(dateFrom, dateTo);
    
    var logs = getPickingLogs(dateFrom, dateTo);
    
    if (logs.length === 0) {
        var preview = document.getElementById('report-preview-area');
        preview.innerHTML = '<div class="text-center text-slate-500 py-10"><i class="fa-solid fa-inbox text-4xl mb-4"></i><div>此區間無領料記錄</div></div>';
        return;
    }
    
    var totalQty = 0;
    var totalCount = logs.length;
    var byDate = {};
    
    logs.forEach(function(log) {
        var date = logDay(log);
        if (!date) return;
        
        if (!byDate[date]) byDate[date] = { count: 0, qty: 0 };
        byDate[date].count++;
        byDate[date].qty += Math.abs(log.quantity || 0);
        totalQty += Math.abs(log.quantity || 0);
    });
    
    var data = Object.keys(byDate).sort().map(function(date) {
        return {
            '日期': date,
            '領用次數': byDate[date].count,
            '領用數量': byDate[date].qty
        };
    });
    
    // 合計列由報表共用功能自動加（不要自己再加一列，否則合計會變兩倍）
    
    window._reportData.currentData = data;
    renderReportTable('領料統計', ['日期', '領用次數', '領用數量'], data);
}

async function generatePickingDetail(dateFrom, dateTo) {
    // 先從 Firebase 載入資料
    await loadPickingLogsFromFirebase(dateFrom, dateTo);
    
    var logs = getPickingLogs(dateFrom, dateTo);
    
    if (logs.length === 0) {
        var preview = document.getElementById('report-preview-area');
        preview.innerHTML = '<div class="text-center text-slate-500 py-10"><i class="fa-solid fa-inbox text-4xl mb-4"></i><div>此區間無領料記錄</div></div>';
        return;
    }
    
    var data = logs.map(function(log) {
        var date = '-';
        if (log.createdAt) {
            if (typeof log.createdAt === 'string') {
                date = new Date(log.createdAt).toLocaleString('zh-TW');
            } else if (log.createdAt.toDate) {
                date = log.createdAt.toDate().toLocaleString('zh-TW');
            }
        }
        return {
            '日期時間': date,
            '公司': log.company || '-',
            '品名': log.productName || '-',
            '規格': log.spec || '-',
            '批號': log.batchNo || '-',
            '儲位': log.locationId || '-',
            '數量': Math.abs(log.quantity || 0),
            '領用人': log.operator || '-',
            '備註': log.note || '-'
        };
    });
    
    // 排序：先按品名/規格分組，再按時間
    data.sort(function(a, b) {
        var nameCompare = (a['品名'] || '').localeCompare(b['品名'] || '', 'zh-TW');
        if (nameCompare !== 0) return nameCompare;
        var specCompare = (a['規格'] || '').localeCompare(b['規格'] || '', 'zh-TW');
        if (specCompare !== 0) return specCompare;
        return (a['日期時間'] || '').localeCompare(b['日期時間'] || '');
    });
    
    window._reportData.currentData = data;
    renderReportTable('領料明細', ['日期時間', '公司', '品名', '規格', '批號', '儲位', '數量', '領用人', '備註'], data);
}

async function generatePickingByUser(dateFrom, dateTo) {
    // 先從 Firebase 載入資料
    await loadPickingLogsFromFirebase(dateFrom, dateTo);
    
    var logs = getPickingLogs(dateFrom, dateTo);
    
    if (logs.length === 0) {
        var preview = document.getElementById('report-preview-area');
        preview.innerHTML = '<div class="text-center text-slate-500 py-10"><i class="fa-solid fa-inbox text-4xl mb-4"></i><div>此區間無領料記錄</div></div>';
        return;
    }
    
    var byUser = {};
    logs.forEach(function(log) {
        var user = log.operator || '未知';
        if (!byUser[user]) byUser[user] = { count: 0, qty: 0 };
        byUser[user].count++;
        byUser[user].qty += Math.abs(log.quantity || 0);
    });
    
    var data = Object.keys(byUser).map(function(user) {
        return {
            '領用人': user,
            '領用次數': byUser[user].count,
            '領用數量': byUser[user].qty
        };
    }).sort(function(a, b) { return b['領用數量'] - a['領用數量']; });
    
    window._reportData.currentData = data;
    renderReportTable('領料統計 - 依領用人', ['領用人', '領用次數', '領用數量'], data);
}

async function generatePickingByProduct(dateFrom, dateTo) {
    // 先從 Firebase 載入資料
    await loadPickingLogsFromFirebase(dateFrom, dateTo);
    
    var logs = getPickingLogs(dateFrom, dateTo);
    
    if (logs.length === 0) {
        var preview = document.getElementById('report-preview-area');
        preview.innerHTML = '<div class="text-center text-slate-500 py-10"><i class="fa-solid fa-inbox text-4xl mb-4"></i><div>此區間無領料記錄</div></div>';
        return;
    }
    
    var byProduct = {};
    logs.forEach(function(log) {
        var key = (log.productName || '未知') + '|' + (log.spec || '');
        if (!byProduct[key]) byProduct[key] = { productName: log.productName, spec: log.spec, count: 0, qty: 0 };
        byProduct[key].count++;
        byProduct[key].qty += Math.abs(log.quantity || 0);
    });
    
    var data = Object.values(byProduct).map(function(p) {
        return {
            '品名': p.productName || '-',
            '規格': p.spec || '-',
            '領用次數': p.count,
            '領用數量': p.qty
        };
    }).sort(function(a, b) {
        // 先按品名/規格排序（相同品項排在一起）
        var nameCompare = (a['品名'] || '').localeCompare(b['品名'] || '', 'zh-TW');
        if (nameCompare !== 0) return nameCompare;
        return (a['規格'] || '').localeCompare(b['規格'] || '', 'zh-TW');
    });
    
    window._reportData.currentData = data;
    renderReportTable('領料統計 - 依品項', ['品名', '規格', '領用次數', '領用數量'], data);
}

// 領料的異動類型：領用出庫頁（picking-rm）與作業看板領料（picking）都算
window.PICKING_LOG_TYPES = ['picking-rm', 'picking'];
function logDay(log) { return repDay(log.timestamp || log.createdAt); }

function getPickingLogs(dateFrom, dateTo) {
    // 優先使用已載入的資料
    var logs = window.inventoryLogs || [];
    return logs.filter(function(log) {
        if (window.PICKING_LOG_TYPES.indexOf(log.type) < 0) return false;
        var date = logDay(log);
        return date >= dateFrom && date <= dateTo;
    });
}

// 依時間區間讀異動記錄（timestamp 單一欄位範圍查詢，不需要複合索引），類型在前端篩選
async function fetchLogsBetween(types, dateFrom, dateTo) {
    var snap = await window.db.collection('inventoryLogs')
        .where('timestamp', '>=', window.localDayStartISO(dateFrom))
        .where('timestamp', '<=', window.localDayEndISO(dateTo)).get();
    var logs = [];
    snap.forEach(function(d) { var x = d.data(); if (types.indexOf(x.type) >= 0) { x.id = d.id; logs.push(x); } });
    return logs;
}

// 從 Firebase 載入領料記錄
async function loadPickingLogsFromFirebase(dateFrom, dateTo) {
    if (!window.db || !window.collection || !window.getDocs) {
        console.log('Firebase 未初始化');
        return [];
    }
    
    try {
        var logsRef = window.collection(window.db, 'inventoryLogs');
        // 只用 type 過濾（type + orderBy createdAt 需要複合索引）；日期由 getPickingLogs 在前端篩選
        var q = window.query(logsRef, window.where('type', 'in', window.PICKING_LOG_TYPES));
        
        var snapshot = await window.getDocs(q);
        var logs = [];
        snapshot.forEach(function(doc) {
            var data = doc.data();
            data.id = doc.id;
            logs.push(data);
        });
        
        // 更新全域變數
        window.inventoryLogs = logs;
        console.log('已載入', logs.length, '筆領料記錄');
        return logs;
    } catch (e) {
        console.error('載入領料記錄失敗:', e);
        return [];
    }
}

window.generateLowStockReport = function() {
    var pallets = window.currentPallets ? window.currentPallets() : [];

    var stats = {};
    pallets.forEach(function(p) {
        var key = p.productName + '|||' + (p.spec || '');
        if (!stats[key]) stats[key] = { productName: p.productName, spec: p.spec || '', totalQty: 0 };
        stats[key].totalQty += parseInt(p.quantity) || 0;
    });

    var data = Object.values(stats).filter(function(s) { return s.totalQty < 50; }).map(function(s) {
        return { '品名': s.productName, '規格': s.spec, '庫存數量': s.totalQty, '狀態': s.totalQty < 10 ? '⚠️ 緊急' : '⚡ 偏低' };
    }).sort(function(a, b) { return a['庫存數量'] - b['庫存數量']; });

    window._reportData.currentData = data;
    window._reportData.currentType = 'low-stock';
    window._reportData.dateFrom = '-';
    window._reportData.dateTo = '-';

    if (data.length === 0) {
        document.getElementById('report-preview-area').innerHTML =
            '<div class="text-center text-green-400 py-20"><i class="fa-solid fa-check-circle text-6xl mb-4"></i><div class="text-lg">太棒了！目前沒有低庫存品項</div></div>';
        return;
    }

    renderReportTable('低庫存警報', ['品名', '規格', '庫存數量', '狀態'], data);
};

setTimeout(initReportDates, 500);

// ============================================================
// ============================================================

const VIRTUAL_LOCATION_CONFIG = {
    'TEMP-IN': { name: '進貨暫存區', color: 'emerald', icon: 'fa-truck-loading' },
    'TEMP-OUT': { name: '出貨暫存區', color: 'orange', icon: 'fa-truck' },
    'A00': { name: 'A區貨架前端', color: 'blue', icon: 'fa-location-dot' },
    'A99': { name: 'A區貨架末端', color: 'blue', icon: 'fa-location-dot' },
    'B00': { name: 'B區貨架前端', color: 'indigo', icon: 'fa-location-dot' },
    'B99': { name: 'B區貨架末端', color: 'indigo', icon: 'fa-location-dot' },
    'C00': { name: 'C區貨架前端', color: 'purple', icon: 'fa-location-dot' },
    'C99': { name: 'C區貨架末端', color: 'purple', icon: 'fa-location-dot' },
    'D00': { name: 'D區貨架前端', color: 'pink', icon: 'fa-location-dot' },
    'D99': { name: 'D區貨架末端', color: 'pink', icon: 'fa-location-dot' },
    'OTHER': { name: '其他位置', color: 'slate', icon: 'fa-box' }
};

const VIRTUAL_LOCATIONS = Object.keys(VIRTUAL_LOCATION_CONFIG);

async function loadVirtualLocationCounts() {
    try {
        const snapshot = await window.getDocs(window.collection(window.db, 'pallets'));

        const counts = {};
        VIRTUAL_LOCATIONS.forEach(loc => counts[loc] = 0);

        window.virtualLocationInventory = {};
        VIRTUAL_LOCATIONS.forEach(loc => window.virtualLocationInventory[loc] = []);

        snapshot.forEach(doc => {
            const data = doc.data();
            const status = (data.status || '').toLowerCase();
            const excludeStatus = ['shipped', 'outbound', 'deleted', 'cancelled', 'removed'];
            if (excludeStatus.includes(status)) return;

            if (!data.quantity || data.quantity <= 0) return;

            data.id = doc.id;
            let locId = data.locationId || '';

            const locIdUpper = locId.toUpperCase().trim();

            if (VIRTUAL_LOCATION_CONFIG[locIdUpper]) {
                counts[locIdUpper]++;
                window.virtualLocationInventory[locIdUpper].push(data);
            } else if (VIRTUAL_LOCATION_CONFIG[locId]) {
                counts[locId]++;
                window.virtualLocationInventory[locId].push(data);
            }
        });

        Object.keys(counts).forEach(locId => {
            const el = document.getElementById(`vl-count-${locId}`);
            if (el) {
                el.textContent = counts[locId];
                const card = el.closest('.virtual-loc-card');
                if (card) {
                    if (counts[locId] > 0) {
                        card.classList.add('ring-2', 'ring-offset-2', 'ring-offset-slate-900');
                        if (locId === 'TEMP-IN') card.classList.add('ring-emerald-500');
                        else if (locId === 'TEMP-OUT') card.classList.add('ring-orange-500');
                        else card.classList.add('ring-white/30');
                    } else {
                        card.classList.remove('ring-2', 'ring-offset-2', 'ring-offset-slate-900',
                                              'ring-emerald-500', 'ring-orange-500', 'ring-white/30');
                    }
                }
            }
        });

        console.log('✅ 虛擬儲位數量已更新', counts);
    } catch (err) {
        console.error('載入虛擬儲位數量錯誤:', err);
    }
}

function showVirtualLocTooltip(e, locationId) {
    const config = VIRTUAL_LOCATION_CONFIG[locationId];
    if (!config) return;

    const tooltip = document.getElementById('hover-tooltip');
    const title = document.getElementById('tooltip-title');
    const badge = document.getElementById('tooltip-badge');
    const body = document.getElementById('tooltip-body');
    if (!tooltip) return;

    const items = window.virtualLocationInventory ? window.virtualLocationInventory[locationId] || [] : [];

    title.textContent = config.name + ' (' + locationId + ')';
    badge.textContent = items.length + ' 板';
    badge.style.background = items.length > 5 ? 'rgba(239,68,68,0.5)' : items.length > 0 ? 'rgba(59,130,246,0.5)' : 'rgba(100,116,139,0.5)';

    body.innerHTML = renderVirtualLocTooltipContent(items, locationId);

    tooltip.classList.remove('hidden');
    moveHoverTooltip(e);
}

function renderVirtualLocTooltipContent(items, locationId) {
    let html = '<div class="tooltip-summary">';
    html += '<div class="tooltip-stat ' + (items.length > 0 ? '' : 'empty') + '"><div class="tooltip-stat-value">' + items.length + '</div><div class="tooltip-stat-label">已存放</div></div>';
    html += '<div class="tooltip-stat empty"><div class="tooltip-stat-value">∞</div><div class="tooltip-stat-label">容量</div></div>';
    html += '</div>';

    if (items.length > 0) {
        html += '<table class="w-full text-xs">';
        html += '<thead><tr class="text-slate-400 border-b border-slate-700">';
        html += '<th class="p-1.5 text-left">儲位</th>';
        html += '<th class="p-1.5 text-left">棧板編號</th>';
        html += '<th class="p-1.5 text-left">公司</th>';
        html += '<th class="p-1.5 text-left">品名</th>';
        html += '<th class="p-1.5 text-left">規格</th>';
        html += '<th class="p-1.5 text-right">數量</th>';
        html += '<th class="p-1.5 text-left">效期</th>';
        html += '<th class="p-1.5 text-left">入庫日</th>';
        html += '</tr></thead><tbody>';

        items.forEach(item => {
            const companyClass = item.company === '崇文' ? 'bg-blue-600' : 'bg-emerald-600';

            let expiryStr = '-';
            if (item.expiryDate) {
                const expDate = item.expiryDate.toDate ? item.expiryDate.toDate() : new Date(item.expiryDate);
                expiryStr = expDate.toLocaleDateString('zh-TW');
                const daysLeft = window.daysUntil(expDate);
                if (daysLeft < 0) {
                    expiryStr = '<span class="text-red-400">' + expiryStr + '</span>';
                } else if (daysLeft <= 30) {
                    expiryStr = '<span class="text-orange-400">' + expiryStr + '</span>';
                }
            }

            let inboundStr = '-';
            if (item.createdAt) {
                const inDate = item.createdAt.toDate ? item.createdAt.toDate() : new Date(item.createdAt);
                inboundStr = inDate.toLocaleDateString('zh-TW');
            }

            html += '<tr class="border-b border-slate-800 hover:bg-slate-800/50">';
            html += '<td class="p-1.5 font-mono text-[10px] text-emerald-400 font-bold">' + (item.locationId || locationId) + '</td>';
            html += '<td class="p-1.5 font-mono text-[10px] text-slate-400">' + (item.palletId || '-') + '</td>';
            html += '<td class="p-1.5"><span class="px-1 py-0.5 rounded text-[10px] ' + companyClass + '">' + (item.company || '-') + '</span></td>';
            html += '<td class="p-1.5 text-white">' + (item.productName || '-') + '</td>';
            html += '<td class="p-1.5 text-slate-400 text-[10px]">' + (item.spec || '-') + '</td>';
            html += '<td class="p-1.5 text-right font-bold text-white">' + (item.quantity || 0) + '</td>';
            html += '<td class="p-1.5">' + expiryStr + '</td>';
            html += '<td class="p-1.5 text-slate-400">' + inboundStr + '</td>';
            html += '</tr>';
        });

        html += '</tbody></table>';
    } else {
        html += '<div class="text-center text-slate-500 py-4">此暫存區目前沒有庫存</div>';
    }

    return html;
}

function selectVirtualLocation(locationId) {
    const locInput = document.getElementById('in-loc');
    if (locInput) {
        locInput.value = locationId;
        validateLocationInput();
        if (typeof updateInboundProgress === 'function') {
            updateInboundProgress();
        }
        if (typeof updateLivePreview === 'function') {
            updateLivePreview();
        }
        showNotification(`已選擇虛擬儲位：${VIRTUAL_LOCATION_CONFIG[locationId]?.name || locationId}`, 'success');
    }
}

const originalRefreshVisualMap = typeof refreshVisualMap === 'function' ? refreshVisualMap : null;
if (originalRefreshVisualMap) {
    const newRefreshVisualMap = async function() {
        await originalRefreshVisualMap();
        await loadVirtualLocationCounts();
    };
    window.refreshVisualMap = newRefreshVisualMap;
}

// 登入後才載入（未登入時安全規則會拒絕）
window.onLogin(function() { loadVirtualLocationCounts(); });

console.log('📍 虛擬儲位監控功能已載入');

// ============================================================
// ============================================================

let importPreviewData = [];
let importStats = { total: 0, valid: 0, invalid: 0, duplicate: 0 };

function downloadImportTemplate() {
    const templateData = [
        ['儲位*', '公司*', '品號*', '品名*', '規格', '數量*', '單位', '批號', '效期'],
        ['JA-01-2F', '崇文', 'BC16118T', '熟白蝦', '16/20*1.1KG*8盒*傳鮮', 30, '箱', '20241201', '2025/06/30'],
        ['JA-01-2F', '八方', 'BC21118T', '熟白蝦', '21/25*1.1KG*8盒*傳鮮', 25, '箱', '20241215', '2025/07/15'],
        ['A99', '崇文', 'A5021212', '502白仁', '100/200*12KG', 10, '箱', '20241220', '2025/08/01'],
        ['TEMP-IN', '八方', 'BW450802', '生白蝦', '40/50*850G*12盒*南美', 50, '箱', '20241225', '2025/09/01'],
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(templateData);
    ws['!cols'] = [
        { wch: 15 }, { wch: 8 }, { wch: 15 }, { wch: 18 }, { wch: 30 },
        { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 12 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, '庫存匯入');

    const instructionData = [
        ['欄位', '必填', '說明', '範例'],
        ['儲位', '是', '實際儲位或虛擬儲位', 'JA-01-2F、A99、TEMP-IN'],
        ['公司', '是', '崇文 或 八方', '崇文'],
        ['品號', '是', 'ERP 品號', 'BC16118T'],
        ['品名', '是', '產品名稱', '熟白蝦'],
        ['規格', '否', '產品規格', '16/20*1.1KG*8盒'],
        ['數量', '是', '庫存數量', '30'],
        ['單位', '否', '計量單位', '箱'],
        ['批號', '否', '生產批號', '20241201'],
        ['效期', '否', '有效期限', '2025/06/30'],
        ['', '', '', ''],
        ['【虛擬儲位說明】', '', '', ''],
        ['A00~D00', '', '貨架前端暫放區', ''],
        ['A99~D99', '', '貨架末端暫放區', ''],
        ['TEMP-IN', '', '進貨暫存區', ''],
        ['TEMP-OUT', '', '出貨暫存區', ''],
        ['OTHER', '', '其他位置', ''],
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(instructionData);
    ws2['!cols'] = [{ wch: 15 }, { wch: 8 }, { wch: 35 }, { wch: 25 }];
    XLSX.utils.book_append_sheet(wb, ws2, '欄位說明');

    XLSX.writeFile(wb, '庫存匯入範本.xlsx');
    showNotification('✅ 已下載匯入範本', 'success');
}

function handleImportDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('border-amber-500', 'bg-amber-900/20');
}

function handleImportDragLeave(e) {
    e.currentTarget.classList.remove('border-amber-500', 'bg-amber-900/20');
}

function handleImportDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('border-amber-500', 'bg-amber-900/20');
    const files = e.dataTransfer.files;
    if (files.length > 0) processImportFile(files[0]);
}

function handleImportFileSelect(e) {
    const file = e.target.files[0];
    if (file) processImportFile(file);
    e.target.value = '';
}

async function processImportFile(file) {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
        showNotification('❌ 請上傳 Excel 檔案', 'error');
        return;
    }

    showNotification('📖 正在讀取檔案...', 'info');

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = window.sheetToJsonSmart ? window.sheetToJsonSmart(firstSheet) : XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

            if (jsonData.length === 0) {
                showNotification('❌ Excel 檔案沒有資料', 'error');
                return;
            }

            await validateAndPreviewData(jsonData);
        } catch (err) {
            console.error('讀取 Excel 錯誤:', err);
            showNotification('❌ 讀取檔案失敗：' + err.message, 'error');
        }
    };
    reader.readAsArrayBuffer(file);
}

// 判斷重複：同儲位、公司、品名、規格、批號、效期、數量都一樣才算（只看儲位＋品名＋數量會把不同批號的板當成重複而漏匯）
function importDupKey(loc, company, name, spec, batch, exp, qty) {
    return [String(loc || '').toUpperCase(), company || '', name || '', spec || '', batch || '', exp || '', parseFloat(qty) || 0].join('|');
}

async function validateAndPreviewData(jsonData) {
    importPreviewData = [];
    importStats = { total: 0, valid: 0, invalid: 0, duplicate: 0 };

    const existingLocations = new Set();
    const existingPallets = new Set();

    try {
        const locSnap = await db.collection('locations').get();
        locSnap.forEach(doc => existingLocations.add(doc.id));

        const palletSnap = await db.collection('pallets').get();
        palletSnap.forEach(doc => {
            const d = doc.data();
            existingPallets.add(importDupKey(d.locationId, d.company, d.productName, d.spec, d.batchNo, window.normalizeDateValue(d.expiryDate || d.expDate), d.quantity));
        });
    } catch (err) {
        console.error('載入現有資料錯誤:', err);
    }

    const fieldMappings = {
        location: ['儲位', '儲位*', 'location', 'Location'],
        company: ['公司', '公司*', 'company', 'Company'],
        productId: ['品號', '品號*', 'productId', 'SKU'],
        productName: ['品名', '品名*', 'productName', '名稱'],
        spec: ['規格', 'spec', 'Spec'],
        quantity: ['數量', '數量*', 'quantity', 'QTY'],
        unit: ['單位', 'unit', 'Unit'],
        batchNo: ['批號', 'batchNo', 'batch'],
        expiryDate: ['效期', 'expiryDate', '有效期限']
    };

    function findField(row, fieldNames) {
        for (const name of fieldNames) {
            if (row.hasOwnProperty(name) && row[name] !== '') return row[name];
        }
        return '';
    }

    jsonData.forEach((row, index) => {
        const record = {
            rowNum: index + 2,
            location: window.formatLocationId(findField(row, fieldMappings.location)),
            company: String(findField(row, fieldMappings.company)).trim(),
            productId: String(findField(row, fieldMappings.productId)).trim(),
            productName: String(findField(row, fieldMappings.productName)).trim(),
            spec: String(findField(row, fieldMappings.spec)).trim(),
            quantity: parseFloat(String(findField(row, fieldMappings.quantity)).replace(/,/g, '')) || 0,
            unit: String(findField(row, fieldMappings.unit)).trim() || '件',
            batchNo: String(findField(row, fieldMappings.batchNo)).trim(),
            // Excel 的日期格子讀進來是數字（例如 45838），要換成日期；看不懂的格式列為錯誤，不能默默變成沒有效期
            expiryRaw: findField(row, fieldMappings.expiryDate),
            expiryDate: '',
            errors: [],
            status: 'valid'
        };
        if (record.expiryRaw !== '' && record.expiryRaw !== null && record.expiryRaw !== undefined) {
            record.expiryDate = window.normalizeDateValue(typeof record.expiryRaw === 'string' ? record.expiryRaw.trim() : record.expiryRaw);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(record.expiryDate)) record.errors.push('效期看不懂：' + record.expiryRaw + '（請用 2027/06/30 這種格式）');
        }

        if (!record.location) record.errors.push('儲位必填');
        if (!record.company) record.errors.push('公司必填');
        else if (!['崇文', '八方'].includes(record.company)) record.errors.push('公司須為「崇文」或「八方」');
        if (!record.productId && !record.productName) record.errors.push('品號或品名至少填一個');
        if (!record.quantity || record.quantity <= 0) record.errors.push('數量須大於0');

        const isVirtualLocation = VIRTUAL_LOCATIONS.includes(record.location);
        const locationExists = existingLocations.has(record.location);
        if (!isVirtualLocation && !locationExists) {
            const createLocation = document.getElementById('import-opt-create-location')?.checked ?? true;
            if (createLocation) record.newLocation = true;
            else record.errors.push('儲位不存在');
        }

        const duplicateKey = importDupKey(record.location, record.company, record.productName, record.spec, record.batchNo, record.expiryDate, record.quantity);
        if (existingPallets.has(duplicateKey)) {
            record.isDuplicate = true;
            const skipDuplicate = document.getElementById('import-opt-skip-duplicate')?.checked ?? true;
            if (skipDuplicate) record.status = 'duplicate';
        }

        if (record.errors.length > 0) {
            record.status = 'invalid';
            importStats.invalid++;
        } else if (record.status === 'duplicate') {
            importStats.duplicate++;
        } else {
            importStats.valid++;
        }

        importStats.total++;
        importPreviewData.push(record);
    });

    renderImportPreview();

    document.getElementById('import-total').textContent = importStats.total;
    document.getElementById('import-valid').textContent = importStats.valid;
    document.getElementById('import-invalid').textContent = importStats.invalid;
    document.getElementById('import-duplicate').textContent = importStats.duplicate;
    document.getElementById('import-stats').textContent = `已載入 ${importStats.total} 筆，${importStats.valid} 筆可匯入`;

    const btnImport = document.getElementById('btn-execute-import');
    if (btnImport) btnImport.disabled = importStats.valid === 0;

    showNotification(`✅ 已載入 ${importStats.total} 筆資料`, 'success');
}

function renderImportPreview() {
    const tbody = document.getElementById('import-preview-body');
    if (!tbody) return;

    if (importPreviewData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" class="text-center text-slate-500 py-10">
            <i class="fa-solid fa-file-excel text-4xl text-slate-600 mb-3 block"></i>
            <p>請上傳 Excel 檔案</p>
        </td></tr>`;
        return;
    }

    let html = '';
    importPreviewData.forEach((record) => {
        const statusIcon = record.status === 'valid'
            ? '<span class="text-emerald-400">✓</span>'
            : record.status === 'duplicate'
                ? '<span class="text-yellow-400">⚠</span>'
                : '<span class="text-red-400">✗</span>';

        const rowClass = record.status === 'invalid'
            ? 'bg-red-900/20' : record.status === 'duplicate' ? 'bg-yellow-900/20' : '';

        const errorTooltip = record.errors.length > 0 ? `title="${record.errors.join(', ')}"` : '';
        const newLocationBadge = record.newLocation ? '<span class="ml-1 text-[10px] px-1 bg-blue-600 rounded">新</span>' : '';

        html += `
            <tr class="${rowClass}" ${errorTooltip}>
                <td class="text-center text-slate-500">${record.rowNum}</td>
                <td class="text-center">${statusIcon}</td>
                <td class="font-mono">${record.location}${newLocationBadge}</td>
                <td><span class="px-1.5 py-0.5 rounded text-xs ${record.company === '崇文' ? 'bg-blue-600' : 'bg-emerald-600'}">${record.company}</span></td>
                <td class="font-mono text-xs">${record.productId}</td>
                <td>${record.productName}</td>
                <td class="text-xs text-slate-400">${record.spec}</td>
                <td class="text-right font-bold">${record.quantity}</td>
                <td class="text-slate-400">${record.unit}</td>
                <td class="font-mono text-xs">${record.batchNo}</td>
                <td class="text-xs">${record.expiryDate}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

async function executeImport() {
    const validRecords = importPreviewData.filter(r => r.status === 'valid');

    if (validRecords.length === 0) {
        showNotification('❌ 沒有可匯入的資料', 'error');
        return;
    }

    if (!confirm(`確定要匯入 ${validRecords.length} 筆資料嗎？\n\n此操作會新增棧板到庫存中。`)) return;

    const btnImport = document.getElementById('btn-execute-import');
    if (btnImport) {
        btnImport.disabled = true;
        btnImport.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>匯入中...';
    }

    let successCount = 0;
    const writes = [];   // Firestore 一批最多 500 筆，最後分批寫入
    const batch = { set: function(ref, data) { writes.push({ ref: ref, data: data }); } };
    const newLocations = new Set();
    const timestamp = firebase.firestore.FieldValue.serverTimestamp();

    try {
        await window.ensureDocNoPool('IN', validRecords.length);
        for (const record of validRecords) {
            if (record.newLocation && !newLocations.has(record.location)) {
                const isVirtual = VIRTUAL_LOCATIONS.includes(record.location);
                const locRef = db.collection('locations').doc(record.location);
                batch.set(locRef, {
                    locationId: record.location,
                    zone: record.location.charAt(0),
                    type: isVirtual ? 'virtual' : 'standard',
                    status: 'available',
                    capacity: isVirtual ? 99 : 2,
                    currentLoad: 0,
                    createdAt: timestamp,
                    note: isVirtual ? '虛擬儲位' : '匯入時自動建立'
                });
                newLocations.add(record.location);
            }

            const palletId = await window.nextDocNo('IN');
            const palletRef = db.collection('pallets').doc(palletId);

            const expiryDate = record.expiryDate || '';

            batch.set(palletRef, {
                palletId: palletId,
                company: record.company,
                productId: record.productId,
                productName: record.productName,
                spec: record.spec,
                quantity: record.quantity,
                unit: record.unit,
                locationId: record.location,
                batchNo: record.batchNo,
                expiryDate: expiryDate,
                expDate: expiryDate,
                status: 'stored',
                createdAt: timestamp,
                source: 'excel-import'
            });

            // 經過共用格式（有 timestamp，異動記錄查詢才查得到）
            const logRef = db.collection('inventoryLogs').doc();
            batch.set(logRef, window.buildInventoryLogEntry({
                type: 'import',
                palletId: palletId,
                company: record.company,
                productName: record.productName,
                spec: record.spec,
                batchNo: record.batchNo,
                expDate: expiryDate,
                quantity: record.quantity,
                quantityChange: record.quantity,
                locationId: record.location,
                note: 'Excel 期初匯入'
            }));

            successCount++;
        }

        // 分批寫入（每批 400 筆）；每板的棧板和記錄在同一批
        for (let w = 0; w < writes.length; w += 400) {
            const chunk = db.batch();
            writes.slice(w, w + 400).forEach(x => chunk.set(x.ref, x.data));
            await chunk.commit();
        }
        showNotification(`✅ 成功匯入 ${successCount} 筆資料`, 'success');

        importPreviewData = [];
        renderImportPreview();
        document.getElementById('import-total').textContent = '0';
        document.getElementById('import-valid').textContent = '0';
        document.getElementById('import-invalid').textContent = '0';
        document.getElementById('import-duplicate').textContent = '0';
        document.getElementById('import-stats').textContent = '匯入完成！';

        if (typeof refreshVisualMap === 'function') refreshVisualMap();
        loadVirtualLocationCounts();

    } catch (err) {
        console.error('匯入錯誤:', err);
        showNotification('❌ 匯入失敗：' + err.message, 'error');
    } finally {
        if (btnImport) {
            btnImport.disabled = false;
            btnImport.innerHTML = '<i class="fa-solid fa-database mr-1"></i>執行匯入';
        }
    }
}

console.log('📥 庫存匯入功能已載入');

