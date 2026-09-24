// 畫面好不好用：今日工作首頁、入庫類型必選、兩顆入庫按鈕、確認訊息寫清楚、八方的單交給堆高機公司不會變
import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';

const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
await H.resetData(async d => { await baseSeed(d);
  await H.setDoc(H.doc(d, 'pallets', 'T1'), { palletId: 'T1', productName: '白蝦', spec: '50/60', company: '崇文', quantity: 5, locationId: 'TEMP-IN', expiryDate: '2020-01-01' });
  await H.setDoc(H.doc(d, 'inboundOrders', 'O1'), { docNo: 'IN-X1', status: 'pending', approvalStatus: 'pending', productName: '白蝦' });
  await H.setDoc(H.doc(d, 'inboundTasks', 'K1'), { orderNo: 'IN-X1', status: 'pending' });
  await H.setDoc(H.doc(d, 'waves', 'W1'), { waveNo: 'W1', status: 'picking', summary: [] });
});
const { page, log } = await H.openApp(base, USERS.op);

// ---------- 今日工作 ----------
H.check('登入後第一頁是「今日工作」', await page.isVisible('#view-home') && (await page.innerText('#page-title')) === '今日工作', await page.innerText('#page-title'));
await page.waitForTimeout(1500);
const cards = await page.$$eval('#home-todos > div', els => els.map(e => e.innerText.replace(/\s+/g, ' ')));
H.note('待辦: ' + JSON.stringify(cards));
const num = label => { const c = cards.find(x => x.startsWith(label)); return c ? parseInt(c.slice(label.length)) : NaN; };
H.check('待辦數字正確（待入帳 1、等堆高機 1、暫存區 1、待財務 1、待揀波次 1、過期 1）',
  num('待入帳入庫單') === 1 && num('等堆高機上架') === 1 && num('暫存區待上架') === 1 && num('待財務核准') === 1 && num('待揀波次') === 1 && num('過期／30 天內到期') === 1, JSON.stringify(cards));
H.check('四個常用流程', (await page.$$eval('#home-flows > div', e => e.map(x => x.innerText.split('\n')[0].trim()))).join() === '入庫,出貨,調撥,盤點');
await page.click('#home-todos > div:nth-child(6)'); await page.waitForTimeout(800);   // 待揀波次
H.check('點待辦卡片直接到該畫面（波次揀貨），標題與選單同步', await page.isVisible('#view-wave-picking') && (await page.innerText('#page-title')).includes('波次揀貨'), await page.innerText('#page-title'));
await page.click("[onclick^=\"switchTab('home'\"]"); await page.waitForTimeout(500);
await page.click('#home-flows > div:nth-child(1)'); await page.waitForTimeout(800);
H.check('點「入庫」流程到智能入庫中心', await page.isVisible('#view-unified-inbound'));

// ---------- 入庫：類型必選、兩顆按鈕 ----------
H.check('入庫類型在主表單上（不用展開更多選項）', await page.isVisible('#btn-type-FG'));
H.check('只有兩顆主要按鈕：馬上入帳、交給堆高機', (await page.innerText('#btn-inbound-direct')).includes('馬上入帳') && (await page.innerText('#btn-inbound-forklift')).includes('交給堆高機') && !(await page.$('#advanced-options')));
async function fill(qty, loc, company) {
  if (company === '八方') await page.click('input[name="in-company"][value="八方"] + div');
  await page.click("button[onclick=\"openProductSelectModal('inbound')\"]"); await page.waitForTimeout(500);
  await page.click("#modal-product-select [onclick^=\"selectProductFromModal('P001'\"]"); await page.waitForTimeout(500);
  await page.fill('#in-batch', 'U1'); await page.fill('#in-exp-year', '2027'); await page.fill('#in-exp-month', '8'); await page.fill('#in-exp-day', '1');
  await page.fill('#in-qty', String(qty)); await page.fill('#in-loc', loc); await page.dispatchEvent('#in-loc', 'input');
}
await page.uncheck('#in-print-slip');
await fill(12, 'I-A-05-1F');
const nD = log.dialogs.length;
await page.click('#btn-inbound-direct'); await page.waitForTimeout(800);
H.check('沒選入庫類型 → 提示去選、不會入帳', log.dialogs.slice(nD).some(d => d.msg.includes('入庫類型')) && (await H.all('pallets')).length === 1, JSON.stringify(log.dialogs.slice(nD).map(d => d.msg.slice(0, 60))));
await page.click('#btn-type-FG');
await page.click('#btn-inbound-direct'); await page.waitForTimeout(2000);
const conf = log.dialogs.slice(nD).find(d => d.msg.startsWith('📦 馬上入帳'));
H.check('確認訊息寫清楚：品項、數量、儲位、類型、按確定會發生什麼', conf && conf.msg.includes('12 件') && conf.msg.includes('I-A-05-1F') && conf.msg.includes('成品') && conf.msg.includes('建立 1 板庫存'), conf && conf.msg);
const p1 = (await H.all('pallets')).find(p => p.locationId === 'I-A-05-1F');
const lg1 = (await H.all('inventoryLogs')).find(l => l.palletId === (p1 && p1.palletId));
H.check('馬上入帳：棧板＋異動記錄一起寫入，類型＝成品', p1 && p1.quantity === 12 && p1.category === 'FG' && lg1 && lg1.type === 'inbound', JSON.stringify([p1, lg1 && lg1.type]));

// 交給堆高機：八方的單，類型沿用上一筆
await fill(7, 'I-A-06-1F', '八方');
const nD2 = log.dialogs.length;
await page.click('#btn-inbound-forklift'); await page.waitForTimeout(2500);
// 交給堆高機只是發任務、不動庫存：不再跳確認，完成訊息寫清楚品項、數量、公司
const conf2 = log.dialogs.slice(nD2).find(d => d.msg.includes('已發到手機'));
H.check('交給堆高機不用再按確認；完成訊息寫品項、數量、公司、手機上架後才入帳', !log.dialogs.slice(nD2).some(d => d.type === 'confirm') && conf2 && conf2.msg.includes('7 件（八方）') && conf2.msg.includes('掃儲位後就會入帳'), JSON.stringify(log.dialogs.slice(nD2).map(d => d.msg.slice(0, 80))));
const o2 = (await H.all('inboundOrders')).find(o => o.quantity === 7);
const t2 = (await H.all('inboundTasks')).find(t => t.quantity === 7);
H.check('八方的入庫單與手機任務都記公司＝八方（之前會變成崇文）', o2 && o2.company === '八方' && o2.type === 'FG' && t2 && t2.company === '八方', JSON.stringify([o2 && o2.company, t2 && t2.company]));
H.check('完成訊息告訴使用者下一步', log.dialogs.slice(nD2).some(d => d.msg.includes('已發到手機') && d.msg.includes('掃儲位後就會入帳')));

H.check('沒有頁面錯誤', log.errors.length === 0, JSON.stringify(log.errors));
await H.close(); process.exit(0);
