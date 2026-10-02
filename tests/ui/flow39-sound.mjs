// 手機揀貨的聲音和語音：掃對「嗶」、掃錯「嗡嗡」、一項好了「叮」、不夠「咚咚」、全部好了「叮咚咚」；
// 語音念出下一項（品名、規格、件數、儲位）；主選單右上角可以關聲音、關語音（鼎新改單的警示還是會響）
import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';
import { pushReport } from './erp-gs.mjs';
const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
await H.resetData(async d => { await baseSeed(d);
  const P = (id, o) => H.setDoc(H.doc(d, 'pallets', id), Object.assign({ palletId: id, company: '崇文', palletCapacity: 40, expiryDate: '2027-06-01' }, o));
  await P('P1', { productName: '白蝦', spec: '50/60*850G*14盒', quantity: 20, locationId: 'I-A-01-1F' });
  await P('P3', { productName: '透抽', spec: 'L', quantity: 30, locationId: 'I-B-01-1F' });
});
const HEAD = ['銷貨日期', '銷貨單號', '客戶全名', '品名', '規格', '銷貨數量', '單位', '備註'];
const D = await H.openApp(base, USERS.op);
const M = await H.openApp(base, USERS.op2, { mobile: true }); const mp = M.page;
await D.page.waitForTimeout(1500); await mp.waitForTimeout(1500);
// 記下每一個聲音和念的話（真的發聲器照樣跑，確定不會出錯）
await mp.evaluate(() => {
  window._snd = []; window._said = [];
  const orig = window.sfx; window.sfx = n => { window._snd.push(n); return orig(n); };
  window.speechSynthesis.speak = u => { if (u.text) window._said.push(u.text); };
});
const snd = () => mp.evaluate(() => window._snd.splice(0));
const said = () => mp.evaluate(() => window._said.splice(0));
const r = await pushReport('每日客戶銷貨明細表_0900.xlsx', [HEAD, ['2026/10/01', 'S-1', '海霸王', '白蝦', '50/60*850G*14盒', 3, '件', '黑貓'], ['2026/10/01', 'S-1', '', '透抽', 'L', 2, '件', '']]);
for (let i = 0; i < 30; i++) { await D.page.waitForTimeout(500); const x = await H.one('erpInbox', r.id); if (x && ['done', 'attention', 'error'].includes(x.status)) break; }
H.check('右上角有聲音、語音開關（預設開）', (await mp.getAttribute('#snd-toggle', 'aria-label')) === '聲音：開' && (await mp.getAttribute('#voice-toggle', 'aria-label')) === '語音：開');
await mp.evaluate(() => openPage('picking')); await mp.waitForTimeout(2000);
let s1 = await said();
H.check('打開波次：念出第一項「白蝦 50/60，3件，I A 01 1F」', s1.some(t => t.includes('白蝦') && t.includes('50/60') && t.includes('3件') && t.includes('I A 01 1F')), JSON.stringify(s1));
const scan = async v => { await mp.fill('#picking-scan', v); await mp.press('#picking-scan', 'Enter'); await mp.waitForTimeout(1200); };
await snd();
await scan('P9');
H.check('掃錯：「嗡嗡」（err）', JSON.stringify(await snd()) === '["err"]');
await scan('P1');
const a = await snd(); s1 = await said();
H.check('掃對拿好：「叮」（done），接著念下一項透抽 2件', JSON.stringify(a) === '["done"]' && s1.some(t => t.includes('透抽') && t.includes('2件') && t.includes('I B 01 1F')), JSON.stringify([a, s1]));
await mp.click('#picking-next .pk-short'); await mp.waitForTimeout(300);
await mp.click('#short-pad button:text-is("1")'); await mp.waitForTimeout(300);
await mp.waitForTimeout(1500);
const b = await snd();
H.check('按「不夠」：「咚咚」（short）', b.includes('short'), JSON.stringify(b));
// ---------- 關掉聲音、語音 ----------
await mp.evaluate(() => { goBack && goBack(); }); await mp.waitForTimeout(500);
await mp.evaluate(() => { toggleSound(); toggleVoice(); }); await mp.waitForTimeout(300);
await snd(); await said();
H.check('關掉後圖示變灰（聲音：關、語音：關）', (await mp.getAttribute('#snd-toggle', 'aria-label')) === '聲音：關' && (await mp.getAttribute('#voice-toggle', 'aria-label')) === '語音：關');
const quiet = await mp.evaluate(() => { const n0 = window._snd.length; window.sfx('done'); window.speak('測試'); return window._said.length; });
H.check('關掉後不念', quiet === 0);
const osc = await mp.evaluate(() => {
  const AC = window.AudioContext || window.webkitAudioContext; let n = 0; const o = AC.prototype.createOscillator;
  AC.prototype.createOscillator = function() { n++; return o.call(this); };
  window.sfx('done'); const quietN = n; window.sfx('alarm'); return [quietN, n];
});
H.check('關掉後一般聲音不響，但鼎新改單的警示照樣響（8 聲交替的鈴）', osc[0] === 0 && osc[1] === 40, JSON.stringify(osc));
// ---------- 螢幕外框閃光 ----------
const fl = await mp.evaluate(async () => {
  const st = () => { const el = document.getElementById('edge-flash'); return el ? [el.classList.contains('on'), el.style.getPropertyValue('--fc')] : null; };
  window.stopFlash(); window.sfx('err'); await new Promise(r => setTimeout(r, 60)); const err = st();
  window.stopFlash(); window.sfx('done'); await new Promise(r => setTimeout(r, 60)); const ok = st();
  window.sfx('alarm'); await new Promise(r => setTimeout(r, 1200)); const alarmRunning = !!document.getElementById('edge-flash');
  window.sfx('done'); await new Promise(r => setTimeout(r, 300)); const keep = st()[1];
  window.stopFlash(); await new Promise(r => setTimeout(r, 400)); const stopped = st()[0];
  return { err, ok, alarmRunning, keep, stopped };
});
H.check('外框閃光：錯＝紅、對＝綠；聲音關掉也會閃', JSON.stringify(fl.err) === '[true,"#ef4444"]' && JSON.stringify(fl.ok) === '[true,"#22c55e"]', JSON.stringify(fl));
H.check('改單警示一直閃（其他的不會蓋掉它），按「知道了」才停', fl.alarmRunning && ['#ef4444', '#f97316'].includes(fl.keep) && fl.stopped === false, JSON.stringify(fl));
// ---------- 每支手機自己選聲音（聲音試聽頁存的） ----------
const st = await mp.evaluate(() => {
  const AC = window.AudioContext || window.webkitAudioContext; let n = 0; const o = AC.prototype.createOscillator;
  AC.prototype.createOscillator = function() { n++; return o.call(this); };
  localStorage.setItem('tw-sound', 'on');
  const count = f => { n = 0; f(); return n; };
  const dflt = count(() => window.sfx('done'));
  window.setSoundStyle('done', 'A'); const gameStyle = count(() => window.sfx('done'));
  window.resetSoundStyles(); const back = count(() => window.sfx('done'));
  window.stopFlash(); window.setFlashOn(false); window.sfx('err'); const el = document.getElementById('edge-flash'); const noFlash = !el.classList.contains('on');
  window.sfx('alarm'); const alarmFlash = true; window.stopFlash(); window.setFlashOn(true);
  return { dflt, gameStyle, back, noFlash };
});
H.check('沒選＝B 鐘聲；在試聽頁選了 A，揀貨就用 A；恢復後又是 B', st.dflt === 10 && st.gameStyle === 4 && st.back === 10, JSON.stringify(st));
H.check('外框閃光關掉後，一般的不閃', st.noFlash, JSON.stringify(st));
await mp.goto(base + '/m/sounds.html'); await mp.waitForTimeout(800);
await mp.click(`button[onclick="choose('ok','C')"]`); await mp.waitForTimeout(200);
H.check('聲音試聽頁：點了就記在這支手機', await mp.evaluate(() => window.soundStyles().ok === 'C') && (await mp.textContent('#sum')).includes('掃對了 C'));
H.check('沒有頁面錯誤', M.log.errors.length === 0 && D.log.errors.length === 0, JSON.stringify(M.log.errors.concat(D.log.errors)));
await H.close(); process.exit(0);
