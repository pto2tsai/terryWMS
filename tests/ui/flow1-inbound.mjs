import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';
const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
await H.resetData(baseSeed);
const { page, log } = await H.openApp(base, USERS.op);
await H.nav(page, 'unified-inbound');
const vis = await page.isVisible('#in-name'); H.check('入庫中心畫面顯示', vis);
// 單筆直接入庫
await page.click("button[onclick=\"openProductSelectModal('inbound')\"]"); await page.waitForTimeout(600);
await page.click("#modal-product-select [onclick^=\"selectProductFromModal('P001'\"]"); await page.waitForTimeout(600);
H.note('選品後：' + JSON.stringify(await page.evaluate(()=>['in-name','in-product-code','in-spec'].map(i=>document.getElementById(i).value))));
await page.fill('#in-batch', 'B240901'); await page.fill('#in-exp-year', '2027'); await page.fill('#in-exp-month', '03'); await page.fill('#in-exp-day', '15');
await page.fill('#in-qty', '40');
await page.click('#btn-type-Raw'); await page.uncheck('#in-print-slip');
await page.fill('#in-loc', 'I-A-01-3F');
await page.dispatchEvent('#in-loc', 'input');
const btnVisible = await page.isVisible('#btn-inbound-direct'); H.note('確認入庫按鈕可見: ' + btnVisible);
await page.click('#btn-inbound-direct', { force: true });
await page.waitForTimeout(2500);
H.note('dialogs: ' + JSON.stringify(log.dialogs.map(d=>d.msg.slice(0,120))));
const pallets = await H.all('pallets'); const logs = await H.all('inventoryLogs');
H.note('pallets: ' + JSON.stringify(pallets));
H.note('logs: ' + JSON.stringify(logs.map(l=>[l.type,l.quantity,l.palletId,l.operatorEmail,l.timestamp])));
H.check('建立一板白蝦 40 件', pallets.length === 1 && pallets[0].quantity === 40 && pallets[0].locationId === 'I-A-01-3F', JSON.stringify(pallets));
if (pallets[0]) {
  H.check('板號是 IN-YYYYMMDD-NNN', /^IN-\d{8}-\d{3}$/.test(pallets[0].palletId), pallets[0].palletId);
  H.check('效期統一為 2027-03-15', pallets[0].expiryDate === '2027-03-15' && pallets[0].expDate === '2027-03-15', pallets[0].expiryDate + ' / ' + pallets[0].expDate);
  H.check('品號寫入', pallets[0].productCode === 'P001', pallets[0].productCode);
}
H.check('入庫記錄 1 筆且有操作者', logs.length === 1 && logs[0].operatorEmail === 'op@t.com', JSON.stringify(logs));
H.note('page errors: ' + JSON.stringify(log.errors.slice(0,5)) + ' console: ' + JSON.stringify(log.console.slice(0,5)));
await H.close(); process.exit(0);
