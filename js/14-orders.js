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
    '阿誠': ['阿誠', '誠'],
    '文生': ['文生'],
    '金東石': ['金東石'],
    '奧林': ['奧林'],
    '裕寶饕': ['裕寶饕', '裕寶'],
    '上泰貨運': ['上泰貨運', '上泰'],
    '自取': ['自取']
};
// 主管在「波次揀貨 → 設定 → 物流商」存過名單（settings/logistics）就用存的，沒存過用上面這份
const DEFAULT_LOGISTICS = JSON.parse(JSON.stringify(LOGISTICS_KEYWORDS));
function applyLogisticsList(list) {
    Object.keys(LOGISTICS_KEYWORDS).forEach(k => { delete LOGISTICS_KEYWORDS[k]; });
    list.forEach(x => {
        const name = String(x.name || '').trim();
        if (!name) return;
        const kws = (x.keywords || []).map(k => String(k).trim()).filter(Boolean);
        LOGISTICS_KEYWORDS[name] = kws.length ? kws : [name];
    });
}
function logisticsListFromMap(m) { return Object.keys(m).map(k => ({ name: k, keywords: m[k].slice() })); }
window.watchLogisticsList = function() {
    return window.db.collection('settings').doc('logistics').onSnapshot(d => {
        const list = d.exists && Array.isArray(d.data().list) && d.data().list.length ? d.data().list : logisticsListFromMap(DEFAULT_LOGISTICS);
        applyLogisticsList(list);
    }, () => {});
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

// 品項分類（運費、包材、冷藏…）和每件幾盒的判斷在 js/shared/product-rules.js（電腦版與手機版共用）


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

// 鼎新改了已匯入的訂單：一行一張單，例如「SO-1（波次 W260925-001）白蝦 50/60 8→10、透抽 L 刪除」
window.describeOrderChanges = function(orderChanges) {
    return (orderChanges || []).map(function(c) {
        var what = (c.changes || []).map(function(x) {
            var name = x.productName + (x.spec ? ' ' + x.spec : '');
            return x.type === 'add' ? name + ' 新增 ' + x.newQty : x.type === 'remove' ? name + ' 刪除' : name + ' ' + x.oldQty + '→' + x.newQty;
        }).join('、');
        return c.orderNo + (c.waveNo ? '（波次 ' + c.waveNo + '）' : '') + ' ' + what;
    });
};

// 人工匯入時的提醒：哪些單改了、波次有沒有跟著更新
function showOrderChangesAlert(orderChanges) {
    if (!orderChanges || orderChanges.length === 0) return;
    var lines = window.describeOrderChanges(orderChanges);
    var upd = [], started = [];
    orderChanges.forEach(function(c, i) {
        if (c.waveState === 'updated' || c.waveState === 'adjusted') upd.push(lines[i]);
        else if (c.waveState === 'started') started.push(lines[i]);
    });
    alert('⚠️ 鼎新改了 ' + orderChanges.length + ' 張已匯入的訂單：\n\n' + lines.join('\n') +
        (upd.length ? '\n\n✅ 波次已經自動調整（手機清單會跟著變；揀到一半多拿的會列「放回」；已印的揀貨單要重印）：\n' + upd.join('\n') : '') +
        (started.length ? '\n\n❗ 這些的波次已經開始揀，沒有自動改，請到現場處理：\n' + started.join('\n') : ''));
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

// opts.fresh：剛建好的波次（一般揀貨單，不印「更新版」橫條和異動欄）
function printUpdatedPickingLists(waves, changeDetails, opts) {
    var fresh = !!(opts && opts.fresh);
    var printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) { alert('瀏覽器擋住了列印視窗，請允許這個網站「彈出式視窗」後再按一次'); return false; }

    var html = '<!DOCTYPE html><html><head><title>' + (fresh ? '揀貨單' : '📋 更新版揀貨單') + '</title>' +
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

        if (!fresh) html += '<div class="update-banner">⚠️ 【更新版】請作廢舊版揀貨單</div>';

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

        // 兩間倉庫：一間一張（換頁），各自拿去揀
        var groups = window.groupRowsByHouse(summaryWithLoc);
        groups.forEach(function(g, gi) {
        if (groups.length > 1 || g.house) html += '<h3 style="margin:10px 0 6px;font-size:18px' + (gi ? ';page-break-before:always' : '') + '">📍 ' + g.name + '　' + wave.waveNo + '（' + g.rows.length + ' 項）</h3>';
        html += '<table>';
        html += '<tr><th class="check">✓</th><th style="width:70px">儲位</th><th style="width:100px">品名</th><th>規格</th><th style="width:80px">批號</th><th style="width:80px">效期</th><th style="width:50px" class="qty">數量</th><th style="width:35px">單位</th>' + (fresh ? '' : '<th style="width:50px">異動</th>') + '</tr>';

        g.rows.forEach(function(item) {
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
            if (!fresh) html += '<td style="text-align:center">' + changeHtml + '</td>';
            html += '</tr>';
        });

        html += '</table>';
        });
        html += '<div class="timestamp">版次 V' + version + ' | 列印日期：' + now + '</div>';
        html += '</div>';
    });

    html += '<script>window.onload = function() { window.print(); }<\/script></body></html>';

    printWindow.document.write(html);
    printWindow.document.close();
    return true;
}

// 匯入訂單後，一次印出剛建好的波次揀貨單（一個波次一頁）
window.printNewWavePickingLists = function(waveNos) {
    var waves = (waveNos || []).map(function(no) { return window._waveData.waves.find(function(w) { return w.waveNo === no; }); }).filter(Boolean);
    if (!waves.length) { alert('找不到剛建好的波次，請到波次清單按「開始揀貨」再列印'); return; }
    if (printUpdatedPickingLists(waves, null, { fresh: true })) saveWaves();
};

// 波次清單每一列的「揀貨單」：只印這個波次，不用先開始揀貨
window.printWavePickingList = function(waveNo) {
    var w = window._waveData.waves.find(function(x) { return x.waveNo === waveNo; });
    if (!w) { alert('找不到波次 ' + waveNo); return; }
    if (!(w.summary || []).length) { alert('波次 ' + waveNo + ' 沒有品項，沒有東西可以印'); return; }
    printUpdatedPickingLists([w], null, { fresh: true });
};

function findProductLocation(productName, spec) {
    var p = productPalletsFifo(productName, spec)[0];
    return p ? (p.locationId || '-') : '-';
}

// 揀貨單上印的儲位／批號／效期：同品名規格的板，先進先出（效期早的先），過期、留置的不算
function productPalletsFifo(productName, spec) {
    var pallets = window.currentPallets ? window.currentPallets() : [];
    var today = new Date().toLocalYMD();
    var exp = function(p) { return window.normalizeDateValue(p.expiryDate || p.expDate) || ''; };
    return pallets.filter(function(p) {
        if (p.productName !== productName || (p.spec || '') !== (spec || '') || !((parseFloat(p.quantity) || 0) > 0)) return false;
        if (exp(p) && exp(p) < today) return false;
        return !(window.isHoldLocation && window.isHoldLocation(p.locationId));
    }).sort(function(a, b) { return (exp(a) || '9999-12-31').localeCompare(exp(b) || '9999-12-31'); });
}
function findProductInventoryInfo(productName, spec) {
    var result = { location: '-', batchNo: '-', expiryDate: '-', floor: 9 };
    var p = productPalletsFifo(productName, spec)[0];
    if (!p) return result;
    result.location = p.locationId || '-';
    result.batchNo = p.batchNo || '-';
    var e = window.normalizeDateValue(p.expiryDate || p.expDate);
    if (e) result.expiryDate = e.replace(/-/g, '/');
    result.floor = getFloorFromLocation(result.location);
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

// ERP 銷貨明細的欄位：每個欄位可接受的標題（依序比對，完全相同才算）
const ERP_HEADERS = {
    DATE: ['銷貨日期', '單據日期', '日期'],
    ORDER_NO: ['銷貨單號', '單號', '單據號碼', '訂單單號'],
    CUST_CODE: ['客戶代號', '客戶編號', '代號'],
    CUST_NAME: ['客戶全名', '客戶名稱', '客戶簡稱', '客戶'],
    PRODUCT: ['品名'],
    SPEC: ['規格'],
    PKG_QTY: ['包裝數量', '銷貨包裝數量', '件數'],
    PKG_UNIT: ['包裝單位'],
    QTY: ['銷貨數量', '數量', '出貨數量'],
    UNIT: ['單位'],
    PRICE: ['單價'],
    REMARK: ['備註', '單頭備註', '單身備註', '物流商', '物流'],
    BATCH: ['批號'],
    ADDR1: ['送貨地址一', '送貨地址1', '送貨地址', '地址一', '地址'],
    ADDR2: ['送貨地址二', '送貨地址2', '地址二']
};
// 門市的銷貨單（單號 233-、234- 開頭）不從倉庫揀貨，匯入時整張跳過
window.STORE_ORDER_PREFIX = /^(233|234)-/;
// 門市備貨的客戶（客戶名稱有這些字）：整張跳過
window.STORE_PREPARED_CUSTOMERS = ['統一'];
window.isStoreOrder = function(orderNo, customer) {
    return window.STORE_ORDER_PREFIX.test(orderNo) || window.STORE_PREPARED_CUSTOMERS.some(function(k) { return String(customer || '').includes(k); });
};
const ERP_REQUIRED = { ORDER_NO: '銷貨單號', PRODUCT: '品名', QTY: '銷貨數量', REMARK: '備註（物流商）' };

// 在前 20 列找標題列（有「品名」那一列），回傳 { row, col } 或 { error }
function findErpHeader(rows) {
    const norm = v => String(v == null ? '' : v).replace(/\s/g, '');
    let hr = -1;
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
        if ((rows[i] || []).some(c => norm(c) === '品名')) { hr = i; break; }
    }
    if (hr < 0) return { error: '找不到標題列（要有「品名」「銷貨單號」「銷貨數量」「備註」這些欄位）。\n請確認匯出的是鼎新「銷貨明細」報表。' };
    const cells = (rows[hr] || []).map(norm);
    const col = {}, used = {};
    Object.keys(ERP_HEADERS).forEach(k => {
        for (const name of ERP_HEADERS[k]) {
            const i = cells.findIndex((c, j) => c === name && !used[j]);
            if (i >= 0) { col[k] = i; used[i] = true; return; }
        }
    });
    const missing = Object.keys(ERP_REQUIRED).filter(k => col[k] === undefined).map(k => ERP_REQUIRED[k]);
    if (missing.length) return { error: '報表少了這些欄位：' + missing.join('、') + '\n\n可能開錯報表：請改用鼎新「每日客戶銷貨明細表」（要有銷貨單號），\n「銷貨單明細表」沒有單號，不能拿來匯入訂單。' };
    return { row: hr, col: col };
}

// 匯入時物流商認不出來（備註沒寫或寫錯）的新訂單：列出來請人工選；選「先不排」就留在未指定
function askLogistics(orders) {
    const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const opts = '<option value="">-- 請選擇 --</option>' + Object.keys(LOGISTICS_KEYWORDS).map(k => '<option value="' + esc(k) + '">' + esc(k) + '</option>').join('') +
        '<option value="未指定">先不排（之後再指定）</option>';
    return new Promise(resolve => {
        let rows = '';
        orders.forEach((o, i) => {
            rows += '<tr class="border-b border-slate-700"><td class="p-2 text-cyan-400 font-mono text-xs">' + esc(o.orderNo) + '</td>' +
                '<td class="p-2 text-white">' + esc(o.customer) + '</td>' +
                '<td class="p-2 text-amber-300">' + (esc(o.remark) || '<span class="text-slate-500">（備註空白）</span>') + '</td>' +
                '<td class="p-2 text-slate-300 text-xs">' + esc(o.address) + '</td>' +
                '<td class="p-2"><select class="lg-ask-sel bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white" data-i="' + i + '">' + opts + '</select></td></tr>';
        });
        const content = '<div class="text-sm text-amber-300 mb-3">以下訂單的備註看不出物流商，請選擇（下次請業務在鼎新備註寫上物流商，例如：黑貓、新竹、大榮、自取）：</div>' +
            '<div class="flex items-center gap-2 mb-2 text-sm text-slate-300">全部設為 <select id="lg-ask-all" class="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white">' + opts + '</select></div>' +
            '<div class="max-h-[50vh] overflow-y-auto"><table class="w-full text-sm"><thead><tr class="text-slate-400 text-xs"><th class="p-2 text-left">單號</th><th class="p-2 text-left">客戶</th><th class="p-2 text-left">備註</th><th class="p-2 text-left">地址</th><th class="p-2 text-left">物流商</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
            '<div id="lg-ask-msg" class="text-red-400 text-sm mt-2"></div>' +
            '<div class="flex gap-2 mt-4"><button id="lg-ask-ok" class="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold">選好了，繼續匯入</button>' +
            '<button id="lg-ask-cancel" class="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg">取消匯入</button></div>';
        WMS.createModal('modal-lg-ask', { title: '請選物流商（' + orders.length + ' 張訂單）', icon: 'fa-solid fa-truck text-amber-400', content: content, width: '860px', closeOnBackdrop: false });
        const done = ok => { WMS.closeModal('modal-lg-ask'); resolve(ok); };
        document.querySelector('#modal-lg-ask button[onclick*="closeModal"]').onclick = () => done(false);
        document.getElementById('lg-ask-cancel').onclick = () => done(false);
        document.getElementById('lg-ask-all').onchange = e => { document.querySelectorAll('.lg-ask-sel').forEach(s => { s.value = e.target.value; }); };
        document.getElementById('lg-ask-ok').onclick = () => {
            const sels = document.querySelectorAll('.lg-ask-sel');
            let missing = 0;
            sels.forEach(sel => { if (!sel.value) { missing++; sel.classList.add('border-red-500'); } else sel.classList.remove('border-red-500'); });
            if (missing) { document.getElementById('lg-ask-msg').innerText = '還有 ' + missing + ' 張沒選物流商'; return; }
            sels.forEach(sel => { orders[parseInt(sel.dataset.i, 10)].logistics = sel.value; });
            done(true);
        };
    });
}

// ---------- 物流商名稱設定（主管）：名稱＋備註關鍵字，由上往下比對，先對到的算 ----------
window.openLogisticsSettings = function() {
    const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const r = window.currentUser && window.currentUser.role;
    const canEdit = r === 'admin' || r === 'supervisor';
    const rowHtml = (name, kws) => '<tr class="lgs-row border-b border-slate-700">' +
        '<td class="p-1"><input class="lgs-name w-32 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white" value="' + esc(name) + '"' + (canEdit ? '' : ' disabled') + '></td>' +
        '<td class="p-1"><input class="lgs-kw w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white" value="' + esc(kws.join('、')) + '" placeholder="例如：黑貓、宅急便"' + (canEdit ? '' : ' disabled') + '></td>' +
        '<td class="p-1 text-center">' + (canEdit ? '<button class="lgs-del px-2 py-1 bg-red-700 hover:bg-red-600 text-white rounded text-xs">刪除</button>' : '') + '</td></tr>';
    const rows = Object.keys(LOGISTICS_KEYWORDS).map(k => rowHtml(k, LOGISTICS_KEYWORDS[k])).join('');
    const content = '<div class="text-sm text-slate-300 mb-3">鼎新訂單的<b>備註</b>裡出現這些字，就算這家物流。由上往下比對，先對到的算。' +
        (canEdit ? '' : '<br><span class="text-amber-300">只有主管可以修改。</span>') + '</div>' +
        '<div class="max-h-[50vh] overflow-y-auto"><table class="w-full text-sm"><thead><tr class="text-slate-400 text-xs"><th class="p-1 text-left">物流商名稱</th><th class="p-1 text-left">備註裡出現這些字（用「、」分開）</th><th></th></tr></thead><tbody id="lgs-body">' + rows + '</tbody></table></div>' +
        '<div id="lgs-msg" class="text-red-400 text-sm mt-2"></div>' +
        (canEdit ? '<div class="flex gap-2 mt-3"><button id="lgs-add" class="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg">＋ 新增一家</button>' +
            '<button id="lgs-save" class="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold">儲存</button></div>' : '');
    WMS.createModal('modal-logistics-settings', { title: '物流商設定', icon: 'fa-solid fa-truck text-amber-400', content: content, width: '760px' });
    if (!canEdit) return;
    const body = document.getElementById('lgs-body');
    body.addEventListener('click', e => { if (e.target.classList.contains('lgs-del')) e.target.closest('tr').remove(); });
    document.getElementById('lgs-add').onclick = () => { body.insertAdjacentHTML('beforeend', rowHtml('', [])); body.lastElementChild.querySelector('.lgs-name').focus(); };
    document.getElementById('lgs-save').onclick = async () => {
        const list = [], seen = {};
        let err = '';
        body.querySelectorAll('.lgs-row').forEach(tr => {
            const name = tr.querySelector('.lgs-name').value.trim();
            const kws = tr.querySelector('.lgs-kw').value.split(/[、,，\s]+/).map(x => x.trim()).filter(Boolean);
            if (!name) { if (kws.length) err = '有一列沒有填物流商名稱'; return; }
            if (seen[name]) { err = '「' + name + '」重複了'; return; }
            seen[name] = true;
            list.push({ name: name, keywords: kws.length ? kws : [name] });
        });
        if (!err && !list.length) err = '至少要有一家物流商';
        if (err) { document.getElementById('lgs-msg').innerText = err; return; }
        try {
            await window.db.collection('settings').doc('logistics').set({ list: list, updatedAt: new Date().toISOString(), updatedBy: window.getOperatorName ? window.getOperatorName() : '' });
        } catch (e) { document.getElementById('lgs-msg').innerText = '儲存失敗：' + e.message; return; }
        applyLogisticsList(list);
        WMS.closeModal('modal-logistics-settings');
        // 還沒排波次、沒有物流商的單：用新名單重新比對備註
        const fix = (window._orderData.orders || []).filter(o => window.orderWaveable(o) && (!o.logistics || o.logistics === '未指定') && parseLogistics(o.remark) !== '未指定');
        if (fix.length && confirm('✅ 已儲存\n\n有 ' + fix.length + ' 張還沒排的訂單，備註對得上新的物流商：\n' +
            fix.slice(0, 10).map(o => o.orderNo + ' ' + (o.customer || '') + ' → ' + parseLogistics(o.remark)).join('\n') + (fix.length > 10 ? '\n…' : '') + '\n\n要一起改好嗎？')) {
            for (const o of fix) await window.setOrderLogistics(o.id, parseLogistics(o.remark));
            alert('已改好 ' + fix.length + ' 張，可以按「建立波次」排進波次');
        } else if (!fix.length) alert('✅ 已儲存');
    };
};

// 訂單列表：未指定物流的單可以直接改物流商
window.setOrderLogistics = async function(orderId, logistics) {
    if (!logistics) return;
    const o = window._orderData.orders.find(x => x.id === orderId);
    try {
        await window.db.collection('salesOrders').doc(orderId).update({ logistics: logistics });
        if (o) o.logistics = logistics;
        renderOrderList();
        const m = document.getElementById('modal-create-wave');
        if (m && !m.classList.contains('hidden')) window.openCreateWaveModal();
    } catch (e) { alert('❌ 更新物流商失敗：' + e.message); }
};

// 解析鼎新銷貨明細（表格 → 訂單）；回傳 { orders, needPkg } 或 { error }
// needPkg：換算不出件數、要人工填的品項
window.parseErpOrderRows = function(rows) {
    // 欄位依「標題」找（鼎新報表多一欄、換順序也讀得對）；缺必要欄位就擋下，不會整批讀錯
    const hdr = findErpHeader(rows);
    if (hdr.error) return { error: hdr.error };
    const COL = hdr.col;
    const dataRows = rows.slice(hdr.row + 1);

    const orderMap = new Map();
    let lastOrderNo = null;
    // 數字欄：去掉千分位，保留小數（2.5 公斤不會變 2）
    const num = v => parseFloat(String(v == null ? '' : v).replace(/,/g, '')) || 0;
    const needPkg = [];  // 換算不出件數、要人工填的品項
    const storeSkipped = {};

    // 鼎新報表的特性（跟八方 ERP 的解析經驗一致）：
    //   每頁重複印抬頭（製表日期、期間、第 N 頁）和標題列；單位欄有「銷貨:」「淨額:」小計列；
    //   同一張單接著的列，品名空白＝跟上一列同一個品項
    const headCells = (rows[hdr.row] || []).map(h => String(h == null ? '' : h).trim());
    let lastProduct = '', lastSpec = '', lastProductOrder = null;

    for (let row of dataRows) {
        if (!row || row.length === 0) continue;
        const first = String(row[0] == null ? '' : row[0]).trim();
        if (/^(製表日期|期間)/.test(first) || /^第\s*\d+\s*頁/.test(first)) continue;
        if (headCells.filter((h, k) => h && String(row[k] == null ? '' : row[k]).trim() === h).length >= 3) continue;
        if (/銷貨:|銷退:|淨額:/.test(String(row[COL.UNIT] == null ? '' : row[COL.UNIT]))) continue;
        if (String(row[COL.DATE]).includes('小計') || String(row[COL.DATE]).includes('合計')) continue;

        let orderNo = row[COL.ORDER_NO] ? String(row[COL.ORDER_NO]).trim() : lastOrderNo;
        if (!orderNo) continue;
        if (storeSkipped[orderNo] || window.isStoreOrder(orderNo, COL.CUST_NAME !== undefined ? row[COL.CUST_NAME] : '')) {
            if (row[COL.ORDER_NO]) lastOrderNo = orderNo;
            storeSkipped[orderNo] = true;
            continue;
        }
        if (!row[COL.PRODUCT]) {
            // 品名空白：同一張單、有數量，就沿用上一列的品名、規格
            if (!(lastProduct && lastProductOrder === orderNo && num(row[COL.QTY]) > 0)) continue;
            row = row.slice();
            row[COL.PRODUCT] = lastProduct;
            if (COL.SPEC !== undefined && !row[COL.SPEC]) row[COL.SPEC] = lastSpec;
        }
        lastProduct = String(row[COL.PRODUCT]).trim();
        lastSpec = COL.SPEC !== undefined && row[COL.SPEC] ? String(row[COL.SPEC]).trim() : '';
        lastProductOrder = orderNo;
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

            var feeKeywords = ['運費', '費用', '代工費', '加工費', '保力龍', '保麗龍', '代收', '代墊', '手續費', '服務費', '包材', '紙箱費', '冰袋', '冰塊'];
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
            else if (/^(KG|公斤)$/i.test(unit) && window.kgPerCase(productName) > 0) pkgQty = Math.max(1, Math.round(qty / window.kgPerCase(productName)));   // 每箱約 19 公斤，四捨五入

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

    return { orders: Array.from(orderMap.values()), needPkg: needPkg, storeSkipped: Object.keys(storeSkipped) };
};

// 存訂單：新單新增；已有的單比對異動（已出貨的不改）；回傳各種筆數
window.saveErpOrders = async function(orders) {
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
            // 已經出過貨（全部或部分）的單：多的自動變補出貨，少的提醒開銷退
            if (existing.status === 'shipped' || existing.status === 'partial' || Array.isArray(existing.backorderItems)) {
                var chg = detectOrderChanges(existing, order);
                if (chg.length === 0) { skipCount++; continue; }
                var rc = window.recomputeShippedOrder(existing, order.items);
                var inWave = existing.status === 'inWave' && existing.waveNo;
                var upd = { items: order.items, modifiedAt: new Date().toISOString(), hasChanges: true };
                upd.backorderItems = rc.open.length ? rc.open : firebase.firestore.FieldValue.delete();
                if (rc.erpFixed) { upd.erpFixNeeded = false; existing.erpFixNeeded = false; }
                if (!inWave) upd.status = rc.open.length ? 'partial' : 'shipped';
                // 變成補出貨：離開原本（已完成）的波次，才能排進新的波次
                if (!inWave && rc.open.length && existing.waveNo) { upd.waveNo = null; upd.lastWaveNo = existing.waveNo; }
                if (existing.id) {
                    try { await window.db.collection('salesOrders').doc(existing.id).update(upd); }
                    catch (err) { console.error('更新訂單失敗:', err); }
                }
                existing.items = order.items;
                if (rc.open.length) existing.backorderItems = rc.open; else delete existing.backorderItems;
                if (!inWave) existing.status = upd.status;
                if (upd.waveNo === null) { existing.waveNo = null; existing.lastWaveNo = upd.lastWaveNo; }
                var line = window.describeOrderChanges([{ orderNo: order.orderNo, changes: chg }])[0];
                if (rc.more.length) shippedChanged.push({ orderNo: order.orderNo, kind: 'more', text: order.orderNo + ' ' + rc.more.join('、') });
                if (rc.over.length) shippedChanged.push({ orderNo: order.orderNo, kind: 'over', text: order.orderNo + ' ' + rc.over.join('、') });
                if (inWave) {
                    try { await window.syncOrderIntoWave(existing, line); } catch (err) { console.error('更新波次失敗:', err); }
                }
                modifiedCount++;
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

                if (existing.id) {
                    try {
                        await window.updateDoc(window.doc(window.db, 'salesOrders', existing.id), {
                            items: order.items,
                            modifiedAt: existing.modifiedAt,
                            hasChanges: true
                        });
                    } catch (err) { console.error('更新訂單失敗:', err); }
                }

                // 已排波次：還沒開始揀就把新數量更新進波次；已經開始揀就不動，標記要現場處理
                if (existing.waveNo && existing.id) {
                    try {
                        orderChanges[orderChanges.length - 1].waveState = await window.syncOrderIntoWave(existing, window.describeOrderChanges([orderChanges[orderChanges.length - 1]])[0].replace(/（波次 [^）]*）/, ''));
                    } catch (err) {
                        console.error('更新波次失敗:', err);
                        orderChanges[orderChanges.length - 1].waveState = 'error';
                    }
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
    return { savedCount: savedCount, skipCount: skipCount, modifiedCount: modifiedCount, orderChanges: orderChanges, shippedChanged: shippedChanged };
};

// 人工匯入（按按鈕選檔、或在 ERP 報表頁按「手動匯入」）：會跳視窗問件數、物流商、要不要建波次
window.importErpOrderRows = async function(rows) {
    try {
        const parsed = window.parseErpOrderRows(rows);
        if (parsed.error) { alert('❌ 無法匯入：' + parsed.error); return false; }
        const needPkg = parsed.needPkg;
        // 換算不出件數的品項：列出來請人工填，全部填好才匯入
        if (needPkg.length > 0) {
            const ok = await askPackageQty(needPkg);
            if (!ok) { alert('已取消匯入，資料沒有變動。'); return false; }
        }

        const orders = parsed.orders;

        // 新訂單認不出物流商：列出來請人工選（已經匯入過的單不再問）
        const noLogistics = orders.filter(o => o.logistics === '未指定' && !window._orderData.orders.some(x => x.orderNo === o.orderNo));
        if (noLogistics.length > 0) {
            const ok = await askLogistics(noLogistics);
            if (!ok) { alert('已取消匯入，資料沒有變動。'); return false; }
        }

        console.log('解析訂單:', orders.length, '筆');

        const r = await window.saveErpOrders(orders);
        const storeNote = parsed.storeSkipped.length ? '（門市銷貨單 ' + parsed.storeSkipped.length + ' 張不揀貨，已跳過）' : '';
        const savedCount = r.savedCount, skipCount = r.skipCount, modifiedCount = r.modifiedCount, orderChanges = r.orderChanges, shippedChanged = r.shippedChanged;

        if (modifiedCount > 0) {
            showOrderChangesAlert(orderChanges);
        }
        var shipMore = shippedChanged.filter(function(x) { return x.kind === 'more'; }), shipOver = shippedChanged.filter(function(x) { return x.kind === 'over'; });
        if (shipMore.length || shipOver.length) {
            alert((shipMore.length ? '📦 已出貨的單在鼎新加量，多的部分自動變成補出貨（會排進下一個波次）：\n' + shipMore.map(function(x) { return x.text; }).join('\n') + '\n\n' : '') +
                (shipOver.length ? '↩️ 已出貨的單在鼎新減量，已經多出貨了，請在鼎新開銷退：\n' + shipOver.map(function(x) { return x.text; }).join('\n') : ''));
        }

        renderOrderList();
        refreshWaveList();

        if (savedCount > 0) {
            var plan = planWavesByLogistics();
            var autoCreate = plan.count > 0 && confirm(
                '✅ 匯入完成！新增 ' + savedCount + ' 筆' + storeNote +
                (modifiedCount > 0 ? '、⚠️ 異動 ' + modifiedCount + ' 筆' : '') +
                (skipCount > 0 ? '、略過（沒變）' + skipCount + ' 筆' : '') + '\n\n' +
                '━━━━━━━━━━━━━━━━━━━━━━\n' +
                plan.text + '\n按「確定」就建立波次（建好可以直接印揀貨單），按「取消」先不建'
            );
            if (!autoCreate && plan.count === 0) alert('✅ 匯入完成！新增 ' + savedCount + ' 筆' + storeNote + '\n\n' + plan.text);
            if (autoCreate) {
                await autoCreateWavesByLogistics({ skipConfirm: true, offerPrint: true });
            }
        } else {
            var resultMsg = '✅ 匯入完成！' + storeNote + '\n\n' +
                  '新增：' + savedCount + ' 筆\n';
            if (modifiedCount > 0) {
                resultMsg += '⚠️ 異動：' + modifiedCount + ' 筆\n';
            }
            resultMsg += '略過（無變更）：' + skipCount + ' 筆\n' +
                  '總訂單數：' + window._orderData.orders.length + ' 筆';
            alert(resultMsg);
        }

        return true;
    } catch (err) {
        console.error('匯入失敗:', err);
        alert('❌ 匯入失敗：' + err.message);
        return false;
    }
};

window.importERPExcel = async function(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        await window.importErpOrderRows(XLSX.utils.sheet_to_json(sheet, { header: 1 }));
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

// 依物流商分組的預覽（未指定物流的單不自動排，要先指定物流商）
function planWavesByLogistics() {
    var pendingOrders = window._orderData.orders.filter(window.orderWaveable);
    var groups = {}, unassigned = [];
    pendingOrders.forEach(function(order) {
        var lg = order.logistics || '未指定';
        if (lg === '未指定') { unassigned.push(order.orderNo); return; }
        (groups[lg] = groups[lg] || []).push(order);
    });
    var keys = Object.keys(groups);
    var text = keys.length ? '將建立 ' + keys.length + ' 個波次：\n' : '沒有可以建立的波次。\n';
    keys.forEach(function(lg) {
        var totalQty = 0;
        groups[lg].forEach(function(o) { window.orderOpenItems(o).forEach(function(item) { totalQty += item.packageQty || 1; }); });
        text += '• ' + lg + '：' + groups[lg].length + ' 單 / ' + totalQty + ' 件\n';
    });
    if (unassigned.length) text += '\n⚠️ ' + unassigned.length + ' 張沒有物流商，先不排（在「建立波次」清單裡指定物流商後再排）：\n' + unassigned.slice(0, 10).join('、') + (unassigned.length > 10 ? '…' : '') + '\n';
    return { groups: groups, count: keys.length, text: text };
}

window.autoCreateWavesByLogistics = async function(opts) {
    var plan = planWavesByLogistics();
    if (plan.count === 0) {
        if (!(opts && opts.silent)) alert(plan.text);
        return { created: [], failed: [], skipped: [], unassignedText: plan.text };
    }
    var logisticsGroups = plan.groups;

    if (!(opts && opts.skipConfirm) && !confirm(plan.text + '\n確定建立嗎？')) {
        return;
    }

    var progressDiv = document.createElement('div');
    progressDiv.id = 'auto-wave-progress';
    progressDiv.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-[200]';
    progressDiv.innerHTML = '<div class="bg-slate-800 rounded-xl p-8 text-center">' +
        '<i class="fa-solid fa-spinner fa-spin text-4xl text-blue-400 mb-4"></i>' +
        '<div class="text-white text-lg" id="progress-text">建立波次中...</div>' +
        '<div class="text-slate-400 text-sm mt-2" id="progress-detail"></div></div>';
    if (!(opts && opts.silent)) document.body.appendChild(progressDiv);

    var createdWaves = [];
    var failed = [];
    var skippedAll = [];
    var totalOrders = 0;
    var totalItems = 0;
    var logisticsKeys = Object.keys(logisticsGroups);

    for (var i = 0; i < logisticsKeys.length; i++) {
        var logistics = logisticsKeys[i];
        if (!(opts && opts.silent)) {
            document.getElementById('progress-text').innerText = '建立 ' + logistics + ' 波次...';
            document.getElementById('progress-detail').innerText = (i + 1) + ' / ' + logisticsKeys.length;
        }
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

    if (!(opts && opts.silent)) document.getElementById('auto-wave-progress').remove();

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

    if (opts && opts.offerPrint && createdWaves.length) {
        var nos = createdWaves.map(function(w) { return w.waveNo; });
        var esc = function(v) { return String(v).replace(/[&<>"']/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
        WMS.createModal('modal-wave-print', {
            title: failed.length ? '⚠️ 部分波次建立失敗' : '✅ 波次建好了', icon: 'fa-solid fa-layer-group text-blue-400', width: '520px',
            content: '<pre class="text-slate-200 text-sm whitespace-pre-wrap mb-4">' + esc(resultText.replace(/^.*\n\n/, '')) + '</pre>' +
                '<button id="btn-print-new-waves" class="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-lg"><i class="fa-solid fa-print mr-2"></i>列印揀貨單（' + nos.length + ' 張）</button>' +
                '<button onclick="WMS.closeModal(\'modal-wave-print\')" class="w-full py-2 mt-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg">先不印</button>'
        });
        document.getElementById('btn-print-new-waves').onclick = function() { window.printNewWavePickingLists(nos); WMS.closeModal('modal-wave-print'); };
    } else if (!(opts && opts.silent)) alert(resultText);
    return { created: createdWaves, failed: failed, skipped: skippedAll };
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
                    if (s.exists && window.orderWaveable(s.data()) && window.orderOpenItems(s.data()).length === 0) skipped.push(withId[i].orderNo + '（沒有品項）');
                    else if (s.exists && window.orderWaveable(s.data())) ok.push(Object.assign({}, withId[i], s.data(), { id: s.id }));
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

// 取消訂單（鼎新已經取消的單）：還沒出貨才能取消；在還沒開始揀的波次裡會一起移出（波次空了就刪掉）；
// 波次已經開始揀或分貨，就不取消，請到現場處理。回傳 { cancelled: [單號], skipped: ['單號：原因'] }
window.cancelSalesOrders = async function(orderIds, reason) {
    var db = window.db, out = { cancelled: [], skipped: [] };
    var who = (window.currentUser && (window.currentUser.name || window.currentUser.email)) || '';
    for (var i = 0; i < orderIds.length; i++) {
        var oref = db.collection('salesOrders').doc(orderIds[i]);
        try {
            var no = await db.runTransaction(async function(tx) {
                var os = await tx.get(oref);
                if (!os.exists) throw new Error('找不到這張單');
                var o = os.data();
                if (o.status === 'cancelled') throw new Error('已經取消過');
                if (o.status === 'shipped' || o.status === 'partial' || Array.isArray(o.backorderItems)) throw new Error('已經出貨，請在鼎新處理');
                var wref = null, w = null;
                if (o.waveNo) {
                    wref = db.collection('waves').doc(o.waveNo);
                    var ws = await tx.get(wref);
                    if (ws.exists) {
                        w = ws.data();
                        if (w.status !== 'pending' || (w.completedItems || []).length) throw new Error('波次 ' + o.waveNo + ' 已經開始揀貨，請到現場處理');
                    }
                }
                if (w) {
                    var entries = (w.orders || []).filter(function(e) { return (e.id || e.orderId) !== oref.id && e.orderNo !== o.orderNo; });
                    if (entries.length === 0) tx.delete(wref);
                    else tx.update(wref, stripUndefined(Object.assign({ orders: entries }, waveTotals(entries), { updatedAt: new Date().toISOString() })));
                }
                tx.update(oref, { status: 'cancelled', waveNo: '', cancelReason: reason || '', cancelledBy: who, cancelledAt: new Date().toISOString() });
                return o.orderNo;
            });
            out.cancelled.push(no);
            var local = window._orderData.orders.find(function(x) { return x.id === oref.id; });
            if (local) { local.status = 'cancelled'; local.waveNo = ''; }
        } catch (e) {
            var lo = window._orderData.orders.find(function(x) { return x.id === oref.id; });
            out.skipped.push((lo ? lo.orderNo : oref.id) + '：' + e.message);
        }
    }
    return out;
};

// 訂單在鼎新被改了，波次跟著處理（同一筆交易）：
//   還沒開始揀 → 用新的品項重算波次，標記要重印 → 'updated'
//   已經開始揀（有揀貨記錄）→ 一樣重算：已經揀的照記錄不動，少的補揀、多的列「放回」，手機自動調整 → 'adjusted'
//   改版前就開始揀的舊波次（沒有揀貨記錄）→ 不改數量，記下要現場處理 → 'started'
//   波次已完成或不存在 → 'done' / 'none'
// note：給現場看的一句話，例如「SO-2 透抽 L 5→3」
window.syncOrderIntoWave = async function(order, note) {
    var db = window.db;
    var wref = db.collection('waves').doc(order.waveNo);
    var FV = firebase.firestore.FieldValue;
    var state = await db.runTransaction(async function(tx) {
        var ws = await tx.get(wref);
        if (!ws.exists) return 'none';
        var w = ws.data();
        if (w.status === 'done') return 'done';
        var started = w.status !== 'pending' || (w.completedItems || []).length > 0;
        if (started && !window.waveHasPickLog(w)) {
            tx.update(wref, { hasOrderChanges: true, changedOrders: FV.arrayUnion(order.orderNo) });
            return 'started';
        }
        var entries = (w.orders || []).map(function(e) {
            return ((e.id || e.orderId) === order.id || e.orderNo === order.orderNo) ? waveOrderEntry(order) : e;
        });
        var data = stripUndefined(Object.assign({ orders: entries }, waveTotals(entries), { updatedAt: new Date().toISOString(), reprintRequired: true }));
        if (started) {
            data.changeNotes = FV.arrayUnion(note || order.orderNo);   // 手機上方的提醒
            if (w.status === 'sorting') data.status = 'picking';        // 可能要補揀或放回
        }
        tx.update(wref, data);
        return started ? 'adjusted' : 'updated';
    });
    var local = (window._waveData.waves || []).find(function(w) { return w.waveNo === order.waveNo; });
    if (local && state === 'started') {
        local.hasOrderChanges = true;
        local.changedOrders = local.changedOrders || [];
        if (local.changedOrders.indexOf(order.orderNo) < 0) local.changedOrders.push(order.orderNo);
    }
    return state;
};

// 已經出過貨的單（全部或部分），鼎新又改了：
//   已出貨件數＝原本的件數－還欠的件數；新數量比已出貨多 → 多的變成欠貨（補出貨，會自動排下一個波次）
//   新數量比已出貨少 → 已經多出貨了，要在鼎新開銷退
window.recomputeShippedOrder = function(existing, newItems) {
    var key = function(it) { return it.productName + '|||' + (it.spec || ''); };
    var pkg = function(it) { return parseFloat(it.packageQty) || 1; };
    var back = {};
    if (Array.isArray(existing.backorderItems)) existing.backorderItems.forEach(function(it) { back[key(it)] = (back[key(it)] || 0) + pkg(it); });
    // 缺貨少出（這次不出、請業務改鼎新）：實際出貨＝原本件數－少出的
    var shortBy = {};
    (existing.shortShipped || []).forEach(function(x) { var k = x.productName + '|||' + (x.spec || ''); shortBy[k] = (shortBy[k] || 0) + (parseFloat(x.short) || 0); });
    var shipped = {}, names = {}, origQty = {};
    (existing.items || []).forEach(function(it) {
        var k = key(it); names[k] = it; origQty[k] = (origQty[k] || 0) + pkg(it);
        var s = Array.isArray(existing.backorderItems) ? pkg(it) - (back[k] || 0) : (existing.status === 'shipped' ? pkg(it) : 0);
        shipped[k] = (shipped[k] || 0) + Math.max(0, s);
    });
    Object.keys(shortBy).forEach(function(k) { if (shipped[k] != null) shipped[k] = Math.max(0, shipped[k] - shortBy[k]); });
    var open = [], more = [], over = [];
    var seen = {};
    (newItems || []).forEach(function(it) {
        var k = key(it); seen[k] = true;
        // 缺貨少出的品項，鼎新還沒改（還是原本的件數）：等業務改，不要變成補出貨
        if (shortBy[k] && pkg(it) === origQty[k]) return;
        var need = pkg(it) - (shipped[k] || 0);
        if (need > 0) {
            var b = Object.assign({}, it, { packageQty: need });
            if (parseFloat(it.quantity) > 0) b.quantity = Math.round(parseFloat(it.quantity) * need / pkg(it) * 100) / 100;
            open.push(JSON.parse(JSON.stringify(b)));
            var wasOpen = back[k] || 0;
            if (need > wasOpen) more.push(it.productName + (it.spec ? ' ' + it.spec : '') + ' +' + (need - wasOpen));
        } else if (need < 0) {
            over.push(it.productName + (it.spec ? ' ' + it.spec : '') + ' 多出 ' + (-need) + ' 件');
        }
    });
    Object.keys(shipped).forEach(function(k) {
        if (!seen[k] && shipped[k] > 0) over.push(names[k].productName + (names[k].spec ? ' ' + names[k].spec : '') + ' 多出 ' + shipped[k] + ' 件');
    });
    // 鼎新已經改成實際出貨的件數（或更少）：不用再提醒改鼎新
    var fixed = Object.keys(shortBy).every(function(k) {
        var n = (newItems || []).filter(function(it) { return key(it) === k; }).reduce(function(t, it) { return t + pkg(it); }, 0);
        return n <= (shipped[k] || 0);
    });
    return { open: open, more: more, over: over, erpFixed: Object.keys(shortBy).length > 0 && fixed };
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

    const justStarted = wave.status === 'pending';
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

    // 按「開始揀貨」：直接打開揀貨單列印預覽（之後要重印，按畫面上的「列印揀貨單」）
    if (justStarted && window.printPickingList) window.printPickingList();

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
    list.forEach((item, idx) => {
        const statusIcon = item.completed ?
            '<i class="fa-solid fa-check-circle text-green-500 text-lg"></i>' :
            (item.shortage ?
                '<i class="fa-solid fa-exclamation-triangle text-red-500 text-lg"></i>' :
                item.practice ?
                `<button onclick="confirmWaveItemAt(${idx})" class="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-2 py-1 rounded">${item.type === 'return' ? '放回了' : '✓ 拿好了'}</button>` :
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

    const found = list.find(i => !i.completed && !i.shortage && !i.practice &&
        (i.palletId === scanned || i.palletId.toUpperCase() === scanned ||
         i.locationId === scanned || i.locationId.toUpperCase() === scanned));

    if (!found) {
        result.className = 'mt-2 text-sm p-2 rounded bg-red-900/50 text-red-300';
        result.innerText = '❌ 找不到匹配項目：' + scanned;
        result.classList.remove('hidden');
        input.select();
        return;
    }
    await markWaveItemPicked(found);
};

// 練習模式：照訂單揀的那一行沒有板號，在清單上按 ✓
window.confirmWaveItemAt = async function(idx) {
    const found = window._waveData.pickingList[idx];
    if (found && !found.completed && !found.shortage) await markWaveItemPicked(found);
};

async function markWaveItemPicked(found) {
    const input = document.getElementById('wave-scan-input');
    const result = document.getElementById('wave-scan-result');
    found.completed = true;

    const wave = window._waveData.currentWave;
    if (!wave.completedItems) wave.completedItems = [];
    wave.completedItems.push(found.id);
    wave.pickLog = (wave.pickLog || []).concat([window.pickLogEntry(found)]);

    if (wave.id) {
        try {
            // arrayUnion：手機與電腦同時揀貨時不會互相覆蓋進度
            await window.updateDoc(window.doc(window.db, 'waves', wave.id), {
                completedItems: firebase.firestore.FieldValue.arrayUnion(found.id),
                pickLog: firebase.firestore.FieldValue.arrayUnion(window.pickLogEntry(found)),
                status: 'picking'
            });
        } catch (err) {
            console.error('更新進度失敗:', err);
        }
    }

    saveWaves();

    result.className = 'mt-2 text-sm p-2 rounded bg-green-900/50 text-green-300';
    result.innerText = (found.type === 'return' ? '↩️ 已放回 ' : '✅ ') + found.locationId + ' → ' + found.productName + ' x ' + found.pickQty;
    result.classList.remove('hidden');

    renderPickingListV2();
    updateWaveProgress();

    input.value = '';
    input.focus();
}

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
    let list = window._waveData.pickingList;

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
            if (Array.isArray(fresh.pickLog) && fresh.pickLog.length) {
                // 有揀貨記錄：用最新的波次重算清單（手機掃過的、鼎新改單自動調整的都算進來）
                Object.assign(wave, fresh);
                generatePickingListV2(wave);
                list = window._waveData.pickingList;
            } else {
                // 舊波次：照舊，把其他裝置打勾的項目併進來
                const doneIds = fresh.completedItems || [];
                wave.completedItems = doneIds;
                list.forEach(i => { if (doneIds.indexOf(i.id) >= 0) i.completed = true; });
                renderPickingListV2();
                updateWaveProgress();
            }
        } catch (err) {
            alert('❌ 讀取波次最新進度失敗：' + err.message);
            return;
        }
    }

    const completed = list.filter(i => i.completed).length;
    const total = list.filter(i => !i.shortage).length;

    if (completed === 0 && !list.some(i => i.fieldShort)) {
        alert('尚未揀貨任何項目');
        return;
    }

    // 未揀的項目併在下面同一個確認裡說明（原本要按兩次）
    const shortN = list.filter(i => i.shortage || !i.completed).length;
    const shorts = window.waveShortfalls(wave, list);
    const shortText = shorts.length ? '\n\n⚠️ 這些客戶會少出（分貨標籤要改）：\n' + shorts.map(x => '・' + x.customer + '（' + x.orderNo + '）' + x.productName + ' ' + (x.spec || '') + '：訂 ' + x.want + '，只出 ' + x.got).join('\n') : '';
    if (!confirm(`確定完成波次 ${wave.waveNo}？\n\n已揀：${completed}/${total} 項` + (shortN ? `\n缺貨／未揀 ${shortN} 項：相關訂單會標為「部分出貨」，缺的貨之後可以再排波次` : '') + shortText)) {
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

    alert('✅ 波次 ' + wave.waveNo + ' 已完成！' + (window.isPracticeMode() ? '（練習模式：庫存沒有扣）' : '') + '\n\n全部出貨：' + nShip + ' 單' +
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
    window.watchLabelPrintMode(renderLabelModeToggle);
    window.watchProductHomes();
    window.watchLogisticsList();
    startAutoLabelPrinter();
    window.watchPracticeMode(function() {
        renderPracticeToggle();
        // 揀貨畫面開著：清單馬上照新模式重算
        const modal = document.getElementById('modal-wave-execute');
        if (modal && !modal.classList.contains('hidden') && window._waveData.currentWave) generatePickingListV2(window._waveData.currentWave);
    });
});

// ---------- 分貨標籤誰來印（主管切換）：手機印／辦公室自動印 ----------
function isThisLabelPrinter() { try { return localStorage.getItem('wms_autoLabelPrinter') === '1'; } catch (e) { return false; } }
function renderLabelModeToggle() {
    const btn = document.getElementById('btn-label-mode');
    if (!btn) return;
    const office = window.labelPrintMode() === 'office';
    const r = window.currentUser && window.currentUser.role;
    const sup = r === 'admin' || r === 'supervisor';
    btn.style.display = '';
    btn.disabled = !sup;
    btn.className = 'px-3 py-2 rounded-lg font-bold mr-2 text-sm ' + (office ? 'bg-sky-700 text-white' : 'bg-slate-700 text-slate-200 hover:bg-slate-600');
    btn.innerHTML = '🏷️ 標籤：' + (office ? '辦公室自動印' : '手機印');
    btn.title = office ? '手機完成波次後，勾了「這台電腦自動印標籤」的電腦會自動印出分貨標籤' : '手機完成波次後，在手機上按「印分貨標籤」直接印';
    const wrap = document.getElementById('auto-label-wrap');
    if (wrap) wrap.style.display = office ? '' : 'none';
    const chk = document.getElementById('chk-auto-label');
    if (chk) chk.checked = isThisLabelPrinter();
}
window.toggleLabelPrintMode = async function() {
    const office = window.labelPrintMode() !== 'office';
    if (!confirm(office
        ? '改成「辦公室自動印標籤」？\n\n手機完成波次後，辦公室那台電腦會自動印出分貨標籤（件數是實際出貨的）。\n請在要負責印的那台電腦勾「這台電腦自動印標籤」，並保持開著。'
        : '改回「手機印標籤」？\n\n手機完成波次後，在手機上按「印分貨標籤」直接印。')) return;
    try { await window.db.collection('settings').doc('labelPrint').set({ mode: office ? 'office' : 'phone', updatedAt: new Date().toISOString() }); }
    catch (e) { alert('❌ 切換失敗：' + e.message); }
};
window.setAutoLabelMachine = function(on) {
    try { localStorage.setItem('wms_autoLabelPrinter', on ? '1' : '0'); } catch (e) {}
    if (on) alert('✅ 這台電腦會自動印分貨標籤\n\n要完全不用按「列印」：Chrome 捷徑的「目標」最後加上  --kiosk-printing（前面空一格），再用這個捷徑打開 Chrome。\n沒加的話會跳出列印視窗，按一下「列印」就好。');
};
// 辦公室自動印：只印這台電腦打開之後才完成的波次；多台電腦都勾了也只會印一次（先搶到的印）
function startAutoLabelPrinter() {
    const since = new Date().toISOString();
    window.db.collection('waves').where('completedAt', '>=', since).onSnapshot(function(snap) {
        if (window.labelPrintMode() !== 'office' || !isThisLabelPrinter()) return;
        snap.docChanges().forEach(function(ch) {
            const w = Object.assign({ id: ch.doc.id }, ch.doc.data());
            if (w.status !== 'done' || w.labelAutoPrintedAt || w.labelsPrintedAt) return;
            if (!window.waveNeedsLabels(w)) return;   // 大榮、黑貓、新竹貼托運單，不印
            autoPrintWaveLabels(w).catch(function(e) { console.warn('自動印標籤失敗', e); });
        });
    }, function(e) { console.warn('自動印標籤監聽失敗', e); });
}
async function autoPrintWaveLabels(w) {
    const ref = window.db.collection('waves').doc(w.id);
    const me = window.currentUser ? (window.currentUser.name || window.currentUser.email || '') : '';
    const mine = await window.db.runTransaction(async function(tx) {
        const d = (await tx.get(ref)).data();
        if (!d || d.labelAutoPrintedAt || d.labelsPrintedAt) return false;
        tx.update(ref, { labelAutoPrintedAt: new Date().toISOString(), labelAutoPrintedBy: me, labelsPrintedAt: new Date().toISOString(), labelsPrintedOn: 'office' });
        return true;
    });
    if (!mine) return;
    const lb = window.buildSortingLabelsHtml(w);
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    f.className = 'auto-label-frame';
    document.body.appendChild(f);
    f.contentDocument.open();
    f.contentDocument.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>分貨標籤 ' + w.waveNo + '</title><style>body{font-family:"Microsoft JhengHei",sans-serif;margin:0}' + window.sortingLabelsPrintCss(lb) + '</style></head><body>' + lb.body + '</body></html>');
    f.contentDocument.close();
    if (window.showToast) window.showToast('🏷️ 自動印分貨標籤：' + w.waveNo + '（' + (w.orders || []).length + ' 張）');
    setTimeout(function() { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { console.warn(e); } setTimeout(function() { f.remove(); }, 60000); }, 300);
}

// ---------- 商品在哪一間倉庫（揀貨時自動記住；這裡可以改）----------
window.openProductHomes = async function() {
    const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    let rows = [];
    try {
        const snap = await window.db.collection('productHome').get();
        snap.forEach(function(d) { rows.push(Object.assign({ id: d.id }, d.data())); });
    } catch (e) { alert('❌ 讀取失敗：' + e.message); return; }
    rows.sort(function(a, b) { return (a.productName || '').localeCompare(b.productName || '', 'zh-TW') || (a.spec || '').localeCompare(b.spec || ''); });
    const r = window.currentUser && window.currentUser.role;
    const sup = r === 'admin' || r === 'supervisor';
    let m = document.getElementById('modal-product-homes');
    if (!m) {
        m = document.createElement('div');
        m.id = 'modal-product-homes';
        m.className = 'fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4';
        document.body.appendChild(m);
    }
    const opts = function(cur) { return window.PICK_HOUSES.map(function(h) { return '<option value="' + h.id + '"' + (h.id === cur ? ' selected' : '') + '>' + h.name + '</option>'; }).join(''); };
    m.innerHTML = '<div class="bg-slate-800 rounded-xl p-5 w-full max-w-2xl max-h-[85vh] flex flex-col">' +
        '<div class="flex justify-between items-center mb-2"><h3 class="text-white text-lg font-bold">📍 商品在哪一間（' + rows.length + ' 項）</h3>' +
        '<button onclick="document.getElementById(\'modal-product-homes\').remove()" class="text-slate-400 hover:text-white text-2xl">&times;</button></div>' +
        '<p class="text-slate-400 text-sm mb-2">揀貨時自動記住：在哪一間按「拿好了」就記那一間；這間一件都沒有，就記成另一間。記錯了在這裡改。</p>' +
        '<input id="ph-search" oninput="filterProductHomes()" placeholder="搜尋品名、規格" class="w-full bg-slate-900 text-white rounded px-3 py-2 mb-2 border border-slate-600">' +
        '<div class="overflow-y-auto flex-1"><table class="w-full text-sm"><tbody id="ph-body">' +
        (rows.length ? rows.map(function(x) {
            return '<tr class="border-b border-slate-700" data-s="' + esc((x.productName || '') + ' ' + (x.spec || '')) + '">' +
                '<td class="p-2 text-white">' + esc(x.productName) + ' <span class="text-yellow-400">' + esc(x.spec || '') + '</span></td>' +
                '<td class="p-2"><select class="bg-slate-900 text-white rounded px-2 py-1 border border-slate-600" data-id="' + esc(x.id) + '" onchange="changeProductHome(this)">' + opts(x.house) + '</select></td>' +
                '<td class="p-2 text-slate-400 text-xs">' + esc(x.by || '') + ' ' + esc(String(x.at || '').slice(0, 10)) + '</td>' +
                '<td class="p-2">' + (sup ? '<button class="text-red-400 hover:bg-red-500/20 rounded px-2" data-id="' + esc(x.id) + '" onclick="deleteProductHome(this)" title="刪掉：下次揀貨兩間都會出現，重新記">🗑️</button>' : '') + '</td></tr>';
        }).join('') : '<tr><td class="p-6 text-center text-slate-500">還沒有記錄。手機揀貨時按「拿好了」就會自動記起來。</td></tr>') +
        '</tbody></table></div></div>';
    window._productHomeRows = rows;
};
window.filterProductHomes = function() {
    const terms = window.searchTerms(document.getElementById('ph-search').value);
    document.querySelectorAll('#ph-body tr[data-s]').forEach(function(tr) { tr.style.display = !terms.length || window.searchMatch(terms, [tr.dataset.s]) ? '' : 'none'; });
};
window.changeProductHome = async function(sel) {
    const x = (window._productHomeRows || []).find(function(r) { return r.id === sel.dataset.id; });
    if (!x) return;
    try { await window.setProductHome(x, sel.value); x.house = sel.value; if (window.showToast) window.showToast('✅ ' + x.productName + ' 改成 ' + window.houseName(sel.value)); }
    catch (e) { alert('❌ 儲存失敗：' + e.message); sel.value = x.house; }
};
window.deleteProductHome = async function(btn) {
    const x = (window._productHomeRows || []).find(function(r) { return r.id === btn.dataset.id; });
    if (!x || !confirm('刪掉「' + x.productName + ' ' + (x.spec || '') + '」在哪一間的記錄？\n\n下次揀貨兩間的手機都會出現，拿到的那間會重新記起來。')) return;
    try { await window.db.collection('productHome').doc(x.id).delete(); btn.closest('tr').remove(); }
    catch (e) { alert('❌ 刪除失敗：' + e.message); }
};

// ---------- 練習模式開關（主管）----------
function renderPracticeToggle() {
    const btn = document.getElementById('btn-practice-mode');
    if (!btn) return;
    const on = window.isPracticeMode();
    const r = window.currentUser && window.currentUser.role;
    btn.style.display = (on || r === 'admin' || r === 'supervisor') ? '' : 'none';
    btn.disabled = !(r === 'admin' || r === 'supervisor');
    btn.className = 'px-3 py-2 rounded-lg font-bold mr-2 text-sm ' + (on ? 'bg-violet-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600');
    btn.innerHTML = '📝 練習模式：' + (on ? '開' : '關');
    const badge = document.getElementById('practice-badge');
    if (badge) badge.style.display = on ? '' : 'none';
    btn.title = '練習模式：揀貨單照訂單數量列出（不看庫存、不標缺貨），完成波次不扣庫存';
}
window.togglePracticeMode = async function() {
    const on = !window.isPracticeMode();
    const msg = on
        ? '打開練習模式？\n\n・揀貨單照訂單數量列出，不看庫存、不標「庫存不足」\n・完成波次不扣庫存（訂單照常標記出貨）\n・波次、分貨標籤、看板照常\n\n還沒有儲位、庫存還不準的時候用。'
        : '關掉練習模式？\n\n之後揀貨單會照庫存分配棧板，完成波次會扣庫存。\n請先確定庫存已經盤點、匯入正確的儲位。\n\n已經照訂單揀的項目不會重算。';
    if (!confirm(msg)) return;
    try {
        await window.db.collection('settings').doc('practice').set({
            enabled: on, updatedAt: new Date().toISOString(),
            updatedBy: window.currentUser ? (window.currentUser.name || window.currentUser.email || '') : ''
        });
    } catch (e) { alert('❌ 切換失敗：' + e.message); return; }
    // 剛打開：最近一份批號庫存表如果在練習模式關著時收到（只存檔），重新處理一次，練習庫存馬上是鼎新的數字
    if (on) {
        try {
            const snap = await window.db.collection('erpInbox').where('sensitive', '==', false).where('type', '==', 'batch_daily').get();
            const last = snap.docs.sort((a, b) => String(b.data().receivedAt).localeCompare(String(a.data().receivedAt)))[0];
            if (last && last.data().status === 'stored') await last.ref.update({ status: 'pending' });
        } catch (e) { console.warn('重新處理批號庫存表失敗', e); }
    }
};

console.log('✅ 波次理貨升級版載入完成');

