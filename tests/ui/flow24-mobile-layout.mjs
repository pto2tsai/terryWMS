// 手機版面：最窄 320px 的手機上，每一頁的按鈕、輸入框都不會超出畫面（掃描列的確認鈕曾被擠出去）
// 倉庫光線暗：揀貨畫面的關鍵文字（儲位、品項、件數、板號、公司）夠大、對比夠高
import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';
const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
await H.resetData(async d => { await baseSeed(d);
  await H.setDoc(H.doc(d, 'pallets', 'PX-20260924-0231'), { palletId: 'PX-20260924-0231', company: '八方', productName: '白蝦', spec: '50/60', quantity: 30, locationId: 'I-A-01-1F', expiryDate: '2027-03-01' });
  await H.setDoc(H.doc(d, 'pallets', 'PX-20260924-0412'), { palletId: 'PX-20260924-0412', company: '崇文', productName: '透抽', spec: 'L', quantity: 20, locationId: 'I-B-03-2F', expiryDate: '2027-05-01' });
  await H.setDoc(H.doc(d, 'waves', 'WV1'), { waveNo: 'W260924-002', logistics: '新竹物流', status: 'pending', totalQty: 20, orderCount: 2, createdAt: new Date().toISOString(),
    orders: [{ id: 'S1', orderNo: 'SO-1' }], summary: [{ productName: '白蝦', spec: '50/60', totalQty: 12, orders: ['SO-1'] }, { productName: '透抽', spec: 'L', totalQty: 8, orders: ['SO-1'] }] });
});
const { page, log } = await H.openApp(base, USERS.op, { mobile: true });
for (const w of [320, 375]) {
  await page.setViewportSize({ width: w, height: 700 });
  await page.waitForTimeout(800);
  const over = [];
  for (const pg of ['inbound', 'picking', 'dispatch', 'stocktake', 'shelve', 'outbound', 'move', 'merge', 'query', 'scan']) {
    await page.evaluate(p => openPage(p), pg); await page.waitForTimeout(250);
    const n = await page.evaluate(p => { const W = document.documentElement.clientWidth; return [...document.querySelectorAll('#page-' + p + ' button, #page-' + p + ' input')].filter(e => e.offsetParent).filter(e => e.getBoundingClientRect().right > W + 1).length; }, pg);
    if (n) over.push(pg + ' ' + n + ' 個');
    await page.evaluate(() => goBack());
  }
  H.check('寬 ' + w + 'px：每一頁的按鈕與輸入框都在畫面內', over.length === 0, over.join('、'));
}
// ---------- 揀貨畫面的關鍵文字 ----------
await page.setViewportSize({ width: 360, height: 780 });
await page.evaluate(() => openPage('picking')); await page.waitForTimeout(300);
await page.selectOption('#picking-wave-select', 'WV1'); await page.waitForTimeout(800);
const rd = await page.evaluate(() => {
  const rgb = c => (c.match(/[\d.]+/g) || []).map(Number);
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = el => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.length === 3 || (c.length === 4 && c[3] > 0.9)) return c.slice(0, 3); } return [15, 23, 42]; };
  const out = [];
  for (const sel of ['.ns-code', '.ns-qty', '.ns-item', '.ns-sub', '.ns-after', '.item-location', '.item-product', '.item-qty', '.item-detail', '.item-status', '.co-tag', '.pid b']) {
    const el = document.querySelector('#page-picking ' + sel); if (!el) { out.push({ sel, missing: true }); continue; }
    const cs = getComputedStyle(el), a = lum(rgb(cs.color).slice(0, 3)), b = lum(bgOf(el));
    out.push({ sel, px: parseFloat(cs.fontSize), cr: Math.round((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) * 10) / 10 });
  }
  return { out, wide: document.querySelector('#page-picking').scrollWidth <= document.documentElement.clientWidth + 1, pid: document.querySelector('#page-picking .pid b').textContent };
});
const bad = rd.out.filter(x => x.missing || x.px < 15 || x.cr < 7);
H.check('揀貨關鍵文字：都至少 15px、對比至少 7:1（暗處也看得清楚）', bad.length === 0, JSON.stringify(bad.length ? bad : rd.out));
H.check('儲位 ≥ 24px、下一站儲位 ≥ 48px、件數 ≥ 30px', rd.out.find(x => x.sel === '.item-location').px >= 24 && rd.out.find(x => x.sel === '.ns-code').px >= 48 && rd.out.find(x => x.sel === '.item-qty').px >= 30, JSON.stringify(rd.out));
H.check('板號最後 4 碼放大、公司標籤（八方／崇文）清楚、畫面不超出寬度', rd.pid === '0231' && rd.wide && (await page.innerText('#picking-list')).includes('八方') && (await page.innerText('#picking-list')).includes('崇文'), JSON.stringify([rd.pid, rd.wide]));
H.check('沒有頁面錯誤', log.errors.length === 0, JSON.stringify(log.errors));
await H.close(); process.exit(0);
