// ============================================================
// js/12-users-labels.js — 權限、標籤列印、使用者管理、外倉操作
// 由原 app.js 第 16931–18368 行拆出；各檔依 index.html 的順序載入，共用全域（window）
// ============================================================
        // ========== 權限管理系統（Firebase 版）==========

        window.showToast = function(message, duration) {
            duration = duration || 3000;
            var toast = document.createElement('div');
            toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1e293b;border:1px solid #334155;color:#e2e8f0;padding:12px 24px;border-radius:8px;z-index:10000;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.3);animation:fadeIn 0.3s ease;';
            toast.innerHTML = message;
            document.body.appendChild(toast);
            setTimeout(function() {
                toast.style.animation = 'fadeOut 0.3s ease';
                setTimeout(function() { toast.remove(); }, 300);
            }, duration);
        };

        // ========== 標籤列印功能 ==========
        var selectedLocZone = '';
        var reprintPalletData = null;
        var reprintHistory = [];

        var VIRTUAL_LOC_LABELS = ['TEMP-IN', 'TEMP-OUT', 'V-QC', 'V-SALES', 'V-TEMP'];
        var VIRTUAL_LOC_NAMES = { 'TEMP-IN': '進貨暫存區', 'TEMP-OUT': '出貨暫存區', 'V-QC': '品管留置', 'V-SALES': '業務保留', 'V-TEMP': '臨時暫存' };

        window.selectLocZone = function(zone) {
            selectedLocZone = zone;
            document.querySelectorAll('.loc-zone-btn').forEach(function(btn) {
                btn.classList.remove('ring-2', 'ring-white');
            });
            document.querySelector('.loc-zone-btn[data-zone="' + zone + '"]').classList.add('ring-2', 'ring-white');
            // 排號範圍帶入這一區實際的排數（I、J 區 8 排，K 區 20 排），不會印出不存在的儲位
            var lanes = (window.RACK_CONFIG && window.RACK_CONFIG.ZONE_LANES[zone]) || 22;
            var s = document.getElementById('loc-row-start'), e = document.getElementById('loc-row-end');
            if (s) { s.max = lanes; s.value = 1; }
            if (e) { e.max = lanes; e.value = lanes; }
            updateLocPrintPreview();
        };

        // 要印的儲位清單（依排、層；排數不超過這一區實際的排數）
        function collectLocationLabels() {
            var labels = [];
            var floors = [];
            if (document.getElementById('loc-floor-1f').checked) floors.push('1F');
            if (document.getElementById('loc-floor-2f').checked) floors.push('2F');
            if (document.getElementById('loc-floor-3f').checked) floors.push('3F');
            if (selectedLocZone) {
                var lanes = (window.RACK_CONFIG && window.RACK_CONFIG.ZONE_LANES[selectedLocZone]) || 22;
                var startRow = Math.max(1, parseInt(document.getElementById('loc-row-start').value) || 1);
                var endRow = Math.min(lanes, parseInt(document.getElementById('loc-row-end').value) || lanes);
                for (var row = startRow; row <= endRow; row++) {
                    floors.forEach(function(floor) {
                        var loc = selectedLocZone + '-' + String(row).padStart(2, '0') + '-' + floor;
                        labels.push({ locationId: loc, shortCode: window.locationShortCode(loc), name: '' });
                    });
                }
            }
            var v = document.getElementById('loc-include-virtual');
            if (v && v.checked) VIRTUAL_LOC_LABELS.forEach(function(loc) { labels.push({ locationId: loc, shortCode: loc.replace('-', ''), name: VIRTUAL_LOC_NAMES[loc] }); });
            return { labels: labels, floors: floors };
        }

        function updateLocPrintPreview() {
            var countEl = document.getElementById('loc-print-count');
            var previewEl = document.getElementById('loc-print-preview');
            var c = collectLocationLabels();

            if (c.labels.length === 0) {
                if (previewEl) previewEl.innerHTML = '<span class="text-slate-500">請選擇倉庫區域（或勾選加印暫存區）</span>';
                if (countEl) countEl.textContent = '0 張';
                return;
            }
            if (countEl) countEl.textContent = c.labels.length + ' 張';
            var first = c.labels[0], last = c.labels[c.labels.length - 1];
            var preview = '<div class="flex items-center gap-3">';
            if (selectedLocZone) preview += '<span class="text-lg font-bold text-blue-400">' + selectedLocZone + '</span>';
            preview += '<span class="text-slate-400">' + first.locationId + ' ～ ' + last.locationId + '</span>';
            preview += '</div>';
            preview += '<div class="text-xs text-slate-500 mt-1">範例：' + first.locationId + '　簡碼 <b class="text-emerald-400">' + first.shortCode + '</b></div>';
            if (previewEl) previewEl.innerHTML = preview;
        }

        document.addEventListener('DOMContentLoaded', function() {
            ['loc-row-start', 'loc-row-end', 'loc-floor-1f', 'loc-floor-2f', 'loc-floor-3f', 'loc-include-virtual'].forEach(function(id) {
                var el = document.getElementById(id);
                if (el) el.addEventListener('change', updateLocPrintPreview);
            });
        });

        window.printLocationLabels = function() {
            var c = collectLocationLabels();
            if (!selectedLocZone && c.labels.length === 0) { alert('請先選擇倉庫區域（或勾選加印暫存區）'); return; }
            if (selectedLocZone && c.floors.length === 0 && c.labels.length === 0) { alert('請至少選擇一個樓層'); return; }
            if (c.labels.length === 0) { alert('沒有要印的儲位'); return; }
            var paperEl = document.querySelector('input[name="loc-paper"]:checked');
            var a4 = paperEl && paperEl.value === 'a4';
            var labels = c.labels;
            var esc = function(v) { return String(v).replace(/[&<>"']/g, function(ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); };

            var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>儲位標籤</title>';
            html += '<style>';
            html += '* { margin: 0; padding: 0; box-sizing: border-box; }';
            html += 'body { font-family: Microsoft JhengHei, Arial, sans-serif; }';
            if (a4) {
                // A4 直式：2 欄 × 4 列，每格 105×74mm
                html += '@page { size: A4 portrait; margin: 0; }';
                html += '.sheet { width: 210mm; height: 297mm; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: repeat(4, 1fr); page-break-after: always; }';
                html += '.sheet:last-of-type { page-break-after: auto; }';
                html += '.label { border: 1px dashed #bbb; display: flex; align-items: center; justify-content: space-between; padding: 5mm 7mm; }';
                html += '.txt { display: flex; flex-direction: column; }';
                html += '.loc-text { font-size: 30px; font-weight: 900; letter-spacing: 1px; }';
                html += '.short { font-size: 20px; margin-top: 2mm; } .short b { font-size: 26px; }';
                html += '.name { font-size: 16px; margin-top: 1mm; }';
                html += '.qr-box svg { width: 40mm; height: 40mm; }';
            } else {
                html += '@page { size: 60mm 40mm; margin: 0; }';
                html += '.label { width: 60mm; height: 40mm; padding: 2mm 3mm; page-break-after: always; display: flex; align-items: center; justify-content: space-between; }';
                html += '.label:last-of-type { page-break-after: auto; }';
                html += '.txt { display: flex; flex-direction: column; }';
                html += '.loc-text { font-size: 17px; font-weight: 900; }';
                html += '.short { font-size: 12px; margin-top: 1mm; } .short b { font-size: 16px; }';
                html += '.name { font-size: 11px; }';
                html += '.qr-box svg { width: 26mm; height: 26mm; }';
            }
            html += '.no-print { text-align: center; padding: 20px; }';
            html += '.no-print button { padding: 15px 40px; font-size: 18px; border: none; cursor: pointer; font-weight: bold; margin: 0 10px; border-radius: 8px; }';
            html += '.btn-print { background: #3b82f6; color: white; }';
            html += '.btn-close { background: #666; color: white; }';
            html += '@media print { .no-print { display: none !important; } .label { border: none !important; } }';
            html += '</style>';
            html += '</head><body>';

            html += '<div class="no-print">';
            html += '<button class="btn-print" onclick="window.print()">🖨️ 列印全部 ' + labels.length + ' 張</button>';
            html += '<button class="btn-close" onclick="window.close()">關閉</button>';
            html += '</div>';

            var cell = function(label, idx) {
                return '<div class="label"><div class="txt">' +
                    '<div class="loc-text">' + esc(label.locationId) + '</div>' +
                    (label.name ? '<div class="name">' + esc(label.name) + '</div>' : '') +
                    '<div class="short">簡碼 <b>' + esc(label.shortCode) + '</b></div>' +
                    '</div><div class="qr-box" id="qr-' + idx + '"></div></div>';
            };
            if (a4) {
                for (var i = 0; i < labels.length; i += 8) {
                    html += '<div class="sheet">' + labels.slice(i, i + 8).map(function(l, k) { return cell(l, i + k); }).join('') + '</div>';
                }
            } else {
                html += labels.map(cell).join('');
            }

            // QR 碼內容＝標準儲位（手機掃了直接是 I-A-01-1F）
            // QR 函式庫放在最後載入：網路慢時標籤文字先出來，不會整頁空白
            html += '<script>function drawQr() { var locs = ' + JSON.stringify(labels.map(function(l) { return l.locationId; })) + ';';
            html += 'locs.forEach(function(loc, i) { try { var qr = qrcode(0, "M"); qr.addData(loc); qr.make(); document.getElementById("qr-" + i).innerHTML = qr.createSvgTag(4, 0); } catch (e) {} }); }<\/script>';
            html += '<script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js" onload="drawQr()"><\/script>';
            html += '</body></html>';

            var printWindow = window.open('', '_blank', 'width=700,height=900');
            printWindow.document.write(html);
            printWindow.document.close();
        };

        window.searchPalletForReprint = async function() {
            var palletId = document.getElementById('reprint-pallet-id').value.trim().toUpperCase();
            if (!palletId) {
                showToast('請輸入棧板編號');
                return;
            }

            var infoDiv = document.getElementById('reprint-pallet-info');
            infoDiv.innerHTML = '<div class="text-center py-4"><i class="fa-solid fa-spinner fa-spin text-2xl text-blue-400"></i><div class="text-slate-400 mt-2">搜尋中...</div></div>';

            // 大部分棧板的文件 ID 是自動產生的，要用板號（palletId）找
            var key = String(palletId).trim().toUpperCase();
            var local = window.currentPallets ? window.currentPallets() : (window.pallets || []);
            var pallet = local.find(function(p) {
                return String(p.palletId || '').toUpperCase() === key || p.id === palletId;
            });

            if (!pallet && window.db) {
                try {
                    var docSnap = await window.db.collection('pallets').doc(palletId).get();
                    if (docSnap.exists) {
                        pallet = { id: docSnap.id, ...docSnap.data() };
                    } else {
                        var q = await window.db.collection('pallets').where('palletId', '==', palletId).limit(1).get();
                        if (q.empty && key !== palletId) q = await window.db.collection('pallets').where('palletId', '==', key).limit(1).get();
                        if (!q.empty) pallet = { id: q.docs[0].id, ...q.docs[0].data() };
                    }
                } catch(e) {
                    console.log('Firebase 搜尋失敗:', e);
                }
            }

            if (!pallet) {
                infoDiv.innerHTML = '<div class="text-center py-8"><i class="fa-solid fa-times-circle text-4xl text-red-400 mb-2"></i><div class="text-red-400">找不到此棧板</div><div class="text-slate-500 text-sm mt-1">' + palletId + '</div></div>';
                document.getElementById('btn-reprint-pallet').disabled = true;
                reprintPalletData = null;
                return;
            }

            reprintPalletData = pallet;

            var html = '<div class="space-y-3">';
            html += '<div class="flex justify-between"><span class="text-slate-400">棧板編號</span><span class="text-white font-mono font-bold">' + (pallet.palletId || pallet.id) + '</span></div>';
            html += '<div class="flex justify-between"><span class="text-slate-400">品名</span><span class="text-white font-bold text-lg">' + pallet.productName + '</span></div>';
            html += '<div class="flex justify-between"><span class="text-slate-400">規格</span><span class="text-white">' + (pallet.spec || '-') + '</span></div>';
            html += '<div class="flex justify-between"><span class="text-slate-400">批號</span><span class="text-white">' + (pallet.batchNo || '-') + '</span></div>';
            html += '<div class="flex justify-between"><span class="text-slate-400">數量</span><span class="text-yellow-400 font-bold text-xl">' + pallet.quantity + ' 件</span></div>';
            html += '<div class="flex justify-between"><span class="text-slate-400">儲位</span><span class="text-blue-400 font-bold">' + (pallet.locationId || '待分配') + '</span></div>';
            if (pallet.expDate) {
                html += '<div class="flex justify-between"><span class="text-slate-400">效期</span><span class="text-white">' + pallet.expDate + '</span></div>';
            }
            html += '</div>';

            infoDiv.innerHTML = html;
            document.getElementById('btn-reprint-pallet').disabled = false;
        };

        window.reprintPalletLabel = function() {
            if (!reprintPalletData) {
                showToast('請先搜尋棧板');
                return;
            }

            var pallet = reprintPalletData;

            var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>棧板插單 - ' + pallet.productName + '</title>';
            html += '<style>';
            html += '@page { size: A4 landscape; margin: 0; }';
            html += '* { margin: 0; padding: 0; box-sizing: border-box; }';
            html += 'body { font-family: Microsoft JhengHei, Arial, sans-serif; background: #fff; }';
            html += '.label-page { width: 297mm; height: 210mm; padding: 5mm; box-sizing: border-box; }';
            html += '.label-content { height: 100%; border: 3px solid #000; display: flex; flex-direction: column; }';
            html += '.row-1 { flex: 2; display: flex; align-items: center; border-bottom: 3px solid #000; padding: 0 8mm; }';
            html += '.product-name { font-size: 144px; font-weight: 900; text-align: center; line-height: 1; flex: 1; }';
            html += '.row-2 { flex: 1; display: flex; align-items: center; justify-content: center; border-bottom: 3px solid #000; }';
            html += '.product-spec { font-size: 100px; font-weight: 700; color: #333; text-align: center; }';
            html += '.row-3 { display: flex; border-bottom: 2px solid #000; }';
            html += '.info-cell { text-align: center; padding: 4mm 2mm; border-right: 1px solid #ccc; }';
            html += '.info-cell:last-child { border-right: none; }';
            html += '.info-cell.batch { flex: 1.2; }';
            html += '.info-cell.expiry { flex: 1.5; }';
            html += '.info-cell.qty { flex: 1; }';
            html += '.info-cell.vendor { flex: 1.2; }';
            html += '.info-label { font-size: 14px; color: #666; margin-bottom: 2mm; }';
            html += '.info-value { font-size: 48px; font-weight: 900; }';
            html += '.info-value.qty-val { font-size: 100px; color: #dc2626; }';
            html += '.info-value.vendor-val { font-size: 100px; }';
            html += '.row-4 { display: flex; align-items: center; padding: 5mm 8mm; }';
            html += '.location-box { background: #000; color: #fff; font-size: 64px; font-weight: 900; padding: 5mm 12mm; min-width: 200px; text-align: center; }';
            html += '.no-print { text-align: center; padding: 20px; }';
            html += '.no-print button { padding: 15px 40px; font-size: 18px; border: none; cursor: pointer; font-weight: bold; margin: 0 10px; border-radius: 8px; }';
            html += '.btn-print { background: #059669; color: white; }';
            html += '.btn-close { background: #666; color: white; }';
            html += '.reprint-badge { position: absolute; top: 10mm; right: 10mm; background: #ef4444; color: white; padding: 2mm 5mm; font-size: 14px; font-weight: bold; border-radius: 4px; }';
            html += '@media print { .no-print { display: none !important; } }';
            html += '</style>';
            html += '<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>';
            html += '</head><body>';

            html += '<div class="label-page" style="position:relative;"><div class="label-content">';
            html += '<div class="reprint-badge">重印</div>';

            html += '<div class="row-1">';
            html += '<div id="qrcode" style="width:200px;height:200px;flex-shrink:0;margin-right:15mm;"></div>';
            html += '<div class="product-name">' + pallet.productName + '</div>';
            html += '</div>';

            html += '<div class="row-2"><div class="product-spec">' + (pallet.spec || '-') + '</div></div>';

            html += '<div class="row-3">';
            html += '<div class="info-cell batch"><div class="info-label">批號</div><div class="info-value">' + (pallet.batchNo || '-') + '</div></div>';
            html += '<div class="info-cell expiry"><div class="info-label">效期</div><div class="info-value">' + (pallet.expDate || '-') + '</div></div>';
            html += '<div class="info-cell qty"><div class="info-label">數量</div><div class="info-value qty-val">' + pallet.quantity + '</div></div>';
            html += '<div class="info-cell vendor"><div class="info-label">廠商</div><div class="info-value vendor-val">' + (pallet.vendor || '-') + '</div></div>';
            html += '</div>';

            html += '<div class="row-4">';
            html += '<div class="location-box">' + (pallet.locationId || '待分配') + '</div>';
            html += '<div style="flex:1;display:flex;align-items:center;justify-content:center;">';
            html += '<svg id="barcode"></svg>';
            html += '</div>';
            html += '</div>';

            html += '</div></div>';

            html += '<div class="no-print">';
            html += '<button class="btn-print" onclick="window.print()">🖨️ 列印</button>';
            html += '<button class="btn-close" onclick="window.close()">關閉</button>';
            html += '</div>';

            var barcode = pallet.palletId || pallet.id;
            html += '<script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"><\/script>';
            html += '<script>window.onload = function() {';
            html += 'try { var qr = qrcode(0, "L"); qr.addData("' + barcode + '"); qr.make(); document.getElementById("qrcode").innerHTML = qr.createSvgTag(8, 0); } catch(e) {}';
            html += 'try { JsBarcode("#barcode", "' + barcode + '", {format:"CODE128",height:60,width:1.5,displayValue:true,fontSize:14,margin:5}); } catch(e) {}';
            html += '};<\/script>';
            html += '</body></html>';

            var printWindow = window.open('', '_blank', 'width=1100,height=800');
            printWindow.document.write(html);
            printWindow.document.close();

            reprintHistory.unshift({
                palletId: barcode,
                productName: pallet.productName,
                time: new Date().toLocaleTimeString()
            });
            if (reprintHistory.length > 5) reprintHistory.pop();
            updateReprintHistory();

            showToast('✅ 已開啟列印視窗');
        };

        function updateReprintHistory() {
            var container = document.getElementById('reprint-history');
            if (!container) return;

            if (reprintHistory.length === 0) {
                container.innerHTML = '<div class="text-slate-600 text-sm">尚無重印記錄</div>';
                return;
            }

            container.innerHTML = reprintHistory.map(function(item) {
                return '<div class="flex justify-between items-center text-sm bg-slate-800 rounded px-3 py-2">' +
                    '<span class="text-white">' + item.productName + '</span>' +
                    '<span class="text-slate-400 text-xs">' + item.time + '</span>' +
                    '</div>';
            }).join('');
        }

        window.ROLES = {
            admin: { name: '管理員', color: 'red', icon: 'crown', level: 100, permissions: ['all'] },
            finance: { name: '財務人員', color: 'emerald', icon: 'calculator', level: 85, permissions: ['approve', 'report', 'rental', 'consignment', 'inventory', 'analysis'] },
            supervisor: { name: '主管', color: 'purple', icon: 'user-tie', level: 80, permissions: ['inbound', 'outbound', 'move', 'merge', 'stocktake', 'report', 'approve', 'inventory', 'dispatch', 'analysis'] },
            sales: { name: '業務人員', color: 'cyan', icon: 'briefcase', level: 70, permissions: ['inventory', 'report', 'consignment', 'rental', 'analysis'] },
            operator: { name: '一般', color: 'blue', icon: 'user', level: 60, permissions: ['inbound', 'outbound', 'move', 'merge', 'stocktake', 'inventory', 'report'] },
            forklift: { name: '堆高機手', color: 'orange', icon: 'truck', level: 40, permissions: ['move', 'merge', 'dispatch', 'inventory'] },
            readonly: { name: '只讀', color: 'slate', icon: 'eye', level: 10, permissions: ['inventory'] },
            custom: { name: '自訂權限', color: 'amber', icon: 'sliders', level: 50, permissions: [] }
        };

        window.PERMISSION_IDS = ['inbound', 'approve', 'inventory', 'move', 'merge', 'stocktake', 'outbound', 'dispatch', 'consignment', 'rental', 'report', 'analysis', 'users', 'settings'];

        window.applyRoleTemplate = function() {
            var role = document.getElementById('edit-user-role').value;
            var roleConfig = window.ROLES[role];

            if (!roleConfig) return;

            clearAllPermissions();

            if (roleConfig.permissions.includes('all')) {
                selectAllPermissions();
                return;
            }

            roleConfig.permissions.forEach(function(perm) {
                var checkbox = document.getElementById('perm-' + perm);
                if (checkbox) checkbox.checked = true;
            });
        };

        window.selectAllPermissions = function() {
            document.querySelectorAll('.perm-checkbox').forEach(function(cb) {
                cb.checked = true;
            });
        };

        window.clearAllPermissions = function() {
            document.querySelectorAll('.perm-checkbox').forEach(function(cb) {
                cb.checked = false;
            });
        };

        window.getSelectedPermissions = function() {
            var permissions = [];
            document.querySelectorAll('.perm-checkbox:checked').forEach(function(cb) {
                var permId = cb.id.replace('perm-', '');
                permissions.push(permId);
            });
            return permissions;
        };

        window.setPermissionCheckboxes = function(permissions) {
            clearAllPermissions();
            if (!permissions || !Array.isArray(permissions)) return;

            if (permissions.includes('all')) {
                selectAllPermissions();
                return;
            }

            permissions.forEach(function(perm) {
                var checkbox = document.getElementById('perm-' + perm);
                if (checkbox) checkbox.checked = true;
            });
        };

        window.currentUser = null;

        window.usersData = [];

        // ========== Firebase 使用者操作 ==========

        window.loadUsersFromFirebase = async function() {
            try {
                var snapshot = await window.getDocs(window.collection(window.db, 'users'));
                window.usersData = [];
                snapshot.forEach(function(doc) {
                    window.usersData.push({ id: doc.id, ...doc.data() });
                });
                window._usersLoaded = true;
                return window.usersData;
            } catch (e) {
                console.error('載入使用者失敗:', e);
                window._usersLoaded = false;
                window.usersData = JSON.parse(localStorage.getItem('wms_users') || '[]');
                return window.usersData;
            }
        };

        window.getUserByEmail = function(email) {
            var target = String(email || '').toLowerCase();
            return window.usersData.find(function(u) {
                return String(u.email || '').toLowerCase() === target || String(u.id || '').toLowerCase() === target;
            });
        };

        // 拒絕登入：顯示原因並登出（不再自動建立帳號）
        function denyLogin(message) {
            window.currentUser = null;
            var errorEl = document.getElementById('login-error');
            if (errorEl) {
                errorEl.innerText = message;
                errorEl.classList.remove('hidden');
            }
            try { window.auth.signOut(); } catch (e) { console.error('登出失敗:', e); }
            return null;
        }

        window.setCurrentUser = async function(email) {
            // 先讀自己的使用者文件（安全規則允許本人讀取，即使尚未開通）
            var ownSnap;
            try {
                ownSnap = await window.getDoc(window.doc(window.db, 'users', String(email || '').toLowerCase()));
            } catch (e) {
                console.error('讀取使用者資料失敗:', e);
                return denyLogin('無法載入使用者資料，請檢查網路後再登入');
            }

            // 使用者清單（使用者管理用；未開通的帳號會被安全規則擋下，屬正常）
            await loadUsersFromFirebase();

            var user = ownSnap.exists ? { id: ownSnap.id, ...ownSnap.data() } : getUserByEmail(email);

            if (!user) {
                if (window._usersLoaded && window.usersData.length === 0) {
                    // 系統第一次使用（users 是空的）：第一位登入者成為管理員
                    user = {
                        id: email,
                        email: email,
                        name: email.split('@')[0],
                        role: 'admin',
                        dept: '',
                        active: true,
                        createdAt: new Date().toISOString()
                    };
                    try {
                        await window.setDoc(window.doc(window.db, 'users', email), user);
                        window.usersData.push(user);
                    } catch (e) {
                        console.error('建立首位管理員失敗:', e);
                        return denyLogin('建立管理員帳號失敗：啟用安全規則後，第一位管理員請在 Firebase 主控台的 users 建立');
                    }
                } else {
                    return denyLogin('此帳號尚未開通，請聯絡系統管理員');
                }
            }

            if (user.active === false) {
                return denyLogin('此帳號已停用，請聯絡系統管理員');
            }

            window.currentUser = user;

            var nameEl = document.getElementById('current-user-name');
            var badgeEl = document.getElementById('current-user-role-badge');

            if (nameEl) nameEl.innerText = user.name || user.email;
            if (badgeEl) {
                var role = window.ROLES[user.role] || window.ROLES.operator;
                badgeEl.innerText = role.name;
                badgeEl.className = 'text-xs px-2 py-0.5 rounded-full bg-' + role.color + '-600/30 text-' + role.color + '-400';
            }

            try {
                await window.updateDoc(window.doc(window.db, 'users', user.id || email), {
                    lastLogin: new Date().toISOString()
                });
                user.lastLogin = new Date().toISOString();
            } catch (e) {
                console.log('更新登入時間失敗:', e);
            }

            applyPermissions();

            return user;
        };

        window.hasPermission = function(requiredLevel) {
            if (!window.currentUser) return false;
            var userRole = window.ROLES[window.currentUser.role] || window.ROLES.readonly;
            return userRole.level >= requiredLevel;
        };

        window.canAccess = function(feature) {
            if (!window.currentUser) return false;

            var userRole = window.ROLES[window.currentUser.role] || window.ROLES.readonly;

            if (userRole.permissions.includes('all')) return true;

            if (window.currentUser.customPermissions && Array.isArray(window.currentUser.customPermissions)) {
                return window.currentUser.customPermissions.includes(feature);
            }

            return userRole.permissions.includes(feature);
        };

        window.getUserPermissions = function(user) {
            if (!user) return [];

            var userRole = window.ROLES[user.role] || window.ROLES.readonly;

            if (userRole.permissions.includes('all')) return ['all'];

            if (user.customPermissions && Array.isArray(user.customPermissions)) {
                return user.customPermissions;
            }

            return userRole.permissions;
        };

        function applyPermissions() {
            var user = window.currentUser;
            if (!user) return;

            var role = window.ROLES[user.role] || window.ROLES.readonly;
            var level = role.level;

            if (level <= 10) {
                document.querySelectorAll('.requires-write').forEach(function(el) {
                    el.style.display = 'none';
                });
            }

            if (level < 80) {
                var userMgmtNav = document.querySelector('[onclick*="user-management"]');
                if (userMgmtNav) userMgmtNav.style.display = 'none';
            }

            if (user.role === 'forklift') {
            }
        }

        // ========== 使用者 CRUD 操作 ==========

        window.openAddUserModal = function() {
            if (!hasPermission(100)) {
                showToast('❌ 您沒有權限執行此操作');
                return;
            }

            document.getElementById('modal-user-title').innerHTML = '<i class="fa-solid fa-user-plus mr-2"></i>新增使用者';
            document.getElementById('edit-user-id').value = '';
            document.getElementById('edit-user-email').value = '';
            document.getElementById('edit-user-email').readOnly = false;
            document.getElementById('edit-user-name').value = '';
            document.getElementById('edit-user-role').value = 'operator';
            document.getElementById('edit-user-dept').value = '';
            document.getElementById('edit-user-password').value = '';
            document.getElementById('edit-user-password2').value = '';
            document.getElementById('edit-user-active').checked = true;
            document.getElementById('password-fields').style.display = 'block';

            applyRoleTemplate();

            document.getElementById('modal-user-edit').classList.remove('hidden');
        };

        window.editUser = function(email) {
            if (!hasPermission(100)) {
                showToast('❌ 您沒有權限執行此操作');
                return;
            }

            var user = getUserByEmail(email);
            if (!user) return;

            document.getElementById('modal-user-title').innerHTML = '<i class="fa-solid fa-user-pen mr-2"></i>編輯使用者';
            document.getElementById('edit-user-id').value = email;
            document.getElementById('edit-user-email').value = user.email;
            document.getElementById('edit-user-email').readOnly = true;
            document.getElementById('edit-user-name').value = user.name || '';
            document.getElementById('edit-user-role').value = user.role || 'operator';
            document.getElementById('edit-user-dept').value = user.dept || '';
            document.getElementById('edit-user-password').value = '';
            document.getElementById('edit-user-password2').value = '';
            document.getElementById('edit-user-active').checked = user.active !== false;
            document.getElementById('password-fields').style.display = 'none'; // 編輯時隱藏密碼

            // 功能權限勾選已不使用（所有人功能相同），顯示實際角色即可
            applyRoleTemplate();

            document.getElementById('modal-user-edit').classList.remove('hidden');
        };

        window.closeUserModal = function() {
            document.getElementById('modal-user-edit').classList.add('hidden');
        };

        window.saveUser = async function() {
            var id = document.getElementById('edit-user-id').value;
            var email = document.getElementById('edit-user-email').value.trim().toLowerCase();
            var name = document.getElementById('edit-user-name').value.trim();
            var role = document.getElementById('edit-user-role').value;
            var dept = document.getElementById('edit-user-dept').value.trim();
            var active = document.getElementById('edit-user-active').checked;
            var password = document.getElementById('edit-user-password').value;
            var password2 = document.getElementById('edit-user-password2').value;

            if (!email || !name) {
                showToast('❌ 請填寫 Email 和姓名');
                return;
            }

            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                showToast('❌ Email 格式不正確');
                return;
            }

            try {
                if (!id) {
                    if (!password || password.length < 6) {
                        showToast('❌ 密碼至少需要6位');
                        return;
                    }
                    if (password !== password2) {
                        showToast('❌ 兩次密碼不一致');
                        return;
                    }

                    if (getUserByEmail(email)) {
                        showToast('❌ 此 Email 已存在於系統中');
                        return;
                    }

                    showToast('⏳ 正在建立使用者帳號...');

                    var authCreated = false;
                    var authUid = null;
                    try {
                        var userCredential = await window.createUserWithEmailAndPassword(window.secondaryAuth, email, password);
                        authUid = userCredential.user.uid;
                        authCreated = true;
                        console.log('Firebase Auth 帳號已建立，UID:', authUid);

                        try {
                            await window.secondaryAuth.signOut();
                        } catch (signOutErr) {
                            console.log('SecondaryAuth signOut:', signOutErr);
                        }
                    } catch (authErr) {
                        console.log('建立 Auth 帳號失敗:', authErr.code, authErr.message);
                        if (authErr.code === 'auth/email-already-in-use') {
                            authCreated = true;
                            showToast('ℹ️ 此 Email 已有 Auth 帳號，將建立系統使用者資料');
                        } else if (authErr.code === 'auth/weak-password') {
                            showToast('❌ 密碼強度不足，請使用至少6位密碼');
                            return;
                        } else if (authErr.code === 'auth/invalid-email') {
                            showToast('❌ Email 格式不正確');
                            return;
                        } else if (authErr.code === 'auth/operation-not-allowed') {
                            showToast('❌ Firebase 尚未啟用 Email/Password 登入方式');
                            return;
                        } else {
                            console.warn('Auth 建立警告:', authErr);
                        }
                    }

                    var customPermissions = getSelectedPermissions();

                    var newUser = {
                        email: email,
                        name: name,
                        role: role,
                        dept: dept,
                        active: active,
                        authCreated: authCreated,
                        authUid: authUid || null,
                        customPermissions: customPermissions,
                        createdAt: new Date().toISOString(),
                        createdBy: window.currentUser ? window.currentUser.email : 'system'
                    };

                    await window.setDoc(window.doc(window.db, 'users', email), newUser);
                    window.usersData.push({ id: email, ...newUser });

                    console.log('使用者操作記錄: create_user', email, '新增使用者 - ' + name + ' (' + role + ')', '權限:', customPermissions);

                    if (authCreated) {
                        showToast('✅ 使用者 ' + name + ' 已建立完成！可立即登入系統');
                    } else {
                        showToast('⚠️ 使用者資料已建立，但登入帳號建立失敗');
                        setTimeout(function() {
                            alert('📋 使用者資料已建立！\n\n但 Firebase Auth 帳號建立失敗。\n\n請到 Firebase Console > Authentication > Users\n點擊「Add user」手動建立：\n\n• Email: ' + email + '\n• Password: （您設定的密碼）\n\n或聯繫系統管理員協助處理。');
                        }, 500);
                    }

                } else {
                    var customPermissions = getSelectedPermissions();

                    var updateData = {
                        name: name,
                        role: role,
                        dept: dept,
                        active: active,
                        customPermissions: customPermissions,
                        updatedAt: new Date().toISOString(),
                        updatedBy: window.currentUser ? window.currentUser.email : 'system'
                    };

                    await window.updateDoc(window.doc(window.db, 'users', id), updateData);

                    var user = getUserByEmail(id);
                    if (user) {
                        Object.assign(user, updateData);
                    }

                    showToast('✅ 使用者 ' + name + ' 已更新');
                }

                closeUserModal();
                loadUserList();

            } catch (e) {
                console.error('儲存使用者失敗:', e);
                showToast('❌ 儲存失敗: ' + e.message);
            }
        };

        window.deleteUser = async function(email) {
            if (!hasPermission(100)) {
                showToast('❌ 您沒有權限執行此操作');
                return;
            }

            if (email === 'admin@bafang.com') {
                showToast('❌ 無法刪除系統管理員帳號');
                return;
            }

            if (!confirm('確定要刪除使用者 ' + email + '？\n\n注意：這只會刪除使用者資料，Firebase Auth 帳號需要另外在 Console 刪除。')) return;

            try {
                await window.deleteDoc(window.doc(window.db, 'users', email));
                window.usersData = window.usersData.filter(function(u) { return u.email !== email && u.id !== email; });
                loadUserList();
                showToast('✅ 使用者已刪除');
            } catch (e) {
                console.error('刪除使用者失敗:', e);
                showToast('❌ 刪除失敗: ' + e.message);
            }
        };

        window.toggleUserStatus = async function(email) {
            if (!hasPermission(100)) {
                showToast('❌ 您沒有權限執行此操作');
                return;
            }

            var user = getUserByEmail(email);
            if (!user) return;

            var newStatus = !user.active;

            try {
                await window.updateDoc(window.doc(window.db, 'users', email), {
                    active: newStatus,
                    updatedAt: new Date().toISOString()
                });

                user.active = newStatus;
                loadUserList();
                showToast(newStatus ? '✅ 使用者已啟用' : '⚠️ 使用者已停用');
            } catch (e) {
                console.error('更新狀態失敗:', e);
                showToast('❌ 更新失敗: ' + e.message);
            }
        };

        window.loadUserList = async function() {
            var tbody = document.getElementById('user-list-body');
            if (!tbody) return;

            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-slate-500 py-8"><i class="fa-solid fa-spinner fa-spin mr-2"></i>載入中...</td></tr>';

            await loadUsersFromFirebase();

            if (window.usersData.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" class="text-center text-slate-500 py-8">尚無使用者資料</td></tr>';
                updateUserStats();
                return;
            }

            var sortedUsers = window.usersData.slice().sort(function(a, b) {
                var levelA = (window.ROLES[a.role] || window.ROLES.readonly).level;
                var levelB = (window.ROLES[b.role] || window.ROLES.readonly).level;
                if (levelB !== levelA) return levelB - levelA;
                return (a.name || '').localeCompare(b.name || '');
            });

            var html = '';
            sortedUsers.forEach(function(user) {
                var role = window.ROLES[user.role] || window.ROLES.operator;
                var statusBadge = user.active !== false
                    ? '<span class="badge badge-green cursor-pointer" onclick="toggleUserStatus(\'' + user.email + '\')">啟用</span>'
                    : '<span class="badge badge-red cursor-pointer" onclick="toggleUserStatus(\'' + user.email + '\')">停用</span>';
                var canLogin = user.authCreated || user.lastLogin;
                var authBadge = canLogin
                    ? '<span class="text-emerald-400 text-[10px]" title="可登入"><i class="fa-solid fa-check-circle"></i></span>'
                    : '<span class="text-yellow-400 text-[10px]" title="尚未建立登入帳號"><i class="fa-solid fa-exclamation-triangle"></i></span>';
                var lastLogin = user.lastLogin
                    ? new Date(user.lastLogin).toLocaleString('zh-TW')
                    : '<span class="text-slate-600">從未登入</span>';
                var createdAt = user.createdAt
                    ? new Date(user.createdAt).toLocaleDateString('zh-TW')
                    : '-';

                var userPerms = getUserPermissions(user);
                var permBadge = '';
                if (userPerms.includes('all')) {
                    permBadge = '<span class="text-amber-400 text-[10px] ml-1" title="全部權限"><i class="fa-solid fa-star"></i></span>';
                } else if (false) {   // 功能權限已不使用
                    permBadge = '<span class="text-amber-400 text-[10px] ml-1" title="自訂 ' + user.customPermissions.length + ' 項權限"><i class="fa-solid fa-sliders"></i> ' + user.customPermissions.length + '</span>';
                }

                html += '<tr class="hover:bg-slate-800/50 border-b border-slate-700/50">';
                html += '<td class="p-3"><span class="text-cyan-400">' + user.email + '</span> ' + authBadge + '</td>';
                html += '<td class="p-3 font-bold text-white">' + (user.name || '-') + '</td>';
                html += '<td class="p-3"><span class="badge badge-' + role.color + '"><i class="fa-solid fa-' + role.icon + ' mr-1"></i>' + role.name + '</span>' + permBadge + '</td>';
                html += '<td class="p-3 text-slate-400">' + (user.dept || '-') + '</td>';
                html += '<td class="p-3 text-center">' + statusBadge + '</td>';
                html += '<td class="p-3 text-slate-400 text-xs">' + lastLogin + '</td>';
                html += '<td class="p-3 text-slate-400 text-xs">' + createdAt + '</td>';
                html += '<td class="p-3 text-center">';
                html += '<button onclick="editUser(\'' + user.email + '\')" class="bg-blue-600 hover:bg-blue-500 text-white text-xs px-2 py-1 rounded mr-1" title="編輯"><i class="fa-solid fa-pen"></i></button>';
                html += '<button onclick="resetUserPassword(\'' + user.email + '\')" class="bg-amber-600 hover:bg-amber-500 text-white text-xs px-2 py-1 rounded mr-1" title="重設密碼"><i class="fa-solid fa-key"></i></button>';
                if (user.email !== 'admin@bafang.com') {
                    html += '<button onclick="deleteUser(\'' + user.email + '\')" class="bg-red-600 hover:bg-red-500 text-white text-xs px-2 py-1 rounded" title="刪除"><i class="fa-solid fa-trash"></i></button>';
                }
                html += '</td>';
                html += '</tr>';
            });

            tbody.innerHTML = html;

            updateUserStats();

            document.getElementById('user-count').innerText = '共 ' + window.usersData.length + ' 位使用者';
        };

        function updateUserStats() {
            var stats = { admin: 0, finance: 0, supervisor: 0, sales: 0, operator: 0, forklift: 0, readonly: 0 };
            window.usersData.forEach(function(u) {
                if (stats.hasOwnProperty(u.role)) {
                    stats[u.role]++;
                } else {
                    stats.operator++;
                }
            });

            Object.keys(stats).forEach(function(role) {
                var el = document.getElementById('stat-' + role);
                if (el) el.innerText = stats[role];
            });
        }

        window.resetUserPassword = async function(email) {
            if (!confirm('確定要發送密碼重設郵件給 ' + email + '？')) return;

            try {
                await window.sendPasswordResetEmail(window.auth, email);
                showToast('✅ 密碼重設郵件已發送至 ' + email);
            } catch (e) {
                console.error('發送密碼重設郵件失敗:', e);
                if (e.code === 'auth/user-not-found') {
                    showToast('⚠️ 此 Email 尚未建立 Firebase Auth 帳號');
                } else {
                    showToast('❌ 發送失敗: ' + e.message);
                }
            }
        };

        window.filterUserList = function() {
            var searchText = (document.getElementById('user-search').value || '').toLowerCase();
            var roleFilter = document.getElementById('user-role-filter').value;
            var statusFilter = document.getElementById('user-status-filter').value;

            var tbody = document.getElementById('user-list-body');
            if (!tbody) return;

            var filteredUsers = window.usersData.filter(function(user) {
                if (searchText) {
                    var matchEmail = (user.email || '').toLowerCase().includes(searchText);
                    var matchName = (user.name || '').toLowerCase().includes(searchText);
                    if (!matchEmail && !matchName) return false;
                }

                if (roleFilter && user.role !== roleFilter) return false;

                if (statusFilter === 'active' && user.active === false) return false;
                if (statusFilter === 'inactive' && user.active !== false) return false;

                return true;
            });

            filteredUsers.sort(function(a, b) {
                var levelA = (window.ROLES[a.role] || window.ROLES.readonly).level;
                var levelB = (window.ROLES[b.role] || window.ROLES.readonly).level;
                if (levelB !== levelA) return levelB - levelA;
                return (a.name || '').localeCompare(b.name || '');
            });

            if (filteredUsers.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" class="text-center text-slate-500 py-8">沒有符合條件的使用者</td></tr>';
                document.getElementById('user-count').innerText = '共 0 位使用者';
                return;
            }

            var html = '';
            filteredUsers.forEach(function(user) {
                var role = window.ROLES[user.role] || window.ROLES.operator;
                var statusBadge = user.active !== false
                    ? '<span class="badge badge-green cursor-pointer" onclick="toggleUserStatus(\'' + user.email + '\')">啟用</span>'
                    : '<span class="badge badge-red cursor-pointer" onclick="toggleUserStatus(\'' + user.email + '\')">停用</span>';
                var canLogin = user.authCreated || user.lastLogin;
                var authBadge = canLogin
                    ? '<span class="text-emerald-400 text-[10px]" title="可登入"><i class="fa-solid fa-check-circle"></i></span>'
                    : '<span class="text-yellow-400 text-[10px]" title="尚未建立登入帳號"><i class="fa-solid fa-exclamation-triangle"></i></span>';
                var lastLogin = user.lastLogin
                    ? new Date(user.lastLogin).toLocaleString('zh-TW')
                    : '<span class="text-slate-600">從未登入</span>';
                var createdAt = user.createdAt
                    ? new Date(user.createdAt).toLocaleDateString('zh-TW')
                    : '-';

                var userPerms = getUserPermissions(user);
                var permBadge = '';
                if (userPerms.includes('all')) {
                    permBadge = '<span class="text-amber-400 text-[10px] ml-1" title="全部權限"><i class="fa-solid fa-star"></i></span>';
                } else if (false) {   // 功能權限已不使用
                    permBadge = '<span class="text-amber-400 text-[10px] ml-1" title="自訂 ' + user.customPermissions.length + ' 項權限"><i class="fa-solid fa-sliders"></i> ' + user.customPermissions.length + '</span>';
                }

                html += '<tr class="hover:bg-slate-800/50 border-b border-slate-700/50">';
                html += '<td class="p-3"><span class="text-cyan-400">' + user.email + '</span> ' + authBadge + '</td>';
                html += '<td class="p-3 font-bold text-white">' + (user.name || '-') + '</td>';
                html += '<td class="p-3"><span class="badge badge-' + role.color + '"><i class="fa-solid fa-' + role.icon + ' mr-1"></i>' + role.name + '</span>' + permBadge + '</td>';
                html += '<td class="p-3 text-slate-400">' + (user.dept || '-') + '</td>';
                html += '<td class="p-3 text-center">' + statusBadge + '</td>';
                html += '<td class="p-3 text-slate-400 text-xs">' + lastLogin + '</td>';
                html += '<td class="p-3 text-slate-400 text-xs">' + createdAt + '</td>';
                html += '<td class="p-3 text-center">';
                html += '<button onclick="editUser(\'' + user.email + '\')" class="bg-blue-600 hover:bg-blue-500 text-white text-xs px-2 py-1 rounded mr-1" title="編輯"><i class="fa-solid fa-pen"></i></button>';
                html += '<button onclick="resetUserPassword(\'' + user.email + '\')" class="bg-amber-600 hover:bg-amber-500 text-white text-xs px-2 py-1 rounded mr-1" title="重設密碼"><i class="fa-solid fa-key"></i></button>';
                if (user.email !== 'admin@bafang.com') {
                    html += '<button onclick="deleteUser(\'' + user.email + '\')" class="bg-red-600 hover:bg-red-500 text-white text-xs px-2 py-1 rounded" title="刪除"><i class="fa-solid fa-trash"></i></button>';
                }
                html += '</td>';
                html += '</tr>';
            });

            tbody.innerHTML = html;
            document.getElementById('user-count').innerText = '共 ' + filteredUsers.length + ' 位使用者';
        };

        window.getOperatorName = function() {
            if (window.currentUser) {
                return window.currentUser.name || window.currentUser.email;
            }
            return '未知';
        };

        window.getOperatorEmail = function() {
            if (window.currentUser) {
                return window.currentUser.email;
            }
            return 'unknown';
        };

        window.exportUserList = function() {
            if (window.usersData.length === 0) {
                showToast('❌ 沒有使用者資料可匯出');
                return;
            }

            var data = window.usersData.map(function(u) {
                var role = window.ROLES[u.role] || window.ROLES.readonly;
                return {
                    'Email': u.email,
                    '姓名': u.name || '',
                    '角色': role.name,
                    '部門': u.dept || '',
                    '狀態': u.active !== false ? '啟用' : '停用',
                    '最後登入': u.lastLogin ? new Date(u.lastLogin).toLocaleString('zh-TW') : '-',
                    '建立時間': u.createdAt ? new Date(u.createdAt).toLocaleString('zh-TW') : '-'
                };
            });

            var ws = XLSX.utils.json_to_sheet(data);
            var wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, '使用者清單');
            XLSX.writeFile(wb, '使用者清單_' + new Date().toLocalYMD() + '.xlsx');

            showToast('✅ 匯出成功');
        };

        // ========== 外倉庫存操作函數 ==========

        window.createExternalStock = async function(order) {
            try {
                var stockData = {
                    warehouseId: order.warehouseId,
                    warehouseName: order.warehouseName,
                    productName: order.productName,
                    spec: order.spec || '',
                    batchNo: order.batchNo || '',
                    expiryDate: order.expDate,
                    quantity: order.quantity,
                    vendor: order.vendor || '',
                    inboundDocNo: order.docNo,
                    createdAt: new Date().toISOString(),
                    createdBy: window.currentUser ? window.currentUser.email : 'system',
                    updatedAt: new Date().toISOString()
                };

                await window.addDoc(window.collection(window.db, 'externalStock'), stockData);

                // 經過共用格式（timestamp 是字串，異動記錄查詢才查得到）
                await window.addDoc(window.collection(window.db, 'inventoryLogs'), window.buildInventoryLogEntry({
                    type: 'external_inbound',
                    productName: order.productName,
                    spec: order.spec || '',
                    batchNo: order.batchNo || '',
                    quantity: order.quantity,
                    quantityChange: order.quantity,
                    locationId: order.warehouseId,
                    vendor: order.vendor || '',
                    note: order.warehouseName + '入庫'
                }));

                console.log('外倉庫存已建立:', stockData);
                return true;
            } catch (e) {
                console.error('建立外倉庫存失敗:', e);
                return false;
            }
        };

        window.externalOutbound = async function(stockId, outQty, note) {
            try {
                var stockRef = window.doc(window.db, 'externalStock', stockId);
                var results = await window.runStockTransaction({
                    changes: [{ ref: stockRef, delta: -outQty, deleteWhenEmpty: true, label: '外倉庫存' }],
                    logs: function(r) {
                        var stock = r[stockRef.path].data;
                        return [{
                            type: 'external_outbound',
                            company: stock.company || '',
                            productName: stock.productName,
                            spec: stock.spec,
                            batchNo: stock.batchNo,
                            quantity: outQty,
                            quantityChange: -outQty,
                            fromLocation: stock.warehouseId || '',
                            note: note || ((stock.warehouseName || stock.warehouseId || '外倉') + '出庫'),
                            operator: window.currentUser ? window.currentUser.email : 'system'
                        }];
                    }
                });

                showToast('✅ 外倉出庫成功');
                return true;
            } catch (e) {
                console.error('外倉出庫失敗:', e);
                showToast('❌ 出庫失敗: ' + e.message);
                return false;
            }
        };

        window.transferToMainWarehouse = async function(stockId, transferQty, targetLocation) {
            try {
                var stockRef = window.doc(window.db, 'externalStock', stockId);
                var palletId = await window.nextDocNo('IN');
                var palletRef = window.db.collection('pallets').doc();
                var now = new Date();

                // 先在交易中讀外倉庫存（確認數量），再用同一筆資料建立本倉棧板
                await window.db.runTransaction(async function(tx) {
                    var snap = await tx.get(stockRef);
                    if (!snap.exists) throw new Error('找不到此庫存記錄');
                    var stock = snap.data();
                    var currentQty = parseFloat(stock.quantity) || 0;
                    if (transferQty > currentQty) throw new Error('調撥數量超過庫存（目前 ' + currentQty + '）');
                    var newQty = currentQty - transferQty;
                    if (newQty <= 0) tx.delete(stockRef);
                    else tx.update(stockRef, { quantity: newQty, updatedAt: now.toISOString() });

                    var exp = window.normalizeDateValue(stock.expiryDate || stock.expDate);
                    tx.set(palletRef, {
                        palletId: palletId,
                        company: stock.company || '',
                        productName: stock.productName,
                        spec: stock.spec || '',
                        batchNo: stock.batchNo || '',
                        expiryDate: exp || null,
                        expDate: exp || '',
                        quantity: transferQty,
                        locationId: targetLocation,
                        vendor: stock.vendor || '',
                        category: 'Transfer',
                        status: 'Active',
                        sourceWarehouse: stock.warehouseId,
                        inboundDate: now,
                        createdAt: now
                    });
                    tx.set(window.db.collection('inventoryLogs').doc(), window.buildInventoryLogEntry({
                        type: 'transfer_in',
                        company: stock.company || '',
                        productName: stock.productName,
                        spec: stock.spec,
                        batchNo: stock.batchNo,
                        quantity: transferQty,
                        quantityChange: transferQty,
                        fromLocation: stock.warehouseId || '',
                        toLocation: targetLocation,
                        locationId: targetLocation,
                        palletId: palletId,
                        note: '從' + (stock.warehouseName || stock.warehouseId || '外倉') + '調入',
                        operator: window.currentUser ? window.currentUser.email : 'system'
                    }));
                });

                showToast('✅ 調撥成功，已入庫至 ' + targetLocation);
                return true;
            } catch (e) {
                console.error('調撥失敗:', e);
                showToast('❌ 調撥失敗: ' + e.message);
                return false;
            }
        };

        // ========== 倉庫管理 Modal 操作 ==========

        window.openWarehouseManager = function() {
            renderWarehouseManagerList();
            document.getElementById('modal-warehouse-manager').classList.remove('hidden');
        };

        window.closeWarehouseManager = function() {
            document.getElementById('modal-warehouse-manager').classList.add('hidden');
            updateWarehouseDropdown();
        };

        function renderWarehouseManagerList() {
            var cwList = document.getElementById('cw-warehouse-list');
            var bfList = document.getElementById('bf-warehouse-list');
            var virtualList = document.getElementById('virtual-warehouse-list');

            if (!cwList || !bfList) return;

            var cwWarehouses = window.warehousesData.filter(function(w) {
                return w.company === '崇文';
            }).sort(function(a, b) { return (a.sortOrder || 99) - (b.sortOrder || 99); });

            cwList.innerHTML = cwWarehouses.map(function(w) {
                var icon = w.icon === 'store' ? 'store' : 'building';
                var statusClass = w.active !== false ? 'text-emerald-400' : 'text-red-400';
                var statusText = w.active !== false ? '啟用' : '停用';
                return '<div class="flex items-center justify-between py-2 px-3 bg-slate-700/50 rounded">' +
                    '<span class="text-white"><i class="fa-solid fa-' + icon + ' mr-2 text-cyan-400"></i>崇文_' + w.name + '</span>' +
                    '<div class="flex items-center gap-2">' +
                    '<span class="text-xs ' + statusClass + '">' + statusText + '</span>' +
                    '<button onclick="toggleWarehouseStatus(\'' + w.id + '\')" class="text-yellow-400 hover:text-yellow-300 text-sm px-2" title="切換狀態"><i class="fa-solid fa-power-off"></i></button>' +
                    '<button onclick="editWarehouse(\'' + w.id + '\')" class="text-blue-400 hover:text-blue-300 text-sm px-2" title="編輯"><i class="fa-solid fa-pen"></i></button>' +
                    '</div></div>';
            }).join('');

            var bfWarehouses = window.warehousesData.filter(function(w) {
                return w.company === '八方';
            }).sort(function(a, b) { return (a.sortOrder || 99) - (b.sortOrder || 99); });

            bfList.innerHTML = bfWarehouses.map(function(w) {
                var icon = w.icon === 'store' ? 'store' : 'building';
                var statusClass = w.active !== false ? 'text-emerald-400' : 'text-red-400';
                var statusText = w.active !== false ? '啟用' : '停用';
                return '<div class="flex items-center justify-between py-2 px-3 bg-slate-700/50 rounded">' +
                    '<span class="text-white"><i class="fa-solid fa-' + icon + ' mr-2 text-orange-400"></i>八方_' + w.name + '</span>' +
                    '<div class="flex items-center gap-2">' +
                    '<span class="text-xs ' + statusClass + '">' + statusText + '</span>' +
                    '<button onclick="toggleWarehouseStatus(\'' + w.id + '\')" class="text-yellow-400 hover:text-yellow-300 text-sm px-2" title="切換狀態"><i class="fa-solid fa-power-off"></i></button>' +
                    '<button onclick="editWarehouse(\'' + w.id + '\')" class="text-blue-400 hover:text-blue-300 text-sm px-2" title="編輯"><i class="fa-solid fa-pen"></i></button>' +
                    '</div></div>';
            }).join('');

            var virtualWarehouses = window.warehousesData.filter(function(w) {
                return w.type === 'virtual';
            });

            virtualList.innerHTML = virtualWarehouses.map(function(w) {
                var statusClass = w.active !== false ? 'text-emerald-400' : 'text-red-400';
                var statusText = w.active !== false ? '啟用' : '停用';
                return '<div class="flex items-center justify-between py-2 px-3 bg-slate-700/50 rounded">' +
                    '<span class="text-white"><i class="fa-solid fa-folder mr-2 text-blue-400"></i>' + w.name + '</span>' +
                    '<div class="flex items-center gap-2">' +
                    '<span class="text-xs ' + statusClass + '">' + statusText + '</span>' +
                    '<button onclick="toggleWarehouseStatus(\'' + w.id + '\')" class="text-yellow-400 hover:text-yellow-300 text-sm px-2" title="切換狀態"><i class="fa-solid fa-power-off"></i></button>' +
                    '<button onclick="editWarehouse(\'' + w.id + '\')" class="text-blue-400 hover:text-blue-300 text-sm px-2" title="編輯"><i class="fa-solid fa-pen"></i></button>' +
                    '</div></div>';
            }).join('');
        }

        window.openAddWarehouseModal = function(type) {
            document.getElementById('edit-warehouse-id').value = '';
            document.getElementById('warehouse-type').value = type;
            document.getElementById('warehouse-name').value = '';
            document.getElementById('warehouse-company').value = '崇文';

            if (type === 'external') {
                document.getElementById('add-warehouse-title').innerHTML = '<i class="fa-solid fa-plus mr-2"></i>新增外倉';
                document.getElementById('company-select-row').style.display = 'block';
                document.getElementById('warehouse-preview').style.display = 'block';
            } else {
                document.getElementById('add-warehouse-title').innerHTML = '<i class="fa-solid fa-plus mr-2"></i>新增虛擬倉';
                document.getElementById('company-select-row').style.display = 'none';
                document.getElementById('warehouse-preview').style.display = 'none';
            }

            updateWarehousePreview();
            document.getElementById('modal-add-warehouse').classList.remove('hidden');
        };

        window.closeAddWarehouseModal = function() {
            document.getElementById('modal-add-warehouse').classList.add('hidden');
        };

        window.updateWarehousePreview = function() {
            var type = document.getElementById('warehouse-type').value;
            var company = document.getElementById('warehouse-company').value;
            var name = document.getElementById('warehouse-name').value;

            var previewEl = document.getElementById('warehouse-preview-text');
            if (type === 'external') {
                previewEl.textContent = company + '_' + (name || '');
            } else {
                previewEl.textContent = name || '';
            }
        };

        window.saveWarehouse = async function() {
            var id = document.getElementById('edit-warehouse-id').value;
            var type = document.getElementById('warehouse-type').value;
            var company = document.getElementById('warehouse-company').value;
            var name = document.getElementById('warehouse-name').value.trim();

            if (!name) {
                showToast('❌ 請輸入倉庫名稱');
                return;
            }

            try {
                if (id) {
                    await window.updateDoc(window.doc(window.db, 'warehouses', id), {
                        name: name,
                        company: type === 'external' ? company : null,
                        updatedAt: new Date().toISOString()
                    });
                    showToast('✅ 倉庫已更新');
                } else {
                    var code = type === 'external'
                        ? (company === '崇文' ? 'CW-' : 'BF-') + Date.now().toString(36).toUpperCase()
                        : 'VT-' + Date.now().toString(36).toUpperCase();

                    await window.addDoc(window.collection(window.db, 'warehouses'), {
                        code: code,
                        name: name,
                        company: type === 'external' ? company : null,
                        type: type,
                        icon: type === 'external' ? 'building' : 'folder',
                        active: true,
                        sortOrder: 99,
                        createdAt: new Date().toISOString()
                    });
                    showToast('✅ 倉庫已新增');
                }

                closeAddWarehouseModal();
                await loadWarehouses();
                renderWarehouseManagerList();

            } catch(e) {
                console.error('儲存倉庫失敗:', e);
                showToast('❌ 儲存失敗: ' + e.message);
            }
        };

        window.editWarehouse = function(id) {
            var wh = window.warehousesData.find(function(w) { return w.id === id; });
            if (!wh) return;

            document.getElementById('edit-warehouse-id').value = id;
            document.getElementById('warehouse-type').value = wh.type || 'external';
            document.getElementById('warehouse-name').value = wh.name;
            document.getElementById('warehouse-company').value = wh.company || '崇文';

            if (wh.type === 'virtual') {
                document.getElementById('add-warehouse-title').innerHTML = '<i class="fa-solid fa-pen mr-2"></i>編輯虛擬倉';
                document.getElementById('company-select-row').style.display = 'none';
                document.getElementById('warehouse-preview').style.display = 'none';
            } else {
                document.getElementById('add-warehouse-title').innerHTML = '<i class="fa-solid fa-pen mr-2"></i>編輯外倉';
                document.getElementById('company-select-row').style.display = 'block';
                document.getElementById('warehouse-preview').style.display = 'block';
            }

            updateWarehousePreview();
            document.getElementById('modal-add-warehouse').classList.remove('hidden');
        };

        window.toggleWarehouseStatus = async function(id) {
            var wh = window.warehousesData.find(function(w) { return w.id === id; });
            if (!wh) return;

            var newStatus = wh.active === false ? true : false;
            var action = newStatus ? '啟用' : '停用';

            if (!confirm('確定要' + action + '「' + (wh.company ? wh.company + '_' : '') + wh.name + '」嗎？')) return;

            try {
                await window.updateDoc(window.doc(window.db, 'warehouses', id), {
                    active: newStatus,
                    updatedAt: new Date().toISOString()
                });

                wh.active = newStatus;
                renderWarehouseManagerList();
                updateWarehouseDropdown();
                showToast('✅ 倉庫已' + action);

            } catch(e) {
                console.error('切換狀態失敗:', e);
                showToast('❌ 操作失敗: ' + e.message);
            }
        };

        // ========== 外倉出庫 Modal 操作 ==========

        window.openExternalOutboundModal = function(id) {
            var stock = window.externalStock.find(function(s) { return s.id === id; });
            if (!stock) return;

            document.getElementById('ext-out-id').value = id;
            document.getElementById('ext-out-name').innerText = stock.productName;
            document.getElementById('ext-out-batch').innerText = stock.batchNo || '-';
            document.getElementById('ext-out-stock').innerText = stock.quantity || 0;
            document.getElementById('ext-out-qty').value = '';
            document.getElementById('ext-out-note').value = '';

            document.getElementById('modal-ext-outbound').classList.remove('hidden');
        };

        window.closeExtOutboundModal = function() {
            document.getElementById('modal-ext-outbound').classList.add('hidden');
        };

        window.confirmExtOutbound = async function() {
            var id = document.getElementById('ext-out-id').value;
            var qty = parseInt(document.getElementById('ext-out-qty').value) || 0;
            var note = document.getElementById('ext-out-note').value.trim();

            if (qty <= 0) {
                showToast('❌ 請輸入有效數量');
                return;
            }

            var result = await externalOutbound(id, qty, note);
            if (result) {
                closeExtOutboundModal();
                loadExternalStock();
            }
        };

        // ========== 調撥到本倉 Modal 操作 ==========

        window.openTransferModal = function(id) {
            var stock = window.externalStock.find(function(s) { return s.id === id; });
            if (!stock) return;

            var whName = window.EXTERNAL_WAREHOUSES[stock.warehouseId]?.name || stock.warehouseId;

            document.getElementById('transfer-id').value = id;
            document.getElementById('transfer-name').innerText = stock.productName;
            document.getElementById('transfer-from').innerText = whName;
            document.getElementById('transfer-batch').innerText = stock.batchNo || '-';
            document.getElementById('transfer-exp').innerText = stock.expiryDate || stock.expDate || '-';
            document.getElementById('transfer-stock').innerText = stock.quantity || 0;
            document.getElementById('transfer-qty').value = '';
            document.getElementById('transfer-loc').value = '';

            document.getElementById('modal-transfer').classList.remove('hidden');
        };

        window.closeTransferModal = function() {
            document.getElementById('modal-transfer').classList.add('hidden');
        };

        window.confirmTransfer = async function() {
            var id = document.getElementById('transfer-id').value;
            var qty = parseInt(document.getElementById('transfer-qty').value) || 0;
            var loc = document.getElementById('transfer-loc').value.trim().toUpperCase();

            if (qty <= 0) {
                showToast('❌ 請輸入有效數量');
                return;
            }

            if (!loc) {
                showToast('❌ 請輸入目標儲位');
                return;
            }

            if (!/^[A-H]-\d{2}-\d{2}$/.test(loc)) {
                showToast('❌ 儲位格式不正確（例：A-01-01）');
                return;
            }

            var result = await transferToMainWarehouse(id, qty, loc);
            if (result) {
                closeTransferModal();
                loadExternalStock();
                loadInventoryData(); // 重新載入本倉庫存
            }
        };

