// 兩間倉庫同一個波次分批揀：手機只叫人拿自己這間的貨；還不知道在哪一間的兩邊都出現，拿到的那間記起來；
//   這間一件都沒有 → 交給另一間；兩間都拿完才能完成。黑貓貼托運單不印標籤，改用手機分貨畫面。第一次用的手機先問在哪一間。
import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';
import { pushReport } from './erp-gs.mjs';
const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
await H.resetData(async d => { await baseSeed(d);
  await H.setDoc(H.doc(d, 'settings', 'practice'), { enabled: true });
  await H.setDoc(H.doc(d, 'productHome', encodeURIComponent('白蝦|||50/60')), { key: '白蝦|||50/60', productName: '白蝦', spec: '50/60', house: 'J' });
});
const HEAD = ['銷貨日期', '銷貨單號', '客戶全名', '品名', '規格', '銷貨數量', '單位', '備註'];
const D = await H.openApp(base, USERS.sup);
const A = await H.openApp(base, USERS.op, { mobile: true, house: 'J' });    // 小王在 J庫
const B = await H.openApp(base, USERS.op2, { mobile: true, house: 'I' });   // 小李在 I庫
const waitInbox = async id => { for (let i = 0; i < 30; i++) { await D.page.waitForTimeout(500); const x = await H.one('erpInbox', id); if (x && ['done', 'attention', 'error'].includes(x.status)) break; } };
await waitInbox((await pushReport('每日客戶銷貨明細表_0900.xlsx', [HEAD,
  ['2026/09/28', 'A-1', '海霸王', '白蝦', '50/60', 5, '件', '黑貓'], ['2026/09/28', 'A-1', '海霸王', '透抽', 'L', 2, '件', '黑貓'],
  ['2026/09/28', 'A-2', '好市多', '白蝦', '50/60', 3, '件', '黑貓'], ['2026/09/28', 'A-2', '好市多', '魷魚', 'M', 4, '件', '黑貓']])).id);
const W = (await H.all('waves'))[0];
H.check('波次建好（黑貓，白蝦 8、透抽 2、魷魚 4）', W && W.totalQty === 14 && /黑貓/.test(W.logistics), JSON.stringify(W && [W.totalQty, W.logistics]));

const pend = X => X.page.evaluate(() => pickingItems.filter(i => !i.completed && !i.shortage).map(i => i.productName));
const card = X => X.page.innerText('#picking-next');
const cur = X => X.page.$eval('#picking-next .pk-name', e => e.textContent).catch(() => '');
for (const X of [A, B]) { await X.page.evaluate(() => openPage('picking')); await X.page.waitForTimeout(500); }
await A.page.selectOption('#picking-wave-select', W._id); await A.page.waitForTimeout(1200);
const optB = await B.page.$eval(`#picking-wave-select option[value="${W._id}"]`, o => o.textContent);
H.check('小李的選單：寫「小王（J庫） 揀貨中」', optB.includes('小王（J庫） 揀貨中'), optB);
let d0 = B.log.dialogs.length;
await B.page.selectOption('#picking-wave-select', W._id); await B.page.waitForTimeout(1200);
H.check('小李在 I庫選同一個波次：不跳提醒（另一間各拿各的）', B.log.dialogs.length === d0, JSON.stringify(B.log.dialogs.slice(d0)));
const cA = await card(A), cB = await card(B);
H.check('上方寫在哪一間（📍 J庫 ⇄／📍 I庫 ⇄）', cA.includes('J庫 ⇄') && cB.includes('I庫 ⇄'), cA.slice(0, 40) + ' | ' + cB.slice(0, 40));
if (process.env.SHOT_DIR) { await A.page.screenshot({ path: process.env.SHOT_DIR + '/h1-A.png' }); await B.page.screenshot({ path: process.env.SHOT_DIR + '/h1-B.png' }); }
H.check('I庫的手機不會叫人拿白蝦（已知在 J庫）；透抽、魷魚還不知道，兩邊都會出現', !cB.includes('白蝦') && /透抽|魷魚/.test(await cur(B)), cB);

// I庫拿到透抽 → 記住透抽在 I庫，J庫不再出現
while (!(await cur(B)).includes('透抽')) { await B.page.click('#picking-next .pk-short'); await B.page.waitForTimeout(300); await B.page.click('#short-pad button:text-is("0")'); await B.page.waitForTimeout(1200); }
await B.page.click('#picking-next .pk-go'); await B.page.waitForTimeout(1500);
H.check('I庫按透抽「拿好了」：記住透抽在 I庫', (await H.one('productHome', encodeURIComponent('透抽|||L')) || {}).house === 'I');
await A.page.waitForTimeout(800);
H.check('J庫的手機：透抽已經拿了，不會出現', !(await card(A)).includes('透抽'), await card(A));

// J庫：白蝦拿好；魷魚 J庫一件都沒有 → 交給 I庫（不算缺貨）
for (let i = 0; i < 3; i++) {
  const n = await cur(A);
  if (n.includes('白蝦')) { await A.page.click('#picking-next .pk-go'); await A.page.waitForTimeout(1200); }
  else if (n.includes('魷魚')) { await A.page.click('#picking-next .pk-short'); await A.page.waitForTimeout(300); await A.page.click('#short-pad button:text-is("0")'); await A.page.waitForTimeout(1500); }
}
const wA = await H.one('waves', W._id);
H.check('J庫魷魚點 0：記成在 I庫、不記缺貨', (await H.one('productHome', encodeURIComponent('魷魚|||M')) || {}).house === 'I' && !(wA.shortLog || []).length, JSON.stringify([wA.shortLog]));
const doneA = await card(A);
H.check('J庫的手機：「這間拿完了，I庫還有 1 項（小李揀貨中）」，沒有完成出貨按鈕', doneA.includes('這間拿完了') && doneA.includes('I庫還有 1 項') && doneA.includes('小李') && !(await A.page.$('#picking-next .pk-go')), doneA);
if (process.env.SHOT_DIR) await A.page.screenshot({ path: process.env.SHOT_DIR + '/h2-A-done.png' });

// I庫拿魷魚 → 兩間都拿完 → 完成出貨
await B.page.waitForTimeout(500);
H.check('I庫的手機現在叫人拿魷魚', (await cur(B)).includes('魷魚'), await card(B));
await B.page.click('#picking-next .pk-go'); await B.page.waitForTimeout(1200);
const allB = await card(B);
H.check('兩間都拿完：I庫出現「完成出貨」', allB.includes('全部拿完') && allB.includes('完成出貨'), allB);
await B.page.click('#picking-next .pk-go'); await B.page.waitForTimeout(2500);
const wd = await H.one('waves', W._id);
H.check('波次完成、兩張單都出貨', wd.status === 'done' && (wd.shipped || []).length === 2, JSON.stringify([wd.status, wd.shipped]));
const fin = await card(B);
H.check('黑貓：完成畫面寫「貼托運單就好，不用印標籤」，沒有印標籤按鈕；有「分貨（2 家）」', fin.includes('貼托運單就好') && !fin.includes('印標籤（') && fin.includes('分貨（2 家）'), fin);
if (process.env.SHOT_DIR) await B.page.screenshot({ path: process.env.SHOT_DIR + '/h3-B-finish.png' });
await A.page.waitForTimeout(800);
H.check('J庫的手機：顯示「此波次已在其他裝置完成」', (await A.page.innerText('#picking-scan-result')).includes('其他裝置完成'));

// 分貨：一家一張卡片
await B.page.click('text=分貨（'); await B.page.waitForTimeout(500);
const s1 = await card(B);
H.check('分貨畫面：海霸王 白蝦 5 件、透抽 2 件；好市多 白蝦 3 件、魷魚 4 件', /海霸王[\s\S]*白蝦 50\/60\s*5 件[\s\S]*透抽 L\s*2 件[\s\S]*好市多[\s\S]*白蝦 50\/60\s*3 件[\s\S]*魷魚 M\s*4 件/.test(s1), s1);
if (process.env.SHOT_DIR) await B.page.screenshot({ path: process.env.SHOT_DIR + '/h4-sort.png', fullPage: true });
await B.page.click('text=這家分好了'); await B.page.waitForTimeout(800);
H.check('按「這家分好了」：1 / 2 家，記在波次上', /1\s*\/ 2 家/.test(await card(B)) && ((await H.one('waves', W._id)).sortedOrders || []).length === 1);
await B.page.click('text=這家分好了'); await B.page.waitForTimeout(800);
H.check('兩家都分好：「全部分好了」', (await card(B)).includes('全部分好了'));

// 電腦：揀貨單分兩間；商品在哪一間可以改
const groups = await D.page.evaluate(() => groupRowsByHouse([{ productName: '白蝦', spec: '50/60' }, { productName: '透抽', spec: 'L' }, { productName: '蝦仁', spec: '-' }]).map(g => g.name + ':' + g.rows.map(r => r.productName).join('+')));
H.check('電腦揀貨單分倉：J庫 白蝦、I庫 透抽、還不知道的 蝦仁', JSON.stringify(groups) === JSON.stringify(['J庫:白蝦', 'I庫:透抽', '還不知道在哪一間（先找到的那間記起來）:蝦仁']), JSON.stringify(groups));
await H.nav(D.page, 'wave-picking'); await D.page.waitForTimeout(800);
await D.page.evaluate(() => toggleWaveSettings(true)); await D.page.click('#btn-product-homes'); await D.page.waitForTimeout(1000);
const ph = await D.page.innerText('#modal-product-homes');
H.check('電腦「📍 商品在哪一間」：列出 3 項', ph.includes('3 項') && ph.includes('魷魚') && ph.includes('透抽') && ph.includes('白蝦'), ph.slice(0, 200));
await D.page.selectOption(`#ph-body select[data-id="${encodeURIComponent('魷魚|||M')}"]`, 'J'); await D.page.waitForTimeout(800);
H.check('把魷魚改成 J庫', (await H.one('productHome', encodeURIComponent('魷魚|||M'))).house === 'J');
if (process.env.SHOT_DIR) await D.page.screenshot({ path: process.env.SHOT_DIR + '/h5-desk-homes.png' });

// 第一次用的手機：先問在哪一間
await waitInbox((await pushReport('每日客戶銷貨明細表_1100.xlsx', [HEAD, ['2026/09/28', 'C-1', '全聯', '蝦仁', 'S', 1, '件', '大榮']])).id);
const W2 = (await H.all('waves')).find(w => /大榮/.test(w.logistics || ''));
const N = await H.openApp(base, USERS.op, { mobile: true, house: null });
await N.page.evaluate(() => openPage('picking')); await N.page.waitForTimeout(500);
await N.page.selectOption('#picking-wave-select', W2._id); await N.page.waitForTimeout(1200);
const ask = await card(N);
H.check('第一次用的手機選波次：先問「你在哪一間？」兩個大按鈕', ask.includes('你在哪一間') && ask.includes('J庫') && ask.includes('I庫'), ask);
if (process.env.SHOT_DIR) await N.page.screenshot({ path: process.env.SHOT_DIR + '/h0-choose.png' });
await N.page.click('button.pk-go:has-text("I庫")'); await N.page.waitForTimeout(1200);
H.check('點 I庫：記住，開始揀（蝦仁 拿 1 件）', (await N.page.evaluate(() => localStorage.getItem('wms_pick_house'))) === 'I' && (await card(N)).includes('拿 1'), await card(N));
await N.page.click('#picking-next .pk-go'); await N.page.waitForTimeout(1200);
await N.page.click('#picking-next .pk-go'); await N.page.waitForTimeout(2500);
H.check('大榮只有一家：完成畫面不用分貨、不用印標籤', (await card(N)).includes('貼托運單就好') && !(await card(N)).includes('分貨（'), await card(N));

H.check('沒有頁面錯誤', [D, A, B, N].every(X => X.log.errors.length === 0), JSON.stringify([D, A, B, N].map(X => X.log.errors)));
await H.close(); process.exit(0);
