// 誰正在揀：手機選波次時記下名字，別的手機的波次選單看得到「小王 揀貨中」，選同一個波次會先提醒
import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';

const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
const now = new Date().toISOString();
await H.resetData(async d => { await baseSeed(d);
  await H.setDoc(H.doc(d, 'settings', 'practice'), { enabled: true });
  for (const [w, o, p, q] of [['WV1', 'SO1', '白蝦', 5], ['WV2', 'SO2', '透抽', 3]]) {
    await H.setDoc(H.doc(d, 'salesOrders', o), { orderNo: o, customerName: '客戶' + o, status: 'inWave', items: [{ productName: p, spec: '', packageQty: q }] });
    await H.setDoc(H.doc(d, 'waves', w), { waveNo: w, logistics: '黑貓', status: 'pending', totalQty: q, orderCount: 1, createdAt: now,
      orders: [{ id: o, orderNo: o }], summary: [{ productName: p, spec: '', totalQty: q, orders: [o] }] });
  }
});

const A = await H.openApp(base, USERS.op, { mobile: true });    // 小王
const B = await H.openApp(base, USERS.op2, { mobile: true });   // 小李
for (const X of [A, B]) { await X.page.evaluate(() => openPage('picking')); await X.page.waitForTimeout(500); }
const opt = async (X, id) => X.page.$eval(`#picking-wave-select option[value="${id}"]`, o => o.textContent);

await A.page.selectOption('#picking-wave-select', 'WV1'); await A.page.waitForTimeout(1200);
const w1 = await H.one('waves', 'WV1');
H.check('小王選了 WV1：記下小王正在揀', Object.values(w1.pickers || {}).some(p => p.name === '小王'), JSON.stringify(w1.pickers));
H.check('小李的波次選單：WV1 寫「小王 揀貨中」，WV2 沒有', (await opt(B, 'WV1')).includes('小王（A 倉） 揀貨中') && !(await opt(B, 'WV2')).includes('揀貨中'), await opt(B, 'WV1'));
H.check('小王自己的選單不會寫自己在揀', !(await opt(A, 'WV1')).includes('揀貨中'), await opt(A, 'WV1'));

// 小李選同一個波次：先提醒；按取消就不進去
let d0 = B.log.dialogs.length;
B.page.__dialogPlan = [false];
await B.page.selectOption('#picking-wave-select', 'WV1'); await B.page.waitForTimeout(1200);
H.check('小李選 WV1：提醒「小王 正在揀這個波次」', B.log.dialogs.slice(d0).some(x => x.msg.includes('小王（A 倉） 正在揀這個波次')), JSON.stringify(B.log.dialogs.slice(d0)));
H.check('按取消：沒有進去（沒有揀貨卡片）', (await B.page.$eval('#picking-wave-select', s => s.value)) === '' && !(await B.page.isVisible('#picking-scan-area')));

// 選 WV2：不用提醒
d0 = B.log.dialogs.length;
await B.page.selectOption('#picking-wave-select', 'WV2'); await B.page.waitForTimeout(1200);
H.check('小李選沒人在揀的 WV2：不跳提醒，直接開始', B.log.dialogs.length === d0 && (await B.page.innerText('#picking-next')).includes('拿 3'));

// 小王按「拿好了」會更新時間；換到別的波次後 WV1 就不再顯示小王在揀
await A.page.click('#picking-next .pk-go'); await A.page.waitForTimeout(1000);
H.check('按「拿好了」：記錄還在（時間更新）', Object.values((await H.one('waves', 'WV1')).pickers || {}).some(p => p.name === '小王' && p.at > w1.pickers[Object.keys(w1.pickers)[0]].at));
A.page.__dialogPlan = [true];
await A.page.selectOption('#picking-wave-select', 'WV2'); await A.page.waitForTimeout(1500);
H.check('小王換到 WV2（小李在揀，提醒後按確定一起揀）：WV1 不再記小王', !Object.values((await H.one('waves', 'WV1')).pickers || {}).some(p => p.name === '小王') &&
  Object.values((await H.one('waves', 'WV2')).pickers || {}).map(p => p.name).sort().join() === '小李,小王');

// 超過 60 分鐘沒動作：不算在揀
await H.admin(async d => { await H.setDoc(H.doc(d, 'waves', 'WV1'), { pickers: { x: { name: '老張', at: '2020-01-01T00:00:00.000Z' } } }, { merge: true }); });
await B.page.waitForTimeout(1200);
H.check('超過 60 分鐘沒動作的人不顯示', !(await opt(B, 'WV1')).includes('揀貨中'), await opt(B, 'WV1'));

H.check('沒有頁面錯誤', A.log.errors.length === 0 && B.log.errors.length === 0, JSON.stringify(A.log.errors.concat(B.log.errors)));
await H.close(); process.exit(0);
