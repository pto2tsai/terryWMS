// 現場缺貨：手機「不夠」→ 點數字鍵拿到幾件 → 完成時預設先開單的先給（可改分法）→ 缺的不補、請業務改鼎新
//   完成後才印標籤（件數是實際出貨的）；看板、首頁提醒今天缺貨；辦公室自動印模式
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
H.check('開始揀貨：只印揀貨單（分貨標籤揀完才印）', pvHtml.includes('揀貨單') && !pvHtml.includes('class="label"'), pvHtml.length);
if (pv && process.env.SHOT_DIR) { await pv.setViewportSize({ width: 900, height: 700 }); await pv.screenshot({ path: process.env.SHOT_DIR + '/pick-with-labels.png', fullPage: true }); }
if (pv) await pv.close().catch(() => {});
await D.page.evaluate(() => closeWaveExecuteModal()); await D.page.waitForTimeout(300);

// ---------- 手機：白蝦只拿到 6 件 ----------
const mp = M.page;
await mp.evaluate(() => openPage('picking')); await mp.waitForTimeout(400);
await mp.selectOption('#picking-wave-select', W.waveNo); await mp.waitForTimeout(1000);
const first = await mp.evaluate(() => pickingItems.filter(i => !i.completed && !i.shortage)[0].productName);
const tapPad = async n => { await mp.click('#picking-next .pk-short'); await mp.waitForTimeout(300); await mp.click(`#short-pad button:text-is("${n}")`); await mp.waitForTimeout(1500); };
if (first === '透抽') { await mp.click('#picking-next .pk-go'); await mp.waitForTimeout(800); }
if (process.env.SHOT_DIR) await mp.screenshot({ path: process.env.SHOT_DIR + '/pick-next.png' });
const card = await mp.innerText('#picking-next');
H.check('手機大字卡片：品名、拿 8 件、「✓ 拿好了」大按鈕、「不夠」按鈕', card.includes('白蝦') && card.includes('拿 8') && card.includes('拿好了') && card.includes('不夠'), card);
await mp.click('#picking-next .pk-short'); await mp.waitForTimeout(300);
const padNums = await mp.$$eval('#short-pad button', bs => bs.map(b => b.innerText.trim()));
H.check('按「不夠」跳出數字鍵 0～7（點實際拿到幾件，不用打字）', JSON.stringify(padNums.slice(0, 8)) === JSON.stringify(['0', '1', '2', '3', '4', '5', '6', '7']) && padNums.includes('取消'), JSON.stringify(padNums));
if (process.env.SHOT_DIR) await mp.screenshot({ path: process.env.SHOT_DIR + '/short-pad.png' });
await mp.click('#short-pad button:text-is("6")'); await mp.waitForTimeout(1500);
const w1 = await H.one('waves', W.waveNo);
H.check('點 6：記下拿到 6 件、不夠 2 件', (w1.shortLog || []).some(e => e.qty === 2 && e.productName === '白蝦') && (w1.pickLog || []).some(e => e.productName === '白蝦' && e.qty === 6), JSON.stringify([w1.shortLog, w1.pickLog]));
H.check('手機顯示「拿 6，不夠 2」，白蝦不會再叫人去拿', (await mp.innerText('#picking-scan-result')).includes('不夠 2') && !(await mp.evaluate(() => pickingItems.some(i => !i.completed && !i.shortage && i.productName === '白蝦'))));
if (first !== '透抽') { await mp.click('#picking-next .pk-go'); await mp.waitForTimeout(800); }

// ---------- 全部拿完：按「完成出貨」（不再跳確認視窗）----------
const allDone = await mp.innerText('#picking-next');
H.check('全部拿完：顯示「有 1 項不夠」和「完成出貨」大按鈕', allDone.includes('全部拿完') && allDone.includes('有 1 項不夠') && allDone.includes('完成出貨'), allDone);
const dz = M.log.dialogs.length;
await mp.click('#picking-next .pk-go'); await mp.waitForTimeout(800);
const panel = await mp.innerText('#picking-next');
H.check('缺貨畫面：預設先開單的先給，列出會少的那家（好市多 白蝦 給 1 件），沒有跳確認視窗', panel.includes('有 1 項不夠') && panel.includes('先開單的先給') && panel.includes('好市多') && panel.includes('給 1 件') && !panel.includes('海霸王') && M.log.dialogs.length === dz, panel);
if (process.env.SHOT_DIR) await mp.screenshot({ path: process.env.SHOT_DIR + '/short-panel.png', fullPage: true });
H.check('缺貨畫面沒有「標籤都改好了」要勾，還沒完成', !(await mp.$('#short-labels-ok')) && await mp.isVisible('#short-ok-btn') && (await H.one('waves', W.waveNo)).status !== 'done');
// 現場決定：海霸王 3、好市多 3
await mp.click('#short-edit-btn'); await mp.waitForTimeout(300);
H.check('按「改分法」：每家一格，預設海霸王 5、好市多 1', JSON.stringify(await mp.$$eval('.alloc-in', e => e.map(x => x.value))) === JSON.stringify(['5', '1']) && !(await mp.isDisabled('#short-done-btn')));
const ins = await mp.$$('.alloc-in');
await ins[0].fill('4'); await mp.waitForTimeout(200);
H.check('分的數字加起來不等於拿到的 6 件：不能完成，並提示', await mp.isDisabled('#short-done-btn') && (await mp.innerText('#picking-next')).includes('加起來要等於 6 件'));
await ins[0].fill('3'); await ins[1].fill('3'); await mp.waitForTimeout(200);
H.check('改成海霸王 3、好市多 3：可以完成', !(await mp.isDisabled('#short-done-btn')) && (await mp.innerText('#picking-next')).includes('分完了'));
await mp.click('#short-done-btn'); await mp.waitForTimeout(2500);
const wd = await H.one('waves', W.waveNo);
const so = Object.fromEntries((await H.all('salesOrders')).map(o => [o.orderNo, o]));
H.check('完成：照現場分法出貨（海霸王白蝦 3、好市多白蝦 3）；缺的不變成欠貨', wd.status === 'done' && so['A-1'].status === 'shipped' && so['A-2'].status === 'shipped' && !so['A-1'].backorderItems && !so['A-2'].backorderItems &&
  JSON.stringify((wd.shipped || []).map(x => x.orderNo + ':' + x.items.map(i => i.productName + i.qty).join('+'))) === JSON.stringify(['A-1:白蝦3', 'A-2:白蝦3+透抽2']), JSON.stringify([wd.shipped, so['A-1'], so['A-2']]));
H.check('海霸王標「要改鼎新」（白蝦 5→3）；好市多出齊不用改', so['A-1'].erpFixNeeded === true && so['A-1'].shortShipped[0].want === 5 && so['A-1'].shortShipped[0].got === 3 && !so['A-2'].erpFixNeeded, JSON.stringify([so['A-1'].shortShipped, so['A-2'].erpFixNeeded]));
H.check('波次記下現場的分法和誰少出', wd.allocOverride && (wd.shortOrders || []).length === 1 && wd.shortOrders[0].customer === '海霸王' && wd.shortOrders[0].got === 3, JSON.stringify([wd.allocOverride, wd.shortOrders]));
const fin = await mp.innerText('#picking-next');
H.check('完成畫面：大字「完成」、「印標籤（2 張）」大按鈕、小字寫缺的不補', fin.includes('完成') && fin.includes('缺的不補') && fin.includes('印標籤（2 張）'), fin);
if (process.env.SHOT_DIR) await mp.screenshot({ path: process.env.SHOT_DIR + '/finish-panel.png' });
await mp.evaluate(() => { window.print = () => { window.__printed = document.getElementById('label-print-area').innerHTML; }; });
await mp.click('text=印標籤（'); await mp.waitForTimeout(1200);
const printed = await mp.evaluate(() => window.__printed || '');
H.check('手機印標籤：一張訂單一張，件數是實際出貨的（海霸王白蝦 3 件、註明缺貨 訂 5 出 3；好市多白蝦 3 件）', (printed.match(/class="label"/g) || []).length === 2 &&
  /白蝦 50\/60<\/span><strong>3 件/.test(printed) && printed.includes('缺貨：訂 5，出 3') && printed.includes('page-break-after:always'), printed.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 300));
H.check('記下標籤已經在手機印過', !!(await H.one('waves', W.waveNo)).labelsPrintedAt && (await H.one('waves', W.waveNo)).labelsPrintedOn === 'phone');

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

// ---------- 辦公室自動印（手機連不上標籤機時）----------
await H.nav(D.page, 'wave-picking'); await D.page.waitForTimeout(800);
D.page.__dialogPlan = [true];
await D.page.click('#btn-label-mode'); await D.page.waitForTimeout(1200);
H.check('主管切成「標籤：辦公室自動印」，出現「這台電腦自動印標籤」', (await H.one('settings', 'labelPrint')).mode === 'office' && (await D.page.innerText('#btn-label-mode')).includes('辦公室自動印') && await D.page.isVisible('#chk-auto-label'));
D.page.__dialogPlan = [true];
await D.page.check('#chk-auto-label'); await D.page.waitForTimeout(300);
const r3 = await pushReport('每日客戶銷貨明細表_1300.xlsx', [HEAD, ['2026/09/28', 'B-1', '全聯', '透抽', 'L', 4, '件', '新竹']]);
for (let i = 0; i < 30; i++) { await D.page.waitForTimeout(500); const x = await H.one('erpInbox', r3.id); if (x && ['done', 'attention', 'error'].includes(x.status)) break; }
const W2 = (await H.all('waves')).find(w => (w.orders || []).some(o => o.orderNo === 'B-1'));
await mp.evaluate(() => goBack()); await mp.evaluate(() => openPage('picking')); await mp.waitForTimeout(600);
await mp.selectOption('#picking-wave-select', W2.waveNo); await mp.waitForTimeout(1000);
await tapPad(3);   // 透抽要 4 只拿到 3
await mp.click('#picking-next .pk-go'); await mp.waitForTimeout(800);   // 完成出貨
await mp.click('#short-ok-btn'); await mp.waitForTimeout(3000);   // 照預設分法，好，完成
const fin2 = await mp.innerText('#picking-next');
H.check('辦公室模式：手機完成後寫「標籤在辦公室自動印出」，沒有手機列印按鈕', fin2.includes('辦公室自動印出') && !fin2.includes('印標籤（'), fin2);
const w2 = await H.one('waves', W2.waveNo);
const frame = await D.page.evaluate(() => { const f = document.querySelector('.auto-label-frame'); return f ? f.contentDocument.body.innerHTML : ''; });
H.check('辦公室電腦自動印出標籤（沒有人按），件數是實際出貨的（透抽 3 件）；記下是哪台印的', !!w2.labelAutoPrintedAt && w2.labelsPrintedOn === 'office' && frame.includes('全聯') && frame.includes('3 件'), JSON.stringify([w2.labelAutoPrintedAt, frame.replace(/<[^>]+>/g, ' ').slice(0, 120)]));

H.check('沒有頁面錯誤', D.log.errors.length === 0 && M.log.errors.length === 0, JSON.stringify(D.log.errors.concat(M.log.errors)));
await H.close(); process.exit(0);
