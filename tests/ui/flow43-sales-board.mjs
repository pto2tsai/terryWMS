// 業務看板：現場按「不夠」當下就出現在業務電腦（會響、跳 Windows 通知、選單上有數字）
// 業務按「我來處理」→ 回覆現場 → 手機、現場看板馬上看到；已出貨等鼎新改的也在這裡，按「已經改好了」可以復原
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
const S = await H.openApp(base, USERS.sup); const sp = S.page;   // 業務（主管）的電腦
const M = await H.openApp(base, USERS.op2, { mobile: true }); const mp = M.page;
await D.page.waitForTimeout(1500); await mp.waitForTimeout(1500);
// 業務電腦：允許 Windows 通知（這裡記下跳了什麼）、打開業務看板
await sp.evaluate(() => { window._notes = []; window.Notification = function(t, o) { window._notes.push(t + '｜' + o.body); this.close = function() {}; }; window.Notification.permission = 'granted'; window.Notification.requestPermission = () => Promise.resolve('granted'); });
await sp.evaluate(() => switchTab('sales-board')); await sp.waitForTimeout(800);
let sb = await sp.textContent('#sales-board-list');
H.check('業務看板一開始：目前沒有要處理的', sb.includes('目前沒有要處理的'), sb.slice(0, 200));
H.check('電腦預設會響、跳通知（系統的聲音一律預設開著）', (await sp.textContent('#sales-board-notify')).includes('這台電腦會響、跳通知'));
const r = await pushReport('每日客戶銷貨明細表_0900.xlsx', [HEAD, ['2026/10/01', 'S-1', '海霸王', '白蝦', '50/60', 2, '件', '黑貓'], ['2026/10/01', 'S-2', '好市多', '白蝦', '50/60', 1, '件', '黑貓'], ['2026/10/01', 'S-2', '', '透抽', 'L', 2, '件', '']]);
for (let i = 0; i < 30; i++) { await D.page.waitForTimeout(500); const x = await H.one('erpInbox', r.id); if (x && ['done', 'attention', 'error'].includes(x.status)) break; }
await mp.evaluate(() => openPage('picking')); await mp.waitForTimeout(2000);
// 現場：白蝦要 3 只有 1，按「不夠」
await mp.evaluate(() => { const n = pickingItems.find(i => i.productName === '白蝦' && !i.completed); window._shortItem = n; });
await mp.evaluate(() => pickShortNumber(1));
for (let i = 0; i < 20 && !sb.includes('白蝦'); i++) { await sp.waitForTimeout(300); sb = await sp.textContent('#sales-board-list'); }
H.check('業務看板馬上出現：新的・黑貓・白蝦 50/60 要 3 只有 1（少 2）・S-1 海霸王、S-2 好市多', sb.includes('新的') && sb.includes('黑貓') && sb.includes('白蝦 50/60') && sb.includes('要 3 只有 1（少 2）') && sb.includes('S-1') && sb.includes('海霸王') && sb.includes('好市多') && sb.includes('現場回報：小李'), sb.slice(0, 400));
const notes = await sp.evaluate(() => window._notes);
H.check('業務電腦跳 Windows 通知（缺貨・黑貓：白蝦 少 2）', notes.length === 1 && notes[0].includes('缺貨・黑貓') && notes[0].includes('白蝦 50/60 少 2'), JSON.stringify(notes));
H.check('左邊選單「業務看板」寫 1（還沒人接）', (await sp.textContent('#nav-sales-badge')) === '1');
// 業務按「我來處理」
await sp.click('#sales-board-list button:has-text("我來處理")'); await sp.waitForTimeout(1200);
let wv = (await H.all('waves'))[0];
const cid = encodeURIComponent('白蝦|||50/60');
H.check('按「我來處理」：記下主管接手，卡片變「處理中・主管」', (wv.salesCases || {})[cid] && wv.salesCases[cid].by === '主管' && (await sp.textContent('#sales-board-list')).includes('處理中・主管'), JSON.stringify(wv.salesCases));
let top = await mp.textContent('#picking-next');
for (let i = 0; i < 15 && !top.includes('業務處理中'); i++) { await mp.waitForTimeout(300); top = await mp.textContent('#picking-next'); }
H.check('手機上寫「白蝦 50/60：業務處理中（主管）」', top.includes('白蝦 50/60：業務處理中（主管）'), top.slice(0, 300));
// 業務回覆「先出不補」
await mp.evaluate(() => { window._toasts = []; const t = window.toast; window.toast = m => { window._toasts.push(m); t(m); }; });
await sp.click('#sales-board-list button:has-text("先出不補")'); await sp.waitForTimeout(1200);
for (let i = 0; i < 15 && !top.includes('業務：先出不補'); i++) { await mp.waitForTimeout(300); top = await mp.textContent('#picking-next'); }
H.check('業務回覆「先出不補」：手機馬上看到「💬 白蝦 50/60：業務：先出不補」、跳提示', top.includes('白蝦 50/60：業務：先出不補') && (await mp.evaluate(() => window._toasts.join('|'))).includes('業務回覆：白蝦 先出不補'), top.slice(0, 300));
const B = await D.ctx.newPage();
await B.goto(base + '/board.html?night=off'); await B.waitForTimeout(3500);
const bw = await B.innerText('#l-waves');
H.check('現場看板：黑貓波次寫「缺 1 項・白蝦：業務：先出不補」', bw.includes('缺 1 項・白蝦：業務：先出不補'), bw);
H.check('業務看板：卡片變「已回覆現場」，回覆：先出不補', (await sp.textContent('#sales-board-list')).includes('已回覆現場') && (await sp.textContent('#sales-board-list')).includes('回覆：先出不補'));
// 已出貨、等鼎新改的單（波次完成後）也在業務看板
await H.admin(async d => H.setDoc(H.doc(d, 'salesOrders', 'X9'), { orderNo: 'X-9', customer: '老街麵線', status: 'shipped', waveNo: 'W-OLD', erpFixNeeded: true, shortShipped: [{ productName: '透抽', spec: 'L', want: 4, got: 2, short: 2 }], salesCase: { by: '主管', at: new Date().toISOString(), reply: '先出不補' } }));
for (let i = 0; i < 20 && !sb.includes('老街麵線'); i++) { await sp.waitForTimeout(300); sb = await sp.textContent('#sales-board-list'); }
H.check('已出貨等鼎新改：老街麵線 X-9 透抽 訂 4 → 出 2（少 2），揀貨時誰接手也帶過來', sb.includes('已出貨・等鼎新改') && sb.includes('老街麵線') && sb.includes('訂 4 → 出 2（少 2）') && sb.includes('處理：主管'), sb.slice(-400));
await sp.click('#sales-board-list .sb-card:last-child button:has-text("已經改好了")'); await sp.waitForTimeout(1200);
H.check('按「已經改好了」：不跳視窗，直接拿掉、下面有「復原」', S.log.dialogs.length === 0 && (await H.one('salesOrders', 'X9')).erpFixNeeded === false && await sp.isVisible('#sb-undo'), JSON.stringify(S.log.dialogs));
await sp.click('#sb-undo button'); await sp.waitForTimeout(1500);
H.check('按「復原」：回到業務看板', (await H.one('salesOrders', 'X9')).erpFixNeeded === true);
H.check('沒有頁面錯誤', S.log.errors.length === 0 && M.log.errors.length === 0 && D.log.errors.length === 0, JSON.stringify(S.log.errors.concat(M.log.errors, D.log.errors)));
await H.close(); process.exit(0);
