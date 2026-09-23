import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';
const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
await H.resetData(async d => { await baseSeed(d);
  const P = (id, o) => H.setDoc(H.doc(d, 'pallets', id), Object.assign({ palletId: id, company: '崇文', palletCapacity: 40, category: 'Raw' }, o));
  await P('R1', { productName: '白蝦', spec: '50/60', batchNo: 'B1', expiryDate: '2027-05-01', quantity: 30, locationId: 'I-A-03-2F' });
  await P('R2', { productName: '白蝦', spec: '50/60', batchNo: 'B0', expiryDate: '2027-01-01', quantity: 10, locationId: 'I-A-04-1F' });
});
const { page, log } = await H.openApp(base, USERS.op);
await H.nav(page, 'picking-rm');
await page.fill('#rm-pick-user', '王師傅'); await page.dispatchEvent('#rm-pick-user', 'input'); await page.fill('#rm-pick-dept', '加工課');
await page.click('#btn-open-rm-modal'); await page.waitForTimeout(1200);
const clicks = async () => page.$$eval('#modal-rm-product [onclick]', e => e.filter(x => x.offsetParent !== null).map(x => x.getAttribute('onclick')));
for (let step = 0; step < 6; step++) {
  const c = await clicks(); H.note('step ' + step + ': ' + JSON.stringify(c.filter(x => !/close|GoBack|confirmRmModalCart/.test(x))));
  const inputs = await page.$$eval('#modal-rm-product input', e => e.filter(x => x.offsetParent !== null).map(x => x.id + ':' + x.type + ':' + (x.getAttribute('oninput') || x.getAttribute('onchange') || '')));
  H.note('   inputs: ' + JSON.stringify(inputs));
  // 選 R2（早效期，10 件）那一板：優先點含 I-A-04-1F / B0 的選項
  const pick = c.find(x => /I-A-04-1F|'B0'|R2/.test(x)) || c.find(x => /^select|^choose|^pick/i.test(x) && !/close|GoBack/.test(x));
  if (!pick) break;
  await page.click('#modal-rm-product [onclick="' + pick.replace(/"/g, '\\"') + '"]'); await page.waitForTimeout(700);
}
await page.fill('#rm-modal-qty', '8');
await page.click('#modal-rm-product [onclick="addToRmModalCart()"]'); await page.waitForTimeout(600);
await page.click('#modal-rm-product [onclick="confirmRmModalCart()"]'); await page.waitForTimeout(800);
const cart = await page.evaluate(() => (window.rmPickingCart || []).map(c => JSON.stringify(c).slice(0, 200)));
H.note('領料車: ' + JSON.stringify(cart));
await page.click('#btn-rm-confirm-cart'); await page.waitForTimeout(1500);
// 可能出現確認視窗（WMS.createModal）
const confirmBtn = await page.$$eval('[onclick="executeRmPicking()"]', e => e.filter(x => x.offsetParent !== null).length);
if (confirmBtn) { await page.click('[onclick="executeRmPicking()"]'); await page.waitForTimeout(2500); }
H.note('dialogs: ' + JSON.stringify(log.dialogs.map(d => d.msg.slice(0, 160))));
const pl = Object.fromEntries((await H.all('pallets')).map(p => [p._id, p.quantity]));
const lg = await H.all('inventoryLogs');
H.check('領料 8 件從早效期 R2 扣：R2 剩 2、R1 不動', pl.R2 === 2 && pl.R1 === 30, JSON.stringify(pl));
H.check('領料記錄 picking-rm 有領用人與操作者', lg.length === 1 && lg[0].type === 'picking-rm' && String(lg[0].note).includes('王師傅') && lg[0].operatorEmail === 'op@t.com', JSON.stringify(lg.map(l => [l.type, l.quantityChange, l.note, l.operator, l.operatorEmail])));
// 報表中心的領料報表要找得到這筆
await H.nav(page, 'picking-reports'); await page.waitForTimeout(800);
const rep = await page.evaluate(async () => { const today = new Date().toLocalYMD(); await loadPickingLogsFromFirebase(today, today); return getPickingLogs(today, today).length; });
H.check('報表中心的領料記錄查得到今天這筆', rep === 1, 'count=' + rep);
H.note('errors: ' + JSON.stringify(log.errors) + JSON.stringify(log.console));
await H.close(); process.exit(0);
