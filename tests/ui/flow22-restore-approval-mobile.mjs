// 還原：錯的檔案不刪資料、只清備份裡有的表、時間字串保持字串；清除訂單保留出貨記錄
// 財務核准以資料庫最新狀態為準；即期品要主管核准才能入帳；取消入庫單；改已入帳的入庫單會同步調整庫存
// 外倉刪除寫記錄；作業看板不動共用清單；手機：留置區不能出庫、盤點可更正儲位、上架 0 件刪板；留置與一般貨不能合併
import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';

const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
const now = new Date().toISOString();
await H.resetData(async d => { await baseSeed(d);
  const P = (id, o) => H.setDoc(H.doc(d, 'pallets', id), Object.assign({ palletId: id, company: '崇文', palletCapacity: 40, expiryDate: '2027-06-01' }, o));
  await P('A1', { productName: '白蝦', spec: '50/60', quantity: 10, locationId: 'I-A-01-1F' });
  await P('QC1', { productName: '白蝦', spec: '50/60', quantity: 5, locationId: 'V-QC' });
  await P('ST1', { productName: '透抽', spec: 'L', quantity: 8, locationId: 'I-B-01-1F' });
  await P('SH1', { productName: '魷魚', spec: 'M', quantity: 3, locationId: 'TEMP-IN' });
  // 已入帳的入庫單與它建立的那一板
  await P('PDOC', { palletId: 'IN-X-1', productName: '干貝', spec: 'S', batchNo: 'G1', quantity: 20, locationId: 'J-C-01-1F', expiryDate: '2027-01-01' });
  await H.setDoc(H.doc(d, 'inboundOrders', 'POSTED'), { docNo: 'IN-X-1', productName: '干貝', spec: 'S', batchNo: 'G1', quantity: 20, expDate: '2027-01-01', expiryDate: '2027-01-01', status: 'completed', palletDocId: 'PDOC', approvalStatus: 'pending', createdAt: now, locationId: 'J-C-01-1F' });
  // 即期品待主管核准的入庫單＋手機任務
  await H.setDoc(H.doc(d, 'inboundOrders', 'EXP1'), { docNo: 'IN-E-1', productName: '白蝦', spec: '50/60', quantity: 6, expDate: '2026-10-01', expiryDate: '2026-10-01', status: 'pending', expiryApproval: 'pending', locationId: 'I-A-02-1F', createdAt: now });
  await H.setDoc(H.doc(d, 'inboundTasks', 'TE1'), { orderId: 'EXP1', orderNo: 'IN-E-1', palletId: 'IN-E-1', productName: '白蝦', quantity: 6, status: 'pending', expiryApproval: 'pending', createdAt: now });
  // 要取消的入庫單
  await H.setDoc(H.doc(d, 'inboundOrders', 'CAN1'), { docNo: 'IN-C-1', productName: '透抽', quantity: 4, status: 'pending', locationId: 'I-A-03-1F', createdAt: now });
  await H.setDoc(H.doc(d, 'inboundTasks', 'TC1'), { orderId: 'CAN1', orderNo: 'IN-C-1', palletId: 'IN-C-1', productName: '透抽', quantity: 4, status: 'pending', createdAt: now });
  // 財務：畫面上看到的是待審核，但資料庫已被別人駁回
  await H.setDoc(H.doc(d, 'inboundOrders', 'FIN1'), { docNo: 'IN-F-1', productName: '白蝦', quantity: 9, status: 'completed', needsApproval: true, approvalStatus: 'rejected', createdAt: now });
  // 訂單／波次
  await H.setDoc(H.doc(d, 'salesOrders', 'OS'), { orderNo: 'OS', status: 'shipped', waveNo: 'WD', items: [] });
  await H.setDoc(H.doc(d, 'salesOrders', 'OP'), { orderNo: 'OP', status: 'pending', items: [] });
  await H.setDoc(H.doc(d, 'waves', 'WD'), { waveNo: 'WD', status: 'done', orders: [] });
  await H.setDoc(H.doc(d, 'waves', 'WP'), { waveNo: 'WP', status: 'pending', orders: [] });
  await H.setDoc(H.doc(d, 'externalStock', 'X1'), { warehouseId: 'EXT-TP', company: '崇文', productName: '蝦仁', spec: 'L', quantity: 7 });
  await H.setDoc(H.doc(d, 'inventoryLogs', 'LOGX'), { type: 'inbound', timestamp: now, productName: 'x', quantity: 1 });
});
const D = await H.openApp(base, USERS.op);
const page = D.page, log = D.log;
await page.waitForTimeout(1500);
const dlg = n => log.dialogs.slice(n).map(d => d.msg);

// ---------- 還原 ----------
const r0 = await page.evaluate(async () => { try { await restoreCollectionsFromBackup({ foo: [] }); return 'ok'; } catch (e) { return e.message; } });
H.check('不是系統備份的檔案 → 停止，什麼都不刪', r0.includes('不是系統的備份') && (await H.all('pallets')).length === 5, r0);
const r1 = await page.evaluate(async () => restoreCollectionsFromBackup({
  pallets: [{ id: 'A1', data: { palletId: 'A1', productName: '白蝦', quantity: 99, locationId: 'I-A-01-1F' } }],
  inventoryLogs: [{ id: 'LOGR', data: { type: 'inbound', timestamp: '2026-09-01T02:00:00.000Z', createdAt: { __ts: '2026-09-01T02:00:00.000Z' } } }]
}));
const pAll = await H.all('pallets'), logR = await H.one('inventoryLogs', 'LOGR');
H.check('還原只清備份裡有的表：pallets 換成備份的 1 板，訂單等其他表保留', pAll.length === 1 && pAll[0].quantity === 99 && (await H.all('salesOrders')).length === 2, JSON.stringify(pAll));
H.check('時間字串保持字串（查詢才查得到），標記過的才轉回時間戳記', typeof logR.timestamp === 'string' && logR.createdAt && typeof logR.createdAt.toDate === 'function', JSON.stringify(logR));
// 還原後把測試資料放回
await H.admin(async d => { const P = (id, o) => H.setDoc(H.doc(d, 'pallets', id), Object.assign({ palletId: id, company: '崇文', palletCapacity: 40, expiryDate: '2027-06-01' }, o));
  await P('A1', { productName: '白蝦', spec: '50/60', quantity: 10, locationId: 'I-A-01-1F' });
  await P('QC1', { productName: '白蝦', spec: '50/60', quantity: 5, locationId: 'V-QC' });
  await P('ST1', { productName: '透抽', spec: 'L', quantity: 8, locationId: 'I-B-01-1F' });
  await P('SH1', { productName: '魷魚', spec: 'M', quantity: 3, locationId: 'TEMP-IN' });
  await P('PDOC', { palletId: 'IN-X-1', productName: '干貝', spec: 'S', batchNo: 'G1', quantity: 20, locationId: 'J-C-01-1F', expiryDate: '2027-01-01' }); });

// ---------- 清除訂單：保留出貨記錄 ----------
await page.evaluate(async () => { await loadOrdersFromFirebase(); window.closeClearDataModal = function() {}; await clearAllOrders(); });
H.check('清除訂單：只刪沒出貨的（OP、WP），已出貨的訂單與完成的波次保留', !(await H.one('salesOrders', 'OP')) && !(await H.one('waves', 'WP')) && !!(await H.one('salesOrders', 'OS')) && !!(await H.one('waves', 'WD')));

// ---------- 財務核准：以資料庫最新狀態為準 ----------
let n0 = log.dialogs.length;
await page.evaluate(async () => { window.approvalList = [{ id: 'FIN1', docNo: 'IN-F-1', productName: '白蝦', quantity: 9, approvalStatus: 'pending' }]; await approveInbound(0); });
H.check('畫面是待審核但別人已駁回 → 不能用舊畫面核准', (await H.one('inboundOrders', 'FIN1')).approvalStatus === 'rejected' && dlg(n0).some(m => m.includes('已駁回')), JSON.stringify(dlg(n0)));

// ---------- 即期品：主管核准前不能入帳 ----------
const e1 = await page.evaluate(async () => { try { await postInboundOrderTx('EXP1', 'I-A-02-1F'); return 'posted'; } catch (e) { return e.code; } });
H.check('即期品待主管核准 → 不能入帳', e1 === 'EXPIRY_PENDING', e1);
n0 = log.dialogs.length;
await page.evaluate(async () => { await decideExpiry('EXP1', true); });
H.check('一般人員不能核准即期品', (await H.one('inboundOrders', 'EXP1')).expiryApproval === 'pending' && dlg(n0).some(m => m.includes('主管或管理員')));
const S = await H.openApp(base, USERS.sup);
await S.page.waitForTimeout(1200);
await S.page.evaluate(async () => { await decideExpiry('EXP1', true); });
H.check('主管同意 → 入庫單與手機任務都變成已核准', (await H.one('inboundOrders', 'EXP1')).expiryApproval === 'approved' && (await H.one('inboundTasks', 'TE1')).expiryApproval === 'approved');
const e2 = await page.evaluate(async () => { try { await postInboundOrderTx('EXP1', 'I-A-02-1F'); return 'posted'; } catch (e) { return e.message; } });
H.check('核准後就可以入帳', e2 === 'posted', e2);

// ---------- 取消入庫單 ----------
await page.evaluate(async () => { await cancelInboundOrder('CAN1', '廠商沒送'); });
const c1 = await H.one('inboundOrders', 'CAN1'), t1 = await H.one('inboundTasks', 'TC1');
const e3 = await page.evaluate(async () => { try { await postInboundOrderTx('CAN1', 'I-A-03-1F'); return 'posted'; } catch (e) { return e.code; } });
H.check('取消入庫單：入庫單與手機任務都取消，之後不能入帳', c1.status === 'cancelled' && t1.status === 'cancelled' && e3 === 'ORDER_CANCELLED', JSON.stringify([c1.status, t1.status, e3]));

// ---------- 改已入帳的入庫單：庫存一起調整 ----------
await page.evaluate(async () => {
  const set = (id, v) => { let el = document.getElementById(id); if (!el) { el = document.createElement('input'); el.id = id; document.body.appendChild(el); } el.value = v; };
  set('edit-order-id', 'POSTED'); set('edit-name', '干貝'); set('edit-qty', '18'); set('edit-exp', '2027-01-01'); set('edit-spec', 'S'); set('edit-batch', 'G1'); set('edit-vendor', ''); set('edit-loc', '');
  window.closeEditInboundModal = function() {};
  await submitEditAndReapprove();
});
const pd = await H.one('pallets', 'PDOC'), po = await H.one('inboundOrders', 'POSTED');
const adj = (await H.all('inventoryLogs')).find(l => l.type === 'adjust' && String(l.note).includes('IN-X-1'));
H.check('已入帳的單數量 20 → 18：那一板也 20 → 18，寫調整記錄', pd.quantity === 18 && po.quantity === 18 && adj && adj.quantityChange === -2, JSON.stringify([pd.quantity, po.quantity, adj && adj.quantityChange]));

// ---------- 外倉刪除寫記錄 ----------
await page.evaluate(async () => { window.externalStock = [{ id: 'X1', warehouseId: 'EXT-TP', productName: '蝦仁', quantity: 7 }]; window.loadExternalStock = async function() {}; await deleteExternalStock('X1'); });
const xl = (await H.all('inventoryLogs')).find(l => String(l.note).includes('外倉庫存刪除'));
H.check('刪除外倉庫存：寫一筆調整記錄（-7）', !(await H.one('externalStock', 'X1')) && xl && xl.quantityChange === -7, JSON.stringify(xl));

// ---------- 作業看板：用自己的資料，不動共用清單 ----------
const wb = await page.evaluate(async () => {
  window._waveData.waves = [{ waveNo: 'KEEP' }]; window.transferList = [{ keep: 1 }];
  await loadWorkBoardData(); refreshWorkBoard();
  return { waves: window._waveData.waves.length, transfers: window.transferList.length, tasks: document.getElementById('board-pending-count').innerText };
});
H.check('作業看板：顯示待上架任務，不會蓋掉波次頁與調撥頁的清單', wb.waves === 1 && wb.transfers === 1 && Number(wb.tasks) >= 1, JSON.stringify(wb));

// ---------- 留置與一般的貨不能合併 ----------
const mg = await page.evaluate(async () => { try { await mergePalletsTx(db.collection('pallets').doc('QC1'), db.collection('pallets').doc('A1')); return 'merged'; } catch (e) { return e.message; } });
H.check('品管留置的板不能併進一般的板', mg.includes('留置區'), mg);

// ---------- 手機 ----------
const M = await H.openApp(base, USERS.op, { mobile: true });
await M.page.waitForTimeout(1500);
const mOut = await M.page.evaluate(() => { const p = window.pallets.find(x => x.id === 'QC1'); outSetPallet(p); return document.getElementById('out-result').innerText; });
H.check('手機出庫：品管留置的板擋下', mOut.includes('不能出庫'), mOut);
await M.page.evaluate(async () => {
  const p = window.pallets.find(x => x.id === 'ST1'); stSetPallet(p);
  document.getElementById('st-qty').value = '7'; document.getElementById('st-loc').value = 'ib052';
  await submitStocktakeItem();
});
await M.page.waitForTimeout(800);
const st = await H.one('pallets', 'ST1');
H.check('手機盤點：實盤 7、實際在 IB052 → 數量與位置一起更正', st.quantity === 7 && st.locationId === 'I-B-05-2F', JSON.stringify(st));
const sh = await M.page.evaluate(async () => {
  document.getElementById('shelve-loc').value = 'IA041'; shelveScanLoc();
  const p = window.pallets.find(x => x.id === 'SH1'); shelveSetPallet(p);
  document.getElementById('shelve-qty').value = '0';
  await confirmShelve();
  return document.getElementById('shelve-result').innerText;
});
await M.page.waitForTimeout(800);
H.check('手機上架點數 0 件 → 這板刪除（不會留下 0 件的空板）', !(await H.one('pallets', 'SH1')), sh);

H.check('沒有頁面錯誤', log.errors.length === 0 && S.log.errors.length === 0 && M.log.errors.length === 0, JSON.stringify(log.errors.concat(S.log.errors, M.log.errors)));
await H.close(); process.exit(0);
