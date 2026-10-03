// 業務要改鼎新：庫管用手機看清單、按「傳給業務」叫出 LINE、業務改好按「已經改好了」
// 以前小數誤差留下的「訂 2 → 出 1.9999999（少 0）」不會出現
import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';
const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
await H.resetData(async d => { await baseSeed(d);
  await H.setDoc(H.doc(d, 'salesOrders', 'A'), { orderNo: 'A-1', customer: '海霸王', status: 'shipped', erpFixNeeded: true, shortShipped: [{ productName: '白蝦', spec: '50/60', want: 5, got: 3, short: 2 }] });
  await H.setDoc(H.doc(d, 'salesOrders', 'B'), { orderNo: 'B-1', customer: '老街麵線', status: 'shipped', erpFixNeeded: true, shortShipped: [{ productName: '白蝦', spec: '50/60', want: 2, got: 1.9999999999999991, short: 8.9e-16 }] });
  await H.setDoc(H.doc(d, 'salesOrders', 'C'), { orderNo: 'C-1', customer: '展欣偉群', status: 'shipped', erpReturnNeeded: true, erpReturnLines: ['魷魚圈 多出 2 件（已經出貨，鼎新改少了）→ 請開銷退'] });
});
const M = await H.openApp(base, USERS.op2, { mobile: true }); const mp = M.page;
let home = '';
for (let i = 0; i < 30 && !home.includes('業務要改鼎新'); i++) { await mp.waitForTimeout(500); home = (await mp.textContent('#home-tasks')) || ''; }
H.check('手機首頁「今天的工作」：業務要改鼎新 2 張（少 0 的不算）', home.includes('業務要改鼎新') && /業務要改鼎新.*2\s*張/.test(home.replace(/\s+/g, ' ')), home.replace(/\s+/g, ' ').slice(0, 300));
await mp.click('.task-summary-card[onclick*="erpfix"]'); await mp.waitForTimeout(800);
const page = await mp.textContent('#erpfix-list');
H.check('清單：海霸王 白蝦 訂 5 → 出 3（少 2）、展欣偉群 舊的「請開銷退」顯示成「請業務確認鼎新」；老街麵線不出現', page.includes('海霸王') && page.includes('白蝦 50/60　訂 5 → 出 3 少 2') && page.includes('缺貨少出・請業務改數量') && page.includes('展欣偉群') && page.includes('鼎新對不上・請業務確認') && page.includes('魷魚圈 多出 2 件') && !page.includes('銷退') && !page.includes('老街麵線'), page.slice(0, 300));
// 傳給業務：手機叫出分享（這裡記下要傳的文字）
const B = await M.ctx.newPage();
await B.goto(base + '/board.html?night=off'); await B.waitForTimeout(3000);
let ba = await B.innerText('#erp-alert');
H.check('看板：「要改鼎新 2 張・2 張還沒傳給業務」（紅色）', ba.includes('要改鼎新 2 張・2 張還沒傳給業務') && await B.$('#erp-alert .chip.red'), ba);
await mp.evaluate(() => { window._shared = []; navigator.share = t => { window._shared.push(t.text); return Promise.resolve(); }; Object.defineProperty(navigator, 'userAgent', { get: () => 'iPhone' }); });
await mp.click('#erpfix-all .ef-send-all'); await mp.waitForTimeout(400);
const sent = await mp.evaluate(() => window._shared[0] || '');
H.check('傳新的給業務（2 張）：叫出分享，文字分兩段（缺貨少出、出貨後鼎新對不上），每張單上面一條線、單號／客戶', sent.includes('【缺貨少出') && sent.includes('──────────\nA-1\n海霸王\n白蝦 50/60：訂 5 → 出 3（少 2）') && sent.includes('【出貨後鼎新又改了') && sent.includes('展欣偉群'), sent);
let ef = '';
for (let i = 0; i < 20 && !ef.includes('都傳過了'); i++) { await mp.waitForTimeout(300); ef = await mp.textContent('#page-erpfix'); }
H.check('傳完：卡片寫「已傳 時:分」、按鈕變「再傳一次」，大按鈕變「都傳過了」', /已傳 \d\d:\d\d/.test(ef) && ef.includes('再傳') && ef.includes('都傳過了') && await mp.isDisabled('#erpfix-all .ef-send-all'), ef.slice(0, 400));
for (let i = 0; i < 20 && ba.includes('還沒傳給業務'); i++) { await B.waitForTimeout(300); ba = await B.innerText('#erp-alert'); }
H.check('傳完：看板變灰色「要改鼎新 2 張・都傳了，等業務改」', ba.includes('要改鼎新 2 張・都傳了，等業務改') && await B.$('#erp-alert .chip.gray'), ba);
const a0 = await H.one('salesOrders', 'A');
H.check('資料庫記下已傳（時間、內容）', !!a0.erpSentAt && a0.erpSentKey === '白蝦 50/60：訂 5 → 出 3（少 2）', JSON.stringify(a0));
// 鼎新又改、多一樣缺貨：內容變了＝算新的，要再傳
await H.admin(async d => H.setDoc(H.doc(d, 'salesOrders', 'C'), { erpReturnLines: ['魷魚圈 多出 2 件（已經出貨，鼎新改少了）→ 請開銷退', '整張單在鼎新不見了，但貨已經出了 → 請開銷退'] }, { merge: true }));
for (let i = 0; i < 20 && !ef.includes('傳新的給業務（1 張）'); i++) { await mp.waitForTimeout(300); ef = await mp.textContent('#page-erpfix'); }
await mp.evaluate(() => { window._shared = []; });
await mp.click('#erpfix-all .ef-send-all'); await mp.waitForTimeout(600);
const sent2 = await mp.evaluate(() => window._shared[0] || '');
H.check('內容變了的單又算新的：大按鈕只傳這 1 張（展欣偉群），海霸王不會重複傳', ef.includes('傳新的給業務（1 張）') && sent2.includes('展欣偉群') && !sent2.includes('海霸王'), sent2);
await mp.click('#erpfix-list .ef-card .ef-done'); await mp.waitForTimeout(1500);
const a = await H.one('salesOrders', 'A');
H.check('按「已經改好了」：從清單拿掉（海霸王）', a.erpFixNeeded === false && !(await mp.textContent('#erpfix-list')).includes('海霸王'), JSON.stringify(a));
const D = await H.openApp(base, USERS.op); await D.page.waitForTimeout(1500);
await D.page.evaluate(() => openErpFixList()); await D.page.waitForTimeout(1200);
const fx = await D.page.textContent('#modal-erp-fix');
H.check('電腦版清單一樣：老街麵線（少 0）不出現', fx.includes('展欣偉群') && !fx.includes('老街麵線') && !fx.includes('1.9999'), fx.slice(0, 300));
H.check('沒有頁面錯誤', M.log.errors.length === 0 && D.log.errors.length === 0, JSON.stringify(M.log.errors.concat(D.log.errors)));
await H.close(); process.exit(0);
