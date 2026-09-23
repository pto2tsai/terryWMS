import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';
const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
await H.resetData(async d => { await baseSeed(d);
  const P = (id, o) => H.setDoc(H.doc(d, 'pallets', id), Object.assign({ palletId: id, company: '崇文', palletCapacity: 40, productName: '白蝦', spec: '50/60', batchNo: 'B1', expiryDate: '2027-05-01' }, o));
  await P('D1', { quantity: 10, locationId: 'I-A-01-2F' }); await P('D2', { quantity: 12, locationId: 'I-A-01-1F' });
  await P('D3', { quantity: 8, locationId: 'I-A-02-2F' }); await P('D4', { quantity: 9, locationId: 'I-B-06-1F' });
  await P('D5', { quantity: 6, locationId: 'J-C-03-2F' });
});
const { page, log } = await H.openApp(base, USERS.sup);
await H.nav(page, 'move'); await page.waitForTimeout(1000);
await page.click("button[onclick=\"startDispatchAnalysis()\"]"); await page.waitForTimeout(2500);
const analysis = await page.evaluate(() => (window._dispatchAnalysis || []).map(a => ({ name: a.name, merges: (a.partialMerges || []).map(g => g.keep.palletId + '<-' + g.sources.map(s => s.palletId).join('+')), moves: (a.isolatedMoves || []).map(m => m.palletId + '->' + m.toSlot) })));
H.note('分析結果: ' + JSON.stringify(analysis));
H.check('分析出白蝦需要調度', analysis.length >= 1 && (analysis[0].merges.length + analysis[0].moves.length) > 0, JSON.stringify(analysis));
const checks = await page.$$('input.dispatch-order-cb, input[type=checkbox][onchange*="Dispatch"], #view-move input[type=checkbox]');
H.note('勾選框數: ' + checks.length);
await page.click('#dispatch-select-all').catch(() => {}); await page.waitForTimeout(400);
const pubText = await page.innerText('#btn-publish-mobile'); H.note('發布按鈕: ' + pubText);
await page.click('#btn-publish-mobile'); await page.waitForTimeout(2500);
H.note('dialogs: ' + JSON.stringify(log.dialogs.map(d => d.msg.slice(0, 160))));
const dos = await H.all('dispatchOrders');
H.note('工單: ' + JSON.stringify(dos.map(o => [o.orderNo, o.status, (o.operations || []).map(op => op.type + ':' + op.palletId + '(' + (op.docId || '-') + ')->' + op.to)])));
H.check('發布到手機：建立調度工單且帶棧板文件 ID', dos.length >= 1 && dos.every(o => (o.operations || []).every(op => op.docId)), JSON.stringify(dos.map(o => o.operations)));
// 手機執行
const M = await H.openApp(base, USERS.op, { mobile: true });
await M.page.click("[onclick=\"openPage('dispatch')\"]"); await M.page.waitForTimeout(1500);
const opts = await M.page.$$eval('#dispatch-order-select option', o => o.map(x => x.value).filter(Boolean));
H.check('手機看得到發布的工單', opts.length === dos.length, JSON.stringify(opts));
if (opts[0]) {
  await M.page.selectOption('#dispatch-order-select', opts[0]); await M.page.waitForTimeout(1500);
  const ops = (dos.find(o => o._id === opts[0]) || dos[0]).operations;
  for (const op of ops) { await M.page.fill('#dispatch-scan', op.palletId); await M.page.press('#dispatch-scan', 'Enter'); await M.page.waitForTimeout(1200);
    H.note('  掃 ' + op.palletId + ' → ' + await M.page.innerText('#dispatch-scan-result')); }
  await M.page.click("button[onclick=\"completeDispatchOrder()\"]"); await M.page.waitForTimeout(1500);
  const pl = await H.all('pallets');
  H.note('調度後庫存: ' + JSON.stringify(pl.map(p => [p._id, p.quantity, p.locationId])));
  H.check('總數不變（45 件）', pl.reduce((s, p) => s + p.quantity, 0) === 45, pl.reduce((s, p) => s + p.quantity, 0));
  H.check('板數減少（有合併）', pl.length < 5, pl.length);
  const d = await H.one('dispatchOrders', opts[0]); H.check('工單完成', d.status === 'completed', d.status);
}
H.note('errors: ' + JSON.stringify(log.errors.concat(M.log.errors)) + JSON.stringify(log.console.concat(M.log.console)));
await H.close(); process.exit(0);
