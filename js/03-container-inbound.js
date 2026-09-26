// ============================================================
// js/03-container-inbound.js — 貨櫃入庫與智能儲位分配
// 由原 app.js 第 2075–4409 行拆出；各檔依 index.html 的順序載入，共用全域（window）
// ============================================================
        // ========== 貨櫃入庫作業 ==========

        window._containerData = {
            items: [],
            labels: []
        };

        // 效期快捷設定函數
        window.setPreExpDate = function(days) {
            var date = new Date();
            date.setDate(date.getDate() + days);
            var year = date.getFullYear().toString();
            var month = (date.getMonth() + 1).toString().padStart(2, '0');
            var day = date.getDate().toString().padStart(2, '0');
            
            document.getElementById('pre-exp-year').value = year;
            document.getElementById('pre-exp-month').value = month;
            document.getElementById('pre-exp-day').value = day;
            document.getElementById('pre-exp').value = year + '-' + month + '-' + day;
            updateContainerChecklist();
        };

        // 分段日期輸入 - 自動跳位
        window.autoJumpPreExp = function(input, field) {
            var value = input.value.replace(/\D/g, ''); // 只保留數字
            input.value = value;
            
            if (field === 'year' && value.length === 4) {
                document.getElementById('pre-exp-month').focus();
                document.getElementById('pre-exp-month').select();
            } else if (field === 'month') {
                // 自動補零並跳位
                if (value.length === 1 && parseInt(value) > 1) {
                    input.value = '0' + value;
                    document.getElementById('pre-exp-day').focus();
                    document.getElementById('pre-exp-day').select();
                } else if (value.length === 2) {
                    document.getElementById('pre-exp-day').focus();
                    document.getElementById('pre-exp-day').select();
                }
            } else if (field === 'day') {
                // 自動補零並跳位
                if (value.length === 1 && parseInt(value) > 3) {
                    input.value = '0' + value;
                    document.getElementById('pre-qty').focus();
                } else if (value.length === 2) {
                    document.getElementById('pre-qty').focus();
                }
            }
            
            updatePreExpValue();
            updateContainerChecklist();
        };

        // 處理鍵盤事件（Backspace 返回上一欄、Enter 跳到數量）
        window.handlePreExpKeydown = function(event, field) {
            if (event.key === 'Backspace') {
                var input = event.target;
                if (input.value === '' || input.selectionStart === 0) {
                    event.preventDefault();
                    if (field === 'month') {
                        var yearInput = document.getElementById('pre-exp-year');
                        yearInput.focus();
                        yearInput.setSelectionRange(yearInput.value.length, yearInput.value.length);
                    } else if (field === 'day') {
                        var monthInput = document.getElementById('pre-exp-month');
                        monthInput.focus();
                        monthInput.setSelectionRange(monthInput.value.length, monthInput.value.length);
                    }
                }
            } else if (event.key === 'Enter') {
                event.preventDefault();
                document.getElementById('pre-qty').focus();
            } else if (event.key === 'ArrowRight' && event.target.selectionStart === event.target.value.length) {
                if (field === 'year') {
                    document.getElementById('pre-exp-month').focus();
                } else if (field === 'month') {
                    document.getElementById('pre-exp-day').focus();
                }
            } else if (event.key === 'ArrowLeft' && event.target.selectionStart === 0) {
                if (field === 'month') {
                    document.getElementById('pre-exp-year').focus();
                } else if (field === 'day') {
                    document.getElementById('pre-exp-month').focus();
                }
            }
        };

        // 組合分段日期為完整日期值
        window.updatePreExpValue = function() {
            var year = document.getElementById('pre-exp-year').value;
            var month = document.getElementById('pre-exp-month').value.padStart(2, '0');
            var day = document.getElementById('pre-exp-day').value.padStart(2, '0');
            
            if (year.length === 4 && month.length === 2 && day.length === 2) {
                document.getElementById('pre-exp').value = year + '-' + month + '-' + day;
            } else {
                document.getElementById('pre-exp').value = '';
            }
        };

        // 從日期字串設定分段欄位（用於從 Excel 匯入）
        window.setPreExpFromString = function(dateStr) {
            if (!dateStr) {
                document.getElementById('pre-exp-year').value = '';
                document.getElementById('pre-exp-month').value = '';
                document.getElementById('pre-exp-day').value = '';
                document.getElementById('pre-exp').value = '';
                return;
            }
            
            // 支援多種格式：2027-01-08, 2027/01/08, 20270108
            var normalized = dateStr.replace(/[\/\-]/g, '');
            if (normalized.length === 8) {
                var year = normalized.substring(0, 4);
                var month = normalized.substring(4, 6);
                var day = normalized.substring(6, 8);
                document.getElementById('pre-exp-year').value = year;
                document.getElementById('pre-exp-month').value = month;
                document.getElementById('pre-exp-day').value = day;
                document.getElementById('pre-exp').value = year + '-' + month + '-' + day;
            }
        };

        window.downloadTemplate = function(type) {
            if (type === 'container' || type === 'pre') {
                var wb = XLSX.utils.book_new();
                var data = [
                    ['進口公司', '廠商', '品名', '規格', '批號', '效期', '數量', '每板數', '類型', '箱容kg', '總重量kg'],
                    ['八方', '傳鮮', '熟白蝦 50/60', '1.1KG*8盒', 'B240301', '2025/12/31', 400, 50, '定重', 10, ''],
                    ['八方', '傳鮮', '花枝圈', '300g*10包', 'B240302', '2025/11/30', 200, 40, '定重', 3, ''],
                    ['崇文', '海洋', '船凍透抽', '40/60', 'B240303', '2025/10/31', 50, 50, '不定重', '', 1250],
                    ['崇文', '海洋', '魷魚原料', '-', 'B240304', '2025/09/30', 30, 30, '不定重', '', 680]
                ];
                var ws = XLSX.utils.aoa_to_sheet(data);
                ws['!cols'] = [{wch:10},{wch:10},{wch:20},{wch:15},{wch:12},{wch:12},{wch:8},{wch:8},{wch:8},{wch:8},{wch:10}];
                XLSX.utils.book_append_sheet(wb, ws, '入庫清單');
                XLSX.writeFile(wb, '貨櫃入庫範本.xlsx');
            } else if (type === 'stock') {
                var wb = XLSX.utils.book_new();
                var data = [
                    ['進口公司', '品名', '規格', '批號', '效期', '數量', '儲位', '類型', '箱容kg', '總重量kg', '條碼'],
                    ['崇文', '熟白蝦', '50/60 1.1KG', 'B240101', '2025/06/30', 50, 'I-A-01-3F', '定重', 10, '', 'IN-20250624-001'],
                    ['八方', '船凍透抽', '40/60', 'B240201', '2025/08/31', 30, 'I-A-02-3F', '不定重', '', 750, 'IN-20250624-002']
                ];
                var ws = XLSX.utils.aoa_to_sheet(data);
                ws['!cols'] = [{wch:10},{wch:15},{wch:15},{wch:12},{wch:12},{wch:8},{wch:12},{wch:8},{wch:8},{wch:10},{wch:18}];
                XLSX.utils.book_append_sheet(wb, ws, '庫存');
                XLSX.writeFile(wb, '期初庫存範本.xlsx');
            }
        };

        window.handleContainerImport = function(event) {
            var file = event.target.files[0];
            if (!file) return;

            var reader = new FileReader();
            reader.onload = function(e) {
                var data = new Uint8Array(e.target.result);
                var workbook = XLSX.read(data, { type: 'array', cellDates: true });
                var sheet = workbook.Sheets[workbook.SheetNames[0]];
                var rows = XLSX.utils.sheet_to_json(sheet, { raw: false, dateNF: 'yyyy-mm-dd' });

                var importCount = 0;
                var validationErrors = [];
                rows.forEach(function(row, rowIdx) {
                    var qty = parseInt(row['數量']) || 0;
                    var productName = row['品名'] || '';

                    var rowErrors = [];
                    if (!productName) rowErrors.push('品名不可空白');
                    if (qty <= 0) rowErrors.push('數量須為正整數');
                    if (!(row['批號'] || '')) rowErrors.push('批號不可空白');
                    if (!(row['效期'] || '')) rowErrors.push('效期不可空白');
                    var companyRaw = row['進口公司'] || row['公司'] || '';
                    if (companyRaw && companyRaw !== '崇文' && companyRaw !== '八方') rowErrors.push('進口公司只能是「崇文」或「八方」');
                    if (rowErrors.length > 0) {
                        validationErrors.push({ row: rowIdx + 2, errors: rowErrors, name: productName || '(空白)' });
                        return;
                    }

                    var productCode = row['品號'] || row['產品編號'] || '';
                    var pmItem = null;
                    if (productCode && window.productMasterData) pmItem = window.productMasterData.find(function(p) { return p.code === productCode; });
                    if (!pmItem && productName && window.productMasterData) pmItem = window.productMasterData.find(function(p) { return p.name === productName; });
                    if (pmItem && !productCode) productCode = pmItem.code || '';
                    
                    // 優先從 Excel 讀取每板數，否則從品項主檔讀取，最後才用預設值
                    var perPallet = parseInt(row['每板數']) || 0;
                    if (!perPallet && productName) {
                        // 從品項主檔查詢板容量
                        var master = (window.productMasterData || []).find(function(p) {
                            return p.name === productName;
                        });
                        if (master && master.palletCapacity) {
                            perPallet = master.palletCapacity;
                        }
                    }
                    // 如果還是沒有，使用預設值 40
                    if (!perPallet) perPallet = 40;

                    var productType = 'fixed';
                    var unitWeight = parseFloat(row['箱容kg']) || 0;
                    var totalWeight = parseFloat(row['總重量kg']) || 0;

                    if (row['類型']) {
                        productType = (row['類型'] === '不定重' || row['類型'] === 'variable') ? 'variable' : 'fixed';
                    } else if (totalWeight > 0 && unitWeight === 0) {
                        productType = 'variable';
                    }

                    if (productType === 'fixed') {
                        totalWeight = qty * unitWeight;
                    } else {
                        unitWeight = qty > 0 ? Math.round(totalWeight / qty * 100) / 100 : 0;
                    }
                    
                    // 處理效期格式
                    var expiryDate = row['效期'] || '';
                    if (expiryDate) {
                        // 如果是 Date 物件，轉換為 YYYY-MM-DD
                        if (expiryDate instanceof Date) {
                            expiryDate = expiryDate.toLocalYMD();
                        } else if (typeof expiryDate === 'number') {
                            // Excel 序列號轉日期
                            var date = new Date((expiryDate - 25569) * 86400 * 1000);
                            expiryDate = date.toLocalYMD();
                        } else if (typeof expiryDate === 'string') {
                            // 嘗試解析各種格式
                            // 格式：2025/12/31 或 2025-12-31 或 12/31/2025
                            var parsed = null;
                            if (/^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}$/.test(expiryDate)) {
                                // 2025-12-31 或 2025/12/31
                                parsed = expiryDate.replace(/\//g, '-');
                            } else if (/^\d{1,2}[-\/]\d{1,2}[-\/]\d{4}$/.test(expiryDate)) {
                                // 12/31/2025 或 12-31-2025
                                var parts = expiryDate.split(/[-\/]/);
                                parsed = parts[2] + '-' + parts[0].padStart(2,'0') + '-' + parts[1].padStart(2,'0');
                            }
                            if (parsed) expiryDate = parsed;
                        }
                    }
                    
                    // 讀取進口公司欄位（支援多種欄位名稱）
                    var company = row['進口公司'] || row['公司'] || row['Company'] || '';
                    // 如果沒有公司欄位，預設為崇文
                    if (!company) company = '崇文';

                    var item = {
                        id: 'CI-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
                        company: company,
                        vendor: row['廠商'] || '',
                        productName: productName,
                        spec: row['規格'] || '',
                        batchNo: row['批號'] || '',
                        expiryDate: expiryDate,
                        quantity: qty,
                        perPallet: perPallet,
                        palletCount: Math.ceil(qty / perPallet),
                        productType: productType,
                        unitWeight: unitWeight,
                        totalWeight: totalWeight
                    };

                    if (item.productName && item.quantity > 0) {
                        window._containerData.items.push(item);
                        importCount++;
                    }
                });

                renderContainerItems();

                if (importCount > 0) {
                    autoGenerateLabels();
                }

                var msg = '✅ 匯入成功：' + importCount + ' 筆品項';
                if (validationErrors.length > 0) {
                    msg += '\n\n⚠️ 有 ' + validationErrors.length + ' 筆資料有誤已跳過：';
                    validationErrors.slice(0, 10).forEach(function(ve) {
                        msg += '\n  第 ' + ve.row + ' 行 [' + ve.name + ']：' + ve.errors.join('、');
                    });
                    if (validationErrors.length > 10) msg += '\n  ... 還有 ' + (validationErrors.length - 10) + ' 筆';
                }
                alert(msg);
            };
            reader.readAsArrayBuffer(file);
            event.target.value = '';
        };

        window.togglePreProductType = function(type) {
            var fixedFields = document.getElementById('pre-fixed-fields');
            var variableFields = document.getElementById('pre-variable-fields');

            if (type === 'fixed') {
                fixedFields.classList.remove('hidden');
                variableFields.classList.add('hidden');
            } else {
                fixedFields.classList.add('hidden');
                variableFields.classList.remove('hidden');
            }
        };

        window.getPreProductType = function() {
            var radio = document.querySelector('input[name="pre-product-type"]:checked');
            return radio ? radio.value : 'fixed';
        };

        window.addContainerItem = function() {
            var companyRadio = document.querySelector('input[name="pre-company"]:checked');
            var company = companyRadio ? companyRadio.value : '崇文';

            var vendor = document.getElementById('pre-vendor').value.trim();
            var name = document.getElementById('pre-name').value.trim();
            var spec = document.getElementById('pre-spec').value.trim();
            var batch = document.getElementById('pre-batch').value.trim();
            var exp = document.getElementById('pre-exp').value;

            var productType = getPreProductType();
            var qty, perPallet, unitWeight, totalWeight;

            if (productType === 'fixed') {
                qty = parseInt(document.getElementById('pre-qty').value) || 0;
                var perPalletRaw = document.getElementById('pre-per-pallet').value;
                perPallet = parseInt(perPalletRaw) || 40;
                unitWeight = parseFloat(document.getElementById('pre-unit-weight').value) || 0;
                totalWeight = qty * unitWeight;
                console.log('📦 addContainerItem [定重] - pre-per-pallet 原始值: "' + perPalletRaw + '" → 解析為: ' + perPallet);
            } else {
                qty = parseInt(document.getElementById('pre-qty-var').value) || 0;
                totalWeight = parseFloat(document.getElementById('pre-total-weight').value) || 0;
                var perPalletVarRaw = document.getElementById('pre-per-pallet-var').value;
                perPallet = parseInt(perPalletVarRaw) || 40;
                unitWeight = qty > 0 ? Math.round(totalWeight / qty * 100) / 100 : 0;
                console.log('📦 addContainerItem [不定重] - pre-per-pallet-var 原始值: "' + perPalletVarRaw + '" → 解析為: ' + perPallet);
            }

            if (!name) { alert('請輸入品名'); return false; }
            if (qty <= 0) { alert('請輸入數量'); return false; }
            if (!batch) { alert('請輸入批號'); return false; }
            if (!exp) { alert('請選擇效期'); return false; }
            if (productType === 'variable' && totalWeight <= 0) { alert('不定重品請輸入總重量'); return false; }

            var productCode = '';
            if (window.productMasterData) {
                var pmItem = window.productMasterData.find(function(p) { return p.name === name; });
                if (pmItem) productCode = pmItem.code || '';
            }

            var palletCount = Math.ceil(qty / perPallet);
            console.log('📦 addContainerItem 建立品項 - 品名: ' + name + ', 數量: ' + qty + ', 每板件數: ' + perPallet + ', 板數: ' + palletCount);

            var item = {
                id: 'CI-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
                company: company,
                vendor: vendor,
                productName: name,
                spec: spec,
                batchNo: batch,
                expiryDate: exp,
                quantity: qty,
                perPallet: perPallet,
                palletCount: palletCount,
                productType: productType,
                unitWeight: unitWeight,
                totalWeight: totalWeight
            };

            window._containerData.items.push(item);
            renderContainerItems();

            document.getElementById('pre-name').value = '';
            document.getElementById('pre-spec').value = '';
            document.getElementById('pre-batch').value = '';
            document.getElementById('pre-qty').value = '';
            document.getElementById('pre-unit-weight').value = '';
            document.getElementById('pre-qty-var').value = '';
            document.getElementById('pre-total-weight').value = '';
            // 🔧 重置每板件數為預設值
            document.getElementById('pre-per-pallet').value = '40';
            document.getElementById('pre-per-pallet-var').value = '40';

            return true;
        };

        window.addContainerItemAndGenerate = function() {
            console.log('📦 addContainerItemAndGenerate 被呼叫');
            var success = addContainerItem();
            console.log('📦 addContainerItem 結果:', success);
            if (success) {
                console.log('📦 品項數量:', window._containerData.items.length);
                autoGenerateLabels();
                console.log('📦 標籤數量:', (window._containerData.labels || []).length);
                
                // 確保按鈕啟用
                enableContainerButtons();
            }
        };
        
        // 強制啟用按鈕的輔助函數
        window.enableContainerButtons = function() {
            var labels = window._containerData.labels || [];
            var btnPrint = document.getElementById('btn-print-labels');
            var btnConfirm = document.getElementById('btn-confirm-inbound');
            
            if (labels.length > 0) {
                if (btnPrint) {
                    btnPrint.disabled = false;
                    btnPrint.classList.remove('disabled:bg-slate-700', 'disabled:cursor-not-allowed');
                    console.log('✅ 列印按鈕已啟用, labels:', labels.length);
                }
                if (btnConfirm) {
                    btnConfirm.disabled = false;
                    btnConfirm.classList.remove('disabled:bg-slate-700', 'disabled:cursor-not-allowed');
                    console.log('✅ 確認按鈕已啟用');
                }
            }
        };

        // 估計需要的板數，事先保留棧板編號（號碼池不足時 generatePalletNo 會改發臨時號碼）
        function countContainerPallets(items) {
            var needed = 0;
            items.forEach(function(item) {
                var perPallet = parseInt(item.perPallet) || 40;
                needed += parseInt(item.palletCount) || Math.ceil((parseInt(item.quantity) || 0) / perPallet) || 1;
            });
            return needed + 5;
        }

        function docNoPoolSize(type) {
            return (window._docNoPool[docNoKey(type)] || []).length;
        }

        // 號碼池足夠時同步產生標籤（跟以前一樣）；不足時先向 Firestore 保留號碼再產生
        window.autoGenerateLabels = function() {
            var needed = countContainerPallets(window._containerData.items);
            if (docNoPoolSize('IN') >= needed) return doAutoGenerateLabels();
            return window.ensureDocNoPool('IN', needed).then(doAutoGenerateLabels);
        };

        function doAutoGenerateLabels() {
            var items = window._containerData.items;
            console.log('🏷️ autoGenerateLabels 被呼叫, items:', items.length);
            
            if (items.length === 0) {
                window._containerData.labels = [];
                renderContainerLabels();
                updateContainerStepState();
                return;
            }

            var strategy = document.getElementById('container-strategy').value;

            var selectedZones = [];
            document.querySelectorAll('.container-zone-cb:checked').forEach(function(cb) {
                selectedZones.push(cb.value);
            });

            if (selectedZones.length === 0) {
                selectedZones = ['A', 'B'];
            }

            console.log('🏷️ 開始自動分配儲位，品項數:', items.length, '區域:', selectedZones, '策略:', strategy);

            var labels = [];
            // 插單已經印出來貼上：保留原本的板號和儲位，只替新增的數量產生新插單
            var cd = window._containerData;
            var keep = [], voided = [], allocItems = items;
            if (cd.labelsPrinted && (cd.labels || []).length) {
                allocItems = [];
                items.forEach(function(item) {
                    var mine = cd.labels.filter(function(l) { return l.itemId === item.id; });
                    var printedQty = mine.reduce(function(t, l) { return t + (parseFloat(l.quantity) || 0); }, 0);
                    // 數量改少：多出來的插單作廢（從最後一張開始）
                    while (mine.length && printedQty - (parseFloat(mine[mine.length - 1].quantity) || 0) >= item.quantity) {
                        var v = mine.pop(); printedQty -= parseFloat(v.quantity) || 0; voided.push(v);
                    }
                    keep = keep.concat(mine);
                    var rest = item.quantity - printedQty;
                    if (rest > 0) {
                        var d = Object.assign({}, item, { quantity: rest, palletCount: Math.ceil(rest / (item.perPallet || 40)) });
                        if (item.totalWeight > 0 && item.quantity > 0) d.totalWeight = Math.round(item.totalWeight * rest / item.quantity * 10) / 10;
                        allocItems.push(d);
                    }
                });
                cd.labels.forEach(function(l) { if (!items.some(function(it) { return it.id === l.itemId; })) voided.push(l); });
            }
            try {
                labels = allocItems.length ? smartAllocateLocations(allocItems, {
                    strategy: strategy,
                    zones: selectedZones,
                    extraOccupied: keep.map(function(l) { return { locationId: l.locationId, quantity: l.quantity, palletCapacity: l.perPallet, productName: l.productName, spec: l.spec }; })
                }) : [];
            } catch (e) {
                console.error('❌ smartAllocateLocations 錯誤:', e);
                // 即使失敗也生成基本標籤
                allocItems.forEach(function(item) {
                    for (var p = 0; p < item.palletCount; p++) {
                        labels.push({
                            productName: item.productName,
                            spec: item.spec,
                            batchNo: item.batchNo,
                            expiryDate: item.expiryDate,
                            quantity: p === item.palletCount - 1 ? 
                                item.quantity - (p * item.perPallet) : item.perPallet,
                            perPallet: item.perPallet,
                            vendor: item.vendor,
                            company: item.company,
                            locationId: 'TEMP-IN',
                            itemId: item.id,
                            palletNo: item.id + '-' + (p + 1)
                        });
                    }
                });
            }

            console.log('🏷️ 分配完成，標籤數:', labels.length);

            labels = keep.concat(labels);
            if (voided.length) {
                alert('⚠️ 插單已經印過，以下 ' + voided.length + ' 張作廢（品項刪除或數量減少），請把貼上的撕掉：\n\n' +
                    voided.map(function(l) { return (l.id || l.palletNo) + '　' + l.productName + ' ' + l.quantity + ' 件 @ ' + l.locationId; }).slice(0, 20).join('\n') +
                    (labels.length > keep.length ? '\n\n新增的 ' + (labels.length - keep.length) + ' 張插單要另外印。' : ''));
            }
            var ov = labels.filter(function(l) { return l.overflow; }).length;
            if (ov && typeof window.showNotification === 'function') window.showNotification('⚠️ 有 ' + ov + ' 板貨架排不下，先放進貨暫存區 TEMP-IN', 'warning');

            window._containerData.labels = labels;
            renderContainerLabels();
            
            // 強制啟用按鈕
            enableContainerButtons();
            
            // 更新步驟狀態
            updateContainerStepState();
        };

        window.renderContainerItems = function() {
            var container = document.getElementById('container-items-list');
            var items = window._containerData.items;

            if (items.length === 0) {
                container.innerHTML = '<div class="text-center text-slate-500 py-8"><i class="fa-solid fa-box-open text-3xl mb-2"></i><div>尚無品項，請匯入 Excel 或手動新增</div></div>';
                document.getElementById('container-summary').classList.add('hidden');
                return;
            }

            var html = '';
            var totalPallets = 0;
            var totalQty = 0;

            items.forEach(function(item, idx) {
                totalPallets += item.palletCount;
                totalQty += item.quantity;

                html += '<div class="bg-slate-800 p-3 rounded border border-slate-700">' +
                    '<div class="flex justify-between items-start">' +
                    '<div class="flex-1">' +
                    '<div class="text-white font-bold text-sm">' + item.productName + '</div>' +
                    '<div class="text-slate-400 text-xs">' + item.spec + '</div>' +
                    '<div class="text-xs mt-1">' +
                    '<span class="text-blue-400">批號: ' + item.batchNo + '</span>' +
                    (item.expiryDate ? ' <span class="text-yellow-400 ml-2">效期: ' + item.expiryDate + '</span>' : '') +
                    '</div>' +
                    '<div class="text-xs mt-1">' +
                    '<span class="text-emerald-400">數量: ' + item.quantity + '</span>' +
                    '<span class="text-slate-500 ml-2">÷ ' + item.perPallet + '件/板</span>' +
                    '<span class="text-orange-400 ml-1">= ' + item.palletCount + ' 板</span>' +
                    '</div>' +
                    '</div>' +
                    '<button onclick="removeContainerItem(\'' + item.id + '\')" class="text-red-400 hover:text-red-300 ml-2">' +
                    '<i class="fa-solid fa-trash"></i>' +
                    '</button>' +
                    '</div></div>';
            });

            container.innerHTML = html;

            document.getElementById('container-summary').classList.remove('hidden');
            document.getElementById('container-item-count').textContent = items.length;
            document.getElementById('container-pallet-count').textContent = totalPallets;
            document.getElementById('container-total-qty').textContent = totalQty;
            
            // 更新頂部計數
            var itemCountTop = document.getElementById('container-item-count-top');
            var palletCountTop = document.getElementById('container-pallet-count-top');
            if (itemCountTop) itemCountTop.textContent = items.length;
            if (palletCountTop) palletCountTop.textContent = totalPallets;
            
            // 更新步驟和按鈕狀態
            updateContainerStepState();
        };

        window.removeContainerItem = function(id) {
            window._containerData.items = window._containerData.items.filter(function(item) {
                return item.id !== id;
            });
            renderContainerItems();
            // 重新生成標籤
            if (window._containerData.items.length > 0) {
                autoGenerateLabels();
            } else {
                window._containerData.labels = [];
                renderContainerLabels();
                updateContainerStepState();
            }
        };

        window.clearContainerItems = function() {
            if (!confirm('確定清除所有品項？')) return;
            window._containerData.items = [];
            window._containerData.labels = [];
            renderContainerItems();
            document.getElementById('container-labels-preview').innerHTML = '<div class="col-span-2 text-center text-slate-500 py-8"><i class="fa-solid fa-tags text-3xl mb-2"></i><div>請先新增品項</div></div>';
            updateContainerStepState();
        };
        
        // 更新待確認清單狀態
        window.updateContainerChecklist = function() {
            var company = document.querySelector('input[name="pre-company"]:checked');
            var name = document.getElementById('pre-name').value;
            var qty = document.getElementById('pre-qty').value || document.getElementById('pre-qty-var').value;
            var exp = document.getElementById('pre-exp').value;
            var labels = window._containerData.labels || [];
            
            // 公司
            var checkCompany = document.getElementById('container-check-company');
            if (checkCompany) {
                if (company) {
                    checkCompany.innerHTML = '<i class="fa-solid fa-check-circle text-orange-400 text-[8px]"></i><span class="text-orange-400 font-bold">' + company.value + '</span>';
                } else {
                    checkCompany.innerHTML = '<i class="fa-solid fa-circle text-slate-600 text-[8px]"></i><span class="text-slate-500">公司</span>';
                }
            }
            
            // 品名
            var checkName = document.getElementById('container-check-name');
            if (checkName) {
                if (name) {
                    var displayName = name.length > 4 ? name.substring(0, 4) + '..' : name;
                    checkName.innerHTML = '<i class="fa-solid fa-check-circle text-orange-400 text-[8px]"></i><span class="text-orange-400 font-bold">' + displayName + '</span>';
                } else {
                    checkName.innerHTML = '<i class="fa-solid fa-circle text-slate-600 text-[8px]"></i><span class="text-slate-500">品名</span>';
                }
            }
            
            // 數量
            var checkQty = document.getElementById('container-check-qty');
            if (checkQty) {
                if (qty && parseInt(qty) > 0) {
                    checkQty.innerHTML = '<i class="fa-solid fa-check-circle text-orange-400 text-[8px]"></i><span class="text-orange-400 font-bold">' + qty + '件</span>';
                } else {
                    checkQty.innerHTML = '<i class="fa-solid fa-circle text-slate-600 text-[8px]"></i><span class="text-slate-500">數量</span>';
                }
            }
            
            // 效期
            var checkExp = document.getElementById('container-check-exp');
            if (checkExp) {
                if (exp) {
                    var expDate = new Date(exp);
                    var expDisplay = (expDate.getMonth() + 1) + '/' + expDate.getDate();
                    checkExp.innerHTML = '<i class="fa-solid fa-check-circle text-orange-400 text-[8px]"></i><span class="text-orange-400 font-bold">' + expDisplay + '</span>';
                } else {
                    checkExp.innerHTML = '<i class="fa-solid fa-circle text-slate-600 text-[8px]"></i><span class="text-slate-500">效期</span>';
                }
            }
            
            // 儲位（檢查清單中是否有品項）
            var checkLoc = document.getElementById('container-check-loc');
            if (checkLoc) {
                if (labels.length > 0) {
                    checkLoc.innerHTML = '<i class="fa-solid fa-check-circle text-orange-400 text-[8px]"></i><span class="text-orange-400 font-bold">' + labels.length + '板</span>';
                } else {
                    checkLoc.innerHTML = '<i class="fa-solid fa-circle text-slate-600 text-[8px]"></i><span class="text-slate-500">儲位</span>';
                }
            }
            
            // 更新步驟狀態
            updateContainerStepState();
            
            // 觸發智能建議
            if (name) {
                calculateContainerSmartSuggest();
            }
        };
        
        // 更新步驟狀態
        window.updateContainerStepState = function() {
            var items = window._containerData.items || [];
            var labels = window._containerData.labels || [];
            
            var step1 = document.getElementById('container-step-1');
            var step2 = document.getElementById('container-step-2');
            var step3 = document.getElementById('container-step-3');
            
            // Step 1: 有輸入資料
            var hasInput = document.getElementById('pre-name').value;
            
            // Step 2: 有品項在清單中且已分配儲位
            var hasItems = items.length > 0;
            var hasLabels = labels.length > 0;
            
            // 更新 Step 1 樣式
            if (step1) {
                if (hasInput || hasItems) {
                    step1.className = 'flex items-center gap-1.5 px-3 py-1 rounded bg-emerald-600 text-white text-sm';
                    step1.innerHTML = '<span class="w-5 h-5 rounded-full bg-white text-emerald-600 flex items-center justify-center font-bold text-xs">✓</span><span class="font-bold">填寫資料</span>';
                } else {
                    step1.className = 'flex items-center gap-1.5 px-3 py-1 rounded bg-blue-600 text-white text-sm';
                    step1.innerHTML = '<span class="w-5 h-5 rounded-full bg-white text-blue-600 flex items-center justify-center font-bold text-xs">1</span><span class="font-bold">填寫資料</span>';
                }
            }
            
            // 更新 Step 2 樣式
            if (step2) {
                if (hasLabels) {
                    step2.className = 'flex items-center gap-1.5 px-3 py-1 rounded bg-emerald-600 text-white text-sm';
                    step2.innerHTML = '<span class="w-5 h-5 rounded-full bg-white text-emerald-600 flex items-center justify-center font-bold text-xs">✓</span><span class="font-bold">選擇儲位</span>';
                } else if (hasItems) {
                    step2.className = 'flex items-center gap-1.5 px-3 py-1 rounded bg-yellow-600 text-white text-sm';
                    step2.innerHTML = '<span class="w-5 h-5 rounded-full bg-white text-yellow-600 flex items-center justify-center font-bold text-xs">2</span><span class="font-bold">選擇儲位</span>';
                } else {
                    step2.className = 'flex items-center gap-1.5 px-3 py-1 rounded bg-slate-700 text-slate-400 text-sm';
                    step2.innerHTML = '<span class="w-5 h-5 rounded-full bg-slate-600 text-slate-400 flex items-center justify-center font-bold text-xs">2</span><span>選擇儲位</span>';
                }
            }
            
            // 更新 Step 3 樣式
            if (step3) {
                if (hasLabels) {
                    step3.className = 'flex items-center gap-1.5 px-3 py-1 rounded bg-yellow-600 text-white text-sm';
                    step3.innerHTML = '<span class="w-5 h-5 rounded-full bg-white text-yellow-600 flex items-center justify-center font-bold text-xs">3</span><span class="font-bold">確認入庫</span>';
                } else {
                    step3.className = 'flex items-center gap-1.5 px-3 py-1 rounded bg-slate-700 text-slate-400 text-sm';
                    step3.innerHTML = '<span class="w-5 h-5 rounded-full bg-slate-600 text-slate-400 flex items-center justify-center font-bold text-xs">3</span><span>確認入庫</span>';
                }
            }
            
            // 更新按鈕狀態
            var btnPrint = document.getElementById('btn-print-labels');
            var btnConfirm = document.getElementById('btn-confirm-inbound');
            
            if (btnPrint) {
                btnPrint.disabled = !hasLabels;
            }
            if (btnConfirm) {
                btnConfirm.disabled = !hasLabels;
            }
            
            // 更新標籤計數
            var labelCount = document.getElementById('container-label-count');
            if (labelCount) {
                labelCount.textContent = labels.length;
            }
            
            // 更新頂部待入庫計數
            var pendingCount = document.getElementById('container-pending-count');
            var pendingPallets = document.getElementById('container-pending-pallets');
            if (pendingCount) pendingCount.textContent = items.length;
            if (pendingPallets) pendingPallets.textContent = labels.length;
        };
        
        // 區域選擇變更時更新
        window.onContainerZoneChange = function() {
            // 更新 checkbox 樣式
            document.querySelectorAll('.container-zone-cb').forEach(function(cb) {
                var span = cb.nextElementSibling;
                if (cb.checked) {
                    span.className = 'block text-center px-2 py-1 rounded text-xs font-bold cursor-pointer bg-blue-600 text-white';
                } else {
                    span.className = 'block text-center px-2 py-1 rounded text-xs font-bold cursor-pointer bg-slate-700 text-slate-400';
                }
            });
            
            // 重新計算智能建議
            calculateContainerSmartSuggest();
            
            // 如果有品項，重新分配
            if (window._containerData.items.length > 0) {
                autoGenerateLabels();
            }
        };
        
        // 計算貨櫃入庫的智能建議（5級優先順序）
        // 優先順序：①同規格同層 → ②同規格 → ③同品名同層 → ④同品名 → ⑤空位
        window.calculateContainerSmartSuggest = function() {
            var productName = document.getElementById('pre-name').value;
            var spec = document.getElementById('pre-spec').value || '';
            
            if (!productName) {
                document.getElementById('container-smart-suggest-list').innerHTML = 
                    '<div class="text-slate-500 text-xs text-center py-2">選擇品項後顯示建議</div>';
                return;
            }
            
            // 取得選定的區域
            var selectedZones = [];
            document.querySelectorAll('.container-zone-cb:checked').forEach(function(cb) {
                selectedZones.push(cb.value);
            });
            if (selectedZones.length === 0) selectedZones = ['A', 'B'];
            
            // ========== 簡化版：判斷板型後查表 ==========
            var productType = typeof getPreProductType === 'function' ? getPreProductType() : 'fixed';
            var qty = 0, perPallet = 40;
            
            // 從品項主檔獲取板容量
            var master = (window.productMasterData || []).find(function(p) { return p.name === productName; });
            if (master && master.palletCapacity) {
                perPallet = master.palletCapacity;
            } else if (productType === 'fixed') {
                // 沒有主檔資料時，從輸入框讀取
                perPallet = parseInt(document.getElementById('pre-per-pallet').value) || 40;
            } else {
                perPallet = parseInt(document.getElementById('pre-per-pallet-var').value) || 40;
            }
            
            if (productType === 'fixed') {
                qty = parseInt(document.getElementById('pre-qty').value) || 0;
            } else {
                qty = parseInt(document.getElementById('pre-qty-var').value) || 0;
            }
            
            // 貨櫃入庫時，計算尾板的填充率來判斷板型
            var lastPalletQty = qty > 0 ? (qty % perPallet || perPallet) : perPallet;
            var palletType = window.getPalletType(lastPalletQty, perPallet);
            
            // 各層限制（直接查表）
            var LEVEL_PRIORITY = window.RACK_CONFIG.LEVEL_PRIORITY;
            
            // 查表取得各層容量
            function calcLevelCapacity(level) {
                return window.getLevelCapacity(level, palletType);
            }
            
            // 取得當前庫存資料
            var pallets = [];
            try {
                if (typeof window.currentInventory === 'function') {
                    pallets = window.currentInventory() || [];
                } else if (Array.isArray(window.currentInventory)) {
                    pallets = window.currentInventory;
                }
            } catch (e) {
                pallets = [];
            }
            
            // 建立巷道和層級狀態
            var lanes = {};
            var productSpecKey = productName + '|' + spec;
            
            selectedZones.forEach(function(zoneChar) {
                var warehouse = (zoneChar === 'A' || zoneChar === 'B') ? 'I' : 
                               (zoneChar === 'C' || zoneChar === 'D') ? 'J' : 'K';
                var laneCount = window.RACK_CONFIG.ZONE_LANES[warehouse + '-' + zoneChar] || 8;
                
                for (var row = 1; row <= laneCount; row++) {
                    var laneKey = warehouse + '-' + zoneChar + '-' + (row < 10 ? '0' + row : row);
                    lanes[laneKey] = {
                        warehouse: warehouse,
                        zoneChar: zoneChar,
                        row: row,
                        laneKey: laneKey,
                        hasSameName: false,
                        hasSameSpec: false,
                        sameNameCount: 0,
                        sameSpecCount: 0,
                        levelData: {
                            '3F': { count: 0, hasSameName: false, hasSameSpec: false, sameNameCount: 0, sameSpecCount: 0 },
                            '2F': { count: 0, hasSameName: false, hasSameSpec: false, sameNameCount: 0, sameSpecCount: 0 },
                            '1F': { count: 0, hasSameName: false, hasSameSpec: false, sameNameCount: 0, sameSpecCount: 0 }
                        }
                    };
                }
            });
            
            // 分析現有庫存
            pallets.forEach(function(item) {
                if (!item || !item.locationId) return;
                var parts = item.locationId.split('-');
                if (parts.length < 4) return;
                
                var laneKey = parts[0] + '-' + parts[1] + '-' + parts[2];
                var level = parts[3];
                if (!lanes[laneKey]) return;
                
                // 更新層級計數
                if (lanes[laneKey].levelData[level]) {
                    lanes[laneKey].levelData[level].count++;
                    window.addPalletToCounts(lanes[laneKey].levelData[level], item);
                }
                
                var itemSpecKey = (item.productName || '') + '|' + (item.spec || '');
                
                if (item.productName === productName) {
                    lanes[laneKey].hasSameName = true;
                    lanes[laneKey].sameNameCount++;
                    
                    if (lanes[laneKey].levelData[level]) {
                        lanes[laneKey].levelData[level].hasSameName = true;
                        lanes[laneKey].levelData[level].sameNameCount++;
                    }
                    
                    if (itemSpecKey === productSpecKey) {
                        lanes[laneKey].hasSameSpec = true;
                        lanes[laneKey].sameSpecCount++;
                        
                        if (lanes[laneKey].levelData[level]) {
                            lanes[laneKey].levelData[level].hasSameSpec = true;
                            lanes[laneKey].levelData[level].sameSpecCount++;
                        }
                    }
                }
            });
            
            // 計算建議
            var suggestions = [];
            
            Object.keys(lanes).forEach(function(laneKey) {
                var lane = lanes[laneKey];
                
                LEVEL_PRIORITY.forEach(function(level) {
                    var levelCap = calcLevelCapacity(level);
                    // 依混合板型使用率計算剩餘可放板數（不是只數同板型）
                    var levelAvail = window.levelRemaining(lane.levelData[level], level, palletType);
                    var levelUsed = lane.levelData[level].count;
                    
                    if (levelCap === 0 || levelAvail <= 0) return;
                    
                    var fullLocationId = laneKey + '-' + level;
                    var levelData = lane.levelData[level];
                    
                    var score = 0;
                    var reasons = [];
                    var priorityLevel = 5;
                    var icon = '📍';

                    // ========== 5級優先順序評分 ==========
                    
                    // ① 同品名 + 同規格 + 同層
                    if (levelData.hasSameSpec) {
                        score = 10000 + levelData.sameSpecCount * 100;
                        priorityLevel = 1;
                        icon = '🎯';
                        reasons.push('①同規格同層(' + levelData.sameSpecCount + '板)');
                    }
                    // ② 同品名 + 同規格（不同層）
                    else if (lane.hasSameSpec) {
                        score = 8000 + lane.sameSpecCount * 80;
                        priorityLevel = 2;
                        icon = '🎯';
                        reasons.push('②同規格');
                    }
                    // ③ 同品名 + 同層
                    else if (levelData.hasSameName) {
                        score = 6000 + levelData.sameNameCount * 60;
                        priorityLevel = 3;
                        icon = '📦';
                        reasons.push('③同品名同層(' + levelData.sameNameCount + '板)');
                    }
                    // ④ 同品名（任意層）
                    else if (lane.hasSameName) {
                        score = 4000 + lane.sameNameCount * 40;
                        priorityLevel = 4;
                        icon = '📦';
                        reasons.push('④同品名(' + lane.sameNameCount + '板)');
                    }
                    // ⑤ 空位
                    else {
                        var totalUsed = lane.levelData['3F'].count + lane.levelData['2F'].count + lane.levelData['1F'].count;
                        if (totalUsed === 0) {
                            score = 2000;
                            reasons.push('⑤空巷道');
                        } else {
                            score = 1000;
                            reasons.push('⑤可用');
                        }
                        priorityLevel = 5;
                        icon = '📍';
                        
                        // 靠近入口加分
                        if (lane.zoneChar === 'A' || lane.zoneChar === 'B') {
                            score += 100;
                        }
                    }
                    
                    // 層級優先加分
                    if (level === '2F') score += 30;
                    else if (level === '3F') score += 20;
                    else if (level === '1F') score += 10;

                    suggestions.push({
                        fullLocationId: fullLocationId,
                        laneKey: laneKey,
                        level: level,
                        zoneChar: lane.zoneChar,
                        row: lane.row,
                        score: score,
                        priorityLevel: priorityLevel,
                        icon: icon,
                        reasons: reasons,
                        levelAvailable: levelAvail,
                        sameNameCount: lane.sameNameCount,
                        sameSpecCount: lane.sameSpecCount
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
            
            // 取前三名（不重複儲位）
            var top3 = [];
            var seen = {};
            for (var i = 0; i < suggestions.length && top3.length < 3; i++) {
                if (!seen[suggestions[i].fullLocationId]) {
                    top3.push(suggestions[i]);
                    seen[suggestions[i].fullLocationId] = true;
                }
            }
            
            if (top3.length === 0) {
                document.getElementById('container-smart-suggest-list').innerHTML = 
                    '<div class="text-red-400 text-xs text-center py-2">⚠️ 選定區域無空位</div>';
                return;
            }
            
            // 板型標籤
            var palletTypeNames = { full: '整板', partial: '不足板', scattered: '散板' };
            var palletTypeLabel = palletTypeNames[palletType] || '整板';
            
            // 渲染建議
            var html = '<div class="text-[10px] text-cyan-400 mb-1 text-center">📦 ' + palletTypeLabel + ' 建議</div>';
            html += '<div class="flex gap-2">';
            
            top3.forEach(function(s, idx) {
                var bgClass, borderClass, textClass;
                
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
                
                html += '<div class="flex-1 ' + bgClass + ' border ' + borderClass + ' rounded-lg p-2 cursor-pointer hover:border-emerald-400 transition-all">';
                html += '<div class="flex items-center gap-1 mb-1">';
                html += '<span class="text-sm">' + rankLabel + '</span>';
                html += '<span class="' + textClass + ' font-bold font-mono text-sm">' + s.fullLocationId + '</span>';
                html += '</div>';
                html += '<div class="text-[10px] text-emerald-400">' + s.icon + ' ' + s.reasons[0] + '</div>';
                if (s.sameNameCount > 0) {
                    html += '<div class="text-[10px] text-cyan-400">現有 ' + s.sameNameCount + ' 板同品項</div>';
                }
                html += '<div class="text-[10px] text-slate-500">' + s.level + '層空' + s.levelAvailable + '位</div>';
                html += '</div>';
            });
            
            html += '</div>';
            document.getElementById('container-smart-suggest-list').innerHTML = html;
        };

        window.getAllAvailableLocations = function() {
            // 取得當前庫存資料（支援多種資料來源）
            var pallets = [];
            if (window.currentInventory && Array.isArray(window.currentInventory)) {
                pallets = window.currentInventory;
            } else if (typeof window.currentInventory === 'function') {
                pallets = window.currentInventory();
            } else if (window._inventoryData && window._inventoryData.pallets) {
                pallets = window._inventoryData.pallets;
            }
            
            var occupiedSet = new Set();

            var skipOccupied = document.getElementById('container-skip-occupied');
            var shouldSkip = skipOccupied ? skipOccupied.checked : true;

            if (shouldSkip) {
                pallets.forEach(function(p) {
                    if (p.locationId) occupiedSet.add(p.locationId);
                });
            }

            var warehouseConfig = {
                'I': { zones: ['A', 'B'], maxRow: 8 },
                'J': { zones: ['C', 'D'], maxRow: 8 },
                'K': { zones: ['E', 'F', 'G', 'H'], maxRow: (window.RACK_CONFIG.ZONE_LANES['K-E'] || 20) }
            };

            var levels = ['3F', '2F', '1F'];
            var levelCapacity = {};
            levels.forEach(function(lv) {
                var cap = window.RACK_CONFIG.LEVEL_CAPACITY[lv] || {};
                levelCapacity[lv] = Math.max(cap.full || 0, cap.partial || 0, cap.scattered || 0);
            });

            var available = [];

            Object.keys(warehouseConfig).forEach(function(warehouse) {
                var config = warehouseConfig[warehouse];
                config.zones.forEach(function(zoneChar) {
                    for (var row = 1; row <= config.maxRow; row++) {
                        levels.forEach(function(level) {
                            var rowStr = row < 10 ? '0' + row : '' + row;
                            var locId = warehouse + '-' + zoneChar + '-' + rowStr + '-' + level;

                            if (!occupiedSet.has(locId)) {
                                available.push({
                                    locationId: locId,
                                    warehouse: warehouse,
                                    zone: warehouse + '-' + zoneChar,
                                    zoneChar: zoneChar,
                                    row: row,
                                    level: level,
                                    capacity: levelCapacity[level]
                                });
                            }
                        });
                    }
                });
            });

            return available;
        };

        window.getFilteredAvailableLocations = function(options) {
            var all = getAllAvailableLocations();
            var opts = options || {};

            if (opts.usedLocations && opts.usedLocations.length > 0) {
                var usedSet = new Set(opts.usedLocations);
                all = all.filter(function(loc) {
                    return !usedSet.has(loc.locationId);
                });
            }

            if (opts.zones && opts.zones.length > 0) {
                all = all.filter(function(loc) {
                    return opts.zones.includes(loc.zoneChar);
                });
            }

            if (opts.warehouses && opts.warehouses.length > 0) {
                all = all.filter(function(loc) {
                    return opts.warehouses.includes(loc.warehouse);
                });
            }

            if (opts.levels && opts.levels.length > 0) {
                all = all.filter(function(loc) {
                    return opts.levels.includes(loc.level);
                });
            }

            if (opts.startRow) {
                all = all.filter(function(loc) {
                    return loc.row >= opts.startRow;
                });
            }

            return all;
        };

        window.smartAllocateLocations = function(items, options) {
            var opts = options || {};
            var allocations = [];
            
            // 取得配置
            var LEVEL_CAPACITY = window.RACK_CONFIG.LEVEL_CAPACITY;
            var LEVEL_PRIORITY = window.RACK_CONFIG ? window.RACK_CONFIG.LEVEL_PRIORITY : ['2F', '3F', '1F'];
            var FILL_THRESHOLDS = window.RACK_CONFIG ? window.RACK_CONFIG.PALLET_FILL_THRESHOLDS : { full: 0.75, partial: 0.50 };
            
            // 計算單巷道總容量（整板）
            var LANE_FULL_CAPACITY = LEVEL_CAPACITY['1F'].full + LEVEL_CAPACITY['2F'].full + LEVEL_CAPACITY['3F'].full; // 8+4+8=20
            
            console.log('═══════════════════════════════════════════════════════════');
            console.log('📦 貨櫃智能儲位分配系統');
            console.log('═══════════════════════════════════════════════════════════');
            
            // ========== 1. 讀取現有庫存 ==========
            function getExistingInventory() {
                var pallets = [];
                try {
                    if (typeof window.currentInventory === 'function') {
                        pallets = window.currentInventory() || [];
                    } else if (window.currentInventory && Array.isArray(window.currentInventory)) {
                        pallets = window.currentInventory;
                    } else if (window._inventoryData && Array.isArray(window._inventoryData.pallets)) {
                        pallets = window._inventoryData.pallets;
                    }
                } catch (e) {
                    pallets = [];
                }
                return Array.isArray(pallets) ? pallets : [];
            }
            
            // 已經印出來的插單（還沒入帳）也佔位置
            var existingInventory = getExistingInventory().concat((options && options.extraOccupied) || []);
            
            // ========== 2. 建立巷道狀態表 ==========
            var zones = opts.zones || ['A', 'B'];
            var warehouse = opts.warehouse || 'I';
            var lanes = {}; // key: 'I-A-01', value: { levels: {...}, products: [...], totalUsed: n }
            
            // 根據區域決定倉庫和排數
            function getWarehouseInfo(zone) {
                if (['A', 'B'].indexOf(zone) >= 0) return { wh: 'I', rows: 8 };
                if (['C', 'D'].indexOf(zone) >= 0) return { wh: 'J', rows: 8 };
                if (['E', 'F', 'G', 'H'].indexOf(zone) >= 0) return { wh: 'K', rows: window.RACK_CONFIG.ZONE_LANES['K-' + zone] || 20 };
                return { wh: warehouse, rows: 10 };
            }
            
            // 初始化所有巷道
            zones.forEach(function(zone) {
                var info = getWarehouseInfo(zone);
                for (var row = 1; row <= info.rows; row++) {
                    var laneKey = info.wh + '-' + zone + '-' + (row < 10 ? '0' + row : row);
                    lanes[laneKey] = {
                        warehouse: info.wh,
                        zone: zone,
                        row: row,
                        levels: {},
                        products: [],
                        totalUsed: 0,
                        totalCapacity: LANE_FULL_CAPACITY
                    };
                    LEVEL_PRIORITY.forEach(function(levelStr) {
                        lanes[laneKey].levels[levelStr] = { full: 0, partial: 0, scattered: 0 };
                    });
                }
            });
            
            // ========== 3. 統計現有庫存佔用 ==========
            existingInventory.forEach(function(pallet) {
                if (!pallet.locationId) return;
                var parts = pallet.locationId.split('-');
                if (parts.length < 4) return;
                var laneKey = parts[0] + '-' + parts[1] + '-' + parts[2];
                var levelStr = parts[3];
                var locationKey = laneKey + '-' + levelStr;  // 完整儲位 key
                if (!lanes[laneKey] || !lanes[laneKey].levels[levelStr]) return;
                var palletType = pallet.palletType || window.palletTypeOf(pallet);
                lanes[laneKey].levels[levelStr][palletType]++;
                lanes[laneKey].totalUsed++;
                
                // 記錄品名（用於同品名匹配）
                if (pallet.productName && lanes[laneKey].products.indexOf(pallet.productName) === -1) {
                    lanes[laneKey].products.push(pallet.productName);
                }
                
                // 記錄品名+規格組合（用於精確匹配）
                if (!lanes[laneKey].productSpecs) lanes[laneKey].productSpecs = [];
                var productSpecKey = (pallet.productName || '') + '|' + (pallet.spec || '');
                if (lanes[laneKey].productSpecs.indexOf(productSpecKey) === -1) {
                    lanes[laneKey].productSpecs.push(productSpecKey);
                }
                
                // 記錄品名數量（用於計算集中度）
                if (!lanes[laneKey].productCounts) lanes[laneKey].productCounts = {};
                if (!lanes[laneKey].productCounts[pallet.productName]) {
                    lanes[laneKey].productCounts[pallet.productName] = 0;
                }
                lanes[laneKey].productCounts[pallet.productName]++;
                
                // ========== 新增：記錄每個儲位（巷道+層）的品項資訊 ==========
                if (!lanes[laneKey].locationProducts) lanes[laneKey].locationProducts = {};
                if (!lanes[laneKey].locationProducts[levelStr]) {
                    lanes[laneKey].locationProducts[levelStr] = {
                        products: [],      // 該層的品名列表
                        productSpecs: [],  // 該層的品名+規格列表
                        productCounts: {}  // 該層各品名的數量
                    };
                }
                var levelData = lanes[laneKey].locationProducts[levelStr];
                if (levelData.products.indexOf(pallet.productName) === -1) {
                    levelData.products.push(pallet.productName);
                }
                if (levelData.productSpecs.indexOf(productSpecKey) === -1) {
                    levelData.productSpecs.push(productSpecKey);
                }
                if (!levelData.productCounts[pallet.productName]) {
                    levelData.productCounts[pallet.productName] = 0;
                }
                levelData.productCounts[pallet.productName]++;
            });
            
            var totalLanes = Object.keys(lanes).length;
            var usedLanes = 0;
            for (var lk in lanes) { if (lanes[lk].totalUsed > 0) usedLanes++; }
            console.log('📊 現有庫存:', existingInventory.length, '板');
            console.log('📊 巷道使用:', usedLanes + '/' + totalLanes, '(' + Math.round(usedLanes/totalLanes*100) + '%)');
            
            // ========== 4. 分析入庫品項（合併同品項+同規格） ==========
            var productSummary = {};
            items.forEach(function(item) {
                // 使用 品名+規格 作為 key，確保同品名但不同規格分開處理
                var key = item.productName + '|' + (item.spec || '');
                if (!productSummary[key]) {
                    productSummary[key] = {
                        productName: item.productName, 
                        spec: item.spec || '',
                        totalQty: 0, totalPallets: 0, batches: [], items: [],
                        existingLanesSameSpec: [],  // 同品名+同規格的巷道（第一優先）
                        existingLanesSameName: [],  // 同品名的巷道（第二優先）
                        assignedLane: null
                    };
                }
                // 🔧 修正：使用 trim() 處理空格問題，並增加模糊匹配
                var itemName = (item.productName || '').trim();
                var itemSpec = (item.spec || '').trim();
                
                var productMaster = null;
                if (window.productMasterData && window.productMasterData.length > 0) {
                    // 第一優先：完全匹配（品名+規格）
                    productMaster = window.productMasterData.find(function(p) {
                        var pName = (p.name || '').trim();
                        var pSpec = (p.spec || '').trim();
                        if (itemSpec && pSpec) {
                            return pName === itemName && pSpec === itemSpec;
                        }
                        return pName === itemName;
                    });
                    
                    // 第二優先：品項主檔名稱包含輸入名稱，或反過來
                    if (!productMaster && itemName.length >= 2) {
                        productMaster = window.productMasterData.find(function(p) {
                            var pName = (p.name || '').trim();
                            return pName.indexOf(itemName) >= 0 || itemName.indexOf(pName) >= 0;
                        });
                        if (productMaster) {
                            console.log('📦 [' + itemName + '] 包含匹配到品項主檔: ' + productMaster.name);
                        }
                    }
                    
                    // 第三優先：開頭+結尾匹配（處理中間少字的情況，如「熟鳳泰蝦」vs「熟鳳尾泰蝦」）
                    if (!productMaster && itemName.length >= 3) {
                        var itemStart = itemName.substring(0, 2);  // 取前2字
                        var itemEnd = itemName.substring(itemName.length - 2);  // 取後2字
                        productMaster = window.productMasterData.find(function(p) {
                            var pName = (p.name || '').trim();
                            if (pName.length < 3) return false;
                            var pStart = pName.substring(0, 2);
                            var pEnd = pName.substring(pName.length - 2);
                            // 開頭和結尾都相同，且長度差異不超過2
                            return pStart === itemStart && pEnd === itemEnd && Math.abs(pName.length - itemName.length) <= 2;
                        });
                        if (productMaster) {
                            console.log('📦 [' + itemName + '] 首尾匹配到品項主檔: ' + productMaster.name);
                        }
                    }
                    
                    // 第四優先：移除常見字符後比對
                    if (!productMaster && itemName.length >= 2) {
                        var normalizedItemName = itemName.replace(/[\s\-\_\(\)（）]/g, '');
                        productMaster = window.productMasterData.find(function(p) {
                            var pName = (p.name || '').trim().replace(/[\s\-\_\(\)（）]/g, '');
                            return pName === normalizedItemName || 
                                   pName.indexOf(normalizedItemName) >= 0 || 
                                   normalizedItemName.indexOf(pName) >= 0;
                        });
                        if (productMaster) {
                            console.log('📦 [' + itemName + '] 正規化後匹配到品項主檔: ' + productMaster.name);
                        }
                    }
                    
                    // 第五優先：相似度匹配（至少80%字符相同）
                    if (!productMaster && itemName.length >= 3) {
                        var bestMatch = null;
                        var bestScore = 0;
                        window.productMasterData.forEach(function(p) {
                            var pName = (p.name || '').trim();
                            if (pName.length < 2) return;
                            
                            // 計算共同字符數
                            var commonChars = 0;
                            var itemChars = itemName.split('');
                            var pChars = pName.split('');
                            itemChars.forEach(function(c) {
                                var idx = pChars.indexOf(c);
                                if (idx >= 0) {
                                    commonChars++;
                                    pChars.splice(idx, 1);  // 移除已匹配的字符
                                }
                            });
                            
                            // 計算相似度分數
                            var score = commonChars / Math.max(itemName.length, pName.length);
                            if (score >= 0.8 && score > bestScore) {
                                bestScore = score;
                                bestMatch = p;
                            }
                        });
                        if (bestMatch) {
                            productMaster = bestMatch;
                            console.log('📦 [' + itemName + '] 相似度匹配到品項主檔: ' + productMaster.name + ' (相似度: ' + Math.round(bestScore * 100) + '%)');
                        }
                    }
                }
                
                // 🔧 修正：確保 palletCapacity 是數字，並添加調試日誌
                var masterPalletCapacity = productMaster ? parseInt(productMaster.palletCapacity) || 0 : 0;
                var itemPerPallet = parseInt(item.perPallet) || 0;
                
                var perPallet;
                if (masterPalletCapacity > 0) {
                    perPallet = masterPalletCapacity;
                    console.log('📦 [' + itemName + '] 使用品項主檔板容量: ' + perPallet);
                } else if (itemPerPallet > 0) {
                    perPallet = itemPerPallet;
                    console.log('📦 [' + itemName + '] 使用用戶設定板容量: ' + perPallet);
                } else {
                    perPallet = 40;
                    console.log('📦 [' + itemName + '] 使用預設板容量: ' + perPallet);
                }
                
                if (!productMaster) {
                    console.warn('⚠️ [' + itemName + '] 未找到品項主檔，品項主檔數量: ' + (window.productMasterData || []).length);
                }
                
                var palletCount = item.palletCount || Math.ceil(item.quantity / perPallet);
                productSummary[key].totalQty += item.quantity;
                productSummary[key].totalPallets += palletCount;
                productSummary[key].batches.push(item.batchNo || '-');
                productSummary[key].items.push(item);
                productSummary[key].perPallet = perPallet;
                productSummary[key].unitWeight = (productMaster && productMaster.unitWeight) ? productMaster.unitWeight : (item.unitWeight || 10);
            });
            
            // 為每個品項找出現有庫存的巷道
            for (var prodKey in productSummary) {
                var product = productSummary[prodKey];
                var productSpecKey = product.productName + '|' + product.spec;
                
                // 建立同品名巷道的集中度排序列表
                var sameNameLanes = [];
                
                for (var laneKey in lanes) {
                    var lane = lanes[laneKey];
                    var remaining = lane.totalCapacity - lane.totalUsed;
                    if (remaining <= 0) continue;
                    
                    // 檢查是否有同品名+同規格
                    if (lane.productSpecs && lane.productSpecs.indexOf(productSpecKey) >= 0) {
                        product.existingLanesSameSpec.push({
                            laneKey: laneKey,
                            remaining: remaining,
                            count: (lane.productCounts && lane.productCounts[product.productName]) || 0
                        });
                    }
                    // 檢查是否有同品名（不同規格）
                    else if (lane.products.indexOf(product.productName) >= 0) {
                        sameNameLanes.push({
                            laneKey: laneKey,
                            remaining: remaining,
                            count: (lane.productCounts && lane.productCounts[product.productName]) || 0
                        });
                    }
                }
                
                // 按集中度排序（數量多的優先）
                product.existingLanesSameSpec.sort(function(a, b) { return b.count - a.count; });
                sameNameLanes.sort(function(a, b) { return b.count - a.count; });
                product.existingLanesSameName = sameNameLanes;
            }
            
            var productList = Object.values(productSummary);
            productList.sort(function(a, b) { return b.totalPallets - a.totalPallets; });
            
            console.log('───────────────────────────────────────────────────────────');
            console.log('📋 入庫品項分析（共 ' + productList.length + ' 品項，' + items.length + ' 批號）：');
            var totalInboundPallets = 0;
            productList.forEach(function(p) {
                var sizeLabel = p.totalPallets >= 20 ? '🔴大量' : (p.totalPallets >= 5 ? '🟡中量' : '🟢少量');
                var existingInfo = '';
                if (p.existingLanesSameSpec.length > 0) {
                    existingInfo = ' [同規格:' + p.existingLanesSameSpec.map(function(l){return l.laneKey+'('+l.count+'板)';}).join(',') + ']';
                } else if (p.existingLanesSameName.length > 0) {
                    existingInfo = ' [同品名:' + p.existingLanesSameName.map(function(l){return l.laneKey+'('+l.count+'板)';}).join(',') + ']';
                } else {
                    existingInfo = ' [新品]';
                }
                console.log('  ' + sizeLabel + ' ' + p.productName + ' ' + (p.spec || '') + ': ' + p.totalPallets + '板 (' + p.batches.length + '批)' + existingInfo);
                totalInboundPallets += p.totalPallets;
            });
            console.log('  📦 總計: ' + totalInboundPallets + ' 板');
            
            // ========== 5. 巷道分配規劃（優先順序：同規格同層 > 同規格 > 同品名同層 > 同品名 > 空位） ==========
            console.log('───────────────────────────────────────────────────────────');
            console.log('🎯 巷道分配規劃：');
            console.log('   優先順序：①同規格同層 → ②同規格 → ③同品名同層 → ④同品名 → ⑤空位');
            
            function getAvailableLanes() {
                var available = [];
                for (var laneKey in lanes) {
                    var lane = lanes[laneKey];
                    var remaining = lane.totalCapacity - lane.totalUsed;
                    if (remaining > 0) {
                        available.push({ laneKey: laneKey, remaining: remaining, isEmpty: lane.totalUsed === 0, products: lane.products.slice() });
                    }
                }
                available.sort(function(a, b) {
                    if (a.isEmpty !== b.isEmpty) return a.isEmpty ? -1 : 1;
                    return b.remaining - a.remaining;
                });
                return available;
            }
            
            productList.forEach(function(product) {
                // 第一優先：同品名+同規格的巷道
                if (product.existingLanesSameSpec.length > 0) {
                    for (var i = 0; i < product.existingLanesSameSpec.length; i++) {
                        var laneInfo = product.existingLanesSameSpec[i];
                        var laneKey = laneInfo.laneKey;
                        var remaining = lanes[laneKey].totalCapacity - lanes[laneKey].totalUsed;
                        if (remaining >= product.totalPallets) {
                            product.assignedLane = laneKey;
                            console.log('  ✅ ' + product.productName + ' ' + product.spec + ' → ' + laneKey + ' (🎯同規格巷道，已有' + laneInfo.count + '板，剩餘' + remaining + ')');
                            lanes[laneKey].totalUsed += product.totalPallets;
                            break;
                        }
                    }
                }
                
                // 第二優先：同品名的巷道（按集中度排序）
                if (!product.assignedLane && product.existingLanesSameName.length > 0) {
                    for (var i = 0; i < product.existingLanesSameName.length; i++) {
                        var laneInfo = product.existingLanesSameName[i];
                        var laneKey = laneInfo.laneKey;
                        var remaining = lanes[laneKey].totalCapacity - lanes[laneKey].totalUsed;
                        if (remaining >= product.totalPallets) {
                            product.assignedLane = laneKey;
                            console.log('  ✅ ' + product.productName + ' ' + product.spec + ' → ' + laneKey + ' (📦同品名高集中，已有' + laneInfo.count + '板，剩餘' + remaining + ')');
                            lanes[laneKey].totalUsed += product.totalPallets;
                            break;
                        }
                    }
                }
                
                // 第三優先：空巷道或其他可用巷道
                if (!product.assignedLane) {
                    var available = getAvailableLanes();
                    for (var i = 0; i < available.length; i++) {
                        if (available[i].remaining >= product.totalPallets) {
                            product.assignedLane = available[i].laneKey;
                            var laneKey = available[i].laneKey;
                            var typeLabel = available[i].isEmpty ? '空巷道' : '共用巷道';
                            console.log('  ✅ ' + product.productName + ' ' + product.spec + ' → ' + laneKey + ' (' + typeLabel + '，剩餘' + available[i].remaining + '板)');
                            lanes[laneKey].totalUsed += product.totalPallets;
                            lanes[laneKey].products.push(product.productName);
                            break;
                        }
                    }
                }
                
                if (!product.assignedLane) {
                    product.assignedLane = 'MULTI';
                    console.log('  ⚠️ ' + product.productName + ' ' + product.spec + ' → 需跨多巷道 (' + product.totalPallets + '板)');
                }
            });
            
            // ========== 6. 實際分配儲位 ==========
            console.log('───────────────────────────────────────────────────────────');
            console.log('📍 儲位分配明細：');
            
            var laneUsage = {};
            for (var laneKey in lanes) {
                laneUsage[laneKey] = { levels: {} };
                LEVEL_PRIORITY.forEach(function(levelStr) {
                    laneUsage[laneKey].levels[levelStr] = {
                        full: lanes[laneKey].levels[levelStr].full || 0,
                        partial: lanes[laneKey].levels[levelStr].partial || 0,
                        scattered: lanes[laneKey].levels[levelStr].scattered || 0
                    };
                });
            }
            
            // 在指定巷道內找儲位（支援同品名+同規格+同層優先）
            function findLocationInLane(laneKey, palletType, boxSize, preferredProduct, preferredSpec) {
                if (!laneUsage[laneKey]) return null;
                var factor = (window.RACK_CONFIG && window.RACK_CONFIG.BOX_SIZE_FACTOR) ? 
                    window.RACK_CONFIG.BOX_SIZE_FACTOR[boxSize || 'standard'] || 1.0 : 1.0;
                var allowedLevels = LEVEL_PRIORITY.filter(function(levelStr) {
                    var cap = LEVEL_CAPACITY[levelStr];
                    return cap && cap[palletType] > 0;
                });
                
                var productSpecKey = (preferredProduct || '') + '|' + (preferredSpec || '');
                var laneData = lanes[laneKey];
                
                // 第一優先：同品名+同規格+同層
                if (preferredProduct && preferredSpec && laneData.locationProducts) {
                    for (var i = 0; i < allowedLevels.length; i++) {
                        var levelStr = allowedLevels[i];
                        var levelData = laneData.locationProducts[levelStr];
                        if (levelData && levelData.productSpecs && levelData.productSpecs.indexOf(productSpecKey) >= 0) {
                            if (window.canLevelFit(laneUsage[laneKey].levels[levelStr], levelStr, palletType, factor)) {
                                return laneKey + '-' + levelStr;
                            }
                        }
                    }
                }
                
                // 第二優先：同品名+同層（不同規格）
                if (preferredProduct && laneData.locationProducts) {
                    for (var i = 0; i < allowedLevels.length; i++) {
                        var levelStr = allowedLevels[i];
                        var levelData = laneData.locationProducts[levelStr];
                        if (levelData && levelData.products && levelData.products.indexOf(preferredProduct) >= 0) {
                            if (window.canLevelFit(laneUsage[laneKey].levels[levelStr], levelStr, palletType, factor)) {
                                return laneKey + '-' + levelStr;
                            }
                        }
                    }
                }
                
                // 第三優先：該巷道任何可用層
                for (var i = 0; i < allowedLevels.length; i++) {
                    var levelStr = allowedLevels[i];
                    if (window.canLevelFit(laneUsage[laneKey].levels[levelStr], levelStr, palletType, factor)) {
                        return laneKey + '-' + levelStr;
                    }
                }
                return null;
            }
            
            // 全域找儲位（優先順序：同規格同層 > 同規格 > 同品名同層 > 同品名 > 空位）
            function findAnyLocation(palletType, boxSize, preferredProduct, preferredSpec) {
                var factor = (window.RACK_CONFIG && window.RACK_CONFIG.BOX_SIZE_FACTOR) ? 
                    window.RACK_CONFIG.BOX_SIZE_FACTOR[boxSize || 'standard'] || 1.0 : 1.0;
                var allowedLevels = LEVEL_PRIORITY.filter(function(levelStr) {
                    var cap = LEVEL_CAPACITY[levelStr];
                    return cap && cap[palletType] > 0;
                });
                
                var productSpecKey = (preferredProduct || '') + '|' + (preferredSpec || '');
                
                // ========== 第一優先：同品名+同規格+同層 ==========
                if (preferredProduct && preferredSpec) {
                    for (var laneKey in lanes) {
                        var laneData = lanes[laneKey];
                        if (!laneData.locationProducts) continue;
                        
                        for (var i = 0; i < allowedLevels.length; i++) {
                            var levelStr = allowedLevels[i];
                            var levelData = laneData.locationProducts[levelStr];
                            if (levelData && levelData.productSpecs && levelData.productSpecs.indexOf(productSpecKey) >= 0) {
                                if (window.canLevelFit(laneUsage[laneKey].levels[levelStr], levelStr, palletType, factor)) {
                                    return laneKey + '-' + levelStr;
                                }
                            }
                        }
                    }
                }
                
                // ========== 第二優先：同品名+同規格（不同層） ==========
                if (preferredProduct && preferredSpec) {
                    for (var laneKey in lanes) {
                        if (lanes[laneKey].productSpecs && lanes[laneKey].productSpecs.indexOf(productSpecKey) >= 0) {
                            var loc = findLocationInLane(laneKey, palletType, boxSize, preferredProduct, preferredSpec);
                            if (loc) return loc;
                        }
                    }
                }
                
                // ========== 第三優先：同品名+同層 ==========
                if (preferredProduct) {
                    for (var laneKey in lanes) {
                        var laneData = lanes[laneKey];
                        if (!laneData.locationProducts) continue;
                        
                        for (var i = 0; i < allowedLevels.length; i++) {
                            var levelStr = allowedLevels[i];
                            var levelData = laneData.locationProducts[levelStr];
                            if (levelData && levelData.products && levelData.products.indexOf(preferredProduct) >= 0) {
                                if (window.canLevelFit(laneUsage[laneKey].levels[levelStr], levelStr, palletType, factor)) {
                                    return laneKey + '-' + levelStr;
                                }
                            }
                        }
                    }
                }
                
                // ========== 第四優先：同品名（任意層，按集中度排序）==========
                if (preferredProduct) {
                    var sameNameLanes = [];
                    for (var laneKey in lanes) {
                        if (lanes[laneKey].products.indexOf(preferredProduct) >= 0) {
                            var count = (lanes[laneKey].productCounts && lanes[laneKey].productCounts[preferredProduct]) || 0;
                            sameNameLanes.push({ laneKey: laneKey, count: count });
                        }
                    }
                    sameNameLanes.sort(function(a, b) { return b.count - a.count; });
                    for (var i = 0; i < sameNameLanes.length; i++) {
                        var loc = findLocationInLane(sameNameLanes[i].laneKey, palletType, boxSize, preferredProduct, preferredSpec);
                        if (loc) return loc;
                    }
                }
                
                // ========== 第五優先：任何可用儲位 ==========
                for (var laneKey in laneUsage) {
                    for (var i = 0; i < allowedLevels.length; i++) {
                        var levelStr = allowedLevels[i];
                        if (window.canLevelFit(laneUsage[laneKey].levels[levelStr], levelStr, palletType, factor)) {
                            return laneKey + '-' + levelStr;
                        }
                    }
                }
                return 'OVERFLOW';
            }
            
            // 使用統一棧板編號產生器 generatePalletNo()
            
            productList.forEach(function(product) {
                var assignedLane = product.assignedLane;
                var boxSize = window.getBoxSizeByWeight ? window.getBoxSizeByWeight(product.unitWeight) : 'standard';
                console.log('  📦 ' + product.productName + ' (' + product.totalPallets + '板) → ' + (assignedLane === 'MULTI' ? '跨巷道' : assignedLane));
                
                product.items.forEach(function(item) {
                    var remaining = item.quantity;
                    var perPallet = product.perPallet || item.perPallet || 40;
                    console.log('🏷️ 生成標籤 - 品項: ' + item.productName + ', 數量: ' + remaining + ', 每板件數: ' + perPallet + ' (product.perPallet=' + product.perPallet + ', item.perPallet=' + item.perPallet + ')');
                    
                    while (remaining > 0) {
                        var palletQty = Math.min(remaining, perPallet);
                        var fillRate = palletQty / perPallet;
                        var palletType = 'scattered';
                        if (fillRate >= FILL_THRESHOLDS.full) palletType = 'full';
                        else if (fillRate >= FILL_THRESHOLDS.partial) palletType = 'partial';
                        
                        var palletWeight = 0;
                        if (item.productType === 'variable' && item.totalWeight > 0) {
                            palletWeight = Math.round((palletQty / item.quantity) * item.totalWeight * 10) / 10;
                        } else if (item.unitWeight > 0) {
                            palletWeight = palletQty * item.unitWeight;
                        }
                        
                        var locationId;
                        if (assignedLane && assignedLane !== 'MULTI') {
                            locationId = findLocationInLane(assignedLane, palletType, boxSize, product.productName, product.spec);
                            if (!locationId) locationId = findAnyLocation(palletType, boxSize, product.productName, product.spec);
                        } else {
                            locationId = findAnyLocation(palletType, boxSize, product.productName, product.spec);
                        }
                        
                        if (locationId && locationId !== 'OVERFLOW') {
                            var parts = locationId.split('-');
                            var lk = parts[0] + '-' + parts[1] + '-' + parts[2];
                            var lvl = parts[3];
                            if (laneUsage[lk] && laneUsage[lk].levels[lvl]) {
                                laneUsage[lk].levels[lvl][palletType]++;
                            }
                        }
                        
                        // 使用統一的棧板編號產生器
                        var palletNo = window.generatePalletNo();
                        
                        allocations.push({
                            id: palletNo,
                            itemId: item.id,
                            company: item.company || '崇文',
                            vendor: item.vendor,
                            productName: item.productName,
                            spec: item.spec,
                            batchNo: item.batchNo || '',
                            expiryDate: item.expiryDate,
                            quantity: palletQty,
                            perPallet: perPallet,
                            totalWeight: palletWeight,
                            unitWeight: item.unitWeight || 0,
                            productType: item.productType || 'fixed',
                            // 貨架排不下的板先放進貨暫存區，之後用手機「上架」
                            locationId: (!locationId || locationId === 'OVERFLOW') ? 'TEMP-IN' : locationId,
                            palletNo: palletNo,
                            palletType: palletType,
                            boxSize: boxSize,
                            overflow: !locationId || locationId === 'OVERFLOW'
                        });
                        
                        remaining -= palletQty;
                    }
                });
            });
            
            // ========== 7. 輸出分配結果摘要 ==========
            console.log('───────────────────────────────────────────────────────────');
            console.log('📊 分配結果摘要：');
            var locationSummary = {};
            allocations.forEach(function(a) {
                if (!locationSummary[a.locationId]) locationSummary[a.locationId] = { count: 0, products: [] };
                locationSummary[a.locationId].count++;
                if (locationSummary[a.locationId].products.indexOf(a.productName) === -1) {
                    locationSummary[a.locationId].products.push(a.productName);
                }
            });
            Object.keys(locationSummary).sort().forEach(function(locId) {
                var info = locationSummary[locId];
                console.log('  ' + locId + ': ' + info.count + '板 [' + info.products.join(', ') + ']');
            });
            var overflowCount = allocations.filter(function(a) { return a.overflow; }).length;
            if (overflowCount > 0) console.log('  ⚠️ 溢位: ' + overflowCount + '板');
            console.log('═══════════════════════════════════════════════════════════');
            console.log('✅ 分配完成！共 ' + allocations.length + ' 板');
            console.log('═══════════════════════════════════════════════════════════');
            
            return allocations;
        };
        function findNearestLocation(available, lastLoc) {
            if (!lastLoc || available.length === 0) return available[0];

            var sameZoneRow = available.filter(function(loc) {
                return loc.zone === lastLoc.zone && loc.row === lastLoc.row;
            });
            if (sameZoneRow.length > 0) return sameZoneRow[0];

            var sameZone = available.filter(function(loc) {
                return loc.zone === lastLoc.zone && Math.abs(loc.row - lastLoc.row) <= 2;
            });
            if (sameZone.length > 0) return sameZone[0];

            var anyInZone = available.filter(function(loc) {
                return loc.zone === lastLoc.zone;
            });
            if (anyInZone.length > 0) return anyInZone[0];

            return available[0];
        };

        window.getNextAvailableLocation = function(zone, startRow, startLevel, usedLocations) {
            var available = getFilteredAvailableLocations({
                zones: [zone],
                startRow: startRow,
                usedLocations: usedLocations
            });

            if (available.length === 0) {
                return { locationId: zone + '-XX-XX', nextRow: 99, nextLevel: 1 };
            }

            var loc = available[0];
            return {
                locationId: loc.locationId,
                nextRow: loc.row,
                nextLevel: loc.level
            };
        };

        window.generateContainerLabels = function() {
            var items = window._containerData.items;
            if (items.length === 0) {
                alert('請先新增品項');
                return;
            }
            var needed = countContainerPallets(items);
            if (docNoPoolSize('IN') >= needed) return doGenerateContainerLabels();
            return window.ensureDocNoPool('IN', needed).then(doGenerateContainerLabels);
        };

        function doGenerateContainerLabels() {
            var items = window._containerData.items;

            var strategy = document.getElementById('container-strategy').value;

            var selectedZones = [];
            document.querySelectorAll('.container-zone-cb:checked').forEach(function(cb) {
                selectedZones.push(cb.value);
            });

            if (selectedZones.length === 0) {
                alert('請至少選擇一個區域');
                return;
            }

            var labels = smartAllocateLocations(items, {
                strategy: strategy,
                zones: selectedZones
            });

            var overflowCount = labels.filter(function(l) { return l.overflow; }).length;
            var nearExistingCount = labels.filter(function(l) { return l.nearExisting; }).length;
            
            // 顯示分配結果摘要
            var summaryMsg = '✅ 儲位分配完成！\n\n';
            summaryMsg += '📦 總板數：' + labels.length + ' 板\n';
            
            if (nearExistingCount > 0) {
                summaryMsg += '📍 鄰近現有庫存：' + nearExistingCount + ' 個品項\n';
                summaryMsg += '   （已優先分配到同品項相鄰位置）\n';
            }
            
            if (overflowCount > 0) {
                summaryMsg += '\n⚠️ 警告：有 ' + overflowCount + ' 板找不到空位！\n';
                summaryMsg += '請考慮擴大搜尋區域。';
            }
            
            // 只有在有特殊情況時才顯示提示
            if (nearExistingCount > 0 || overflowCount > 0) {
                alert(summaryMsg);
            }

            window._containerData.labels = labels;
            renderContainerLabels();

            document.getElementById('btn-print-labels').disabled = false;
            document.getElementById('btn-print-labels').classList.remove('cursor-not-allowed', 'bg-slate-700', 'text-slate-500');
            document.getElementById('btn-print-labels').classList.add('bg-blue-600', 'text-white');
            document.getElementById('btn-confirm-inbound').classList.remove('hidden');
        };

        window.showAvailableLocations = function() {
            var selectedZones = [];
            document.querySelectorAll('.container-zone-cb:checked').forEach(function(cb) {
                selectedZones.push(cb.value);
            });

            if (selectedZones.length === 0) {
                document.getElementById('available-count').innerHTML = '<div class="text-yellow-400">請選擇區域</div>';
                return;
            }

            var available = getFilteredAvailableLocations({ zones: selectedZones });

            var ZL = window.RACK_CONFIG.ZONE_LANES;
            var zoneMaxRows = { 'A': ZL['I-A'], 'B': ZL['I-B'], 'C': ZL['J-C'], 'D': ZL['J-D'], 'E': ZL['K-E'], 'F': ZL['K-F'], 'G': ZL['K-G'], 'H': ZL['K-H'] };
            var total = 0;
            selectedZones.forEach(function(z) {
                total += (zoneMaxRows[z] || 8) * 5; // 排數 x 5層
            });

            var occupied = total - available.length;
            var occupancyRate = total > 0 ? Math.round((occupied / total) * 100) : 0;

            var byZone = {};
            available.forEach(function(loc) {
                byZone[loc.zone] = (byZone[loc.zone] || 0) + 1;
            });

            var zoneInfo = selectedZones.map(function(z) {
                return z + '區: ' + (byZone[z] || 0) + '空位';
            }).join(', ');

            document.getElementById('available-count').innerHTML =
                '<div>可用空位: <span class="text-white font-bold">' + available.length + '</span> / ' + total + '</div>' +
                '<div>佔用率: <span class="' + (occupancyRate > 80 ? 'text-red-400' : 'text-yellow-400') + '">' + occupancyRate + '%</span></div>' +
                '<div class="text-slate-400 text-[10px] mt-1">' + zoneInfo + '</div>';
        };

        document.addEventListener('DOMContentLoaded', function() {
            document.querySelectorAll('.container-zone-cb').forEach(function(cb) {
                cb.addEventListener('change', function() {
                    var span = this.nextElementSibling;
                    if (this.checked) {
                        span.classList.remove('bg-slate-700', 'text-slate-400');
                        span.classList.add('bg-blue-600', 'text-white');
                    } else {
                        span.classList.remove('bg-blue-600', 'text-white');
                        span.classList.add('bg-slate-700', 'text-slate-400');
                    }
                    showAvailableLocations();
                });
            });

            setTimeout(function() {
                if (window.showAvailableLocations) showAvailableLocations();
            }, 1000);
        });

        window.renderContainerLabels = function() {
            var container = document.getElementById('container-labels-preview');
            var labels = window._containerData.labels || [];

            console.log('🏷️ renderContainerLabels 被呼叫，標籤數:', labels.length);

            if (!labels || labels.length === 0) {
                container.innerHTML = '<div class="col-span-2 text-center text-slate-500 py-4"><i class="fa-solid fa-tags text-xl mb-1"></i><div class="text-[10px]">請先新增品項</div></div>';
                return;
            }

            var html = '';
            labels.forEach(function(label, idx) {
                var expDisplay = label.expiryDate ? formatDate(label.expiryDate) : '-';
                
                // 鄰近現有庫存的標籤使用特殊邊框顏色
                var borderClass = label.nearExisting ? 'border-emerald-500' : 'border-black';
                var nearBadge = label.nearExisting ? '<div class="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center" title="鄰近現有庫存"><i class="fa-solid fa-link text-white" style="font-size: 8px;"></i></div>' : '';

                html += '<div class="relative bg-white rounded border-2 ' + borderClass + ' overflow-hidden" style="aspect-ratio: 297/210;">' +
                    nearBadge +
                    '<div class="border-b-2 border-black p-1 text-center" style="height: 35%;">' +
                    '<div class="font-black text-black leading-tight" style="font-size: clamp(10px, 2.5vw, 14px);">' + label.productName + '</div>' +
                    '</div>' +
                    '<div class="border-b border-black p-0.5 text-center bg-gray-50" style="height: 15%;">' +
                    '<div class="text-gray-700 font-bold" style="font-size: clamp(6px, 1.5vw, 10px);">' + (label.spec || '-') + '</div>' +
                    '</div>' +
                    '<div class="border-b border-black grid grid-cols-2 text-center" style="height: 25%;">' +
                    '<div class="border-r border-gray-300 p-0.5">' +
                    '<div class="text-gray-500" style="font-size: 5px;">批號</div>' +
                    '<div class="font-bold text-black" style="font-size: clamp(5px, 1.2vw, 8px);">' + label.batchNo + '</div>' +
                    '</div>' +
                    '<div class="p-0.5">' +
                    '<div class="text-gray-500" style="font-size: 5px;">數量</div>' +
                    '<div class="font-black text-red-600" style="font-size: clamp(8px, 2vw, 12px);">' + label.quantity + '</div>' +
                    '</div>' +
                    '</div>' +
                    '<div class="flex items-center justify-between px-1" style="height: 25%;">' +
                    '<div class="bg-black text-white font-black px-1 py-0.5 rounded" style="font-size: clamp(8px, 2vw, 12px);">' + label.locationId + '</div>' +
                    '<div class="text-gray-400 font-mono" style="font-size: clamp(5px, 1vw, 8px);">#' + (idx + 1) + '</div>' +
                    '</div>' +
                    '</div>';
            });

            container.innerHTML = html;
            
            // 更新標籤計數
            var labelCount = document.getElementById('container-label-count');
            if (labelCount) {
                labelCount.textContent = labels.length;
            }
            
            console.log('✅ 標籤渲染完成');
        };

        function formatDate(dateStr) {
            if (!dateStr) return '-';
            var d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            return d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0');
        }

        window.printContainerLabels = function() {
            var labels = window._containerData.labels;
            if (labels.length === 0) {
                alert('請先產生棧板插單');
                return;
            }
            // 印出來之後就不再整批重新產生板號（改品項只補新的插單）
            window._containerData.labelsPrinted = true;

            var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>棧板插單</title>';
            html += '<style>';
            html += '@page { size: A4 landscape; margin: 0; }';
            html += '* { margin: 0; padding: 0; box-sizing: border-box; }';
            html += 'body { font-family: Microsoft JhengHei, Arial, sans-serif; background: #fff; }';
            html += '.label-page { width: 297mm; height: 210mm; padding: 5mm; box-sizing: border-box; page-break-after: always; overflow: hidden; }';
            html += '.label-page:last-child { page-break-after: auto; }';
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
            
            html += '.no-print { text-align: center; padding: 20px; background: #f0f0f0; }';
            html += '.no-print button { padding: 15px 40px; font-size: 18px; border: none; cursor: pointer; font-weight: bold; margin: 0 10px; border-radius: 8px; }';
            html += '.btn-print { background: #059669; color: white; }';
            html += '.btn-close { background: #666; color: white; }';
            html += '@media print { .no-print { display: none !important; } }';
            html += '</style>';
            html += '</head><body>';

            labels.forEach(function(label, idx) {
                var expDisplay = label.expiryDate ? formatDate(label.expiryDate) : '-';
                var specText = label.spec || '-';
                var productName = label.productName || '-';
                var palletNo = label.palletNo || label.id || ('P-' + (idx + 1));
                var company = label.company || '崇文';
                
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
                html += '<div id="qrcode-' + idx + '" class="qr-box"></div>';
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
                html += '<div class="cell-qty"><div class="cell-label">數量</div><div class="cell-value qty">' + label.quantity + '</div></div>';
                html += '<div class="cell-batch"><div class="cell-label">批號</div><div class="cell-value batch">' + (label.batchNo || '-') + '</div></div>';
                html += '<div class="cell-exp"><div class="cell-label">效期</div><div class="cell-value exp">' + expDisplay + '</div></div>';
                html += '</div>';

                // 第四列：儲位、公司
                html += '<div class="row-4">';
                html += '<div class="location-box">' + label.locationId + '</div>';
                html += '<div class="company-box">' + company + '</div>';
                html += '</div>';

                html += '</div></div>';
            });

            html += '<div class="no-print">';
            html += '<button class="btn-print" onclick="window.print()">🖨️ 列印全部 ' + labels.length + ' 張插單</button>';
            html += '<button class="btn-close" onclick="window.close()">關閉</button>';
            html += '</div>';

            html += '<script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"><\/script>';
            html += '<script>window.onload = function() {';
            labels.forEach(function(label, idx) {
                var qrData = label.palletNo || label.id || ('P-' + (idx + 1));
                html += 'try { var qr' + idx + ' = qrcode(0, "M"); qr' + idx + '.addData("' + qrData + '"); qr' + idx + '.make(); document.getElementById("qrcode-' + idx + '").innerHTML = qr' + idx + '.createSvgTag(0, 0); } catch(e) { console.error(e); }';
            });
            html += '};<\/script>';

            html += '</body></html>';

            var printWindow = window.open('', '_blank', 'width=1100,height=800');
            printWindow.document.write(html);
            printWindow.document.close();
        };

        var _containerPosting = false;
        window.confirmContainerInbound = async function() {
            var labels = window._containerData.labels;
            if (!labels || labels.length === 0) {
                alert('請先產生棧板插單');
                return;
            }
            if (_containerPosting) return;   // 連點兩次不會入帳兩次

            console.log('═══════════════════════════════════════════════════════════');
            console.log('📦 開始貨櫃入庫確認，共', labels.length, '板');
            console.log('📦 標籤資料範例:', labels[0]);

            var ovN = labels.filter(function(l) { return l.overflow; }).length;
            if (!confirm('確定將 ' + labels.length + ' 板貨物入庫？\n\n入庫後將建立實際庫存記錄。' +
                (ovN ? '\n\n⚠️ 其中 ' + ovN + ' 板貨架排不下，會放在進貨暫存區 TEMP-IN，之後用手機「上架」放到儲位。' : ''))) return;

            _containerPosting = true;
            var btnConfirm = document.getElementById('btn-confirm-inbound');
            if (btnConfirm) btnConfirm.disabled = true;
            try {
                // 防呆：棧板編號已存在就停止，避免 batch.set 蓋掉現有庫存；
                // 但如果是這批貨櫃入庫上次寫到一半（網路斷掉）已經建立的板，就略過、只補沒寫進去的
                var palletIds = labels.map(function(label) { return label.id || label.palletNo; }).filter(Boolean);
                var dupIds = palletIds.filter(function(id, i) { return palletIds.indexOf(id) !== i; });
                var existingSnaps = await Promise.all(palletIds.map(function(id) {
                    return window.getDoc(window.doc(window.db, 'pallets', id));
                }));
                var alreadyPosted = {};
                existingSnaps.forEach(function(snap, i) {
                    if (!snap.exists) return;
                    var d = snap.data(), l = labels.find(function(x) { return (x.id || x.palletNo) === palletIds[i]; }) || {};
                    if (d.source === 'ContainerInbound' && d.productName === l.productName) alreadyPosted[palletIds[i]] = true;
                    else dupIds.push(palletIds[i]);
                });
                if (dupIds.length > 0) {
                    alert('❌ 以下棧板編號已被其他庫存使用，為避免覆蓋現有庫存已停止入庫：\n' + dupIds.slice(0, 10).join('\n') +
                          '\n\n請重新產生棧板插單後再入庫。');
                    return;
                }

                var writes = [];
                var successCount = 0;
                var skippedPosted = 0;

                labels.forEach(function(label, index) {
                    var palletId = label.id || label.palletNo || ('CT-' + Date.now() + '-' + index);
                    if (alreadyPosted[palletId]) { skippedPosted++; return; }
                    
                    // 確保 quantity 有值
                    var quantity = parseInt(label.quantity) || 0;
                    var totalWeight = parseFloat(label.totalWeight) || 0;
                    
                    if (quantity <= 0 && totalWeight <= 0) {
                        console.warn('⚠️ 跳過無效標籤:', label);
                        return;
                    }
                    
                    // 使用正確的 Firebase 語法
                    var docRef = window.doc(window.db, 'pallets', palletId);

                    var productCode = label.productCode || '';
                    if (!productCode && window.productMasterData) {
                        var _pm = window.productMasterData.find(function(p) { return p.name === label.productName; });
                        if (_pm) productCode = _pm.code || '';
                    }
                    var palletData = {
                        palletId: palletId,
                        productCode: productCode,
                        company: label.company || '崇文',
                        vendor: label.vendor || '',
                        productName: label.productName || '',
                        spec: label.spec || '',
                        batchNo: label.batchNo || '',
                        expiryDate: label.expiryDate ? new Date(label.expiryDate) : null,
                        quantity: quantity,
                        palletCapacity: label.perPallet || 40,
                        totalWeight: totalWeight,
                        unitWeight: parseFloat(label.unitWeight) || 0,
                        productType: label.productType || 'fixed',
                        locationId: label.locationId || 'TEMP-IN',
                        palletType: label.palletType || 'full',
                        boxSize: label.boxSize || 'standard',
                        status: 'Active',
                        category: 'Raw',
                        source: 'ContainerInbound',
                        inboundDate: new Date(),
                        createdAt: new Date()
                    };
                    
                    console.log('📝 準備寫入 #' + (index + 1) + ':', palletId, '數量:', quantity, '儲位:', palletData.locationId);

                    // 統一效期格式（本地 YYYY-MM-DD），並同時寫入入庫異動記錄
                    window.normalizeStockRecord(palletData);
                    writes.push({ ref: docRef, data: palletData });
                    writes.push({ ref: window.db.collection('inventoryLogs').doc(), data: window.buildInventoryLogEntry({
                        type: 'inbound',
                        company: palletData.company,
                        productName: palletData.productName,
                        spec: palletData.spec,
                        batchNo: palletData.batchNo,
                        expDate: palletData.expiryDate || '',
                        quantity: quantity,
                        quantityChange: quantity,
                        locationId: palletData.locationId,
                        palletId: palletId,
                        vendor: palletData.vendor || '',
                        weight: totalWeight,
                        weightChange: totalWeight,
                        note: '貨櫃入庫'
                    }) });
                    successCount++;
                });

                if (successCount === 0 && skippedPosted === 0) {
                    alert('❌ 沒有有效的入庫資料');
                    return;
                }

                console.log('📤 執行批次寫入，共', successCount, '筆...');
                // Firestore 一批最多 500 筆寫入，每板 2 筆（棧板＋記錄），分批提交
                for (var w = 0; w < writes.length; w += 400) {
                    var chunk = window.writeBatch(window.db);
                    writes.slice(w, w + 400).forEach(function(x) { chunk.set(x.ref, x.data); });
                    await chunk.commit();
                }
                console.log('✅ 批次寫入成功！');

                alert('✅ 入庫成功！共 ' + successCount + ' 板' + (skippedPosted ? '（另有 ' + skippedPosted + ' 板上次已經入帳，這次沒有重複寫入）' : '') + '\n\n請到「庫存查詢」確認資料。');

                // 清空資料
                window._containerData.items = [];
                window._containerData.labels = [];
                window._containerData.labelsPrinted = false;
                renderContainerItems();
                document.getElementById('container-labels-preview').innerHTML = '<div class="col-span-2 text-center text-slate-500 py-8"><i class="fa-solid fa-tags text-3xl mb-2"></i><div>請先新增品項並產生插單</div></div>';
                document.getElementById('btn-print-labels').disabled = true;
                document.getElementById('btn-confirm-inbound').classList.add('hidden');

            } catch (err) {
                console.error('❌ 入庫失敗:', err);
                alert('❌ 入庫失敗：' + err.message + '\n\n請檢查網路後再按一次「確認入庫」：已經寫進去的板會自動略過，不會重複。');
            } finally {
                _containerPosting = false;
                if (btnConfirm) btnConfirm.disabled = false;
            }
        };

                function handlePreInboundImport(e) { const file = e.target.files[0]; const reader = new FileReader(); reader.onload = function(evt) { const wb = XLSX.read(evt.target.result, {type:'array'}); const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]); if(confirm(`匯入 ${json.length} 筆？`)) { const batch = window.writeBatch(window.db); json.forEach((r,i) => { const pid = `PRE-${Date.now()}-${i}`; batch.set(window.doc(window.collection(window.db, "pallets"), pid), { palletId:pid, vendor:r['廠商']||'', productName:r['品名'], spec:r['規格']||'', batchNo:r['批號']||'', quantity:r['數量'], locationId:"VIRTUAL-DOCK", status:"Planned", inboundDate:new Date() }); }); batch.commit().then(() => alert("匯入成功")).catch(err => { console.error('匯入失敗:', err); alert("匯入失敗: " + err.message); }); } }; reader.readAsArrayBuffer(file); }
        function generatePlan() {
            const count = document.getElementById('pre-count').value; const name = document.getElementById('pre-name').value; const spec = document.getElementById('pre-spec').value; const batch = document.getElementById('pre-batch').value; const vendor = document.getElementById('pre-vendor').value;
            const area = document.getElementById('preview-area'); area.innerHTML = '';
            document.getElementById('btn-print').disabled = false; document.getElementById('btn-print').classList.remove('cursor-not-allowed', 'bg-slate-700'); document.getElementById('btn-print').classList.add('bg-blue-600', 'text-white');
            for(let i=1; i<=count; i++) { const code = `PRE-${batch}-${i}`; area.innerHTML += `<div class="bg-white p-3 rounded text-black text-xs border border-slate-300"><div class="font-bold text-sm">${name}</div><div>規格: ${spec}</div><div>批號: ${batch}</div><div>${vendor}</div><svg id="bc-${i}" class="w-full h-10 mt-1"></svg></div>`; setTimeout(() => JsBarcode(`#bc-${i}`, code, {format:"CODE128", height:30, displayValue:true}), 100); }
        }
        function printLabels() {
            var previewArea = document.getElementById('preview-area');
            if (!previewArea || previewArea.innerHTML.trim() === '') {
                alert('請先產生標籤');
                return;
            }
            openPrintPreview(previewArea.innerHTML, '入庫標籤', 900, 700);
        }

        window.deletePallet = async function(id) {
            if(!confirm("確定刪除此庫存？")) return;

            var pallets = window.currentPallets ? window.currentPallets() : [];
            var pallet = pallets.find(function(p) { return p.id === id; });

            await window.deleteDoc(window.doc(window.db, "pallets", id));

            if (pallet) {
                await window.logInventoryChange({
                    type: 'adjust',
                    company: pallet.company || '',
                    productName: pallet.productName || '',
                    spec: pallet.spec || '',
                    quantity: pallet.quantity || 0,
                    quantityChange: -(pallet.quantity || 0),
                    locationId: pallet.locationId || '',
                    batchNo: pallet.batchNo || '',
                    palletId: pallet.palletId || '',
                    note: '手動刪除庫存'
                });
                logAudit('DELETE', 'pallets', pallet.palletId || id, '刪除棧板：' + (pallet.productName || '') + ' ' + (pallet.locationId || ''), '數量:' + (pallet.quantity || 0));
            }
        }

        window.clearLane = async function(zone, row) {
            if(!confirm(`⚠️ 警告：確定清空 [${zone} 第 ${row} 行]？`)) return;

            const q = window.query(window.collection(window.db, "pallets"), window.where("locationId", ">=", `${zone}-${row < 10 ? '0'+row : row}`), window.where("locationId", "<=", `${zone}-${row < 10 ? '0'+row : row}\uf8ff`));
            const snap = await window.getDocs(q);
            const batch = window.writeBatch(window.db);
            var logPromises = [];

            snap.forEach(function(doc) {
                batch.delete(doc.ref);
                var data = doc.data();
                logPromises.push(window.logInventoryChange({
                    type: 'adjust',
                    company: data.company || '',
                    productName: data.productName || '',
                    spec: data.spec || '',
                    quantity: data.quantity || 0,
                    quantityChange: -(data.quantity || 0),
                    locationId: data.locationId || '',
                    batchNo: data.batchNo || '',
                    palletId: data.palletId || '',
                    note: '清空巷道: ' + zone + '-' + row
                }));
            });

            await batch.commit();
            await Promise.all(logPromises);
            alert("巷道已清空");
        }

        window.inventoryCompanyFilter = 'all';

        window.setInventoryCompany = function(company) {
            window.inventoryCompanyFilter = company;

            document.getElementById('btn-inv-all').className = company === 'all'
                ? 'px-3 py-1.5 rounded text-xs font-bold bg-slate-600 text-white'
                : 'px-3 py-1.5 rounded text-xs font-bold bg-slate-700 text-slate-300 hover:bg-slate-600';
            document.getElementById('btn-inv-cw').className = company === '崇文'
                ? 'px-3 py-1.5 rounded text-xs font-bold bg-blue-600 text-white'
                : 'px-3 py-1.5 rounded text-xs font-bold bg-slate-700 text-slate-300 hover:bg-slate-600';
            document.getElementById('btn-inv-bf').className = company === '八方'
                ? 'px-3 py-1.5 rounded text-xs font-bold bg-purple-600 text-white'
                : 'px-3 py-1.5 rounded text-xs font-bold bg-slate-700 text-slate-300 hover:bg-slate-600';

            filterInventory();
        };

        function filterInventory() {
            const term = document.getElementById('global-search').value.toLowerCase();
            const companyFilter = window.inventoryCompanyFilter || 'all';

            document.querySelectorAll('#inventory-list-body tr').forEach(row => {
                const matchesTerm = row.innerText.toLowerCase().includes(term);
                const rowCompany = row.getAttribute('data-company') || '';
                const matchesCompany = companyFilter === 'all' || rowCompany === companyFilter;

                row.style.display = (matchesTerm && matchesCompany) ? '' : 'none';
            });
        }
