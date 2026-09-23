import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';
import { chromium } from 'playwright';
const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
await H.resetData(async d => { await baseSeed(d);
  await H.setDoc(H.doc(d, 'externalStock', 'E1'), { warehouseId: 'EXT-TP', productName: '透抽', spec: 'L', batchNo: 'X', company: '崇文', quantity: 20 });
  await H.setDoc(H.doc(d, 'salesOrders', 'S1'), { orderNo: 'SO-1', status: 'pending', customer: 'A', logistics: '黑貓宅急便', items: [] });
  await H.setDoc(H.doc(d, 'inboundOrders', 'I1'), { docNo: 'IN-1', status: 'pending', productName: '白蝦', quantity: 1, createdAt: new Date().toISOString() });
  await H.setDoc(H.doc(d, 'settings', 'rentalSettings'), { settlement: { settleDay: 20, freeUntilDay: 20 } });
});
const b = await chromium.launch(); const ctx = await b.newContext(); const pg = await ctx.newPage(); const errs = [];
pg.on('console', m => { if (m.type() === 'error' || /失敗|denied|permission/i.test(m.text())) errs.push(m.text().slice(0, 150)); });
pg.on('dialog', d => d.accept());
const fs = await import('fs'); const path = await import('path'); const NM = path.join(H.REPO, 'tests/node_modules');
await ctx.route(/^(?!http:\/\/(127\.0\.0\.1|localhost))/, r => { const u = r.request().url(); const m = u.match(/firebasejs\/10\.7\.1\/(firebase-[a-z]+-compat\.js)/);
  if (m) return r.fulfill({ body: fs.readFileSync(path.join(NM, 'firebase10', m[1])), contentType: 'text/javascript' });
  if (u.includes('xlsx')) return r.fulfill({ body: fs.readFileSync(path.join(NM, 'xlsx/dist/xlsx.full.min.js')), contentType: 'text/javascript' });
  return r.fulfill({ body: u.includes('tailwind') ? 'window.tailwind={};' : '', contentType: 'text/javascript' }); });
const base2 = base.replace('8766', '8766');
await pg.goto(base2 + '/index.html');
await pg.waitForTimeout(6000);   // 使用者慢慢輸入帳密
const errsBefore = errs.slice();
await pg.fill('#login-email', USERS.op); await pg.fill('#login-pwd', 'pass1234'); await pg.evaluate(() => window.loginSystem());
await pg.waitForFunction(() => window.currentUser, null, { timeout: 15000 }); await pg.waitForTimeout(4000);
const state = await pg.evaluate(() => ({
  productMaster: (window.productMasterData || []).length,
  externalStock: (window.externalStock || []).length,
  orders: (window._orderData && window._orderData.orders || []).length,
  warehouses: (window.warehousesData || window.warehouseList || window._warehouses || []).length,
  rentalSettleDay: window.rentalSettings && window.rentalSettings.settlement && window.rentalSettings.settlement.settleDay,
  pendingBadge: (document.getElementById('pending-inbound-count') || {}).innerText
}));
H.note('登入前錯誤: ' + JSON.stringify(errsBefore));
H.note('登入後錯誤: ' + JSON.stringify(errs.slice(errsBefore.length)));
H.note('載入狀態: ' + JSON.stringify(state));
H.check('慢登入後品項主檔有載入', state.productMaster === 2, state.productMaster);
H.check('慢登入後外倉庫存有載入', state.externalStock === 1, state.externalStock);
H.check('慢登入後訂單有載入', state.orders === 1, state.orders);
H.check('慢登入後倉租設定來自資料庫（結算日 20）', state.rentalSettleDay === 20, state.rentalSettleDay);
H.check('登入後沒有權限錯誤', !errs.slice(errsBefore.length).some(e => /permission|false for/i.test(e)), JSON.stringify(errs.slice(errsBefore.length)));
await b.close(); process.exit(0);
