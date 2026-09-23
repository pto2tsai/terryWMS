// ============================================================
// js/08-analysis-shipping.js — 出貨分析、熱力圖、訂單出貨、板號異動、現場掃描、備案查詢
// 由原 app.js 第 10949–12520 行拆出；各檔依 index.html 的順序載入，共用全域（window）
// ============================================================
        // ========== 品項出貨分析 ==========

        window.setAnalysisDateRange = function(range) {
            var today = new Date();
            var fromDate = new Date();

            switch(range) {
                case 'week':
                    fromDate.setDate(today.getDate() - 7);
                    break;
                case 'month':
                    fromDate.setDate(today.getDate() - 30);
                    break;
                case 'quarter':
                    fromDate.setDate(today.getDate() - 90);
                    break;
            }

            document.getElementById('analysis-date-from').value = fromDate.toLocalYMD();
            document.getElementById('analysis-date-to').value = today.toLocalYMD();
            refreshProductAnalysis();
        };

        window.initProductAnalysis = function() {
            setAnalysisDateRange('month');
        };

        window.refreshProductAnalysis = async function() {
            var dateFrom = document.getElementById('analysis-date-from').value;
            var dateTo = document.getElementById('analysis-date-to').value;
            var sortBy = document.getElementById('analysis-sort').value;
            var limitCount = parseInt(document.getElementById('analysis-limit').value) || 10;

            try {
                if (!window.db || !window.collection || !window.getDocs) {
                    alert('Firebase 尚未初始化');
                    return;
                }

                var logsRef = window.collection(window.db, 'inventoryLogs');
                var snapshot = await window.getDocs(logsRef);

                var filteredDocs = [];
                snapshot.forEach(function(doc) {
                    var data = doc.data();
                    var docType = data.type || '';

                    if (docType !== 'outbound' && docType !== 'picking') return;

                    var ts = data.timestamp || '';
                    if (typeof ts === 'object' && ts.toDate) {
                        ts = ts.toDate().toISOString();
                    }

                    if (dateFrom && ts < window.localDayStartISO(dateFrom)) return;
                    if (dateTo && ts > window.localDayEndISO(dateTo)) return;

                    filteredDocs.push({ id: doc.id, data: function() { return data; } });
                });

                var snapshot = { forEach: function(fn) { filteredDocs.forEach(fn); } };

                var productStats = {};
                var totalCount = 0;
                var totalQty = 0;

                snapshot.forEach(function(doc) {
                    var data = doc.data();
                    var key = (data.productName || '未知') + '|' + (data.spec || '');

                    if (!productStats[key]) {
                        productStats[key] = {
                            name: data.productName || '未知',
                            spec: data.spec || '',
                            count: 0,
                            qty: 0
                        };
                    }

                    productStats[key].count++;
                    productStats[key].qty += (data.quantity || 0);
                    totalCount++;
                    totalQty += (data.quantity || 0);
                });

                var rankingList = Object.values(productStats);
                rankingList.sort(function(a, b) {
                    return sortBy === 'count' ? (b.count - a.count) : (b.qty - a.qty);
                });

                if (limitCount < 100) {
                    rankingList = rankingList.slice(0, limitCount);
                }

                document.getElementById('pa-stat-products').textContent = Object.keys(productStats).length;
                document.getElementById('pa-stat-total-count').textContent = totalCount;
                document.getElementById('pa-stat-total-qty').textContent = totalQty.toLocaleString();
                document.getElementById('pa-stat-avg').textContent = totalCount > 0 ? Math.round(totalQty / totalCount) : 0;

                renderProductBarChart(rankingList, sortBy, totalQty);

                renderProductRanking(rankingList, totalQty);

            } catch (e) {
                console.error('分析失敗:', e);
                alert('分析失敗: ' + e.message);
            }
        };

        function renderProductBarChart(data, sortBy, totalQty) {
            var container = document.getElementById('pa-bar-chart');

            if (data.length === 0) {
                container.innerHTML = '<div class="text-center text-slate-500 py-16"><i class="fa-solid fa-inbox text-4xl mb-3 opacity-30"></i><p>此期間無出貨記錄</p></div>';
                return;
            }

            var maxValue = sortBy === 'count' ? data[0].count : data[0].qty;

            var html = '<div class="space-y-2">';
            data.slice(0, 15).forEach(function(item, idx) {
                var value = sortBy === 'count' ? item.count : item.qty;
                var percent = maxValue > 0 ? (value / maxValue * 100) : 0;
                var sharePercent = totalQty > 0 ? (item.qty / totalQty * 100) : 0;

                var barColor = idx === 0 ? 'bg-red-500' :
                               idx < 3 ? 'bg-orange-500' :
                               idx < 5 ? 'bg-yellow-500' : 'bg-blue-500';

                html += '<div class="flex items-center gap-2">';
                html += '<div class="w-6 text-right text-xs text-slate-500">' + (idx + 1) + '</div>';
                html += '<div class="w-32 truncate text-sm text-white" title="' + item.name + ' ' + item.spec + '">' + item.name + '</div>';
                html += '<div class="flex-1 bg-slate-700 rounded h-6 relative overflow-hidden">';
                html += '<div class="' + barColor + ' h-full rounded transition-all" style="width:' + percent + '%"></div>';
                html += '<span class="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">' + value.toLocaleString() + '</span>';
                html += '</div>';
                html += '<div class="w-16 text-right text-xs text-slate-400">' + sharePercent.toFixed(1) + '%</div>';
                html += '</div>';
            });
            html += '</div>';

            container.innerHTML = html;
        }

        function renderProductRanking(data, totalQty) {
            var tbody = document.getElementById('pa-ranking-list');

            if (data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center text-slate-500 py-8">此期間無出貨記錄</td></tr>';
                return;
            }

            var html = '';
            data.forEach(function(item, idx) {
                var sharePercent = totalQty > 0 ? (item.qty / totalQty * 100) : 0;

                var rankClass = idx === 0 ? 'text-red-400 font-bold' :
                                idx < 3 ? 'text-orange-400 font-bold' :
                                idx < 5 ? 'text-yellow-400' : 'text-slate-400';

                var rankIcon = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : (idx + 1);

                html += '<tr class="border-t border-slate-700 hover:bg-slate-700/30">';
                html += '<td class="text-center p-2 ' + rankClass + '">' + rankIcon + '</td>';
                html += '<td class="p-2 text-white font-medium">' + item.name + '</td>';
                html += '<td class="p-2 text-slate-400">' + (item.spec || '-') + '</td>';
                html += '<td class="p-2 text-right text-emerald-400 font-bold">' + item.count + '</td>';
                html += '<td class="p-2 text-right text-blue-400">' + item.qty.toLocaleString() + '</td>';
                html += '<td class="p-2 text-right text-slate-400">' + sharePercent.toFixed(1) + '%</td>';
                html += '</tr>';
            });

            tbody.innerHTML = html;
        }

        // ========== 倉庫熱力圖 ==========

        window.setHeatmapDateRange = function(range) {
            var today = new Date();
            var fromDate = new Date();

            switch(range) {
                case 'month':
                    fromDate.setDate(today.getDate() - 30);
                    break;
                case 'quarter':
                    fromDate.setDate(today.getDate() - 90);
                    break;
            }

            document.getElementById('heatmap-date-from').value = fromDate.toLocalYMD();
            document.getElementById('heatmap-date-to').value = today.toLocalYMD();
            refreshWarehouseHeatmap();
        };

        window.initWarehouseHeatmap = function() {
            setHeatmapDateRange('month');
        };

        window.refreshWarehouseHeatmap = async function() {
            var dateFrom = document.getElementById('heatmap-date-from').value;
            var dateTo = document.getElementById('heatmap-date-to').value;
            var metric = document.getElementById('heatmap-metric').value;

            try {
                var locationStats = {};

                if (window.db && window.collection && window.getDocs) {
                    var logsRef = window.collection(window.db, 'inventoryLogs');
                    var constraints = [];

                    if (dateFrom) {
                        constraints.push(window.where('timestamp', '>=', window.localDayStartISO(dateFrom)));
                    }
                    if (dateTo) {
                        constraints.push(window.where('timestamp', '<=', window.localDayEndISO(dateTo)));
                    }

                    var q = constraints.length > 0 ? query(logsRef, ...constraints) : logsRef;
                    var snapshot = await window.getDocs(q);

                    snapshot.forEach(function(doc) {
                        var data = doc.data();

                        var locations = [];
                        if (data.locationId) locations.push(data.locationId);
                        if (data.fromLocation) locations.push(data.fromLocation);
                        if (data.toLocation) locations.push(data.toLocation);

                        locations.forEach(function(loc) {
                            if (!loc) return;
                            var parts = loc.split('-');
                            if (parts.length >= 3) {
                                var laneKey = parts[0] + '-' + parts[1] + '-' + parts[2];
                                if (!locationStats[laneKey]) {
                                    locationStats[laneKey] = { count: 0, inbound: 0, outbound: 0 };
                                }
                                locationStats[laneKey].count++;
                                if (data.type === 'inbound') locationStats[laneKey].inbound++;
                                if (data.type === 'outbound' || data.type === 'picking') locationStats[laneKey].outbound++;
                            }
                        });
                    });
                }

                renderZoneHeatmap('I', 'A', 8, locationStats);
                renderZoneHeatmap('I', 'B', 8, locationStats);
                renderZoneHeatmap('J', 'C', 8, locationStats);
                renderZoneHeatmap('J', 'D', 8, locationStats);
                renderZoneHeatmap('K', 'E', 22, locationStats);
                renderZoneHeatmap('K', 'F', 22, locationStats);
                renderZoneHeatmap('K', 'G', 22, locationStats);
                renderZoneHeatmap('K', 'H', 22, locationStats);

                updateHeatmapStats(locationStats);

            } catch (e) {
                console.error('熱力圖分析失敗:', e);
            }
        };

        function renderZoneHeatmap(warehouse, zone, laneCount, stats) {
            var container = document.getElementById('heatmap-' + warehouse + '-' + zone);
            if (!container) return;

            var maxCount = 0;
            for (var i = 1; i <= laneCount; i++) {
                var colStr = i < 10 ? '0' + i : '' + i;
                var key = warehouse + '-' + zone + '-' + colStr;
                if (stats[key] && stats[key].count > maxCount) {
                    maxCount = stats[key].count;
                }
            }

            var html = '';
            for (var i = 1; i <= laneCount; i++) {
                var colStr = i < 10 ? '0' + i : '' + i;
                var key = warehouse + '-' + zone + '-' + colStr;
                var count = stats[key] ? stats[key].count : 0;

                var heatLevel = 0;
                if (count > 0) {
                    var ratio = maxCount > 0 ? count / maxCount : 0;
                    if (ratio >= 0.8) heatLevel = 4;      // 高頻
                    else if (ratio >= 0.5) heatLevel = 3;  // 中高
                    else if (ratio >= 0.2) heatLevel = 2;  // 中
                    else heatLevel = 1;                    // 低頻
                }

                var bgColor = heatLevel === 4 ? 'bg-red-600' :
                              heatLevel === 3 ? 'bg-orange-500' :
                              heatLevel === 2 ? 'bg-yellow-500' :
                              heatLevel === 1 ? 'bg-emerald-500' : 'bg-slate-600';

                var size = warehouse === 'K' ? 'w-4 h-4' : 'w-6 h-6';
                var fontSize = warehouse === 'K' ? 'text-[8px]' : 'text-[10px]';

                html += '<div class="' + size + ' ' + bgColor + ' rounded-sm flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-white" ';
                html += 'title="' + key + '\n使用次數: ' + count + '">';
                if (warehouse !== 'K') {
                    html += '<span class="' + fontSize + ' text-white/80">' + colStr + '</span>';
                }
                html += '</div>';
            }

            container.innerHTML = html;
        }

        function updateHeatmapStats(stats) {
            var hot = 0, medium = 0, cold = 0, unused = 0;

            var allLanes = [];
            ['I-A', 'I-B', 'J-C', 'J-D'].forEach(function(zone) {
                for (var i = 1; i <= 8; i++) {
                    allLanes.push(zone + '-' + (i < 10 ? '0' + i : i));
                }
            });
            ['K-E', 'K-F', 'K-G', 'K-H'].forEach(function(zone) {
                for (var i = 1; i <= 22; i++) {
                    allLanes.push(zone + '-' + (i < 10 ? '0' + i : i));
                }
            });

            var maxCount = 0;
            Object.values(stats).forEach(function(s) {
                if (s.count > maxCount) maxCount = s.count;
            });

            allLanes.forEach(function(lane) {
                var count = stats[lane] ? stats[lane].count : 0;
                if (count === 0) {
                    unused++;
                } else {
                    var ratio = maxCount > 0 ? count / maxCount : 0;
                    if (ratio >= 0.5) hot++;
                    else if (ratio >= 0.2) medium++;
                    else cold++;
                }
            });

            document.getElementById('hm-stat-hot').textContent = hot;
            document.getElementById('hm-stat-medium').textContent = medium;
            document.getElementById('hm-stat-cold').textContent = cold;
            document.getElementById('hm-stat-unused').textContent = unused;
        }

        // ========== 訂單出貨系統 ==========
        window.currentSelectedOrder = null;
        window.orderPickingPlan = [];

        window.openManualOrderModal = function() {
            document.getElementById('modal-manual-order').classList.remove('hidden');
            document.getElementById('manual-order-customer').value = '';
            document.getElementById('manual-order-product').value = '';
            document.getElementById('manual-order-spec').value = '';
            document.getElementById('manual-order-qty').value = '';
            document.getElementById('manual-order-carrier').value = '';
            document.getElementById('order-product-suggestions').innerHTML = '';
        };

        window.closeManualOrderModal = function() {
            document.getElementById('modal-manual-order').classList.add('hidden');
        };

        window.searchProductForOrder = function() {
            var searchInput = document.getElementById('manual-order-product').value.toLowerCase();
            var suggestionsDiv = document.getElementById('order-product-suggestions');

            if (searchInput.length < 1) {
                suggestionsDiv.innerHTML = '';
                return;
            }

            var products = {};
            window.currentPallets().forEach(function(p) {
                var key = p.productName + '|' + (p.spec || '');
                if (p.productName.toLowerCase().indexOf(searchInput) > -1) {
                    if (!products[key]) {
                        products[key] = { name: p.productName, spec: p.spec || '', totalQty: 0 };
                    }
                    products[key].totalQty += p.quantity;
                }
            });

            var html = '';
            Object.values(products).forEach(function(prod) {
                html += '<div class="p-2 bg-slate-700 hover:bg-slate-600 cursor-pointer rounded mb-1 text-sm" onclick="selectProductForOrder(\'' + prod.name + '\', \'' + prod.spec + '\')">';
                html += '<div class="text-white">' + prod.name + '</div>';
                html += '<div class="text-slate-400 text-xs">' + prod.spec + ' | 庫存: ' + prod.totalQty + '件</div>';
                html += '</div>';
            });

            suggestionsDiv.innerHTML = html || '<div class="text-slate-500 text-xs p-2">無符合項目</div>';
        };

        window.selectProductForOrder = function(name, spec) {
            document.getElementById('manual-order-product').value = name;
            document.getElementById('manual-order-spec').value = spec;
            document.getElementById('order-product-suggestions').innerHTML = '';
        };

        window.createManualOrder = function() {
            var customer = document.getElementById('manual-order-customer').value;
            var product = document.getElementById('manual-order-product').value;
            var spec = document.getElementById('manual-order-spec').value;
            var qty = parseInt(document.getElementById('manual-order-qty').value) || 0;
            var carrier = document.getElementById('manual-order-carrier').value || '自取';

            if (!customer || !product || qty <= 0) {
                alert('請填寫客戶、品名和數量');
                return;
            }

            var now = new Date();
            var orderId = 'ORD-' + now.getFullYear() + ('0'+(now.getMonth()+1)).slice(-2) + ('0'+now.getDate()).slice(-2) + '-' + ('0'+now.getHours()).slice(-2) + ('0'+now.getMinutes()).slice(-2) + ('0'+now.getSeconds()).slice(-2);

            var newOrder = {
                orderId: orderId,
                customer: customer,
                carrier: carrier,
                items: [{
                    productName: product,
                    spec: spec,
                    quantity: qty
                }],
                status: 'Pending',
                createTime: now
            };

            if (!window.manualOrders) window.manualOrders = [];
            window.manualOrders.push(newOrder);

            closeManualOrderModal();
            renderShippingListWithPicking();
            alert('✅ 訂單建立成功: ' + orderId);
        };

        window.renderShippingListWithPicking = function() {
            var tbody = document.getElementById('shipping-list-body');
            if (!tbody) return;

            var allOrders = (window.currentOrders ? window.currentOrders() : []).concat(window.manualOrders || []);

            if (allOrders.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center text-slate-500 py-10">尚無訂單，請匯入或手動新增</td></tr>';
                document.getElementById('order-count').innerText = '0';
                return;
            }

            var html = '';
            allOrders.forEach(function(order, idx) {
                var statusBadge = order.status === 'Completed' ?
                    '<span class="badge badge-green">已出貨</span>' :
                    '<span class="badge badge-yellow">待處理</span>';

                var itemSummary = order.items.map(function(item) {
                    return item.productName + (item.spec ? '(' + item.spec + ')' : '');
                }).join(', ');

                var totalQty = order.items.reduce(function(sum, item) { return sum + (item.quantity || 0); }, 0);

                html += '<tr class="border-b border-slate-700 hover:bg-slate-800 cursor-pointer" onclick="selectOrderForPicking(' + idx + ')">';
                html += '<td class="p-2"><span class="badge badge-blue">' + (order.carrier || '-') + '</span></td>';
                html += '<td class="p-2 text-blue-400 font-mono text-xs">' + order.orderId + '</td>';
                html += '<td class="p-2 text-white">' + order.customer + '</td>';
                html += '<td class="p-2 text-slate-300 text-xs">' + itemSummary.substring(0, 20) + (itemSummary.length > 20 ? '...' : '') + '</td>';
                html += '<td class="p-2 text-yellow-400 font-bold">' + totalQty + '</td>';
                html += '<td class="p-2">' + statusBadge + '</td>';
                html += '<td class="p-2 text-right">';
                if (order.status !== 'Completed') {
                    html += '<button onclick="event.stopPropagation(); selectOrderForPicking(' + idx + ')" class="text-blue-400 hover:text-blue-300 text-xs mr-2"><i class="fa-solid fa-route"></i> 揀貨</button>';
                }
                html += '</td>';
                html += '</tr>';
            });

            tbody.innerHTML = html;
            document.getElementById('order-count').innerText = allOrders.filter(function(o) { return o.status !== 'Completed'; }).length;
        };

        window.selectOrderForPicking = function(idx) {
            var allOrders = (window.currentOrders ? window.currentOrders() : []).concat(window.manualOrders || []);
            var order = allOrders[idx];

            if (!order) return;

            window.currentSelectedOrder = order;
            window.currentSelectedOrderIdx = idx;

            calculateOrderPicking(order);
        };

        function calculateOrderPicking(order) {
            var detailDiv = document.getElementById('order-picking-detail');
            var actionsDiv = document.getElementById('order-picking-actions');

            var html = '<div class="mb-4 p-3 bg-slate-800 rounded border border-slate-600">';
            html += '<div class="text-white font-bold">' + order.orderId + '</div>';
            html += '<div class="text-slate-400 text-sm">客戶: ' + order.customer + ' | 物流: ' + (order.carrier || '自取') + '</div>';
            html += '</div>';

            var allPlans = [];

            order.items.forEach(function(item, itemIdx) {
                html += '<div class="mb-4 p-3 bg-slate-800/50 rounded border border-slate-700">';
                html += '<div class="flex justify-between items-center mb-2">';
                html += '<div class="text-white font-bold">' + item.productName + ' <span class="text-slate-400 text-sm">' + (item.spec || '') + '</span></div>';
                // 匯入的訂單數量欄位是 qty，手動訂單是 quantity
                var requiredQty = parseInt(item.quantity != null ? item.quantity : item.qty) || 0;
                html += '<div class="text-yellow-400 font-bold">需求: ' + requiredQty + ' 件</div>';
                html += '</div>';

                var plan = calculateItemPickingPlan(item.productName, item.spec || '', requiredQty);
                var plannedQty = plan.reduce(function(sum, p) { return sum + p.pickQty; }, 0);
                allPlans.push({ item: item, plan: plan, requiredQty: requiredQty, plannedQty: plannedQty });

                if (plan.length === 0) {
                    html += '<div class="text-red-400 text-sm p-2 bg-red-900/30 rounded">❌ 庫存不足或無此品項</div>';
                } else {
                    if (plannedQty < requiredQty) {
                        html += '<div class="text-red-400 text-sm p-2 mb-2 bg-red-900/30 rounded">❌ 庫存不足：需求 ' + requiredQty + '，可揀 ' + plannedQty + '</div>';
                    }
                    html += '<table class="w-full text-xs">';
                    html += '<thead><tr class="text-slate-500"><th class="text-left p-1">儲位</th><th class="text-right p-1">取用</th><th class="text-center p-1">方式</th><th class="text-left p-1">效期</th></tr></thead>';
                    html += '<tbody>';

                    plan.forEach(function(p) {
                        var typeLabel = p.pickType === 'full' ? '<span class="text-green-400">整板</span>' : '<span class="text-yellow-400">拆板</span>';
                        html += '<tr class="border-t border-slate-700">';
                        html += '<td class="p-1 text-blue-400 font-mono">' + p.locationId + '</td>';
                        html += '<td class="p-1 text-right text-white font-bold">' + p.pickQty + '</td>';
                        html += '<td class="p-1 text-center">' + typeLabel + '</td>';
                        html += '<td class="p-1 text-slate-400">' + (p.expDate || '-') + '</td>';
                        html += '</tr>';
                    });

                    html += '</tbody></table>';
                }

                html += '</div>';
            });

            window.orderPickingPlan = allPlans;

            detailDiv.innerHTML = html;
            actionsDiv.classList.remove('hidden');
        }

        function calculateItemPickingPlan(productName, spec, requiredQty) {
            var candidates = [];
            window.currentPallets().forEach(function(p) {
                if (p.productName === productName && (p.spec || '') === spec && p.quantity > 0) {
                    var parsed = parseLocationId(p.locationId);
                    var floor = parsed ? parseInt(parsed.level) || 1 : 1;

                    candidates.push({
                        docId: p.id,
                        palletId: p.palletId,
                        locationId: p.locationId,
                        quantity: p.quantity,
                        expDate: p.expDate || p.expiryDate || '9999-12-31',
                        floor: floor,
                        batchNo: p.batchNo || ''
                    });
                }
            });

            if (candidates.length === 0) return [];

            candidates.sort(function(a, b) {
                if (a.expDate !== b.expDate) return a.expDate < b.expDate ? -1 : 1;
                return a.floor - b.floor;
            });

            var plan = [];
            var remaining = requiredQty;

            for (var i = 0; i < candidates.length && remaining > 0; i++) {
                var c = candidates[i];
                var pickQty = Math.min(c.quantity, remaining);
                var pickType = pickQty === c.quantity ? 'full' : 'split';

                plan.push({
                    docId: c.docId,
                    palletId: c.palletId,
                    locationId: c.locationId,
                    quantity: c.quantity,
                    pickQty: pickQty,
                    expDate: c.expDate,
                    batchNo: c.batchNo,
                    pickType: pickType,
                    remaining: c.quantity - pickQty
                });

                remaining -= pickQty;
            }

            return plan;
        }

        window.confirmOrderPicking = async function() {
            if (!window.currentSelectedOrder || !window.orderPickingPlan) {
                alert('請先選擇訂單');
                return;
            }

            var order = window.currentSelectedOrder;
            if (order.status === 'Completed') {
                alert('此訂單已經出貨，不能重複出貨');
                return;
            }

            // 庫存不足時可以部分出貨：照可揀數量扣帳，缺貨記在訂單上
            var shortages = window.orderPickingPlan.filter(function(p) {
                return p.plannedQty < p.requiredQty;
            }).map(function(p) {
                return { productName: p.item.productName, spec: p.item.spec || '', required: p.requiredQty, shipped: p.plannedQty, short: p.requiredQty - p.plannedQty };
            });
            var totalPlanned = window.orderPickingPlan.reduce(function(sum, p) { return sum + (p.plannedQty || 0); }, 0);
            if (totalPlanned === 0) {
                alert('所有品項都沒有庫存，無法出貨');
                return;
            }

            var confirmMsg = '確認完成此訂單出貨？\n\n訂單: ' + order.orderId + '\n客戶: ' + order.customer;
            if (shortages.length > 0) {
                confirmMsg += '\n\n⚠️ 以下品項庫存不足，將部分出貨：';
                shortages.forEach(function(sh) {
                    confirmMsg += '\n・' + sh.productName + ' ' + sh.spec + '：需 ' + sh.required + '，出 ' + sh.shipped + '（缺 ' + sh.short + '）';
                });
            }
            if (!confirm(confirmMsg)) {
                return;
            }

            try {
                // 同一板被多個品項行使用時，runStockTransaction 會合併扣量；庫存不足則整筆取消
                var changes = [];
                var picks = [];
                window.orderPickingPlan.forEach(function(itemPlan) {
                    itemPlan.plan.forEach(function(p) {
                        if (!p.docId) throw new Error('找不到棧板 ' + p.palletId);
                        changes.push({ ref: window.doc(window.db, 'pallets', p.docId), delta: -p.pickQty, deleteWhenEmpty: true, label: p.palletId });
                        picks.push(p);
                    });
                });

                var isFirestoreOrder = (window.manualOrders || []).indexOf(order) === -1;
                var orderRef = isFirestoreOrder && order.orderId ? window.doc(window.db, 'shippingOrders', String(order.orderId)) : null;

                await window.runStockTransaction({
                    changes: changes,
                    reads: orderRef ? [orderRef] : [],
                    validate: function(results, readSnaps) {
                        if (orderRef && readSnaps[0].exists && readSnaps[0].data().status === 'Completed') {
                            throw new Error('此訂單已經由其他人出貨');
                        }
                    },
                    updates: function(results, readSnaps) {
                        if (orderRef && readSnaps[0].exists) {
                            return [{ ref: orderRef, data: { status: 'Completed', shippedAt: new Date().toISOString(), shortages: shortages } }];
                        }
                        return [];
                    },
                    logs: function(results) {
                        return picks.map(function(p) {
                            var pallet = results[window.doc(window.db, 'pallets', p.docId).path].data;
                            return {
                                type: 'outbound',
                                company: pallet.company || '',
                                productName: pallet.productName,
                                spec: pallet.spec || '',
                                quantity: p.pickQty,
                                quantityChange: -p.pickQty,
                                locationId: pallet.locationId,
                                batchNo: pallet.batchNo || '',
                                palletId: pallet.palletId,
                                expDate: pallet.expDate || pallet.expiryDate,
                                note: '訂單出貨 - ' + order.customer + (shortages.length > 0 ? '（部分出貨）' : ''),
                                orderId: order.orderId
                            };
                        });
                    }
                });

                window.currentSelectedOrder.status = 'Completed';

                alert('✅ 出貨完成！');

                window.currentSelectedOrder = null;
                window.orderPickingPlan = [];
                document.getElementById('order-picking-detail').innerHTML = '<div class="text-center text-slate-500 py-20"><i class="fa-solid fa-check-circle text-4xl mb-4 text-green-500"></i><div>出貨完成</div></div>';
                document.getElementById('order-picking-actions').classList.add('hidden');

                renderShippingListWithPicking();

            } catch (e) {
                alert('❌ 出貨失敗: ' + e.message);
            }
        };

        window.printOrderPickingSlip = function() {
            if (!window.currentSelectedOrder || !window.orderPickingPlan) {
                alert('請先選擇訂單');
                return;
            }

            var order = window.currentSelectedOrder;
            var html = '<div style="border:3px solid #000;padding:20px;font-family:Microsoft JhengHei,Arial;">';
            html += '<div style="background:#333;color:white;padding:15px;margin:-20px -20px 20px -20px;text-align:center;">';
            html += '<div style="font-size:28px;font-weight:bold;">出貨揀貨單</div>';
            html += '<div style="font-size:14px;margin-top:5px;">單號: ' + order.orderId + '</div>';
            html += '</div>';

            html += '<div style="display:flex;justify-content:space-between;margin-bottom:15px;padding:10px;background:#f5f5f5;">';
            html += '<div><b>客戶:</b> ' + order.customer + '</div>';
            html += '<div><b>物流:</b> ' + (order.carrier || '自取') + '</div>';
            html += '<div><b>日期:</b> ' + new Date().toLocaleDateString() + '</div>';
            html += '</div>';

            window.orderPickingPlan.forEach(function(itemPlan, idx) {
                html += '<div style="margin-bottom:15px;border:1px solid #ccc;padding:10px;">';
                html += '<div style="font-weight:bold;margin-bottom:10px;">' + (idx+1) + '. ' + itemPlan.item.productName + ' ' + (itemPlan.item.spec || '') + ' - 需求: ' + itemPlan.item.quantity + '件</div>';

                html += '<table style="width:100%;border-collapse:collapse;">';
                html += '<thead><tr style="background:#eee;"><th style="padding:5px;border:1px solid #ccc;">儲位</th><th style="padding:5px;border:1px solid #ccc;">取用</th><th style="padding:5px;border:1px solid #ccc;">方式</th><th style="padding:5px;border:1px solid #ccc;">效期</th></tr></thead>';
                html += '<tbody>';

                itemPlan.plan.forEach(function(p) {
                    html += '<tr>';
                    html += '<td style="padding:5px;border:1px solid #ccc;text-align:center;font-weight:bold;">' + p.locationId + '</td>';
                    html += '<td style="padding:5px;border:1px solid #ccc;text-align:center;font-size:18px;font-weight:bold;">' + p.pickQty + '</td>';
                    html += '<td style="padding:5px;border:1px solid #ccc;text-align:center;">' + (p.pickType === 'full' ? '整板' : '拆板') + '</td>';
                    html += '<td style="padding:5px;border:1px solid #ccc;text-align:center;">' + (p.expDate || '-') + '</td>';
                    html += '</tr>';
                });

                html += '</tbody></table></div>';
            });

            html += '<div style="display:flex;justify-content:space-around;padding-top:20px;border-top:2px solid #000;margin-top:20px;">';
            html += '<div style="text-align:center;"><div style="border-bottom:1px solid #000;width:100px;height:40px;"></div><div style="font-size:12px;margin-top:5px;">揀貨人員</div></div>';
            html += '<div style="text-align:center;"><div style="border-bottom:1px solid #000;width:100px;height:40px;"></div><div style="font-size:12px;margin-top:5px;">覆核人員</div></div>';
            html += '</div></div>';

            openPrintPreview(html, '出貨揀貨單 - ' + order.orderId, 900, 800);
        };

        // ========== 板號異動系統 ==========
        window.currentMergeMode = 'move';

        window.setMergeMode = function(mode) {
            window.currentMergeMode = mode;

            var btnMove = document.getElementById('btn-mode-move');
            var btnMerge = document.getElementById('btn-mode-merge');
            var panelMove = document.getElementById('panel-move');
            var panelMerge = document.getElementById('panel-merge');

            if (mode === 'move') {
                btnMove.className = 'flex-1 py-3 bg-blue-600 text-white rounded-lg font-bold text-lg border-2 border-blue-400';
                btnMerge.className = 'flex-1 py-3 bg-slate-800 text-slate-400 rounded-lg font-bold text-lg border-2 border-slate-600';
                panelMove.classList.remove('hidden');
                panelMove.classList.add('flex');
                panelMerge.classList.add('hidden');
                panelMerge.classList.remove('flex');
            } else {
                btnMove.className = 'flex-1 py-3 bg-slate-800 text-slate-400 rounded-lg font-bold text-lg border-2 border-slate-600';
                btnMerge.className = 'flex-1 py-3 bg-purple-600 text-white rounded-lg font-bold text-lg border-2 border-purple-400';
                panelMove.classList.add('hidden');
                panelMove.classList.remove('flex');
                panelMerge.classList.remove('hidden');
                panelMerge.classList.add('flex');
            }
        };

        // 板號輸入框已在 HTML 綁定 lookupPalletByDocNo（不分大小寫）；
        // 這裡原本又綁了一次 showPalletInfo（區分大小寫、後執行），會把「找到」蓋成「找不到」，已移除

        window.showPalletInfo = function(inputId, infoId) {
            var palletId = document.getElementById(inputId).value;
            var infoDiv = document.getElementById(infoId);

            if (!palletId) {
                infoDiv.innerHTML = '';
                return;
            }

            var pallet = window.currentPallets().find(function(p) {
                return p.palletId === palletId || p.id === palletId;
            });

            if (!pallet) {
                infoDiv.innerHTML = '<div class="text-red-400">❌ 找不到此棧板</div>';
                return;
            }

            infoDiv.innerHTML = '<div class="text-white font-bold">' + pallet.productName + '</div>' +
                '<div class="text-slate-400">規格: ' + (pallet.spec || '-') + '</div>' +
                '<div class="text-yellow-400 font-bold">數量: ' + pallet.quantity + ' 件</div>' +
                '<div class="text-slate-400">儲位: ' + pallet.locationId + '</div>' +
                '<div class="text-slate-500 text-xs">批號: ' + (pallet.batchNo || '-') + '</div>';
        };

        window.lookupPalletByDocNo = function(docNo, target) {
            if (!docNo) return;

            docNo = docNo.trim().toUpperCase();

            var pallet = window.currentPallets().find(function(p) {
                return p.palletId === docNo || p.palletId === docNo.toUpperCase();
            });

            var infoEl;
            if (target === 'move') {
                infoEl = document.getElementById('move-pallet-info');
            } else if (target === 'keep') {
                infoEl = document.getElementById('merge-keep-info');
            } else if (target === 'remove') {
                infoEl = document.getElementById('merge-remove-info');
            }

            if (!infoEl) return;

            if (!pallet) {
                infoEl.innerHTML = '<div class="text-red-400"><i class="fa-solid fa-times-circle mr-1"></i>找不到此入庫單號的庫存</div>' +
                    '<div class="text-slate-500 text-xs mt-2">請確認條碼是否正確</div>';
                return;
            }

            var companyClass = pallet.company === '八方' ? 'bg-purple-900/50 text-purple-300' : 'bg-blue-900/50 text-blue-300';
            var companyLabel = pallet.company ? '<span class="px-2 py-0.5 rounded text-xs ' + companyClass + '">' + pallet.company + '</span>' : '';

            infoEl.innerHTML =
                '<div class="text-emerald-400 mb-2"><i class="fa-solid fa-check-circle mr-1"></i>已找到 ' + companyLabel + '</div>' +
                '<div class="text-white font-bold text-lg">' + pallet.productName + '</div>' +
                '<div class="text-slate-300">' + (pallet.spec || '-') + '</div>' +
                '<div class="text-yellow-400 font-bold text-xl mt-1">' + pallet.quantity + ' 件</div>' +
                '<div class="text-slate-400 mt-1"><i class="fa-solid fa-location-dot mr-1"></i>' + pallet.locationId + '</div>' +
                '<div class="text-slate-500 text-xs mt-1">批號: ' + (pallet.batchNo || '-') + ' | 效期: ' + (pallet.expDate || pallet.expiryDate || '-') + '</div>';

            if (target === 'move') {
                window._movePalletData = pallet;
            } else if (target === 'keep') {
                window._keepPalletData = pallet;
            } else if (target === 'remove') {
                window._removePalletData = pallet;
            }
        };

        // ========== 現場掃描作業系統 ==========
        window._fieldData = {
            inbound: { location: null, pallet: null },
            outbound: { pallet: null, stock: 0 },
            move: { pallet: null, oldLoc: null },
            merge: { less: null, more: null }
        };

        window.setFieldMode = function(mode) {
            var modes = ['inbound', 'outbound', 'move', 'merge'];
            var colors = { inbound: 'emerald', outbound: 'orange', move: 'blue', merge: 'purple' };

            modes.forEach(function(m) {
                var btn = document.getElementById('btn-field-' + m);
                var panel = document.getElementById('panel-field-' + m);
                if (m === mode) {
                    btn.className = 'py-4 bg-' + colors[m] + '-600 text-white rounded-lg font-bold text-lg border-2 border-' + colors[m] + '-400';
                    panel.classList.remove('hidden');
                    panel.classList.add('flex');
                } else {
                    btn.className = 'py-4 bg-slate-800 text-slate-400 rounded-lg font-bold text-lg border-2 border-slate-600';
                    panel.classList.add('hidden');
                    panel.classList.remove('flex');
                }
            });
        };

        // ===== 入庫作業 =====
        window.fieldInboundStep1 = function() {
            var loc = document.getElementById('field-in-location').value.trim().toUpperCase();
            if (!loc) return;

            window._fieldData.inbound.location = loc;
            document.getElementById('field-in-step1-status').innerHTML = '<span class="text-emerald-400">✅ ' + loc + '</span>';

            document.getElementById('field-in-step2-panel').classList.remove('opacity-50');
            document.getElementById('field-in-pallet').disabled = false;
            document.getElementById('field-in-pallet').focus();

            document.getElementById('field-in-result').innerHTML = '<div class="text-center"><div class="text-emerald-400 font-bold text-lg mb-1">儲位：' + loc + '</div><div class="text-slate-400">請掃描棧板插單完成綁定</div></div>';
        };

        window.fieldInboundStep2 = async function() {
            var palletId = document.getElementById('field-in-pallet').value.trim().toUpperCase();
            if (!palletId) return;

            var loc = window._fieldData.inbound.location;
            if (!loc) {
                alert('請先掃描儲位');
                return;
            }

            var pallet = window.currentPallets().find(function(p) {
                return p.palletId === palletId || p.id === palletId;
            });

            if (!pallet) {
                document.getElementById('field-in-step2-status').innerHTML = '<span class="text-red-400">❌ 找不到</span>';
                document.getElementById('field-in-result').innerHTML = '<div class="text-center text-red-400"><i class="fa-solid fa-times-circle text-3xl mb-2"></i><div>找不到此棧板：' + palletId + '</div></div>';
                return;
            }

            try {
                await window.updateDoc(window.doc(window.db, "pallets", pallet.id), { locationId: loc });

                await window.addDoc(window.collection(window.db, 'inventoryLogs'), {
                    type: 'inbound',
                    productName: pallet.productName,
                    spec: pallet.spec || '',
                    quantity: pallet.quantity,
                    quantityChange: pallet.quantity,
                    locationId: loc,
                    batchNo: pallet.batchNo || '',
                    palletId: palletId,
                    note: '現場掃描入庫',
                    operator: window.getOperatorName ? window.getOperatorName() : 'field',
                    timestamp: new Date()
                });

                document.getElementById('field-in-step2-status').innerHTML = '<span class="text-emerald-400">✅ 已綁定</span>';
                document.getElementById('field-in-result').innerHTML =
                    '<div class="text-center">' +
                    '<div class="text-emerald-400 text-4xl mb-3"><i class="fa-solid fa-check-circle"></i></div>' +
                    '<div class="text-white font-bold text-xl">' + pallet.productName + '</div>' +
                    '<div class="text-slate-400">' + (pallet.spec || '') + '</div>' +
                    '<div class="text-yellow-400 font-bold text-2xl mt-2">' + pallet.quantity + ' 件</div>' +
                    '<div class="mt-3 pt-3 border-t border-slate-700">' +
                    '<span class="text-emerald-400 font-bold">✅ 已綁定至 ' + loc + '</span>' +
                    '</div></div>';

                if (window.playSuccessSound) window.playSuccessSound();

                setTimeout(function() {
                    if (confirm('入庫成功！\n\n是否繼續下一筆？')) {
                        resetFieldInbound();
                    }
                }, 500);

            } catch (err) {
                console.error(err);
                alert('入庫失敗：' + err.message);
            }
        };

        window.resetFieldInbound = function() {
            window._fieldData.inbound = { location: null, pallet: null };
            document.getElementById('field-in-location').value = '';
            document.getElementById('field-in-pallet').value = '';
            document.getElementById('field-in-pallet').disabled = true;
            document.getElementById('field-in-step1-status').innerHTML = '⏳ 等待掃描';
            document.getElementById('field-in-step2-status').innerHTML = '⏳ 等待掃描';
            document.getElementById('field-in-step2-panel').classList.add('opacity-50');
            document.getElementById('field-in-result').innerHTML = '<div class="text-slate-500 text-center"><i class="fa-solid fa-qrcode text-4xl mb-2 opacity-30"></i><div>請先掃描儲位條碼</div></div>';
            document.getElementById('field-in-location').focus();
        };

        // ===== 出庫作業 =====
        window.fieldOutboundStep1 = function() {
            var palletId = document.getElementById('field-out-pallet').value.trim().toUpperCase();
            if (!palletId) return;

            var pallet = window.currentPallets().find(function(p) {
                return p.palletId === palletId || p.id === palletId;
            });

            if (!pallet) {
                document.getElementById('field-out-step1-status').innerHTML = '<span class="text-red-400">❌ 找不到</span>';
                document.getElementById('field-out-info').classList.add('hidden');
                return;
            }

            window._fieldData.outbound.pallet = pallet;
            window._fieldData.outbound.stock = pallet.quantity;

            document.getElementById('field-out-step1-status').innerHTML = '<span class="text-emerald-400">✅ 找到</span>';
            document.getElementById('field-out-product').innerText = pallet.productName;
            document.getElementById('field-out-spec').innerText = pallet.spec || '-';
            document.getElementById('field-out-stock').innerText = pallet.quantity;
            document.getElementById('field-out-loc').innerText = pallet.locationId;
            document.getElementById('field-out-info').classList.remove('hidden');

            document.getElementById('field-out-step2-panel').classList.remove('opacity-50');
            document.getElementById('field-out-qty').disabled = false;
            document.getElementById('btn-out-all').disabled = false;
            document.getElementById('btn-field-out-confirm').disabled = false;
            document.getElementById('field-out-qty').focus();
        };

        window.fieldOutboundAll = function() {
            var stock = window._fieldData.outbound.stock;
            document.getElementById('field-out-qty').value = stock;
        };

        window.executeFieldOutbound = async function() {
            var pallet = window._fieldData.outbound.pallet;
            if (!pallet) {
                alert('請先掃描棧板');
                return;
            }

            var qty = parseInt(document.getElementById('field-out-qty').value) || 0;
            if (qty <= 0) {
                alert('請輸入出庫數量');
                return;
            }

            if (qty > pallet.quantity) {
                alert('出庫數量不能超過庫存 ' + pallet.quantity + ' 件');
                return;
            }

            try {
                var palletRef = window.doc(window.db, "pallets", pallet.id);
                var results = await window.runStockTransaction({
                    changes: [{ ref: palletRef, delta: -qty, deleteWhenEmpty: true, label: pallet.palletId }],
                    logs: function(r) {
                        var p = r[palletRef.path].data;
                        return [{
                            type: 'outbound',
                            company: p.company || '',
                            productName: p.productName,
                            spec: p.spec || '',
                            quantity: qty,
                            quantityChange: -qty,
                            locationId: p.locationId,
                            batchNo: p.batchNo || '',
                            palletId: p.palletId,
                            note: '現場掃描出庫',
                            operator: window.getOperatorName ? window.getOperatorName() : 'field'
                        }];
                    }
                });
                var newQty = results[palletRef.path].after;

                alert('✅ 出庫成功！\n\n' + pallet.productName + '\n出庫：' + qty + ' 件\n' + (newQty > 0 ? '剩餘：' + newQty + ' 件' : '（已清空）'));
                resetFieldOutbound();

            } catch (err) {
                console.error(err);
                alert('出庫失敗：' + err.message);
            }
        };

        window.resetFieldOutbound = function() {
            window._fieldData.outbound = { pallet: null, stock: 0 };
            document.getElementById('field-out-pallet').value = '';
            document.getElementById('field-out-qty').value = '';
            document.getElementById('field-out-qty').disabled = true;
            document.getElementById('btn-out-all').disabled = true;
            document.getElementById('btn-field-out-confirm').disabled = true;
            document.getElementById('field-out-step1-status').innerHTML = '⏳ 等待掃描';
            document.getElementById('field-out-info').classList.add('hidden');
            document.getElementById('field-out-step2-panel').classList.add('opacity-50');
            document.getElementById('field-out-pallet').focus();
        };

        // ===== 移板作業 =====
        window.fieldMoveStep1 = function() {
            var palletId = document.getElementById('field-move-pallet').value.trim().toUpperCase();
            if (!palletId) return;

            var pallet = window.currentPallets().find(function(p) {
                return p.palletId === palletId || p.id === palletId;
            });

            if (!pallet) {
                document.getElementById('field-move-step1-status').innerHTML = '<span class="text-red-400">❌ 找不到</span>';
                document.getElementById('field-move-info').classList.add('hidden');
                return;
            }

            window._fieldData.move.pallet = pallet;
            window._fieldData.move.oldLoc = pallet.locationId;

            document.getElementById('field-move-step1-status').innerHTML = '<span class="text-emerald-400">✅ 找到</span>';
            document.getElementById('field-move-product').innerText = pallet.productName;
            document.getElementById('field-move-spec').innerText = (pallet.spec || '-') + ' | ' + pallet.quantity + ' 件';
            document.getElementById('field-move-old-loc').innerText = pallet.locationId;
            document.getElementById('field-move-info').classList.remove('hidden');

            document.getElementById('field-move-step2-panel').classList.remove('opacity-50');
            document.getElementById('field-move-new-loc').disabled = false;
            document.getElementById('field-move-new-loc').focus();
        };

        window.fieldMoveStep2 = async function() {
            var newLoc = document.getElementById('field-move-new-loc').value.trim().toUpperCase();
            if (!newLoc) return;

            var pallet = window._fieldData.move.pallet;
            if (!pallet) {
                alert('請先掃描棧板');
                return;
            }

            var oldLoc = window._fieldData.move.oldLoc;

            try {
                await window.movePalletTx(window.doc(window.db, "pallets", pallet.id), newLoc, {
                    note: '現場掃描移板：' + oldLoc + ' → ' + newLoc,
                    operator: window.getOperatorName ? window.getOperatorName() : 'field'
                });

                document.getElementById('field-move-step2-status').innerHTML = '<span class="text-emerald-400">✅ 完成</span>';
                document.getElementById('field-move-result').classList.remove('hidden');
                document.getElementById('field-move-result').innerHTML =
                    '<div class="text-center w-full">' +
                    '<div class="text-emerald-400 text-3xl mb-2"><i class="fa-solid fa-check-circle"></i></div>' +
                    '<div class="text-white font-bold">' + pallet.productName + '</div>' +
                    '<div class="flex items-center justify-center gap-3 mt-2">' +
                    '<span class="text-slate-400 line-through">' + oldLoc + '</span>' +
                    '<i class="fa-solid fa-arrow-right text-emerald-400"></i>' +
                    '<span class="text-emerald-400 font-bold text-xl">' + newLoc + '</span>' +
                    '</div></div>';

                setTimeout(function() {
                    if (confirm('移板成功！\n\n是否繼續下一筆？')) {
                        resetFieldMove();
                    }
                }, 500);

            } catch (err) {
                console.error(err);
                alert('移板失敗：' + err.message);
            }
        };

        window.resetFieldMove = function() {
            window._fieldData.move = { pallet: null, oldLoc: null };
            document.getElementById('field-move-pallet').value = '';
            document.getElementById('field-move-new-loc').value = '';
            document.getElementById('field-move-new-loc').disabled = true;
            document.getElementById('field-move-step1-status').innerHTML = '⏳ 等待掃描';
            document.getElementById('field-move-step2-status').innerHTML = '⏳ 等待掃描';
            document.getElementById('field-move-step2-panel').classList.add('opacity-50');
            document.getElementById('field-move-info').classList.add('hidden');
            document.getElementById('field-move-result').classList.add('hidden');
            document.getElementById('field-move-pallet').focus();
        };

        // ===== 併板作業 =====
        window.fieldMergeStep1 = function() {
            var palletId = document.getElementById('field-merge-less').value.trim().toUpperCase();
            if (!palletId) return;

            var pallet = window.currentPallets().find(function(p) {
                return p.palletId === palletId || p.id === palletId;
            });

            if (!pallet) {
                document.getElementById('field-merge-step1-status').innerHTML = '<span class="text-red-400">❌ 找不到</span>';
                document.getElementById('field-merge-less-info').classList.add('hidden');
                return;
            }

            window._fieldData.merge.less = pallet;

            document.getElementById('field-merge-step1-status').innerHTML = '<span class="text-emerald-400">✅ ' + pallet.quantity + '件</span>';
            document.getElementById('field-merge-less-name').innerText = pallet.productName;
            document.getElementById('field-merge-less-qty').innerText = pallet.quantity;
            document.getElementById('field-merge-less-info').classList.remove('hidden');

            document.getElementById('field-merge-step2-panel').classList.remove('opacity-50');
            document.getElementById('field-merge-more').disabled = false;
            document.getElementById('field-merge-more').focus();
        };

        window.fieldMergeStep2 = function() {
            var palletId = document.getElementById('field-merge-more').value.trim().toUpperCase();
            if (!palletId) return;

            var pallet = window.currentPallets().find(function(p) {
                return p.palletId === palletId || p.id === palletId;
            });

            if (!pallet) {
                document.getElementById('field-merge-step2-status').innerHTML = '<span class="text-red-400">❌ 找不到</span>';
                document.getElementById('field-merge-more-info').classList.add('hidden');
                return;
            }

            var less = window._fieldData.merge.less;

            if (less.productName !== pallet.productName) {
                alert('⚠️ 品名不同！\n\n少的：' + less.productName + '\n多的：' + pallet.productName + '\n\n無法合併不同品項');
                document.getElementById('field-merge-more').value = '';
                return;
            }

            window._fieldData.merge.more = pallet;

            var total = less.quantity + pallet.quantity;

            document.getElementById('field-merge-step2-status').innerHTML = '<span class="text-emerald-400">✅ ' + pallet.quantity + '件</span>';
            document.getElementById('field-merge-more-name').innerText = pallet.productName;
            document.getElementById('field-merge-more-qty').innerText = pallet.quantity;
            document.getElementById('field-merge-more-info').classList.remove('hidden');

            document.getElementById('field-merge-total').innerText = total;
            document.getElementById('field-merge-less-qty2').innerText = less.quantity;
            document.getElementById('field-merge-more-qty2').innerText = pallet.quantity;
            document.getElementById('field-merge-total2').innerText = total;
            document.getElementById('field-merge-preview').classList.remove('hidden');
            document.getElementById('btn-field-merge-confirm').disabled = false;
        };

        window.executeFieldMerge = async function() {
            var less = window._fieldData.merge.less;
            var more = window._fieldData.merge.more;

            if (!less || !more) {
                alert('請先完成掃描');
                return;
            }

            try {
                var result = await window.mergePalletsConfirm(
                    window.doc(window.db, "pallets", less.id),
                    window.doc(window.db, "pallets", more.id),
                    {
                        note: '現場掃描併板：' + less.palletId + ' → ' + more.palletId,
                        operator: window.getOperatorName ? window.getOperatorName() : 'field'
                    }
                );
                var total = result.total;

                alert('✅ 併板成功！\n\n' + more.productName + '\n合併後數量：' + total + ' 件\n保留板：' + more.palletId + '\n刪除板：' + less.palletId);
                resetFieldMerge();

            } catch (err) {
                console.error(err);
                alert('併板失敗：' + err.message);
            }
        };

        window.resetFieldMerge = function() {
            window._fieldData.merge = { less: null, more: null };
            document.getElementById('field-merge-less').value = '';
            document.getElementById('field-merge-more').value = '';
            document.getElementById('field-merge-more').disabled = true;
            document.getElementById('field-merge-step1-status').innerHTML = '⏳ 等待掃描';
            document.getElementById('field-merge-step2-status').innerHTML = '⏳ 等待掃描';
            document.getElementById('field-merge-step2-panel').classList.add('opacity-50');
            document.getElementById('field-merge-less-info').classList.add('hidden');
            document.getElementById('field-merge-more-info').classList.add('hidden');
            document.getElementById('field-merge-preview').classList.add('hidden');
            document.getElementById('btn-field-merge-confirm').disabled = true;
            document.getElementById('field-merge-less').focus();
        };

        // ========== 備案查詢功能 ==========
        window._currentFallbackTarget = null; // 'keep' or 'remove'

        window.openMoveFallback = function() {
            document.getElementById('panel-move-fallback').classList.remove('hidden');
            document.getElementById('fallback-move-loc').value = '';
            document.getElementById('fallback-move-search').value = '';
            document.getElementById('fallback-move-list').innerHTML = '<div class="text-slate-500 text-center py-4">輸入儲位或品名搜尋</div>';
        };

        window.closeMoveFallback = function() {
            document.getElementById('panel-move-fallback').classList.add('hidden');
        };

        window.openMergeFallback = function(target) {
            window._currentFallbackTarget = target;
            document.getElementById('merge-fallback-target').innerText = target === 'keep' ? '（選擇保留）' : '（選擇移入）';
            document.getElementById('panel-merge-fallback').classList.remove('hidden');
            document.getElementById('fallback-merge-loc').value = '';
            document.getElementById('fallback-merge-search').value = '';
            document.getElementById('fallback-merge-list').innerHTML = '<div class="text-slate-500 text-center py-4">輸入儲位或品名搜尋</div>';
        };

        window.closeMergeFallback = function() {
            document.getElementById('panel-merge-fallback').classList.add('hidden');
        };

        window.searchPalletsByLocation = function(loc, mode) {
            if (!loc) return;
            loc = loc.trim().toUpperCase();

            var pallets = window.currentPallets().filter(function(p) {
                return p.locationId && p.locationId.toUpperCase() === loc;
            });

            renderFallbackList(pallets, mode);
        };

        window.searchPalletsByName = function(keyword, mode) {
            if (!keyword || keyword.length < 1) return;
            keyword = keyword.toLowerCase();

            var pallets = window.currentPallets().filter(function(p) {
                return p.productName && p.productName.toLowerCase().includes(keyword);
            });

            pallets = pallets.slice(0, 20);
            renderFallbackList(pallets, mode);
        };

        function renderFallbackList(pallets, mode) {
            var listId = mode === 'move' ? 'fallback-move-list' : 'fallback-merge-list';
            var listEl = document.getElementById(listId);

            if (pallets.length === 0) {
                listEl.innerHTML = '<div class="text-slate-500 text-center py-4">找不到庫存</div>';
                return;
            }

            var html = '';
            pallets.forEach(function(p, idx) {
                html += '<div class="flex items-center justify-between p-2 hover:bg-slate-800 rounded cursor-pointer border-b border-slate-700" onclick="selectFallbackPallet(\'' + mode + '\', ' + idx + ')" data-pallet-id="' + p.palletId + '">';
                html += '<div class="flex-1">';
                html += '<div class="text-white font-bold">' + p.productName + ' <span class="text-slate-400 font-normal">' + (p.spec || '') + '</span></div>';
                html += '<div class="text-xs text-slate-500">批號: ' + (p.batchNo || '-') + ' | 效期: ' + (p.expDate || p.expiryDate || '-') + '</div>';
                html += '</div>';
                html += '<div class="text-right">';
                html += '<div class="text-yellow-400 font-bold">' + p.quantity + ' 件</div>';
                html += '<div class="text-xs text-slate-400">' + p.locationId + '</div>';
                html += '</div>';
                html += '</div>';
            });

            listEl.innerHTML = html;

            if (mode === 'move') {
                window._fallbackMovePallets = pallets;
            } else {
                window._fallbackMergePallets = pallets;
            }
        }

        window.selectFallbackPallet = function(mode, idx) {
            var pallet;
            if (mode === 'move') {
                pallet = window._fallbackMovePallets[idx];
                if (pallet) {
                    window._movePalletData = pallet;
                    document.getElementById('move-pallet-id').value = pallet.palletId;

                    document.getElementById('move-pallet-info').innerHTML =
                        '<div class="text-emerald-400 mb-2"><i class="fa-solid fa-check-circle mr-1"></i>已選擇（備案）</div>' +
                        '<div class="text-white font-bold text-lg">' + pallet.productName + '</div>' +
                        '<div class="text-slate-300">' + (pallet.spec || '-') + '</div>' +
                        '<div class="text-yellow-400 font-bold text-xl mt-1">' + pallet.quantity + ' 件</div>' +
                        '<div class="text-slate-400 mt-1"><i class="fa-solid fa-location-dot mr-1"></i>' + pallet.locationId + '</div>' +
                        '<div class="text-slate-500 text-xs mt-1">批號: ' + (pallet.batchNo || '-') + '</div>';

                    closeMoveFallback();
                }
            } else {
                pallet = window._fallbackMergePallets[idx];
                if (pallet) {
                    var target = window._currentFallbackTarget;

                    if (target === 'keep') {
                        window._keepPalletData = pallet;
                        document.getElementById('merge-keep-id').value = pallet.palletId;
                        document.getElementById('merge-keep-info').innerHTML =
                            '<div class="text-emerald-400 mb-2"><i class="fa-solid fa-check-circle mr-1"></i>已選擇（備案）</div>' +
                            '<div class="text-white font-bold text-lg">' + pallet.productName + '</div>' +
                            '<div class="text-slate-300">' + (pallet.spec || '-') + '</div>' +
                            '<div class="text-yellow-400 font-bold text-xl mt-1">' + pallet.quantity + ' 件</div>' +
                            '<div class="text-slate-400 mt-1"><i class="fa-solid fa-location-dot mr-1"></i>' + pallet.locationId + '</div>';
                    } else {
                        window._removePalletData = pallet;
                        document.getElementById('merge-remove-id').value = pallet.palletId;
                        document.getElementById('merge-remove-info').innerHTML =
                            '<div class="text-emerald-400 mb-2"><i class="fa-solid fa-check-circle mr-1"></i>已選擇（備案）</div>' +
                            '<div class="text-white font-bold text-lg">' + pallet.productName + '</div>' +
                            '<div class="text-slate-300">' + (pallet.spec || '-') + '</div>' +
                            '<div class="text-yellow-400 font-bold text-xl mt-1">' + pallet.quantity + ' 件</div>' +
                            '<div class="text-slate-400 mt-1"><i class="fa-solid fa-location-dot mr-1"></i>' + pallet.locationId + '</div>';
                    }

                    closeMergeFallback();
                }
            }
        };

        window.executePalletMove = async function() {
            var palletId = document.getElementById('move-pallet-id').value.trim();
            var targetLoc = document.getElementById('move-target-loc').value.trim().toUpperCase();

            if (!palletId) {
                alert('請掃描或輸入入庫單號');
                return;
            }
            if (!targetLoc) {
                alert('請輸入目標儲位');
                return;
            }

            var pallet = window._movePalletData;
            var pallets = window.currentPallets();

            // 掃描後又改了輸入框時，不能沿用舊的掃描結果
            if (pallet && String(pallet.palletId || '').toLowerCase() !== palletId.toLowerCase()) pallet = null;

            if (!pallet) {
                pallet = pallets.find(function(p) {
                    return p.palletId === palletId || p.palletId === palletId.toUpperCase() ||
                           p.palletId && p.palletId.toLowerCase() === palletId.toLowerCase();
                });
            }

            if (!pallet) {
                alert('找不到此入庫單號的庫存\n\n請確認條碼是否正確，或使用查詢功能');
                return;
            }

            var oldLoc = pallet.locationId;

            if (oldLoc === targetLoc) {
                alert('目標儲位與目前儲位相同');
                return;
            }

            if (!confirm('確認移動？\n\n' +
                '📦 ' + pallet.productName + ' ' + (pallet.spec || '') + '\n' +
                '數量: ' + pallet.quantity + ' 件' + (pallet.totalWeight > 0 ? ' / ' + pallet.totalWeight + ' kg' : '') + '\n' +
                '批號: ' + (pallet.batchNo || '-') + '\n\n' +
                '📍 ' + oldLoc + ' → ' + targetLoc)) {
                return;
            }

            try {
                await window.movePalletTx(window.doc(window.db, 'pallets', pallet.id), targetLoc, {
                    note: '移位: ' + oldLoc + ' → ' + targetLoc
                });

                alert('✅ 移動成功！\n\n' + oldLoc + ' → ' + targetLoc);

                document.getElementById('move-pallet-id').value = '';
                document.getElementById('move-target-loc').value = '';
                document.getElementById('move-pallet-info').innerHTML = '<div class="text-slate-500 text-center py-2"><i class="fa-solid fa-barcode mr-2"></i>等待掃描...</div>';
                window._movePalletData = null;

                if (typeof renderInventoryTable === 'function') renderInventoryTable();

            } catch (e) {
                alert('❌ 移動失敗: ' + e.message);
            }
        };

        window.executePalletMerge = async function() {
            var keepId = document.getElementById('merge-keep-id').value.trim();
            var removeId = document.getElementById('merge-remove-id').value.trim();

            if (!keepId) {
                alert('請掃描或輸入保留貨物的條碼');
                return;
            }
            if (!removeId) {
                alert('請掃描或輸入要合併貨物的條碼');
                return;
            }
            if (keepId.toUpperCase() === removeId.toUpperCase()) {
                alert('保留和移入不能是同一筆');
                return;
            }

            var pallets = window.currentPallets();

            var keepPallet = window._keepPalletData;
            if (keepPallet && String(keepPallet.palletId || '').toLowerCase() !== keepId.toLowerCase()) keepPallet = null;
            if (!keepPallet) {
                keepPallet = pallets.find(function(p) {
                    return p.palletId === keepId || p.palletId === keepId.toUpperCase() ||
                           p.palletId && p.palletId.toLowerCase() === keepId.toLowerCase();
                });
            }

            var removePallet = window._removePalletData;
            if (removePallet && String(removePallet.palletId || '').toLowerCase() !== removeId.toLowerCase()) removePallet = null;
            if (!removePallet) {
                removePallet = pallets.find(function(p) {
                    return p.palletId === removeId || p.palletId === removeId.toUpperCase() ||
                           p.palletId && p.palletId.toLowerCase() === removeId.toLowerCase();
                });
            }

            if (!keepPallet) {
                alert('找不到保留貨物的庫存\n\n請確認條碼是否正確，或使用查詢功能');
                return;
            }
            if (!removePallet) {
                alert('找不到要合併貨物的庫存\n\n請確認條碼是否正確，或使用查詢功能');
                return;
            }

            var mergeWarns = [];
            try {
                window.checkMergeCompatible(removePallet, keepPallet);
                mergeWarns = window.mergeWarnings(removePallet, keepPallet);
            } catch (e) {
                alert('⚠️ ' + e.message);
                return;
            }

            var newQty = (keepPallet.quantity || 0) + (removePallet.quantity || 0);
            var newWeight = (keepPallet.totalWeight || 0) + (removePallet.totalWeight || 0);
            newWeight = Math.round(newWeight * 10) / 10; // 四捨五入到小數一位

            var newUnitWeight = newQty > 0 && newWeight > 0 ? Math.round(newWeight / newQty * 100) / 100 : (keepPallet.unitWeight || 0);

            var confirmMsg = '確認合併？\n\n' +
                '【保留】\n' +
                '  📦 ' + keepPallet.productName + ' ' + (keepPallet.spec || '') + '\n' +
                '  數量: ' + keepPallet.quantity + ' 件' + (keepPallet.totalWeight > 0 ? ' / ' + keepPallet.totalWeight + ' kg' : '') + '\n' +
                '  儲位: ' + keepPallet.locationId + '\n\n' +
                '【移入並刪除】\n' +
                '  📦 ' + removePallet.productName + ' ' + (removePallet.spec || '') + '\n' +
                '  數量: ' + removePallet.quantity + ' 件' + (removePallet.totalWeight > 0 ? ' / ' + removePallet.totalWeight + ' kg' : '') + '\n' +
                '  儲位: ' + removePallet.locationId + '\n\n' +
                '✅ 合併後: ' + newQty + ' 件';
            if (newWeight > 0) {
                confirmMsg += ' / ' + newWeight + ' kg';
            }

            if (mergeWarns.length > 0) {
                confirmMsg += '\n\n⚠️ ' + mergeWarns.join('\n⚠️ ');
            }

            if (!confirm(confirmMsg)) {
                return;
            }

            try {
                var mergeNote = '合併: ' + removePallet.palletId + '(' + removePallet.quantity + '件';
                if (removePallet.totalWeight > 0) mergeNote += '/' + removePallet.totalWeight + 'kg';
                mergeNote += ') → ' + keepPallet.palletId;

                var result = await window.mergePalletsTx(
                    window.doc(window.db, 'pallets', removePallet.id),
                    window.doc(window.db, 'pallets', keepPallet.id),
                    { note: mergeNote },
                    { allowMixed: true }
                );
                newQty = result.total;
                newWeight = result.totalWeight;

                var successMsg = '✅ 合併成功！\n\n新數量: ' + newQty + ' 件';
                if (newWeight > 0) successMsg += ' / ' + newWeight + ' kg';
                alert(successMsg);

                document.getElementById('merge-keep-id').value = '';
                document.getElementById('merge-remove-id').value = '';
                document.getElementById('merge-keep-info').innerHTML = '<div class="text-slate-500 text-center py-1"><i class="fa-solid fa-barcode mr-1"></i>等待掃描...</div>';
                document.getElementById('merge-remove-info').innerHTML = '<div class="text-slate-500 text-center py-1"><i class="fa-solid fa-barcode mr-1"></i>等待掃描...</div>';
                window._keepPalletData = null;
                window._removePalletData = null;

                if (typeof renderInventoryTable === 'function') renderInventoryTable();

            } catch (e) {
                alert('❌ 合併失敗: ' + e.message);
            }
        };

