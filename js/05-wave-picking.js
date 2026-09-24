// ============================================================
// js/05-wave-picking.js — 波次揀貨、原料領用
// 由原 app.js 第 6895–8483 行拆出；各檔依 index.html 的順序載入，共用全域（window）
// ============================================================
        // ========== 波次揀貨系統 ==========

        window._waveData = {
            waves: [],
            currentWave: null,
            pickingList: [],
            completedItems: []
        };

        window.loadWavesFromFirebase = async function() {
            try {
                if (!window.db || !window.collection || !window.getDocs) {
                    console.log('Firebase 尚未初始化，使用 localStorage');
                    window._waveData.waves = JSON.parse(localStorage.getItem('wms_waves') || '[]');
                    refreshWaveList();
                    return;
                }

                var snapshot = await window.getDocs(window.collection(window.db, 'waves'));
                window._waveData.waves = [];
                snapshot.forEach(function(doc) {
                    window._waveData.waves.push({ id: doc.id, ...doc.data() });
                });

                window._waveData.waves.sort(function(a, b) {
                    return (b.createdAt || '').localeCompare(a.createdAt || '');
                });

                console.log('波次資料已載入:', window._waveData.waves.length, '筆');

                localStorage.setItem('wms_waves', JSON.stringify(window._waveData.waves));

                refreshWaveList();
            } catch(e) {
                console.error('載入波次資料失敗:', e);
                window._waveData.waves = JSON.parse(localStorage.getItem('wms_waves') || '[]');
                refreshWaveList();
            }
        };

        async function saveWaves() {
            localStorage.setItem('wms_waves', JSON.stringify(window._waveData.waves));
        }

        function generateWaveNo() {
            var today = new Date();
            var dateStr = today.getFullYear().toString().substr(2) +
                         String(today.getMonth() + 1).padStart(2, '0') +
                         String(today.getDate()).padStart(2, '0');
            var todayWaves = window._waveData.waves.filter(function(w) {
                return w.waveNo && w.waveNo.indexOf('W' + dateStr) === 0;
            });
            var seq = todayWaves.length + 1;
            return 'W' + dateStr + '-' + String(seq).padStart(3, '0');
        }

        window.waveCompany = '崇文';

        window.setWaveCompany = function(company) {
            window.waveCompany = company;

            document.getElementById('btn-wave-cw').className = company === '崇文'
                ? 'px-3 py-1.5 rounded text-xs font-bold bg-blue-600 text-white'
                : 'px-3 py-1.5 rounded text-xs font-bold bg-slate-700 text-slate-300 hover:bg-slate-600';
            document.getElementById('btn-wave-bf').className = company === '八方'
                ? 'px-3 py-1.5 rounded text-xs font-bold bg-purple-600 text-white'
                : 'px-3 py-1.5 rounded text-xs font-bold bg-slate-700 text-slate-300 hover:bg-slate-600';

            refreshWaveList();
        };

        window.rmCompany = 'all';
        window.rmStockData = [];
        window.rmStockSelected = {};
        window.rmStockFilter = 'all';
        
        // 原料領用購物車
        window.rmPickingCart = [];
        
        // 原料領用彈窗狀態
        window.rmModalState = {
            step: 1,
            allItems: [],
            selectedProduct: null,
            selectedSpec: null,
            selectedBatch: null,
            selectedLocation: null,
            selectedItem: null
        };
        
        // 原料領用彈窗購物車
        window.rmModalCart = [];

        // 更新步驟狀態（防呆機制）
        window.updateRmStepStatus = function() {
            var user = (document.getElementById('rm-pick-user').value || '').trim();
            var step1Complete = user.length > 0;
            
            // 更新步驟 1 面板狀態
            var step1Panel = document.getElementById('rm-step1-panel');
            if (step1Complete) {
                step1Panel.classList.remove('border-slate-600');
                step1Panel.classList.add('border-emerald-500/50');
            } else {
                step1Panel.classList.add('border-slate-600');
                step1Panel.classList.remove('border-emerald-500/50');
            }
            
            // 更新步驟 2 按鈕狀態
            var btn = document.getElementById('btn-open-rm-modal');
            var step2Panel = document.getElementById('rm-step2-panel');
            var step2Hint = document.getElementById('rm-step2-hint');
            
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
                    step2Hint.innerHTML = '<i class="fa-solid fa-lock mr-1"></i>請先填寫領用人';
                    step2Hint.classList.add('text-orange-400');
                    step2Hint.classList.remove('text-slate-500');
                }
            }
            
            // 更新確認按鈕
            var confirmBtn = document.getElementById('btn-rm-confirm-cart');
            if (confirmBtn) {
                confirmBtn.disabled = !(step1Complete && window.rmPickingCart.length > 0);
            }
        };

        // 設定公司篩選
        window.setRmCompany = function(filter) {
            window.rmStockFilter = filter;
            
            document.getElementById('btn-rm-all').className = filter === 'all'
                ? 'px-3 py-1 rounded text-xs font-bold bg-cyan-600 text-white'
                : 'px-3 py-1 rounded text-xs font-bold bg-slate-700 text-slate-300 hover:bg-slate-600';
            document.getElementById('btn-rm-cw').className = filter === '崇文'
                ? 'px-3 py-1 rounded text-xs font-bold bg-blue-600 text-white'
                : 'px-3 py-1 rounded text-xs font-bold bg-slate-700 text-slate-300 hover:bg-slate-600';
            document.getElementById('btn-rm-bf').className = filter === '八方'
                ? 'px-3 py-1 rounded text-xs font-bold bg-purple-600 text-white'
                : 'px-3 py-1 rounded text-xs font-bold bg-slate-700 text-slate-300 hover:bg-slate-600';
        };

        // 開啟原料領用品項選擇彈窗
        window.openRmProductModal = function() {
            var user = (document.getElementById('rm-pick-user').value || '').trim();
            if (!user) {
                alert('請先填寫領用人');
                return;
            }
            
            // 載入庫存資料
            var inventory = [];
            if (window.currentInventory && typeof window.currentInventory === 'function') {
                inventory = window.currentInventory() || [];
            } else if (window.currentPallets && typeof window.currentPallets === 'function') {
                inventory = window.currentPallets() || [];
            }
            
            // 根據篩選條件過濾
            var filter = window.rmStockFilter;
            var sourceData = inventory.filter(function(item) {
                if (!item.productName || (item.quantity || 0) <= 0) return false;
                if (filter !== 'all' && item.company !== filter) return false;
                // 品管留置、業務保留的貨不能領用（過期的可以，領去報廢；加入時會提醒）
                if (window.isHoldLocation && window.isHoldLocation(item.locationId)) return false;
                return true;
            });
            
            if (sourceData.length === 0) {
                alert('目前無可領用的品項');
                return;
            }
            
            window.rmModalState = {
                step: 1, allItems: sourceData,
                selectedProduct: null, selectedSpec: null, selectedBatch: null,
                selectedLocation: null, selectedItem: null
            };
            
            window.rmModalCart = [];
            renderRmModalCart();
            
            document.getElementById('modal-rm-product').classList.remove('hidden');
            document.getElementById('rm-modal-search').value = '';
            document.getElementById('rm-modal-search').placeholder = '搜尋品名...';
            
            updateRmModalSteps(1);
            renderRmModalStep1();
        };

        // 關閉彈窗
        window.closeRmProductModal = function() {
            document.getElementById('modal-rm-product').classList.add('hidden');
        };

        // 更新步驟指示器
        function updateRmModalSteps(currentStep) {
            var steps = ['1', '2', '3', '4', '5'];
            
            steps.forEach(function(s, idx) {
                var tag = document.getElementById('rm-step-tag-' + s);
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
            
            updateRmBreadcrumb();
            
            var backBtn = document.getElementById('rm-modal-back-btn');
            backBtn.classList.toggle('hidden', currentStep <= 1);
            
            window.rmModalState.step = currentStep;
        }

        // 更新麵包屑
        function updateRmBreadcrumb() {
            var state = window.rmModalState;
            var parts = [];
            
            if (state.selectedProduct) {
                parts.push('<span class="bg-blue-900/80 text-blue-300 px-1.5 py-0.5 rounded text-xs cursor-pointer hover:bg-blue-800" onclick="rmModalGoToStep(1)">' + escapeHtml(state.selectedProduct).substring(0, 10) + '</span>');
            }
            if (state.selectedSpec !== null) {
                parts.push('<i class="fa-solid fa-angle-right text-slate-600 text-[10px]"></i>');
                parts.push('<span class="bg-purple-900/80 text-purple-300 px-1.5 py-0.5 rounded text-xs cursor-pointer hover:bg-purple-800" onclick="rmModalGoToStep(2)">' + escapeHtml(state.selectedSpec || '無規格').substring(0, 8) + '</span>');
            }
            if (state.selectedBatch !== null) {
                parts.push('<i class="fa-solid fa-angle-right text-slate-600 text-[10px]"></i>');
                parts.push('<span class="bg-cyan-900/80 text-cyan-300 px-1.5 py-0.5 rounded text-xs cursor-pointer hover:bg-cyan-800" onclick="rmModalGoToStep(3)">' + escapeHtml(state.selectedBatch || '無批號').substring(0, 8) + '</span>');
            }
            if (state.selectedLocation) {
                parts.push('<i class="fa-solid fa-angle-right text-slate-600 text-[10px]"></i>');
                parts.push('<span class="bg-emerald-900/80 text-emerald-300 px-1.5 py-0.5 rounded text-xs">' + escapeHtml(state.selectedLocation) + '</span>');
            }
            
            var bcEl = document.getElementById('rm-bc-product');
            bcEl.innerHTML = parts.length > 0 ? parts.join('') : '<span class="text-slate-500 text-xs">選擇品項...</span>';
        }

        // 返回上一步
        window.rmModalGoBack = function() {
            var step = window.rmModalState.step;
            if (step > 1) {
                rmModalGoToStep(step - 1);
            }
        };

        // 跳到指定步驟
        window.rmModalGoToStep = function(step) {
            var state = window.rmModalState;
            document.getElementById('rm-modal-search').value = '';
            
            if (step === 1) {
                state.selectedProduct = null; state.selectedSpec = null;
                state.selectedBatch = null; state.selectedLocation = null; state.selectedItem = null;
                document.getElementById('rm-modal-search').placeholder = '搜尋品名...';
                updateRmModalSteps(1);
                renderRmModalStep1();
            } else if (step === 2 && state.selectedProduct) {
                state.selectedSpec = null; state.selectedBatch = null;
                state.selectedLocation = null; state.selectedItem = null;
                document.getElementById('rm-modal-search').placeholder = '搜尋規格...';
                updateRmModalSteps(2);
                renderRmModalStep2();
            } else if (step === 3 && state.selectedSpec !== null) {
                state.selectedBatch = null; state.selectedLocation = null; state.selectedItem = null;
                document.getElementById('rm-modal-search').placeholder = '搜尋批號...';
                updateRmModalSteps(3);
                renderRmModalStep3();
            } else if (step === 4 && state.selectedBatch !== null) {
                state.selectedLocation = null; state.selectedItem = null;
                document.getElementById('rm-modal-search').placeholder = '搜尋儲位...';
                updateRmModalSteps(4);
                renderRmModalStep4();
            }
        };

        // 過濾列表
        window.filterRmModalList = function() {
            var step = window.rmModalState.step;
            if (step === 1) renderRmModalStep1();
            else if (step === 2) renderRmModalStep2();
            else if (step === 3) renderRmModalStep3();
            else if (step === 4) renderRmModalStep4();
        };

        // Step 1: 選擇品名
        function renderRmModalStep1() {
            var keyword = (document.getElementById('rm-modal-search').value || '').trim().toLowerCase();
            var items = window.rmModalState.allItems;
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
            
            var listArea = document.getElementById('rm-modal-list-area');
            if (products.length === 0) {
                listArea.innerHTML = '<div class="text-center text-slate-500 py-8"><i class="fa-solid fa-inbox text-3xl mb-2"></i><div class="text-sm">無符合項目</div></div>';
                return;
            }
            
            var html = '<div class="space-y-1">';
            products.forEach(function(p) {
                html += '<div class="bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded px-3 py-2 cursor-pointer flex justify-between items-center" onclick="selectRmModalProduct(\'' + escapeHtml(p.name) + '\')">';
                html += '<span class="text-white text-sm font-medium truncate flex-1">' + escapeHtml(p.name) + '</span>';
                html += '<div class="flex items-center gap-2 ml-2"><span class="text-yellow-400 font-bold text-sm">' + p.totalQty + '</span><i class="fa-solid fa-chevron-right text-slate-500 text-xs"></i></div>';
                html += '</div>';
            });
            html += '</div>';
            listArea.innerHTML = html;
        }

        window.selectRmModalProduct = function(productName) {
            window.rmModalState.selectedProduct = productName;
            document.getElementById('rm-modal-search').value = '';
            document.getElementById('rm-modal-search').placeholder = '搜尋規格...';
            updateRmModalSteps(2);
            renderRmModalStep2();
        };

        // Step 2: 選擇規格
        function renderRmModalStep2() {
            var keyword = (document.getElementById('rm-modal-search').value || '').trim().toLowerCase();
            var items = window.rmModalState.allItems;
            var selectedProduct = window.rmModalState.selectedProduct;
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
            
            var listArea = document.getElementById('rm-modal-list-area');
            if (specs.length === 0) {
                listArea.innerHTML = '<div class="text-center text-slate-500 py-8"><i class="fa-solid fa-inbox text-3xl mb-2"></i><div class="text-sm">無符合項目</div></div>';
                return;
            }
            
            var html = '<div class="space-y-1">';
            specs.forEach(function(s) {
                var displaySpec = s.spec || '(無規格)';
                html += '<div class="bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded px-3 py-2 cursor-pointer flex justify-between items-center" onclick="selectRmModalSpec(\'' + escapeHtml(s.spec) + '\')">';
                html += '<span class="text-white text-sm font-medium truncate flex-1">' + escapeHtml(displaySpec) + '</span>';
                html += '<div class="flex items-center gap-2 ml-2"><span class="text-yellow-400 font-bold text-sm">' + s.totalQty + '</span><i class="fa-solid fa-chevron-right text-slate-500 text-xs"></i></div>';
                html += '</div>';
            });
            html += '</div>';
            listArea.innerHTML = html;
        }

        window.selectRmModalSpec = function(spec) {
            window.rmModalState.selectedSpec = spec;
            document.getElementById('rm-modal-search').value = '';
            document.getElementById('rm-modal-search').placeholder = '搜尋批號...';
            updateRmModalSteps(3);
            renderRmModalStep3();
        };

        // Step 3: 選擇批號
        function renderRmModalStep3() {
            var keyword = (document.getElementById('rm-modal-search').value || '').trim().toLowerCase();
            var items = window.rmModalState.allItems;
            var state = window.rmModalState;
            var batchMap = {};
            
            items.forEach(function(item) {
                if (item.productName !== state.selectedProduct) return;
                if ((item.spec || '') !== state.selectedSpec) return;
                var batch = item.batchNo || '';
                if (keyword && !batch.toLowerCase().includes(keyword)) return;
                var key = batch || '__empty__';
                var expDate = item.expiryDate;
                if (expDate && expDate.toDate) expDate = expDate.toDate();
                if (expDate && typeof expDate === 'object') expDate = expDate.toLocalYMD();
                
                if (!batchMap[key]) {
                    batchMap[key] = { batch: batch, expDate: expDate || '', count: 0, totalQty: 0, items: [] };
                }
                batchMap[key].count++;
                batchMap[key].totalQty += item.quantity || 0;
                batchMap[key].items.push(item);
            });
            
            var batches = Object.values(batchMap).sort(function(a, b) {
                if (a.expDate && b.expDate) return a.expDate.localeCompare(b.expDate);
                return a.batch.localeCompare(b.batch, 'zh-TW');
            });
            
            var listArea = document.getElementById('rm-modal-list-area');
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
                
                html += '<div class="bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded px-3 py-2 cursor-pointer" onclick="selectRmModalBatch(\'' + escapeHtml(b.batch) + '\')">';
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

        window.selectRmModalBatch = function(batch) {
            window.rmModalState.selectedBatch = batch;
            document.getElementById('rm-modal-search').value = '';
            document.getElementById('rm-modal-search').placeholder = '搜尋儲位...';
            updateRmModalSteps(4);
            renderRmModalStep4();
        };

        // Step 4: 選擇儲位
        function renderRmModalStep4() {
            var keyword = (document.getElementById('rm-modal-search').value || '').trim().toLowerCase();
            var state = window.rmModalState;
            
            var locations = state.allItems.filter(function(item) {
                if (item.productName !== state.selectedProduct) return false;
                if ((item.spec || '') !== state.selectedSpec) return false;
                if ((item.batchNo || '') !== state.selectedBatch) return false;
                if (keyword && !(item.locationId || '').toLowerCase().includes(keyword)) return false;
                return true;
            });
            
            var listArea = document.getElementById('rm-modal-list-area');
            if (locations.length === 0) {
                listArea.innerHTML = '<div class="text-center text-slate-500 py-8"><i class="fa-solid fa-inbox text-3xl mb-2"></i><div class="text-sm">無符合項目</div></div>';
                return;
            }
            
            var html = '<div class="grid grid-cols-3 gap-2">';
            locations.forEach(function(loc) {
                html += '<div class="bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded p-2 cursor-pointer text-center" onclick="selectRmModalLocation(\'' + escapeHtml(loc.id || '') + '\')">';
                html += '<div class="text-emerald-400 font-bold text-sm">' + escapeHtml(loc.locationId || '-') + '</div>';
                html += '<div class="text-yellow-400 font-bold">' + (loc.quantity || 0) + '</div>';
                html += '</div>';
            });
            html += '</div>';
            listArea.innerHTML = html;
        }

        window.selectRmModalLocation = function(itemId) {
            var state = window.rmModalState;
            var selectedItem = state.allItems.find(function(i) {
                return i.id === itemId &&
                       i.productName === state.selectedProduct &&
                       (i.spec || '') === state.selectedSpec &&
                       (i.batchNo || '') === state.selectedBatch;
            });
            if (selectedItem) {
                state.selectedLocation = selectedItem.locationId;
                state.selectedItem = selectedItem;
                updateRmModalSteps(5);
                renderRmModalStep5();
            }
        };

        // Step 5: 輸入數量
        function renderRmModalStep5() {
            var state = window.rmModalState;
            var item = state.selectedItem;
            if (!item) return;
            
            var maxQty = item.quantity || 0;
            var expDate = item.expiryDate;
            if (expDate && expDate.toDate) expDate = expDate.toDate();
            if (expDate && typeof expDate === 'object') expDate = expDate.toLocalYMD();
            
            var html = '<div class="max-w-sm mx-auto space-y-3">';
            
            // 品項摘要
            html += '<div class="bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm">';
            html += '<div class="text-white font-bold truncate">' + escapeHtml(state.selectedProduct) + '</div>';
            html += '<div class="text-slate-400 text-xs mt-1">' + escapeHtml(state.selectedSpec || '無規格') + ' | ' + escapeHtml(state.selectedBatch || '無批號') + '</div>';
            html += '<div class="text-emerald-400 text-xs mt-0.5"><i class="fa-solid fa-location-dot mr-1"></i>' + escapeHtml(state.selectedLocation) + '</div>';
            if (expDate) html += '<div class="text-yellow-400 text-xs mt-0.5"><i class="fa-solid fa-calendar mr-1"></i>效期: ' + expDate + '</div>';
            html += '<div class="flex justify-between items-center mt-2 pt-2 border-t border-slate-700">';
            html += '<span class="text-slate-400 text-xs">可領數量</span><span class="text-yellow-400 font-bold text-lg">' + maxQty + '</span>';
            html += '</div></div>';
            
            // 數量輸入
            html += '<div class="bg-cyan-900/30 border border-cyan-600/50 rounded-lg p-3">';
            html += '<div class="flex items-center gap-2">';
            html += '<button onclick="adjustRmQty(-10)" class="w-9 h-9 bg-slate-700 hover:bg-slate-600 text-white rounded font-bold text-sm">-10</button>';
            html += '<button onclick="adjustRmQty(-1)" class="w-9 h-9 bg-slate-700 hover:bg-slate-600 text-white rounded font-bold">-1</button>';
            html += '<input type="number" id="rm-modal-qty" class="flex-1 scan-input text-center text-xl font-bold h-10" value="' + maxQty + '" min="1" max="' + maxQty + '">';
            html += '<button onclick="adjustRmQty(1)" class="w-9 h-9 bg-slate-700 hover:bg-slate-600 text-white rounded font-bold">+1</button>';
            html += '<button onclick="adjustRmQty(10)" class="w-9 h-9 bg-slate-700 hover:bg-slate-600 text-white rounded font-bold text-sm">+10</button>';
            html += '</div>';
            html += '<div class="flex gap-2 mt-2">';
            html += '<button onclick="setRmQtyMax()" class="flex-1 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs font-bold">全部</button>';
            html += '<button onclick="setRmQtyHalf()" class="flex-1 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs font-bold">一半</button>';
            html += '</div></div>';
            
            // 按鈕
            html += '<button onclick="addToRmModalCart()" class="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-sm"><i class="fa-solid fa-cart-plus mr-1"></i>加入已選</button>';
            html += '<button onclick="rmModalGoToStep(1)" class="w-full py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs"><i class="fa-solid fa-plus mr-1"></i>繼續選擇其他品項</button>';
            html += '</div>';
            
            document.getElementById('rm-modal-list-area').innerHTML = html;
        }

        window.adjustRmQty = function(delta) {
            var input = document.getElementById('rm-modal-qty');
            var max = parseInt(input.max) || 9999;
            var newVal = Math.max(1, Math.min(max, (parseInt(input.value) || 0) + delta));
            input.value = newVal;
        };

        window.setRmQtyMax = function() {
            var input = document.getElementById('rm-modal-qty');
            input.value = input.max;
        };

        window.setRmQtyHalf = function() {
            var input = document.getElementById('rm-modal-qty');
            input.value = Math.ceil((parseInt(input.max) || 0) / 2);
        };

        // 加入彈窗購物車
        window.addToRmModalCart = function() {
            var state = window.rmModalState;
            var item = state.selectedItem;
            var qtyInput = document.getElementById('rm-modal-qty');
            var qty = parseInt(qtyInput.value) || 0;
            var maxQty = parseInt(qtyInput.max) || 0;
            
            if (qty <= 0) { alert('請輸入有效數量'); return; }
            // 同一板已經加過的件數也要算進去（分兩次加同一板，不能超過這板的數量）
            var already = window.rmModalCart.concat(window.rmPickingCart || []).filter(function(c) { return c.id === item.id; })
                .reduce(function(t, c) { return t + (parseFloat(c.quantity) || 0); }, 0);
            if (qty + already > maxQty) { alert('這板只有 ' + maxQty + ' 件' + (already ? '，已經選了 ' + already + ' 件，最多再加 ' + Math.max(0, maxQty - already) + ' 件' : '，數量不能超過 ' + maxQty)); return; }
            
            var expDate = window.normalizeDateValue(item.expiryDate || item.expDate);
            if (expDate && expDate < new Date().toLocalYMD() &&
                !confirm('⚠️ 這板已經過期（' + expDate + '）\n\n確定要領用嗎？（例如領去報廢）')) return;
            
            window.rmModalCart.push({
                id: item.id,
                productName: state.selectedProduct,
                spec: state.selectedSpec || '',
                batchNo: state.selectedBatch || '',
                expDate: expDate || '',
                locationId: state.selectedLocation || '',
                quantity: qty,
                maxQty: maxQty,
                company: item.company || '崇文',
                totalWeight: item.totalWeight || 0,
                sourceItem: item
            });
            
            renderRmModalCart();
            showNotification('✅ 已加入 ' + qty + ' 件', 'success');
            
            state.selectedProduct = null; state.selectedSpec = null;
            state.selectedBatch = null; state.selectedLocation = null; state.selectedItem = null;
            
            document.getElementById('rm-modal-search').value = '';
            document.getElementById('rm-modal-search').placeholder = '搜尋品名...';
            updateRmModalSteps(1);
            renderRmModalStep1();
        };

        // 渲染彈窗購物車
        function renderRmModalCart() {
            var cartList = document.getElementById('rm-modal-cart-list');
            var cartCount = document.getElementById('rm-modal-cart-count');
            var confirmBtn = document.getElementById('rm-modal-confirm-btn');
            
            cartCount.textContent = window.rmModalCart.length;
            
            if (window.rmModalCart.length === 0) {
                cartList.innerHTML = '<div class="text-center text-slate-500 py-6 text-xs"><i class="fa-solid fa-inbox text-xl mb-1 opacity-50"></i><div>尚未選擇</div></div>';
                confirmBtn.disabled = true;
                return;
            }
            
            confirmBtn.disabled = false;
            var totalQty = 0;
            
            var html = '<div class="space-y-1">';
            window.rmModalCart.forEach(function(item, idx) {
                totalQty += item.quantity;
                html += '<div class="bg-slate-800 border border-slate-700 rounded p-1.5 relative text-xs">';
                html += '<button onclick="removeFromRmModalCart(' + idx + ')" class="absolute -top-1 -right-1 w-4 h-4 bg-red-600 hover:bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center"><i class="fa-solid fa-times"></i></button>';
                html += '<div class="text-white font-bold truncate pr-3">' + escapeHtml(item.productName).substring(0, 12) + '</div>';
                html += '<div class="flex justify-between items-center mt-0.5">';
                html += '<span class="text-emerald-400 truncate">' + escapeHtml(item.locationId) + '</span>';
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

        window.removeFromRmModalCart = function(idx) {
            window.rmModalCart.splice(idx, 1);
            renderRmModalCart();
        };

        // 確認彈窗購物車，加入主清單
        window.confirmRmModalCart = function() {
            if (window.rmModalCart.length === 0) { alert('請先選擇品項'); return; }
            
            window.rmModalCart.forEach(function(item) {
                window.rmPickingCart.push(Object.assign({}, item));
            });
            
            renderRmCartDisplay();
            showNotification('✅ 已加入 ' + window.rmModalCart.length + ' 筆到領用清單', 'success');
            
            window.rmModalCart = [];
            closeRmProductModal();
            updateRmStepStatus();
        };

        // 渲染主頁面的領用清單
        function renderRmCartDisplay() {
            var cartDisplay = document.getElementById('rm-cart-display');
            var countDisplay = document.getElementById('rm-cart-count-display');
            var qtyDisplay = document.getElementById('rm-cart-qty-display');
            
            if (window.rmPickingCart.length === 0) {
                cartDisplay.innerHTML = '<div class="text-center text-slate-500 py-10"><i class="fa-solid fa-inbox text-4xl mb-3 opacity-50"></i><div>尚未選擇品項</div><div class="text-xs mt-1">點擊「選擇品項」開始添加</div></div>';
                countDisplay.textContent = '0';
                qtyDisplay.textContent = '0';
                return;
            }
            
            var totalQty = 0;
            var html = '<div class="space-y-2">';
            
            window.rmPickingCart.forEach(function(item, idx) {
                totalQty += item.quantity;
                var expClass = 'text-slate-400';
                if (item.expDate) {
                    var days = Math.floor((new Date(item.expDate) - new Date()) / 86400000);
                    if (days < 0) expClass = 'text-red-400';
                    else if (days < 30) expClass = 'text-orange-400';
                    else if (days < 90) expClass = 'text-yellow-400';
                }
                
                html += '<div class="bg-slate-800 border border-slate-700 rounded-lg p-3 relative">';
                html += '<button onclick="removeFromRmCart(' + idx + ')" class="absolute top-2 right-2 w-6 h-6 bg-red-600/80 hover:bg-red-500 text-white rounded-full text-xs flex items-center justify-center"><i class="fa-solid fa-times"></i></button>';
                html += '<div class="flex items-start gap-3">';
                html += '<div class="flex-1">';
                html += '<div class="text-white font-bold">' + escapeHtml(item.productName) + '</div>';
                html += '<div class="text-slate-400 text-xs mt-1">' + escapeHtml(item.spec || '無規格') + ' | 批號: ' + escapeHtml(item.batchNo || '無') + '</div>';
                html += '<div class="flex items-center gap-3 mt-1 text-xs">';
                html += '<span class="text-emerald-400"><i class="fa-solid fa-location-dot mr-1"></i>' + escapeHtml(item.locationId) + '</span>';
                if (item.expDate) html += '<span class="' + expClass + '"><i class="fa-solid fa-calendar mr-1"></i>' + item.expDate + '</span>';
                html += '</div>';
                html += '</div>';
                html += '<div class="text-right">';
                html += '<div class="text-yellow-400 font-bold text-xl">' + item.quantity + '</div>';
                html += '<div class="text-slate-500 text-xs">件</div>';
                html += '</div>';
                html += '</div></div>';
            });
            html += '</div>';
            
            cartDisplay.innerHTML = html;
            countDisplay.textContent = window.rmPickingCart.length;
            qtyDisplay.textContent = totalQty;
        }

        window.removeFromRmCart = function(idx) {
            window.rmPickingCart.splice(idx, 1);
            renderRmCartDisplay();
            updateRmStepStatus();
        };

        window.clearRmCart = function() {
            if (window.rmPickingCart.length === 0) return;
            if (!confirm('確定要清空領用清單嗎？')) return;
            window.rmPickingCart = [];
            renderRmCartDisplay();
            updateRmStepStatus();
        };

        // 從購物車確認領料
        window.confirmRmPickingFromCart = function() {
            var user = (document.getElementById('rm-pick-user').value || '').trim();
            if (!user) { alert('請填寫領用人'); return; }
            if (window.rmPickingCart.length === 0) { alert('請選擇領用品項'); return; }
            
            // 轉換為舊格式，複用既有的確認邏輯
            window.rmStockSelected = {};
            var over = [];
            window.rmPickingCart.forEach(function(item) {
                var key = 'rm_' + item.id;
                // 同一板分兩次加入：數量加總（不能只留最後一筆，否則印出來 15 件、實際只扣 5 件）
                if (window.rmStockSelected[key]) {
                    window.rmStockSelected[key].qty += item.quantity;
                    if (window.rmStockSelected[key].qty > item.maxQty) over.push(item.locationId + ' ' + item.productName);
                    return;
                }
                window.rmStockSelected[key] = {
                    item: {
                        id: item.id,
                        company: item.company,
                        productName: item.productName,
                        spec: item.spec,
                        batchNo: item.batchNo,
                        locationId: item.locationId,
                        quantity: item.maxQty,
                        availableQty: item.maxQty,
                        totalWeight: item.totalWeight,
                        expDate: item.expDate
                    },
                    qty: item.quantity
                };
            });
            
            if (over.length) { alert('以下棧板領用數量超過庫存，請調整：\n' + over.join('\n')); return; }
            // 呼叫既有的確認函數
            confirmRmPickingNew();
        };

        // 列印領料單（從購物車）
        window.printRmPickingListFromCart = function() {
            if (window.rmPickingCart.length === 0) {
                alert('請先選擇領用品項');
                return;
            }
            
            // 轉換為舊格式
            window.rmStockSelected = {};
            var over = [];
            window.rmPickingCart.forEach(function(item) {
                var key = 'rm_' + item.id;
                // 同一板分兩次加入：數量加總（不能只留最後一筆，否則印出來 15 件、實際只扣 5 件）
                if (window.rmStockSelected[key]) {
                    window.rmStockSelected[key].qty += item.quantity;
                    if (window.rmStockSelected[key].qty > item.maxQty) over.push(item.locationId + ' ' + item.productName);
                    return;
                }
                window.rmStockSelected[key] = {
                    item: {
                        id: item.id,
                        company: item.company,
                        productName: item.productName,
                        spec: item.spec,
                        batchNo: item.batchNo,
                        locationId: item.locationId,
                        quantity: item.maxQty,
                        totalWeight: item.totalWeight,
                        expDate: item.expDate
                    },
                    qty: item.quantity
                };
            });
            
            printRmPickingList();
        };

        // 載入原料庫存資料（全部庫存）
        window.loadRmStockData = function() {
            var inventory = [];
            
            // 優先使用 currentInventory，否則使用 currentPallets
            if (window.currentInventory && typeof window.currentInventory === 'function') {
                inventory = window.currentInventory() || [];
            } else if (window.currentPallets && typeof window.currentPallets === 'function') {
                inventory = window.currentPallets() || [];
            }
            
            // 如果還沒有資料，等一下再試
            if (inventory.length === 0) {
                var tbody = document.getElementById('rm-stock-tbody');
                if (tbody) {
                    tbody.innerHTML = '<tr><td colspan="11" class="text-center text-slate-500 py-10"><i class="fa-solid fa-spinner fa-spin text-3xl mb-2"></i><br>正在載入庫存資料...</td></tr>';
                }
                setTimeout(loadRmStockData, 500);
                return;
            }
            
            // 建立寄庫對照表
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
            
            window.rmStockData = [];
            
            inventory.forEach(function(item) {
                if (!item.productName || (item.quantity || 0) <= 0) return;
                
                var locationId = item.locationId || '';
                var consignInfo = consignmentByLocation[locationId] || { qty: 0, customers: [] };
                var consignedQty = consignInfo.qty;
                var availableQty = Math.max(0, item.quantity - consignedQty);
                
                // 效期處理
                var expDate = '';
                var daysRemaining = 999;
                if (item.expiryDate) {
                    var exp = item.expiryDate.toDate ? item.expiryDate.toDate() : new Date(item.expiryDate);
                    expDate = exp.toLocaleDateString('zh-TW');
                    daysRemaining = Math.ceil((exp - new Date()) / (1000 * 60 * 60 * 24));
                }
                
                var uniqueKey = 'rm_' + item.id;
                
                window.rmStockData.push({
                    id: item.id,
                    key: uniqueKey,
                    company: item.company || '崇文',
                    productName: item.productName,
                    spec: item.spec || '',
                    batchNo: item.batchNo || '',
                    locationId: locationId,
                    quantity: item.quantity || 0,
                    consignedQty: consignedQty,
                    consignCustomers: consignInfo.customers,
                    availableQty: availableQty,
                    expDate: expDate,
                    daysRemaining: daysRemaining,
                    totalWeight: item.totalWeight || 0
                });
            });
            
            // 排序：效期近的優先，同效期按品名
            window.rmStockData.sort(function(a, b) {
                if (a.daysRemaining !== b.daysRemaining) return a.daysRemaining - b.daysRemaining;
                return (a.productName || '').localeCompare(b.productName || '', 'zh-TW');
            });
            
            renderRmStockTable();
        };

        // 篩選原料庫存（全部/崇文/八方）
        window.filterRmStock = function(filter) {
            window.rmStockFilter = filter;
            
            document.getElementById('btn-rm-all').className = filter === 'all'
                ? 'px-3 py-1 rounded text-xs font-bold bg-cyan-600 text-white'
                : 'px-3 py-1 rounded text-xs font-bold bg-slate-700 text-slate-300 hover:bg-slate-600';
            document.getElementById('btn-rm-cw').className = filter === '崇文'
                ? 'px-3 py-1 rounded text-xs font-bold bg-blue-600 text-white'
                : 'px-3 py-1 rounded text-xs font-bold bg-slate-700 text-slate-300 hover:bg-slate-600';
            document.getElementById('btn-rm-bf').className = filter === '八方'
                ? 'px-3 py-1 rounded text-xs font-bold bg-purple-600 text-white'
                : 'px-3 py-1 rounded text-xs font-bold bg-slate-700 text-slate-300 hover:bg-slate-600';
            
            renderRmStockTable();
        };

        // 渲染原料庫存表格
        window.renderRmStockTable = function() {
            var tbody = document.getElementById('rm-stock-tbody');
            if (!tbody) return;
            
            var search = (document.getElementById('rm-stock-search')?.value || '').toLowerCase();
            var filter = window.rmStockFilter || 'all';
            
            var filtered = window.rmStockData.filter(function(item) {
                // 公司篩選
                if (filter !== 'all' && item.company !== filter) return false;
                
                // 搜尋篩選
                if (search) {
                    var match = (item.productName || '').toLowerCase().indexOf(search) >= 0 ||
                                (item.spec || '').toLowerCase().indexOf(search) >= 0 ||
                                (item.batchNo || '').toLowerCase().indexOf(search) >= 0 ||
                                (item.locationId || '').toLowerCase().indexOf(search) >= 0 ||
                                (item.company || '').toLowerCase().indexOf(search) >= 0;
                    if (!match) return false;
                }
                return true;
            });
            
            if (filtered.length === 0) {
                tbody.innerHTML = '<tr><td colspan="11" class="text-center text-slate-500 py-10"><i class="fa-solid fa-inbox text-3xl mb-2"></i><br>無符合條件的庫存</td></tr>';
                return;
            }
            
            var html = '';
            filtered.forEach(function(item) {
                var isSelected = window.rmStockSelected[item.key];
                var selectedQty = isSelected ? isSelected.qty : 0;
                var hasConsign = item.consignedQty > 0;
                var isExpiring = item.daysRemaining <= 30;
                var isExpired = item.daysRemaining < 0;
                
                var rowClass = 'border-b border-slate-800 hover:bg-slate-800';
                if (hasConsign) rowClass += ' bg-amber-900/20';
                if (isSelected) rowClass += ' bg-cyan-900/30';
                
                var expClass = 'text-slate-400';
                if (isExpired) expClass = 'text-red-400 font-bold';
                else if (isExpiring) expClass = 'text-yellow-400';
                
                html += '<tr class="' + rowClass + '">';
                
                // 勾選
                html += '<td class="p-2 text-center">';
                html += '<input type="checkbox" class="rm-item-checkbox w-5 h-5" data-key="' + item.key + '" ';
                html += (isSelected ? 'checked' : '') + ' ';
                html += (item.availableQty <= 0 ? 'disabled' : '') + ' ';
                html += 'onchange="toggleRmItem(\'' + item.key + '\', this.checked)">';
                html += '</td>';
                
                // 公司
                var companyClass = item.company === '八方' ? 'text-purple-400' : 'text-blue-400';
                html += '<td class="p-2 ' + companyClass + ' font-bold">' + item.company + '</td>';
                
                // 品名
                html += '<td class="p-2 text-white font-bold">' + item.productName + '</td>';
                
                // 規格
                html += '<td class="p-2 text-yellow-400">' + (item.spec || '-') + '</td>';
                
                // 批號
                html += '<td class="p-2 text-slate-400 font-mono text-xs">' + (item.batchNo || '-') + '</td>';
                
                // 數量
                html += '<td class="p-2 text-right text-white">' + item.quantity + '</td>';
                
                // 重量
                var weightDisplay = item.totalWeight > 0 ? item.totalWeight + ' kg' : '-';
                html += '<td class="p-2 text-right text-slate-400">' + weightDisplay + '</td>';
                
                // 位置
                html += '<td class="p-2 text-cyan-400 font-mono">' + item.locationId + '</td>';
                
                // 效期
                html += '<td class="p-2 ' + expClass + '">';
                html += item.expDate || '-';
                if (isExpired) html += ' <span class="text-[10px]">(過期)</span>';
                else if (isExpiring) html += ' <span class="text-[10px]">(' + item.daysRemaining + '天)</span>';
                html += '</td>';
                
                // 寄庫客戶（含可領數量）
                if (hasConsign) {
                    html += '<td class="p-2">';
                    html += '<span class="text-amber-400">' + item.consignCustomers.join(',') + '</span>';
                    html += '<br><span class="text-green-400 text-xs">可領 ' + item.availableQty + '</span>';
                    html += '</td>';
                } else {
                    html += '<td class="p-2 text-slate-600">-</td>';
                }
                
                // 領用數量
                html += '<td class="p-2 text-center">';
                if (item.availableQty > 0) {
                    html += '<input type="number" class="scan-input w-20 text-center font-bold ' + (hasConsign ? 'border-amber-500/50' : '') + '" ';
                    html += 'data-key="' + item.key + '" ';
                    html += 'value="' + selectedQty + '" ';
                    html += 'min="0" max="' + item.availableQty + '" ';
                    html += 'onchange="updateRmItemQty(\'' + item.key + '\', this.value)" ';
                    html += 'onfocus="this.select()">';
                } else {
                    html += '<span class="text-slate-600">-</span>';
                }
                html += '</td>';
                
                html += '</tr>';
            });
            
            tbody.innerHTML = html;
        };

        // 全選/取消全選
        window.toggleRmAll = function(checked) {
            window.rmStockData.forEach(function(item) {
                if (item.availableQty <= 0) return;
                if (checked) {
                    window.rmStockSelected[item.key] = { item: item, qty: item.availableQty };
                } else {
                    delete window.rmStockSelected[item.key];
                }
            });
            renderRmStockTable();
            updateRmSelectionStats();
        };

        // 單項勾選
        window.toggleRmItem = function(key, checked) {
            var item = window.rmStockData.find(function(d) { return d.key === key; });
            if (!item) return;
            
            if (checked) {
                var currentQty = window.rmStockSelected[key] ? window.rmStockSelected[key].qty : item.availableQty;
                window.rmStockSelected[key] = { item: item, qty: currentQty || item.availableQty };
            } else {
                delete window.rmStockSelected[key];
            }
            renderRmStockTable();
            updateRmSelectionStats();
        };

        // 更新單項數量
        window.updateRmItemQty = function(key, qty) {
            var item = window.rmStockData.find(function(d) { return d.key === key; });
            if (!item) return;
            
            qty = parseInt(qty) || 0;
            if (qty > item.availableQty) {
                qty = item.availableQty;
                showNotification('⚠️ 最多可領 ' + item.availableQty + ' 件' + (item.consignedQty > 0 ? '（有寄庫）' : ''), 'warning');
            }
            
            if (qty > 0) {
                window.rmStockSelected[key] = { item: item, qty: qty };
                // 自動勾選
                var checkbox = document.querySelector('.rm-item-checkbox[data-key="' + key + '"]');
                if (checkbox) checkbox.checked = true;
            } else {
                delete window.rmStockSelected[key];
                var checkbox = document.querySelector('.rm-item-checkbox[data-key="' + key + '"]');
                if (checkbox) checkbox.checked = false;
            }
            
            updateRmSelectionStats();
        };

        // 更新選擇統計
        window.updateRmSelectionStats = function() {
            var keys = Object.keys(window.rmStockSelected);
            var totalQty = 0;
            keys.forEach(function(key) {
                totalQty += window.rmStockSelected[key].qty || 0;
            });
            
            document.getElementById('rm-selected-count').innerText = keys.length;
            document.getElementById('rm-selected-qty').innerText = totalQty;
            document.getElementById('rm-selected-total').innerText = totalQty;
            
            var btn = document.getElementById('btn-rm-confirm');
            if (btn) btn.disabled = keys.length === 0;
        };

        // 保存領用資訊的全域變數
        window.rmPickingInfo = { user: '', dept: '', note: '' };

        // 確認領料（新版）
        window.confirmRmPickingNew = function() {
            var user = document.getElementById('rm-pick-user')?.value.trim();
            if (!user) {
                alert('請輸入領用人');
                document.getElementById('rm-pick-user')?.focus();
                return;
            }
            
            var dept = document.getElementById('rm-pick-dept')?.value || '';
            var note = document.getElementById('rm-pick-note')?.value || '';
            
            // 保存到全域變數
            window.rmPickingInfo = { user: user, dept: dept, note: note };
            var keys = Object.keys(window.rmStockSelected);
            if (keys.length === 0) {
                alert('請選擇要領用的品項');
                return;
            }
            
            // 建立確認清單
            var html = '<div class="space-y-3 max-h-96 overflow-auto">';
            var totalQty = 0;
            
            keys.forEach(function(key, idx) {
                var sel = window.rmStockSelected[key];
                var item = sel.item;
                totalQty += sel.qty;
                
                var hasConsign = item.consignedQty > 0;
                var companyClass = item.company === '八方' ? 'text-purple-400' : 'text-blue-400';
                
                html += '<div class="bg-slate-800 rounded-lg p-3 ' + (hasConsign ? 'border border-amber-500/50' : '') + '">';
                html += '<div class="flex justify-between items-start">';
                html += '<div>';
                html += '<span class="' + companyClass + ' text-xs font-bold mr-2">[' + item.company + ']</span>';
                html += '<span class="text-white font-bold">' + item.productName + '</span>';
                html += '<div class="text-slate-400 text-sm">' + (item.spec || '-') + ' | ' + (item.batchNo || '-') + '</div>';
                if (item.expDate && item.expDate < new Date().toLocalYMD()) {
                    html += '<div class="text-red-400 text-xs mt-1 font-bold">⚠️ 已過期（' + item.expDate + '）</div>';
                }
                if (hasConsign) {
                    html += '<div class="text-amber-400 text-xs mt-1">⚠️ 寄庫 ' + item.consignedQty + ' 件（' + item.consignCustomers.join(',') + '）</div>';
                }
                html += '</div>';
                html += '<div class="text-right">';
                html += '<div class="text-cyan-400 font-mono">' + item.locationId + '</div>';
                html += '<div class="text-yellow-400 font-bold text-xl">' + sel.qty + ' 件</div>';
                if (sel.qty < item.quantity) {
                    html += '<div class="text-slate-500 text-xs">餘 ' + (item.quantity - sel.qty) + ' 件</div>';
                }
                html += '</div>';
                html += '</div>';
                html += '</div>';
            });
            
            html += '</div>';
            
            html += '<div class="mt-4 p-3 bg-slate-900 rounded-lg">';
            html += '<div class="grid grid-cols-3 gap-3 text-sm">';
            html += '<div><span class="text-slate-500">領用人：</span><span class="text-white">' + user + '</span></div>';
            html += '<div><span class="text-slate-500">單位：</span><span class="text-white">' + (dept || '-') + '</span></div>';
            html += '<div><span class="text-slate-500">備註：</span><span class="text-white">' + (note || '-') + '</span></div>';
            html += '</div>';
            html += '<div class="mt-2 pt-2 border-t border-slate-700 flex justify-between">';
            html += '<span class="text-slate-400">共 ' + keys.length + ' 筆</span>';
            html += '<span class="text-yellow-400 font-bold text-lg">總計 ' + totalQty + ' 件</span>';
            html += '</div>';
            html += '</div>';
            
            WMS.createModal('rm-confirm-modal', {
                title: '確認原料領用',
                icon: 'fa-solid fa-clipboard-check text-emerald-400',
                content: html,
                width: '600px',
                footer: `
                    <button onclick="WMS.closeModal('rm-confirm-modal')" class="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded">取消</button>
                    <button onclick="executeRmPicking()" class="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold">
                        <i class="fa-solid fa-check mr-1"></i>確認出庫
                    </button>
                `
            });
        };

        // 執行原料領用出庫
        var _rmPosting = false;
        window.executeRmPicking = async function() {
            if (_rmPosting) return;   // 連按兩次「確認出庫」不會扣兩次
            _rmPosting = true;
            try { await doExecuteRmPicking(); } finally { _rmPosting = false; }
        };
        async function doExecuteRmPicking() {
            // 使用保存的領用資訊
            var info = window.rmPickingInfo || {};
            var user = info.user || '';
            var dept = info.dept || '';
            var note = info.note || '';
            var keys = Object.keys(window.rmStockSelected);
            
            try {
                var totalQty = 0;
                var count = 0;
                var changes = [];
                var picks = [];

                keys.forEach(function(key) {
                    var sel = window.rmStockSelected[key];
                    var pickQty = parseFloat(sel.qty) || 0;
                    if (pickQty <= 0) return;
                    var ref = window.doc(window.db, 'pallets', sel.item.id);
                    changes.push({ ref: ref, delta: -pickQty, deleteWhenEmpty: true, label: sel.item.palletId || sel.item.productName });
                    picks.push({ ref: ref, pickQty: pickQty });
                    count++;
                    totalQty += pickQty;
                });

                // 全部品項在同一個交易裡扣帳：任何一板庫存不足就整筆取消
                await window.runStockTransaction({
                    changes: changes,
                    logs: function(results) {
                        return picks.map(function(pk) {
                            var item = results[pk.ref.path].data;
                            return {
                                type: 'picking-rm',
                                company: item.company || '崇文',
                                productName: item.productName,
                                spec: item.spec,
                                batchNo: item.batchNo,
                                quantity: -pk.pickQty,
                                quantityChange: -pk.pickQty,
                                locationId: item.locationId,
                                palletId: item.palletId || '',
                                note: '原料領用 - ' + user + (dept ? ' (' + dept + ')' : '') + (note ? ' - ' + note : ''),
                                operator: user
                            };
                        });
                    }
                });

                WMS.closeModal('rm-confirm-modal');
                showNotification('✅ 原料領用完成！共 ' + count + ' 筆 ' + totalQty + ' 件，正在列印...', 'success');
                
                // 先列印領料單（需要用到 rmStockSelected 資料）
                printRmPickingList();
                
                // 列印後清空選擇
                window.rmStockSelected = {};
                window.rmPickingCart = [];
                window.rmPickingInfo = { user: '', dept: '', note: '' };
                document.getElementById('rm-pick-user').value = '';
                document.getElementById('rm-pick-dept').value = '';
                document.getElementById('rm-pick-note').value = '';
                
                // 更新顯示
                renderRmCartDisplay();
                updateRmStepStatus();
                
                // 重新載入
                setTimeout(loadRmStockData, 500);
                
            } catch (e) {
                console.error('原料領用失敗:', e);
                alert('❌ 原料領用失敗：' + e.message);
            }
        };

        // 列印領料單
        window.printRmPickingList = function() {
            var keys = Object.keys(window.rmStockSelected);
            if (keys.length === 0) {
                alert('請先選擇要領用的品項');
                return;
            }
            
            // 使用保存的領用資訊
            var info = window.rmPickingInfo || {};
            var user = info.user || document.getElementById('rm-pick-user')?.value || '';
            var dept = info.dept || document.getElementById('rm-pick-dept')?.value || '';
            
            var html = '<html><head><title>原料領用單</title><style>';
            html += 'body { font-family: sans-serif; padding: 20px; }';
            html += 'h1 { text-align: center; margin-bottom: 10px; }';
            html += '.info { margin-bottom: 15px; }';
            html += 'table { width: 100%; border-collapse: collapse; }';
            html += 'th, td { border: 1px solid #333; padding: 8px; text-align: left; }';
            html += 'th { background: #eee; }';
            html += '.right { text-align: right; }';
            html += '.sign { margin-top: 40px; display: flex; justify-content: space-around; }';
            html += '.sign div { width: 150px; border-top: 1px solid #333; text-align: center; padding-top: 5px; }';
            html += '</style></head><body>';
            
            html += '<h1>原料領用單</h1>';
            html += '<div class="info">';
            html += '<div>領用人：' + (user || '___') + ' | 單位：' + (dept || '___') + '</div>';
            html += '<div>日期：' + new Date().toLocaleString('zh-TW') + '</div>';
            html += '</div>';
            
            html += '<table><thead><tr>';
            html += '<th>公司</th><th>品名</th><th>規格</th><th>批號</th><th>儲位</th><th class="right">領用數量</th>';
            html += '</tr></thead><tbody>';
            
            var total = 0;
            keys.forEach(function(key) {
                var sel = window.rmStockSelected[key];
                var item = sel.item;
                total += sel.qty;
                html += '<tr>';
                html += '<td>' + (item.company || '崇文') + '</td>';
                html += '<td>' + item.productName + '</td>';
                html += '<td>' + (item.spec || '-') + '</td>';
                html += '<td>' + (item.batchNo || '-') + '</td>';
                html += '<td>' + item.locationId + '</td>';
                html += '<td class="right">' + sel.qty + '</td>';
                html += '</tr>';
            });
            
            html += '<tr><td colspan="5" style="text-align:right;font-weight:bold;">合計</td>';
            html += '<td class="right" style="font-weight:bold;">' + total + ' 件</td></tr>';
            html += '</tbody></table>';
            
            html += '<div class="sign">';
            html += '<div>領用人</div>';
            html += '<div>倉管</div>';
            html += '<div>主管</div>';
            html += '</div>';
            
            html += '</body></html>';
            
            var win = window.open('', '_blank');
            win.document.write(html);
            win.document.close();
            win.print();
        };

        window.refreshWaveList = function() {
            var tbody = document.getElementById('wave-list-body');
            if (!tbody) return;

            var waves = window._waveData.waves;

            var today = new Date().toLocalYMD();
            var todayWaves = waves.filter(function(w) { return w.createdAt && w.createdAt.indexOf(today) === 0; });
            var pending = waves.filter(function(w) { return w.status === 'pending'; });
            var picking = waves.filter(function(w) { return w.status === 'picking'; });
            var done = waves.filter(function(w) { return w.status === 'done'; });

            document.getElementById('wave-stat-today').innerText = todayWaves.length;
            document.getElementById('wave-stat-pending').innerText = pending.length;
            document.getElementById('wave-stat-picking').innerText = picking.length;
            document.getElementById('wave-stat-done').innerText = done.length;

            var orders = (window._orderData && window._orderData.orders) ? window._orderData.orders.filter(window.orderWaveable) : [];
            document.getElementById('wave-stat-orders').innerText = orders.length;

            if (waves.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" class="text-center text-slate-500 py-8">尚無波次資料</td></tr>';
                return;
            }

            var sorted = waves.slice().sort(function(a, b) {
                return new Date(b.createdAt) - new Date(a.createdAt);
            });

            var html = '';
            sorted.forEach(function(wave) {
                var statusBadge = '';
                var progressInfo = '';
                var timeInfo = '';

                if (wave.status === 'pending') {
                    statusBadge = '<span class="badge badge-yellow"><i class="fa-solid fa-clock mr-1"></i>待揀貨</span>';
                } else if (wave.status === 'picking') {
                    statusBadge = '<span class="badge badge-blue"><i class="fa-solid fa-spinner fa-spin mr-1"></i>揀貨中</span>';
                    if (wave.startedAt) {
                        var mins = Math.round((new Date() - new Date(wave.startedAt)) / 60000);
                        timeInfo = '<div class="text-xs text-orange-400">已進行 ' + mins + ' 分鐘</div>';
                    }
                } else if (wave.status === 'sorting') {
                    statusBadge = '<span class="badge badge-purple"><i class="fa-solid fa-tags mr-1"></i>待分貨</span>';
                } else if (wave.status === 'done') {
                    statusBadge = '<span class="badge badge-green"><i class="fa-solid fa-check mr-1"></i>已出貨</span>';
                    if (wave.completedAt && wave.createdAt) {
                        var mins = Math.round((new Date(wave.completedAt) - new Date(wave.createdAt)) / 60000);
                        timeInfo = '<div class="text-xs text-slate-500">耗時 ' + mins + ' 分鐘</div>';
                    }
                }

                var hasChanges = wave.hasOrderChanges;
                var rowClass = hasChanges ? 'bg-orange-900/20 border-l-4 border-l-orange-500' : '';
                html += '<tr class="hover:bg-slate-800/50 border-b border-slate-700/50 ' + rowClass + '">';
                html += '<td class="p-3 font-mono text-cyan-400 font-bold">' + wave.waveNo;
                if (hasChanges) {
                    html += ' <span class="text-orange-400 text-xs" title="訂單有異動"><i class="fa-solid fa-triangle-exclamation"></i></span>';
                }
                html += '</td>';
                html += '<td class="p-3 text-white">' + (wave.logistics || '混合') + '</td>';
                html += '<td class="p-3">' + statusBadge + '</td>';
                html += '<td class="p-3 text-right text-slate-300">' + (wave.orders ? wave.orders.length : 0) + '</td>';
                html += '<td class="p-3 text-right text-slate-300">' + (wave.itemCount || 0) + ' 項</td>';
                html += '<td class="p-3 text-right text-yellow-400 font-bold">' + (wave.totalQty || 0) + ' <span class="text-xs text-slate-400 font-normal">件</span></td>';
                html += '<td class="p-3 text-slate-400 text-xs">' + new Date(wave.createdAt).toLocaleString('zh-TW') + '</td>';
                html += '<td class="p-3 text-center">';
                if (wave.status === 'pending') {
                    html += '<button onclick="openWaveExecute(\'' + wave.waveNo + '\')" class="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1 rounded mr-1"><i class="fa-solid fa-play mr-1"></i>開始揀貨</button>';
                    html += '<button onclick="openAddToWaveModal(\'' + wave.waveNo + '\')" class="bg-purple-600 hover:bg-purple-500 text-white text-xs px-2 py-1 rounded mr-1" title="追加訂單"><i class="fa-solid fa-plus"></i></button>';
                } else if (wave.status === 'picking') {
                    html += '<button onclick="openWaveExecute(\'' + wave.waveNo + '\')" class="bg-orange-600 hover:bg-orange-500 text-white text-xs px-3 py-1 rounded mr-1"><i class="fa-solid fa-spinner fa-spin mr-1"></i>繼續揀貨</button>';
                } else if (wave.status === 'sorting') {
                    html += '<button onclick="openWaveSorting(\'' + wave.waveNo + '\')" class="bg-purple-600 hover:bg-purple-500 text-white text-xs px-3 py-1 rounded mr-1"><i class="fa-solid fa-tags mr-1"></i>分貨作業</button>';
                }
                html += '<button onclick="viewWaveDetail(\'' + wave.waveNo + '\')" class="bg-slate-600 hover:bg-slate-500 text-white text-xs px-2 py-1 rounded mr-1" title="檢視明細"><i class="fa-solid fa-eye"></i></button>';
                if (wave.status === 'pending') {
                    html += '<button onclick="deleteWave(\'' + wave.waveNo + '\')" class="bg-red-600 hover:bg-red-500 text-white text-xs px-2 py-1 rounded" title="刪除波次"><i class="fa-solid fa-trash"></i></button>';
                }
                if (wave.status === 'done') {
                    html += '<button onclick="printWaveLabels(\'' + wave.waveNo + '\')" class="bg-slate-600 hover:bg-slate-500 text-white text-xs px-2 py-1 rounded" title="重印標籤"><i class="fa-solid fa-print"></i></button>';
                }
                html += '</td>';
                html += '</tr>';
            });

            tbody.innerHTML = html;

        checkWaveChangeAlert();
        };

function checkWaveChangeAlert() {
    var changedWaves = (window._waveData.waves || []).filter(function(w) { return w.hasOrderChanges; });
    var existingAlert = document.getElementById('wave-change-alert-bar');

    if (changedWaves.length > 0) {
        var waveNos = changedWaves.map(function(w) { return w.waveNo; }).join(', ');

        if (!existingAlert) {
            var alertBar = document.createElement('div');
            alertBar.id = 'wave-change-alert-bar';
            alertBar.className = 'fixed top-0 left-0 right-0 z-[100] bg-gradient-to-r from-red-600 to-orange-600 text-white py-3 px-4 flex items-center justify-between shadow-lg';
            alertBar.innerHTML = '<div class="flex items-center gap-3">' +
                '<i class="fa-solid fa-triangle-exclamation text-2xl animate-pulse"></i>' +
                '<div>' +
                '<span class="font-bold">⚠️ 有 ' + changedWaves.length + ' 個波次需要更新揀貨單！</span>' +
                '<span class="ml-2 text-red-200">(' + waveNos + ')</span>' +
                '</div>' +
                '</div>' +
                '<button onclick="updateChangedWaves()" class="bg-white text-red-600 px-4 py-2 rounded-lg font-bold hover:bg-red-100 transition flex items-center gap-2">' +
                '<i class="fa-solid fa-print"></i>立即更新並列印' +
                '</button>';
            document.body.appendChild(alertBar);

            document.body.style.paddingTop = '56px';
        } else {
            existingAlert.querySelector('.font-bold').innerText = '⚠️ 有 ' + changedWaves.length + ' 個波次需要更新揀貨單！';
        }
    } else {
        if (existingAlert) {
            existingAlert.remove();
            document.body.style.paddingTop = '';
        }
    }
}

window.openWaveSorting = function(waveNo) {
    var wave = window._waveData.waves.find(function(w) { return w.waveNo === waveNo; });
    if (!wave) {
        alert('找不到波次 ' + waveNo);
        return;
    }

    window._waveData.currentWave = wave;

    var modal = document.createElement('div');
    modal.id = 'modal-wave-sorting';
    modal.className = 'fixed inset-0 z-50 bg-black/80 flex items-center justify-center backdrop-blur-sm';

    var ordersHtml = '';
    (wave.orders || []).forEach(function(order) {
        var totalPkgQty = 0;
        var itemsHtml = (order.items || []).filter(function(item) {
            return !window.isExcludedFromSortingLabel(item.productName);
        }).map(function(item) {
            var qty = item.quantity || 0;
            var boxPerPkg = parseBoxPerPackage(item.productName);
            var pkgQty = (boxPerPkg > 0 && qty > 0) ? Math.ceil(qty / boxPerPkg) : (item.packageQty || 1);
            if (!window.isPackagingItem(item.productName)) {
                totalPkgQty += pkgQty;
            }
            var isPackaging = window.isPackagingItem(item.productName);
            var qtyDisplay = isPackaging ? '<span class="text-slate-500">' + pkgQty + ' (包材)</span>' : '<span class="text-yellow-400 font-bold">' + pkgQty + ' 件</span>';
            return '<div class="flex justify-between text-sm py-1 border-b border-slate-700/50">' +
                '<span class="text-slate-300">' + item.productName + ' ' + (item.spec || '') + '</span>' +
                qtyDisplay + '</div>';
        }).join('');

        itemsHtml += '<div class="flex justify-between text-sm py-2 mt-1 bg-slate-700/50 rounded px-2">' +
            '<span class="text-white font-bold">小計</span>' +
            '<span class="text-red-400 font-bold text-lg">' + totalPkgQty + ' 件</span></div>';

        ordersHtml += '<div class="bg-slate-800 border border-slate-600 rounded-lg p-4 mb-3">' +
            '<div class="flex justify-between items-start mb-3">' +
            '<div><div class="text-cyan-400 font-mono text-sm">' + order.orderNo + '</div>' +
            '<div class="text-white font-bold text-lg">' + order.customer + '</div>' +
            '<div class="text-slate-400 text-xs">' + (order.address || '') + '</div></div>' +
            '<div class="text-right"><span class="px-2 py-1 rounded text-xs bg-slate-700 text-slate-300">' + (order.logistics || wave.logistics) + '</span>' +
            '<div class="mt-2"><button onclick="printSingleLabel(\'' + order.orderNo + '\')" class="bg-purple-600 hover:bg-purple-500 text-white text-xs px-3 py-1 rounded">' +
            '<i class="fa-solid fa-tag mr-1"></i>列印標籤</button></div></div></div>' +
            '<div class="border-t border-slate-600 pt-2">' + itemsHtml + '</div></div>';
    });

    modal.innerHTML = '<div class="bg-slate-900 border border-slate-700 rounded-2xl w-[900px] max-h-[90vh] shadow-2xl flex flex-col">' +
        '<div class="bg-gradient-to-r from-purple-900 to-pink-900 p-4 rounded-t-2xl border-b border-slate-700 flex justify-between items-center">' +
        '<div><h3 class="text-white font-bold text-lg"><i class="fa-solid fa-tags mr-2 text-purple-400"></i>分貨作業 - ' + wave.waveNo + '</h3>' +
        '<p class="text-purple-200 text-xs mt-1">物流商：' + wave.logistics + ' | 訂單數：' + (wave.orders || []).length + '</p></div>' +
        '<button onclick="printAllLabels()" class="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg text-sm font-bold">' +
        '<i class="fa-solid fa-print mr-1"></i>列印全部標籤</button></div>' +
        '<div class="p-4 bg-purple-900/20 border-b border-slate-700"><div class="flex items-center text-purple-300 text-sm">' +
        '<i class="fa-solid fa-info-circle mr-2"></i>請依標籤將貨物分配給各客戶，確認無誤後點擊「完成分貨」</div></div>' +
        '<div class="flex-1 overflow-auto p-4">' + ordersHtml + '</div>' +
        '<div class="p-4 border-t border-slate-700 flex gap-3">' +
        (wave.logistics === '大榮' || wave.logistics === '大榮貨運' ?
        '<button onclick="openPalletPlanModal()" class="flex-1 py-3 bg-orange-600 hover:bg-orange-500 text-white rounded-lg font-bold">' +
        '<i class="fa-solid fa-pallet mr-2"></i>棧板堆疊規劃</button>' : '') +
        '<button onclick="completeSorting()" class="flex-1 py-3 bg-green-600 hover:bg-green-500 text-white rounded-lg font-bold">' +
        '<i class="fa-solid fa-truck mr-2"></i>完成分貨，出貨</button>' +
        '<button onclick="closeSortingModal()" class="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg">關閉</button></div></div>';

    document.body.appendChild(modal);
};

window.closeSortingModal = function() {
    var modal = document.getElementById('modal-wave-sorting');
    if (modal) modal.remove();
};

window.printSingleLabel = function(orderNo) {
    var wave = window._waveData.currentWave;
    var order = (wave.orders || []).find(function(o) { return o.orderNo === orderNo; });
    if (!order) return;

    var printWindow = window.open('', '_blank', 'width=1100,height=800');
    var totalPkg = 0;
    var itemsHtml = (order.items || []).filter(function(item) {
        return !window.isExcludedFromSortingLabel(item.productName);
    }).map(function(item) {
        var qty = item.quantity || 0;
        var boxPerPkg = parseBoxPerPackage(item.productName);
        var pkgQty = (boxPerPkg > 0 && qty > 0) ? Math.ceil(qty / boxPerPkg) : (item.packageQty || 1);
        if (!window.isPackagingItem(item.productName)) {
            totalPkg += pkgQty;
        }
        var isPackaging = window.isPackagingItem(item.productName);
        var qtyText = isPackaging ? '(包材)' : pkgQty + ' 件';
        return '<div class="item"><span>' + item.productName + ' ' + (item.spec || '') + '</span><strong>' + qtyText + '</strong></div>';
    }).join('');

    printWindow.document.write('<!DOCTYPE html><html><head><title>分貨標籤</title>' +
        '<style>body{font-family:"Microsoft JhengHei",sans-serif;padding:20px}' +
        '.label{border:2px solid #333;padding:15px;width:320px}' +
        '.logistics{background:#333;color:white;padding:5px 10px;font-weight:bold;margin:-15px -15px 10px -15px}' +
        '.customer{font-size:24px;font-weight:bold;margin:10px 0}' +
        '.total{background:#dc2626;color:white;padding:8px;text-align:center;font-size:20px;font-weight:bold;margin:10px 0;border-radius:4px}' +
        '.items{border-top:1px dashed #ccc;padding-top:10px}' +
        '.item{margin:5px 0;display:flex;justify-content:space-between}' +
        '.address{font-size:12px;color:#666;margin-top:10px;border-top:1px dashed #ccc;padding-top:10px}</style></head>' +
        '<body><div class="label"><div class="logistics">' + (order.logistics || wave.logistics) + '</div>' +
        '<div style="font-size:14px;color:#666">📦 ' + order.orderNo + '</div>' +
        '<div class="customer">👤 ' + order.customer + '</div>' +
        '<div class="total">共 ' + totalPkg + ' 件</div>' +
        '<div class="items">' + itemsHtml + '</div>' +
        (order.address ? '<div class="address">📍 ' + order.address + '</div>' : '') +
        '</div><script>window.print();<\/script></body></html>');
    printWindow.document.close();
};

window.printAllLabels = function() {
    var wave = window._waveData.currentWave;
    var printWindow = window.open('', '_blank', 'width=1100,height=800');

    var labelsHtml = (wave.orders || []).map(function(order) {
        var totalPkg = 0;
        var itemsHtml = (order.items || []).filter(function(item) {
            return !window.isExcludedFromSortingLabel(item.productName);
        }).map(function(item) {
            var qty = item.quantity || 0;
            var boxPerPkg = parseBoxPerPackage(item.productName);
            var pkgQty = (boxPerPkg > 0 && qty > 0) ? Math.ceil(qty / boxPerPkg) : (item.packageQty || 1);
            if (!window.isPackagingItem(item.productName)) {
                totalPkg += pkgQty;
            }
            var isPackaging = window.isPackagingItem(item.productName);
            var qtyText = isPackaging ? '(包材)' : pkgQty + ' 件';
            return '<div class="item"><span>' + item.productName + '</span><strong>' + qtyText + '</strong></div>';
        }).join('');

        return '<div class="label"><div class="logistics">' + (order.logistics || wave.logistics) + '</div>' +
            '<div style="font-size:14px;color:#666">📦 ' + order.orderNo + '</div>' +
            '<div class="customer">👤 ' + order.customer + '</div>' +
            '<div class="total">共 ' + totalPkg + ' 件</div>' +
            '<div class="items">' + itemsHtml + '</div>' +
            (order.address ? '<div class="address">📍 ' + order.address + '</div>' : '') + '</div>';
    }).join('');

    printWindow.document.write('<!DOCTYPE html><html><head><title>分貨標籤</title>' +
        '<style>body{font-family:"Microsoft JhengHei",sans-serif;padding:20px}' +
        '.label{border:2px solid #333;padding:15px;width:320px;margin-bottom:20px;page-break-inside:avoid}' +
        '.logistics{background:#333;color:white;padding:5px 10px;font-weight:bold;margin:-15px -15px 10px -15px}' +
        '.customer{font-size:24px;font-weight:bold;margin:10px 0}' +
        '.total{background:#dc2626;color:white;padding:8px;text-align:center;font-size:20px;font-weight:bold;margin:10px 0;border-radius:4px}' +
        '.items{border-top:1px dashed #ccc;padding-top:10px}' +
        '.item{margin:5px 0;display:flex;justify-content:space-between}' +
        '.address{font-size:12px;color:#666;margin-top:10px;border-top:1px dashed #ccc;padding-top:10px}</style></head>' +
        '<body>' + labelsHtml + '<script>window.print();<\/script></body></html>');
    printWindow.document.close();
};

