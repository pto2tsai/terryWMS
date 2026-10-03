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
const { page, log, ctx } = await H.openApp(base, USERS.op);
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
const al = await mp.evaluate(() => { const d = document.getElementById('pk-change-alert'); return d ? d.textContent : ''; });
if (process.env.SHOT) await mp.screenshot({ path: process.env.SHOT + '/手機改單提醒.png' });
H.check('手機響、跳大框：D-2 黃建宏 整張取消，要放回白蝦 4 件', al.includes('黃建宏') && al.includes('整張取消') && al.includes('4 件'), al.slice(0, 200));
await mp.click('#pk-alert-ok'); await mp.waitForTimeout(300);
const B = await ctx.newPage();
await B.goto(base + '/board.html?night=off'); await B.waitForTimeout(3500);
const bt = await B.textContent('body');
H.check('現場看板紅字：' + WD.waveNo + ' 鼎新改單，要放回白蝦 4 件', bt.includes(WD.waveNo + ' 要放回：白蝦 4 件') && bt.includes('↩️ 要放回：白蝦 4 件'), bt.slice(0, 300));
await B.close();
H.check('手機上方提醒：黃建宏整張取消', top.includes('D-2') && top.includes('黃建宏') && top.includes('整張取消'), top.slice(0, 200));

// ---------- 已經出貨的單，鼎新整張刪掉：放進「業務要改鼎新」清單 ----------
await H.admin(async d => { const { updateDoc } = await import('firebase/firestore'); await updateDoc(H.doc(d, 'salesOrders', so['C-1']._id), { status: 'shipped' }); });
await page.evaluate(() => loadOrdersFromFirebase()); await page.waitForTimeout(500);
n0 = log.dialogs.length;
await page.setInputFiles('#order-excel-import', file('m7.xlsx', [['2026/10/01', 'C-2', '好市多', '黑貓']]));
await page.waitForTimeout(3000);
const ask2 = dlg(n0).find(d => d.type === 'confirm' && d.msg.includes('可能已在鼎新取消'));
H.check('已出貨的 C-1 不見了：問的時候分開寫「已經出貨（請業務確認）」', ask2 && ask2.msg.includes('已經出貨') && ask2.msg.includes('C-1'), JSON.stringify(dlg(n0).map(d => d.msg.slice(0, 200))));
so = Object.fromEntries((await H.all('salesOrders')).map(o => [o.orderNo, o]));
H.check('C-1 沒被取消（貨已經出了），放進「業務要改鼎新」清單', so['C-1'].status === 'shipped' && so['C-1'].erpReturnNeeded === true && so['C-1'].erpGone === true, JSON.stringify(so['C-1']));
await H.nav(page, 'home'); await page.waitForTimeout(1500);
const home = await page.textContent('#home-todos');
H.check('首頁待辦「業務要改鼎新」寫 C-1 鼎新對不上要確認', home.includes('業務要改鼎新') && home.includes('C-1') && home.includes('鼎新對不上要確認'), home.slice(0, 400));
n0 = log.dialogs.length;
await page.setInputFiles('#order-excel-import', file('m8.xlsx', [['2026/10/01', 'C-2', '好市多', '黑貓']]));
await page.waitForTimeout(2500);
H.check('再上傳同一份：已經放進清單的不會再問', !dlg(n0).some(d => d.msg.includes('可能已在鼎新取消')), JSON.stringify(dlg(n0).map(d => d.msg.slice(0, 80))));

// ---------- 件數要人工填的單：再匯入（數量沒變）不再問；只有運費的單不排波次 ----------
const xl2 = (name, rows) => xl(name, [HEAD].concat(rows));
const F1 = [['2026/10/03', 'E-1', '阿明便當', '蝦仁', '中 300G', 40, '包', '全日'], ['2026/10/03', 'E-2', '補收運費客戶', '運費', '', 1, '式', '黑貓']];
await page.setInputFiles('#order-excel-import', xl2('m9.xlsx', F1)); await page.waitForTimeout(2000);
H.check('第一次：問蝦仁要幾件', !!(await page.$('#pkg-ask-ok')));
await page.fill('.pkg-ask-input[data-i="0"]', '4'); await page.click('#pkg-ask-ok'); await page.waitForTimeout(3000);
so = Object.fromEntries((await H.all('salesOrders')).map(o => [o.orderNo, o]));
H.check('只有運費的單不匯入、不排波次', !so['E-2'] && so['E-1'] && so['E-1'].items[0].packageQty === 4, JSON.stringify([so['E-2'], so['E-1'] && so['E-1'].items]));
await page.reload(); await page.waitForTimeout(3000); await H.nav(page, 'wave-picking'); await page.waitForTimeout(800);
await page.setInputFiles('#order-excel-import', xl2('m10.xlsx', F1)); await page.waitForTimeout(2500);
H.check('再匯入同一份：數量沒變就沿用 4 件，不再問', !(await page.$('#pkg-ask-ok')));

// ---------- 備註認物流商的陷阱 ----------
const lg = await page.evaluate(() => ['原本全日，改黑貓', '全日 黑貓', '送到誠品信義店B1', '送科技大樓B1', '誠 下午送', '阿誠', '全日物流 早上送', '新竹物流', '崇文司機', '黑貓 下午到'].map(r => parseLogistics(r)));
H.check('備註：「改黑貓」→黑貓；兩家沒寫改→問人；誠品、科技大樓不誤認；「誠 下午送」→阿誠', JSON.stringify(lg) === JSON.stringify(['黑貓宅急便', '未指定', '未指定', '未指定', '阿誠', '阿誠', '全日物流', '新竹物流', '崇文自送', '黑貓宅急便']), JSON.stringify(lg));
// ---------- 全形規格、同品項多行、銷退負數 ----------
const H2 = ['銷貨日期', '銷貨單號', '客戶全名', '品名', '規格', '銷貨數量', '單位', '銷貨包裝數量', '備註'];
const p2 = await page.evaluate(rows => { const r = window.parseErpOrderRows(rows); return r.orders.map(o => [o.orderNo, o.items.map(i => i.productName + '|' + i.spec + '|' + i.quantity + '|' + i.packageQty)]); }, [H2,
  ['2026/10/04', 'F-1', '老街', '白蝦', '50／60*850G*14盒', 28, '盒', 2, '全日'],
  ['2026/10/04', 'F-2', '阿珠', '白蝦', '50/60*850G*14盒', 14, '盒', 1, '全日'], ['', 'F-2', '', '白蝦', '50/60*850G*14盒', 28, '盒', 2, ''],
  ['2026/10/04', 'F-3', 'Kevin', '熟白蝦', '1.1KG*8盒', 16, '盒', 2, '黑貓'], ['', 'F-3', '', '熟白蝦', '1.1KG*8盒', -8, '盒', -1, ''],
  ['2026/10/04', 'F-4', '全退', '透抽', 'L', 3, '件', 3, '黑貓'], ['', 'F-4', '', '透抽', 'L', -3, '件', -3, ''], ['', 'F-4', '', '干貝', 'S', 1, '件', 1, '']]);
H.check('全形「50／60」變成「50/60」；同品項兩行合成 3 件；銷退扣掉（2-1=1 件）；全退的品項拿掉', JSON.stringify(p2) === JSON.stringify([['F-1', ['白蝦|50/60*850G*14盒|28|2']], ['F-2', ['白蝦|50/60*850G*14盒|42|3']], ['F-3', ['熟白蝦|1.1KG*8盒|8|1']], ['F-4', ['干貝|S|1|1']]]), JSON.stringify(p2));

H.check('沒有頁面錯誤', log.errors.length === 0 && M.log.errors.length === 0, JSON.stringify(log.errors.concat(M.log.errors)));
await H.close(); process.exit(0);
