// ============================================================
// js/07-stock-transactions.js — 異動記錄、審計日誌、庫存交易（runStockTransaction 等）
// 由原 app.js 第 10334–10948 行拆出；各檔依 index.html 的順序載入，共用全域（window）
// ============================================================
        // ========== 庫存異動記錄系統 ==========

        window.rebuildHistoryLogs = async function() {
            if (!confirm('此功能會將目前所有庫存補建為「期初入庫」記錄。\n\n確定要執行嗎？')) {
                return;
            }

            try {
                var pallets = window.currentPallets ? window.currentPallets() : [];
                if (pallets.length === 0) {
                    alert('目前沒有庫存資料');
                    return;
                }

                var count = 0;
                var errors = 0;

                var progressDiv = document.createElement('div');
                progressDiv.id = 'rebuild-progress';
                progressDiv.className = 'fixed inset-0 z-50 bg-black/80 flex items-center justify-center';
                progressDiv.innerHTML = '<div class="bg-slate-800 p-8 rounded-xl text-center"><i class="fa-solid fa-spinner fa-spin text-4xl text-blue-400 mb-4"></i><div class="text-white text-xl">補建中... 0/' + pallets.length + '</div></div>';
                document.body.appendChild(progressDiv);

                for (var i = 0; i < pallets.length; i++) {
                    var p = pallets[i];

                    try {
                        await window.logInventoryChange({
                            type: 'inbound',
                            productName: p.productName || '',
                            spec: p.spec || '',
                            quantity: p.quantity || 0,
                            quantityChange: p.quantity || 0,
                            locationId: p.locationId || '',
                            batchNo: p.batchNo || '',
                            palletId: p.palletId || '',
                            expDate: p.expDate || p.expiryDate || '',
                            note: '期初補建 - ' + (p.source || '既有庫存')
                        });
                        count++;
                    } catch (e) {
                        errors++;
                        console.error('補建失敗:', p.palletId, e);
                    }

                    progressDiv.querySelector('div > div').textContent = '補建中... ' + (i + 1) + '/' + pallets.length;
                }

                document.body.removeChild(progressDiv);

                alert('✅ 補建完成！\n\n成功：' + count + ' 筆\n失敗：' + errors + ' 筆');

                searchInventoryLog();

            } catch (e) {
                alert('❌ 補建失敗：' + e.message);
                var prog = document.getElementById('rebuild-progress');
                if (prog) prog.remove();
            }
        };

        // ========== 操作審計日誌 ==========
        window.logAudit = async function(action, module, targetId, detail, changes) {
            try {
                if (!window.db || !window.collection || !window.addDoc) return null;
                var operator = window.getOperatorName ? window.getOperatorName() : (window.currentUser ? window.currentUser.email : 'system');
                var logEntry = {
                    timestamp: new Date().toISOString(),
                    type: 'audit',
                    action: action,
                    module: module,
                    targetId: targetId || '',
                    productName: detail || '',
                    spec: '', quantity: 0, quantityChange: 0,
                    locationId: '', batchNo: '', palletId: '',
                    note: changes || '',
                    operator: operator,
                    company: '',
                    createdAt: new Date()
                };
                await window.addDoc(window.collection(window.db, 'inventoryLogs'), logEntry);
                console.log('📝 審計:', action, module, detail);
                return true;
            } catch(e) {
                console.error('審計日誌失敗:', e);
                return null;
            }
        };

        // buildInventoryLogEntry、runStockTransaction、mergePalletsTx、movePalletTx 等
        // 已移到 js/shared/stock-core.js（手機版共用）

        window.logInventoryChange = async function(data) {
            try {
                if (!window.db || !window.collection || !window.addDoc) {
                    console.log('Firebase 尚未初始化，跳過記錄異動');
                    return null;
                }

                var operator = data.operator || (window.getOperatorName ? window.getOperatorName() : 'system');

                var logEntry = window.buildInventoryLogEntry(data);

                var docRef = await addDoc(collection(db, 'inventoryLogs'), logEntry);
                console.log('異動記錄已儲存:', logEntry.type, logEntry.productName, '公司:', logEntry.company, '操作者:', operator);
                return docRef.id;
            } catch (e) {
                console.error('記錄異動失敗:', e);
                return null;
            }
        };

        window.setLogDateRange = function(range) {
            var today = new Date();
            var fromDate = new Date();
            var toDate = today;

            switch(range) {
                case 'today':
                    fromDate = today;
                    break;
                case 'week':
                    fromDate.setDate(today.getDate() - 7);
                    break;
                case 'month':
                    fromDate.setDate(today.getDate() - 30);
                    break;
                case 'all':
                    fromDate = new Date('2024-01-01');
                    break;
            }

            document.getElementById('log-date-from').value = fromDate.toLocalYMD();
            document.getElementById('log-date-to').value = toDate.toLocalYMD();
        };

        window.initInventoryLogPage = function() {
            setLogDateRange('week');
        };

        window.searchInventoryLog = async function() {
            var dateFrom = document.getElementById('log-date-from').value;
            var dateTo = document.getElementById('log-date-to').value;
            var productName = document.getElementById('log-product-name').value.trim().toLowerCase();
            var location = document.getElementById('log-location').value.trim().toUpperCase();
            var logType = document.getElementById('log-type').value;

            var tbody = document.getElementById('inventory-log-list');
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-slate-500 py-8"><i class="fa-solid fa-spinner fa-spin mr-2"></i>查詢中...</td></tr>';

            try {
                if (!window.db || !window.collection || !window.getDocs) {
                    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-red-400 py-8">Firebase 尚未初始化</td></tr>';
                    return;
                }

                var logsRef = window.collection(window.db, 'inventoryLogs');
                var constraints = [];

                if (dateFrom) {
                    constraints.push(window.where('timestamp', '>=', window.localDayStartISO(dateFrom)));
                }
                if (dateTo) {
                    constraints.push(window.where('timestamp', '<=', window.localDayEndISO(dateTo)));
                }

                // type + timestamp 組合查詢需要 Firestore 複合索引，
                // 所以有選類型時只用 type 查詢，日期、排序、筆數在前端處理
                var q = logType ?
                    window.query(logsRef, window.where('type', '==', logType)) :
                    window.query(logsRef, ...constraints, window.orderBy('timestamp', 'desc'), window.limit(500));

                var snapshot = await window.getDocs(q);
                var logs = [];
                var tsFrom = dateFrom ? window.localDayStartISO(dateFrom) : '';
                var tsTo = dateTo ? window.localDayEndISO(dateTo) : '';

                snapshot.forEach(function(doc) {
                    var data = doc.data();
                    data.id = doc.id;

                    if (logType) {
                        var ts = typeof data.timestamp === 'string' ? data.timestamp : '';
                        if (tsFrom && !(ts >= tsFrom)) return;
                        if (tsTo && !(ts <= tsTo)) return;
                    }

                    if (productName && !(data.productName || '').toLowerCase().includes(productName)) {
                        return;
                    }

                    if (location) {
                        var matchLoc = (data.locationId || '').toUpperCase().includes(location) ||
                                       (data.fromLocation || '').toUpperCase().includes(location) ||
                                       (data.toLocation || '').toUpperCase().includes(location);
                        if (!matchLoc) return;
                    }

                    logs.push(data);
                });

                if (logType) {
                    logs.sort(function(a, b) {
                        return String(b.timestamp || '').localeCompare(String(a.timestamp || ''));
                    });
                    logs = logs.slice(0, 500);
                }

                updateLogStatistics(logs);

                renderInventoryLogs(logs);

            } catch (e) {
                console.error('查詢異動記錄失敗:', e);
                tbody.innerHTML = '<tr><td colspan="8" class="text-center text-red-400 py-8">查詢失敗: ' + e.message + '</td></tr>';
            }
        };

        function updateLogStatistics(logs) {
            var stats = { total: logs.length, inbound: 0, outbound: 0, move: 0, other: 0 };

            logs.forEach(function(log) {
                switch(log.type) {
                    case 'inbound': stats.inbound++; break;
                    case 'outbound': stats.outbound++; break;
                    case 'move': stats.move++; break;
                    default: stats.other++; break;
                }
            });

            document.getElementById('log-stat-total').textContent = stats.total;
            document.getElementById('log-stat-inbound').textContent = stats.inbound;
            document.getElementById('log-stat-outbound').textContent = stats.outbound;
            document.getElementById('log-stat-move').textContent = stats.move;
            document.getElementById('log-stat-other').textContent = stats.other;
            document.getElementById('log-result-count').textContent = stats.total;
        }

        function renderInventoryLogs(logs) {
            var tbody = document.getElementById('inventory-log-list');

            if (logs.length === 0) {
                tbody.innerHTML = '<tr><td colspan="10" class="text-center text-slate-500 py-16"><i class="fa-solid fa-inbox text-4xl mb-3 opacity-30"></i><p>查無資料</p></td></tr>';
                return;
            }

            var html = '';
            logs.forEach(function(log) {
                var typeLabel = getLogTypeLabel(log.type);
                var typeClass = getLogTypeClass(log.type);
                var qtyDisplay = formatQuantityChange(log);
                var weightDisplay = formatWeightChange(log);
                var locationDisplay = formatLocationDisplay(log);

                var companyClass = log.company === '八方' ? 'bg-purple-900/50 text-purple-300' : 'bg-blue-900/50 text-blue-300';
                var companyLabel = log.company ? '<span class="px-1.5 py-0.5 rounded text-xs ' + companyClass + '">' + log.company + '</span>' : '-';

                // 審計日誌特殊顯示
                var isAudit = log.type === 'audit';
                if (isAudit) {
                    var actionMap = { 'CREATE': '新增', 'UPDATE': '修改', 'DELETE': '刪除', 'IMPORT': '匯入', 'BATCH_UPDATE': '批次更新' };
                    var moduleMap = { 'productMaster': '品項主檔', 'pallets': '庫存', 'system': '系統' };
                    typeLabel = '📝 ' + (actionMap[log.action] || log.action || '操作');
                    companyLabel = '<span class="px-1.5 py-0.5 rounded text-xs bg-slate-700 text-slate-300">' + (moduleMap[log.module] || log.module || '-') + '</span>';
                }

                html += '<tr class="border-t border-slate-700 hover:bg-slate-700/30' + (isAudit ? ' bg-slate-800/30' : '') + '">';
                html += '<td class="p-3 text-slate-300 font-mono text-xs">' + formatTimestamp(log.timestamp) + '</td>';
                html += '<td class="p-3">' + companyLabel + '</td>';
                html += '<td class="p-3"><span class="px-2 py-1 rounded text-xs font-bold ' + typeClass + '">' + typeLabel + '</span></td>';
                html += '<td class="p-3 text-white font-medium">' + (log.productName || '-') + '</td>';
                html += '<td class="p-3 text-slate-400">' + (log.spec || '-') + '</td>';
                html += '<td class="p-3 text-right font-bold ' + qtyDisplay.class + '">' + qtyDisplay.text + '</td>';
                html += '<td class="p-3 text-right ' + weightDisplay.class + '">' + weightDisplay.text + '</td>';
                html += '<td class="p-3 font-mono text-sm">' + locationDisplay + '</td>';
                html += '<td class="p-3 text-slate-400 text-xs">' + (log.batchNo || '-') + '</td>';
                html += '<td class="p-3 text-slate-500 text-xs max-w-[150px] truncate" title="' + (log.note || '') + '">' + (log.note || '-') + '</td>';
                html += '</tr>';
            });

            tbody.innerHTML = html;
        }

        function getLogTypeLabel(type) {
            var labels = {
                'inbound': '入庫',
                'outbound': '出庫',
                'move': '移位',
                'merge': '合併',
                'adjust': '調整',
                'picking': '領用',
                'transfer': '調撥',
                'audit': '📝 操作'
            };
            return labels[type] || type || '未知';
        }

        function getLogTypeClass(type) {
            var classes = {
                'inbound': 'bg-emerald-600 text-white',
                'outbound': 'bg-red-600 text-white',
                'move': 'bg-blue-600 text-white',
                'merge': 'bg-purple-600 text-white',
                'adjust': 'bg-yellow-600 text-black',
                'picking': 'bg-orange-600 text-white',
                'transfer': 'bg-pink-600 text-white',
                'audit': 'bg-slate-500 text-white'
            };
            return classes[type] || 'bg-slate-600 text-white';
        }

        function formatQuantityChange(log) {
            var qty = log.quantity || 0;
            var change = log.quantityChange || 0;

            if (log.type === 'inbound') {
                return { text: '+' + qty, class: 'text-emerald-400' };
            } else if (log.type === 'outbound' || log.type === 'picking') {
                return { text: '-' + qty, class: 'text-red-400' };
            } else if (log.type === 'move') {
                return { text: qty.toString(), class: 'text-blue-400' };
            } else if (change > 0) {
                return { text: '+' + change, class: 'text-emerald-400' };
            } else if (change < 0) {
                return { text: change.toString(), class: 'text-red-400' };
            }
            return { text: qty.toString(), class: 'text-white' };
        }

        function formatWeightChange(log) {
            var weight = log.weight || 0;
            var change = log.weightChange || 0;

            if (weight === 0 && change === 0) {
                return { text: '-', class: 'text-slate-600' };
            }

            if (log.type === 'inbound') {
                return { text: '+' + weight + ' kg', class: 'text-emerald-400' };
            } else if (log.type === 'outbound' || log.type === 'picking') {
                return { text: '-' + weight + ' kg', class: 'text-red-400' };
            } else if (log.type === 'move') {
                return { text: weight + ' kg', class: 'text-blue-400' };
            } else if (change > 0) {
                return { text: '+' + change + ' kg', class: 'text-emerald-400' };
            } else if (change < 0) {
                return { text: change + ' kg', class: 'text-red-400' };
            }
            return { text: weight + ' kg', class: 'text-amber-400' };
        }

        function formatLocationDisplay(log) {
            if (log.type === 'move' && log.fromLocation && log.toLocation) {
                return '<span class="text-red-400">' + log.fromLocation + '</span> → <span class="text-emerald-400">' + log.toLocation + '</span>';
            }
            return '<span class="text-slate-300">' + (log.locationId || log.toLocation || '-') + '</span>';
        }

        function formatTimestamp(ts) {
            if (!ts) return '-';
            try {
                var date = new Date(ts);
                var y = date.getFullYear();
                var m = String(date.getMonth() + 1).padStart(2, '0');
                var d = String(date.getDate()).padStart(2, '0');
                var h = String(date.getHours()).padStart(2, '0');
                var min = String(date.getMinutes()).padStart(2, '0');
                return y + '/' + m + '/' + d + ' ' + h + ':' + min;
            } catch (e) {
                return ts;
            }
        }

        window.exportInventoryLog = function() {
            var logs = [];
            var rows = document.querySelectorAll('#inventory-log-list tr');

            if (rows.length === 0 || rows[0].querySelector('td[colspan]')) {
                alert('沒有資料可匯出');
                return;
            }

            var csv = '\uFEFF日期時間,類型,品項,規格,數量,儲位,批號,備註\n';

            rows.forEach(function(row) {
                var cells = row.querySelectorAll('td');
                if (cells.length >= 8) {
                    var rowData = [];
                    cells.forEach(function(cell, idx) {
                        var text = cell.textContent.trim().replace(/"/g, '""');
                        rowData.push('"' + text + '"');
                    });
                    csv += rowData.join(',') + '\n';
                }
            });

            var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = '庫存異動記錄_' + new Date().toLocalYMD() + '.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        };

