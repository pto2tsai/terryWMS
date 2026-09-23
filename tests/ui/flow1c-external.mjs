import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';
const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
await H.resetData(baseSeed);
const { page, log } = await H.openApp(base, USERS.op);
await H.nav(page, 'unified-inbound');
const opts = await page.$$eval('#in-warehouse option', o => o.map(x => x.value + '=' + x.textContent.trim()));
H.note('倉庫選項: ' + JSON.stringify(opts));
const ext = opts.find(o => !/^(MAIN|MANAGE|)=/.test(o) && !o.startsWith('MAIN'));
H.check('倉庫下拉有外倉可選', !!ext, JSON.stringify(opts));
if (ext) {
  await page.selectOption('#in-warehouse', ext.split('=')[0]); await page.waitForTimeout(800);
  await page.click("button[onclick=\"openProductSelectModal('inbound')\"]"); await page.waitForTimeout(500);
  await page.click("#modal-product-select [onclick^=\"selectProductFromModal('P001'\"]"); await page.waitForTimeout(500);
  await page.fill('#in-batch', 'X1'); await page.fill('#in-exp-year', '2028'); await page.fill('#in-exp-month', '1'); await page.fill('#in-exp-day', '1');
  await page.fill('#in-qty', '25');
  const extVisible = await page.isVisible('#btn-inbound-external'); H.note('外倉入庫按鈕可見: ' + extVisible);
  await page.click(extVisible ? '#btn-inbound-external' : '#btn-inbound-direct');
  await page.waitForTimeout(2500);
  H.note('dialogs: ' + JSON.stringify(log.dialogs.map(d => d.msg.slice(0, 160))));
  const es = await H.all('externalStock'); const pl = await H.all('pallets'); const lg = await H.all('inventoryLogs');
  H.note('externalStock: ' + JSON.stringify(es.map(e => [e.warehouseId, e.productName, e.quantity, e.productCode, e.expiryDate || e.expDate])));
  H.check('外倉庫存 +25、本倉沒有建立棧板', es.length === 1 && es[0].quantity === 25 && pl.length === 0, JSON.stringify({ es, pl }));
  H.check('外倉入庫有異動記錄', lg.length === 1, JSON.stringify(lg.map(l => [l.type, l.quantity, l.locationId])));
}
// 待財務核准頁：主管登入看得到並核准
const S = await H.openApp(base, USERS.sup);
await H.resetData(async d => { await baseSeed(d); await H.setDoc(H.doc(d, 'inboundOrders', 'IO1'), { docNo: 'IN-20260923-009', productName: '白蝦', spec: '50/60', quantity: 10, status: 'pending', approvalStatus: 'pending', needsApproval: true, category: 'Raw', createdAt: new Date().toISOString(), locationId: 'I-A-02-3F' }); });
await H.nav(S.page, 'approval'); await S.page.waitForTimeout(2500);
const approvalBtns = await S.page.$$eval('#view-approval [onclick]', els => els.map(e => e.getAttribute('onclick')).filter(x => /approve|reject/i.test(x)));
H.note('核准頁按鈕: ' + JSON.stringify(approvalBtns.slice(0, 6)));
const ap = approvalBtns.find(x => /^approve/i.test(x));
H.check('核准頁列出待核准單', !!ap, JSON.stringify(approvalBtns));
if (ap) { await S.page.click('#view-approval [onclick="' + ap + '"]'); await S.page.waitForTimeout(2000);
  const io = await H.one('inboundOrders', 'IO1'); H.note('dialogs: ' + JSON.stringify(S.log.dialogs.map(d => d.msg.slice(0, 120))));
  H.check('主管核准成功', io.approvalStatus === 'approved', JSON.stringify(io)); }
H.note('errors: ' + JSON.stringify(log.errors.concat(S.log.errors)) + JSON.stringify(log.console.concat(S.log.console)));
await H.close(); process.exit(0);
