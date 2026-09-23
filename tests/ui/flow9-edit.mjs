import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';
const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
await H.resetData(async d => { await baseSeed(d);
  await H.setDoc(H.doc(d, 'pallets', 'Q1'), { palletId: 'Q1', productName: '白蝦', spec: '50/60', company: '崇文', batchNo: 'B1', expiryDate: '2027-05-01', quantity: 10, locationId: 'I-A-03-2F' }); });
const { page, log } = await H.openApp(base, USERS.op);
await H.nav(page, 'inventory-query'); await page.waitForTimeout(1500);
const editBtns = await page.$$eval('#inventory-list-body [onclick]', e => e.map(x => x.getAttribute('onclick')));
H.note('列表操作: ' + JSON.stringify(editBtns));
const eb = editBtns.find(x => /^editPallet/.test(x));
H.check('庫存查詢列表有「編輯」', !!eb, JSON.stringify(editBtns));
if (eb) {
  await page.click('#inventory-list-body [onclick="' + eb + '"]'); await page.waitForTimeout(1000);
  await page.fill('#edit-qty-field', '8'); await page.fill('#edit-location-field', 'j-c-04-1f');
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /儲存|保存|確認/.test(x.innerText) && x.offsetParent); b.click(); });
  await page.waitForTimeout(2000);
  const q = await H.one('pallets', 'Q1'); const lg = await H.all('inventoryLogs');
  H.check('編輯後數量 8、儲位轉大寫 J-C-04-1F、效期格式不變', q.quantity === 8 && q.locationId === 'J-C-04-1F' && q.expiryDate === '2027-05-01', JSON.stringify(q));
  H.check('編輯寫入調整記錄（數量 10 → 8、儲位）', lg.length === 1 && /數量 10 → 8/.test(lg[0].note) && /儲位 I-A-03-2F → J-C-04-1F/.test(lg[0].note) && lg[0].quantityChange === -2, JSON.stringify(lg.map(l => [l.note, l.quantityChange])));
}
H.note('errors: ' + JSON.stringify(log.errors) + JSON.stringify(log.console));
await H.close(); process.exit(0);
