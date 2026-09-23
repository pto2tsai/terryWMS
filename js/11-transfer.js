// ============================================================
// js/11-transfer.js — 倉庫調撥
// 由原 app.js 第 15656–16930 行拆出；各檔依 index.html 的順序載入，共用全域（window）
// ============================================================
        // ========== 倉庫調撥功能（新版）==========

        window.transferState = {
            company: '崇文',      // 目前選擇的公司
            mode: 'in',           // 調撥模式: 'in'=調撥入庫, 'out'=調撥出庫, 'ext'=外庫調撥
            selectedItem: null,   // 選中的品項
            locationItems: []     // 儲位列表（調撥出庫用）
        };

        window.setTransferCompany = function(company) {
            window.transferState.company = company;

            document.getElementById('btn-transfer-cw').className = company === '崇文'
                ? 'px-3 py-1.5 rounded font-bold text-xs bg-blue-600 text-white'
                : 'px-3 py-1.5 rounded font-bold text-xs bg-slate-700 text-slate-300 hover:bg-slate-600';
            document.getElementById('btn-transfer-bf').className = company === '八方'
                ? 'px-3 py-1.5 rounded font-bold text-xs bg-blue-600 text-white'
                : 'px-3 py-1.5 rounded font-bold text-xs bg-slate-700 text-slate-300 hover:bg-slate-600';

            updateTransferWarehouseOptions();
            clearTransferForm();
            
            // 清空調撥清單（公司變更，資料來源不同）
            if (window.transferList && window.transferList.length > 0) {
                if (confirm('切換公司將清空目前的調撥清單，是否繼續？')) {
                    window.transferList = [];
                    renderTransferList();
                } else {
                    // 還原選擇
                    var oldCompany = company === '崇文' ? '八方' : '崇文';
                    window.transferState.company = oldCompany;
                    document.getElementById('btn-transfer-cw').className = oldCompany === '崇文'
                        ? 'px-3 py-1.5 rounded font-bold text-xs bg-blue-600 text-white'
                        : 'px-3 py-1.5 rounded font-bold text-xs bg-slate-700 text-slate-300 hover:bg-slate-600';
                    document.getElementById('btn-transfer-bf').className = oldCompany === '八方'
                        ? 'px-3 py-1.5 rounded font-bold text-xs bg-blue-600 text-white'
                        : 'px-3 py-1.5 rounded font-bold text-xs bg-slate-700 text-slate-300 hover:bg-slate-600';
                    return;
                }
            }
            
            updateTransferStepStatus();
        };

        window.setTransferMode = function(mode) {
            var oldMode = window.transferState.mode;
            
            // 如果有調撥清單且模式變更，提示用戶
            if (window.transferList && window.transferList.length > 0 && oldMode !== mode) {
                if (!confirm('切換調撥模式將清空目前的調撥清單，是否繼續？')) {
                    return;
                }
                window.transferList = [];
                renderTransferList();
            }
            
            window.transferState.mode = mode;

            var modes = ['in', 'out', 'ext'];
            var colors = { 'in': 'bg-emerald-600', 'out': 'bg-orange-600', 'ext': 'bg-purple-600' };
            modes.forEach(function(m) {
                var btn = document.getElementById('btn-mode-' + m);
                btn.className = m === mode
                    ? 'px-3 py-1.5 rounded font-bold text-xs ' + colors[m] + ' text-white'
                    : 'px-3 py-1.5 rounded font-bold text-xs bg-slate-700 text-slate-300 hover:bg-slate-600';
            });

            var titleEl = document.getElementById('transfer-form-title');
            var descEl = document.getElementById('transfer-mode-desc');
            var sourceLabelEl = document.getElementById('transfer-source-label');
            var targetDiv = document.getElementById('transfer-target-div');
            var locationDiv = document.getElementById('transfer-location-div');
            var inOptionsDiv = document.getElementById('transfer-in-options');

            if (mode === 'in') {
                titleEl.innerHTML = '<i class="fa-solid fa-truck-arrow-right mr-2 text-emerald-400"></i>調撥入庫（外倉→本倉）';
                descEl.innerHTML = '<span class="text-emerald-400"><i class="fa-solid fa-info-circle mr-1"></i>外倉 → 待執行工單 或 暫存區</span>';
                sourceLabelEl.textContent = '來源外倉 *';
                targetDiv.style.display = 'none';
                if (locationDiv) locationDiv.style.display = 'none';
                if (inOptionsDiv) inOptionsDiv.style.display = 'block';
            } else if (mode === 'out') {
                titleEl.innerHTML = '<i class="fa-solid fa-truck-arrow-right mr-2 text-orange-400"></i>調撥出庫（本倉→外倉）';
                descEl.innerHTML = '<span class="text-orange-400"><i class="fa-solid fa-info-circle mr-1"></i>本倉儲位 → 出貨暫存區 → 外倉</span>';
                sourceLabelEl.textContent = '目標外倉 *';
                targetDiv.style.display = 'none';
                if (locationDiv) locationDiv.style.display = 'block';
                if (inOptionsDiv) inOptionsDiv.style.display = 'none';
            } else {
                titleEl.innerHTML = '<i class="fa-solid fa-arrows-left-right mr-2 text-purple-400"></i>外庫調撥（外倉→外倉）';
                descEl.innerHTML = '<span class="text-purple-400"><i class="fa-solid fa-info-circle mr-1"></i>外倉之間直接調撥（數量增減）</span>';
                sourceLabelEl.textContent = '來源外倉 *';
                targetDiv.style.display = 'block';
                if (locationDiv) locationDiv.style.display = 'none';
                if (inOptionsDiv) inOptionsDiv.style.display = 'none';
            }

            updateTransferWarehouseOptions();
            clearTransferForm();
            updateTransferStepStatus();
        };

        function updateTransferWarehouseOptions() {
            var company = window.transferState.company;
            var mode = window.transferState.mode;
            var sourceSelect = document.getElementById('transfer-source');
            var targetSelect = document.getElementById('transfer-target');

            var warehouses = window.warehousesData.filter(function(w) {
                return w.company === company && w.active !== false;
            }).sort(function(a, b) { return (a.sortOrder || 99) - (b.sortOrder || 99); });

            var sourceHtml = '<option value="">選擇外倉</option>';
            warehouses.forEach(function(w) {
                var icon = w.icon === 'store' ? '🏪' : '🏢';
                sourceHtml += '<option value="' + w.code + '">' + icon + ' ' + w.name + '</option>';
            });
            sourceSelect.innerHTML = sourceHtml;

            if (mode === 'ext') {
                var targetHtml = '<option value="">選擇外倉</option>';
                warehouses.forEach(function(w) {
                    var icon = w.icon === 'store' ? '🏪' : '🏢';
                    targetHtml += '<option value="' + w.code + '">' + icon + ' ' + w.name + '</option>';
                });
                targetSelect.innerHTML = targetHtml;
            }
        }

        window.onTransferSourceChange = function() {
            clearTransferForm();
            updateTransferStepStatus();
        };

        window.onTransferLocationChange = function() {
            var locId = document.getElementById('transfer-location').value;
            if (!locId) {
                document.getElementById('transfer-available').innerText = '0';
                return;
            }

            var item = window.transferState.locationItems.find(function(i) { return i.locationId === locId; });
            if (item) {
                document.getElementById('transfer-available').innerText = item.quantity;
                window.transferState.selectedItem = item;
            }
        };

        function clearTransferForm() {
            document.getElementById('transfer-product').value = '';
            document.getElementById('transfer-spec').value = '';
            document.getElementById('transfer-batch').value = '';
            document.getElementById('transfer-exp').value = '';
            document.getElementById('transfer-available').textContent = '0';
            document.getElementById('transfer-qty').value = '';
            document.getElementById('transfer-location').value = '';
            
            // 隱藏已選品項顯示區
            var selectedDiv = document.getElementById('transfer-selected-product');
            if (selectedDiv) selectedDiv.classList.add('hidden');
            
            window.transferState.selectedItem = null;
            window.transferState.locationItems = [];
        }

        window.searchTransferProduct = function() {
            var mode = window.transferState.mode;
            var company = window.transferState.company;
            var keyword = document.getElementById('transfer-product').value.trim().toLowerCase();
            var listDiv = document.getElementById('transfer-product-list');

            if (keyword.length < 1) { listDiv.innerHTML = ''; return; }

            var source = [];

            if (mode === 'out') {
                source = window.inventory.filter(function(p) {
                    return p.company === company && p.productName && p.productName.toLowerCase().includes(keyword);
                });

                var grouped = {};
                source.forEach(function(p) {
                    var key = p.productName + '|' + (p.spec || '') + '|' + (p.batchNo || '');
                    if (!grouped[key]) {
                        grouped[key] = {
                            productName: p.productName,
                            spec: p.spec || '',
                            batchNo: p.batchNo || '',
                            expiryDate: p.expiryDate || '',
                            totalQty: 0,
                            items: []
                        };
                    }
                    grouped[key].totalQty += (p.quantity || 0);
                    grouped[key].items.push(p);
                });
                source = Object.values(grouped);

            } else {
                var warehouseId = document.getElementById('transfer-source').value;
                if (!warehouseId) {
                    listDiv.innerHTML = '<div class="text-slate-500 text-xs p-2">請先選擇外倉</div>';
                    return;
                }

                source = window.externalStock.filter(function(s) {
                    return s.warehouseId === warehouseId && s.company === company &&
                           s.productName && s.productName.toLowerCase().includes(keyword);
                });
            }

            if (source.length === 0) {
                listDiv.innerHTML = '<div class="text-slate-500 text-xs p-2">無符合項目</div>';
                return;
            }

            var html = '';
            source.slice(0, 10).forEach(function(s, idx) {
                var qty = mode === 'out' ? s.totalQty : s.quantity;
                html += '<div class="p-2 hover:bg-slate-700 cursor-pointer text-sm border-b border-slate-700" onclick="selectTransferProduct(' + idx + ')">';
                html += '<div class="text-white font-bold">' + s.productName + '</div>';
                html += '<div class="text-xs text-slate-400">' + (s.spec || '-') + ' | 批號：' + (s.batchNo || '-') + ' | 數量：<span class="text-yellow-400">' + qty + '</span></div>';
                html += '</div>';
            });

            listDiv.innerHTML = html;
            window._transferSearchResults = source.slice(0, 10);
        };

        window.selectTransferProduct = function(idx) {
            var item = window._transferSearchResults[idx];
            var mode = window.transferState.mode;

            document.getElementById('transfer-product').value = item.productName;
            document.getElementById('transfer-spec').value = item.spec || '';
            document.getElementById('transfer-batch').value = item.batchNo || '';
            document.getElementById('transfer-exp').value = item.expiryDate || item.expDate || '';
            document.getElementById('transfer-product-list').innerHTML = '';

            if (mode === 'out') {
                var locationSelect = document.getElementById('transfer-location');
                var html = '<option value="">選擇儲位</option>';

                item.items.forEach(function(p) {
                    html += '<option value="' + p.locationId + '">' + p.locationId + ' (數量: ' + p.quantity + ')</option>';
                });

                locationSelect.innerHTML = html;
                window.transferState.locationItems = item.items;
                document.getElementById('transfer-available').innerText = '0';
                window.transferState.selectedItem = null;
            } else {
                document.getElementById('transfer-available').innerText = item.quantity;
                window.transferState.selectedItem = item;
            }
        };

        window.addTransferItem = function() {
            var mode = window.transferState.mode;
            var company = window.transferState.company;
            var source = document.getElementById('transfer-source').value;
            var target = document.getElementById('transfer-target').value;
            var product = document.getElementById('transfer-product').value.trim();
            var spec = document.getElementById('transfer-spec').value;
            var batch = document.getElementById('transfer-batch').value;
            var exp = document.getElementById('transfer-exp').value;
            var qty = parseInt(document.getElementById('transfer-qty').value) || 0;
            var location = document.getElementById('transfer-location').value;

            if (mode === 'in') {
                if (!source) { alert('請選擇來源外倉'); return; }
            } else if (mode === 'out') {
                if (!source) { alert('請選擇目標外倉'); return; }
                if (!location) { alert('請選擇來源儲位'); return; }
            } else {
                if (!source) { alert('請選擇來源外倉'); return; }
                if (!target) { alert('請選擇目標外倉'); return; }
                if (source === target) { alert('來源和目標不能相同'); return; }
            }

            if (!product) { alert('請先選擇品項'); return; }
            if (qty <= 0) { alert('請輸入有效的調撥數量'); return; }

            var available = parseInt(document.getElementById('transfer-available').innerText || document.getElementById('transfer-available').textContent) || 0;
            if (qty > available) { alert('調撥數量不能超過可用數量 (' + available + ')'); return; }

            var getWhName = function(code) {
                var wh = window.warehousesData.find(function(w) { return w.code === code; });
                return wh ? wh.name : code;
            };

            var transferItem = {
                mode: mode,
                company: company,
                productName: product,
                spec: spec,
                batchNo: batch,
                expDate: exp || '',
                quantity: qty,
                sourceItem: window.transferState.selectedItem
            };

            if (mode === 'in') {
                transferItem.fromWh = source;
                transferItem.fromName = getWhName(source);
                transferItem.toWh = 'TEMP-IN';
                transferItem.toName = '進貨暫存區';
            } else if (mode === 'out') {
                transferItem.fromWh = location;
                transferItem.fromName = location;
                transferItem.toWh = source;  // source 在此模式是目標外倉
                transferItem.toName = getWhName(source);
                transferItem.tempLocation = 'TEMP-OUT';
            } else {
                transferItem.fromWh = source;
                transferItem.fromName = getWhName(source);
                transferItem.toWh = target;
                transferItem.toName = getWhName(target);
            }

            window.transferList.push(transferItem);
            renderTransferList();

            // 清除選擇
            clearTransferSelection();
            document.getElementById('transfer-qty').value = '';
        };

        function renderTransferList() {
            var tbody = document.getElementById('transfer-list');

            if (window.transferList.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" class="text-center text-slate-500 py-10">尚未加入調撥品項</td></tr>';
                document.getElementById('btn-execute-transfer').disabled = true;
                return;
            }

            var html = '';
            window.transferList.forEach(function(t, idx) {
                var expClass = '';
                if (t.expDate) {
                    var exp = new Date(t.expDate);
                    var now = new Date();
                    var days = Math.floor((exp - now) / 86400000);
                    if (days < 0) expClass = 'text-red-400';
                    else if (days < 30) expClass = 'text-orange-400';
                    else if (days < 90) expClass = 'text-yellow-400';
                }

                var modeLabel = t.mode === 'in' ? '<span class="text-emerald-400 text-xs">入庫</span>'
                              : t.mode === 'out' ? '<span class="text-orange-400 text-xs">出庫</span>'
                              : '<span class="text-purple-400 text-xs">外調</span>';

                html += '<tr class="border-b border-slate-700">';
                html += '<td class="p-2"><div class="text-white font-bold">' + t.productName + '</div>' + modeLabel + '</td>';
                html += '<td class="p-2 text-slate-400">' + (t.spec || '-') + '</td>';
                html += '<td class="p-2 text-slate-400">' + (t.batchNo || '-') + '</td>';
                html += '<td class="p-2 ' + expClass + '">' + (t.expDate || '-') + '</td>';
                html += '<td class="p-2"><span class="px-2 py-1 rounded text-xs bg-blue-900 text-blue-300">' + t.fromName + '</span></td>';
                html += '<td class="p-2"><span class="px-2 py-1 rounded text-xs bg-emerald-900 text-emerald-300">' + t.toName + '</span></td>';
                html += '<td class="p-2 text-right text-yellow-400 font-bold">' + t.quantity + '</td>';
                html += '<td class="p-2 text-center"><button onclick="removeTransferItem(' + idx + ')" class="text-red-400 hover:text-red-300"><i class="fa-solid fa-times"></i></button></td>';
                html += '</tr>';
            });

            tbody.innerHTML = html;
            document.getElementById('btn-execute-transfer').disabled = false;
        }

        window.removeTransferItem = function(idx) {
            window.transferList.splice(idx, 1);
            renderTransferList();
        };

        window.clearTransferList = function() {
            window.transferList = [];
            renderTransferList();
        };

        window.executeTransfer = async function() {
            if (window.transferList.length === 0) { alert('調撥清單為空'); return; }

            var transferInMethod = 'pending'; // 預設產生待執行工單
            var methodRadio = document.querySelector('input[name="transfer-in-method"]:checked');
            if (methodRadio) transferInMethod = methodRadio.value;

            var confirmMsg = '確認執行 ' + window.transferList.length + ' 筆調撥？';
            if (window.transferList[0] && window.transferList[0].mode === 'in') {
                if (transferInMethod === 'pending') {
                    confirmMsg += '\n\n📋 處理方式：產生待執行工單\n（將推送到智能入庫中心）';
                } else {
                    confirmMsg += '\n\n📦 處理方式：直接入暫存區\n（TEMP-IN，需手動移位）';
                }
            }

            if (!confirm(confirmMsg)) return;

            // 每一筆調撥用一個交易完成（扣來源、加目的、寫記錄同時成功或同時失敗）。
            // 成功的筆數立即從清單移除，失敗時停止，剩下的留在清單中可以修正後重試，不會重複扣帳。
            var totalCount = window.transferList.length;
            var pendingCount = 0;
            var tempCount = 0;
            var doneCount = 0;

            function findExt(whId, t) {
                return window.externalStock.find(function(s) {
                    return s.warehouseId === whId && s.productName === t.productName &&
                           s.batchNo === t.batchNo && s.company === t.company;
                });
            }
            function extRefOf(item) { return window.doc(window.db, 'externalStock', item.id); }
            function newExtRef() { return window.db.collection('externalStock').doc(); }

            try {
                while (window.transferList.length > 0) {
                    var t = window.transferList[0];
                    var i = doneCount;
                    var changes = [];
                    var creates = [];
                    var logData;

                    if (t.mode === 'in') {
                        // ========== 調撥入庫 ==========
                        var extItem = findExt(t.fromWh, t);
                        if (!extItem) throw new Error('找不到來源外倉庫存：' + t.fromName + ' ' + t.productName + ' 批號 ' + (t.batchNo || '-'));
                        changes.push({ ref: extRefOf(extItem), delta: -t.quantity, deleteWhenEmpty: true, label: t.fromName + ' ' + t.productName });

                        if (transferInMethod === 'pending') {
                            // ===== 方式A：產生待執行工單 =====
                            var orderNo = await window.nextDocNo('TR');
                            creates.push({ ref: window.db.collection('inboundOrders').doc(), data: {
                                docNo: orderNo,          // 單據編號
                                orderNo: orderNo,
                                productName: t.productName,
                                spec: t.spec || '',
                                batchNo: t.batchNo || '',
                                expDate: t.expDate || '',
                                expiryDate: t.expDate || '',
                                quantity: t.quantity,
                                company: t.company,
                                category: 'Transfer',    // 調撥入庫類型
                                typeName: '調撥入庫',    // 類型名稱
                                locationId: '待指定',    // 待選擇儲位
                                vendor: t.fromName,      // 來源倉庫當作廠商
                                status: 'pending',
                                source: '調撥入庫',
                                sourceWarehouse: t.fromWh,
                                sourceWarehouseName: t.fromName,
                                createdAt: new Date().toISOString()
                            }});
                            logData = {
                                type: 'transfer-in', toLocation: '待執行工單',
                                note: '調撥入庫(工單): ' + t.fromName + ' → 待入庫'
                            };
                        } else {
                            // ===== 方式B：直接入暫存區 =====
                            creates.push({ ref: window.db.collection('pallets').doc(), data: {
                                palletId: 'TRI-' + Date.now() + '-' + i,
                                productName: t.productName,
                                spec: t.spec || '',
                                batchNo: t.batchNo || '',
                                expiryDate: t.expDate || '',
                                quantity: t.quantity,
                                totalWeight: 0,
                                locationId: 'TEMP-IN',
                                company: t.company,
                                source: '調撥入庫',
                                sourceWarehouse: t.fromName,
                                createdAt: new Date().toISOString()
                            }});
                            logData = {
                                type: 'transfer-in', toLocation: 'TEMP-IN',
                                note: '調撥入庫: ' + t.fromName + ' → 進貨暫存區'
                            };
                        }

                    } else if (t.mode === 'out') {
                        // ========== 調撥出庫（本倉儲位→出貨暫存區→外倉）==========
                        var srcItem = t.sourceItem;
                        if (!srcItem || !srcItem.id) throw new Error('找不到來源棧板：' + t.productName);
                        changes.push({ ref: window.doc(window.db, 'pallets', srcItem.id), delta: -t.quantity, deleteWhenEmpty: true, label: srcItem.palletId || t.productName });

                        creates.push({ ref: window.db.collection('pallets').doc(), data: {
                            palletId: 'TRO-' + Date.now() + '-' + i,
                            productName: t.productName,
                            spec: t.spec || '',
                            batchNo: t.batchNo || '',
                            expiryDate: t.expDate || '',
                            quantity: t.quantity,
                            totalWeight: 0,
                            locationId: 'TEMP-OUT',
                            company: t.company,
                            source: '調撥出庫',
                            targetWarehouse: t.toName,
                            targetWarehouseId: t.toWh,
                            createdAt: new Date().toISOString()
                        }});

                        var existExt = findExt(t.toWh, t);
                        if (existExt) {
                            changes.push({ ref: extRefOf(existExt), delta: t.quantity, label: t.toName + ' ' + t.productName });
                        } else {
                            creates.push({ ref: newExtRef(), data: {
                                warehouseId: t.toWh,
                                productName: t.productName,
                                spec: t.spec || '',
                                batchNo: t.batchNo || '',
                                expDate: t.expDate || '',
                                quantity: t.quantity,
                                company: t.company,
                                source: '調撥出庫',
                                createdAt: new Date().toISOString()
                            }});
                        }
                        logData = {
                            type: 'transfer-out', toLocation: t.toWh,
                            note: '調撥出庫: ' + t.fromName + ' → ' + t.toName
                        };

                    } else {
                        // ========== 外庫調撥（外倉→外倉）==========
                        var srcExt = findExt(t.fromWh, t);
                        if (!srcExt) throw new Error('找不到來源外倉庫存：' + t.fromName + ' ' + t.productName + ' 批號 ' + (t.batchNo || '-'));
                        changes.push({ ref: extRefOf(srcExt), delta: -t.quantity, deleteWhenEmpty: true, label: t.fromName + ' ' + t.productName });

                        var dstExt = findExt(t.toWh, t);
                        if (dstExt) {
                            changes.push({ ref: extRefOf(dstExt), delta: t.quantity, label: t.toName + ' ' + t.productName });
                        } else {
                            creates.push({ ref: newExtRef(), data: {
                                warehouseId: t.toWh,
                                productName: t.productName,
                                spec: t.spec || '',
                                batchNo: t.batchNo || '',
                                expDate: t.expDate || '',
                                quantity: t.quantity,
                                company: t.company,
                                source: '外庫調撥',
                                createdAt: new Date().toISOString()
                            }});
                        }
                        logData = {
                            type: 'transfer-ext', toLocation: t.toWh,
                            note: '外庫調撥: ' + t.fromName + ' → ' + t.toName
                        };
                    }

                    await window.runStockTransaction({
                        changes: changes,
                        creates: creates,
                        logs: function() {
                            return [Object.assign({
                                productName: t.productName,
                                spec: t.spec || '',
                                quantity: t.quantity,
                                quantityChange: 0,
                                fromLocation: t.fromWh,
                                batchNo: t.batchNo || '',
                                company: t.company
                            }, logData)];
                        }
                    });

                    // 新建立的外倉庫存放進快取，後面同品項的調撥才會累加到同一筆
                    creates.forEach(function(cr) {
                        if (cr.ref.parent.id === 'externalStock') {
                            window.externalStock.push(Object.assign({ id: cr.ref.id }, cr.data));
                        }
                    });

                    if (t.mode === 'in') {
                        if (transferInMethod === 'pending') pendingCount++; else tempCount++;
                    }
                    doneCount++;
                    window.transferList.shift();
                }

                var successMsg = '✅ 調撥完成！共 ' + doneCount + ' 筆';
                if (pendingCount > 0) {
                    successMsg += '\n📋 ' + pendingCount + ' 筆已加入待執行工單';
                    showNotification('✅ 調撥完成！' + pendingCount + ' 筆已加入待執行工單，請至智能入庫中心處理', 'success');
                } else if (tempCount > 0) {
                    successMsg += '\n📦 ' + tempCount + ' 筆已入進貨暫存區';
                    showNotification('✅ 調撥完成！' + tempCount + ' 筆已入暫存區(TEMP-IN)，請移位上架', 'success');
                } else {
                    showNotification('✅ 調撥完成！共 ' + doneCount + ' 筆', 'success');
                }

                window.transferList = [];
                renderTransferList();

                await loadExternalStock();
                if (typeof fetchInventory === 'function') fetchInventory();

                if (pendingCount > 0 && typeof loadPendingInbounds === 'function') {
                    loadPendingInbounds();
                }

            } catch(e) {
                console.error('調撥失敗:', e);
                renderTransferList();
                alert('❌ 調撥失敗：' + e.message +
                    (doneCount > 0 ? '\n\n已完成 ' + doneCount + ' / ' + totalCount + ' 筆，' : '\n\n') +
                    '未完成的 ' + window.transferList.length + ' 筆仍保留在清單中，確認後可再次執行。');
                if (doneCount > 0) {
                    await loadExternalStock();
                    if (typeof fetchInventory === 'function') fetchInventory();
                }
            }
        };

        window.initTransferPage = function() {
            setTransferCompany('崇文');
            setTransferMode('in');
            // 初始化後更新步驟狀態
            setTimeout(function() {
                updateTransferStepStatus();
            }, 100);
        };

        // ========== 調撥品項選擇彈窗功能（精簡版 + 防呆）==========
        
        window.transferModalState = {
            step: 1,
            allItems: [],
            filteredItems: [],
            selectedProduct: null,
            selectedSpec: null,
            selectedBatch: null,
            selectedLocation: null,
            selectedItem: null
        };
        
        window.transferCart = [];

        // 更新步驟狀態（防呆機制）
        window.updateTransferStepStatus = function() {
            var mode = window.transferState.mode;
            var source = document.getElementById('transfer-source').value;
            var target = document.getElementById('transfer-target').value;
            
            var step1Complete = false;
            
            // 檢查步驟 1 是否完成
            if (mode === 'in' || mode === 'out') {
                step1Complete = !!source;
            } else if (mode === 'ext') {
                step1Complete = !!source && !!target && source !== target;
            }
            
            // 更新步驟 1 面板狀態
            var step1Panel = document.getElementById('transfer-step1-panel');
            var step1Hint = document.getElementById('transfer-step1-hint');
            if (step1Complete) {
                step1Panel.classList.remove('border-red-500/50');
                step1Panel.classList.add('border-emerald-500/50');
                if (step1Hint) step1Hint.classList.add('hidden');
            } else {
                step1Panel.classList.remove('border-emerald-500/50');
                if (step1Hint) step1Hint.classList.remove('hidden');
            }
            
            // 更新步驟 2 按鈕狀態
            var btn = document.getElementById('btn-open-transfer-modal');
            var step2Panel = document.getElementById('transfer-step2-panel');
            var step2Hint = document.getElementById('transfer-step2-hint');
            
            if (step1Complete) {
                btn.disabled = false;
                step2Panel.classList.remove('opacity-50');
                if (step2Hint) {
                    step2Hint.innerHTML = '<i class="fa-solid fa-info-circle mr-1"></i>彈窗內可連續選擇多筆品項';
                    step2Hint.classList.remove('text-orange-400');
                    step2Hint.classList.add('text-slate-500');
                }
            } else {
                btn.disabled = true;
                step2Panel.classList.add('opacity-50');
                if (step2Hint) {
                    var hintText = '請先選擇';
                    if (mode === 'ext') {
                        if (!source && !target) hintText += '來源和目標外倉';
                        else if (!source) hintText += '來源外倉';
                        else if (!target) hintText += '目標外倉';
                        else if (source === target) hintText = '來源和目標不能相同';
                    } else {
                        hintText += mode === 'out' ? '目標外倉' : '來源外倉';
                    }
                    step2Hint.innerHTML = '<i class="fa-solid fa-lock mr-1"></i>' + hintText;
                    step2Hint.classList.add('text-orange-400');
                    step2Hint.classList.remove('text-slate-500');
                }
            }
            
            // 如果倉庫變更，清空調撥清單中不符合的項目（提示用戶）
            if (window.transferList && window.transferList.length > 0) {
                var currentSource = source;
                var hasInvalidItems = window.transferList.some(function(item) {
                    if (mode === 'in' && item.fromWh !== currentSource) return true;
                    if (mode === 'out' && item.toWh !== currentSource) return true;
                    return false;
                });
                
                if (hasInvalidItems) {
                    // 可以選擇提示用戶或自動清空
                    // 這裡選擇保留，讓用戶自行處理
                }
            }
        };

        window.openTransferProductModal = function() {
            var mode = window.transferState.mode;
            var company = window.transferState.company;
            var source = document.getElementById('transfer-source').value;
            var target = document.getElementById('transfer-target').value;
            
            // 防呆：檢查步驟 1 是否完成
            if (mode === 'in' || mode === 'out') {
                if (!source) {
                    alert('請先選擇' + (mode === 'out' ? '目標外倉' : '來源外倉'));
                    return;
                }
            } else if (mode === 'ext') {
                if (!source) { alert('請先選擇來源外倉'); return; }
                if (!target) { alert('請先選擇目標外倉'); return; }
                if (source === target) { alert('來源和目標外倉不能相同'); return; }
            }
            
            // 根據模式載入資料
            var sourceData = [];
            
            if (mode === 'out') {
                sourceData = (window.inventory || []).filter(function(p) {
                    return p.company === company && p.quantity > 0;
                });
            } else {
                var warehouseId = source;
                sourceData = (window.externalStock || []).filter(function(s) {
                    return s.warehouseId === warehouseId && s.company === company && s.quantity > 0;
                });
            }
            
            if (sourceData.length === 0) {
                alert('目前無可調撥的品項');
                return;
            }
            
            window.transferModalState = {
                step: 1, allItems: sourceData, filteredItems: [],
                selectedProduct: null, selectedSpec: null, selectedBatch: null,
                selectedLocation: null, selectedItem: null
            };
            
            window.transferCart = [];
            renderTransferCart();
            
            // 顯示/隱藏儲位步驟
            var showLoc = (mode === 'out');
            document.querySelectorAll('.step-loc-tag, .step-loc-arrow').forEach(function(el) {
                el.style.display = showLoc ? 'inline' : 'none';
            });
            
            document.getElementById('modal-transfer-product').classList.remove('hidden');
            document.getElementById('transfer-modal-search').value = '';
            document.getElementById('transfer-modal-search').placeholder = '搜尋品名...';
            
            updateTransferModalSteps(1);
            renderTransferModalStep1();
        };

        window.closeTransferProductModal = function() {
            document.getElementById('modal-transfer-product').classList.add('hidden');
        };

        function updateTransferModalSteps(currentStep) {
            var mode = window.transferState.mode;
            var steps = ['1', '2', '3', '4', '5'];
            var stepNames = ['1.品名', '2.規格', '3.批號', '4.儲位', '數量'];
            
            // 調整步驟編號（入庫時無儲位）
            if (mode !== 'out') {
                stepNames = ['1.品名', '2.規格', '3.批號', '4.儲位', '數量'];
            }
            
            steps.forEach(function(s, idx) {
                var tag = document.getElementById('step-tag-' + s);
                if (!tag) return;
                
                var stepNum = idx + 1;
                if (stepNum < currentStep) {
                    tag.className = 'bg-emerald-600 text-white px-2 py-0.5 rounded font-bold';
                } else if (stepNum === currentStep) {
                    tag.className = 'bg-blue-600 text-white px-2 py-0.5 rounded font-bold';
                } else {
                    tag.className = 'text-slate-500';
                }
            });
            
            updateTransferBreadcrumb();
            
            var backBtn = document.getElementById('transfer-modal-back-btn');
            backBtn.classList.toggle('hidden', currentStep <= 1);
            
            window.transferModalState.step = currentStep;
        }

        function updateTransferBreadcrumb() {
            var state = window.transferModalState;
            var parts = [];
            
            if (state.selectedProduct) {
                parts.push('<span class="bg-blue-900/80 text-blue-300 px-1.5 py-0.5 rounded text-xs cursor-pointer hover:bg-blue-800" onclick="transferModalGoToStep(1)">' + escapeHtml(state.selectedProduct).substring(0, 10) + '</span>');
            }
            if (state.selectedSpec !== null) {
                parts.push('<i class="fa-solid fa-angle-right text-slate-600 text-[10px]"></i>');
                parts.push('<span class="bg-purple-900/80 text-purple-300 px-1.5 py-0.5 rounded text-xs cursor-pointer hover:bg-purple-800" onclick="transferModalGoToStep(2)">' + escapeHtml(state.selectedSpec || '無規格').substring(0, 8) + '</span>');
            }
            if (state.selectedBatch !== null) {
                parts.push('<i class="fa-solid fa-angle-right text-slate-600 text-[10px]"></i>');
                parts.push('<span class="bg-cyan-900/80 text-cyan-300 px-1.5 py-0.5 rounded text-xs">' + escapeHtml(state.selectedBatch || '無批號').substring(0, 8) + '</span>');
            }
            if (state.selectedLocation) {
                parts.push('<i class="fa-solid fa-angle-right text-slate-600 text-[10px]"></i>');
                parts.push('<span class="bg-emerald-900/80 text-emerald-300 px-1.5 py-0.5 rounded text-xs">' + escapeHtml(state.selectedLocation) + '</span>');
            }
            
            var bcEl = document.getElementById('transfer-bc-product');
            bcEl.innerHTML = parts.length > 0 ? parts.join('') : '<span class="text-slate-500 text-xs">選擇品項...</span>';
        }

        window.transferModalGoBack = function() {
            var step = window.transferModalState.step;
            var mode = window.transferState.mode;
            if (step > 1) {
                if (step === 5 && mode !== 'out') {
                    transferModalGoToStep(3);
                } else {
                    transferModalGoToStep(step - 1);
                }
            }
        };

        window.transferModalGoToStep = function(step) {
            var state = window.transferModalState;
            document.getElementById('transfer-modal-search').value = '';
            
            if (step === 1) {
                state.selectedProduct = null; state.selectedSpec = null;
                state.selectedBatch = null; state.selectedLocation = null; state.selectedItem = null;
                document.getElementById('transfer-modal-search').placeholder = '搜尋品名...';
                updateTransferModalSteps(1);
                renderTransferModalStep1();
            } else if (step === 2 && state.selectedProduct) {
                state.selectedSpec = null; state.selectedBatch = null;
                state.selectedLocation = null; state.selectedItem = null;
                document.getElementById('transfer-modal-search').placeholder = '搜尋規格...';
                updateTransferModalSteps(2);
                renderTransferModalStep2();
            } else if (step === 3 && state.selectedSpec !== null) {
                state.selectedBatch = null; state.selectedLocation = null; state.selectedItem = null;
                document.getElementById('transfer-modal-search').placeholder = '搜尋批號...';
                updateTransferModalSteps(3);
                renderTransferModalStep3();
            }
        };

        window.filterTransferModalList = function() {
            var step = window.transferModalState.step;
            if (step === 1) renderTransferModalStep1();
            else if (step === 2) renderTransferModalStep2();
            else if (step === 3) renderTransferModalStep3();
            else if (step === 4) renderTransferModalStep4();
        };

        function renderTransferModalStep1() {
            var keyword = (document.getElementById('transfer-modal-search').value || '').trim().toLowerCase();
            var items = window.transferModalState.allItems;
            var productMap = {};
            
            items.forEach(function(item) {
                var name = item.productName || '';
                if (keyword && !name.toLowerCase().includes(keyword)) return;
                if (!productMap[name]) productMap[name] = { name: name, count: 0, totalQty: 0 };
                productMap[name].count++;
                productMap[name].totalQty += item.quantity || 0;
            });
            
            var products = Object.values(productMap).sort(function(a, b) {
                return a.name.localeCompare(b.name, 'zh-TW');
            });
            
            var listArea = document.getElementById('transfer-modal-list-area');
            if (products.length === 0) {
                listArea.innerHTML = '<div class="text-center text-slate-500 py-8"><i class="fa-solid fa-inbox text-3xl mb-2"></i><div class="text-sm">無符合項目</div></div>';
                return;
            }
            
            var html = '<div class="space-y-1">';
            products.forEach(function(p) {
                html += '<div class="bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded px-3 py-2 cursor-pointer flex justify-between items-center" onclick="selectTransferModalProduct(\'' + escapeHtml(p.name) + '\')">';
                html += '<span class="text-white text-sm font-medium truncate flex-1">' + escapeHtml(p.name) + '</span>';
                html += '<div class="flex items-center gap-2 ml-2"><span class="text-yellow-400 font-bold text-sm">' + p.totalQty + '</span><i class="fa-solid fa-chevron-right text-slate-500 text-xs"></i></div>';
                html += '</div>';
            });
            html += '</div>';
            listArea.innerHTML = html;
        }

        window.selectTransferModalProduct = function(productName) {
            window.transferModalState.selectedProduct = productName;
            document.getElementById('transfer-modal-search').value = '';
            document.getElementById('transfer-modal-search').placeholder = '搜尋規格...';
            updateTransferModalSteps(2);
            renderTransferModalStep2();
        };

        function renderTransferModalStep2() {
            var keyword = (document.getElementById('transfer-modal-search').value || '').trim().toLowerCase();
            var items = window.transferModalState.allItems;
            var selectedProduct = window.transferModalState.selectedProduct;
            var specMap = {};
            
            items.forEach(function(item) {
                if (item.productName !== selectedProduct) return;
                var spec = item.spec || '';
                if (keyword && !spec.toLowerCase().includes(keyword)) return;
                var key = spec || '__empty__';
                if (!specMap[key]) specMap[key] = { spec: spec, count: 0, totalQty: 0 };
                specMap[key].count++;
                specMap[key].totalQty += item.quantity || 0;
            });
            
            var specs = Object.values(specMap).sort(function(a, b) {
                if (a.spec === '') return -1;
                if (b.spec === '') return 1;
                return a.spec.localeCompare(b.spec, 'zh-TW');
            });
            
            var listArea = document.getElementById('transfer-modal-list-area');
            if (specs.length === 0) {
                listArea.innerHTML = '<div class="text-center text-slate-500 py-8"><i class="fa-solid fa-inbox text-3xl mb-2"></i><div class="text-sm">無符合項目</div></div>';
                return;
            }
            
            var html = '<div class="space-y-1">';
            specs.forEach(function(s) {
                var displaySpec = s.spec || '(無規格)';
                html += '<div class="bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded px-3 py-2 cursor-pointer flex justify-between items-center" onclick="selectTransferModalSpec(\'' + escapeHtml(s.spec) + '\')">';
                html += '<span class="text-white text-sm font-medium truncate flex-1">' + escapeHtml(displaySpec) + '</span>';
                html += '<div class="flex items-center gap-2 ml-2"><span class="text-yellow-400 font-bold text-sm">' + s.totalQty + '</span><i class="fa-solid fa-chevron-right text-slate-500 text-xs"></i></div>';
                html += '</div>';
            });
            html += '</div>';
            listArea.innerHTML = html;
        }

        window.selectTransferModalSpec = function(spec) {
            window.transferModalState.selectedSpec = spec;
            document.getElementById('transfer-modal-search').value = '';
            document.getElementById('transfer-modal-search').placeholder = '搜尋批號...';
            updateTransferModalSteps(3);
            renderTransferModalStep3();
        };

        function renderTransferModalStep3() {
            var keyword = (document.getElementById('transfer-modal-search').value || '').trim().toLowerCase();
            var items = window.transferModalState.allItems;
            var state = window.transferModalState;
            var mode = window.transferState.mode;
            var batchMap = {};
            
            items.forEach(function(item) {
                if (item.productName !== state.selectedProduct) return;
                if ((item.spec || '') !== state.selectedSpec) return;
                var batch = item.batchNo || '';
                if (keyword && !batch.toLowerCase().includes(keyword)) return;
                var key = batch || '__empty__';
                if (!batchMap[key]) {
                    batchMap[key] = { batch: batch, expDate: item.expiryDate || item.expDate || '', count: 0, totalQty: 0, items: [] };
                }
                batchMap[key].count++;
                batchMap[key].totalQty += item.quantity || 0;
                batchMap[key].items.push(item);
            });
            
            var batches = Object.values(batchMap).sort(function(a, b) {
                if (a.expDate && b.expDate) return a.expDate.localeCompare(b.expDate);
                return a.batch.localeCompare(b.batch, 'zh-TW');
            });
            
            var listArea = document.getElementById('transfer-modal-list-area');
            if (batches.length === 0) {
                listArea.innerHTML = '<div class="text-center text-slate-500 py-8"><i class="fa-solid fa-inbox text-3xl mb-2"></i><div class="text-sm">無符合項目</div></div>';
                return;
            }
            
            var html = '<div class="space-y-1">';
            batches.forEach(function(b) {
                var displayBatch = b.batch || '(無批號)';
                var expClass = 'text-slate-400';
                if (b.expDate) {
                    var days = Math.floor((new Date(b.expDate) - new Date()) / 86400000);
                    if (days < 0) expClass = 'text-red-400';
                    else if (days < 30) expClass = 'text-orange-400';
                    else if (days < 90) expClass = 'text-yellow-400';
                }
                
                html += '<div class="bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded px-3 py-2 cursor-pointer" onclick="selectTransferModalBatch(\'' + escapeHtml(b.batch) + '\')">';
                html += '<div class="flex justify-between items-center">';
                html += '<div class="flex-1 min-w-0"><span class="text-white text-sm font-medium">' + escapeHtml(displayBatch) + '</span>';
                if (b.expDate) html += '<span class="text-xs ' + expClass + ' ml-2">' + b.expDate + '</span>';
                html += '</div>';
                html += '<div class="flex items-center gap-2 ml-2"><span class="text-yellow-400 font-bold text-sm">' + b.totalQty + '</span><i class="fa-solid fa-chevron-right text-slate-500 text-xs"></i></div>';
                html += '</div></div>';
            });
            html += '</div>';
            listArea.innerHTML = html;
        }

        window.selectTransferModalBatch = function(batch) {
            var state = window.transferModalState;
            state.selectedBatch = batch;
            var mode = window.transferState.mode;
            
            if (mode === 'out') {
                document.getElementById('transfer-modal-search').value = '';
                document.getElementById('transfer-modal-search').placeholder = '搜尋儲位...';
                updateTransferModalSteps(4);
                renderTransferModalStep4();
            } else {
                var items = state.allItems.filter(function(item) {
                    return item.productName === state.selectedProduct &&
                           (item.spec || '') === state.selectedSpec &&
                           (item.batchNo || '') === batch;
                });
                if (items.length > 0) {
                    state.selectedItem = Object.assign({}, items[0]);
                    state.selectedItem.quantity = items.reduce(function(sum, i) { return sum + (i.quantity || 0); }, 0);
                    updateTransferModalSteps(5);
                    renderTransferModalStep5();
                }
            }
        };

        function renderTransferModalStep4() {
            var keyword = (document.getElementById('transfer-modal-search').value || '').trim().toLowerCase();
            var state = window.transferModalState;
            
            var locations = state.allItems.filter(function(item) {
                if (item.productName !== state.selectedProduct) return false;
                if ((item.spec || '') !== state.selectedSpec) return false;
                if ((item.batchNo || '') !== state.selectedBatch) return false;
                if (keyword && !(item.locationId || '').toLowerCase().includes(keyword)) return false;
                return true;
            });
            
            var listArea = document.getElementById('transfer-modal-list-area');
            if (locations.length === 0) {
                listArea.innerHTML = '<div class="text-center text-slate-500 py-8"><i class="fa-solid fa-inbox text-3xl mb-2"></i><div class="text-sm">無符合項目</div></div>';
                return;
            }
            
            var html = '<div class="grid grid-cols-3 gap-2">';
            locations.forEach(function(loc) {
                html += '<div class="bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded p-2 cursor-pointer text-center" onclick="selectTransferModalLocation(\'' + escapeHtml(loc.id || loc.palletId || '') + '\')">';
                html += '<div class="text-emerald-400 font-bold text-sm">' + escapeHtml(loc.locationId || '-') + '</div>';
                html += '<div class="text-yellow-400 font-bold">' + (loc.quantity || 0) + '</div>';
                html += '</div>';
            });
            html += '</div>';
            listArea.innerHTML = html;
        }

        window.selectTransferModalLocation = function(itemId) {
            var state = window.transferModalState;
            var selectedItem = state.allItems.find(function(i) {
                return (i.id || i.palletId) === itemId &&
                       i.productName === state.selectedProduct &&
                       (i.spec || '') === state.selectedSpec &&
                       (i.batchNo || '') === state.selectedBatch;
            });
            if (selectedItem) {
                state.selectedLocation = selectedItem.locationId;
                state.selectedItem = selectedItem;
                updateTransferModalSteps(5);
                renderTransferModalStep5();
            }
        };

        function renderTransferModalStep5() {
            var state = window.transferModalState;
            var item = state.selectedItem;
            var mode = window.transferState.mode;
            if (!item) return;
            
            var maxQty = item.quantity || 0;
            var html = '<div class="max-w-sm mx-auto space-y-3">';
            
            // 品項摘要
            html += '<div class="bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm">';
            html += '<div class="text-white font-bold truncate">' + escapeHtml(state.selectedProduct) + '</div>';
            html += '<div class="text-slate-400 text-xs mt-1">' + escapeHtml(state.selectedSpec || '無規格') + ' | ' + escapeHtml(state.selectedBatch || '無批號') + '</div>';
            if (mode === 'out') html += '<div class="text-emerald-400 text-xs mt-0.5"><i class="fa-solid fa-location-dot mr-1"></i>' + escapeHtml(state.selectedLocation) + '</div>';
            html += '<div class="flex justify-between items-center mt-2 pt-2 border-t border-slate-700">';
            html += '<span class="text-slate-400 text-xs">可調數量</span><span class="text-yellow-400 font-bold text-lg">' + maxQty + '</span>';
            html += '</div></div>';
            
            // 數量輸入
            html += '<div class="bg-blue-900/30 border border-blue-600/50 rounded-lg p-3">';
            html += '<div class="flex items-center gap-2">';
            html += '<button onclick="adjustTransferQty(-10)" class="w-9 h-9 bg-slate-700 hover:bg-slate-600 text-white rounded font-bold text-sm">-10</button>';
            html += '<button onclick="adjustTransferQty(-1)" class="w-9 h-9 bg-slate-700 hover:bg-slate-600 text-white rounded font-bold">-1</button>';
            html += '<input type="number" id="transfer-modal-qty" class="flex-1 scan-input text-center text-xl font-bold h-10" value="' + maxQty + '" min="1" max="' + maxQty + '">';
            html += '<button onclick="adjustTransferQty(1)" class="w-9 h-9 bg-slate-700 hover:bg-slate-600 text-white rounded font-bold">+1</button>';
            html += '<button onclick="adjustTransferQty(10)" class="w-9 h-9 bg-slate-700 hover:bg-slate-600 text-white rounded font-bold text-sm">+10</button>';
            html += '</div>';
            html += '<div class="flex gap-2 mt-2">';
            html += '<button onclick="setTransferQtyMax()" class="flex-1 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs font-bold">全部</button>';
            html += '<button onclick="setTransferQtyHalf()" class="flex-1 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs font-bold">一半</button>';
            html += '</div></div>';
            
            // 按鈕
            html += '<button onclick="addToTransferCart()" class="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-sm"><i class="fa-solid fa-cart-plus mr-1"></i>加入已選</button>';
            html += '<button onclick="transferModalGoToStep(1)" class="w-full py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs"><i class="fa-solid fa-plus mr-1"></i>繼續選擇其他品項</button>';
            html += '</div>';
            
            document.getElementById('transfer-modal-list-area').innerHTML = html;
        }

        window.adjustTransferQty = function(delta) {
            var input = document.getElementById('transfer-modal-qty');
            var max = parseInt(input.max) || 9999;
            var newVal = Math.max(1, Math.min(max, (parseInt(input.value) || 0) + delta));
            input.value = newVal;
        };

        window.setTransferQtyMax = function() {
            var input = document.getElementById('transfer-modal-qty');
            input.value = input.max;
        };

        window.setTransferQtyHalf = function() {
            var input = document.getElementById('transfer-modal-qty');
            input.value = Math.ceil((parseInt(input.max) || 0) / 2);
        };

        window.addToTransferCart = function() {
            var state = window.transferModalState;
            var item = state.selectedItem;
            var qtyInput = document.getElementById('transfer-modal-qty');
            var qty = parseInt(qtyInput.value) || 0;
            var maxQty = parseInt(qtyInput.max) || 0;
            
            if (qty <= 0) { alert('請輸入有效數量'); return; }
            if (qty > maxQty) { alert('數量不能超過 ' + maxQty); return; }
            
            window.transferCart.push({
                productName: state.selectedProduct,
                spec: state.selectedSpec || '',
                batchNo: state.selectedBatch || '',
                expDate: item.expiryDate || item.expDate || '',
                locationId: state.selectedLocation || '',
                quantity: qty,
                maxQty: maxQty,
                sourceItem: item
            });
            
            renderTransferCart();
            showNotification('✅ 已加入 ' + qty + ' 件', 'success');
            
            state.selectedProduct = null; state.selectedSpec = null;
            state.selectedBatch = null; state.selectedLocation = null; state.selectedItem = null;
            
            document.getElementById('transfer-modal-search').value = '';
            document.getElementById('transfer-modal-search').placeholder = '搜尋品名...';
            updateTransferModalSteps(1);
            renderTransferModalStep1();
        };

        function renderTransferCart() {
            var cartList = document.getElementById('transfer-cart-list');
            var cartCount = document.getElementById('transfer-cart-count');
            var confirmBtn = document.getElementById('transfer-cart-confirm-btn');
            
            cartCount.textContent = window.transferCart.length;
            
            if (window.transferCart.length === 0) {
                cartList.innerHTML = '<div class="text-center text-slate-500 py-6 text-xs"><i class="fa-solid fa-inbox text-xl mb-1 opacity-50"></i><div>尚未選擇</div></div>';
                confirmBtn.disabled = true;
                return;
            }
            
            confirmBtn.disabled = false;
            var totalQty = 0;
            
            var html = '<div class="space-y-1">';
            window.transferCart.forEach(function(item, idx) {
                totalQty += item.quantity;
                html += '<div class="bg-slate-800 border border-slate-700 rounded p-1.5 relative text-xs">';
                html += '<button onclick="removeFromTransferCart(' + idx + ')" class="absolute -top-1 -right-1 w-4 h-4 bg-red-600 hover:bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center"><i class="fa-solid fa-times"></i></button>';
                html += '<div class="text-white font-bold truncate pr-3">' + escapeHtml(item.productName).substring(0, 12) + '</div>';
                html += '<div class="flex justify-between items-center mt-0.5">';
                html += '<span class="text-slate-400 truncate">' + escapeHtml(item.spec || '無規格').substring(0, 8) + '</span>';
                html += '<span class="text-yellow-400 font-bold">' + item.quantity + '</span>';
                html += '</div></div>';
            });
            html += '</div>';
            html += '<div class="mt-2 pt-2 border-t border-slate-600 flex justify-between items-center text-xs">';
            html += '<span class="text-slate-400 font-bold">合計</span>';
            html += '<span class="text-yellow-400 font-bold">' + totalQty + ' 件</span>';
            html += '</div>';
            
            cartList.innerHTML = html;
        }

        window.removeFromTransferCart = function(idx) {
            window.transferCart.splice(idx, 1);
            renderTransferCart();
        };

        window.confirmTransferCart = function() {
            if (window.transferCart.length === 0) { alert('請先選擇品項'); return; }
            
            var mode = window.transferState.mode;
            var company = window.transferState.company;
            var source = document.getElementById('transfer-source').value;
            var target = document.getElementById('transfer-target').value;
            
            var getWhName = function(code) {
                var wh = window.warehousesData.find(function(w) { return w.code === code; });
                return wh ? wh.name : code;
            };
            
            window.transferCart.forEach(function(cartItem) {
                var transferItem = {
                    mode: mode, company: company,
                    productName: cartItem.productName, spec: cartItem.spec,
                    batchNo: cartItem.batchNo, expDate: cartItem.expDate,
                    quantity: cartItem.quantity, sourceItem: cartItem.sourceItem
                };
                
                if (mode === 'in') {
                    transferItem.fromWh = source; transferItem.fromName = getWhName(source);
                    transferItem.toWh = 'TEMP-IN'; transferItem.toName = '進貨暫存區';
                } else if (mode === 'out') {
                    transferItem.fromWh = cartItem.locationId; transferItem.fromName = cartItem.locationId;
                    transferItem.toWh = source; transferItem.toName = getWhName(source);
                    transferItem.tempLocation = 'TEMP-OUT';
                } else {
                    transferItem.fromWh = source; transferItem.fromName = getWhName(source);
                    transferItem.toWh = target; transferItem.toName = getWhName(target);
                }
                
                window.transferList.push(transferItem);
            });
            
            renderTransferList();
            showNotification('✅ 已加入 ' + window.transferCart.length + ' 筆到調撥清單', 'success');
            
            window.transferCart = [];
            closeTransferProductModal();
        };

        window.clearTransferSelection = function() {
            var el = document.getElementById('transfer-selected-product');
            if (el) el.classList.add('hidden');
            window.transferState.selectedItem = null;
            window.transferState.locationItems = [];
        };

        function escapeHtml(str) {
            if (!str) return '';
            return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
        }

