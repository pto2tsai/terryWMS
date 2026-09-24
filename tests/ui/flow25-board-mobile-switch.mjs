// 現場看板（board.html）：登入、即時更新（不用重新整理）、今天統計、即期品紅色、沒事時顯示沒有待辦
// 用手機打開電腦版：提示切換到手機版，按「留在電腦版」就不再提示
import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';

const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
const now = new Date().toISOString();
const soon = new Date(); soon.setDate(soon.getDate() + 3);
const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
await H.resetData(async d => { await baseSeed(d);
  await H.setDoc(H.doc(d, 'inboundTasks', 'T1'), { orderNo: 'IN-1', productName: '白蝦', spec: '50/60', quantity: 12, locationId: 'I-A-01-1F', status: 'pending', createdAt: now });
  await H.setDoc(H.doc(d, 'inboundTasks', 'T2'), { orderNo: 'IN-2', productName: '透抽', quantity: 4, locationId: 'I-A-02-1F', status: 'pending', expiryApproval: 'pending', createdAt: now });
  await H.setDoc(H.doc(d, 'waves', 'W1'), { waveNo: 'W260924-001', logistics: '黑貓', status: 'picking', totalQty: 20, orderCount: 3, itemCount: 4, completedItems: ['a', 'b'] });
  await H.setDoc(H.doc(d, 'inventoryLogs', 'L1'), { type: 'inbound', timestamp: now, quantityChange: 12 });
  await H.setDoc(H.doc(d, 'inventoryLogs', 'L2'), { type: 'outbound', timestamp: now, quantityChange: -5, note: '波次揀貨 W260924-000' });
  await H.setDoc(H.doc(d, 'pallets', 'EXP'), { palletId: 'EXP', productName: '干貝', quantity: 3, locationId: 'I-B-01-1F', expiryDate: ymd(soon) });
});

// ---------- 現場看板 ----------
const { page, log, ctx } = await H.openApp(base, USERS.op);
const B = await ctx.newPage();
const errs = []; B.on('pageerror', e => errs.push(e.message));
await B.setViewportSize({ width: 1920, height: 1080 });
await B.goto(base + '/board.html?night=off');
await B.waitForFunction(() => document.getElementById('login').style.display === 'none', null, { timeout: 15000 }).catch(() => {});
await B.waitForTimeout(2500);
const txt = async id => (await B.innerText('#' + id)).trim();
H.check('同一台電腦登入過就直接顯示看板（不用再登入）', await B.evaluate(() => document.getElementById('login').style.display === 'none'));
H.check('待上架 2 筆，即期品待主管核准的用紅色', (await txt('c-tasks')) === '2' && (await B.$$('#l-tasks .card.red')).length === 1 && (await txt('l-tasks')).includes('即期品待主管核准'), await txt('l-tasks'));
H.check('揀貨波次顯示進度 2/4 項', (await txt('c-waves')) === '1' && (await txt('l-waves')).includes('2/4 項'), await txt('l-waves'));
H.check('沒有調度工單時不顯示調度欄（波次、待上架兩欄，波次最寬）', !(await B.isVisible('#col-dispatch')) &&
  await B.evaluate(() => { const a = document.querySelector('.col.main').getBoundingClientRect().width, b = document.querySelectorAll('.col')[1].getBoundingClientRect().width; return a > b * 1.8; }));
H.check('今天統計：入庫 1 板、完成波次 1、出貨 5 件；7 天內到期 1 板', (await txt('s-in')) === '1' && (await txt('s-wave')) === '1' && (await txt('s-out')) === '5' && (await txt('s-exp')) === '1',
  JSON.stringify([await txt('s-in'), await txt('s-wave'), await txt('s-out'), await txt('s-exp')]));
// 即時更新：資料一變，看板不用重新整理就跟著變
await H.admin(async d => { await H.setDoc(H.doc(d, 'dispatchOrders', 'D1'), { orderNo: 'DSP-1', productName: '白蝦', status: 'pending', operations: [{ id: 'op-0' }, { id: 'op-1' }], completedOps: [] });
  const { updateDoc } = await import('firebase/firestore'); await updateDoc(H.doc(d, 'inboundTasks', 'T1'), { status: 'done' }); });
await B.waitForTimeout(2000);
H.check('即時更新：有調度工單時自動多出調度欄、上架完成的任務消失（沒有重新整理）', await B.isVisible('#col-dispatch') && (await txt('c-dispatch')) === '1' && (await txt('c-tasks')) === '1', JSON.stringify([await txt('c-dispatch'), await txt('c-tasks')]));
await H.admin(async d => { for (let i = 0; i < 12; i++) await H.setDoc(H.doc(d, 'inboundTasks', 'M' + i), { orderNo: 'IN-M' + i, productName: '魷魚', quantity: i + 1, locationId: 'I-B-0' + (i % 8 + 1) + '-1F', status: 'pending', createdAt: now }); });
await B.waitForTimeout(2000);
const fit = await B.evaluate(() => { const l = document.getElementById('l-tasks'), m = l.querySelector('.more'); return { more: m ? m.innerText : '', inside: m ? m.getBoundingClientRect().bottom <= l.getBoundingClientRect().bottom + 1 : false, cards: l.querySelectorAll('.card').length }; });
H.check('待上架 13 筆放不下：顯示放得下的張數，最下面「還有 N 筆」看得到', fit.inside && fit.more.includes('還有') && fit.cards + parseInt(fit.more.replace(/\D/g, ''), 10) === 13, JSON.stringify(fit));
H.check('看板沒有頁面錯誤', errs.length === 0, JSON.stringify(errs));

// ---------- 手機打開電腦版 ----------
const MC = await page.context().browser().newContext({ viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148', hasTouch: true, isMobile: true });
await MC.route(/^(?!http:\/\/(127\.0\.0\.1|localhost))/, r => r.fulfill({ body: '', contentType: 'text/javascript' }));
const MP = await MC.newPage();
await MP.goto(base + '/index.html'); await MP.waitForTimeout(800);
H.check('手機打開電腦版：上方提示「切換到手機版」', await MP.isVisible('#switch-mobile-bar') && (await MP.getAttribute('#switch-mobile-bar a', 'href')) === 'm/');
await MP.click('#stay-desktop-btn'); await MP.reload(); await MP.waitForTimeout(800);
H.check('按「留在電腦版」後不再提示', !(await MP.$('#switch-mobile-bar')));
H.check('電腦打開電腦版不會出現提示', !(await page.$('#switch-mobile-bar')));

H.check('沒有頁面錯誤', log.errors.length === 0, JSON.stringify(log.errors));
await H.close(); process.exit(0);
