import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';
const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
await H.resetData(async d => { await baseSeed(d);
  const P = (id, o) => H.setDoc(H.doc(d, 'pallets', id), Object.assign({ palletId: id, company: '崇文', productName: '白蝦', spec: '50/60', batchNo: 'B1', expiryDate: '2027-05-01' }, o));
  await P('S1', { quantity: 10, locationId: 'I-A-01-2F' }); await P('S2', { quantity: 20, locationId: 'I-A-02-1F' });
  await P('S3', { quantity: 5, locationId: 'I-A-03-3F' }); await P('S4', { quantity: 8, locationId: 'I-A-05-2F' });
  await P('S5', { quantity: 7, locationId: 'I-B-01-2F' });  // 不同區，不應出現
});
const { page, log } = await H.openApp(base, USERS.op);
await H.nav(page, 'stocktake'); await page.waitForTimeout(600);
await page.selectOption('#st-zone', 'I-A'); await page.fill('#st-row-from', '1'); await page.fill('#st-row-to', '3');
await page.click("button[onclick=\"loadStocktake()\"]"); await page.waitForTimeout(600);
const rows = await page.$$eval('#st-list tr', trs => trs.map(t => t.innerText.split('\t')[0]));
H.check('載入 I-A 第 1~3 排的 3 板（不含 I-A-05、I-B）', rows.length === 3 && rows.join(',') === 'I-A-01-2F,I-A-02-1F,I-A-03-3F', JSON.stringify(rows));
// 盤點期間，別人把 S2 扣了 2 件
await H.admin(async d => { await H.setDoc(H.doc(d, 'pallets', 'S2'), { quantity: 18 }, { merge: true }); });
const inputs = await page.$$('.st-count');
await inputs[0].fill('9'); await inputs[0].dispatchEvent('input');   // S1 少 1
await inputs[1].fill('17'); await inputs[1].dispatchEvent('input');  // S2（期間被動過）
// S3 不輸入 → 用「未盤的照帳面」
await page.click("button[onclick=\"fillStocktakeBook()\"]");
const summary = await page.innerText('#st-summary'); H.note('摘要: ' + summary);
H.check('差異即時顯示（2 板有差異）', /差異 2/.test(summary), summary);
await page.click("button[onclick=\"submitStocktake()\"]"); await page.waitForTimeout(3000);
H.note('dialogs: ' + JSON.stringify(log.dialogs.map(d => d.msg.slice(0, 220))));
const s1 = await H.one('pallets', 'S1'), s2 = await H.one('pallets', 'S2'), s3 = await H.one('pallets', 'S3');
H.check('S1 調整為 9', s1.quantity === 9, s1.quantity);
H.check('S2 盤點期間被異動 → 跳過不覆蓋（仍 18）並提醒', s2.quantity === 18 && log.dialogs.some(d => /盤點期間有異動/.test(d.msg)), s2.quantity);
H.check('S3 照帳面不變', s3.quantity === 5);
const lg = await H.all('inventoryLogs');
H.check('只寫 1 筆盤點調整記錄', lg.length === 1 && lg[0].type === 'adjust' && /盤點：帳面 10 → 實盤 9/.test(lg[0].note) && lg[0].quantityChange === -1, JSON.stringify(lg.map(l => l.note)));
// 重新載入後可重盤 S2
await page.waitForTimeout(1200);
const after = await page.$$eval('#st-list tr', trs => trs.map(t => t.innerText.replace(/\s+/g, ' ')));
H.note('重新載入: ' + JSON.stringify(after));
H.check('重新載入後 S2 帳面已更新為 18', after.some(t => /I-A-02-1F.* 18 /.test(t)), JSON.stringify(after));
// 盤到 0 → 刪除
const inp2 = await page.$$('.st-count'); await inp2[2].fill('0'); await inp2[2].dispatchEvent('input');
await page.click("button[onclick=\"submitStocktake()\"]"); await page.waitForTimeout(2500);
H.check('實盤 0 → 該板刪除', (await H.one('pallets', 'S3')) === null);
H.note('errors: ' + JSON.stringify(log.errors) + JSON.stringify(log.console));
await H.close(); process.exit(0);
