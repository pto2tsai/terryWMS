// 手機相機掃碼：用假鏡頭播放含板號 QR code 的影片，確認揀貨會被勾選；另測手打尾碼
import * as H from './harness.mjs'; import { baseSeed, USERS } from './seed.mjs';
import QRCode from 'qrcode'; import fs from 'fs'; import os from 'os'; import path from 'path';

// 產生 y4m 影片（I420）：白底中央一個 QR code
function qrY4m(text, file) {
  const W = 640, Hh = 480, qr = QRCode.create(text, { errorCorrectionLevel: 'M' }).modules;
  const n = qr.size, quiet = 4, scale = Math.floor(220 / (n + quiet * 2));
  const ox = Math.floor((W - (n + quiet * 2) * scale) / 2), oy = Math.floor((Hh - (n + quiet * 2) * scale) / 2);
  const Y = Buffer.alloc(W * Hh, 235);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.get(r, c))
    for (let y = 0; y < scale; y++) for (let x = 0; x < scale; x++)
      Y[(oy + (r + quiet) * scale + y) * W + ox + (c + quiet) * scale + x] = 16;
  const UV = Buffer.alloc(W * Hh / 2, 128);
  const parts = [Buffer.from(`YUV4MPEG2 W${W} H${Hh} F15:1 Ip A1:1 C420jpeg\n`)];
  for (let i = 0; i < 15; i++) parts.push(Buffer.from('FRAME\n'), Y, UV);
  fs.writeFileSync(file, Buffer.concat(parts));
}
const video = path.join(os.tmpdir(), 'wms-qr-w-a1.y4m');
qrY4m('w-a1', video);   // 小寫，順便測不分大小寫

const base = H.startServer(); await H.initEnv(); await H.ensureUsers(Object.values(USERS));
await H.resetData(async d => { await baseSeed(d);
  const P = (id, o) => H.setDoc(H.doc(d, 'pallets', id), Object.assign({ palletId: id, company: '崇文', palletCapacity: 40 }, o));
  await P('W-A1', { productName: '白蝦', spec: '50/60', batchNo: 'B1', expiryDate: '2027-05-01', quantity: 6, locationId: 'I-A-03-2F' });
  await P('T-9001', { productName: '透抽', spec: 'L', batchNo: 'T1', expiryDate: '2027-03-01', quantity: 20, locationId: 'J-C-01-1F' });
  await P('PLT-A-0015', { productName: '魷魚', spec: 'M', quantity: 5, locationId: 'K-A-01-1F' });
  await P('PLT-B-0015', { productName: '魷魚', spec: 'M', quantity: 5, locationId: 'K-A-02-1F' });
  await H.setDoc(H.doc(d, 'waves', 'WV1'), { waveNo: 'WV-TEST', logistics: '黑貓', status: 'pending', totalQty: 5, orderCount: 1, createdAt: new Date().toISOString(),
    summary: [{ productName: '白蝦', spec: '50/60', totalQty: 3, orders: ['SO-1'] }, { productName: '透抽', spec: 'L', totalQty: 2, orders: ['SO-1'] }] });
});

const { page, log } = await H.openApp(base, USERS.op, { mobile: true, fakeVideo: video });
await page.click("[onclick=\"openPage('picking')\"]"); await page.waitForTimeout(1500);
await page.selectOption('#picking-wave-select', 'WV1'); await page.waitForTimeout(1500);
H.check('相機元件已載入', await page.evaluate(() => !!window.Html5Qrcode));

// 1) 相機掃 W-A1 的 QR code
await page.click("button[onclick=\"openCameraScan('picking-scan')\"]");
await page.waitForFunction(() => (document.getElementById('cam-result').className || '').includes('ok'), null, { timeout: 20000 }).catch(() => {});
const camMsg = await page.innerText('#cam-result');
H.note('相機結果: ' + camMsg);
let wv = await H.one('waves', 'WV1');
H.check('相機掃到 W-A1 → 揀貨進度寫入 Firestore', (wv.completedItems || []).includes('W-A1-白蝦'), JSON.stringify(wv.completedItems) + ' ' + camMsg);
H.check('揀貨是連續模式，掃完相機仍開著', await page.isVisible('#cam-overlay'));
// 同一個碼持續在畫面中，不應再觸發「已揀過」錯誤
await page.waitForTimeout(4000);
H.check('板子停在鏡頭前不會重複觸發', (await page.innerText('#cam-result')).includes('✓'), await page.innerText('#cam-result'));
await page.click("#cam-overlay button[onclick=\"closeCameraScan()\"]"); await page.waitForTimeout(500);
H.check('關閉相機', !(await page.isVisible('#cam-overlay')));

// 2) 手打尾碼
await page.fill('#picking-scan', '9001'); await page.press('#picking-scan', 'Enter'); await page.waitForTimeout(1200);
wv = await H.one('waves', 'WV1');
H.check('手打尾碼 9001 → 對到 T-9001', (wv.completedItems || []).includes('T-9001-透抽'), JSON.stringify(wv.completedItems) + ' ' + await page.innerText('#picking-scan-result'));
await page.fill('#picking-scan', 't-9001'); await page.press('#picking-scan', 'Enter'); await page.waitForTimeout(800);
H.check('重複掃提示「已揀過」', (await page.innerText('#picking-scan-result')).includes('已揀過'), await page.innerText('#picking-scan-result'));

// 3) 尾碼有兩板符合 → 列出讓使用者選
await page.evaluate(() => goBack()); await page.click("[onclick=\"openPage('outbound')\"]"); await page.waitForTimeout(500);
await page.fill('#out-pallet', '0015'); await page.press('#out-pallet', 'Enter'); await page.waitForTimeout(300);
const r = await page.innerText('#out-result');
const nChoices = await page.$$eval('#out-choices .pick-choice', e => e.length);
H.check('尾碼 0015 有兩板 → 提示多輸入幾碼並列出兩板可點選', r.includes('請多輸入幾碼') && nChoices === 2, r + ' choices=' + nChoices);
await page.fill('#out-pallet', 'b-0015'); await page.press('#out-pallet', 'Enter'); await page.waitForTimeout(300);
const info = await page.innerText('#out-pallet-info');
H.check('多打幾碼 B-0015（不分大小寫、可省略符號）→ 唯一對到', info.includes('K-A-02-1F'), info);

H.note('errors: ' + JSON.stringify(log.errors) + JSON.stringify(log.console));
H.check('沒有頁面錯誤', log.errors.length === 0, JSON.stringify(log.errors));
await H.close(); process.exit(0);
