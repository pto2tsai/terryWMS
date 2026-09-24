// ============================================================
// js/10-external-inbound.js — 外倉管理、入庫單流程、效期檢查、審核流程
// 由原 app.js 第 14268–15655 行拆出；各檔依 index.html 的順序載入，共用全域（window）
// ============================================================
        // ========== 外部倉庫管理功能 ==========

        window.externalStock = [];
        window.transferList = [];

        var extWhNames = {
            'EXT-TP': '台北倉',
            'EXT-TC': '台中倉',
            'EXT-KH': '高雄倉',
            'STORE': '門市'
        };

        window.loadExternalStock = async function() {
            // 檢查 Firebase 是否已初始化
            if (!window.db || !window.collection || !window.getDocs) {
                console.warn('Firebase 尚未初始化，稍後重試載入外倉庫存');
                return;
            }
            try {
                var snapshot = await window.getDocs(window.collection(window.db, 'externalStock'));
                window.externalStock = [];
                snapshot.forEach(function(doc) {
                    window.externalStock.push(window.normalizeStockRecord({ id: doc.id, ...doc.data() }));
                });
                updateExternalSummary();
                renderExternalStock();
            } catch(e) {
                console.error('載入外倉庫存失敗:', e);
            }
        };

        function updateExternalSummary() {
            var summary = { 'EXT-TP': { qty: 0, items: 0 }, 'EXT-TC': { qty: 0, items: 0 }, 'EXT-KH': { qty: 0, items: 0 }, 'STORE': { qty: 0, items: 0 } };

            window.externalStock.forEach(function(s) {
                if (summary[s.warehouseId]) {
                    summary[s.warehouseId].qty += (s.quantity || 0);
                    summary[s.warehouseId].items++;
                }
            });

            var el;
            el = document.getElementById('ext-tp-count'); if (el) el.innerText = summary['EXT-TP'].qty;
            el = document.getElementById('ext-tp-items'); if (el) el.innerText = summary['EXT-TP'].items;
            el = document.getElementById('ext-tc-count'); if (el) el.innerText = summary['EXT-TC'].qty;
            el = document.getElementById('ext-tc-items'); if (el) el.innerText = summary['EXT-TC'].items;
            el = document.getElementById('ext-kh-count'); if (el) el.innerText = summary['EXT-KH'].qty;
            el = document.getElementById('ext-kh-items'); if (el) el.innerText = summary['EXT-KH'].items;
            el = document.getElementById('ext-store-count'); if (el) el.innerText = summary['STORE'].qty;
            el = document.getElementById('ext-store-items'); if (el) el.innerText = summary['STORE'].items;
        }

        window.extCompanyFilter = 'all';

        window.setExtCompany = function(company) {
            window.extCompanyFilter = company;

            document.getElementById('btn-ext-all').className = company === 'all'
                ? 'px-3 py-1.5 rounded text-xs font-bold bg-slate-600 text-white'
                : 'px-3 py-1.5 rounded text-xs font-bold bg-slate-700 text-slate-300 hover:bg-slate-600';
            document.getElementById('btn-ext-cw').className = company === '崇文'
                ? 'px-3 py-1.5 rounded text-xs font-bold bg-blue-600 text-white'
                : 'px-3 py-1.5 rounded text-xs font-bold bg-slate-700 text-slate-300 hover:bg-slate-600';
            document.getElementById('btn-ext-bf').className = company === '八方'
                ? 'px-3 py-1.5 rounded text-xs font-bold bg-purple-600 text-white'
                : 'px-3 py-1.5 rounded text-xs font-bold bg-slate-700 text-slate-300 hover:bg-slate-600';

            updateExtWarehouseFilter();

            renderExternalStock();
        };

        function updateExtWarehouseFilter() {
            var company = window.extCompanyFilter;
            var filterSelect = document.getElementById('ext-wh-filter');
            var adjSelect = document.getElementById('ext-adj-wh');

            var html = '<option value="">全部外倉</option>';
            var adjHtml = '<option value="">選擇倉庫</option>';

            window.warehousesData.forEach(function(w) {
                if (w.type === 'external' && w.active) {
                    if (company === 'all' || w.company === company) {
                        var label = w.company + ' - ' + w.name;
                        html += '<option value="' + w.code + '">' + label + '</option>';
                        adjHtml += '<option value="' + w.code + '">' + label + '</option>';
                    }
                }
            });

            if (filterSelect) filterSelect.innerHTML = html;
            if (adjSelect) adjSelect.innerHTML = adjHtml;
        }

        function renderExternalStock(filter) {
            var tbody = document.getElementById('external-stock-list');
            var companyFilter = window.extCompanyFilter || 'all';
            var data = window.externalStock;

            if (companyFilter !== 'all') {
                data = data.filter(function(s) { return s.company === companyFilter; });
            }

            if (filter) {
                data = data.filter(function(s) { return s.warehouseId === filter; });
            }

            var countEl = document.getElementById('ext-stock-count');
            if (countEl) countEl.innerText = data.length + ' 筆';

            if (data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" class="text-center text-slate-500 py-10">無庫存資料</td></tr>';
                return;
            }

            var getWhName = function(code) {
                var wh = window.warehousesData.find(function(w) { return w.code === code; });
                return wh ? wh.name : code;
            };

            var html = '';
            data.forEach(function(s) {
                var whName = getWhName(s.warehouseId);
                var expClass = '';
                if (s.expDate) {
                    var exp = new Date(s.expDate);
                    var now = new Date();
                    var days = Math.floor((exp - now) / 86400000);
                    if (days < 0) expClass = 'text-red-400 font-bold';
                    else if (days < 30) expClass = 'text-orange-400';
                    else if (days < 90) expClass = 'text-yellow-400';
                }

                var companyClass = s.company === '八方' ? 'bg-purple-900/50 text-purple-300' : 'bg-blue-900/50 text-blue-300';

                html += '<tr class="border-b border-slate-700 hover:bg-slate-800">';
                html += '<td class="p-2"><span class="px-1.5 py-0.5 rounded text-xs ' + companyClass + '">' + (s.company || '-') + '</span></td>';
                html += '<td class="p-2"><span class="px-2 py-1 rounded text-xs bg-slate-700">' + whName + '</span></td>';
                html += '<td class="p-2 text-white font-bold">' + (s.productName || '-') + '</td>';
                html += '<td class="p-2 text-slate-400">' + (s.spec || '-') + '</td>';
                html += '<td class="p-2 text-slate-400">' + (s.batchNo || '-') + '</td>';
                html += '<td class="p-2 text-right text-yellow-400 font-bold">' + (s.quantity || 0) + '</td>';
                html += '<td class="p-2 ' + expClass + '">' + (s.expDate || '-') + '</td>';
                html += '<td class="p-2 text-center">';
                html += '<button onclick="deleteExternalStock(\'' + s.id + '\')" class="bg-red-600 hover:bg-red-500 text-white text-xs px-2 py-1 rounded" title="刪除"><i class="fa-solid fa-trash"></i></button>';
                html += '</td>';
                html += '</tr>';
            });

            tbody.innerHTML = html;
        }

        window.filterExternalWarehouse = function(wh) {
            document.getElementById('ext-wh-filter').value = wh || '';
            renderExternalStock(wh);
        };

        window.submitExternalAdjust = async function() {
            var companyRadio = document.querySelector('input[name="ext-adj-company"]:checked');
            var company = companyRadio ? companyRadio.value : '崇文';
            var wh = document.getElementById('ext-adj-wh').value;
            var name = document.getElementById('ext-adj-name').value.trim();
            var spec = document.getElementById('ext-adj-spec').value.trim();
            var batch = document.getElementById('ext-adj-batch').value.trim();
            var exp = document.getElementById('ext-adj-exp').value;
            var qty = parseInt(document.getElementById('ext-adj-qty').value) || 0;
            var reason = document.getElementById('ext-adj-reason').value;

            if (!wh) { alert('請選擇倉庫'); return; }
            if (!name) { alert('請輸入品名'); return; }
            if (!exp) { alert('⚠️ 效期為必填欄位，請輸入效期'); return; }
            if (!batch) {
                if (!confirm('⚠️ 批號未填寫\n\n自家生產、進口、大宗原料應填寫批號。\n\n確定不填寫批號嗎？')) {
                    return;
                }
            }
            if (qty === 0) { alert('請輸入調整數量'); return; }

            try {
                var existing = window.externalStock.find(function(s) {
                    return window.sameExternalLot(s, { warehouseId: wh, company: company, productName: name, spec: spec, batchNo: batch, expDate: exp });
                });
                var reasonText = (document.getElementById('ext-adj-reason').selectedOptions[0] || {}).text || reason || '';
                var logData = {
                    type: 'adjust', company: company, productName: name, spec: spec, batchNo: batch,
                    quantity: Math.abs(qty), quantityChange: qty, locationId: wh,
                    note: '外倉手動調整' + (reasonText ? '：' + reasonText : '')
                };

                if (existing) {
                    var ref = window.doc(window.db, 'externalStock', existing.id);
                    var delta = qty;
                    // 扣超過目前庫存時先詢問（以最新數量為準），確定就扣到 0
                    var cur = (await ref.get()).data();
                    var curQty = cur ? (parseFloat(cur.quantity) || 0) : 0;
                    if (curQty + qty < 0) {
                        if (!confirm('⚠️ 目前只有 ' + curQty + ' 件，要扣 ' + (-qty) + ' 件\n\n確定要扣到 0 嗎？')) return;
                        delta = -curQty;
                        logData.quantityChange = delta;
                        logData.quantity = curQty;
                    }
                    await window.runStockTransaction({
                        changes: [{ ref: ref, delta: delta, deleteWhenEmpty: true, extra: { updatedAt: new Date().toISOString() }, label: name }],
                        logs: function() { return [logData]; }
                    });
                } else {
                    if (qty < 0) { alert('無此庫存，無法扣減'); return; }
                    var newRef = window.db.collection('externalStock').doc();
                    await window.runStockTransaction({
                        creates: [{ ref: newRef, data: {
                            company: company, warehouseId: wh, productName: name, spec: spec, batchNo: batch,
                            expDate: exp || '', quantity: qty, reason: reason, createdAt: new Date().toISOString()
                        } }],
                        logs: function() { return [logData]; }
                    });
                }

                alert('✅ 調整成功！');

                document.getElementById('ext-adj-name').value = '';
                document.getElementById('ext-adj-spec').value = '';
                document.getElementById('ext-adj-batch').value = '';
                document.getElementById('ext-adj-exp').value = '';
                document.getElementById('ext-adj-qty').value = '';

                loadExternalStock();
            } catch(e) {
                alert('❌ 調整失敗：' + e.message);
            }
        };

        window.exportExternalStock = function() {
            if (window.externalStock.length === 0) { alert('無資料可匯出'); return; }
            var rows = window.externalStock.map(function(st) {
                return {
                    '倉庫': extWhNames[st.warehouseId] || st.warehouseId, '公司': st.company || '', '品名': st.productName || '',
                    '規格': st.spec || '', '批號': st.batchNo || '', '效期': st.expDate || st.expiryDate || '',
                    '數量': Number(st.quantity) || 0, '類型': st.productType === 'variable' ? '不定重' : '定重',
                    '箱容kg': st.unitWeight || '', '總重量kg': Number(st.totalWeight) || 0
                };
            });
            window.exportTableReportXlsx({
                title: '外倉庫存清單', meta: [['資料時間', '截至 ' + new Date().toLocalYMD()]], rows: rows,
                columns: ['倉庫', '公司', '品名', '規格', '批號', '效期', '數量', '類型', '箱容kg', '總重量kg'],
                fileName: '外倉庫存_' + new Date().toLocalYMD() + '.xlsx'
            });
        };

        window.handleExternalImport = function(event) {
            var file = event.target.files[0];
            if (!file) return;

            alert('📥 檔案已選擇：' + file.name + '\n\n此功能需要進一步開發 Excel 解析。\n目前請使用「庫存調整」手動輸入對帳。');
            event.target.value = '';
        };

        // ========== 入庫單建立、列印、確認流程 ==========

        window.pendingInbounds = [];

        var inboundTypeNames = {
            'Raw': '採購進貨',
            'FG': '產線成品',
            'WIP': '產線半成品',
            'RM': '原料',
            'Return': '餘料退庫'
        };

        window.createInboundOrder = async function() {
            var loc = window.formatLocationId(document.getElementById('in-loc').value);   // 簡碼 IA011 → I-A-01-1F
            var name = document.getElementById('in-name').value.trim();
            var spec = document.getElementById('in-spec').value.trim();
            var batch = document.getElementById('in-batch').value.trim();
            var exp = document.getElementById('in-exp').value;
            var vendor = document.getElementById('in-vendor').value.trim();
            var category = document.getElementById('in-category').value;
            if (!category && window.requireInboundType && !window.requireInboundType()) return null;
            category = category || 'Raw';
            var companyRadio = document.querySelector('input[name="in-company"]:checked');
            var company = companyRadio ? companyRadio.value : '崇文';
            var productCode = (document.getElementById('in-product-code') || {}).value || '';

            var productType = 'fixed';
            var radio = document.querySelector('input[name="in-product-type"]:checked');
            if (radio) {
                productType = radio.value;
            }

            var qty, unitWeight, totalWeight;

            if (productType === 'fixed') {
                qty = parseInt(document.getElementById('in-qty').value) || 0;
                unitWeight = parseFloat(document.getElementById('in-unit-weight').value) || 0;
                totalWeight = qty * unitWeight;
            } else {
                var qtyVarEl = document.getElementById('in-qty-var');
                var weightEl = document.getElementById('in-weight');
                qty = qtyVarEl ? (parseInt(qtyVarEl.value) || 0) : 0;
                totalWeight = weightEl ? (parseFloat(weightEl.value) || 0) : 0;
                unitWeight = qty > 0 ? Math.round(totalWeight / qty * 100) / 100 : 0;
            }

            var warehouseId = document.getElementById('in-warehouse').value;
            var isExternal = isExternalWarehouse(warehouseId);

            if (!isExternal && !loc) { alert('請選擇儲位'); return null; }
            if (!isExternal && !window.isValidStorageLocation(loc)) { alert('❌ 儲位格式不正確：' + loc + '\n\n例如 IA011（＝I-A-01-1F）或 TEMP-IN'); return null; }
            if (!name) { alert('請輸入品名'); return null; }
            if (!exp) { alert('⚠️ 效期為必填欄位'); return null; }
            if (qty <= 0) { alert('請輸入有效數量'); return null; }
            if (productType === 'variable' && totalWeight <= 0) { alert('❌ 不定重品請填寫總重量'); return null; }

            // ========== 效期檢查警示 ==========
            var expiryCheck = checkExpiryStatus(name, spec, exp);
            if (expiryCheck.status === 'expired') {
                alert('❌ 無法入庫！\n\n此商品已過期（' + exp + '）\n\n請退回供應商或進行報廢處理');
                return null;
            } else if (expiryCheck.status === 'critical') {
                var result = await showExpiryApprovalModal(expiryCheck);
                if (result === 'reject') {
                    alert('❌ 已拒收此即期品');
                    return null;
                } else if (result === 'cancel') {
                    return null;
                }
                // result === 'approve' 繼續執行，但標記需要主管核准
            } else if (expiryCheck.status === 'warning') {
                if (!confirm('⚠️ 效期警示\n\n' + expiryCheck.message + '\n\n剩餘天數：' + expiryCheck.remainingDays + ' 天\n\n確定要允收此批貨物嗎？')) {
                    return null;
                }
            }

            if (!batch) {
                if (!confirm('⚠️ 批號未填寫\n\n自家生產、進口、大宗原料應填寫批號。\n\n確定不填寫批號嗎？')) {
                    return null;
                }
            }

            if (!isExternal) {
                var typeNames = { Raw: '採購', FG: '成品', WIP: '半成品', RM: '原料', Return: '退庫' };
                if (!confirm('🚜 交給堆高機\n\n' + name + (spec ? ' ' + spec : '') + '　' + qty + ' 件' +
                    '\n指定儲位：' + loc + '　公司：' + company + '\n批號：' + (batch || '-') + '　效期：' + exp +
                    '\n類型：' + (typeNames[category] || category) +
                    '\n\n按「確定」會建立入庫單並發到手機「入庫任務」。\n堆高機上架後掃儲位才會入帳（放別的儲位也可以，以實際儲位為準）。' +
                    (category === 'Raw' ? '\n採購進貨會同時送財務對帳。' : ''))) return null;
            }
            var now = new Date();
            var docNo = await window.nextDocNo('IN');

            var needsApproval = (category === 'Raw');

            // 即期品：主管／管理員建單就等於核准；其他人建的要主管在核准頁同意後，手機才能上架入帳
            var needsExpiryApproval = (expiryCheck.status === 'critical');
            var expiryApproval = needsExpiryApproval ? (window.isSupervisorRole() ? 'approved' : 'pending') : null;

            var order = {
                docNo: docNo,
                company: company,
                productCode: productCode,
                type: category,
                typeName: inboundTypeNames[category] || category,
                isExternal: isExternal,
                warehouseId: warehouseId,
                warehouseName: getWarehouseDisplayName(warehouseId),
                locationId: isExternal ? null : loc,
                productName: name,
                spec: spec,
                batchNo: batch,
                expDate: exp || '',
                quantity: qty,
                productType: productType,
                unitWeight: unitWeight,
                totalWeight: totalWeight,
                vendor: vendor,
                // 外倉入庫建立時就直接加到外倉庫存，所以入庫單直接完成；本倉入庫待執行（上架入帳）
                status: isExternal ? 'completed' : 'pending',
                needsApproval: needsApproval, // 標記是否需要審核
                approvalStatus: needsApproval ? 'pending' : 'not_required', // pending=待審核, approved=已審核, not_required=不需審核
                expiryWarning: expiryCheck.status !== 'ok' ? expiryCheck.status : null, // 效期警示狀態
                expiryNote: expiryCheck.status !== 'ok' ? expiryCheck.message : null, // 效期警示訊息
                expiryApproval: expiryApproval,   // 即期品主管核准：pending＝等核准（不能入帳）、approved＝已核准
                expiryApprovedBy: expiryApproval === 'approved' ? (window.currentUser ? window.currentUser.email : '') : null,
                createdBy: window.currentUser ? window.currentUser.email : 'admin',
                createdAt: now.toISOString()
            };

            try {
                var docRef = await window.addDoc(window.collection(window.db, 'inboundOrders'), order);
                order.id = docRef.id;

                var expiryWarningText = '';
                if (expiryCheck.status === 'critical') {
                    expiryWarningText = expiryApproval === 'pending'
                        ? '\n\n🔴 即期品：要主管在「入庫核准」頁同意後，手機才能上架入帳'
                        : '\n\n🔴 即期品（你是主管，已直接核准）';
                } else if (expiryCheck.status === 'warning') {
                    expiryWarningText = '\n\n⚠️ 效期較短，已記錄';
                }

                if (!(await window.publishInboundTask(order)) && !isExternal) {
                    alert('⚠️ 入庫單已建立（' + docNo + '），但發到手機失敗（網路？）。\n\n請到「待執行入庫單」確認，或重新整理後再試。');
                }

                var locationInfo = isExternal ? ('倉庫：' + order.warehouseName) : ('儲位：' + loc);

                if (isExternal) {
                    await createExternalStock(order);
                    alert('✅ 外倉入庫成功！\n單號：' + docNo + '\n' + locationInfo + expiryWarningText);
                } else if (needsApproval) {
                    alert('✅ 已發到手機「入庫任務」\n單號：' + docNo + '\n' + locationInfo + expiryWarningText + '\n\n堆高機上架掃儲位後就會入帳。\n採購進貨已送財務對帳（不影響入帳）。');
                } else {
                    alert('✅ 已發到手機「入庫任務」\n單號：' + docNo + '\n' + locationInfo + expiryWarningText + '\n\n堆高機上架掃儲位後就會入帳。');
                }

                clearInboundForm();
                updatePendingInboundCount();
                updateApprovalCount();

                return order;
            } catch(e) {
                alert('❌ 建立失敗：' + e.message);
                return null;
            }
        };

        // ========== 效期檢查函數 ==========
        window.checkExpiryStatus = function(productName, spec, expDateStr) {
            if (!expDateStr) return { status: 'ok', message: '' };

            var today = new Date();
            today.setHours(0, 0, 0, 0);
            var expDate = new Date(expDateStr);
            expDate.setHours(0, 0, 0, 0);

            var remainingDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));

            if (remainingDays <= 0) {
                return {
                    status: 'expired',
                    message: '❌ 此商品已過期！',
                    remainingDays: remainingDays
                };
            }

            var productConfig = window.getProductPalletCapacity ? window.getProductPalletCapacity(productName, spec) : null;
            var productMaster = window.productMasterData ? window.productMasterData.find(function(p) {
                return p.name === productName && (p.spec || '') === (spec || '');
            }) : null;

            var shelfLifeMonths = productMaster ? productMaster.shelfLife : 0;

            var warningDays, criticalDays;

            if (shelfLifeMonths > 0) {
                var totalDays = shelfLifeMonths * 30; // 粗估一個月30天
                warningDays = Math.floor(totalDays / 2);   // 1/2 保存期限
                criticalDays = Math.floor(totalDays / 6);  // 1/6 保存期限
            } else {
                warningDays = 90;   // 剩餘 < 90 天警示
                criticalDays = 30;  // 剩餘 < 30 天需核准
            }

            if (remainingDays <= criticalDays) {
                return {
                    status: 'critical',
                    message: '🔴 即期品警告！\n\n效期剩餘 ' + remainingDays + ' 天' +
                             (shelfLifeMonths > 0 ? '\n（低於保存期限 ' + shelfLifeMonths + ' 個月的 1/6）' : '\n（低於 ' + criticalDays + ' 天）') +
                             '\n\n此商品需要主管核准才能入庫',
                    remainingDays: remainingDays,
                    threshold: criticalDays,
                    shelfLifeMonths: shelfLifeMonths
                };
            } else if (remainingDays <= warningDays) {
                return {
                    status: 'warning',
                    message: '⚠️ 效期較短警告\n\n效期剩餘 ' + remainingDays + ' 天' +
                             (shelfLifeMonths > 0 ? '\n（低於保存期限 ' + shelfLifeMonths + ' 個月的 1/2）' : '\n（低於 ' + warningDays + ' 天）'),
                    remainingDays: remainingDays,
                    threshold: warningDays,
                    shelfLifeMonths: shelfLifeMonths
                };
            }

            return { status: 'ok', message: '', remainingDays: remainingDays };
        };

        window.showExpiryApprovalModal = function(expiryCheck) {
            return new Promise(function(resolve) {
                var modal = document.createElement('div');
                modal.className = 'fixed inset-0 z-50 flex items-center justify-center';
                modal.innerHTML =
                    '<div class="absolute inset-0 bg-black/80" onclick="this.parentElement.remove()"></div>' +
                    '<div class="relative bg-slate-900 border-2 border-red-500 rounded-lg p-6 max-w-md shadow-2xl">' +
                        '<div class="text-center mb-4">' +
                            '<div class="text-6xl mb-3">🚨</div>' +
                            '<h3 class="text-xl font-bold text-red-400">即期品警告</h3>' +
                        '</div>' +
                        '<div class="bg-red-900/30 border border-red-600 rounded p-4 mb-4">' +
                            '<div class="text-white whitespace-pre-line">' + expiryCheck.message + '</div>' +
                        '</div>' +
                        '<div class="text-sm text-slate-400 mb-4 text-center">' +
                            '此商品效期過短，需要主管核准才能入庫。<br>請選擇處理方式：' +
                        '</div>' +
                        '<div class="flex gap-3">' +
                            '<button onclick="this.closest(\'.fixed\').dataset.result=\'reject\';this.closest(\'.fixed\').remove()" class="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold">' +
                                '<i class="fa-solid fa-ban mr-2"></i>拒收' +
                            '</button>' +
                            '<button onclick="this.closest(\'.fixed\').dataset.result=\'approve\';this.closest(\'.fixed\').remove()" class="flex-1 py-3 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg font-bold">' +
                                '<i class="fa-solid fa-clipboard-check mr-2"></i>申請核准' +
                            '</button>' +
                        '</div>' +
                        '<button onclick="this.closest(\'.fixed\').dataset.result=\'cancel\';this.closest(\'.fixed\').remove()" class="w-full mt-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm">' +
                            '取消' +
                        '</button>' +
                    '</div>';

                document.body.appendChild(modal);

                var observer = new MutationObserver(function(mutations) {
                    mutations.forEach(function(mutation) {
                        mutation.removedNodes.forEach(function(node) {
                            if (node === modal) {
                                observer.disconnect();
                                resolve(modal.dataset.result || 'cancel');
                            }
                        });
                    });
                });
                observer.observe(document.body, { childList: true });
            });
        };

        window.createAndPrintInbound = async function() {
            var order = await createInboundOrder();
            if (order) {
                printInboundSlip(order);
            }
        };

        window.printInboundSlip = function(order) {
            var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>棧板插單 - ' + order.productName + '</title>';
            html += '<style>';
            html += '@page { size: A4 landscape; margin: 0; }';
            html += '* { margin: 0; padding: 0; box-sizing: border-box; }';
            html += 'body { font-family: Microsoft JhengHei, Arial, sans-serif; background: #fff; }';
            html += '.label-page { width: 297mm; height: 210mm; padding: 5mm; box-sizing: border-box; overflow: hidden; }';
            html += '.label-content { width: 100%; height: 100%; border: 3px solid #000; display: flex; flex-direction: column; overflow: hidden; }';
            
            // 第一列：QR code 8x8cm + 品名 (高度 85mm)
            html += '.row-1 { height: 85mm; display: flex; border-bottom: 3px solid #000; }';
            html += '.qr-section { width: 90mm; border-right: 2px solid #000; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 3mm; }';
            html += '.qr-box { width: 80mm; height: 80mm; }';
            html += '.qr-box svg { width: 100% !important; height: 100% !important; }';
            html += '.pallet-no { font-size: 14px; font-weight: bold; color: #333; margin-top: 2mm; text-align: center; }';
            html += '.name-section { flex: 1; display: flex; align-items: center; justify-content: center; padding: 5mm; overflow: hidden; }';
            html += '.product-name { font-weight: 900; text-align: center; line-height: 1.1; word-break: break-word; }';
            
            // 第二列：規格 (高度 40mm)
            html += '.row-2 { height: 40mm; display: flex; align-items: center; justify-content: center; border-bottom: 3px solid #000; padding: 3mm 8mm; overflow: hidden; }';
            html += '.product-spec { font-weight: 700; color: #333; text-align: center; line-height: 1.2; word-break: break-word; }';
            
            // 第三列：數量20%、批號40%、效期40% (高度 45mm)
            html += '.row-3 { height: 45mm; display: flex; border-bottom: 3px solid #000; }';
            html += '.cell-qty { width: 20%; border-right: 2px solid #000; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 2mm; }';
            html += '.cell-batch { width: 40%; border-right: 2px solid #000; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 2mm; }';
            html += '.cell-exp { width: 40%; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 2mm; }';
            html += '.cell-label { font-size: 14px; color: #666; margin-bottom: 2mm; }';
            html += '.cell-value { font-weight: 900; white-space: nowrap; }';
            html += '.cell-value.qty { color: #dc2626; font-size: 64px; }';
            html += '.cell-value.batch { font-size: 60px; }';
            html += '.cell-value.exp { font-size: 60px; }';
            
            // 第四列：儲位 + 公司 (剩餘空間約 30mm)
            html += '.row-4 { flex: 1; display: flex; align-items: center; padding: 3mm 8mm; }';
            html += '.location-box { background: #000; color: #fff; font-size: 64px; font-weight: 900; padding: 4mm 15mm; margin-right: 15mm; }';
            html += '.company-box { font-size: 64px; font-weight: 700; color: #333; }';
            
            html += '.no-print { text-align: center; padding: 20px; }';
            html += '.no-print button { padding: 15px 40px; font-size: 18px; border: none; cursor: pointer; font-weight: bold; margin: 0 10px; border-radius: 8px; }';
            html += '.btn-print { background: #059669; color: white; }';
            html += '.btn-close { background: #666; color: white; }';
            html += '@media print { .no-print { display: none !important; } }';
            html += '</style>';
            html += '</head><body>';

            var productName = order.productName || '-';
            var specText = order.spec || '-';
            var palletNo = order.docNo || '-';
            var company = order.company || '崇文';
            
            // 品名字體大小：預設144px
            var nameFontSize = 144;
            if (productName.length > 6) nameFontSize = 72;
            if (productName.length > 12) nameFontSize = 56;
            if (productName.length > 18) nameFontSize = 42;
            
            // 規格字體大小：預設120px
            var specFontSize = 120;
            if (specText.length > 8) specFontSize = 100;
            if (specText.length > 16) specFontSize = 60;
            if (specText.length > 24) specFontSize = 44;

            html += '<div class="label-page"><div class="label-content">';

            // 第一列：QR code + 棧板號 | 品名
            html += '<div class="row-1">';
            html += '<div class="qr-section">';
            html += '<div id="qrcode" class="qr-box"></div>';
            html += '<div class="pallet-no">' + palletNo + '</div>';
            html += '</div>';
            html += '<div class="name-section">';
            html += '<div class="product-name" style="font-size:' + nameFontSize + 'px;">' + productName + '</div>';
            html += '</div>';
            html += '</div>';

            // 第二列：規格
            html += '<div class="row-2">';
            html += '<div class="product-spec" style="font-size:' + specFontSize + 'px;">' + specText + '</div>';
            html += '</div>';

            // 第三列：數量20%、批號40%、效期40%
            html += '<div class="row-3">';
            html += '<div class="cell-qty"><div class="cell-label">數量</div><div class="cell-value qty">' + order.quantity + '</div></div>';
            html += '<div class="cell-batch"><div class="cell-label">批號</div><div class="cell-value batch">' + (order.batchNo || '-') + '</div></div>';
            html += '<div class="cell-exp"><div class="cell-label">效期</div><div class="cell-value exp">' + (order.expDate || '-') + '</div></div>';
            html += '</div>';

            // 第四列：儲位、公司
            html += '<div class="row-4">';
            html += '<div class="location-box">' + (order.locationId || '待分配') + '</div>';
            html += '<div class="company-box">' + company + '</div>';
            html += '</div>';

            html += '</div></div>';

            html += '<div class="no-print">';
            html += '<button class="btn-print" onclick="window.print()">🖨️ 列印插單</button>';
            html += '<button class="btn-close" onclick="window.close()">關閉</button>';
            html += '</div>';

            html += '<script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"><\/script>';
            html += '<script>window.onload = function() {';
            html += 'try { var qr = qrcode(0, "M"); qr.addData("' + palletNo + '"); qr.make(); document.getElementById("qrcode").innerHTML = qr.createSvgTag(0, 0); } catch(e) { console.error(e); }';
            html += '};<\/script>';
            html += '</body></html>';

            var printWindow = window.open('', '_blank', 'width=1100,height=800');
            printWindow.document.write(html);
            printWindow.document.close();
        };

        // ========== 智能入庫 - 效期分段輸入函數 ==========
        
        // 效期快捷設定函數
        window.setInExpDate = function(days) {
            var date = new Date();
            date.setDate(date.getDate() + days);
            var year = date.getFullYear().toString();
            var month = (date.getMonth() + 1).toString().padStart(2, '0');
            var day = date.getDate().toString().padStart(2, '0');
            
            document.getElementById('in-exp-year').value = year;
            document.getElementById('in-exp-month').value = month;
            document.getElementById('in-exp-day').value = day;
            document.getElementById('in-exp').value = year + '-' + month + '-' + day;
            updateLivePreview();
            updateInboundProgress();
        };

        // 分段日期輸入 - 自動跳位
        window.autoJumpInExp = function(input, field) {
            var value = input.value.replace(/\D/g, ''); // 只保留數字
            input.value = value;
            
            if (field === 'year' && value.length === 4) {
                document.getElementById('in-exp-month').focus();
                document.getElementById('in-exp-month').select();
            } else if (field === 'month') {
                if (value.length === 1 && parseInt(value) > 1) {
                    input.value = '0' + value;
                    document.getElementById('in-exp-day').focus();
                    document.getElementById('in-exp-day').select();
                } else if (value.length === 2) {
                    document.getElementById('in-exp-day').focus();
                    document.getElementById('in-exp-day').select();
                }
            } else if (field === 'day') {
                if (value.length === 1 && parseInt(value) > 3) {
                    input.value = '0' + value;
                    document.getElementById('in-qty').focus();
                } else if (value.length === 2) {
                    document.getElementById('in-qty').focus();
                }
            }
            
            updateInExpValue();
            updateLivePreview();
            updateInboundProgress();
        };

        // 處理鍵盤事件
        window.handleInExpKeydown = function(event, field) {
            if (event.key === 'Backspace') {
                var input = event.target;
                if (input.value === '' || input.selectionStart === 0) {
                    event.preventDefault();
                    if (field === 'month') {
                        var yearInput = document.getElementById('in-exp-year');
                        yearInput.focus();
                        yearInput.setSelectionRange(yearInput.value.length, yearInput.value.length);
                    } else if (field === 'day') {
                        var monthInput = document.getElementById('in-exp-month');
                        monthInput.focus();
                        monthInput.setSelectionRange(monthInput.value.length, monthInput.value.length);
                    }
                }
            } else if (event.key === 'Enter') {
                event.preventDefault();
                document.getElementById('in-qty').focus();
            } else if (event.key === 'ArrowRight' && event.target.selectionStart === event.target.value.length) {
                if (field === 'year') document.getElementById('in-exp-month').focus();
                else if (field === 'month') document.getElementById('in-exp-day').focus();
            } else if (event.key === 'ArrowLeft' && event.target.selectionStart === 0) {
                if (field === 'month') document.getElementById('in-exp-year').focus();
                else if (field === 'day') document.getElementById('in-exp-month').focus();
            }
        };

        // 組合分段日期為完整日期值
        window.updateInExpValue = function() {
            var year = document.getElementById('in-exp-year').value;
            var month = document.getElementById('in-exp-month').value.padStart(2, '0');
            var day = document.getElementById('in-exp-day').value.padStart(2, '0');
            
            if (year.length === 4 && month.length === 2 && day.length === 2) {
                document.getElementById('in-exp').value = year + '-' + month + '-' + day;
            } else {
                document.getElementById('in-exp').value = '';
            }
        };

        // 從日期字串設定分段欄位（用於從品項主檔帶入）
        window.setInExpFromString = function(dateStr) {
            if (!dateStr) {
                document.getElementById('in-exp-year').value = '';
                document.getElementById('in-exp-month').value = '';
                document.getElementById('in-exp-day').value = '';
                document.getElementById('in-exp').value = '';
                return;
            }
            
            // 支援多種格式：2027-01-08, 2027/01/08, 20270108
            var normalized = dateStr.replace(/[\/\-]/g, '');
            if (normalized.length === 8) {
                var year = normalized.substring(0, 4);
                var month = normalized.substring(4, 6);
                var day = normalized.substring(6, 8);
                document.getElementById('in-exp-year').value = year;
                document.getElementById('in-exp-month').value = month;
                document.getElementById('in-exp-day').value = day;
                document.getElementById('in-exp').value = year + '-' + month + '-' + day;
            }
        };

        function clearInboundForm() {
            var el;
            el = document.getElementById('in-vendor'); if(el) el.value = '';
            el = document.getElementById('in-name'); if(el) el.value = '';
            el = document.getElementById('in-spec'); if(el) el.value = '';
            el = document.getElementById('in-qty'); if(el) el.value = '';
            el = document.getElementById('in-batch'); if(el) el.value = '';
            el = document.getElementById('in-exp'); if(el) el.value = '';
            el = document.getElementById('in-exp-year'); if(el) el.value = '';
            el = document.getElementById('in-exp-month'); if(el) el.value = '';
            el = document.getElementById('in-exp-day'); if(el) el.value = '';
            el = document.getElementById('in-loc'); if(el) el.value = '';
            el = document.getElementById('location-status'); if(el) el.innerHTML = '<span class="text-slate-500">等待選擇儲位</span>';
            updateLivePreview();
        }

        window.directInbound = async function() {
            var loc = document.getElementById('in-loc').value;
            var name = document.getElementById('in-name').value;
            var qty = document.getElementById('in-qty').value;
            var exp = document.getElementById('in-exp').value;

            if (!loc) { alert('❌ 請先指定儲位'); return; }
            if (!name) { alert('❌ 請填寫品名'); return; }
            if (!qty) { alert('❌ 請填寫數量'); return; }
            if (!exp) { alert('❌ 請填寫效期'); return; }

            if (!confirm('確定直接入庫到 ' + loc + '？\n\n品名：' + name + '\n數量：' + qty)) return;

            var spec = document.getElementById('in-spec').value || '';
            var batchNo = document.getElementById('in-batch').value || '';
            var vendor = document.getElementById('in-vendor').value || '';
            var qtyNum = parseInt(qty);

            try {
                var now = new Date();
                var docNo = await window.nextDocNo('IN');

                await window.addDoc(window.collection(window.db, 'pallets'), {
                    palletId: docNo,
                    productName: name,
                    spec: spec,
                    batchNo: batchNo,
                    expDate: exp || '',
                    expiryDate: exp || '',
                    quantity: qtyNum,
                    locationId: loc,
                    vendor: vendor,
                    category: document.getElementById('in-category').value || 'Raw',
                    source: 'DirectInbound',
                    createdAt: now.toISOString()
                });

                var categoryNames = { 'Raw': '採購進貨', 'FG': '產線成品', 'WIP': '產線半成品', 'Return': '餘料退庫' };
                var categoryName = categoryNames[document.getElementById('in-category').value] || '入庫';
                await window.logInventoryChange({
                    type: 'inbound',
                    productName: name,
                    spec: spec,
                    quantity: qtyNum,
                    quantityChange: qtyNum,
                    locationId: loc,
                    batchNo: batchNo,
                    palletId: docNo,
                    expDate: exp || '',
                    note: categoryName + (vendor ? ' - ' + vendor : '')
                });

                alert('✅ 入庫成功！\n\n儲位：' + loc + '\n品名：' + name);
                clearInboundForm();
            } catch(e) {
                alert('❌ 入庫失敗：' + e.message);
            }
        };

        window.showPendingInbounds = function() {
            document.getElementById('pending-inbound-modal').classList.remove('hidden');
            loadPendingInbounds();
        };

        window.closePendingInbounds = function() {
            document.getElementById('pending-inbound-modal').classList.add('hidden');
        };

        async function loadPendingInbounds() {
            var tbody = document.getElementById('pending-inbound-list');
            if (!tbody) return;

            if (!window.db || !window.collection || !window.query || !window.getDocs) {
                tbody.innerHTML = '<tr><td colspan="10" class="text-center text-slate-500 py-10">Firebase 尚未初始化</td></tr>';
                return;
            }

            try {
                var q = window.query(window.collection(window.db, 'inboundOrders'), window.where('status', '==', 'pending'));
                var snapshot = await window.getDocs(q);

                window.pendingInbounds = [];
                snapshot.forEach(function(doc) {
                    var d = doc.data();
                    if (d.isExternal) return;   // 舊資料：外倉入庫已直接進外倉庫存，不能再入帳到本倉
                    window.pendingInbounds.push({ id: doc.id, ...d });
                });

                window.pendingInbounds.sort(function(a, b) {
                    return new Date(b.createdAt) - new Date(a.createdAt);
                });

                if (window.pendingInbounds.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="10" class="text-center text-slate-500 py-10">無待執行入庫單</td></tr>';
                    return;
                }

                var html = '';
                window.pendingInbounds.forEach(function(order, idx) {
                    var expClass = '';
                    if (order.expDate) {
                        var exp = new Date(order.expDate);
                        var now = new Date();
                        var days = Math.floor((exp - now) / 86400000);
                        if (days < 0) expClass = 'text-red-400';
                        else if (days < 30) expClass = 'text-orange-400';
                        else if (days < 90) expClass = 'text-yellow-400';
                    }

                    html += '<tr class="border-b border-slate-700 hover:bg-slate-800">';
                    html += '<td class="p-2"><input type="checkbox" class="inbound-checkbox" data-idx="' + idx + '"></td>';
                    html += '<td class="p-2 text-blue-400 font-mono text-xs">' + order.docNo + '</td>';
                    html += '<td class="p-2"><span class="px-2 py-1 rounded text-xs bg-slate-700">' + order.typeName + '</span></td>';
                    html += '<td class="p-2 text-emerald-400 font-bold text-lg">' + order.locationId + '</td>';
                    html += '<td class="p-2 text-white font-bold">' + order.productName + '</td>';
                    html += '<td class="p-2 text-slate-400">' + (order.batchNo || '-') + '</td>';
                    html += '<td class="p-2 ' + expClass + '">' + order.expDate + '</td>';
                    html += '<td class="p-2 text-right text-yellow-400 font-bold">' + order.quantity + '</td>';
                    html += '<td class="p-2 text-slate-500 text-xs">' + new Date(order.createdAt).toLocaleString() + '</td>';
                    html += '<td class="p-2 text-center">';
                    html += '<button onclick="reprintInbound(' + idx + ')" class="text-blue-400 hover:text-blue-300 mr-2" title="重印"><i class="fa-solid fa-print"></i></button>';
                    html += '<button onclick="confirmSingleInbound(' + idx + ')" class="text-emerald-400 hover:text-emerald-300 mr-2" title="確認入帳"><i class="fa-solid fa-check"></i></button>';
                    html += '<button onclick="cancelPendingInbound(' + idx + ')" class="text-red-400 hover:text-red-300" title="取消這張入庫單"><i class="fa-solid fa-ban"></i></button>';
                    html += '</td>';
                    html += '</tr>';
                });

                tbody.innerHTML = html;
                updatePendingInboundCount();
            } catch(e) {
                console.error('載入待執行入庫單失敗:', e);
                tbody.innerHTML = '<tr><td colspan="10" class="text-center text-red-400 py-10">載入失敗</td></tr>';
            }
        }

        async function updatePendingInboundCount() {
            try {
                if (!window.db || !window.collection || !window.query || !window.getDocs) {
                    console.log('Firebase 尚未初始化，跳過更新待執行數量');
                    return;
                }
                var q = window.query(window.collection(window.db, 'inboundOrders'), window.where('status', '==', 'pending'));
                var snapshot = await window.getDocs(q);
                var count = snapshot.docs.filter(function(d) { return !d.data().isExternal; }).length;
                var el = document.getElementById('pending-inbound-count');
                if (el) el.innerText = count;
            } catch(e) {
                console.error('更新待執行數量失敗:', e);
            }
        }

        // ========== 審核流程相關函數 ==========

        window.updateApprovalCount = async function() {
            try {
                if (!window.db || !window.collection || !window.query || !window.getDocs) {
                    console.log('Firebase 尚未初始化，跳過更新待審核數量');
                    return;
                }
                var q = window.query(window.collection(window.db, 'inboundOrders'), window.where('approvalStatus', '==', 'pending'));
                var snapshot = await window.getDocs(q);
                var count = snapshot.size;
                var el = document.getElementById('approval-count');
                if (el) el.innerText = count;
            } catch(e) {
                console.error('更新待審核數量失敗:', e);
            }
        };

        window.approvalList = [];

        // 主管／管理員（可以核准即期品）
        window.isSupervisorRole = function() {
            var r = window.currentUser && window.currentUser.role;
            return r === 'admin' || r === 'supervisor';
        };

        // 財務核准／駁回：交易裡確認單子還是待審核、數量與重送時間跟畫面上看到的一樣
        async function approvalTx(shown, data) {
            var ref = window.db.collection('inboundOrders').doc(shown.id);
            return window.db.runTransaction(async function(tx) {
                var snap = await tx.get(ref);
                if (!snap.exists) throw new Error('入庫單已不存在');
                var cur = snap.data();
                if (cur.approvalStatus !== 'pending') {
                    var names = { approved: '已審核', rejected: '已駁回', not_required: '不需審核' };
                    throw new Error('這張單已經是「' + (names[cur.approvalStatus] || cur.approvalStatus) + '」（可能別人剛處理過），請重新整理');
                }
                if (shown.quantity !== undefined && (String(cur.quantity) !== String(shown.quantity) || (cur.resubmittedAt || '') !== (shown.resubmittedAt || ''))) {
                    throw new Error('這張單剛被修改過（現在數量 ' + cur.quantity + '），請重新整理後再確認');
                }
                tx.update(ref, data);
                return cur;
            });
        }

        // 取消入庫單（還沒入帳的）：入庫單標為已取消、手機上的入庫任務一起取消
        window.cancelInboundOrder = async function(orderId, reason) {
            var db = window.db;
            var ref = db.collection('inboundOrders').doc(orderId);
            var tasks = await db.collection('inboundTasks').where('orderId', '==', orderId).get();
            var now = new Date().toISOString(), who = window.currentUser ? window.currentUser.email : '';
            await db.runTransaction(async function(tx) {
                var snap = await tx.get(ref);
                if (!snap.exists) throw new Error('入庫單已不存在');
                var cur = snap.data();
                if (cur.status === 'completed') throw new Error('這張單已經入帳了，不能取消（庫存有誤請用「編輯棧板」或盤點調整）');
                if (cur.status === 'cancelled') throw new Error('這張單已經取消過了');
                tx.update(ref, { status: 'cancelled', cancelReason: reason || '', cancelledBy: who, cancelledAt: now });
                tasks.forEach(function(t) { if (t.data().status === 'pending') tx.update(t.ref, { status: 'cancelled', cancelledAt: now }); });
            });
        };

        window.cancelPendingInbound = async function(idx) {
            var order = (window.pendingInbounds || [])[idx];
            if (!order) return;
            var reason = prompt('取消入庫單 ' + order.docNo + '（' + order.productName + ' ' + order.quantity + ' 件）\n\n請輸入取消原因：');
            if (reason === null) return;
            try {
                await window.cancelInboundOrder(order.id, reason);
                alert('✅ 已取消，手機上的入庫任務也一併取消');
                if (typeof window.showPendingInbounds === 'function') window.showPendingInbounds();
            } catch (e) { alert('❌ 取消失敗：' + e.message); }
        };

        // 即期品主管核准區
        async function loadExpiryApprovals() {
            var box = document.getElementById('expiry-approval-section'), list = document.getElementById('expiry-approval-list');
            if (!box || !list) return;
            var snap = await window.db.collection('inboundOrders').where('expiryApproval', '==', 'pending').get();
            var rows = [];
            snap.forEach(function(d) { var o = d.data(); if (o.status !== 'cancelled') rows.push(Object.assign({ id: d.id }, o)); });
            box.classList.toggle('hidden', rows.length === 0);
            var can = window.isSupervisorRole();
            var esc = function(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
            list.innerHTML = rows.map(function(o) {
                return '<div class="flex items-center gap-3 bg-slate-900/60 rounded p-2 text-sm">' +
                    '<span class="text-blue-400 font-mono text-xs">' + esc(o.docNo) + '</span>' +
                    '<span class="text-white font-bold">' + esc(o.productName) + ' ' + esc(o.spec || '') + '</span>' +
                    '<span class="text-yellow-400">' + esc(o.quantity) + ' 件</span>' +
                    '<span class="text-red-300">效期 ' + esc(o.expDate) + '（剩 ' + window.daysUntil(o.expDate) + ' 天）</span>' +
                    '<span class="text-slate-400 text-xs">' + esc(o.createdBy || '') + '</span>' +
                    '<span class="ml-auto flex gap-2">' + (can
                        ? '<button onclick="decideExpiry(\'' + o.id + '\', true)" class="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold">同意允收</button>' +
                          '<button onclick="decideExpiry(\'' + o.id + '\', false)" class="px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-xs font-bold">拒收（取消入庫）</button>'
                        : '<span class="text-slate-500 text-xs">要主管或管理員核准</span>') + '</span></div>';
            }).join('');
        }

        window.decideExpiry = async function(orderId, ok) {
            if (!window.isSupervisorRole()) { alert('要主管或管理員才能核准即期品'); return; }
            try {
                if (ok) {
                    if (!confirm('同意允收這批即期品？\n\n同意後手機就可以上架入帳。')) return;
                    var db = window.db, ref = db.collection('inboundOrders').doc(orderId);
                    var tasks = await db.collection('inboundTasks').where('orderId', '==', orderId).get();
                    await db.runTransaction(async function(tx) {
                        var snap = await tx.get(ref);
                        if (!snap.exists || snap.data().expiryApproval !== 'pending') throw new Error('這張單已經處理過了，請重新整理');
                        var data = { expiryApproval: 'approved', expiryApprovedBy: window.currentUser.email, expiryApprovedAt: new Date().toISOString() };
                        tx.update(ref, data);
                        tasks.forEach(function(t) { tx.update(t.ref, { expiryApproval: 'approved' }); });
                    });
                    alert('✅ 已同意，手機可以上架入帳了');
                } else {
                    var reason = prompt('拒收原因：', '即期品不允收');
                    if (reason === null) return;
                    await window.cancelInboundOrder(orderId, '即期品拒收：' + reason);
                    await window.db.collection('inboundOrders').doc(orderId).update({ expiryApproval: 'rejected' });
                    alert('✅ 已拒收，入庫單與手機任務已取消');
                }
            } catch (e) { alert('❌ ' + e.message); }
            loadExpiryApprovals();
        };

        window.loadApprovalList = async function() {
            var tbody = document.getElementById('approval-list-body');
            if (!tbody) return;

            if (!window.db || !window.collection || !window.query || !window.getDocs) {
                tbody.innerHTML = '<tr><td colspan="12" class="text-center text-slate-500 py-10">Firebase 尚未初始化</td></tr>';
                return;
            }

            tbody.innerHTML = '<tr><td colspan="12" class="text-center text-slate-500 py-10"><i class="fa-solid fa-spinner fa-spin mr-2"></i>載入中...</td></tr>';

            try {
                var filter = document.getElementById('approval-status-filter').value;
                var search = (document.getElementById('approval-search').value || '').toLowerCase();

                var snapshot;
                if (filter === 'all') {
                    var q = window.query(window.collection(window.db, 'inboundOrders'), window.where('needsApproval', '==', true));
                    snapshot = await window.getDocs(q);
                } else {
                    var q = window.query(window.collection(window.db, 'inboundOrders'), window.where('approvalStatus', '==', filter));
                    snapshot = await window.getDocs(q);
                }

                window.approvalList = [];
                snapshot.forEach(function(doc) {
                    var data = { id: doc.id, ...doc.data() };
                    if (!search || data.productName.toLowerCase().includes(search) || data.docNo.toLowerCase().includes(search)) {
                        window.approvalList.push(data);
                    }
                });

                window.approvalList.sort(function(a, b) {
                    return new Date(b.createdAt) - new Date(a.createdAt);
                });

                renderApprovalList();
                loadExpiryApprovals().catch(function(e) { console.warn('載入即期品核准失敗', e); });
            } catch(e) {
                console.error('載入審核列表失敗:', e);
                tbody.innerHTML = '<tr><td colspan="12" class="text-center text-red-400 py-10">載入失敗</td></tr>';
            }
        };

        function renderApprovalList() {
            var tbody = document.getElementById('approval-list-body');
            if (!tbody) return;

            if (window.approvalList.length === 0) {
                tbody.innerHTML = '<tr><td colspan="12" class="text-center text-slate-500 py-10">無資料</td></tr>';
                return;
            }

            var html = '';
            window.approvalList.forEach(function(order, idx) {
                var statusBadge = '';
                var approvalBadge = '';

                if (order.status === 'pending') {
                    statusBadge = '<span class="badge badge-blue">待執行</span>';
                } else if (order.status === 'completed') {
                    statusBadge = '<span class="badge badge-green">已入庫</span>';
                }

                if (order.approvalStatus === 'pending') {
                    approvalBadge = '<span class="badge badge-yellow ml-1">待審核</span>';
                } else if (order.approvalStatus === 'approved') {
                    approvalBadge = '<span class="badge badge-green ml-1">已審核</span>';
                } else if (order.approvalStatus === 'rejected') {
                    approvalBadge = '<span class="badge badge-red ml-1">已駁回</span>';
                }

                var actions = '';
                if (order.approvalStatus === 'pending') {
                    actions = '<button onclick="approveInbound(' + idx + ')" class="text-emerald-400 hover:text-emerald-300 mr-2" title="審核通過"><i class="fa-solid fa-check"></i></button>';
                    actions += '<button onclick="openRejectModal(' + idx + ')" class="text-red-400 hover:text-red-300" title="駁回"><i class="fa-solid fa-times"></i></button>';
                } else if (order.approvalStatus === 'rejected') {
                    actions = '<button onclick="openEditInboundModal(' + idx + ')" class="text-blue-400 hover:text-blue-300" title="修改重送"><i class="fa-solid fa-edit"></i></button>';
                } else if (order.approvalStatus === 'approved') {
                    actions = '<span class="text-slate-500 text-xs">已完成</span>';
                }

                html += '<tr class="border-b border-slate-700 hover:bg-slate-800">';
                html += '<td class="p-3 text-blue-400 font-mono text-xs">' + order.docNo + '</td>';
                html += '<td class="p-3 text-white font-bold">' + order.productName + '</td>';
                html += '<td class="p-3">' + (order.spec || '-') + '</td>';
                html += '<td class="p-3">' + (order.batchNo || '-') + '</td>';
                html += '<td class="p-3">' + (order.expDate || '-') + '</td>';
                html += '<td class="p-3 text-right text-yellow-400 font-bold">' + order.quantity + '</td>';
                html += '<td class="p-3 text-emerald-400">' + order.locationId + '</td>';
                html += '<td class="p-3">' + (order.vendor || '-') + '</td>';
                html += '<td class="p-3 text-slate-400 text-xs">' + (order.createdBy || '-') + '</td>';
                html += '<td class="p-3 text-slate-500 text-xs">' + new Date(order.createdAt).toLocaleString() + '</td>';
                html += '<td class="p-3 text-center">' + statusBadge + approvalBadge + '</td>';
                html += '<td class="p-3 text-center">' + actions + '</td>';
                html += '</tr>';

                if (order.approvalStatus === 'rejected' && order.rejectReason) {
                    html += '<tr class="bg-red-900/20"><td colspan="12" class="p-2 text-sm">';
                    html += '<span class="text-red-400 mr-2"><i class="fa-solid fa-exclamation-triangle mr-1"></i>駁回原因：</span>';
                    html += '<span class="text-white">' + order.rejectReason + '</span>';
                    html += '</td></tr>';
                }
            });

            tbody.innerHTML = html;
        }

        window.filterApprovalList = function() {
            loadApprovalList();
        };

        window.refreshApprovalList = function() {
            loadApprovalList();
            updateApprovalCount();
        };

        window.approveInbound = async function(idx) {
            var order = window.approvalList[idx];
            if (!order) return;

            if (!confirm('確定審核通過此入庫單？\n\n單號：' + order.docNo + '\n品名：' + order.productName + '\n數量：' + order.quantity)) {
                return;
            }

            try {
                // 交易裡確認這張單還是「待審核」、而且沒被修改過（別人剛駁回或倉管剛改數量，就不能用舊畫面核准）
                await approvalTx(order, {
                    approvalStatus: 'approved',
                    approvedBy: window.currentUser ? window.currentUser.email : 'admin',
                    approvedAt: new Date().toISOString()
                });

                alert('✅ 審核通過！');
                loadApprovalList();
                updateApprovalCount();
            } catch(e) {
                alert('❌ 審核失敗：' + e.message);
            }
        };

        window.openRejectModal = function(idx) {
            var order = window.approvalList[idx];
            if (!order) return;

            document.getElementById('reject-order-id').value = order.id;
            document.getElementById('reject-reason').value = '';
            document.getElementById('reject-modal').classList.remove('hidden');
        };

        window.closeRejectModal = function() {
            document.getElementById('reject-modal').classList.add('hidden');
        };

        window.confirmReject = async function() {
            var orderId = document.getElementById('reject-order-id').value;
            var reason = document.getElementById('reject-reason').value.trim();

            if (!reason) {
                alert('請輸入駁回原因');
                return;
            }

            try {
                var shown = (window.approvalList || []).find(function(o) { return o.id === orderId; }) || { id: orderId };
                var cur = await approvalTx(shown, {
                    approvalStatus: 'rejected',
                    rejectReason: reason,
                    rejectedBy: window.currentUser ? window.currentUser.email : 'admin',
                    rejectedAt: new Date().toISOString()
                });

                // 財務核准只是對帳，不擋入帳：貨可能已經入庫了
                alert('✅ 已駁回！倉管將收到通知進行修改' + (cur.status === 'completed'
                    ? '\n\n⚠️ 此單的貨已經入帳（' + (cur.locationId || '') + '），若數量或品項有誤，庫存要另外調整。' : ''));
                closeRejectModal();
                loadApprovalList();
                updateApprovalCount();
            } catch(e) {
                alert('❌ 駁回失敗：' + e.message);
            }
        };

        window.openEditInboundModal = function(idx) {
            var order = window.approvalList[idx];
            if (!order) return;

            document.getElementById('edit-order-id').value = order.id;
            document.getElementById('edit-reject-reason').innerText = order.rejectReason || '';
            document.getElementById('edit-name').value = order.productName || '';
            document.getElementById('edit-spec').value = order.spec || '';
            document.getElementById('edit-qty').value = order.quantity || '';
            document.getElementById('edit-batch').value = order.batchNo || '';
            document.getElementById('edit-exp').value = order.expDate || '';
            document.getElementById('edit-loc').value = order.locationId || '';
            document.getElementById('edit-vendor').value = order.vendor || '';

            document.getElementById('edit-inbound-modal').classList.remove('hidden');
        };

        window.closeEditInboundModal = function() {
            document.getElementById('edit-inbound-modal').classList.add('hidden');
        };

        window.submitEditAndReapprove = async function() {
            var orderId = document.getElementById('edit-order-id').value;
            var name = document.getElementById('edit-name').value.trim();
            var qty = parseInt(document.getElementById('edit-qty').value) || 0;
            var exp = document.getElementById('edit-exp').value;

            if (!name) { alert('請輸入品名'); return; }
            if (qty <= 0) { alert('請輸入有效數量'); return; }
            if (!exp) { alert('請輸入效期'); return; }

            try {
                var db = window.db;
                var ref = db.collection('inboundOrders').doc(orderId);
                var fields = {
                    productName: name,
                    spec: document.getElementById('edit-spec').value.trim(),
                    quantity: qty,
                    batchNo: document.getElementById('edit-batch').value.trim(),
                    expDate: exp || '',
                    expiryDate: exp || '',   // 入帳時讀 expiryDate，兩個欄位都要改，不然會用舊效期
                    vendor: document.getElementById('edit-vendor').value.trim()
                };
                var editLoc = window.formatLocationId(document.getElementById('edit-loc').value);
                var pre = (await ref.get()).data() || {};
                // 已入帳的單：找出它建立的那一板（新單記在 palletDocId；舊單用板號＝入庫單號找）
                var palletRef = null;
                if (pre.status === 'completed') {
                    if (pre.palletDocId) palletRef = db.collection('pallets').doc(pre.palletDocId);
                    else if (pre.docNo) {
                        var ps = await db.collection('pallets').where('palletId', '==', pre.docNo).limit(1).get();
                        if (!ps.empty) palletRef = ps.docs[0].ref;
                    }
                }
                var tasks = pre.docNo ? await db.collection('inboundTasks').where('orderNo', '==', pre.docNo).get() : null;
                var result = await db.runTransaction(async function(tx) {
                    var snap = await tx.get(ref);
                    if (!snap.exists) throw new Error('入庫單已不存在');
                    var cur = snap.data();
                    var posted = cur.status === 'completed';
                    var pSnap = posted && palletRef ? await tx.get(palletRef) : null;
                    var stockChanged = posted && (Number(cur.quantity) !== qty || cur.productName !== name || (cur.spec || '') !== fields.spec ||
                        (cur.batchNo || '') !== fields.batchNo || window.normalizeDateValue(cur.expiryDate || cur.expDate) !== exp);
                    var note = '';
                    if (stockChanged) {
                        // 已入帳：庫存一起改（那一板已經出貨或不存在就不能改，請用盤點／編輯棧板調整）
                        if (!pSnap || !pSnap.exists) throw new Error('這張單入帳的那一板（' + (cur.docNo || '') + '）已經出貨或不存在，不能從入庫單改數量／品項；請用「編輯棧板」或盤點調整');
                        var p = pSnap.data();
                        var delta = qty - Number(cur.quantity || 0);
                        var newQty = (parseFloat(p.quantity) || 0) + delta;
                        if (newQty < 0) throw new Error('那一板現在只剩 ' + p.quantity + ' 件（已經出過貨），數量不能改少 ' + (-delta) + ' 件');
                        var pu = { productName: name, spec: fields.spec, batchNo: fields.batchNo, expiryDate: exp, expDate: exp, updatedAt: new Date().toISOString() };
                        if (delta !== 0) { pu.quantity = newQty; Object.assign(pu, window.scaledWeight(p, parseFloat(p.quantity) || 0, newQty)); }
                        tx.update(palletRef, pu);
                        tx.set(db.collection('inventoryLogs').doc(), window.buildInventoryLogEntry({
                            type: 'adjust', company: p.company || '', productName: name, spec: fields.spec, batchNo: fields.batchNo,
                            quantity: delta !== 0 ? newQty : (parseFloat(p.quantity) || 0), quantityChange: delta, locationId: p.locationId || '',
                            palletId: p.palletId || cur.docNo || '', expDate: exp,
                            note: '修改入庫單 ' + (cur.docNo || '') + '：' + [Number(cur.quantity) !== qty ? '數量 ' + cur.quantity + ' → ' + qty : '',
                                cur.productName !== name ? '品名 ' + cur.productName + ' → ' + name : '',
                                (cur.batchNo || '') !== fields.batchNo ? '批號 ' + (cur.batchNo || '-') + ' → ' + (fields.batchNo || '-') : ''].filter(Boolean).join('、')
                        }));
                        note = '\n\n庫存已同步調整：板號 ' + (p.palletId || '') + (delta !== 0 ? '（' + p.quantity + ' → ' + newQty + '）' : '');
                    }
                    var upd = Object.assign({}, fields, { approvalStatus: 'pending', resubmittedAt: new Date().toISOString() });
                    if (!posted) upd.locationId = editLoc;
                    // 重新送審：回到財務待核准清單（入帳狀態不變）
                    tx.update(ref, upd);
                    // 還沒上架的：手機入庫任務一併更新
                    if (!posted && tasks) tasks.forEach(function(d) {
                        if (d.data().status === 'pending') tx.update(d.ref, { productName: name, spec: fields.spec, quantity: qty, batchNo: fields.batchNo, expDate: exp, locationId: editLoc || d.data().locationId });
                    });
                    return note;
                });
                alert('✅ 已修改並重新送審！' + result);
                closeEditInboundModal();
                loadApprovalList();
                updateApprovalCount();
            } catch(e) {
                alert('❌ 修改失敗：' + e.message);
            }
        };

        // ========== 審核流程相關函數結束 ==========

        window.reprintInbound = function(idx) {
            var order = window.pendingInbounds[idx];
            if (order) {
                printInboundSlip(order);
            }
        };

        window.confirmSingleInbound = async function(idx) {
            var order = window.pendingInbounds[idx];
            if (!order) return;

            if (!confirm('確認此入庫單已完成？\n\n儲位：' + order.locationId + '\n品名：' + order.productName + '\n數量：' + order.quantity + '\n\n確認後將正式入帳')) {
                return;
            }

            await executeInbound(order);
        };

        window.toggleSelectAllInbound = function() {
            var selectAll = document.getElementById('select-all-inbound').checked;
            document.querySelectorAll('.inbound-checkbox').forEach(function(cb) {
                cb.checked = selectAll;
            });
        };

        window.printSelectedInbounds = function() {
            var checkboxes = document.querySelectorAll('.inbound-checkbox:checked');
            if (checkboxes.length === 0) {
                alert('請勾選要列印的入庫單');
                return;
            }

            var orders = [];
            checkboxes.forEach(function(cb) {
                var idx = parseInt(cb.dataset.idx);
                var order = window.pendingInbounds[idx];
                if (order) {
                    orders.push(order);
                }
            });

            printInboundList(orders);
        };

        window.printInboundList = function(orders) {
            var html = '<style>';
            html += '.header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 8px; border-bottom: 2px solid #000; margin-bottom: 10px; }';
            html += '.title { font-size: 28px; font-weight: bold; }';
            html += '.meta { font-size: 14px; color: #666; }';
            html += 'table { width: 100%; border-collapse: collapse; }';
            html += 'th { background: #222; color: white; padding: 10px 12px; font-size: 14px; text-align: left; white-space: nowrap; }';
            html += 'th.c { text-align: center; }';
            html += 'td { padding: 10px; border-bottom: 1px solid #ccc; font-size: 14px; font-weight: bold; white-space: nowrap; vertical-align: middle; }';
            html += 'tr:nth-child(even) { background: #f8f8f8; }';
            html += '.col-chk { width: 40px; text-align: center; }';
            html += '.col-loc { font-size: 16px; font-weight: 900; background: #eee !important; text-align: center; }';
            html += '.col-name { font-size: 16px; }';
            html += '.col-spec { font-size: 14px; color: #333; }';
            html += '.col-qty { font-size: 16px; color: #c00; text-align: center; }';
            html += '.col-batch { font-size: 12px; font-weight: normal; color: #666; }';
            html += '.col-exp { font-size: 12px; font-weight: normal; color: #666; }';
            html += '.chk { width: 18px; height: 18px; border: 2px solid #000; display: inline-block; }';
            html += '.sign-row { margin-top: 20px; display: flex; gap: 60px; justify-content: center; }';
            html += '.sign-item { display: flex; align-items: center; gap: 10px; font-size: 14px; }';
            html += '.sign-line { border-bottom: 1px solid #000; width: 100px; height: 25px; }';
            html += '</style>';

            html += '<div class="header">';
            html += '<div class="title">入庫執行清單</div>';
            html += '<div class="meta">' + new Date().toLocaleString() + '　共 ' + orders.length + ' 筆</div>';
            html += '</div>';

            html += '<table><thead><tr>';
            html += '<th class="c">✓</th>';
            html += '<th class="c">儲位</th>';
            html += '<th>品名</th>';
            html += '<th>規格</th>';
            html += '<th class="c">數量</th>';
            html += '<th>批號</th>';
            html += '<th>效期</th>';
            html += '</tr></thead><tbody>';

            orders.forEach(function(order) {
                html += '<tr>';
                html += '<td class="col-chk"><div class="chk"></div></td>';
                html += '<td class="col-loc">' + order.locationId + '</td>';
                html += '<td class="col-name">' + order.productName + '</td>';
                html += '<td class="col-spec">' + (order.spec || '-') + '</td>';
                html += '<td class="col-qty">' + order.quantity + '</td>';
                html += '<td class="col-batch">' + (order.batchNo || '-') + '</td>';
                html += '<td class="col-exp">' + (order.expDate || '-') + '</td>';
                html += '</tr>';
            });

            html += '</tbody></table>';

            html += '<div class="sign-row">';
            html += '<div class="sign-item">執行：<div class="sign-line"></div></div>';
            html += '<div class="sign-item">時間：<div class="sign-line"></div></div>';
            html += '<div class="sign-item">確認：<div class="sign-line"></div></div>';
            html += '</div>';

            openPrintPreview(html, '入庫執行清單', 1000, 800);
        };

        window.confirmSelectedInbounds = async function() {
            var checkboxes = document.querySelectorAll('.inbound-checkbox:checked');
            if (checkboxes.length === 0) {
                alert('請勾選要確認的入庫單');
                return;
            }

            if (!confirm('確認將 ' + checkboxes.length + ' 筆入庫單入帳？')) {
                return;
            }

            var success = 0;
            var fail = 0;

            for (var i = 0; i < checkboxes.length; i++) {
                var cb = checkboxes[i];
                var idx = parseInt(cb.dataset.idx);
                var order = window.pendingInbounds[idx];

                if (order) {
                    var result = await executeInbound(order, true);
                    if (result) success++;
                    else fail++;
                }
            }

            alert('✅ 批次入帳完成\n成功：' + success + ' 筆\n失敗：' + fail + ' 筆');
            loadPendingInbounds();
        };

        // 入帳一張入庫單：建立棧板、寫異動記錄、入庫單標記完成，全部在同一筆交易裡
        // （兩人同時按確認時，只會入帳一次）
        async function executeInbound(order, silent) {
            var loc = String(order.locationId || '').trim();
            if (!window.isValidStorageLocation(loc)) {
                // 例如調撥入庫單的儲位是「待指定」：詢問要放哪裡（批次入帳時先放進貨暫存區）
                if (silent) {
                    loc = 'TEMP-IN';
                } else {
                    var input = prompt('此入庫單尚未指定儲位（' + (loc || '空白') + '）\n\n請輸入儲位（例如 I-A-01-3F），或直接按確定放進貨暫存區：', 'TEMP-IN');
                    if (input === null) return false;
                    loc = input.trim().toUpperCase() || 'TEMP-IN';
                }
            }

            try {
                // 與手機版共用：建立棧板、寫異動記錄、入庫單標記完成在同一筆交易
                await window.postInboundOrderTx(order.id, loc, { note: '入庫 - ' + (order.vendor || order.source || '') });
                closeInboundTasks(order);

                if (!silent) {
                    alert('✅ 入帳成功！\n\n儲位：' + loc + '\n品名：' + order.productName);
                    loadPendingInbounds();
                }
                return true;
            } catch(e) {
                if (!silent) {
                    alert('❌ 入帳失敗：' + e.message);
                }
                return false;
            }
        }

        // 電腦入帳後，手機上對應的入庫任務一併結案（失敗不影響入帳）
        async function closeInboundTasks(order) {
            try {
                var snap = await window.db.collection('inboundTasks').where('orderNo', '==', order.docNo).get();
                await Promise.all(snap.docs.filter(function(d) { return d.data().status !== 'done'; }).map(function(d) {
                    return d.ref.update({ status: 'done', confirmedAt: new Date().toISOString(), confirmedBy: window.currentUser ? window.currentUser.email : '', note: '電腦入帳' });
                }));
            } catch (e) { console.warn('入庫任務結案失敗', e); }
        }

        // 發布入庫任務到手機（堆高機上架後掃儲位即入帳）；外倉入庫不需要
        window.publishInboundTask = async function(order) {
            if (order.isExternal) return true;
            try {
                await window.addDoc(window.collection(window.db, 'inboundTasks'), {
                    orderId: order.id || '',
                    company: order.company || '',
                    expDate: order.expDate || '',
                    approvalStatus: order.approvalStatus || '',
                    expiryApproval: order.expiryApproval || null,
                    orderNo: order.docNo,
                    palletId: order.docNo,
                    productName: order.productName,
                    spec: order.spec || '',
                    batchNo: order.batchNo || '',
                    quantity: order.quantity,
                    locationId: order.locationId,
                    status: 'pending',
                    createdAt: new Date().toISOString(),
                    createdBy: window.getOperatorName ? window.getOperatorName() : 'system'
                });
                return true;
            } catch (err) {
                console.error('發布入庫任務失敗:', err);
                return false;
            }
        };

        window.onLogin(function() { updatePendingInboundCount(); });

        window.validateLocationInput = function() {
            var input = document.getElementById('in-loc');
            // 打字中不改輸入框內容（可以打簡碼 IA011），用轉換後的儲位判斷
            var value = window.formatLocationId(input.value);

            var valid = window.isValidStorageLocation(value);

            if (value && valid) {
                input.classList.remove('border-red-500');
                input.classList.add('border-emerald-500/50');
                updateLivePreview();
            } else if (value && !valid) {
                input.classList.remove('border-emerald-500/50');
                input.classList.add('border-red-500');
            }
        };

