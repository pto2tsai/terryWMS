// ============================================================
// js/17-v56-patch.js — V56 升級補丁（包裝與覆寫前面的函數）
// 由原 app.js 第 24729–25923 行拆出；各檔依 index.html 的順序載入，共用全域（window）
// ============================================================
// ========== WMS V56.0 升級補丁 - 智能入庫+多筆模式 ==========
(function() {
    'use strict';
    
    console.log('🚀 WMS V56.0 升級補丁載入中...');

    // ========== 全域變數 ==========
    window.batchInboundList = []; // 多筆入庫清單
    
    // ========== 1. 智能入庫核心邏輯 ==========
    
    window.toggleAdvancedOptions = function() {
        var options = document.getElementById('advanced-options');
        var icon = document.getElementById('advanced-icon');
        if (!options) return;
        if (options.classList.contains('hidden')) {
            options.classList.remove('hidden');
            if (icon) { icon.classList.remove('fa-chevron-down'); icon.classList.add('fa-chevron-up'); }
        } else {
            options.classList.add('hidden');
            if (icon) { icon.classList.remove('fa-chevron-up'); icon.classList.add('fa-chevron-down'); }
        }
    };
    
    window.smartInbound = async function(mode) {
        var formData = getInboundFormData();
        if (!formData) return;
        
        // 先驗證基本資料
        if (!formData.productName) { alert('❌ 請選擇品項'); return; }
        if (!formData.quantity || formData.quantity <= 0) { alert('❌ 請填寫數量'); return; }
        if (!formData.expDate) { alert('❌ 請填寫效期'); return; }
        if (formData.productType === 'variable' && (!formData.totalWeight || formData.totalWeight <= 0)) {
            alert('❌ 不定重品請填寫總重量');
            return;
        }
        
        // 本倉入庫時檢查儲位
        if (!formData.isExternal && mode !== 'external') {
            if (!formData.locationId || formData.locationId.trim() === '') {
                alert('❌ 請選擇儲位');
                // 聚焦到儲位輸入框
                var locInput = document.getElementById('in-loc');
                if (locInput) {
                    locInput.focus();
                    locInput.classList.add('animate-pulse');
                    setTimeout(function() { locInput.classList.remove('animate-pulse'); }, 2000);
                }
                // 自動觸發智能建議
                if (typeof calculateSmartSuggest === 'function') {
                    calculateSmartSuggest();
                }
                return;
            }
        }
        
        if (formData.isExternal || mode === 'external') {
            await executeExternalInbound(formData, formData.warehouseId);
        } else if (mode === 'print') {
            await executeMainInboundWithPrint(formData);
        } else if (mode === 'direct') {
            await executeMainInboundDirect(formData);
        }
    };
    
    function getInboundFormData() {
        var name = document.getElementById('in-name').value;
        var spec = document.getElementById('in-spec').value || '';
        var batchNo = document.getElementById('in-batch').value || '';
        var vendor = document.getElementById('in-vendor').value || '';
        var exp = document.getElementById('in-exp').value || '';
        var category = document.getElementById('in-category') ? document.getElementById('in-category').value : 'Raw';
        
        var warehouseSelect = document.getElementById('in-warehouse');
        var warehouseId = warehouseSelect ? warehouseSelect.value : 'MAIN';
        var mainWarehouses = ['MAIN', 'MAIN-CONSIGN', 'MAIN-RESERVE', 'MANAGE', ''];
        var isExternal = warehouseId && mainWarehouses.indexOf(warehouseId) === -1;
        
        var locationId = '';
        if (isExternal) {
            locationId = warehouseId;
        } else {
            var locEl = document.getElementById('in-loc');
            locationId = locEl ? locEl.value : '';
        }
        
        var company = '崇文';
        var companyRadio = document.querySelector('input[name="in-company"]:checked');
        if (companyRadio) company = companyRadio.value;
        
        var productType = 'fixed';
        var typeRadio = document.querySelector('input[name="in-product-type"]:checked');
        if (typeRadio) productType = typeRadio.value;
        
        var quantity = 0, totalWeight = 0, unitWeight = 0;
        
        if (productType === 'variable') {
            quantity = parseInt(document.getElementById('in-qty-var')?.value) || 0;
            totalWeight = parseFloat(document.getElementById('in-weight')?.value) || 0;
        } else {
            quantity = parseInt(document.getElementById('in-qty')?.value) || 0;
            unitWeight = parseFloat(document.getElementById('in-unit-weight')?.value) || 0;
            if (unitWeight > 0 && quantity > 0) totalWeight = quantity * unitWeight;
        }
        
        // 品號：表單有填就用，沒填就從品項主檔依品名＋規格帶入
        var codeEl = document.getElementById('in-product-code');
        var productCode = codeEl ? codeEl.value.trim() : '';
        if (!productCode && window.productMasterData) {
            var pm = window.productMasterData.find(function(p) { return p.name === name && (p.spec || '') === spec; });
            if (pm) productCode = pm.code || '';
        }

        return { company, productCode, productName: name, spec, batchNo, vendor, expDate: exp || '', locationId, warehouseId, isExternal, category, productType, quantity, totalWeight, unitWeight };
    }
    
    function validateInboundData(data, isExternal) {
        if (!data.productName) return { valid: false, error: '請填寫品名' };
        if (!data.quantity || data.quantity <= 0) return { valid: false, error: '請填寫數量' };
        if (!data.expDate) return { valid: false, error: '請填寫效期' };
        if (!isExternal && !data.locationId) return { valid: false, error: '請選擇儲位' };
        if (data.productType === 'variable' && (!data.totalWeight || data.totalWeight <= 0)) return { valid: false, error: '不定重品請填寫總重量' };
        return { valid: true };
    }
    
    async function executeExternalInbound(data, warehouseId) {
        var whName = getWarehouseName(warehouseId);
        if (!confirm('確定入庫到外倉？\n\n倉庫：' + whName + '\n品名：' + data.productName + '\n數量：' + data.quantity)) return;
        
        try {
            var existing = (window.externalStock || []).find(s => s.warehouseId === warehouseId && s.productName === data.productName && s.batchNo === data.batchNo && s.company === data.company);
            
            if (existing) {
                await window.updateDoc(window.doc(window.db, 'externalStock', existing.id), { quantity: existing.quantity + data.quantity, totalWeight: (existing.totalWeight || 0) + data.totalWeight, updatedAt: new Date().toISOString() });
            } else {
                await window.addDoc(window.collection(window.db, 'externalStock'), { company: data.company, warehouseId, productCode: data.productCode || '', productName: data.productName, spec: data.spec, batchNo: data.batchNo, expDate: data.expDate, quantity: data.quantity, totalWeight: data.totalWeight, vendor: data.vendor, productType: data.productType, createdAt: new Date().toISOString() });
            }
            
            if (typeof window.logInventoryChange === 'function') {
                await window.logInventoryChange({ type: 'inbound', company: data.company, productName: data.productName, spec: data.spec, quantity: data.quantity, totalWeight: data.totalWeight, quantityChange: data.quantity, locationId: warehouseId, batchNo: data.batchNo, note: '外倉入庫 - ' + whName });
            }
            
            alert('✅ 外倉入庫成功！\n\n倉庫：' + whName + '\n品名：' + data.productName + '\n數量：' + data.quantity);
            if (typeof clearInboundForm === 'function') clearInboundForm();
            if (typeof loadExternalStock === 'function') loadExternalStock();
        } catch (e) { alert('❌ 入庫失敗：' + e.message); }
    }
    
    async function executeMainInboundDirect(data) {
        if (!confirm('確定入庫到 ' + data.locationId + '？\n\n品名：' + data.productName + '\n數量：' + data.quantity)) return;
        
        try {
            var now = new Date();
            var docNo = await window.nextDocNo('IN');
            
            await window.addDoc(window.collection(window.db, 'pallets'), { palletId: docNo, company: data.company, productCode: data.productCode || '', productName: data.productName, spec: data.spec, batchNo: data.batchNo, expDate: data.expDate, expiryDate: data.expDate, quantity: data.quantity, totalWeight: data.totalWeight, unitWeight: data.unitWeight, locationId: data.locationId, vendor: data.vendor, category: data.category, productType: data.productType, source: 'SmartInbound', createdAt: now.toISOString() });
            
            if (typeof window.logInventoryChange === 'function') {
                await window.logInventoryChange({ type: 'inbound', company: data.company, productName: data.productName, spec: data.spec, quantity: data.quantity, totalWeight: data.totalWeight, quantityChange: data.quantity, locationId: data.locationId, batchNo: data.batchNo, palletId: docNo, expDate: data.expDate, note: '入庫' });
            }
            
            alert('✅ 入庫成功！\n\n儲位：' + data.locationId + '\n品名：' + data.productName + '\n數量：' + data.quantity);
            if (typeof clearInboundForm === 'function') clearInboundForm();
        } catch (e) { alert('❌ 入庫失敗：' + e.message); }
    }
    
    async function executeMainInboundWithPrint(data) {
        if (!confirm('確定入庫並列印棧板插單？\n\n儲位：' + data.locationId + '\n品名：' + data.productName + '\n數量：' + data.quantity)) return;
        
        try {
            var now = new Date();
            var docNo = await window.nextDocNo('IN');
            
            await window.addDoc(window.collection(window.db, 'pallets'), { palletId: docNo, company: data.company, productCode: data.productCode || '', productName: data.productName, spec: data.spec, batchNo: data.batchNo, expDate: data.expDate, expiryDate: data.expDate, quantity: data.quantity, totalWeight: data.totalWeight, unitWeight: data.unitWeight, locationId: data.locationId, vendor: data.vendor, category: data.category, productType: data.productType, source: 'SmartInbound', createdAt: now.toISOString() });
            
            if (typeof window.logInventoryChange === 'function') {
                await window.logInventoryChange({ type: 'inbound', company: data.company, productName: data.productName, spec: data.spec, quantity: data.quantity, totalWeight: data.totalWeight, quantityChange: data.quantity, locationId: data.locationId, batchNo: data.batchNo, palletId: docNo, expDate: data.expDate, note: '入庫' });
            }
            
            if (typeof window.printInboundSlip === 'function') {
                window.printInboundSlip({ docNo, productName: data.productName, spec: data.spec, batchNo: data.batchNo, expDate: data.expDate, quantity: data.quantity, locationId: data.locationId, vendor: data.vendor });
            }
            
            alert('✅ 入庫成功！已開啟列印視窗\n\n儲位：' + data.locationId + '\n品名：' + data.productName);
            if (typeof clearInboundForm === 'function') clearInboundForm();
        } catch (e) { alert('❌ 入庫失敗：' + e.message); }
    }
    
    // ========== 2. 倉庫切換 ==========
    
    var originalOnWarehouseChange = window.onWarehouseChange;
    window.onWarehouseChange = function() {
        if (typeof originalOnWarehouseChange === 'function') originalOnWarehouseChange();
        
        var warehouseSelect = document.getElementById('in-warehouse');
        var warehouseId = warehouseSelect ? warehouseSelect.value : 'MAIN';
        var mainWarehouses = ['MAIN', 'MAIN-CONSIGN', 'MAIN-RESERVE', 'MANAGE', ''];
        var isExternal = warehouseId && mainWarehouses.indexOf(warehouseId) === -1;
        
        var mainButtons = document.getElementById('main-wh-buttons');
        var externalButtons = document.getElementById('external-wh-buttons');
        var locationSection = document.getElementById('location-section');
        var externalSection = document.getElementById('external-wh-section');
        var checkLoc = document.getElementById('check-loc');
        
        if (isExternal) {
            if (mainButtons) mainButtons.classList.add('hidden');
            if (externalButtons) externalButtons.classList.remove('hidden');
            if (locationSection) locationSection.classList.add('hidden');
            if (externalSection) externalSection.classList.remove('hidden');
            if (checkLoc) checkLoc.style.display = 'none';
            
            var whName = getWarehouseName(warehouseId);
            var titleEl = document.getElementById('inbound-wh-title');
            if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-building mr-1"></i>外倉入庫：' + whName;
        } else {
            if (mainButtons) mainButtons.classList.remove('hidden');
            if (externalButtons) externalButtons.classList.add('hidden');
            if (locationSection) locationSection.classList.remove('hidden');
            if (externalSection) externalSection.classList.add('hidden');
            if (checkLoc) checkLoc.style.display = '';
        }
        
        updateInboundButtonState();
    };
    
    function updateInboundButtonState() {
        var warehouseSelect = document.getElementById('in-warehouse');
        var warehouseId = warehouseSelect ? warehouseSelect.value : 'MAIN';
        var mainWarehouses = ['MAIN', 'MAIN-CONSIGN', 'MAIN-RESERVE', 'MANAGE', ''];
        var isExternal = warehouseId && mainWarehouses.indexOf(warehouseId) === -1;
        
        // 取得各欄位值
        var companyRadio = document.querySelector('input[name="in-company"]:checked');
        var company = companyRadio ? companyRadio.value : '';
        var name = document.getElementById('in-name')?.value;
        var exp = document.getElementById('in-exp')?.value;
        var loc = document.getElementById('in-loc')?.value;
        
        var productType = document.querySelector('input[name="in-product-type"]:checked')?.value || 'fixed';
        var qty = productType === 'variable' ? (parseInt(document.getElementById('in-qty-var')?.value) || 0) : (parseInt(document.getElementById('in-qty')?.value) || 0);
        
        // 只檢查基本資料（品名、效期、數量），儲位改為提交時檢查
        var hasBasicData = name && exp && qty > 0;
        
        var btnPrint = document.getElementById('btn-inbound-print');
        var btnDirect = document.getElementById('btn-inbound-direct');
        if (btnPrint) btnPrint.disabled = !hasBasicData;
        if (btnDirect) btnDirect.disabled = !hasBasicData;
        
        var btnExternal = document.getElementById('btn-inbound-external');
        if (btnExternal) btnExternal.disabled = !hasBasicData;
        
        // ========== 更新待確認清單（公司、品名、數量、效期、儲位）==========
        // 有值時顯示橘色，無值時顯示灰色
        
        // 公司
        var checkCompany = document.getElementById('check-company');
        if (checkCompany) {
            var hasCompany = company && company.trim() !== '';
            var icon = checkCompany.querySelector('i');
            var text = checkCompany.querySelector('span');
            if (hasCompany) {
                if (icon) icon.className = 'fa-solid fa-check-circle text-orange-400 text-[8px]';
                if (text) { text.className = 'text-orange-400 font-bold'; text.textContent = company; }
            } else {
                if (icon) icon.className = 'fa-solid fa-circle text-slate-600 text-[8px]';
                if (text) { text.className = 'text-slate-500'; text.textContent = '公司'; }
            }
        }
        
        // 品名
        var checkName = document.getElementById('check-name');
        if (checkName) {
            var hasName = name && name.trim() !== '';
            var icon = checkName.querySelector('i');
            var text = checkName.querySelector('span');
            if (hasName) {
                if (icon) icon.className = 'fa-solid fa-check-circle text-orange-400 text-[8px]';
                var displayName = name.length > 8 ? name.substring(0, 8) + '...' : name;
                if (text) { text.className = 'text-orange-400 font-bold'; text.textContent = displayName; }
            } else {
                if (icon) icon.className = 'fa-solid fa-circle text-slate-600 text-[8px]';
                if (text) { text.className = 'text-slate-500'; text.textContent = '品名'; }
            }
        }
        
        // 數量
        var checkQty = document.getElementById('check-qty');
        if (checkQty) {
            var hasQty = qty > 0;
            var icon = checkQty.querySelector('i');
            var text = checkQty.querySelector('span');
            if (hasQty) {
                if (icon) icon.className = 'fa-solid fa-check-circle text-orange-400 text-[8px]';
                if (text) { text.className = 'text-orange-400 font-bold'; text.textContent = qty + ' 件'; }
            } else {
                if (icon) icon.className = 'fa-solid fa-circle text-slate-600 text-[8px]';
                if (text) { text.className = 'text-slate-500'; text.textContent = '數量'; }
            }
        }
        
        // 效期
        var checkExp = document.getElementById('check-exp');
        if (checkExp) {
            var hasExp = exp && exp.trim() !== '';
            var icon = checkExp.querySelector('i');
            var text = checkExp.querySelector('span');
            if (hasExp) {
                if (icon) icon.className = 'fa-solid fa-check-circle text-orange-400 text-[8px]';
                // 格式化效期顯示
                var expDisplay = exp.replace(/-/g, '/').replace(/\//g, '/');
                if (text) { text.className = 'text-orange-400 font-bold'; text.textContent = expDisplay; }
            } else {
                if (icon) icon.className = 'fa-solid fa-circle text-slate-600 text-[8px]';
                if (text) { text.className = 'text-slate-500'; text.textContent = '效期'; }
            }
        }
        
        // 儲位
        var checkLoc = document.getElementById('check-loc');
        if (checkLoc && !isExternal) {
            var hasLocation = loc && loc.trim() !== '';
            var icon = checkLoc.querySelector('i');
            var text = checkLoc.querySelector('span');
            if (hasLocation) {
                if (icon) icon.className = 'fa-solid fa-check-circle text-orange-400 text-[8px]';
                if (text) { text.className = 'text-orange-400 font-bold'; text.textContent = loc; }
            } else {
                if (icon) icon.className = 'fa-solid fa-circle text-slate-600 text-[8px]';
                if (text) { text.className = 'text-slate-500'; text.textContent = '儲位'; }
            }
        } else if (checkLoc && isExternal) {
            checkLoc.style.display = 'none';
        }
    }
    
    var originalUpdateInboundProgress = window.updateInboundProgress;
    window.updateInboundProgress = function() {
        if (typeof originalUpdateInboundProgress === 'function') originalUpdateInboundProgress();
        updateInboundButtonState();
    };
    
    // ========== 3. 品項主檔整合 ==========
    
    // 更多選項切換
    window.toggleInboundMoreOptions = function() {
        var panel = document.getElementById('more-options-panel');
        var icon = document.getElementById('more-options-icon');
        var text = document.getElementById('more-options-text');
        if (!panel) return;
        
        if (panel.classList.contains('hidden')) {
            panel.classList.remove('hidden');
            if (icon) { icon.classList.remove('fa-chevron-down'); icon.classList.add('fa-chevron-up'); }
            if (text) text.textContent = '收合選項';
        } else {
            panel.classList.add('hidden');
            if (icon) { icon.classList.remove('fa-chevron-up'); icon.classList.add('fa-chevron-down'); }
            if (text) text.textContent = '更多選項';
        }
    };
    
    // 更新規格顯示文字
    window.updateSpecDisplayText = function() {
        var specEl = document.getElementById('in-spec');
        var displayRow = document.getElementById('spec-display-row');
        var displayText = document.getElementById('spec-display-text');
        
        if (specEl && displayText) {
            var spec = specEl.value;
            displayText.textContent = spec || '-';
            if (displayRow) {
                if (spec) displayRow.classList.remove('hidden');
                else displayRow.classList.add('hidden');
            }
        }
    };
    
    // 設定品項類型（定重/不定重）並更新 UI
    function setProductType(type) {
        var fixedFields = document.getElementById('fixed-weight-fields');
        var variableFields = document.getElementById('variable-weight-fields');
        var typeBadge = document.getElementById('product-type-badge');
        var badgeLabel = document.getElementById('type-badge-label');
        var unitWeightOption = document.getElementById('unit-weight-option');
        
        // 設定 radio
        var fixedRadio = document.querySelector('input[name="in-product-type"][value="fixed"]');
        var variableRadio = document.querySelector('input[name="in-product-type"][value="variable"]');
        
        if (type === 'variable') {
            // 不定重品
            if (fixedRadio) fixedRadio.checked = false;
            if (variableRadio) variableRadio.checked = true;
            if (fixedFields) fixedFields.classList.add('hidden');
            if (variableFields) variableFields.classList.remove('hidden');
            if (badgeLabel) {
                badgeLabel.textContent = '⚖️ 不定重品';
                badgeLabel.className = 'px-2 py-1 rounded text-xs font-bold bg-amber-600/20 text-amber-400 border border-amber-500/30';
            }
            if (unitWeightOption) unitWeightOption.classList.add('hidden');
        } else {
            // 定重品（預設）
            if (fixedRadio) fixedRadio.checked = true;
            if (variableRadio) variableRadio.checked = false;
            if (fixedFields) fixedFields.classList.remove('hidden');
            if (variableFields) variableFields.classList.add('hidden');
            if (badgeLabel) {
                badgeLabel.textContent = '📦 定重品';
                badgeLabel.className = 'px-2 py-1 rounded text-xs font-bold bg-blue-600/20 text-blue-400 border border-blue-500/30';
            }
            if (unitWeightOption) unitWeightOption.classList.remove('hidden');
        }
        
        // 顯示類型標籤
        if (typeBadge) typeBadge.classList.remove('hidden');
        
        // 呼叫原本的 toggleProductType（如果存在）
        if (typeof window.originalToggleProductType === 'function') {
            window.originalToggleProductType(type);
        }
    }
    
    // 保存原本的 toggleProductType
    window.originalToggleProductType = window.toggleProductType;
    window.toggleProductType = setProductType;
    
    var originalFillProductFromMaster = window.fillProductFromMaster;
    window.fillProductFromMaster = function(product) {
        var nameEl = document.getElementById('in-name');
        var specEl = document.getElementById('in-spec');
        var codeEl = document.getElementById('in-product-code');
        
        if (nameEl) nameEl.value = product.name || product.productName || '';
        if (specEl) specEl.value = product.spec || '';
        if (codeEl) codeEl.value = product.code || product.id || '';
        
        // 更新規格顯示
        updateSpecDisplayText();
        
        // 自動判斷定重/不定重
        var isVariable = product.productType === 'variable' || product.isVariable === true || product.weightType === 'variable';
        setProductType(isVariable ? 'variable' : 'fixed');
        
        // 自動填入箱容
        if (product.unitWeight) {
            var unitWeightEl = document.getElementById('in-unit-weight');
            if (unitWeightEl) unitWeightEl.value = product.unitWeight;
        }
        
        // 自動設定入庫類型
        if (product.category) {
            var categoryMap = { 'RAW': 'Raw', 'FG': 'FG', 'WIP': 'WIP', 'raw': 'Raw', 'fg': 'FG', 'wip': 'WIP' };
            var category = categoryMap[product.category] || product.category;
            var categoryEl = document.getElementById('in-category');
            if (categoryEl) categoryEl.value = category;
            
            // 更新入庫類型按鈕樣式
            if (typeof selectInboundType === 'function') {
                selectInboundType(category);
            }
        }
        
        if (typeof updateLivePreview === 'function') updateLivePreview();
        if (typeof updateInboundProgress === 'function') updateInboundProgress();
        
        // 重要：觸發智能儲位建議
        if (typeof autoTriggerSmartSuggest === 'function') {
            autoTriggerSmartSuggest();
        }
        
        // 自動跳到批號欄位
        setTimeout(function() { var batchEl = document.getElementById('in-batch'); if (batchEl) batchEl.focus(); }, 100);
    };
    
    // ========== 4. 公司別篩選外倉 ==========
    
    function updateWarehouseOptions() {
        var companyRadio = document.querySelector('input[name="in-company"]:checked');
        var company = companyRadio ? companyRadio.value : '崇文';
        
        var optgroupCW = document.getElementById('optgroup-cw');
        var optgroupBF = document.getElementById('optgroup-bf');
        if (!optgroupCW || !optgroupBF) return;
        
        if (company === '崇文') {
            optgroupCW.style.display = '';
            optgroupBF.style.display = 'none';
        } else {
            optgroupCW.style.display = 'none';
            optgroupBF.style.display = '';
        }
        
        var warehouseSelect = document.getElementById('in-warehouse');
        if (warehouseSelect) {
            var selectedOption = warehouseSelect.selectedOptions[0];
            var parent = selectedOption ? selectedOption.parentElement : null;
            if ((company === '崇文' && parent === optgroupBF) || (company === '八方' && parent === optgroupCW)) {
                warehouseSelect.value = 'MAIN';
                if (typeof onWarehouseChange === 'function') onWarehouseChange();
            }
        }
    }
    
    document.addEventListener('change', function(e) { if (e.target.name === 'in-company') updateWarehouseOptions(); });
    
    // ========== 5. 效期輸入優化 ==========
    
    function initExpiryDateInput() {
        var expInput = document.getElementById('in-exp');
        if (!expInput || expInput.dataset.enhanced === 'true') return;
        
        var newInput = document.createElement('input');
        newInput.type = 'text';
        newInput.id = 'in-exp';
        newInput.className = expInput.className;
        newInput.placeholder = 'YYYY/MM/DD';
        newInput.maxLength = 10;
        newInput.dataset.enhanced = 'true';
        
        newInput.addEventListener('input', function(e) {
            var value = e.target.value.replace(/\D/g, '');
            var formatted = '';
            if (value.length >= 4) {
                formatted = value.substring(0, 4);
                if (value.length > 4) { formatted += '/' + value.substring(4, 6); if (value.length > 6) formatted += '/' + value.substring(6, 8); }
            } else { formatted = value; }
            e.target.value = formatted;
            if (typeof updateLivePreview === 'function') updateLivePreview();
            if (typeof updateInboundProgress === 'function') updateInboundProgress();
        });
        
        if (expInput.parentNode) expInput.parentNode.replaceChild(newInput, expInput);
    }
    
    // ========== 6. 庫存編輯 ==========
    
    window.editPallet = async function(id) {
        console.log('📝 editPallet 被呼叫，ID:', id);
        
        // 先嘗試從本地快取找
        var inventory = [];
        try {
            if (typeof window.currentInventory === 'function') {
                inventory = window.currentInventory() || [];
            }
        } catch (e) {
            console.error('讀取本地庫存失敗:', e);
        }
        
        console.log('📦 本地庫存數量:', inventory.length);
        
        var item = null;
        for (var i = 0; i < inventory.length; i++) {
            if (inventory[i].id === id) {
                item = inventory[i];
                console.log('✅ 在本地找到資料:', item);
                break;
            }
        }
        
        // 如果本地找不到，從 Firebase 讀取
        if (!item) {
            console.log('⚠️ 本地找不到，嘗試從 Firebase 讀取...');
            try {
                if (window.db && window.doc && window.getDoc) {
                    var docRef = window.doc(window.db, 'pallets', id);
                    var docSnap = await window.getDoc(docRef);
                    if (docSnap.exists) {
                        item = { id: docSnap.id, ...docSnap.data() };
                        console.log('✅ 從 Firebase 讀取成功:', item);
                    } else {
                        console.log('❌ Firebase 中也找不到此文件');
                    }
                }
            } catch (e) {
                console.error('❌ Firebase 讀取失敗:', e);
            }
        }
        
        if (!item) { 
            alert('找不到此筆資料 (ID: ' + id + ')'); 
            return; 
        }
        
        // 移除舊彈窗
        var oldModal = document.getElementById('edit-pallet-modal');
        if (oldModal) oldModal.remove();
        
        // 建立彈窗容器
        var modal = document.createElement('div');
        modal.id = 'edit-pallet-modal';
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:9999;';
        
        // 建立內容區
        var content = document.createElement('div');
        content.style.cssText = 'background:#1e293b;border-radius:12px;padding:24px;width:500px;max-height:90vh;overflow:auto;border:1px solid #475569;';
        
        // 標題
        var title = document.createElement('h3');
        title.style.cssText = 'color:white;font-size:20px;font-weight:bold;margin-bottom:16px;';
        title.innerHTML = '<i class="fa-solid fa-edit" style="color:#60a5fa;margin-right:8px;"></i>編輯庫存';
        content.appendChild(title);
        
        // 表單區域
        var form = document.createElement('div');
        form.style.cssText = 'display:flex;flex-direction:column;gap:12px;';
        
        // 公司選擇
        var companyRow = document.createElement('div');
        companyRow.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:12px;';
        companyRow.innerHTML = '<div><label style="color:#94a3b8;font-size:12px;">公司</label><select id="edit-company-field" style="width:100%;padding:8px;background:#334155;border:1px solid #475569;border-radius:4px;color:white;"><option value="崇文">崇文</option><option value="八方">八方</option></select></div><div><label style="color:#94a3b8;font-size:12px;">儲位</label><input type="text" id="edit-location-field" style="width:100%;padding:8px;background:#334155;border:1px solid #475569;border-radius:4px;color:white;box-sizing:border-box;"></div>';
        form.appendChild(companyRow);
        
        // 品名
        var nameRow = document.createElement('div');
        nameRow.innerHTML = '<label style="color:#94a3b8;font-size:12px;">品名</label><input type="text" id="edit-name-field" style="width:100%;padding:8px;background:#334155;border:1px solid #475569;border-radius:4px;color:white;box-sizing:border-box;">';
        form.appendChild(nameRow);
        
        // 規格
        var specRow = document.createElement('div');
        specRow.innerHTML = '<label style="color:#94a3b8;font-size:12px;">規格</label><input type="text" id="edit-spec-field" style="width:100%;padding:8px;background:#334155;border:1px solid #475569;border-radius:4px;color:white;box-sizing:border-box;">';
        form.appendChild(specRow);
        
        // 批號和數量
        var batchQtyRow = document.createElement('div');
        batchQtyRow.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:12px;';
        batchQtyRow.innerHTML = '<div><label style="color:#94a3b8;font-size:12px;">批號</label><input type="text" id="edit-batch-field" style="width:100%;padding:8px;background:#334155;border:1px solid #475569;border-radius:4px;color:white;box-sizing:border-box;"></div><div><label style="color:#94a3b8;font-size:12px;">數量</label><input type="number" id="edit-qty-field" style="width:100%;padding:8px;background:#334155;border:1px solid #475569;border-radius:4px;color:white;box-sizing:border-box;"></div>';
        form.appendChild(batchQtyRow);
        
        // 重量和效期
        var weightExpRow = document.createElement('div');
        weightExpRow.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:12px;';
        weightExpRow.innerHTML = '<div><label style="color:#94a3b8;font-size:12px;">重量 (kg)</label><input type="number" step="0.01" id="edit-weight-field" style="width:100%;padding:8px;background:#334155;border:1px solid #475569;border-radius:4px;color:white;box-sizing:border-box;"></div><div><label style="color:#94a3b8;font-size:12px;">效期</label><input type="date" id="edit-expiry-field" style="width:100%;padding:8px;background:#334155;border:1px solid #475569;border-radius:4px;color:white;box-sizing:border-box;"></div>';
        form.appendChild(weightExpRow);
        
        content.appendChild(form);
        
        // 按鈕區
        var btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:12px;margin-top:20px;';
        
        var cancelBtn = document.createElement('button');
        cancelBtn.textContent = '取消';
        cancelBtn.style.cssText = 'flex:1;padding:10px;background:#475569;border:none;border-radius:8px;color:white;cursor:pointer;';
        cancelBtn.onclick = function() { modal.remove(); };
        
        var saveBtn = document.createElement('button');
        saveBtn.textContent = '儲存修改';
        saveBtn.style.cssText = 'flex:1;padding:10px;background:#2563eb;border:none;border-radius:8px;color:white;font-weight:bold;cursor:pointer;';
        
        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(saveBtn);
        content.appendChild(btnRow);
        
        modal.appendChild(content);
        document.body.appendChild(modal);
        
        // 設定欄位值
        document.getElementById('edit-company-field').value = item.company || '崇文';
        document.getElementById('edit-location-field').value = item.locationId || '';
        document.getElementById('edit-name-field').value = item.productName || '';
        document.getElementById('edit-spec-field').value = item.spec || '';
        document.getElementById('edit-batch-field').value = item.batchNo || '';
        document.getElementById('edit-qty-field').value = item.quantity || 0;
        document.getElementById('edit-weight-field').value = item.totalWeight || 0;
        
        // 效期處理
        if (item.expiryDate) {
            try {
                var ed = item.expiryDate.toDate ? item.expiryDate.toDate() : new Date(item.expiryDate);
                if (!isNaN(ed.getTime())) {
                    var y = ed.getFullYear();
                    var m = String(ed.getMonth() + 1).padStart(2, '0');
                    var d = String(ed.getDate()).padStart(2, '0');
                    document.getElementById('edit-expiry-field').value = y + '-' + m + '-' + d;
                }
            } catch (e) {
                console.warn('效期轉換失敗:', e);
            }
        }
        
        console.log('✅ 表單欄位已設定:', {
            company: item.company,
            location: item.locationId,
            name: item.productName,
            spec: item.spec,
            batch: item.batchNo,
            qty: item.quantity,
            weight: item.totalWeight
        });
        
        // 儲存按鈕事件
        saveBtn.onclick = async function() {
            var updateData = {
                company: document.getElementById('edit-company-field').value,
                locationId: document.getElementById('edit-location-field').value.trim(),
                productName: document.getElementById('edit-name-field').value.trim(),
                spec: document.getElementById('edit-spec-field').value.trim(),
                batchNo: document.getElementById('edit-batch-field').value.trim(),
                quantity: parseInt(document.getElementById('edit-qty-field').value) || 0,
                totalWeight: parseFloat(document.getElementById('edit-weight-field').value) || 0,
                updatedAt: new Date().toISOString()
            };
            
            if (!updateData.productName) { alert('品名不能為空'); return; }
            if (!updateData.locationId) { alert('儲位不能為空'); return; }
            
            var expiryStr = document.getElementById('edit-expiry-field').value;
            if (expiryStr) {
                updateData.expiryDate = window.normalizeDateValue(expiryStr);
                updateData.expDate = updateData.expiryDate;
            }
            updateData.locationId = updateData.locationId.toUpperCase();

            try {
                // 以交易讀最新資料、更新，並把改了什麼寫進異動記錄（原本直接覆寫、沒有記錄）
                var ref = window.doc(window.db, 'pallets', id);
                await window.db.runTransaction(async function(tx) {
                    var snap = await tx.get(ref);
                    if (!snap.exists) throw new Error('此板已不存在（可能已被其他人處理）');
                    var before = snap.data();
                    var labels = { company: '公司', locationId: '儲位', productName: '品名', spec: '規格', batchNo: '批號', quantity: '數量', totalWeight: '重量', expiryDate: '效期' };
                    var diffs = [];
                    Object.keys(labels).forEach(function(k) {
                        if (updateData[k] === undefined) return;
                        var a = k === 'expiryDate' ? window.normalizeDateValue(before.expiryDate || before.expDate) : before[k];
                        if (String(a === undefined || a === null ? '' : a) !== String(updateData[k])) {
                            diffs.push(labels[k] + ' ' + (a === undefined || a === '' ? '-' : a) + ' → ' + updateData[k]);
                        }
                    });
                    tx.update(ref, updateData);
                    if (diffs.length > 0) {
                        tx.set(window.db.collection('inventoryLogs').doc(), window.buildInventoryLogEntry({
                            type: 'adjust',
                            company: updateData.company,
                            productName: updateData.productName,
                            spec: updateData.spec,
                            batchNo: updateData.batchNo,
                            quantity: updateData.quantity,
                            quantityChange: updateData.quantity - (parseFloat(before.quantity) || 0),
                            locationId: updateData.locationId,
                            fromLocation: before.locationId || '',
                            toLocation: updateData.locationId,
                            palletId: before.palletId || id,
                            note: '庫存編輯：' + diffs.join('、')
                        }));
                    }
                });
                modal.remove();
                if (window.showNotification) {
                    showNotification('✅ 更新成功', 'success');
                } else {
                    alert('✅ 更新成功');
                }
            } catch (e) {
                alert('❌ 更新失敗：' + e.message);
            }
        };
        
        // 點擊背景關閉
        modal.onclick = function(e) {
            if (e.target === modal) modal.remove();
        };
    };
    
    // ========== 7. 外倉庫存顯示 ==========
    
    function getWarehouseName(code) {
        if (!code) return '本倉';
        var wh = (window.warehousesData || []).find(w => w.code === code);
        return wh ? wh.company + '_' + wh.name : code;
    }
    
    function checkAndRenderExternal() {
        var tbody = document.getElementById('inventory-list-body');
        if (!tbody) return;
        tbody.querySelectorAll('tr[data-type="external"]').forEach(row => row.remove());
        var externalStock = window.externalStock || [];
        if (externalStock.length === 0) return;
        
        // 建立外倉寄庫對照表（數量和客戶）
        // 外倉用 品名|規格|批號|倉庫名稱 匹配（沒有 locationId 的就是外倉）
        var extConsignedMap = {};
        var extConsignCustomerMap = {};
        if (window.consignmentData && Array.isArray(window.consignmentData)) {
            window.consignmentData.forEach(function(c) {
                if (c.status !== 'active') return;
                if (c.locationId) return; // 有 locationId 是內倉，跳過
                var warehouseName = c.sourceWarehouse || '';
                var key = (c.productName || '') + '|' + (c.spec || '') + '|' + (c.batchNo || '') + '|' + warehouseName;
                extConsignedMap[key] = (extConsignedMap[key] || 0) + (c.remainingQty || 0);
                if (c.customer) {
                    if (!extConsignCustomerMap[key]) extConsignCustomerMap[key] = [];
                    if (!extConsignCustomerMap[key].includes(c.customer)) {
                        extConsignCustomerMap[key].push(c.customer);
                    }
                }
            });
        }
        
        externalStock.forEach(function(item) {
            var expClass = 'text-slate-400';
            if (item.expDate) { var days = Math.floor((new Date(item.expDate) - new Date()) / 86400000); if (days < 0) expClass = 'text-red-500 font-bold'; else if (days < 30) expClass = 'text-orange-400'; else if (days < 90) expClass = 'text-yellow-400'; }
            var companyClass = item.company === '八方' ? 'bg-purple-900/50 text-purple-300' : 'bg-blue-900/50 text-blue-300';
            
            // 取得寄庫數量和客戶
            var whName = getWarehouseName(item.warehouseId);
            var extKey = (item.productName || '') + '|' + (item.spec || '') + '|' + (item.batchNo || '') + '|' + whName;
            var consignedQty = extConsignedMap[extKey] || 0;
            var extCustomers = extConsignCustomerMap[extKey] || [];
            var customerDisplay;
            if (extCustomers.length > 0 && consignedQty > 0) {
                customerDisplay = '<span class="text-amber-400">' + extCustomers.join(', ') + ' (' + consignedQty + ')</span>';
            } else {
                customerDisplay = '<span class="text-slate-600">-</span>';
            }
            
            var row = document.createElement('tr');
            row.className = 'border-b border-slate-700 hover:bg-slate-800 bg-teal-900/20';
            row.setAttribute('data-company', item.company || '');
            row.setAttribute('data-type', 'external');
            row.innerHTML = '<td class="p-2"><span class="px-1.5 py-0.5 rounded text-xs ' + companyClass + '">' + (item.company || '崇文') + '</span></td><td class="text-white p-2">' + (item.productName || '-') + '</td><td class="text-yellow-400 p-2">' + (item.spec || '-') + '</td><td class="text-slate-400 font-mono p-2">' + (item.batchNo || '-') + '</td><td class="text-right text-white p-2">' + (item.quantity || 0) + '</td><td class="text-right p-2">' + (item.totalWeight ? '<span class="text-amber-400">' + item.totalWeight + ' kg</span>' : '-') + '</td><td class="p-2 text-teal-400 font-mono"><span class="bg-teal-800/50 px-1.5 py-0.5 rounded text-xs mr-1">外</span>' + whName + '</td><td class="p-2 ' + expClass + '">' + (item.expDate || '-') + '</td><td class="p-2 text-sm">' + customerDisplay + '</td><td class="p-2 text-right"><button onclick="editExternalStock(\'' + item.id + '\')" class="text-blue-400 hover:text-blue-300 mr-2"><i class="fa-solid fa-edit"></i></button><button onclick="deleteExternalStock(\'' + item.id + '\')" class="text-red-500 hover:bg-red-500/20 rounded px-2"><i class="fa-solid fa-trash"></i></button></td>';
            tbody.appendChild(row);
        });
    }
    
    window.editExternalStock = async function(id) {
        var item = (window.externalStock || []).find(s => s.id === id);
        if (!item) { alert('找不到此筆資料'); return; }
        var newQty = prompt('編輯數量\n\n倉庫：' + getWarehouseName(item.warehouseId) + '\n品名：' + item.productName + '\n目前數量：' + item.quantity, item.quantity);
        if (newQty === null) return;
        var qty = parseInt(newQty);
        if (isNaN(qty) || qty < 0) { alert('請輸入有效的數量'); return; }
        if (qty === 0 && !confirm('數量為 0，是否刪除此筆資料？')) return;
        try {
            // 以交易讀最新數量，寫入差額並留下調整記錄
            var ref = window.doc(window.db, 'externalStock', id);
            await window.db.runTransaction(async function(tx) {
                var snap = await tx.get(ref);
                if (!snap.exists) throw new Error('資料已不存在（可能已被其他人處理）');
                var cur = snap.data();
                var before = parseFloat(cur.quantity) || 0;
                if (qty === 0) tx.delete(ref);
                else tx.update(ref, { quantity: qty, updatedAt: new Date().toISOString() });
                tx.set(window.db.collection('inventoryLogs').doc(), window.buildInventoryLogEntry({
                    type: 'adjust',
                    company: cur.company || '',
                    productName: cur.productName,
                    spec: cur.spec || '',
                    batchNo: cur.batchNo || '',
                    quantity: qty,
                    quantityChange: qty - before,
                    locationId: cur.warehouseId || '',
                    note: '外倉庫存手動調整：' + before + ' → ' + qty
                }));
            });
            alert('✅ 更新成功');
            await window.loadExternalStock();
        } catch (e) { alert('❌ 更新失敗：' + e.message); }
    };
    
    window.deleteExternalStock = async function(id) {
        var item = (window.externalStock || []).find(s => s.id === id);
        if (!item) { alert('找不到此筆資料'); return; }
        if (!confirm('確定刪除？\n\n倉庫：' + getWarehouseName(item.warehouseId) + '\n品名：' + item.productName + '\n數量：' + item.quantity)) return;
        try { await window.deleteDoc(window.doc(window.db, 'externalStock', id)); alert('✅ 已刪除'); await window.loadExternalStock(); } catch (e) { alert('❌ 刪除失敗：' + e.message); }
    };
    
    var originalLoadExternalStock = window.loadExternalStock;
    if (typeof originalLoadExternalStock === 'function') { window.loadExternalStock = async function() { await originalLoadExternalStock(); checkAndRenderExternal(); }; }
    setInterval(function() { var tbody = document.getElementById('inventory-list-body'); if (tbody && window.externalStock && window.externalStock.length > 0 && !tbody.querySelector('tr[data-type="external"]')) checkAndRenderExternal(); }, 2000);
    
    // ========== 8. 貨櫃入庫作業優化 ==========
    
    // 匯入方式切換
    window.switchContainerInputMode = function(mode) {
        var btnManual = document.getElementById('btn-mode-manual');
        var btnExcel = document.getElementById('btn-mode-excel');
        var manualPanel = document.getElementById('container-manual-panel');
        var excelPanel = document.getElementById('container-excel-panel');
        
        if (mode === 'excel') {
            if (btnManual) { btnManual.className = 'flex-1 py-1.5 rounded text-xs font-bold bg-slate-800 text-slate-400 hover:bg-slate-700 transition-all'; }
            if (btnExcel) { btnExcel.className = 'flex-1 py-1.5 rounded text-xs font-bold bg-emerald-600 text-white transition-all'; }
            if (manualPanel) manualPanel.classList.add('hidden');
            if (excelPanel) excelPanel.classList.remove('hidden');
        } else {
            if (btnManual) { btnManual.className = 'flex-1 py-1.5 rounded text-xs font-bold bg-cyan-600 text-white transition-all'; }
            if (btnExcel) { btnExcel.className = 'flex-1 py-1.5 rounded text-xs font-bold bg-slate-800 text-slate-400 hover:bg-slate-700 transition-all'; }
            if (manualPanel) manualPanel.classList.remove('hidden');
            if (excelPanel) excelPanel.classList.add('hidden');
        }
    };
    
    // 貨櫃入庫更多選項切換
    window.toggleContainerMoreOptions = function() {
        var panel = document.getElementById('container-more-panel');
        var icon = document.getElementById('container-more-icon');
        var text = document.getElementById('container-more-text');
        if (!panel) return;
        
        if (panel.classList.contains('hidden')) {
            panel.classList.remove('hidden');
            if (icon) { icon.classList.remove('fa-chevron-down'); icon.classList.add('fa-chevron-up'); }
            if (text) text.textContent = '收合選項';
        } else {
            panel.classList.add('hidden');
            if (icon) { icon.classList.remove('fa-chevron-up'); icon.classList.add('fa-chevron-down'); }
            if (text) text.textContent = '更多選項';
        }
    };
    
    // 設定貨櫃入庫品項類型
    function setPreProductType(type) {
        var fixedFields = document.getElementById('pre-fixed-fields');
        var variableFields = document.getElementById('pre-variable-fields');
        var typeBadge = document.getElementById('pre-product-type-badge');
        var badgeLabel = document.getElementById('pre-type-badge-label');
        var unitWeightRow = document.getElementById('pre-unit-weight-row');
        var perPalletVarRow = document.getElementById('pre-per-pallet-var-row');
        
        var fixedRadio = document.querySelector('input[name="pre-product-type"][value="fixed"]');
        var variableRadio = document.querySelector('input[name="pre-product-type"][value="variable"]');
        
        if (type === 'variable') {
            if (fixedRadio) fixedRadio.checked = false;
            if (variableRadio) variableRadio.checked = true;
            if (fixedFields) fixedFields.classList.add('hidden');
            if (variableFields) variableFields.classList.remove('hidden');
            if (badgeLabel) {
                badgeLabel.textContent = '⚖️ 不定重品';
                badgeLabel.className = 'px-2 py-1 rounded text-xs font-bold bg-amber-600/20 text-amber-400 border border-amber-500/30';
            }
            if (unitWeightRow) unitWeightRow.classList.add('hidden');
            if (perPalletVarRow) perPalletVarRow.classList.remove('hidden');
        } else {
            if (fixedRadio) fixedRadio.checked = true;
            if (variableRadio) variableRadio.checked = false;
            if (fixedFields) fixedFields.classList.remove('hidden');
            if (variableFields) variableFields.classList.add('hidden');
            if (badgeLabel) {
                badgeLabel.textContent = '📦 定重品';
                badgeLabel.className = 'px-2 py-1 rounded text-xs font-bold bg-blue-600/20 text-blue-400 border border-blue-500/30';
            }
            if (unitWeightRow) unitWeightRow.classList.remove('hidden');
            if (perPalletVarRow) perPalletVarRow.classList.add('hidden');
        }
        
        if (typeBadge) typeBadge.classList.remove('hidden');
    }
    
    // 覆寫原本的 togglePreProductType
    window.togglePreProductType = setPreProductType;
    
    // 覆寫品項選擇後填入函數（貨櫃入庫用）
    var originalFillContainerProduct = window.fillContainerProductFromMaster;
    window.fillContainerProductFromMaster = function(product) {
        console.log('📦 fillContainerProductFromMaster 被呼叫, product:', product);
        
        var nameEl = document.getElementById('pre-name');
        var specEl = document.getElementById('pre-spec');
        var codeEl = document.getElementById('pre-product-code');
        
        if (nameEl) nameEl.value = product.name || product.productName || '';
        if (specEl) specEl.value = product.spec || '';
        if (codeEl) codeEl.value = product.code || product.id || '';
        
        // 自動判斷定重/不定重
        var isVariable = product.weightType === 'variable' || product.productType === 'variable' || product.isVariable === true;
        setPreProductType(isVariable ? 'variable' : 'fixed');
        
        // 自動填入箱容
        if (product.unitWeight) {
            var unitWeightEl = document.getElementById('pre-unit-weight');
            if (unitWeightEl) unitWeightEl.value = product.unitWeight;
        }
        
        // 🔧 修正：自動填入每板數（從品項主檔的板容量），確保一定會設定值
        var perPalletEl = document.getElementById('pre-per-pallet');
        var perPalletVarEl = document.getElementById('pre-per-pallet-var');
        var palletCapacityValue = parseInt(product.palletCapacity) || 40;
        
        console.log('📦 設定每板件數: ' + palletCapacityValue + ' (原始值: ' + product.palletCapacity + ')');
        
        if (perPalletEl) {
            perPalletEl.value = palletCapacityValue;
            console.log('📦 pre-per-pallet 設定為: ' + perPalletEl.value);
        }
        if (perPalletVarEl) {
            perPalletVarEl.value = palletCapacityValue;
            console.log('📦 pre-per-pallet-var 設定為: ' + perPalletVarEl.value);
        }
        
        // 更新 checklist 和智能建議
        if (typeof updateContainerChecklist === 'function') {
            updateContainerChecklist();
        }
        if (typeof calculateContainerSmartSuggest === 'function') {
            calculateContainerSmartSuggest();
        }
        
        // 自動跳到批號欄位
        setTimeout(function() { var batchEl = document.getElementById('pre-batch'); if (batchEl) batchEl.focus(); }, 100);
    };
    
    // 擴展 openProductSelectModal 以支援貨櫃入庫
    var originalOpenProductSelectModal = window.openProductSelectModal;
    window.openProductSelectModal = function(source) {
        window.productSelectSource = source;
        if (typeof originalOpenProductSelectModal === 'function') {
            originalOpenProductSelectModal(source);
        }
    };
    
    // 擴展品項選擇確認函數 - 修正參數格式匹配
    var originalSelectProductFromModal = window.selectProductFromModal;
    window.selectProductFromModal = function(code, name, spec, palletCapacity, shelfLife) {
        console.log('📦 selectProductFromModal 被呼叫 - code:', code, 'name:', name, 'palletCapacity:', palletCapacity);
        
        var source = window.productSelectSource || 'inbound';
        console.log('📦 source:', source);
        
        // 從品項主檔取得完整資料
        var productData = (window.productMasterData || []).find(function(p) {
            return p.code === code || p.name === name;
        }) || {};
        
        console.log('📦 productData:', productData);
        console.log('📦 productData.palletCapacity:', productData.palletCapacity);
        
        // 🔧 修正：確保 palletCapacity 是數字
        var finalPalletCapacity = parseInt(palletCapacity) || parseInt(productData.palletCapacity) || 40;
        console.log('📦 finalPalletCapacity:', finalPalletCapacity);
        
        // 建立完整的 product 物件
        var product = {
            code: code,
            name: name,
            spec: spec,
            palletCapacity: finalPalletCapacity,
            shelfLife: shelfLife || productData.shelfLife || 24,
            weightType: productData.weightType || 'fixed',
            inboundType: productData.inboundType || 'Raw',
            unitWeight: productData.unitWeight || 0,
            category: productData.category || ''
        };
        
        if (source === 'container') {
            if (typeof window.fillContainerProductFromMaster === 'function') {
                window.fillContainerProductFromMaster(product);
            } else {
                // 降級處理：直接填入基本欄位
                console.log('📦 降級處理被執行, product:', product);
                var nameEl = document.getElementById('pre-name');
                var specEl = document.getElementById('pre-spec');
                var codeEl = document.getElementById('pre-product-code');
                if (nameEl) nameEl.value = name || '';
                if (specEl) specEl.value = spec || '';
                if (codeEl) codeEl.value = code || '';
                
                // 🔧 修正：降級處理也要設定每板件數
                var perPalletEl = document.getElementById('pre-per-pallet');
                var perPalletVarEl = document.getElementById('pre-per-pallet-var');
                var palletCapacityValue = parseInt(product.palletCapacity) || 40;
                if (perPalletEl) perPalletEl.value = palletCapacityValue;
                if (perPalletVarEl) perPalletVarEl.value = palletCapacityValue;
                console.log('📦 降級處理設定每板件數: ' + palletCapacityValue);
                
                // 觸發 checklist 和智能建議更新
                if (typeof updateContainerChecklist === 'function') {
                    updateContainerChecklist();
                }
                if (typeof calculateContainerSmartSuggest === 'function') {
                    calculateContainerSmartSuggest();
                }
            }
        } else {
            if (typeof window.fillProductFromMaster === 'function') {
                window.fillProductFromMaster(product);
            } else {
                // 降級處理：直接填入基本欄位
                var nameEl = document.getElementById('in-name');
                var specEl = document.getElementById('in-spec');
                var codeEl = document.getElementById('in-product-code');
                if (nameEl) nameEl.value = name || '';
                if (specEl) specEl.value = spec || '';
                if (codeEl) codeEl.value = code || '';
                if (typeof updateLivePreview === 'function') updateLivePreview();
                if (typeof updateInboundProgress === 'function') updateInboundProgress();
            }
            // 重要：觸發智能儲位建議
            if (typeof autoTriggerSmartSuggest === 'function') {
                autoTriggerSmartSuggest();
            }
        }
        
        // 關閉 modal - 支援兩種 modal ID
        if (typeof closeProductSelectModal === 'function') {
            closeProductSelectModal();
        } else {
            var modal = document.getElementById('modal-product-select') || document.getElementById('product-select-modal');
            if (modal) modal.classList.add('hidden');
        }
    };
    
    // ========== 9. 初始化 ==========
    
    function init() {
        initExpiryDateInput();
        updateWarehouseOptions();
        setTimeout(function() { if (typeof onWarehouseChange === 'function') onWarehouseChange(); }, 1000);
    }
    
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); }
    else { setTimeout(init, 500); }
    
    console.log('✅ WMS V56.0 升級補丁載入完成');
    console.log('📋 更新內容：');
    console.log('   - 智能入庫流程優化');
    console.log('   - 貨櫃入庫作業優化');
    console.log('   - 品項主檔整合（自動判斷定重/不定重）');
    console.log('   - 公司別篩選外倉');
    console.log('   - 效期輸入優化');

    // ========== 9. 開發者工具函數 ==========
    
    // 清除單一 localStorage 項目
    window.clearLocalStorageItem = function(key) {
        if (!confirm('確定要清除「' + key + '」的資料嗎？')) return;
        
        localStorage.removeItem(key);
        showNotification('✅ 已清除 ' + key, 'success');
        refreshDevToolsStats();
    };
    
    // 清除所有本地資料
    window.clearAllLocalStorage = function() {
        if (!confirm('⚠️ 警告：這將清除所有本地資料！\n\n包括任務清單、波次資料、暫存設定等。\n\n確定要繼續嗎？')) return;
        if (!confirm('再次確認：這個操作無法復原！')) return;
        
        var wmsKeys = [];
        for (var i = 0; i < localStorage.length; i++) {
            var key = localStorage.key(i);
            if (key && key.indexOf('wms') !== -1) {
                wmsKeys.push(key);
            }
        }
        
        wmsKeys.forEach(function(key) {
            localStorage.removeItem(key);
        });
        
        showNotification('✅ 已清除所有本地 WMS 資料（' + wmsKeys.length + ' 項）', 'success');
        refreshDevToolsStats();
    };
    
    // 清除 Firebase 集合
    window.clearFirebaseCollection = async function(collectionName) {
        if (!window.db || !window.collection || !window.getDocs || !window.deleteDoc || !window.doc) {
            alert('Firebase 尚未初始化');
            return;
        }
        
        var displayNames = {
            'dispatchOrders': '調度工單',
            'waves': '波次資料',
            'pendingInbound': '待入庫工單',
            'inventoryLogs': '庫存異動紀錄',
            'pallets': '庫存資料'
        };
        
        var displayName = displayNames[collectionName] || collectionName;
        
        if (!confirm('⚠️ 警告：這將清除雲端「' + displayName + '」的所有資料！\n\n這個操作無法復原！\n\n確定要繼續嗎？')) return;
        if (!confirm('再次確認：確定要刪除雲端「' + displayName + '」嗎？')) return;
        
        try {
            var snapshot = await window.getDocs(window.collection(window.db, collectionName));
            var count = 0;
            
            for (var docSnap of snapshot.docs) {
                await window.deleteDoc(window.doc(window.db, collectionName, docSnap.id));
                count++;
            }
            
            showNotification('✅ 已清除 ' + displayName + '（' + count + ' 筆）', 'success');
            
            // 重新載入相關資料
            if (collectionName === 'pallets' && typeof window.loadInventory === 'function') {
                window.loadInventory();
            }
            
            refreshDevToolsStats();
        } catch (e) {
            alert('清除失敗：' + e.message);
        }
    };
    
    // 重新整理開發者工具統計
    window.refreshDevToolsStats = async function() {
        // 本地庫存
        var localInv = JSON.parse(localStorage.getItem('wms_inventory') || '[]');
        var localInvEl = document.getElementById('dev-local-inv-count');
        if (localInvEl) localInvEl.textContent = localInv.length;
        
        // 本地任務
        var localTasks = JSON.parse(localStorage.getItem('wms_dispatch_orders') || '[]');
        var localTaskEl = document.getElementById('dev-local-task-count');
        if (localTaskEl) localTaskEl.textContent = localTasks.length;
        
        // 雲端統計
        if (window.db && window.collection && window.getDocs) {
            try {
                var palletSnap = await window.getDocs(window.collection(window.db, 'pallets'));
                var cloudInvEl = document.getElementById('dev-cloud-inv-count');
                if (cloudInvEl) cloudInvEl.textContent = palletSnap.size;
                
                var taskSnap = await window.getDocs(window.collection(window.db, 'dispatchOrders'));
                var cloudTaskEl = document.getElementById('dev-cloud-task-count');
                if (cloudTaskEl) cloudTaskEl.textContent = taskSnap.size;
            } catch (e) {
                var cloudInvEl = document.getElementById('dev-cloud-inv-count');
                var cloudTaskEl = document.getElementById('dev-cloud-task-count');
                if (cloudInvEl) cloudInvEl.textContent = '錯誤';
                if (cloudTaskEl) cloudTaskEl.textContent = '錯誤';
            }
        } else {
            var cloudInvEl = document.getElementById('dev-cloud-inv-count');
            var cloudTaskEl = document.getElementById('dev-cloud-task-count');
            if (cloudInvEl) cloudInvEl.textContent = 'N/A';
            if (cloudTaskEl) cloudTaskEl.textContent = 'N/A';
        }
    };

})();


