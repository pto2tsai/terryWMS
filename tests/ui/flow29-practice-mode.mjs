// 練習模式：還沒有儲位、庫存不準的時候，讓現場先習慣用波次和手機
//   揀貨單照訂單數量列出（不看庫存、不標缺貨），拿好按「✓ 拿好了」；完成波次不扣庫存，訂單照常出貨
//   只有主管能切換；鼎新改單的「放回」一樣會出現
import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';
import { pushReport } from './erp-gs.mjs';
const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
await H.resetData(async d => { await baseSeed(d);
  // 庫存不準：白蝦只有 5 件（訂單要 10），透抽完全沒有
  await H.setDoc(H.doc(d, 'pallets', 'P1'), { palletId: 'P1', company: '崇文', productName: '白蝦', spec: '50/60', quantity: 5, locationId: 'OTHER', expiryDate: '2027-06-01' });
});
const HEAD = ['銷貨日期', '銷貨單號', '客戶全名', '品名', '規格', '銷貨數量', '單位', '備註'];
const file = lines => [HEAD].concat(lines.map(([no, name, spec, q]) => ['2026/09/25', no, '客戶' + no, name, spec, q, '件', '黑貓']));
const waitInbox = async (pg, id) => { let r; for (let i = 0; i < 30; i++) { await pg.waitForTimeout(500); r = await H.one('erpInbox', id); if (r && ['done', 'attention', 'error'].includes(r.status)) break; } return r; };

const O = await H.openApp(base, USERS.op);            // 一般人員：不能切換
await O.page.waitForTimeout(1500);
await H.nav(O.page, 'wave-picking'); await O.page.waitForTimeout(500);
const ob = await O.page.evaluate(() => { const b = document.getElementById('btn-practice-mode'); return [b.style.display, b.disabled]; });
H.check('一般人員看不到練習模式開關（還沒開的時候）', ob[0] === 'none', JSON.stringify(ob));

const D = await H.openApp(base, USERS.sup);           // 主管的電腦（也負責自動匯入）
const M = await H.openApp(base, USERS.op2, { mobile: true });
await D.page.waitForTimeout(1500); await M.page.waitForTimeout(1500);
await H.nav(D.page, 'wave-picking'); await D.page.waitForTimeout(500);
D.page.__dialogPlan = [true];
await D.page.evaluate(() => toggleWaveSettings(true)); await D.page.click('#btn-practice-mode'); await D.page.waitForTimeout(1200);
const st = await H.one('settings', 'practice');
H.check('主管按開關 → 練習模式打開（記下是誰開的）', st && st.enabled === true && st.updatedBy, JSON.stringify(st));
H.check('電腦版開關顯示「練習模式：開」', (await D.page.innerText('#btn-practice-mode')).includes('開'));

// ---------- 訂單進來 ----------
let r = await pushReport('每日客戶銷貨明細表_0900.xlsx', file([['A-1', '白蝦', '50/60', 10], ['A-2', '透抽', 'L', 6]]));
await waitInbox(D.page, r.id);
const W = (await H.all('waves'))[0];
H.check('訂單照常自動建好波次', W && W.totalQty === 16, JSON.stringify(W && W.totalQty));

const desk = await D.page.evaluate(w => { generatePickingListV2(w); return window._waveData.pickingList.map(i => [i.locationId, i.productName, i.pickQty, !!i.shortage]); }, W);
H.check('電腦版揀貨清單：每一行有「✓ 拿好了」按鈕', (await D.page.$$eval('#wave-picking-list button', bs => bs.filter(b => b.innerText.includes('拿好了')).length)) === 2);
H.check('揀貨單照訂單數量列出，不標庫存不足（庫存只有 5 件、透抽沒有庫存也一樣）', JSON.stringify(desk.map(x => x.slice(1)).sort()) === JSON.stringify([['白蝦', 10, false], ['透抽', 6, false]]) && desk.every(x => x[0] === '照訂單揀'), JSON.stringify(desk));

const mp = M.page;
await mp.evaluate(() => openPage('picking')); await mp.waitForTimeout(400);
await mp.selectOption('#picking-wave-select', W.waveNo); await mp.waitForTimeout(1000);
const n0 = await mp.innerText('#picking-next');
H.check('手機：上方「練習」標記，大字顯示品名、拿幾件、「✓ 拿好了」按鈕', n0.includes('練習') && n0.includes('拿好了') && /拿 (10|6) 件/.test(n0), n0);
H.check('手機：拿這一項的同時，提醒「下一項」是什麼品項、幾件', /下一項：(白蝦|透抽)/.test(n0) && /下一項：.*(6|10) 件/.test(n0), n0);
H.check('手機：練習模式不顯示掃描框', !(await mp.isVisible('#picking-scan-box')));
// 先跳過：現在這項排到最後，先拿下一項（順序跟現場不一樣時不會卡住）
const nameOf = t => (t.match(/(白蝦|透抽)/) || [])[1];
const cur0 = nameOf(n0.split('拿 ')[0].split('\n').slice(-3).join(' ')) || nameOf(n0);
await mp.click('#picking-next .pk-skip'); await mp.waitForTimeout(400);
const n0b = await mp.innerText('#picking-next');
const other = cur0 === '白蝦' ? '透抽' : '白蝦';
H.check('手機：按「先跳過」→ 先拿下一項，跳過的變成「下一項」', n0b.split('下一項')[0].includes(other) && n0b.includes('下一項：' + cur0), n0b);
await mp.click('#picking-next .pk-skip'); await mp.waitForTimeout(400);
H.check('再跳過一次：回到原本那一項', (await mp.innerText('#picking-next')).split('下一項')[0].includes(cur0));
// 全部清單點任一項：那一項變成現在要拿的
await mp.click('#picking-list-toggle'); await mp.waitForTimeout(200);
await mp.click('#picking-list .list-item.clickable:has-text("' + other + '")'); await mp.waitForTimeout(400);
H.check('全部清單點「' + other + '」：它變成現在要拿的一項', (await mp.innerText('#picking-next')).split('下一項')[0].includes(other));
await mp.click('#picking-list .list-item.clickable:has-text("' + cur0 + '")'); await mp.waitForTimeout(400);
H.check('再點回「' + cur0 + '」：換回來', (await mp.innerText('#picking-next')).split('下一項')[0].includes(cur0));
await mp.click('#picking-list-toggle'); await mp.waitForTimeout(200);
await mp.click('#picking-next .pk-go'); await mp.waitForTimeout(800);
const w1 = await H.one('waves', W.waveNo);
H.check('按「拿好了」：記下揀了這一項', (w1.pickLog || []).length === 1, JSON.stringify(w1.pickLog));

// ---------- 鼎新改單：白蝦 10→7（已經拿了的話要放回）----------
const first = w1.pickLog[0];
r = await pushReport('每日客戶銷貨明細表_1100.xlsx', file([['A-1', '白蝦', '50/60', first.productName === '白蝦' ? 7 : 10], ['A-2', '透抽', 'L', first.productName === '透抽' ? 4 : 6]]));
await waitInbox(D.page, r.id); await mp.waitForTimeout(1500);
const n1 = await mp.innerText('#picking-next');
H.check('鼎新減量：手機出現「放回」和「✓ 放回了」按鈕', n1.includes('放回') && n1.includes('放回了'), n1);
for (let i = 0; i < 3; i++) { const b = await mp.$('#picking-next button[onclick^="confirmCurrentPick"]'); if (!b) break; await b.click(); await mp.waitForTimeout(800); }
H.check('全部按完：顯示「全部拿完」', (await mp.innerText('#picking-next')).includes('全部拿完'));

M.page.__dialogPlan = [true, true];
const dlg0 = M.log.dialogs.length;
await mp.evaluate(async () => { await completePickingWave(); }); await mp.waitForTimeout(2000);
const wd = await H.one('waves', W.waveNo);
const so = Object.fromEntries((await H.all('salesOrders')).map(o => [o.orderNo, o]));
const p1 = await H.one('pallets', 'P1');
H.check('完成波次：兩張單都出貨完成（不會因為庫存不夠變成部分出貨）', wd.status === 'done' && wd.practice === true && so['A-1'].status === 'shipped' && so['A-2'].status === 'shipped', JSON.stringify([wd.status, wd.practice, so['A-1'].status, so['A-2'].status, M.log.dialogs.slice(dlg0).map(x => x.msg.slice(0, 120))]));
H.check('庫存沒有扣（P1 還是 5 件）、沒有出庫異動記錄', p1 && p1.quantity === 5 && !(await H.all('inventoryLogs')).some(l => (l.note || '').includes(W.waveNo)), JSON.stringify(p1));
H.check('完成畫面寫「練習模式：庫存沒有扣」', (await mp.innerText('#picking-next')).includes('庫存沒有扣'));

// ---------- 關掉：回到照庫存分配 ----------
D.page.__dialogPlan = [true];
await D.page.evaluate(() => toggleWaveSettings(true)); await D.page.click('#btn-practice-mode'); await D.page.waitForTimeout(1200);
H.check('再按一次關掉', (await H.one('settings', 'practice')).enabled === false && (await D.page.innerText('#btn-practice-mode')).includes('關'));
const after = await D.page.evaluate(() => window.buildWavePickingList({ summary: [{ productName: '白蝦', spec: '50/60', totalQty: 8, orders: [] }] }, window.currentPallets()).map(i => [i.locationId, i.pickQty, !!i.shortage]));
H.check('關掉後：照庫存分配（OTHER 5 件，缺 3 件標庫存不足）', JSON.stringify(after) === JSON.stringify([['OTHER', 5, false], ['⚠️ 庫存不足', 3, true]]), JSON.stringify(after));

H.check('沒有頁面錯誤', O.log.errors.length === 0 && D.log.errors.length === 0 && M.log.errors.length === 0, JSON.stringify(O.log.errors.concat(D.log.errors, M.log.errors)));
await H.close(); process.exit(0);
