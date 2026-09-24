// 導入初期減少繁瑣：精簡選單（一般人員預設只看常用，可切換）、手機「掃一下」、例行動作不再跳確認
import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';

const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
await H.resetData(async d => { await baseSeed(d);
  const P = (id, o) => H.setDoc(H.doc(d, 'pallets', id), Object.assign({ palletId: id, company: '崇文', palletCapacity: 40, expiryDate: '2027-06-01' }, o));
  await P('Q1', { productName: '白蝦', spec: '50/60', quantity: 12, locationId: 'I-A-01-1F' });
  await P('Q2', { productName: '透抽', spec: 'L', quantity: 5, locationId: 'I-A-01-1F' });
  await P('Q3', { productName: '干貝', spec: 'S', quantity: 9, locationId: 'V-QC' });
});

// ---------- 精簡選單 ----------
const OP = await H.openApp(base, USERS.op);
await OP.page.waitForTimeout(1500);
const vis = async (pg, tab) => pg.evaluate(t => { const el = document.querySelector(`nav [onclick^="switchTab('${t}'"]`); return !!el && el.offsetParent !== null; }, tab);
H.check('一般人員預設精簡選單：看得到波次揀貨、庫存查詢；看不到倉租、費率、熱力圖', await vis(OP.page, 'wave-picking') && await vis(OP.page, 'inventory-query') && !(await vis(OP.page, 'rental-report')) && !(await vis(OP.page, 'warehouse-heatmap')));
await OP.page.click('#menu-mode-toggle'); await OP.page.waitForTimeout(300);
H.check('按「顯示全部功能」就看得到全部', await vis(OP.page, 'rental-report') && await vis(OP.page, 'user-management') && (await OP.page.innerText('#menu-mode-text')).includes('只顯示常用'));
await OP.page.click('#menu-mode-toggle');
const SUP = await H.openApp(base, USERS.sup);
await SUP.page.waitForTimeout(1500);
H.check('主管預設看全部功能', await vis(SUP.page, 'rental-report') && await vis(SUP.page, 'dev-tools'));

// ---------- 電腦搬板不再跳「確認移動？」 ----------
await H.nav(OP.page, 'merge'); await OP.page.waitForTimeout(300);
let n0 = OP.log.dialogs.length;
await OP.page.fill('#move-pallet-id', 'Q1'); await OP.page.dispatchEvent('#move-pallet-id', 'change'); await OP.page.waitForTimeout(600);
await OP.page.evaluate(() => { let e = document.getElementById('move-target-loc'); while (e) { if (e.classList) e.classList.remove('hidden'); if (e.style) e.style.display = ''; e = e.parentElement; } });
await OP.page.fill('#move-target-loc', 'IA052'); await OP.page.press('#move-target-loc', 'Tab');
await OP.page.evaluate(async () => { await executePalletMove(); }); await OP.page.waitForTimeout(800);
H.check('電腦搬板直接搬（不跳確認），搬完告訴你從哪到哪', (await H.one('pallets', 'Q1')).locationId === 'I-A-05-2F' && !OP.log.dialogs.slice(n0).some(d => d.type === 'confirm'), JSON.stringify(OP.log.dialogs.slice(n0).map(d => d.type + ':' + d.msg.slice(0, 40))));

// ---------- 手機「掃一下」 ----------
const M = await H.openApp(base, USERS.op, { mobile: true });
await M.page.waitForTimeout(1500);
const qs = async v => { await M.page.fill('#qs-input', v); await M.page.press('#qs-input', 'Enter'); await M.page.waitForTimeout(500); };
await M.page.click(`[onclick="openPage('scan')"]`); await M.page.waitForTimeout(400);
await qs('Q2');
const body1 = await M.page.innerText('#qs-body');
H.check('掃板號：顯示這板，列出搬／出庫／盤點／併板', body1.includes('透抽') && body1.includes('搬到別的儲位') && body1.includes('出庫') && body1.includes('盤點這板') && body1.includes('併到別的板'), body1.slice(0, 200));
await M.page.click('#qs-body button:has-text("出庫")'); await M.page.waitForTimeout(400);
H.check('按「出庫」直接跳到出庫、這板已帶入（不用再掃一次）', await M.page.isVisible('#out-step2') && (await M.page.innerText('#out-pallet-info')).includes('透抽'));
await M.page.evaluate(() => goBack()); await M.page.waitForTimeout(300);
await M.page.click(`[onclick="openPage('scan')"]`); await M.page.waitForTimeout(300);
await qs('ia011');
const body2 = await M.page.innerText('#qs-body');
H.check('掃儲位 ia011：列出這裡的板（透抽），可以在這裡上架', body2.includes('透抽') && body2.includes('在這裡上架一板') && (await M.page.innerText('#qs-result')).includes('I-A-01-1F'), body2.slice(0, 200));
await qs('Q3');
const body3 = await M.page.evaluate(() => { const b = [...document.querySelectorAll('#qs-body button')].find(x => x.innerText.includes('出庫')); return { text: document.getElementById('qs-body').innerText, disabled: b && b.disabled }; });
H.check('留置區的板：出庫按鈕不能按，並說明原因', body3.disabled && body3.text.includes('不能出庫'), JSON.stringify(body3).slice(0, 200));
await M.page.click('#qs-body button:has-text("盤點這板")'); await M.page.waitForTimeout(400);
H.check('按「盤點這板」直接跳到盤點輸入數量', await M.page.isVisible('#st-step2') && (await M.page.innerText('#st-book-loc')) === 'V-QC');

H.check('沒有頁面錯誤', OP.log.errors.length === 0 && SUP.log.errors.length === 0 && M.log.errors.length === 0, JSON.stringify(OP.log.errors.concat(SUP.log.errors, M.log.errors)));
await H.close(); process.exit(0);
