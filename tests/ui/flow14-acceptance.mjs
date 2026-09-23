// 上線驗收腳本：與 README「上線驗收」的人工步驟完全相同（桌機＋手機同時操作，只動「測試品」）
// 入庫（排程→手機上架入帳、直接入庫→手機上架）→ 波次出貨（ERP 匯入→手機揀貨完成）→ 調撥出／入 → 盤點 → 清空
import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';
import path from 'path';

const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
await H.resetData(async d => { await baseSeed(d);
  await H.setDoc(H.doc(d, 'productMaster', 'PMT'), { code: 'TEST001', name: '測試品', spec: 'TEST', palletCapacity: 60, shelfLife: 24, company: '崇文' });
  // 別的真實庫存：確認測試過程不會動到
  await H.setDoc(H.doc(d, 'pallets', 'REAL1'), { palletId: 'REAL1', productName: '白蝦', spec: '50/60', company: '崇文', quantity: 33, locationId: 'I-A-01-2F', expiryDate: '2027-01-01' });
});
const TEST = p => p.productName === '測試品';
const testPallets = async () => (await H.all('pallets')).filter(TEST);

const D = await H.openApp(base, USERS.op);                     // 電腦
const M = await H.openApp(base, USERS.op2, { mobile: true });   // 手機（堆高機）
const mgo = async p => { await M.page.evaluate(() => goBack()); await M.page.click(`[onclick="openPage('${p}')"]`); await M.page.waitForTimeout(500); };
const mscan = async (id, v) => { await M.page.fill('#' + id, v); await M.page.press('#' + id, 'Enter'); await M.page.waitForTimeout(900); };
const mtxt = id => M.page.innerText('#' + id);

async function fillInbound(qty, loc) {
  await H.nav(D.page, 'unified-inbound');
  await D.page.click("button[onclick=\"openProductSelectModal('inbound')\"]"); await D.page.waitForTimeout(600);
  await D.page.click("#modal-product-select [onclick^=\"selectProductFromModal('TEST001'\"]"); await D.page.waitForTimeout(600);
  if (!(await D.page.isVisible('#btn-type-FG'))) await D.page.click('#btn-more-options');
  await D.page.click('#btn-type-FG');
  await D.page.fill('#in-batch', 'TEST01'); await D.page.fill('#in-exp-year', '2027'); await D.page.fill('#in-exp-month', '12'); await D.page.fill('#in-exp-day', '31');
  await D.page.fill('#in-qty', String(qty));
  await D.page.fill('#in-loc', loc); await D.page.dispatchEvent('#in-loc', 'input');
}

// ===== 1a. 入庫（排程）：電腦建立待執行入庫單 → 手機入庫任務掃儲位 → 入帳 =====
await fillInbound(50, 'I-A-01-1F');
await D.page.click("button[onclick=\"toggleAdvancedOptions()\"]"); await D.page.waitForTimeout(300);
await D.page.click("button[onclick=\"createInboundOrder()\"]"); await D.page.waitForTimeout(2500);
const io = (await H.all('inboundOrders')).filter(TEST);
const tk = await H.all('inboundTasks');
H.check('1a 電腦：建立待執行入庫單（類型＝成品、不需財務核准）並發布手機任務', io.length === 1 && io[0].status === 'pending' && io[0].type === 'FG' && io[0].approvalStatus === 'not_required' && tk.length === 1 && tk[0].orderId === io[0]._id, JSON.stringify({ io: io.map(o => o.status), tk }));
await mgo('inbound');
H.check('1a 手機：入庫任務出現 1 筆', (await M.page.$$eval('#inbound-list .list-item', e => e.length)) === 1);
await M.page.click('#inbound-list .list-item'); await M.page.waitForTimeout(300);
await mscan('inbound-loc-scan', 'I-A-01-1F');
let tp = await testPallets();
H.check('1a 手機掃儲位 → 入帳：測試品 50 件 @ I-A-01-1F', tp.length === 1 && tp[0].quantity === 50 && tp[0].locationId === 'I-A-01-1F', JSON.stringify(tp.map(p => [p.palletId, p.quantity, p.locationId])) + ' ' + await mtxt('inbound-result'));
H.check('1a 入庫單已完成（電腦待執行清單不會再出現）', (await H.one('inboundOrders', io[0]._id)).status === 'completed');

// ===== 1b. 入庫（直接）：電腦直接入庫到 TEMP-IN → 手機上架 =====
await fillInbound(20, 'TEMP-IN');
await D.page.click('#btn-inbound-direct', { force: true }); await D.page.waitForTimeout(2500);
tp = await testPallets();
const tempP = tp.find(p => p.locationId === 'TEMP-IN');
H.check('1b 電腦直接入庫：測試品 20 件 @ TEMP-IN', !!tempP && tempP.quantity === 20, JSON.stringify(tp.map(p => [p.palletId, p.quantity, p.locationId])));
await mgo('shelve');
await mscan('shelve-loc', 'IA021');                 // 縮寫儲位
await mscan('shelve-pallet', tempP.palletId.slice(-3));   // 只打尾碼
await M.page.click('#shelve-step3 button.success'); await M.page.waitForTimeout(900);
tp = await testPallets();
H.check('1b 手機上架：TEMP-IN → I-A-02-1F', tp.find(p => p.palletId === tempP.palletId).locationId === 'I-A-02-1F', await mtxt('shelve-result'));

// ===== 2. 波次出貨：電腦匯入 ERP 訂單（自動建波次）→ 手機揀貨 → 手機完成波次 =====
const xlsx = path.join(H.REPO, 'docs', 'acceptance-test-order.xlsx');   // 給使用者的同一份檔案
await H.nav(D.page, 'wave-picking');
await D.page.setInputFiles('#order-excel-import', xlsx); await D.page.waitForTimeout(3500);
const waves = await H.all('waves'); const so = await H.all('salesOrders');
H.check('2 電腦匯入訂單並自動建立波次', waves.length === 1 && so.length === 1 && so[0].status === 'inWave', JSON.stringify({ w: waves.map(w => w.waveNo), so: so.map(o => o.status) }) + JSON.stringify(D.log.dialogs.slice(-2).map(x => x.msg.slice(0, 120))));
await mgo('picking');
await M.page.selectOption('#picking-wave-select', waves[0]._id); await M.page.waitForTimeout(900);
const items = await M.page.evaluate(() => pickingItems.map(i => [i.palletId, i.locationId, i.pickQty, !!i.shortage]));
H.note('揀貨清單: ' + JSON.stringify(items));
H.check('2 揀貨清單只有測試品、共 30 件、沒有缺貨', items.length > 0 && items.every(i => !i[3]) && items.reduce((s, i) => s + i[2], 0) === 30, JSON.stringify(items));
for (const it of items) await mscan('picking-scan', it[1]);   // 掃儲位標籤
M.page.__dialogPlan = [true, true];
await M.page.click('#picking-actions button'); await M.page.waitForTimeout(2000);
tp = await testPallets();
const w2 = await H.one('waves', waves[0]._id), so2 = await H.one('salesOrders', so[0]._id);
H.check('2 手機完成波次：波次完成、訂單已出貨、測試品 70 → 40', w2.status === 'done' && so2.status === 'shipped' && tp.reduce((s, p) => s + p.quantity, 0) === 40, JSON.stringify([w2.status, so2.status, tp.map(p => [p.locationId, p.quantity])]));

// ===== 3. 調撥：出庫 10 件到外倉 → 再調撥入庫 10 件回來（手機上架入帳）=====
await H.nav(D.page, 'transfer'); await D.page.waitForTimeout(800);
const modalClicks = async () => D.page.$$eval('[id*="transfer"][id*="modal"] [onclick], #modal-transfer-product [onclick]', e => e.filter(x => x.offsetParent !== null).map(x => x.getAttribute('onclick')));
async function pickFromModal(prefer, qty) {
  await D.page.click('#btn-open-transfer-modal'); await D.page.waitForTimeout(1200);
  for (let step = 0; step < 6; step++) {
    const c = await modalClicks();
    const inputs = await D.page.$$eval('input', e => e.filter(x => x.offsetParent !== null && /transfer|tf-|modal/i.test(x.id)).map(x => x.id + ':' + x.type));
    const qtyInput = inputs.find(i => /qty/i.test(i) && i.includes('number'));
    if (qtyInput && c.some(x => /add|Cart/i.test(x))) {
      await D.page.fill('#' + qtyInput.split(':')[0], String(qty));
      await D.page.click('[onclick="' + c.find(x => /^add/i.test(x)) + '"]'); await D.page.waitForTimeout(600);
      const conf = (await modalClicks()).find(x => /^confirm/i.test(x)); if (conf) { await D.page.click('[onclick="' + conf + '"]'); await D.page.waitForTimeout(800); }
      return true;
    }
    const pick = c.find(x => prefer.test(x)) || c.find(x => /^select/i.test(x));
    if (!pick) return false;
    await D.page.click('[onclick="' + pick.replace(/"/g, '\\"') + '"]'); await D.page.waitForTimeout(700);
  }
  return false;
}
await D.page.click('#btn-mode-out'); await D.page.waitForTimeout(600);
await D.page.selectOption('#transfer-source', 'EXT-TP'); await D.page.waitForTimeout(800);
await pickFromModal(/測試品|TEST/, 10);
await D.page.click('#btn-execute-transfer'); await D.page.waitForTimeout(3000);
let ext = (await H.all('externalStock')).filter(TEST);
tp = await testPallets();
H.check('3a 調撥出庫：本倉 40 → 30、台北外倉 +10', tp.reduce((s, p) => s + p.quantity, 0) === 30 && ext.length === 1 && ext[0].quantity === 10, JSON.stringify({ tp: tp.map(p => p.quantity), ext: ext.map(e => e.quantity) }));
await H.nav(D.page, 'transfer'); await D.page.waitForTimeout(800);
await D.page.click('#btn-mode-in'); await D.page.waitForTimeout(500);
await D.page.selectOption('#transfer-source', 'EXT-TP'); await D.page.waitForTimeout(800);
await pickFromModal(/測試品|TEST/, 10);
await D.page.click('#btn-execute-transfer'); await D.page.waitForTimeout(3000);
ext = (await H.all('externalStock')).filter(TEST);
H.check('3b 調撥入庫：外倉 10 → 0，產生手機入庫任務', ext.length === 0 && (await H.all('inboundTasks')).filter(t => t.status === 'pending').length === 1, JSON.stringify(ext));
await mgo('inbound');
await M.page.click('#inbound-list .list-item'); await M.page.waitForTimeout(300);
await mscan('inbound-loc-scan', 'I-A-03-1F');   // 待指定 → 以掃到的儲位入帳
tp = await testPallets();
H.check('3b 手機上架入帳：測試品 10 件 @ I-A-03-1F，本倉合計 40', tp.some(p => p.locationId === 'I-A-03-1F' && p.quantity === 10) && tp.reduce((s, p) => s + p.quantity, 0) === 40, JSON.stringify(tp.map(p => [p.locationId, p.quantity])) + ' ' + await mtxt('inbound-result'));

// ===== 4. 盤點：電腦盤 I-A 第 1~3 排（一板少 1）→ 手機盤點清空所有測試品 =====
await H.nav(D.page, 'stocktake'); await D.page.waitForTimeout(600);
await D.page.selectOption('#st-zone', 'I-A'); await D.page.fill('#st-row-from', '1'); await D.page.fill('#st-row-to', '3');
await D.page.click("button[onclick=\"loadStocktake()\"]"); await D.page.waitForTimeout(600);
const stRows = await D.page.evaluate(() => window._stocktake.rows.map(r => [r.productName, r.locationId, r.book]));
H.note('盤點清單: ' + JSON.stringify(stRows));
const idx = stRows.findIndex(r => r[0] === '測試品' && r[1] === 'I-A-01-1F');
await D.page.click("button[onclick=\"fillStocktakeBook()\"]");
const inputs = await D.page.$$('.st-count');
await inputs[idx].fill(String(stRows[idx][2] - 1)); await inputs[idx].dispatchEvent('input');
await D.page.click("button[onclick=\"submitStocktake()\"]"); await D.page.waitForTimeout(2500);
tp = await testPallets();
H.check('4 電腦盤點：I-A-01-1F 少 1 件已調整，其他照帳面', tp.find(p => p.locationId === 'I-A-01-1F').quantity === stRows[idx][2] - 1 && (await H.one('pallets', 'REAL1')).quantity === 33, JSON.stringify(tp.map(p => [p.locationId, p.quantity])));
await mgo('stocktake');
for (const p of tp) {
  await mscan('st-scan', p.palletId);
  M.page.__dialogPlan = [true];   // 實盤 0 會刪除此板 → 確定
  await M.page.fill('#st-qty', '0'); await M.page.press('#st-qty', 'Enter'); await M.page.waitForTimeout(900);
}
H.check('清理：手機盤點把測試品全部盤為 0 → 測試品全部刪除', (await testPallets()).length === 0, JSON.stringify(await testPallets()));
H.check('真實庫存（白蝦 33 件）全程沒被動到', (await H.one('pallets', 'REAL1')).quantity === 33);
const lg = (await H.all('inventoryLogs')).filter(TEST);
H.note('測試品異動記錄: ' + JSON.stringify(lg.map(l => [l.type, l.quantityChange, l.locationId])));
H.check('每一步都有異動記錄（入庫 3、移板 1、出庫、調撥、調整）', ['inbound', 'move', 'outbound', 'adjust'].every(t => lg.some(l => l.type === t)) && lg.some(l => /transfer/.test(l.type)), JSON.stringify([...new Set(lg.map(l => l.type))]));
H.note('errors D: ' + JSON.stringify(D.log.errors) + ' M: ' + JSON.stringify(M.log.errors));
H.check('電腦與手機都沒有頁面錯誤', D.log.errors.length === 0 && M.log.errors.length === 0, JSON.stringify([D.log.errors, M.log.errors]));
await H.close(); process.exit(0);
