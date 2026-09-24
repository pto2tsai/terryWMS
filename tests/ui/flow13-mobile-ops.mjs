// 手機版全部作業走查：入庫任務（上架即入帳）、上架、出庫、移板、併板、盤點、快查、波次完成
import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';

const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
const now = new Date().toISOString();
await H.resetData(async d => { await baseSeed(d);
  const P = (id, o) => H.setDoc(H.doc(d, 'pallets', id), Object.assign({ palletId: id, company: '崇文', palletCapacity: 40, createdAt: now }, o));
  await P('M-01', { productName: '白蝦', spec: '50/60', batchNo: 'B1', expiryDate: '2027-05-01', quantity: 30, locationId: 'TEMP-IN' });
  await P('M-02', { productName: '白蝦', spec: '50/60', batchNo: 'B1', expiryDate: '2027-05-01', quantity: 12, locationId: 'I-A-05-1F' });
  await P('M-03', { productName: '白蝦', spec: '50/60', batchNo: 'B2', expiryDate: '2027-01-01', quantity: 4, locationId: 'I-A-06-1F' });
  await P('M-04', { productName: '透抽', spec: 'L', batchNo: 'T1', expiryDate: '2027-03-01', quantity: 20, locationId: 'J-C-01-1F' });
  await P('M-05', { productName: '透抽', spec: 'L', batchNo: 'T1', expiryDate: '2027-03-01', quantity: 8, locationId: 'J-C-02-1F' });
  await P('M-06', { productName: '魷魚', spec: 'M', batchNo: 'S1', expiryDate: '2027-02-01', quantity: 10, locationId: 'K-A-01-1F' });
  await P('M-07', { productName: '魷魚', spec: 'M', batchNo: 'S1', expiryDate: '2027-02-01', quantity: 6, locationId: 'K-A-01-1F' });   // 同儲位兩板
  // 桌機建立的入庫單與發布到手機的入庫任務
  await H.setDoc(H.doc(d, 'inboundOrders', 'IO1'), { docNo: 'IN-20260923-001', productName: '鮭魚', spec: '2kg', batchNo: 'SA1', expDate: '2027-06-30', quantity: 25, locationId: 'I-B-01-1F', status: 'pending', approvalStatus: 'not_required', type: 'Import', company: '崇文', createdAt: now });
  await H.setDoc(H.doc(d, 'inboundTasks', 'TK1'), { orderId: 'IO1', orderNo: 'IN-20260923-001', palletId: 'IN-20260923-001', productName: '鮭魚', spec: '2kg', batchNo: 'SA1', quantity: 25, locationId: 'I-B-01-1F', status: 'pending', createdAt: now });
  // 舊任務（沒有 orderId）、電腦已先入帳
  await H.setDoc(H.doc(d, 'inboundOrders', 'IO2'), { docNo: 'IN-20260923-002', productName: '干貝', spec: 'S', quantity: 5, locationId: 'I-B-02-1F', status: 'completed', createdAt: now });
  await P('IN-20260923-002', { productName: '干貝', spec: 'S', quantity: 5, locationId: 'TEMP-IN' });
  await H.setDoc(H.doc(d, 'inboundTasks', 'TK2'), { orderNo: 'IN-20260923-002', palletId: 'IN-20260923-002', productName: '干貝', quantity: 5, locationId: 'I-B-02-1F', status: 'pending', createdAt: now + '1' });
  // 波次
  await H.setDoc(H.doc(d, 'salesOrders', 'SO1'), { orderNo: 'SO-1', status: 'inWave', items: [{ productName: '透抽', spec: 'L', packageQty: 5 }] });
  await H.setDoc(H.doc(d, 'waves', 'WV1'), { waveNo: 'WV-M', logistics: '黑貓', status: 'pending', totalQty: 5, orderCount: 1, createdAt: now,
    orders: [{ id: 'SO1', orderNo: 'SO-1' }], summary: [{ productName: '透抽', spec: 'L', totalQty: 5, orders: ['SO-1'] }] });
});

const { page, log } = await H.openApp(base, USERS.op, { mobile: true });
const go = async p => { await page.evaluate(() => goBack()); await page.click(`[onclick="openPage('${p}')"]`); await page.waitForTimeout(400); };
const scan = async (id, v) => { await page.fill('#' + id, v); await page.press('#' + id, 'Enter'); await page.waitForTimeout(700); };
const txt = id => page.innerText('#' + id);
const pal = async () => Object.fromEntries((await H.all('pallets')).map(p => [p._id, p]));
const logs = async () => (await H.all('inventoryLogs'));

H.check('主選單徽章：波次 1、入庫 2', (await txt('badge-picking')) === '1' && (await txt('badge-inbound')) === '2', (await txt('badge-picking')) + '/' + (await txt('badge-inbound')));

// ---------- 手機的「返回」手勢回主選單，不會離開程式 ----------
await page.click(`[onclick="openPage('query')"]`); await page.waitForTimeout(300);
await page.goBack(); await page.waitForTimeout(400);
H.check('手機返回手勢：回到主選單、仍在程式內', (await page.isVisible('#app-main')) && !(await page.isVisible('#page-query')) && page.url().includes('/m/'), page.url());
await page.click(`[onclick="openPage('query')"]`); await page.waitForTimeout(300);
await page.click('#page-query .back-btn'); await page.waitForTimeout(400);
await page.click(`[onclick="openPage('move')"]`); await page.waitForTimeout(400);
H.check('按返回鍵後馬上開別頁不會被關掉', await page.isVisible('#page-move'));
await page.evaluate(() => goBack()); await page.waitForTimeout(300);

// ---------- 入庫任務：掃棧板單 → 掃儲位（和指定不同）→ 入帳 ----------
await go('inbound');
H.check('入庫任務列出 2 筆', (await page.$$eval('#inbound-list .list-item', e => e.length)) === 2);
await scan('inbound-task-scan', 'IN20260923001');   // 省略符號也能對到
H.check('掃棧板單選到任務', (await txt('inbound-task-info')).includes('鮭魚'), await txt('inbound-task-info'));
page.__dialogPlan = [true];   // 儲位不同 → 確定用實際儲位
await scan('inbound-loc-scan', 'ib031');            // 縮寫儲位 → I-B-03-1F
let P1 = await pal();
const salmon = Object.values(P1).find(p => p.palletId === 'IN-20260923-001');
H.check('上架即入帳：棧板建立在實際儲位 I-B-03-1F', salmon && salmon.locationId === 'I-B-03-1F' && salmon.quantity === 25 && salmon.expiryDate === '2027-06-30', JSON.stringify(salmon));
const io1 = await H.one('inboundOrders', 'IO1'); const tk1 = await H.one('inboundTasks', 'TK1');
H.check('入庫單完成、任務完成', io1.status === 'completed' && io1.locationId === 'I-B-03-1F' && tk1.status === 'done' && tk1.confirmedLocation === 'I-B-03-1F', JSON.stringify([io1.status, io1.locationId, tk1.status]));
H.check('入庫異動記錄（帶操作者 email）', (await logs()).some(l => l.type === 'inbound' && l.palletId === 'IN-20260923-001' && l.operatorEmail === USERS.op));
// 電腦已先入帳的舊任務：更新儲位並結案
await page.click('#inbound-list .list-item'); await page.waitForTimeout(300);
await scan('inbound-loc-scan', 'I-B-02-1F');
P1 = await pal();
H.check('電腦已入帳的任務：棧板移到掃描儲位、任務結案', P1['IN-20260923-002'].locationId === 'I-B-02-1F' && (await H.one('inboundTasks', 'TK2')).status === 'done', P1['IN-20260923-002'].locationId + ' ' + await txt('inbound-result'));
H.check('只建立一板（沒有重複入帳）', Object.values(P1).filter(p => p.palletId === 'IN-20260923-002').length === 1);

// ---------- 上架：掃儲位 → 掃棧板 → 修正點數 ----------
await go('shelve');
await scan('shelve-loc', 'IA011');
H.check('縮寫儲位 IA011 → I-A-01-1F', (await txt('shelve-loc-show')) === 'I-A-01-1F', await txt('shelve-loc-show'));
await scan('shelve-pallet', 'm-01');
await page.fill('#shelve-qty', '29'); page.__dialogPlan = [true];
await page.click('#shelve-step3 button.success'); await page.waitForTimeout(800);
P1 = await pal();
H.check('上架：M-01 從 TEMP-IN 到 I-A-01-1F，數量修正為 29', P1['M-01'].locationId === 'I-A-01-1F' && P1['M-01'].quantity === 29, JSON.stringify([P1['M-01'].locationId, P1['M-01'].quantity]));
const L1 = await logs();
H.check('上架寫移板＋點數修正兩筆記錄', L1.some(l => l.type === 'move' && l.palletId === 'M-01' && l.fromLocation === 'TEMP-IN') && L1.some(l => l.type === 'adjust' && l.palletId === 'M-01' && l.quantityChange === -1));

// ---------- 出庫：部分、全部、超量 ----------
await go('outbound');
await scan('out-pallet', 'M-04');
await page.click('#out-quick button:first-child'); await page.click('#out-quick button:first-child');   // +1 +1
await page.fill('#out-note', '樣品');
await page.click('#out-step2 button.success'); await page.waitForTimeout(800);
P1 = await pal();
H.check('出庫 2 件：M-04 20 → 18', P1['M-04'].quantity === 18, P1['M-04'].quantity + ' ' + await txt('out-result'));
await scan('out-pallet', 'M-05');
await page.fill('#out-qty', '9'); await page.click('#out-step2 button.success'); await page.waitForTimeout(800);
H.check('超過庫存會擋下（帳不會變負）', (await txt('out-result')).includes('庫存不足') && (await pal())['M-05'].quantity === 8, await txt('out-result'));
await page.click('#out-quick button:last-child'); await page.click('#out-step2 button.success'); await page.waitForTimeout(800);
H.check('全部出庫 → 棧板刪除', !(await pal())['M-05'], await txt('out-result'));

// ---------- 移板：掃儲位標籤（同儲位兩板 → 讓使用者選）----------
await go('move');
await scan('move-pallet', 'K-A-01-1F');
H.check('儲位有兩板 → 列出選擇', (await page.$$eval('#move-choices .pick-choice', e => e.length)) === 2, await txt('move-result'));
await page.click('#move-choices .pick-choice:nth-child(2)'); await page.waitForTimeout(300);
await scan('move-loc', 'K-A-09-2F');
P1 = await pal();
H.check('移板完成且只動選到的那板', [P1['M-06'].locationId, P1['M-07'].locationId].sort().join() === 'K-A-01-1F,K-A-09-2F', JSON.stringify([P1['M-06'].locationId, P1['M-07'].locationId]));

// ---------- 併板：批號不同 → 擋下；同批號但效期不同 → 提醒後可併，效期取較早 ----------
await go('merge');
await scan('merge-src', 'M-03'); await scan('merge-tgt', 'M-02');
H.check('批號不同擋下（不能合併）', (await txt('merge-result')).includes('批號不同'), await txt('merge-result'));
await H.admin(async d => { const { updateDoc } = await import('firebase/firestore'); await updateDoc(H.doc(d, 'pallets', 'M-03'), { batchNo: (await pal())['M-02'].batchNo || '' }); });
await page.waitForTimeout(800);
await go('merge');
await scan('merge-src', 'M-03'); await scan('merge-tgt', 'M-02');
H.check('同批號、效期不同顯示提醒', (await txt('merge-preview')).includes('效期不同'), await txt('merge-preview'));
await page.click('#merge-step3 button.success'); await page.waitForTimeout(800);
P1 = await pal();
H.check('併板：M-02 = 16 件、效期取較早 2027-01-01、M-03 刪除', P1['M-02'].quantity === 16 && P1['M-02'].expiryDate === '2027-01-01' && !P1['M-03'], JSON.stringify(P1['M-02']));
await scan('merge-src', 'M-04'); await scan('merge-tgt', 'M-06');
H.check('品名不同擋下', (await txt('merge-result')).includes('品名不同'), await txt('merge-result'));

// ---------- 盤點：相符、有差異、盤點期間被異動 ----------
await go('stocktake');
await scan('st-scan', 'M-02'); await page.click('#st-step2 button.secondary'); await page.waitForTimeout(800);   // 與帳面相同
H.check('相符：數量不變、記錄盤點時間', (await pal())['M-02'].quantity === 16 && !!(await pal())['M-02'].lastStocktakeAt);
await scan('st-scan', 'M-04'); await page.fill('#st-qty', '17'); await page.press('#st-qty', 'Enter'); await page.waitForTimeout(800);
H.check('差異：M-04 18 → 17 並寫調整記錄', (await pal())['M-04'].quantity === 17 && (await logs()).some(l => l.type === 'adjust' && l.palletId === 'M-04' && l.quantityChange === -1));
await scan('st-scan', 'M-06');
await H.admin(async d => { const { updateDoc } = await import('firebase/firestore'); await updateDoc(H.doc(d, 'pallets', 'M-06'), { quantity: 11 }); });   // 別人剛改過
await page.fill('#st-qty', '9'); await page.press('#st-qty', 'Enter'); await page.waitForTimeout(800);
H.check('盤點期間被異動 → 不覆蓋、提示重盤', (await pal())['M-06'].quantity === 11 && (await txt('st-result')).includes('重新掃描'), await txt('st-result'));
H.check('本次盤點清單 2 板', (await txt('st-today-count')) === '2 板');

// ---------- 快查：掃儲位標籤 ----------
await go('query');
await scan('query-input', 'I-A-01-1F');
H.check('快查儲位顯示該儲位棧板', (await txt('query-result')).includes('白蝦') && (await txt('query-result')).includes('29'), await txt('query-result'));

// ---------- 波次：揀貨 → 完成（扣庫存、訂單出貨）----------
await go('picking');
await page.selectOption('#picking-wave-select', 'WV1'); await page.waitForTimeout(800);
const items = await page.evaluate(() => pickingItems.map(i => [i.palletId, i.pickQty]));
H.note('揀貨清單: ' + JSON.stringify(items));
const ns = await txt('picking-next');
const first = await page.evaluate(() => { const i = pickingItems.find(x => !x.shortage); return [locationShortCode(i.locationId) || i.locationId, i.productName, i.pickQty]; });
H.check('揀貨「下一站」大字：儲位簡碼、品項、拿幾件', ns.includes('下一站') && ns.includes(first[0]) && ns.includes(first[1]) && ns.includes('拿 ' + first[2] + ' 件'), ns);
for (const it of items) await scan('picking-scan', it[0]);
H.check('全部揀完：下一站顯示「全部揀完」', (await txt('picking-next')).includes('全部揀完'), await txt('picking-next'));
page.__dialogPlan = [true, true];
await page.click('#picking-actions button'); await page.waitForTimeout(1500);
const wv = await H.one('waves', 'WV1'); const so = await H.one('salesOrders', 'SO1');
const tq = Object.values(await pal()).filter(p => p.productName === '透抽').reduce((s, p) => s + p.quantity, 0);
H.check('手機完成波次：波次完成、訂單出貨、透抽 17 → 12', wv.status === 'done' && so.status === 'shipped' && tq === 12, JSON.stringify([wv.status, so.status, tq]));

H.note('dialogs: ' + JSON.stringify(log.dialogs.map(d => d.msg.slice(0, 80))));
H.note('errors: ' + JSON.stringify(log.errors) + JSON.stringify(log.console));
H.check('沒有頁面錯誤', log.errors.length === 0, JSON.stringify(log.errors));
await H.close(); process.exit(0);
