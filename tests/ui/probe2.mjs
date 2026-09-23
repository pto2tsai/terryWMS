import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';
const [,, tab, clickSel] = process.argv;
const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
await H.resetData(async d => { await baseSeed(d);
  const P = (id, o) => H.setDoc(H.doc(d, 'pallets', id), Object.assign({ palletId: id, company: '崇文', palletCapacity: 40, category: 'Raw' }, o));
  await P('R1', { productName: '白蝦', spec: '50/60', batchNo: 'B1', expiryDate: '2027-05-01', quantity: 30, locationId: 'I-A-03-2F' });
  await P('R2', { productName: '白蝦', spec: '50/60', batchNo: 'B0', expiryDate: '2027-01-01', quantity: 10, locationId: 'I-A-04-1F' });
});
const { page, log } = await H.openApp(base, USERS.op);
await H.nav(page, tab);
if (tab==='picking-rm') { await page.fill('#rm-pick-user','王師傅'); await page.dispatchEvent('#rm-pick-user','input'); await page.waitForTimeout(300); }
if (clickSel) { await page.click(clickSel); await page.waitForTimeout(1500); }
const out = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => (e.id || '').match(/modal/i) && e.offsetParent !== null).slice(0, 3).map(e => e.id + ' :: ' + e.innerText.slice(0, 500).replace(/\n+/g, ' ¦ ') + '\n  inputs: ' + [...e.querySelectorAll('input,select')].map(i => (i.id || i.className.slice(0, 20)) + '[' + i.type + ']' + (i.getAttribute('onchange') || i.getAttribute('oninput') || i.getAttribute('onclick') || '')).slice(0, 12).join(' | ') + '\n  clicks: ' + [...e.querySelectorAll('[onclick]')].map(x => x.getAttribute('onclick')).slice(0, 14).join(' | ')).join('\n'));
console.log(out); console.log('dialogs', JSON.stringify(log.dialogs.map(d=>d.msg.slice(0,100))), 'errors', log.errors);
await H.close(); process.exit(0);
