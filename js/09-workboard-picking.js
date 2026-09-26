// ============================================================
// js/09-workboard-picking.js — 工單看板、品項選擇、智能入庫建議、揀貨
// 由原 app.js 第 12521–14267 行拆出；各檔依 index.html 的順序載入，共用全域（window）
// ============================================================
        // ========== 工單看板功能 ==========
        
        var boardRefreshTimer = null;
        
        // 🔧 修正：載入工單看板所需資料（領料工單取代待入庫工單）
        // 看板資料放在自己的變數（原本會把波次頁、調撥頁共用的清單換成看板的資料）
        // 讀實際有在用的資料：待上架的入庫任務、進行中的波次（含待分貨）、還沒完成的調度工單
        window.loadWorkBoardData = async function() {
            var db = window.db;
            if (!db) return;
            var board = window._board = window._board || { tasks: [], waves: [], dispatch: [] };
            try {
                var t = await db.collection('inboundTasks').where('status', '==', 'pending').get();
                board.tasks = t.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); })
                    .sort(function(x, y) { return String(x.createdAt || '').localeCompare(String(y.createdAt || '')); });
            } catch (e) { console.warn('看板：讀入庫任務失敗', e); }
            try {
                var w = await db.collection('waves').where('status', 'in', ['pending', 'picking', 'sorting']).get();
                board.waves = w.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
            } catch (e) { console.warn('看板：讀波次失敗', e); }
            try {
                var o = await db.collection('dispatchOrders').where('status', 'in', ['pending', 'in_progress']).get();
                board.dispatch = o.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
            } catch (e) { console.warn('看板：讀調度工單失敗', e); }
        };

        // 刷新工單看板
        window.refreshWorkBoard = function() {
            // 更新時間
            var now = new Date();
            document.getElementById('board-update-time').textContent = 
                '更新時間：' + now.toLocaleTimeString('zh-TW');
            
            // 統計數據
            var pendingCount = 0;
            var waveCount = 0;
            var transferCount = 0;
            var moveCount = 0;
            var urgentCount = 0;
            
            var board = window._board || { tasks: [], waves: [], dispatch: [] };
            var esc = function(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

            // 1. 待上架的入庫任務（手機「入庫任務」）
            var pendingHtml = '';
            pendingCount = board.tasks.length;
            board.tasks.forEach(function(task, idx) {
                if (idx >= 10) return;
                var hold = task.expiryApproval === 'pending';
                if (hold) urgentCount++;
                var timeStr = task.createdAt ? new Date(task.createdAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }) : '';
                pendingHtml += '<div class="bg-slate-800 rounded-lg p-3 border-l-4 ' + (hold ? 'border-red-500' : 'border-green-500') + '">';
                pendingHtml += '<div class="flex justify-between items-start">';
                pendingHtml += '<div class="text-lg font-bold text-white truncate flex-1">' + esc(task.productName || '-') + ' <span class="text-sm text-slate-400">' + esc(task.spec || '') + '</span></div>';
                pendingHtml += '<div class="text-2xl font-bold text-green-400">' + esc(task.quantity || 0) + ' 件</div>';
                pendingHtml += '</div>';
                pendingHtml += '<div class="flex justify-between items-center mt-2 text-sm">';
                pendingHtml += '<span class="text-slate-400">' + esc(task.orderNo || task.palletId || '-') + '</span>';
                pendingHtml += '<span class="text-cyan-400 font-bold">→ ' + esc(task.locationId || '待指定') + '</span>';
                pendingHtml += '</div>';
                if (hold) pendingHtml += '<div class="text-xs text-red-400 mt-1">即期品待主管核准</div>';
                else if (timeStr) pendingHtml += '<div class="text-xs text-slate-500 mt-1"><i class="fa-solid fa-clock mr-1"></i>' + timeStr + '</div>';
                pendingHtml += '</div>';
            });
            if (pendingCount === 0) {
                pendingHtml = '<div class="text-center text-slate-500 py-8"><i class="fa-solid fa-check-circle text-4xl mb-2 block text-emerald-500"></i>沒有待上架的貨</div>';
            }
            document.getElementById('board-pending-list').innerHTML = pendingHtml;

            // 2. 揀貨工單（波次）- 修正數據來源
            var waveHtml = '';
            var activeWaves = board.waves;
            waveCount = activeWaves.length;
            
            activeWaves.forEach(function(wave, idx) {
                if (idx >= 10) return;
                // 進度＝已揀項目／品項數（completedItems 是手機、電腦掃過的揀貨項目）
                var doneN = (wave.completedItems || []).length, allN = wave.itemCount || (wave.summary || []).length || 0;
                var progress = allN ? Math.min(100, Math.round(doneN / allN * 100)) : 0;
                var isUrgent = wave.priority === 'urgent';
                if (isUrgent) urgentCount++;
                
                waveHtml += '<div class="bg-slate-800 rounded-lg p-3 border-l-4 ' + 
                    (isUrgent ? 'border-red-500 animate-pulse' : 'border-orange-500') + '">';
                waveHtml += '<div class="flex justify-between items-start">';
                waveHtml += '<div class="text-lg font-bold text-white">' + (wave.waveNo || wave.id) + '</div>';
                waveHtml += '<div class="text-sm px-2 py-0.5 rounded ' + 
                    (wave.status === 'picking' ? 'bg-orange-600' : 'bg-slate-600') + ' text-white">' + 
                    (wave.status === 'picking' ? '揀貨中' : wave.status === 'sorting' ? '待分貨' : '待處理') + '</div>';
                waveHtml += '</div>';
                waveHtml += '<div class="mt-2">';
                waveHtml += '<div class="flex justify-between text-sm mb-1">';
                waveHtml += '<span class="text-slate-400">進度</span>';
                waveHtml += '<span class="text-orange-400 font-bold">' + doneN + '/' + allN + ' 項（' + (wave.orderCount || (wave.orders || []).length) + ' 單）</span>';
                waveHtml += '</div>';
                waveHtml += '<div class="w-full bg-slate-700 rounded-full h-2">';
                waveHtml += '<div class="bg-orange-500 h-2 rounded-full" style="width:' + progress + '%"></div>';
                waveHtml += '</div>';
                waveHtml += '</div>';
                waveHtml += '</div>';
            });
            
            if (waveCount === 0) {
                waveHtml = '<div class="text-center text-slate-500 py-8"><i class="fa-solid fa-check-circle text-4xl mb-2 block text-emerald-500"></i>無進行中揀貨</div>';
            }
            document.getElementById('board-wave-list').innerHTML = waveHtml;
            
            // 3. 還沒完成的調度工單（手機「調度工單」）
            var transferHtml = '';
            transferCount = board.dispatch.length;
            board.dispatch.forEach(function(item, idx) {
                if (idx >= 10) return;
                var done = (item.completedOps || []).length, all = (item.operations || []).length;
                transferHtml += '<div class="bg-slate-800 rounded-lg p-3 border-l-4 border-purple-500">';
                transferHtml += '<div class="text-lg font-bold text-white truncate">' + esc(item.productName || '-') + ' <span class="text-sm text-slate-400">' + esc(item.spec || '') + '</span></div>';
                transferHtml += '<div class="flex justify-between items-center mt-2">';
                transferHtml += '<div class="text-sm text-slate-400">' + esc(item.orderNo || '') + '</div>';
                transferHtml += '<div class="text-xl font-bold text-purple-400">' + done + '/' + all + ' 項</div>';
                transferHtml += '</div>';
                transferHtml += '</div>';
            });

            // 移位工單（從待移位佇列）
            var moveList = window.pendingMoves || [];
            moveCount = moveList.length;
            
            moveList.forEach(function(item, idx) {
                if (idx >= 5) return;
                transferHtml += '<div class="bg-slate-800 rounded-lg p-3 border-l-4 border-cyan-500">';
                transferHtml += '<div class="flex justify-between items-start">';
                transferHtml += '<div class="text-lg font-bold text-white truncate flex-1">' + (item.productName || '-') + '</div>';
                transferHtml += '<span class="text-xs bg-cyan-600 px-2 py-0.5 rounded text-white">移位</span>';
                transferHtml += '</div>';
                transferHtml += '<div class="flex justify-between items-center mt-2">';
                transferHtml += '<div class="text-sm">';
                transferHtml += '<span class="text-slate-400">' + (item.from || '-') + '</span>';
                transferHtml += '<i class="fa-solid fa-arrow-right mx-2 text-slate-500"></i>';
                transferHtml += '<span class="text-emerald-400">' + (item.to || '-') + '</span>';
                transferHtml += '</div>';
                transferHtml += '</div>';
                transferHtml += '</div>';
            });
            
            if (transferCount === 0 && moveCount === 0) {
                transferHtml = '<div class="text-center text-slate-500 py-8"><i class="fa-solid fa-check-circle text-4xl mb-2 block text-emerald-500"></i>沒有進行中的調度工單</div>';
            }
            document.getElementById('board-transfer-list').innerHTML = transferHtml;
            
            // 更新統計數字
            document.getElementById('board-pending-count').textContent = pendingCount;
            document.getElementById('board-pending-badge').textContent = pendingCount;
            document.getElementById('board-wave-count').textContent = waveCount;
            document.getElementById('board-wave-badge').textContent = waveCount;
            document.getElementById('board-transfer-count').textContent = transferCount;
            document.getElementById('board-transfer-badge').textContent = transferCount + moveCount;
            document.getElementById('board-move-count').textContent = moveCount;
            document.getElementById('board-urgent-count').textContent = urgentCount;
            
            // 如果有緊急工單，閃爍標題
            var titleEl = document.querySelector('#view-work-board h1');
            if (urgentCount > 0 && titleEl) {
                titleEl.classList.add('animate-pulse');
            } else if (titleEl) {
                titleEl.classList.remove('animate-pulse');
            }
        };
        
        // 設定自動刷新間隔
        window.setBoardRefreshInterval = function() {
            var interval = parseInt(document.getElementById('board-refresh-interval').value) * 1000;
            
            // 清除現有計時器
            if (boardRefreshTimer) {
                clearInterval(boardRefreshTimer);
                boardRefreshTimer = null;
            }
            
            // 🔧 修正：設定新計時器，每次刷新時重新載入資料
            if (interval > 0) {
                boardRefreshTimer = setInterval(function() {
                    // 離開看板就不要再背景讀資料
                    var v = document.getElementById('view-work-board');
                    if (!v || v.classList.contains('hidden')) return;
                    loadWorkBoardData().then(function() {
                        refreshWorkBoard();
                    });
                }, interval);
            }
        };
        
        // 全螢幕切換
        window.toggleBoardFullscreen = function() {
            var elem = document.getElementById('view-work-board');
            if (!document.fullscreenElement) {
                if (elem.requestFullscreen) {
                    elem.requestFullscreen();
                } else if (elem.webkitRequestFullscreen) {
                    elem.webkitRequestFullscreen();
                } else if (elem.msRequestFullscreen) {
                    elem.msRequestFullscreen();
                }
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                }
            }
        };
        
        // 開啟電視投放視窗
        window.openTVBoard = function() {
            // 與看板同一份資料：待上架入庫任務、進行中波次、未完成調度工單
            var board = window._board || { tasks: [], waves: [], dispatch: [] };
            var pendingPickingOrders = board.tasks.map(function(t) {
                return { productName: (t.productName || '') + ' ' + (t.spec || ''), quantity: t.quantity, applicant: t.orderNo || t.palletId || '', purpose: '→ ' + (t.locationId || '待指定') };
            });
            var activeWaves = board.waves;
            var pendingTransfers = board.dispatch.map(function(d) {
                return { productName: d.productName || '', fromWarehouse: d.orderNo || '', toWarehouse: (d.completedOps || []).length + '/' + (d.operations || []).length + ' 項', quantity: (d.operations || []).length };
            });
            
            var html = '<!DOCTYPE html><html><head><meta charset="UTF-8">';
            html += '<title>工單看板 - 電視投放</title>';
            html += '<script src="https://cdn.tailwindcss.com"><\/script>';
            html += '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">';
            html += '<style>body{background:#0f172a;margin:0;padding:20px;font-family:system-ui,-apple-system,sans-serif;}</style>';
            html += '</head><body>';
            
            // 標題列
            html += '<div class="flex justify-between items-center mb-6">';
            html += '<h1 class="text-4xl font-bold text-white"><i class="fa-solid fa-clipboard-list mr-4 text-yellow-400"></i>工單看板</h1>';
            html += '<div class="flex items-center gap-4">';
            html += '<span id="tv-time" class="text-2xl text-slate-400"></span>';
            html += '<span class="text-xl text-slate-500">自動刷新: 30秒</span>';
            html += '</div></div>';
            
            // 統計卡片
            html += '<div class="grid grid-cols-4 gap-6 mb-6">';
            html += '<div class="bg-gradient-to-br from-green-600 to-green-700 rounded-2xl p-6 text-center">';
            html += '<div class="text-6xl font-bold text-white">' + pendingPickingOrders.length + '</div>';
            html += '<div class="text-green-200 text-2xl mt-2">待上架</div></div>';
            html += '<div class="bg-gradient-to-br from-orange-600 to-orange-700 rounded-2xl p-6 text-center">';
            html += '<div class="text-6xl font-bold text-white">' + activeWaves.length + '</div>';
            html += '<div class="text-orange-200 text-2xl mt-2">揀貨中</div></div>';
            html += '<div class="bg-gradient-to-br from-purple-600 to-purple-700 rounded-2xl p-6 text-center">';
            html += '<div class="text-6xl font-bold text-white">' + pendingTransfers.length + '</div>';
            html += '<div class="text-purple-200 text-2xl mt-2">調度工單</div></div>';
            html += '<div class="bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-2xl p-6 text-center">';
            html += '<div class="text-6xl font-bold text-white">' + (pendingPickingOrders.length + activeWaves.length + pendingTransfers.length) + '</div>';
            html += '<div class="text-emerald-200 text-2xl mt-2">總工單</div></div>';
            html += '</div>';
            
            // 工單列表
            html += '<div class="grid grid-cols-3 gap-6" style="height:calc(100vh - 280px)">';
            
            // 領料工單
            html += '<div class="bg-slate-900 rounded-2xl border-4 border-green-500 flex flex-col overflow-hidden">';
            html += '<div class="bg-green-600 px-6 py-4"><span class="text-2xl font-bold text-white"><i class="fa-solid fa-truck-ramp-box mr-3"></i>待上架入庫</span></div>';
            html += '<div class="flex-1 overflow-y-auto p-4 space-y-3">';
            if (pendingPickingOrders.length === 0) {
                html += '<div class="text-center text-slate-500 py-12"><i class="fa-solid fa-check-circle text-6xl mb-4 block text-emerald-500"></i><span class="text-2xl">沒有待上架的貨</span></div>';
            } else {
                pendingPickingOrders.slice(0, 8).forEach(function(order) {
                    html += '<div class="bg-slate-800 rounded-xl p-4 border-l-4 border-green-500">';
                    html += '<div class="flex justify-between items-start">';
                    html += '<div class="text-xl font-bold text-white truncate flex-1">' + (order.productName || '-') + '</div>';
                    html += '<div class="text-3xl font-bold text-green-400">' + (order.quantity || 0) + ' 件</div>';
                    html += '</div>';
                    html += '<div class="flex justify-between items-center mt-3">';
                    html += '<span class="text-lg text-slate-400">' + (order.applicant || order.requester || '-') + '</span>';
                    html += '<span class="text-xl text-cyan-400 font-bold bg-cyan-900/50 px-3 py-1 rounded">' + (order.purpose || '生產領用') + '</span>';
                    html += '</div></div>';
                });
            }
            html += '</div></div>';
            
            // 揀貨工單
            html += '<div class="bg-slate-900 rounded-2xl border-4 border-orange-500 flex flex-col overflow-hidden">';
            html += '<div class="bg-orange-600 px-6 py-4"><span class="text-2xl font-bold text-white"><i class="fa-solid fa-dolly mr-3"></i>揀貨中</span></div>';
            html += '<div class="flex-1 overflow-y-auto p-4 space-y-3">';
            if (activeWaves.length === 0) {
                html += '<div class="text-center text-slate-500 py-12"><i class="fa-solid fa-check-circle text-6xl mb-4 block text-emerald-500"></i><span class="text-2xl">無進行中揀貨</span></div>';
            } else {
                activeWaves.slice(0, 8).forEach(function(wave) {
                    // 進度＝已揀項目／品項數（completedItems 是手機、電腦掃過的揀貨項目）
                var doneN = (wave.completedItems || []).length, allN = wave.itemCount || (wave.summary || []).length || 0;
                var progress = allN ? Math.min(100, Math.round(doneN / allN * 100)) : 0;
                    html += '<div class="bg-slate-800 rounded-xl p-4 border-l-4 border-orange-500">';
                    html += '<div class="flex justify-between items-center">';
                    html += '<div class="text-xl font-bold text-white">' + (wave.waveNo || wave.id) + '</div>';
                    html += '<div class="text-lg px-3 py-1 rounded ' + (wave.status === 'picking' ? 'bg-orange-600' : 'bg-slate-600') + ' text-white">' + (wave.status === 'picking' ? '揀貨中' : '待處理') + '</div>';
                    html += '</div>';
                    html += '<div class="mt-3">';
                    html += '<div class="flex justify-between text-lg mb-2">';
                    html += '<span class="text-slate-400">進度</span>';
                    html += '<span class="text-orange-400 font-bold">' + doneN + '/' + allN + ' 項</span>';
                    html += '</div>';
                    html += '<div class="w-full bg-slate-700 rounded-full h-4">';
                    html += '<div class="bg-orange-500 h-4 rounded-full" style="width:' + progress + '%"></div>';
                    html += '</div></div></div>';
                });
            }
            html += '</div></div>';
            
            // 調撥工單
            html += '<div class="bg-slate-900 rounded-2xl border-4 border-purple-500 flex flex-col overflow-hidden">';
            html += '<div class="bg-purple-600 px-6 py-4"><span class="text-2xl font-bold text-white"><i class="fa-solid fa-right-left mr-3"></i>調撥/移位</span></div>';
            html += '<div class="flex-1 overflow-y-auto p-4 space-y-3">';
            if (pendingTransfers.length === 0) {
                html += '<div class="text-center text-slate-500 py-12"><i class="fa-solid fa-check-circle text-6xl mb-4 block text-emerald-500"></i><span class="text-2xl">無待處理調撥</span></div>';
            } else {
                pendingTransfers.slice(0, 8).forEach(function(item) {
                    html += '<div class="bg-slate-800 rounded-xl p-4 border-l-4 border-purple-500">';
                    html += '<div class="text-xl font-bold text-white truncate">' + (item.productName || '-') + '</div>';
                    html += '<div class="flex justify-between items-center mt-3">';
                    html += '<div class="text-lg">';
                    html += '<span class="text-cyan-400">' + (item.fromWarehouse || item.from || '-') + '</span>';
                    html += '<i class="fa-solid fa-arrow-right mx-3 text-slate-500"></i>';
                    html += '<span class="text-emerald-400">' + (item.toWarehouse || item.to || '-') + '</span>';
                    html += '</div>';
                    html += '<div class="text-2xl font-bold text-purple-400">' + (item.quantity || 0) + ' 件</div>';
                    html += '</div></div>';
                });
            }
            html += '</div></div>';
            
            html += '</div>';
            
            // 自動刷新腳本
            html += '<script>';
            html += 'function updateTime(){document.getElementById("tv-time").textContent=new Date().toLocaleTimeString("zh-TW");}';
            html += 'updateTime();setInterval(updateTime,1000);';
            html += 'setTimeout(function(){location.reload();},30000);';
            html += '<\/script>';
            
            html += '</body></html>';
            
            var tvWindow = window.open('', 'tvboard', 'width=1920,height=1080');
            tvWindow.document.write(html);
            tvWindow.document.close();
        };
        
        // ========== 品項選擇 Modal 功能 ==========
        
        // 開啟品項選擇視窗
        window.openProductSelectModal = function(mode) {
            document.getElementById('product-select-mode').value = mode;
            document.getElementById('product-select-search').value = '';
            document.getElementById('product-select-category').value = '';
            document.getElementById('modal-product-select').classList.remove('hidden');
            
            // 載入品項列表
            renderProductSelectList();
            
            // 聚焦搜尋框
            setTimeout(function() {
                document.getElementById('product-select-search').focus();
            }, 100);
        };
        
        // 關閉品項選擇視窗
        window.closeProductSelectModal = function() {
            document.getElementById('modal-product-select').classList.add('hidden');
        };
        
        // 渲染品項列表
        window.renderProductSelectList = function() {
            var keyword = (document.getElementById('product-select-search').value || '').trim().toLowerCase();
            var category = document.getElementById('product-select-category').value;
            var data = window.productMasterData || [];
            
            // 過濾
            var filtered = data.filter(function(p) {
                var matchKeyword = !keyword || 
                    (p.code || '').toLowerCase().includes(keyword) ||
                    (p.name || '').toLowerCase().includes(keyword) ||
                    (p.spec || '').toLowerCase().includes(keyword);
                var matchCategory = !category || p.category === category;
                return matchKeyword && matchCategory;
            });
            
            // 更新統計
            document.getElementById('product-select-count').textContent = filtered.length;
            
            // 渲染列表
            var html = '';
            filtered.forEach(function(p) {
                var categoryColor = {
                    '成品': 'bg-blue-600',
                    '原料': 'bg-emerald-600',
                    '半成品': 'bg-yellow-600',
                    '包材': 'bg-purple-600'
                }[p.category] || 'bg-slate-600';
                
                html += '<tr class="hover:bg-slate-700 cursor-pointer" onclick="selectProductFromModal(\'' +
                        (p.code || '').replace(/'/g, "\\'") + '\', \'' +
                        (p.name || '').replace(/'/g, "\\'") + '\', \'' +
                        (p.spec || '').replace(/'/g, "\\'") + '\', ' +
                        (p.palletCapacity || 40) + ', ' +
                        (p.shelfLife || 24) + ')">';
                html += '<td class="p-2 text-cyan-400 font-mono text-xs">' + (p.code || '-') + '</td>';
                html += '<td class="p-2 text-white font-bold">' + (p.name || '') + '</td>';
                html += '<td class="p-2 text-slate-300 text-xs">' + (p.spec || '-') + '</td>';
                html += '<td class="p-2 text-center text-yellow-400 font-bold">' + (p.palletCapacity || 40) + '</td>';
                html += '<td class="p-2 text-center"><span class="px-1.5 py-0.5 rounded text-white text-xs ' + categoryColor + '">' + (p.category || '成品') + '</span></td>';
                html += '<td class="p-2 text-center"><button class="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold"><i class="fa-solid fa-check"></i></button></td>';
                html += '</tr>';
            });
            
            if (filtered.length === 0) {
                html = '<tr><td colspan="6" class="p-8 text-center text-slate-400"><i class="fa-solid fa-box-open text-3xl mb-2 block"></i>無匹配品項<br><span class="text-xs">請先在品項主檔中新增品項</span></td></tr>';
            }
            
            document.getElementById('product-select-list').innerHTML = html;
        };
        
        // 過濾品項列表（搜尋時觸發）
        window.filterProductSelectList = function() {
            renderProductSelectList();
        };
        
        // 從 Modal 選擇品項
        window.selectProductFromModal = function(code, name, spec, palletCapacity, shelfLife) {
            var mode = document.getElementById('product-select-mode').value;
            
            if (mode === 'inbound') {
                // 智能入庫
                document.getElementById('in-product-code').value = code;
                document.getElementById('in-name').value = name;
                document.getElementById('in-spec').value = spec;
                updateLivePreview();
                updateInboundProgress();
                autoTriggerSmartSuggest();
            } else if (mode === 'container') {
                // 貨櫃入庫
                document.getElementById('pre-product-code').value = code;
                document.getElementById('pre-name').value = name;
                document.getElementById('pre-spec').value = spec;
                if (document.getElementById('pre-per-pallet')) {
                    document.getElementById('pre-per-pallet').value = palletCapacity;
                }
                if (document.getElementById('pre-per-pallet-var')) {
                    document.getElementById('pre-per-pallet-var').value = palletCapacity;
                }
            }
            
            // 關閉視窗
            closeProductSelectModal();
        };

        // ========== 智能入庫建議系統（5級優先順序） ==========
        // 優先順序：①同規格同層 → ②同規格 → ③同品名同層 → ④同品名 → ⑤空位
        var smartSuggestTimer = null;
        window.autoTriggerSmartSuggest = function() {
            var name = document.getElementById('in-name').value.trim();
            var list = document.getElementById('smart-suggest-list');

            if (smartSuggestTimer) {
                clearTimeout(smartSuggestTimer);
            }

            if (!name) {
                if (list) list.innerHTML = '<div class="text-slate-500 text-xs text-center py-2">請先選擇品項</div>';
                return;
            }

            // 立即顯示載入狀態
            if (list) list.innerHTML = '<div class="text-slate-500 text-xs text-center py-2"><i class="fa-solid fa-spinner fa-spin mr-1"></i>分析中...</div>';

            // 短延遲後計算（確保庫存資料已載入）
            smartSuggestTimer = setTimeout(function() {
                calculateSmartSuggest(true);
            }, 200);
        };

        window.calculateSmartSuggest = function(silent) {
            var targetName = document.getElementById('in-name').value;
            var targetSpec = document.getElementById('in-spec').value || '';
            var targetBatch = document.getElementById('in-batch').value || '';
            var targetExp = document.getElementById('in-exp').value || '';
            
            var panel = document.getElementById('smart-suggest-panel');
            var list = document.getElementById('smart-suggest-list');
            var loading = document.getElementById('suggest-loading');
            
            if (!panel || !list) return;

            if (!targetName) {
                list.innerHTML = '<div class="text-slate-500 text-xs text-center py-2">請先選擇品項</div>';
                return;
            }
            
            // ========== 簡化版：判斷板型後查表 ==========
            var productType = typeof getProductType === 'function' ? getProductType() : 'fixed';
            var qty = 0, perPallet = 40;
            
            // 從品項主檔讀取板容量（不管是定重還是不定重都要讀）
            var master = (window.productMasterData || []).find(function(p) { return p.name === targetName; });
            if (master && master.palletCapacity) perPallet = master.palletCapacity;
            
            if (productType === 'fixed') {
                qty = parseInt(document.getElementById('in-qty').value) || 0;
            } else {
                qty = parseInt(document.getElementById('in-qty-var').value) || 0;
            }
            
            // 判斷板型
            var palletType = qty > 0 ? window.getPalletType(qty, perPallet) : 'full';
            
            // 各層限制（直接查表）
            var LEVEL_PRIORITY = window.RACK_CONFIG.LEVEL_PRIORITY;
            
            // 查表取得各層容量
            function calcLevelCapacity(level) {
                return window.getLevelCapacity(level, palletType);
            }
            
            // 顯示載入中
            if (loading) loading.classList.remove('hidden');

            // 非同步執行以避免阻塞 UI
            setTimeout(function() {
                try {
                var inventory = [];
                if (typeof window.currentInventory === 'function') {
                    inventory = window.currentInventory();
                } else if (Array.isArray(window.currentInventory)) {
                    inventory = window.currentInventory;
                }

                var lanes = {};
                var allZones = ['I-A', 'I-B', 'J-C', 'J-D', 'K-E', 'K-F', 'K-G', 'K-H'];
                var productSpecKey = targetName + '|' + targetSpec;

                allZones.forEach(function(zone) {
                    var laneCount = window.RACK_CONFIG.ZONE_LANES[zone] || 8;
                    for (var i = 1; i <= laneCount; i++) {
                        var laneKey = zone + '-' + (i < 10 ? '0' + i : i);
                        lanes[laneKey] = {
                            zone: zone,
                            row: i,
                            laneKey: laneKey,
                            totalQty: 0,
                            palletCount: 0,
                            items: [],
                            hasSameName: false,
                            hasSameSpec: false,
                            sameNameCount: 0,
                            sameSpecCount: 0,
                            nearestExpiry: null,
                            // 每層資訊
                            levelData: {
                                '3F': { count: 0, hasSameName: false, hasSameSpec: false, sameNameCount: 0, sameSpecCount: 0 },
                                '2F': { count: 0, hasSameName: false, hasSameSpec: false, sameNameCount: 0, sameSpecCount: 0 },
                                '1F': { count: 0, hasSameName: false, hasSameSpec: false, sameNameCount: 0, sameSpecCount: 0 }
                            }
                        };
                    }
                });

                // 分析現有庫存
                inventory.forEach(function(item) {
                    if (!item.locationId || item.locationId.startsWith('V-') || item.locationId.startsWith('O-') || item.locationId.startsWith('TEMP')) return;

                    var parsed = parseLocationId(item.locationId);
                    if (!parsed) return;

                    var laneKey = parsed.laneKey;
                    var level = parsed.level;
                    if (!lanes[laneKey]) return;

                    lanes[laneKey].totalQty += (item.quantity || 0);
                    lanes[laneKey].palletCount++;
                    lanes[laneKey].items.push(item);
                    
                    // 更新層級計數
                    if (lanes[laneKey].levelData[level]) {
                        lanes[laneKey].levelData[level].count++;
                        window.addPalletToCounts(lanes[laneKey].levelData[level], item);
                    }

                    var itemSpecKey = (item.productName || '') + '|' + (item.spec || '');
                    
                    if (item.productName === targetName) {
                        lanes[laneKey].hasSameName = true;
                        lanes[laneKey].sameNameCount++;
                        
                        // 更新層級同品名資訊
                        if (lanes[laneKey].levelData[level]) {
                            lanes[laneKey].levelData[level].hasSameName = true;
                            lanes[laneKey].levelData[level].sameNameCount++;
                        }
                        
                        if (itemSpecKey === productSpecKey) {
                            lanes[laneKey].hasSameSpec = true;
                            lanes[laneKey].sameSpecCount++;
                            
                            // 更新層級同規格資訊
                            if (lanes[laneKey].levelData[level]) {
                                lanes[laneKey].levelData[level].hasSameSpec = true;
                                lanes[laneKey].levelData[level].sameSpecCount++;
                            }
                        }
                        
                        // 追蹤效期
                        var itemExp = item.expDate || item.expiryDate || '';
                        if (itemExp) {
                            if (!lanes[laneKey].nearestExpiry || itemExp < lanes[laneKey].nearestExpiry) {
                                lanes[laneKey].nearestExpiry = itemExp;
                            }
                        }
                    }
                });

                var suggestions = [];

                Object.keys(lanes).forEach(function(laneKey) {
                    var lane = lanes[laneKey];
                    
                    // 遍歷每個層級（按入庫優先順序）
                    LEVEL_PRIORITY.forEach(function(level) {
                        var levelCap = calcLevelCapacity(level);
                        // 依混合板型使用率計算剩餘可放板數（不是只數同板型）
                        var levelAvail = window.levelRemaining(lane.levelData[level], level, palletType);
                        var levelUsed = lane.levelData[level].count;
                        
                        if (levelCap === 0 || levelAvail <= 0) return; // 此層不可放或已滿
                        
                        var fullLocationId = laneKey + '-' + level;
                        var levelData = lane.levelData[level];
                        
                        var score = 0;
                        var reasons = [];
                        var priority = 'low';
                        var icon = '📍';
                        var priorityLevel = 5; // 預設最低優先級

                        // ========== 5級優先順序評分 ==========
                        
                        // ① 同品名 + 同規格 + 同層（最高優先）
                        if (levelData.hasSameSpec) {
                            score = 10000 + levelData.sameSpecCount * 100;
                            priority = 'high';
                            priorityLevel = 1;
                            icon = '🎯';
                            reasons.push('①同規格同層(' + levelData.sameSpecCount + '板)');
                        }
                        // ② 同品名 + 同規格（不同層）
                        else if (lane.hasSameSpec) {
                            score = 8000 + lane.sameSpecCount * 80;
                            priority = 'high';
                            priorityLevel = 2;
                            icon = '🎯';
                            reasons.push('②同規格');
                        }
                        // ③ 同品名 + 同層
                        else if (levelData.hasSameName) {
                            score = 6000 + levelData.sameNameCount * 60;
                            priority = 'medium';
                            priorityLevel = 3;
                            icon = '📦';
                            reasons.push('③同品名同層(' + levelData.sameNameCount + '板)');
                        }
                        // ④ 同品名（任意層）
                        else if (lane.hasSameName) {
                            score = 4000 + lane.sameNameCount * 40;
                            priority = 'medium';
                            priorityLevel = 4;
                            icon = '📦';
                            reasons.push('④同品名(' + lane.sameNameCount + '板)');
                        }
                        // ⑤ 空位或其他可用儲位
                        else if (lane.palletCount === 0) {
                            score = 2000;
                            priority = 'low';
                            priorityLevel = 5;
                            icon = '📍';
                            reasons.push('⑤空巷道');
                            
                            // 靠近入口的區域優先
                            if (lane.zone === 'I-A' || lane.zone === 'I-B') {
                                score += 100;
                                reasons.push('靠近入口');
                            }
                        } else {
                            score = 1000;
                            priority = 'low';
                            priorityLevel = 5;
                            icon = '📍';
                            reasons.push('⑤可用');
                        }
                        
                        // 層級優先加分（2F > 3F > 1F 的入庫順序）
                        if (level === '2F') score += 30;
                        else if (level === '3F') score += 20;
                        else if (level === '1F') score += 10;
                        
                        // 即將滿載加分
                        if (levelAvail === 1) {
                            score += 50;
                            reasons.push('即將滿');
                        }

                        suggestions.push({
                            laneKey: laneKey,
                            fullLocationId: fullLocationId,
                            level: level,
                            zone: lane.zone,
                            row: lane.row,
                            score: score,
                            priority: priority,
                            priorityLevel: priorityLevel,
                            icon: icon,
                            reasons: reasons,
                            levelAvailable: levelAvail,
                            levelCapacity: levelCap,
                            palletCount: lane.palletCount,
                            sameNameCount: lane.sameNameCount,
                            sameSpecCount: lane.sameSpecCount,
                            totalQty: lane.totalQty
                        });
                    });
                });

                // 排序：優先級 > 分數
                suggestions.sort(function(a, b) {
                    if (a.priorityLevel !== b.priorityLevel) {
                        return a.priorityLevel - b.priorityLevel;
                    }
                    return b.score - a.score;
                });

                // 取前三名（確保不同儲位）
                var uniqueSuggestions = [];
                var seenLocations = {};
                for (var i = 0; i < suggestions.length && uniqueSuggestions.length < 3; i++) {
                    if (!seenLocations[suggestions[i].fullLocationId]) {
                        uniqueSuggestions.push(suggestions[i]);
                        seenLocations[suggestions[i].fullLocationId] = true;
                    }
                }

                // 渲染建議
                renderSmartSuggestionsEnhanced(uniqueSuggestions, targetName, targetSpec, palletType);
                
                } catch (e) {
                    console.error('智能建議計算錯誤:', e);
                    var list = document.getElementById('smart-suggest-list');
                    if (list) {
                        list.innerHTML = '<div class="text-red-400 text-xs text-center py-2">計算錯誤，請重試</div>';
                    }
                }
                
                // 隱藏載入中
                if (loading) loading.classList.add('hidden');
            }, 50);
        };

        function renderSmartSuggestionsEnhanced(suggestions, targetName, targetSpec) {
            var list = document.getElementById('smart-suggest-list');
            if (!list) return;

            if (suggestions.length === 0) {
                list.innerHTML = '<div class="flex gap-2">' +
                    '<div class="flex-1 bg-slate-800 border border-slate-600 rounded-lg p-2 text-center">' +
                    '<div class="text-slate-400 text-xs">暫無建議</div>' +
                    '<div class="text-slate-500 text-[10px]">請從地圖選擇</div>' +
                    '</div></div>';
                return;
            }

            var html = '<div class="flex gap-2">';
            
            suggestions.forEach(function(s, idx) {
                var bgClass, borderClass, textClass;
                
                // 只有第一名使用金色漸層，其他統一使用深色背景
                if (idx === 0) {
                    bgClass = 'bg-gradient-to-br from-yellow-900/60 to-amber-900/40';
                    borderClass = 'border-yellow-500';
                    textClass = 'text-yellow-400';
                } else {
                    bgClass = 'bg-slate-800/80';
                    borderClass = 'border-slate-600';
                    textClass = 'text-slate-300';
                }
                
                var rankLabel = idx === 0 ? '🥇' : (idx === 1 ? '🥈' : '🥉');
                var reasonText = s.reasons.slice(0, 2).join('、');

                html += '<div data-location="' + s.fullLocationId + '" class="smart-suggest-card ' + bgClass + ' border ' + borderClass + ' rounded-lg p-2 cursor-pointer hover:border-emerald-400 transition-all flex-1 min-w-0" onclick="selectSmartSuggestDirect(\'' + s.fullLocationId + '\')">';
                html += '<div class="flex items-center gap-1 mb-0.5">';
                html += '<span class="text-sm">' + rankLabel + '</span>';
                html += '<span class="' + textClass + ' font-bold font-mono text-sm">' + s.fullLocationId + '</span>';
                html += '</div>';
                html += '<div class="text-[10px] text-emerald-400 truncate">' + s.icon + ' ' + reasonText + '</div>';
                if (s.sameNameCount > 0) {
                    html += '<div class="text-[10px] text-cyan-400">現有 ' + s.sameNameCount + ' 板同品項</div>';
                }
                html += '<div class="text-[10px] text-slate-500">' + s.level + '層空' + s.levelAvailable + '位</div>';
                html += '</div>';
            });
            
            html += '</div>';
            
            list.innerHTML = html;
        }

        window.selectSmartSuggestDirect = function(fullLocationId) {
            var locInput = document.getElementById('in-loc');
            if (locInput) {
                locInput.value = fullLocationId;
                // 觸發更新
                if (typeof validateLocationInput === 'function') validateLocationInput();
                if (typeof updateInboundProgress === 'function') updateInboundProgress();
                if (typeof updateLivePreview === 'function') updateLivePreview();
            }
            
            // 視覺反饋：標記已選擇的建議（綠色邊框）
            document.querySelectorAll('.smart-suggest-card').forEach(function(card) {
                card.classList.remove('ring-2', 'ring-emerald-400', 'border-emerald-400');
                if (card.getAttribute('data-location') === fullLocationId) {
                    card.classList.add('ring-2', 'ring-emerald-400');
                }
            });
        };

        window.selectSmartSuggest = function(laneKey) {
            var parts = laneKey.split('-');
            var zone = parts[0] + '-' + parts[1];
            var row = parseInt(parts[2]);

            if (typeof openLevelSelector === 'function') {
                openLevelSelector(zone, row);
            }
        };

        window.hideSmartSuggest = function() {
            // 保持面板顯示，不再隱藏
        };

        // ========== 揀貨系統 ==========
        window.pickingSelectedProduct = { fg: null, rm: null };
        window.pickingPlan = { fg: [], rm: [] };
        window.rmCheckedItems = [];

        window.searchProductForPicking = function(mode) {
            var searchInput = document.getElementById(mode + '-pick-name').value.toLowerCase();
            var suggestionsDiv = document.getElementById(mode + '-product-suggestions');

            if (searchInput.length < 1) {
                suggestionsDiv.innerHTML = '';
                return;
            }

            var selectedCompany = mode === 'rm' ? (window.rmCompany || '崇文') : (window.waveCompany || '崇文');

            var products = {};
            window.currentPallets().forEach(function(p) {
                if (p.company && p.company !== selectedCompany) return;

                var key = p.productName + '|' + (p.spec || '');
                if (p.productName.toLowerCase().indexOf(searchInput) > -1) {
                    if (!products[key]) {
                        products[key] = { name: p.productName, spec: p.spec || '', totalQty: 0, palletCount: 0 };
                    }
                    products[key].totalQty += p.quantity;
                    products[key].palletCount++;
                }
            });

            var html = '';
            Object.values(products).forEach(function(prod) {
                html += '<div class="p-2 bg-slate-800 hover:bg-slate-700 cursor-pointer rounded mb-1 text-sm" onclick="selectProductForPicking(\'' + mode + '\', \'' + prod.name + '\', \'' + prod.spec + '\')">';
                html += '<div class="text-white font-bold">' + prod.name + '</div>';
                html += '<div class="text-slate-400 text-xs">' + prod.spec + ' | 庫存: ' + prod.totalQty + '件 / ' + prod.palletCount + '板</div>';
                html += '</div>';
            });

            suggestionsDiv.innerHTML = html || '<div class="text-slate-500 text-sm p-2">無符合項目</div>';
        };

        window.selectProductForPicking = function(mode, name, spec) {
            document.getElementById(mode + '-pick-name').value = name;
            document.getElementById(mode + '-pick-spec').value = spec;
            document.getElementById(mode + '-product-suggestions').innerHTML = '';
            window.pickingSelectedProduct[mode] = { name: name, spec: spec };
        };

        window.calculatePickingPlan = function(mode) {
            var product = window.pickingSelectedProduct[mode];
            var requiredQty = parseInt(document.getElementById(mode + '-pick-qty').value) || 0;

            if (!product || !product.name) {
                alert('請先選擇品名');
                return;
            }
            if (requiredQty <= 0) {
                alert('請輸入需求數量');
                return;
            }

            var selectedCompany = mode === 'rm' ? (window.rmCompany || '崇文') : (window.waveCompany || '崇文');

            // 建立寄庫對照表（用 locationId 查詢）
            var consignmentByLocation = {};
            if (window.consignmentData && Array.isArray(window.consignmentData)) {
                window.consignmentData.forEach(function(c) {
                    if (c.status !== 'active' || !c.locationId) return;
                    if (!consignmentByLocation[c.locationId]) {
                        consignmentByLocation[c.locationId] = { qty: 0, customers: [] };
                    }
                    consignmentByLocation[c.locationId].qty += (c.remainingQty || 0);
                    if (c.customer && consignmentByLocation[c.locationId].customers.indexOf(c.customer) === -1) {
                        consignmentByLocation[c.locationId].customers.push(c.customer);
                    }
                });
            }

            var candidates = [];
            window.currentPallets().forEach(function(p) {
                if (p.company && p.company !== selectedCompany) return;

                if (p.productName === product.name && (p.spec || '') === product.spec && p.quantity > 0) {
                    var parsed = parseLocationId(p.locationId);
                    var lane = parsed ? parsed.laneKey : '';
                    var sameProductInLane = window.currentPallets().filter(function(pp) {
                        var ppParsed = parseLocationId(pp.locationId);
                        return pp.productName === product.name &&
                               (pp.spec || '') === product.spec &&
                               ppParsed && ppParsed.laneKey === lane;
                    }).length;

                    var floor = parsed ? parseInt(parsed.level) || 1 : 1;
                    
                    // 查詢寄庫資訊
                    var consignInfo = consignmentByLocation[p.locationId] || { qty: 0, customers: [] };
                    var consignedQty = consignInfo.qty;
                    var consignCustomers = consignInfo.customers;
                    var availableQty = Math.max(0, p.quantity - consignedQty);

                    candidates.push({
                        docId: p.id,
                        palletId: p.palletId,
                        locationId: p.locationId,
                        quantity: p.quantity,
                        consignedQty: consignedQty,
                        consignCustomers: consignCustomers,
                        availableQty: availableQty,
                        totalWeight: p.totalWeight || 0,
                        expDate: p.expDate || p.expiryDate || '9999-12-31',
                        inboundDate: p.inboundDate ? (p.inboundDate.toDate ? p.inboundDate.toDate() : new Date(p.inboundDate)) : new Date(),
                        isIsolated: sameProductInLane === 1,
                        floor: floor,
                        lane: lane,
                        batchNo: p.batchNo || ''
                    });
                }
            });

            if (candidates.length === 0) {
                alert('庫存不足或無此品項');
                return;
            }

            // 計算總可領數量（扣除寄庫）
            var totalStock = candidates.reduce(function(sum, c) { return sum + c.quantity; }, 0);
            var totalAvailable = candidates.reduce(function(sum, c) { return sum + c.availableQty; }, 0);
            var totalConsigned = candidates.reduce(function(sum, c) { return sum + c.consignedQty; }, 0);
            
            if (totalAvailable < requiredQty) {
                var msg = '可領數量不足！\n\n需求: ' + requiredQty + ' 件\n庫存: ' + totalStock + ' 件\n寄庫: ' + totalConsigned + ' 件\n可領: ' + totalAvailable + ' 件';
                alert(msg);
                return;
            }

            // 排序：優先取用無寄庫的、效期近的、孤立板
            candidates.sort(function(a, b) {
                // 無寄庫優先
                if ((a.consignedQty === 0) !== (b.consignedQty === 0)) {
                    return a.consignedQty === 0 ? -1 : 1;
                }
                if (a.expDate !== b.expDate) return a.expDate < b.expDate ? -1 : 1;
                if (a.isIsolated !== b.isIsolated) return a.isIsolated ? -1 : 1;
                if (a.floor !== b.floor) return a.floor - b.floor;
                var aDiff = Math.abs(a.availableQty - requiredQty);
                var bDiff = Math.abs(b.availableQty - requiredQty);
                return aDiff - bDiff;
            });

            var plan = [];
            var remaining = requiredQty;

            // 先找剛好滿足需求的可領數量
            for (var i = 0; i < candidates.length && remaining > 0; i++) {
                var c = candidates[i];
                if (c.availableQty <= 0) continue; // 跳過完全被寄庫的
                if (c.availableQty === remaining) {
                    plan.push({
                        docId: c.docId,
                        palletId: c.palletId,
                        locationId: c.locationId,
                        quantity: c.quantity,
                        consignedQty: c.consignedQty,
                        consignCustomers: c.consignCustomers,
                        availableQty: c.availableQty,
                        totalWeight: c.totalWeight,
                        pickQty: c.availableQty,
                        pickWeight: c.totalWeight > 0 ? Math.round(c.totalWeight * (c.availableQty / c.quantity) * 10) / 10 : 0,
                        expDate: c.expDate,
                        batchNo: c.batchNo,
                        isIsolated: c.isIsolated,
                        pickType: c.availableQty === c.quantity ? 'full' : 'split',
                        remaining: c.quantity - c.availableQty,
                        remainingWeight: 0
                    });
                    remaining = 0;
                    candidates.splice(i, 1);
                    break;
                }
            }

            for (var i = 0; i < candidates.length && remaining > 0; i++) {
                var c = candidates[i];
                if (c.availableQty <= 0) continue; // 跳過完全被寄庫的
                var pickQty = Math.min(c.availableQty, remaining);
                var pickType = pickQty === c.quantity ? 'full' : 'split';
                var weightRatio = c.quantity > 0 ? (pickQty / c.quantity) : 0;
                var pickWeight = c.totalWeight > 0 ? Math.round(c.totalWeight * weightRatio * 10) / 10 : 0;

                plan.push({
                    docId: c.docId,
                        palletId: c.palletId,
                    locationId: c.locationId,
                    quantity: c.quantity,
                    consignedQty: c.consignedQty,
                    consignCustomers: c.consignCustomers,
                    availableQty: c.availableQty,
                    totalWeight: c.totalWeight,
                    pickQty: pickQty,
                    pickWeight: pickWeight,
                    expDate: c.expDate,
                    batchNo: c.batchNo,
                    isIsolated: c.isIsolated,
                    pickType: pickType,
                    remaining: c.quantity - pickQty,
                    remainingWeight: c.totalWeight > 0 ? Math.round((c.totalWeight - pickWeight) * 10) / 10 : 0
                });

                remaining -= pickQty;
            }

            window.pickingPlan[mode] = plan;

            renderPickingResult(mode, plan, requiredQty);
        };

        function renderPickingResult(mode, plan, requiredQty) {
            var resultDiv = document.getElementById(mode + '-picking-result');
            var summaryDiv = document.getElementById(mode + '-picking-summary');

            var html = '<table class="w-full text-sm">';
            html += '<thead><tr class="text-slate-400 text-xs border-b border-slate-700">';
            if (mode === 'rm') html += '<th class="p-2 text-left">勾選</th>';
            html += '<th class="p-2 text-left">順序</th>';
            html += '<th class="p-2 text-left">儲位</th>';
            html += '<th class="p-2 text-right">庫存</th>';
            html += '<th class="p-2 text-right text-amber-400">寄庫</th>';
            html += '<th class="p-2 text-right text-green-400">可領</th>';
            html += '<th class="p-2 text-right">取用</th>';
            html += '<th class="p-2 text-center">方式</th>';
            html += '<th class="p-2 text-left">效期</th>';
            html += '<th class="p-2 text-left">狀態</th>';
            html += '</tr></thead><tbody>';

            var fullCount = 0, splitCount = 0, clearCount = 0, totalPick = 0, totalWeight = 0;

            plan.forEach(function(item, idx) {
                var typeLabel = item.pickType === 'full' ?
                    '<span class="badge badge-green">整板</span>' :
                    '<span class="badge badge-yellow">拆板</span>';
                var isolatedLabel = item.isIsolated ? '<span class="badge badge-red ml-1">孤立</span>' : '';

                if (item.pickType === 'full') fullCount++;
                else splitCount++;
                if (item.remaining === 0) clearCount++;
                totalPick += item.pickQty;
                totalWeight += item.pickWeight || 0;

                var stockDisplay = item.quantity + '';
                if (item.totalWeight > 0) {
                    stockDisplay += '<span class="text-amber-400 text-xs ml-1">/' + item.totalWeight + 'kg</span>';
                }

                // 寄庫顯示
                var consignDisplay = '-';
                var hasConsign = item.consignedQty && item.consignedQty > 0;
                if (hasConsign) {
                    consignDisplay = '<span class="text-amber-400 font-bold">' + item.consignedQty + '</span>';
                    if (item.consignCustomers && item.consignCustomers.length > 0) {
                        consignDisplay += '<br><span class="text-amber-300 text-xs">' + item.consignCustomers.join(',') + '</span>';
                    }
                }
                
                // 可領數量
                var availableDisplay = '<span class="text-green-400 font-bold">' + (item.availableQty || item.quantity) + '</span>';

                var pickDisplay = item.pickQty + '';
                if (item.pickWeight > 0) {
                    pickDisplay += '<span class="text-amber-400 text-xs ml-1">/' + item.pickWeight + 'kg</span>';
                }

                // 有寄庫的行加上警示背景
                var rowClass = hasConsign ? 'border-b border-slate-800 hover:bg-slate-800 bg-amber-900/20' : 'border-b border-slate-800 hover:bg-slate-800';

                html += '<tr class="' + rowClass + '">';
                if (mode === 'rm') {
                    html += '<td class="p-2"><input type="checkbox" class="rm-pick-checkbox w-5 h-5" data-idx="' + idx + '" data-qty="' + item.pickQty + '" data-weight="' + (item.pickWeight || 0) + '" onchange="updateRmSelection()" checked></td>';
                }
                html += '<td class="p-2 text-white font-bold">' + (idx + 1) + '</td>';
                html += '<td class="p-2 text-blue-400 font-mono font-bold">' + item.locationId + '</td>';
                html += '<td class="p-2 text-right text-slate-400">' + stockDisplay + '</td>';
                html += '<td class="p-2 text-right">' + consignDisplay + '</td>';
                html += '<td class="p-2 text-right">' + availableDisplay + '</td>';
                html += '<td class="p-2 text-right text-yellow-400 font-bold text-lg">' + pickDisplay + '</td>';
                html += '<td class="p-2 text-center">' + typeLabel + '</td>';
                html += '<td class="p-2 text-slate-300">' + (item.expDate || '-') + '</td>';
                html += '<td class="p-2">' + isolatedLabel;
                if (hasConsign) {
                    html += '<span class="badge bg-amber-600/50 text-amber-200 ml-1">⚠️寄庫</span>';
                }
                if (item.remaining > 0) {
                    var remainDisplay = '餘' + item.remaining;
                    if (item.remainingWeight > 0) {
                        remainDisplay += '/' + item.remainingWeight + 'kg';
                    }
                    html += '<span class="text-xs text-slate-500 ml-1">' + remainDisplay + '</span>';
                }
                html += '</td>';
                html += '</tr>';
            });

            html += '</tbody></table>';
            resultDiv.innerHTML = html;

            summaryDiv.classList.remove('hidden');
            var totalDisplay = totalPick + ' 件';
            if (totalWeight > 0) {
                totalDisplay += ' / ' + Math.round(totalWeight * 10) / 10 + ' kg';
            }
            document.getElementById(mode + '-total-pick') && (document.getElementById(mode + '-total-pick').innerText = totalDisplay);
            document.getElementById(mode + '-full-pallet') && (document.getElementById(mode + '-full-pallet').innerText = fullCount + ' 板');
            document.getElementById(mode + '-split-pallet') && (document.getElementById(mode + '-split-pallet').innerText = splitCount + ' 板');
            document.getElementById(mode + '-clear-slots') && (document.getElementById(mode + '-clear-slots').innerText = clearCount + ' 個');

            if (mode === 'rm') {
                document.getElementById('rm-selected-qty').innerText = totalDisplay;
                document.getElementById('rm-required-qty').innerText = requiredQty + ' 件';
            }
        }

        window.updateRmSelection = function() {
            var checkboxes = document.querySelectorAll('.rm-pick-checkbox');
            var total = 0;
            var totalWeight = 0;
            checkboxes.forEach(function(cb) {
                if (cb.checked) {
                    total += parseInt(cb.dataset.qty) || 0;
                    totalWeight += parseFloat(cb.dataset.weight) || 0;
                }
            });
            var display = total + ' 件';
            if (totalWeight > 0) {
                display += ' / ' + Math.round(totalWeight * 10) / 10 + ' kg';
            }
            document.getElementById('rm-selected-qty').innerText = display;
        };

        window.confirmRmPicking = function() {
            var checkboxes = document.querySelectorAll('.rm-pick-checkbox:checked');
            if (checkboxes.length === 0) {
                alert('請至少勾選一個儲位');
                return;
            }

            var plan = window.pickingPlan.rm;
            var product = window.pickingSelectedProduct.rm;

            var html = '';
            var totalQty = 0;

            checkboxes.forEach(function(cb, index) {
                var idx = parseInt(cb.dataset.idx);
                var item = plan[idx];
                totalQty += item.pickQty;

                html += '<div class="bg-slate-800 rounded-lg p-3 border border-slate-700' + (item.consignedQty > 0 ? ' border-amber-500/50' : '') + '" data-idx="' + idx + '">';
                html += '<div class="flex justify-between items-start mb-3">';
                html += '<div>';
                html += '<div class="text-white font-bold">' + (product ? product.name : item.productName) + '</div>';
                html += '<div class="text-slate-400 text-sm">' + (product ? product.spec : (item.spec || '-')) + '</div>';
                // 寄庫預警
                if (item.consignedQty > 0) {
                    html += '<div class="mt-1 px-2 py-1 bg-amber-900/50 rounded text-xs">';
                    html += '<span class="text-amber-400">⚠️ 寄庫 ' + item.consignedQty + ' 件';
                    if (item.consignCustomers && item.consignCustomers.length > 0) {
                        html += '（' + item.consignCustomers.join(', ') + '）';
                    }
                    html += '</span>';
                    html += '</div>';
                }
                html += '</div>';
                html += '<div class="text-right">';
                html += '<div class="text-slate-400 text-xs">儲位</div>';
                html += '<div class="text-cyan-400 font-mono font-bold">' + item.locationId + '</div>';
                html += '</div>';
                html += '</div>';

                html += '<div class="grid grid-cols-' + (item.consignedQty > 0 ? '5' : '4') + ' gap-2 mb-3">';
                html += '<div class="bg-slate-900 rounded p-2 text-center">';
                html += '<div class="text-slate-500 text-xs">棧板庫存</div>';
                html += '<div class="text-white font-bold">' + item.quantity + ' 件</div>';
                if (item.totalWeight > 0) {
                    html += '<div class="text-amber-400 text-xs">' + item.totalWeight + ' kg</div>';
                }
                html += '</div>';
                // 寄庫數量欄位
                if (item.consignedQty > 0) {
                    html += '<div class="bg-amber-900/30 rounded p-2 text-center border border-amber-500/30">';
                    html += '<div class="text-amber-400 text-xs">寄庫</div>';
                    html += '<div class="text-amber-400 font-bold">' + item.consignedQty + ' 件</div>';
                    html += '<div class="text-green-400 text-xs">可領 ' + item.availableQty + '</div>';
                    html += '</div>';
                }
                html += '<div class="bg-slate-900 rounded p-2 text-center">';
                html += '<div class="text-slate-500 text-xs">批號</div>';
                html += '<div class="text-white text-sm">' + (item.batchNo || '-') + '</div>';
                html += '</div>';
                html += '<div class="bg-slate-900 rounded p-2 text-center">';
                html += '<div class="text-slate-500 text-xs">效期</div>';
                html += '<div class="text-white text-sm">' + (item.expDate || '-') + '</div>';
                html += '</div>';
                html += '<div class="bg-slate-900 rounded p-2 text-center">';
                html += '<div class="text-slate-500 text-xs">每件均重</div>';
                var avgWeight = (item.totalWeight > 0 && item.quantity > 0) ? Math.round(item.totalWeight / item.quantity * 10) / 10 : 0;
                html += '<div class="text-slate-400 text-sm">' + (avgWeight > 0 ? avgWeight + ' kg' : '-') + '</div>';
                html += '</div>';
                html += '</div>';

                html += '<div class="bg-cyan-900/30 border border-cyan-600/50 rounded-lg p-3">';
                html += '<div class="text-cyan-400 text-sm font-bold mb-2"><i class="fa-solid fa-hand-pointer mr-1"></i>實際領用';
                if (item.totalWeight > 0) {
                    html += ' <span class="text-amber-400 font-normal text-xs">（不定重原料可填重量）</span>';
                }
                html += '</div>';

                html += '<div class="flex flex-wrap items-center gap-3">';

                // 如果有寄庫，整板選項需要特殊處理
                var canFullPick = item.consignedQty === 0 || item.availableQty === item.quantity;
                var maxQty = item.availableQty || item.quantity;
                
                html += '<label class="flex items-center gap-2 cursor-pointer' + (!canFullPick ? ' opacity-50' : '') + '">';
                html += '<input type="radio" name="pick-type-' + idx + '" value="full" class="rm-pick-type" data-idx="' + idx + '" data-qty="' + maxQty + '" data-weight="' + item.totalWeight + '" ' + (item.pickType === 'full' && canFullPick ? 'checked' : '') + ' ' + (!canFullPick ? 'disabled' : '') + ' onchange="updateRmConfirmQty(' + idx + ', \'full\')">';
                html += '<span class="text-white">整板' + (!canFullPick ? ' <span class="text-amber-400 text-xs">(有寄庫)</span>' : '') + '</span>';
                html += '</label>';

                html += '<label class="flex items-center gap-2 cursor-pointer">';
                html += '<input type="radio" name="pick-type-' + idx + '" value="partial" class="rm-pick-type" data-idx="' + idx + '" ' + (item.pickType !== 'full' || !canFullPick ? 'checked' : '') + ' onchange="updateRmConfirmQty(' + idx + ', \'partial\')">';
                html += '<span class="text-white">部分領用</span>';
                html += '</label>';

                html += '<span class="text-slate-600">|</span>';

                html += '<div class="flex items-center gap-1">';
                html += '<input type="number" id="rm-partial-qty-' + idx + '" class="scan-input w-20 text-center font-bold' + (item.consignedQty > 0 ? ' border-amber-500/50' : '') + '" value="' + item.pickQty + '" min="1" max="' + maxQty + '" data-max="' + maxQty + '" ' + (item.pickType === 'full' && canFullPick ? 'disabled' : '') + ' onchange="updateRmConfirmFromQty(' + idx + ')">';
                html += '<span class="text-slate-400 text-sm">件</span>';
                if (item.consignedQty > 0) {
                    html += '<span class="text-amber-400 text-xs ml-1">(最多' + maxQty + ')</span>';
                }
                html += '</div>';

                if (item.totalWeight > 0) {
                    html += '<span class="text-slate-500">或</span>';
                    html += '<div class="flex items-center gap-1">';
                    html += '<input type="number" id="rm-partial-weight-' + idx + '" class="scan-input w-24 text-center font-bold border-amber-600/50" value="' + (item.pickWeight || 0) + '" min="0.1" max="' + item.totalWeight + '" step="0.1" ' + (item.pickType === 'full' ? 'disabled' : '') + ' onchange="updateRmConfirmFromWeight(' + idx + ')">';
                    html += '<span class="text-amber-400 text-sm">kg</span>';
                    html += '</div>';
                }

                html += '</div>';

                html += '<div class="mt-2 text-sm" id="rm-remaining-hint-' + idx + '">';
                if (item.pickType === 'full') {
                    html += '<span class="text-green-400"><i class="fa-solid fa-check-circle mr-1"></i>整板出庫，儲位清空</span>';
                } else {
                    var remainHint = '剩餘 ' + item.remaining + ' 件';
                    if (item.totalWeight > 0 && item.remainingWeight > 0) {
                        remainHint += ' / ' + item.remainingWeight + ' kg';
                    }
                    html += '<span class="text-yellow-400"><i class="fa-solid fa-info-circle mr-1"></i>' + remainHint + ' 保留在原儲位</span>';
                }
                html += '</div>';

                html += '</div>';
                html += '</div>';
            });

            document.getElementById('rm-confirm-list').innerHTML = html;
            document.getElementById('rm-confirm-total').innerText = totalQty + ' 件';

            var dept = document.getElementById('rm-pick-dept').value || '';
            document.getElementById('rm-confirm-purpose').value = dept;

            document.getElementById('modal-rm-confirm').classList.remove('hidden');
        };

        window.closeRmConfirmModal = function() {
            document.getElementById('modal-rm-confirm').classList.add('hidden');
        };

        window.updateRmConfirmFromQty = function(idx) {
            var plan = window.pickingPlan.rm;
            var item = plan[idx];
            var qtyInput = document.getElementById('rm-partial-qty-' + idx);
            var weightInput = document.getElementById('rm-partial-weight-' + idx);
            var qty = parseInt(qtyInput.value) || 0;
            
            // 限制不能超過可領數量
            var maxQty = item.availableQty || item.quantity;
            if (qty > maxQty) {
                qty = maxQty;
                qtyInput.value = maxQty;
                showNotification('⚠️ 此儲位有寄庫，最多可領 ' + maxQty + ' 件', 'warning');
            }

            if (weightInput && item.totalWeight > 0 && item.quantity > 0) {
                var avgWeight = item.totalWeight / item.quantity;
                weightInput.value = Math.round(qty * avgWeight * 10) / 10;
            }

            updateRmConfirmHint(idx);
            updateRmConfirmTotal();
        };

        window.updateRmConfirmFromWeight = function(idx) {
            var plan = window.pickingPlan.rm;
            var item = plan[idx];
            var qtyInput = document.getElementById('rm-partial-qty-' + idx);
            var weightInput = document.getElementById('rm-partial-weight-' + idx);
            var weight = parseFloat(weightInput.value) || 0;
            
            // 限制不能超過可領數量
            var maxQty = item.availableQty || item.quantity;

            if (item.totalWeight > 0 && item.quantity > 0) {
                var avgWeight = item.totalWeight / item.quantity;
                var estimatedQty = Math.round(weight / avgWeight);
                var finalQty = Math.min(estimatedQty, maxQty);
                qtyInput.value = finalQty;
                
                if (estimatedQty > maxQty) {
                    // 調整重量以符合最大可領數量
                    weightInput.value = Math.round(finalQty * avgWeight * 10) / 10;
                    showNotification('⚠️ 此儲位有寄庫，最多可領 ' + maxQty + ' 件', 'warning');
                }
            }

            updateRmConfirmHint(idx);
            updateRmConfirmTotal();
        };

        window.updateRmConfirmHint = function(idx) {
            var plan = window.pickingPlan.rm;
            var item = plan[idx];
            var hintDiv = document.getElementById('rm-remaining-hint-' + idx);
            var qtyInput = document.getElementById('rm-partial-qty-' + idx);
            var weightInput = document.getElementById('rm-partial-weight-' + idx);

            var pickQty = parseInt(qtyInput.value) || 0;
            var remainQty = item.quantity - pickQty;
            var consignedQty = item.consignedQty || 0;

            var hint = '剩餘 ' + remainQty + ' 件';
            if (item.totalWeight > 0 && weightInput) {
                var pickWeight = parseFloat(weightInput.value) || 0;
                var remainWeight = Math.round((item.totalWeight - pickWeight) * 10) / 10;
                hint += ' / ' + remainWeight + ' kg';
            }
            
            // 加入寄庫說明
            if (consignedQty > 0) {
                hint += '（含寄庫 ' + consignedQty + ' 件）';
            }

            if (remainQty <= 0) {
                hintDiv.innerHTML = '<span class="text-green-400"><i class="fa-solid fa-check-circle mr-1"></i>全部領用，儲位清空</span>';
            } else if (remainQty === consignedQty) {
                hintDiv.innerHTML = '<span class="text-amber-400"><i class="fa-solid fa-exclamation-triangle mr-1"></i>剩餘 ' + remainQty + ' 件皆為寄庫</span>';
            } else {
                hintDiv.innerHTML = '<span class="text-yellow-400"><i class="fa-solid fa-info-circle mr-1"></i>' + hint + ' 保留在原儲位</span>';
            }
        };

        window.updateRmConfirmQty = function(idx, type) {
            var qtyInput = document.getElementById('rm-partial-qty-' + idx);
            var weightInput = document.getElementById('rm-partial-weight-' + idx);
            var hintDiv = document.getElementById('rm-remaining-hint-' + idx);
            var plan = window.pickingPlan.rm;
            var item = plan[idx];
            var maxQty = item.availableQty || item.quantity;

            if (type === 'full') {
                qtyInput.disabled = true;
                qtyInput.value = maxQty; // 使用可領數量而非庫存
                if (weightInput) {
                    weightInput.disabled = true;
                    var ratio = maxQty / item.quantity;
                    weightInput.value = Math.round(item.totalWeight * ratio * 10) / 10;
                }
                if (maxQty === item.quantity) {
                    hintDiv.innerHTML = '<span class="text-green-400"><i class="fa-solid fa-check-circle mr-1"></i>整板出庫，儲位清空</span>';
                } else {
                    hintDiv.innerHTML = '<span class="text-amber-400"><i class="fa-solid fa-exclamation-triangle mr-1"></i>領取可領數量 ' + maxQty + ' 件，剩餘 ' + (item.quantity - maxQty) + ' 件為寄庫</span>';
                }
            } else {
                qtyInput.disabled = false;
                if (weightInput) {
                    weightInput.disabled = false;
                }
                qtyInput.focus();
                updateRmConfirmHint(idx);
            }

            updateRmConfirmTotal();
        };

        window.updateRmConfirmTotal = function() {
            var total = 0;
            var totalWeight = 0;
            var plan = window.pickingPlan.rm;

            document.querySelectorAll('.rm-pick-type:checked').forEach(function(radio) {
                var idx = parseInt(radio.dataset.idx);
                if (radio.value === 'full') {
                    total += plan[idx].quantity;
                } else {
                    var qtyInput = document.getElementById('rm-partial-qty-' + idx);
                    total += parseInt(qtyInput.value) || 0;
                }

                var qtyInput = document.getElementById('rm-partial-qty-' + idx);
                var hintDiv = document.getElementById('rm-remaining-hint-' + idx);
                var item = plan[idx];

                if (radio.value === 'full') {
                    hintDiv.innerHTML = '<span class="text-green-400"><i class="fa-solid fa-check-circle mr-1"></i>整板出庫，儲位清空</span>';
                } else {
                    var remaining = item.quantity - (parseInt(qtyInput.value) || 0);
                    if (remaining < 0) remaining = 0;
                    var remainHint = '剩餘 ' + remaining + ' 件';
                    var weightInput = document.getElementById('rm-partial-weight-' + idx);
                    if (weightInput && item.totalWeight > 0) {
                        var remainWeight = Math.round((item.totalWeight - (parseFloat(weightInput.value) || 0)) * 10) / 10;
                        remainHint += ' / ' + remainWeight + ' kg';
                    }
                    hintDiv.innerHTML = '<span class="text-yellow-400"><i class="fa-solid fa-info-circle mr-1"></i>' + remainHint + ' 保留在原儲位</span>';
                }

                var weightInput = document.getElementById('rm-partial-weight-' + idx);
                if (weightInput) {
                    if (radio.value === 'full') {
                        totalWeight += plan[idx].totalWeight || 0;
                    } else {
                        totalWeight += parseFloat(weightInput.value) || 0;
                    }
                }
            });

            var totalDisplay = total + ' 件';
            if (totalWeight > 0) {
                totalDisplay += ' / ' + Math.round(totalWeight * 10) / 10 + ' kg';
            }
            document.getElementById('rm-confirm-total').innerText = totalDisplay;
        };

        // 舊版領料函數（保留用於舊 UI）
        window.executeRmPickingLegacy = async function() {
            var user = document.getElementById('rm-confirm-user').value.trim();
            var purpose = document.getElementById('rm-confirm-purpose').value.trim();

            if (!user) {
                alert('請輸入領用人');
                document.getElementById('rm-confirm-user').focus();
                return;
            }

            var plan = window.pickingPlan.rm;
            var product = window.pickingSelectedProduct.rm;
            var pickItems = [];

            document.querySelectorAll('.rm-pick-type:checked').forEach(function(radio) {
                var idx = parseInt(radio.dataset.idx);
                var item = plan[idx];
                var actualQty, actualWeight = 0;

                if (radio.value === 'full') {
                    actualQty = item.quantity;
                    actualWeight = item.totalWeight || 0;
                } else {
                    actualQty = parseInt(document.getElementById('rm-partial-qty-' + idx).value) || 0;
                    var weightInput = document.getElementById('rm-partial-weight-' + idx);
                    if (weightInput) {
                        actualWeight = parseFloat(weightInput.value) || 0;
                    }
                }

                if (actualQty > 0 && actualQty <= item.quantity) {
                    pickItems.push({
                        docId: item.docId,
                        palletId: item.palletId,
                        locationId: item.locationId,
                        originalQty: item.quantity,
                        originalWeight: item.totalWeight || 0,
                        pickQty: actualQty,
                        pickWeight: actualWeight,
                        remaining: item.quantity - actualQty,
                        remainingWeight: (item.totalWeight || 0) - actualWeight,
                        batchNo: item.batchNo,
                        expDate: item.expDate,
                        pickType: actualQty === item.quantity ? 'full' : 'partial'
                    });
                }
            });

            if (pickItems.length === 0) {
                alert('沒有有效的領用項目');
                return;
            }

            var totalPick = pickItems.reduce(function(sum, p) { return sum + p.pickQty; }, 0);
            var totalWeight = pickItems.reduce(function(sum, p) { return sum + (p.pickWeight || 0); }, 0);

            var confirmMsg = '確認領用 ' + totalPick + ' 件';
            if (totalWeight > 0) {
                confirmMsg += ' / ' + Math.round(totalWeight * 10) / 10 + ' kg';
            }
            confirmMsg += '？\n\n領用人：' + user + '\n用途：' + (purpose || '-');

            if (!confirm(confirmMsg)) return;

            try {
                // 以文件 ID 找棧板（舊版用板號當文件 ID，多數棧板會找不到）；全部在同一個交易中扣帳
                var changes = [];
                for (var k = 0; k < pickItems.length; k++) {
                    var it = pickItems[k];
                    it.ref = await window.resolvePalletRef(it.docId, it.palletId, it.locationId);
                    var extra = {};
                    if (it.originalWeight > 0 && it.pickType !== 'full') {
                        extra.totalWeight = Math.round(it.remainingWeight * 10) / 10;
                    }
                    changes.push({ ref: it.ref, delta: -it.pickQty, deleteWhenEmpty: true, extra: extra, label: it.palletId });
                }

                await window.runStockTransaction({
                    changes: changes,
                    logs: function() {
                        return pickItems.map(function(item) {
                            var noteText = '原料領用 - 領用人：' + user;
                            if (purpose) noteText += '，用途：' + purpose;
                            if (item.pickWeight > 0) noteText += ' (' + item.pickWeight + 'kg)';
                            return {
                                type: 'picking',
                                productName: product ? product.name : '',
                                spec: product ? product.spec : '',
                                quantity: item.pickQty,
                                weight: item.pickWeight || 0,
                                quantityChange: -item.pickQty,
                                weightChange: -(item.pickWeight || 0),
                                locationId: item.locationId,
                                batchNo: item.batchNo || '',
                                palletId: item.palletId,
                                expDate: item.expDate,
                                note: noteText
                            };
                        });
                    }
                });

                closeRmConfirmModal();

                var resultMsg = '✅ 領料出庫完成！\n\n領用人：' + user + '\n總計：' + totalPick + ' 件';
                if (totalWeight > 0) {
                    resultMsg += ' / ' + Math.round(totalWeight * 10) / 10 + ' kg';
                }
                alert(resultMsg);

                window.pickingPlan.rm = [];
                var resultHtml = '<div class="text-center text-slate-500 py-20"><i class="fa-solid fa-check-circle text-4xl mb-4 text-green-500"></i><div class="text-lg mb-2">領料完成</div><div class="text-sm">領用人：' + user + ' ｜ 總計：' + totalPick + ' 件';
                if (totalWeight > 0) {
                    resultHtml += ' / ' + Math.round(totalWeight * 10) / 10 + ' kg';
                }
                resultHtml += '</div></div>';
                document.getElementById('rm-picking-result').innerHTML = resultHtml;
                document.getElementById('rm-picking-summary').classList.add('hidden');

                document.getElementById('rm-pick-name').value = '';
                document.getElementById('rm-pick-spec').value = '';
                document.getElementById('rm-pick-qty').value = '';
                document.getElementById('rm-pick-dept').value = '';

            } catch (err) {
                console.error('領料出庫失敗:', err);
                alert('❌ 領料出庫失敗：' + err.message);
            }
        };

        window.printPickingSlip = function(mode) {
            var plan = window.pickingPlan[mode];
            if (!plan || plan.length === 0) {
                alert('請先計算揀貨方案');
                return;
            }

            var product = window.pickingSelectedProduct[mode];
            var requiredQty = document.getElementById(mode + '-pick-qty').value;
            var customer = document.getElementById(mode + '-pick-customer') ? document.getElementById(mode + '-pick-customer').value : '';
            var dept = document.getElementById(mode + '-pick-dept') ? document.getElementById(mode + '-pick-dept').value : '';

            var now = new Date();
            var slipNo = window.generateDocNo ? window.generateDocNo(mode === 'fg' ? 'PK' : 'RM') : (mode === 'fg' ? 'PK' : 'RM') + '-' + now.getFullYear() + ('0'+(now.getMonth()+1)).slice(-2) + ('0'+now.getDate()).slice(-2) + '-001';

            var title = mode === 'fg' ? '成品揀貨單' : '原料領用建議單';
            var color = mode === 'fg' ? '#7c3aed' : '#0891b2';

            var html = '<div style="border:3px solid #000;padding:20px;font-family:Microsoft JhengHei,Arial;">';
            html += '<div style="background:' + color + ';color:white;padding:15px;margin:-20px -20px 20px -20px;text-align:center;">';
            html += '<div style="font-size:28px;font-weight:bold;">' + title + '</div>';
            html += '<div style="font-size:14px;margin-top:5px;">單號: ' + slipNo + '</div>';
            html += '</div>';

            html += '<div style="display:flex;justify-content:space-between;margin-bottom:15px;padding:10px;background:#f5f5f5;">';
            html += '<div><b>品名:</b> ' + product.name + '</div>';
            html += '<div><b>規格:</b> ' + product.spec + '</div>';
            html += '<div><b>需求:</b> <span style="font-size:24px;color:red;font-weight:bold;">' + requiredQty + '</span> 件</div>';
            html += '</div>';

            if (customer || dept) {
                html += '<div style="margin-bottom:15px;"><b>' + (mode === 'fg' ? '客戶' : '領用單位') + ':</b> ' + (customer || dept) + '</div>';
            }

            html += '<table style="width:100%;border-collapse:collapse;margin-bottom:20px;">';
            html += '<thead><tr style="background:#333;color:white;">';
            if (mode === 'rm') html += '<th style="padding:10px;border:1px solid #000;">確認</th>';
            html += '<th style="padding:10px;border:1px solid #000;">順序</th>';
            html += '<th style="padding:10px;border:1px solid #000;">儲位</th>';
            html += '<th style="padding:10px;border:1px solid #000;">取用數量</th>';
            html += '<th style="padding:10px;border:1px solid #000;">方式</th>';
            html += '<th style="padding:10px;border:1px solid #000;">效期</th>';
            html += '<th style="padding:10px;border:1px solid #000;">批號</th>';
            html += '<th style="padding:10px;border:1px solid #000;">餘料</th>';
            html += '</tr></thead><tbody>';

            plan.forEach(function(item, idx) {
                html += '<tr>';
                if (mode === 'rm') html += '<td style="padding:10px;border:1px solid #ccc;text-align:center;font-size:24px;">☐</td>';
                html += '<td style="padding:10px;border:1px solid #ccc;text-align:center;font-weight:bold;">' + (idx + 1) + '</td>';
                html += '<td style="padding:10px;border:1px solid #ccc;text-align:center;font-size:20px;font-weight:bold;">' + item.locationId + '</td>';
                html += '<td style="padding:10px;border:1px solid #ccc;text-align:center;font-size:28px;font-weight:bold;color:red;">' + item.pickQty + '</td>';
                html += '<td style="padding:10px;border:1px solid #ccc;text-align:center;">' + (item.pickType === 'full' ? '整板' : '拆板') + '</td>';
                html += '<td style="padding:10px;border:1px solid #ccc;text-align:center;">' + (item.expDate || '-') + '</td>';
                html += '<td style="padding:10px;border:1px solid #ccc;text-align:center;">' + (item.batchNo || '-') + '</td>';
                html += '<td style="padding:10px;border:1px solid #ccc;text-align:center;">' + (item.remaining > 0 ? item.remaining + '件' : '-') + '</td>';
                html += '</tr>';
            });

            html += '</tbody></table>';

            if (mode === 'rm') {
                html += '<div style="background:#fff3cd;border:2px solid #ffc107;padding:15px;margin-bottom:20px;">';
                html += '<div style="font-weight:bold;color:#856404;">⚠️ 倉管現場確認事項：</div>';
                html += '<div style="margin-top:10px;color:#856404;">';
                html += '• 棧板狀態是否完好<br>';
                html += '• 堆疊是否平整可取<br>';
                html += '• 確認後請打勾 ☑️<br>';
                html += '• 如有調整請註記';
                html += '</div></div>';
            }

            html += '<div style="display:flex;justify-content:space-around;padding-top:20px;border-top:2px solid #000;">';
            html += '<div style="text-align:center;"><div style="border-bottom:1px solid #000;width:120px;height:50px;"></div><div style="font-size:12px;color:#666;margin-top:5px;">製單人員</div></div>';
            html += '<div style="text-align:center;"><div style="border-bottom:1px solid #000;width:120px;height:50px;"></div><div style="font-size:12px;color:#666;margin-top:5px;">倉管確認</div></div>';
            html += '<div style="text-align:center;"><div style="border-bottom:1px solid #000;width:120px;height:50px;"></div><div style="font-size:12px;color:#666;margin-top:5px;">堆高機手</div></div>';
            html += '</div>';

            html += '</div>';

            openPrintPreview(html, title + ' - ' + slipNo, 900, 800);
        };

