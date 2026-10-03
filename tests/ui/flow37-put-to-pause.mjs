// 獨有品項：只有一家訂的，揀的時候就寫「放到：哪一家」，分貨時那家自動算分好；
// 揀到一半可以暫停、先揀別的波次（例如自取客戶提早到），做完「回到暫停的波次」
import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';
import { pushReport } from './erp-gs.mjs';
const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
await H.resetData(async d => { await baseSeed(d); await H.setDoc(H.doc(d, 'settings', 'practice'), { enabled: true }); });
const HEAD = ['銷貨日期', '銷貨單號', '客戶全名', '品名', '規格', '銷貨數量', '單位', '備註'];
const D = await H.openApp(base, USERS.sup);
const M = await H.openApp(base, USERS.op2, { mobile: true });
await D.page.waitForTimeout(1500);
const push = async (name, rows) => { const r = await pushReport(name, [HEAD].concat(rows)); for (let i = 0; i < 80; i++) { await D.page.waitForTimeout(500); const x = await H.one('erpInbox', r.id); if (x && ['done', 'attention', 'error'].includes(x.status)) break; } };
await push('每日客戶銷貨明細表_0900.xlsx', [
  ['2026/10/01', 'A-1', '海霸王', '白蝦', '50/60', 5, '件', '全日'], ['2026/10/01', 'A-1', '海霸王', '透抽', 'L', 2, '件', '全日'],
  ['2026/10/01', 'A-2', '好市多', '白蝦', '50/60', 3, '件', '全日'], ['2026/10/01', 'A-3', '開心麵館企業有限公司-3', '干貝', 'S', 1, '件', '全日']]);
await D.page.waitForTimeout(1200);
await push('每日客戶銷貨明細表_1000.xlsx', [['2026/10/01', 'B-1', '林小芬', '魷魚', 'M', 1, '件', '自取']]);
for (let i = 0; i < 60 && (await H.all('waves')).length < 2; i++) await D.page.waitForTimeout(500);
const waves = await H.all('waves');
const W1 = waves.find(w => w.logistics === '全日物流'), W2 = waves.find(w => w.orders.some(o => o.orderNo === 'B-1'));
H.check('兩個波次建好（全日 3 家、自取 1 家）', W1 && W2 && W1.orders.length === 3, JSON.stringify(waves.map(w => [w.logistics, w.orders.length])));

const mp = M.page;
const card = () => mp.$eval('#picking-next', e => e.textContent);
const bring = async name => { await mp.waitForFunction(n => typeof pickingItems !== 'undefined' && pickingItems.some(i => i.productName === n && !i.completed && !i.shortage), name, { timeout: 8000 }); await mp.evaluate(n => { const it = pickingItems.find(i => i.productName === n && !i.completed && !i.shortage); choosePickItem(it.id || (it.key + '@' + it.palletId)); }, name); await mp.waitForTimeout(400); };
await mp.waitForFunction(() => (window.waves || []).length >= 2, null, { timeout: 15000 });   // 手機收到兩個波次
await mp.evaluate(() => openPage('picking')); await mp.waitForTimeout(1500);
H.check('打開就是先開的那個波次（全日）', (await mp.$eval('#picking-wave-select', e => e.value)) === W1._id);
await bring('透抽');
H.check('透抽只有海霸王訂：卡片寫「放到：海霸王」', (await card()).includes('放到：海霸王'), await card());
if (process.env.SHOT_DIR) await mp.screenshot({ path: process.env.SHOT_DIR + '/put-to.png' });
await bring('白蝦');
H.check('白蝦兩家都訂：寫「要分給 2 家」，沒有「放到」', (await card()).includes('要分給 2 家') && !(await card()).includes('放到：'), await card());
await mp.click('#picking-next .pk-take'); await mp.waitForTimeout(1200);   // 白蝦拿好

// ---------- 自取客戶提早到：先揀別的波次 ----------
await mp.click('#picking-next button:has-text("先揀別的波次")'); await mp.waitForTimeout(500);
const sw = await card();
if (process.env.SHOT_DIR) await mp.screenshot({ path: process.env.SHOT_DIR + '/switcher.png' });
H.check('「先揀別的波次」列出兩個波次：全日寫「正在揀、1 / 3 項」，自取也在', sw.includes('要先揀哪一個') && /全日物流\s*正在揀/.test(sw) && sw.includes('1 / 3 項') && sw.includes('自取'), sw);
await mp.click('#picking-next .sw-wave:has-text("自取")'); await mp.waitForTimeout(1500);
H.check('換到自取的波次', (await mp.$eval('#picking-wave-select', e => e.value)) === W2._id && (await card()).includes('魷魚'), await card());
const w1p = await H.one('waves', W1._id);
H.check('全日的進度還在（白蝦已拿），也不再顯示我在揀', (w1p.completedItems || []).length === 1 && !Object.keys(w1p.pickers || {}).length, JSON.stringify([w1p.completedItems, w1p.pickers]));
await mp.click('#picking-next .pk-take'); await mp.waitForTimeout(1200);
await mp.click('#picking-next button:has-text("完成出貨")'); await mp.waitForTimeout(2500);
H.check('自取完成：直接進「核對」（只有一家也要對）', /^\s*核對\s*0\s*\/ 1 張/.test(await card()), await card());
await mp.click('#picking-next button:has-text("這張對了")'); await mp.waitForTimeout(1200);
const f2 = await card();
H.check('自取做完：大按鈕是「回到暫停的波次（全日）」', f2.includes('回到暫停的波次') && f2.includes(W1.waveNo), f2);
await mp.click('#picking-next button:has-text("回到暫停的波次")'); await mp.waitForTimeout(1500);
H.check('回到全日：白蝦已經拿過，接著拿別的', (await mp.$eval('#picking-wave-select', e => e.value)) === W1._id && (await card()).includes('1 / 3 項'), await card());

// ---------- 拿完、分貨：開心麵館只有干貝（獨有），自動算分好 ----------
for (let i = 0; i < 2; i++) { await mp.click('#picking-next .pk-take'); await mp.waitForTimeout(1200); }
await mp.click('#picking-next button:has-text("開始分貨")'); await mp.waitForTimeout(2500);
const sp = await card();
if (process.env.SHOT_DIR) await mp.screenshot({ path: process.env.SHOT_DIR + '/sort-auto.png', fullPage: true });
H.check('分貨・核對：開心麵館（只有獨有的干貝）寫「揀的時候已經放好了」，還是要對（0 / 3 張）', /分貨・核對\s*0\s*\/ 3 張/.test(sp) && /開心麵館[\s\S]*揀的時候已經放好了/.test(sp), sp);
// ---------- 客戶簡稱 ----------
H.check('名字長的自動簡稱：「開心麵館企業有限公司-3」在分貨寫「開心麵館」，下面小字寫完整名稱', sp.includes('開心麵館企業有限公司-3'));
await D.page.evaluate(() => loadOrdersFromFirebase()); await D.page.waitForTimeout(800);
await D.page.evaluate(() => openCustomerShort()); await D.page.waitForTimeout(500);
const cs = await D.page.$eval('#modal-customer-short', e => e.textContent);
H.check('主管打開「客戶簡稱」：列出名字長的客戶，灰字是自動簡稱', cs.includes('開心麵館企業有限公司-3') && (await D.page.$eval('#modal-customer-short .cs-in[data-name="開心麵館企業有限公司-3"]', e => e.placeholder)) === '開心麵館', cs.slice(0, 200));
await D.page.fill('#modal-customer-short .cs-in[data-name="開心麵館企業有限公司-3"]', '開心');
await D.page.click('#cs-save'); await D.page.waitForTimeout(1200);
H.check('存好：設定裡記下「開心」', ((await H.one('settings', 'customerShort')) || {}).map['開心麵館企業有限公司-3'] === '開心');
const lb = await D.page.evaluate(id => { const w = window._waveData.waves.find(x => x.id === id) || window._waveData.waves[0]; return buildSortingLabelsHtml(w).body; }, W1._id);
H.check('分貨標籤用簡稱「開心」（字更大）', lb.includes('</span>開心</div>'), lb.slice(0, 200));
H.check('沒有頁面錯誤', M.log.errors.length === 0 && D.log.errors.length === 0, JSON.stringify(M.log.errors.concat(D.log.errors)));
await H.close(); process.exit(0);
