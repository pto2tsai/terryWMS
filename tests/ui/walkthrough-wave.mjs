// 走查（不在 run-all 裡）：仿鼎新「每日客戶銷貨明細表」從電腦匯入 → 手機揀貨（含不夠）→ 印標籤 → 看板
// SHOT_DIR=截圖資料夾 TW_CSS=編好的 tailwind 樣式
import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';
import XLSX from 'xlsx'; import fs from 'fs';
const SD = process.env.SHOT_DIR || '/tmp';
const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
await H.resetData(async d => { await baseSeed(d);
  await H.setDoc(H.doc(d, 'settings', 'practice'), { enabled: true });
  const P = (id, o) => H.setDoc(H.doc(d, 'pallets', id), Object.assign({ palletId: id, company: '崇文', locationId: 'OTHER', practiceStock: true }, o));
  await P('PR001', { productId: 'A5026716', productName: '502白仁', spec: '60/70*16KG', batchNo: '290702_冠緯', quantity: 35 });
  await P('PR002', { productId: 'A0916712', productName: '單凍白仁原料', spec: '60/70*1KG*12包(IQ20%)', batchNo: '合眾_260820', quantity: 20 });
  await P('PR003', { productId: 'BW670802', productName: '生白蝦', spec: '60/70*850G*12盒*泰國', batchNo: '傳鮮T2506_290102_裕寧', quantity: 90 });
  await P('PR004', { productId: 'AW675001', productName: '白仁成品', spec: '60/70*5斤*6包', batchNo: '280301_中國', quantity: 19 });
});
const HEAD = ['銷貨日期', '銷貨單號', '客戶代號', '客戶全名', '品名', '規格', '包裝數量', '包裝單位', '銷貨數量', '單位', '單價', '備註', '批號', '送貨地址一', '送貨地址二'];
const L = (no, cid, cust, name, spec, pkg, qty, unit, remark, addr) => ['2026/09/28', no, cid, cust, name, spec, pkg, '件', qty, unit, 100, remark, '', addr, ''];
const aoa = [['崇文冷凍食品股份有限公司'], ['每日客戶銷貨明細表'], ['製表日期: 2026/09/28　　銷貨日期: 2026/09/22 至 2026/09/28'], HEAD,
  L('S1150928001', 'C001', '海霸王', '502白仁', '60/70*16KG', 3, 48, 'KG', '黑貓', '台北市中山區'),
  L('S1150928001', 'C001', '海霸王', '單凍白仁原料', '60/70*1KG*12包(IQ20%)', 2, 24, '包', '', ''),
  L('S1150928002', 'C002', '好市多', '502白仁', '60/70*16KG', 2, 32, 'KG', '黑貓 下午送', '新北市汐止區'),
  L('S1150928002', 'C002', '好市多', '保麗龍箱', '大', 1, 1, '個', '', ''),
  L('S1150928002', 'C002', '好市多', '運費', '', 1, 1, '式', '', ''),
  L('S1150928003', 'C003', '全聯', '生白蝦', '60/70*850G*12盒*泰國', 5, 60, '盒', '新竹', '桃園市'),
  L('S1150928004', 'C004', '家樂福', '白仁成品', '60/70*5斤*6包', 4, 24, '包', '', '台中市'),
  L('S1150928005', 'C005', '王記海產', '502白仁', '60/70*16KG', 1, 16, 'KG', '自取', '')];
const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), '銷貨明細');
const file = SD + '/orders-test.xlsx';   // 測試工具不吃中文檔名（真的電腦沒問題）
fs.writeFileSync(file, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
const note = (...a) => console.log('📝', ...a);

// ---------- 辦公室電腦 ----------
const D = await H.openApp(base, process.env.WU === 'op' ? USERS.op : USERS.sup);
await D.page.waitForTimeout(1500);
await H.nav(D.page, 'wave-picking'); await D.page.waitForTimeout(1000);
await D.page.screenshot({ path: SD + '/m01-wave-page.png' });
await D.page.setInputFiles('#order-excel-import', file); await D.page.waitForTimeout(2500);
const askOpen = await D.page.isVisible('#modal-lg-ask');
note('跳出選物流商視窗：', askOpen, askOpen ? await D.page.innerText('#modal-lg-ask') : '');
if (askOpen) {
  await D.page.screenshot({ path: SD + '/m02-ask-logistics.png' });
  const opts = await D.page.$$eval('.lg-ask-sel option', o => o.map(x => x.value));
  note('物流商選項：', opts.join(','));
  await D.page.selectOption('.lg-ask-sel', '新竹物流');
  await D.page.click('#lg-ask-ok'); await D.page.waitForTimeout(2500);
}
note('對話框：', JSON.stringify(D.log.dialogs.map(x => x.msg)));
await D.page.waitForTimeout(1500);
const printBtn = await D.page.isVisible('#btn-print-new-waves');
note('建好波次、列印按鈕：', printBtn);
if (printBtn) await D.page.screenshot({ path: SD + '/m03-waves-created.png' });
const waves = await H.all('waves');
note('波次：', JSON.stringify(waves.map(w => [w.waveNo, w.logistics, w.orderCount, (w.summary || []).map(s => s.productName + ':' + s.totalQty)])));
const orders = await H.all('salesOrders');
note('訂單：', JSON.stringify(orders.map(o => [o.orderNo, o.customer, o.logistics, o.status, (o.items || []).map(i => i.productName + 'x' + i.packageQty)])));
if (printBtn) {
  const pp = D.page.waitForEvent('popup'); await D.page.click('#btn-print-new-waves'); const pop = await pp; await pop.waitForTimeout(800);
  await pop.setViewportSize({ width: 900, height: 900 }); await pop.screenshot({ path: SD + '/m04-picklists.png', fullPage: true }); await pop.close();
}
await D.page.waitForTimeout(800);
await D.page.screenshot({ path: SD + '/m05-wave-list.png' });
note('波次清單：', (await D.page.innerText('#wave-list-body')).replace(/\s+/g, ' ').slice(0, 400));
const black = waves.find(w => (w.logistics || '').includes('黑貓'));

// ---------- 開始揀貨（電腦）----------
const pp2 = D.page.waitForEvent('popup', { timeout: 5000 }).catch(() => null);
await D.page.click(`[onclick="openWaveExecute('${black.waveNo}')"]`); await D.page.waitForTimeout(1500);
const pv = await pp2;
if (pv) { await pv.setViewportSize({ width: 900, height: 700 }); await pv.screenshot({ path: SD + '/m06-start-preview.png' }); await pv.close(); }
await D.page.screenshot({ path: SD + '/m07-execute-modal.png' });
await D.page.evaluate(() => closeWaveExecuteModal());

// ---------- 手機 ----------
const M = await H.openApp(base, USERS.op2, { mobile: true }); const mp = M.page;
await mp.waitForTimeout(2000);
await mp.screenshot({ path: SD + '/m08-phone-menu.png' });
await mp.evaluate(() => openPage('picking')); await mp.waitForTimeout(600);
note('手機波次選單：', await mp.$$eval('#picking-wave-select option', o => o.map(x => x.textContent).join(' | ')));
await mp.selectOption('#picking-wave-select', black.waveNo); await mp.waitForTimeout(1200);
await mp.screenshot({ path: SD + '/m09-phone-pick.png' });
// 依序：先揀的若是 502白仁 → 不夠；其他 → 拿好了
for (let i = 0; i < 6; i++) {
  const cur = await mp.evaluate(() => { const n = pickingItems.filter(x => !x.completed && !x.shortage)[0]; return n ? n.productName + '|' + n.pickQty : ''; });
  if (!cur) break;
  note('手機現在要拿：', cur);
  if (cur.startsWith('502白仁')) {
    mp.__dialogPlan = ['3'];
    await mp.click('#picking-next .pk-short'); await mp.waitForTimeout(500);
    if (await mp.isVisible('#short-pad')) { await mp.screenshot({ path: SD + '/m10a-phone-pad.png' }); await mp.click('#short-pad button:text-is("3")'); }
    await mp.waitForTimeout(1500);
    await mp.screenshot({ path: SD + '/m10-phone-short.png' });
  } else {
    await mp.click('#picking-next .pk-go'); await mp.waitForTimeout(1000);
  }
}
await mp.screenshot({ path: SD + '/m10b-phone-alldone.png' });
await mp.click('#picking-next .pk-go'); await mp.waitForTimeout(1000);
await mp.screenshot({ path: SD + '/m11-phone-short-panel.png', fullPage: true });
note('缺貨畫面：', (await mp.innerText('#picking-next')).replace(/\s+/g, ' '));
await mp.click('#short-ok-btn'); await mp.waitForTimeout(2500);
await mp.screenshot({ path: SD + '/m12-phone-finish.png' });
note('完成畫面：', (await mp.innerText('#picking-next')).replace(/\s+/g, ' '));
await mp.evaluate(() => { window.print = () => {}; });
if (await mp.$('text=印標籤（')) { await mp.click('text=印標籤（'); await mp.waitForTimeout(800); }
await mp.emulateMedia({ media: 'print' }); await mp.screenshot({ path: SD + '/m13-labels-print.png', fullPage: true }); await mp.emulateMedia({ media: 'screen' });
note('訂單結果：', JSON.stringify((await H.all('salesOrders')).map(o => [o.orderNo, o.status, o.erpFixNeeded || false, (o.shortShipped || []).map(x => x.productName + x.want + '→' + x.got)])));

// ---------- 看板、首頁 ----------
const B = await D.ctx.newPage(); await B.setViewportSize({ width: 1600, height: 900 });
await B.goto(base + '/board.html?night=off'); await B.waitForTimeout(6000);
await B.screenshot({ path: SD + '/m14-board.png' });
note('看板提醒：', await B.innerText('#erp-alert'));
await H.nav(D.page, 'home'); await D.page.waitForTimeout(2500);
await D.page.screenshot({ path: SD + '/m15-home.png' });
note('錯誤：', JSON.stringify(D.log.errors.concat(M.log.errors)), JSON.stringify(D.log.console.concat(M.log.console).slice(0, 5)));
await H.close(); process.exit(0);
