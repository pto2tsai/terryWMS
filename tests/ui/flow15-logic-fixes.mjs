// 邏輯修正：揀貨不揀過期／留置、標示公司、不定重品扣重量、外倉入庫不重複入帳、財務駁回／重新送審、舊資料修正
import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';

const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
const past = '2020-01-01';
await H.resetData(async d => { await baseSeed(d);
  const P = (id, o) => H.setDoc(H.doc(d, 'pallets', id), Object.assign({ palletId: id, productName: '白蝦', spec: '50/60', company: '崇文' }, o));
  await P('EXP', { quantity: 10, locationId: 'I-A-01-1F', expiryDate: past });                // 過期
  await P('QC', { quantity: 10, locationId: 'V-QC', expiryDate: '2027-01-01' });               // 品管留置
  await P('OK1', { quantity: 4, locationId: 'I-A-02-1F', expiryDate: '2027-02-01' });
  await P('BF1', { quantity: 3, locationId: 'I-A-03-1F', expiryDate: '2027-03-01', company: '八方' });   // 另一家公司，可以調用
  await P('VW', { productName: '鮭魚', spec: '整尾', quantity: 10, totalWeight: 52.4, locationId: 'J-C-01-1F', expiryDate: '2027-01-01' });   // 不定重品
  await H.setDoc(H.doc(d, 'waves', 'W1'), { waveNo: 'W1', status: 'pending', summary: [{ productName: '白蝦', spec: '50/60', totalQty: 10, orders: [] }] });
  // 舊資料：卡住的重新送審單（已入帳／未入帳各一）、停在待執行的外倉入庫單
  await H.setDoc(H.doc(d, 'inboundOrders', 'STUCK1'), { docNo: 'IN-OLD-1', productName: '白蝦', quantity: 5, status: 'pending_approval', approvalStatus: 'rejected' });
  await P('IN-OLD-1', { productName: '干貝', spec: 'S', quantity: 5, locationId: 'I-B-01-1F', expiryDate: '2027-01-01' });
  await H.setDoc(H.doc(d, 'inboundOrders', 'STUCK2'), { docNo: 'IN-OLD-2', productName: '白蝦', quantity: 6, status: 'pending_approval', approvalStatus: 'rejected' });
  await H.setDoc(H.doc(d, 'inboundOrders', 'EXTOLD'), { docNo: 'IN-OLD-3', productName: '透抽', quantity: 7, status: 'pending', isExternal: true, warehouseId: 'EXT-TP' });
  // 已入帳、待財務核准的採購單
  await H.setDoc(H.doc(d, 'inboundOrders', 'RAW1'), { docNo: 'IN-RAW-1', productName: '白蝦', spec: '50/60', quantity: 8, batchNo: 'R1', status: 'completed', locationId: 'I-B-02-1F', approvalStatus: 'pending', type: 'Raw' });
});

// ---------- 揀貨清單 ----------
const OP = await H.openApp(base, USERS.op);
const list = await OP.page.evaluate(async () => {
  const w = (await db.collection('waves').doc('W1').get()).data(); w.id = 'W1';
  return buildWavePickingList(w, currentPallets()).map(i => ({ p: i.palletId, q: i.pickQty, c: i.company, s: !!i.shortage, n: i.note || '' }));
});
H.note('揀貨清單: ' + JSON.stringify(list));
H.check('過期板、品管留置板不揀', !list.some(i => i.p === 'EXP' || i.p === 'QC'), JSON.stringify(list));
H.check('可以調用八方的貨，且標示公司', list.some(i => i.p === 'BF1' && i.c === '八方' && i.q === 3) && list.some(i => i.p === 'OK1' && i.c === '崇文'), JSON.stringify(list));
const sh = list.find(i => i.s);
H.check('不足 3 件記為缺貨，並註明有過期／留置的貨沒揀', sh && sh.q === 3 && sh.n.includes('過期 10') && sh.n.includes('留置／保留 10'), JSON.stringify(sh));

// ---------- 不定重品：出庫扣重量 ----------
await OP.page.evaluate(async () => {
  const ref = db.collection('pallets').doc('VW');
  await runStockTransaction({ changes: [{ ref, delta: -4, deleteWhenEmpty: true }], logs: () => [{ type: 'outbound', productName: '鮭魚', quantity: 4, quantityChange: -4 }] });
});
const vw = await H.one('pallets', 'VW');
H.check('不定重品出 4／10：總重 52.4 → 31.4', vw.quantity === 6 && vw.totalWeight === 31.4, JSON.stringify([vw.quantity, vw.totalWeight]));

// ---------- 外倉入庫單不能再入帳到本倉 ----------
const extErr = await OP.page.evaluate(async () => { try { await postInboundOrderTx('EXTOLD', 'TEMP-IN'); return 'posted'; } catch (e) { return e.code; } });
H.check('舊的外倉入庫單不能入帳到本倉（避免重複計算）', extErr === 'EXTERNAL_ORDER', extErr);
await H.nav(OP.page, 'unified-inbound');
await OP.page.click("button[onclick=\"showPendingInbounds()\"]", { force: true }); await OP.page.waitForTimeout(2000);
const pendingIds = await OP.page.evaluate(() => (window.pendingInbounds || []).map(o => o.id));
H.check('待執行入庫單清單不含外倉入庫單', !pendingIds.includes('EXTOLD'), JSON.stringify(pendingIds));
await OP.page.evaluate(() => { const m = document.getElementById('pending-inbound-modal'); if (m) m.classList.add('hidden'); });

// ---------- 財務駁回已入帳的單 → 提醒；重新送審 → 回到待核准 ----------
const SUP = await H.openApp(base, USERS.sup);
await SUP.page.evaluate(async () => {
  document.getElementById('reject-order-id').value = 'RAW1';
  document.getElementById('reject-reason').value = '數量不對，應為 6';
  await confirmReject();
});
H.check('駁回已入帳的單：提醒庫存要另外調整', H.lastDialog(SUP.log).includes('已經入帳'), H.lastDialog(SUP.log));
await OP.page.evaluate(async () => {
  document.getElementById('edit-order-id').value = 'RAW1';
  document.getElementById('edit-name').value = '白蝦'; document.getElementById('edit-spec').value = '50/60';
  document.getElementById('edit-qty').value = '6'; document.getElementById('edit-batch').value = 'R1';
  document.getElementById('edit-exp').value = '2027-01-01'; document.getElementById('edit-loc').value = 'X';
  document.getElementById('edit-vendor').value = '';
  await submitEditAndReapprove();
});
const raw1 = await H.one('inboundOrders', 'RAW1');
H.check('重新送審：回到財務待核准、入帳狀態與儲位不變', raw1.approvalStatus === 'pending' && raw1.status === 'completed' && raw1.locationId === 'I-B-02-1F' && raw1.quantity === 6, JSON.stringify(raw1));
H.check('重新送審已入帳的單：提醒去調整庫存', H.lastDialog(OP.log).includes('不會改動庫存'), H.lastDialog(OP.log));

// ---------- 舊資料修正（系統維護 → 資料格式統一）----------
const AD = await H.openApp(base, USERS.admin);
const rep = await AD.page.evaluate(async () => migrateDataFormats(false));
const s1 = await H.one('inboundOrders', 'STUCK1'), s2 = await H.one('inboundOrders', 'STUCK2'), e3 = await H.one('inboundOrders', 'EXTOLD');
H.check('卡住的重新送審單：回到待核准；已入帳的標記完成、未入帳的回到待執行', s1.approvalStatus === 'pending' && s1.status === 'completed' && s2.approvalStatus === 'pending' && s2.status === 'pending', JSON.stringify([s1, s2].map(o => [o.status, o.approvalStatus])));
H.check('停在待執行的外倉入庫單標記完成', e3.status === 'completed' && rep.orderFixes === 3, JSON.stringify([e3.status, rep.orderFixes]));

H.check('沒有頁面錯誤', [OP, SUP, AD].every(x => x.log.errors.length === 0), JSON.stringify([OP, SUP, AD].map(x => x.log.errors)));
await H.close(); process.exit(0);
