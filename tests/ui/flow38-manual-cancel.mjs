// 手動上傳改過的鼎新檔：檔案裡不見的單（鼎新取消了）也會問要不要在 WMS 取消
//   按「取消」先不動；按「確定」取消，還沒開始揀的波次把它移出（波次空了就刪掉）；別天的單不會被誤判
import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';
import XLSX from 'xlsx'; import fs from 'fs'; import os from 'os'; import path from 'path';
const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
await H.resetData(async d => { await baseSeed(d);
  await H.setDoc(H.doc(d, 'pallets', 'P1'), { palletId: 'P1', company: '崇文', palletCapacity: 40, productName: '白蝦', spec: '50/60', quantity: 20, locationId: 'I-A-01-1F', expiryDate: '2027-01-01' });
});
const xl = (name, aoa) => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'S'); const f = path.join(os.tmpdir(), name); fs.writeFileSync(f, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })); return f; };
const HEAD = ['銷貨日期', '銷貨單號', '客戶全名', '品名', '規格', '銷貨數量', '單位', '備註'];
const file = (name, lines) => xl(name, [HEAD].concat(lines.map(([d, no, cust, lg, q]) => [d, no, cust, '白蝦', '50/60', q || 3, '件', lg])));
const { page, log } = await H.openApp(base, USERS.op);
await H.nav(page, 'wave-picking'); await page.waitForTimeout(500);
const dlg = n => log.dialogs.slice(n);

// 9:00：4 張單（C-1、C-2 黑貓；C-3 新竹；昨天的 Y-1 黑貓），建好波次
await page.setInputFiles('#order-excel-import', file('m1.xlsx', [['2026/09/30', 'Y-1', '昨天客戶', '黑貓'], ['2026/10/01', 'C-1', '海霸王', '黑貓'], ['2026/10/01', 'C-2', '好市多', '黑貓'], ['2026/10/01', 'C-3', '黃建宏', '新竹']]));
await page.waitForTimeout(3000);
let waves = await H.all('waves');
H.check('9:00 匯入 4 張單，建好黑貓、新竹波次', waves.length === 2 && (await H.all('salesOrders')).length === 4, JSON.stringify(waves.map(w => [w.logistics, w.orderCount])));

// 11:00 改單檔（只有 10/01）：C-3 黃建宏不見了。先按「取消」→ 不動
let n0 = log.dialogs.length;
page.__dialogPlan = [false];
await page.setInputFiles('#order-excel-import', file('m2.xlsx', [['2026/10/01', 'C-1', '海霸王', '黑貓'], ['2026/10/01', 'C-2', '好市多', '黑貓']]));
await page.waitForTimeout(2500);
const ask = dlg(n0).find(d => d.type === 'confirm');
H.check('手動上傳也會發現不見的單：列出 C-3 黃建宏、寫已排的波次；昨天的 Y-1 不算', ask && ask.msg.includes('C-3') && ask.msg.includes('黃建宏') && ask.msg.includes('已排波次') && !ask.msg.includes('Y-1'), JSON.stringify(dlg(n0).map(d => d.type + ':' + d.msg.slice(0, 200))));
let so = Object.fromEntries((await H.all('salesOrders')).map(o => [o.orderNo, o]));
H.check('按「取消」：單和波次都不動', so['C-3'].status === 'inWave' && (await H.all('waves')).length === 2, JSON.stringify(so['C-3']));

// 再上傳一次，按「確定」→ WMS 也取消，新竹波次只有它一張，波次刪掉
n0 = log.dialogs.length;
await page.setInputFiles('#order-excel-import', file('m3.xlsx', [['2026/10/01', 'C-1', '海霸王', '黑貓'], ['2026/10/01', 'C-2', '好市多', '黑貓']]));
await page.waitForTimeout(3000);
so = Object.fromEntries((await H.all('salesOrders')).map(o => [o.orderNo, o]));
waves = await H.all('waves');
H.check('按「確定」：C-3 取消、新竹波次（只有它）刪掉；其他單不動', so['C-3'].status === 'cancelled' && so['C-3'].cancelReason.includes('手動匯入') && waves.length === 1 && waves[0].logistics.includes('黑貓') && so['Y-1'].status === 'inWave' && so['C-1'].status === 'inWave', JSON.stringify([so['C-3'], waves.map(w => [w.logistics, w.orderCount])]));
H.check('取消完告訴你取消了幾張', dlg(n0).some(d => d.msg.includes('已取消 1 張')), JSON.stringify(dlg(n0).map(d => d.msg.slice(0, 80))));

// 第三次上傳同一份：已取消的不會再問
n0 = log.dialogs.length;
await page.setInputFiles('#order-excel-import', file('m4.xlsx', [['2026/10/01', 'C-1', '海霸王', '黑貓'], ['2026/10/01', 'C-2', '好市多', '黑貓']]));
await page.waitForTimeout(2500);
H.check('已經取消的單不會再問一次', !dlg(n0).some(d => d.msg.includes('可能已在鼎新取消')), JSON.stringify(dlg(n0).map(d => d.msg.slice(0, 80))));

// ---------- 已經開始揀的波次，單被取消：手機列「放回」 ----------
await page.setInputFiles('#order-excel-import', file('m5.xlsx', [['2026/10/02', 'D-1', '海霸王', '大榮', 3], ['2026/10/02', 'D-2', '黃建宏', '大榮', 4]]));
await page.waitForTimeout(3000);
const WD = (await H.all('waves')).find(w => w.logistics.includes('大榮'));
H.check('10/02 大榮波次：2 張單、白蝦 7 件', WD && WD.orderCount === 2 && WD.totalQty === 7, JSON.stringify(WD));
const M = await H.openApp(base, USERS.op2, { mobile: true }); const mp = M.page;
await mp.waitForTimeout(1500);
await mp.evaluate(() => openPage('picking')); await mp.waitForTimeout(400);
await mp.selectOption('#picking-wave-select', WD.waveNo); await mp.waitForTimeout(1000);
await mp.fill('#picking-scan', 'P1'); await mp.press('#picking-scan', 'Enter'); await mp.waitForTimeout(1000);
H.check('手機揀了白蝦 7 件', ((await H.one('waves', WD.waveNo)).pickLog || []).some(e => e.qty === 7));
n0 = log.dialogs.length;
await page.setInputFiles('#order-excel-import', file('m6.xlsx', [['2026/10/02', 'D-1', '海霸王', '大榮', 3]]));
await page.waitForTimeout(3000);
so = Object.fromEntries((await H.all('salesOrders')).map(o => [o.orderNo, o]));
const WD2 = await H.one('waves', WD.waveNo);
H.check('揀到一半的波次也能取消：D-2 取消、波次剩 D-1 3 件', so['D-2'].status === 'cancelled' && WD2.orderCount === 1 && WD2.totalQty === 3, JSON.stringify([so['D-2'].status, WD2.orderCount, WD2.totalQty, dlg(n0).map(d => d.msg.slice(0, 120))]));
await mp.waitForTimeout(2000);
const items = await mp.evaluate(() => pickingItems.filter(i => !i.completed).map(i => [i.type || 'pick', i.productName, i.pickQty, i.locationId]));
const top = await mp.textContent('#picking-next');
H.check('手機自動列「放回白蝦 4 件 → I-A-01-1F」', JSON.stringify(items) === JSON.stringify([['return', '白蝦', 4, 'I-A-01-1F']]), JSON.stringify(items));
H.check('手機上方提醒：黃建宏整張取消', top.includes('D-2') && top.includes('黃建宏') && top.includes('整張取消'), top.slice(0, 200));

H.check('沒有頁面錯誤', log.errors.length === 0 && M.log.errors.length === 0, JSON.stringify(log.errors.concat(M.log.errors)));
await H.close(); process.exit(0);
