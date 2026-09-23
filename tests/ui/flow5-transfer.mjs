import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';
const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
await H.resetData(async d => { await baseSeed(d);
  await H.setDoc(H.doc(d, 'warehouses', 'W2'), { code: 'EXT-TC', name: '台中外倉', company: '崇文', type: 'external', active: true });
  await H.setDoc(H.doc(d, 'externalStock', 'E1'), { warehouseId: 'EXT-TP', productName: '透抽', spec: 'L', batchNo: 'X', company: '崇文', expiryDate: '2027-08-01', quantity: 20 });
  await H.setDoc(H.doc(d, 'pallets', 'M1'), { palletId: 'M1', productName: '白蝦', spec: '50/60', batchNo: 'B1', company: '崇文', expiryDate: '2027-05-01', quantity: 30, locationId: 'I-A-03-2F', palletCapacity: 40 });
});
const { page, log } = await H.openApp(base, USERS.op);
await H.nav(page, 'transfer'); await page.waitForTimeout(1000);
const modalClicks = async () => page.$$eval('[id*="transfer"][id*="modal"] [onclick], #modal-transfer-product [onclick]', e => e.filter(x => x.offsetParent !== null).map(x => x.getAttribute('onclick')));
async function pickFromModal(prefer, qty) {
  await page.click('#btn-open-transfer-modal'); await page.waitForTimeout(1200);
  for (let step = 0; step < 6; step++) {
    const c = await modalClicks();
    const inputs = await page.$$eval('input', e => e.filter(x => x.offsetParent !== null && /transfer|tf-|modal/i.test(x.id)).map(x => x.id + ':' + x.type));
    H.note('  step ' + step + ': ' + JSON.stringify(c.filter(x => !/close|GoBack|GoToStep/i.test(x)).slice(0, 8)) + ' inputs ' + JSON.stringify(inputs));
    const qtyInput = inputs.find(i => /qty/i.test(i) && i.includes('number'));
    if (qtyInput && c.some(x => /add|Cart/i.test(x))) {
      await page.fill('#' + qtyInput.split(':')[0], String(qty));
      const add = c.find(x => /^add/i.test(x)); await page.click('[onclick="' + add + '"]'); await page.waitForTimeout(600);
      const conf = (await modalClicks()).find(x => /^confirm/i.test(x)); if (conf) { await page.click('[onclick="' + conf + '"]'); await page.waitForTimeout(800); }
      return true;
    }
    const pick = c.find(x => prefer.test(x)) || c.find(x => /^select/i.test(x));
    if (!pick) return false;
    await page.click('[onclick="' + pick.replace(/"/g, '\\"') + '"]'); await page.waitForTimeout(700);
  }
  return false;
}
// ===== A. 調撥入庫：台北外倉 透抽 8 件 → 本倉（預設產生待執行工單）=====
await page.click('#btn-mode-in'); await page.waitForTimeout(500);
const srcOpts = await page.$$eval('#transfer-source option', o => o.map(x => x.value + '=' + x.textContent.trim()));
H.note('來源選項: ' + JSON.stringify(srcOpts));
await page.selectOption('#transfer-source', 'EXT-TP'); await page.waitForTimeout(800);
const okA = await pickFromModal(/透抽|'X'/, 8);
H.note('清單: ' + JSON.stringify(await page.evaluate(() => window.transferList.map(t => [t.mode, t.productName, t.quantity, t.fromWh, t.toWh]))));
await page.click('#btn-execute-transfer'); await page.waitForTimeout(3000);
H.note('dialogs: ' + JSON.stringify(log.dialogs.map(d => d.msg.slice(0, 150))));
const e1 = await H.one('externalStock', 'E1'); const io = await H.all('inboundOrders');
H.check('A 調撥入庫：外倉 20→12，產生待執行入庫單 8 件', okA && e1 && e1.quantity === 12 && io.length === 1 && io[0].quantity === 8, JSON.stringify({ e1: e1 && e1.quantity, io: io.map(o => [o.docNo, o.quantity, o.status, o.locationId]) }));
// ===== B. 在智能入庫中心執行這張調撥入庫單 =====
await H.nav(page, 'unified-inbound');
await page.click("button[onclick=\"showPendingInbounds()\"]", { force: true }); await page.waitForTimeout(2500);
const nD = log.dialogs.length;
const btns = await page.$$eval('#pending-inbound-modal [onclick]', els => els.map(e => e.getAttribute('onclick')));
H.note('待執行按鈕: ' + JSON.stringify(btns));
const single = btns.find(b => b.startsWith('confirmSingleInbound'));
if (single) { await page.click('#pending-inbound-modal [onclick="' + single + '"]'); await page.waitForTimeout(2500); }
H.note('B dialogs: ' + JSON.stringify(log.dialogs.slice(nD).map(d => d.type + ':' + d.msg.slice(0, 150))));
const pB = (await H.all('pallets')).filter(p => p.productName === '透抽');
H.check('B 執行調撥入庫單後，透抽 8 件在一個真實儲位（不是「待指定」）', pB.length === 1 && pB[0].quantity === 8 && /^([IJK]-[A-H]-\d{2}-[123]F|TEMP-IN)$/.test(pB[0].locationId), JSON.stringify(pB.map(p => [p.quantity, p.locationId])));
await page.evaluate(() => { const m = document.getElementById('pending-inbound-modal'); if (m) m.remove(); });

// ===== C. 調撥出庫：本倉白蝦 10 件 → 台中外倉 =====
await H.nav(page, 'transfer'); await page.waitForTimeout(800);
await page.click('#btn-mode-out'); await page.waitForTimeout(600);
const tgtOpts = await page.$$eval('#transfer-source option', o => o.map(x => x.value));
H.note('出庫目標選項: ' + JSON.stringify(tgtOpts));
await page.selectOption('#transfer-source', 'EXT-TC'); await page.waitForTimeout(800);
const okC = await pickFromModal(/白蝦|I-A-03-2F|M1/, 10);
H.note('清單: ' + JSON.stringify(await page.evaluate(() => window.transferList.map(t => [t.mode, t.productName, t.quantity, t.fromWh, t.toWh]))));
await page.click('#btn-execute-transfer'); await page.waitForTimeout(3000);
const m1 = await H.one('pallets', 'M1'); const extTC = (await H.all('externalStock')).filter(e => e.warehouseId === 'EXT-TC');
const tempOut = (await H.all('pallets')).filter(p => p.locationId === 'TEMP-OUT');
H.check('C 調撥出庫：本倉 30→20、台中外倉 +10、沒有 TEMP-OUT 重複', okC && m1.quantity === 20 && extTC.length === 1 && extTC[0].quantity === 10 && tempOut.length === 0, JSON.stringify({ m1: m1.quantity, extTC: extTC.map(e => [e.productName, e.quantity]), tempOut: tempOut.length }));

// ===== D. 外庫調撥：台北外倉 透抽 5 → 台中外倉 =====
await page.click('#btn-mode-ext'); await page.waitForTimeout(600);
await page.selectOption('#transfer-source', 'EXT-TP'); await page.waitForTimeout(500);
const tOpts = await page.$$eval('#transfer-target option', o => o.map(x => x.value)); H.note('外庫目標選項: ' + JSON.stringify(tOpts));
if (tOpts.includes('EXT-TC')) await page.selectOption('#transfer-target', 'EXT-TC');
await page.waitForTimeout(500);
const okD = await pickFromModal(/透抽|'X'/, 5);
await page.click('#btn-execute-transfer'); await page.waitForTimeout(3000);
const ext = await H.all('externalStock');
const tp = ext.filter(e => e.warehouseId === 'EXT-TP' && e.productName === '透抽'); const tc = ext.filter(e => e.warehouseId === 'EXT-TC' && e.productName === '透抽');
H.check('D 外庫調撥：台北 12→7、台中透抽 +5', okD && tp[0] && tp[0].quantity === 7 && tc[0] && tc[0].quantity === 5, JSON.stringify(ext.map(e => [e.warehouseId, e.productName, e.quantity])));
const lg = await H.all('inventoryLogs');
H.note('異動記錄: ' + JSON.stringify(lg.map(l => [l.type, l.productName, l.quantity, l.fromLocation, l.toLocation])));
H.check('每筆調撥都有異動記錄', lg.filter(l => /transfer/.test(l.type)).length === 3, lg.length);
H.note('errors: ' + JSON.stringify(log.errors) + JSON.stringify(log.console));
await H.close(); process.exit(0);
