// 揀貨時不夠：當下最上面出現橘色提示「傳 LINE 問業務」（不擋畫面）；完成前「有 N 項不夠」也可以一起問
import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';
import { pushReport } from './erp-gs.mjs';
const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
await H.resetData(async d => { await baseSeed(d);
  const P = (id, o) => H.setDoc(H.doc(d, 'pallets', id), Object.assign({ palletId: id, company: '崇文', palletCapacity: 40, expiryDate: '2027-06-01' }, o));
  await P('P1', { productName: '白蝦', spec: '50/60', quantity: 20, locationId: 'I-A-01-1F' });
  await P('P3', { productName: '透抽', spec: 'L', quantity: 30, locationId: 'I-B-01-1F' });
});
const HEAD = ['銷貨日期', '銷貨單號', '客戶全名', '品名', '規格', '銷貨數量', '單位', '備註'];
const D = await H.openApp(base, USERS.op);
const M = await H.openApp(base, USERS.op2, { mobile: true }); const mp = M.page;
await D.page.waitForTimeout(1500); await mp.waitForTimeout(1500);
const r = await pushReport('每日客戶銷貨明細表_0900.xlsx', [HEAD, ['2026/10/01', 'S-1', '海霸王', '白蝦', '50/60', 2, '件', '黑貓'], ['2026/10/01', 'S-2', '好市多', '白蝦', '50/60', 1, '件', '黑貓'], ['2026/10/01', 'S-2', '', '透抽', 'L', 2, '件', '']]);
for (let i = 0; i < 30; i++) { await D.page.waitForTimeout(500); const x = await H.one('erpInbox', r.id); if (x && ['done', 'attention', 'error'].includes(x.status)) break; }
await mp.evaluate(() => { window._shared = []; navigator.share = t => { window._shared.push(t.text); return Promise.resolve(); }; Object.defineProperty(navigator, 'userAgent', { get: () => 'iPhone' }); });
await mp.evaluate(() => openPage('picking')); await mp.waitForTimeout(2000);
const first = await mp.evaluate(() => pickingItems.find(i => !i.completed).productName);
// 讓白蝦先出現
await mp.evaluate(() => { const n = pickingItems.find(i => i.productName === '白蝦' && !i.completed); window._shortItem = n; });
await mp.evaluate(() => pickShortNumber(1)); await mp.waitForTimeout(1800);
let top = await mp.textContent('#picking-next');
H.check('按「不夠」（白蝦 要 3 只有 1）：最上面出現橘色提示和「傳 LINE 問業務」', top.includes('缺貨：白蝦 50/60｜要 3 有 1（少 2）') && top.includes('傳 LINE 問業務'), top.slice(0, 300));
H.check('提示不擋畫面：下面照樣顯示下一項可以繼續揀', !(await mp.$('#ask-sales')) && top.includes('透抽'), top.slice(0, 300));
await mp.click('#picking-next .ask-send'); await mp.waitForTimeout(500);
let sent = await mp.evaluate(() => window._shared.splice(0));
H.check('傳出去的文字：每張單一塊先寫白蝦共要 3 有 1（少 2），再每張單一塊（單號／客戶／訂幾件）', sent[0] === '⚠️ 缺貨・黑貓\n\n白蝦 50/60 共要 3 有 1（少 2）\n\nS-1\n海霸王\n訂 2 件\n\nS-2\n好市多\n訂 1 件\n\n要怎麼處理？', JSON.stringify(sent));
const one = await mp.evaluate(() => { askSalesBox({ productName: '魷魚圈A', spec: '1KG*12包(阿魷,傳鮮)', orders: [{ orderNo: '231-20261005009', customer: '竹北好食堂', quantity: 3 }] }, 3, 2); const t = window._askPending.text; closeAskSales(); return t; });
H.check('只有一家：先寫缺什麼，再寫單號、客戶', one === '⚠️ 缺貨・黑貓\n\n魷魚圈A 1KG｜要 3 有 2（少 1）\n\n231-20261005009\n竹北好食堂\n\n要怎麼處理？', JSON.stringify(one));
H.check('傳完提示就收起來', !(await mp.textContent('#picking-next')).includes('傳 LINE 問業務'));
// 透抽揀完 → 完成：有 1 項不夠，可以一起問
await mp.fill('#picking-scan', 'P3'); await mp.press('#picking-scan', 'Enter'); await mp.waitForTimeout(1500);
await mp.evaluate(() => completePickingWave()); await mp.waitForTimeout(1500);
H.check('完成前「有 1 項不夠」畫面有「傳 LINE 問業務」', !!(await mp.$('#short-ask-btn')));
await mp.click('#short-ask-btn'); await mp.waitForTimeout(500);
sent = await mp.evaluate(() => window._shared.splice(0));
H.check('一起問：每張單一塊先寫白蝦只有 1 件，再每張少給的單一塊（單號／客戶／訂幾 給幾）', sent[0] && /^⚠️ 缺貨・黑貓\n\n白蝦 50\/60 只有 1 件\n\nS-\d\n(海霸王|好市多)\n訂 \d 給 \d/.test(sent[0]) && sent[0].endsWith('要怎麼處理？'), JSON.stringify(sent));
H.check('沒有頁面錯誤', M.log.errors.length === 0 && D.log.errors.length === 0, JSON.stringify(M.log.errors.concat(D.log.errors)));
await H.close(); process.exit(0);
