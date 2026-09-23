import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';
const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
await H.resetData(baseSeed);
const { page, log } = await H.openApp(base, USERS.op);
async function fillForm(qty, loc) {
  await page.click("button[onclick=\"openProductSelectModal('inbound')\"]"); await page.waitForTimeout(500);
  await page.click("#modal-product-select [onclick^=\"selectProductFromModal('P002'\"]"); await page.waitForTimeout(500);
  await page.fill('#in-batch', 'T0923'); await page.fill('#in-exp-year', '2027'); await page.fill('#in-exp-month', '6'); await page.fill('#in-exp-day', '1');
  await page.fill('#in-qty', String(qty)); if (loc) await page.fill('#in-loc', loc);
}
await H.nav(page, 'unified-inbound');
await fillForm(30, 'I-B-02-2F');
await page.click("button[onclick=\"toggleAdvancedOptions()\"]"); await page.waitForTimeout(400); await page.click("button[onclick=\"createInboundOrder()\"]");
await page.waitForTimeout(2500);
H.note('dialogs: ' + JSON.stringify(log.dialogs.map(d => d.msg.slice(0, 150))));
const orders = await H.all('inboundOrders');
H.note('inboundOrders: ' + JSON.stringify(orders.map(o => ({ docNo: o.docNo, status: o.status, approval: o.approvalStatus, needs: o.needsApproval, qty: o.quantity, loc: o.locationId, code: o.productCode, exp: o.expiryDate || o.expDate }))));
H.check('建立待執行入庫單', orders.length === 1, JSON.stringify(orders));
// 待執行清單
await page.click("button[onclick=\"showPendingInbounds()\"]", { force: true }); await page.waitForTimeout(3000);
const modal = await page.evaluate(() => { const m = [...document.querySelectorAll('div[id]')].filter(e => e.offsetParent !== null && /pending/i.test(e.id)); return m.map(e => e.id + ' :: ' + e.innerText.slice(0, 400) + ' || ' + [...e.querySelectorAll('[onclick]')].map(x => x.getAttribute('onclick')).slice(0, 10).join(' | ')).join('\n'); });
H.note('pending modal: ' + modal);
const btns = await page.$$eval('#pending-inbound-modal [onclick]', els => els.map(e => e.getAttribute('onclick') + ' / ' + e.innerText.trim().slice(0,20)));
H.note('pending buttons: ' + JSON.stringify(btns));
const execBtn = btns.find(b => b.startsWith('confirmSingleInbound'));
if (execBtn) {
  const sel = '#pending-inbound-modal [onclick="' + execBtn.split(' / ')[0] + '"]';
  await page.click(sel); await page.waitForTimeout(2500);
  H.note('after execute dialogs: ' + JSON.stringify(log.dialogs.slice(2).map(d => d.msg.slice(0, 200))));
  const pallets = await H.all('pallets'); const ord = await H.all('inboundOrders');
  H.note('pallets: ' + JSON.stringify(pallets.map(p => [p.palletId, p.productName, p.quantity, p.locationId, p.productCode, p.expiryDate])));
  H.note('order: ' + JSON.stringify(ord.map(o => [o.status, o.approvalStatus])));
  H.check('執行後建立棧板 30 件 @ I-B-02-2F', pallets.length === 1 && pallets[0].quantity === 30 && pallets[0].locationId === 'I-B-02-2F', JSON.stringify(pallets));
  H.check('入庫單狀態變完成', ord[0].status === 'completed', ord[0].status);
}
H.note('errors: ' + JSON.stringify(log.errors) + JSON.stringify(log.console));
await H.close(); process.exit(0);
