// 訂單／波次：勾選建波次、同一張訂單不會進兩個波次、缺貨＝部分出貨可再排、波次編號不重複、刪除／清除波次的防呆、
// 電腦完成波次會算進手機掃過的項目、訂單匯入（同單號不拆、換算不出件數要人工填、已出貨不改）
// 庫存：編輯不會蓋掉別人改的數量、盤點被異動要重數、搬到滿的儲位先提醒、外倉比對規格／效期、調撥帶重量、馬上入帳檢查儲位
import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';
import XLSX from 'xlsx'; import fs from 'fs'; import os from 'os'; import path from 'path';

const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
const t = new Date(); const prefix = 'W' + String(t.getFullYear()).slice(2) + String(t.getMonth() + 1).padStart(2, '0') + String(t.getDate()).padStart(2, '0') + '-';
await H.resetData(async d => { await baseSeed(d);
  const O = (id, o) => H.setDoc(H.doc(d, 'salesOrders', id), Object.assign({ orderNo: id, status: 'pending', logistics: '全日物流', createdAt: new Date().toISOString() }, o));
  await O('SO-A', { customer: '客戶A', items: [{ productName: '白蝦', spec: '50/60', quantity: 6, unit: '件', packageQty: 6 }] });
  await O('SO-B', { customer: '客戶B', items: [{ productName: '白蝦', spec: '50/60', quantity: 6, unit: '件', packageQty: 6 }, { productName: '透抽', spec: 'L', quantity: 2, unit: '件', packageQty: 2 }] });
  await O('SO-C', { customer: '客戶C', items: [{ productName: '透抽', spec: 'L', quantity: 1, unit: '件', packageQty: 1 }] });
  await O('SO-D', { customer: '客戶D', items: [{ productName: '透抽', spec: 'L', quantity: 1, unit: '件', packageQty: 1 }] });
  const P = (id, o) => H.setDoc(H.doc(d, 'pallets', id), Object.assign({ palletId: id, company: '崇文', expiryDate: '2027-06-01', palletCapacity: 40 }, o));
  await P('PW1', { productName: '白蝦', spec: '50/60', quantity: 8, locationId: 'I-A-01-1F' });
  await P('PT1', { productName: '透抽', spec: 'L', quantity: 10, locationId: 'I-A-02-1F' });
  await P('PE', { productName: '干貝', spec: 'S', batchNo: 'B1', quantity: 10, locationId: 'I-B-01-1F' });
  await P('PS1', { productName: '干貝', spec: 'M', quantity: 20, locationId: 'I-B-02-1F' });
  await P('PS2', { productName: '干貝', spec: 'L', quantity: 15, locationId: 'I-B-03-1F' });
  for (let i = 1; i <= 4; i++) await P('FULL' + i, { productName: '鮭魚', spec: '整尾', quantity: 40, locationId: 'J-C-05-2F' });
  await P('PM', { productName: '鮭魚', spec: '整尾', quantity: 40, locationId: 'J-C-06-1F' });
  const E = (id, o) => H.setDoc(H.doc(d, 'externalStock', id), Object.assign({ warehouseId: 'EXT-TP', company: '崇文', productName: '蝦仁', batchNo: '', expDate: '2027-01-01', expiryDate: '2027-01-01' }, o));
  await E('E1', { spec: '300/400', quantity: 10, totalWeight: 100 });
  await E('E2', { spec: '200/300', quantity: 10, totalWeight: 50, productType: 'variable' });
});
const { page, log } = await H.openApp(base, USERS.op);
await page.waitForTimeout(1500);
const dlg = n => log.dialogs.slice(n).map(d => d.msg);
const lastN = () => log.dialogs.length;

// ---------- 勾選訂單建立波次 ----------
await H.nav(page, 'wave-picking'); await page.waitForTimeout(800);
await page.evaluate(() => openCreateWaveModal()); await page.waitForTimeout(300);
await page.evaluate(() => document.querySelectorAll('.wave-order-check').forEach(cb => { cb.checked = ['SO-A', 'SO-B'].includes(cb.closest('tr').children[1].innerText.trim()); }));
await page.evaluate(() => createWave()); await page.waitForTimeout(1000);
const w1 = await H.one('waves', prefix + '001');
H.check('勾選 2 張訂單建立波次：波次有 2 張訂單、訂單標記波次中', w1 && w1.orders.length === 2 && (await H.one('salesOrders', 'SO-A')).status === 'inWave' && (await H.one('salesOrders', 'SO-B')).waveNo === prefix + '001', JSON.stringify(w1 && w1.orders.map(o => o.orderNo)));

// ---------- 同一張訂單不會進兩個波次（畫面資料是舊的也一樣）----------
const dup = await page.evaluate(async () => {
  const stale = window._orderData.orders.filter(o => ['SO-A', 'SO-B'].includes(o.orderNo)).map(o => Object.assign({}, o, { status: 'pending', waveNo: null }));
  try { await createWaveFromOrders(stale, '全日物流'); return 'created'; } catch (e) { return e.message; }
});
H.check('已在波次中的訂單不能再建一個波次', dup.includes('已經排進其他波次'), dup);

// ---------- 缺貨：部分出貨，缺的可以再排 ----------
const r1 = await page.evaluate(async id => {
  const w = (await db.collection('waves').doc(id).get()).data(); w.id = id;
  const l = buildWavePickingList(w, currentPallets()); l.forEach(i => { i.completed = true; });
  await completeWaveTx(w, l, currentPallets()); return w.orderResults;
}, prefix + '001');
const soA = await H.one('salesOrders', 'SO-A'), soB = await H.one('salesOrders', 'SO-B');
H.note('出貨結果: ' + JSON.stringify(r1));
H.check('白蝦只有 8 件（要 12）：SO-A 6 件出齊＝已出貨', soA.status === 'shipped', JSON.stringify(soA));
H.check('SO-B 白蝦只出 2 件＝部分出貨，欠白蝦 4 件、透抽已出齊', soB.status === 'partial' && !soB.waveNo && soB.backorderItems.length === 1 && soB.backorderItems[0].productName === '白蝦' && soB.backorderItems[0].packageQty === 4, JSON.stringify(soB));
await H.admin(async d => { await H.setDoc(H.doc(d, 'pallets', 'PW2'), { palletId: 'PW2', company: '崇文', productName: '白蝦', spec: '50/60', quantity: 4, locationId: 'I-A-03-1F', expiryDate: '2027-06-01' }); });
await page.waitForTimeout(800);
const w2no = await page.evaluate(async () => {
  await loadOrdersFromFirebase();
  const b = window._orderData.orders.find(o => o.orderNo === 'SO-B');
  const r = await createWaveFromOrders([b], '全日物流'); return r.wave.waveNo;
});
const w2 = await H.one('waves', w2no);
H.check('部分出貨的訂單可以再排波次，只排欠的 4 件（波次編號 -002）', w2no === prefix + '002' && w2.totalQty === 4 && w2.summary.length === 1, JSON.stringify([w2no, w2 && w2.summary]));
await page.evaluate(async id => {
  const w = (await db.collection('waves').doc(id).get()).data(); w.id = id;
  const l = buildWavePickingList(w, currentPallets()); l.forEach(i => { i.completed = true; });
  await completeWaveTx(w, l, currentPallets());
}, w2no);
const soB2 = await H.one('salesOrders', 'SO-B');
H.check('補出後 SO-B＝已出貨，欠貨清掉', soB2.status === 'shipped' && !soB2.backorderItems, JSON.stringify(soB2));

// ---------- 波次編號：刪掉中間的也不會重號 ----------
const nos = await page.evaluate(async () => {
  await loadOrdersFromFirebase(); await loadWavesFromFirebase();
  const c = window._orderData.orders.find(o => o.orderNo === 'SO-C'), d = window._orderData.orders.find(o => o.orderNo === 'SO-D');
  const a = (await createWaveFromOrders([c], 'X')).wave.waveNo;
  const b = (await createWaveFromOrders([d], 'X')).wave.waveNo;
  await deleteWave(a);
  await loadOrdersFromFirebase();
  const c2 = window._orderData.orders.find(o => o.orderNo === 'SO-C');
  const n = (await createWaveFromOrders([c2], 'X')).wave.waveNo;
  return [a, b, n];
});
H.check('刪掉 -003 後新波次是 -005（不會和 -004 重號）', nos.join() === [prefix + '003', prefix + '004', prefix + '005'].join(), JSON.stringify(nos));
H.check('刪除波次後訂單回到待處理，再排進新波次', (await H.one('salesOrders', 'SO-C')).waveNo === prefix + '005');

// ---------- 刪除：手機已經開始揀的波次不能刪 ----------
await H.admin(async d => { const { updateDoc } = await import('firebase/firestore'); await updateDoc(H.doc(d, 'waves', prefix + '004'), { completedItems: ['x'] }); });
let n0 = lastN();
await page.evaluate(async no => { await deleteWave(no); }, prefix + '004');
H.check('手機已開始揀的波次（畫面上還是待揀貨）不能刪除', dlg(n0).some(m => m.includes('已經開始揀貨')) && !!(await H.one('waves', prefix + '004')) && (await H.one('salesOrders', 'SO-D')).status === 'inWave', JSON.stringify(dlg(n0)));

// ---------- 完成已被刪除的波次會被擋下 ----------
const delErr = await page.evaluate(async no => {
  const snap = await db.collection('waves').doc(no).get(); const w = Object.assign({ id: no }, snap.data());
  const l = buildWavePickingList(w, currentPallets()); l.forEach(i => { i.completed = true; });
  await db.collection('waves').doc(no).delete();
  try { await completeWaveTx(w, l, currentPallets()); return 'done'; } catch (e) { return e.message; }
}, prefix + '004');
H.check('波次已被刪除 → 不能完成、不扣庫存', delErr.includes('已被刪除') && (await H.one('pallets', 'PT1')).quantity === 8, delErr + ' PT1=' + (await H.one('pallets', 'PT1')).quantity);
await H.admin(async d => { const { updateDoc } = await import('firebase/firestore'); await updateDoc(H.doc(d, 'salesOrders', 'SO-D'), { status: 'pending', waveNo: null }); });

// ---------- 電腦完成波次：手機掃過的項目也算 ----------
const pt1Before = (await H.one('pallets', 'PT1')).quantity;
await page.evaluate(async no => {
  await loadWavesFromFirebase();
  const w = window._waveData.waves.find(x => x.waveNo === no);
  window._waveData.currentWave = w;
  window._waveData.pickingList = buildWavePickingList(w, currentPallets());
  window.closeWaveExecuteModal = function() {};
}, prefix + '005');
const itemId = await page.evaluate(() => window._waveData.pickingList[0].id);
await H.admin(async d => { const { updateDoc } = await import('firebase/firestore'); await updateDoc(H.doc(d, 'waves', prefix + '005'), { completedItems: [itemId], status: 'picking' }); });
await page.evaluate(async () => { await completeWave(); }); await page.waitForTimeout(800);
H.check('電腦按完成：手機掃過的透抽 1 件有扣庫存、訂單已出貨', (await H.one('pallets', 'PT1')).quantity === pt1Before - 1 && (await H.one('salesOrders', 'SO-C')).status === 'shipped' && (await H.one('waves', prefix + '005')).status === 'done', JSON.stringify([pt1Before, (await H.one('pallets', 'PT1')).quantity]));

// ---------- 清除波次：已完成的保留、已出貨的訂單不動 ----------
await page.evaluate(async () => {
  await loadOrdersFromFirebase(); await loadWavesFromFirebase();
  const d = window._orderData.orders.find(o => o.orderNo === 'SO-D');
  await createWaveFromOrders([d], 'X');
  window.closeClearDataModal = function() {};
  await clearAllWaves();
});
const wavesLeft = (await H.all('waves')).map(w => w.waveNo).sort();
H.check('清除波次：只清未完成的，已完成的 3 個波次保留', wavesLeft.join() === [prefix + '001', prefix + '002', prefix + '005'].join(), JSON.stringify(wavesLeft));
H.check('已出貨的訂單沒有被改回待處理', (await H.one('salesOrders', 'SO-A')).status === 'shipped' && (await H.one('salesOrders', 'SO-C')).status === 'shipped' && (await H.one('salesOrders', 'SO-D')).status === 'pending');

// ---------- 訂單匯入：同單號不拆、換算不出件數要人工填、已出貨的不改 ----------
const aoa = [['銷貨明細'], [], [], [], ['日期', '單號', '代號', '客戶', '品名', '規格', '包裝數量', '包裝單位', '數量', '單位', '單價', '備註', '批號', '地址一', '地址二'],
  ['2026/09/24', 'SO-X', 'C9', '客戶X', '白蝦', '50/60', '', '', '24', '盒', '100', '全日物流', '', '台北市', ''],
  ['', '', '', '', '透抽', 'L', '3', '件', '3', '件', '200', '大榮貨運', '', '', ''],
  ['2026/09/24', 'SO-A', 'C1', '客戶A', '白蝦', '50/60', '9', '件', '9', '件', '100', '全日物流', '', '', '']];
const ws = XLSX.utils.aoa_to_sheet(aoa); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'S');
const xf = path.join(os.tmpdir(), 'erp-orders.xlsx'); fs.writeFileSync(xf, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
page.__dialogPlan = [];
n0 = lastN();
await page.evaluate(async () => { await loadOrdersFromFirebase(); });
await page.setInputFiles('#order-excel-import', xf); await page.waitForTimeout(1500);
const asked = await page.evaluate(() => { const m = document.getElementById('modal-pkg-ask'); return m ? m.innerText : ''; });
H.check('包裝數量空白、品名也沒有 *N盒 → 列出來請人工填件數', asked.includes('SO-X') && asked.includes('白蝦') && asked.includes('24'), asked.slice(0, 200));
await page.click('#pkg-ask-ok'); await page.waitForTimeout(300);
H.check('沒填件數不能繼續', (await page.innerText('#pkg-ask-msg')).includes('還有 1 項沒填'));
page.__dialogPlan = [false];   // 匯入完成後「是否自動建立波次」→ 取消
await page.fill('.pkg-ask-input', '2'); await page.click('#pkg-ask-ok'); await page.waitForTimeout(2500);
const sox = (await H.all('salesOrders')).filter(o => o.orderNo === 'SO-X');
H.check('同一單號兩個物流商的品項＝一張訂單、兩個品項都在', sox.length === 1 && sox[0].items.length === 2 && sox[0].logistics === '全日物流', JSON.stringify(sox.map(o => [o.logistics, o.items.map(i => i.productName)])));
H.check('人工填的件數有存：白蝦 24 盒 → 2 件', sox[0] && sox[0].items.find(i => i.productName === '白蝦').packageQty === 2, JSON.stringify(sox[0] && sox[0].items));
const soA2 = await H.one('salesOrders', 'SO-A');
H.check('已出貨的訂單 SO-A 在鼎新從 6 件加到 9 件 → 多的 3 件自動變補出貨（可以排波次），並提醒', ['partial', 'inWave'].includes(soA2.status) && soA2.backorderItems && soA2.backorderItems[0].packageQty === 3 && dlg(n0).some(m => m.includes('補出貨') && m.includes('SO-A')), JSON.stringify([soA2.status, soA2.backorderItems, dlg(n0).map(m => m.slice(0, 80))]));

// ---------- 編輯棧板：不會蓋掉別人剛改的數量 ----------
await page.evaluate(async () => { await editPallet('PE'); }); await page.waitForTimeout(500);
await H.admin(async d => { const { updateDoc } = await import('firebase/firestore'); await updateDoc(H.doc(d, 'pallets', 'PE'), { quantity: 7 }); });   // 波次剛揀走 3 件
await page.fill('#edit-batch-field', 'B2');
await page.click('button:has-text("儲存修改")'); await page.waitForTimeout(1000);
let pe = await H.one('pallets', 'PE');
H.check('只改批號：數量保持別人剛改的 7（不會蓋回 10）', pe.quantity === 7 && pe.batchNo === 'B2', JSON.stringify(pe));
await page.evaluate(async () => { await editPallet('PE'); }); await page.waitForTimeout(500);
await H.admin(async d => { const { updateDoc } = await import('firebase/firestore'); await updateDoc(H.doc(d, 'pallets', 'PE'), { quantity: 6 }); });
n0 = lastN();
await page.fill('#edit-qty-field', '5');
await page.click('button:has-text("儲存修改")'); await page.waitForTimeout(1000);
pe = await H.one('pallets', 'PE');
H.check('改數量時別人也改了 → 擋下請重開', pe.quantity === 6 && dlg(n0).some(m => m.includes('已被其他作業改過')), JSON.stringify([pe.quantity, dlg(n0)]));
await page.evaluate(() => document.querySelectorAll('body > div').forEach(el => { if (el.innerText && el.innerText.includes('儲存修改')) el.remove(); }));

// ---------- 盤點：被異動的板要重新數，移走的板不會被刪 ----------
await H.nav(page, 'stocktake'); await page.waitForTimeout(500);
await page.evaluate(() => { initStocktakePage(); document.getElementById('st-zone').value = 'I-B'; loadStocktake(); });
await page.evaluate(() => { const rows = window._stocktake.rows; rows.forEach((r, i) => { if (r.id === 'PS1') onStocktakeInput(i, '18'); if (r.id === 'PS2') onStocktakeInput(i, '0'); }); });
await H.admin(async d => { const { updateDoc } = await import('firebase/firestore');
  await updateDoc(H.doc(d, 'pallets', 'PS1'), { quantity: 12 });                 // 盤點中被揀走 8 件
  await updateDoc(H.doc(d, 'pallets', 'PS2'), { locationId: 'K-E-01-1F' }); });   // 盤點中被移走（數量沒變）
await page.waitForTimeout(800);
n0 = lastN();
await page.evaluate(async () => { await submitStocktake(); }); await page.waitForTimeout(1500);
const ps1 = await H.one('pallets', 'PS1'), ps2 = await H.one('pallets', 'PS2');
H.check('盤點期間被揀貨：不覆蓋（仍 12）', ps1.quantity === 12, JSON.stringify(ps1));
H.check('盤點期間被移走的板：輸入 0 也不會被刪', ps2 && ps2.quantity === 15 && ps2.locationId === 'K-E-01-1F', JSON.stringify(ps2));
const rowPS1 = await page.evaluate(() => (window._stocktake.rows.find(r => r.id === 'PS1') || {}));
H.check('被異動的板實盤數清空，要重新數（不能直接再送出舊數字）', rowPS1.book === 12 && rowPS1.counted === '', JSON.stringify(rowPS1));

// ---------- 搬到已滿的儲位：先提醒，取消就不搬 ----------
page.__dialogPlan = [false];
const mv1 = await page.evaluate(async () => { try { await movePalletTx(db.collection('pallets').doc('PM'), 'j-c-05-2f'); return 'moved'; } catch (e) { return e.message; } });
H.check('J-C-05-2F 已有 4 整板：提醒已滿，按取消就不搬', mv1.includes('已取消') && (await H.one('pallets', 'PM')).locationId === 'J-C-06-1F' && log.dialogs[log.dialogs.length - 1].msg.includes('已經滿了'), mv1);
page.__dialogPlan = [];
await page.evaluate(async () => { await movePalletTx(db.collection('pallets').doc('PM'), 'j-c-05-2f'); });
H.check('按確定照搬；小寫儲位存成大寫', (await H.one('pallets', 'PM')).locationId === 'J-C-05-2F');
const mv3 = await page.evaluate(async () => { try { await movePalletTx(db.collection('pallets').doc('PM'), 'XY1'); return 'moved'; } catch (e) { return e.message; } });
H.check('格式不對的儲位擋下', mv3.includes('儲位格式不正確') && (await H.one('pallets', 'PM')).locationId === 'J-C-05-2F', mv3);

// ---------- 調撥：外倉比對規格／效期、重量跟著走 ----------
await page.evaluate(async () => {
  window.externalStock = (await db.collection('externalStock').get()).docs.map(d => Object.assign({ id: d.id }, d.data()));
  window.renderTransferList = function() {}; window.loadExternalStock = async function() {}; window.showNotification = function() {};
  document.querySelectorAll('input[name="transfer-in-method"]').forEach(r => { r.checked = r.value === 'temp'; });
  window.transferList = [{ mode: 'in', fromWh: 'EXT-TP', fromName: '台北外倉', productName: '蝦仁', spec: '200/300', batchNo: '', expDate: '2027-01-01', company: '崇文', quantity: 4 }];
  await executeTransfer();
});
const e1 = await H.one('externalStock', 'E1'), e2 = await H.one('externalStock', 'E2');
const tri = (await H.all('pallets')).find(p => p.productName === '蝦仁');
H.check('調撥入庫 200/300：扣的是 200/300（E2 10→6），300/400 不動', e2.quantity === 6 && e1.quantity === 10, JSON.stringify([e1.quantity, e2.quantity]));
H.check('調撥帶重量：4 件 = 20 kg 到暫存區，外倉剩 30 kg', tri && tri.totalWeight === 20 && tri.spec === '200/300' && e2.totalWeight === 30, JSON.stringify([tri, e2.totalWeight]));

// ---------- 馬上入帳：儲位格式不對擋下 ----------
await H.nav(page, 'unified-inbound'); await page.waitForTimeout(500);
await page.click("button[onclick=\"openProductSelectModal('inbound')\"]"); await page.waitForTimeout(500);
await page.click("#modal-product-select [onclick^=\"selectProductFromModal('P001'\"]"); await page.waitForTimeout(500);
await page.click('#btn-type-FG');
await page.uncheck('#in-print-slip').catch(() => {});
await page.fill('#in-batch', 'Z1'); await page.fill('#in-exp-year', '2027'); await page.fill('#in-exp-month', '8'); await page.fill('#in-exp-day', '1');
await page.fill('#in-qty', '5'); await page.fill('#in-loc', 'IA99'); await page.dispatchEvent('#in-loc', 'input');
const np = (await H.all('pallets')).length;
n0 = lastN();
await page.click('#btn-inbound-direct'); await page.waitForTimeout(1200);
H.check('馬上入帳：儲位格式不對 → 擋下、不建立庫存', dlg(n0).some(m => m.includes('儲位格式不正確')) && (await H.all('pallets')).length === np, JSON.stringify(dlg(n0)));

H.check('沒有頁面錯誤', log.errors.length === 0, JSON.stringify(log.errors));
await H.close(); process.exit(0);
