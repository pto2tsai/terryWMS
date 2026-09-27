// 練習庫存：鼎新每天寄的「批號庫存表」→ 練習模式時自動更新 OTHER 儲位的庫存（跟鼎新一樣）
//   只放崇文一廠、八方一廠；同一品號＋批號每天用同一個板號；鼎新沒有的刪掉；真正儲位的板不碰
//   練習模式沒開：只存檔，庫存不變
import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';
import { pushReport, loadGs } from './erp-gs.mjs';
const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
await H.resetData(async d => { await baseSeed(d);
  await H.setDoc(H.doc(d, 'settings', 'practice'), { enabled: true });
  // 之前手動匯入到 OTHER 的練習庫存（會被鼎新的數字取代）
  await H.setDoc(H.doc(d, 'pallets', 'IN0001'), { palletId: 'IN0001', company: '崇文', productName: '白蝦', spec: '50/60', quantity: 5, locationId: 'OTHER' });
  // 放在真正儲位的板：不能被動到
  await H.setDoc(H.doc(d, 'pallets', 'REAL1'), { palletId: 'REAL1', company: '崇文', productName: '透抽', spec: 'L', quantity: 30, locationId: 'I-A-01-1F' });
});
// 仿鼎新「批號庫存異動明細表」：公司抬頭、每頁重複表頭、小計列、外倉、0 件
const page = (lines) => [['', '', '', '崇文冷凍食品股份有限公司', '', '', ''], ['', '', '', '批號庫存異動明細表', '', '', ''], ['製表日期: 2026/09/24', '', '', '期間:            至', '', '', '第 1 頁'],
  ['品號', '品名', '規格', '批號', '庫別', '庫存', '單位']].concat(lines);
const day1 = page([
  ['A5021212', '502白仁', '100/200*12KG', '合眾_260820', '崇文一廠', 79, '件'],
  ['A5021212', '502白仁', '100/200*12KG', '零', '崇文一廠', 0.267, '件'],
  ['A5021212', '502白仁', '100/200*12KG', '合眾_260820', '海霸王_崇文', 500, '件'],   // 外倉：不放
  ['A5021212', '502白仁', '100/200*12KG', '260101', '崇文一廠', 0, '件'],             // 0 件：不放
  ['', '', '', '', '小計:', 579.267, ''],
  ['品號', '品名', '規格', '批號', '庫別', '庫存', '單位'],                              // 下一頁的表頭
  ['BW450802', '生白蝦', '40/50*850G*12盒', '280301_中國', '八方一廠', 12, '件'],
  ['C63110v', '土魠魚原料', '130-160g/片', '有洞', '崇文一廠', -0.001, '件'],        // 負數：不放
  ['', '', '', '', '', '', '<結  束>']]);

const gs = loadGs();
H.check('Google 程式認得「批號庫存表」（附件檔名、報表標題都行），而且要 WMS 接手處理', gs.identifyReport('批號庫存表_2026-09-24.xlsx', '', [], {}).report.type === 'batch_daily' && gs.identifyReport('x.xlsx', '', day1, {}).report.type === 'batch_daily' && gs.identifyReport('x.xlsx', '批號明細表', [], {}).report.process === true);
H.check('Google 程式會建立「批號明細表」資料夾', gs.WMS_FOLDERS.indexOf('批號明細表') >= 0);

const D = await H.openApp(base, USERS.sup);
await D.page.waitForTimeout(1500);
const waitInbox = async id => { let r; for (let i = 0; i < 30; i++) { await D.page.waitForTimeout(500); r = await H.one('erpInbox', id); if (r && ['done', 'attention', 'error', 'stored'].includes(r.status)) break; } return r; };
const other = async () => Object.fromEntries((await H.all('pallets')).filter(p => p.locationId === 'OTHER').map(p => [p.productId + '/' + p.batchNo, [p._id, p.company, p.quantity]]));

let r = await pushReport('批號庫存表_2026-09-24.xlsx', day1, { folder: '批號明細表' });
let ib = await waitInbox(r.id);
let o1 = await other();
H.check('收到就自動更新：OTHER 的庫存變成跟鼎新一樣（崇文一廠 2 筆、八方一廠 1 筆）', ib.status === 'done' && Object.keys(o1).sort().join() === 'A5021212/合眾_260820,A5021212/零,BW450802/280301_中國' && ib.result.includes('崇文 2 筆') && ib.result.includes('八方 1 筆'), JSON.stringify([ib.status, ib.result, o1]));
H.check('件數、公司都對（79、0.267 零頭、八方 12）', o1['A5021212/合眾_260820'][2] === 79 && o1['A5021212/零'][2] === 0.267 && o1['BW450802/280301_中國'][1] === '八方' && o1['BW450802/280301_中國'][2] === 12, JSON.stringify(o1));
H.check('外倉、0 件、負數不放；之前手動放在 OTHER 的板被取代', !(await H.one('pallets', 'IN0001')) && !Object.keys(o1).some(k => k.startsWith('C63110v')), JSON.stringify(o1));
H.check('真正儲位的板不動（I-A-01-1F 透抽 30）', (await H.one('pallets', 'REAL1')).quantity === 30);

// ---------- 隔天：件數變了、一批賣完 ----------
const day2 = page([['A5021212', '502白仁', '100/200*12KG', '合眾_260820', '崇文一廠', 60, '件'], ['BW450802', '生白蝦', '40/50*850G*12盒', '280301_中國', '八方一廠', 12, '件']]);
r = await pushReport('批號庫存表_2026-09-25.xlsx', day2, { folder: '批號明細表' });
ib = await waitInbox(r.id);
const o2 = await other();
H.check('隔天：同一批用同一個板號、件數更新（79→60）；賣完的零頭刪掉', o2['A5021212/合眾_260820'][0] === o1['A5021212/合眾_260820'][0] && o2['A5021212/合眾_260820'][2] === 60 && !o2['A5021212/零'] && ib.result.includes('改件數 1') && ib.result.includes('刪除 1'), JSON.stringify([ib.result, o2]));

const q = await D.page.evaluate(() => (window.currentPallets ? window.currentPallets() : []).filter(p => p.locationId === 'OTHER').length);
H.check('電腦版庫存看得到練習庫存', q === 2, String(q));

// ---------- 練習模式關掉：只存檔 ----------
await D.page.evaluate(() => window.db.collection('settings').doc('practice').set({ enabled: false })); await D.page.waitForTimeout(800);
r = await pushReport('批號庫存表_2026-09-26.xlsx', page([['A5021212', '502白仁', '100/200*12KG', '合眾_260820', '崇文一廠', 1, '件']]), { folder: '批號明細表' });
ib = await waitInbox(r.id);
H.check('練習模式沒開：只存檔，庫存不變（正式上線後不會被鼎新蓋掉）', ib.status === 'stored' && (await other())['A5021212/合眾_260820'][2] === 60, JSON.stringify([ib.status, ib.result]));

// ---------- 再打開練習模式：剛剛只存檔的那份馬上套用 ----------
await H.nav(D.page, 'wave-picking'); await D.page.waitForTimeout(500);
D.page.__dialogPlan = [true];
await D.page.click('#btn-practice-mode');
ib = await (async () => { let x; for (let i = 0; i < 30; i++) { await D.page.waitForTimeout(500); x = await H.one('erpInbox', r.id); if (x.status === 'done') break; } return x; })();
H.check('打開練習模式：最近一份只存檔的批號庫存表馬上套用（60→1）', ib.status === 'done' && (await other())['A5021212/合眾_260820'][2] === 1, JSON.stringify([ib.status, ib.result]));

// ---------- 清空舊庫存（管理員；練習前用）----------
let d0 = D.log.dialogs.length;
await D.page.evaluate(async () => { await clearOldStock(); }); await D.page.waitForTimeout(300);
H.check('主管不能清空庫存（只有管理員）', D.log.dialogs.slice(d0).some(x => x.msg.includes('只有管理員')) && !!(await H.one('pallets', 'REAL1')));
const A = await H.openApp(base, USERS.admin);
await A.page.waitForTimeout(1500);
A.page.__dialogPlan = [true, '算了'];
await A.page.evaluate(async () => { await clearOldStock(); }); await A.page.waitForTimeout(500);
H.check('沒打「清空」兩個字：不刪', !!(await H.one('pallets', 'REAL1')));
d0 = A.log.dialogs.length;
A.page.__dialogPlan = [true, '清空', true];
await A.page.evaluate(async () => { await clearOldStock(); }); await A.page.waitForTimeout(1500);
const dl = A.log.dialogs.slice(d0).map(x => x.msg);
const left = await H.all('pallets');
H.check('確認訊息寫出要刪幾板、練習庫存不會動', dl[0] && dl[0].includes('1 板') && dl[0].includes('不會動'), JSON.stringify(dl));
H.check('清空：真正儲位的舊板刪掉，OTHER 的練習庫存留著', !left.some(p => p._id === 'REAL1') && left.length === 1 && left.every(p => p.locationId === 'OTHER'), JSON.stringify(left.map(p => [p._id, p.locationId])));
const bk = (await H.all('backups')).find(b => b._id.startsWith('before-clear-'));
H.check('刪之前自動存了雲端備份（含所有 2 板）', bk && JSON.parse(bk.data).collections.pallets.length === 2, JSON.stringify(bk && bk.summary));
H.check('每一板留一筆異動記錄', (await H.all('inventoryLogs')).some(l => l.palletId === 'REAL1' && (l.note || '').includes('練習前清空')));

// ---------- 手機選單：一列 3 格 ----------
const M = await H.openApp(base, USERS.op2, { mobile: true });
await M.page.waitForTimeout(1500);
const cols = await M.page.evaluate(() => getComputedStyle(document.querySelector('.main-menu')).gridTemplateColumns.split(' ').length);
const wide = await M.page.evaluate(() => { const m = document.querySelector('.main-menu').getBoundingClientRect(), w = document.querySelector('.menu-card.wide').getBoundingClientRect(); return w.width > m.width * 0.85; });
const overflow = await M.page.evaluate(() => [...document.querySelectorAll('.menu-card h3')].some(h => h.scrollWidth > h.parentElement.parentElement.clientWidth));
H.check('手機選單一列 3 格；「掃一下」「庫存快查」整列；字沒有超出方塊', cols === 3 && wide && !overflow, JSON.stringify([cols, wide, overflow]));
if (process.env.SHOT) await M.page.screenshot({ path: process.env.SHOT });

// ---------- 庫存快查：規格不用打完整 ----------
await M.page.evaluate(() => openPage('query')); await M.page.waitForTimeout(300);
const ask = async v => { await M.page.fill('#query-input', v); await M.page.press('#query-input', 'Enter'); await M.page.waitForTimeout(300); return M.page.innerText('#query-result'); };
const q1 = await ask('白仁 100200'), q2 = await ask('１２ＫＧ'), q3 = await ask('502白仁 12kg'), q4 = await ask('白仁 50/60'), q5 = await ask('A50212');
H.check('庫存快查：規格不用打完整（「白仁 100200」「１２ＫＧ」「502白仁 12kg」、品號前幾碼都找得到；「白仁 50/60」找不到）',
  q1.includes('100/200*12KG') && q2.includes('100/200*12KG') && q3.includes('100/200*12KG') && q4.includes('找不到') && q5.includes('100/200*12KG'), JSON.stringify([q1, q2, q3, q4, q5].map(x => x.slice(0, 40))));
await M.page.fill('#query-input', ''); await M.page.dispatchEvent('#query-input', 'input'); await M.page.waitForTimeout(500);
const q6 = await M.page.innerText('#query-result');
await M.page.type('#query-input', '12kg', { delay: 60 }); await M.page.waitForTimeout(700);
const q7 = await M.page.innerText('#query-result');
const val = await M.page.inputValue('#query-input');
await M.page.type('#query-input', 'x', { delay: 60 }); await M.page.waitForTimeout(700);
H.check('邊打邊查：不用按放大鏡，打完就出現結果；可以接著打字（不會被選取蓋掉）；清空回到說明', q6.includes('規格不用打完整') && q7.includes('100/200*12KG') && val === '12kg' && (await M.page.inputValue('#query-input')) === '12kgx', JSON.stringify([q6.slice(0, 20), q7.slice(0, 30), val]));

H.check('沒有頁面錯誤', D.log.errors.length === 0 && A.log.errors.length === 0 && M.log.errors.length === 0, JSON.stringify(D.log.errors.concat(A.log.errors, M.log.errors)));
await H.close(); process.exit(0);
