// ============================================================
// js/06-tools-backup.js — 棧板堆疊規劃、常用功能、備份還原、清除資料
// 由原 app.js 第 8484–10333 行拆出；各檔依 index.html 的順序載入，共用全域（window）
// ============================================================
// ========== 棧板堆疊規劃功能 ==========

var PALLET_CONFIG = {
    bottomCount: 7,    // 每層底數（件）
    layerCount: 8,     // 層數
    maxCapacity: 56    // 總容量（7×8=56件）
};

window.openPalletPlanModal = function() {
    var wave = window._waveData.currentWave;
    if (!wave || !wave.orders || wave.orders.length === 0) {
        alert('無訂單資料');
        return;
    }

    if (wave.logistics !== '大榮' && wave.logistics !== '大榮貨運') {
        alert('棧板堆疊規劃僅適用於大榮貨運');
        return;
    }

    var ordersWithQty = (wave.orders || []).map(function(order) {
        var totalPkg = 0;
        (order.items || []).forEach(function(item) {
            var qty = item.quantity || 0;
            var boxPerPkg = parseBoxPerPackage(item.productName);
            var pkgQty = (boxPerPkg > 0 && qty > 0) ? Math.ceil(qty / boxPerPkg) : (item.packageQty || 1);
            totalPkg += pkgQty;
        });
        return {
            orderNo: order.orderNo,
            customer: order.customer,
            address: order.address || '',
            logistics: order.logistics || wave.logistics,
            totalPkg: totalPkg
        };
    });

    ordersWithQty.sort(function(a, b) {
        if (a.totalPkg !== b.totalPkg) return a.totalPkg - b.totalPkg;

        return a.orderNo.localeCompare(b.orderNo);
    });

    var pallets = [];
    var currentPallet = { orders: [], totalPkg: 0, layers: [] };
    var currentLayer = [];
    var currentLayerPkg = 0;

    ordersWithQty.forEach(function(order) {
        if (currentPallet.totalPkg + order.totalPkg > PALLET_CONFIG.maxCapacity) {
            if (currentLayer.length > 0) {
                currentPallet.layers.push(currentLayer);
            }
            if (currentPallet.orders.length > 0) {
                pallets.push(currentPallet);
            }
            currentPallet = { orders: [], totalPkg: 0, layers: [] };
            currentLayer = [];
            currentLayerPkg = 0;
        }

        if (currentLayerPkg + order.totalPkg > PALLET_CONFIG.bottomCount) {
            if (currentLayer.length > 0) {
                currentPallet.layers.push(currentLayer);
            }
            currentLayer = [];
            currentLayerPkg = 0;
        }

        currentPallet.orders.push(order);
        currentPallet.totalPkg += order.totalPkg;
        currentLayer.push(order);
        currentLayerPkg += order.totalPkg;
    });

    if (currentLayer.length > 0) {
        currentPallet.layers.push(currentLayer);
    }
    if (currentPallet.orders.length > 0) {
        pallets.push(currentPallet);
    }

    var modal = document.createElement('div');
    modal.id = 'modal-pallet-plan';
    modal.className = 'fixed inset-0 z-50 bg-black/80 flex items-center justify-center backdrop-blur-sm overflow-auto py-4';

    var palletsHtml = pallets.map(function(pallet, pIdx) {
        var layersHtml = pallet.layers.map(function(layer, lIdx) {
            var layerNum = pallet.layers.length - lIdx;
            var layerOrders = layer.map(function(o) {
                return '<span class="inline-block bg-slate-600 text-white text-xs px-2 py-1 rounded mr-1 mb-1">' +
                    o.customer + ' <span class="text-yellow-400">' + o.totalPkg + '件</span></span>';
            }).join('');
            var layerTotal = layer.reduce(function(sum, o) { return sum + o.totalPkg; }, 0);

            return '<div class="border-b border-slate-600 py-2">' +
                '<div class="flex justify-between items-center mb-1">' +
                '<span class="text-slate-400 text-sm">第 ' + layerNum + ' 層' + (layerNum === 1 ? ' (底層-散板/人工)' : layerNum === pallet.layers.length ? ' (頂層-堆高機)' : '') + '</span>' +
                '<span class="text-cyan-400 text-sm">' + layerTotal + ' 件</span>' +
                '</div>' +
                '<div>' + layerOrders + '</div>' +
                '</div>';
        }).join('');

        var usagePercent = Math.round(pallet.totalPkg / PALLET_CONFIG.maxCapacity * 100);
        var usageColor = usagePercent >= 80 ? 'text-green-400' : (usagePercent >= 50 ? 'text-yellow-400' : 'text-red-400');

        return '<div class="bg-slate-800 border border-slate-600 rounded-lg p-4 mb-4">' +
            '<div class="flex justify-between items-center mb-3 pb-2 border-b border-slate-500">' +
            '<div class="text-white font-bold text-lg"><i class="fa-solid fa-pallet mr-2 text-orange-400"></i>棧板 #' + (pIdx + 1) + '</div>' +
            '<div class="text-right">' +
            '<div class="' + usageColor + ' font-bold">' + pallet.totalPkg + ' / ' + PALLET_CONFIG.maxCapacity + ' 件</div>' +
            '<div class="text-slate-400 text-xs">使用率 ' + usagePercent + '%</div>' +
            '</div></div>' +
            '<div class="text-xs text-orange-300 mb-2"><i class="fa-solid fa-arrow-up mr-1"></i>從上往下讀 = 取貨順序（先取上層）</div>' +
            layersHtml +
            '</div>';
    }).join('');

    var totalOrders = ordersWithQty.length;
    var totalPkg = ordersWithQty.reduce(function(sum, o) { return sum + o.totalPkg; }, 0);

    modal.innerHTML = '<div class="bg-slate-900 border border-slate-700 rounded-2xl w-[800px] max-h-[90vh] shadow-2xl flex flex-col m-4">' +
        '<div class="bg-gradient-to-r from-orange-900 to-amber-900 p-4 rounded-t-2xl border-b border-slate-700">' +
        '<h3 class="text-white font-bold text-lg"><i class="fa-solid fa-pallet mr-2 text-orange-400"></i>棧板堆疊規劃 - ' + wave.waveNo + '</h3>' +
        '<p class="text-orange-200 text-sm mt-1">物流商：' + wave.logistics + ' | 訂單：' + totalOrders + ' 筆 | 總件數：' + totalPkg + ' 件 | 棧板：' + pallets.length + ' 板</p></div>' +
        '<div class="p-4 bg-orange-900/20 border-b border-slate-700">' +
        '<div class="flex items-center justify-between">' +
        '<div class="text-orange-300 text-sm"><i class="fa-solid fa-lightbulb mr-2"></i>堆疊原則：小單先疊（底層-散板人工），大單後疊（上層-堆高機）</div>' +
        '<div class="text-slate-400 text-xs">棧板容量：' + PALLET_CONFIG.bottomCount + '底 × ' + PALLET_CONFIG.layerCount + '層 = ' + PALLET_CONFIG.maxCapacity + '件</div>' +
        '</div></div>' +
        '<div class="flex-1 overflow-auto p-4">' + palletsHtml + '</div>' +
        '<div class="p-4 border-t border-slate-700 flex gap-3">' +
        '<button onclick="printPalletPlan()" class="flex-1 py-3 bg-orange-600 hover:bg-orange-500 text-white rounded-lg font-bold">' +
        '<i class="fa-solid fa-print mr-2"></i>列印堆疊規劃表</button>' +
        '<button onclick="closePalletPlanModal()" class="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg">關閉</button></div></div>';

    document.body.appendChild(modal);
};

window.closePalletPlanModal = function() {
    var modal = document.getElementById('modal-pallet-plan');
    if (modal) modal.remove();
};

function getDeliveryRegion(address) {
    if (!address) return 0;

    var regionWeights = {
        '台北': 1, '臺北': 1, '新北': 1, '基隆': 2, '桃園': 2, '新竹': 3,
        '苗栗': 4, '台中': 5, '臺中': 5, '彰化': 5, '南投': 6, '雲林': 6,
        '嘉義': 7, '台南': 8, '臺南': 8, '高雄': 9, '屏東': 10,
        '宜蘭': 6, '花蓮': 11, '台東': 12, '臺東': 12,
        '澎湖': 15, '金門': 16, '馬祖': 16, '連江': 16
    };

    for (var city in regionWeights) {
        if (address.includes(city)) {
            return regionWeights[city];
        }
    }
    return 5; // 預設中等距離
}

window.printPalletPlan = function() {
    var wave = window._waveData.currentWave;

    var ordersWithQty = (wave.orders || []).map(function(order) {
        var totalPkg = 0;
        (order.items || []).forEach(function(item) {
            var qty = item.quantity || 0;
            var boxPerPkg = parseBoxPerPackage(item.productName);
            var pkgQty = (boxPerPkg > 0 && qty > 0) ? Math.ceil(qty / boxPerPkg) : (item.packageQty || 1);
            totalPkg += pkgQty;
        });
        return {
            orderNo: order.orderNo,
            customer: order.customer,
            address: order.address || '',
            totalPkg: totalPkg
        };
    });

    ordersWithQty.sort(function(a, b) {
        if (a.totalPkg !== b.totalPkg) return a.totalPkg - b.totalPkg;
        return a.orderNo.localeCompare(b.orderNo);
    });

    var pallets = [];
    var currentPallet = { orders: [], totalPkg: 0 };

    ordersWithQty.forEach(function(order) {
        if (currentPallet.totalPkg + order.totalPkg > PALLET_CONFIG.maxCapacity) {
            if (currentPallet.orders.length > 0) pallets.push(currentPallet);
            currentPallet = { orders: [], totalPkg: 0 };
        }
        currentPallet.orders.push(order);
        currentPallet.totalPkg += order.totalPkg;
    });
    if (currentPallet.orders.length > 0) pallets.push(currentPallet);

    var printWindow = window.open('', '_blank', 'width=1100,height=800');
    var now = new Date().toLocaleString('zh-TW');

    var html = '<!DOCTYPE html><html><head><title>棧板堆疊規劃表</title>' +
        '<style>' +
        'body { font-family: "Microsoft JhengHei", sans-serif; font-size: 12px; padding: 15px; }' +
        '.header { text-align: center; margin-bottom: 15px; border-bottom: 2px solid #333; padding-bottom: 10px; }' +
        '.header h2 { margin: 0 0 5px 0; }' +
        '.info { margin-bottom: 15px; display: flex; gap: 20px; }' +
        '.info-item { background: #f3f4f6; padding: 5px 10px; border-radius: 4px; }' +
        '.pallet { border: 2px solid #333; margin-bottom: 15px; page-break-inside: avoid; }' +
        '.pallet-header { background: #374151; color: white; padding: 8px 10px; font-weight: bold; display: flex; justify-content: space-between; }' +
        '.pallet-body { padding: 10px; }' +
        '.layer { border-bottom: 1px dashed #ccc; padding: 5px 0; }' +
        '.layer:last-child { border-bottom: none; }' +
        '.layer-num { color: #666; font-size: 11px; }' +
        '.order-tag { display: inline-block; background: #e5e7eb; padding: 2px 8px; margin: 2px; border-radius: 3px; }' +
        '.order-qty { color: #dc2626; font-weight: bold; }' +
        '.note { background: #fef3c7; padding: 10px; margin-bottom: 15px; border-radius: 4px; }' +
        '.timestamp { text-align: right; font-size: 10px; color: #666; margin-top: 15px; }' +
        '</style></head><body>';

    html += '<div class="header"><h2>棧板堆疊規劃表</h2><h3>' + wave.waveNo + ' - ' + wave.logistics + '</h3></div>';

    html += '<div class="note"><b>📋 堆疊原則：</b>小單先疊（底層-散板/人工搬運），大單後疊（上層-堆高機搬運）<br>' +
        '<b>📦 棧板規格：</b>' + PALLET_CONFIG.bottomCount + ' 底 × ' + PALLET_CONFIG.layerCount + ' 層 = ' + PALLET_CONFIG.maxCapacity + ' 件/板</div>';

    html += '<div class="info">' +
        '<div class="info-item"><b>訂單數：</b>' + ordersWithQty.length + ' 筆</div>' +
        '<div class="info-item"><b>總件數：</b>' + ordersWithQty.reduce(function(s,o){return s+o.totalPkg;},0) + ' 件</div>' +
        '<div class="info-item"><b>棧板數：</b>' + pallets.length + ' 板</div></div>';

    pallets.forEach(function(pallet, pIdx) {
        html += '<div class="pallet">';
        html += '<div class="pallet-header"><span>棧板 #' + (pIdx + 1) + '</span><span>' + pallet.totalPkg + ' / ' + PALLET_CONFIG.maxCapacity + ' 件</span></div>';
        html += '<div class="pallet-body">';

        var stackOrder = 1;
        pallet.orders.slice().reverse().forEach(function(order, idx) {
            var layerNum = Math.floor(idx / PALLET_CONFIG.bottomCount) + 1;
            html += '<div class="layer">' +
                '<span class="layer-num">取貨順序 ' + stackOrder + '</span> ' +
                '<span class="order-tag">' + order.customer + ' <span class="order-qty">' + order.totalPkg + '件</span></span> ' +
                '<span style="color:#666;font-size:10px">' + order.address.substring(0, 15) + '...</span>' +
                '</div>';
            stackOrder++;
        });

        html += '</div></div>';
    });

    html += '<div class="timestamp">列印日期：' + now + '</div>';
    html += '<script>window.print();<\/script></body></html>';

    printWindow.document.write(html);
    printWindow.document.close();
};

window.completeSorting = async function() {
    var wave = window._waveData.currentWave;

    if (!confirm('確定完成分貨？\n\n波次 ' + wave.waveNo + ' 將標記為【已出貨】')) {
        return;
    }

    wave.status = 'done';
    wave.sortedAt = new Date().toISOString();
    wave.completedAt = new Date().toISOString();

    if (wave.id) {
        try {
            await window.updateDoc(window.doc(window.db, 'waves', wave.id), {
                status: 'done',
                sortedAt: wave.sortedAt,
                completedAt: wave.completedAt
            });
        } catch (err) {
            console.error('更新波次狀態失敗:', err);
        }
    }

    for (var i = 0; i < (wave.orders || []).length; i++) {
        var order = wave.orders[i];
        var orderInData = window._orderData.orders.find(function(o) { return o.orderNo === order.orderNo; });
        if (orderInData) {
            orderInData.status = 'shipped';
        }
        if (order.id) {
            try {
                await window.updateDoc(window.doc(window.db, 'salesOrders', order.id), {
                    status: 'shipped',
                    shippedAt: new Date().toISOString(),
                    waveNo: wave.waveNo
                });
            } catch (err) {
                console.error('更新訂單狀態失敗:', order.orderNo, err);
            }
        }
    }

    saveWaves();

    var mins = Math.round((new Date(wave.completedAt) - new Date(wave.createdAt)) / 60000);
    alert('✅ 波次 ' + wave.waveNo + ' 已完成出貨！\n\n訂單數：' + (wave.orders || []).length + ' 筆\n總耗時：' + mins + ' 分鐘');

    closeSortingModal();
    refreshWaveList();
};

window.viewWaveDetail = function(waveNo) {
    var wave = window._waveData.waves.find(function(w) { return w.waveNo === waveNo; });
    if (!wave) return;

    var statusMap = { pending: '待揀貨', picking: '揀貨中', sorting: '待分貨', done: '已出貨' };
    var timeInfo = '建立：' + new Date(wave.createdAt).toLocaleString('zh-TW');
    if (wave.startedAt) timeInfo += '\n開始揀貨：' + new Date(wave.startedAt).toLocaleString('zh-TW');
    if (wave.pickedAt) timeInfo += '\n揀貨完成：' + new Date(wave.pickedAt).toLocaleString('zh-TW');
    if (wave.completedAt) timeInfo += '\n出貨完成：' + new Date(wave.completedAt).toLocaleString('zh-TW');

    var orderList = (wave.orders || []).map(function(o, i) { return (i + 1) + '. ' + o.customer + ' (' + o.orderNo + ')'; }).join('\n');

    alert('【波次明細】\n\n' +
        '波次編號：' + wave.waveNo + '\n' +
        '物流商：' + wave.logistics + '\n' +
        '狀態：' + (statusMap[wave.status] || wave.status) + '\n' +
        '訂單數：' + (wave.orders || []).length + ' 筆\n' +
        '品項數：' + (wave.itemCount || 0) + ' 項\n' +
        '總件數：' + (wave.totalQty || 0) + ' 件（包裝單位）\n' +
        (wave.totalSmallQty ? '最小單位：' + wave.totalSmallQty + '\n' : '') + '\n' +
        '【時間記錄】\n' + timeInfo + '\n\n' +
        '【訂單清單】\n' + orderList);
};

window.deleteWave = async function(waveNo) {
    var wave = window._waveData.waves.find(function(w) { return w.waveNo === waveNo; });
    if (!wave) return;

    if (wave.status !== 'pending') {
        alert('只能刪除「待揀貨」狀態的波次');
        return;
    }

    if (!confirm('確定要刪除波次 ' + waveNo + '？\n\n訂單數：' + (wave.orders || []).length + ' 筆\n刪除後訂單將恢復為待處理狀態。')) {
        return;
    }

    for (var i = 0; i < (wave.orders || []).length; i++) {
        var order = wave.orders[i];
        var orderInData = window._orderData.orders.find(function(o) { return o.orderNo === order.orderNo; });
        if (orderInData) {
            orderInData.status = 'pending';
            orderInData.waveNo = null;
        }
        if (order.id) {
            try {
                await window.updateDoc(window.doc(window.db, 'salesOrders', order.id), {
                    status: 'pending',
                    waveNo: null
                });
            } catch (err) {
                console.error('恢復訂單狀態失敗:', err);
            }
        }
    }

    if (wave.id) {
        try {
            await window.deleteDoc(window.doc(window.db, 'waves', wave.id));
        } catch (err) {
            console.error('刪除波次失敗:', err);
        }
    }

    var idx = window._waveData.waves.findIndex(function(w) { return w.waveNo === waveNo; });
    if (idx >= 0) window._waveData.waves.splice(idx, 1);
    saveWaves();

    alert('✅ 波次 ' + waveNo + ' 已刪除');
    refreshWaveList();
};

window.printWaveLabels = function(waveNo) {
    var wave = window._waveData.waves.find(function(w) { return w.waveNo === waveNo; });
    if (!wave) return;
    window._waveData.currentWave = wave;
    printAllLabels();
};

// ========== 常用功能模組 ==========

// 所有可選的功能定義
window._allFunctions = [
    { id: 'visual-map', name: '倉庫地圖', icon: 'fa-map', color: 'text-cyan-400', group: '數位倉庫' },
    { id: 'inventory-query', name: '庫存查詢', icon: 'fa-magnifying-glass', color: 'text-cyan-400', group: '數位倉庫' },
    { id: 'dashboard', name: '戰情分析', icon: 'fa-chart-pie', color: 'text-white', group: '數位倉庫' },
    { id: 'work-board', name: '工單看板', icon: 'fa-tv', color: 'text-yellow-400', group: '數位倉庫' },
    { id: 'unified-inbound', name: '智能入庫中心', icon: 'fa-bolt', color: 'text-emerald-400', group: '入庫管理' },
    { id: 'pre-inbound', name: '貨櫃入庫作業', icon: 'fa-ship', color: 'text-cyan-400', group: '入庫管理' },
    { id: 'approval', name: '待財務核准', icon: 'fa-clipboard-check', color: 'text-yellow-400', group: '入庫管理' },
    { id: 'wave-picking', name: '波次揀貨', icon: 'fa-layer-group', color: 'text-orange-400', group: '出庫管理' },
    { id: 'picking-rm', name: '原料領用', icon: 'fa-fish', color: 'text-red-400', group: '出庫管理' },
    { id: 'move', name: '智能調度', icon: 'fa-layer-group', color: 'text-blue-400', group: '庫存異動' },
    { id: 'merge', name: '板號異動', icon: 'fa-arrows-turn-to-dots', color: 'text-blue-400', group: '庫存異動' },
    { id: 'transfer', name: '倉庫調撥', icon: 'fa-right-left', color: 'text-blue-400', group: '庫存異動' },
    { id: 'stocktake', name: '庫存盤點', icon: 'fa-clipboard-check', color: 'text-blue-400', group: '庫存異動' },
    { id: 'external-warehouse', name: '外倉管理', icon: 'fa-building', color: 'text-purple-400', group: '外部倉庫' },
    { id: 'picking-reports', name: '報表中心', icon: 'fa-chart-pie', color: 'text-green-400', group: '理貨報表' },
    { id: 'expiry-management', name: '效期管理', icon: 'fa-calendar-xmark', color: 'text-red-400', group: '理貨報表' },
    { id: 'inventory-log', name: '異動查詢', icon: 'fa-clock-rotate-left', color: 'text-orange-400', group: '理貨報表' },
    { id: 'product-analysis', name: '出貨分析', icon: 'fa-chart-bar', color: 'text-orange-400', group: '理貨報表' },
    { id: 'warehouse-heatmap', name: '熱力圖', icon: 'fa-fire', color: 'text-orange-400', group: '理貨報表' },
    { id: 'consignment', name: '寄倉管理', icon: 'fa-box-archive', color: 'text-amber-400', group: '倉租管理' },
    { id: 'rental-report', name: '倉租報表', icon: 'fa-file-invoice-dollar', color: 'text-emerald-400', group: '倉租管理' },
    { id: 'rental-settings', name: '費率設定', icon: 'fa-sliders', color: 'text-blue-400', group: '倉租管理' },
    { id: 'user-management', name: '使用者管理', icon: 'fa-users-gear', color: 'text-blue-400', group: '系統設定' },
    { id: 'product-master', name: '品項主檔', icon: 'fa-box', color: 'text-slate-400', group: '系統設定' },
    { id: 'label-print', name: '標籤列印', icon: 'fa-print', color: 'text-purple-400', group: '系統設定' },
    { id: 'data-import', name: '資料匯入', icon: 'fa-file-import', color: 'text-amber-400', group: '系統設定' },
    { id: 'dev-tools', name: '備份與維護', icon: 'fa-wrench', color: 'text-orange-400', group: '系統設定' }
];

// 暫存選取的功能（編輯中）
window._tempFavorites = [];

// 從 localStorage 載入常用功能
window.loadFavorites = function() {
    var saved = localStorage.getItem('wms_favorites');
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch (e) {
            return [];
        }
    }
    return [];
};

// 儲存常用功能到 localStorage
window.saveFavorites = function(favorites) {
    localStorage.setItem('wms_favorites', JSON.stringify(favorites));
};

// 渲染側邊欄的常用功能列表
window.renderFavoritesList = function() {
    var favorites = loadFavorites();
    var listEl = document.getElementById('favorites-list');
    var emptyEl = document.getElementById('favorites-empty');
    
    if (!listEl) return;
    
    if (favorites.length === 0) {
        listEl.innerHTML = '';
        if (emptyEl) emptyEl.classList.remove('hidden');
        return;
    }
    
    if (emptyEl) emptyEl.classList.add('hidden');
    
    var html = '';
    favorites.forEach(function(favId) {
        var func = window._allFunctions.find(function(f) { return f.id === favId; });
        if (func) {
            html += '<div class="nav-item py-2 px-3 mx-1 rounded cursor-pointer hover:bg-slate-700/50" onclick="switchTab(\'' + func.id + '\', event)">';
            html += '<i class="fa-solid ' + func.icon + ' w-4 text-center mr-2 ' + func.color + '"></i>';
            html += '<span class="truncate">' + func.name + '</span>';
            html += '</div>';
        }
    });
    
    listEl.innerHTML = html;
};

// 開啟常用功能設定彈窗
window.openFavoritesSettings = function() {
    window._tempFavorites = loadFavorites().slice(); // 複製一份
    renderAvailableFunctions();
    renderSelectedFunctions();
    document.getElementById('modal-favorites-settings').classList.remove('hidden');
};

// 關閉常用功能設定彈窗
window.closeFavoritesSettings = function() {
    document.getElementById('modal-favorites-settings').classList.add('hidden');
};

// 渲染可選功能列表
window.renderAvailableFunctions = function() {
    var listEl = document.getElementById('available-functions-list');
    var searchText = (document.getElementById('fav-search')?.value || '').toLowerCase();
    
    // 按群組分類
    var groups = {};
    window._allFunctions.forEach(function(func) {
        // 搜尋過濾
        if (searchText && func.name.toLowerCase().indexOf(searchText) === -1 && func.group.toLowerCase().indexOf(searchText) === -1) {
            return;
        }
        if (!groups[func.group]) groups[func.group] = [];
        groups[func.group].push(func);
    });
    
    var html = '';
    Object.keys(groups).forEach(function(groupName) {
        html += '<div class="mb-3">';
        html += '<div class="text-slate-400 text-xs font-bold px-2 py-1">' + groupName + '</div>';
        groups[groupName].forEach(function(func) {
            var isSelected = window._tempFavorites.indexOf(func.id) !== -1;
            var bgClass = isSelected ? 'bg-blue-600/30 border-blue-500' : 'bg-slate-700/30 border-slate-600 hover:bg-slate-700';
            var checkIcon = isSelected ? '<i class="fa-solid fa-check text-blue-400"></i>' : '<i class="fa-solid fa-plus text-slate-500"></i>';
            
            html += '<div class="flex items-center justify-between p-2 rounded border mb-1 cursor-pointer ' + bgClass + '" onclick="toggleFavorite(\'' + func.id + '\')">';
            html += '<div class="flex items-center">';
            html += '<i class="fa-solid ' + func.icon + ' w-5 text-center mr-2 ' + func.color + '"></i>';
            html += '<span class="text-white text-sm">' + func.name + '</span>';
            html += '</div>';
            html += checkIcon;
            html += '</div>';
        });
        html += '</div>';
    });
    
    listEl.innerHTML = html || '<div class="text-center text-slate-500 py-4">找不到符合的功能</div>';
};

// 渲染已選功能列表（可拖曳）
window.renderSelectedFunctions = function() {
    var listEl = document.getElementById('selected-functions-list');
    var countEl = document.getElementById('selected-count');
    
    if (countEl) countEl.textContent = '(' + window._tempFavorites.length + ')';
    
    if (window._tempFavorites.length === 0) {
        listEl.innerHTML = '<div class="text-center text-slate-500 py-8"><i class="fa-solid fa-arrow-left text-2xl mb-2"></i><div class="text-sm">從左側選擇常用功能</div></div>';
        return;
    }
    
    var html = '';
    window._tempFavorites.forEach(function(favId, index) {
        var func = window._allFunctions.find(function(f) { return f.id === favId; });
        if (func) {
            html += '<div class="flex items-center justify-between p-2 rounded border border-slate-600 bg-slate-700/50 mb-1 cursor-move" draggable="true" data-index="' + index + '" ondragstart="handleDragStart(event)" ondragover="handleDragOver(event)" ondrop="handleDrop(event)" ondragend="handleDragEnd(event)">';
            html += '<div class="flex items-center">';
            html += '<i class="fa-solid fa-grip-vertical text-slate-500 mr-2"></i>';
            html += '<i class="fa-solid ' + func.icon + ' w-5 text-center mr-2 ' + func.color + '"></i>';
            html += '<span class="text-white text-sm">' + func.name + '</span>';
            html += '</div>';
            html += '<button class="text-red-400 hover:text-red-300 px-2" onclick="event.stopPropagation(); removeFavorite(\'' + func.id + '\')"><i class="fa-solid fa-xmark"></i></button>';
            html += '</div>';
        }
    });
    
    listEl.innerHTML = html;
};

// 切換功能選取狀態
window.toggleFavorite = function(funcId) {
    var index = window._tempFavorites.indexOf(funcId);
    if (index === -1) {
        window._tempFavorites.push(funcId);
    } else {
        window._tempFavorites.splice(index, 1);
    }
    renderAvailableFunctions();
    renderSelectedFunctions();
};

// 從已選中移除
window.removeFavorite = function(funcId) {
    var index = window._tempFavorites.indexOf(funcId);
    if (index !== -1) {
        window._tempFavorites.splice(index, 1);
    }
    renderAvailableFunctions();
    renderSelectedFunctions();
};

// 清除全部
window.clearAllFavorites = function() {
    if (confirm('確定要清除所有常用功能？')) {
        window._tempFavorites = [];
        renderAvailableFunctions();
        renderSelectedFunctions();
    }
};

// 搜尋過濾
window.filterAvailableFunctions = function() {
    renderAvailableFunctions();
};

// 拖曳排序相關變數
window._draggedIndex = null;

// 拖曳開始
window.handleDragStart = function(e) {
    window._draggedIndex = parseInt(e.target.dataset.index);
    e.target.style.opacity = '0.5';
    e.dataTransfer.effectAllowed = 'move';
};

// 拖曳經過
window.handleDragOver = function(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    var target = e.target.closest('[draggable]');
    if (target) {
        target.style.borderColor = '#3b82f6';
    }
};

// 放下
window.handleDrop = function(e) {
    e.preventDefault();
    
    var target = e.target.closest('[draggable]');
    if (!target) return;
    
    var targetIndex = parseInt(target.dataset.index);
    if (window._draggedIndex === null || window._draggedIndex === targetIndex) return;
    
    // 重新排列陣列
    var item = window._tempFavorites.splice(window._draggedIndex, 1)[0];
    window._tempFavorites.splice(targetIndex, 0, item);
    
    renderSelectedFunctions();
};

// 拖曳結束
window.handleDragEnd = function(e) {
    e.target.style.opacity = '1';
    window._draggedIndex = null;
    
    // 重置所有邊框
    document.querySelectorAll('#selected-functions-list [draggable]').forEach(function(el) {
        el.style.borderColor = '';
    });
};

// 儲存設定
window.saveFavoritesSettings = function() {
    saveFavorites(window._tempFavorites);
    renderFavoritesList();
    closeFavoritesSettings();
    
    // 顯示成功提示
    if (window._tempFavorites.length > 0) {
        alert('✅ 已儲存 ' + window._tempFavorites.length + ' 個常用功能');
    } else {
        alert('✅ 已清除常用功能');
    }
};

// 頁面載入時初始化常用功能
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
        renderFavoritesList();
    }, 100);
});

// ========== 備份與還原功能 ==========

window._backupConfig = {
    lastBackupTime: localStorage.getItem('lastBackupTime') || null,
    backupReminder: parseInt(localStorage.getItem('backupReminder')) || 7, // 預設 7 天提醒
    collections: [
        { name: 'pallets', label: '庫存資料' },
        { name: 'salesOrders', label: '銷貨訂單' },
        { name: 'waves', label: '波次資料' },
        { name: 'inventoryLogs', label: '異動記錄' },
        { name: 'inboundOrders', label: '入庫單' },
        { name: 'inboundTasks', label: '入庫任務' },
        { name: 'shippingOrders', label: '出貨單' },
        { name: 'dispatchOrders', label: '派車單' },
        { name: 'externalStock', label: '外部庫存' },
        { name: 'productMaster', label: '品項主檔' },
        { name: 'warehouses', label: '外倉設定' },
        { name: 'consignments', label: '寄倉資料' },
        { name: 'settings', label: '系統設定' }
    ]
};

window.checkBackupReminder = function() {
    var lastBackup = window._backupConfig.lastBackupTime;
    var reminderDays = window._backupConfig.backupReminder;

    if (!lastBackup) {
        showBackupReminder('您尚未備份過資料，建議立即備份！');
        return;
    }

    var lastDate = new Date(lastBackup);
    var now = new Date();
    var diffDays = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));

    if (diffDays >= reminderDays) {
        showBackupReminder('距離上次備份已經 ' + diffDays + ' 天，建議立即備份！');
    }
};

window.showBackupReminder = function(message) {
    var reminder = document.createElement('div');
    reminder.id = 'backup-reminder';
    reminder.className = 'fixed bottom-4 right-4 bg-orange-600 text-white p-4 rounded-lg shadow-lg z-50 max-w-sm';
    reminder.innerHTML =
        '<div class="flex items-start gap-3">' +
        '<i class="fa-solid fa-database text-2xl"></i>' +
        '<div class="flex-1">' +
        '<div class="font-bold">備份提醒</div>' +
        '<div class="text-sm mt-1">' + message + '</div>' +
        '<div class="flex gap-2 mt-3">' +
        '<button onclick="switchTab(\'dev-tools\'); closeBackupReminder();" class="bg-white text-orange-600 px-3 py-1 rounded text-sm font-bold">立即備份</button>' +
        '<button onclick="closeBackupReminder()" class="text-white/80 hover:text-white text-sm">稍後提醒</button>' +
        '</div></div>' +
        '<button onclick="closeBackupReminder()" class="text-white/60 hover:text-white"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>';
    document.body.appendChild(reminder);
};

window.closeBackupReminder = function() {
    var reminder = document.getElementById('backup-reminder');
    if (reminder) reminder.remove();
};

window.openBackupModal = function() {
    var lastBackup = window._backupConfig.lastBackupTime;
    var lastBackupStr = lastBackup ? new Date(lastBackup).toLocaleString('zh-TW') : '從未備份';

    var modal = document.createElement('div');
    modal.id = 'backup-modal';
    modal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50';
    modal.innerHTML =
        '<div class="bg-slate-800 rounded-xl p-6 w-[600px] max-h-[80vh] overflow-y-auto border border-slate-600">' +
        '<div class="flex justify-between items-center mb-4">' +
        '<h3 class="text-white font-bold text-lg"><i class="fa-solid fa-database mr-2 text-orange-400"></i>備份與還原</h3>' +
        '<button onclick="closeBackupModal()" class="text-slate-400 hover:text-white"><i class="fa-solid fa-xmark text-xl"></i></button>' +
        '</div>' +

        '<div class="bg-slate-700/50 rounded-lg p-4 mb-4">' +
        '<div class="flex justify-between items-center">' +
        '<div><div class="text-slate-400 text-sm">上次備份時間</div>' +
        '<div class="text-white font-bold">' + lastBackupStr + '</div></div>' +
        '<div id="backup-status"></div>' +
        '</div></div>' +

        '<div class="bg-slate-700/30 rounded-lg p-4 mb-4 border border-slate-600">' +
        '<div class="flex items-center gap-2 mb-3">' +
        '<i class="fa-solid fa-file-excel text-emerald-400 text-xl"></i>' +
        '<div><div class="text-white font-bold">方式一：Excel 備份</div>' +
        '<div class="text-slate-400 text-xs">匯出所有資料為 Excel 檔案，可離線保存</div></div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-3">' +
        '<button onclick="exportBackupExcel()" class="bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-lg font-bold">' +
        '<i class="fa-solid fa-download mr-2"></i>匯出備份</button>' +
        '<div><input type="file" id="restore-excel-input" accept=".xlsx" class="hidden" onchange="restoreFromExcel(event)">' +
        '<button onclick="document.getElementById(\'restore-excel-input\').click()" class="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-lg font-bold">' +
        '<i class="fa-solid fa-upload mr-2"></i>還原備份</button></div>' +
        '</div>' +
        '</div>' +

        '<div class="bg-slate-700/30 rounded-lg p-4 mb-4 border border-slate-600">' +
        '<div class="flex items-center gap-2 mb-3">' +
        '<i class="fa-solid fa-cloud text-blue-400 text-xl"></i>' +
        '<div><div class="text-white font-bold">方式二：雲端備份 (Firebase)</div>' +
        '<div class="text-slate-400 text-xs">備份到 Firebase 雲端，可跨裝置還原</div></div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-3 mb-3">' +
        '<button onclick="exportBackupToFirebase()" class="bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-lg font-bold">' +
        '<i class="fa-solid fa-cloud-arrow-up mr-2"></i>備份到雲端</button>' +
        '<button onclick="showCloudBackupList()" class="bg-slate-600 hover:bg-slate-500 text-white py-3 rounded-lg font-bold">' +
        '<i class="fa-solid fa-list mr-2"></i>查看雲端備份</button>' +
        '</div>' +
        '<div id="cloud-backup-list" class="hidden"></div>' +
        '</div>' +

        '<div class="bg-slate-700/30 rounded-lg p-4 border border-slate-600">' +
        '<div class="flex items-center gap-2 mb-3">' +
        '<i class="fa-solid fa-bell text-yellow-400 text-xl"></i>' +
        '<div class="text-white font-bold">備份提醒設定</div>' +
        '</div>' +
        '<div class="flex items-center gap-3">' +
        '<span class="text-slate-300">每</span>' +
        '<select id="backup-reminder-days" class="scan-input w-20 text-center" onchange="updateBackupReminder()">' +
        '<option value="1"' + (window._backupConfig.backupReminder === 1 ? ' selected' : '') + '>1</option>' +
        '<option value="3"' + (window._backupConfig.backupReminder === 3 ? ' selected' : '') + '>3</option>' +
        '<option value="7"' + (window._backupConfig.backupReminder === 7 ? ' selected' : '') + '>7</option>' +
        '<option value="14"' + (window._backupConfig.backupReminder === 14 ? ' selected' : '') + '>14</option>' +
        '<option value="30"' + (window._backupConfig.backupReminder === 30 ? ' selected' : '') + '>30</option>' +
        '</select>' +
        '<span class="text-slate-300">天提醒一次</span>' +
        '</div>' +
        '</div>' +

        '</div>';

    document.body.appendChild(modal);
};

window.closeBackupModal = function() {
    var modal = document.getElementById('backup-modal');
    if (modal) modal.remove();
};

window.updateBackupReminder = function() {
    var days = parseInt(document.getElementById('backup-reminder-days').value);
    window._backupConfig.backupReminder = days;
    localStorage.setItem('backupReminder', days);
};

// ========== Excel 備份 ==========

window.serializeFirestoreData = function(data) {
    if (!data) return data;
    if (data.toDate && typeof data.toDate === 'function') {
        return data.toDate().toISOString();
    }
    if (Array.isArray(data)) {
        return data.map(function(item) { return serializeFirestoreData(item); });
    }
    if (typeof data === 'object') {
        var result = {};
        Object.keys(data).forEach(function(key) {
            result[key] = serializeFirestoreData(data[key]);
        });
        return result;
    }
    return data;
};

window.exportBackupExcel = async function() {
    var statusEl = document.getElementById('backup-status');
    statusEl.innerHTML = '<span class="text-yellow-400"><i class="fa-solid fa-spinner fa-spin mr-1"></i>備份中...</span>';

    try {
        var wb = XLSX.utils.book_new();
        var timestamp = new Date().toLocalYMD();
        var collections = window._backupConfig.collections;
        var summary = { timestamp: new Date().toISOString(), version: 'WMS v3.0', collections: {} };

        for (var i = 0; i < collections.length; i++) {
            var col = collections[i];
            statusEl.innerHTML = '<span class="text-yellow-400"><i class="fa-solid fa-spinner fa-spin mr-1"></i>備份 ' + col.label + '... (' + (i+1) + '/' + collections.length + ')</span>';

            try {
                var snap = await window.getDocs(window.collection(window.db, col.name));
                var data = [];

                snap.forEach(function(doc) {
                    var d = serializeFirestoreData(doc.data());
                    data.push({
                        '_docId': doc.id,
                        '_data': JSON.stringify(d)
                    });
                });

                summary.collections[col.name] = data.length;

                if (data.length > 0) {
                    var ws = XLSX.utils.json_to_sheet(data);
                    var sheetName = col.label.substring(0, 31);
                    XLSX.utils.book_append_sheet(wb, ws, sheetName);
                }
            } catch (e) {
                console.log('備份 ' + col.name + ' 跳過:', e);
                summary.collections[col.name] = 0;
            }
        }

        var infoData = [{
            '備份時間': summary.timestamp,
            '系統版本': summary.version,
            '備份內容': JSON.stringify(summary.collections)
        }];
        var wsInfo = XLSX.utils.json_to_sheet(infoData);
        XLSX.utils.book_append_sheet(wb, wsInfo, '_備份資訊');

        var filename = 'WMS完整備份_' + timestamp + '.xlsx';
        XLSX.writeFile(wb, filename);

        var now = new Date().toISOString();
        window._backupConfig.lastBackupTime = now;
        localStorage.setItem('lastBackupTime', now);

        var summaryText = Object.keys(summary.collections).map(function(k) {
            var col = collections.find(function(c) { return c.name === k; });
            return (col ? col.label : k) + ': ' + summary.collections[k] + ' 筆';
        }).join('\n');

        statusEl.innerHTML = '<span class="text-emerald-400"><i class="fa-solid fa-check mr-1"></i>備份完成！</span>';

        setTimeout(function() {
            closeBackupModal();
            alert('✅ 完整備份完成！\n\n檔案：' + filename + '\n\n' + summaryText);
        }, 500);

    } catch (err) {
        console.error('備份失敗:', err);
        statusEl.innerHTML = '<span class="text-red-400"><i class="fa-solid fa-xmark mr-1"></i>備份失敗</span>';
        alert('備份失敗：' + err.message);
    }
};

window.deserializeData = function(data) {
    if (!data) return data;
    if (typeof data === 'string') {
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(data)) {
            return new Date(data);
        }
        return data;
    }
    if (Array.isArray(data)) {
        return data.map(function(item) { return deserializeData(item); });
    }
    if (typeof data === 'object') {
        var result = {};
        Object.keys(data).forEach(function(key) {
            result[key] = deserializeData(data[key]);
        });
        return result;
    }
    return data;
};

window.clearCollection = async function(collectionName) {
    var snap = await window.getDocs(window.collection(window.db, collectionName));
    var batch = window.writeBatch(window.db);
    var count = 0;

    snap.forEach(function(doc) {
        batch.delete(doc.ref);
        count++;
        if (count >= 450) {
            return;
        }
    });

    if (count > 0) {
        await batch.commit();
    }

    if (snap.size >= 450) {
        await clearCollection(collectionName);
    }

    return count;
};

window.restoreFromExcel = async function(event) {
    var file = event.target.files[0];
    if (!file) return;

    if (!confirm('⚠️ 警告：一鍵還原將執行以下操作：\n\n1. 清空現有所有資料\n2. 從備份檔案完整還原\n\n此操作無法復原！確定要繼續嗎？')) {
        event.target.value = '';
        return;
    }

    if (!confirm('🔴 最後確認：\n\n所有現有資料將被刪除並替換為備份內容！\n\n請輸入「確定」繼續...') || !confirm('確定還原？')) {
        event.target.value = '';
        return;
    }

    var statusEl = document.getElementById('backup-status');
    statusEl.innerHTML = '<span class="text-yellow-400"><i class="fa-solid fa-spinner fa-spin mr-1"></i>讀取備份檔案...</span>';

    try {
        var reader = new FileReader();
        reader.onload = async function(e) {
            var data = new Uint8Array(e.target.result);
            var workbook = XLSX.read(data, { type: 'array' });
            var collections = window._backupConfig.collections;
            var restored = {};

            var sheetToCollection = {};
            collections.forEach(function(col) {
                sheetToCollection[col.label.substring(0, 31)] = col.name;
            });

            statusEl.innerHTML = '<span class="text-red-400"><i class="fa-solid fa-spinner fa-spin mr-1"></i>清空現有資料...</span>';

            for (var i = 0; i < collections.length; i++) {
                var col = collections[i];
                statusEl.innerHTML = '<span class="text-red-400"><i class="fa-solid fa-spinner fa-spin mr-1"></i>清空 ' + col.label + '...</span>';
                try {
                    await clearCollection(col.name);
                } catch (e) {
                    console.log('清空 ' + col.name + ' 跳過:', e);
                }
            }

            for (var i = 0; i < workbook.SheetNames.length; i++) {
                var sheetName = workbook.SheetNames[i];

                if (sheetName === '_備份資訊') continue;

                var collectionName = sheetToCollection[sheetName];
                if (!collectionName) {
                    console.log('未知工作表:', sheetName);
                    continue;
                }

                var colConfig = collections.find(function(c) { return c.name === collectionName; });
                statusEl.innerHTML = '<span class="text-yellow-400"><i class="fa-solid fa-spinner fa-spin mr-1"></i>還原 ' + (colConfig ? colConfig.label : collectionName) + '...</span>';

                var sheet = workbook.Sheets[sheetName];
                var rows = XLSX.utils.sheet_to_json(sheet);

                restored[collectionName] = 0;

                for (var j = 0; j < rows.length; j++) {
                    var row = rows[j];
                    var docId = row['_docId'] || (collectionName + '-' + Date.now() + '-' + j);
                    var docData = {};

                    try {
                        docData = JSON.parse(row['_data'] || '{}');
                        docData = deserializeData(docData);
                    } catch (e) {
                        console.log('解析資料失敗:', e);
                        continue;
                    }

                    await window.setDoc(window.doc(window.db, collectionName, docId), docData);
                    restored[collectionName]++;
                }
            }

            var summaryText = Object.keys(restored).map(function(k) {
                var col = collections.find(function(c) { return c.name === k; });
                return (col ? col.label : k) + ': ' + restored[k] + ' 筆';
            }).join('\n');

            statusEl.innerHTML = '<span class="text-emerald-400"><i class="fa-solid fa-check mr-1"></i>還原完成！</span>';

            alert('✅ 一鍵還原完成！\n\n' + summaryText + '\n\n頁面將重新載入...');

            setTimeout(function() { location.reload(); }, 1000);
        };

        reader.readAsArrayBuffer(file);

    } catch (err) {
        console.error('還原失敗:', err);
        statusEl.innerHTML = '<span class="text-red-400"><i class="fa-solid fa-xmark mr-1"></i>還原失敗</span>';
        alert('還原失敗：' + err.message);
    }

    event.target.value = '';
};

// ========== Firebase 雲端備份 ==========

window.exportBackupToFirebase = async function() {
    var statusEl = document.getElementById('backup-status');
    statusEl.innerHTML = '<span class="text-yellow-400"><i class="fa-solid fa-spinner fa-spin mr-1"></i>備份到雲端...</span>';

    try {
        var timestamp = new Date().toISOString();
        var backupId = 'backup-' + timestamp.replace(/[:.]/g, '-');
        var collections = window._backupConfig.collections;

        var backupData = {
            id: backupId,
            timestamp: timestamp,
            version: 'WMS v3.0',
            collections: {}
        };

        var summary = {};

        for (var i = 0; i < collections.length; i++) {
            var col = collections[i];
            statusEl.innerHTML = '<span class="text-yellow-400"><i class="fa-solid fa-spinner fa-spin mr-1"></i>備份 ' + col.label + '...</span>';

            try {
                var snap = await window.getDocs(window.collection(window.db, col.name));
                backupData.collections[col.name] = [];

                snap.forEach(function(doc) {
                    var d = serializeFirestoreData(doc.data());
                    backupData.collections[col.name].push({ id: doc.id, data: d });
                });

                summary[col.name] = backupData.collections[col.name].length;
            } catch (e) {
                console.log('備份 ' + col.name + ' 跳過:', e);
                summary[col.name] = 0;
            }
        }

        await window.setDoc(window.doc(window.db, 'backups', backupId), {
            timestamp: timestamp,
            version: 'WMS v3.0',
            summary: summary,
            data: JSON.stringify(backupData)
        });

        window._backupConfig.lastBackupTime = timestamp;
        localStorage.setItem('lastBackupTime', timestamp);

        var summaryText = Object.keys(summary).map(function(k) {
            var col = collections.find(function(c) { return c.name === k; });
            return (col ? col.label : k) + ': ' + summary[k] + ' 筆';
        }).join('\n');

        statusEl.innerHTML = '<span class="text-emerald-400"><i class="fa-solid fa-check mr-1"></i>雲端備份完成！</span>';

        alert('✅ 雲端備份完成！\n\n備份ID：' + backupId + '\n\n' + summaryText);

    } catch (err) {
        console.error('雲端備份失敗:', err);
        statusEl.innerHTML = '<span class="text-red-400"><i class="fa-solid fa-xmark mr-1"></i>備份失敗</span>';
        alert('雲端備份失敗：' + err.message);
    }
};

window.showCloudBackupList = async function() {
    var listEl = document.getElementById('cloud-backup-list');
    listEl.classList.remove('hidden');
    listEl.innerHTML = '<div class="text-center py-4"><i class="fa-solid fa-spinner fa-spin mr-1"></i>載入中...</div>';

    try {
        var backupsSnap = await window.getDocs(window.collection(window.db, 'backups'));
        var backups = [];
        backupsSnap.forEach(function(doc) {
            var d = doc.data();
            backups.push({
                id: doc.id,
                timestamp: d.timestamp,
                palletsCount: d.palletsCount || 0,
                ordersCount: d.ordersCount || 0,
                wavesCount: d.wavesCount || 0
            });
        });

        backups.sort(function(a, b) {
            return new Date(b.timestamp) - new Date(a.timestamp);
        });

        if (backups.length === 0) {
            listEl.innerHTML = '<div class="text-center py-4 text-slate-400">尚無雲端備份</div>';
            return;
        }

        var html = '<div class="max-h-48 overflow-y-auto space-y-2 mt-3">';
        backups.forEach(function(b) {
            var date = new Date(b.timestamp).toLocaleString('zh-TW');
            html += '<div class="bg-slate-800 p-3 rounded flex justify-between items-center">' +
                '<div>' +
                '<div class="text-white text-sm">' + date + '</div>' +
                '<div class="text-slate-400 text-xs">庫存 ' + b.palletsCount + ' / 訂單 ' + b.ordersCount + ' / 波次 ' + b.wavesCount + '</div>' +
                '</div>' +
                '<div class="flex gap-2">' +
                '<button onclick="restoreFromFirebase(\'' + b.id + '\')" class="bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded text-xs">還原</button>' +
                '<button onclick="deleteCloudBackup(\'' + b.id + '\')" class="bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded text-xs">刪除</button>' +
                '</div></div>';
        });
        html += '</div>';

        listEl.innerHTML = html;

    } catch (err) {
        console.error('載入備份列表失敗:', err);
        listEl.innerHTML = '<div class="text-center py-4 text-red-400">載入失敗</div>';
    }
};

// ========== 開發者工具頁面的備份功能 ==========

// 初始化開發者工具頁面的備份顯示
window.initDevToolsBackup = function() {
    var lastBackup = window._backupConfig.lastBackupTime;
    var lastBackupEl = document.getElementById('dev-last-backup');
    if (lastBackupEl) {
        lastBackupEl.textContent = lastBackup ? new Date(lastBackup).toLocaleString('zh-TW') : '從未備份';
    }
};

// 執行備份（開發者工具頁面用）
window.performBackup = async function() {
    var statusEl = document.getElementById('dev-backup-status');
    if (statusEl) {
        statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>備份中...';
        statusEl.className = 'text-yellow-400 font-bold';
    }

    try {
        var timestamp = new Date().toISOString();
        var collections = window._backupConfig.collections;
        var backupData = {
            timestamp: timestamp,
            version: 'WMS v3.0',
            collections: {}
        };

        for (var i = 0; i < collections.length; i++) {
            var col = collections[i];
            if (statusEl) statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>備份 ' + col.label + '...';

            try {
                var snap = await window.getDocs(window.collection(window.db, col.name));
                backupData.collections[col.name] = [];

                snap.forEach(function(doc) {
                    var d = serializeFirestoreData(doc.data());
                    backupData.collections[col.name].push({ id: doc.id, data: d });
                });
            } catch (e) {
                console.log('備份 ' + col.name + ' 跳過:', e);
            }
        }

        // 產生並下載 JSON 檔案
        var jsonStr = JSON.stringify(backupData, null, 2);
        var blob = new Blob([jsonStr], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'WMS_Backup_' + timestamp.split('T')[0] + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // 更新備份時間
        window._backupConfig.lastBackupTime = timestamp;
        localStorage.setItem('lastBackupTime', timestamp);

        var lastBackupEl = document.getElementById('dev-last-backup');
        if (lastBackupEl) lastBackupEl.textContent = new Date(timestamp).toLocaleString('zh-TW');

        if (statusEl) {
            statusEl.innerHTML = '<i class="fa-solid fa-check mr-1"></i>備份完成';
            statusEl.className = 'text-emerald-400 font-bold';
        }

        // 計算摘要
        var totalCount = 0;
        Object.keys(backupData.collections).forEach(function(k) {
            totalCount += backupData.collections[k].length;
        });

        alert('✅ 備份完成！\n\n共備份 ' + totalCount + ' 筆資料');

    } catch (err) {
        console.error('備份失敗:', err);
        if (statusEl) {
            statusEl.innerHTML = '<i class="fa-solid fa-xmark mr-1"></i>備份失敗';
            statusEl.className = 'text-red-400 font-bold';
        }
        alert('❌ 備份失敗：' + err.message);
    }
};

// 處理還原檔案（開發者工具頁面用）
window.handleRestoreFile = async function(event) {
    var file = event.target.files[0];
    if (!file) return;

    if (!confirm('⚠️ 警告：還原將執行以下操作：\n\n1. 清空現有所有資料\n2. 從備份檔案完整還原\n\n此操作無法復原！確定要繼續嗎？')) {
        event.target.value = '';
        return;
    }

    if (!confirm('🔴 最後確認：所有現有資料將被刪除並替換為備份內容！\n\n確定還原？')) {
        event.target.value = '';
        return;
    }

    var statusEl = document.getElementById('dev-backup-status');
    if (statusEl) {
        statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>還原中...';
        statusEl.className = 'text-yellow-400 font-bold';
    }

    try {
        var reader = new FileReader();
        reader.onload = async function(e) {
            try {
                var backupData = JSON.parse(e.target.result);
                var collections = window._backupConfig.collections;

                // 清空現有資料
                for (var i = 0; i < collections.length; i++) {
                    var col = collections[i];
                    if (statusEl) statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>清空 ' + col.label + '...';
                    try {
                        await clearCollection(col.name);
                    } catch (e) {
                        console.log('清空 ' + col.name + ' 跳過:', e);
                    }
                }

                // 還原資料
                var totalRestored = 0;
                for (var colName in backupData.collections) {
                    var items = backupData.collections[colName];
                    var colConfig = collections.find(function(c) { return c.name === colName; });
                    var label = colConfig ? colConfig.label : colName;
                    
                    if (statusEl) statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>還原 ' + label + '...';

                    for (var j = 0; j < items.length; j++) {
                        var item = items[j];
                        var data = deserializeData(item.data);
                        try {
                            await window.setDoc(window.doc(window.db, colName, item.id), data);
                            totalRestored++;
                        } catch (e) {
                            console.log('還原文件失敗:', e);
                        }
                    }
                }

                if (statusEl) {
                    statusEl.innerHTML = '<i class="fa-solid fa-check mr-1"></i>還原完成';
                    statusEl.className = 'text-emerald-400 font-bold';
                }

                alert('✅ 還原完成！\n\n共還原 ' + totalRestored + ' 筆資料\n\n請重新整理頁面以載入新資料。');

                // 重新載入頁面
                if (confirm('是否立即重新整理頁面？')) {
                    location.reload();
                }

            } catch (parseErr) {
                console.error('解析備份檔案失敗:', parseErr);
                if (statusEl) {
                    statusEl.innerHTML = '<i class="fa-solid fa-xmark mr-1"></i>還原失敗';
                    statusEl.className = 'text-red-400 font-bold';
                }
                alert('❌ 備份檔案格式錯誤：' + parseErr.message);
            }
        };
        reader.readAsText(file);

    } catch (err) {
        console.error('還原失敗:', err);
        if (statusEl) {
            statusEl.innerHTML = '<i class="fa-solid fa-xmark mr-1"></i>還原失敗';
            statusEl.className = 'text-red-400 font-bold';
        }
        alert('❌ 還原失敗：' + err.message);
    }

    event.target.value = '';
};

window.restoreFromFirebase = async function(backupId) {
    if (!confirm('⚠️ 警告：一鍵還原將執行以下操作：\n\n1. 清空現有所有資料\n2. 從雲端備份完整還原\n\n此操作無法復原！確定要繼續嗎？')) return;

    if (!confirm('🔴 最後確認：確定還原？')) return;

    var statusEl = document.getElementById('backup-status');
    statusEl.innerHTML = '<span class="text-yellow-400"><i class="fa-solid fa-spinner fa-spin mr-1"></i>讀取雲端備份...</span>';

    try {
        var backupDoc = await window.getDoc(window.doc(window.db, 'backups', backupId));
        if (!backupDoc.exists) {
            alert('備份不存在');
            return;
        }

        var backupData = JSON.parse(backupDoc.data().data);
        var collections = window._backupConfig.collections;
        var restored = {};

        statusEl.innerHTML = '<span class="text-red-400"><i class="fa-solid fa-spinner fa-spin mr-1"></i>清空現有資料...</span>';

        for (var i = 0; i < collections.length; i++) {
            var col = collections[i];
            statusEl.innerHTML = '<span class="text-red-400"><i class="fa-solid fa-spinner fa-spin mr-1"></i>清空 ' + col.label + '...</span>';
            try {
                await clearCollection(col.name);
            } catch (e) {
                console.log('清空 ' + col.name + ' 跳過:', e);
            }
        }

        var collectionNames = Object.keys(backupData.collections || {});

        for (var i = 0; i < collectionNames.length; i++) {
            var colName = collectionNames[i];
            var colConfig = collections.find(function(c) { return c.name === colName; });
            var items = backupData.collections[colName] || [];

            statusEl.innerHTML = '<span class="text-yellow-400"><i class="fa-solid fa-spinner fa-spin mr-1"></i>還原 ' + (colConfig ? colConfig.label : colName) + '...</span>';

            restored[colName] = 0;

            for (var j = 0; j < items.length; j++) {
                var item = items[j];
                var docData = deserializeData(item.data);
                await window.setDoc(window.doc(window.db, colName, item.id), docData);
                restored[colName]++;
            }
        }

        var summaryText = Object.keys(restored).map(function(k) {
            var col = collections.find(function(c) { return c.name === k; });
            return (col ? col.label : k) + ': ' + restored[k] + ' 筆';
        }).join('\n');

        statusEl.innerHTML = '<span class="text-emerald-400"><i class="fa-solid fa-check mr-1"></i>還原完成！</span>';

        alert('✅ 一鍵還原完成！\n\n' + summaryText + '\n\n頁面將重新載入...');

        setTimeout(function() { location.reload(); }, 1000);

    } catch (err) {
        console.error('還原失敗:', err);
        statusEl.innerHTML = '<span class="text-red-400"><i class="fa-solid fa-xmark mr-1"></i>還原失敗</span>';
        alert('還原失敗：' + err.message);
    }
};

window.deleteCloudBackup = async function(backupId) {
    if (!confirm('確定要刪除此備份？')) return;

    try {
        await window.deleteDoc(window.doc(window.db, 'backups', backupId));
        showCloudBackupList();
    } catch (err) {
        alert('刪除失敗：' + err.message);
    }
};

setTimeout(function() {
    checkBackupReminder();
}, 3000);

// ========== 清除資料功能 ==========

window.openClearDataModal = function() {
    var modal = document.createElement('div');
    modal.id = 'modal-clear-data';
    modal.className = 'fixed inset-0 z-50 bg-black/80 flex items-center justify-center backdrop-blur-sm';

    var waveCount = (window._waveData.waves || []).length;
    var orderCount = (window._orderData.orders || []).length;
    var pendingOrders = window._orderData.orders.filter(function(o) { return o.status === 'pending'; }).length;
    var inWaveOrders = window._orderData.orders.filter(function(o) { return o.waveNo; }).length;

    modal.innerHTML = '<div class="bg-slate-900 border border-slate-700 rounded-2xl w-[500px] shadow-2xl">' +
        '<div class="bg-gradient-to-r from-red-900 to-orange-900 p-4 rounded-t-2xl border-b border-slate-700">' +
        '<h3 class="text-white font-bold text-lg"><i class="fa-solid fa-triangle-exclamation mr-2 text-yellow-400"></i>清除資料</h3>' +
        '<p class="text-red-200 text-xs mt-1">此操作無法復原，請謹慎選擇</p></div>' +
        '<div class="p-6">' +
        '<div class="bg-slate-800 rounded-lg p-4 mb-4">' +
        '<div class="text-slate-300 text-sm mb-2">目前資料狀態：</div>' +
        '<div class="grid grid-cols-2 gap-2 text-sm">' +
        '<div class="text-slate-400">波次數量：<span class="text-white font-bold">' + waveCount + '</span></div>' +
        '<div class="text-slate-400">訂單總數：<span class="text-white font-bold">' + orderCount + '</span></div>' +
        '<div class="text-slate-400">待處理訂單：<span class="text-yellow-400 font-bold">' + pendingOrders + '</span></div>' +
        '<div class="text-slate-400">已建波次訂單：<span class="text-blue-400 font-bold">' + inWaveOrders + '</span></div>' +
        '</div></div>' +
        '<div class="space-y-3">' +
        '<button onclick="clearAllWaves()" class="w-full py-3 bg-orange-600 hover:bg-orange-500 text-white rounded-lg font-bold text-left px-4">' +
        '<i class="fa-solid fa-layer-group mr-2"></i>清除所有波次<br><span class="text-xs text-orange-200 font-normal">訂單保留，波次全部刪除，訂單狀態恢復為待處理</span></button>' +
        '<button onclick="clearAllOrders()" class="w-full py-3 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold text-left px-4">' +
        '<i class="fa-solid fa-file-lines mr-2"></i>清除所有訂單<br><span class="text-xs text-red-200 font-normal">訂單和波次全部刪除（從 Firebase 移除）</span></button>' +
        '<button onclick="clearLocalStorage()" class="w-full py-3 bg-slate-600 hover:bg-slate-500 text-white rounded-lg font-bold text-left px-4">' +
        '<i class="fa-solid fa-database mr-2"></i>清除本機快取<br><span class="text-xs text-slate-300 font-normal">僅清除瀏覽器 localStorage，不影響 Firebase 資料</span></button>' +
        '</div></div>' +
        '<div class="p-4 border-t border-slate-700 flex justify-end">' +
        '<button onclick="closeClearDataModal()" class="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg">關閉</button>' +
        '</div></div>';

    document.body.appendChild(modal);
};

window.closeClearDataModal = function() {
    var modal = document.getElementById('modal-clear-data');
    if (modal) modal.remove();
};

window.clearAllWaves = async function() {
    var waveCount = (window._waveData.waves || []).length;
    if (waveCount === 0) {
        alert('目前沒有波次資料');
        return;
    }

    if (!confirm('確定要清除所有 ' + waveCount + ' 個波次嗎？\n\n訂單會保留，狀態恢復為待處理\n此操作無法復原')) {
        return;
    }

    for (var i = 0; i < window._waveData.waves.length; i++) {
        var wave = window._waveData.waves[i];
        (wave.orders || []).forEach(function(order) {
            var o = window._orderData.orders.find(function(x) { return x.orderNo === order.orderNo; });
            if (o) {
                o.status = 'pending';
                o.waveNo = null;
                if (o.id) {
                    window.updateDoc(window.doc(window.db, 'salesOrders', o.id), {
                        status: 'pending', waveNo: null
                    }).catch(function(err) { console.error(err); });
                }
            }
        });

        if (wave.id) {
            window.deleteDoc(window.doc(window.db, 'waves', wave.id)).catch(function(err) {
                console.error(err);
            });
        }
    }

    window._waveData.waves = [];
    saveWaves();
    refreshWaveList();
    renderOrderList();
    closeClearDataModal();

    alert('已清除 ' + waveCount + ' 個波次！');
};

window.clearAllOrders = async function() {
    var orderCount = (window._orderData.orders || []).length;
    var waveCount = (window._waveData.waves || []).length;

    if (orderCount === 0 && waveCount === 0) {
        alert('目前沒有資料');
        return;
    }

    if (!confirm('警告！將永久刪除：\n\n' + orderCount + ' 筆訂單\n' + waveCount + ' 個波次\n\n此操作無法復原！')) return;
    if (!confirm('再次確認：確定要刪除所有資料嗎？')) return;

    var progressDiv = document.createElement('div');
    progressDiv.id = 'clear-progress';
    progressDiv.className = 'fixed inset-0 bg-black/90 flex items-center justify-center z-[200]';
    progressDiv.innerHTML = '<div class="bg-slate-800 rounded-xl p-8 text-center">' +
        '<i class="fa-solid fa-trash fa-spin text-4xl text-red-400 mb-4"></i>' +
        '<div class="text-white text-lg">清除資料中...</div></div>';
    document.body.appendChild(progressDiv);

    for (var i = 0; i < window._orderData.orders.length; i++) {
        var order = window._orderData.orders[i];
        if (order.id) {
            try { await window.deleteDoc(window.doc(window.db, 'salesOrders', order.id)); } catch (err) {}
        }
    }

    for (var j = 0; j < window._waveData.waves.length; j++) {
        var wave = window._waveData.waves[j];
        if (wave.id) {
            try { await window.deleteDoc(window.doc(window.db, 'waves', wave.id)); } catch (err) {}
        }
    }

    window._orderData.orders = [];
    window._waveData.waves = [];
    localStorage.removeItem('wms_waves');

    document.getElementById('clear-progress').remove();

    refreshWaveList();
    renderOrderList();
    closeClearDataModal();

    alert('已清除所有資料！');
};

window.clearLocalStorage = function() {
    if (!confirm('確定要清除本機快取嗎？')) return;

    localStorage.removeItem('wms_waves');
    localStorage.removeItem('wms_orders');

    closeClearDataModal();
    alert('本機快取已清除！頁面將重新載入。');
    location.reload();
};

        window.openCreateWaveModal = function() {
            var orders = (window._orderData && window._orderData.orders) ? window._orderData.orders.filter(function(o) {
                return o.status === 'pending' || o.status === 'confirmed';
            }) : [];

            if (orders.length === 0) {
                alert('目前沒有待出貨訂單');
                return;
            }

            var logistics = {};
            orders.forEach(function(o) {
                var l = o.logistics || '未指定';
                logistics[l] = true;
            });

            var logisticsSelect = document.getElementById('wave-filter-logistics');
            logisticsSelect.innerHTML = '<option value="">全部物流</option>';
            Object.keys(logistics).forEach(function(l) {
                logisticsSelect.innerHTML += '<option value="' + l + '">' + l + '</option>';
            });

            document.getElementById('wave-filter-date').value = new Date().toLocalYMD();

            window._waveCreateOrders = orders;
            renderWaveOrders(orders);
            updateWaveSelectedCount();

            document.getElementById('modal-create-wave').classList.remove('hidden');
        };

        window.closeCreateWaveModal = function() {
            document.getElementById('modal-create-wave').classList.add('hidden');
        };

        function renderWaveOrders(orders) {
            var tbody = document.getElementById('wave-orders-body');

            if (orders.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center text-slate-500 py-8">無符合條件的訂單</td></tr>';
                return;
            }

            var html = '';
            orders.forEach(function(o) {
                html += '<tr class="hover:bg-slate-800/50 border-b border-slate-700/50">';
                html += '<td class="p-2"><input type="checkbox" class="wave-order-check w-4 h-4" data-id="' + o.id + '"></td>';
                html += '<td class="p-2 font-mono text-cyan-400">' + (o.orderNo || o.id) + '</td>';
                html += '<td class="p-2 text-white">' + (o.customer || '-') + '</td>';
                html += '<td class="p-2 text-purple-400">' + (o.logistics || '-') + '</td>';
                html += '<td class="p-2 text-slate-300">' + (o.productName || '-') + '</td>';
                html += '<td class="p-2 text-right text-yellow-400 font-bold">' + (o.quantity || 0) + '</td>';
                html += '<td class="p-2 text-slate-400 text-xs">' + (o.shipDate || '-') + '</td>';
                html += '</tr>';
            });

            tbody.innerHTML = html;

            document.querySelectorAll('.wave-order-check').forEach(function(cb) {
                cb.addEventListener('change', updateWaveSelectedCount);
            });
        }

        window.filterWaveOrders = function() {
            var logisticsFilter = document.getElementById('wave-filter-logistics').value;
            var dateFilter = document.getElementById('wave-filter-date').value;

            var filtered = (window._waveCreateOrders || []).filter(function(o) {
                if (logisticsFilter && o.logistics !== logisticsFilter) return false;
                if (dateFilter && o.shipDate !== dateFilter) return false;
                return true;
            });

            renderWaveOrders(filtered);
        };

        window.selectAllWaveOrders = function() {
            document.querySelectorAll('.wave-order-check').forEach(function(cb) { cb.checked = true; });
            updateWaveSelectedCount();
        };

        window.deselectAllWaveOrders = function() {
            document.querySelectorAll('.wave-order-check').forEach(function(cb) { cb.checked = false; });
            updateWaveSelectedCount();
        };

        window.toggleWaveCheckAll = function() {
            var checkAll = document.getElementById('wave-check-all').checked;
            document.querySelectorAll('.wave-order-check').forEach(function(cb) { cb.checked = checkAll; });
            updateWaveSelectedCount();
        };

        function updateWaveSelectedCount() {
            var count = document.querySelectorAll('.wave-order-check:checked').length;
            document.getElementById('wave-selected-count').innerText = count;
        }

        window.printPickingList = function() {
            var wave = window._waveData.currentWave;
            var list = window._waveData.pickingList;

            if (!wave || !wave.summary || wave.summary.length === 0) {
                alert('無揀貨資料');
                return;
            }

            wave.printVersion = (wave.printVersion || 0) + 1;
            var version = wave.printVersion;

            var html = '<style>';
            html += 'body { font-family: "Microsoft JhengHei", sans-serif; font-size: 12px; }';
            html += '.header { text-align: center; margin-bottom: 15px; border-bottom: 2px solid #333; padding-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }';
            html += '.header h2 { margin: 0; }';
            html += '.version { background: #374151; color: white; padding: 4px 12px; border-radius: 4px; font-weight: bold; }';
            html += '.info-row { display: flex; gap: 15px; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px dashed #ccc; }';
            html += '.info-item { flex: 1; }';
            html += '.info-label { font-size: 11px; color: #666; }';
            html += '.info-value { font-size: 15px; font-weight: bold; }';
            html += 'table { width: 100%; border-collapse: collapse; }';
            html += 'th, td { border: 1px solid #333; padding: 6px; text-align: left; }';
            html += 'th { background: #374151; color: white; font-size: 11px; }';
            html += '.loc { font-weight: bold; font-size: 13px; color: #1e40af; }';
            html += '.qty { text-align: center; font-weight: bold; font-size: 16px; color: #c00; }';
            html += '.check { width: 30px; text-align: center; }';
            html += '.floor-1f { background: #dbeafe; }';
            html += '.floor-2f { background: #fef3c7; }';
            html += '.floor-3f { background: #fee2e2; }';
            html += '.timestamp { text-align: right; font-size: 10px; color: #666; margin-top: 10px; }';
            html += '</style>';

            html += '<div class="header">';
            html += '<div><h2>揀貨單</h2><h3 style="margin:5px 0 0 0">' + wave.waveNo + '</h3></div>';
            html += '<span class="version">版次 V' + version + '</span>';
            html += '</div>';

            html += '<div class="info-row">';
            html += '<div class="info-item"><div class="info-label">物流商</div><div class="info-value">' + wave.logistics + '</div></div>';
            html += '<div class="info-item"><div class="info-label">訂單數</div><div class="info-value">' + (wave.orders ? wave.orders.length : 0) + ' 筆</div></div>';
            html += '<div class="info-item"><div class="info-label">品項數</div><div class="info-value">' + wave.itemCount + ' 項</div></div>';
            html += '<div class="info-item"><div class="info-label">總件數</div><div class="info-value" style="color:#c00">' + wave.totalQty + ' 件</div></div>';
            html += '</div>';

            var summaryWithLoc = (wave.summary || []).filter(function(item) {
                return !window.isExcludedFromPickingList(item.productName);
            }).map(function(item) {
                var invInfo = findProductInventoryInfo(item.productName, item.spec);
                return {
                    productName: item.productName,
                    spec: item.spec || '-',
                    unit: item.unit || '件',
                    totalQty: item.totalQty,
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
            html += '<tr><th class="check">✓</th><th style="width:70px">儲位</th><th style="width:100px">品名</th><th>規格</th><th style="width:80px">批號</th><th style="width:80px">效期</th><th style="width:50px" class="qty">數量</th><th style="width:35px">單位</th></tr>';

            summaryWithLoc.forEach(function(item) {
                var floorClass = item.floor === 1 ? 'floor-1f' : (item.floor === 2 ? 'floor-2f' : (item.floor === 3 ? 'floor-3f' : ''));
                html += '<tr class="' + floorClass + '">';
                html += '<td class="check">☐</td>';
                html += '<td class="loc">' + item.location + '</td>';
                html += '<td>' + item.productName + '</td>';
                html += '<td>' + item.spec + '</td>';
                html += '<td style="font-size:11px">' + item.batchNo + '</td>';
                html += '<td style="font-size:11px">' + item.expiryDate + '</td>';
                html += '<td class="qty">' + item.totalQty + '</td>';
                html += '<td>' + item.unit + '</td>';
                html += '</tr>';
            });

            html += '</table>';
            var printTime = new Date().toLocaleString('zh-TW');
            html += '<div class="timestamp">版次 V' + version + ' | 列印日期：' + printTime + '</div>';

            openPrintPreview(html, '揀貨單 - ' + wave.waveNo, 900, 700);
        };

        window.openAddToWaveModal = async function(waveNo) {
            var wave = window._waveData.waves.find(function(w) { return w.waveNo === waveNo; });
            if (!wave) {
                alert('找不到波次');
                return;
            }
            if (wave.status === 'done') {
                alert('波次已完成，不能追加訂單');
                return;
            }

            // 與建立波次相同：可追加的是「待處理 / 已確認」且尚未在任何波次中的銷貨訂單
            var inWaveNos = {};
            window._waveData.waves.forEach(function(w) {
                (w.orders || []).forEach(function(o) { inWaveNos[o.orderNo] = true; });
            });
            var availableOrders = ((window._orderData && window._orderData.orders) || []).filter(function(o) {
                return (o.status === 'pending' || o.status === 'confirmed') && !inWaveNos[o.orderNo];
            });

            if (availableOrders.length === 0) {
                alert('目前沒有可追加的訂單\n\n所有待出貨訂單都已加入波次中');
                return;
            }

            var msg = '可追加到波次 ' + waveNo + ' 的訂單：\n\n';
            availableOrders.forEach(function(o, idx) {
                msg += (idx + 1) + '. ' + o.orderNo + ' - ' + (o.customer || '') + ' (' + (o.items || []).length + ' 項)\n';
            });
            msg += '\n請輸入要追加的序號或訂單編號（多筆用逗號分隔）：';

            var input = prompt(msg);
            if (!input) return;

            var selected = input.split(',').map(function(x) { return x.trim(); });
            var addedOrders = availableOrders.filter(function(o, idx) {
                return selected.indexOf(String(idx + 1)) >= 0 || selected.indexOf(o.orderNo) >= 0;
            });

            if (addedOrders.length === 0) {
                alert('未選擇任何訂單');
                return;
            }

            wave.orders = (wave.orders || []).concat(addedOrders.map(function(o) {
                return { id: o.id, orderNo: o.orderNo, customer: o.customer, logistics: o.logistics, address: o.address, items: o.items };
            }));
            var totals = buildWaveSummary(wave.orders);
            wave.summary = totals.summaryList;
            wave.orderCount = wave.orders.length;
            wave.itemCount = totals.summaryList.length;
            wave.totalQty = totals.totalQty;
            wave.totalSmallQty = totals.totalSmallQty;
            wave.updatedAt = new Date().toISOString();

            try {
                if (wave.id) {
                    await window.updateDoc(window.doc(window.db, 'waves', wave.id), {
                        orders: wave.orders, summary: wave.summary, orderCount: wave.orderCount,
                        itemCount: wave.itemCount, totalQty: wave.totalQty, totalSmallQty: wave.totalSmallQty,
                        updatedAt: wave.updatedAt
                    });
                }
                for (var k = 0; k < addedOrders.length; k++) {
                    if (addedOrders[k].id) {
                        await window.updateDoc(window.doc(window.db, 'salesOrders', addedOrders[k].id), { status: 'inWave', waveNo: wave.waveNo });
                    }
                    addedOrders[k].status = 'inWave';
                }
            } catch (err) {
                console.error('追加訂單失敗:', err);
                alert('❌ 追加訂單失敗：' + err.message);
                return;
            }

            if (wave.status === 'picking' && window._waveData.currentWave &&
                window._waveData.currentWave.waveNo === waveNo) {
                generatePickingListV2(wave);
            }

            saveWaves();
            refreshWaveList();

            alert('✅ 已追加 ' + addedOrders.length + ' 筆訂單到波次 ' + waveNo);
        };

