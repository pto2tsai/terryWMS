// 第二關核對：揀完直接進「分貨・核對」，一張單一張單對；對了按「這張對了」，不對按「有不對」改件數送業務看板
// 對好、鼎新也對的單出現在業務看板「可以印給司機」，辦公室從鼎新印三聯、按「印好了」；現場看板顯示待核對幾張
import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';
import { pushReport } from './erp-gs.mjs';
const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
await H.resetData(async d => { await baseSeed(d);
  const P = (id, o) => H.setDoc(H.doc(d, 'pallets', id), Object.assign({ palletId: id, company: '崇文', palletCapacity: 40, expiryDate: '2027-06-01' }, o));
  await P('P1', { productName: '白蝦', spec: '50/60', quantity: 20, locationId: 'I-A-01-1F' });
  await P('P3', { productName: '透抽', spec: 'L', quantity: 30, locationId: 'I-B-01-1F' });
});
const HEAD = ['銷貨日期', '銷貨單號', '客戶全名', '品名', '規格', '銷貨數量', '單位', '備註'];
const D = await H.openApp(base, USERS.op);
const S = await H.openApp(base, USERS.sup); const sp = S.page;
const M = await H.openApp(base, USERS.op2, { mobile: true }); const mp = M.page;
await D.page.waitForTimeout(1500); await mp.waitForTimeout(1500);
await sp.evaluate(() => { window.Notification = function() { this.close = function() {}; }; window.Notification.permission = 'granted'; });
await sp.evaluate(() => switchTab('sales-board'));
const r = await pushReport('每日客戶銷貨明細表_0900.xlsx', [HEAD, ['2026/10/01', 'S-1', '海霸王', '白蝦', '50/60', 2, '件', '黑貓'], ['2026/10/01', 'S-2', '好市多', '白蝦', '50/60', 1, '件', '黑貓'], ['2026/10/01', 'S-2', '', '透抽', 'L', 2, '件', '']]);
for (let i = 0; i < 30; i++) { await D.page.waitForTimeout(500); const x = await H.one('erpInbox', r.id); if (x && ['done', 'attention', 'error'].includes(x.status)) break; }
await mp.evaluate(() => openPage('picking')); await mp.waitForTimeout(2000);
const card = async () => (await mp.textContent('#picking-next')) || '';
for (let i = 0; i < 4 && await mp.$('#picking-next .pk-take'); i++) { await mp.click('#picking-next .pk-take'); await mp.waitForTimeout(1200); }
await mp.click('#picking-next .pk-go'); await mp.waitForTimeout(3000);   // 開始分貨（完成波次）
let c = await card();
H.check('揀完直接進「分貨・核對 0 / 2 張」：海霸王 白蝦 2 件；好市多 白蝦 1 件、透抽 2 件', /分貨・核對\s*0\s*\/ 2 張/.test(c) && /海霸王[\s\S]*白蝦 50\/60\s*2 件[\s\S]*好市多[\s\S]*白蝦 50\/60\s*1 件[\s\S]*透抽 L\s*2 件/.test(c), c.slice(0, 400));
if (process.env.SHOT_DIR) await mp.screenshot({ path: process.env.SHOT_DIR + '/check-1.png' });
// 現場看板：揀完・待核對
const B = await D.ctx.newPage();
await B.goto(base + '/board.html?night=off'); await B.waitForTimeout(3500);
H.check('現場看板：黑貓「揀完・待核對 0/2 張」', (await B.innerText('#l-waves')).includes('揀完・待核對') && (await B.innerText('#l-waves')).includes('0/2 張'), await B.innerText('#l-waves'));
// 海霸王：這張對了
await mp.click('#picking-next .sort-card:not(.ok) button:has-text("這張對了")'); await mp.waitForTimeout(1500);
const so1 = (await H.all('salesOrders')).find(o => o.orderNo === 'S-1');
H.check('海霸王「這張對了」：1 / 2 張，銷貨單標「對了」（小李）', /1\s*\/ 2 張/.test(await card()) && so1.checkStatus === 'ok' && so1.checkedBy === '小李', JSON.stringify(so1));
let pl = '';
for (let i = 0; i < 20 && !pl.includes('海霸王'); i++) { await sp.waitForTimeout(300); pl = (await sp.textContent('#sales-print-list')) || ''; }
H.check('業務看板「可以從鼎新印給司機（1 張）」：黑貓 S-1 海霸王 核對好了', pl.includes('可以從鼎新印給司機（1 張）') && pl.includes('S-1') && pl.includes('海霸王') && pl.includes('核對好了'), pl);
// 好市多：有不對 → 白蝦多 1、透抽少 1 → 多的也給客戶
await mp.click('#picking-next .sort-card:not(.ok) button:has-text("有不對")'); await mp.waitForTimeout(500);
const step = async (row, label) => { const rows = await mp.$$('#picking-next .sort-card.editing .chk-line'); await (await rows[row].$('button[aria-label="' + label + '"]')).click(); await mp.waitForTimeout(300); };
await step(0, '多一件'); await step(1, '少一件');
c = await card();
H.check('有不對：按 ＋／－ 改實際件數（白蝦 2 多 1、透抽 1 少 1），可以選「多的放回架上」或「多的也給客戶」', c.includes('多 1') && c.includes('少 1') && c.includes('多的放回架上') && c.includes('多的也給客戶'), c.slice(0, 500));
if (process.env.SHOT_DIR) { await mp.evaluate(() => document.querySelector('#picking-next .sort-card.editing').scrollIntoView({ block: 'center' })); await mp.screenshot({ path: process.env.SHOT_DIR + '/check-2.png' }); }
await mp.click('#picking-next button:has-text("多的也給客戶")'); await mp.waitForTimeout(2000);
const so2 = (await H.all('salesOrders')).find(o => o.orderNo === 'S-2');
const lines = await D.page.evaluate(o => erpFixLines(o), so2);
H.check('送出：好市多記「白蝦 訂 1 → 出 2（多 1）、透抽 訂 2 → 出 1（少 1）」，要改鼎新', so2.erpFixNeeded === true && so2.checkStatus === 'issue' && lines.some(l => l.includes('白蝦') && l.includes('（多 1）')) && lines.some(l => l.includes('透抽') && l.includes('（少 1）')), JSON.stringify(lines));
c = await card();
H.check('手機：全部對完了（1 張數量不對，已送業務）', c.trim().startsWith('全部對完了') && c.includes('1 張數量不對'), c.slice(0, 200));
let sb = '';
for (let i = 0; i < 20 && !sb.includes('好市多'); i++) { await sp.waitForTimeout(300); sb = (await sp.textContent('#sales-board-list')) || ''; }
H.check('業務看板：好市多「已出貨・等鼎新改」寫第二關核對發現數量不對；還不能印', sb.includes('已出貨・等鼎新改') && sb.includes('第二關核對發現數量不對') && !(await sp.textContent('#sales-print-list')).includes('好市多'), sb.slice(0, 400));
if (process.env.SHOT_DIR) { await sp.setViewportSize({ width: 1440, height: 900 }); await sp.waitForTimeout(500); await sp.screenshot({ path: process.env.SHOT_DIR + '/check-3.png' }); }
// 辦公室印好海霸王
await sp.click('#sales-print-list button:has-text("印好了")'); await sp.waitForTimeout(1200);
H.check('按「印好了」：從清單拿掉（不跳視窗），下面有「復原」', S.log.dialogs.length === 0 && (await H.all('salesOrders')).find(o => o.orderNo === 'S-1').checkStatus === 'printed' && await sp.isVisible('#sb-undo'));
// 業務在鼎新改好、匯入後（erpFixNeeded 變 false）→ 好市多可以重印
await H.admin(async d => H.setDoc(H.doc(d, 'salesOrders', so2._id), { erpFixNeeded: false }, { merge: true }));
pl = '';
for (let i = 0; i < 20 && !pl.includes('好市多'); i++) { await sp.waitForTimeout(300); pl = (await sp.textContent('#sales-print-list')) || ''; }
H.check('鼎新改好了：好市多出現在「可以印給司機」，寫「鼎新改好了・重印」', pl.includes('好市多') && pl.includes('鼎新改好了・重印'), pl);
await B.waitForTimeout(1500);
H.check('現場看板：對完了，黑貓不再顯示待核對', !(await B.innerText('#l-waves')).includes('待核對'), await B.innerText('#l-waves'));
H.check('沒有頁面錯誤', S.log.errors.length === 0 && M.log.errors.length === 0 && D.log.errors.length === 0, JSON.stringify(S.log.errors.concat(M.log.errors, D.log.errors)));
await H.close(); process.exit(0);
