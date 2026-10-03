// 現場缺貨：手機「不夠」→ 點數字鍵拿到幾件 → 完成時預設先開單的先給（可改分法）→ 缺的不補、請業務改鼎新
//   完成後才印標籤（件數是實際出貨的）；看板、首頁提醒今天缺貨；辦公室自動印模式
import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';
import { pushReport } from './erp-gs.mjs';
const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
await H.resetData(async d => { await baseSeed(d); await H.setDoc(H.doc(d, 'settings', 'practice'), { enabled: true }); });
const HEAD = ['銷貨日期', '銷貨單號', '客戶全名', '品名', '規格', '銷貨數量', '單位', '備註'];
const rows = [HEAD, ['2026/09/28', 'A-1', '海霸王', '白蝦', '50/60', 5, '件', '全日'], ['2026/09/28', 'A-2', '好市多', '白蝦', '50/60', 3, '件', '全日'], ['2026/09/28', 'A-2', '好市多', '透抽', 'L', 2, '件', '全日']];

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
H.check('手機大字卡片：品名、「✓ 拿 8 件」一顆大按鈕（拿幾件和拿好了合在一起）、「✕ 不夠」', card.includes('白蝦') && (await mp.innerText('#picking-next .pk-take')).replace(/\s+/g, ' ').includes('拿 8 件') && !card.includes('拿好了') && (await mp.$$('#picking-next .pk-short .fa-xmark')).length === 1 && card.includes('不夠'), card);
await mp.click('#picking-next .pk-short'); await mp.waitForTimeout(300);
const padNums = await mp.$$eval('#short-pad button', bs => bs.map(b => b.innerText.trim()));
H.check('按「不夠」跳出數字鍵 0～7（點實際拿到幾件，不用打字）', JSON.stringify(padNums.slice(0, 8)) === JSON.stringify(['0', '1', '2', '3', '4', '5', '6', '7']) && padNums.includes('取消'), JSON.stringify(padNums));
if (process.env.SHOT_DIR) await mp.screenshot({ path: process.env.SHOT_DIR + '/short-pad.png' });
// 件數多（超過 30）：改成計算機鍵盤，也是用按的
await mp.evaluate(() => { closeShortPad(); const n = pickingItems.find(i => !i.completed && !i.shortage && i.productName === '白蝦'); window._q0 = n.pickQty; n.pickQty = 40; shortPick(); }); await mp.waitForTimeout(300);
H.check('件數超過 30：跳出計算機鍵盤（沒有打字框）', await mp.isVisible('#pad-val') && (await mp.$$('#short-pad input')).length === 0);
for (const k of ['4', '5']) await mp.click(`#short-pad .pad-keys button:text-is("${k}")`);
H.check('按 4、5 顯示 45', (await mp.innerText('#pad-val')).trim() === '45');
await mp.click('#short-pad .pad-ok'); await mp.waitForTimeout(200);
H.check('比要的還多：提醒、不存', (await mp.innerText('#pad-msg')).includes('要比 40 少') && await mp.isVisible('#short-pad'));
await mp.click('#short-pad button:text-is("刪一格")');
H.check('刪一格：剩 4', (await mp.innerText('#pad-val')).trim() === '4');
await mp.click('#short-pad .pad-cancel');
await mp.evaluate(() => { pickingItems.find(i => i.productName === '白蝦').pickQty = window._q0; shortPick(); }); await mp.waitForTimeout(300);
await mp.click('#short-pad button:text-is("6")'); await mp.waitForTimeout(1500);
const w1 = await H.one('waves', W.waveNo);
H.check('點 6：記下拿到 6 件、不夠 2 件', (w1.shortLog || []).some(e => e.qty === 2 && e.productName === '白蝦') && (w1.pickLog || []).some(e => e.productName === '白蝦' && e.qty === 6), JSON.stringify([w1.shortLog, w1.pickLog]));
H.check('手機顯示「拿 6，不夠 2」，白蝦不會再叫人去拿', (await mp.innerText('#picking-scan-result')).includes('不夠 2') && !(await mp.evaluate(() => pickingItems.some(i => !i.completed && !i.shortage && i.productName === '白蝦'))));
if (first !== '透抽') { await mp.click('#picking-next .pk-go'); await mp.waitForTimeout(800); }

// ---------- 全部拿完：按「完成出貨」（不再跳確認視窗）----------
const allDone = await mp.innerText('#picking-next');
H.check('揀完、有不夠的：寫「揀完了，有 1 項不夠」，按鈕是「開始分貨」（兩家一起揀）', allDone.includes('揀完了') && allDone.includes('有 1 項不夠') && allDone.includes('開始分貨') && !allDone.includes('全部拿完') && !allDone.includes('完成出貨'), allDone);
const dz = M.log.dialogs.length;
await mp.click('#picking-next .pk-go'); await mp.waitForTimeout(800);
const panel = await mp.innerText('#picking-next');
H.check('缺貨畫面：預設先開單的先給，列出會少的那家（好市多 白蝦 給 1 件），沒有跳確認視窗', panel.includes('有 1 項不夠') && panel.includes('先開單的先給') && panel.includes('好市多') && /訂 3\s*給 1/.test(panel) && !panel.includes('海霸王') && M.log.dialogs.length === dz, panel);
if (process.env.SHOT_DIR) await mp.screenshot({ path: process.env.SHOT_DIR + '/short-panel.png', fullPage: true });
H.check('缺貨畫面只有一顆大的「改分法」（沒有「好，完成」），還沒完成', !(await mp.$('#short-labels-ok')) && !(await mp.$('#short-ok-btn')) && await mp.isVisible('#short-edit-btn') && (await H.one('waves', W.waveNo)).status !== 'done');
// 現場決定：海霸王 3、好市多 3
await mp.click('#short-edit-btn'); await mp.waitForTimeout(300);
H.check('按「改分法」：每家一格，預設海霸王 5、好市多 1', JSON.stringify(await mp.$$eval('.alloc-in', e => e.map(x => x.value))) === JSON.stringify(['5', '1']) && !(await mp.isDisabled('#short-done-btn')));
H.check('改分法用按的：每家只有「－」，數字不能打字', (await mp.$$('.alloc-minus')).length === 2 && (await mp.$$('.alloc-plus')).length === 0 && await mp.$eval('.alloc-in', e => e.readOnly));
const minus = await mp.$$('.alloc-minus');
H.check('海霸王已經給滿（5/5）：好市多的「－」不能按（少的那件沒人能收）', await minus[1].isDisabled());
await minus[0].click(); await mp.waitForTimeout(200);   // 海霸王 5→4，好市多自動 1→2
H.check('海霸王按一下「－」：少的那件自動移給好市多（4、2），加起來還是 6、可以完成', JSON.stringify(await mp.$$eval('.alloc-in', e => e.map(x => x.value))) === JSON.stringify(['4', '2']) && !(await mp.isDisabled('#short-done-btn')));
await minus[0].click(); await mp.waitForTimeout(200);   // 海霸王 3、好市多 3（訂 3，給滿了）
H.check('再按一下：海霸王 3、好市多 3；好市多給滿了，海霸王的「－」就不能再按', JSON.stringify(await mp.$$eval('.alloc-in', e => e.map(x => x.value))) === JSON.stringify(['3', '3']) && await minus[0].isDisabled());
if (process.env.SHOT_DIR) await mp.screenshot({ path: process.env.SHOT_DIR + '/short-edit.png', fullPage: true });
H.check('改成海霸王 3、好市多 3：可以完成', !(await mp.isDisabled('#short-done-btn')) && (await mp.innerText('#picking-next')).includes('分完了'));
await mp.click('#short-done-btn'); await mp.waitForTimeout(2500);
const wd = await H.one('waves', W.waveNo);
const so = Object.fromEntries((await H.all('salesOrders')).map(o => [o.orderNo, o]));
H.check('完成：照現場分法出貨（海霸王白蝦 3、好市多白蝦 3）；缺的不變成欠貨', wd.status === 'done' && so['A-1'].status === 'shipped' && so['A-2'].status === 'shipped' && !so['A-1'].backorderItems && !so['A-2'].backorderItems &&
  JSON.stringify((wd.shipped || []).map(x => x.orderNo + ':' + x.items.map(i => i.productName + i.qty).join('+'))) === JSON.stringify(['A-1:白蝦3', 'A-2:白蝦3+透抽2']), JSON.stringify([wd.shipped, so['A-1'], so['A-2']]));
H.check('海霸王標「要改鼎新」（白蝦 5→3）；好市多出齊不用改', so['A-1'].erpFixNeeded === true && so['A-1'].shortShipped[0].want === 5 && so['A-1'].shortShipped[0].got === 3 && !so['A-2'].erpFixNeeded, JSON.stringify([so['A-1'].shortShipped, so['A-2'].erpFixNeeded]));
H.check('波次記下現場的分法和誰少出', wd.allocOverride && (wd.shortOrders || []).length === 1 && wd.shortOrders[0].customer === '海霸王' && wd.shortOrders[0].got === 3, JSON.stringify([wd.allocOverride, wd.shortOrders]));
H.check('兩家一起揀：完成後直接進分貨畫面（不用再按「分貨」）', /分貨\s*0\s*\/ 2 家/.test(await mp.innerText('#picking-next')), await mp.innerText('#picking-next'));
await mp.click('#picking-next button:has-text("回上一頁")'); await mp.waitForTimeout(400);
const fin = await mp.innerText('#picking-next');
H.check('完成畫面：大字「完成」、「印標籤（2 張）」大按鈕、小字寫缺的不補', fin.includes('完成') && fin.includes('缺的不補') && fin.includes('印標籤（2 張）'), fin);
if (process.env.SHOT_DIR) await mp.screenshot({ path: process.env.SHOT_DIR + '/finish-panel.png' });
await mp.evaluate(() => { window.print = () => { window.__printed = document.getElementById('label-print-area').innerHTML; }; });
await mp.click('text=印標籤（'); await mp.waitForTimeout(1200);
const printed = await mp.evaluate(() => window.__printed || '');
H.check('手機印標籤：一張訂單一張，件數是實際出貨的（海霸王白蝦 3 件、註明缺貨 訂 5 出 3；好市多白蝦 3 件）', (printed.match(/class="label"/g) || []).length === 2 &&
  /白蝦 50\/60<\/span><strong>3 件/.test(printed) && printed.includes('缺貨：訂 5，出 3') && printed.includes('break-before:page') && !printed.includes('page-break-after:always'), printed.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 300));
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
H.check('首頁待辦：業務要改鼎新 1（海霸王 白蝦 5→3）', /業務要改鼎新\s*1/.test(home) && home.includes('海霸王（A-1）白蝦 5→3'), home);
await D.page.click('#home-todos > div:has-text("業務要改鼎新")'); await D.page.waitForTimeout(1200);
const fx = await D.page.innerText('#modal-erp-fix').catch(() => '');
if (process.env.SHOT_DIR) await D.page.screenshot({ path: process.env.SHOT_DIR + '/erp-fix.png' });
H.check('按「業務要改鼎新」：跳出清單，寫要做什麼、海霸王 A-1 白蝦 訂 5 → 出 3（少 2）、可以複製新的給業務', fx.includes('要做的事') && fx.includes('海霸王') && fx.includes('A-1') && fx.includes('訂 5 → 出 3（少 2）') && fx.includes('複製新的給業務（'), fx.slice(0, 300));
H.check('複製的文字可以直接貼給業務', (await D.page.evaluate(() => { window._copied = null; return erpFixText(window._erpFixList); })).includes('──────────\nA-1\n海霸王\n白蝦 50/60：訂 5 → 出 3（少 2）'));
await D.page.evaluate(() => WMS.closeModal('modal-erp-fix'));

// ---------- 缺的不補；鼎新改好匯入後提醒消失 ----------
const wv = await D.page.evaluate(async () => { await loadOrdersFromFirebase(); return window._orderData.orders.filter(window.orderWaveable).map(o => o.orderNo); });
H.check('缺的貨不會再排波次', !wv.includes('A-1'), JSON.stringify(wv));
const r2 = await pushReport('每日客戶銷貨明細表_1100.xlsx', [HEAD, ['2026/09/28', 'A-1', '海霸王', '白蝦', '50/60', 3, '件', '全日'], rows[2], rows[3]]);
for (let i = 0; i < 30; i++) { await D.page.waitForTimeout(500); const x = await H.one('erpInbox', r2.id); if (x && ['done', 'attention', 'error'].includes(x.status)) break; }
await B.waitForTimeout(1500);
H.check('業務在鼎新把海霸王改成 3 件、匯入後：提醒自動消失（看板不再顯示）', (await H.all('salesOrders')).find(o => o.orderNo === 'A-1').erpFixNeeded === false && !(await B.innerText('#erp-alert')).includes('缺貨少出'), await B.innerText('#erp-alert'));

// ---------- 辦公室自動印（手機連不上標籤機時）----------
await H.nav(D.page, 'wave-picking'); await D.page.waitForTimeout(800);
D.page.__dialogPlan = [true];
await D.page.evaluate(() => toggleWaveSettings(true)); await D.page.click('#btn-label-mode'); await D.page.waitForTimeout(1200);
H.check('主管切成「標籤：辦公室自動印」，出現「這台電腦自動印標籤」', (await H.one('settings', 'labelPrint')).mode === 'office' && (await D.page.innerText('#btn-label-mode')).includes('辦公室自動印') && await D.page.isVisible('#chk-auto-label'));
D.page.__dialogPlan = [true];
await D.page.check('#chk-auto-label'); await D.page.waitForTimeout(300);
const r3 = await pushReport('每日客戶銷貨明細表_1300.xlsx', [HEAD, ['2026/09/28', 'B-1', '全聯', '透抽', 'L', 4, '件', '合順']]);
for (let i = 0; i < 30; i++) { await D.page.waitForTimeout(500); const x = await H.one('erpInbox', r3.id); if (x && ['done', 'attention', 'error'].includes(x.status)) break; }
const W2 = (await H.all('waves')).find(w => (w.orders || []).some(o => o.orderNo === 'B-1'));
await mp.evaluate(() => goBack()); await mp.evaluate(() => openPage('picking')); await mp.waitForTimeout(600);
await mp.selectOption('#picking-wave-select', W2.waveNo); await mp.waitForTimeout(1000);
await tapPad(3);   // 透抽要 4 只拿到 3
await mp.click('#picking-next .pk-go'); await mp.waitForTimeout(800);   // 完成出貨
await mp.click('#short-edit-btn'); await mp.waitForTimeout(300); await mp.click('#short-done-btn'); await mp.waitForTimeout(3000);   // 改分法裡照預設分法，好，完成
const fin2 = await mp.innerText('#picking-next');
H.check('辦公室模式：手機完成後寫「標籤在辦公室自動印出」，沒有手機列印按鈕', fin2.includes('辦公室自動印出') && !fin2.includes('印標籤（'), fin2);
const w2 = await H.one('waves', W2.waveNo);
const frame = await D.page.evaluate(() => { const f = document.querySelector('.auto-label-frame'); return f ? f.contentDocument.body.innerHTML : ''; });
H.check('辦公室電腦自動印出標籤（沒有人按），件數是實際出貨的（透抽 3 件）；記下是哪台印的', !!w2.labelAutoPrintedAt && w2.labelsPrintedOn === 'office' && frame.includes('全聯') && frame.includes('3 件'), JSON.stringify([w2.labelAutoPrintedAt, frame.replace(/<[^>]+>/g, ' ').slice(0, 120)]));

H.check('沒有頁面錯誤', D.log.errors.length === 0 && M.log.errors.length === 0, JSON.stringify(D.log.errors.concat(M.log.errors)));
// ---------- 手動標「已經改好了」 ----------
await H.admin(async d => H.setDoc(H.doc(d, 'salesOrders', 'SO-FIX'), { orderNo: 'B-9', customer: '測試客戶', status: 'shipped', erpFixNeeded: true, shortShipped: [{ productName: '干貝', spec: 'S', want: 4, got: 1, short: 3 }], items: [] }));
await D.page.evaluate(() => openErpFixList());
await D.page.waitForSelector('#modal-erp-fix .ds-pick-row:has-text("測試客戶") button:has-text("已經改好了")', { timeout: 8000 });
await D.page.click('#modal-erp-fix .ds-pick-row:has-text("測試客戶") button:has-text("已經改好了")');
for (let i = 0; i < 20; i++) { await D.page.waitForTimeout(300); if ((await H.one('salesOrders', 'SO-FIX')).erpFixNeeded === false && !(await D.page.innerText('#modal-erp-fix').catch(() => '')).includes('測試客戶')) break; }
H.check('按「已經改好了」：這張單從清單拿掉（記下誰改的）', (await H.one('salesOrders', 'SO-FIX')).erpFixNeeded === false && !(await D.page.innerText('#modal-erp-fix')).includes('測試客戶'), JSON.stringify([await H.one('salesOrders', 'SO-FIX'), D.log.dialogs.slice(-3), D.log.errors]));
await H.close(); process.exit(0);
