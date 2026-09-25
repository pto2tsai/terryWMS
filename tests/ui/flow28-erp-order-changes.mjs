// 鼎新改單（每天都會發生）：現場照手機做就好，不用想
//   揀到一半：少的補揀、多拿的列「放回」，放回才能完成；庫存照實際（揀的－放回的）扣
//   已出貨：加量自動變補出貨、排下一個波次；減量提醒開銷退
//   有印紙本的：波次清單標「揀貨單要重印」，印了就消失
import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';
import { pushReport } from './erp-gs.mjs';
const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
await H.resetData(async d => { await baseSeed(d);
  const P = (id, o) => H.setDoc(H.doc(d, 'pallets', id), Object.assign({ palletId: id, company: '崇文', palletCapacity: 40, expiryDate: '2027-06-01' }, o));
  await P('P1', { productName: '白蝦', spec: '50/60', quantity: 20, locationId: 'I-A-01-1F', expiryDate: '2027-01-01' });
  await P('P2', { productName: '白蝦', spec: '50/60', quantity: 20, locationId: 'I-A-02-1F', expiryDate: '2027-05-01' });
  await P('P3', { productName: '透抽', spec: 'L', quantity: 30, locationId: 'I-B-01-1F' });
});
const HEAD = ['銷貨日期', '銷貨單號', '客戶全名', '品名', '規格', '銷貨數量', '單位', '備註'];
const file = lines => [HEAD].concat(lines.map(([no, name, spec, q]) => ['2026/09/25', no, '客戶' + no, name, spec, q, '件', '黑貓']));
const waitInbox = async (pg, id) => { let r; for (let i = 0; i < 30; i++) { await pg.waitForTimeout(500); r = await H.one('erpInbox', id); if (r && ['done', 'attention', 'error'].includes(r.status)) break; } return r; };

const D = await H.openApp(base, USERS.op);          // 辦公室電腦（自動匯入）
const M = await H.openApp(base, USERS.op2, { mobile: true });   // 揀貨員的手機
await D.page.waitForTimeout(1500); await M.page.waitForTimeout(1500);
const mp = M.page;
const scan = async v => { await mp.fill('#picking-scan', v); await mp.press('#picking-scan', 'Enter'); await mp.waitForTimeout(800); };
const next = () => mp.innerText('#picking-next');

// ---------- 9:00 訂單進來，建好波次，手機開始揀 ----------
let r = await pushReport('每日客戶銷貨明細表_0900.xlsx', file([['A-1', '白蝦', '50/60', 10], ['A-2', '透抽', 'L', 6]]));
await waitInbox(D.page, r.id);
const W = (await H.all('waves'))[0];
H.check('9:00 訂單自動建好黑貓波次（白蝦 10、透抽 6）', W && W.totalQty === 16, JSON.stringify(W && [W.waveNo, W.totalQty]));
await mp.evaluate(() => openPage('picking')); await mp.waitForTimeout(400);
await mp.selectOption('#picking-wave-select', W.waveNo); await mp.waitForTimeout(1000);
await scan('P1'); await scan('P3');
const w1 = await H.one('waves', W.waveNo);
H.check('手機揀了白蝦 10（P1）、透抽 6（P3）：記下實際揀了幾件', (w1.pickLog || []).length === 2 && w1.pickLog.some(e => e.palletId === 'P1' && e.qty === 10) && w1.pickLog.some(e => e.palletId === 'P3' && e.qty === 6), JSON.stringify(w1.pickLog));

// ---------- 11:00 鼎新改單：白蝦 10→7、透抽 6→9 ----------
r = await pushReport('每日客戶銷貨明細表_1100.xlsx', file([['A-1', '白蝦', '50/60', 7], ['A-2', '透抽', 'L', 9]]));
const in2 = await waitInbox(D.page, r.id);
await mp.waitForTimeout(1500);
const n1 = await next();
const items = await mp.evaluate(() => pickingItems.filter(i => !i.completed).map(i => [i.type || 'pick', i.productName, i.pickQty, i.locationId]));
H.check('手機清單自動調整：多拿的白蝦「放回 3 件 → I-A-01-1F」排最上面；透抽「再揀 3 件」', JSON.stringify(items) === JSON.stringify([['return', '白蝦', 3, 'I-A-01-1F'], ['pick', '透抽', 3, 'I-B-01-1F']]), JSON.stringify(items));
H.check('手機上方藍色提醒：鼎新改了什麼、清單已自動調整，照清單做就好', n1.includes('鼎新改了') && n1.includes('10→7') && n1.includes('照清單做就好') && n1.includes('放回 3 件'), n1.slice(0, 300));
H.check('自動處理好的不算「要處理」（收件紀錄是完成，結果寫著已自動調整）', in2.status === 'done' && in2.result.includes('已自動調整'), JSON.stringify([in2.status, in2.result, in2.issues]));

await H.nav(D.page, 'wave-picking'); await D.page.waitForTimeout(1500);
H.check('電腦的波次清單標出「揀貨單要重印」', (await D.page.innerText('#wave-list-body')).includes('揀貨單要重印'));

// ---------- 還沒放回就按完成：擋下 ----------
let dlg0 = M.log.dialogs.length;
M.page.__dialogPlan = [true];
await mp.evaluate(async () => { await completePickingWave(); }); await mp.waitForTimeout(800);
H.check('還沒放回就按完成：擋下，告訴你要放回什麼、放哪裡', M.log.dialogs.slice(dlg0).some(x => x.msg.includes('要放回') && x.msg.includes('I-A-01-1F')) && (await H.one('waves', W.waveNo)).status !== 'done', JSON.stringify(M.log.dialogs.slice(dlg0).map(x => x.msg.slice(0, 100))));

// ---------- 放回、補揀、完成 ----------
await scan('P1');
H.check('掃 P1 放回：顯示「已放回」', (await mp.innerText('#picking-scan-result')).includes('已放回'), await mp.innerText('#picking-scan-result'));
await scan('P3');
dlg0 = M.log.dialogs.length;
M.page.__dialogPlan = [true, true];
await mp.evaluate(async () => { await completePickingWave(); }); await mp.waitForTimeout(2000);
const pal = Object.fromEntries((await H.all('pallets')).map(p => [p._id, p]));
const so = Object.fromEntries((await H.all('salesOrders')).map(o => [o.orderNo, o]));
H.check('完成：庫存照實際扣（P1 20→13、P3 30→21、P2 沒動）', pal.P1.quantity === 13 && pal.P3.quantity === 21 && pal.P2.quantity === 20, JSON.stringify([pal.P1 && pal.P1.quantity, pal.P3 && pal.P3.quantity, pal.P2 && pal.P2.quantity, M.log.dialogs.slice(dlg0).map(x => x.msg.slice(0, 80))]));
H.check('兩張單都照鼎新的新數量出貨完成（白蝦 7、透抽 9）', so['A-1'].status === 'shipped' && so['A-2'].status === 'shipped', JSON.stringify([so['A-1'].status, so['A-2'].status]));
const logs = (await H.all('inventoryLogs')).filter(l => (l.note || '').includes(W.waveNo));
H.check('異動記錄：每一板一筆，件數是實際出去的（白蝦 7、透抽 9）', logs.length === 2 && logs.some(l => l.palletId === 'P1' && l.quantityChange === -7) && logs.some(l => l.palletId === 'P3' && l.quantityChange === -9), JSON.stringify(logs.map(l => [l.palletId, l.quantityChange])));

// ---------- 13:00 出貨後鼎新又改：A-1 白蝦 7→9（加）、A-2 透抽 9→5（減）----------
r = await pushReport('每日客戶銷貨明細表_1300.xlsx', file([['A-1', '白蝦', '50/60', 9], ['A-2', '透抽', 'L', 5]]));
const in3 = await waitInbox(D.page, r.id);
const so2 = Object.fromEntries((await H.all('salesOrders')).map(o => [o.orderNo, o]));
const newWave = (await H.all('waves')).find(w => w.waveNo !== W.waveNo);
H.check('出貨後加量：多的 2 件自動變補出貨，排進新的波次', newWave && (newWave.orders || []).some(o => o.orderNo === 'A-1') && newWave.totalQty === 2 && so2['A-1'].waveNo === newWave.waveNo, JSON.stringify([newWave && newWave.totalQty, so2['A-1'].status, so2['A-1'].backorderItems]));
H.check('出貨後減量：提醒「已經多出貨了，請在鼎新開銷退：透抽 多出 4 件」', in3.status === 'attention' && in3.issues.some(x => x.includes('開銷退') && x.includes('A-2') && x.includes('多出 4 件')), JSON.stringify([in3.status, in3.issues]));

H.check('沒有頁面錯誤', D.log.errors.length === 0 && M.log.errors.length === 0, JSON.stringify(D.log.errors.concat(M.log.errors)));
await H.close(); process.exit(0);
