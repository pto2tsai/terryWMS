// ============================================================
// js/13-expiry-product-master.js — 效期管理、品項主檔、Excel 匯入、初始化
// 由原 app.js 第 18369–19658 行拆出；各檔依 index.html 的順序載入，共用全域（window）
// ============================================================
        // ========== 效期管理系統 ==========

        window.expirySettings = {
            soonDays: parseInt(localStorage.getItem('wms_expiry_soon_days') || '90')
        };

        window.saveExpirySettings = function() {
            var days = parseInt(document.getElementById('expiry-days-setting').value) || 90;
            window.expirySettings.soonDays = days;
            localStorage.setItem('wms_expiry_soon_days', days.toString());
        };

        window.loadExpirySettings = function() {
            var select = document.getElementById('expiry-days-setting');
            if (select) {
                select.value = window.expirySettings.soonDays.toString();
            }
        };

        window._expiryReportData = [];
        window._expiryCurrentFilter = 'all';

        function calculateDaysRemaining(expiryDate) {
            if (!expiryDate) return null;
            var today = new Date();
            today.setHours(0, 0, 0, 0);
            var expDate;
            // 處理 Firestore timestamp
            if (expiryDate.toDate) {
                expDate = expiryDate.toDate();
            } else if (typeof expiryDate === 'string') {
                expDate = new Date(expiryDate);
            } else if (expiryDate instanceof Date) {
                expDate = expiryDate;
            } else {
                return null;
            }
            if (isNaN(expDate.getTime())) return null;
            expDate.setHours(0, 0, 0, 0);
            var diff = expDate - today;
            return Math.ceil(diff / (1000 * 60 * 60 * 24));
        }

        function getExpiryStatus(daysRemaining) {
            if (daysRemaining === null) return { status: 'unknown', label: '未知', color: 'slate', icon: 'question' };
            if (daysRemaining < 0) return { status: 'expired', label: '已過期', color: 'red', icon: 'skull-crossbones' };
            if (daysRemaining <= 7) return { status: '7days', label: '7天內', color: 'orange', icon: 'triangle-exclamation' };
            if (daysRemaining <= 30) return { status: '30days', label: '30天內', color: 'yellow', icon: 'clock' };
            if (daysRemaining <= window.expirySettings.soonDays) return { status: 'soon', label: '即期品', color: 'cyan', icon: 'hourglass-half' };
            return { status: 'normal', label: '正常', color: 'emerald', icon: 'check-circle' };
        }

        window.refreshExpiryReport = function() {
            loadExpirySettings();

            var pallets = window.currentPallets ? window.currentPallets() : [];
            var reportData = [];

            var stats = {
                expired: { count: 0, qty: 0 },
                '7days': { count: 0, qty: 0 },
                '30days': { count: 0, qty: 0 },
                soon: { count: 0, qty: 0 },
                normal: { count: 0, qty: 0 }
            };

            pallets.forEach(function(p) {
                var expDate = p.expiryDate || p.expDate;
                var daysRemaining = calculateDaysRemaining(expDate);
                var status = getExpiryStatus(daysRemaining);
                var qty = parseInt(p.quantity) || 0;

                reportData.push({
                    palletId: p.palletId,
                    productName: p.productName,
                    spec: p.spec || '',
                    locationId: p.locationId,
                    quantity: qty,
                    expiryDate: expDate || '',
                    daysRemaining: daysRemaining,
                    status: status,
                    batchNo: p.batchNo || ''
                });

                if (status.status === 'expired') {
                    stats.expired.count++;
                    stats.expired.qty += qty;
                } else if (status.status === '7days') {
                    stats['7days'].count++;
                    stats['7days'].qty += qty;
                } else if (status.status === '30days') {
                    stats['30days'].count++;
                    stats['30days'].qty += qty;
                } else if (status.status === 'soon') {
                    stats.soon.count++;
                    stats.soon.qty += qty;
                } else if (status.status === 'normal') {
                    stats.normal.count++;
                    stats.normal.qty += qty;
                }
            });

            // 排序：先按剩餘天數（急的在前），再按品名/規格分組
            reportData.sort(function(a, b) {
                // 1. 剩餘天數（null 在最後）
                if (a.daysRemaining === null && b.daysRemaining === null) {
                    // 都無效期，按品名排序
                } else if (a.daysRemaining === null) {
                    return 1;
                } else if (b.daysRemaining === null) {
                    return -1;
                } else if (a.daysRemaining !== b.daysRemaining) {
                    return a.daysRemaining - b.daysRemaining;
                }
                
                // 2. 品名排序
                var nameCompare = (a.productName || '').localeCompare(b.productName || '', 'zh-TW');
                if (nameCompare !== 0) return nameCompare;
                
                // 3. 規格排序
                var specCompare = (a.spec || '').localeCompare(b.spec || '', 'zh-TW');
                if (specCompare !== 0) return specCompare;
                
                // 4. 批號排序
                return (a.batchNo || '').localeCompare(b.batchNo || '', 'zh-TW');
            });

            window._expiryReportData = reportData;

            document.getElementById('expiry-stat-expired').innerText = stats.expired.count;
            document.getElementById('expiry-stat-expired-qty').innerText = stats.expired.qty.toLocaleString() + ' 件';
            document.getElementById('expiry-stat-7days').innerText = stats['7days'].count;
            document.getElementById('expiry-stat-7days-qty').innerText = stats['7days'].qty.toLocaleString() + ' 件';
            document.getElementById('expiry-stat-30days').innerText = stats['30days'].count;
            document.getElementById('expiry-stat-30days-qty').innerText = stats['30days'].qty.toLocaleString() + ' 件';
            document.getElementById('expiry-stat-soon').innerText = stats.soon.count;
            document.getElementById('expiry-stat-soon-qty').innerText = stats.soon.qty.toLocaleString() + ' 件';
            document.getElementById('expiry-stat-normal').innerText = stats.normal.count;
            document.getElementById('expiry-stat-normal-qty').innerText = stats.normal.qty.toLocaleString() + ' 件';

            renderExpiryTable();
        };

        window.filterExpiryReport = function(filter) {
            window._expiryCurrentFilter = filter;

            document.querySelectorAll('.expiry-filter-btn').forEach(function(btn) {
                if (btn.dataset.filter === filter) {
                    btn.className = 'expiry-filter-btn active bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-bold';
                } else {
                    btn.className = 'expiry-filter-btn bg-slate-800 text-slate-400 px-4 py-2 rounded-lg text-sm font-bold';
                }
            });

            renderExpiryTable();
        };

        window.filterExpiryBySearch = function() {
            renderExpiryTable();
        };

        function renderExpiryTable() {
            var tbody = document.getElementById('expiry-table-body');
            if (!tbody) return;

            var data = window._expiryReportData;
            var filter = window._expiryCurrentFilter;
            var search = (document.getElementById('expiry-search').value || '').toLowerCase();

            var filtered = data.filter(function(item) {
                if (filter !== 'all' && item.status.status !== filter) return false;
                if (search && item.productName.toLowerCase().indexOf(search) === -1) return false;
                return true;
            });

            if (filtered.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" class="text-center text-slate-500 py-8">無符合條件的資料</td></tr>';
                return;
            }

            var html = '';
            filtered.forEach(function(item) {
                var statusColor = item.status.color;
                var daysText = item.daysRemaining === null ? '-' :
                    (item.daysRemaining < 0 ? '已過期 ' + Math.abs(item.daysRemaining) + ' 天' : item.daysRemaining + ' 天');
                
                // 格式化效期日期
                var expDateDisplay = '-';
                if (item.expiryDate) {
                    var expDateObj;
                    if (item.expiryDate.toDate) {
                        expDateObj = item.expiryDate.toDate();
                    } else if (typeof item.expiryDate === 'string') {
                        expDateObj = new Date(item.expiryDate);
                    } else if (item.expiryDate instanceof Date) {
                        expDateObj = item.expiryDate;
                    }
                    if (expDateObj && !isNaN(expDateObj.getTime())) {
                        expDateDisplay = expDateObj.toLocaleDateString('zh-TW');
                    }
                }

                html += '<tr class="hover:bg-slate-800/50">';
                html += '<td class="p-3"><span class="badge badge-' + statusColor + '"><i class="fa-solid fa-' + item.status.icon + ' mr-1"></i>' + item.status.label + '</span></td>';
                html += '<td class="p-3 font-bold text-white">' + item.productName + '</td>';
                html += '<td class="p-3 text-slate-400">' + (item.spec || '-') + '</td>';
                html += '<td class="p-3 text-slate-400">' + (item.batchNo || '-') + '</td>';
                html += '<td class="p-3 font-mono text-cyan-400">' + item.locationId + '</td>';
                html += '<td class="p-3 text-right font-bold">' + item.quantity.toLocaleString() + '</td>';
                html += '<td class="p-3 text-' + statusColor + '-400 font-bold">' + expDateDisplay + '</td>';
                html += '<td class="p-3 text-' + statusColor + '-400 font-bold">' + daysText + '</td>';
                html += '<td class="p-3 text-center">';
                if (item.status.status === 'expired') {
                    html += '<button onclick="initiateScrap(\'' + item.palletId + '\')" class="bg-red-600 hover:bg-red-500 text-white text-xs px-2 py-1 rounded">報廢</button>';
                } else {
                    html += '<button onclick="viewPalletDetail(\'' + item.palletId + '\')" class="bg-slate-700 hover:bg-slate-600 text-white text-xs px-2 py-1 rounded">查看</button>';
                }
                html += '</td>';
                html += '</tr>';
            });

            tbody.innerHTML = html;
        }

        window.initiateScrap = async function(palletId) {
            if (!confirm('確定要將此板號標記為報廢？\n\n板號：' + palletId)) return;

            var reason = prompt('請輸入報廢原因：', '過期報廢');
            if (reason === null) return;

            try {
                var pallets = window.currentPallets ? window.currentPallets() : [];
                var pallet = pallets.find(function(p) { return p.palletId === palletId; });

                if (!pallet) {
                    alert('找不到此板號');
                    return;
                }

                // 用文件 ID 刪除這一板，數量與記錄在同一個交易中處理
                var palletRef = window.doc(window.db, 'pallets', pallet.id);
                await window.db.runTransaction(async function(tx) {
                    var snap = await tx.get(palletRef);
                    if (!snap.exists) throw new Error('此板已不存在（可能已被其他人處理）');
                    var p = snap.data();
                    tx.delete(palletRef);
                    tx.set(window.db.collection('inventoryLogs').doc(), window.buildInventoryLogEntry({
                        type: 'scrap',
                        company: p.company || '',
                        productName: p.productName,
                        spec: p.spec || '',
                        quantity: p.quantity,
                        quantityChange: -(parseFloat(p.quantity) || 0),
                        locationId: p.locationId,
                        palletId: p.palletId || palletId,
                        batchNo: p.batchNo || '',
                        note: '報廢：' + reason
                    }));
                });

                alert('✅ 報廢完成');
                loadInventory();
                refreshExpiryReport();

            } catch (err) {
                console.error('報廢失敗:', err);
                alert('❌ 報廢失敗：' + err.message);
            }
        };

        window.viewPalletDetail = function(palletId) {
            var pallets = window.currentPallets ? window.currentPallets() : [];
            var pallet = pallets.find(function(p) { return p.palletId === palletId; });

            if (!pallet) {
                alert('找不到此板號');
                return;
            }

            var info = '板號：' + pallet.palletId + '\n';
            info += '品名：' + pallet.productName + '\n';
            info += '規格：' + (pallet.spec || '-') + '\n';
            info += '數量：' + pallet.quantity + '\n';
            info += '儲位：' + pallet.locationId + '\n';
            info += '效期：' + (pallet.expiryDate || pallet.expDate || '-') + '\n';
            info += '批號：' + (pallet.batchNo || '-');

            alert(info);
        };

        window.printExpiryReport = function() {
            var data = window._expiryReportData;
            var filter = window._expiryCurrentFilter;
            var search = (document.getElementById('expiry-search').value || '').toLowerCase();

            var filtered = data.filter(function(item) {
                if (filter !== 'all' && item.status.status !== filter) return false;
                if (search && item.productName.toLowerCase().indexOf(search) === -1) return false;
                return true;
            });

            var filterNames = {
                'all': '全部',
                'expired': '已過期',
                '7days': '7天內到期',
                '30days': '30天內到期',
                'soon': '即期品（' + window.expirySettings.soonDays + '天內）',
                'normal': '效期正常'
            };

            var html = '<style>';
            html += 'body { font-family: "Microsoft JhengHei", sans-serif; }';
            html += '.header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px; }';
            html += '.header h1 { font-size: 20px; margin: 0; }';
            html += '.header .meta { font-size: 12px; color: #666; margin-top: 5px; }';
            html += 'table { width: 100%; border-collapse: collapse; font-size: 11px; }';
            html += 'th { background: #333; color: white; padding: 8px; text-align: left; }';
            html += 'td { padding: 6px 8px; border-bottom: 1px solid #ddd; }';
            html += 'tr:nth-child(even) { background: #f5f5f5; }';
            html += '.status-expired { color: #dc2626; font-weight: bold; }';
            html += '.status-7days { color: #ea580c; font-weight: bold; }';
            html += '.status-30days { color: #ca8a04; font-weight: bold; }';
            html += '.status-soon { color: #0891b2; font-weight: bold; }';
            html += '.status-normal { color: #16a34a; }';
            html += '.summary { margin-top: 20px; padding: 10px; background: #f5f5f5; border-radius: 4px; }';
            html += '</style>';

            html += '<div class="header">';
            html += '<h1>效期管理報表</h1>';
            html += '<div class="meta">篩選條件：' + filterNames[filter] + ' | 產生時間：' + new Date().toLocaleString('zh-TW') + '</div>';
            html += '</div>';

            html += '<table>';
            html += '<thead><tr>';
            html += '<th>狀態</th><th>品名</th><th>規格</th><th>儲位</th><th>數量</th><th>效期</th><th>剩餘天數</th><th>批號</th>';
            html += '</tr></thead><tbody>';

            var totalQty = 0;
            filtered.forEach(function(item) {
                var daysText = item.daysRemaining === null ? '-' :
                    (item.daysRemaining < 0 ? '已過期 ' + Math.abs(item.daysRemaining) + ' 天' : item.daysRemaining + ' 天');

                html += '<tr>';
                html += '<td class="status-' + item.status.status + '">' + item.status.label + '</td>';
                html += '<td>' + item.productName + '</td>';
                html += '<td>' + (item.spec || '-') + '</td>';
                html += '<td>' + item.locationId + '</td>';
                html += '<td style="text-align:right">' + item.quantity.toLocaleString() + '</td>';
                html += '<td>' + (item.expiryDate || '-') + '</td>';
                html += '<td class="status-' + item.status.status + '">' + daysText + '</td>';
                html += '<td>' + (item.batchNo || '-') + '</td>';
                html += '</tr>';

                totalQty += item.quantity;
            });

            html += '</tbody></table>';

            html += '<div class="summary">';
            html += '<strong>統計：</strong>共 ' + filtered.length + ' 板 / ' + totalQty.toLocaleString() + ' 件';
            html += '</div>';

            openPrintPreview(html, '效期管理報表', 1000, 800);
        };

        window.checkExpiryAlert = function() {
            var pallets = window.currentPallets ? window.currentPallets() : [];
            var expired = [];
            var urgent = []; // 7天內

            pallets.forEach(function(p) {
                var expDate = p.expiryDate || p.expDate;
                var days = calculateDaysRemaining(expDate);
                if (days !== null) {
                    if (days < 0) {
                        expired.push(p);
                    } else if (days <= 7) {
                        urgent.push(p);
                    }
                }
            });

            if (expired.length > 0 || urgent.length > 0) {
                var msg = '⚠️ 效期警示 ⚠️\n\n';
                if (expired.length > 0) {
                    msg += '❌ 已過期：' + expired.length + ' 板\n';
                }
                if (urgent.length > 0) {
                    msg += '⏰ 7天內到期：' + urgent.length + ' 板\n';
                }
                msg += '\n請至「效期管理」查看詳情。';

                setTimeout(function() {
                    alert(msg);
                }, 2000);
            }
        };

        // ========== 品項主檔管理 ==========

        window.productMasterData = [];

        window.loadProductMasterFromFirebase = async function() {
            try {
                if (!window.db || !window.collection || !window.getDocs) {
                    console.log('Firebase 尚未初始化，使用 localStorage');
                    window.productMasterData = JSON.parse(localStorage.getItem('wms_product_master') || '[]');
                    loadProductMasterList();
                    return;
                }

                var snapshot = await window.getDocs(window.collection(window.db, 'productMaster'));
                window.productMasterData = [];
                snapshot.forEach(function(doc) {
                    window.productMasterData.push({ id: doc.id, ...doc.data() });
                });

                console.log('品項主檔已載入:', window.productMasterData.length, '筆');
                loadProductMasterList();
            } catch(e) {
                console.error('載入品項主檔失敗:', e);
                window.productMasterData = JSON.parse(localStorage.getItem('wms_product_master') || '[]');
                loadProductMasterList();
            }
        };

        window.loadProductMasterList = function() {
            var tbody = document.getElementById('product-master-list');
            if (!tbody) return;

            var data = window.productMasterData.slice(); // 複製陣列
            var search = (document.getElementById('pm-search')?.value || '').toLowerCase();

            if (search) {
                data = data.filter(function(p) {
                    return (p.code || '').toLowerCase().includes(search) ||
                           (p.name || '').toLowerCase().includes(search) ||
                           (p.spec || '').toLowerCase().includes(search);
                });
            }
            
            // 排序：按品名排序，同品名按板容量降羃
            data.sort(function(a, b) {
                var nameCompare = (a.name || '').localeCompare(b.name || '', 'zh-TW');
                if (nameCompare !== 0) return nameCompare;
                return (b.palletCapacity || 0) - (a.palletCapacity || 0);
            });

            if (data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" class="text-center text-slate-500 py-10">無品項資料，請新增或從庫存匯入</td></tr>';
                document.getElementById('pm-total-count').innerText = '0';
                return;
            }

            var html = '';
            data.forEach(function(p, idx) {
                var docId = p.id || idx;
                
                // 計重方式
                var weightType = p.weightType || 'fixed';
                var weightBadge = weightType === 'variable' 
                    ? '<span class="px-1.5 py-0.5 rounded text-[10px] bg-amber-600/30 text-amber-400">不定重</span>'
                    : '<span class="px-1.5 py-0.5 rounded text-[10px] bg-blue-600/30 text-blue-400">定重</span>';
                
                // 箱容
                var unitWeight = p.unitWeight || 0;
                var unitWeightText = unitWeight > 0 ? unitWeight + '<span class="text-slate-500 text-[10px]">kg</span>' : '<span class="text-slate-600">-</span>';
                
                // 保存期（預設 24 個月 = 2 年）
                var shelfLife = p.shelfLife || 24;
                var shelfLifeText = shelfLife + '<span class="text-slate-500 text-[10px]">月</span>';
                
                // 入庫類型
                var inboundType = p.inboundType || 'Raw';
                var inboundTypeMap = { 'Raw': '採購', 'FG': '成品', 'WIP': '半成品', 'RM': '原料', 'Return': '原料' };
                var inboundTypeColors = { 'Raw': 'emerald', 'FG': 'blue', 'WIP': 'yellow', 'RM': 'orange', 'Return': 'orange' };
                var itColor = inboundTypeColors[inboundType] || 'slate';
                var inboundBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] bg-' + itColor + '-600/30 text-' + itColor + '-400">' + (inboundTypeMap[inboundType] || inboundType) + '</span>';

                html += '<tr class="border-b border-slate-700 hover:bg-slate-800">';
                html += '<td class="p-2 text-left text-cyan-400 font-mono text-xs">' + (p.code || '-') + '</td>';
                html += '<td class="p-2 text-left text-white font-bold">' + p.name + '</td>';
                html += '<td class="p-2 text-left text-yellow-400 text-sm">' + (p.spec || '-') + '</td>';
                html += '<td class="p-2 text-center">' + weightBadge + '</td>';
                html += '<td class="p-2 text-right text-sm">' + unitWeightText + '</td>';
                html += '<td class="p-2 text-right"><span class="text-cyan-400 font-bold">' + (p.palletCapacity || '-') + '</span></td>';
                html += '<td class="p-2 text-right text-sm">' + shelfLifeText + '</td>';
                html += '<td class="p-2 text-center">' + inboundBadge + '</td>';
                html += '<td class="p-2 text-center">';
                html += '<button onclick="editProductMaster(\'' + docId + '\')" class="text-blue-400 hover:bg-blue-500/20 rounded px-2 py-1 mr-1"><i class="fa-solid fa-edit"></i></button>';
                html += '<button onclick="deleteProductMaster(\'' + docId + '\')" class="text-red-400 hover:bg-red-500/20 rounded px-2 py-1"><i class="fa-solid fa-trash"></i></button>';
                html += '</td>';
                html += '</tr>';
            });

            tbody.innerHTML = html;
            document.getElementById('pm-total-count').innerText = data.length;
        };

        window.filterProductMaster = function() {
            loadProductMasterList();
        };
        
        // 箱容變更時更新容積預覽
        window.updateBoxSizePreview = function() {
            var unitWeight = parseFloat(document.getElementById('pm-unit-weight').value) || 10;
            var boxSize = window.getBoxSizeByWeight ? window.getBoxSizeByWeight(unitWeight) : 'standard';
            
            // 使用 BOX_SIZE_VOLUME 來顯示容積係數
            var volumeConfig = { full: 1.0, partial: 0.75, scattered: 0.5 };
            if (window.RACK_CONFIG && window.RACK_CONFIG.BOX_SIZE_VOLUME) {
                volumeConfig = window.RACK_CONFIG.BOX_SIZE_VOLUME[boxSize] || volumeConfig;
            }
            
            // 更新 badge
            var badge = document.getElementById('pm-box-size-badge');
            if (badge) {
                var sizeNames = { small: '小箱', standard: '標準箱', large: '大箱' };
                var sizeColors = { small: 'bg-green-600', standard: 'bg-blue-600', large: 'bg-orange-600' };
                badge.textContent = sizeNames[boxSize] || '標準箱';
                badge.className = 'text-[10px] px-2 py-0.5 rounded text-white ' + (sizeColors[boxSize] || 'bg-blue-600');
            }
            
            // 更新容積數值（使用容積點數）
            var fullEl = document.getElementById('pm-vol-full');
            var partialEl = document.getElementById('pm-vol-partial');
            var scatteredEl = document.getElementById('pm-vol-scattered');
            if (fullEl) fullEl.textContent = volumeConfig.full.toFixed(2);
            if (partialEl) partialEl.textContent = volumeConfig.partial.toFixed(2);
            if (scatteredEl) scatteredEl.textContent = volumeConfig.scattered.toFixed(2);
        };

        window.saveProductMaster = async function() {
            var code = document.getElementById('pm-code').value.trim();
            var name = document.getElementById('pm-name').value.trim();
            var spec = document.getElementById('pm-spec').value.trim();
            var palletCapacity = parseInt(document.getElementById('pm-pallet-capacity').value) || 40;
            var shelfLife = parseInt(document.getElementById('pm-shelf-life').value) || 24;
            var category = document.getElementById('pm-category').value;
            var note = document.getElementById('pm-note').value.trim();
            var editId = document.getElementById('pm-edit-id').value;
            
            // 計重方式和入庫類型
            var weightTypeRadio = document.querySelector('input[name="pm-weight-type"]:checked');
            var weightType = weightTypeRadio ? weightTypeRadio.value : 'fixed';
            var inboundTypeRadio = document.querySelector('input[name="pm-inbound-type"]:checked');
            var inboundType = inboundTypeRadio ? inboundTypeRadio.value : 'Raw';
            var unitWeight = parseFloat(document.getElementById('pm-unit-weight').value) || 0;
            
            // 自動計算箱子尺寸（依箱容）
            var boxSize = window.getBoxSizeByWeight ? window.getBoxSizeByWeight(unitWeight) : 'standard';

            if (!name) {
                alert('請輸入品名');
                return;
            }

            if (!code) {
                alert('請輸入品號（ERP 產品編號）');
                return;
            }

            // 新增時檢查品號重複
            if (!editId) {
                var codeExists = window.productMasterData.find(function(p) {
                    return p.code === code;
                });
                if (codeExists) {
                    if (!confirm('品號「' + code + '」已存在（' + codeExists.name + '），是否覆蓋？')) {
                        return;
                    }
                    editId = codeExists.id;
                }
            }

            var item = {
                code: code,
                name: name,
                spec: spec,
                palletCapacity: palletCapacity,
                shelfLife: shelfLife,
                category: category,
                note: note,
                weightType: weightType,
                inboundType: inboundType,
                unitWeight: unitWeight,
                boxSize: boxSize,  // 自動計算
                updatedAt: new Date().toISOString()
            };

            try {
                if (editId) {
                    if (window.db && window.updateDoc) {
                        await window.updateDoc(window.doc(window.db, 'productMaster', editId), item);
                    }
                    var idx = window.productMasterData.findIndex(function(p) { return p.id === editId; });
                    if (idx >= 0) {
                        window.productMasterData[idx] = { id: editId, ...item };
                    }
                    alert('✅ 品項已更新');
                    logAudit('UPDATE', 'productMaster', editId, '更新品項：' + name + ' ' + spec, '品號:' + code);
                } else {
                    var exists = window.productMasterData.find(function(p) {
                        return p.name === name && p.spec === spec;
                    });

                    if (exists) {
                        if (!confirm('品項「' + name + ' ' + spec + '」已存在，是否覆蓋？')) {
                            return;
                        }
                        if (window.db && window.updateDoc && exists.id) {
                            await window.updateDoc(window.doc(window.db, 'productMaster', exists.id), item);
                        }
                        var existIdx = window.productMasterData.findIndex(function(p) { return p.id === exists.id; });
                        if (existIdx >= 0) {
                            window.productMasterData[existIdx] = { id: exists.id, ...item };
                        }
                    } else {
                        if (window.db && window.addDoc) {
                            var docRef = await window.addDoc(window.collection(window.db, 'productMaster'), item);
                            window.productMasterData.push({ id: docRef.id, ...item });
                        } else {
                            window.productMasterData.push(item);
                        }
                    }
                    alert('✅ 品項已儲存');
                    logAudit('CREATE', 'productMaster', code || name, '新增品項：' + name + ' ' + spec, '品號:' + code + ' 板容量:' + palletCapacity);
                }

                localStorage.setItem('wms_product_master', JSON.stringify(window.productMasterData));

                clearProductMasterForm();
                loadProductMasterList();
            } catch(e) {
                console.error('儲存品項失敗:', e);
                alert('❌ 儲存失敗：' + e.message);
            }
        };

        window.editProductMaster = function(docId) {
            var item = window.productMasterData.find(function(p) { return p.id === docId; });
            if (!item) {
                item = window.productMasterData[parseInt(docId)];
            }
            if (!item) return;

            document.getElementById('pm-code').value = item.code || '';
            document.getElementById('pm-name').value = item.name || '';
            document.getElementById('pm-spec').value = item.spec || '';
            document.getElementById('pm-pallet-capacity').value = item.palletCapacity || '';
            document.getElementById('pm-shelf-life').value = item.shelfLife || '';
            document.getElementById('pm-category').value = item.category || '成品';
            document.getElementById('pm-note').value = item.note || '';
            document.getElementById('pm-edit-id').value = item.id || docId;
            
            // 計重和入庫類型
            document.getElementById('pm-unit-weight').value = item.unitWeight || '';
            var weightType = item.weightType || 'fixed';
            var wtRadio = document.querySelector('input[name="pm-weight-type"][value="' + weightType + '"]');
            if (wtRadio) wtRadio.checked = true;
            var inboundType = item.inboundType || 'Raw';
            var itRadio = document.querySelector('input[name="pm-inbound-type"][value="' + inboundType + '"]');
            if (itRadio) itRadio.checked = true;
            
            // 更新容積預覽（依箱容自動計算）
            updateBoxSizePreview();
        };

        window.deleteProductMaster = async function(docId) {
            var item = window.productMasterData.find(function(p) { return p.id === docId; });
            if (!item) {
                item = window.productMasterData[parseInt(docId)];
            }
            if (!item) return;

            if (!confirm('確定刪除品項「' + item.name + ' ' + (item.spec || '') + '」？')) {
                return;
            }

            try {
                if (window.db && window.deleteDoc && item.id) {
                    await window.deleteDoc(window.doc(window.db, 'productMaster', item.id));
                }

                var idx = window.productMasterData.findIndex(function(p) { return p.id === item.id; });
                if (idx >= 0) {
                    window.productMasterData.splice(idx, 1);
                }

                localStorage.setItem('wms_product_master', JSON.stringify(window.productMasterData));

                loadProductMasterList();
                alert('✅ 品項已刪除');
                logAudit('DELETE', 'productMaster', item.code || item.id, '刪除品項：' + item.name + ' ' + (item.spec || ''));
            } catch(e) {
                console.error('刪除品項失敗:', e);
                alert('❌ 刪除失敗：' + e.message);
            }
        };

        window.clearProductMasterForm = function() {
            document.getElementById('pm-code').value = '';
            document.getElementById('pm-name').value = '';
            document.getElementById('pm-spec').value = '';
            document.getElementById('pm-pallet-capacity').value = '';
            document.getElementById('pm-shelf-life').value = '24';
            document.getElementById('pm-category').value = '成品';
            document.getElementById('pm-note').value = '';
            document.getElementById('pm-edit-id').value = '';
            
            // 重置計重和入庫類型
            document.getElementById('pm-unit-weight').value = '';
            var fixedRadio = document.querySelector('input[name="pm-weight-type"][value="fixed"]');
            if (fixedRadio) fixedRadio.checked = true;
            var rawRadio = document.querySelector('input[name="pm-inbound-type"][value="Raw"]');
            if (rawRadio) rawRadio.checked = true;
            
            // 重置容積預覽為標準箱
            updateBoxSizePreview();
        };

        window.clearAllProductMaster = async function() {
            var count = window.productMasterData.length;
            if (count === 0) {
                alert('品項主檔已經是空的');
                return;
            }

            if (!confirm('⚠️ 確定要清空全部 ' + count + ' 筆品項主檔嗎？\n\n此操作無法復原！')) {
                return;
            }

            if (!confirm('⚠️ 再次確認：刪除全部 ' + count + ' 筆資料？')) {
                return;
            }

            try {
                // 只移除真的刪除成功的項目；失敗的留在清單上，不會讓畫面與資料庫不一致
                var remaining = [];
                for (var i = 0; i < window.productMasterData.length; i++) {
                    var item = window.productMasterData[i];
                    if (!item.id) continue;
                    try {
                        await window.deleteDoc(window.doc(window.db, 'productMaster', item.id));
                    } catch(e) {
                        console.error('刪除品項失敗:', item.name, e);
                        remaining.push(item);
                    }
                }

                window.productMasterData = remaining;
                localStorage.setItem('wms_product_master', JSON.stringify(remaining));

                loadProductMasterList();

                if (remaining.length > 0) {
                    alert('⚠️ 已刪除 ' + (count - remaining.length) + ' 筆，' + remaining.length + ' 筆刪除失敗（可能沒有權限）');
                } else {
                    alert('✅ 已清空全部品項主檔（共 ' + count + ' 筆）');
                }
            } catch(e) {
                console.error('清空品項主檔失敗:', e);
                alert('❌ 清空失敗：' + e.message);
            }
        };

        window.autoImportFromInventory = async function() {
            var pallets = window.currentPallets();
            if (!pallets || pallets.length === 0) {
                alert('目前沒有庫存資料');
                return;
            }

            var products = {};
            pallets.forEach(function(p) {
                var key = p.productName + '|' + (p.spec || '');
                if (!products[key] && p.productName) {
                    products[key] = {
                        name: p.productName,
                        spec: p.spec || ''
                    };
                }
            });

            var productList = Object.values(products);

            var existingKeys = {};
            window.productMasterData.forEach(function(p) {
                existingKeys[p.name + '|' + (p.spec || '')] = true;
            });

            var newProducts = productList.filter(function(p) {
                return !existingKeys[p.name + '|' + (p.spec || '')];
            });

            if (newProducts.length === 0) {
                alert('所有品項都已在主檔中');
                return;
            }

            if (!confirm('發現 ' + newProducts.length + ' 個新品項，是否匯入？\n\n匯入後請手動設定各品項的板容量')) {
                return;
            }

            try {
                for (var i = 0; i < newProducts.length; i++) {
                    var p = newProducts[i];
                    var item = {
                        name: p.name,
                        spec: p.spec,
                        palletCapacity: 40, // 預設值
                        partialThreshold: 50,
                        shelfLife: 24, // 預設 2 年
                        category: '成品',
                        note: '自動匯入',
                        updatedAt: new Date().toISOString()
                    };

                    if (window.db && window.addDoc) {
                        var docRef = await window.addDoc(window.collection(window.db, 'productMaster'), item);
                        window.productMasterData.push({ id: docRef.id, ...item });
                    } else {
                        window.productMasterData.push(item);
                    }
                }

                localStorage.setItem('wms_product_master', JSON.stringify(window.productMasterData));

                loadProductMasterList();
                alert('✅ 已匯入 ' + newProducts.length + ' 個品項\n\n請編輯設定正確的板容量');
            } catch(e) {
                console.error('匯入品項失敗:', e);
                alert('❌ 匯入失敗：' + e.message);
            }
        };

        window.getProductPalletCapacity = function(productName, spec) {
            var item = window.productMasterData.find(function(p) {
                return p.name === productName && (p.spec || '') === (spec || '');
            });
            if (item) {
                return {
                    palletCapacity: item.palletCapacity,
                    partialThreshold: item.partialThreshold || 50
                };
            }
            return null; // 沒設定，使用方案 D
        };

        // ========== 品項主檔 Excel 匯入功能 ==========

        window.pmImportData = [];

        window.showProductMasterImport = function() {
            document.getElementById('modal-pm-import').classList.remove('hidden');
            document.getElementById('pm-import-step1').classList.remove('hidden');
            document.getElementById('pm-import-step2').classList.add('hidden');
            document.getElementById('pm-import-step3').classList.add('hidden');
            document.getElementById('pm-import-file').value = '';
            document.getElementById('pm-import-btn').disabled = true;
            window.pmImportData = [];
        };

        window.closeProductMasterImport = function() {
            document.getElementById('modal-pm-import').classList.add('hidden');
            window.pmImportData = [];
        };

        window.downloadProductMasterTemplate = function() {
            var template = [
                ['品號', '品名', '規格', '板容量', '箱容(kg)', '計重方式', '入庫類型', '保存期(月)', '類別', '備註'],
                ['A001', '冷凍蝦仁', '300/400', '40', '10', '定重', '採購', '24', '成品', '範例資料'],
                ['A002', '冷凍魚片', '500g', '40', '5', '定重', '成品', '18', '成品', ''],
                ['B001', '白蝦原料', '10kg', '50', '10', '不定重', '原料', '24', '原料', '']
            ];
            var ws = XLSX.utils.aoa_to_sheet(template);
            ws['!cols'] = [
                { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 10 },
                { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 20 }
            ];

            var wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, '品項主檔');
            XLSX.writeFile(wb, '品項主檔範本.xlsx');

            alert('✅ 範本已下載');
        };

        window.exportProductMaster = function() {
            if (!window.productMasterData || window.productMasterData.length === 0) {
                alert('目前沒有品項資料');
                return;
            }

            var data = [['品號', '品名', '規格', '板容量', '箱容(kg)', '計重方式', '入庫類型', '保存期(月)', '類別', '備註']];
            var wtMap = { 'fixed': '定重', 'variable': '不定重' };
            var itMap = { 'Raw': '採購', 'FG': '成品', 'WIP': '半成品', 'RM': '原料' };
            window.productMasterData.forEach(function(p) {
                data.push([
                    p.code || '', p.name || '', p.spec || '',
                    p.palletCapacity || '', p.unitWeight || '',
                    wtMap[p.weightType] || '定重', itMap[p.inboundType] || '採購',
                    p.shelfLife || '', p.category || '成品', p.note || ''
                ]);
            });
            var ws = XLSX.utils.aoa_to_sheet(data);
            ws['!cols'] = [
                { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 10 },
                { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 20 }
            ];

            var wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, '品項主檔');
            XLSX.writeFile(wb, '品項主檔_' + new Date().toLocalYMD() + '.xlsx');

            alert('✅ 已匯出 ' + window.productMasterData.length + ' 筆');
        };

        window.previewProductMasterImport = function() {
            var fileInput = document.getElementById('pm-import-file');
            var file = fileInput.files[0];
            if (!file) return;

            var reader = new FileReader();
            reader.onload = function(e) {
                try {
                    var data = new Uint8Array(e.target.result);
                    var workbook = XLSX.read(data, { type: 'array' });
                    var sheetName = workbook.SheetNames[0];
                    var sheet = workbook.Sheets[sheetName];
                    var jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

                    if (jsonData.length < 2) {
                        alert('檔案沒有資料或格式錯誤');
                        return;
                    }

                    var headerRowIndex = 0;
                    for (var h = 0; h < Math.min(10, jsonData.length); h++) {
                        var row = jsonData[h];
                        if (!row) continue;
                        var rowStr = row.join('|').toLowerCase();
                        if ((rowStr.includes('品號') || rowStr.includes('品名')) &&
                            !rowStr.includes('製表') && !rowStr.includes('資料日期')) {
                            headerRowIndex = h;
                            break;
                        }
                    }

                    var headers = jsonData[headerRowIndex].map(function(h) { return String(h || '').trim(); });
                    var colMap = {};

                    var fieldMappings = {
                        'code': ['品號', '編號', 'code', '產品編號', '品項編號', '貨號'],
                        'name': ['品名', '產品名稱', '品項名稱', '商品名稱'],
                        'spec': ['規格', 'spec', '規格說明', '產品規格'],
                        'palletCapacity': ['板容量', '每板件數', '板容量(件)', 'palletCapacity'],
                        'shelfLife': ['保存期', '保存期限', '保存月數', '保存期(月)', 'shelfLife'],
                        'category': ['類別', '分類', 'category', '產品類別'],
                        'note': ['備註', '說明', 'note', '備考']
                    };

                    var excludeHeaders = ['庫別名稱', '庫別', '倉庫', '單位', '數量', '庫存數量', '包裝數量'];

                    headers.forEach(function(h, idx) {
                        if (excludeHeaders.some(function(ex) { return h.includes(ex); })) {
                            return;
                        }

                        for (var field in fieldMappings) {
                            if (colMap[field] !== undefined) continue;

                            if (fieldMappings[field].some(function(n) {
                                return h === n || h.toLowerCase() === n.toLowerCase();
                            })) {
                                colMap[field] = idx;
                                break;
                            }
                        }
                    });

                    console.log('欄位對應結果:', colMap);
                    console.log('標題行:', headers);

                    if (colMap.name === undefined && colMap.code === undefined) {
                        alert('找不到「品號」或「品名」欄位，請確認 Excel 格式\n\n識別到的標題: ' + headers.join(', '));
                        return;
                    }

                    var importItems = [];
                    var seenCodes = {};  // 用於去重複
                    var newCount = 0, updateCount = 0, errorCount = 0, skipDupCount = 0;

                    var existingByCode = {};
                    var existingByNameSpec = {};
                    window.productMasterData.forEach(function(p) {
                        if (p.code) existingByCode[p.code] = p;
                        existingByNameSpec[p.name + '|' + (p.spec || '')] = p;
                    });

                    for (var i = headerRowIndex + 1; i < jsonData.length; i++) {
                        var row = jsonData[i];
                        if (!row || row.length === 0) continue;

                        var code = colMap.code !== undefined ? String(row[colMap.code] || '').trim() : '';
                        var name = colMap.name !== undefined ? String(row[colMap.name] || '').trim() : '';
                        var spec = colMap.spec !== undefined ? String(row[colMap.spec] || '').trim() : '';
                        var palletCapacity = colMap.palletCapacity !== undefined ? parseInt(row[colMap.palletCapacity]) || 0 : 0;
                        var shelfLife = colMap.shelfLife !== undefined ? parseInt(row[colMap.shelfLife]) || 0 : 0;
                        var category = colMap.category !== undefined ? String(row[colMap.category] || '').trim() : '';
                        var note = colMap.note !== undefined ? String(row[colMap.note] || '').trim() : '';

                        if (!name && !code) continue;
                        if (code && (code.includes('製表日期') || code.includes('資料日期') || code === '品號')) continue;
                        if (name && (name.includes('小計') || name.includes('合計'))) continue;

                        if (!name && code) name = code;

                        var dupKey = code || (name + '|' + spec);
                        if (seenCodes[dupKey]) {
                            skipDupCount++;
                            continue;
                        }
                        seenCodes[dupKey] = true;

                        if (!category || !['成品', '原料', '半成品', '包材'].includes(category)) {
                            if (name.includes('原料') || name.includes('原') && name.includes('料')) {
                                category = '原料';
                            } else if (name.includes('半成品')) {
                                category = '半成品';
                            } else if (name.includes('包材') || name.includes('紙箱') || name.includes('膠帶') || name.includes('標籤')) {
                                category = '包材';
                            } else {
                                category = '成品';
                            }
                        }

                        var status = 'new';
                        var existingItem = null;
                        var error = '';

                        if (code && existingByCode[code]) {
                            existingItem = existingByCode[code];
                            status = 'update';
                        } else if (existingByNameSpec[name + '|' + spec]) {
                            existingItem = existingByNameSpec[name + '|' + spec];
                            status = 'update';
                        }

                        if (!palletCapacity || palletCapacity < 1) {
                            if (existingItem && existingItem.palletCapacity) {
                                palletCapacity = existingItem.palletCapacity;
                            } else {
                                palletCapacity = 40;
                                note = (note ? note + ' | ' : '') + '板容量待設定';
                            }
                        }

                        if (!shelfLife || shelfLife < 1) {
                            if (existingItem && existingItem.shelfLife) {
                                shelfLife = existingItem.shelfLife;
                            } else {
                                shelfLife = 24;
                            }
                        }

                        var item = {
                            code: code,
                            name: name,
                            spec: spec,
                            palletCapacity: palletCapacity,
                            shelfLife: shelfLife,
                            category: category,
                            note: note,
                            status: status,
                            error: error,
                            existingId: existingItem ? existingItem.id : null
                        };

                        importItems.push(item);

                        if (status === 'new') newCount++;
                        else if (status === 'update') updateCount++;
                        else if (status === 'error') errorCount++;
                    }

                    if (importItems.length === 0) {
                        alert('沒有有效的資料可匯入');
                        return;
                    }

                    window.pmImportData = importItems;

                    document.getElementById('pm-import-new-count').textContent = newCount;
                    document.getElementById('pm-import-update-count').textContent = updateCount;
                    document.getElementById('pm-import-error-count').textContent = errorCount;
                    document.getElementById('pm-import-skip-count').textContent = skipDupCount;

                    if (skipDupCount > 0) {
                        console.log('已自動過濾 ' + skipDupCount + ' 筆重複品號');
                    }

                    var tbody = document.getElementById('pm-import-preview-body');
                    var html = '';

                    importItems.forEach(function(item, idx) {
                        var statusBadge = '';
                        var rowClass = '';

                        if (item.status === 'new') {
                            statusBadge = '<span class="px-2 py-0.5 bg-emerald-600 text-white text-xs rounded">新增</span>';
                            rowClass = 'bg-emerald-900/20';
                        } else if (item.status === 'update') {
                            statusBadge = '<span class="px-2 py-0.5 bg-yellow-600 text-white text-xs rounded">更新</span>';
                            rowClass = 'bg-yellow-900/20';
                        } else {
                            statusBadge = '<span class="px-2 py-0.5 bg-red-600 text-white text-xs rounded" title="' + item.error + '">錯誤</span>';
                            rowClass = 'bg-red-900/20';
                        }

                        html += '<tr class="border-b border-slate-700 ' + rowClass + '">';
                        html += '<td class="p-2">' + statusBadge + '</td>';
                        html += '<td class="p-2 text-slate-300">' + (item.code || '-') + '</td>';
                        html += '<td class="p-2 text-white font-bold">' + item.name + '</td>';
                        html += '<td class="p-2 text-slate-400">' + (item.spec || '-') + '</td>';
                        html += '<td class="p-2 text-center text-yellow-400">' + (item.palletCapacity || '-') + '</td>';
                        html += '<td class="p-2 text-center text-cyan-400">' + (item.shelfLife || '-') + '</td>';
                        html += '<td class="p-2"><span class="badge badge-blue text-xs">' + item.category + '</span></td>';
                        html += '<td class="p-2 text-slate-500 text-xs">' + (item.note || '-') + '</td>';
                        html += '</tr>';
                    });

                    tbody.innerHTML = html;

                    document.getElementById('pm-import-step2').classList.remove('hidden');
                    document.getElementById('pm-import-btn').disabled = false;

                } catch(e) {
                    console.error('解析 Excel 失敗:', e);
                    alert('解析檔案失敗：' + e.message);
                }
            };

            reader.readAsArrayBuffer(file);
        };

        window.executeProductMasterImport = async function() {
            if (!window.pmImportData || window.pmImportData.length === 0) {
                alert('沒有資料可匯入');
                return;
            }

            var updateExisting = document.getElementById('pm-import-update-existing').checked;
            var skipErrors = document.getElementById('pm-import-skip-errors').checked;

            var successCount = 0;
            var skipCount = 0;
            var errorItems = [];

            try {
                for (var i = 0; i < window.pmImportData.length; i++) {
                    var item = window.pmImportData[i];

                    if (item.status === 'error') {
                        if (skipErrors) {
                            skipCount++;
                            continue;
                        } else {
                            errorItems.push(item.name + ': ' + item.error);
                            continue;
                        }
                    }

                    if (item.status === 'update' && !updateExisting) {
                        skipCount++;
                        continue;
                    }

                    var data = {
                        code: item.code || '',
                        name: item.name,
                        spec: item.spec || '',
                        palletCapacity: item.palletCapacity,
                        partialThreshold: 50,
                        shelfLife: item.shelfLife || 24,
                        category: item.category || '成品',
                        note: item.note || '',
                        updatedAt: new Date().toISOString()
                    };

                    try {
                        if (item.status === 'update' && item.existingId) {
                            if (window.db && window.updateDoc) {
                                await window.updateDoc(window.doc(window.db, 'productMaster', item.existingId), data);
                            }
                            var idx = window.productMasterData.findIndex(function(p) { return p.id === item.existingId; });
                            if (idx >= 0) {
                                window.productMasterData[idx] = { id: item.existingId, ...data };
                            }
                        } else {
                            if (window.db && window.addDoc) {
                                var docRef = await window.addDoc(window.collection(window.db, 'productMaster'), data);
                                window.productMasterData.push({ id: docRef.id, ...data });
                            } else {
                                window.productMasterData.push(data);
                            }
                        }
                        successCount++;
                    } catch(e) {
                        console.error('匯入項目失敗:', item.name, e);
                        errorItems.push(item.name + ': ' + e.message);
                    }
                }

                localStorage.setItem('wms_product_master', JSON.stringify(window.productMasterData));

                var firebaseStatus = (window.db && window.addDoc) ? '已同步至 Firebase ☁️' : '僅儲存本機';
                var resultHtml = '<div class="space-y-3">';
                resultHtml += '<div class="flex items-center gap-3 text-emerald-400"><i class="fa-solid fa-check-circle text-2xl"></i><span class="text-xl font-bold">匯入完成</span></div>';
                resultHtml += '<div class="text-sm text-cyan-400 mt-1"><i class="fa-solid fa-cloud mr-1"></i>' + firebaseStatus + '</div>';
                resultHtml += '<div class="grid grid-cols-3 gap-4 mt-4">';
                resultHtml += '<div class="bg-emerald-900/30 p-3 rounded-lg text-center"><div class="text-2xl font-bold text-emerald-400">' + successCount + '</div><div class="text-sm text-slate-400">成功匯入</div></div>';
                resultHtml += '<div class="bg-yellow-900/30 p-3 rounded-lg text-center"><div class="text-2xl font-bold text-yellow-400">' + skipCount + '</div><div class="text-sm text-slate-400">略過</div></div>';
                resultHtml += '<div class="bg-red-900/30 p-3 rounded-lg text-center"><div class="text-2xl font-bold text-red-400">' + errorItems.length + '</div><div class="text-sm text-slate-400">失敗</div></div>';
                resultHtml += '</div>';

                if (errorItems.length > 0) {
                    resultHtml += '<div class="mt-3 p-3 bg-red-900/30 rounded-lg"><div class="text-red-400 font-bold mb-2">失敗項目：</div><ul class="text-sm text-red-300 list-disc list-inside">';
                    errorItems.forEach(function(err) {
                        resultHtml += '<li>' + err + '</li>';
                    });
                    resultHtml += '</ul></div>';
                }

                resultHtml += '</div>';

                document.getElementById('pm-import-result').innerHTML = resultHtml;
                document.getElementById('pm-import-step2').classList.add('hidden');
                document.getElementById('pm-import-step3').classList.remove('hidden');
                document.getElementById('pm-import-btn').disabled = true;

                loadProductMasterList();
                logAudit('IMPORT', 'productMaster', '-', '品項主檔匯入：成功 ' + successCount + ' 筆，略過 ' + skipCount + ' 筆，失敗 ' + errorItems.length + ' 筆');

            } catch(e) {
                console.error('匯入失敗:', e);
                alert('匯入失敗：' + e.message);
            }
        };

        // ========== 批次補填庫存品號 ==========
        window.batchFillProductCode = async function() {
            if (!window.db || !window.collection || !window.getDocs) { alert('Firebase 尚未連線'); return; }
            if (!window.productMasterData || window.productMasterData.length === 0) { alert('品項主檔是空的，請先建立品項主檔'); return; }
            var withCode = window.productMasterData.filter(function(p) { return p.code; });
            if (withCode.length === 0) { alert('品項主檔中沒有品號，請先為品項設定 ERP 品號'); return; }
            if (!confirm('將根據品項主檔為現有庫存棧板補填品號（productCode）\n有品號的品項：' + withCode.length + ' 筆\n是否繼續？')) return;
            try {
                var snapshot = await window.getDocs(window.collection(window.db, 'pallets'));
                var updateCount = 0, skipCount = 0, notFoundCount = 0;
                var batch = window.writeBatch(window.db);
                var batchSize = 0;
                snapshot.forEach(function(docSnap) {
                    var data = docSnap.data();
                    if (data.productCode) { skipCount++; return; }
                    var pm = window.productMasterData.find(function(p) { return p.name === data.productName; });
                    if (pm && pm.code) {
                        batch.update(docSnap.ref, { productCode: pm.code });
                        updateCount++; batchSize++;
                    } else { notFoundCount++; }
                });
                if (batchSize > 0) await batch.commit();
                var msg = '✅ 補填完成！\n已補填：' + updateCount + ' 筆\n已有品號（跳過）：' + skipCount + ' 筆\n找不到對應：' + notFoundCount + ' 筆';
                if (notFoundCount > 0) msg += '\n\n💡 找不到的棧板可能品名不一致，請核對品項主檔。';
                alert(msg);
                logAudit('BATCH_UPDATE', 'pallets', '-', '批次補填品號：更新 ' + updateCount + '，跳過 ' + skipCount + '，未對應 ' + notFoundCount);
            } catch(e) { alert('❌ 補填失敗：' + e.message); }
        };

        // 登入後才載入（原本用固定秒數計時，使用者還沒登入時會被安全規則拒絕，資料就永遠載不到）
        window.onLogin(function() {
            loadProductMasterFromFirebase();
            if (typeof window.loadRentalSettingsFromFirebase === 'function') window.loadRentalSettingsFromFirebase();
            loadExternalStock();
            if (typeof window.loadConsignmentsFromFirebase === 'function') window.loadConsignmentsFromFirebase();
        });

        setInboundMode('Raw');
        switchTab('visual-map', null);

