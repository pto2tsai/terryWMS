// ============================================================
// js/14-orders.js — 訂單管理、訂單異動偵測、波次（新版）
// 由原 app.js 第 19659–21245 行拆出；各檔依 index.html 的順序載入，共用全域（window）
// ============================================================
        // ========== 訂單管理系統 (升級版) ==========

const LOGISTICS_KEYWORDS = {
    '全日物流': ['全日物流', '全日'],
    '合順貨運': ['合順貨運', '合順'],
    '大榮貨運': ['大榮'],
    '裕鵬物流': ['裕鵬物流', '裕鵬'],
    '黑貓宅急便': ['黑貓'],
    '新竹物流': ['新竹物流', '新竹'],
    '崇文自送': ['崇文司機', '崇文'],
    '科技物流': ['科技'],
    '阿誠': ['阿誠'],
    '文生': ['文生'],
    '金東石': ['金東石'],
    '奧林': ['奧林'],
    '自取': ['自取']
};

function parseLogistics(remark) {
    if (!remark) return '未指定';
    remark = String(remark);

    for (const [logistics, keywords] of Object.entries(LOGISTICS_KEYWORDS)) {
        for (const keyword of keywords) {
            if (remark.includes(keyword)) {
                return logistics;
            }
        }
    }
    return '未指定';
}

window.isFeeItem = function(productName) {
    if (!productName) return true;
    var feeKeywords = ['運費', '費用', '代收', '代墊', '手續費', '服務費', '代付', '其他費用'];
    return feeKeywords.some(function(kw) { return productName.includes(kw); });
};

window.isPackagingItem = function(productName) {
    if (!productName) return false;
    var packagingKeywords = ['保力龍', '保麗龍', '包材', '紙箱', '冰袋', '冰塊', '保麗龍箱', '保力龍箱'];
    return packagingKeywords.some(function(kw) { return productName.includes(kw); });
};

window.isChilledItem = function(productName) {
    if (!productName) return false;
    var chilledKeywords = ['現流白仁', '冷藏'];
    return chilledKeywords.some(function(kw) { return productName.includes(kw); });
};

window.isExcludedFromPickingList = function(productName) {
    return window.isFeeItem(productName) || window.isPackagingItem(productName) || window.isChilledItem(productName);
};

window.isExcludedFromSortingLabel = function(productName) {
    return window.isFeeItem(productName) || window.isChilledItem(productName);
};

window.isExcludedFromQtyCount = function(productName) {
    return window.isFeeItem(productName) || window.isPackagingItem(productName) || window.isChilledItem(productName);
};

window.isNonProductItem = window.isExcludedFromSortingLabel;

window.parseBoxPerPackage = function(productName) {
    if (!productName) return 0;

    var patterns = [
        /\*(\d+)盒/,      // *8盒
        /\*(\d+)入/,      // *12入
        /\*(\d+)包/,      // *6包
        /\*(\d+)袋/,      // *10袋
        /x(\d+)盒/i,      // x8盒
        /x(\d+)入/i,      // x12入
        /(\d+)盒\/件/,    // 8盒/件
        /(\d+)入\/件/     // 12入/件
    ];

    for (var i = 0; i < patterns.length; i++) {
        var match = productName.match(patterns[i]);
        if (match && match[1]) {
            return parseInt(match[1]);
        }
    }

    return 0;  // 無法解析時返回0，使用原始邏輯
};

function parseBoxPerPackage(productName) {
    return window.parseBoxPerPackage(productName);
}

window._orderData = {
    orders: [],  // 所有訂單
    lastImportTime: null
};

async function loadOrdersFromFirebase() {
    try {
        const snap = await window.getDocs(window.collection(window.db, 'salesOrders'));
        window._orderData.orders = [];
        snap.forEach(doc => {
            window._orderData.orders.push({ id: doc.id, ...doc.data() });
        });
        console.log('載入訂單:', window._orderData.orders.length, '筆');
        renderOrderList();
    } catch (err) {
        console.error('載入訂單失敗:', err);
    }
}

function renderOrderList() {
    const pendingOrders = window._orderData.orders.filter(window.orderWaveable);
    const statEl = document.getElementById('wave-stat-orders');
    if (statEl) {
        statEl.innerText = pendingOrders.length;
    }
    console.log('訂單列表更新:', pendingOrders.length, '筆待出貨');
}

// ========== 訂單異動偵測功能 ==========

function detectOrderChanges(existingOrder, newOrder) {
    var changes = [];
    var existingItems = existingOrder.items || [];
    var newItems = newOrder.items || [];

    var existingMap = {};
    existingItems.forEach(function(item) {
        var key = item.productName + '|||' + (item.spec || '');
        existingMap[key] = item;
    });

    var newMap = {};
    newItems.forEach(function(item) {
        var key = item.productName + '|||' + (item.spec || '');
        newMap[key] = item;
    });

    Object.keys(newMap).forEach(function(key) {
        var newItem = newMap[key];
        var existingItem = existingMap[key];

        if (!existingItem) {
            changes.push({
                type: 'add',
                icon: '➕',
                productName: newItem.productName,
                spec: newItem.spec || '',
                oldQty: 0,
                newQty: newItem.packageQty || newItem.quantity || 0,
                diff: '+' + (newItem.packageQty || newItem.quantity || 0)
            });
        } else {
            var oldQty = existingItem.packageQty || existingItem.quantity || 0;
            var newQty = newItem.packageQty || newItem.quantity || 0;

            if (oldQty !== newQty) {
                var diff = newQty - oldQty;
                changes.push({
                    type: diff > 0 ? 'increase' : 'decrease',
                    icon: diff > 0 ? '⬆️' : '⬇️',
                    productName: newItem.productName,
                    spec: newItem.spec || '',
                    oldQty: oldQty,
                    newQty: newQty,
                    diff: (diff > 0 ? '+' : '') + diff
                });
            }
        }
    });

    Object.keys(existingMap).forEach(function(key) {
        if (!newMap[key]) {
            var existingItem = existingMap[key];
            changes.push({
                type: 'remove',
                icon: '➖',
                productName: existingItem.productName,
                spec: existingItem.spec || '',
                oldQty: existingItem.packageQty || existingItem.quantity || 0,
                newQty: 0,
                diff: '-' + (existingItem.packageQty || existingItem.quantity || 0)
            });
        }
    });

    return changes;
}

function showOrderChangesAlert(orderChanges) {
    if (!orderChanges || orderChanges.length === 0) return;

    var modal = document.createElement('div');
    modal.id = 'modal-order-changes';
    modal.className = 'fixed inset-0 z-[100] bg-black/90 flex items-center justify-center';

    var inWaveChanges = orderChanges.filter(function(o) { return o.waveNo; });
    var pendingChanges = orderChanges.filter(function(o) { return !o.waveNo; });

    var changesHtml = '';

    if (inWaveChanges.length > 0) {
        changesHtml += '<div class="mb-4">';
        changesHtml += '<div class="text-red-400 font-bold mb-2"><i class="fa-solid fa-triangle-exclamation mr-2"></i>以下訂單已在波次中，請更新揀貨單！</div>';
        changesHtml += '<div class="space-y-2 max-h-[200px] overflow-auto">';

        inWaveChanges.forEach(function(order) {
            var changesText = order.changes.map(function(c) {
                return c.icon + ' ' + c.productName + ': ' + c.oldQty + '→' + c.newQty + ' (' + c.diff + ')';
            }).join('<br>');

            changesHtml += '<div class="bg-red-900/30 border border-red-600 rounded p-3">';
            changesHtml += '<div class="flex justify-between"><span class="text-white font-bold">' + order.customer + '</span>';
            changesHtml += '<span class="text-red-400 text-sm">波次: ' + order.waveNo + '</span></div>';
            changesHtml += '<div class="text-xs text-slate-400">' + order.orderNo + '</div>';
            changesHtml += '<div class="text-sm text-yellow-300 mt-2">' + changesText + '</div></div>';
        });

        changesHtml += '</div></div>';
    }

    if (pendingChanges.length > 0) {
        changesHtml += '<div class="mb-4">';
        changesHtml += '<div class="text-yellow-400 font-bold mb-2"><i class="fa-solid fa-info-circle mr-2"></i>以下待處理訂單有異動</div>';
        changesHtml += '<div class="space-y-2 max-h-[150px] overflow-auto">';

        pendingChanges.forEach(function(order) {
            var changesText = order.changes.map(function(c) { return c.icon + ' ' + c.productName + ': ' + c.diff; }).join(', ');
            changesHtml += '<div class="bg-yellow-900/30 border border-yellow-600 rounded p-2 text-sm">';
            changesHtml += '<span class="text-white">' + order.customer + '</span>';
            changesHtml += '<span class="text-yellow-300 ml-2">' + changesText + '</span></div>';
        });

        changesHtml += '</div></div>';
    }

    var buttonHtml = '';
    if (inWaveChanges.length > 0) {
        buttonHtml = '<button onclick="updateChangedWaves()" class="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold animate-pulse"><i class="fa-solid fa-print mr-2"></i>更新並列印新揀貨單</button>';
    }

    modal.innerHTML = '<div class="bg-slate-900 border border-slate-600 rounded-xl w-[600px] max-h-[80vh] shadow-2xl">' +
        '<div class="bg-gradient-to-r from-red-900 to-orange-900 p-4 rounded-t-xl border-b border-slate-700">' +
        '<h3 class="text-white font-bold text-lg"><i class="fa-solid fa-triangle-exclamation mr-2 text-red-400 animate-pulse"></i>⚠️ 訂單異動警示</h3>' +
        '<p class="text-orange-200 text-sm mt-1">偵測到 ' + orderChanges.length + ' 筆訂單有品項或數量異動</p></div>' +
        '<div class="p-4 overflow-auto max-h-[50vh]">' + changesHtml + '</div>' +
        '<div class="p-4 border-t border-slate-700 flex gap-3">' + buttonHtml +
        '<button onclick="closeOrderChangesModal()" class="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg">知道了</button>' +
        '</div></div>';

    document.body.appendChild(modal);
}

window.closeOrderChangesModal = function() {
    var modal = document.getElementById('modal-order-changes');
    if (modal) modal.remove();
};

window.updateChangedWaves = async function() {
    var changedWaves = (window._waveData.waves || []).filter(function(w) { return w.hasOrderChanges && w.status !== 'done'; });

    if (changedWaves.length === 0) {
        alert('沒有需要更新的波次');
        closeOrderChangesModal();
        return;
    }

    if (!confirm('⚠️ 將更新 ' + changedWaves.length + ' 個波次的揀貨清單\n\n更新後將【自動列印】新的揀貨單\n請準備好印表機！\n\n確定繼續嗎？')) {
        return;
    }

    var progressDiv = document.createElement('div');
    progressDiv.id = 'update-wave-progress';
    progressDiv.className = 'fixed inset-0 bg-black/90 flex items-center justify-center z-[200]';
    progressDiv.innerHTML = '<div class="bg-slate-800 rounded-xl p-8 text-center">' +
        '<i class="fa-solid fa-sync fa-spin text-5xl text-orange-400 mb-4"></i>' +
        '<div class="text-white text-xl font-bold" id="update-progress-text">更新揀貨單中...</div>' +
        '<div class="text-slate-400 text-sm mt-2" id="update-progress-detail"></div></div>';
    document.body.appendChild(progressDiv);

    var updatedWaveNos = [];

    for (var i = 0; i < changedWaves.length; i++) {
        var wave = changedWaves[i];

        document.getElementById('update-progress-text').innerText = '更新 ' + wave.waveNo + '...';
        document.getElementById('update-progress-detail').innerText = (i + 1) + ' / ' + changedWaves.length;

        var summary = {};
        var totalQty = 0;
        var updatedOrders = [];

        for (var j = 0; j < (wave.orders || []).length; j++) {
            var orderRef = wave.orders[j];
            var latestOrder = window._orderData.orders.find(function(o) { return o.orderNo === orderRef.orderNo; });

            if (latestOrder) {
                updatedOrders.push({
                    id: latestOrder.id || orderRef.id || orderRef.orderId,
                    orderId: latestOrder.id || orderRef.id || orderRef.orderId,
                    orderNo: latestOrder.orderNo,
                    customer: latestOrder.customer,
                    address: latestOrder.address,
                    logistics: latestOrder.logistics,
                    items: window.orderOpenItems(latestOrder)
                });

                window.orderOpenItems(latestOrder).forEach(function(item) {
                    var key = item.productName + '|||' + (item.spec || '');
                    if (!summary[key]) {
                        var oldItem = (wave.summary || []).find(function(s) {
                            return s.productName === item.productName && (s.spec || '') === (item.spec || '');
                        });
                        summary[key] = {
                            productName: item.productName,
                            spec: item.spec || '',
                            unit: item.packageUnit || '件',
                            totalQty: 0,
                            prevQty: oldItem ? oldItem.totalQty : 0,  // 記錄舊版數量
                            orders: []
                        };
                    }
                    var pkgQty = item.packageQty || 1;
                    summary[key].totalQty += pkgQty;
                    summary[key].orders.push({ orderNo: latestOrder.orderNo, orderId: latestOrder.id || orderRef.id || orderRef.orderId, customer: latestOrder.customer, quantity: pkgQty });
                    totalQty += pkgQty;
                });
            }
        }

        wave.orders = updatedOrders;
        wave.summary = Object.values(summary);
        wave.itemCount = Object.keys(summary).length;
        wave.totalQty = totalQty;
        wave.hasOrderChanges = false;
        wave.changedOrders = [];
        wave.updatedAt = new Date().toISOString();
        wave.reprintRequired = true;  // 標記需要重印

        if (wave.id) {
            try {
                await window.updateDoc(window.doc(window.db, 'waves', wave.id), {
                    orders: wave.orders, summary: wave.summary, itemCount: wave.itemCount,
                    totalQty: wave.totalQty, hasOrderChanges: false, changedOrders: [],
                    updatedAt: wave.updatedAt, reprintRequired: true
                });
            } catch (err) { console.error('更新波次失敗:', err); }
        }

        updatedWaveNos.push(wave.waveNo);

        await new Promise(function(resolve) { setTimeout(resolve, 100); });
    }

    document.getElementById('update-progress-text').innerText = '準備列印揀貨單...';
    document.getElementById('update-progress-detail').innerText = '';

    await new Promise(function(resolve) { setTimeout(resolve, 500); });

    printUpdatedPickingLists(changedWaves);

    document.getElementById('update-wave-progress').remove();

    saveWaves();
    refreshWaveList();
    closeOrderChangesModal();

    showUpdateCompleteAlert(updatedWaveNos);
};

function printUpdatedPickingLists(waves, changeDetails) {
    var printWindow = window.open('', '_blank', 'width=900,height=700');

    var html = '<!DOCTYPE html><html><head><title>📋 更新版揀貨單</title>' +
        '<style>' +
        'body { font-family: "Microsoft JhengHei", sans-serif; font-size: 12px; }' +
        '.wave-section { page-break-after: always; margin-bottom: 20px; }' +
        '.wave-section:last-child { page-break-after: auto; }' +
        '.update-banner { background: #dc2626; color: white; padding: 8px 15px; font-size: 14px; font-weight: bold; margin-bottom: 10px; }' +
        '.header { text-align: center; margin-bottom: 15px; border-bottom: 2px solid #333; padding-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }' +
        '.header h2 { margin: 0; font-size: 20px; }' +
        '.version { background: #374151; color: white; padding: 4px 12px; border-radius: 4px; font-weight: bold; }' +
        '.info-row { display: flex; gap: 15px; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px dashed #ccc; }' +
        '.info-item { flex: 1; }' +
        '.info-label { font-size: 11px; color: #666; }' +
        '.info-value { font-size: 15px; font-weight: bold; }' +
        'table { width: 100%; border-collapse: collapse; }' +
        'th, td { border: 1px solid #333; padding: 6px; text-align: left; }' +
        'th { background: #374151; color: white; font-size: 11px; }' +
        '.loc { font-weight: bold; font-size: 13px; color: #1e40af; }' +
        '.qty { text-align: center; font-weight: bold; font-size: 16px; color: #c00; }' +
        '.check { width: 30px; text-align: center; }' +
        '.change-add { color: #16a34a; font-weight: bold; }' +
        '.change-sub { color: #dc2626; font-weight: bold; }' +
        '.floor-1f { background: #dbeafe; }' +
        '.floor-2f { background: #fef3c7; }' +
        '.floor-3f { background: #fee2e2; }' +
        '.timestamp { text-align: right; font-size: 10px; color: #666; margin-top: 10px; }' +
        '</style></head><body>';

    waves.forEach(function(wave) {
        var now = new Date().toLocaleString('zh-TW');
        var version = (wave.printVersion || 0) + 1;
        wave.printVersion = version;

        html += '<div class="wave-section">';

        html += '<div class="update-banner">⚠️ 【更新版】請作廢舊版揀貨單</div>';

        html += '<div class="header">';
        html += '<div><h2>揀貨單</h2><h3 style="margin:5px 0 0 0">' + wave.waveNo + '</h3></div>';
        html += '<span class="version">版次 V' + version + '</span>';
        html += '</div>';

        html += '<div class="info-row">' +
            '<div class="info-item"><div class="info-label">物流商</div><div class="info-value">' + wave.logistics + '</div></div>' +
            '<div class="info-item"><div class="info-label">訂單數</div><div class="info-value">' + (wave.orders || []).length + ' 筆</div></div>' +
            '<div class="info-item"><div class="info-label">品項數</div><div class="info-value">' + wave.itemCount + ' 項</div></div>' +
            '<div class="info-item"><div class="info-label">總件數</div><div class="info-value" style="color:#dc2626;">' + wave.totalQty + ' 件</div></div>' +
            '</div>';

        var summaryWithLoc = (wave.summary || []).filter(function(item) {
            return !window.isExcludedFromPickingList(item.productName);
        }).map(function(item) {
            var invInfo = findProductInventoryInfo(item.productName, item.spec);
            return {
                productName: item.productName,
                spec: item.spec || '-',
                unit: item.unit || '件',
                totalQty: item.totalQty,
                prevQty: item.prevQty || item.totalQty,
                location: invInfo.location,
                batchNo: invInfo.batchNo,
                expiryDate: invInfo.expiryDate,
                floor: invInfo.floor
            };
        });

        summaryWithLoc.sort(function(a, b) {
            if (b.totalQty !== a.totalQty) return b.totalQty - a.totalQty;
            return a.floor - b.floor;
        });

        html += '<table>';
        html += '<tr><th class="check">✓</th><th style="width:70px">儲位</th><th style="width:100px">品名</th><th>規格</th><th style="width:80px">批號</th><th style="width:80px">效期</th><th style="width:50px" class="qty">數量</th><th style="width:35px">單位</th><th style="width:50px">異動</th></tr>';

        summaryWithLoc.forEach(function(item) {
            var floorClass = item.floor === 1 ? 'floor-1f' : (item.floor === 2 ? 'floor-2f' : (item.floor === 3 ? 'floor-3f' : ''));
            var diff = item.totalQty - item.prevQty;
            var changeHtml = '-';
            if (diff > 0) {
                changeHtml = '<span class="change-add">+' + diff + '</span>';
            } else if (diff < 0) {
                changeHtml = '<span class="change-sub">' + diff + '</span>';
            }

            html += '<tr class="' + floorClass + '">';
            html += '<td class="check">☐</td>';
            html += '<td class="loc">' + item.location + '</td>';
            html += '<td>' + item.productName + '</td>';
            html += '<td>' + item.spec + '</td>';
            html += '<td style="font-size:11px">' + item.batchNo + '</td>';
            html += '<td style="font-size:11px">' + item.expiryDate + '</td>';
            html += '<td class="qty">' + item.totalQty + '</td>';
            html += '<td>' + item.unit + '</td>';
            html += '<td style="text-align:center">' + changeHtml + '</td>';
            html += '</tr>';
        });

        html += '</table>';
        html += '<div class="timestamp">版次 V' + version + ' | 列印日期：' + now + '</div>';
        html += '</div>';
    });

    html += '<script>window.onload = function() { window.print(); }<\/script></body></html>';

    printWindow.document.write(html);
    printWindow.document.close();
}

function findProductLocation(productName, spec) {
    var pallets = window._inventoryData && window._inventoryData.pallets ? window._inventoryData.pallets : [];
    for (var i = 0; i < pallets.length; i++) {
        var p = pallets[i];
        if (p.productName === productName && (p.spec || '') === (spec || '')) {
            return p.locationId || '-';
        }
    }
    return '-';
}

function findProductInventoryInfo(productName, spec) {
    var pallets = window._inventoryData && window._inventoryData.pallets ? window._inventoryData.pallets : [];
    var result = { location: '-', batchNo: '-', expiryDate: '-', floor: 9 };

    for (var i = 0; i < pallets.length; i++) {
        var p = pallets[i];
        if (p.productName === productName && (p.spec || '') === (spec || '')) {
            result.location = p.locationId || '-';
            result.batchNo = p.batchNo || '-';

            if (p.expiryDate) {
                var d = new Date(p.expiryDate);
                if (!isNaN(d.getTime())) {
                    result.expiryDate = d.getFullYear() + '/' +
                        String(d.getMonth() + 1).padStart(2, '0') + '/' +
                        String(d.getDate()).padStart(2, '0');
                }
            }

            result.floor = getFloorFromLocation(result.location);
            break;
        }
    }

    return result;
}

function getFloorFromLocation(loc) {
    if (!loc || loc === '-') return 9; // 無儲位排最後
    if (loc.includes('1F') || loc.startsWith('A-') || loc.startsWith('B-')) return 1;
    if (loc.includes('2F') || loc.startsWith('C-') || loc.startsWith('D-')) return 2;
    if (loc.includes('3F') || loc.startsWith('E-') || loc.startsWith('F-')) return 3;
    var parts = loc.split('-');
    if (parts.length >= 3) {
        var level = parseInt(parts[2]);
        if (level >= 1 && level <= 3) return level;
    }
    return 1;
}

function showUpdateCompleteAlert(waveNos) {
    var alertDiv = document.createElement('div');
    alertDiv.id = 'update-complete-alert';
    alertDiv.className = 'fixed inset-0 bg-black/90 flex items-center justify-center z-[200]';

    var waveList = waveNos.map(function(no) { return '• ' + no; }).join('<br>');

    alertDiv.innerHTML = '<div class="bg-gradient-to-b from-red-900 to-red-800 border-4 border-red-500 rounded-2xl p-8 max-w-lg text-center shadow-2xl animate-pulse">' +
        '<div class="text-6xl mb-4">⚠️</div>' +
        '<h2 class="text-white text-2xl font-bold mb-4">揀貨單已更新！</h2>' +
        '<div class="bg-red-950/50 rounded-lg p-4 mb-4">' +
        '<p class="text-red-200 mb-2">以下波次的揀貨單已重新列印：</p>' +
        '<div class="text-white font-mono text-lg">' + waveList + '</div>' +
        '</div>' +
        '<div class="bg-yellow-500/20 border border-yellow-500 rounded-lg p-3 mb-6">' +
        '<p class="text-yellow-300 font-bold"><i class="fa-solid fa-triangle-exclamation mr-2"></i>請立即作廢舊版揀貨單！</p>' +
        '</div>' +
        '<button onclick="document.getElementById(\'update-complete-alert\').remove()" ' +
        'class="bg-white text-red-700 px-8 py-3 rounded-lg font-bold text-lg hover:bg-red-100 transition">' +
        '我知道了，已作廢舊版' +
        '</button>' +
        '</div>';

    document.body.appendChild(alertDiv);

    try {
        var audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2Onp2ckYuIfHZxaGRdX2Rqc32GjpKSj4qFf3p1cm9tamhnaGlrb3R5f4WKjY6OjImFgX57eHZ1dXV2d3l7foCDhYaHh4eFhIKAf358e3p5eXl5ent8fX5/gIGBgYGAgH9+fX18fHx8fHx9fX5+fn9/gICAgICAf39/fn59fX19fX19fn5+fn9/f39/f39/f39+fn5+fn5+fn5+fn5+f39/f39/f39/f39+fn5+fn5+fn5+fn5+fn5/f39/f39/f38=');
        audio.play();
    } catch (e) {}
}

// 匯入時換算不出件數的品項：列出來請人工填件數（全部填好才能匯入）
function askPackageQty(lines) {
    const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    return new Promise(resolve => {
        let rows = '';
        lines.forEach((l, i) => {
            rows += '<tr class="border-b border-slate-700"><td class="p-2 text-cyan-400 font-mono text-xs">' + esc(l.order.orderNo) + '</td>' +
                '<td class="p-2 text-white">' + esc(l.order.customer) + '</td>' +
                '<td class="p-2 text-slate-200">' + esc(l.item.productName) + ' ' + esc(l.item.spec) + '</td>' +
                '<td class="p-2 text-right text-yellow-400">' + esc(l.item.quantity) + ' ' + esc(l.item.unit) + '</td>' +
                '<td class="p-2"><input type="number" min="0.01" step="any" class="pkg-ask-input scan-input w-24" data-i="' + i + '"></td></tr>';
        });
        const content = '<div class="text-sm text-amber-300 mb-3">以下品項的「包裝數量」是空的，品名也沒有「*N盒」可以換算，請填入要揀幾<b>件</b>：</div>' +
            '<div class="max-h-[50vh] overflow-y-auto"><table class="w-full text-sm"><thead><tr class="text-slate-400 text-xs"><th class="p-2 text-left">單號</th><th class="p-2 text-left">客戶</th><th class="p-2 text-left">品名</th><th class="p-2 text-right">銷貨數量</th><th class="p-2 text-left">件數</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
            '<div id="pkg-ask-msg" class="text-red-400 text-sm mt-2"></div>' +
            '<div class="flex gap-2 mt-4"><button id="pkg-ask-ok" class="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold">填好了，繼續匯入</button>' +
            '<button id="pkg-ask-cancel" class="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg">取消匯入</button></div>';
        WMS.createModal('modal-pkg-ask', { title: '請確認件數（' + lines.length + ' 項）', icon: 'fa-solid fa-boxes-stacked text-amber-400', content: content, width: '760px', closeOnBackdrop: false });
        const done = ok => { WMS.closeModal('modal-pkg-ask'); resolve(ok); };
        document.querySelector('#modal-pkg-ask button[onclick*="closeModal"]').onclick = () => done(false);
        document.getElementById('pkg-ask-cancel').onclick = () => done(false);
        document.getElementById('pkg-ask-ok').onclick = () => {
            const inputs = document.querySelectorAll('.pkg-ask-input');
            let missing = 0;
            inputs.forEach(inp => { const v = parseFloat(inp.value); if (!(v > 0)) { missing++; inp.classList.add('border-red-500'); } else inp.classList.remove('border-red-500'); });
            if (missing) { document.getElementById('pkg-ask-msg').innerText = '還有 ' + missing + ' 項沒填件數'; return; }
            inputs.forEach(inp => { lines[parseInt(inp.dataset.i, 10)].item.packageQty = parseFloat(inp.value); });
            done(true);
        };
    });
}

window.importERPExcel = async function(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

            const dataRows = rows.slice(5);

            const COL = {
                DATE: 0,        // 銷貨日期
                ORDER_NO: 1,    // 銷貨單號
                CUST_CODE: 2,   // 客戶代號
                CUST_NAME: 3,   // 客戶全名
                PRODUCT: 4,     // 品名
                SPEC: 5,        // 規格
                PKG_QTY: 6,     // 包裝數量
                PKG_UNIT: 7,    // 包裝單位
                QTY: 8,         // 銷貨數量
                UNIT: 9,        // 單位
                PRICE: 10,      // 單價
                REMARK: 11,     // 備註 (物流商)
                BATCH: 12,      // 批號
                ADDR1: 13,      // 送貨地址一
                ADDR2: 14       // 送貨地址二
            };

            const orderMap = new Map();
            let lastOrderNo = null;
            // 數字欄：去掉千分位，保留小數（2.5 公斤不會變 2）
            const num = v => parseFloat(String(v == null ? '' : v).replace(/,/g, '')) || 0;
            const needPkg = [];  // 換算不出件數、要人工填的品項

            for (const row of dataRows) {
                if (!row[COL.PRODUCT]) continue;
                if (String(row[COL.DATE]).includes('小計') || String(row[COL.DATE]).includes('合計')) continue;

                let orderNo = row[COL.ORDER_NO] ? String(row[COL.ORDER_NO]).trim() : lastOrderNo;
                if (!orderNo) continue;
                const logistics = parseLogistics(row[COL.REMARK]);
                if (row[COL.ORDER_NO]) lastOrderNo = orderNo;

                // 同一張單號就是同一張訂單（不再依物流商拆成兩張，避免後面那張蓋掉前面的品項）
                if (!orderMap.has(orderNo)) {
                    orderMap.set(orderNo, {
                        orderNo: orderNo,
                        orderDate: row[COL.DATE] ? String(row[COL.DATE]).trim() : '',
                        customerCode: row[COL.CUST_CODE] ? String(row[COL.CUST_CODE]).trim() : '',
                        customer: row[COL.CUST_NAME] ? String(row[COL.CUST_NAME]).trim() : '',
                        logistics: logistics,
                        address: row[COL.ADDR1] ? String(row[COL.ADDR1]).trim() : '',
                        address2: row[COL.ADDR2] ? String(row[COL.ADDR2]).trim() : '',
                        remark: row[COL.REMARK] ? String(row[COL.REMARK]).trim() : '',
                        status: 'pending',
                        items: [],
                        createdAt: new Date().toISOString(),
                        importedAt: new Date().toISOString()
                    });
                }

                let currentOrder = orderMap.get(orderNo);
                if (currentOrder.logistics === '未指定' && logistics !== '未指定') currentOrder.logistics = logistics;
                if (!currentOrder.remark && row[COL.REMARK]) currentOrder.remark = String(row[COL.REMARK]).trim();

                if (row[COL.PRODUCT]) {
                    var productName = String(row[COL.PRODUCT]).trim();

                    // === 過濾不需要的項目 ===

                    var headerKeywords = ['品名', '規格', '包裝數量', '包裝單位', '銷貨數量', '單位', '單價', '備註', '批號', '送貨地址'];
                    var isHeader = headerKeywords.some(function(kw) { return productName === kw || productName.includes(kw + ' '); });
                    if (isHeader) continue;

                    var feeKeywords = ['運費', '費用', '保力龍', '保麗龍', '代收', '代墊', '手續費', '服務費', '包材', '紙箱費', '冰袋', '冰塊'];
                    var isFee = feeKeywords.some(function(kw) { return productName.includes(kw); });
                    if (isFee) continue;

                    var qty = num(row[COL.QTY]);
                    if (!productName || qty <= 0) continue;

                    // === 件數：品名有「*N盒」就換算；否則用包裝數量欄；單位本來就是件／箱就等於數量；都沒有就要人工填 ===
                    var unit = row[COL.UNIT] ? String(row[COL.UNIT]).trim() : '';
                    var boxPerPkg = parseBoxPerPackage(productName);
                    var pkgCell = num(row[COL.PKG_QTY]);
                    var pkgQty = null;
                    if (boxPerPkg > 0) pkgQty = Math.ceil(qty / boxPerPkg);
                    else if (pkgCell > 0) pkgQty = pkgCell;
                    else if (/^(件|箱|CTN|CS)$/i.test(unit) || window.isExcludedFromPickingList(productName)) pkgQty = qty;

                    var item = {
                        productName: productName,
                        spec: row[COL.SPEC] ? String(row[COL.SPEC]).trim() : '',
                        quantity: qty,                    // 最小單位數量（盒）
                        unit: unit,
                        packageQty: pkgQty,               // 件數
                        packageUnit: '件',                // 固定為件
                        boxPerPackage: boxPerPkg,         // 每件盒數
                        batchNo: row[COL.BATCH] ? String(row[COL.BATCH]).trim() : '',
                        price: num(row[COL.PRICE])
                    };
                    currentOrder.items.push(item);
                    if (pkgQty === null) needPkg.push({ order: currentOrder, item: item });
                }
            }

            // 換算不出件數的品項：列出來請人工填，全部填好才匯入
            if (needPkg.length > 0) {
                const ok = await askPackageQty(needPkg);
                if (!ok) { alert('已取消匯入，資料沒有變動。'); return; }
            }

            const orders = Array.from(orderMap.values());

            console.log('解析訂單:', orders.length, '筆');

            let savedCount = 0;
            let skipCount = 0;
            let modifiedCount = 0;
            var orderChanges = [];
            var shippedChanged = [];

            for (const order of orders) {
                const existing = window._orderData.orders.find(o => o.orderNo === order.orderNo);
                if (existing) {
                    // 有異動時先讀資料庫最新狀態（畫面上的可能是舊的：別台電腦或手機已經出貨）
                    if (existing.id && detectOrderChanges(existing, order).length > 0) {
                        try {
                            var freshSnap = await window.db.collection('salesOrders').doc(existing.id).get();
                            if (freshSnap.exists) Object.assign(existing, freshSnap.data());
                        } catch (err) { console.warn('讀取訂單最新狀態失敗', err); }
                    }
                    // 已出貨（含部分出貨）或所在波次已完成的訂單不再改品項
                    var exWave = existing.waveNo && window._waveData.waves.find(function(w) { return w.waveNo === existing.waveNo; });
                    if (existing.status === 'shipped' || existing.status === 'partial' || Array.isArray(existing.backorderItems) || (exWave && exWave.status === 'done')) {
                        if (detectOrderChanges(existing, order).length > 0) shippedChanged.push(order.orderNo);
                        skipCount++;
                        continue;
                    }
                    var changes = detectOrderChanges(existing, order);
                    if (changes.length > 0) {
                        orderChanges.push({
                            orderNo: order.orderNo,
                            customer: order.customer,
                            waveNo: existing.waveNo,
                            changes: changes
                        });

                        existing.items = order.items;
                        existing.modifiedAt = new Date().toISOString();
                        existing.hasChanges = true;

                        if (existing.waveNo) {
                            var wave = window._waveData.waves.find(function(w) { return w.waveNo === existing.waveNo; });
                            if (wave) {
                                wave.hasOrderChanges = true;
                                wave.changedOrders = wave.changedOrders || [];
                                if (wave.changedOrders.indexOf(order.orderNo) === -1) {
                                    wave.changedOrders.push(order.orderNo);
                                }
                            }
                        }

                        if (existing.id) {
                            try {
                                await window.updateDoc(window.doc(window.db, 'salesOrders', existing.id), {
                                    items: order.items,
                                    modifiedAt: existing.modifiedAt,
                                    hasChanges: true
                                });
                            } catch (err) { console.error('更新訂單失敗:', err); }
                        }
                        modifiedCount++;
                    } else {
                        skipCount++;
                    }
                    continue;
                }

                try {
                    // 記下文件 ID：之後排波次、出貨要靠它更新訂單狀態（沒有 ID 時狀態不會存回資料庫，重新整理後可能被重複排波次）
                    const orderRef = await window.addDoc(window.collection(window.db, 'salesOrders'), order);
                    order.id = orderRef.id;
                    window._orderData.orders.push(order);
                    savedCount++;
                } catch (err) {
                    console.error('儲存訂單失敗:', order.orderNo, err);
                }
            }

            window._orderData.lastImportTime = new Date().toISOString();

            if (modifiedCount > 0) {
                showOrderChangesAlert(orderChanges);
            }
            if (shippedChanged.length > 0) {
                alert('⚠️ 以下訂單已經出貨，Excel 裡的品項有變動但沒有套用（請在 ERP 另外處理）：\n\n' + shippedChanged.join('\n'));
            }

            renderOrderList();
            refreshWaveList();

            if (savedCount > 0) {
                var pendingOrders = window._orderData.orders.filter(window.orderWaveable);

                var autoCreate = confirm(
                    '✅ 匯入完成！\n\n' +
                    '新增：' + savedCount + ' 筆\n' +
                    (modifiedCount > 0 ? '⚠️ 異動：' + modifiedCount + ' 筆\n' : '') +
                    '略過（無變更）：' + skipCount + ' 筆\n' +
                    '待建波次：' + pendingOrders.length + ' 筆\n\n' +
                    '━━━━━━━━━━━━━━━━━━━━━━\n' +
                    '是否要自動依物流商建立波次？\n' +
                    '（系統將依 13 種物流商自動分組建立）'
                );

                if (autoCreate) {
                    await autoCreateWavesByLogistics();
                }
            } else {
                var resultMsg = '✅ 匯入完成！\n\n' +
                      '新增：' + savedCount + ' 筆\n';
                if (modifiedCount > 0) {
                    resultMsg += '⚠️ 異動：' + modifiedCount + ' 筆\n';
                }
                resultMsg += '略過（無變更）：' + skipCount + ' 筆\n' +
                      '總訂單數：' + window._orderData.orders.length + ' 筆';
                alert(resultMsg);
            }

        } catch (err) {
            console.error('匯入失敗:', err);
            alert('❌ 匯入失敗：' + err.message);
        }
    };

    reader.readAsArrayBuffer(file);
    event.target.value = '';
};

function renderWaveOrderList(orders) {
    const tbody = document.getElementById('wave-orders-body');
    if (!tbody) return;

    if (!orders || orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-slate-500 py-8">沒有待出貨的訂單</td></tr>';
        return;
    }

    let html = '';
    orders.forEach(order => {
        const items = order.items || [];
        items.forEach((item, idx) => {
            const rowClass = idx === 0 ? 'border-t border-slate-600' : '';
            html += `<tr class="hover:bg-slate-800/50 ${rowClass}">`;

            if (idx === 0) {
                html += `<td class="p-2" rowspan="${items.length}">
                    <input type="checkbox" class="wave-order-check" data-order-id="${order.id}" data-order-no="${order.orderNo}">
                </td>`;
                html += `<td class="p-2 text-cyan-400 font-mono text-xs" rowspan="${items.length}">${order.orderNo}</td>`;
                html += `<td class="p-2 text-white" rowspan="${items.length}">${order.customer}</td>`;
                html += `<td class="p-2" rowspan="${items.length}">
                    <span class="px-2 py-1 rounded text-xs ${getLogisticsColor(order.logistics)}">${order.logistics}</span>
                </td>`;
            }

            html += `<td class="p-2 text-slate-300">${item.productName} ${item.spec || ''}</td>`;
            html += `<td class="p-2 text-right text-yellow-400 font-bold">${item.quantity}</td>`;
            html += `<td class="p-2 text-slate-400 text-xs">${order.orderDate || ''}</td>`;
            html += '</tr>';
        });
    });

    tbody.innerHTML = html;

    document.querySelectorAll('.wave-order-check').forEach(cb => {
        cb.addEventListener('change', updateWaveSelectedCount);
    });
}

function getLogisticsColor(logistics) {
    const colors = {
        '全日物流': 'bg-blue-600',
        '合順貨運': 'bg-green-600',
        '大榮貨運': 'bg-orange-600',
        '裕鵬物流': 'bg-purple-600',
        '黑貓宅急便': 'bg-yellow-600 text-black',
        '新竹物流': 'bg-red-600',
        '崇文自送': 'bg-cyan-600',
        '科技物流': 'bg-indigo-600',
        '阿誠': 'bg-pink-600',
        '文生': 'bg-teal-600',
        '金東石': 'bg-amber-600',
        '奧林': 'bg-lime-600',
        '自取': 'bg-slate-600',
        '未指定': 'bg-slate-700'
    };
    return colors[logistics] || 'bg-slate-600';
}

window.autoCreateWavesByLogistics = async function() {
    var pendingOrders = window._orderData.orders.filter(window.orderWaveable);

    if (pendingOrders.length === 0) {
        alert('沒有待處理的訂單');
        return;
    }

    var logisticsGroups = {};
    pendingOrders.forEach(function(order) {
        var logistics = order.logistics || '未指定物流';
        if (!logisticsGroups[logistics]) {
            logisticsGroups[logistics] = [];
        }
        logisticsGroups[logistics].push(order);
    });

    var logisticsCount = Object.keys(logisticsGroups).length;

    var previewText = '將建立 ' + logisticsCount + ' 個波次：\n\n';
    Object.keys(logisticsGroups).forEach(function(logistics) {
        var orders = logisticsGroups[logistics];
        var totalQty = 0;
        orders.forEach(function(o) {
            window.orderOpenItems(o).forEach(function(item) { totalQty += item.packageQty || 1; });
        });
        previewText += '• ' + logistics + '：' + orders.length + ' 單 / ' + totalQty + ' 件\n';
    });

    if (!confirm(previewText + '\n確定建立嗎？')) {
        return;
    }

    var progressDiv = document.createElement('div');
    progressDiv.id = 'auto-wave-progress';
    progressDiv.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-[200]';
    progressDiv.innerHTML = '<div class="bg-slate-800 rounded-xl p-8 text-center">' +
        '<i class="fa-solid fa-spinner fa-spin text-4xl text-blue-400 mb-4"></i>' +
        '<div class="text-white text-lg" id="progress-text">建立波次中...</div>' +
        '<div class="text-slate-400 text-sm mt-2" id="progress-detail"></div></div>';
    document.body.appendChild(progressDiv);

    var createdWaves = [];
    var failed = [];
    var skippedAll = [];
    var totalOrders = 0;
    var totalItems = 0;
    var logisticsKeys = Object.keys(logisticsGroups);

    for (var i = 0; i < logisticsKeys.length; i++) {
        var logistics = logisticsKeys[i];
        document.getElementById('progress-text').innerText = '建立 ' + logistics + ' 波次...';
        document.getElementById('progress-detail').innerText = (i + 1) + ' / ' + logisticsKeys.length;
        try {
            var res = await window.createWaveFromOrders(logisticsGroups[logistics], logistics, { autoCreated: true });
            createdWaves.push({ waveNo: res.wave.waveNo, logistics: logistics, orderCount: res.wave.orderCount, totalQty: res.wave.totalQty });
            totalOrders += res.wave.orderCount;
            totalItems += res.wave.totalQty;
            skippedAll = skippedAll.concat(res.skipped);
        } catch (err) {
            console.error('建立波次失敗:', logistics, err);
            failed.push(logistics + '：' + err.message);
        }
    }

    document.getElementById('auto-wave-progress').remove();

    refreshWaveList();
    renderOrderList();

    var resultText = (failed.length ? '⚠️ 部分波次建立失敗' : '✅ 自動建立完成！') + '\n\n' +
        '建立波次：' + createdWaves.length + ' 個\n' +
        '總訂單數：' + totalOrders + ' 筆\n' +
        '總件數：' + totalItems + ' 件\n\n' +
        '━━━━━━━━━━━━━━━━━━━━━━\n';

    createdWaves.forEach(function(w) {
        resultText += '• ' + w.waveNo + ' (' + w.logistics + ')：' + w.orderCount + '單 ' + w.totalQty + '件\n';
    });
    if (skippedAll.length) resultText += '\n已被其他人排走、略過：\n' + skippedAll.join('\n') + '\n';
    if (failed.length) resultText += '\n❌ 失敗（訂單沒有變動）：\n' + failed.join('\n');

    alert(resultText);
};

// 依訂單彙總揀貨清單（建立波次、追加訂單共用）
function buildWaveSummary(orders) {
    const summary = {};
    let totalQty = 0;
    let totalSmallQty = 0;

    orders.forEach(order => {
        (order.items || []).forEach(item => {
            const key = `${item.productName}|||${item.spec || ''}`;
            if (!summary[key]) {
                summary[key] = {
                    productName: item.productName,
                    spec: item.spec || '',
                    unit: item.packageUnit || '件',     // 包裝單位
                    smallUnit: item.unit || '',         // 最小單位
                    totalQty: 0,                        // 包裝數量
                    totalSmallQty: 0,                   // 最小單位數量
                    orders: []  // 記錄哪些訂單需要這個品項
                };
            }
            const pkgQty = item.packageQty || 1;
            summary[key].totalQty += pkgQty;
            summary[key].totalSmallQty += item.quantity || 0;
            summary[key].orders.push({
                orderNo: order.orderNo,
                orderId: order.id || order.orderId,
                customer: order.customer,
                quantity: pkgQty  // 使用包裝數量
            });
            totalQty += pkgQty;
            totalSmallQty += item.quantity || 0;
        });
    });

    return { summaryList: Object.values(summary), totalQty: totalQty, totalSmallQty: totalSmallQty };
}

// ========== 建立波次（手動、依物流自動、追加訂單共用）==========
// 可以排波次的訂單：待處理／已確認／部分出貨（欠貨），而且不在任何波次中
window.orderWaveable = function(o) {
    return !!o && ['pending', 'confirmed', 'partial'].indexOf(o.status) >= 0 && !o.waveNo;
};
// 還沒出貨的品項：部分出貨過的訂單只剩欠貨（backorderItems）
window.orderOpenItems = function(o) {
    return (o && Array.isArray(o.backorderItems)) ? o.backorderItems : ((o && o.items) || []);
};

// 今天的下一個波次編號（看資料庫裡今天最大的號碼，刪掉中間的波次也不會重號）
window.nextWaveNo = async function(offset) {
    var t = new Date();
    var prefix = 'W' + String(t.getFullYear()).slice(2) + String(t.getMonth() + 1).padStart(2, '0') + String(t.getDate()).padStart(2, '0') + '-';
    var max = 0;
    var scan = function(no) { if (no && String(no).indexOf(prefix) === 0) max = Math.max(max, parseInt(String(no).slice(prefix.length), 10) || 0); };
    ((window._waveData && window._waveData.waves) || []).forEach(function(w) { scan(w.waveNo); });
    try {
        var snap = await window.db.collection('waves').where('waveNo', '>=', prefix).where('waveNo', '<=', prefix + '').get();
        snap.forEach(function(d) { scan(d.data().waveNo); });
    } catch (e) { console.warn('讀取今日波次編號失敗，改用本機資料', e); }
    return prefix + String(max + 1 + (offset || 0)).padStart(3, '0');
};

function waveOrderEntry(o) {
    return { id: o.id, orderId: o.id, orderNo: o.orderNo, customer: o.customer || '', address: o.address || '',
        logistics: o.logistics || '', items: window.orderOpenItems(o), backorder: o.status === 'partial' };
}
function waveTotals(entries) {
    var t = buildWaveSummary(entries);
    return { summary: t.summaryList, orderCount: entries.length, itemCount: t.summaryList.length, totalQty: t.totalQty, totalSmallQty: t.totalSmallQty };
}
function stripUndefined(o) { return JSON.parse(JSON.stringify(o)); }

// 在同一筆交易裡：確認每張訂單還沒被別的波次排走、建立波次、訂單標記「波次中」
// 已經被排走或已出貨的訂單會略過（回傳 skipped）；全部都不能排時丟出錯誤
window.createWaveFromOrders = async function(orders, logistics, extra) {
    var db = window.db;
    var withId = orders.filter(function(o) { return o.id; });
    if (withId.length === 0) throw new Error('沒有可以排波次的訂單');
    for (var attempt = 0; attempt < 5; attempt++) {
        var waveNo = await window.nextWaveNo(attempt);
        var waveRef = db.collection('waves').doc(waveNo);
        try {
            var res = await db.runTransaction(async function(tx) {
                var ws = await tx.get(waveRef);
                if (ws.exists) { var dup = new Error('dup'); dup.retry = true; throw dup; }
                var snaps = await Promise.all(withId.map(function(o) { return tx.get(db.collection('salesOrders').doc(o.id)); }));
                var ok = [], skipped = [];
                snaps.forEach(function(s, i) {
                    if (s.exists && window.orderWaveable(s.data())) ok.push(Object.assign({}, withId[i], s.data(), { id: s.id }));
                    else skipped.push(withId[i].orderNo + (s.exists && s.data().waveNo ? '（已在 ' + s.data().waveNo + '）' : '（已出貨或不存在）'));
                });
                if (ok.length === 0) throw new Error('選的訂單都已經排進其他波次或已出貨：\n' + skipped.join('\n'));
                var entries = ok.map(waveOrderEntry);
                var wave = stripUndefined(Object.assign({
                    waveNo: waveNo, logistics: logistics || '', status: 'pending', orders: entries
                }, waveTotals(entries), {
                    createdAt: new Date().toISOString(),
                    createdBy: window.getOperatorName ? window.getOperatorName() : ''
                }, extra || {}));
                tx.set(waveRef, wave);
                ok.forEach(function(o) { tx.update(db.collection('salesOrders').doc(o.id), { status: 'inWave', waveNo: waveNo }); });
                return { wave: wave, ok: ok, skipped: skipped };
            });
            res.wave.id = waveRef.id;
            res.ok.forEach(function(o) {
                var local = window._orderData.orders.find(function(x) { return x.id === o.id; });
                if (local) { local.status = 'inWave'; local.waveNo = waveNo; }
            });
            window._waveData.waves.push(res.wave);
            if (typeof saveWaves === 'function') saveWaves();
            return res;
        } catch (e) {
            if (e && e.retry) continue;
            throw e;
        }
    }
    throw new Error('波次編號一直重複，請稍後再試');
};

// 追加訂單到還沒完成的波次（同樣在交易裡確認訂單沒被排走、波次還沒完成）
window.addOrdersToWaveTx = async function(wave, orders) {
    var db = window.db;
    var waveRef = db.collection('waves').doc(wave.id);
    var withId = orders.filter(function(o) { return o.id; });
    var res = await db.runTransaction(async function(tx) {
        var ws = await tx.get(waveRef);
        if (!ws.exists) throw new Error('波次已被刪除');
        var cur = ws.data();
        if (cur.status === 'done') throw new Error('波次已完成，不能追加訂單');
        var snaps = await Promise.all(withId.map(function(o) { return tx.get(db.collection('salesOrders').doc(o.id)); }));
        var ok = [], skipped = [];
        snaps.forEach(function(s, i) {
            if (s.exists && window.orderWaveable(s.data())) ok.push(Object.assign({}, withId[i], s.data(), { id: s.id }));
            else skipped.push(withId[i].orderNo);
        });
        if (ok.length === 0) throw new Error('選的訂單都已經排進其他波次或已出貨');
        var entries = (cur.orders || []).concat(ok.map(waveOrderEntry));
        var data = stripUndefined(Object.assign({ orders: entries }, waveTotals(entries), { updatedAt: new Date().toISOString() }));
        tx.update(waveRef, data);
        ok.forEach(function(o) { tx.update(db.collection('salesOrders').doc(o.id), { status: 'inWave', waveNo: cur.waveNo }); });
        return { data: data, ok: ok, skipped: skipped };
    });
    Object.assign(wave, res.data);
    res.ok.forEach(function(o) {
        var local = window._orderData.orders.find(function(x) { return x.id === o.id; });
        if (local) { local.status = 'inWave'; local.waveNo = wave.waveNo; }
    });
    return res;
};

window.createWave = async function() {
    const checked = document.querySelectorAll('.wave-order-check:checked');
    if (checked.length === 0) {
        alert('請選擇至少一筆訂單');
        return;
    }

    // 勾選框帶的是訂單文件 ID（data-id；舊畫面是 data-order-id）
    const ids = new Set();
    checked.forEach(cb => ids.add(cb.dataset.id || cb.dataset.orderId));
    const selectedOrders = window._orderData.orders.filter(o => o.id && ids.has(o.id));
    if (selectedOrders.length === 0) {
        alert('找不到勾選的訂單，請重新整理後再試');
        return;
    }

    const logisticsSet = new Set();
    selectedOrders.forEach(o => logisticsSet.add(o.logistics || '未指定'));

    let res;
    try {
        res = await window.createWaveFromOrders(selectedOrders, Array.from(logisticsSet).join(', '));
    } catch (err) {
        console.error('建立波次失敗:', err);
        alert('❌ 建立波次失敗：' + err.message + '\n\n波次沒有建立，訂單狀態沒有變動。');
        return;
    }
    const wave = res.wave;

    closeCreateWaveModal();
    refreshWaveList();
    renderOrderList();

    alert('✅ 波次 ' + wave.waveNo + ' 建立成功！\n\n' +
          '訂單數：' + wave.orderCount + ' 筆\n' +
          '品項數：' + wave.itemCount + ' 項\n' +
          '總件數：' + wave.totalQty + ' 件' +
          (res.skipped.length ? '\n\n⚠️ 以下訂單已被排進其他波次或已出貨，沒有加入：\n' + res.skipped.join('\n') : '') +
          '\n\n📱 手機版已同步');
};

window.openWaveExecute = function(waveNo) {
    const wave = window._waveData.waves.find(w => w.waveNo === waveNo);
    if (!wave) {
        alert('找不到波次 ' + waveNo);
        return;
    }

    if (wave.status === 'pending') {
        wave.status = 'picking';
        wave.startedAt = new Date().toISOString();
        saveWaves();

        if (wave.id) {
            window.updateDoc(window.doc(window.db, 'waves', wave.id), {
                status: 'picking',
                startedAt: wave.startedAt
            }).catch(err => console.error('更新波次狀態失敗:', err));
        }
    }

    window._waveData.currentWave = wave;
    window._waveData.pickingList = [];
    window._waveData.completedItems = wave.completedItems || [];

    document.getElementById('wave-exec-no').innerText = wave.waveNo;
    document.getElementById('wave-exec-logistics').innerText = '物流商：' + wave.logistics;

    generatePickingListV2(wave);

    document.getElementById('modal-wave-execute').classList.remove('hidden');

    setTimeout(function() {
        document.getElementById('wave-scan-input').focus();
    }, 100);
};

function generatePickingListV2(wave) {
    const pallets = window.currentPallets ? window.currentPallets() : [];
    const pickingList = window.buildWavePickingList(wave, pallets);
    window._waveData.pickingList = pickingList;
    renderPickingListV2();
    updateWaveProgress();
}

function renderPickingListV2() {
    const tbody = document.getElementById('wave-picking-list');
    if (!tbody) return;

    const list = window._waveData.pickingList;

    if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-slate-500 py-8">沒有揀貨項目</td></tr>';
        return;
    }

    let html = '';
    list.forEach(item => {
        const statusIcon = item.completed ?
            '<i class="fa-solid fa-check-circle text-green-500 text-lg"></i>' :
            (item.shortage ?
                '<i class="fa-solid fa-exclamation-triangle text-red-500 text-lg"></i>' :
                '<i class="fa-regular fa-circle text-slate-500 text-lg"></i>');

        const rowClass = item.completed ? 'bg-green-900/20' : (item.shortage ? 'bg-red-900/20' : '');
        const textClass = item.completed ? 'line-through text-slate-500' : '';

        const orderInfo = (item.orders || []).slice(0, 3).map(o =>
            `${o.customer}(${o.quantity})`
        ).join(', ');
        const moreOrders = (item.orders || []).length > 3 ? '...' : '';

        let qtyDisplay = `<span class="text-yellow-400 font-bold text-lg">${item.pickQty}</span>`;
        if (item.totalWeight && item.totalWeight > 0) {
            const pickWeight = item.availableQty > 0 ? Math.round(item.pickQty / item.availableQty * item.totalWeight * 10) / 10 : 0;
            if (pickWeight > 0) {
                qtyDisplay += `<span class="text-amber-400 text-xs ml-1">/${pickWeight}kg</span>`;
            }
        }

        html += `<tr class="hover:bg-slate-800/50 border-b border-slate-700/50 ${rowClass}">`;
        html += `<td class="p-2 text-center">${statusIcon}</td>`;
        html += `<td class="p-2 ${textClass}"><span class="text-cyan-400 font-mono">${item.locationId}</span></td>`;
        const companyTag = item.company ? ` <span class="text-[10px] px-1 rounded ${item.company === '八方' ? 'bg-purple-900/60 text-purple-300' : 'bg-blue-900/60 text-blue-300'}">${item.company}</span>` : '';
        html += `<td class="p-2 ${textClass}"><span class="text-purple-400 font-mono text-xs">${item.palletId}</span>${companyTag}</td>`;
        html += `<td class="p-2 ${textClass} text-white">${item.productName}${item.shortage && item.note ? `<div class="text-[10px] text-amber-400">${item.note}</div>` : ''}</td>`;
        html += `<td class="p-2 ${textClass} text-slate-400 text-xs">${item.spec}</td>`;
        html += `<td class="p-2 text-right ${textClass}">
            ${qtyDisplay}
            ${!item.shortage ? `<span class="text-slate-500 text-xs ml-1">/ ${item.availableQty}</span>` : ''}
        </td>`;
        html += `<td class="p-2 ${textClass} text-xs text-slate-400">${item.batchNo || '-'}</td>`;
        html += `<td class="p-2 ${textClass} text-xs text-slate-500" title="${(item.orders || []).map(o => o.customer).join(', ')}">${orderInfo}${moreOrders}</td>`;
        html += '</tr>';
    });

    tbody.innerHTML = html;
}

function updateWaveProgress() {
    const list = window._waveData.pickingList;
    const completed = list.filter(i => i.completed).length;
    const total = list.filter(i => !i.shortage).length;

    document.getElementById('wave-exec-progress').innerText = completed + '/' + total;
}

window.confirmWaveScan = async function() {
    const input = document.getElementById('wave-scan-input');
    const result = document.getElementById('wave-scan-result');
    const scanned = input.value.trim().toUpperCase();

    if (!scanned) return;

    const list = window._waveData.pickingList;

    const found = list.find(i => !i.completed && !i.shortage &&
        (i.palletId === scanned || i.palletId.toUpperCase() === scanned ||
         i.locationId === scanned || i.locationId.toUpperCase() === scanned));

    if (!found) {
        result.className = 'mt-2 text-sm p-2 rounded bg-red-900/50 text-red-300';
        result.innerText = '❌ 找不到匹配項目：' + scanned;
        result.classList.remove('hidden');
        input.select();
        return;
    }

    found.completed = true;

    const wave = window._waveData.currentWave;
    if (!wave.completedItems) wave.completedItems = [];
    wave.completedItems.push(found.id);

    if (wave.id) {
        try {
            // arrayUnion：手機與電腦同時揀貨時不會互相覆蓋進度
            await window.updateDoc(window.doc(window.db, 'waves', wave.id), {
                completedItems: firebase.firestore.FieldValue.arrayUnion(found.id),
                status: 'picking'
            });
        } catch (err) {
            console.error('更新進度失敗:', err);
        }
    }

    saveWaves();

    result.className = 'mt-2 text-sm p-2 rounded bg-green-900/50 text-green-300';
    result.innerText = '✅ ' + found.locationId + ' → ' + found.productName + ' x ' + found.pickQty;
    result.classList.remove('hidden');

    renderPickingListV2();
    updateWaveProgress();

    input.value = '';
    input.focus();
};

window.printSortingLabels = function() {
    const wave = window._waveData.currentWave;
    if (!wave || !wave.orders) {
        alert('沒有訂單資料');
        return;
    }

    const printWindow = window.open('', '_blank', 'width=1100,height=800');
    let labelsHtml = '';

    wave.orders.forEach(order => {
        let totalPkg = 0;
        const itemsHtml = (order.items || []).filter(item => {
            return !window.isExcludedFromSortingLabel(item.productName);
        }).map(item => {
            const qty = item.quantity || 0;
            const boxPerPkg = window.parseBoxPerPackage ? window.parseBoxPerPackage(item.productName) : 0;
            const pkgQty = (boxPerPkg > 0 && qty > 0) ? Math.ceil(qty / boxPerPkg) : (item.packageQty || 1);
            const isPackaging = window.isPackagingItem(item.productName);
            if (!isPackaging) {
                totalPkg += pkgQty;
            }
            const qtyText = isPackaging ? '(包材)' : pkgQty + ' 件';
            return `<div class="item">${item.productName} ${item.spec || ''} <strong>${qtyText}</strong></div>`;
        }).join('');

        labelsHtml += `
            <div class="label">
                <div class="logistics">${order.logistics || wave.logistics}</div>
                <div class="order-no">📦 ${order.orderNo}</div>
                <div class="customer">👤 ${order.customer}</div>
                <div class="total">共 ${totalPkg} 件</div>
                <div class="items">${itemsHtml}</div>
                ${order.address ? `<div class="address">📍 ${order.address}</div>` : ''}
            </div>
        `;
    });

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>分貨標籤 - ${wave.waveNo}</title>
            <style>
                body { font-family: 'Microsoft JhengHei', sans-serif; }
                .label {
                    border: 2px solid #333;
                    padding: 15px;
                    margin: 10px;
                    page-break-inside: avoid;
                    width: 300px;
                    display: inline-block;
                    vertical-align: top;
                }
                .logistics {
                    background: #333;
                    color: white;
                    padding: 5px 10px;
                    font-weight: bold;
                    margin: -15px -15px 10px -15px;
                }
                .order-no { font-size: 14px; color: #666; margin-bottom: 5px; }
                .customer { font-size: 20px; font-weight: bold; margin-bottom: 10px; }
                .items { border-top: 1px dashed #ccc; padding-top: 10px; }
                .item { margin: 5px 0; }
                .total {
                    background: #dc2626;
                    color: white;
                    padding: 8px;
                    text-align: center;
                    font-size: 20px;
                    font-weight: bold;
                    margin: 10px 0;
                    border-radius: 4px;
                }
                .address {
                    font-size: 12px;
                    color: #666;
                    margin-top: 10px;
                    border-top: 1px dashed #ccc;
                    padding-top: 10px;
                }
                @media print {
                    .label { break-inside: avoid; }
                }
            </style>
        </head>
        <body>
            ${labelsHtml}
        </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.print();
};

window.completeWave = async function() {
    const wave = window._waveData.currentWave;
    const list = window._waveData.pickingList;

    if (wave && wave.status === 'done') {
        alert('此波次已經完成，不能重複出庫');
        return;
    }

    // 先取最新進度：手機掃過的項目也要算進來（不然會被當成未揀、庫存不扣）
    if (wave && wave.id) {
        try {
            const snap = await window.db.collection('waves').doc(wave.id).get();
            if (!snap.exists) { alert('此波次已被刪除（訂單可能已排進其他波次），請重新整理'); return; }
            const fresh = snap.data();
            if (fresh.status === 'done') { wave.status = 'done'; alert('此波次已經在其他裝置完成'); closeWaveExecuteModal(); return; }
            const doneIds = fresh.completedItems || [];
            wave.completedItems = doneIds;
            list.forEach(i => { if (doneIds.indexOf(i.id) >= 0) i.completed = true; });
            renderPickingListV2();
            updateWaveProgress();
        } catch (err) {
            alert('❌ 讀取波次最新進度失敗：' + err.message);
            return;
        }
    }

    const completed = list.filter(i => i.completed).length;
    const total = list.filter(i => !i.shortage).length;

    if (completed === 0) {
        alert('尚未揀貨任何項目');
        return;
    }

    if (completed < total) {
        if (!confirm(`尚有 ${total - completed} 項未完成，確定要結束波次嗎？`)) {
            return;
        }
    }

    const shortN = list.filter(i => i.shortage || !i.completed).length;
    if (!confirm(`確定完成波次 ${wave.waveNo}？\n\n已揀：${completed}/${total} 項` + (shortN ? `\n缺貨／未揀 ${shortN} 項：相關訂單會標為「部分出貨」，缺的貨之後可以再排波次` : ''))) {
        return;
    }

    let completedAt;
    try {
        completedAt = await window.completeWaveTx(wave, list, window.currentPallets ? window.currentPallets() : []);
    } catch (err) {
        console.error('完成波次失敗:', err);
        alert('❌ 完成波次失敗：' + err.message + '\n\n庫存與訂單都沒有變動。');
        return;
    }

    wave.status = 'done';
    wave.completedAt = completedAt;
    let nShip = 0, nPart = 0, nBack = 0;
    (wave.orders || []).forEach(order => {
        const oid = order.id || order.orderId;
        const r = (wave.orderResults || {})[oid];
        const local = (window._orderData && window._orderData.orders || []).find(o => o.id && o.id === oid);
        if (!r) return;
        if (r.status === 'shipped') nShip++; else if (r.status === 'partial') nPart++; else nBack++;
        if (local) {
            local.status = r.status;
            if (r.status === 'shipped') { local.waveNo = wave.waveNo; delete local.backorderItems; }
            else { local.waveNo = null; local.lastWaveNo = wave.waveNo; if (r.backorderItems && r.status === 'partial') local.backorderItems = r.backorderItems; }
        }
    });

    saveWaves();
    renderOrderList();

    alert('✅ 波次 ' + wave.waveNo + ' 已完成！\n\n全部出貨：' + nShip + ' 單' +
        (nPart ? '\n部分出貨：' + nPart + ' 單（缺的貨可以再排波次）' : '') +
        (nBack ? '\n完全沒出到：' + nBack + ' 單（回到待處理）' : ''));

    closeWaveExecuteModal();
    refreshWaveList();
};

window.closeWaveExecuteModal = function() {
    document.getElementById('modal-wave-execute').classList.add('hidden');
    refreshWaveList();
};

// 登入後才載入（未登入時安全規則會拒絕讀取）
window.onLogin(function() {
    loadOrdersFromFirebase();
    loadWarehouses();
});

console.log('✅ 波次理貨升級版載入完成');

