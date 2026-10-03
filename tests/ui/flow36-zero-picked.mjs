// 一件都沒拿到（整張單都不夠）：不要叫人按「完成出貨」，寫清楚「這次不出貨」，一顆按鈕直接結束；
// 揀完後畫面只剩現在要做的事（全部清單、最後一次揀的結果收起來）
import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';
import { pushReport } from './erp-gs.mjs';
const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
await H.resetData(async d => { await baseSeed(d); await H.setDoc(H.doc(d, 'settings', 'practice'), { enabled: true }); });
const HEAD = ['銷貨日期', '銷貨單號', '客戶全名', '品名', '規格', '銷貨數量', '單位', '備註'];
const D = await H.openApp(base, USERS.sup);
const M = await H.openApp(base, USERS.op2, { mobile: true });
await D.page.waitForTimeout(1500); await M.page.waitForTimeout(1500);
const r = await pushReport('每日客戶銷貨明細表_0900.xlsx', [HEAD, ['2026/10/01', 'Z-1', '林小芬', '黑螺肉', '1A 1KG*15包', 1, '件', '崇文']]);
for (let i = 0; i < 30; i++) { await D.page.waitForTimeout(500); const x = await H.one('erpInbox', r.id); if (x && ['done', 'attention', 'error'].includes(x.status)) break; }
const W = (await H.all('waves'))[0];
H.check('波次建好（黑螺肉 1 件）', W && W.totalQty === 1, JSON.stringify(W && W.totalQty));

const mp = M.page;
await mp.evaluate(() => openPage('picking')); await mp.waitForTimeout(1500);
H.check('按「波次揀貨」就直接打開要揀的波次（不用再選）', (await mp.$eval('#picking-wave-select', e => e.value)) === W._id && (await mp.innerText('#picking-next')).includes('黑螺肉'), await mp.innerText('#picking-next'));
// J庫沒有 → 交給 I庫；I庫也沒有 → 才算不夠
await mp.click('#picking-next .pk-short'); await mp.waitForTimeout(300);
await mp.click('#short-pad button:text-is("0")'); await mp.waitForTimeout(1500);
await mp.click('#picking-next .pk-house'); await mp.waitForTimeout(800);
await mp.click('#picking-next .pk-short'); await mp.waitForTimeout(300);
await mp.click('#short-pad button:text-is("0")'); await mp.waitForTimeout(1500);
const c = await mp.innerText('#picking-next');
if (process.env.SHOT_DIR) await mp.screenshot({ path: process.env.SHOT_DIR + '/zero-picked.png' });
H.check('一件都沒拿到：寫「一件都沒拿到、這次不出貨」，沒有「全部拿完」「完成出貨」', c.includes('一件都沒拿到') && c.includes('這次不出貨') && !c.includes('全部拿完') && !c.includes('完成出貨'), c);
H.check('清單標題算法跟上面一樣（1/1，不是 0/0）', (await mp.innerText('#picking-progress')).trim() === '1/1', await mp.innerText('#picking-progress'));
await mp.click('#picking-next button:has-text("結束這個波次")'); await mp.waitForTimeout(2500);
const w = await H.one('waves', W._id);
const so = (await H.all('salesOrders')).find(o => o.orderNo === 'Z-1');
H.check('按一次就結束：波次完成、訂單標「要改鼎新」（黑螺肉 1→0）', w.status === 'done' && so.erpFixNeeded === true && so.shortShipped[0].got === 0, JSON.stringify([w.status, so.erpFixNeeded, so.shortShipped]));
H.check('沒有別的波次：寫「今天的波次都揀完了」，才有「回到選單」', (await mp.innerText('#picking-next')).includes('今天的波次都揀完了') && (await mp.innerText('#picking-next')).includes('回到選單'), await mp.innerText('#picking-next'));
H.check('完成後畫面只剩現在要做的事：全部清單、最後一次揀的結果收起來', !(await mp.isVisible('#picking-list-section')) && !(await mp.innerText('#picking-scan-result')).trim());
if (process.env.SHOT_DIR) await mp.screenshot({ path: process.env.SHOT_DIR + '/zero-finish.png' });
// ---------- 還有別的波次：完成後直接接下一個 ----------
const r2 = await pushReport('每日客戶銷貨明細表_1000.xlsx', [HEAD, ['2026/10/01', 'Z-2', '黃建宏', '透抽', 'L', 2, '件', '大榮'], ['2026/10/01', 'Z-3', '開心麵館', '白蝦', '50/60', 1, '件', '新竹']]);
for (let i = 0; i < 30; i++) { await D.page.waitForTimeout(500); const x = await H.one('erpInbox', r2.id); if (x && ['done', 'attention', 'error'].includes(x.status)) break; }
await mp.waitForTimeout(1500);
await mp.evaluate(() => openPage('picking')); await mp.waitForTimeout(1500);
const first = await mp.$eval('#picking-wave-select', e => e.value);
await mp.click('#picking-next .pk-take'); await mp.waitForTimeout(1200);
await mp.click('#picking-next button:has-text("完成出貨")'); await mp.waitForTimeout(2500);
await mp.click('#picking-next button:has-text("這張對了")'); await mp.waitForTimeout(1200);   // 核對完
const fz = await mp.innerText('#picking-next');
H.check('揀完一個波次：沒有「回到選單」，換成「下一個波次」大按鈕', fz.includes('下一個波次') && !fz.includes('回到選單'), fz);
await mp.click('#picking-next button:has-text("下一個波次")'); await mp.waitForTimeout(1500);
const second = await mp.$eval('#picking-wave-select', e => e.value);
H.check('按「下一個波次」就接著揀另一個', second && second !== first && (await mp.innerText('#picking-next')).match(/透抽|白蝦/), await mp.innerText('#picking-next'));
H.check('沒有頁面錯誤', M.log.errors.length === 0 && D.log.errors.length === 0, JSON.stringify(M.log.errors.concat(D.log.errors)));
await H.close(); process.exit(0);
