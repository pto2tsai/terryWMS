// 手機版面：最窄 320px 的手機上，每一頁的按鈕、輸入框都不會超出畫面（掃描列的確認鈕曾被擠出去）
import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';
const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
await H.resetData(baseSeed);
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
H.check('沒有頁面錯誤', log.errors.length === 0, JSON.stringify(log.errors));
await H.close(); process.exit(0);
