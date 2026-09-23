import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';
const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
await H.resetData(async d => { await baseSeed(d);
  const P = (id, o) => H.setDoc(H.doc(d, 'pallets', id), Object.assign({ palletId: id, company: '崇文', palletCapacity: 40, productName: '白蝦', spec: '50/60' }, o));
  await P('IN-20260901-001', { batchNo: 'B1', expiryDate: '2027-05-01', quantity: 12, locationId: 'I-A-03-2F' });
  await P('IN-20260901-002', { batchNo: 'B1', expiryDate: '2027-05-01', quantity: 7, locationId: 'I-A-04-2F' });
  await P('IN-20260901-003', { batchNo: 'B9', expiryDate: '2027-02-01', quantity: 5, locationId: 'I-A-05-2F' });
});
const { page, log } = await H.openApp(base, USERS.op);
await H.nav(page, 'merge');
// 移動儲位：掃描板號（小寫也要能找到）
await page.click("button[onclick=\"setMergeMode('move')\"]").catch(()=>{});
await page.fill('#move-pallet-id', 'in-20260901-001'); await page.dispatchEvent('#move-pallet-id', 'change'); await page.waitForTimeout(800);
const info = await page.evaluate(() => (document.getElementById('move-pallet-info') || {}).innerText || '');
H.note('掃描後資訊: ' + info.replace(/\n/g, ' ').slice(0, 150));
await page.fill('#move-target-loc', 'j-c-02-1f');
await page.click("button[onclick=\"executePalletMove()\"]"); await page.waitForTimeout(2000);
let p1 = await H.one('pallets', 'IN-20260901-001');
H.check('移動成功（小寫輸入自動轉大寫）', p1.locationId === 'J-C-02-1F', p1.locationId);
// 合併：同批 → 直接合併
await page.click("button[onclick=\"setMergeMode('merge')\"]"); await page.waitForTimeout(400);
await page.fill('#merge-keep-id', 'IN-20260901-001'); await page.dispatchEvent('#merge-keep-id', 'change');
await page.fill('#merge-remove-id', 'IN-20260901-002'); await page.dispatchEvent('#merge-remove-id', 'change'); await page.waitForTimeout(800);
await page.click("button[onclick=\"executePalletMerge()\"]"); await page.waitForTimeout(2000);
p1 = await H.one('pallets', 'IN-20260901-001');
H.check('同批合併 12+7=19，被併板刪除', p1.quantity === 19 && !(await H.one('pallets', 'IN-20260901-002')), JSON.stringify(p1));
// 合併不同批號：會提醒，按確定後合併，效期取較早
const n = log.dialogs.length;
await page.fill('#merge-keep-id', 'IN-20260901-001'); await page.dispatchEvent('#merge-keep-id', 'change');
await page.fill('#merge-remove-id', 'IN-20260901-003'); await page.dispatchEvent('#merge-remove-id', 'change'); await page.waitForTimeout(800);
await page.click("button[onclick=\"executePalletMerge()\"]"); await page.waitForTimeout(2000);
p1 = await H.one('pallets', 'IN-20260901-001');
H.note('混批 dialogs: ' + JSON.stringify(log.dialogs.slice(n).map(d => d.msg.slice(0, 200))));
H.check('不同批號：有提醒、合併後 24 件、效期取較早 2027-02-01', log.dialogs.slice(n).some(d => /批號不同/.test(d.msg)) && p1.quantity === 24 && p1.expiryDate === '2027-02-01', JSON.stringify(p1));
// 備案查詢：用儲位找板
await page.click("button[onclick=\"setMergeMode('move')\"]"); await page.waitForTimeout(300);
await page.click("button[onclick=\"openMoveFallback()\"]"); await page.waitForTimeout(500);
await page.fill('#fallback-move-loc', 'J-C-02-1F'); await page.dispatchEvent('#fallback-move-loc', 'change'); await page.waitForTimeout(800);
const found = await page.evaluate(() => [...document.querySelectorAll('[id*="fallback"][id*="list"],[id*="fallback"][id*="result"]')].map(e => e.innerText).join(' ').slice(0, 300));
H.check('備案：用儲位查得到那一板', /IN-20260901-001|白蝦/.test(found), found.replace(/\n/g, ' ').slice(0, 200));
const lg = await H.all('inventoryLogs');
H.check('移動與合併都有記錄（move 1、merge 2）', lg.filter(l => l.type === 'move').length === 1 && lg.filter(l => l.type === 'merge').length === 2, JSON.stringify(lg.map(l => l.type)));
H.note('errors: ' + JSON.stringify(log.errors) + JSON.stringify(log.console));
await H.close(); process.exit(0);
