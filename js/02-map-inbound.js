// ============================================================
// js/02-map-inbound.js — 排序、倉庫地圖、入庫單
// 由原 app.js 第 729–2074 行拆出；各檔依 index.html 的順序載入，共用全域（window）
// ============================================================
        // ========== 通用排序函數：相同品項排在一起 ==========
        // 排序優先順序：品名 > 規格 > 批號 > 效期 > 儲位
        window.sortByProductGroup = function(data, options) {
            if (!Array.isArray(data)) return data;
            
            var opts = options || {};
            var sortedData = data.slice(); // 複製陣列
            
            sortedData.sort(function(a, b) {
                // 1. 品名排序（中文）
                var nameA = (a.productName || '').toString();
                var nameB = (b.productName || '').toString();
                var nameCompare = nameA.localeCompare(nameB, 'zh-TW');
                if (nameCompare !== 0) return nameCompare;
                
                // 2. 規格排序
                var specA = (a.spec || '').toString();
                var specB = (b.spec || '').toString();
                var specCompare = specA.localeCompare(specB, 'zh-TW');
                if (specCompare !== 0) return specCompare;
                
                // 3. 批號排序
                var batchA = (a.batchNo || '').toString();
                var batchB = (b.batchNo || '').toString();
                var batchCompare = batchA.localeCompare(batchB, 'zh-TW');
                if (batchCompare !== 0) return batchCompare;
                
                // 4. 效期排序（早的在前，FEFO）
                var expA = a.expiryDate || a.expDate || '';
                var expB = b.expiryDate || b.expDate || '';
                if (expA && expB) {
                    var dateA = expA.toDate ? expA.toDate() : new Date(expA);
                    var dateB = expB.toDate ? expB.toDate() : new Date(expB);
                    if (dateA.getTime() !== dateB.getTime()) {
                        return dateA - dateB;
                    }
                } else if (expA) {
                    return -1;
                } else if (expB) {
                    return 1;
                }
                
                // 5. 儲位排序
                var locA = (a.locationId || '').toString();
                var locB = (b.locationId || '').toString();
                var locCompare = locA.localeCompare(locB);
                if (locCompare !== 0) return locCompare;
                
                // 6. 數量排序（多的在前）
                return (b.quantity || 0) - (a.quantity || 0);
            });
            
            return sortedData;
        };
        
        // 巷道使用率：三層各自依混合板型使用率計算後取平均（容量來自 RACK_CONFIG）
        window.laneFillPercent = function(levelCounts) {
            var sum = 0;
            ['3F', '2F', '1F'].forEach(function(lv) {
                sum += Math.min(1, window.levelUsageRatio(levelCounts[lv] || {}, lv));
            });
            return Math.round(sum / 3 * 100);
        };

        function renderMapUI(gridId) {
            const container = document.getElementById(gridId); if(!container) return; container.innerHTML = '';
            const parts = gridId.replace('grid-', '').replace('-map', '').split('-'); const zoneKey = `${parts[0]}-${parts[1]}`;
            const zoneChar = parts[1];
            const warehouse = parts[0];
            const inventory = window.currentInventory ? window.currentInventory() : [];
            const laneStatus = {};
            inventory.forEach(item => {
                if(!item.locationId || item.locationId.startsWith('V-')) return;
                var parsed = parseLocationId(item.locationId);
                if(!parsed) return;
                if(parsed.zone === zoneKey) {
                    var lane = parsed.row;
                    if(!laneStatus[lane]) laneStatus[lane] = { count: 0, products: new Set(), levels: {} };
                    laneStatus[lane].count++;
                    laneStatus[lane].products.add(item.productName);
                    if (!laneStatus[lane].levels[parsed.level]) laneStatus[lane].levels[parsed.level] = {};
                    window.addPalletToCounts(laneStatus[lane].levels[parsed.level], item);
                }
            });

            const isKZone = zoneKey.startsWith('K-');
            const laneCount = isKZone ? 22 : 8;

            for(let i=1; i<=laneCount; i++) {
                const status = laneStatus[i] || { count: 0, levels: {} };
                const fillPercent = window.laneFillPercent(status.levels);

                let fillColor = '#10b981'; if(fillPercent>=50) fillColor='#3b82f6'; if(fillPercent>=100) fillColor='#ef4444';
                let cls = '';
                if (fillPercent >= 100) cls += ' lane-full-locked';
                if (lockedLane && lockedLane.zone === zoneKey && lockedLane.row === i) cls += ' border-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.5)] z-20';
                const targetName = document.getElementById('in-name') ? document.getElementById('in-name').value : '';
                if(targetName && status.products && status.products.has(targetName) && fillPercent < 100) cls += ' lane-suggest-gold';

                const div = document.createElement('div'); div.className = `rack-lane-new ${cls}`;
                var starIcon = cls.includes('gold') ? '<i class="fa-solid fa-star text-yellow-400 absolute top-1/2 left-1/2 -translate-x-1/2 text-[8px]"></i>' : '';
                div.innerHTML = '<span class="lane-id-tag">' + zoneChar + i + '</span><div class="lane-fill-bar" style="height:' + fillPercent + '%; background:' + fillColor + '"></div>' + starIcon;

                var isInbound = !document.getElementById('view-unified-inbound').classList.contains('hidden');
                if(isInbound) {
                    (function(z, r) { div.onclick = function() { openLevelSelector(z, r); }; })(zoneKey, i);
                } else {
                    (function(z, r) {
                        div.onmouseenter = function(e) { showHoverTooltip(e, z, r); };
                        div.onmouseleave = function() { hideHoverTooltip(); };
                        div.onmousemove = function(e) { moveHoverTooltip(e); };
                    })(zoneKey, i);
                }
                container.appendChild(div);
            }
        }

        window.currentViewingLane = null;

        function showHoverTooltip(e, zone, row) {
            const tooltip = document.getElementById('hover-tooltip');
            const title = document.getElementById('tooltip-title');
            const badge = document.getElementById('tooltip-badge');
            const body = document.getElementById('tooltip-body');
            if (!tooltip) return;

            const inventory = window.currentInventory ? window.currentInventory() : [];
            const zoneChar = zone.split('-')[1];
            const warehouse = zone.split('-')[0];
            const lanePrefix = zone + '-' + (row < 10 ? '0'+row : row);
            const items = inventory.filter(d => d.locationId && d.locationId.startsWith(lanePrefix));
            const levels = { '3F': [], '2F': [], '1F': [] };
            items.forEach(d => {
                var parsed = parseLocationId(d.locationId);
                if(parsed && levels[parsed.level]) levels[parsed.level].push(d);
            });

            const totalItems = levels['3F'].length + levels['2F'].length + levels['1F'].length;
            // 依 RACK_CONFIG 與混合板型使用率計算：空位以「還能放幾個整板（2F/3F）/ 散板（1F）」估算
            let usageSum = 0;
            let emptySlots = 0;
            ['3F', '2F', '1F'].forEach(function(lv) {
                const counts = {};
                levels[lv].forEach(function(p) { window.addPalletToCounts(counts, p); });
                usageSum += Math.min(1, window.levelUsageRatio(counts, lv));
                emptySlots += window.levelRemaining(counts, lv, lv === '1F' ? 'scattered' : 'full');
            });
            const fillPercent = Math.round(usageSum / 3 * 100);

            title.textContent = lanePrefix + ' 巷';
            badge.textContent = fillPercent + '% 使用中';
            badge.style.background = fillPercent >= 100 ? 'rgba(239,68,68,0.5)' : fillPercent >= 50 ? 'rgba(59,130,246,0.5)' : 'rgba(16,185,129,0.5)';

            body.innerHTML = renderTooltipContent(levels, emptySlots, totalItems);

            tooltip.classList.remove('hidden');
            moveHoverTooltip(e);
        }

        function moveHoverTooltip(e) {
            const tooltip = document.getElementById('hover-tooltip');
            if (!tooltip || tooltip.classList.contains('hidden')) return;

            const padding = 10;
            const rect = tooltip.getBoundingClientRect();
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const tooltipW = Math.min(rect.width, 580);
            const tooltipH = rect.height;

            let x = e.clientX + padding;
            let y = e.clientY + padding;

            if (x + tooltipW > vw - padding) {
                x = e.clientX - tooltipW - padding;
            }
            if (y + tooltipH > vh - padding) {
                y = vh - tooltipH - padding;
            }
            if (x < padding) x = padding;
            if (y < padding) y = padding;

            tooltip.style.left = x + 'px';
            tooltip.style.top = y + 'px';
        }

        function hideHoverTooltip() {
            const tooltip = document.getElementById('hover-tooltip');
            if (tooltip) tooltip.classList.add('hidden');
        }

        function renderTooltipContent(levels, emptySlots, totalItems) {
            let html = '<div class="tooltip-summary">';
            html += '<div class="tooltip-stat ' + (totalItems > 0 ? '' : 'empty') + '"><div class="tooltip-stat-value">' + totalItems + '</div><div class="tooltip-stat-label">已存放</div></div>';
            html += '<div class="tooltip-stat ' + (emptySlots === 0 ? 'full' : 'empty') + '"><div class="tooltip-stat-value">' + emptySlots + '</div><div class="tooltip-stat-label">空位</div></div>';
            html += '</div>';

            const allItems = [...levels['3F'], ...levels['2F'], ...levels['1F']];

            if (allItems.length > 0) {
                html += '<table class="w-full text-xs">';
                html += '<thead><tr class="text-slate-400 border-b border-slate-700">';
                html += '<th class="p-1.5 text-left">儲位</th>';
                html += '<th class="p-1.5 text-left">棧板編號</th>';
                html += '<th class="p-1.5 text-left">公司</th>';
                html += '<th class="p-1.5 text-left">品名</th>';
                html += '<th class="p-1.5 text-left">規格</th>';
                html += '<th class="p-1.5 text-right">數量</th>';
                html += '<th class="p-1.5 text-left">效期</th>';
                html += '<th class="p-1.5 text-left">寄倉</th>';
                html += '</tr></thead><tbody>';

                allItems.forEach(item => {
                    const companyClass = item.company === '崇文' ? 'bg-blue-600' : 'bg-emerald-600';

                    let expiryStr = '-';
                    if (item.expiryDate) {
                        const expDate = item.expiryDate.toDate ? item.expiryDate.toDate() : new Date(item.expiryDate);
                        expiryStr = expDate.toLocaleDateString('zh-TW');
                        const daysLeft = Math.ceil((expDate - new Date()) / (1000 * 60 * 60 * 24));
                        if (daysLeft < 0) {
                            expiryStr = '<span class="text-red-400">' + expiryStr + '</span>';
                        } else if (daysLeft <= 30) {
                            expiryStr = '<span class="text-orange-400">' + expiryStr + '</span>';
                        }
                    }

                    let consignStr = '-';
                    // 直接從 consignmentData 查詢
                    if (window.consignmentData && Array.isArray(window.consignmentData) && item.locationId) {
                        let consignedQty = 0;
                        let consignCustomers = [];
                        window.consignmentData.forEach(c => {
                            if (c.status !== 'active') return;
                            if (c.locationId && c.locationId === item.locationId) {
                                consignedQty += (c.remainingQty || 0);
                                if (c.customer && !consignCustomers.includes(c.customer)) {
                                    consignCustomers.push(c.customer);
                                }
                            }
                        });
                        if (consignCustomers.length > 0 && consignedQty > 0) {
                            consignStr = '<span class="text-amber-400">' + consignCustomers.join(',') + ' (' + consignedQty + ')</span>';
                        }
                    }

                    html += '<tr class="border-b border-slate-800 hover:bg-slate-800/50">';
                    let locDisplay = item.locationId || '-';
                    if (item.locationId) {
                        locDisplay = item.locationId
                            .replace(/-1F$/, '-<span class="text-emerald-400">1F</span>')
                            .replace(/-2F$/, '-<span class="text-sky-400">2F</span>')
                            .replace(/-3F$/, '-<span class="text-purple-400">3F</span>');
                    }
                    html += '<td class="p-1.5 font-mono text-[10px] text-slate-300 font-bold">' + locDisplay + '</td>';
                    html += '<td class="p-1.5 font-mono text-[10px] text-slate-400">' + (item.palletId || '-') + '</td>';
                    html += '<td class="p-1.5"><span class="px-1 py-0.5 rounded text-[10px] ' + companyClass + '">' + (item.company || '-') + '</span></td>';
                    html += '<td class="p-1.5 text-white">' + (item.productName || '-') + '</td>';
                    html += '<td class="p-1.5 text-slate-400 text-[10px]">' + (item.spec || '-') + '</td>';
                    var qtyDisplay = (item.quantity || 0) + '件';
                    if (item.productType === 'variable' && item.totalWeight > 0) {
                        qtyDisplay += '<span class="text-amber-400 text-[10px] ml-1">/ ' + item.totalWeight + 'kg</span>';
                    } else if (item.unitWeight && item.unitWeight > 0) {
                        qtyDisplay += '<span class="text-slate-500 text-[10px] ml-1">@' + item.unitWeight + 'kg</span>';
                    } else if (item.totalWeight && item.totalWeight > 0) {
                        qtyDisplay += '<span class="text-amber-400 text-[10px] ml-1">/ ' + item.totalWeight + 'kg</span>';
                    }
                    html += '<td class="p-1.5 text-right font-bold text-white">' + qtyDisplay + '</td>';
                    html += '<td class="p-1.5">' + expiryStr + '</td>';
                    html += '<td class="p-1.5">' + consignStr + '</td>';
                    html += '</tr>';
                });

                html += '</tbody></table>';
            } else {
                html += '<div class="text-center text-slate-500 py-4">此巷道目前沒有庫存</div>';
            }

            return html;
        }

        function renderTooltipLevel(name, items, cap) {
            let html = '<div class="tooltip-level">';
            html += '<div class="tooltip-level-header"><span class="tooltip-level-name">' + name + '</span><span class="tooltip-level-count">' + items.length + '/' + cap + '</span></div>';

            const gridClass = cap >= 8 ? 'tooltip-items-1f' : 'tooltip-items';
            html += '<div class="' + gridClass + '">';

            items.forEach(item => {
                let catClass = 'cat-raw';
                if (item.category === 'FG') catClass = 'cat-fg';
                if (item.category === 'WIP') catClass = 'cat-wip';
                html += '<div class="tooltip-item ' + catClass + '">';
                html += '<div class="tooltip-item-name">' + (item.productName || '未知') + '</div>';
                html += '<div class="tooltip-item-qty">' + (item.quantity || 0) + '</div>';
                html += '</div>';
            });

            var emptyCount = cap - items.length;
            if (emptyCount > 0) {
                html += '<div class="tooltip-item empty-slot">';
                html += '<div class="tooltip-item-name">空位 ×' + emptyCount + '</div>';
                html += '<div class="tooltip-item-qty">-</div>';
                html += '</div>';
            }

            html += '</div></div>';
            return html;
        }

        function showLaneDetail(zone, row) {
            window.currentViewingLane = { zone, row };
        }
        function renderVisualLevel(layer, items, cap, isHigh) {
            let boxes = '';
            items.forEach(item => {
                let bg = 'bg-raw'; if(item.category==='FG') bg='bg-fg'; if(item.category==='WIP') bg='bg-wip';
                boxes += `
                    <div class="pallet-box ${bg} ${isHigh?'loose':''}" title="${item.productName}">
                        <div class="row-1"><span class="name">${item.productName}</span><span class="qty">${item.quantity}件</span></div>
                        <div class="row-2">${item.spec||'無規格'}</div>
                        <div class="row-3">${item.batchNo}</div>
                    </div>
                `;
            });
            for(let i=0; i<(cap-items.length); i++) boxes += `<div class="pallet-box pallet-empty">空</div>`;
            return `
                <div class="level-card">
                    <div class="level-header"><span class="${isHigh?'text-yellow-500':'text-slate-300'}">${layer} ${isHigh?'(挑高)':''}</span><span>${items.length}/${cap}</span></div>
                    <div class="level-grid ${isHigh?'grid-cols-4 gap-2':'grid-cols-4 gap-2'}">${boxes}</div>
                </div>
            `;
        }

        function openAnalytics(type) { document.getElementById('analytics-title').innerText = type==='Total'?'庫存總覽':type; document.getElementById('modal-analytics').classList.remove('hidden'); }
        function closeAnalytics() { document.getElementById('modal-analytics').classList.add('hidden'); }

        let currentLane = null;
        function openLevelSelector(zone, row) {
            currentLane = { zone, row };
            var lanePrefix = zone + '-' + (row < 10 ? '0'+row : row);
            document.getElementById('modal-lane-title').innerText = lanePrefix + ' 巷';
            var inventory = window.currentInventory();
            var items = inventory.filter(function(d) { return d.locationId && d.locationId.startsWith(lanePrefix); });

            var c3 = items.filter(function(d) { var p = parseLocationId(d.locationId); return p && p.level === '3F'; }).length;
            var c2 = items.filter(function(d) { var p = parseLocationId(d.locationId); return p && p.level === '2F'; }).length;
            var c1 = items.filter(function(d) { var p = parseLocationId(d.locationId); return p && p.level === '1F'; }).length;

            // ========== 簡化版：判斷板型後查表 ==========
            var productType = typeof getProductType === 'function' ? getProductType() : 'fixed';
            var qty = 0;
            var perPallet = 40;
            var productName = document.getElementById('in-name').value;
            
            // 從品項主檔讀取板容量（不管是定重還是不定重都要讀）
            var master = (window.productMasterData || []).find(function(p) { return p.name === productName; });
            if (master && master.palletCapacity) {
                perPallet = master.palletCapacity;
            }
            
            if (productType === 'fixed') {
                qty = parseInt(document.getElementById('in-qty').value) || 0;
            } else {
                qty = parseInt(document.getElementById('in-qty-var').value) || 0;
            }
            
            // 判斷板型
            var palletType = qty > 0 ? window.getPalletType(qty, perPallet) : 'full';
            var fillRate = qty / perPallet;
            var fillRatePercent = Math.round(fillRate * 100);
            
            // 查表取得各層容量
            var CAP_3F = window.getLevelCapacity('3F', palletType);
            var CAP_2F = window.getLevelCapacity('2F', palletType);
            var CAP_1F = window.getLevelCapacity('1F', palletType);
            
            // 板型標籤
            var palletTypeNames = { full: '整板', partial: '不足板', scattered: '散板' };
            var palletTypeLabel = palletTypeNames[palletType] || '整板';
            var infoLabel = qty > 0 ? 
                '<div class="text-xs text-cyan-400 mb-3 text-center">📦 ' + qty + '件/' + perPallet + '件 (' + fillRatePercent + '%) → ' + palletTypeLabel + '</div>' : 
                '<div class="text-xs text-slate-500 mb-3 text-center">請先輸入數量以判斷板型</div>';
            
            // 更新標題顯示
            document.getElementById('modal-lane-title').innerHTML = lanePrefix + ' 巷' + infoLabel;

            // 3F 按鈕
            var btn3F = document.getElementById('btn-level-3f');
            var avail3F = Math.max(0, CAP_3F - c3);
            if (CAP_3F === 0) {
                btn3F.classList.add('level-btn-full');
                btn3F.disabled = true;
                btn3F.innerHTML = '<div class="font-bold text-slate-500">3F</div><div class="text-xs text-slate-500 mt-1">不可放 ' + palletTypeLabel + '</div><div class="text-xs text-slate-600">⛔ 3F 只放整板</div>';
            } else if(c3 >= CAP_3F) {
                btn3F.classList.add('level-btn-full');
                btn3F.disabled = true;
                btn3F.innerHTML = '<div class="font-bold text-red-400">3F (滿)</div><div class="text-xs text-red-300 mt-1">' + c3 + '/' + CAP_3F + ' 板</div><div class="text-xs text-red-500">⚠️ 已滿載</div>';
            } else {
                btn3F.classList.remove('level-btn-full');
                btn3F.disabled = false;
                btn3F.innerHTML = '<div class="font-bold text-white">3F</div><div class="text-xs text-slate-300 mt-1">' + c3 + '/' + CAP_3F + ' 板</div><div class="text-xs text-green-400">✓ 可放 ' + avail3F + ' 板</div>';
            }

            // 2F 按鈕
            var btn2F = document.getElementById('btn-level-2f');
            var avail2F = Math.max(0, CAP_2F - c2);
            if(c2 >= CAP_2F) {
                btn2F.classList.add('level-btn-full');
                btn2F.disabled = true;
                btn2F.innerHTML = '<div class="font-bold text-red-400">2F (滿)</div><div class="text-xs text-red-300 mt-1">' + c2 + '/' + CAP_2F + ' 板</div><div class="text-xs text-red-500">⚠️ 已滿載</div>';
            } else {
                btn2F.classList.remove('level-btn-full');
                btn2F.disabled = false;
                btn2F.innerHTML = '<div class="font-bold text-white">2F</div><div class="text-xs text-slate-300 mt-1">' + c2 + '/' + CAP_2F + ' 板</div><div class="text-xs text-green-400">✓ 可放 ' + avail2F + ' 板</div>';
            }

            // 1F 按鈕
            var btn1F = document.getElementById('btn-level-1f');
            var avail1F = Math.max(0, CAP_1F - c1);
            if(c1 >= CAP_1F) {
                btn1F.classList.add('level-btn-full');
                btn1F.disabled = true;
                btn1F.innerHTML = '<div class="font-bold text-red-400">1F 挑高 (滿)</div><div class="text-xs text-red-300 mt-1">' + c1 + '/' + CAP_1F + ' 板</div><div class="text-xs text-red-500">⚠️ 已滿載</div>';
            } else {
                btn1F.classList.remove('level-btn-full');
                btn1F.disabled = false;
                btn1F.innerHTML = '<div class="font-bold text-yellow-400">1F 挑高</div><div class="text-xs text-slate-300 mt-1">' + c1 + '/' + CAP_1F + ' 板</div><div class="text-xs text-green-400">✓ 可放 ' + avail1F + ' 板</div>';
            }

            document.getElementById('loc-select-physical').classList.remove('hidden');
            document.getElementById('loc-select-virtual').classList.add('hidden');
            document.getElementById('modal-level-select').classList.remove('hidden');
        }
        function closeLocModal() { document.getElementById('modal-level-select').classList.add('hidden'); }
        function selectLevel(level) { if(!currentLane) return; const rowStr = currentLane.row < 10 ? '0'+currentLane.row : currentLane.row; document.getElementById('in-loc').value = `${currentLane.zone}-${rowStr}-${level}`; closeLocModal(); updateLivePreview(); }

        const virtualLocations = [{id:'V-SALES',name:'業務保留'},{id:'V-TEMP',name:'臨時暫存'},{id:'V-QC',name:'品管留置'}];
        function openVirtualSelector() { document.getElementById('virtual-grid').innerHTML = virtualLocations.map(v=>`<div class="virtual-card" onclick="selectVirtualLoc('${v.id}')"><div class="font-bold text-white text-sm">${v.name}</div><div class="text-[10px] text-slate-400 mt-1">${v.id}</div></div>`).join(''); document.getElementById('loc-select-physical').classList.add('hidden'); document.getElementById('loc-select-virtual').classList.remove('hidden'); document.getElementById('modal-level-select').classList.remove('hidden'); }
        function addNewVirtualLoc() { const name = document.getElementById('new-virtual-name').value; if(name) { virtualLocations.push({id:`V-CUSTOM-${Date.now().toString().slice(-4)}`, name}); openVirtualSelector(); } }
        function selectVirtualLoc(id) { document.getElementById('in-loc').value = id; closeLocModal(); }
        function setCategory(cat) {
            document.querySelectorAll('.border-emerald-600, .border-slate-600').forEach(el => { if(el.id.startsWith('cat-')) el.className = "border border-slate-600 text-slate-400 text-center rounded text-[10px] py-1"; });
            const activeEl = document.getElementById('cat-'+cat);
            if(cat==='Raw') activeEl.className = "border border-emerald-600 bg-emerald-900/30 text-emerald-400 text-center rounded text-[10px] py-1 font-bold";
            if(cat==='FG') activeEl.className = "border border-purple-600 bg-purple-900/30 text-purple-400 text-center rounded text-[10px] py-1 font-bold";
            if(cat==='WIP') activeEl.className = "border border-yellow-600 bg-yellow-900/30 text-yellow-400 text-center rounded text-[10px] py-1 font-bold";
            document.getElementById('in-category').value = cat;
        }

        function focusNext(e, nextId) { if(e.key === 'Enter') { if(nextId==='confirm-btn') confirmUnifiedInbound(); else document.getElementById(nextId).focus(); } }

        // ===== 入庫單功能（統一格式 - 跟貨櫃入庫一樣）=====
        window.previewInboundSlip = function() {
            var name = document.getElementById('in-name').value;
            var spec = document.getElementById('in-spec').value || '';
            var qty = document.getElementById('in-qty').value;
            var batch = document.getElementById('in-batch').value || '';
            var exp = document.getElementById('in-exp').value || '';
            var loc = document.getElementById('in-loc').value || '';
            var vendor = document.getElementById('in-vendor') ? document.getElementById('in-vendor').value : '';

            if(!name) { alert('請先填寫品名'); return; }
            if(!qty) { alert('請先填寫數量'); return; }

            var now = new Date();
            var slipNo = window.generateDocNo ? window.generateDocNo('IN') : 'IN-' + now.getFullYear() + ('0'+(now.getMonth()+1)).slice(-2) + ('0'+now.getDate()).slice(-2) + '-001';

            var labelHtml = generateSlipLabelHtml({
                locationId: loc || '待分配',
                productName: name,
                spec: spec,
                batchNo: batch || '-',
                expiryDate: exp,
                quantity: qty,
                vendor: vendor,
                palletId: slipNo
            }, 0);

            var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>棧板插單 - ' + name + '</title>';
            html += '<style>';
            html += '@page { size: A4 landscape; margin: 0; }';
            html += '* { margin: 0; padding: 0; box-sizing: border-box; }';
            html += 'body { font-family: Microsoft JhengHei, Arial, sans-serif; background: #fff; }';
            html += '.label-page { width: 297mm; height: 210mm; padding: 8mm; box-sizing: border-box; }';
            html += '.label-content { height: 100%; border: 3px solid #000; display: flex; flex-direction: column; }';
            html += '.location-row { background: #e5e5e5; border-bottom: 3px solid #000; padding: 8mm 0; text-align: center; }';
            html += '.location-text { font-size: 26mm; font-weight: 900; letter-spacing: 5mm; }';
            html += '.product-section { flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 5mm; }';
            html += '.product-name { font-size: 28mm; font-weight: 900; }';
            html += '.product-spec { font-size: 16mm; color: #333; margin-top: 3mm; }';
            html += '.info-row { border-top: 3px solid #000; display: flex; }';
            html += '.info-cell { flex: 1; text-align: center; padding: 5mm 2mm; border-right: 1px solid #ccc; }';
            html += '.info-cell:last-child { border-right: none; }';
            html += '.info-label { font-size: 4mm; color: #666; margin-bottom: 2mm; }';
            html += '.info-value { font-size: 14mm; font-weight: 900; }';
            html += '.info-value.qty { font-size: 22mm; color: #dc2626; }';
            html += '.barcode-row { border-top: 2px dashed #999; padding: 4mm 0; text-align: center; }';
            html += '.no-print { text-align: center; padding: 20px; }';
            html += '.no-print button { padding: 15px 40px; font-size: 18px; border: none; cursor: pointer; font-weight: bold; margin: 0 10px; border-radius: 8px; }';
            html += '.btn-print { background: #059669; color: white; }';
            html += '.btn-close { background: #666; color: white; }';
            html += '@media print { .no-print { display: none !important; } }';
            html += '</style>';
            html += '<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>';
            html += '</head><body>';

            html += '<div class="label-page"><div class="label-content">';

            html += '<div class="location-row"><div class="location-text">' + (loc || '待分配') + '</div></div>';

            html += '<div class="product-section">';
            html += '<div class="product-name">' + name + ' <span style="font-size:16mm;color:#333;">' + spec + '</span></div>';
            if (vendor) {
                html += '<div class="product-spec">(' + vendor + ')</div>';
            }
            html += '</div>';

            html += '<div class="info-row">';
            html += '<div class="info-cell"><div class="info-label">批號</div><div class="info-value">' + (batch || '-') + '</div></div>';
            html += '<div class="info-cell"><div class="info-label">效期</div><div class="info-value">' + (exp || '-') + '</div></div>';
            html += '<div class="info-cell"><div class="info-label">數量</div><div class="info-value qty">' + qty + '</div></div>';
            html += '<div class="info-cell"><div class="info-label">廠商</div><div class="info-value">' + (vendor || '-') + '</div></div>';
            html += '</div>';

            html += '<div class="barcode-row"><svg id="slip-barcode"></svg></div>';

            html += '</div></div>';

            html += '<div class="no-print">';
            html += '<button class="btn-print" onclick="window.print()">🖨️ 列印全部 1 張插單</button>';
            html += '<button class="btn-close" onclick="window.close()">關閉</button>';
            html += '</div>';

            html += '<script>window.onload = function() { try { JsBarcode("#slip-barcode", "' + slipNo + '", {format:"CODE128",height:15,width:3,displayValue:true,fontSize:16,fontOptions:"bold",margin:5}); } catch(e) {} };<\/script>';
            html += '</body></html>';

            var printWindow = window.open('', '_blank', 'width=1100,height=800');
            printWindow.document.write(html);
            printWindow.document.close();
        };

                window.showBatchInboundDialog = function() {
            var name = document.getElementById('in-name').value;
            var qty = document.getElementById('in-qty').value;
            var loc = document.getElementById('in-loc').value;
            if(!name) { alert("請先填寫品名"); return; }
            if(!qty) { alert("請先填寫數量"); return; }
            if(!loc) { alert("請先選擇儲位"); return; }
            var count = prompt("要批次入庫幾板？", "10");
            if(!count || count < 1) return;
            executeBatchInbound(parseInt(count));
        };

        function getLaneCapacity(zone, row) {
            var inventory = window.currentInventory ? window.currentInventory() : [];
            var lanePrefix = zone + '-' + (row < 10 ? '0' + row : row);
            var items = inventory.filter(function(d) { return d.locationId && d.locationId.startsWith(lanePrefix); });

            var c3 = items.filter(function(d) { var p = parseLocationId(d.locationId); return p && p.level === '3F'; }).length;
            var c2 = items.filter(function(d) { var p = parseLocationId(d.locationId); return p && p.level === '2F'; }).length;
            var c1 = items.filter(function(d) { var p = parseLocationId(d.locationId); return p && p.level === '1F'; }).length;

            var CAP_3F = 8;
            var CAP_2F = 5;
            var CAP_1F = 16;

            return {
                '3F': { used: c3, max: CAP_3F, available: CAP_3F - c3 },
                '2F': { used: c2, max: CAP_2F, available: CAP_2F - c2 },
                '1F': { used: c1, max: CAP_1F, available: CAP_1F - c1 }
            };
        }

        function allocatePallets(baseLoc, count) {
            var parsed = parseLocationId(baseLoc);
            if (!parsed) return null;

            var zone = parsed.zone;
            var row = parsed.row;
            var preferredLevel = parsed.level || '2F';

            var capacity = getLaneCapacity(zone, row);
            var allocations = [];
            var remaining = count;

            var levelOrder = [preferredLevel];
            if(preferredLevel !== '3F') levelOrder.push('3F');
            if(preferredLevel !== '2F') levelOrder.push('2F');
            if(preferredLevel !== '1F') levelOrder.push('1F');

            for(var i = 0; i < levelOrder.length && remaining > 0; i++) {
                var level = levelOrder[i];
                var avail = capacity[level].available;
                if(avail > 0) {
                    var toPlace = Math.min(avail, remaining);
                    for(var j = 0; j < toPlace; j++) {
                        allocations.push(formatLocationId(zone, row, level));
                    }
                    remaining -= toPlace;
                }
            }

            return { allocations: allocations, overflow: remaining };
        }

        async function executeBatchInbound(count) {
            var loc = document.getElementById('in-loc').value;
            var allocation = allocatePallets(loc, count);

            if(!allocation || allocation.allocations.length === 0) {
                alert('錯誤：無法分配儲位');
                return;
            }

            if(allocation.overflow > 0) {
                alert('警告：此巷道剩餘容量不足！\n\n' +
                    '要求入庫：' + count + ' 板\n' +
                    '可放入：' + allocation.allocations.length + ' 板\n' +
                    '超出：' + allocation.overflow + ' 板\n\n' +
                    '請選擇其他巷道存放剩餘棧板。');
                count = allocation.allocations.length;
            }

            var summary = {};
            allocation.allocations.forEach(function(loc) {
                var level = loc.split('-').pop();
                summary[level] = (summary[level] || 0) + 1;
            });
            var summaryText = Object.keys(summary).map(function(k) { return k + ': ' + summary[k] + '板'; }).join(', ');

            if(!confirm('確定要批次入庫 ' + count + ' 板？\n\n分配方式：' + summaryText + '\n\n入庫後將產生「批次入庫單」供現場作業')) return;

            try {
                var batch = window.writeBatch(window.db);
                var now = new Date();
                var name = document.getElementById('in-name').value;
                var spec = document.getElementById('in-spec').value || '';
                var batchNo = document.getElementById('in-batch') ? document.getElementById('in-batch').value : '';
                var qty = parseInt(document.getElementById('in-qty').value);
                var category = document.getElementById('in-category').value;
                var vendor = document.getElementById('in-vendor') ? document.getElementById('in-vendor').value : '';

                var companyRadio = document.querySelector('input[name="in-company"]:checked');
                var company = companyRadio ? companyRadio.value : '崇文';

                var palletList = [];

                for(var i = 0; i < allocation.allocations.length; i++) {
                    var sheetId = window.generateSheetId();
                    var ref = window.doc(window.collection(window.db, "pallets"));
                    batch.set(ref, {
                        palletId: sheetId,
                        sheetId: sheetId,
                        productName: name,
                        spec: spec,
                        batchNo: batchNo,
                        quantity: qty,
                        locationId: allocation.allocations[i],
                        category: category,
                        vendor: vendor,
                        company: company,
                        status: "Available",
                        inboundDate: now,
                        source: "BatchInbound"
                    });

                    palletList.push({
                        seq: i + 1,
                        palletId: sheetId,
                        locationId: allocation.allocations[i],
                        qty: qty
                    });
                }
                await batch.commit();

                printBatchInboundSlip({
                    name: name,
                    spec: spec,
                    batchNo: batchNo,
                    qty: qty,
                    category: category,
                    vendor: vendor,
                    palletList: palletList,
                    date: now
                });

                alert('批次入庫成功！\n\n已產生 ' + count + ' 個棧板\n總數量：' + (qty * count) + ' 件\n\n分配：' + summaryText);
                if(!document.getElementById('lock-mode').checked) {
                    document.getElementById('in-name').value = '';
                    document.getElementById('in-spec').value = '';
                    document.getElementById('in-qty').value = '';
                    document.getElementById('in-loc').value = '';
                    document.getElementById('in-warehouse').value = 'MAIN';
                    onWarehouseChange();
                }
                renderAllMaps();
            } catch(e) {
                alert('批次入庫失敗：' + e.message);
            }
        }

        function printBatchInboundSlip(data) {
            var categoryNames = { 'Raw': '採購進貨', 'FG': '產線成品', 'WIP': '產線半成品', 'Return': '餘料退庫' };
            var now = data.date;
            var slipNo = window.generateDocNo ? window.generateDocNo('BI') : 'BI-' + now.getFullYear() + ('0'+(now.getMonth()+1)).slice(-2) + ('0'+now.getDate()).slice(-2) + '-001';
            var dateStr = now.getFullYear() + '/' + ('0'+(now.getMonth()+1)).slice(-2) + '/' + ('0'+now.getDate()).slice(-2) + ' ' + ('0'+now.getHours()).slice(-2) + ':' + ('0'+now.getMinutes()).slice(-2);
            var totalQty = data.qty * data.palletList.length;

            var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>批次入庫單 ' + slipNo + '</title>';
            html += '<style>* { margin: 0; padding: 0; box-sizing: border-box; } body { font-family: Microsoft JhengHei, Arial, sans-serif; padding: 20px; font-size: 14px; }';
            html += '.slip { width: 100%; max-width: 900px; margin: 0 auto; border: 2px solid #000; }';
            html += '.slip-header { background: #1a1a2e; color: white; padding: 15px 20px; display: flex; justify-content: space-between; align-items: center; }';
            html += '.slip-title { font-size: 24px; font-weight: bold; }';
            html += '.slip-info { padding: 15px 20px; background: #f5f5f5; border-bottom: 1px solid #ddd; display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }';
            html += '.info-item { } .info-label { font-size: 11px; color: #666; } .info-value { font-weight: bold; font-size: 16px; }';
            html += '.slip-table { width: 100%; border-collapse: collapse; }';
            html += '.slip-table th { background: #e5e5e5; padding: 10px; border: 1px solid #ccc; text-align: center; font-size: 13px; }';
            html += '.slip-table td { padding: 10px; border: 1px solid #ccc; text-align: center; }';
            html += '.slip-table .loc { font-size: 18px; font-weight: bold; color: #059669; }';
            html += '.slip-table .pallet-id { font-family: monospace; font-size: 12px; color: #666; }';
            html += '.slip-table .check-box { width: 24px; height: 24px; border: 2px solid #333; display: inline-block; }';
            html += '.slip-footer { padding: 15px 20px; background: #f9f9f9; border-top: 2px solid #000; display: flex; justify-content: space-between; }';
            html += '.sign-box { text-align: center; } .sign-line { border-bottom: 1px solid #000; width: 120px; height: 35px; margin-bottom: 5px; }';
            html += '.sign-label { font-size: 11px; color: #666; }';
            html += '.category-tag { display: inline-block; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: bold; }';
            html += '.category-Raw { background: #dbeafe; color: #1d4ed8; }';
            html += '.category-FG { background: #fae8ff; color: #a21caf; }';
            html += '.category-WIP { background: #fef3c7; color: #b45309; }';
            html += '.category-Return { background: #fee2e2; color: #dc2626; }';
            html += '.note { padding: 10px 20px; background: #fffbeb; border-top: 1px dashed #f59e0b; font-size: 12px; color: #92400e; }';
            html += '@media print { body { padding: 0; } .no-print { display: none !important; } .slip { border: 1px solid #000; } }</style></head><body>';

            html += '<div class="slip">';
            html += '<div class="slip-header"><div><div class="slip-title">📦 批次入庫單</div><div style="font-size:12px;">單號: ' + slipNo + '</div></div>';
            html += '<div style="text-align:right;"><span class="category-tag category-' + data.category + '">' + (categoryNames[data.category] || data.category) + '</span>';
            html += '<div style="font-size:12px;margin-top:5px;">' + dateStr + '</div></div></div>';

            html += '<div class="slip-info">';
            html += '<div class="info-item"><div class="info-label">廠商</div><div class="info-value">' + (data.vendor || '-') + '</div></div>';
            html += '<div class="info-item"><div class="info-label">品名</div><div class="info-value">' + data.name + '</div></div>';
            html += '<div class="info-item"><div class="info-label">規格</div><div class="info-value">' + (data.spec || '-') + '</div></div>';
            html += '<div class="info-item"><div class="info-label">批號</div><div class="info-value">' + (data.batchNo || '-') + '</div></div>';
            html += '<div class="info-item"><div class="info-label">每板數量</div><div class="info-value">' + data.qty + ' 件</div></div>';
            html += '<div class="info-item"><div class="info-label">總板數</div><div class="info-value">' + data.palletList.length + ' 板</div></div>';
            html += '<div class="info-item"><div class="info-label">總數量</div><div class="info-value" style="color:#dc2626;">' + totalQty + ' 件</div></div>';
            html += '</div>';

            html += '<table class="slip-table"><thead><tr>';
            html += '<th style="width:50px;">序號</th>';
            html += '<th style="width:180px;">棧板編號</th>';
            html += '<th style="width:150px;">目標儲位</th>';
            html += '<th style="width:80px;">數量</th>';
            html += '<th style="width:60px;">上架</th>';
            html += '<th style="width:60px;">確認</th>';
            html += '<th>備註</th>';
            html += '</tr></thead><tbody>';

            data.palletList.forEach(function(p) {
                html += '<tr>';
                html += '<td>' + p.seq + '</td>';
                html += '<td class="pallet-id">' + p.palletId + '</td>';
                html += '<td class="loc">' + p.locationId + '</td>';
                html += '<td>' + p.qty + '</td>';
                html += '<td><span class="check-box"></span></td>';
                html += '<td><span class="check-box"></span></td>';
                html += '<td></td>';
                html += '</tr>';
            });

            html += '</tbody></table>';

            html += '<div class="note">⚠️ <b>外庫棧板說明</b>：若棧板無 QR Code，請將「棧板編號」手寫於棧板標示牌上，或貼附本單影本於棧板上以便追溯。</div>';

            html += '<div class="slip-footer">';
            html += '<div class="sign-box"><div class="sign-line"></div><div class="sign-label">製單人員</div></div>';
            html += '<div class="sign-box"><div class="sign-line"></div><div class="sign-label">倉管簽收</div></div>';
            html += '<div class="sign-box"><div class="sign-line"></div><div class="sign-label">堆高機手</div></div>';
            html += '<div class="sign-box"><div class="sign-line"></div><div class="sign-label">主管確認</div></div>';
            html += '</div></div>';

            html += '<div class="no-print" style="text-align:center;margin-top:20px;">';
            html += '<button onclick="window.print()" style="padding:12px 30px;font-size:16px;background:#059669;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:bold;">🖨️ 列印批次入庫單</button>';
            html += '<button onclick="window.close()" style="padding:12px 30px;font-size:16px;background:#6b7280;color:white;border:none;border-radius:8px;cursor:pointer;margin-left:10px;">關閉</button>';
            html += '</div></body></html>';

            var printWindow = window.open('', '_blank', 'width=1000,height=800');
            printWindow.document.write(html);
            printWindow.document.close();
        }

        async function handleUnifiedScan(e) {
            if(e.key === 'Enter') {
                const barcode = e.target.value.trim();
                const mode = document.getElementById('in-category').value;
                if (mode === 'Return') {
                    try {
                        const q = window.query(window.collection(window.db, "pallets"), window.where("palletId", "==", barcode));
                        const snap = await window.getDocs(q);
                        if(!snap.empty) {
                            const data = snap.docs[0].data();
                            document.getElementById('in-parent-id').value = data.palletId;
                            document.getElementById('in-name').value = data.productName + " (餘料)";
                            document.getElementById('in-spec').value = data.spec;
                            document.getElementById('in-batch').value = data.batchNo; document.getElementById('in-batch').readOnly = true;
                            if (window.setInExpFromString) { window.setInExpFromString(data.expiryDate); } else { document.getElementById('in-exp').value = data.expiryDate; }
                            document.getElementById('in-barcode').value = "RET-" + Date.now();
                            document.getElementById('in-qty').focus();
                            alert("📦 讀取原料成功！");
                        } else { alert("❌ 查無此標籤"); }
                    } catch(err) { console.error(err); }
                } else {
                    try {
                        const palletID = document.getElementById('in-pallet-id').value;
                        const snap = await window.getDocs(window.query(window.collection(window.db, "pallets"), window.where("palletId", "==", barcode)));
                        if(!snap.empty) {
                            const data = snap.docs[0].data();
                            document.getElementById('in-name').value = data.productName;
                            document.getElementById('in-spec').value = data.spec||"";
                            document.getElementById('in-batch').value = data.batchNo;
                            document.getElementById('in-qty').value = data.quantity;
                            if (window.setInExpFromString) { window.setInExpFromString(data.expiryDate); } else { document.getElementById('in-exp').value = data.expiryDate; }
                            alert("📦 掃描到舊貨！");
                        } else { document.getElementById('in-name').focus(); if(!document.getElementById('in-batch').value) document.getElementById('in-batch').value = "B"+new Date().toLocalYMD().replace(/-/g,""); }
                        renderMapUI('grid-I-A-map');
                    } catch(err) { console.error(err); }
                }
            }
        }

        function generateInternalBarcode() { document.getElementById('in-barcode').value = "INT-"+Date.now(); document.getElementById('in-name').focus(); }

        function updateLivePreview() {
            var locEl = document.getElementById('prev-loc');
            if(locEl) locEl.innerText = document.getElementById('in-loc').value || '-';
            document.getElementById('prev-name').innerText = document.getElementById('in-name').value || '-';
            document.getElementById('prev-spec').innerText = document.getElementById('in-spec').value || '-';
            document.getElementById('prev-batch').innerText = '批號: ' + (document.getElementById('in-batch').value || '-');
            document.getElementById('prev-exp').innerText = '效期: ' + (document.getElementById('in-exp').value || '-');
            document.getElementById('prev-qty').innerText = document.getElementById('in-qty').value || '0';
        }

        // 入庫類型必選（選過之後下一筆沿用）；沒選時提示並閃一下
        window.requireInboundType = function() {
            var cat = document.getElementById('in-category');
            if (cat && cat.value) return true;
            alert('請先選「入庫類型」：採購／成品／半成品／原料\n\n（在左邊公司別下面；採購進貨會送財務對帳）');
            var hint = document.getElementById('in-type-hint');
            if (hint) { hint.innerText = '← 請選一個'; hint.className = 'ml-auto text-[10px] text-red-400 font-bold animate-pulse'; }
            return false;
        };

        window.selectInboundType = function(type) {
            var typeSelect = document.getElementById('in-type-select');
            if (typeSelect) typeSelect.value = type;
            // 入庫單與直接入庫都讀 in-category（之前按鈕沒寫入，所有入庫都被當成「採購」）
            var cat = document.getElementById('in-category');
            if (cat) cat.value = type;
            var hint = document.getElementById('in-type-hint');
            if (hint) {
                hint.innerText = type === 'Raw' ? '採購會送財務對帳（不影響入帳）' : '';
                hint.className = 'ml-auto text-[10px] text-slate-500';
            }

            document.querySelectorAll('.inbound-type-btn').forEach(function(btn) {
                btn.classList.remove('active', 'border-blue-500', 'bg-blue-900/50', 'text-white');
                btn.classList.remove('border-purple-500', 'bg-purple-900/50', 'text-purple-400');
                btn.classList.remove('border-yellow-500', 'bg-yellow-900/50', 'text-yellow-400');
                btn.classList.remove('border-orange-500', 'bg-orange-900/50', 'text-orange-400');
                btn.classList.remove('border-emerald-500', 'bg-emerald-900/50');
                btn.classList.add('border-slate-600', 'bg-slate-800', 'text-slate-400');
            });

            var activeBtn = document.getElementById('btn-type-' + type);
            if (activeBtn) {
                activeBtn.classList.remove('border-slate-600', 'bg-slate-800', 'text-slate-400');
                var colors = {
                    'Raw': ['border-emerald-500', 'bg-emerald-900/50', 'text-white'],
                    'FG': ['border-purple-500', 'bg-purple-900/50', 'text-white'],
                    'WIP': ['border-yellow-500', 'bg-yellow-900/50', 'text-white'],
                    'RM': ['border-orange-500', 'bg-orange-900/50', 'text-white'],
                    'Return': ['border-orange-500', 'bg-orange-900/50', 'text-white']
                };
                activeBtn.classList.add(...(colors[type] || colors['Raw']));
                activeBtn.classList.add('active');
            }

            if (typeof onInboundTypeChange === 'function') onInboundTypeChange();
        };

        window.updateInboundProgress = function() {
            var nameEl = document.getElementById('in-name');
            var expEl = document.getElementById('in-exp');
            var locEl = document.getElementById('in-loc');
            var btn = document.getElementById('btn-inbound-main');

            if (!nameEl || !expEl || !btn) return;

            var name = nameEl.value.trim();
            var exp = expEl.value;

            var loc = locEl ? locEl.value.trim() : '';
            var locSection = document.getElementById('location-section');
            var isExternalMode = locSection && locSection.style.display === 'none';
            var locOk = isExternalMode || !!loc; // 外倉模式不需要儲位，或本倉有填儲位

            var variableFields = document.getElementById('variable-weight-fields');
            var isVariable = variableFields && !variableFields.classList.contains('hidden');

            var qtyOk = false;
            if (isVariable) {
                var qtyVarEl = document.getElementById('in-qty-var');
                var weightEl = document.getElementById('in-weight');
                var qtyVal = qtyVarEl ? parseInt(qtyVarEl.value) : 0;
                var weightVal = weightEl ? parseFloat(weightEl.value) : 0;
                qtyOk = qtyVal > 0 && weightVal > 0;
            } else {
                var qtyEl = document.getElementById('in-qty');
                var qtyVal = qtyEl ? parseInt(qtyEl.value) : 0;
                qtyOk = qtyVal > 0;
            }

            if (typeof updateCheckItem === 'function') {
                updateCheckItem('check-name', !!name);
                updateCheckItem('check-qty', qtyOk);
                updateCheckItem('check-exp', !!exp);
                updateCheckItem('check-loc', locOk);
            }

            var allOk = !!name && qtyOk && !!exp && locOk;

            var s1 = document.getElementById('inbound-step-1');
            var s2 = document.getElementById('inbound-step-2');
            var s3 = document.getElementById('inbound-step-3');

            var step1Done = !!name && qtyOk && !!exp;

            if (s1) s1.className = step1Done ? 'flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white transition-all' : 'flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white transition-all';
            if (s2) s2.className = locOk ? 'flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white transition-all' : 'flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 text-slate-400 transition-all';
            if (s3) s3.className = allOk ? 'flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 text-white transition-all' : 'flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 text-slate-400 transition-all';

            btn.disabled = !allOk;
        };

        function updateCheckItem(id, isComplete) {
            var el = document.getElementById(id);
            if (!el) return;
            var icon = el.querySelector('i');
            var text = el.querySelector('span');
            if (isComplete) {
                icon.className = 'fa-solid fa-check-circle text-emerald-400 text-xs';
                text.className = 'text-emerald-400';
            } else {
                icon.className = 'fa-solid fa-circle text-slate-600 text-xs';
                text.className = 'text-slate-400';
            }
        }

        window.toggleProductType = function(type) {
            var fixedFields = document.getElementById('fixed-weight-fields');
            var variableFields = document.getElementById('variable-weight-fields');
            var avgWeightHint = document.getElementById('avg-weight-hint');

            if (type === 'fixed') {
                fixedFields.classList.remove('hidden');
                variableFields.classList.add('hidden');
                avgWeightHint.classList.add('hidden');
            } else {
                fixedFields.classList.add('hidden');
                variableFields.classList.remove('hidden');
                avgWeightHint.classList.remove('hidden');
            }

            updateInboundProgress();
        };

        window.calcAvgWeight = function() {
            var qty = parseInt(document.getElementById('in-qty-var').value) || 0;
            var weight = parseFloat(document.getElementById('in-weight').value) || 0;
            var avgSpan = document.getElementById('avg-weight-value');

            if (qty > 0 && weight > 0) {
                var avg = Math.round(weight / qty * 100) / 100;
                avgSpan.innerText = avg;
            } else {
                avgSpan.innerText = '-';
            }
        };

        window.getProductType = function() {
            var radio = document.querySelector('input[name="in-product-type"]:checked');
            return radio ? radio.value : 'fixed';
        };

        async function confirmUnifiedInbound() {
             var loc = document.getElementById('in-loc').value;
             var sheetId = document.getElementById('in-sheet-id').value;
             var palletId = document.getElementById('in-pallet-id') ? document.getElementById('in-pallet-id').value : '';
             var finalID = sheetId || palletId;

             if(!loc) { alert("❌ 請先選儲位"); return; }
             if(!finalID) { alert("❌ 請輸入插單編號"); return; }
             if(!document.getElementById('in-name').value) { alert("❌ 請填寫品名"); return; }

             var productType = getProductType();
             var qty, totalWeight, unitWeight;

             if (productType === 'fixed') {
                 qty = parseInt(document.getElementById('in-qty').value) || 0;
                 unitWeight = parseFloat(document.getElementById('in-unit-weight').value) || 0;
                 totalWeight = qty * unitWeight; // 計算總重量
                 if (!qty) { alert("❌ 請填寫數量"); return; }
             } else {
                 qty = parseInt(document.getElementById('in-qty-var').value) || 0;
                 totalWeight = parseFloat(document.getElementById('in-weight').value) || 0;
                 unitWeight = qty > 0 ? Math.round(totalWeight / qty * 100) / 100 : 0;
                 if (!qty) { alert("❌ 請填寫數量"); return; }
                 if (!totalWeight) { alert("❌ 不定重品請填寫總重量"); return; }
             }

             var productName = document.getElementById('in-name').value;
             var spec = document.getElementById('in-spec').value || '';
             var batchNo = document.getElementById('in-batch') ? document.getElementById('in-batch').value : '';
             var expDate = document.getElementById('in-exp') ? document.getElementById('in-exp').value : '';
             var vendor = document.getElementById('in-vendor') ? document.getElementById('in-vendor').value : '';
             
             // 讀取板容量（從品項主檔）
             var palletCapacity = 40;
             var master = (window.productMasterData || []).find(function(p) { return p.name === productName; });
             if (master && master.palletCapacity) {
                 palletCapacity = master.palletCapacity;
             }

             var companyRadio = document.querySelector('input[name="in-company"]:checked');
             var company = companyRadio ? companyRadio.value : '崇文';

             try {
                await window.addDoc(window.collection(window.db, "pallets"), {
                    palletId: finalID,
                    sheetId: sheetId,
                    contentId: sheetId,
                    productName: productName,
                    spec: spec,
                    batchNo: batchNo,
                    expiryDate: expDate,
                    quantity: qty,
                    palletCapacity: palletCapacity,
                    totalWeight: totalWeight,
                    unitWeight: unitWeight,
                    productType: productType,
                    locationId: loc,
                    category: document.getElementById('in-category').value,
                    inboundDate: new Date(),
                    status: "Available",
                    vendor: vendor,
                    company: company,
                    workOrder: document.getElementById('in-wo') ? document.getElementById('in-wo').value : '',
                    source: 'Inbound'
                });

                var categoryNames = { 'Raw': '採購進貨', 'FG': '產線成品', 'WIP': '產線半成品', 'Return': '餘料退庫' };
                var categoryName = categoryNames[document.getElementById('in-category').value] || '入庫';
                var weightNote = productType === 'fixed'
                    ? (unitWeight > 0 ? ' (箱容' + unitWeight + 'kg)' : '')
                    : ' (總重' + totalWeight + 'kg)';
                await window.logInventoryChange({
                    type: 'inbound',
                    company: company,
                    productName: productName,
                    spec: spec,
                    quantity: qty,
                    weight: totalWeight,
                    quantityChange: qty,
                    weightChange: totalWeight,
                    locationId: loc,
                    batchNo: batchNo,
                    palletId: finalID,
                    expDate: expDate,
                    note: categoryName + (vendor ? ' - ' + vendor : '') + weightNote
                });

                var successMsg = "✅ 入庫成功！\n數量：" + qty + " 件";
                if (productType === 'fixed' && unitWeight > 0) {
                    successMsg += "\n箱容：" + unitWeight + " kg/件";
                } else if (productType === 'variable') {
                    successMsg += "\n總重：" + totalWeight + " kg（均重 " + unitWeight + " kg/件）";
                }
                alert(successMsg);

                setTimeout(function() {
                    var shouldPreview = document.getElementById('preview-pallet-tag') && document.getElementById('preview-pallet-tag').checked;
                    if(shouldPreview) {
                        var data = {
                            vendor: document.getElementById('in-vendor') ? document.getElementById('in-vendor').value : '',
                            productName: document.getElementById('in-name').value,
                            spec: document.getElementById('in-spec').value || '',
                            batchNo: document.getElementById('in-batch') ? document.getElementById('in-batch').value : '',
                            qty: document.getElementById('in-qty').value,
                            weight: document.getElementById('in-weight').value,
                            loc: loc,
                            barcode: finalID
                        };
                        printAutoLabel(data);
                    }
                }, 500);

                if(!document.getElementById('lock-mode').checked) {
                    document.getElementById('in-sheet-id').value = '';
                    document.getElementById('in-loc').value = '';
                    document.getElementById('in-name').value = '';
                    document.getElementById('in-spec').value = '';
                    document.getElementById('in-qty').value = '';
                    document.getElementById('in-unit-weight').value = '';
                    document.getElementById('in-qty-var').value = '';
                    document.getElementById('in-weight').value = '';
                    document.getElementById('avg-weight-value').innerText = '-';
                }
             } catch(e) {
                 console.error('入庫錯誤:', e);
                 alert("錯誤: " + e.message);
             }
        }

        function printAutoLabel(d) {
            var exp = document.getElementById('in-exp') ? document.getElementById('in-exp').value : '';
            var vendor = document.getElementById('in-vendor') ? document.getElementById('in-vendor').value : '';

            var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>棧板插單 - ' + d.productName + '</title>';
            html += '<style>';
            html += '@page { size: A4 landscape; margin: 0; }';
            html += '* { margin: 0; padding: 0; box-sizing: border-box; }';
            html += 'body { font-family: Microsoft JhengHei, Arial, sans-serif; background: #fff; }';
            html += '.label-page { width: 297mm; height: 210mm; padding: 5mm; box-sizing: border-box; }';
            html += '.label-content { height: 100%; border: 3px solid #000; display: flex; flex-direction: column; }';
            html += '.row-1 { flex: 2; display: flex; align-items: center; justify-content: center; border-bottom: 3px solid #000; }';
            html += '.product-name { font-size: 144px; font-weight: 900; text-align: center; line-height: 1; }';
            html += '.row-2 { flex: 1; display: flex; align-items: center; justify-content: center; border-bottom: 3px solid #000; }';
            html += '.product-spec { font-size: 100px; font-weight: 700; color: #333; text-align: center; }';
            html += '.row-3 { display: flex; border-bottom: 2px solid #000; }';
            html += '.info-cell { text-align: center; padding: 4mm 2mm; border-right: 1px solid #ccc; }';
            html += '.info-cell:last-child { border-right: none; }';
            html += '.info-cell.batch { flex: 1.2; }';
            html += '.info-cell.expiry { flex: 1.5; white-space: nowrap; }';
            html += '.info-cell.qty { flex: 1; }';
            html += '.info-cell.vendor { flex: 1.2; }';
            html += '.info-label { font-size: 14px; color: #666; margin-bottom: 2mm; }';
            html += '.info-value { font-size: 48px; font-weight: 900; }';
            html += '.info-value.qty-val { font-size: 100px; color: #dc2626; }';
            html += '.info-value.vendor-val { font-size: 100px; }';
            html += '.row-4 { display: flex; align-items: center; padding: 3mm 5mm; }';
            html += '.location-box { background: #000; color: #fff; font-size: 56px; font-weight: 900; padding: 3mm 8mm; margin-right: 5mm; }';
            html += '.barcode-box { flex: 1; text-align: center; }';
            html += '.no-print { text-align: center; padding: 20px; }';
            html += '.no-print button { padding: 15px 40px; font-size: 18px; border: none; cursor: pointer; font-weight: bold; margin: 0 10px; border-radius: 8px; }';
            html += '.btn-print { background: #059669; color: white; }';
            html += '.btn-close { background: #666; color: white; }';
            html += '@media print { .no-print { display: none !important; } }';
            html += '</style>';
            html += '<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>';
            html += '</head><body>';

            html += '<div class="label-page"><div class="label-content">';

            html += '<div class="row-1" style="display:flex;align-items:center;padding:0 8mm;">';
            html += '<div id="qrcode" style="width:200px;height:200px;flex-shrink:0;margin-right:15mm;"></div>';
            html += '<div class="product-name" style="flex:1;text-align:center;">' + d.productName + '</div>';
            html += '</div>';

            html += '<div class="row-2"><div class="product-spec">' + (d.spec || '-') + '</div></div>';

            html += '<div class="row-3">';
            html += '<div class="info-cell batch"><div class="info-label">批號</div><div class="info-value">' + (d.batchNo || '-') + '</div></div>';
            html += '<div class="info-cell expiry"><div class="info-label">效期</div><div class="info-value">' + (exp || '-') + '</div></div>';
            html += '<div class="info-cell qty"><div class="info-label">數量</div><div class="info-value qty-val">' + d.qty + '</div></div>';
            if (d.weight && parseFloat(d.weight) > 0) {
                html += '<div class="info-cell vendor"><div class="info-label">重量</div><div class="info-value" style="color:#d97706;">' + d.weight + ' kg</div></div>';
            } else {
                html += '<div class="info-cell vendor"><div class="info-label">廠商</div><div class="info-value vendor-val">' + (vendor || '-') + '</div></div>';
            }
            html += '</div>';

            html += '<div class="row-4" style="display:flex;align-items:center;padding:5mm 8mm;">';
            html += '<div class="location-box" style="font-size:64px;padding:5mm 12mm;min-width:200px;text-align:center;">' + (d.loc || '待分配') + '</div>';
            html += '<div style="flex:1;display:flex;align-items:center;justify-content:center;">';
            html += '<svg id="slip-barcode"></svg>';
            html += '</div>';
            html += '</div>';

            html += '</div></div>';

            html += '<div class="no-print">';
            html += '<button class="btn-print" onclick="window.print()">🖨️ 列印全部 1 張插單</button>';
            html += '<button class="btn-close" onclick="window.close()">關閉</button>';
            html += '</div>';

            html += '<script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"><\/script>';
            html += '<script>window.onload = function() {';
            html += 'try { var qr = qrcode(0, "L"); qr.addData("' + d.barcode + '"); qr.make(); document.getElementById("qrcode").innerHTML = qr.createSvgTag(8, 0); } catch(e) {}';
            html += 'try { JsBarcode("#slip-barcode", "' + d.barcode + '", {format:"CODE128",height:60,width:1.5,displayValue:true,fontSize:14,margin:5,textMargin:2}); } catch(e) {}';
            html += '};<\/script>';
            html += '</body></html>';

            var printWindow = window.open('', '_blank', 'width=1100,height=800');
            printWindow.document.write(html);
            printWindow.document.close();
        }

        function handleStockImport(e) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = async function(evt) {
                const wb = XLSX.read(evt.target.result, {type:'array'});
                const json = window.sheetToJsonSmart ? window.sheetToJsonSmart(wb.Sheets[wb.SheetNames[0]]) : XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
                if(confirm(`匯入 ${json.length} 筆？`)) {
                    const batch = window.writeBatch(window.db);
                    var logPromises = [];
                    json.forEach((r,i) => {
                        const palletId = r['條碼']||`OLD-${i}`;
                        const qty = parseInt(r['數量']) || 0;

                        var productType = 'fixed';
                        var unitWeight = parseFloat(r['箱容kg']) || 0;
                        var totalWeight = parseFloat(r['總重量kg']) || 0;

                        if (r['類型']) {
                            productType = (r['類型'] === '不定重' || r['類型'] === 'variable') ? 'variable' : 'fixed';
                        } else if (totalWeight > 0 && unitWeight === 0) {
                            productType = 'variable';
                        }

                        if (productType === 'fixed' && unitWeight > 0) {
                            totalWeight = qty * unitWeight;
                        } else if (productType === 'variable' && qty > 0 && totalWeight > 0) {
                            unitWeight = Math.round(totalWeight / qty * 100) / 100;
                        }

                        const ref = window.doc(window.collection(window.db, "pallets"));
                        batch.set(ref, {
                            palletId: palletId,
                            productName: r['品名'],
                            spec: r['規格']||'',
                            batchNo: r['批號']||'',
                            quantity: qty,
                            totalWeight: totalWeight,
                            unitWeight: unitWeight,
                            productType: productType,
                            locationId: r['儲位'] || "INIT-STAGE",
                            status: "Available",
                            inboundDate: new Date(),
                            source: "Opening"
                        });
                        logPromises.push(window.logInventoryChange({
                            type: 'inbound',
                            productName: r['品名'],
                            spec: r['規格'] || '',
                            quantity: qty,
                            weight: totalWeight,
                            quantityChange: qty,
                            weightChange: totalWeight,
                            locationId: r['儲位'] || 'INIT-STAGE',
                            batchNo: r['批號'] || '',
                            palletId: palletId,
                            note: '期初匯入' + (totalWeight > 0 ? ' (' + totalWeight + 'kg)' : '')
                        }));
                    });
                    await batch.commit();
                    await Promise.all(logPromises);
                    alert("開帳成功");
                }
            };
            reader.readAsArrayBuffer(file);
            e.target.value = '';
        }

        window.exportInventoryToExcel = function() {
            var pallets = window.currentPallets ? window.currentPallets() : [];
            // 跟畫面一樣：選了崇文／八方就只匯出該公司
            if (window.inventoryCompanyFilter && window.inventoryCompanyFilter !== 'all') {
                pallets = pallets.filter(function(p) { return p.company === window.inventoryCompanyFilter; });
            }

            if (pallets.length === 0) {
                alert('沒有庫存資料可匯出');
                return;
            }

            var data = [
                ['公司', '條碼', '品名', '規格', '批號', '效期', '數量', '類型', '箱容kg', '總重量kg', '儲位', '廠商', '入庫日期']
            ];

            pallets.forEach(function(p) {
                var expDate = '';
                if (p.expiryDate) {
                    if (p.expiryDate.toDate) {
                        expDate = p.expiryDate.toDate().toLocalYMD();
                    } else if (typeof p.expiryDate === 'string') {
                        expDate = p.expiryDate;
                    }
                }

                var inboundDate = '';
                if (p.inboundDate) {
                    if (p.inboundDate.toDate) {
                        inboundDate = p.inboundDate.toDate().toLocalYMD();
                    } else if (typeof p.inboundDate === 'string') {
                        inboundDate = p.inboundDate.split('T')[0];
                    }
                }

                var productType = p.productType === 'variable' ? '不定重' : '定重';

                data.push([
                    p.company || '',
                    p.palletId || '',
                    p.productName || '',
                    p.spec || '',
                    p.batchNo || '',
                    expDate,
                    p.quantity || 0,
                    productType,
                    p.unitWeight || '',
                    p.totalWeight || '',
                    p.locationId || '',
                    p.vendor || '',
                    inboundDate
                ]);
            });

            // 表頭列 → 物件，交給共用匯出（加抬頭、製表時間、合計）
            var head = data[0];
            var rows = data.slice(1).map(function(r) { var o = {}; head.forEach(function(k, i) { o[k] = r[i]; }); return o; });
            var co = window.inventoryCompanyFilter && window.inventoryCompanyFilter !== 'all' ? window.inventoryCompanyFilter : '全部';
            window.exportTableReportXlsx({
                title: '庫存清單', meta: [['資料時間', '截至 ' + new Date().toLocalYMD()], ['公司', co], ['板數', rows.length + ' 板']],
                columns: head.map(function(k) { return { key: k, label: k, num: k === '數量' || k === '總重量kg' }; }), rows: rows,
                totals: { '數量': rows.reduce(function(t, r) { return t + (Number(r['數量']) || 0); }, 0), '總重量kg': Math.round(rows.reduce(function(t, r) { return t + (Number(r['總重量kg']) || 0); }, 0) * 10) / 10 },
                fileName: '庫存清單_' + new Date().toLocalYMD() + '.xlsx'
            });

            alert('✅ 匯出成功！\n\n共 ' + (data.length - 1) + ' 筆庫存');
        };

