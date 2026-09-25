// 鼎新報表自動匯入：Google 雲端自動程式送進來的報表（用它自己的程式碼組資料）→
// 電腦版開著就自動匯入訂單、依物流商建好波次；件數換算不出來的單留給「手動匯入」；
// 其他報表存檔可檢視下載；應收帳款等只有主管看得到；看板、首頁提醒
import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';
import { pushReport } from './erp-gs.mjs';
import XLSX from 'xlsx'; import fs from 'fs';
const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
await H.resetData(baseSeed);

const HEAD = ['銷貨日期', '銷貨單號', '客戶代號', '客戶全名', '品名', '規格', '包裝數量', '包裝單位', '銷貨數量', '單位', '單價', '備註', '批號', '送貨地址一', '送貨地址二'];
const sales = [['每日客戶銷貨明細表'], ['列印時間 2026/09/25 08:55'], [], HEAD,
  ['2026/09/25', 'SO-1', 'C1', '海霸王', '白蝦', '50/60', 8, '件', 8, '件', 100, '黑貓', '', '台北市', ''],
  ['2026/09/25', 'SO-2', 'C2', '好市多', '透抽', 'L', 5, '件', 5, '件', 200, '新竹', '', '新北市', ''],
  ['2026/09/25', 'SO-3', 'C3', '客戶三', '干貝', 'S', 2, '件', 2, '件', 300, '', '', '桃園市', ''],
  ['2026/09/25', 'SO-4', 'C4', '客戶四', '鮭魚', '切片', '', '', 24, '盒', 90, '大榮', '', '台中市', '']];

const { page, log, ctx } = await H.openApp(base, USERS.op);
await page.waitForTimeout(1500);

// ---------- 訂單檔送進來 → 自動匯入 ----------
const r1 = await pushReport('每日客戶銷貨明細表_崇文_0925.xlsx', sales);
H.check('Google 自動程式組的資料寫得進 WMS', r1.status === 200, r1.body.slice(0, 200));
let inbox;
for (let i = 0; i < 20; i++) { await page.waitForTimeout(500); inbox = await H.one('erpInbox', r1.id); if (inbox && ['done', 'attention', 'error'].includes(inbox.status)) break; }
H.note('結果: ' + JSON.stringify(inbox && [inbox.status, inbox.result, inbox.issues]));
const so = Object.fromEntries((await H.all('salesOrders')).map(o => [o.orderNo, o]));
const waves = await H.all('waves');
H.check('電腦版開著：不用人按，自動匯入 3 張訂單、依物流商建好 2 個波次（黑貓、新竹）', so['SO-1'] && so['SO-2'] && so['SO-3'] && waves.length === 2 && waves.some(w => w.logistics === '黑貓宅急便') && waves.some(w => w.logistics === '新竹物流'), JSON.stringify([Object.keys(so), waves.map(w => w.logistics)]));
H.check('件數換算不出來的 SO-4 先不匯入；沒物流商的 SO-3 不排波次', !so['SO-4'] && !so['SO-3'].waveNo, JSON.stringify(so['SO-3']));
H.check('收件紀錄標「要處理」，說明 SO-4 要手動匯入、SO-3 要指定物流商', inbox.status === 'attention' && inbox.issues.some(x => x.includes('SO-4') && x.includes('手動匯入')) && inbox.issues.some(x => x.includes('SO-3') && x.includes('物流商')) && inbox.result.includes('建立 2 個波次') && inbox.company === '崇文', JSON.stringify(inbox));
H.check('自動匯入沒有跳任何視窗', !log.dialogs.some(d => d.type === 'confirm' || d.type === 'alert'), JSON.stringify(log.dialogs.map(d => d.msg.slice(0, 60))));

// ---------- 其他報表：存檔；應收帳款只有主管看得到 ----------
const stock = [['庫存明細表'], ['品號', '品名', '規格', '批號', '庫存數量'], ['A001', '白蝦', '50/60', 'B1', 120], ['A002', '透抽', 'L', 'T1', 50]];
const r2 = await pushReport('庫存明細表.xlsx', stock);
const r3 = await pushReport('應收帳款明細表_2026-09.xlsx', [['應收帳款明細表'], ['客戶', '金額'], ['海霸王', 123456]]);
H.check('庫存明細表、應收帳款明細表都收到（只存檔，不用處理）', (await H.one('erpInbox', r2.id)).status === 'stored' && (await H.one('erpInbox', r3.id)).sensitive === true);

await H.nav(page, 'erp-inbox'); await page.waitForTimeout(1500);
const opList = await page.innerText('#erp-inbox-body');
H.check('一般人員的 ERP 報表頁：看得到訂單、庫存明細，看不到應收帳款', opList.includes('每日客戶銷貨明細表') && opList.includes('庫存明細表') && !opList.includes('應收帳款') && opList.includes('要處理'), opList.slice(0, 300));
await page.click(`button[onclick="viewErpReport('${r2.id}')"]`); await page.waitForTimeout(800);
const view = await page.innerText('#modal-erp-view');
H.check('檢視：看得到報表內容（白蝦 120）', view.includes('白蝦') && view.includes('120') && view.includes('共 4 列'), view.slice(0, 200));
await page.evaluate(() => WMS.closeModal('modal-erp-view'));
const dl = page.waitForEvent('download');
await page.click(`button[onclick="downloadErpReport('${r2.id}')"]`);
const d = await dl;
const aoa = XLSX.utils.sheet_to_json(XLSX.read(fs.readFileSync(await d.path())).Sheets['報表'], { header: 1, defval: '' });
H.check('下載：存成 Excel，內容跟鼎新的一樣', aoa.length === 4 && aoa[2][1] === '白蝦' && aoa[2][4] === 120, JSON.stringify(aoa));

const SUP = await H.openApp(base, USERS.sup);
await SUP.page.waitForTimeout(1500);
await H.nav(SUP.page, 'erp-inbox'); await SUP.page.waitForTimeout(1500);
H.check('主管看得到應收帳款明細表', (await SUP.page.innerText('#erp-inbox-body')).includes('應收帳款明細表'));

// ---------- 看板、首頁提醒 ----------
const B = await ctx.newPage(); await B.setViewportSize({ width: 1920, height: 1080 });
await B.goto(base + '/board.html?night=off'); await B.waitForTimeout(3500);
const alertTxt = await B.innerText('#erp-alert').catch(() => '');
H.check('看板上方提醒：鼎新匯入有 1 份要處理、1 張訂單沒有物流商', alertTxt.includes('1 份要處理') && alertTxt.includes('1 張訂單沒有物流商'), alertTxt);
await H.nav(page, 'home'); await page.waitForTimeout(2000);
H.check('首頁「鼎新匯入要處理」有數字（1 份要處理＋1 張沒物流商＝2）', (await page.innerText('#home-todos')).includes('鼎新匯入要處理') && await page.evaluate(async () => await countErpAttention()) === 2);

// ---------- 手動匯入：補填件數 ----------
await H.nav(page, 'erp-inbox'); await page.waitForTimeout(1200);
const n0 = log.dialogs.length;
await page.click(`button[onclick="manualImportErp('${r1.id}')"]`); await page.waitForTimeout(1500);
const ask = await page.evaluate(() => { const m = document.getElementById('modal-pkg-ask'); return m ? m.innerText : ''; });
H.check('手動匯入：列出 SO-4 請填件數', ask.includes('SO-4') && ask.includes('鮭魚'), ask.slice(0, 200));
await page.fill('.pkg-ask-input', '2'); await page.click('#pkg-ask-ok'); await page.waitForTimeout(3000);
const so4 = (await H.all('salesOrders')).find(o => o.orderNo === 'SO-4');
const w2 = await H.all('waves');
H.check('SO-4 匯入（2 件），按一次確定就建好大榮的波次', so4 && so4.items[0].packageQty === 2 && w2.some(w => w.logistics === '大榮貨運'), JSON.stringify([so4 && so4.items, w2.map(w => w.logistics), log.dialogs.slice(n0).map(x => x.msg.slice(0, 80))]));
H.check('收件紀錄改成「完成」', (await H.one('erpInbox', r1.id)).status === 'done');

// ---------- 兩台電腦同時開著：新檔只會被處理一次 ----------
const nW = (await H.all('waves')).length;
const r4 = await pushReport('每日客戶銷貨明細表_1100.xlsx', [HEAD, ['2026/09/25', 'SO-5', 'C5', '客戶五', '白蝦', '50/60', 3, '件', 3, '件', 100, '黑貓', '', '', '']]);
let in4;
for (let i = 0; i < 20; i++) { await page.waitForTimeout(500); in4 = await H.one('erpInbox', r4.id); if (in4 && ['done', 'attention', 'error'].includes(in4.status)) break; }
await page.waitForTimeout(1500);
const so5 = (await H.all('salesOrders')).filter(o => o.orderNo === 'SO-5');
H.check('兩台電腦都開著：SO-5 只匯入一次、只建一個新波次', so5.length === 1 && (await H.all('waves')).length === nW + 1 && so5[0].waveNo, JSON.stringify([so5.length, (await H.all('waves')).length, nW, in4 && in4.status]));

// ---------- 同一個檔案再送一次（例如程式重跑）：不會重複 ----------
const r5 = await pushReport('每日客戶銷貨明細表_1100.xlsx', [HEAD], { fileId: r4.fileId, modified: r4.modified });
H.check('同一個檔案重送：資料庫拒絕（不會重複匯入）', r5.status === 409, String(r5.status));

H.check('沒有頁面錯誤', log.errors.length === 0 && SUP.log.errors.length === 0, JSON.stringify(log.errors.concat(SUP.log.errors)));
await H.close(); process.exit(0);
