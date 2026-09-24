// 寄倉：波次保留、提貨＝出倉；倉租：寄倉依每天實際件數、自有庫存依每日板數快照
import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';

const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
const today = new Date(); const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
// 倉租計費期間：上月 26 日 ～ 本月 25 日（今天還沒到 25 日就算到今天）
const pStart = new Date(today.getFullYear(), today.getMonth() - 1, 26);
const pEnd = new Date(Math.min(new Date(today.getFullYear(), today.getMonth(), 25).getTime(), today.getTime()));
const days = Math.floor((new Date(pEnd.getFullYear(), pEnd.getMonth(), pEnd.getDate()) - pStart) / 86400000) + 1;
await H.resetData(async d => { await baseSeed(d);
  await H.setDoc(H.doc(d, 'pallets', 'C1'), { palletId: 'C1', productName: '白蝦', spec: '50/60', batchNo: 'B1', company: '崇文', quantity: 20, locationId: 'I-A-01-1F', expiryDate: '2027-01-01' });
  await H.setDoc(H.doc(d, 'pallets', 'C2'), { palletId: 'C2', productName: '透抽', spec: 'L', company: '八方', quantity: 9, locationId: 'J-C-01-1F', expiryDate: '2027-01-01' });
  // 客戶已買下 15 件白蝦寄放在 I-A-01-1F
  await H.setDoc(H.doc(d, 'consignments', 'K1'), { customer: '海霸王', source: 'internal', locationId: 'I-A-01-1F', productName: '白蝦', spec: '50/60', batchNo: 'B1',
    originalQty: 15, remainingQty: 15, status: 'active', pickups: [], freeUntil: '2020-01-01', chargeStartDate: '2020-01-02', ratePerUnit: 1, consignmentDate: '2019-12-01' });
  await H.setDoc(H.doc(d, 'waves', 'W1'), { waveNo: 'W1', status: 'pending', summary: [{ productName: '白蝦', spec: '50/60', totalQty: 10, orders: [] }] });
  // 每日板數：期間內除了今天，每天崇文 5 板、八方 2 板
  for (let t = new Date(pStart); ymd(t) < ymd(today) && t <= pEnd; t.setDate(t.getDate() + 1))
    await H.setDoc(H.doc(d, 'stockSnapshots', ymd(t)), { date: ymd(t), pallets: { '崇文': 5, '八方': 2 } });
});
const { page, log } = await H.openApp(base, USERS.op);
await page.waitForTimeout(1500);

// ---------- 每日板數快照 ----------
const snapToday = await H.one('stockSnapshots', ymd(today));
H.check('登入後記錄今天的板數（崇文 1、八方 1）', snapToday && snapToday.pallets['崇文'] === 1 && snapToday.pallets['八方'] === 1, JSON.stringify(snapToday));

// ---------- 寄倉保留：波次不揀已賣給客戶的件數 ----------
const list = await page.evaluate(async () => {
  const w = (await db.collection('waves').doc('W1').get()).data(); w.id = 'W1';
  return buildWavePickingList(w, currentPallets()).map(i => ({ p: i.palletId, q: i.pickQty, s: !!i.shortage, n: i.note || '' }));
});
H.note('揀貨清單: ' + JSON.stringify(list));
H.check('20 件中 15 件寄倉保留 → 只揀 5 件，缺 5 件並註明寄倉保留', list.some(i => i.p === 'C1' && i.q === 5) && list.some(i => i.s && i.q === 5 && i.n.includes('寄倉保留 15')), JSON.stringify(list));

// ---------- 提貨＝出倉 ----------
await page.evaluate(() => { window.consignmentData = window.consignmentData || []; });
await page.evaluate(async () => { await loadConsignmentsFromFirebase(); });
await page.evaluate(() => {
  const div = document.createElement('div'); div.innerHTML = '<input id="pickup-date" value="' + new Date().toLocalYMD() + '"><input id="pickup-qty" value="8">'; document.body.appendChild(div);
});
const nD = log.dialogs.length;
await page.evaluate(async () => { await savePickup('K1'); });
await page.waitForTimeout(800);
const c1 = await H.one('pallets', 'C1'), k1 = await H.one('consignments', 'K1');
const lg = (await H.all('inventoryLogs')).find(l => String(l.note).includes('寄倉提貨'));
H.check('提貨確認訊息寫出從哪一板扣幾件', log.dialogs.slice(nD).some(d => d.msg.includes('I-A-01-1F 8 件') && d.msg.includes('扣庫存')), JSON.stringify(log.dialogs.slice(nD).map(d => d.msg.slice(0, 120))));
H.check('提貨 8 件：C1 20 → 12、寄倉剩 7、寫出庫記錄', c1.quantity === 12 && k1.remainingQty === 7 && (k1.pickups || []).length === 1 && lg && lg.quantityChange === -8, JSON.stringify([c1.quantity, k1.remainingQty, lg && lg.quantityChange]));
const nD2 = log.dialogs.length;
await page.evaluate(() => { document.getElementById('pickup-qty').value = '9'; });
await page.evaluate(async () => { await savePickup('K1'); });
H.check('提貨超過寄倉剩餘件數會擋下', log.dialogs.slice(nD2).some(d => d.msg.includes('不能超過剩餘 7')) && (await H.one('pallets', 'C1')).quantity === 12);

// ---------- 寄倉倉租：每天依當天剩餘件數 ----------
const ud = await page.evaluate(() => [
  consignUnitDays({ originalQty: 10, remainingQty: 6, pickups: [{ date: '2026-09-06', qty: 4 }] }, new Date(2026, 8, 1), new Date(2026, 8, 10)),
  consignUnitDays({ originalQty: 10, remainingQty: 0, status: 'completed', pickups: [{ date: '2026-09-05', qty: 10 }] }, new Date(2026, 8, 1), new Date(2026, 8, 30))
]);
H.check('月中提 4 件：前 6 天 10 件、後 4 天 6 件 → 84 件天（提貨當天仍計費）', ud[0].unitDays === 84 && ud[0].days === 10, JSON.stringify(ud[0]));
H.check('當月提完的寄倉：提貨前 5 天 × 10 件 → 50 件天（原本整個月都不收）', ud[1].unitDays === 50 && ud[1].days === 5, JSON.stringify(ud[1]));

// ---------- 自有庫存倉租：每日板數加總 ----------
await H.nav(page, 'rental-report'); await page.waitForTimeout(800);
await page.evaluate(m => { document.getElementById('rental-month').value = m; }, today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0'));
await page.evaluate(async () => { await loadRentalReport(); }); await page.waitForTimeout(800);
const own = await page.evaluate(() => window._rentalReportData.ownStock);
const expectCW = 5 * (days - 1) + 1, expectBF = 2 * (days - 1) + 1;
H.note('期間 ' + ymd(pStart) + '～' + ymd(pEnd) + ' 共 ' + days + ' 天；自有庫存 ' + JSON.stringify(own));
H.check('崇文板天＝每天實際板數加總（不是今天的板數 × 天數）', own['崇文'].palletDays === expectCW && own['八方'].palletDays === expectBF, JSON.stringify(own) + ' 預期 ' + expectCW + '/' + expectBF);
H.check('沒有缺快照的日子就不標示估算', !(await page.innerText('#own-stock-rental-body')).includes('估算'));

H.check('沒有頁面錯誤', log.errors.length === 0, JSON.stringify(log.errors));
await H.close(); process.exit(0);
