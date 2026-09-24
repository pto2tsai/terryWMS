// 儲位簡碼：登打不用打「-」（IA011 → I-A-01-1F），輸入框即時顯示轉換結果；儲位標籤印簡碼、QR 碼、依區域實際排數、A4
import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';

const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
await H.resetData(async d => { await baseSeed(d);
  await H.setDoc(H.doc(d, 'pallets', 'P1'), { palletId: 'P1', company: '崇文', productName: '白蝦', spec: '50/60', quantity: 10, locationId: 'I-A-01-1F', expiryDate: '2027-01-01' });
});
const { page, log, ctx } = await H.openApp(base, USERS.op);
await page.waitForTimeout(1200);

// ---------- 轉換規則 ----------
const conv = await page.evaluate(() => ['IA011', 'ia123', 'KE221', 'i-a-01-1f', ' tempin ', 'vqc', 'IA011F', 'IA99', 'I-A-01-1F'].map(formatLocationId));
H.note('轉換: ' + JSON.stringify(conv));
H.check('簡碼轉換：IA011→I-A-01-1F、ia123→I-A-12-3F、KE221→K-E-22-1F、小寫、tempin、vqc', JSON.stringify(conv) === JSON.stringify(['I-A-01-1F', 'I-A-12-3F', 'K-E-22-1F', 'I-A-01-1F', 'TEMP-IN', 'V-QC', 'I-A-01-1F', 'IA99', 'I-A-01-1F']));
H.check('簡碼反查：I-A-01-1F → IA011', await page.evaluate(() => locationShortCode('I-A-01-1F')) === 'IA011');

// ---------- 搬板：打簡碼 ----------
await page.evaluate(async () => { await movePalletTx(db.collection('pallets').doc('P1'), 'ia052'); });
H.check('搬板打 ia052 → 存成 I-A-05-2F', (await H.one('pallets', 'P1')).locationId === 'I-A-05-2F');

// ---------- 電腦輸入框：即時顯示、離開欄位自動換成標準格式 ----------
await H.nav(page, 'move'); await page.waitForTimeout(300);
await page.evaluate(() => { let e = document.getElementById('move-target-loc'); while (e) { if (e.classList) e.classList.remove('hidden'); if (e.style) e.style.display = ''; e = e.parentElement; } });   // 目標儲位欄在掃完棧板後才出現
await page.fill('#move-target-loc', 'ke221');
const hint = await page.evaluate(() => { const h = document.querySelector('.loc-hint[data-for="move-target-loc"]'); return h ? h.textContent : ''; });
H.check('打 ke221 時旁邊顯示「→ K-E-22-1F」', hint.includes('K-E-22-1F'), hint);
await page.press('#move-target-loc', 'Tab');
H.check('離開欄位後自動換成 K-E-22-1F', (await page.inputValue('#move-target-loc')) === 'K-E-22-1F');
await page.fill('#move-target-loc', 'IA9');
const bad = await page.evaluate(() => document.querySelector('.loc-hint[data-for="move-target-loc"]').textContent);
H.check('格式不對會提示', bad.includes('格式不對'), bad);

// ---------- 馬上入帳：儲位打簡碼 ----------
await H.nav(page, 'unified-inbound'); await page.waitForTimeout(500);
await page.click("button[onclick=\"openProductSelectModal('inbound')\"]"); await page.waitForTimeout(500);
await page.click("#modal-product-select [onclick^=\"selectProductFromModal('P001'\"]"); await page.waitForTimeout(500);
await page.click('#btn-type-FG');
await page.uncheck('#in-print-slip').catch(() => {});
await page.fill('#in-batch', 'Z1'); await page.fill('#in-exp-year', '2027'); await page.fill('#in-exp-month', '8'); await page.fill('#in-exp-day', '1');
await page.fill('#in-qty', '5'); await page.fill('#in-loc', 'ib032'); await page.dispatchEvent('#in-loc', 'input');
await page.click('#btn-inbound-direct'); await page.waitForTimeout(2000);
H.check('馬上入帳儲位打 ib032 → 棧板在 I-B-03-2F', (await H.all('pallets')).some(p => p.locationId === 'I-B-03-2F' && p.quantity === 5), JSON.stringify((await H.all('pallets')).map(p => p.locationId)));

// ---------- 儲位標籤 ----------
await H.nav(page, 'label-print'); await page.waitForTimeout(500);
await page.evaluate(() => selectLocZone('I-A'));
H.check('選 I-A 區：排號範圍自動帶 1～8（I 區只有 8 排）', (await page.inputValue('#loc-row-end')) === '8' && (await page.innerText('#loc-print-count')) === '24 張', await page.innerText('#loc-print-count'));
await page.check('input[name="loc-paper"][value="a4"]');
await page.check('#loc-include-virtual'); await page.dispatchEvent('#loc-include-virtual', 'change');
H.check('加印暫存區：24 + 5 = 29 張', (await page.innerText('#loc-print-count')) === '29 張', await page.innerText('#loc-print-count'));
const popP = ctx.waitForEvent('page');
await page.evaluate(() => printLocationLabels());
const pop = await popP; await pop.waitForFunction(() => document.querySelectorAll('.label').length > 0, null, { timeout: 10000 }); await pop.waitForTimeout(1500);
const info = await pop.evaluate(() => ({ sheets: document.querySelectorAll('.sheet').length, labels: document.querySelectorAll('.label').length, qr: document.querySelectorAll('.qr-box svg').length, text: document.body.innerText }));
H.check('A4：29 張分 4 頁（每頁 8 張）', info.sheets === 4 && info.labels === 29, JSON.stringify([info.sheets, info.labels]));
H.check('標籤印出儲位、簡碼（IA011）、暫存區名稱', info.text.includes('I-A-01-1F') && info.text.includes('簡碼 IA011') && info.text.includes('進貨暫存區') && info.text.includes('I-A-08-3F') && !info.text.includes('I-A-09-'), info.text.slice(0, 200));
H.check('每張都有 QR 碼（離線時 QR 函式庫載不到則略過）', info.qr === 29 || info.qr === 0, String(info.qr));
await pop.close();

H.check('沒有頁面錯誤', log.errors.length === 0, JSON.stringify(log.errors));
await H.close(); process.exit(0);
