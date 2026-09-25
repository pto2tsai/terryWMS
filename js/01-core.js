// ============================================================
// js/01-core.js — 通知、共用工具、列印預覽、單號產生器、貨架容量設定
// 由原 app.js 第 1–728 行拆出；各檔依 index.html 的順序載入，共用全域（window）
// ============================================================
        // ========== 前向聲明：寄倉管理模組 ==========
        // 這些函數會在後面被完整定義，這裡先建立佔位符
        window.loadRentalSettingsFromFirebase = window.loadRentalSettingsFromFirebase || function() { console.log('loadRentalSettingsFromFirebase 尚未載入'); };
        window.loadConsignmentsFromFirebase = window.loadConsignmentsFromFirebase || function() { console.log('loadConsignmentsFromFirebase 尚未載入'); };
        window.openNewConsignmentModal = window.openNewConsignmentModal || function() { alert('功能載入中，請稍後再試'); };
        window.exportConsignments = window.exportConsignments || function() { alert('功能載入中，請稍後再試'); };
        window.loadConsignmentList = window.loadConsignmentList || function() { console.log('loadConsignmentList 尚未載入'); };
        window.rentalSettings = window.rentalSettings || { settlement: { settleDay: 25, freeUntilDay: 25 }, storageRate: { bafang: 22, chungwen: { tier1Max: 300, tier1Rate: 22, tier2Rate: 20 } }, handlingFee: { inbound: 200, outbound: 0 } };
        window.consignmentData = window.consignmentData || [];
        
        // ========== 通知函數 ==========
        window.showNotification = function(message, type) {
            type = type || 'info';
            var colors = {
                'success': 'bg-emerald-600',
                'error': 'bg-red-600',
                'warning': 'bg-amber-600',
                'info': 'bg-blue-600'
            };
            var bgColor = colors[type] || colors.info;
            
            var toast = document.createElement('div');
            toast.className = 'fixed top-4 right-4 ' + bgColor + ' text-white px-6 py-3 rounded-lg shadow-lg z-[9999] animate-pulse';
            toast.style.animation = 'fadeInOut 3s ease-in-out';
            toast.innerHTML = message;
            document.body.appendChild(toast);
            
            setTimeout(function() {
                toast.style.opacity = '0';
                toast.style.transition = 'opacity 0.5s';
                setTimeout(function() { toast.remove(); }, 500);
            }, 2500);
        };
        
        // ========== 通用工具函數庫 ==========

window.WMS = window.WMS || {};

WMS.createModal = function(id, options) {
    var opts = options || {};
    var modal = document.createElement('div');
    modal.id = id;
    modal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50';

    var width = opts.width || '500px';
    var maxHeight = opts.maxHeight || '80vh';

    var html = '<div class="bg-slate-800 rounded-xl p-6 w-[' + width + '] max-h-[' + maxHeight + '] overflow-y-auto border border-slate-600">';

    if (opts.title) {
        html += '<div class="flex justify-between items-center mb-4">';
        html += '<h3 class="text-white font-bold text-lg">';
        if (opts.icon) html += '<i class="' + opts.icon + ' mr-2"></i>';
        html += opts.title + '</h3>';
        html += '<button onclick="WMS.closeModal(\'' + id + '\')" class="text-slate-400 hover:text-white">';
        html += '<i class="fa-solid fa-xmark text-xl"></i></button>';
        html += '</div>';
    }

    html += '<div id="' + id + '-content">' + (opts.content || '') + '</div>';
    
    // 支持 footer
    if (opts.footer) {
        html += '<div class="mt-4 pt-4 border-t border-slate-700 flex justify-end gap-3">' + opts.footer + '</div>';
    }
    
    html += '</div>';

    modal.innerHTML = html;
    document.body.appendChild(modal);

    if (opts.closeOnBackdrop !== false) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) WMS.closeModal(id);
        });
    }

    return modal;
};

WMS.closeModal = function(id) {
    var modal = document.getElementById(id);
    if (modal) modal.remove();
};

WMS.updateModalContent = function(id, content) {
    var contentEl = document.getElementById(id + '-content');
    if (contentEl) contentEl.innerHTML = content;
};

WMS.formatDate = function(date, format) {
    if (!date) return '-';

    var d = date;
    if (typeof date === 'string') d = new Date(date);
    if (date.toDate) d = date.toDate(); // Firestore Timestamp

    if (isNaN(d.getTime())) return '-';

    format = format || 'YYYY/MM/DD';

    var year = d.getFullYear();
    var month = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    var hours = String(d.getHours()).padStart(2, '0');
    var minutes = String(d.getMinutes()).padStart(2, '0');
    var seconds = String(d.getSeconds()).padStart(2, '0');

    return format
        .replace('YYYY', year)
        .replace('MM', month)
        .replace('DD', day)
        .replace('HH', hours)
        .replace('mm', minutes)
        .replace('ss', seconds);
};

WMS.timeAgo = function(date) {
    if (!date) return '-';

    var d = date;
    if (typeof date === 'string') d = new Date(date);
    if (date.toDate) d = date.toDate();

    var now = new Date();
    var diff = Math.floor((now - d) / 1000); // 秒數

    if (diff < 60) return '剛剛';
    if (diff < 3600) return Math.floor(diff / 60) + ' 分鐘前';
    if (diff < 86400) return Math.floor(diff / 3600) + ' 小時前';
    if (diff < 604800) return Math.floor(diff / 86400) + ' 天前';

    return WMS.formatDate(d);
};

WMS.formatNumber = function(num, decimals) {
    if (num === null || num === undefined) return '-';
    decimals = decimals || 0;
    return Number(num).toLocaleString('zh-TW', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

WMS.statusBadge = function(status, type) {
    var configs = {
        'pending': { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: '待處理' },
        'processing': { bg: 'bg-blue-500/20', text: 'text-blue-400', label: '處理中' },
        'completed': { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: '已完成' },
        'cancelled': { bg: 'bg-slate-500/20', text: 'text-slate-400', label: '已取消' },
        'picking': { bg: 'bg-purple-500/20', text: 'text-purple-400', label: '揀貨中' },
        'sorted': { bg: 'bg-cyan-500/20', text: 'text-cyan-400', label: '已分貨' },
        'shipped': { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: '已出貨' },
        'Active': { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: '正常' },
        'Reserved': { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: '保留' },
        'Depleted': { bg: 'bg-slate-500/20', text: 'text-slate-400', label: '已用完' }
    };

    var config = configs[status] || { bg: 'bg-slate-500/20', text: 'text-slate-400', label: status || '-' };

    return '<span class="px-2 py-1 rounded text-xs ' + config.bg + ' ' + config.text + '">' + config.label + '</span>';
};

WMS.toast = function(message, type, duration) {
    type = type || 'info';
    duration = duration || 3000;

    var colors = {
        'success': 'bg-emerald-600',
        'error': 'bg-red-600',
        'warning': 'bg-yellow-600',
        'info': 'bg-blue-600'
    };

    var icons = {
        'success': 'fa-check-circle',
        'error': 'fa-xmark-circle',
        'warning': 'fa-triangle-exclamation',
        'info': 'fa-info-circle'
    };

    var toast = document.createElement('div');
    toast.className = 'fixed top-4 right-4 ' + colors[type] + ' text-white px-4 py-3 rounded-lg shadow-lg z-[9999] flex items-center gap-2 animate-fade-in';
    toast.innerHTML = '<i class="fa-solid ' + icons[type] + '"></i><span>' + message + '</span>';

    document.body.appendChild(toast);

    setTimeout(function() {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(function() { toast.remove(); }, 300);
    }, duration);
};

WMS.confirm = function(message, options) {
    return new Promise(function(resolve) {
        var opts = options || {};
        var id = 'wms-confirm-' + Date.now();

        var content = '<div class="text-center">';
        content += '<div class="text-5xl mb-4">' + (opts.icon || '⚠️') + '</div>';
        content += '<div class="text-white text-lg mb-2">' + message + '</div>';
        if (opts.description) {
            content += '<div class="text-slate-400 text-sm mb-4">' + opts.description + '</div>';
        }
        content += '<div class="flex gap-3 justify-center mt-6">';
        content += '<button id="' + id + '-cancel" class="px-6 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg">' + (opts.cancelText || '取消') + '</button>';
        content += '<button id="' + id + '-confirm" class="px-6 py-2 ' + (opts.danger ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500') + ' text-white rounded-lg font-bold">' + (opts.confirmText || '確定') + '</button>';
        content += '</div></div>';

        WMS.createModal(id, { content: content, width: '400px' });

        document.getElementById(id + '-confirm').onclick = function() {
            WMS.closeModal(id);
            resolve(true);
        };
        document.getElementById(id + '-cancel').onclick = function() {
            WMS.closeModal(id);
            resolve(false);
        };
    });
};

WMS.showLoading = function(message) {
    var id = 'wms-loading';
    if (document.getElementById(id)) return;

    var modal = document.createElement('div');
    modal.id = id;
    modal.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-[9999]';
    modal.innerHTML = '<div class="bg-slate-800 rounded-xl p-8 text-center">' +
        '<i class="fa-solid fa-spinner fa-spin text-4xl text-blue-400 mb-4"></i>' +
        '<div class="text-white">' + (message || '處理中...') + '</div></div>';
    document.body.appendChild(modal);
};

WMS.hideLoading = function() {
    var modal = document.getElementById('wms-loading');
    if (modal) modal.remove();
};

WMS.sortTable = function(data, key, direction) {
    direction = direction || 'asc';
    return data.slice().sort(function(a, b) {
        var valA = a[key];
        var valB = b[key];

        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;

        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return direction === 'asc' ? -1 : 1;
        if (valA > valB) return direction === 'asc' ? 1 : -1;
        return 0;
    });
};

WMS.debounce = function(func, wait) {
    var timeout;
    return function() {
        var context = this;
        var args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(function() {
            func.apply(context, args);
        }, wait);
    };
};

WMS.copyToClipboard = function(text) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function() {
            WMS.toast('已複製到剪貼簿', 'success');
        }).catch(function(err) {
            console.error('複製失敗:', err);
            WMS.toast('複製失敗', 'error');
        });
    } else {
        var textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        WMS.toast('已複製到剪貼簿', 'success');
    }
};

WMS.formatLocation = function(locationId) {
    if (!locationId) return '-';
    return locationId;
};

WMS.parseBoxPerPackage = function(productName) {
    if (!productName) return 0;
    var match = productName.match(/(\d+)[盒箱包袋入]/);
    return match ? parseInt(match[1]) : 0;
};

console.log('✅ WMS 工具函數庫已載入');

        // ========== 通用預覽列印系統（優化版）==========
        function openPrintPreview(htmlContent, title, width, height, options) {
            width = width || 1000;
            height = height || 750;
            options = options || {};

            var previewHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8">';
            previewHtml += '<title>列印預覽 - ' + (title || '文件') + '</title>';
            previewHtml += '<style>';
            previewHtml += '@media screen { body { margin: 0; padding: 0; background: #0f172a; font-family: "Microsoft JhengHei", sans-serif; } }';
            previewHtml += '.preview-toolbar { position: fixed; top: 0; left: 0; right: 0; background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 15px 24px; display: flex; align-items: center; justify-content: space-between; z-index: 9999; box-shadow: 0 4px 20px rgba(0,0,0,0.4); }';
            previewHtml += '.preview-toolbar h2 { color: white; margin: 0; font-size: 18px; display: flex; align-items: center; gap: 10px; }';
            previewHtml += '.preview-toolbar .btn-group { display: flex; gap: 12px; }';
            previewHtml += '.preview-toolbar button { padding: 12px 28px; font-size: 15px; font-weight: bold; border: none; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: all 0.2s; }';
            previewHtml += '.preview-toolbar .btn-print { background: #10b981; color: white; font-size: 16px; }';
            previewHtml += '.preview-toolbar .btn-print:hover { background: #059669; transform: scale(1.03); box-shadow: 0 4px 15px rgba(16,185,129,0.4); }';
            previewHtml += '.preview-toolbar .btn-copies { background: #f59e0b; color: white; }';
            previewHtml += '.preview-toolbar .btn-copies:hover { background: #d97706; }';
            previewHtml += '.preview-toolbar .btn-close { background: #475569; color: white; }';
            previewHtml += '.preview-toolbar .btn-close:hover { background: #334155; }';
            previewHtml += '.preview-toolbar input[type=number] { width: 60px; padding: 8px; border: 2px solid #3b82f6; border-radius: 6px; font-size: 16px; font-weight: bold; text-align: center; }';
            previewHtml += '.preview-container { margin-top: 70px; padding: 30px; display: flex; flex-direction: column; align-items: center; gap: 20px; min-height: calc(100vh - 70px); }';
            previewHtml += '.preview-paper { background: white; box-shadow: 0 10px 50px rgba(0,0,0,0.5); border-radius: 4px; }';
            previewHtml += '.preview-hint { color: #64748b; font-size: 13px; margin-top: 10px; }';
            previewHtml += '.zoom-controls { position: fixed; bottom: 20px; right: 20px; display: flex; gap: 8px; background: #1e293b; padding: 8px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); }';
            previewHtml += '.zoom-controls button { width: 40px; height: 40px; border: none; background: #334155; color: white; border-radius: 6px; cursor: pointer; font-size: 18px; }';
            previewHtml += '.zoom-controls button:hover { background: #475569; }';
            previewHtml += '.zoom-controls span { color: #94a3b8; padding: 0 10px; line-height: 40px; font-size: 14px; }';
            previewHtml += '@media print { .preview-toolbar, .zoom-controls, .preview-hint { display: none !important; } .preview-container { margin: 0; padding: 0; } .preview-paper { box-shadow: none; border-radius: 0; } }';
            previewHtml += '</style></head><body>';

            previewHtml += '<div class="preview-toolbar">';
            previewHtml += '<h2>📄 ' + (title || '列印預覽') + '</h2>';
            previewHtml += '<div class="btn-group">';
            if (options.showCopies !== false) {
                previewHtml += '<span style="color:white;font-size:14px;margin-right:-5px;">份數:</span>';
                previewHtml += '<input type="number" id="print-copies" value="1" min="1" max="99">';
            }
            previewHtml += '<button class="btn-print" onclick="doPrint()">🖨️ 確認列印</button>';
            previewHtml += '<button class="btn-close" onclick="window.close()">✕ 關閉</button>';
            previewHtml += '</div></div>';

            previewHtml += '<div class="preview-container">';
            previewHtml += '<div class="preview-paper" id="preview-paper" style="transform-origin: top center;">';
            previewHtml += htmlContent;
            previewHtml += '</div>';
            previewHtml += '<div class="preview-hint">💡 提示：可使用下方按鈕縮放預覽，列印時會自動調整為原始大小</div>';
            previewHtml += '</div>';

            previewHtml += '<div class="zoom-controls">';
            previewHtml += '<button onclick="zoomOut()">－</button>';
            previewHtml += '<span id="zoom-level">100%</span>';
            previewHtml += '<button onclick="zoomIn()">＋</button>';
            previewHtml += '<button onclick="zoomReset()">↺</button>';
            previewHtml += '</div>';

            previewHtml += '<script>';
            previewHtml += 'var currentZoom = 100;';
            previewHtml += 'function updateZoom() { document.getElementById("preview-paper").style.transform = "scale(" + (currentZoom/100) + ")"; document.getElementById("zoom-level").innerText = currentZoom + "%"; }';
            previewHtml += 'function zoomIn() { if(currentZoom < 150) { currentZoom += 10; updateZoom(); } }';
            previewHtml += 'function zoomOut() { if(currentZoom > 50) { currentZoom -= 10; updateZoom(); } }';
            previewHtml += 'function zoomReset() { currentZoom = 100; updateZoom(); }';
            previewHtml += 'function doPrint() {';
            previewHtml += '  var copies = parseInt(document.getElementById("print-copies")?.value || 1);';
            previewHtml += '  currentZoom = 100; updateZoom();';  // 列印前重置縮放
            previewHtml += '  for(var i = 0; i < copies; i++) { window.print(); }';
            previewHtml += '}';
            previewHtml += 'document.addEventListener("keydown", function(e) {';
            previewHtml += '  if(e.ctrlKey && e.key === "p") { e.preventDefault(); doPrint(); }';  // Ctrl+P 快捷鍵
            previewHtml += '  if(e.key === "Escape") { window.close(); }';  // ESC 關閉
            previewHtml += '});';
            previewHtml += '<\/script>';

            previewHtml += '</body></html>';

            var win = window.open('', '_blank', 'width=' + width + ',height=' + height);
            if (win) {
                win.document.write(previewHtml);
                win.document.close();
            } else {
                alert('無法開啟列印預覽視窗！\n\n請檢查：\n1. 瀏覽器是否阻擋彈出視窗\n2. 請允許此網站的彈出視窗');
            }
            return win;
        }

        function toggleNavGroup(groupId) {
            var group = document.getElementById(groupId);
            if (group) {
                group.classList.toggle('collapsed');
                var header = group.previousElementSibling;
                if (header) {
                    var chevron = header.querySelector('.nav-chevron');
                    if (chevron) {
                        if (group.classList.contains('collapsed')) {
                            chevron.style.transform = 'rotate(-90deg)';
                        } else {
                            chevron.style.transform = 'rotate(0deg)';
                        }
                    }
                }
            }
        }

        function switchTab(viewId, evt) {
            document.querySelectorAll('.view-panel').forEach(function(el) { el.classList.add('hidden'); });
            document.getElementById('view-' + viewId).classList.remove('hidden');
            document.querySelectorAll('.nav-item').forEach(function(el) { el.classList.remove('active'); });

            if(evt && evt.currentTarget) {
                evt.currentTarget.classList.add('active');
                document.getElementById('page-title').innerText = evt.currentTarget.innerText.trim();
            }

            if(viewId === 'visual-map') { renderAllMaps(); window.currentViewingLane = null; }
            if(viewId === 'unified-inbound') { renderAllMaps(); }
            if(viewId === 'move') { initSmartDispatch(); }
            if(viewId === 'approval') { loadApprovalList(); }
            if(viewId === 'inventory-log') { initInventoryLogPage(); }
            if(viewId === 'product-analysis') { initProductAnalysis(); }
            if(viewId === 'warehouse-heatmap') { initWarehouseHeatmap(); }
            if(viewId === 'expiry-management') { refreshExpiryReport(); }
            if(viewId === 'user-management') { loadUserList(); }
            if(viewId === 'wave-picking') { loadWavesFromFirebase(); }
            if(viewId === 'erp-inbox' && window.initErpInboxPage) { window.initErpInboxPage(); }
            if(viewId === 'product-master') { loadProductMasterFromFirebase(); }
            if(viewId === 'external-warehouse') { loadExternalStock(); updateExtWarehouseFilter(); }
            if(viewId === 'stocktake' && window.initStocktakePage) { window.initStocktakePage(); }
            if(viewId === 'consignment') { if(typeof window.loadConsignmentsFromFirebase === 'function') window.loadConsignmentsFromFirebase(); }
            if(viewId === 'rental-settings') { if(typeof window.loadRentalSettingsFromFirebase === 'function') window.loadRentalSettingsFromFirebase(); }
            if(viewId === 'dev-tools') { if(typeof window.refreshDevToolsStats === 'function') window.refreshDevToolsStats(); if(typeof window.initDevToolsBackup === 'function') window.initDevToolsBackup(); }
            if(viewId === 'rental-report') { 
                if(typeof window.loadRentalSettingsFromFirebase === 'function') window.loadRentalSettingsFromFirebase();
                // 自動設定當月並載入報表
                setTimeout(function() {
                    const monthInput = document.getElementById('rental-month');
                    if (monthInput && !monthInput.value) {
                        const now = new Date();
                        monthInput.value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
                    }
                    if (typeof window.loadRentalReport === 'function') window.loadRentalReport();
                }, 500);
            }
            if(viewId === 'work-board') { 
                // 🔧 修正：切換到工單看板時先載入資料
                loadWorkBoardData().then(function() {
                    refreshWorkBoard(); 
                    setBoardRefreshInterval(); 
                });
            }
        }
        function renderAllMaps() {
            renderMapUI('grid-I-A'); renderMapUI('grid-I-B');
            renderMapUI('grid-J-C'); renderMapUI('grid-J-D');
            renderMapUI('grid-K-E'); renderMapUI('grid-K-F'); renderMapUI('grid-K-G'); renderMapUI('grid-K-H');
            renderMapUI('grid-I-A-map'); renderMapUI('grid-I-B-map');
            renderMapUI('grid-J-C-map'); renderMapUI('grid-J-D-map');
            renderMapUI('grid-K-E-map'); renderMapUI('grid-K-F-map'); renderMapUI('grid-K-G-map'); renderMapUI('grid-K-H-map');
            if(window.currentViewingLane) showLaneDetail(window.currentViewingLane.zone, window.currentViewingLane.row);
            updateOZoneStats();
        }

        const mapConfig = {
            'grid-I-A':8, 'grid-I-B':8,
            'grid-J-C':8, 'grid-J-D':8,
            'grid-K-E':22, 'grid-K-F':22, 'grid-K-G':22, 'grid-K-H':22,
            'grid-I-A-map':8, 'grid-I-B-map':8,
            'grid-J-C-map':8, 'grid-J-D-map':8,
            'grid-K-E-map':22, 'grid-K-F-map':22, 'grid-K-G-map':22, 'grid-K-H-map':22
        };
        let lockedLane = null;

        function updateOZoneStats() {
            var inventory = window.currentInventory ? window.currentInventory() : [];
            var oZoneItems = inventory.filter(function(item) {
                return item.locationId && item.locationId.startsWith('O-');
            });

            var totalCount = oZoneItems.length;
            var totalQty = oZoneItems.reduce(function(sum, item) {
                return sum + (parseInt(item.quantity) || 0);
            }, 0);

            var countEl = document.getElementById('o-zone-count');
            var qtyEl = document.getElementById('o-zone-qty');

            if (countEl) countEl.textContent = totalCount;
            if (qtyEl) qtyEl.textContent = totalQty;
        }
        
        // ========== 統一單據編號產生器 ==========
        // 格式：XX-YYYYMMDD-NNN
        // XX = 單據類型代碼
        
        // 單據類型代碼對照表
        window.DOC_TYPE_CODES = {
            'IN': '入庫',           // Inbound
            'PK': '揀貨出庫',       // Picking
            'RM': '原料出庫',       // Raw Material
            'DS': '調度單',         // Dispatch
            'BI': '批次入庫',       // Batch Inbound
            'TR': '移轉',           // Transfer
            'AD': '調整',           // Adjustment
            'RT': '退貨',           // Return
            'SC': '報廢'            // Scrap
        };
        
        // 號碼由 Firestore 的 counters/{類型-日期} 用交易遞增發號，多台裝置不會重複。
        // generateDocNo 維持同步呼叫：從事先保留的號碼池取號；
        // 號碼池用完（或離線）時改發臨時號碼 XX-YYYYMMDD-T...，同樣不會重複。
        window._docNoPool = {};
        var _docNoRefilling = {};
        var _docNoFallbackSeq = 0;
        var DOC_NO_POOL_SIZE = { 'IN': 30 };
        var DOC_NO_DEFAULT_POOL_SIZE = 5;

        function docNoKey(type) {
            var now = new Date();
            var dateStr = now.getFullYear() + ('0'+(now.getMonth()+1)).slice(-2) + ('0'+now.getDate()).slice(-2);
            return type + '-' + dateStr;
        }

        // 向 Firestore 保留 count 個連續號碼，回傳號碼陣列
        window.reserveDocNos = async function(type, count) {
            var key = docNoKey(type);
            var ref = window.db.collection('counters').doc(key);
            var start = await window.db.runTransaction(async function(tx) {
                var snap = await tx.get(ref);
                var seq = snap.exists ? (parseInt(snap.data().seq) || 0) : 0;
                tx.set(ref, { seq: seq + count, updatedAt: new Date().toISOString() });
                return seq;
            });
            var nos = [];
            for (var i = 1; i <= count; i++) {
                nos.push(key + '-' + String(start + i).padStart(3, '0'));
            }
            return nos;
        };

        // 確保號碼池至少有 count 個號碼（失敗時不丟錯，之後會改發臨時號碼）
        window.ensureDocNoPool = async function(type, count) {
            var key = docNoKey(type);
            var pool = window._docNoPool[key] || [];
            if (pool.length >= count) return;
            try {
                var nos = await window.reserveDocNos(type, count - pool.length);
                window._docNoPool[key] = (window._docNoPool[key] || []).concat(nos);
            } catch (e) {
                console.warn('保留單號失敗（將使用臨時號碼）:', e);
            }
        };

        function refillDocNoPool(type) {
            if (_docNoRefilling[type]) return;
            _docNoRefilling[type] = true;
            window.ensureDocNoPool(type, DOC_NO_POOL_SIZE[type] || DOC_NO_DEFAULT_POOL_SIZE)
                .finally(function() { _docNoRefilling[type] = false; });
        }

        // 登入後預先保留常用單號
        window.warmDocNoPools = function() {
            ['IN', 'BI', 'DS', 'PK', 'RM', 'TR'].forEach(refillDocNoPool);
        };

        window.generateDocNo = function(type) {
            type = type || 'IN';
            var key = docNoKey(type);
            var pool = window._docNoPool[key] || [];
            var no = pool.shift();
            window._docNoPool[key] = pool;

            if (pool.length < Math.ceil((DOC_NO_POOL_SIZE[type] || DOC_NO_DEFAULT_POOL_SIZE) / 2)) {
                refillDocNoPool(type);
            }
            if (no) return no;

            _docNoFallbackSeq++;
            return key + '-T' + Date.now().toString(36).toUpperCase() +
                Math.random().toString(36).slice(2, 4).toUpperCase() + _docNoFallbackSeq;
        };

        // 非同步取號：先確保號碼池有號碼再取（在 async 函數中優先使用）
        window.nextDocNo = async function(type) {
            type = type || 'IN';
            await window.ensureDocNoPool(type, 1);
            return window.generateDocNo(type);
        };

        // 為了向後相容，保留 generatePalletNo
        window.generatePalletNo = function() {
            return window.generateDocNo('IN');
        };
        
        // 貨架配置表、板型與各層容量計算移到 js/shared/rack-config.js（電腦版與手機版共用）

        // ========== 檢查某層是否可放特定板型 ==========
        window.canLevelAccept = function(level, palletType) {
            return window.getLevelCapacity(level, palletType) > 0;
        };
        
        // ========== 計算某層剩餘可放板數 ==========
        window.calculateLevelRemainingCapacity = function(level, currentCount, palletType) {
            var maxCapacity = window.getLevelCapacity(level, palletType);
            return Math.max(0, maxCapacity - currentCount);
        };
        
        // ========== 計算儲位剩餘可放板數 ==========
        window.calculateLocationRemainingCapacity = function(locationId, inventory, palletType) {
            var parsed = parseLocationId(locationId);
            if (!parsed) return 0;
            
            var level = parsed.level;
            var maxCapacity = window.getLevelCapacity(level, palletType || 'full');
            
            // 計算該儲位已有的板數
            var currentCount = 0;
            (inventory || []).forEach(function(item) {
                if (item.locationId === locationId) {
                    currentCount++;
                }
            });
            
            return Math.max(0, maxCapacity - currentCount);
        };
        
        // 取得層的總容積
        window.getLevelVolume = function(levelStr) {
            if (!window.RACK_CONFIG || !window.RACK_CONFIG.LEVEL_VOLUME) return 8;
            return window.RACK_CONFIG.LEVEL_VOLUME[levelStr] || 8;
        };
        


// ========== 儲位輸入框：可以打簡碼（IA011），旁邊即時顯示轉換結果，離開欄位或按 Enter 自動換成標準格式 ==========
(function() {
    var IDS = ['in-loc', 'move-target-loc', 'fallback-move-loc', 'fallback-merge-loc', 'transfer-location', 'transfer-loc',
        'edit-loc', 'edit-location-field'];
    function isLocInput(el) {
        return el && el.tagName === 'INPUT' && (IDS.indexOf(el.id) >= 0 || el.hasAttribute('data-loc-input'));
    }
    function hintOf(el) {
        var h = el.parentNode && el.parentNode.querySelector('.loc-hint[data-for="' + el.id + '"]');
        if (!h) {
            h = document.createElement('div');
            h.className = 'loc-hint';
            h.setAttribute('data-for', el.id);
            h.style.cssText = 'font-size:11px;margin-top:2px;min-height:14px;';
            el.insertAdjacentElement('afterend', h);
        }
        return h;
    }
    function showHint(el) {
        var raw = el.value.trim(), f = window.formatLocationId(raw), h = hintOf(el);
        if (!raw) { h.textContent = ''; return; }
        var ok = window.isValidStorageLocation(f) || /^V-(SALES|TEMP|QC)$/.test(f);
        if (f !== raw.toUpperCase()) { h.textContent = '→ ' + f + (ok ? '' : '（格式不對）'); }
        else h.textContent = ok ? '' : '格式不對，例如 IA011 或 I-A-01-1F';
        h.style.color = ok ? '#34d399' : '#f87171';
    }
    function commit(el) {
        var f = window.formatLocationId(el.value);
        if (f && f !== el.value) {
            el.value = f;
            el.dispatchEvent(new Event('input', { bubbles: true }));
        }
        showHint(el);
    }
    document.addEventListener('input', function(e) { if (isLocInput(e.target)) showHint(e.target); }, true);
    document.addEventListener('change', function(e) { if (isLocInput(e.target)) commit(e.target); }, true);
    document.addEventListener('blur', function(e) { if (isLocInput(e.target)) commit(e.target); }, true);
    // 按 Enter 送出前先換成標準格式（捕獲階段，比欄位自己的 Enter 處理先執行）
    document.addEventListener('keydown', function(e) { if (e.key === 'Enter' && isLocInput(e.target)) commit(e.target); }, true);
})();

// ========== 用手機打開電腦版：提示切換到手機版（不強制；按「留在電腦版」就記住不再提示）==========
(function() {
    var isPhone = /Android.+Mobile|iPhone|iPod|Windows Phone/i.test(navigator.userAgent) ||
        (window.matchMedia && window.matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600);
    var stay = false;
    try { stay = localStorage.getItem('wms_stay_desktop') === '1'; } catch (e) {}
    if (!isPhone || stay || /[?&]desktop=1/.test(location.search)) return;
    function show() {
        if (document.getElementById('switch-mobile-bar')) return;
        var bar = document.createElement('div');
        bar.id = 'switch-mobile-bar';
        bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:100000;background:#16a34a;color:#fff;padding:12px 14px;display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;font-size:15px;box-shadow:0 2px 8px rgba(0,0,0,.4)';
        bar.innerHTML = '<span style="flex:1 1 100%">📱 你用的是手機，手機版按鈕大、可以用相機掃描</span>' +
            '<a href="m/" style="background:#fff;color:#166534;font-weight:bold;padding:8px 12px;border-radius:8px;text-decoration:none;white-space:nowrap">切換到手機版</a>' +
            '<button id="stay-desktop-btn" style="background:transparent;border:1px solid #bbf7d0;color:#fff;padding:7px 10px;border-radius:8px;white-space:nowrap">留在電腦版</button>';
        document.body.appendChild(bar);
        document.getElementById('stay-desktop-btn').onclick = function() {
            try { localStorage.setItem('wms_stay_desktop', '1'); } catch (e) {}
            bar.remove();
        };
    }
    if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
})();
