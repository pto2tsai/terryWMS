// 清掉全部測試資料（管理員）：已完成的波次、已出貨的訂單也刪掉，先存雲端備份；庫存不動；一般人員看不到
import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';
const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
await H.resetData(async d => {
  await baseSeed(d);
  await H.setDoc(H.doc(d, 'pallets', 'P-KEEP'), { palletId: 'P-KEEP', productName: '白蝦', spec: '50/60', quantity: 9, locationId: 'J-A-01-1F', company: '崇文' });
  await H.setDoc(H.doc(d, 'waves', 'W-DONE'), { waveNo: 'W-DONE', logistics: '黑貓宅急便', status: 'done', orders: [], summary: [], createdAt: '2026-09-29T01:00:00.000Z' });
  await H.setDoc(H.doc(d, 'waves', 'W-PICK'), { waveNo: 'W-PICK', logistics: '新竹物流', status: 'picking', orders: [], summary: [], createdAt: '2026-09-29T02:00:00.000Z' });
  await H.setDoc(H.doc(d, 'salesOrders', 'SO-S'), { orderNo: 'SO-S', status: 'shipped', waveNo: 'W-DONE', items: [] });
  await H.setDoc(H.doc(d, 'salesOrders', 'SO-W'), { orderNo: 'SO-W', status: 'inWave', waveNo: 'W-PICK', items: [] });
});

// 一般人員：清除資料視窗裡沒有這顆
const op = await H.openApp(base, USERS.op);
await H.nav(op.page, 'dev-tools');
await op.page.click('button[onclick="openClearDataModal()"]'); await op.page.waitForTimeout(1200);
H.check('一般人員：「清除資料」裡沒有「清掉全部測試資料」', !(await op.page.isVisible('button[onclick="clearAllTestOrders()"]')));

const { page, log } = await H.openApp(base, USERS.admin);
await H.nav(page, 'dev-tools');
await page.click('button[onclick="openClearDataModal()"]'); await page.waitForTimeout(1200);
H.check('管理員：看得到「清掉全部測試資料（包含已出貨的）」', await page.isVisible('button[onclick="clearAllTestOrders()"]'));

// 打錯字：不刪
page.__dialogPlan = [true, '清'];
await page.click('button[onclick="clearAllTestOrders()"]'); await page.waitForTimeout(1500);
H.check('確認字打錯：沒有刪', (await H.all('waves')).length === 2 && (await H.all('salesOrders')).length === 2);

await page.evaluate(() => openClearDataModal()); await page.waitForTimeout(1200);
const n0 = log.dialogs.length;
page.__dialogPlan = [true, '清除'];
await page.click('button[onclick="clearAllTestOrders()"]'); await page.waitForTimeout(2500);
const msgs = log.dialogs.slice(n0).map(x => x.msg);
H.check('確認視窗寫清楚：2 個波次、2 張訂單（已出貨 1 張）、庫存不動', msgs[0] && msgs[0].includes('2 個波次') && msgs[0].includes('2 張訂單') && msgs[0].includes('已出貨 1 張') && msgs[0].includes('庫存'), JSON.stringify(msgs));
H.check('全部刪掉：已完成、揀貨中的波次，已出貨、波次中的訂單', (await H.all('waves')).length === 0 && (await H.all('salesOrders')).length === 0);
const bk = (await H.all('backups')).find(b => b._id.startsWith('before-clear-test-'));
H.check('刪之前存了雲端備份（波次 2、訂單 2）', bk && bk.summary.waves === 2 && bk.summary.salesOrders === 2 && JSON.parse(bk.data).collections.salesOrders.some(o => o.id === 'SO-S'), JSON.stringify(bk && bk.summary));
H.check('庫存不動', ((await H.one('pallets', 'P-KEEP')) || {}).quantity === 9);
H.check('完成訊息寫備份名稱、可以重新匯入', (msgs[msgs.length - 1] || '').includes('before-clear-test-') && msgs[msgs.length - 1].includes('重新匯入'), msgs[msgs.length - 1]);
H.check('沒有頁面錯誤', log.errors.length === 0 && op.log.errors.length === 0, JSON.stringify(log.errors.concat(op.log.errors)));
await H.close(); process.exit(0);
