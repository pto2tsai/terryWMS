// 調度：板已被搬走不能照單搬、同一項不能做兩次、發布到手機後電腦不能再執行
// 貨櫃入庫：印過的插單保留板號、入帳寫到一半可以安全重試；領用：同一板分兩次加入要加總
// 報表：出貨依實際出貨（扣缺貨）、入庫依入庫記錄（出完貨的板也算）、本地日期、領料合計不重複
// 期初匯入：Excel 日期數字、重複判斷含批號；首頁待排波次含部分出貨；補建期初記錄不會重複；補印標籤用板號找
import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';

const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
const today = new Date(); const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const T = ymd(today);
// 今天早上 7:30（台灣）＝ UTC 前一天 23:30：切字串會算成昨天
const early = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 7, 30).toISOString();
await H.resetData(async d => { await baseSeed(d);
  const P = (id, o) => H.setDoc(H.doc(d, 'pallets', id), Object.assign({ palletId: id, company: '崇文', expiryDate: '2027-06-01', palletCapacity: 40 }, o));
  await P('D1', { productName: '白蝦', spec: '50/60', quantity: 10, locationId: 'I-A-01-1F' });
  await P('D2', { productName: '白蝦', spec: '50/60', quantity: 10, locationId: 'I-A-02-1F' });
  await P('R1', { productName: '干貝', spec: 'S', quantity: 20, locationId: 'I-B-01-1F' });
  await H.setDoc(H.doc(d, 'pallets', 'auto-doc-xyz'), { palletId: 'IN-20260101-777', company: '崇文', productName: '鮭魚', spec: 'M', quantity: 5, locationId: 'J-C-01-1F', expiryDate: '2027-01-01' });
  await H.setDoc(H.doc(d, 'dispatchOrders', 'DO1'), { orderNo: 'DSP-1', status: 'pending', completedOps: [], operations: [
    { id: 'op-0', type: '移位', from: 'I-A-01-1F', docId: 'D1', palletId: 'D1', to: 'I-A-05-1F', qty: 10 },
    { id: 'op-1', type: '移位', from: 'I-A-02-1F', docId: 'D2', palletId: 'D2', to: 'I-A-06-1F', qty: 10 }] });
  // 已完成的波次：規劃 10 件、實際出 6 件
  await H.setDoc(H.doc(d, 'waves', 'WX'), { waveNo: 'WX', status: 'done', logistics: '全日物流', createdAt: early, completedAt: early, totalQty: 10,
    orders: [{ orderNo: 'SO-1', customer: '客戶甲', items: [{ productName: '白蝦', spec: '50/60', packageQty: 10 }] }],
    shipped: [{ orderNo: 'SO-1', customer: '客戶甲', logistics: '全日物流', items: [{ productName: '白蝦', spec: '50/60', qty: 6 }] }], shippedQty: 6 });
  // 入庫記錄：一筆的板已經出完貨（不在庫存裡）
  const L = (id, o) => H.setDoc(H.doc(d, 'inventoryLogs', id), Object.assign({ timestamp: early, company: '崇文', spec: '', note: '' }, o));
  await L('L1', { type: 'inbound', productName: '白蝦', quantity: 30, quantityChange: 30, palletId: 'GONE-1', vendor: '甲水產' });
  await L('L2', { type: 'inbound', productName: '透抽', quantity: 12, quantityChange: 12, palletId: 'GONE-2' });
  await L('L3', { type: 'picking-rm', productName: '干貝', quantity: 3, quantityChange: -3 });
  await L('L4', { type: 'picking', productName: '干貝', quantity: 2, quantityChange: -2 });
  await H.setDoc(H.doc(d, 'salesOrders', 'SOP'), { orderNo: 'SOP', status: 'partial', waveNo: null, customer: 'X', items: [], backorderItems: [{ productName: '白蝦', packageQty: 1 }] });
  await H.setDoc(H.doc(d, 'salesOrders', 'SOQ'), { orderNo: 'SOQ', status: 'pending', customer: 'Y', items: [] });
});
const { page, log } = await H.openApp(base, USERS.op);
await page.waitForTimeout(1500);
const dlg = n => log.dialogs.slice(n).map(d => d.msg);

// ---------- 調度：板已被搬走不能照單搬 ----------
await H.admin(async d => { const { updateDoc } = await import('firebase/firestore'); await updateDoc(H.doc(d, 'pallets', 'D1'), { locationId: 'I-A-09-1F' }); });   // 別人先搬走了
const r1 = await page.evaluate(async () => {
  try { await movePalletTx(db.collection('pallets').doc('D1'), 'I-A-05-1F', { note: 't' }, { expectFrom: 'I-A-01-1F', dispatch: { ref: db.collection('dispatchOrders').doc('DO1'), opId: 'op-0' } }); return 'moved'; } catch (e) { return e.message; }
});
H.check('工單上的板已被搬到別處 → 不照單搬、系統位置不變', r1.includes('已經不在 I-A-01-1F') && (await H.one('pallets', 'D1')).locationId === 'I-A-09-1F' && (await H.one('dispatchOrders', 'DO1')).completedOps.length === 0, r1);
// ---------- 調度：同一項不能做兩次（標記完成和搬板在同一筆交易）----------
const r2 = await page.evaluate(async () => {
  const o = { expectFrom: 'I-A-02-1F', dispatch: { ref: db.collection('dispatchOrders').doc('DO1'), opId: 'op-1' } };
  await movePalletTx(db.collection('pallets').doc('D2'), 'I-A-06-1F', { note: 't' }, o);
  try { await movePalletTx(db.collection('pallets').doc('D2'), 'I-A-07-1F', { note: 't' }, o); return 'twice'; } catch (e) { return e.message; }
});
const do1 = await H.one('dispatchOrders', 'DO1');
H.check('搬完同時標記完成；同一項再做一次會被擋下', do1.completedOps.join() === 'op-1' && do1.status === 'in_progress' && r2.includes('已經執行過') && (await H.one('pallets', 'D2')).locationId === 'I-A-06-1F', JSON.stringify([do1.completedOps, r2]));

// ---------- 電腦：已發布到手機的調度不能在電腦執行 ----------
await H.nav(page, 'dispatch-center').catch(() => {});
const pubTxt = await page.evaluate(async () => {
  window._dispatchAnalysis = [{ name: '白蝦', partialMerges: [], isolatedMoves: [{ docId: 'D1', palletId: 'D1', from: 'I-A-09-1F', toSlot: 'I-A-05-1F', qty: 10 }] }];
  const sel = document.getElementById('dispatch-exec-order-select');
  sel.innerHTML = '<option value="0">0</option>'; sel.value = '0';
  await loadDispatchExecOrder();
  return document.getElementById('dispatch-exec-list').innerText;
});
H.check('已發布到手機（還在進行中）→ 電腦只顯示手機進度、不能執行', pubTxt.includes('已經發布到手機') && pubTxt.includes('1/2'), pubTxt.slice(0, 200));

// ---------- 貨櫃入庫：印過的插單保留板號 ----------
await H.nav(page, 'pre-inbound'); await page.waitForTimeout(500);
const lab = await page.evaluate(async () => {
  document.querySelectorAll('.container-zone-cb').forEach(cb => { cb.checked = true; });
  window._containerData.items = [{ id: 'IT1', productName: '白蝦', spec: '50/60', batchNo: 'C1', expiryDate: '2027-05-01', quantity: 80, perPallet: 40, palletCount: 2, company: '崇文', vendor: '甲' }];
  window._containerData.labels = []; window._containerData.labelsPrinted = false;
  await autoGenerateLabels();
  const first = window._containerData.labels.map(l => l.id);
  window._containerData.labelsPrinted = true;   // 已經印出來貼上
  window._containerData.items.push({ id: 'IT2', productName: '透抽', spec: 'L', batchNo: 'C2', expiryDate: '2027-05-01', quantity: 30, perPallet: 30, palletCount: 1, company: '崇文', vendor: '甲' });
  await autoGenerateLabels();
  const second = window._containerData.labels.map(l => l.id);
  return { first, second };
});
H.check('插單印出後再加品項：原本 2 張板號不變，只多 1 張新的', lab.first.length === 2 && lab.second.length === 3 && lab.first.every(id => lab.second.includes(id)), JSON.stringify(lab));
let n0 = log.dialogs.length;
const lab2 = await page.evaluate(async () => {
  window._containerData.items[0].quantity = 40; window._containerData.items[0].palletCount = 1;   // 白蝦改成 40 件
  await autoGenerateLabels();
  return window._containerData.labels.map(l => l.id + ':' + l.itemId + ':' + l.quantity);
});
H.check('數量改少：多出的插單作廢並提醒撕掉，其他板號不變', lab2.length === 2 && lab2.some(x => x.startsWith(lab.first[0])) && dlg(n0).some(m => m.includes('作廢') && m.includes(lab.first[1])), JSON.stringify([lab2, dlg(n0)]));

// ---------- 貨櫃入庫：寫到一半失敗可以安全重試 ----------
const firstId = lab.first[0];
await H.admin(async d => { await H.setDoc(H.doc(d, 'pallets', firstId), { palletId: firstId, productName: '白蝦', spec: '50/60', quantity: 40, locationId: 'I-A-03-1F', source: 'ContainerInbound' }); });   // 上次已經寫進去的那板
n0 = log.dialogs.length;
await page.evaluate(async () => { await confirmContainerInbound(); }); await page.waitForTimeout(1500);
const cpal = (await H.all('pallets')).filter(p => p.source === 'ContainerInbound');
const clog = (await H.all('inventoryLogs')).filter(l => l.note === '貨櫃入庫');
H.check('重試：上次已寫入的板略過、只補其他板（不重複）', cpal.length === 2 && clog.length === 1 && dlg(n0).some(m => m.includes('上次已經入帳')), JSON.stringify([cpal.map(p => p.palletId), clog.length, dlg(n0).slice(-1)]));

// ---------- 領用：同一板分兩次加入要加總 ----------
const rmLeft = await page.evaluate(async () => {
  const base = { id: 'R1', productName: '干貝', spec: 'S', batchNo: '', locationId: 'I-B-01-1F', maxQty: 20, company: '崇文', totalWeight: 0, expDate: '' };
  window.rmPickingCart = [Object.assign({ quantity: 10 }, base), Object.assign({ quantity: 5 }, base)];
  let el = document.getElementById('rm-pick-user'); if (!el) { el = document.createElement('input'); el.id = 'rm-pick-user'; document.body.appendChild(el); }
  el.value = '小王';
  confirmRmPickingFromCart();
  await executeRmPicking();
  return 1;
});
await page.waitForTimeout(800);
H.check('同一板分兩次加 10＋5：扣 15 件（20 → 5）', (await H.one('pallets', 'R1')).quantity === 5, JSON.stringify(await H.one('pallets', 'R1')));

// ---------- 補印標籤：文件 ID 是自動產生的也找得到 ----------
const rp = await page.evaluate(async () => {
  let el = document.getElementById('reprint-pallet-id'); el.value = 'in-20260101-777';
  await searchPalletForReprint();
  return document.getElementById('reprint-pallet-info').innerText;
});
H.check('補印標籤用板號找得到（小寫也可以）', rp.includes('鮭魚') && !rp.includes('找不到'), rp.slice(0, 120));

// ---------- 報表 ----------
const rep = await page.evaluate(async T => {
  window._waveData.waves = (await db.collection('waves').get()).docs.map(d => Object.assign({ id: d.id }, d.data()));
  generateShippingByCustomer(T, T); const ship = window._reportData.currentData;
  await generateInboundSummary(T, T); const inb = window._reportData.currentData;
  await generateInboundByVendor(T, T); const ven = window._reportData.currentData;
  await generatePickingSummary(T, T); const pick = window._reportData.currentData;
  return { ship, inb, ven, pick };
}, T);
H.note('報表: ' + JSON.stringify(rep));
H.check('出貨統計用實際出貨 6 件（不是規劃的 10 件），早上 7:30 完成的算今天', rep.ship.length === 1 && rep.ship[0]['總件數'] === 6, JSON.stringify(rep.ship));
// 今天的入庫記錄：兩筆已出完貨的板（30＋12）＋ 上面貨櫃入庫補寫的 1 板（30）
H.check('入庫統計依入庫記錄：已出完貨的板也算（3 板 72 件）', rep.inb.length === 1 && rep.inb[0]['板數'] === 3 && rep.inb[0]['總件數'] === 72 && rep.inb[0]['日期'] === T, JSON.stringify(rep.inb));
H.check('入庫依廠商：記錄上的廠商', rep.ven.some(r => r['廠商'] === '甲水產' && r['總件數'] === 30), JSON.stringify(rep.ven));
// 領用出庫頁（3 件）＋ 作業看板領料（2 件）＋ 上面領用測試（15 件）
H.check('領料統計：兩種領料記錄都算（3 次 20 件），沒有自己再加一列合計', rep.pick.length === 1 && rep.pick[0]['領用次數'] === 3 && rep.pick[0]['領用數量'] === 20, JSON.stringify(rep.pick));

// ---------- 效期天數、首頁待排波次 ----------
const du = await page.evaluate(T => [daysUntil(T), daysUntil('2020-01-01') < 0, daysUntil(new Date(Date.now() + 86400000))], T);
H.check('效期天數：今天到期＝0（不是過期）、明天＝1', du[0] === 0 && du[1] && du[2] === 1, JSON.stringify(du));
await H.nav(page, 'home'); await page.waitForTimeout(1500);
const homeTxt = await page.innerText('#view-home');
H.check('首頁「訂單未排波次」含部分出貨待補的訂單（2 張）', /訂單未排波次\s*2/.test(homeTxt), homeTxt.replace(/\n/g, ' | ').slice(0, 300));

// ---------- 期初匯入：Excel 日期數字、重複判斷含批號 ----------
const imp = await page.evaluate(async () => {
  await validateAndPreviewData([
    { '儲位': 'i-a-01-1f', '公司': '崇文', '品名': '白蝦', '規格': '50/60', '數量': 10, '批號': 'B9', '效期': 46203 },
    { '儲位': 'I-A-06-1F', '公司': '崇文', '品名': '白蝦', '規格': '50/60', '數量': 10, '批號': 'NEW', '效期': '2027/06/01' },
    { '儲位': 'I-A-01-1F', '公司': '崇文', '品名': '白蝦', '規格': '50/60', '數量': 1, '效期': '明年' }]);
  return importPreviewData.map(r => [r.location, r.expiryDate, r.status, r.errors.join()]);
});
H.check('Excel 日期格子（數字 46203）換成 2026-06-30、儲位轉大寫', imp[0][0] === 'I-A-01-1F' && imp[0][1] === '2026-06-30', JSON.stringify(imp));
H.check('同儲位同品名同數量但批號不同 → 不算重複', imp[1][2] !== 'duplicate', JSON.stringify(imp[1]));
H.check('看不懂的效期列為錯誤（不會默默變成沒有效期）', imp[2][2] === 'invalid' && imp[2][3].includes('效期看不懂'), JSON.stringify(imp[2]));

// ---------- 補建期初記錄：執行兩次不會重複 ----------
const before = (await H.all('inventoryLogs')).length;
await page.evaluate(async () => { await rebuildHistoryLogs(); }); await page.waitForTimeout(500);
const mid = (await H.all('inventoryLogs')).length;
await page.evaluate(async () => { await rebuildHistoryLogs(); }); await page.waitForTimeout(500);
const after = (await H.all('inventoryLogs')).length;
H.check('補建期初記錄：第二次執行不會再多（' + before + ' → ' + mid + ' → ' + after + '）', mid > before && after === mid && !(await H.all('inventoryLogs')).some(l => l.note && l.note.startsWith('期初補建') && l.type === 'inbound'), JSON.stringify([before, mid, after]));

H.check('沒有頁面錯誤', log.errors.length === 0, JSON.stringify(log.errors));
await H.close(); process.exit(0);
