// ============================================================
// js/04-warehouse-dispatch.js — 倉庫管理、棧板移動、智能調度與調度工單
// 由原 app.js 第 4410–6894 行拆出；各檔依 index.html 的順序載入，共用全域（window）
// ============================================================
        // ========== 倉庫管理系統 ==========

        window.DEFAULT_WAREHOUSES = [
            { code: 'CW-STORE', name: '門市倉', company: '崇文', type: 'external', icon: 'store', active: true, sortOrder: 1 },
            { code: 'CW-JS1', name: '景山1號', company: '崇文', type: 'external', icon: 'building', active: true, sortOrder: 2 },
            { code: 'CW-JS2', name: '景山2號', company: '崇文', type: 'external', icon: 'building', active: true, sortOrder: 3 },
            { code: 'CW-QT', name: '洽通', company: '崇文', type: 'external', icon: 'building', active: true, sortOrder: 4 },
            { code: 'CW-YX', name: '有興', company: '崇文', type: 'external', icon: 'building', active: true, sortOrder: 5 },
            { code: 'CW-FK', name: '富崑', company: '崇文', type: 'external', icon: 'building', active: true, sortOrder: 6 },
            { code: 'CW-PS', name: '品順', company: '崇文', type: 'external', icon: 'building', active: true, sortOrder: 7 },
            { code: 'BF-STORE', name: '門市倉', company: '八方', type: 'external', icon: 'store', active: true, sortOrder: 11 },
            { code: 'BF-JS1', name: '景山1號', company: '八方', type: 'external', icon: 'building', active: true, sortOrder: 12 },
            { code: 'BF-JS2', name: '景山2號', company: '八方', type: 'external', icon: 'building', active: true, sortOrder: 13 },
            { code: 'BF-QT', name: '洽通', company: '八方', type: 'external', icon: 'building', active: true, sortOrder: 14 },
            { code: 'BF-YX', name: '有興', company: '八方', type: 'external', icon: 'building', active: true, sortOrder: 15 },
            { code: 'BF-FK', name: '富崑', company: '八方', type: 'external', icon: 'building', active: true, sortOrder: 16 },
            { code: 'BF-PS', name: '品順', company: '八方', type: 'external', icon: 'building', active: true, sortOrder: 17 }
        ];

        window.VIRTUAL_WAREHOUSES = {
            'MAIN': { name: '一般庫存', needsLocation: true, icon: 'warehouse' },
            'MAIN-CONSIGN': { name: '客戶寄倉', needsLocation: true, icon: 'box' },
            'MAIN-RESERVE': { name: '業務預留', needsLocation: true, icon: 'lock' }
        };

        window.warehousesData = [];

        window.loadWarehouses = async function() {
            try {
                var snapshot = await window.getDocs(window.collection(window.db, 'warehouses'));
                window.warehousesData = [];
                snapshot.forEach(function(doc) {
                    window.warehousesData.push({ id: doc.id, ...doc.data() });
                });

                if (window.warehousesData.length === 0) {
                    await initDefaultWarehouses();
                }

                updateWarehouseDropdown();

            } catch(e) {
                console.error('載入倉庫資料失敗:', e);
                window.warehousesData = window.DEFAULT_WAREHOUSES.map(function(w, i) {
                    return { id: 'default-' + i, ...w };
                });
                updateWarehouseDropdown();
            }
        };

        async function initDefaultWarehouses() {
            for (var w of window.DEFAULT_WAREHOUSES) {
                try {
                    await window.addDoc(window.collection(window.db, 'warehouses'), {
                        ...w,
                        createdAt: new Date().toISOString()
                    });
                } catch(e) {
                    console.error('初始化倉庫失敗:', e);
                }
            }
            var snapshot = await window.getDocs(window.collection(window.db, 'warehouses'));
            window.warehousesData = [];
            snapshot.forEach(function(doc) {
                window.warehousesData.push({ id: doc.id, ...doc.data() });
            });
        }

        window.updateWarehouseDropdown = function() {
            var cwGroup = document.getElementById('optgroup-cw');
            var bfGroup = document.getElementById('optgroup-bf');

            if (!cwGroup || !bfGroup) return;

            cwGroup.innerHTML = '';
            bfGroup.innerHTML = '';

            var cwWarehouses = window.warehousesData.filter(function(w) {
                return w.company === '崇文' && w.active !== false;
            }).sort(function(a, b) { return (a.sortOrder || 99) - (b.sortOrder || 99); });

            var bfWarehouses = window.warehousesData.filter(function(w) {
                return w.company === '八方' && w.active !== false;
            }).sort(function(a, b) { return (a.sortOrder || 99) - (b.sortOrder || 99); });

            cwWarehouses.forEach(function(w) {
                var opt = document.createElement('option');
                opt.value = w.code;
                var icon = w.icon === 'store' ? '🏪' : '🏢';
                opt.textContent = icon + ' 崇文_' + w.name;
                cwGroup.appendChild(opt);
            });

            bfWarehouses.forEach(function(w) {
                var opt = document.createElement('option');
                opt.value = w.code;
                var icon = w.icon === 'store' ? '🏪' : '🏢';
                opt.textContent = icon + ' 八方_' + w.name;
                bfGroup.appendChild(opt);
            });
        };

        window.isExternalWarehouse = function(warehouseId) {
            if (!warehouseId) return false;
            if (warehouseId.startsWith('MAIN')) return false;
            if (warehouseId === 'MANAGE') return false;
            return true;
        };

        window.getWarehouseDisplayName = function(warehouseId) {
            if (!warehouseId) return '';

            if (window.VIRTUAL_WAREHOUSES[warehouseId]) {
                return window.VIRTUAL_WAREHOUSES[warehouseId].name;
            }

            var wh = window.warehousesData.find(function(w) { return w.code === warehouseId; });
            if (wh) {
                return wh.company + '_' + wh.name;
            }

            return warehouseId;
        };

        window.onWarehouseChange = function() {
            var warehouseId = document.getElementById('in-warehouse').value;

            if (warehouseId === 'MANAGE') {
                document.getElementById('in-warehouse').value = 'MAIN'; // 重置選單
                openWarehouseManager();
                return;
            }

            var isExternal = isExternalWarehouse(warehouseId);

            var locSection = document.getElementById('location-section');
            var extSection = document.getElementById('external-wh-section');

            if (locSection) locSection.style.display = isExternal ? 'none' : 'flex';
            if (extSection) extSection.style.display = isExternal ? 'flex' : 'none';

            if (isExternal) {
                var displayName = getWarehouseDisplayName(warehouseId);
                var titleEl = document.getElementById('inbound-wh-title');
                if (titleEl) {
                    titleEl.innerHTML = '<span class="bg-cyan-500 text-white px-2 py-1 rounded mr-2">2</span><i class="fa-solid fa-building mr-2 text-cyan-400"></i>' + displayName + ' 入庫';
                }
            }

            updateLivePreview();
        };

        window.onInboundTypeChange = function() {
            var select = document.getElementById('in-type-select');
            if (!select) return;
            var mode = select.value;
            document.getElementById('in-category').value = mode;
            updateLivePreview();
        };

        window.setInboundMode = function(mode) {
            const elem = document.getElementById('in-category');
            if (elem) elem.value = mode;

            ['raw', 'fg', 'wip', 'ret'].forEach(m => {
                const btn = document.getElementById('btn-mode-' + m);
                if (btn) {
                    btn.classList.remove('bg-blue-600', 'bg-purple-600', 'bg-orange-600', 'bg-cyan-600');
                    btn.classList.add('bg-slate-700');
                }
            });

            const colors = {
                'raw': 'bg-blue-600',
                'fg': 'bg-purple-600',
                'wip': 'bg-orange-600',
                'ret': 'bg-cyan-600'
            };

            const activeBtn = document.getElementById('btn-mode-' + mode.toLowerCase());
            if (activeBtn) {
                activeBtn.classList.remove('bg-slate-700');
                activeBtn.classList.add(colors[mode.toLowerCase()] || 'bg-blue-600');
            }

            updateLivePreview();
        };

        window.generateSheetId = function() {
            const date = new Date();
            const year = date.getFullYear().toString().slice(-2);
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const day = date.getDate().toString().padStart(2, '0');
            const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
            return 'PRE-' + year + month + day + '-' + random;
        };

        window.autoFillBarcode = function() {
            const sheetInput = document.getElementById('in-sheet-id');

            if (sheetInput && !sheetInput.value) {
                sheetInput.value = window.generateSheetId();
                alert('✅ 已生成插單編號：' + sheetInput.value + '\n\n請將此編號列印貼在棧板上');
            } else if (sheetInput && sheetInput.value) {
                alert('⚠️ 插單編號已存在：' + sheetInput.value);
            }
        };

        // ===== 簡化版板號移動功能 =====

        window.selectedPallet = null;
        window.currentFilter = '';

        window.renderPalletList = function() {
            var container = document.getElementById('pallet-list');
            if (!container) return;

            var inventory = window.currentInventory ? window.currentInventory() : [];
            var filtered = window.currentFilter
                ? inventory.filter(function(item) { return item.productName === window.currentFilter; })
                : inventory;

            if (filtered.length === 0) {
                container.innerHTML = '<div class="text-center text-slate-400 py-8">無儲位資料</div>';
                return;
            }

            var zones = { 'I-A': [], 'I-B': [], 'J-C': [], 'J-D': [] };
            filtered.forEach(function(item) {
                var parsed = parseLocationId(item.locationId);
                if (parsed && zones[parsed.zone]) {
                    zones[parsed.zone].push(item);
                }
            });

            var zoneNames = { 'I-A': 'A區', 'I-B': 'B區', 'J-C': 'C區', 'J-D': 'D區' };
            var html = '';

            for (var zoneKey in zones) {
                var items = zones[zoneKey];
                if (items.length === 0 && window.currentFilter) continue;

                html += '<div class="mb-3 border border-slate-600 rounded">';
                html += '<div class="bg-slate-800 px-3 py-2 font-bold text-white">' + zoneNames[zoneKey] + '</div>';

                if (items.length === 0) {
                    html += '<div class="p-3 text-slate-500 text-sm">此區無儲位</div>';
                } else {
                    items.forEach(function(item) {
                        var bg = 'bg-blue-900/30 border-blue-500';
                        if (item.category === 'FG') bg = 'bg-green-900/30 border-green-500';
                        if (item.category === 'WIP') bg = 'bg-yellow-900/30 border-yellow-500';

                        html += '<div class="' + bg + ' border m-2 p-2 rounded cursor-pointer hover:bg-opacity-70" ';
                        html += 'onclick="selectPallet(\'' + item.id + '\', \'' + item.locationId + '\', \'' + item.productName + '\', ' + (item.quantity || 0) + ')">';
                        html += '<div class="flex justify-between items-start">';
                        html += '<div><div class="text-white font-bold">' + item.locationId + '</div>';
                        html += '<div class="text-slate-300 text-sm">' + item.productName + '</div></div>';
                        html += '<div class="text-white font-bold text-lg">' + (item.quantity || 0) + ' 件</div>';
                        html += '</div>';
                        html += '<div class="text-xs text-slate-400 mt-1">板號: ' + item.palletId + '</div>';
                        html += '</div>';
                    });
                }
                html += '</div>';
            }

            container.innerHTML = html;
        };

        window.selectPallet = function(id, location, product, quantity) {
            window.selectedPallet = { id: id, location: location, product: product, quantity: quantity };

            var panel = document.getElementById('operation-panel');
            if (!panel) return;

            var inventory = window.currentInventory ? window.currentInventory() : [];
            var sameProduct = inventory.filter(function(item) {
                return item.productName === product && item.id !== id;
            });

            var html = '<div class="space-y-3">';
            html += '<div class="bg-slate-900 border border-slate-700 rounded p-3">';
            html += '<div class="text-xs text-slate-400 mb-2">已選擇：</div>';
            html += '<div class="text-white font-bold">' + location + '</div>';
            html += '<div class="text-slate-300">' + product + '</div>';
            html += '<div class="text-white font-bold text-lg">' + quantity + ' 件</div>';
            html += '</div>';

            html += '<div><div class="text-white font-bold text-sm mb-2">請選擇操作：</div>';
            html += '<button onclick="showMoveOptions()" class="w-full p-3 bg-emerald-700 text-white rounded mb-2 hover:bg-emerald-600">';
            html += '<i class="fa-solid fa-arrow-right mr-2"></i>移動到其他儲位</button>';

            if (sameProduct.length > 0) {
                html += '<button onclick="showMergeOptions()" class="w-full p-3 bg-yellow-700 text-white rounded hover:bg-yellow-600">';
                html += '<i class="fa-solid fa-layer-group mr-2"></i>合併（找到 ' + sameProduct.length + ' 個相同品名）</button>';
            }
            html += '</div></div>';

            panel.innerHTML = html;
        };

        window.showMoveOptions = function() {
            var panel = document.getElementById('operation-panel');
            if (!panel) return;

            var html = '<div class="space-y-2">';
            html += '<button onclick="selectPallet(null)" class="text-sm text-blue-400 hover:text-blue-300">';
            html += '<i class="fa-solid fa-arrow-left mr-1"></i>返回</button>';
            html += '<div class="text-white font-bold mb-2">輸入目標儲位：</div>';
            html += '<input type="text" id="target-location" class="w-full p-2 bg-slate-800 text-white rounded border border-slate-600" ';
            html += 'placeholder="例如: I-A-05-2F">';
            html += '<button onclick="executeMove()" class="w-full p-3 bg-blue-600 text-white rounded hover:bg-blue-500 mt-3">';
            html += '確認移動</button>';
            html += '</div>';

            panel.innerHTML = html;
        };

        window.showMergeOptions = function() {
            var panel = document.getElementById('operation-panel');
            if (!panel) return;

            var source = window.selectedPallet;
            var inventory = window.currentInventory ? window.currentInventory() : [];
            var targets = inventory.filter(function(item) {
                return item.productName === source.product && item.id !== source.id;
            });

            var html = '<div class="space-y-2">';
            html += '<button onclick="selectPallet(null)" class="text-sm text-blue-400 hover:text-blue-300">';
            html += '<i class="fa-solid fa-arrow-left mr-1"></i>返回</button>';
            html += '<div class="text-white font-bold mb-2">選擇合併目標：</div>';

            targets.forEach(function(target) {
                html += '<div class="p-2 bg-slate-800 border border-slate-600 rounded cursor-pointer hover:border-yellow-500" ';
                html += 'onclick="executeMerge(\'' + target.id + '\', ' + (target.quantity || 0) + ')">';
                html += '<div class="flex justify-between">';
                html += '<div class="text-white">' + target.locationId + '</div>';
                html += '<div class="text-white font-bold">' + (target.quantity || 0) + ' 件</div>';
                html += '</div>';
                html += '<div class="text-xs text-green-400 mt-1">合併後: ' + (source.quantity + (target.quantity || 0)) + ' 件</div>';
                html += '</div>';
            });

            html += '</div>';
            panel.innerHTML = html;
        };

        window.executeMove = async function() {
            var source = window.selectedPallet;
            var targetLoc = document.getElementById('target-location');
            if (!source || !targetLoc || !targetLoc.value) {
                alert('請輸入目標儲位');
                return;
            }

            var newLoc = targetLoc.value.trim();
            if (!confirm('確定將 ' + source.location + ' 移動到 ' + newLoc + '？')) return;

            try {
                await window.movePalletTx(window.doc(window.db, "pallets", source.id), newLoc);
                alert('✅ 移動成功！');
                window.selectedPallet = null;
                renderPalletList();
                document.getElementById('operation-panel').innerHTML = '<div class="text-center text-slate-400 py-8">請選擇棧板</div>';
            } catch (err) {
                console.error(err);
                alert('❌ 移動失敗: ' + err.message);
            }
        };

        window.executeMerge = async function(targetId, targetQty) {
            var source = window.selectedPallet;
            if (!source) return;

            var totalQty = source.quantity + targetQty;
            if (!confirm('確定合併？\n合併後總數: ' + totalQty + ' 件')) return;

            try {
                var result = await window.mergePalletsTx(
                    window.doc(window.db, "pallets", source.id),
                    window.doc(window.db, "pallets", targetId)
                );
                if (result.total !== totalQty) {
                    alert('ℹ️ 庫存在您操作期間有變動，實際合併後數量為 ' + result.total + ' 件');
                }

                alert('✅ 合併成功！');
                window.selectedPallet = null;
                renderPalletList();
                document.getElementById('operation-panel').innerHTML = '<div class="text-center text-slate-400 py-8">請選擇棧板</div>';
            } catch (err) {
                console.error(err);
                alert('❌ 合併失敗: ' + err.message);
            }
        };

        window.updateProductFilter = function() {
            var select = document.getElementById('product-filter');
            if (!select) return;

            var inventory = window.currentInventory ? window.currentInventory() : [];
            var products = {};
            inventory.forEach(function(item) {
                if (item.productName) products[item.productName] = true;
            });

            var html = '<option value="">-- 全部顯示 --</option>';
            Object.keys(products).sort().forEach(function(name) {
                html += '<option value="' + name + '">' + name + '</option>';
            });
            select.innerHTML = html;
        };

        window.filterByProduct = function() {
            var select = document.getElementById('product-filter');
            window.currentFilter = select ? select.value : '';
            renderPalletList();
        };

        // ===== 智能調度系統 v4 =====

        window.dispatchTasks = [];
        window.selectedProduct = null;
        window.analysisData = null;

        window.analyzeDispersion = function() {
            var inventory = window.currentInventory ? window.currentInventory() : [];

            var productGroups = {};
            inventory.forEach(function(item) {
                var name = item.productName;
                if (!productGroups[name]) {
                    productGroups[name] = [];
                }
                productGroups[name].push(item);
            });

            var analysis = [];
            for (var name in productGroups) {
                var items = productGroups[name];

                var lanes = {};
                var totalQty = 0;
                items.forEach(function(item) {
                    var parsed = parseLocationId(item.locationId);
                    var lane = parsed ? parsed.laneKey : '';
                    if (!lane) return;
                    if (!lanes[lane]) {
                        lanes[lane] = { qty: 0, count: 0 };
                    }
                    lanes[lane].qty += (item.quantity || 0);
                    lanes[lane].count++;
                    totalQty += (item.quantity || 0);
                });

                var laneList = Object.keys(lanes);
                var laneCount = laneList.length;
                var isolatedCount = 0;  // 孤立群組數（只有1個儲位的群組）
                var groupedCount = 0;   // 集中群組數（有2+個儲位的群組）

                laneList.forEach(function(lane) {
                    if (lanes[lane].count < 2) {
                        isolatedCount++;
                    } else {
                        groupedCount++;
                    }
                });

                if (isolatedCount === 0) continue;

                var avgQty = totalQty / items.length;

                analysis.push({
                    productName: name,
                    locationCount: items.length,
                    laneCount: laneCount,
                    isolatedCount: isolatedCount,  // 孤立群組數
                    groupedCount: groupedCount,    // 集中群組數
                    totalQty: totalQty,
                    avgQty: Math.round(avgQty),
                    lanes: lanes,
                    items: items
                });
            }

            analysis.sort(function(a, b) {
                if (b.isolatedCount !== a.isolatedCount) return b.isolatedCount - a.isolatedCount;
                return b.laneCount - a.laneCount;
            });

            window.analysisData = analysis;
            return analysis;
        };

        window.renderDispersionRanking = function() {
            var container = document.getElementById('dispersion-ranking');
            if (!container) return;

            var analysis = window.analyzeDispersion();

            if (analysis.length === 0) {
                container.innerHTML = '<div class="text-green-400 text-sm p-3"><i class="fa-solid fa-check-circle mr-2"></i>所有品項已集中存放（無孤立儲位），無需調度</div>';
                return;
            }

            var html = '';
            analysis.forEach(function(item, index) {
                var priority = '🔴';
                var bgColor = 'bg-red-900/20 border-red-600';
                if (item.isolatedCount === 2) {
                    priority = '🟡';
                    bgColor = 'bg-yellow-900/20 border-yellow-600';
                } else if (item.isolatedCount === 1) {
                    priority = '🟢';
                    bgColor = 'bg-green-900/20 border-green-600';
                }

                html += '<div class="' + bgColor + ' border rounded p-3 mb-2 cursor-pointer hover:bg-opacity-40" ';
                html += 'onclick="selectProductForDispatch(\'' + item.productName + '\')">';
                html += '<div class="flex justify-between items-start mb-1">';
                html += '<div class="text-white font-bold">' + priority + ' ' + item.productName + '</div>';
                html += '<div class="text-xs text-slate-400">#' + (index + 1) + '</div>';
                html += '</div>';
                html += '<div class="text-sm text-slate-300"><span class="text-red-400 font-bold">' + item.isolatedCount + '</span> 個孤立儲位需調度</div>';
                html += '<div class="text-xs text-slate-500">' + item.laneCount + ' 巷道 / ' + item.locationCount + ' 儲位</div>';
                html += '<div class="text-sm text-slate-300 mt-1">總計 <span class="text-white font-bold">' + item.totalQty + '</span> 件</div>';
                html += '</div>';
            });

            container.innerHTML = html;
        };

        window.selectProductForDispatch = function(productName) {
            window.selectedProduct = productName;

            var data = window.analysisData.find(function(item) {
                return item.productName === productName;
            });

            if (!data) return;

            renderProductStats(data);

            var suggestion = generateSmartSuggestion(data);

            renderVisualMap(data, suggestion);
        };

        window.renderProductStats = function(data) {
            var container = document.getElementById('product-stats');
            if (!container) return;

            var distribution = {};
            data.items.forEach(function(item) {
                var parsed = parseLocationId(item.locationId);
                var zone = parsed ? parsed.zoneChar : '?'; // A, B, C, D
                if (!distribution[zone]) distribution[zone] = 0;
                distribution[zone]++;
            });

            var distText = '';
            for (var zone in distribution) {
                distText += zone + '區:' + distribution[zone] + ' ';
            }

            var html = '<div class="bg-slate-800 border border-slate-600 rounded p-3">';
            html += '<div class="text-white font-bold mb-2">📊 ' + data.productName + ' 統計</div>';
            html += '<div class="text-sm text-slate-300 space-y-1">';
            html += '<div>• 總數量: <span class="text-white font-bold">' + data.totalQty + '</span> 件</div>';
            html += '<div>• 儲位數: <span class="text-yellow-400 font-bold">' + data.locationCount + '</span> 個</div>';
            html += '<div>• 平均: <span class="text-white font-bold">' + data.avgQty + '</span> 件/位</div>';
            html += '<div>• 分佈: <span class="text-blue-400">' + distText + '</span></div>';
            html += '</div></div>';

            container.innerHTML = html;
        };

        window.generateSmartSuggestion = function(data) {
            var inventory = window.currentInventory ? window.currentInventory() : [];

            // ===== 建立群組：同一巷道的儲位歸為一組 =====
            var groups = {};  // { 'I-A01': { qty: 500, count: 3, items: [...] }, ... }

            data.items.forEach(function(item) {
                var parsed = parseLocationId(item.locationId);
                var lane = parsed ? parsed.laneKey : ''; // 如 I-A01
                if (!lane) return;
                if (!groups[lane]) {
                    groups[lane] = { qty: 0, count: 0, items: [] };
                }
                groups[lane].qty += (item.quantity || 0);
                groups[lane].count++;
                groups[lane].items.push(item);
            });

            var groupList = Object.keys(groups).map(function(lane) {
                return {
                    lane: lane,
                    qty: groups[lane].qty,
                    count: groups[lane].count,  // 群組內儲位數
                    items: groups[lane].items
                };
            }).sort(function(a, b) {
                if (b.qty !== a.qty) return b.qty - a.qty;
                return b.count - a.count;
            });

            // ===== 分類群組 =====
            var keepGroups = [];    // 保留的群組（集中存放）
            var moveGroups = [];    // 需調度的群組（孤立儲位）

            groupList.forEach(function(g) {
                if (g.count >= 2) {
                    keepGroups.push(g);
                } else {
                    moveGroups.push(g);
                }
            });

            if (moveGroups.length === 0) {
                return {
                    keep: data.items,
                    move: [],
                    suggestions: [],
                    freedSpaces: 0,
                    targetLane: groupList[0] ? groupList[0].lane : null,
                    heatMap: groupList,
                    groups: { keep: keepGroups, move: moveGroups },
                    message: '✅ 所有品項已集中存放（無孤立儲位），無需調度'
                };
            }

            if (keepGroups.length === 0) {
                var targetGroup = groupList[0];
                keepGroups = [targetGroup];
                moveGroups = groupList.slice(1);

                if (moveGroups.length === 0) {
                    return {
                        keep: data.items,
                        move: [],
                        suggestions: [],
                        freedSpaces: 0,
                        targetLane: targetGroup.lane,
                        heatMap: groupList,
                        groups: { keep: keepGroups, move: moveGroups },
                        message: '✅ 僅有單一儲位，無需調度'
                    };
                }
            }

            // ===== 目標巷道 = 最大群組（數量最多） =====
            var targetGroup = keepGroups[0];
            var targetLane = targetGroup.lane;

            var keepItems = [];
            keepGroups.forEach(function(g) {
                keepItems = keepItems.concat(g.items);
            });

            var moveItems = [];
            moveGroups.forEach(function(g) {
                moveItems = moveItems.concat(g.items);
            });

            // ===== 計算目標巷道的可用空位 =====
            function getLaneEmptySlots(lanePrefix) {
                var laneItems = inventory.filter(function(item) {
                    return item.locationId && item.locationId.startsWith(lanePrefix);
                });
                // 各層依 RACK_CONFIG 的混合板型使用率估算還能放幾板（以散板計，3F 只放整板）
                var levelCounts = { '3F': {}, '2F': {}, '1F': {} };
                laneItems.forEach(function(item) {
                    var parsed = parseLocationId(item.locationId);
                    var level = parsed ? parsed.level : '';
                    if (levelCounts[level]) window.addPalletToCounts(levelCounts[level], item);
                });
                var emptySlots = [];
                ['3F', '2F', '1F'].forEach(function(level) {
                    var type = level === '3F' ? 'full' : 'scattered';
                    var n = window.levelRemaining(levelCounts[level], level, type);
                    for (var j = 0; j < n; j++) emptySlots.push(lanePrefix + '-' + level);
                });
                return emptySlots;
            }

            // ===== 生成調度建議 =====
            var suggestions = [];
            var emptySlots = getLaneEmptySlots(targetLane);
            var slotIndex = 0;

            moveItems.forEach(function(moveItem) {
                var parsed = parseLocationId(moveItem.locationId);
                var fromLane = parsed ? parsed.laneKey : '';
                var fromGroup = groups[fromLane];

                if (slotIndex < emptySlots.length) {
                    suggestions.push({
                        from: moveItem,
                        fromLane: fromLane,
                        fromGroupSize: fromGroup ? fromGroup.count : 1,
                        toLocation: emptySlots[slotIndex],
                        toLane: targetLane,
                        toGroupSize: targetGroup.count,
                        quantity: moveItem.quantity || 0,
                        reason: '孤立(' + (fromGroup ? fromGroup.count : 1) + '儲位) → 集中(' + targetGroup.count + '儲位)'
                    });
                    slotIndex++;
                } else {
                    suggestions.push({
                        from: moveItem,
                        fromLane: fromLane,
                        toLocation: '無可用空位',
                        toLane: targetLane + ' (已滿)',
                        quantity: moveItem.quantity || 0,
                        noSpace: true,
                        reason: '目標巷道已滿'
                    });
                }
            });

            return {
                keep: keepItems,
                move: moveItems,
                suggestions: suggestions,
                freedSpaces: suggestions.filter(function(s) { return !s.noSpace; }).length,
                targetLane: targetLane,
                targetHeat: targetGroup.qty,
                targetGroupSize: targetGroup.count,
                heatMap: groupList,
                groups: { keep: keepGroups, move: moveGroups }
            };
        };

        window.renderVisualMap = function(data, suggestion) {
            var container = document.getElementById('visual-map');
            if (!container) return;

            var html = '<div class="space-y-3">';

            if (suggestion.message) {
                html += '<div class="bg-green-900/30 border border-green-600 rounded-lg p-6 text-center">';
                html += '<i class="fa-solid fa-check-circle text-4xl text-green-400 mb-3"></i>';
                html += '<div class="text-green-300 font-bold text-lg">' + suggestion.message + '</div>';
                html += '<div class="text-slate-400 text-sm mt-2">目標巷道：<span class="text-white font-bold">' + (suggestion.targetLane || '-') + '</span></div>';
                html += '</div>';
                html += '</div>';
                container.innerHTML = html;
                window.currentSuggestion = suggestion;
                return;
            }

            // ===== 群組熱力圖顯示 =====
            html += '<div class="bg-slate-800/50 border border-slate-600 rounded-lg p-3 mb-3">';
            html += '<div class="text-white font-bold mb-2"><i class="fa-solid fa-layer-group text-orange-400 mr-2"></i>巷道群組分析</div>';
            html += '<div class="flex flex-wrap gap-2">';

            if (suggestion.heatMap) {
                var maxHeat = suggestion.heatMap[0] ? suggestion.heatMap[0].qty : 1;
                suggestion.heatMap.forEach(function(h, idx) {
                    var heatPercent = Math.round((h.qty / maxHeat) * 100);
                    var isIsolated = h.count < 2;  // 孤立群組
                    var isTarget = suggestion.groups && suggestion.groups.keep.length > 0 && suggestion.groups.keep[0].lane === h.lane;
                    var borderClass = isTarget ? 'ring-2 ring-yellow-400' : (isIsolated ? 'ring-1 ring-red-400' : '');
                    var bgClass = isIsolated ? 'bg-red-900/50' : 'bg-slate-700';

                    html += '<div class="relative group">';
                    html += '<div class="' + borderClass + ' ' + bgClass + ' rounded p-2 text-center min-w-[90px]">';
                    html += '<div class="text-xs text-slate-400 mb-1">' + h.lane + '</div>';
                    html += '<div class="h-2 bg-slate-600 rounded overflow-hidden mb-1">';
                    html += '<div class="h-full ' + (isIsolated ? 'bg-red-500' : 'bg-green-500') + '" style="width:' + heatPercent + '%"></div>';
                    html += '</div>';
                    html += '<div class="text-white font-bold text-sm">' + h.qty + '件</div>';
                    html += '<div class="text-xs ' + (isIsolated ? 'text-red-400' : 'text-green-400') + '">' + h.count + '儲位</div>';
                    if (isTarget) {
                        html += '<div class="text-[10px] text-yellow-400 mt-1">🎯 目標群組</div>';
                    } else if (isIsolated) {
                        html += '<div class="text-[10px] text-red-400 mt-1">⚠️ 孤立</div>';
                    } else {
                        html += '<div class="text-[10px] text-green-400 mt-1">✅ 集中</div>';
                    }
                    html += '</div>';
                    html += '</div>';
                });
            }
            html += '</div>';
            html += '<div class="text-xs text-slate-500 mt-2"><i class="fa-solid fa-info-circle mr-1"></i>群組規則：≥2儲位=集中(綠)、1儲位=孤立(紅)需調度</div>';
            html += '</div>';

            html += '<div class="flex justify-between items-center mb-3">';
            html += '<div class="text-white font-bold">📍 調度方案 <span class="text-sm text-slate-400">(目標: ' + suggestion.targetLane + ' / ' + (suggestion.targetGroupSize || 0) + '儲位)</span></div>';
            html += '<div class="flex items-center gap-3">';
            html += '<label class="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">';
            html += '<input type="checkbox" id="select-all-tasks" checked onchange="toggleAllTasks(this.checked)" class="w-4 h-4 rounded">';
            html += '<span>全選</span>';
            html += '</label>';
            html += '<span id="selected-count" class="text-xs text-blue-400">已選 ' + suggestion.suggestions.filter(function(s){return !s.noSpace}).length + ' 項</span>';
            html += '</div>';
            html += '</div>';

            html += '<div class="mb-3 bg-green-900/20 border border-green-600/50 rounded p-3">';
            html += '<div class="text-green-400 text-sm font-bold mb-2">✅ 集中群組保留（' + suggestion.keep.length + '儲位）</div>';
            html += '<div class="flex flex-wrap gap-2">';
            suggestion.keep.forEach(function(item) {
                html += '<div class="bg-green-900/50 border border-green-600 rounded px-2 py-1 text-sm">';
                html += '<span class="text-white font-bold">' + item.locationId + '</span>';
                html += '<span class="text-green-300 ml-2">' + (item.quantity || 0) + '件</span>';
                html += '</div>';
            });
            html += '</div></div>';

            html += '<div class="mb-3">';
            html += '<div class="text-red-400 text-sm font-bold mb-2">⚠️ 孤立儲位調度（' + suggestion.suggestions.length + '項）→ 集中群組</div>';
            html += '<div class="space-y-2" id="task-list">';

            suggestion.suggestions.forEach(function(sug, index) {
                var isDisabled = sug.noSpace;
                var borderColor = isDisabled ? 'border-slate-600' : 'border-red-600/50';
                var bgColor = isDisabled ? 'bg-slate-800/30' : 'bg-red-900/20';
                var opacity = isDisabled ? 'opacity-50' : '';

                html += '<div class="' + bgColor + ' border ' + borderColor + ' rounded p-3 ' + opacity + '" data-task-index="' + index + '">';
                html += '<div class="flex items-center gap-3">';

                if (!isDisabled) {
                    html += '<input type="checkbox" checked class="task-checkbox w-5 h-5 rounded cursor-pointer" data-index="' + index + '" onchange="updateTaskSelection()">';
                } else {
                    html += '<div class="w-5 h-5 rounded bg-red-900/50 flex items-center justify-center"><i class="fa-solid fa-ban text-red-400 text-xs"></i></div>';
                }

                html += '<div class="flex-1 flex items-center justify-between">';
                html += '<div class="flex items-center gap-2">';
                html += '<span class="text-white font-bold">' + sug.from.locationId + '</span>';
                html += '<span class="text-slate-400">(' + sug.quantity + '件)</span>';
                html += '</div>';
                html += '<i class="fa-solid fa-arrow-right text-slate-500"></i>';
                html += '<div class="text-right">';
                if (isDisabled) {
                    html += '<span class="text-red-400">無空位</span>';
                } else {
                    html += '<span class="text-green-400 font-bold">' + sug.toLocation + '</span>';
                }
                html += '</div>';
                html += '</div>';
                html += '</div>';
                html += '</div>';
            });

            html += '</div></div>';

            html += '<div class="bg-blue-900/20 border border-blue-600/50 rounded p-3" id="effect-preview">';
            html += '<div class="text-blue-400 font-bold mb-2">📈 預期效果</div>';
            html += '<div class="text-sm text-slate-300 grid grid-cols-3 gap-2">';
            var validCount = suggestion.suggestions.filter(function(s){return !s.noSpace}).length;
            html += '<div>釋放 <span class="text-yellow-400 font-bold" id="effect-spaces">' + validCount + '</span> 空位</div>';
            html += '<div>減少 <span class="text-green-400 font-bold" id="effect-percent">' + Math.round(validCount / data.locationCount * 100) + '%</span></div>';
            html += '<div>執行 <span class="text-white font-bold" id="effect-tasks">' + validCount + '</span> 次</div>';
            html += '</div></div>';

            html += '<div class="mt-4 flex gap-2">';
            html += '<button onclick="generateDispatchOrder()" class="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 px-4 rounded font-bold" id="btn-generate">';
            html += '<i class="fa-solid fa-file-lines mr-2"></i>生成調度單 (<span id="btn-count">' + validCount + '</span>項)';
            html += '</button>';
            html += '<button onclick="cancelDispatch()" class="bg-slate-700 hover:bg-slate-600 text-white py-2 px-4 rounded">';
            html += '取消';
            html += '</button>';
            html += '</div>';

            html += '</div>';

            container.innerHTML = html;

            window.currentSuggestion = suggestion;
            window.currentData = data;
        };

        window.toggleAllTasks = function(checked) {
            var checkboxes = document.querySelectorAll('.task-checkbox');
            checkboxes.forEach(function(cb) {
                cb.checked = checked;
            });
            updateTaskSelection();
        };

        window.updateTaskSelection = function() {
            var checkboxes = document.querySelectorAll('.task-checkbox');
            var checkedCount = 0;
            var total = checkboxes.length;

            checkboxes.forEach(function(cb) {
                if (cb.checked) checkedCount++;
            });

            var countEl = document.getElementById('selected-count');
            if (countEl) countEl.textContent = '已選 ' + checkedCount + ' 項';

            var btnCount = document.getElementById('btn-count');
            if (btnCount) btnCount.textContent = checkedCount;

            var effectSpaces = document.getElementById('effect-spaces');
            if (effectSpaces) effectSpaces.textContent = checkedCount;

            var effectTasks = document.getElementById('effect-tasks');
            if (effectTasks) effectTasks.textContent = checkedCount;

            var effectPercent = document.getElementById('effect-percent');
            if (effectPercent && window.currentData) {
                effectPercent.textContent = Math.round(checkedCount / window.currentData.locationCount * 100) + '%';
            }

            var selectAll = document.getElementById('select-all-tasks');
            if (selectAll) {
                selectAll.checked = checkedCount === total;
                selectAll.indeterminate = checkedCount > 0 && checkedCount < total;
            }

            var btnGenerate = document.getElementById('btn-generate');
            if (btnGenerate) {
                btnGenerate.disabled = checkedCount === 0;
                btnGenerate.className = checkedCount === 0
                    ? 'flex-1 bg-slate-600 text-slate-400 py-2 px-4 rounded font-bold cursor-not-allowed'
                    : 'flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 px-4 rounded font-bold';
            }
        };

        window.generateDispatchOrder = function() {
            if (!window.currentSuggestion || !window.selectedProduct) {
                alert('請先選擇品名並查看建議');
                return;
            }

            var suggestion = window.currentSuggestion;
            var product = window.selectedProduct;

            var selectedIndices = [];
            var checkboxes = document.querySelectorAll('.task-checkbox');
            checkboxes.forEach(function(cb) {
                if (cb.checked) {
                    selectedIndices.push(parseInt(cb.getAttribute('data-index')));
                }
            });

            if (selectedIndices.length === 0) {
                alert('請至少選擇一項調度任務');
                return;
            }

            var selectedSuggestions = [];
            selectedIndices.forEach(function(idx) {
                var sug = suggestion.suggestions[idx];
                if (sug && !sug.noSpace) {
                    selectedSuggestions.push(sug);
                }
            });

            if (selectedSuggestions.length === 0) {
                alert('沒有可執行的調度任務');
                return;
            }

            var orderNo = window.generateDocNo ? window.generateDocNo('DS') : 'DS-' + new Date().getFullYear() + ('0'+(new Date().getMonth()+1)).slice(-2) + ('0'+new Date().getDate()).slice(-2) + '-001';
            var timestamp = new Date().toLocaleString('zh-TW');

            var tasks = [];
            selectedSuggestions.forEach(function(sug, index) {
                tasks.push({
                    taskNo: index + 1,
                    fromLocation: sug.from.locationId,
                    fromDocId: sug.from.id || '',
                    fromPalletId: sug.from.palletId,
                    toLocation: sug.toLocation,
                    toLane: sug.toLane,
                    quantity: sug.quantity,
                    status: 'pending'
                });
            });

            var previewData = {
                orderNo: orderNo,
                productName: product,
                createdAt: timestamp,
                tasks: tasks,
                totalTasks: tasks.length
            };

            showDispatchPreview(previewData);
        };

        window.showDispatchPreview = function(previewData) {
            var modal = document.getElementById('dispatch-preview-modal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'dispatch-preview-modal';
                modal.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-50';
                document.body.appendChild(modal);
            }

            var html = '<div class="bg-slate-800 rounded-lg p-6 max-w-3xl w-full mx-4 max-h-[85vh] overflow-y-auto">';

            html += '<div class="flex justify-between items-start mb-4">';
            html += '<div>';
            html += '<h2 class="text-2xl font-bold text-white">📋 調度單預覽</h2>';
            html += '<div class="text-slate-400 text-sm mt-1">請確認無誤後再生成正式調度單</div>';
            html += '</div>';
            html += '<button onclick="closePreviewModal()" class="text-slate-400 hover:text-white text-2xl">&times;</button>';
            html += '</div>';

            html += '<div class="bg-gradient-to-r from-blue-900 to-blue-800 border border-blue-600 rounded-lg p-4 mb-4">';
            html += '<div class="grid grid-cols-3 gap-4 text-sm">';
            html += '<div><div class="text-blue-300 mb-1">調度單編號</div><div class="text-white font-bold">' + previewData.orderNo + '</div></div>';
            html += '<div><div class="text-blue-300 mb-1">品名</div><div class="text-white font-bold">' + previewData.productName + '</div></div>';
            html += '<div><div class="text-blue-300 mb-1">生成時間</div><div class="text-white font-bold">' + previewData.createdAt + '</div></div>';
            html += '</div></div>';

            html += '<div class="mb-4">';
            html += '<div class="flex justify-between items-center mb-3">';
            html += '<h3 class="text-white font-bold">📦 任務清單（共 ' + previewData.totalTasks + ' 項）</h3>';
            html += '<div class="text-xs text-slate-400">💡 提示：可以調整執行順序</div>';
            html += '</div>';

            html += '<div class="space-y-2">';
            previewData.tasks.forEach(function(task, index) {
                html += '<div class="bg-slate-900 border border-slate-700 rounded-lg p-4 hover:border-blue-500 transition-all">';

                html += '<div class="flex justify-between items-start mb-3">';
                html += '<div class="flex items-center gap-3">';
                html += '<div class="bg-blue-900 text-blue-300 px-3 py-1 rounded font-bold text-sm">任務 ' + task.taskNo + '</div>';

                if (index > 0) {
                    html += '<button onclick="moveTaskUp(' + index + ')" class="text-slate-400 hover:text-white text-xs px-2 py-1 bg-slate-800 rounded" title="上移">';
                    html += '<i class="fa-solid fa-arrow-up"></i></button>';
                }
                if (index < previewData.totalTasks - 1) {
                    html += '<button onclick="moveTaskDown(' + index + ')" class="text-slate-400 hover:text-white text-xs px-2 py-1 bg-slate-800 rounded" title="下移">';
                    html += '<i class="fa-solid fa-arrow-down"></i></button>';
                }
                html += '</div>';

                html += '<button onclick="removeTask(' + index + ')" class="text-red-400 hover:text-red-300 text-xs px-2 py-1 bg-slate-800 rounded" title="移除此任務">';
                html += '<i class="fa-solid fa-trash mr-1"></i>移除</button>';
                html += '</div>';

                html += '<div class="grid grid-cols-4 gap-3">';

                html += '<div class="col-span-1">';
                html += '<div class="text-xs text-slate-400 mb-1">📍 來源儲位</div>';
                html += '<div class="text-white font-bold text-sm">' + task.fromLocation + '</div>';
                html += '<div class="text-xs text-slate-500 mt-1">板號：' + task.fromPalletId + '</div>';
                html += '</div>';

                html += '<div class="col-span-1 flex items-center justify-center">';
                html += '<div class="text-slate-500">';
                html += '<i class="fa-solid fa-arrow-right text-2xl"></i>';
                html += '<div class="text-xs mt-1">' + task.quantity + ' 件</div>';
                html += '</div>';
                html += '</div>';

                html += '<div class="col-span-1">';
                html += '<div class="text-xs text-slate-400 mb-1">🎯 目標儲位</div>';
                html += '<div class="text-green-400 font-bold text-sm">' + task.toLocation + '</div>';
                html += '<div class="text-xs text-green-600 mt-1">合併到此</div>';
                html += '</div>';

                html += '<div class="col-span-1">';
                html += '<div class="text-xs text-slate-400 mb-1">⏱️ 預估時間</div>';
                html += '<div class="text-yellow-400 font-bold text-sm">~5 分鐘</div>';
                html += '<div class="text-xs text-slate-500 mt-1">含移動時間</div>';
                html += '</div>';

                html += '</div>';
                html += '</div>';
            });
            html += '</div>';
            html += '</div>';

            html += '<div class="bg-gradient-to-r from-purple-900/30 to-blue-900/30 border border-purple-600/50 rounded-lg p-4 mb-4">';
            html += '<div class="text-purple-300 font-bold mb-2">📊 執行摘要</div>';
            html += '<div class="grid grid-cols-3 gap-4 text-sm">';
            html += '<div>';
            html += '<div class="text-slate-400">總任務數</div>';
            html += '<div class="text-white font-bold text-xl">' + previewData.totalTasks + ' 項</div>';
            html += '</div>';
            html += '<div>';
            html += '<div class="text-slate-400">預估總時長</div>';
            html += '<div class="text-yellow-400 font-bold text-xl">~' + (previewData.totalTasks * 5) + ' 分鐘</div>';
            html += '</div>';
            html += '<div>';
            html += '<div class="text-slate-400">釋放空位</div>';
            html += '<div class="text-green-400 font-bold text-xl">' + previewData.totalTasks + ' 個</div>';
            html += '</div>';
            html += '</div>';
            html += '</div>';

            html += '<div class="bg-blue-900/20 border border-blue-600/50 rounded-lg p-4 mb-4">';
            html += '<div class="text-blue-400 font-bold mb-2">📱 PDA 端執行流程</div>';
            html += '<div class="space-y-2 text-sm text-slate-300">';
            html += '<div class="flex items-start gap-2">';
            html += '<div class="bg-blue-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5">1</div>';
            html += '<div>堆高機司機的 PDA 會收到推送通知</div>';
            html += '</div>';
            html += '<div class="flex items-start gap-2">';
            html += '<div class="bg-blue-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5">2</div>';
            html += '<div>PDA 顯示第一個任務：「請前往 ' + previewData.tasks[0].fromLocation + '」</div>';
            html += '</div>';
            html += '<div class="flex items-start gap-2">';
            html += '<div class="bg-blue-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5">3</div>';
            html += '<div>司機到達後掃描棧板條碼 → <span class="text-green-400 font-bold">嗶！確認正確</span></div>';
            html += '</div>';
            html += '<div class="flex items-start gap-2">';
            html += '<div class="bg-blue-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5">4</div>';
            html += '<div>載貨移動到 ' + previewData.tasks[0].toLocation + '，掃描儲位 → <span class="text-green-400 font-bold">嗶！任務完成</span></div>';
            html += '</div>';
            html += '<div class="flex items-start gap-2">';
            html += '<div class="bg-blue-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5">5</div>';
            html += '<div>自動顯示下一個任務，重複步驟 3-4</div>';
            html += '</div>';
            html += '<div class="flex items-start gap-2">';
            html += '<div class="bg-blue-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5">6</div>';
            html += '<div>所有任務完成後，PDA 顯示「🎉 調度單完成！」</div>';
            html += '</div>';
            html += '</div>';
            html += '</div>';

            html += '<div class="flex gap-3">';
            html += '<button onclick="confirmAndGenerate()" class="flex-1 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white py-3 px-6 rounded-lg font-bold text-lg shadow-lg">';
            html += '<i class="fa-solid fa-check-circle mr-2"></i>確認無誤，正式生成';
            html += '</button>';
            html += '<button onclick="closePreviewModal()" class="bg-slate-700 hover:bg-slate-600 text-white py-3 px-6 rounded-lg">';
            html += '<i class="fa-solid fa-times mr-2"></i>取消';
            html += '</button>';
            html += '</div>';

            html += '</div>';

            modal.innerHTML = html;
            modal.classList.remove('hidden');

            window.currentPreviewData = previewData;
        };

        window.confirmAndGenerate = async function() {
            if (!window.currentPreviewData) return;

            var previewData = window.currentPreviewData;

            var order = {
                orderNo: previewData.orderNo,
                productName: previewData.productName,
                createdAt: previewData.createdAt,
                tasks: previewData.tasks,
                operations: previewData.tasks.map(function(t, idx) {
                    return {
                        id: 'op-' + idx,
                        // 智能調度的任務都是把整板移到目標巷道的儲位
                        type: '移位',
                        from: t.fromLocation,
                        docId: t.fromDocId || '',
                        palletId: t.fromPalletId,
                        to: t.toLocation,
                        qty: t.quantity
                    };
                }),
                totalTasks: previewData.tasks.length,
                completedTasks: 0,
                completedOps: [],
                status: 'pending',
                createdBy: window.getOperatorName ? window.getOperatorName() : 'system'
            };

            try {
                await window.addDoc(window.collection(window.db, 'dispatchOrders'), order);
            } catch (err) {
                console.error('存到 Firebase 失敗:', err);
            }

            if (!window.dispatchOrders) window.dispatchOrders = [];
            window.dispatchOrders.push(order);

            closePreviewModal();

            setTimeout(function() {
                alert('✅ 調度單已生成！\n\n編號：' + order.orderNo + '\n任務數：' + order.totalTasks + ' 項\n\n📱 手機版已同步，堆高機手可立即執行');
                showDispatchOrder(order);
            }, 300);
        };

        window.closePreviewModal = function() {
            var modal = document.getElementById('dispatch-preview-modal');
            if (modal) modal.classList.add('hidden');
        };

        window.moveTaskUp = function(index) {
            if (!window.currentPreviewData || index === 0) return;
            var tasks = window.currentPreviewData.tasks;
            var temp = tasks[index];
            tasks[index] = tasks[index - 1];
            tasks[index - 1] = temp;
            tasks.forEach(function(task, i) {
                task.taskNo = i + 1;
            });
            showDispatchPreview(window.currentPreviewData);
        };

        window.moveTaskDown = function(index) {
            if (!window.currentPreviewData || index === window.currentPreviewData.tasks.length - 1) return;
            var tasks = window.currentPreviewData.tasks;
            var temp = tasks[index];
            tasks[index] = tasks[index + 1];
            tasks[index + 1] = temp;
            tasks.forEach(function(task, i) {
                task.taskNo = i + 1;
            });
            showDispatchPreview(window.currentPreviewData);
        };

        window.removeTask = function(index) {
            if (!window.currentPreviewData) return;
            if (!confirm('確定要移除此任務嗎？')) return;
            window.currentPreviewData.tasks.splice(index, 1);
            window.currentPreviewData.totalTasks = window.currentPreviewData.tasks.length;
            window.currentPreviewData.tasks.forEach(function(task, i) {
                task.taskNo = i + 1;
            });
            if (window.currentPreviewData.tasks.length === 0) {
                alert('所有任務已移除');
                closePreviewModal();
                return;
            }
            showDispatchPreview(window.currentPreviewData);
        };

        window.showDispatchOrder = function(order) {
            var modal = document.getElementById('dispatch-order-modal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'dispatch-order-modal';
                modal.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-50';
                document.body.appendChild(modal);
            }

            var html = '<div class="bg-slate-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">';
            html += '<div class="flex justify-between items-start mb-4">';
            html += '<div>';
            html += '<h2 class="text-2xl font-bold text-white">📋 調度單 ' + order.orderNo + '</h2>';
            html += '<div class="text-slate-400 text-sm mt-1">品名：' + order.productName + ' | 生成時間：' + order.createdAt + '</div>';
            html += '</div>';
            html += '<button onclick="closeDispatchOrderModal()" class="text-slate-400 hover:text-white text-2xl">&times;</button>';
            html += '</div>';

            html += '<div class="space-y-3 mb-4">';
            order.tasks.forEach(function(task) {
                var statusIcon = '⏱️';
                var statusText = '待執行';
                var statusColor = 'text-yellow-400';

                if (task.status === 'completed') {
                    statusIcon = '✅';
                    statusText = '已完成';
                    statusColor = 'text-green-400';
                }

                html += '<div class="bg-slate-900 border border-slate-700 rounded p-3">';
                html += '<div class="flex justify-between items-start mb-2">';
                html += '<div class="text-white font-bold">任務 ' + task.taskNo + '</div>';
                html += '<div class="' + statusColor + ' text-sm">' + statusIcon + ' ' + statusText + '</div>';
                html += '</div>';
                html += '<div class="grid grid-cols-3 gap-2 text-sm">';
                html += '<div><div class="text-slate-400">從</div><div class="text-white font-bold">' + task.fromLocation + '</div></div>';
                html += '<div class="text-center"><div class="text-slate-400">數量</div><div class="text-yellow-400 font-bold">' + task.quantity + ' 件</div></div>';
                html += '<div class="text-right"><div class="text-slate-400">到</div><div class="text-white font-bold">' + task.toLocation + '</div></div>';
                html += '</div>';
                html += '<div class="text-xs text-slate-500 mt-2">板號：' + task.fromPalletId + '</div>';
                html += '</div>';
            });
            html += '</div>';

            html += '<div class="bg-blue-900/30 border border-blue-600 rounded p-3 mb-4">';
            html += '<div class="text-blue-400 font-bold mb-1">📱 PDA 端操作流程</div>';
            html += '<div class="text-sm text-slate-300 space-y-1">';
            html += '<div>1️⃣ 堆高機司機 PDA 會收到此調度單</div>';
            html += '<div>2️⃣ 司機按順序執行每個任務</div>';
            html += '<div>3️⃣ 到達來源位 → 掃描棧板 (嗶！確認)</div>';
            html += '<div>4️⃣ 到達目標位 → 掃描儲位 (嗶！完成)</div>';
            html += '<div>5️⃣ 系統自動更新完成狀態</div>';
            html += '</div></div>';

            html += '<div class="flex gap-2">';
            html += '<button onclick="alert(\'請使用智能調度中心的列印功能\')" class="flex-1 bg-green-600 hover:bg-green-500 text-white py-2 px-4 rounded">';
            html += '<i class="fa-solid fa-print mr-2"></i>列印調度單</button>';
            html += '<button onclick="closeDispatchOrderModal()" class="bg-slate-700 hover:bg-slate-600 text-white py-2 px-4 rounded">關閉</button>';
            html += '</div>';

            html += '</div>';

            modal.innerHTML = html;
            modal.classList.remove('hidden');
        };

        window.closeDispatchOrderModal = function() {
            var modal = document.getElementById('dispatch-order-modal');
            if (modal) modal.classList.add('hidden');
        };

        window.cancelDispatch = function() {
            window.selectedProduct = null;
            window.currentSuggestion = null;
            var el = document.getElementById('dispatch-detail-panel');
            if (el) {
                el.innerHTML = '<div class="text-center text-slate-500 py-16"><i class="fa-solid fa-hand-pointer text-6xl mb-4 opacity-30"></i><p class="text-lg">請從左側選擇品項</p></div>';
            }
        };

        window.initSmartDispatch = function() {
            console.log('initSmartDispatch 被呼叫 - 自動開始分析');
            startDispatchAnalysis();
        };

        // ========== 調度中心步驟控制（簡化版）==========
        window.currentDispatchStep = 2; // 直接到步驟 2（選擇工單）

        window.goToDispatchStep = function(step) {
            console.log('goToDispatchStep 被呼叫, step =', step);
            document.querySelectorAll('.dispatch-step').forEach(function(el) {
                el.classList.add('hidden');
            });

            var targetStep = document.getElementById('dispatch-step-' + step);
            if (targetStep) targetStep.classList.remove('hidden');

            for (var i = 1; i <= 3; i++) {
                var indicator = document.getElementById('step-' + i + '-indicator');
                if (!indicator) continue;

                if (i < step) {
                    indicator.className = 'flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white';
                    indicator.querySelector('div').className = 'w-7 h-7 rounded-full bg-white text-emerald-600 flex items-center justify-center font-bold';
                } else if (i === step) {
                    indicator.className = 'flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white';
                    indicator.querySelector('div').className = 'w-7 h-7 rounded-full bg-white text-blue-600 flex items-center justify-center font-bold';
                } else {
                    indicator.className = 'flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 text-slate-400';
                    indicator.querySelector('div').className = 'w-7 h-7 rounded-full bg-slate-600 text-slate-400 flex items-center justify-center font-bold';
                }
            }

            window.currentDispatchStep = step;
        };

        window.startDispatchAnalysis = function() {
            document.getElementById('analysis-loading').classList.remove('hidden');

            setTimeout(function() {
                refreshDispatchAnalysis();
            }, 500);
        };

        window.refreshDispatchAnalysis = function() {
            console.log('開始調度分析...');
            var pallets = window.currentPallets ? window.currentPallets() : [];
            console.log('取得庫存資料:', pallets ? pallets.length : 0, '筆');

            if (!pallets || pallets.length === 0) {
                document.getElementById('dispatch-orders-container').innerHTML = '<div class="text-slate-500 text-center py-8 bg-slate-900/50 border border-slate-700 rounded-lg"><i class="fa-solid fa-database text-4xl mb-3 opacity-30"></i><p>無庫存資料</p><p class="text-xs mt-2">請先載入庫存資料</p></div>';
                return;
            }

            var productGroups = {};
            var skippedCount = 0;
            pallets.forEach(function(p) {
                if (!p.locationId) { skippedCount++; return; }
                var zone = p.locationId.split('-')[0];
                if (zone !== 'I' && zone !== 'J' && zone !== 'K') { skippedCount++; return; }

                var parsed = parseLocationId(p.locationId);
                var laneKey = parsed ? parsed.laneKey : p.locationId;

                var key = p.productName + '|' + (p.spec || '');
                if (!productGroups[key]) {
                    productGroups[key] = {
                        name: p.productName,
                        spec: p.spec || '',
                        items: [],
                        locations: new Set(),
                        lanes: new Set(),  // 巷道（如 I-A-01）
                        zones: new Set(),  // 儲區（如 I, J, K）
                        totalQty: 0
                    };
                }
                productGroups[key].items.push(p);
                productGroups[key].locations.add(p.locationId);
                productGroups[key].lanes.add(laneKey);
                productGroups[key].zones.add(zone);
                productGroups[key].totalQty += (p.quantity || 0);
            });

            var dispatchItems = [];
            var optimized = 0;
            var totalMoveOps = 0;
            var totalMergeOps = 0;
            var totalPartialOps = 0;

            Object.values(productGroups).forEach(function(g) {
                var laneCount = g.lanes.size;  // 巷道數
                var locCount = g.locations.size;

                // ========== 取得品項的板容量設定（方案 A+D）==========
                var productConfig = window.getProductPalletCapacity ? window.getProductPalletCapacity(g.name, g.spec) : null;
                var palletCapacity = null;
                var partialPercent = 50;
                var useAutoDetect = false;

                if (productConfig) {
                    palletCapacity = productConfig.palletCapacity;
                    partialPercent = productConfig.partialThreshold || 50;
                } else {
                    useAutoDetect = true;
                    var maxQty = 0;
                    g.items.forEach(function(p) {
                        if ((p.quantity || 0) > maxQty) maxQty = p.quantity;
                    });
                    palletCapacity = maxQty > 0 ? Math.ceil(maxQty * 1.1) : 45;
                }

                var partialThresholdQty = Math.floor(palletCapacity * partialPercent / 100);

                var laneGroups = {};
                g.items.forEach(function(p) {
                    var parsed = parseLocationId(p.locationId);
                    if (parsed) {
                        var laneKey = parsed.laneKey;
                        if (!laneGroups[laneKey]) laneGroups[laneKey] = { qty: 0, palletCount: 0, items: [] };
                        laneGroups[laneKey].qty += (p.quantity || 0);
                        laneGroups[laneKey].palletCount++;
                        laneGroups[laneKey].items.push(p);
                    }
                });

                var laneList = Object.keys(laneGroups);

                var mainLane = null;
                if (laneList.length > 0) {
                    mainLane = laneList.sort(function(a, b) {
                        return laneGroups[b].qty - laneGroups[a].qty;
                    })[0];
                }

                // ========== 第一步：餘板合併建議 ==========
                var partialMerges = [];

                var partialPallets = g.items.filter(function(p) {
                    var qty = p.quantity || 0;
                    return qty > 0 && qty < partialThresholdQty;
                });

                if (partialPallets.length > 1) {
                    partialPallets.sort(function(a, b) {
                        var qtyDiff = (b.quantity || 0) - (a.quantity || 0);
                        if (qtyDiff !== 0) return qtyDiff;
                        var batchA = a.batchNo || '';
                        var batchB = b.batchNo || '';
                        if (batchA !== batchB) return batchA.localeCompare(batchB);
                        var expA = a.expDate || a.expiryDate || '9999';
                        var expB = b.expDate || b.expiryDate || '9999';
                        return expA.localeCompare(expB);
                    });

                    var used = new Set();

                    for (var i = 0; i < partialPallets.length; i++) {
                        if (used.has(i)) continue;

                        var keepPallet = partialPallets[i];
                        var currentTotal = keepPallet.quantity || 0;
                        var mergeGroup = {
                            keep: {
                                docId: keepPallet.id || '',
                                palletId: keepPallet.palletId,
                                location: keepPallet.locationId,
                                qty: keepPallet.quantity,
                                batchNo: keepPallet.batchNo,
                                expDate: keepPallet.expDate || keepPallet.expiryDate
                            },
                            sources: []
                        };

                        used.add(i);

                        for (var j = i + 1; j < partialPallets.length; j++) {
                            if (used.has(j)) continue;

                            var sourcePallet = partialPallets[j];
                            var newTotal = currentTotal + (sourcePallet.quantity || 0);

                            if (newTotal <= palletCapacity) {
                                mergeGroup.sources.push({
                                    docId: sourcePallet.id || '',
                                    palletId: sourcePallet.palletId,
                                    location: sourcePallet.locationId,
                                    qty: sourcePallet.quantity,
                                    batchNo: sourcePallet.batchNo,
                                    expDate: sourcePallet.expDate || sourcePallet.expiryDate
                                });
                                currentTotal = newTotal;
                                used.add(j);
                            }
                        }

                        if (mergeGroup.sources.length > 0) {
                            mergeGroup.totalAfterMerge = currentTotal;
                            mergeGroup.freedLocations = mergeGroup.sources.length;
                            mergeGroup.palletCapacity = palletCapacity;
                            mergeGroup.useAutoDetect = useAutoDetect;
                            partialMerges.push(mergeGroup);
                        }
                    }
                }

                // ========== 第二步：孤立板移位建議 ==========
                var isolatedMoves = [];

                if (laneList.length >= 3 && mainLane) {
                    var mainLaneQty = laneGroups[mainLane].qty;
                    var totalQty = g.totalQty;

                    var mainWarehouse = mainLane.split('-')[0];

                    var mainLaneOccupied = new Set();
                    laneGroups[mainLane].items.forEach(function(item) {
                        mainLaneOccupied.add(item.locationId);
                    });

                    var mainLaneParts = mainLane.split('-');
                    var mainZone = mainLaneParts[0];
                    var mainRow = mainLaneParts[1];
                    var mainCol = mainLaneParts[2];

                    // 依 RACK_CONFIG 計算主巷道各層剩餘容量（混合板型），而不是「空的才算一個位置」
                    var levelPriority = window.RACK_CONFIG.LEVEL_PRIORITY || ['2F', '3F', '1F'];
                    var slotCounts = {};
                    levelPriority.forEach(function(level) {
                        var slotId = mainZone + '-' + mainRow + '-' + mainCol + '-' + level;
                        slotCounts[slotId] = { level: level, counts: {} };
                        pallets.forEach(function(p) {
                            if (p.locationId === slotId) window.addPalletToCounts(slotCounts[slotId].counts, p);
                        });
                    });
                    function pickSlotFor(p) {
                        var type = window.palletTypeOf(p);
                        for (var k = 0; k < levelPriority.length; k++) {
                            var id = mainZone + '-' + mainRow + '-' + mainCol + '-' + levelPriority[k];
                            var sc = slotCounts[id];
                            if (window.canLevelFit(sc.counts, sc.level, type)) {
                                sc.counts[type] = (sc.counts[type] || 0) + 1;
                                return id;
                            }
                        }
                        return null;
                    }
                    var hasRoom = Object.keys(slotCounts).some(function(id) {
                        var sc = slotCounts[id];
                        return window.canLevelFit(sc.counts, sc.level, 'scattered') || window.canLevelFit(sc.counts, sc.level, 'full');
                    });

                    if (!hasRoom) {
                    } else {
                        laneList.forEach(function(lane) {
                            if (lane === mainLane) return;

                            var laneData = laneGroups[lane];
                            var laneWarehouse = lane.split('-')[0];

                            var isReallyIsolated = laneData.palletCount === 1;
                            var isDifferentWarehouse = laneWarehouse !== mainWarehouse;

                            if (isReallyIsolated || (isDifferentWarehouse && laneData.palletCount <= 2)) {
                                {
                                    laneData.items.forEach(function(p) {
                                        var targetSlot = pickSlotFor(p);
                                        if (!targetSlot) return;

                                        var reason = isReallyIsolated ?
                                            '孤立板(僅1板)' :
                                            '跨區(' + laneWarehouse + '→' + mainWarehouse + ')';

                                        isolatedMoves.push({
                                            type: 'isolated',
                                            docId: p.id || '',
                                            palletId: p.palletId,
                                            from: p.locationId,
                                            fromLane: lane,
                                            toLane: mainLane,
                                            toSlot: targetSlot,
                                            qty: p.quantity,
                                            batchNo: p.batchNo,
                                            expDate: p.expDate || p.expiryDate,
                                            reason: reason
                                        });
                                    });
                                }
                            }
                        });
                    }
                }

                totalPartialOps += partialMerges.length;
                totalMoveOps += isolatedMoves.length;

                if (partialMerges.length === 0 && isolatedMoves.length === 0) {
                    optimized++;
                    return;
                }

                var priority = 'low';
                if (partialMerges.length >= 2 || isolatedMoves.length >= 3) priority = 'high';
                else if (partialMerges.length >= 1 || isolatedMoves.length >= 1) priority = 'medium';

                dispatchItems.push({
                    name: g.name,
                    spec: g.spec,
                    totalQty: g.totalQty,
                    laneCount: laneCount,
                    locCount: locCount,
                    mainLane: mainLane,
                    partialMerges: partialMerges,    // 第一步：餘板合併
                    isolatedMoves: isolatedMoves,    // 第二步：孤立移位
                    palletCapacity: palletCapacity,
                    useAutoDetect: useAutoDetect,
                    priority: priority
                });
            });

            dispatchItems.sort(function(a, b) {
                var priorityOrder = { high: 0, medium: 1, low: 2 };
                if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
                    return priorityOrder[a.priority] - priorityOrder[b.priority];
                }
                return (b.partialMerges.length + b.isolatedMoves.length) -
                       (a.partialMerges.length + a.isolatedMoves.length);
            });

            window._dispatchAnalysis = dispatchItems;

            var totalProducts = Object.keys(productGroups).length;
            var el1 = document.getElementById('stat-need-dispatch');
            var el3 = document.getElementById('stat-need-partial');
            var elFreed = document.getElementById('stat-freed-slots');
            var elOps = document.getElementById('stat-total-ops');
            var el5 = document.getElementById('stat-optimized');
            var el6 = document.getElementById('stat-total-products');

            var totalFreedSlots = 0;
            var totalOps = 0;
            dispatchItems.forEach(function(d) {
                if (d.partialMerges) {
                    d.partialMerges.forEach(function(m) {
                        totalFreedSlots += m.sources.length;
                        totalOps += m.sources.length; // 每個來源板要合併一次
                    });
                }
                if (d.isolatedMoves) {
                    totalOps += d.isolatedMoves.length;
                }
            });

            if (el1) el1.innerText = totalMoveOps;
            if (el3) el3.innerText = totalPartialOps;
            if (elFreed) elFreed.innerText = totalFreedSlots;
            if (elOps) elOps.innerText = totalOps;
            if (el5) el5.innerText = optimized;
            if (el6) el6.innerText = totalProducts;

            var barMerge = document.getElementById('stat-bar-merge');
            var barMove = document.getElementById('stat-bar-move');
            var barOps = document.getElementById('stat-bar-ops');
            var barFree = document.getElementById('stat-bar-free');
            if (barMerge) barMerge.innerText = totalPartialOps;
            if (barMove) barMove.innerText = totalMoveOps;
            if (barOps) barOps.innerText = totalOps;
            if (barFree) barFree.innerText = totalFreedSlots;

            console.log('調度分析完成:', {
                totalProducts: totalProducts,
                needDispatch: dispatchItems.length,
                optimized: optimized,
                partialOps: totalPartialOps,
                moveOps: totalMoveOps,
                freedSlots: totalFreedSlots
            });

            renderDispatchOrders(dispatchItems);

            var loadingEl = document.getElementById('analysis-loading');
            if (loadingEl) loadingEl.classList.add('hidden');
            goToDispatchStep(2);

            var btnStep3 = document.getElementById('btn-goto-step3');
            if (btnStep3) {
                if (dispatchItems.length === 0) {
                    btnStep3.disabled = true;
                    btnStep3.innerText = '無需調度';
                } else {
                    btnStep3.disabled = false;
                    btnStep3.innerHTML = '下一步：發布執行 <i class="fa-solid fa-arrow-right ml-2"></i>';
                }
            }
        };

        function renderDispatchOrders(items) {
            var container = document.getElementById('dispatch-orders-container');
            if (!container) return;

            if (items.length === 0) {
                container.innerHTML = '<div class="text-center py-12"><i class="fa-solid fa-check-circle text-emerald-400 text-5xl mb-4"></i><p class="text-emerald-400 text-xl font-bold">所有品項都已優化！</p><p class="text-slate-500 mt-2">目前無需執行調度作業</p></div>';
                updateDispatchSelectionUI();
                return;
            }

            var html = '<table class="w-full text-sm">';
            html += '<thead class="bg-slate-800 sticky top-0">';
            html += '<tr class="text-slate-400 text-xs">';
            html += '<th class="p-2 text-left w-8"><input type="checkbox" id="dispatch-select-all-table" onchange="toggleAllDispatchOrders()" class="w-4 h-4"></th>';
            html += '<th class="p-2 text-left">品項</th>';
            html += '<th class="p-2 text-center w-20">操作</th>';
            html += '<th class="p-2 text-left">明細</th>';
            html += '<th class="p-2 text-center w-16">釋放</th>';
            html += '<th class="p-2 text-center w-12"></th>';
            html += '</tr></thead><tbody>';

            var orderNo = 1;
            items.forEach(function(item, idx) {
                var hasMerge = item.partialMerges && item.partialMerges.length > 0;
                var hasMove = item.isolatedMoves && item.isolatedMoves.length > 0;
                var mergeCount = 0, moveCount = 0, freeCount = 0;

                if (hasMerge) {
                    item.partialMerges.forEach(function(g) {
                        mergeCount += g.sources.length;
                        freeCount += g.sources.length;
                    });
                }
                if (hasMove) moveCount = item.isolatedMoves.length;

                html += '<tr class="border-b border-slate-700 hover:bg-slate-800/50 dispatch-order-item" data-idx="' + idx + '">';

                html += '<td class="p-2"><input type="checkbox" class="dispatch-order-checkbox w-4 h-4 accent-purple-500" data-idx="' + idx + '" onchange="updateDispatchSelectionUI()"></td>';

                html += '<td class="p-2">';
                html += '<div class="flex items-center gap-2">';
                html += '<span class="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">' + String(orderNo).padStart(3, '0') + '</span>';
                html += '<span class="text-white font-bold">' + item.name + '</span>';
                if (item.spec) html += '<span class="text-slate-500 text-xs">(' + item.spec + ')</span>';
                html += '</div>';
                html += '<div class="text-[10px] text-slate-500 mt-0.5">容量' + item.palletCapacity + ' · 庫存' + item.totalQty + ' · ' + item.laneCount + '巷道</div>';
                html += '</td>';

                html += '<td class="p-2 text-center">';
                if (mergeCount > 0) html += '<span class="inline-block bg-orange-900/50 text-orange-400 text-[10px] px-1.5 py-0.5 rounded border border-orange-700 mr-1">併' + mergeCount + '</span>';
                if (moveCount > 0) html += '<span class="inline-block bg-blue-900/50 text-blue-400 text-[10px] px-1.5 py-0.5 rounded border border-blue-700">移' + moveCount + '</span>';
                html += '</td>';

                html += '<td class="p-2 text-xs">';
                if (hasMerge) {
                    item.partialMerges.forEach(function(g, gIdx) {
                        var srcLocs = g.sources.map(function(s) { return s.location; }).join(', ');
                        html += '<div class="text-orange-300 mb-0.5">';
                        html += '<span class="text-orange-500">→</span> ' + srcLocs + ' <span class="text-slate-500">併入</span> <span class="text-emerald-400 font-mono">' + g.keep.location + '</span>';
                        html += ' <span class="text-slate-600">(' + g.totalAfterMerge + '件)</span>';
                        html += '</div>';
                    });
                }
                if (hasMove) {
                    item.isolatedMoves.forEach(function(m) {
                        html += '<div class="text-blue-300 mb-0.5">';
                        html += '<span class="text-blue-500">→</span> <span class="font-mono">' + m.from + '</span> <span class="text-slate-500">移至</span> <span class="text-emerald-400 font-mono">' + m.toSlot + '</span>';
                        html += ' <span class="text-slate-600">(' + m.qty + '件)</span>';
                        html += '</div>';
                    });
                }
                html += '</td>';

                html += '<td class="p-2 text-center">';
                if (freeCount > 0) {
                    html += '<span class="text-emerald-400 font-bold">' + freeCount + '</span>';
                } else {
                    html += '<span class="text-slate-600">-</span>';
                }
                html += '</td>';

                html += '<td class="p-2 text-center">';
                html += '<button onclick="printSingleDispatchOrder(' + idx + ')" class="text-slate-400 hover:text-white"><i class="fa-solid fa-print"></i></button>';
                html += '</td>';

                html += '</tr>';
                orderNo++;
            });

            html += '</tbody></table>';
            container.innerHTML = html;
            updateDispatchSelectionUI();
        }

        window.printSingleDispatchOrder = function(idx) {
            if (!window._dispatchAnalysis) {
                alert('請先執行調度分析');
                return;
            }
            var item = window._dispatchAnalysis[idx];
            if (!item) {
                alert('找不到工單資料');
                return;
            }
            printDispatchOrder([item], '調度工單 - ' + item.name);
        };

        // ========== 調度工單勾選功能 ==========
        window.toggleAllDispatchOrders = function() {
            var selectAll = document.getElementById('dispatch-select-all');
            var selectAllTable = document.getElementById('dispatch-select-all-table');
            var isChecked = selectAll ? selectAll.checked : (selectAllTable ? selectAllTable.checked : false);
            var checkboxes = document.querySelectorAll('.dispatch-order-checkbox');
            checkboxes.forEach(function(cb) {
                cb.checked = isChecked;
            });
            updateDispatchSelectionUI();
        };

        window.updateDispatchSelectionUI = function() {
            var checkboxes = document.querySelectorAll('.dispatch-order-checkbox:checked');
            var count = checkboxes.length;
            var total = document.querySelectorAll('.dispatch-order-checkbox').length;

            var countEl = document.getElementById('dispatch-selected-count');
            if (countEl) countEl.innerText = count;

            var publishCountEl = document.getElementById('publish-count');
            if (publishCountEl) publishCountEl.innerText = count;

            var selectAll = document.getElementById('dispatch-select-all');
            if (selectAll) {
                selectAll.checked = count === total && total > 0;
                selectAll.indeterminate = count > 0 && count < total;
            }

            var btnPublish = document.getElementById('btn-publish-mobile');
            var btnPrint = document.getElementById('btn-print-selected');
            if (btnPublish) btnPublish.disabled = count === 0;
            if (btnPrint) btnPrint.disabled = count === 0;
        };

        window.getSelectedDispatchIndices = function() {
            var indices = [];
            document.querySelectorAll('.dispatch-order-checkbox:checked').forEach(function(cb) {
                indices.push(parseInt(cb.dataset.idx));
            });
            return indices;
        };

        window.publishSelectedToMobile = async function() {
            var indices = getSelectedDispatchIndices();
            if (indices.length === 0) {
                alert('請先勾選要發布的工單');
                return;
            }

            var items = indices.map(function(idx) { return window._dispatchAnalysis[idx]; }).filter(Boolean);

            var totalOps = 0;
            items.forEach(function(item) {
                if (item.partialMerges) {
                    item.partialMerges.forEach(function(g) { totalOps += g.sources.length; });
                }
                if (item.isolatedMoves) totalOps += item.isolatedMoves.length;
            });

            if (!confirm('確定要發布 ' + items.length + ' 個調度工單到手機？\n\n共 ' + totalOps + ' 項操作\n\n發布後，堆高機手的手機會立即收到通知')) {
                return;
            }

            var successCount = 0;
            var timestamp = new Date().toISOString();
            var batchNo = 'DSP-' + Date.now().toString().slice(-8);

            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                var operations = [];
                var opIndex = 0;

                if (item.partialMerges) {
                    item.partialMerges.forEach(function(group) {
                        group.sources.forEach(function(src) {
                            operations.push({
                                id: 'op-' + opIndex++,
                                type: '合併',
                                from: src.location,
                                palletId: src.palletId || '',
                                docId: src.docId || '',
                                toDocId: group.keep.docId || '',
                                toPalletId: group.keep.palletId || '',
                                qty: src.qty,
                                to: group.keep.location
                            });
                        });
                    });
                }

                if (item.isolatedMoves) {
                    item.isolatedMoves.forEach(function(m) {
                        operations.push({
                            id: 'op-' + opIndex++,
                            type: '移位',
                            from: m.from,
                            palletId: m.palletId || '',
                            docId: m.docId || '',
                            qty: m.qty,
                            to: m.toSlot,
                            reason: m.reason
                        });
                    });
                }

                if (operations.length === 0) continue;

                var order = {
                    orderNo: batchNo + '-' + String(i + 1).padStart(3, '0'),
                    batchNo: batchNo,
                    productName: item.name,
                    spec: item.spec || '',
                    operations: operations,
                    totalOps: operations.length,
                    completedOps: [],
                    status: 'pending',
                    createdAt: timestamp,
                    createdBy: window.getOperatorName ? window.getOperatorName() : 'system'
                };

                try {
                    await window.addDoc(window.collection(window.db, 'dispatchOrders'), order);
                    successCount++;
                } catch (err) {
                    console.error('發布工單失敗:', err);
                }
            }

            if (successCount > 0) {
                alert('✅ 已發布 ' + successCount + ' 個調度工單到手機！\n\n批次編號：' + batchNo + '\n\n📱 堆高機手的手機會收到通知');

                document.querySelectorAll('.dispatch-order-checkbox').forEach(function(cb) { cb.checked = false; });
                document.getElementById('dispatch-select-all').checked = false;
                updateDispatchSelectionUI();
            } else {
                alert('❌ 發布失敗，請檢查網路連線');
            }
        };

        window.printSelectedDispatchOrders = function() {
            var indices = getSelectedDispatchIndices();
            if (indices.length === 0) {
                alert('請先勾選要列印的工單');
                return;
            }

            var items = indices.map(function(idx) { return window._dispatchAnalysis[idx]; }).filter(Boolean);
            printDispatchOrdersInternal(items, '調度工單（選取）');
        };

        window.publishDispatchToMobile = async function() {
            if (!window._dispatchAnalysis || window._dispatchAnalysis.length === 0) {
                alert('目前沒有調度工單可發布\n\n請先等待系統分析完成');
                return;
            }

            var items = window._dispatchAnalysis;
            var totalOps = 0;
            items.forEach(function(item) {
                if (item.partialMerges) {
                    item.partialMerges.forEach(function(g) { totalOps += g.sources.length; });
                }
                if (item.isolatedMoves) totalOps += item.isolatedMoves.length;
            });

            if (!confirm('確定要發布 ' + items.length + ' 個調度工單到手機？\n\n共 ' + totalOps + ' 項操作\n\n發布後，堆高機手的手機會立即收到通知')) {
                return;
            }

            var successCount = 0;
            var timestamp = new Date().toISOString();
            var batchNo = 'DSP-' + Date.now().toString().slice(-8);

            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                var operations = [];
                var opIndex = 0;

                if (item.partialMerges) {
                    item.partialMerges.forEach(function(group) {
                        group.sources.forEach(function(src) {
                            operations.push({
                                id: 'op-' + opIndex++,
                                type: '合併',
                                from: src.location,
                                palletId: src.palletId || '',
                                docId: src.docId || '',
                                toDocId: group.keep.docId || '',
                                toPalletId: group.keep.palletId || '',
                                qty: src.qty,
                                to: group.keep.location
                            });
                        });
                    });
                }

                if (item.isolatedMoves) {
                    item.isolatedMoves.forEach(function(m) {
                        operations.push({
                            id: 'op-' + opIndex++,
                            type: '移位',
                            from: m.from,
                            palletId: m.palletId || '',
                            docId: m.docId || '',
                            qty: m.qty,
                            to: m.toSlot,
                            reason: m.reason
                        });
                    });
                }

                if (operations.length === 0) continue;

                var order = {
                    orderNo: batchNo + '-' + String(i + 1).padStart(3, '0'),
                    batchNo: batchNo,
                    productName: item.name,
                    spec: item.spec || '',
                    operations: operations,
                    totalOps: operations.length,
                    completedOps: [],
                    status: 'pending',
                    createdAt: timestamp,
                    createdBy: window.getOperatorName ? window.getOperatorName() : 'system'
                };

                try {
                    await window.addDoc(window.collection(window.db, 'dispatchOrders'), order);
                    successCount++;
                } catch (err) {
                    console.error('發布工單失敗:', err);
                }
            }

            if (successCount > 0) {
                alert('✅ 已發布 ' + successCount + ' 個調度工單到手機！\n\n批次編號：' + batchNo + '\n\n📱 堆高機手的手機會收到通知');

                var section = document.getElementById('published-orders-section');
                var list = document.getElementById('published-orders-list');
                if (section && list) {
                    section.classList.remove('hidden');
                    list.innerHTML += '<div class="flex items-center justify-between bg-slate-800 rounded-lg p-3">' +
                        '<div class="flex items-center gap-3">' +
                        '<i class="fa-solid fa-check-circle text-green-400"></i>' +
                        '<span class="text-white font-mono">' + batchNo + '</span>' +
                        '<span class="text-slate-400 text-sm">' + successCount + ' 個工單</span>' +
                        '</div>' +
                        '<span class="text-slate-500 text-sm">' + new Date().toLocaleTimeString('zh-TW') + '</span>' +
                        '</div>';
                }
            } else {
                alert('❌ 發布失敗，請檢查網路連線');
            }
        };

        window.printAllDispatchOrders = function() {
            if (!window._dispatchAnalysis) {
                alert('請先執行調度分析（點擊「開始分析」按鈕）');
                return;
            }
            var items = window._dispatchAnalysis;
            if (items.length === 0) {
                alert('目前無需要調度的工單（所有品項都已優化）');
                return;
            }
            printDispatchOrdersInternal(items, '調度工單總表');
        };

        function printDispatchOrdersInternal(items, title) {
            var html = '<style>';
                html += '.page-header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 15px; }';
                html += '.page-header h1 { font-size: 18px; margin: 0; }';
                html += '.page-header .date { font-size: 10px; color: #666; }';
                html += '.order { border: 2px solid #333; margin-bottom: 15px; page-break-inside: avoid; }';
                html += '.order-header { background: #333; color: white; padding: 8px 12px; font-size: 13px; font-weight: bold; }';
                html += '.order-info { background: #f5f5f5; padding: 6px 12px; border-bottom: 1px solid #ccc; font-size: 10px; }';
                html += '.order-info span { margin-right: 15px; }';
                html += '.section { border-top: 1px solid #ccc; }';
                html += '.section-header { background: #eee; padding: 5px 12px; font-weight: bold; font-size: 11px; }';
                html += '.section-header.merge { background: #fff3cd; }';
                html += '.section-header.move { background: #cce5ff; }';
                html += 'table { width: 100%; border-collapse: collapse; }';
                html += 'th { background: #f0f0f0; text-align: left; padding: 5px 8px; font-weight: normal; font-size: 10px; border-bottom: 1px solid #ccc; }';
                html += 'td { padding: 6px 8px; border-bottom: 1px solid #eee; }';
                html += '.from { color: #c00; font-weight: bold; font-family: monospace; }';
                html += '.to { color: #060; font-weight: bold; font-family: monospace; }';
                html += '.qty { text-align: right; font-weight: bold; }';
                html += '.checkbox { width: 18px; height: 18px; border: 2px solid #333; display: inline-block; }';
                html += '.result-row { background: #e8f5e9; font-weight: bold; }';
                html += '.signature { margin-top: 20px; display: flex; justify-content: space-around; }';
                html += '.signature div { text-align: center; }';
                html += '.signature .line { width: 120px; border-bottom: 1px solid #000; height: 30px; margin-bottom: 5px; }';
                html += '</style>';

                html += '<div class="page-header">';
                html += '<h1>' + title + '</h1>';
                html += '<div class="date">產生時間：' + new Date().toLocaleString('zh-TW') + '</div>';
                html += '</div>';

            items.forEach(function(item, idx) {
                html += '<div class="order">';
                html += '<div class="order-header">工單 #' + String(idx + 1).padStart(3, '0') + '　' + item.name + (item.spec ? ' (' + item.spec + ')' : '') + '</div>';

                html += '<div class="order-info">';
                html += '<span>板容量：<b>' + item.palletCapacity + '</b> 件/板</span>';
                html += '<span>餘板標準：<b>&lt;' + Math.floor(item.palletCapacity * 0.5) + '</b>件</span>';
                html += '<span>總庫存：<b>' + item.totalQty + '</b> 件</span>';
                html += '<span>主巷道：<b>' + (item.mainLane || '-') + '</b></span>';
                html += '</div>';

                if (item.partialMerges && item.partialMerges.length > 0) {
                    item.partialMerges.forEach(function(group, gIdx) {
                        html += '<div class="section">';
                        html += '<div class="section-header merge">【合併作業 #' + (gIdx + 1) + '】完成後釋放 ' + group.sources.length + ' 個儲位</div>';
                        html += '<table>';
                        html += '<tr><th style="width:40px">步驟</th><th>來源儲位</th><th>板號</th><th style="width:60px">數量</th><th style="width:30px">→</th><th>目標儲位</th><th>說明</th><th style="width:50px">完成</th></tr>';

                        group.sources.forEach(function(src, sIdx) {
                            html += '<tr>';
                            html += '<td>' + (sIdx + 1) + '</td>';
                            html += '<td class="from">' + src.location + '</td>';
                            html += '<td>' + (src.palletId || '-') + '</td>';
                            html += '<td class="qty">' + src.qty + ' 件</td>';
                            html += '<td>→</td>';
                            html += '<td class="to">' + group.keep.location + '</td>';
                            html += '<td>合併至此，來源清空</td>';
                            html += '<td><span class="checkbox"></span></td>';
                            html += '</tr>';
                        });

                        html += '<tr class="result-row">';
                        html += '<td colspan="3">合併後結果</td>';
                        html += '<td class="qty">' + group.totalAfterMerge + ' 件</td>';
                        html += '<td></td>';
                        html += '<td class="to">' + group.keep.location + '</td>';
                        html += '<td>' + Math.round(group.totalAfterMerge / item.palletCapacity * 100) + '% 板容量</td>';
                        html += '<td></td>';
                        html += '</tr>';
                        html += '</table></div>';
                    });
                }

                if (item.isolatedMoves && item.isolatedMoves.length > 0) {
                    html += '<div class="section">';
                    html += '<div class="section-header move">【移位作業】移至主巷道 ' + item.mainLane + ' 集中存放</div>';
                    html += '<table>';
                    html += '<tr><th style="width:40px">步驟</th><th>來源儲位</th><th>板號</th><th style="width:60px">數量</th><th style="width:30px">→</th><th>目標儲位</th><th>移位原因</th><th style="width:50px">完成</th></tr>';

                    item.isolatedMoves.forEach(function(m, mIdx) {
                        html += '<tr>';
                        html += '<td>' + (mIdx + 1) + '</td>';
                        html += '<td class="from">' + m.from + '</td>';
                        html += '<td>' + (m.palletId || '-') + '</td>';
                        html += '<td class="qty">' + m.qty + ' 件</td>';
                        html += '<td>→</td>';
                        html += '<td class="to">' + m.toSlot + '</td>';
                        html += '<td>' + m.reason + '</td>';
                        html += '<td><span class="checkbox"></span></td>';
                        html += '</tr>';
                    });
                    html += '</table></div>';
                }

                html += '</div>';
            });

            html += '<div class="signature">';
            html += '<div><div class="line"></div>製單人</div>';
            html += '<div><div class="line"></div>執行人</div>';
            html += '<div><div class="line"></div>確認人</div>';
            html += '</div>';

            openPrintPreview(html, title, 1000, 800);
        }

        // ========== 調度工單執行系統 ==========

        window._dispatchExecData = {
            currentOrderIdx: -1,
            operations: [],      // 當前工單的所有操作
            completedIds: []     // 已完成的操作ID
        };

        window.openDispatchExecuteModal = function() {
            var items = window._dispatchAnalysis;
            if (!items || items.length === 0) {
                alert('目前無調度工單可執行\n請先點擊「重新分析」產生工單');
                return;
            }

            var select = document.getElementById('dispatch-exec-order-select');
            select.innerHTML = '<option value="">-- 請選擇工單 --</option>';
            items.forEach(function(item, idx) {
                var opsCount = (item.partialMerges ? item.partialMerges.reduce(function(sum, m) { return sum + m.sources.length; }, 0) : 0) +
                               (item.isolatedMoves ? item.isolatedMoves.length : 0);
                select.innerHTML += '<option value="' + idx + '">工單 #' + String(idx + 1).padStart(3, '0') + ' - ' + item.name + ' (' + opsCount + '項操作)</option>';
            });

            window._dispatchExecData = { currentOrderIdx: -1, operations: [], completedIds: [] };
            document.getElementById('dispatch-exec-list').innerHTML = '<tr><td colspan="9" class="text-center text-slate-500 py-8">請選擇工單</td></tr>';
            document.getElementById('dispatch-exec-progress').innerText = '0/0';
            document.getElementById('dispatch-scan-input').value = '';
            document.getElementById('dispatch-scan-result').classList.add('hidden');
            document.getElementById('dispatch-batch-mode').checked = false;
            toggleDispatchBatchMode();

            document.getElementById('modal-dispatch-execute').classList.remove('hidden');

            setTimeout(function() {
                document.getElementById('dispatch-scan-input').focus();
            }, 100);
        };

        window.closeDispatchExecuteModal = function() {
            document.getElementById('modal-dispatch-execute').classList.add('hidden');
        };

        window.toggleDispatchBatchMode = function() {
            var batchMode = document.getElementById('dispatch-batch-mode').checked;
            var scanArea = document.getElementById('dispatch-scan-area');
            var batchHeader = document.getElementById('dispatch-batch-header');
            var batchExecBtn = document.getElementById('btn-dispatch-batch-exec');

            if (batchMode) {
                scanArea.style.display = 'none';
                batchHeader.style.display = '';
                batchExecBtn.classList.remove('hidden');
                document.getElementById('dispatch-exec-subtitle').innerText = '勾選已完成項目後批次執行';
            } else {
                scanArea.style.display = '';
                batchHeader.style.display = 'none';
                batchExecBtn.classList.add('hidden');
                document.getElementById('dispatch-exec-subtitle').innerText = '掃描板號確認執行';
            }

            renderDispatchExecList();
        };

        window.loadDispatchExecOrder = function() {
            var select = document.getElementById('dispatch-exec-order-select');
            var idx = parseInt(select.value);

            if (isNaN(idx) || idx < 0) {
                document.getElementById('dispatch-exec-list').innerHTML = '<tr><td colspan="9" class="text-center text-slate-500 py-8">請選擇工單</td></tr>';
                document.getElementById('dispatch-exec-progress').innerText = '0/0';
                return;
            }

            var item = window._dispatchAnalysis[idx];
            if (!item) return;

            var operations = [];
            var opIdx = 0;

            if (item.partialMerges) {
                item.partialMerges.forEach(function(group, gIdx) {
                    group.sources.forEach(function(src, sIdx) {
                        operations.push({
                            id: 'merge-' + gIdx + '-' + sIdx,
                            type: 'merge',
                            typeName: '合併',
                            from: src.location,
                            docId: src.docId || '',
                            palletId: src.palletId || '',
                            qty: src.qty,
                            to: group.keep.location,
                            toSlotSuggested: group.keep.location,
                            note: '合併至保留板',
                            completed: false,
                            groupIdx: gIdx,
                            sourceIdx: sIdx,
                            keepPallet: group.keep
                        });
                        opIdx++;
                    });
                });
            }

            if (item.isolatedMoves) {
                item.isolatedMoves.forEach(function(m, mIdx) {
                    operations.push({
                        id: 'move-' + mIdx,
                        type: 'move',
                        typeName: '移位',
                        from: m.from,
                        docId: m.docId || '',
                        palletId: m.palletId || '',
                        qty: m.qty,
                        to: m.toSlot,
                        toSlotSuggested: m.toSlot,
                        note: m.reason,
                        completed: false
                    });
                    opIdx++;
                });
            }

            window._dispatchExecData = {
                currentOrderIdx: idx,
                currentItem: item,
                operations: operations,
                completedIds: []
            };

            renderDispatchExecList();
            updateDispatchProgress();

            document.getElementById('dispatch-scan-input').focus();
        };

        function renderDispatchExecList() {
            var tbody = document.getElementById('dispatch-exec-list');
            var ops = window._dispatchExecData.operations;
            var batchMode = document.getElementById('dispatch-batch-mode').checked;

            if (ops.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" class="text-center text-slate-500 py-8">請選擇工單</td></tr>';
                return;
            }

            var html = '';
            ops.forEach(function(op) {
                var statusBadge = op.completed
                    ? '<span class="badge badge-green"><i class="fa-solid fa-check mr-1"></i>完成</span>'
                    : '<span class="badge badge-yellow"><i class="fa-solid fa-clock mr-1"></i>待執行</span>';
                var rowClass = op.completed ? 'bg-emerald-900/20' : '';
                var typeColor = op.type === 'merge' ? 'orange' : 'blue';

                html += '<tr class="' + rowClass + ' border-b border-slate-700/50 hover:bg-slate-800/50">';

                if (batchMode) {
                    html += '<td class="p-2"><input type="checkbox" class="dispatch-op-check w-4 h-4" data-id="' + op.id + '"' + (op.completed ? ' checked disabled' : '') + '></td>';
                }

                html += '<td class="p-2">' + statusBadge + '</td>';
                html += '<td class="p-2"><span class="badge badge-' + typeColor + '">' + op.typeName + '</span></td>';
                html += '<td class="p-2 font-mono text-red-400 font-bold">' + op.from + '</td>';
                html += '<td class="p-2 font-mono text-slate-300">' + (op.palletId || '-') + '</td>';
                html += '<td class="p-2 text-right text-yellow-400 font-bold">' + op.qty + '</td>';
                html += '<td class="p-2 text-center text-slate-500"><i class="fa-solid fa-arrow-right"></i></td>';
                html += '<td class="p-2 font-mono text-emerald-400 font-bold">' + op.to + '</td>';
                html += '<td class="p-2 text-slate-400 text-xs">' + op.note + '</td>';
                html += '</tr>';
            });

            tbody.innerHTML = html;
        }

        function updateDispatchProgress() {
            var ops = window._dispatchExecData.operations;
            var completed = ops.filter(function(op) { return op.completed; }).length;
            document.getElementById('dispatch-exec-progress').innerText = completed + '/' + ops.length;
        }

        window.confirmDispatchScan = function() {
            var input = document.getElementById('dispatch-scan-input');
            var scanned = input.value.trim();
            var resultEl = document.getElementById('dispatch-scan-result');

            if (!scanned) {
                resultEl.innerHTML = '<span class="text-yellow-400"><i class="fa-solid fa-exclamation-triangle mr-1"></i>請輸入板號</span>';
                resultEl.classList.remove('hidden');
                return;
            }

            var ops = window._dispatchExecData.operations;
            var found = null;

            for (var i = 0; i < ops.length; i++) {
                if (!ops[i].completed) {
                    if (ops[i].palletId === scanned || ops[i].from === scanned) {
                        found = ops[i];
                        break;
                    }
                }
            }

            if (!found) {
                resultEl.innerHTML = '<span class="text-red-400"><i class="fa-solid fa-times-circle mr-1"></i>找不到符合的待執行項目：' + scanned + '</span>';
                resultEl.classList.remove('hidden');
                input.select();
                return;
            }

            executeDispatchOperation(found);

            resultEl.innerHTML = '<span class="text-emerald-400"><i class="fa-solid fa-check-circle mr-1"></i>已確認：' + found.from + ' → ' + found.to + '</span>';
            resultEl.classList.remove('hidden');

            input.value = '';
            input.focus();
        };

        window.toggleAllDispatchChecks = function() {
            var checkAll = document.getElementById('dispatch-check-all').checked;
            document.querySelectorAll('.dispatch-op-check:not(:disabled)').forEach(function(cb) {
                cb.checked = checkAll;
            });
        };

        window.executeDispatchBatch = async function() {
            var checkboxes = document.querySelectorAll('.dispatch-op-check:checked:not(:disabled)');
            if (checkboxes.length === 0) {
                alert('請勾選要執行的項目');
                return;
            }

            if (!confirm('確定要執行勾選的 ' + checkboxes.length + ' 項操作？\n\n系統將自動更新庫存位置。')) {
                return;
            }

            var ops = window._dispatchExecData.operations;
            var ids = [];
            checkboxes.forEach(function(cb) { ids.push(cb.dataset.id); });

            for (var i = 0; i < ops.length; i++) {
                if (ids.indexOf(ops[i].id) >= 0 && !ops[i].completed) {
                    await executeDispatchOperation(ops[i]);
                }
            }

            alert('✅ 已執行 ' + ids.length + ' 項操作');
        };

        async function executeDispatchOperation(op) {
            try {
                if (op.type === 'merge') {
                    var keep = op.keepPallet || {};
                    var sourceRef = await window.resolvePalletRef(op.docId, op.palletId, op.from);
                    var targetRef = await window.resolvePalletRef(keep.docId, keep.palletId, keep.location);
                    await window.mergePalletsTx(sourceRef, targetRef, { note: op.note || ('合併至 ' + op.to) });

                } else if (op.type === 'move') {
                    var palletRef = await window.resolvePalletRef(op.docId, op.palletId, op.from);
                    await window.movePalletTx(palletRef, op.to, { note: op.note || '' });
                }

                op.completed = true;
                window._dispatchExecData.completedIds.push(op.id);

                renderDispatchExecList();
                updateDispatchProgress();

            } catch (err) {
                console.error('執行操作失敗:', err);
                alert('操作失敗: ' + err.message);
            }
        }

        window.completeDispatchOrder = function() {
            var ops = window._dispatchExecData.operations;
            var completed = ops.filter(function(op) { return op.completed; }).length;

            if (completed === 0) {
                alert('尚未執行任何操作');
                return;
            }

            var remaining = ops.length - completed;
            var msg = '工單執行摘要：\n\n';
            msg += '✅ 已完成：' + completed + ' 項\n';
            if (remaining > 0) {
                msg += '⏳ 未完成：' + remaining + ' 項\n';
            }
            msg += '\n確定要結束此工單嗎？';

            if (!confirm(msg)) return;

            if (window.loadInventory) window.loadInventory();

            closeDispatchExecuteModal();

            setTimeout(function() {
                if (window.refreshDispatchAnalysis) window.refreshDispatchAnalysis();
            }, 500);

            alert('✅ 工單已完成！\n\n庫存已更新，系統將重新分析調度需求。');
        };

