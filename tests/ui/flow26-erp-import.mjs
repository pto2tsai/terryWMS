// 鼎新訂單匯入省時省力：欄位依標題讀（多一欄、換順序也對；缺必要欄位擋下）、
// 認不出物流商的新單當場選、匯入後只問一次就依物流商建好波次（沒物流商的先不排，可在清單指定）
import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';
import XLSX from 'xlsx'; import fs from 'fs'; import os from 'os'; import path from 'path';
const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
await H.resetData(baseSeed);
const xl = (name, aoa) => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'S'); const f = path.join(os.tmpdir(), name); fs.writeFileSync(f, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })); return f; };
const { page, log } = await H.openApp(base, USERS.op);
await H.nav(page, 'wave-picking'); await page.waitForTimeout(500);
const dlg = n => log.dialogs.slice(n);

// ---------- 缺必要欄位：擋下 ----------
let n0 = log.dialogs.length;
await page.setInputFiles('#order-excel-import', xl('e1.xlsx', [['銷貨明細表'], ['銷貨日期', '銷貨單號', '客戶全名', '品名', '規格', '銷貨數量', '單位'], ['2026/09/24', 'SO-Z', '客戶Z', '白蝦', '50/60', 3, '件']]));
await page.waitForTimeout(1500);
H.check('鼎新報表少了「備註」欄：擋下並說明少了哪一欄，不匯入', dlg(n0).some(d => d.msg.includes('少了這些欄位') && d.msg.includes('備註')) && (await H.all('salesOrders')).length === 0, JSON.stringify(dlg(n0).map(d => d.msg.slice(0, 80))));

// ---------- 欄位換順序、多一欄；兩張單認不出物流商 ----------
const aoa = [['銷貨明細表'], ['列印日期 2026/09/24'], [],
  ['銷貨單號', '備註', '業務員', '銷貨日期', '客戶全名', '品名', '規格', '銷貨數量', '單位', '包裝數量', '送貨地址一'],
  ['SO-1', '黑貓', '王小明', '2026/09/24', '海霸王', '白蝦', '50/60', 8, '件', 8, '台北市'],
  ['SO-2', '新竹', '王小明', '2026/09/24', '好市多', '透抽', 'L', 5, '件', 5, '新北市'],
  ['SO-3', '', '李大華', '2026/09/24', '客戶三', '干貝', 'S', 2, '件', 2, '桃園市'],
  ['SO-4', '明天下午到', '李大華', '2026/09/24', '客戶四', '白蝦', '50/60', 4, '件', 4, '台中市']];
n0 = log.dialogs.length;
await page.setInputFiles('#order-excel-import', xl('e2.xlsx', aoa)); await page.waitForTimeout(1500);
const ask = await page.evaluate(() => { const m = document.getElementById('modal-lg-ask'); return m ? m.innerText : ''; });
H.check('認不出物流商的新單（備註空白、「明天下午到」）列出來請選', ask.includes('SO-3') && ask.includes('SO-4') && ask.includes('明天下午到') && !ask.includes('SO-1'), ask.slice(0, 300));
await page.click('#lg-ask-ok'); await page.waitForTimeout(200);
H.check('沒選完不能繼續', (await page.innerText('#lg-ask-msg')).includes('還有 2 張'));
await page.selectOption('#lg-ask-all', '新竹物流'); await page.dispatchEvent('#lg-ask-all', 'change');
await page.selectOption('.lg-ask-sel[data-i="1"]', '未指定');
await page.click('#lg-ask-ok'); await page.waitForTimeout(3000);
const so = Object.fromEntries((await H.all('salesOrders')).map(o => [o.orderNo, o]));
H.check('換了欄位順序、多一欄「業務員」也讀得對：客戶、品名、件數、物流商', so['SO-1'] && so['SO-1'].customer === '海霸王' && so['SO-1'].items[0].productName === '白蝦' && so['SO-1'].items[0].packageQty === 8 && so['SO-1'].address === '台北市' && so['SO-2'].logistics === '新竹物流', JSON.stringify(so['SO-1']));
const confirms = dlg(n0).filter(d => d.type === 'confirm');
H.check('匯入後只問一次：預覽要建哪些波次（黑貓、新竹），並提醒 1 張沒物流商先不排', confirms.length === 1 && confirms[0].msg.includes('黑貓') && confirms[0].msg.includes('新竹物流：2 單') && confirms[0].msg.includes('1 張沒有物流商') && confirms[0].msg.includes('SO-4'), JSON.stringify(dlg(n0).map(d => d.type + ':' + d.msg.slice(0, 160))));
const waves = await H.all('waves');
H.check('按一次確定就建好 2 個波次（黑貓 1 單、新竹 2 單），沒物流商的 SO-4 還在待排', waves.length === 2 && waves.some(w => w.logistics === '新竹物流' && w.orderCount === 2) && so['SO-4'].logistics === '未指定' && so['SO-4'].status === 'pending', JSON.stringify(waves.map(w => [w.logistics, w.orderCount])));

// ---------- 鼎新報表的真實特性：每頁重複抬頭、品名空白沿用上一列、「銷貨包裝數量」欄 ----------
const parsed = await page.evaluate(() => {
  const H = ['銷貨日期', '銷貨單號', '客戶全名', '品名', '規格', '銷貨數量', '單位', '銷貨包裝數量', '備註'];
  const rows = [['每日客戶銷貨明細表'], ['製表日期：2026/09/25'], H,
    ['2026/09/25', 'SO-P1', '客戶甲', '白蝦', '50/60', 10, '件', 10, '黑貓'],
    ['', '', '', '', '', 4, '件', 4, ''],
    ['', '', '', '', '', '', '銷貨:', '', ''],
    ['第 2 頁'], ['製表日期：2026/09/25'], ['期間 2026/09/25 ~ 2026/09/25'], H,
    ['', '', '', '透抽', 'L', 3, '件', 3, ''],
    ['2026/09/25', 'SO-P2', '客戶乙', '', '', 5, '件', 5, '新竹'],
    ['', '', '', '', '', 999.5, '', 88.25, ''], ['', '', '', '', '', '', '', '', '<結  束>']];
  const r = parseErpOrderRows(rows);
  return r.error ? r.error : r.orders.map(o => [o.orderNo, o.logistics, o.items.map(i => i.productName + ' ' + i.spec + ' x' + i.packageQty)]);
});
H.check('鼎新報表換頁：跳過每頁抬頭和重複的標題列；品名空白沿用上一列（同品項合成一行 10+4）；讀得到「銷貨包裝數量」；換了單號就不沿用（SO-P2 沒有品名，不建空單）；最後的加總列不算成品項', JSON.stringify(parsed) === JSON.stringify([['SO-P1', '黑貓宅急便', ['白蝦 50/60 x14', '透抽 L x3']]]), JSON.stringify(parsed));

const store = await page.evaluate(() => {
  const H = ['銷貨日期', '銷貨單號', '客戶全名', '品名', '規格', '包裝數量', '銷貨數量', '單位', '備註'];
  const r = parseErpOrderRows([H,
    ['2026/09/29', '231-001', '客戶甲', '白蝦', '50/60', 2, 24, '盒', '黑貓'],
    ['2026/09/29', '231-001', '客戶甲', '代工費', '', 0, 1, '式', '黑貓'],
    ['2026/09/29', '231-001', '客戶甲', '卡啦脆蝦', '原味NEW*25G', 0, 120, '包', '黑貓'],
    ['2026/09/29', '231-001', '客戶甲', '芝麻夾心絲', '120G', 0, 5, '包', '黑貓'],
    ['2026/09/29', '231-002', '客戶丙', '魷魚身TUBE', '300/400*不定重', 0, 189.5, 'KG', '大榮'],
    ['2026/09/29', '231-002', '客戶丙', '魷魚原料', 'L', 0, 36, 'KG', '大榮'],
    ['2026/09/29', '233-001', '門市一', '卡啦脆蝦', '原味', 0, 120, '包', ''],
    ['', '', '', '文蛤', '特大', 0, 10, '包', ''],
    ['2026/09/29', '234-002', '門市二', '鮮蚵', '300G', 0, 15, '包', ''],
    ['2026/09/29', '231-009', '統一永康福利社', '金目鱸魚片(包)-免', '200/300*10KG', 0, 10, '包', '崇文'],
    ['', '', '', '鯛魚排(包)-免', '2L', 0, 5, '片', '']]);
  return { orders: r.orders.filter(o => o.orderNo !== '231-002').map(o => o.orderNo + ':' + o.items.map(i => i.productName).join('/')), store: r.storeSkipped, ask: r.needPkg.length,
    squid: r.orders.filter(o => o.orderNo === '231-002').flatMap(o => o.items.map(i => i.packageQty)),
    ambient: isExcludedFromPickingList('卡啦脆蝦') && isExcludedFromPickingList('芝麻夾心絲') && isExcludedFromSortingLabel('卡啦小卷') && !isExcludedFromPickingList('白蝦') };
});
H.check('門市銷貨單（233-、234-）和統一（門市備貨）整張跳過、不問件數；代工費不列入；卡啦、夾心絲是常溫品（門市出貨）不問件數、不揀貨、不印標籤；魷魚身、魷魚原料每箱約 19 公斤自動換算（189.5→10、36→2）', JSON.stringify(store) === JSON.stringify({ orders: ['231-001:白蝦/卡啦脆蝦/芝麻夾心絲'], store: ['233-001', '234-002', '231-009'], ask: 0, squid: [10, 2], ambient: true }), JSON.stringify(store));
const lbl = await page.evaluate(() => { const r = buildSortingLabelsHtml({ waveNo: 'W-T', logistics: '黑貓宅急便', status: 'picking', orders: [
  { orderNo: 'A1', customer: '甲', items: [{ productName: '白蝦', spec: '50/60', quantity: 2, packageQty: 2 }] },
  { orderNo: 'A2', customer: '乙', items: [{ productName: '卡啦脆魷', spec: '原味', quantity: 100, packageQty: 100 }, { productName: '運費', quantity: 1, packageQty: 1 }] }] });
  return { count: r.count, skipped: r.skipped, a2: r.body.includes('</span>乙</div>'), a1: r.body.includes('</span>甲</div>') }; });
H.check('分貨標籤：整張單都是常溫品／運費（倉庫不揀）的不印，不會出現「共 0 件」', lbl.count === 1 && lbl.a1 && !lbl.a2 && lbl.skipped.join().includes('乙'), JSON.stringify(lbl));

// ---------- 在建立波次清單指定物流商 ----------
await page.click("button[onclick=\"openCreateWaveModal()\"]"); await page.waitForTimeout(1000);
const sel = await page.$('#modal-create-wave select[onchange^="setOrderLogistics"]');
H.check('建立波次清單：沒物流商的單顯示「指定物流商」選單', !!sel);
if (sel) { await sel.selectOption('黑貓宅急便'); await page.waitForTimeout(1000); }
const so4 = (await H.all('salesOrders')).find(o => o.orderNo === 'SO-4');
H.check('選了物流商就存回訂單', so4.logistics === '黑貓宅急便', so4.logistics);

// ---------- 再匯入同一份：沒變的略過，不再問物流商 ----------
n0 = log.dialogs.length;
await page.evaluate(() => { const m = document.getElementById('modal-create-wave'); if (m) closeCreateWaveModal(); });
await page.setInputFiles('#order-excel-import', xl('e3.xlsx', aoa)); await page.waitForTimeout(2000);
H.check('同一份再匯入：不再問物流商、不重複建單', !(await page.$('#modal-lg-ask')) && (await H.all('salesOrders')).length === 4, JSON.stringify(dlg(n0).map(d => d.msg.slice(0, 80))));

H.check('沒有頁面錯誤', log.errors.length === 0, JSON.stringify(log.errors));
await H.close(); process.exit(0);
