// 報表：抬頭、查詢條件、合計；A4 分頁（每頁抬頭＋表頭＋頁碼、續頁標示、不溢出、PDF 頁數一致）；Excel 抬頭與可再匯入
import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';
import XLSX from 'xlsx'; import fs from 'fs';

const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
await H.resetData(async d => { await baseSeed(d);
  await H.setDoc(H.doc(d, 'settings', 'report'), { orgName: '測試冷凍食品股份有限公司' });
  for (let i = 1; i <= 6; i++) await H.setDoc(H.doc(d, 'pallets', 'R' + i), { palletId: 'R' + i, productName: i % 2 ? '白蝦' : '透抽', spec: 'S' + i, company: i > 4 ? '八方' : '崇文', quantity: i * 10, locationId: 'I-A-0' + i + '-1F', expiryDate: '2027-0' + i + '-01' });
});
const { page, log, ctx } = await H.openApp(base, USERS.op);
await page.waitForTimeout(1000);

// ---------- A4 分頁（直式／橫式、多種筆數）----------
async function printAndMeasure(n, cols) {
  const popupP = ctx.waitForEvent('page');
  await page.evaluate(([n, cols]) => {
    const columns = Array.from({ length: cols }, (_, i) => i === 0 ? '品名' : i === cols - 1 ? '數量' : '欄位' + i);
    const rows = Array.from({ length: n }, (_, k) => { const o = {}; columns.forEach((c, i) => o[c] = i === cols - 1 ? k + 1 : (i === 1 && k % 7 === 0 ? '比較長的內容會換行，測試分頁時的列高是否正確計算，不會被頁尾蓋住' : c + '-' + k)); return o; });
    window.printTableReport({ title: '分頁測試', meta: [['查詢期間', '2026-09-01 ～ 2026-09-24']], columns, rows });
  }, [n, cols]);
  const pop = await popupP;
  await pop.waitForSelector('body[data-ready="1"]', { timeout: 10000 });
  const m = await pop.evaluate(() => [...document.querySelectorAll('.page')].map((p, i) => {
    const foot = p.querySelector('.foot'), c = p.querySelector('.content');
    return { foot: foot.offsetTop, H: p.offsetHeight, used: c.offsetTop + c.offsetHeight, limit: foot.offsetTop - 14,
      rows: p.querySelectorAll('tbody tr:not(.tot)').length, title: p.querySelector('.title').innerText, thead: !!p.querySelector('thead th'),
      pn: p.querySelector('.pn').innerText, org: p.querySelector('.org').innerText, tot: !!p.querySelector('tr.tot'), sign: !!p.querySelector('.sign') };
  }));
  await pop.emulateMedia({ media: 'print' });
  const pdf = await pop.pdf({ preferCSSPageSize: true, printBackground: true });
  const pdfPages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  await pop.close();
  return { m, pdfPages };
}
for (const [n, cols] of [[4, 4], [30, 5], [80, 5], [200, 6], [60, 10]]) {
  const { m, pdfPages } = await printAndMeasure(n, cols);
  const total = m.reduce((s, p) => s + p.rows, 0);
  const tag = n + ' 筆／' + cols + ' 欄' + (cols > 7 ? '（橫式）' : '');
  H.note(tag + '：' + m.length + ' 頁，每頁列數 ' + m.map(p => p.rows).join(',') + '，PDF ' + pdfPages + ' 頁');
  H.check(tag + '：所有列都印出、沒有頁面內容超出頁尾', total === n && m.every(p => p.used <= p.limit), JSON.stringify(m.map(p => [p.used, p.limit])));
  H.check(tag + '：每頁頁尾位置相同（貼齊紙張底部）', m.every(p => p.foot === m[0].foot && p.foot === p.H - 36), JSON.stringify(m.map(p => p.foot)));
  H.check(tag + '：每頁都有抬頭、表頭、頁碼；第 2 頁起標示（續）', m.every((p, i) => p.org.includes('測試冷凍') && p.thead && p.pn === '第 ' + (i + 1) + ' / ' + m.length + ' 頁' && (i === 0 ? !p.title.includes('續') : p.title.includes('（續）'))), JSON.stringify(m.map(p => [p.title, p.pn])));
  H.check(tag + '：合計與簽核欄只在最後一頁、最後一頁不是只有合計', m.every((p, i) => (i === m.length - 1) === p.tot && (i === m.length - 1) === p.sign) && m[m.length - 1].rows > 0, JSON.stringify(m.map(p => [p.tot, p.rows])));
  H.check(tag + '：PDF 頁數與畫面相同（不會多印空白頁）', pdfPages === m.length, pdfPages + ' vs ' + m.length);
  if (n === 4) H.check('4 筆不會過早分頁（一頁）', m.length === 1);
}

// ---------- 報表中心：畫面抬頭、合計、Excel ----------
await H.nav(page, 'picking-reports');
await page.selectOption('#report-type-select', 'inventory-summary');
await page.evaluate(() => generateReportFromSelect()); await page.waitForTimeout(1200);
const prev = await page.innerText('#report-preview-area');
H.note('報表畫面：' + prev.slice(0, 200).replace(/\n/g, ' | '));
H.check('報表畫面有抬頭（公司）、報表名稱、資料時間、製表時間、筆數', prev.includes('測試冷凍食品股份有限公司') && prev.includes('資料時間') && prev.includes('製表時間') && prev.includes('筆數'));
H.check('報表畫面最下面有合計列', /合計/.test(prev));
const dlP = page.waitForEvent('download');
await page.evaluate(() => exportReportExcel());
const dl = await dlP; const file = await dl.path();
const wb = XLSX.read(fs.readFileSync(file)); const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
H.note('Excel 前 8 列：' + JSON.stringify(aoa.slice(0, 8)));
H.check('Excel：第 1 列公司、第 2 列報表名稱、下面有資料時間／製表時間／製表人', aoa[0][0] === '測試冷凍食品股份有限公司' && /庫存/.test(aoa[1][0]) && aoa.some(r => r[0] === '製表時間') && aoa.some(r => r[0] === '製表人' && r[1]), JSON.stringify(aoa.slice(0, 7)));
H.check('Excel：最後一列是合計', aoa[aoa.length - 1][0] === '合計', JSON.stringify(aoa[aoa.length - 1]));

// ---------- 庫存清單匯出（只匯出篩選的公司）→ 可以再匯入 ----------
await H.nav(page, 'inventory-query');
await page.click('#btn-inv-bf'); await page.waitForTimeout(500);
const dl2P = page.waitForEvent('download');
await page.evaluate(() => exportInventoryToExcel());
const dl2 = await dl2P; const buf2 = fs.readFileSync(await dl2.path());
const aoa2 = XLSX.utils.sheet_to_json(XLSX.read(buf2).Sheets['庫存清單'], { header: 1, defval: '' });
H.check('庫存清單：有抬頭、公司＝八方、只有八方 2 板、合計數量 110', aoa2[1][0] === '庫存清單' && aoa2.some(r => r[0] === '公司' && r[1] === '八方') && aoa2[aoa2.length - 1][0] === '合計' && aoa2[aoa2.length - 1].includes(110), JSON.stringify(aoa2));
const parsed = await page.evaluate(b64 => { const wb = XLSX.read(b64, { type: 'base64' }); return sheetToJsonSmart(wb.Sheets[wb.SheetNames[0]]); }, buf2.toString('base64'));
H.check('帶抬頭的匯出檔再匯入時會自動跳過抬頭與合計（讀到 2 板）', parsed.length === 2 && parsed.every(r => r['品名'] && r['數量']), JSON.stringify(parsed));

H.check('沒有頁面錯誤', log.errors.length === 0, JSON.stringify(log.errors));
await H.close(); process.exit(0);
