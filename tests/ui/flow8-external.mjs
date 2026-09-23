import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';
const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
await H.resetData(async d => { await baseSeed(d);
  await H.setDoc(H.doc(d, 'externalStock', 'E1'), { warehouseId: 'EXT-TP', productName: '透抽', spec: 'L', batchNo: 'X', company: '崇文', expiryDate: '2027-08-01', quantity: 20 });
});
const { page, log } = await H.openApp(base, USERS.op);
await H.nav(page, 'external-warehouse'); await page.waitForTimeout(1500);
const whOpts = await page.$$eval('#ext-adj-wh option', o => o.map(x => x.value)); H.note('調整倉庫選項: ' + JSON.stringify(whOpts));
async function adjust(qty, plan) {
  await page.selectOption('#ext-adj-wh', 'EXT-TP');
  await page.fill('#ext-adj-name', '透抽'); await page.fill('#ext-adj-spec', 'L'); await page.fill('#ext-adj-batch', 'X'); await page.fill('#ext-adj-exp', '2027-08-01');
  await page.fill('#ext-adj-qty', String(qty));
  if (plan) page.__dialogPlan = plan;
  await page.click("button[onclick=\"submitExternalAdjust()\"]"); await page.waitForTimeout(2000);
}
await adjust(5);
H.check('外倉 +5 → 25', (await H.one('externalStock', 'E1')).quantity === 25, JSON.stringify(await H.one('externalStock', 'E1')));
await adjust(-8);
H.check('外倉 -8 → 17', (await H.one('externalStock', 'E1')).quantity === 17);
const n = log.dialogs.length;
await adjust(-30, [false]);   // 扣超過：按取消
H.check('扣超過庫存：詢問，取消則不變', log.dialogs.slice(n).some(d => /目前只有 17 件/.test(d.msg)) && (await H.one('externalStock', 'E1')).quantity === 17, JSON.stringify(log.dialogs.slice(n).map(d=>d.msg)));
await adjust(-30, [true]);    // 再試：確定扣到 0
H.check('確定後扣到 0（刪除該筆）', (await H.one('externalStock', 'E1')) === null);
const lg = await H.all('inventoryLogs');
H.check('每次調整都有記錄（3 筆）', lg.filter(l => l.type === 'adjust').length === 3, JSON.stringify(lg.map(l => [l.type, l.quantityChange, l.note])));
// 列表上的操作按鈕
await adjust(10);
await page.waitForTimeout(1500);
const rowBtns = await page.$$eval('#view-external-warehouse [onclick]', e => [...new Set(e.map(x => (x.getAttribute('onclick') || '').replace(/\(.*$/, '')))]);
H.note('外倉頁可用操作: ' + JSON.stringify(rowBtns));
H.note('errors: ' + JSON.stringify(log.errors) + JSON.stringify(log.console));
await H.close(); process.exit(0);
