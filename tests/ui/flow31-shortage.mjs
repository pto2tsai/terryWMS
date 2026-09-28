// 現場缺貨：手機「不夠」→ 完成前列出哪個客戶少幾件、勾「標籤改好了」才能完成 → 欠貨下次補出
//   開始揀貨時揀貨單＋分貨標籤一起印；完成後重印標籤用實際出貨數；看板、首頁提醒今天缺貨
import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';
import { pushReport } from './erp-gs.mjs';
const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
await H.resetData(async d => { await baseSeed(d); await H.setDoc(H.doc(d, 'settings', 'practice'), { enabled: true }); });
const HEAD = ['銷貨日期', '銷貨單號', '客戶全名', '品名', '規格', '銷貨數量', '單位', '備註'];
const rows = [HEAD, ['2026/09/28', 'A-1', '海霸王', '白蝦', '50/60', 5, '件', '黑貓'], ['2026/09/28', 'A-2', '好市多', '白蝦', '50/60', 3, '件', '黑貓'], ['2026/09/28', 'A-2', '好市多', '透抽', 'L', 2, '件', '黑貓']];

const D = await H.openApp(base, USERS.sup);
const M = await H.openApp(base, USERS.op2, { mobile: true });
await D.page.waitForTimeout(1500); await M.page.waitForTimeout(1500);
const r = await pushReport('每日客戶銷貨明細表_0900.xlsx', rows);
for (let i = 0; i < 30; i++) { await D.page.waitForTimeout(500); const x = await H.one('erpInbox', r.id); if (x && ['done', 'attention', 'error'].includes(x.status)) break; }
const W = (await H.all('waves'))[0];
H.check('波次建好（白蝦 8、透抽 2）', W && W.totalQty === 10, JSON.stringify(W && W.totalQty));

// ---------- 電腦：開始揀貨 → 揀貨單＋分貨標籤一起預覽 ----------
await H.nav(D.page, 'wave-picking'); await D.page.waitForTimeout(1200);
const pvP = D.page.waitForEvent('popup', { timeout: 5000 }).catch(() => null);
await D.page.evaluate(no => openWaveExecute(no), W.waveNo); await D.page.waitForTimeout(1200);
const pv = await pvP; const pvHtml = pv ? await pv.content() : '';
H.check('開始揀貨：揀貨單和分貨標籤一起預覽（每張訂單一張標籤）', pvHtml.includes('揀貨單') && pvHtml.includes('分貨標籤') && pvHtml.includes('海霸王') && pvHtml.includes('好市多') && (pvHtml.match(/class="label"/g) || []).length === 2, pvHtml.length);
if (pv && process.env.SHOT_DIR) { await pv.setViewportSize({ width: 900, height: 700 }); await pv.screenshot({ path: process.env.SHOT_DIR + '/pick-with-labels.png', fullPage: true }); }
if (pv) await pv.close().catch(() => {});
await D.page.evaluate(() => closeWaveExecuteModal()); await D.page.waitForTimeout(300);

// ---------- 手機：白蝦只拿到 6 件 ----------
const mp = M.page;
await mp.evaluate(() => openPage('picking')); await mp.waitForTimeout(400);
await mp.selectOption('#picking-wave-select', W.waveNo); await mp.waitForTimeout(1000);
const first = await mp.evaluate(() => pickingItems.filter(i => !i.completed && !i.shortage)[0].productName);
if (first === '透抽') { await mp.click('#picking-next button.action-btn.success'); await mp.waitForTimeout(800); }
if (process.env.SHOT_DIR) await mp.screenshot({ path: process.env.SHOT_DIR + '/pick-next.png' });
H.check('手機每一項都有「不夠」按鈕', (await mp.innerText('#picking-next')).includes('不夠'));
mp.__dialogPlan = ['6'];
await mp.click('#picking-next button.action-btn.secondary'); await mp.waitForTimeout(1500);
const w1 = await H.one('waves', W.waveNo);
H.check('按「不夠」填 6：記下拿到 6 件、不夠 2 件', (w1.shortLog || []).some(e => e.qty === 2 && e.productName === '白蝦') && (w1.pickLog || []).some(e => e.productName === '白蝦' && e.qty === 6), JSON.stringify([w1.shortLog, w1.pickLog]));
H.check('手機顯示「拿到 6 件，不夠 2 件」，白蝦不會再叫人去拿', (await mp.innerText('#picking-scan-result')).includes('不夠 2 件') && !(await mp.evaluate(() => pickingItems.some(i => !i.completed && !i.shortage && i.productName === '白蝦'))));
if (first !== '透抽') { await mp.click('#picking-next button.action-btn.success'); await mp.waitForTimeout(800); }

// ---------- 完成：先決定不夠的給誰、改標籤 ----------
await mp.evaluate(async () => { await completePickingWave(); }); await mp.waitForTimeout(800);
const panel = await mp.innerText('#picking-next');
H.check('完成前列出：白蝦共訂 8 件只拿到 6 件，要怎麼分（預設先開單的海霸王 5、好市多 1）', panel.includes('共訂 8 件') && panel.includes('只拿到 6 件') && panel.includes('要怎麼分') &&
  JSON.stringify(await mp.$$eval('.alloc-in', e => e.map(x => x.value))) === JSON.stringify(['5', '1']) && panel.includes('標籤改成 1 件'), panel);
if (process.env.SHOT_DIR) await mp.screenshot({ path: process.env.SHOT_DIR + '/short-panel.png', fullPage: true });
H.check('沒勾「標籤都改好了」不能完成', await mp.isDisabled('#short-done-btn') && (await H.one('waves', W.waveNo)).status !== 'done');
// 現場決定：海霸王 3、好市多 3
const ins = await mp.$$('.alloc-in');
await ins[0].fill('4'); await mp.check('#short-labels-ok'); await mp.waitForTimeout(200);
H.check('分的數字加起來不等於拿到的 6 件：不能完成，並提示', await mp.isDisabled('#short-done-btn') && (await mp.innerText('#picking-next')).includes('加起來要等於拿到的 6 件'));
await ins[0].fill('3'); await ins[1].fill('3'); await mp.waitForTimeout(200);
H.check('改成海霸王 3、好市多 3：海霸王標籤改成 3 件、好市多不用改', !(await mp.isDisabled('#short-done-btn')) && (await mp.innerText('#picking-next')).includes('標籤改成 3 件') && (await mp.innerText('#picking-next')).includes('標籤不用改'));
const d0 = M.log.dialogs.length;
await mp.click('#short-done-btn'); await mp.waitForTimeout(2500);
const wd = await H.one('waves', W.waveNo);
const so = Object.fromEntries((await H.all('salesOrders')).map(o => [o.orderNo, o]));
H.check('完成：照現場分法出貨（海霸王白蝦 3、好市多白蝦 3）；缺的不變成欠貨', wd.status === 'done' && so['A-1'].status === 'shipped' && so['A-2'].status === 'shipped' && !so['A-1'].backorderItems && !so['A-2'].backorderItems &&
  JSON.stringify((wd.shipped || []).map(x => x.orderNo + ':' + x.items.map(i => i.productName + i.qty).join('+'))) === JSON.stringify(['A-1:白蝦3', 'A-2:白蝦3+透抽2']), JSON.stringify([wd.shipped, so['A-1'], so['A-2']]));
H.check('海霸王標「要改鼎新」（白蝦 5→3）；好市多出齊不用改', so['A-1'].erpFixNeeded === true && so['A-1'].shortShipped[0].want === 5 && so['A-1'].shortShipped[0].got === 3 && !so['A-2'].erpFixNeeded, JSON.stringify([so['A-1'].shortShipped, so['A-2'].erpFixNeeded]));
H.check('波次記下現場的分法和誰少出', wd.allocOverride && (wd.shortOrders || []).length === 1 && wd.shortOrders[0].customer === '海霸王' && wd.shortOrders[0].got === 3, JSON.stringify([wd.allocOverride, wd.shortOrders]));
H.check('完成訊息：缺的不補，請業務改鼎新', M.log.dialogs.slice(d0).some(x => x.msg.includes('之後也不補') && x.msg.includes('鼎新')), JSON.stringify(M.log.dialogs.slice(d0).map(x => x.msg)));

// ---------- 完成後重印標籤：用實際出貨數 ----------
await D.page.evaluate(() => loadWavesFromFirebase && loadWavesFromFirebase()); await D.page.waitForTimeout(1200);
const lbP = D.page.waitForEvent('popup', { timeout: 5000 }).catch(() => null);
await D.page.evaluate(no => printWaveLabels(no), W.waveNo);
const lb = await lbP; const lbHtml = lb ? await lb.content() : '';
H.check('完成後重印標籤：海霸王白蝦印 3 件並註明「缺貨：訂 5，出 3」', lbHtml.includes('缺貨：訂 5，出 3') && /白蝦 50\/60<\/span><strong>3 件/.test(lbHtml), lbHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 400));
if (lb) await lb.close().catch(() => {});

// ---------- 看板、首頁 ----------
const B = await D.ctx.newPage();
await B.goto(base + '/board.html?night=off'); await B.waitForTimeout(3500);
const alertTxt = await B.innerText('#erp-alert');
H.check('電視看板：缺貨少出 1 張，請業務在鼎新改銷貨單：海霸王 白蝦 5→3', alertTxt.includes('缺貨少出 1 張') && alertTxt.includes('海霸王 白蝦 5→3'), alertTxt);
await H.nav(D.page, 'home'); await D.page.waitForTimeout(2500);
const home = await D.page.innerText('#home-todos');
H.check('首頁待辦：缺貨要改鼎新 1（海霸王 白蝦 5→3）', /缺貨要改鼎新\s*1/.test(home) && home.includes('海霸王（A-1）白蝦 5→3'), home);

// ---------- 缺的不補；鼎新改好匯入後提醒消失 ----------
const wv = await D.page.evaluate(async () => { await loadOrdersFromFirebase(); return window._orderData.orders.filter(window.orderWaveable).map(o => o.orderNo); });
H.check('缺的貨不會再排波次', !wv.includes('A-1'), JSON.stringify(wv));
const r2 = await pushReport('每日客戶銷貨明細表_1100.xlsx', [HEAD, ['2026/09/28', 'A-1', '海霸王', '白蝦', '50/60', 3, '件', '黑貓'], rows[2], rows[3]]);
for (let i = 0; i < 30; i++) { await D.page.waitForTimeout(500); const x = await H.one('erpInbox', r2.id); if (x && ['done', 'attention', 'error'].includes(x.status)) break; }
await B.waitForTimeout(1500);
H.check('業務在鼎新把海霸王改成 3 件、匯入後：提醒自動消失（看板不再顯示）', (await H.all('salesOrders')).find(o => o.orderNo === 'A-1').erpFixNeeded === false && !(await B.innerText('#erp-alert')).includes('缺貨少出'), await B.innerText('#erp-alert'));

H.check('沒有頁面錯誤', D.log.errors.length === 0 && M.log.errors.length === 0, JSON.stringify(D.log.errors.concat(M.log.errors)));
await H.close(); process.exit(0);
