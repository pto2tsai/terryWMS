// 物流商設定：預設有裕寶饕；主管新增物流商後，還沒排、備註對得上的訂單可以一起改好；一般人員只能看
import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';
const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
await H.resetData(async d => {
  await baseSeed(d);
  const O = (id, o) => H.setDoc(H.doc(d, 'salesOrders', id), Object.assign({ orderNo: id, orderDate: '2026/09/30', status: 'pending', items: [{ productName: '白蝦', spec: '50/60', quantity: 1, packageQty: 1 }] }, o));
  await O('SO-L1', { customer: '客戶甲', remark: '今天走海洋通運', logistics: '未指定' });
  await O('SO-L2', { customer: '客戶乙', remark: '明天下午到', logistics: '未指定' });
});

const { page, log } = await H.openApp(base, USERS.sup);
await H.nav(page, 'wave-picking');
H.check('預設名單有「裕寶饕」：備註寫裕寶饕認得出來', await page.evaluate(() => parseLogistics('裕寶饕') === '裕寶饕' && parseLogistics('裕寶') === '裕寶饕'));
H.check('預設名單：「誠」「誠　當天到貨」算阿誠；「上泰」「上泰貨運」算上泰貨運', await page.evaluate(() => parseLogistics('誠') === '阿誠' && parseLogistics('誠　當天到貨') === '阿誠' && parseLogistics('上泰') === '上泰貨運' && parseLogistics('上泰貨運') === '上泰貨運'));

await page.click('#btn-wave-settings'); await page.click('#btn-logistics-settings'); await page.waitForTimeout(300);
H.check('設定裡有「物流商」，打開看得到名單（含裕寶饕）', await page.isVisible('#modal-logistics-settings') &&
  (await page.$$eval('.lgs-name', e => e.map(x => x.value))).includes('裕寶饕'));
await page.click('#lgs-add');
await page.fill('#lgs-body tr:last-child .lgs-name', '海洋通運');
await page.fill('#lgs-body tr:last-child .lgs-kw', '海洋、海洋通運');
const n0 = log.dialogs.length;
await page.click('#lgs-save'); await page.waitForTimeout(2000);
const saved = await H.one('settings', 'logistics');
H.check('主管新增「海洋通運」存進設定', saved && saved.list.some(x => x.name === '海洋通運' && x.keywords.includes('海洋')), JSON.stringify(saved && saved.list.slice(-2)));
const dl = log.dialogs.slice(n0).map(d => d.msg);
H.check('存檔後列出備註對得上的沒排訂單（SO-L1），不列對不上的（SO-L2）', dl.some(m => m.includes('SO-L1') && m.includes('海洋通運') && !m.includes('SO-L2')), JSON.stringify(dl));
const so = Object.fromEntries((await H.all('salesOrders')).map(o => [o.orderNo, o.logistics]));
H.check('按確定：SO-L1 改成海洋通運，SO-L2 還是未指定', so['SO-L1'] === '海洋通運' && so['SO-L2'] === '未指定', JSON.stringify(so));
H.check('之後匯入的備註寫「海洋」也認得', await page.evaluate(() => parseLogistics('走海洋') === '海洋通運'));

// 一般人員：看得到名單，不能改
const op = await H.openApp(base, USERS.op);
await H.nav(op.page, 'wave-picking'); await op.page.waitForTimeout(1000);
await op.page.evaluate(() => toggleWaveSettings(true)); await op.page.click('#btn-logistics-settings'); await op.page.waitForTimeout(300);
H.check('一般人員：看得到名單（含剛新增的海洋通運），不能改、沒有儲存鍵',
  (await op.page.$$eval('.lgs-name', e => e.map(x => x.value))).includes('海洋通運') && !(await op.page.isVisible('#lgs-save')) && await op.page.$eval('.lgs-name', e => e.disabled));
H.check('沒有頁面錯誤', log.errors.length === 0 && op.log.errors.length === 0, JSON.stringify(log.errors.concat(op.log.errors)));
await H.close(); process.exit(0);
