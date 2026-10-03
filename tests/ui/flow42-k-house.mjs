// K 庫（另一棟）也用手機揀貨：K 開頭儲位的貨只叫 K 庫的手機拿；I、J 庫的手機看不到
// 還不知道在哪一間的貨一件都沒有：問「在哪一間？」（J／I／K／都沒有）；現場看板分倉庫算
import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';
const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
await H.resetData(async d => { await baseSeed(d);
  const P = (id, o) => H.setDoc(H.doc(d, 'pallets', id), Object.assign({ palletId: id, company: '崇文', palletCapacity: 40, expiryDate: '2027-06-01' }, o));
  await P('P1', { productName: '白蝦', spec: '50/60', quantity: 40, locationId: 'I-A-01-1F' });
  await P('P3', { productName: '生凍龍蝦', spec: '29隻', quantity: 20, locationId: 'K-E-01-1F' });
  const it = (n, sp, q, no, c) => ({ productName: n, spec: sp, totalQty: q, orders: [{ orderId: no, orderNo: no, customer: c, quantity: q }] });
  await H.setDoc(H.doc(d, 'waves', 'w1'), { waveNo: 'W1003-03', logistics: '黑貓宅急便', status: 'pending', createdAt: new Date().toISOString(), orderCount: 2, totalQty: 13, itemCount: 2,
    summary: [it('白蝦', '50/60', 10, 'S-1', '海霸王'), it('生凍龍蝦', '29隻', 3, 'S-2', '好市多')], orders: [{ id: 'S-1', orderNo: 'S-1', customer: '海霸王' }, { id: 'S-2', orderNo: 'S-2', customer: '好市多' }] });
});
const K = await H.openApp(base, USERS.op2, { mobile: true, house: 'K' }); const kp = K.page;
const J = await H.openApp(base, USERS.op, { mobile: true, house: 'J' }); const jp = J.page;
await kp.waitForTimeout(2000); await jp.waitForTimeout(2000);
for (const p of [kp, jp]) { await p.evaluate(() => openPage('picking')); await p.waitForTimeout(2500); }
const kTxt = await kp.textContent('#picking-next'), jTxt = await jp.textContent('#picking-next');
H.check('K 庫的手機：只叫拿龍蝦（K-E-01-1F），上面寫 K庫', kTxt.includes('生凍龍蝦') && !kTxt.includes('白蝦') && kTxt.includes('K庫'), kTxt.slice(0, 300));
H.check('J 庫的手機：只叫拿白蝦，看不到 K 庫的龍蝦', jTxt.includes('白蝦') && !jTxt.includes('生凍龍蝦'), jTxt.slice(0, 300));
// 選「你在哪一間」有 K庫
await jp.evaluate(() => { localStorage.removeItem('wms_pick_house'); renderPickingList(); });
await jp.evaluate(() => loadPickingWave && loadPickingWave()); await jp.waitForTimeout(1200);
const chooser = await jp.textContent('#picking-next');
H.check('「你在哪一間？」有 J庫、I庫、K庫', chooser.includes('J庫') && chooser.includes('I庫') && chooser.includes('K庫'), chooser.slice(0, 200));
await jp.evaluate(() => chooseHouse('J')); await jp.waitForTimeout(800);
// 還不知道在哪一間的貨（練習模式沒有儲位）：一件都沒有 → 問在哪一間
await H.admin(async d => H.setDoc(H.doc(d, 'settings', 'practice'), { enabled: true }));
await jp.waitForTimeout(1500);
// K 庫（另一棟）一件都沒有：問「在哪一間？」（J庫、I庫、都沒有）
await kp.waitForTimeout(500);
await kp.evaluate(() => { const n = pickingItems.find(i => !i.completed && i.productName === '白蝦'); window._shortItem = n; });
await kp.evaluate(() => pickShortNumber(0)); await kp.waitForTimeout(800);
const where = await kp.textContent('#picking-next');
H.check('K 庫練習模式一件都沒有：問「這間沒有，在哪一間？」（J庫、I庫、都沒有）', where.includes('這間沒有，在哪一間？') && where.includes('J庫') && where.includes('I庫') && where.includes('都沒有（缺貨）'), where.slice(0, 300));
await kp.click('#picking-next .pk-card button:has-text("I庫")'); await kp.waitForTimeout(1500);
const home = await H.one('productHome', encodeURIComponent('白蝦|||50/60'));
H.check('點「I庫」：記起來白蝦在 I 庫，交給 I 庫的人（不算缺貨）', home && home.house === 'I' && !((await H.one('waves', 'w1')).shortLog || []).length, JSON.stringify(home));
// J 庫（同一棟）一件都沒有：照舊直接交給隔壁 I 庫，不用問
await jp.evaluate(() => { const n = pickingItems.find(i => !i.completed && i.productName === '生凍龍蝦'); window._shortItem = n; });
await jp.evaluate(() => pickShortNumber(0)); await jp.waitForTimeout(1500);
const home2 = await H.one('productHome', encodeURIComponent('生凍龍蝦|||29隻'));
H.check('J 庫一件都沒有：直接交給隔壁 I 庫（不用問）', home2 && home2.house === 'I' && !(await jp.textContent('#picking-next')).includes('在哪一間？'), JSON.stringify(home2));
H.check('沒有頁面錯誤', K.log.errors.length === 0 && J.log.errors.length === 0, JSON.stringify(K.log.errors.concat(J.log.errors)));
await H.close(); process.exit(0);
