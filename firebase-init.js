// ============================================================
// firebase-init.js - Firebase 初始化 (compat 版本)
// 從原始 ES module 手動轉換
// ============================================================

// Firebase 配置（js/shared/firebase-config.js）
const firebaseConfig = window.FIREBASE_CONFIG;

// 初始化
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// 第二個 App（管理其他用戶用）
const secondaryApp = firebase.initializeApp(firebaseConfig, "SecondaryApp");
const secondaryAuth = secondaryApp.auth();
window.secondaryAuth = secondaryAuth;

// 暴露 Auth 函數
window.sendPasswordResetEmail = function(a, e) { return a.sendPasswordResetEmail(e); };
window.createUserWithEmailAndPassword = function(a, e, p) { return a.createUserWithEmailAndPassword(e, p); };
window.fetchSignInMethodsForEmail = function(a, e) { return a.fetchSignInMethodsForEmail(e); };
window.auth = auth;
window.db = db;

// Firestore 包裝函數
window.collection = function(d, n) { return d.collection(n); };
window.doc = function(a, b, c) { 
    if (c !== undefined) return a.collection(b).doc(c);
    return a.doc(b);
};
window.addDoc = function(r, d) { return r.add(normalizeForWrite(r, d)); };
window.getDoc = function(r) { return r.get(); };
window.setDoc = function(r, d, o) { return r.set(normalizeForWrite(r, d), o || {}); };
window.getDocs = function(r) { return r.get(); };
window.updateDoc = function(r, d) { return r.update(d); };
window.deleteDoc = function(r) { return r.delete(); };
window.writeBatch = function(d) { return d.batch(); };
// 將 where / orderBy / limit 條件真正套用到 compat 查詢上
// （舊版直接回傳 r，所有條件都被忽略，會讀到整個 collection）
window.query = function(r) {
    var q = r;
    for (var i = 1; i < arguments.length; i++) {
        var c = arguments[i];
        if (!c) continue;
        if (c._t === 'w') {
            if (c.v === undefined) throw new Error('查詢條件 ' + c.f + ' 的值是 undefined');
            q = q.where(c.f, c.o, c.v);
        } else if (c._t === 'o') {
            q = q.orderBy(c.f, c.d || 'asc');
        } else if (c._t === 'l') {
            q = q.limit(c.n);
        } else {
            throw new Error('不支援的查詢條件');
        }
    }
    return q;
};
window.where = function(f, o, v) { return { _t: 'w', f: f, o: o, v: v }; };
window.orderBy = function(f, d) { return { _t: 'o', f: f, d: d }; };
window.limit = function(n) { return { _t: 'l', n: n }; };
window.onSnapshot = function(r, c) { return r.onSnapshot(c); };
window.serverTimestamp = function() { return firebase.firestore.FieldValue.serverTimestamp(); };

// 儲位格式工具
window.formatLocationId = function(zone, row, level) {
    var rowStr = row < 10 ? '0' + row : '' + row;
    return zone + '-' + rowStr + '-' + level;
};

window.parseLocationId = function(locId) {
    if (!locId || locId.startsWith('V-') || locId.startsWith('O-')) return null;
    var parts = locId.split('-');
    if (parts.length < 3) return null;
    var warehouse = parts[0];
    var zoneChar = parts[1];
    var rowStr = parts[2];
    var level = parts[3] || '';
    var row = parseInt(rowStr) || 0;
    return {
        warehouse: warehouse,
        zoneChar: zoneChar,
        row: row,
        level: level,
        zone: warehouse + '-' + zoneChar,
        laneKey: warehouse + '-' + zoneChar + '-' + (row < 10 ? '0' + row : row)
    };
};

// 登入成功後才執行的初始化（安全規則要求登入才能讀資料，所以不能在開頁時就載入）
window._loginHooks = [];
window._loggedIn = false;
window.onLogin = function(fn) {
    window._loginHooks.push(fn);
    if (window._loggedIn) {
        try { fn(); } catch (e) { console.error('登入後初始化失敗:', e); }
    }
};

// 認證狀態監聽
auth.onAuthStateChanged(async function(user) {
    if (user) {
        // 先確認帳號已開通且未停用，才進入系統並開始監聽資料
        if (window.setCurrentUser) {
            var appUser = await window.setCurrentUser(user.email);
            if (!appUser) return;
        }
        if (window.warmDocNoPools) window.warmDocNoPools();
        document.getElementById('login-error').classList.add('hidden');
        document.getElementById('view-login').classList.add('hidden');
        initAllListeners();
        window._loggedIn = true;
        window._loginHooks.forEach(function(fn) {
            try { fn(); } catch (e) { console.error('登入後初始化失敗:', e); }
        });
    } else {
        document.getElementById('view-login').classList.remove('hidden');
        window.currentUser = null;
    }
});

// 登入
window.loginSystem = async function() {
    var errorEl = document.getElementById('login-error');
    errorEl.classList.add('hidden');
    try {
        await auth.signInWithEmailAndPassword(
            document.getElementById('login-email').value,
            document.getElementById('login-pwd').value
        );
    } catch (err) {
        var msg = '登入失敗';
        if (err.code === 'auth/user-not-found') msg = '帳號不存在';
        else if (err.code === 'auth/wrong-password') msg = '密碼錯誤';
        else if (err.code === 'auth/invalid-email') msg = 'Email 格式錯誤';
        else if (err.code === 'auth/too-many-requests') msg = '嘗試次數過多';
        else if (err.code === 'auth/invalid-credential') msg = '帳號或密碼錯誤';
        errorEl.innerText = msg;
        errorEl.classList.remove('hidden');
    }
};

// 登出
window.logoutSystem = function() { auth.signOut(); location.reload(); };

// 全域變數
let currentInventory = [];

// 資料監聽
function initAllListeners() {
    // 監聽 pallets
    db.collection("pallets").onSnapshot(function(snapshot) {
        currentInventory = [];
        var tbody = document.getElementById('inventory-list-body');
        if (tbody) tbody.innerHTML = '';
        var stats = { total: 0, fg: 0, ret: 0, virt: 0, chart: { raw: 0, fg: 0, wip: 0 } };
        var inventoryList = [];

        snapshot.forEach(function(d) {
            var data = window.normalizeStockRecord(d.data());
            if (data.quantity > 0 || data.totalWeight > 0) {
                var item = Object.assign({ id: d.id }, data);
                currentInventory.push(item);
                inventoryList.push(item);
                stats.total++;
                if (data.category === 'FG') { stats.fg++; stats.chart.fg++; }
                else if (data.category === 'WIP') { stats.chart.wip++; }
                else { stats.chart.raw++; }
                if (data.source === 'Factory_Return') stats.ret++;
                if (data.locationId && data.locationId.startsWith('V-')) stats.virt++;
            }
        });

        // 排序
        inventoryList = window.sortByProductGroup ? window.sortByProductGroup(inventoryList) : inventoryList;

        // 渲染表格
        inventoryList.forEach(function(data) {
            var badge = '<span class="badge badge-green">原料</span>';
            if (data.category === 'FG') badge = '<span class="badge badge-purple">成品</span>';
            if (data.category === 'WIP') badge = '<span class="badge badge-yellow">半成品</span>';
            if (data.source === 'Factory_Return') badge = '<span class="badge badge-orange">餘料</span>';

            if (tbody) {
                var weightDisplay = '-';
                if (data.productType === 'variable' && data.totalWeight > 0) {
                    weightDisplay = '<span class="text-amber-400">' + data.totalWeight + ' kg</span>';
                } else if (data.unitWeight > 0) {
                    weightDisplay = '<span class="text-slate-400">@' + data.unitWeight + ' kg</span>';
                } else if (data.totalWeight > 0) {
                    weightDisplay = '<span class="text-amber-400">' + data.totalWeight + ' kg</span>';
                }

                var expDisplay = '-';
                var expClass = 'text-slate-400';
                if (data.expiryDate) {
                    var expDate = data.expiryDate.toDate ? data.expiryDate.toDate() : new Date(data.expiryDate);
                    var today = new Date();
                    var diffDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
                    expDisplay = expDate.toLocaleDateString('zh-TW');
                    if (diffDays < 0) expClass = 'text-red-500 font-bold';
                    else if (diffDays < 30) expClass = 'text-red-400';
                    else if (diffDays < 90) expClass = 'text-yellow-400';
                }

                // 寄庫資訊
                var locationId = data.locationId || '';
                var consignedQty = 0;
                var consignCustomers = [];
                if (window.consignmentData && Array.isArray(window.consignmentData) && locationId) {
                    window.consignmentData.forEach(function(c) {
                        if (c.status !== 'active') return;
                        if (c.locationId && c.locationId === locationId) {
                            consignedQty += (c.remainingQty || 0);
                            if (c.customer && consignCustomers.indexOf(c.customer) === -1) {
                                consignCustomers.push(c.customer);
                            }
                        }
                    });
                }

                var customerDisplay = (consignCustomers.length > 0 && consignedQty > 0) 
                    ? '<span class="text-amber-400">' + consignCustomers.join(', ') + ' (' + consignedQty + ')</span>'
                    : '<span class="text-slate-600">-</span>';

                var companyClass = data.company === '八方' ? 'bg-purple-900/50 text-purple-300' : 'bg-blue-900/50 text-blue-300';
                tbody.innerHTML += '<tr class="border-b border-slate-700 hover:bg-slate-800" data-company="' + (data.company || '') + '" data-type="internal">' +
                    '<td class="p-2 text-left"><span class="px-1.5 py-0.5 rounded text-xs ' + companyClass + '">' + (data.company || '崇文') + '</span></td>' +
                    '<td class="text-left text-white p-2">' + data.productName + '</td>' +
                    '<td class="text-left text-yellow-400 p-2">' + (data.spec || '-') + '</td>' +
                    '<td class="text-left text-slate-400 font-mono p-2">' + (data.batchNo || '-') + '</td>' +
                    '<td class="text-right text-white p-2">' + (data.quantity || '-') + '</td>' +
                    '<td class="text-right p-2">' + weightDisplay + '</td>' +
                    '<td class="text-left p-2 text-cyan-400 font-mono">' + data.locationId + '</td>' +
                    '<td class="text-left p-2 ' + expClass + '">' + expDisplay + '</td>' +
                    '<td class="text-left p-2 text-sm">' + customerDisplay + '</td>' +
                    '<td class="p-2 text-right">' +
                    '<button onclick="editPallet(\'' + data.id + '\')" class="text-blue-400 hover:text-blue-300 mr-2" title="編輯"><i class="fa-solid fa-edit"></i></button>' +
                    '<button onclick="deletePallet(\'' + data.id + '\')" class="text-red-500 hover:bg-red-500/20 rounded px-2" title="刪除"><i class="fa-solid fa-trash"></i></button>' +
                    '</td></tr>';
            }
        });

        // 更新 KPI
        if (document.getElementById('kpi-total-pallets')) {
            document.getElementById('kpi-total-pallets').innerText = stats.total;
            var fgEl = document.getElementById('kpi-fg-count');
            var retEl = document.getElementById('kpi-return-count');
            if (fgEl) fgEl.innerText = stats.fg;
            if (retEl) retEl.innerText = stats.ret;
            if (window.updateChart) window.updateChart(stats.chart);
        }
        if (window.updateDashboardStats) window.updateDashboardStats(currentInventory);
        if (window.renderAllMaps) window.renderAllMaps();
        if (typeof loadVirtualLocationCounts === 'function') loadVirtualLocationCounts();

        if (!window._expiryAlertChecked) {
            window._expiryAlertChecked = true;
            setTimeout(function() { if (window.checkExpiryAlert) window.checkExpiryAlert(); }, 1500);
        }
    });

            // 刷新庫存表格以顯示寄庫資訊
            window.refreshInventoryTableWithConsignment = function() {
                const tbody = document.getElementById('inventory-list-body');
                if (!tbody) return;
                
                const inventory = window.currentInventory ? window.currentInventory() : [];
                if (inventory.length === 0) return;
                
                console.log('🔄 重新渲染庫存表格，consignmentData:', window.consignmentData?.length || 0, '筆');
                
                tbody.innerHTML = '';
                
                // 排序：使用通用排序函數（相同品項排在一起）
                var inventoryList = window.sortByProductGroup ? window.sortByProductGroup([...inventory]) : [...inventory];
                
                inventoryList.forEach(function(data) {
                    var weightDisplay = '-';
                    if (data.productType === 'variable' && data.totalWeight > 0) {
                        weightDisplay = '<span class="text-amber-400">' + data.totalWeight + ' kg</span>';
                    } else if (data.unitWeight > 0) {
                        weightDisplay = '<span class="text-slate-400">@' + data.unitWeight + ' kg</span>';
                    } else if (data.totalWeight > 0) {
                        weightDisplay = '<span class="text-amber-400">' + data.totalWeight + ' kg</span>';
                    }
                    
                    var expDisplay = '-';
                    var expClass = 'text-slate-400';
                    if (data.expiryDate) {
                        var expDate = data.expiryDate.toDate ? data.expiryDate.toDate() : new Date(data.expiryDate);
                        expDisplay = expDate.toLocaleDateString('zh-TW');
                        var daysLeft = Math.ceil((expDate - new Date()) / (1000 * 60 * 60 * 24));
                        if (daysLeft < 0) {
                            expClass = 'text-red-400 font-bold';
                        } else if (daysLeft <= 30) {
                            expClass = 'text-yellow-400';
                        }
                    }
                    
                    // 檢查是否有寄庫
                    var locationId = data.locationId || '';
                    var consignedQty = 0;
                    var consignCustomers = [];
                    
                    if (window.consignmentData && Array.isArray(window.consignmentData) && locationId) {
                        window.consignmentData.forEach(function(c) {
                            if (c.status !== 'active') return;
                            if (c.locationId && c.locationId === locationId) {
                                consignedQty += (c.remainingQty || 0);
                                if (c.customer && consignCustomers.indexOf(c.customer) === -1) {
                                    consignCustomers.push(c.customer);
                                }
                            }
                        });
                    }
                    
                    var customerDisplay;
                    if (consignCustomers.length > 0 && consignedQty > 0) {
                        customerDisplay = '<span class="text-amber-400">' + consignCustomers.join(', ') + ' (' + consignedQty + ')</span>';
                    } else {
                        customerDisplay = '<span class="text-slate-600">-</span>';
                    }
                    
                    tbody.innerHTML += '<tr class="border-b border-slate-700 hover:bg-slate-800" data-company="' + (data.company || '') + '" data-type="internal"><td class="p-2 text-left"><span class="px-1.5 py-0.5 rounded text-xs ' + (data.company === '八方' ? 'bg-purple-900/50 text-purple-300' : 'bg-blue-900/50 text-blue-300') + '">' + (data.company || '崇文') + '</span></td><td class="text-left text-white p-2">' + data.productName + '</td><td class="text-left text-yellow-400 p-2">' + (data.spec||'-') + '</td><td class="text-left text-slate-400 font-mono p-2">' + (data.batchNo||'-') + '</td><td class="text-right text-white p-2">' + (data.quantity||'-') + '</td><td class="text-right p-2">' + weightDisplay + '</td><td class="text-left p-2 text-cyan-400 font-mono">' + data.locationId + '</td><td class="text-left p-2 ' + expClass + '">' + expDisplay + '</td><td class="text-left p-2 text-sm">' + customerDisplay + '</td><td class="p-2 text-right"><button onclick="editPallet(\'' + data.id + '\')" class="text-blue-400 hover:text-blue-300 mr-2" title="編輯"><i class="fa-solid fa-edit"></i></button><button onclick="deletePallet(\'' + data.id + '\')" class="text-red-500 hover:bg-red-500/20 rounded px-2" title="刪除"><i class="fa-solid fa-trash"></i></button></td></tr>';
                });
                
                console.log('✅ 庫存表格已重新渲染');
            };

            if (window.updateApprovalCount) updateApprovalCount();
            if (window.updatePendingInboundCount) updatePendingInboundCount();
        }
        let myChart = null;
        let companyChart = null;
        let expiryChart = null;

        function updateChart(data) {
            const ctx = document.getElementById('stockChart'); if(!ctx) return;
            const chartConfig = {
                type: 'doughnut',
                data: {
                    labels: ['原料', '成品', '半成品'],
                    datasets: [{
                        data: [data.raw, data.fg, data.wip],
                        backgroundColor: ['#10b981', '#a855f7', '#facc15'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { position: 'bottom', labels: { color: 'white', boxWidth: 12, padding: 8, font: { size: 11 } } }
                    }
                }
            };

            if(myChart) {
                myChart.data.datasets[0].data = [data.raw, data.fg, data.wip];
                myChart.update();
            } else {
                myChart = new Chart(ctx, chartConfig);
            }
        }

        function updateDashboardStats(inventory) {
            console.log('🔍 updateDashboardStats 被呼叫，inventory 長度:', inventory ? inventory.length : 0);

            if (!inventory) inventory = [];

            if (inventory.length > 0) {
                console.log('📦 第一筆資料結構:', JSON.stringify(inventory[0], null, 2));
            }

            let cwCount = 0, bfCount = 0, virtualCount = 0;
            let expiryAlerts = [];
            const zoneStats = {};
            const VIRTUAL_LOCS = ['TEMP-IN', 'TEMP-OUT', 'A00', 'A99', 'B00', 'B99', 'C00', 'C99', 'D00', 'D99', 'OTHER'];
            const zoneCapacity = { 'I-A': 638, 'I-B': 638, 'J-C': 638, 'J-D': 638, 'K-E': 638, 'K-F': 638, 'K-G': 638, 'K-H': 638 };

            const today = new Date();
            const thirtyDays = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

            inventory.forEach(item => {
                const company = item.company || item.owner || item.customer || '';
                if (company.includes('崇文') || company === 'CW' || company === 'cw') cwCount++;
                else if (company.includes('八方') || company === 'BF' || company === 'bf') bfCount++;
                else {
                    bfCount++; // 預設歸類
                }

                const locId = item.locationId || '';
                const locUpper = locId.toUpperCase();
                if (VIRTUAL_LOCS.includes(locUpper) || VIRTUAL_LOCS.includes(locId)) {
                    virtualCount++;
                }

                if (locId && !VIRTUAL_LOCS.includes(locUpper)) {
                    const parsed = window.parseLocationId ? window.parseLocationId(locId) : null;
                    if (parsed && parsed.zone) {
                        if (!zoneStats[parsed.zone]) zoneStats[parsed.zone] = 0;
                        zoneStats[parsed.zone]++;
                    }
                }

                if (item.expiryDate) {
                    let expDate;
                    try {
                        expDate = item.expiryDate.toDate ? item.expiryDate.toDate() : new Date(item.expiryDate);
                        if (!isNaN(expDate.getTime()) && expDate <= thirtyDays) {
                            expiryAlerts.push({
                                productName: item.productName,
                                locationId: item.locationId,
                                quantity: item.quantity,
                                expiryDate: expDate,
                                isExpired: expDate < today
                            });
                        }
                    } catch(e) { /* 忽略無效日期 */ }
                }
            });

            const cwEl = document.getElementById('kpi-cw-count');
            const bfEl = document.getElementById('kpi-bf-count');
            const virtualEl = document.getElementById('kpi-virtual-count');
            const expiryEl = document.getElementById('kpi-expiry-alert');

            console.log('📊 KPI 元素:', { cwEl: !!cwEl, bfEl: !!bfEl, virtualEl: !!virtualEl, expiryEl: !!expiryEl });

            if (cwEl) cwEl.textContent = cwCount;
            if (bfEl) bfEl.textContent = bfCount;
            if (virtualEl) virtualEl.textContent = virtualCount;
            if (expiryEl) expiryEl.textContent = expiryAlerts.length;

            console.log('📊 戰情分析更新:', { 總庫存: inventory.length, 崇文: cwCount, 八方: bfCount, 暫存區: virtualCount, 效期警示: expiryAlerts.length, 區域統計: zoneStats });

            updateCompanyChart(cwCount, bfCount);

            const expired = expiryAlerts.filter(e => e.isExpired).length;
            const nearExpiry = expiryAlerts.filter(e => !e.isExpired).length;
            const normal = inventory.length - expired - nearExpiry;
            updateExpiryChart(expired, nearExpiry, normal);

            updateZoneStatsTable(zoneStats, zoneCapacity);

            updateExpiryAlertTable(expiryAlerts);
        }

        function updateCompanyChart(cw, bf) {
            const ctx = document.getElementById('companyChart'); if(!ctx) return;
            const chartConfig = {
                type: 'doughnut',
                data: {
                    labels: ['崇文', '八方'],
                    datasets: [{
                        data: [cw, bf],
                        backgroundColor: ['#10b981', '#06b6d4'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { position: 'bottom', labels: { color: 'white', boxWidth: 12, padding: 8, font: { size: 11 } } }
                    }
                }
            };

            if (companyChart) {
                companyChart.data.datasets[0].data = [cw, bf];
                companyChart.update();
            } else {
                companyChart = new Chart(ctx, chartConfig);
            }
        }

        function updateExpiryChart(expired, nearExpiry, normal) {
            const ctx = document.getElementById('expiryChart'); if(!ctx) return;
            const chartConfig = {
                type: 'doughnut',
                data: {
                    labels: ['已過期', '30天內', '正常'],
                    datasets: [{
                        data: [expired, nearExpiry, normal],
                        backgroundColor: ['#ef4444', '#f97316', '#22c55e'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { position: 'bottom', labels: { color: 'white', boxWidth: 12, padding: 8, font: { size: 11 } } }
                    }
                }
            };

            if (expiryChart) {
                expiryChart.data.datasets[0].data = [expired, nearExpiry, normal];
                expiryChart.update();
            } else {
                expiryChart = new Chart(ctx, chartConfig);
            }
        }

        function updateZoneStatsTable(zoneStats, zoneCapacity) {
            const tbody = document.getElementById('zone-stats-body');
            if (!tbody) return;

            const zones = ['I-A', 'I-B', 'J-C', 'J-D', 'K-E', 'K-F', 'K-G', 'K-H'];
            let html = '';

            zones.forEach(zone => {
                const count = zoneStats[zone] || 0;
                const capacity = zoneCapacity[zone] || 638;
                const percent = Math.round((count / capacity) * 100);
                const colorClass = percent >= 90 ? 'text-red-400' : percent >= 70 ? 'text-yellow-400' : 'text-emerald-400';

                html += '<tr class="border-b border-slate-700/50 hover:bg-slate-800/50">';
                html += '<td class="p-2 font-bold text-white">' + zone + '</td>';
                html += '<td class="p-2 text-right text-white">' + count + '</td>';
                html += '<td class="p-2 text-right ' + colorClass + '">' + percent + '%</td>';
                html += '</tr>';
            });

            tbody.innerHTML = html || '<tr><td colspan="3" class="text-center text-slate-500 py-4">無資料</td></tr>';
        }

        function updateExpiryAlertTable(alerts) {
            const tbody = document.getElementById('expiry-alert-body');
            if (!tbody) return;

            alerts.sort((a, b) => a.expiryDate - b.expiryDate);

            let html = '';
            alerts.slice(0, 10).forEach(item => {
                const dateStr = item.expiryDate.toLocaleDateString('zh-TW');
                const colorClass = item.isExpired ? 'text-red-400' : 'text-orange-400';
                const badge = item.isExpired ? '<span class="text-[10px] bg-red-600 px-1 rounded">過期</span>' : '';

                html += '<tr class="border-b border-slate-700/50 hover:bg-slate-800/50">';
                html += '<td class="p-2 text-white">' + (item.productName || '-') + '</td>';
                html += '<td class="p-2 text-slate-400 font-mono text-xs">' + (item.locationId || '-') + '</td>';
                html += '<td class="p-2 text-right text-white">' + (item.quantity || 0) + '</td>';
                html += '<td class="p-2 ' + colorClass + '">' + dateStr + ' ' + badge + '</td>';
                html += '</tr>';
            });

            if (alerts.length > 10) {
                html += '<tr><td colspan="4" class="text-center text-slate-500 py-2 text-xs">還有 ' + (alerts.length - 10) + ' 筆...</td></tr>';
            }

            tbody.innerHTML = html || '<tr><td colspan="4" class="text-center text-emerald-400 py-4"><i class="fa-solid fa-check-circle mr-1"></i>目前沒有效期警示</td></tr>';
        }

        window.currentInventory = () => currentInventory; window.currentPallets = () => currentInventory;
        Object.defineProperty(window, 'inventory', {
            get: function() { return currentInventory; }
        });
        window.fetchInventory = function() {
            return new Promise(function(resolve) {
                setTimeout(resolve, 100);
            });
        };


console.log('✅ Firebase 初始化完成');
