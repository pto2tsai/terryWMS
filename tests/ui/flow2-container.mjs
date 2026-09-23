import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';
const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
await H.resetData(async d => { await baseSeed(d); await H.setDoc(H.doc(d, 'pallets', 'EX1'), { palletId: 'EX1', productName: '白蝦', spec: '50/60', company: '崇文', batchNo: 'OLD', expiryDate: '2027-01-01', quantity: 40, palletCapacity: 40, locationId: 'I-A-01-2F' }); });
const { page, log } = await H.openApp(base, USERS.op);
await H.nav(page, 'pre-inbound');
async function addItem(code, qty, batch) {
  await page.click("button[onclick=\"openProductSelectModal('container')\"]"); await page.waitForTimeout(500);
  await page.click(`#modal-product-select [onclick^="selectProductFromModal('${code}'"]`); await page.waitForTimeout(500);
  await page.fill('#pre-batch', batch); await page.fill('#pre-exp-year', '2027'); await page.fill('#pre-exp-month', '12'); await page.fill('#pre-exp-day', '31');
  await page.fill('#pre-qty', String(qty));
  await page.click("button[onclick=\"addContainerItemAndGenerate()\"]"); await page.waitForTimeout(2000);
}
await addItem('P001', 100, 'C1');   // 白蝦 40/板 → 40,40,20
await addItem('P002', 45, 'C2');    // 透抽 30/板 → 30,15
const labels = await page.evaluate(() => (window._containerData.labels || []).map(l => [l.productName, l.quantity, l.locationId, l.id || l.palletNo, l.palletType]));
H.note('標籤: ' + JSON.stringify(labels));
H.check('產生 5 張插單（40/40/20 + 30/15）', labels.length === 5 && labels.map(l => l[1]).join(',') === '40,40,20,30,15', JSON.stringify(labels));
H.check('每板都有實際儲位', labels.every(l => /^[IJK]-[A-H]-\d{2}-[123]F$/.test(l[2])), JSON.stringify(labels.map(l => l[2])));
H.check('板號不重複且格式正確', new Set(labels.map(l => l[3])).size === 5 && labels.every(l => /^IN-\d{8}-(\d{3}|T\w+)$/.test(l[3])), JSON.stringify(labels.map(l => l[3])));
const confirmEnabled = await page.isEnabled('#btn-confirm-inbound'); H.note('確認入庫按鈕可用: ' + confirmEnabled);
await page.click('#btn-confirm-inbound', { force: true }); await page.waitForTimeout(3000);
H.note('dialogs: ' + JSON.stringify(log.dialogs.map(d => d.msg.slice(0, 160))));
const pallets = (await H.all('pallets')).filter(p => p._id !== 'EX1');
const logs = await H.all('inventoryLogs');
H.note('pallets: ' + JSON.stringify(pallets.map(p => [p.palletId, p.productName, p.quantity, p.locationId, p.productCode, p.expiryDate])));
H.check('建立 5 板、總數 145', pallets.length === 5 && pallets.reduce((s, p) => s + p.quantity, 0) === 145, JSON.stringify(pallets.map(p=>p.quantity)));
H.check('效期格式統一', pallets.every(p => p.expiryDate === '2027-12-31'), JSON.stringify(pallets.map(p => p.expiryDate)));
H.check('貨櫃入庫有寫異動記錄', logs.length >= 5, 'logs=' + logs.length);
H.note('errors: ' + JSON.stringify(log.errors) + JSON.stringify(log.console));
await H.close(); process.exit(0);
