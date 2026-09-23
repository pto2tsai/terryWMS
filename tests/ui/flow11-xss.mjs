import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';
const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
const EVIL_NAME = '<img src=x onerror="window.__xss1=1">白蝦';
const EVIL_SPEC = "S'); window.__xss2=1; ('";
await H.resetData(async d => { await baseSeed(d);
  await H.setDoc(H.doc(d, 'pallets', 'X1'), { palletId: 'X1', productName: EVIL_NAME, spec: EVIL_SPEC, company: '崇文', batchNo: '<b>B</b>', expiryDate: '2027-01-01', quantity: 5, locationId: 'I-A-01-2F', vendor: '"><script>window.__xss3=1</script>' });
  await H.setDoc(H.doc(d, 'externalStock', 'E1'), { warehouseId: 'EXT-TP', productName: EVIL_NAME, spec: EVIL_SPEC, company: '崇文', batchNo: 'x', quantity: 3 });
  await H.setDoc(H.doc(d, 'productMaster', 'PMX'), { code: "P'X", name: EVIL_NAME, spec: EVIL_SPEC, palletCapacity: 40, shelfLife: 24 });
  await H.setDoc(H.doc(d, 'salesOrders', 'SX'), { orderNo: 'SO-X', status: 'pending', customer: '<img src=x onerror="window.__xss4=1">客戶', logistics: '黑貓宅急便', items: [{ productName: EVIL_NAME, spec: EVIL_SPEC, quantity: 1, packageQty: 1 }] });
});
const { page, log } = await H.openApp(base, USERS.op);
for (const tab of ['inventory-query', 'visual-map', 'external-warehouse', 'product-master', 'wave-picking', 'merge', 'stocktake', 'expiry-management']) {
  await H.nav(page, tab); await page.waitForTimeout(900);
}
await page.evaluate(() => { window.switchTab('wave-picking', null); if (window.openCreateWaveModal) openCreateWaveModal(); });
await page.waitForTimeout(800);
await page.click("button[onclick=\"openProductSelectModal('inbound')\"]").catch(() => {});
await page.evaluate(() => { window.switchTab('unified-inbound', null); openProductSelectModal('inbound'); });
await page.waitForTimeout(800);
const r = await page.evaluate(() => ({ x: [window.__xss1, window.__xss2, window.__xss3, window.__xss4], imgs: document.querySelectorAll('img[src="x"]').length, scripts: [...document.querySelectorAll('script')].filter(s => /__xss/.test(s.textContent)).length,
  shown: (document.getElementById('inventory-list-body') || {}).innerText || '' }));
H.note('結果: ' + JSON.stringify({ x: r.x, imgs: r.imgs, scripts: r.scripts }));
H.check('惡意內容沒有被執行（4 種注入皆無效）', r.x.every(v => v === undefined) && r.imgs === 0 && r.scripts === 0, JSON.stringify(r.x));
// 庫存資料本身仍可正常顯示與操作
const pal = await page.evaluate(() => currentPallets().find(p => p.id === 'X1'));
H.check('品名以全形顯示、內容保留（＜img…＞白蝦）', pal.productName.startsWith('＜img') && pal.productName.endsWith('白蝦'), pal.productName);
// 寫入時也轉換
await page.evaluate(async () => { await addDoc(collection(db, 'productMaster'), { code: 'Q1', name: '<i>新品</i>', spec: "a'b" }); });
const pm = (await H.all('productMaster')).find(p => p.code === 'Q1');
H.check('寫入資料庫時也轉成全形', pm && pm.name === '＜i＞新品＜/i＞' && pm.spec === 'a＇b', JSON.stringify(pm));
H.note('page errors: ' + JSON.stringify(log.errors.slice(0, 5)));
H.check('畫面沒有因此出錯', log.errors.length === 0, JSON.stringify(log.errors.slice(0, 3)));
await H.close(); process.exit(0);
