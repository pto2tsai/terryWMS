import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';
import XLSX from 'xlsx'; import fs from 'fs';
const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
await H.resetData(async d => { await baseSeed(d);
  const P = (id, o) => H.setDoc(H.doc(d, 'pallets', id), Object.assign({ palletId: id, company: '崇文', palletCapacity: 40 }, o));
  await P('W-A1', { productName: '白蝦', spec: '50/60', batchNo: 'B1', expiryDate: '2027-05-01', quantity: 6, locationId: 'I-A-03-2F' });
  await P('W-A2', { productName: '白蝦', spec: '50/60', batchNo: 'B0', expiryDate: '2027-01-01', quantity: 5, locationId: 'I-A-04-1F' });   // 較早效期，應先揀
  await P('W-B1', { productName: '透抽', spec: 'L', batchNo: 'T1', expiryDate: '2027-03-01', quantity: 20, locationId: 'J-C-01-1F' });
});
// 產生 ERP 銷貨明細 Excel（前 5 列是表頭）
const rows = [['銷貨明細表'], [], [], [], ['銷貨日期','銷貨單號','客戶代號','客戶全名','品名','規格','包裝數量','包裝單位','銷貨數量','單位','單價','備註','批號','送貨地址一','送貨地址二'],
  ['2026/09/23','SO-001','C01','海霸王','白蝦','50/60',8,'件',8,'件',100,'黑貓','','台北市',''],
  ['2026/09/23','SO-002','C02','好市多','透抽','L',5,'件',5,'件',200,'黑貓','','新北市',''],
  ['','','','','白蝦','50/60',2,'件',2,'件',100,'','','',''] ];
const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'S'); const file = '/tmp/claude-0/-home-user-terryWMS/35d79373-70fa-5427-9712-7478c8d0ad0f/scratchpad/erp.xlsx';
fs.writeFileSync(file, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

const { page, log } = await H.openApp(base, USERS.op);
await H.nav(page, 'wave-picking');
await page.setInputFiles('#order-excel-import', file); await page.waitForTimeout(3500);
H.note('匯入 dialogs: ' + JSON.stringify(log.dialogs.map(d => d.msg.slice(0, 200))));
const so = await H.all('salesOrders');
H.note('salesOrders: ' + JSON.stringify(so.map(o => [o.orderNo, o.status, o.logistics, (o.items || []).map(i => i.productName + 'x' + i.packageQty)])));
H.check('匯入 2 張訂單', so.length === 2, JSON.stringify(so.map(o => o.orderNo)));
// 匯入時已選「自動依物流商建立波次」
const waves = await H.all('waves');
H.note('waves: ' + JSON.stringify(waves.map(w => [w.waveNo, w.status, w.orderCount, (w.summary || []).map(s => s.productName + ':' + s.totalQty)])));
H.check('自動建立 1 個波次含 2 張訂單（已存入資料庫）', waves.length === 1 && waves[0].orderCount === 2, JSON.stringify(waves));
// 建好波次後：跳出「列印揀貨單」按鈕，按一下就印出剛建好的波次揀貨單
H.check('匯入建好波次後，跳出「列印揀貨單（1 張）」按鈕', await page.isVisible('#btn-print-new-waves') && (await page.innerText('#btn-print-new-waves')).includes('1 張'));
const popP = page.waitForEvent('popup');
await page.click('#btn-print-new-waves');
const pop = await popP; await pop.waitForLoadState().catch(() => {}); await page.waitForTimeout(500);
const popHtml = await pop.content();
H.check('印出的揀貨單：有波次號、品項和總件數，不是「更新版」', popHtml.includes(waves[0].waveNo) && popHtml.includes('白蝦') && popHtml.includes('透抽') && !popHtml.includes('更新版】') && !(await page.isVisible('#modal-wave-print')), popHtml.slice(0, 200));
H.check('揀貨單印出儲位、批號、效期（白蝦先印效期早的 I-A-04-1F／B0；透抽 J-C-01-1F）', popHtml.includes('I-A-04-1F') && popHtml.includes('B0') && popHtml.includes('2027/01/01') && popHtml.includes('J-C-01-1F') && !popHtml.includes('I-A-03-2F'), popHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(300, 700));
if (process.env.SHOT) { await pop.setViewportSize({ width: 900, height: 700 }); await pop.screenshot({ path: process.env.SHOT, fullPage: true }); }
await pop.close().catch(() => {});
const soAfter = await H.all('salesOrders'); H.check('訂單狀態在資料庫中變成 inWave', soAfter.every(o => o.status === 'inWave'), JSON.stringify(soAfter.map(o => o.status)));
// 重新整理頁面後，這兩張訂單不應再出現在「可建立波次」清單
await page.reload(); await page.fill('#login-email', 'x').catch(()=>{}); await page.waitForTimeout(4000);
await H.nav(page, 'wave-picking');
await page.click("button[onclick=\"openCreateWaveModal()\"]"); await page.waitForTimeout(1200);
const nOrders = await page.$$eval('.wave-order-check', e => e.length);
H.check('重新整理後訂單不會被重複排波次', nOrders === 0, 'available=' + nOrders);
if (await page.isVisible("#modal-create-wave")) await page.click("#modal-create-wave button[onclick=\"closeCreateWaveModal()\"]");
// 上方只留「匯入訂單」「建立波次」和齒輪（設定收在齒輪裡）
const bar = await page.evaluate(() => [...document.querySelectorAll('#view-wave-picking > div:first-child button')].filter(b => b.offsetParent).map(b => b.innerText.trim()));
H.check('波次頁上方只剩「匯入訂單」「建立波次」「設定」', JSON.stringify(bar) === JSON.stringify(['匯入訂單', '建立波次', '設定']) && !(await page.isVisible('#wave-settings')), JSON.stringify(bar));
await page.click('#btn-wave-settings'); await page.waitForTimeout(200);
H.check('按齒輪打開設定：看得到「商品在哪一間」', await page.isVisible('#btn-product-homes'));
await page.click('#btn-wave-settings');
// 清單即時更新：別的地方新增波次，不用按重新整理就出現
await H.admin(d => H.setDoc(H.doc(d, 'waves', 'W-LIVE-1'), { waveNo: 'W-LIVE-1', logistics: '測試物流', status: 'pending', orders: [], summary: [], createdAt: '2000-01-01T00:00:00.000Z' }));
await page.waitForTimeout(1500);
H.check('波次清單即時更新（別處新增的波次不用重新整理就出現）', (await page.innerText('#wave-list-body')).includes('W-LIVE-1'));
await page.evaluate(() => deleteWave('W-LIVE-1')); await page.waitForTimeout(1500);
// 清除資料移到「備份與維護」頁，從那裡打開也讀得到波次
await H.nav(page, 'dev-tools');
await page.click('button[onclick="openClearDataModal()"]'); await page.waitForTimeout(1500);
H.check('「清除資料」在「備份與維護」頁，打開看得到波次數量', await page.isVisible('#modal-clear-data') && (await page.innerText('#modal-clear-data')).includes('1'), await page.innerText('#modal-clear-data').catch(() => ''));
await page.evaluate(() => closeClearDataModal()); await page.waitForTimeout(300);
await H.nav(page, 'wave-picking');
// 開始揀貨
const execBtn = await page.$$eval('[onclick^="openWaveExecute("]', e => e.map(x => x.getAttribute('onclick')));
H.note('執行按鈕: ' + JSON.stringify(execBtn));
if (execBtn[0]) {
  const prevP = page.waitForEvent('popup', { timeout: 5000 }).catch(() => null);
  await page.click('[onclick="' + execBtn[0] + '"]'); await page.waitForTimeout(1500);
  const prev = await prevP;
  H.check('按「開始揀貨」直接打開揀貨單列印預覽', !!prev && (await prev.content()).includes('揀貨單'));
  if (prev) await prev.close().catch(() => {});
  const list = await page.evaluate(() => window._waveData.pickingList.map(i => [i.palletId, i.productName, i.pickQty, i.shortage || false]));
  H.note('揀貨清單: ' + JSON.stringify(list));
  H.check('先進先出：白蝦先揀早效期 W-A2(5) 再 W-A1(5)，透抽 W-B1(5)', JSON.stringify(list.filter(i=>!i[3]).map(i => i[0] + ':' + i[2]).sort()) === JSON.stringify(['W-A1:5', 'W-A2:5', 'W-B1:5']), JSON.stringify(list));
  for (const it of list.filter(i => !i[3])) { await page.fill('#wave-scan-input', it[0]); await page.press('#wave-scan-input', 'Enter'); await page.waitForTimeout(700); }
  const wv = (await H.all('waves'))[0]; H.check('掃描進度寫入 Firestore', (wv.completedItems || []).length === 3, JSON.stringify(wv.completedItems));
  await page.click("#modal-wave-execute button[onclick=\"completeWave()\"]"); await page.waitForTimeout(3000);
  H.note('完成 dialogs: ' + JSON.stringify(log.dialogs.slice(-3).map(d => d.msg.slice(0, 200))));
  const pl = Object.fromEntries((await H.all('pallets')).map(p => [p._id, p.quantity]));
  const so2 = await H.all('salesOrders'); const wv2 = (await H.all('waves'))[0];
  H.check('庫存扣除：W-A2 刪除、W-A1 剩 1、W-B1 剩 15', pl['W-A2'] === undefined && pl['W-A1'] === 1 && pl['W-B1'] === 15, JSON.stringify(pl));
  H.check('訂單標記出貨、波次完成', so2.every(o => o.status === 'shipped') && wv2.status === 'done', JSON.stringify([so2.map(o => o.status), wv2.status]));
}
H.note('errors: ' + JSON.stringify(log.errors) + JSON.stringify(log.console));
await H.close(); process.exit(0);
