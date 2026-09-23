// UI 探索測試框架：真的點畫面、真的走 Firestore 模擬器（需先啟動模擬器：firestore 8080、auth 9099）
import { chromium } from 'playwright';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, setLogLevel } from 'firebase/firestore';
import fs from 'fs'; import http from 'http'; import path from 'path';
setLogLevel('error');
export const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const NM = path.join(REPO, 'tests/node_modules');
export const PROJECT = 'terrywms-2345f';
const LIBS = {
  'cdn.jsdelivr.net/npm/chart.js': 'chart.js/dist/chart.umd.js',
  'xlsx.full.min.js': 'xlsx/dist/xlsx.full.min.js',
  'JsBarcode.all.min.js': 'jsbarcode/dist/JsBarcode.all.min.js',
};
const TAILWIND_STUB = "window.tailwind={};(function(){var s=document.createElement('style');s.textContent='.hidden{display:none!important}.flex{display:flex}.grid{display:grid}';document.head.appendChild(s);})();";

let srv;
export function startServer(port = 8766) {
  srv = http.createServer((req, res) => {
    const p = path.join(REPO, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    fs.readFile(p, (e, b) => {
      if (e) { res.writeHead(404); return res.end(); }
      if (p.endsWith('mobile.html')) b = Buffer.from(String(b).replace("const auth = firebase.auth();", "const auth = firebase.auth(); db.useEmulator('127.0.0.1',8080); auth.useEmulator('http://127.0.0.1:9099',{disableWarnings:true});"));
      if (p.endsWith('firebase-init.js')) b = Buffer.from(String(b).replace("window.secondaryAuth = secondaryAuth;", "window.secondaryAuth = secondaryAuth; db.useEmulator('127.0.0.1',8080); auth.useEmulator('http://127.0.0.1:9099',{disableWarnings:true}); secondaryAuth.useEmulator('http://127.0.0.1:9099',{disableWarnings:true});"));
      res.writeHead(200, { 'content-type': p.endsWith('.js') ? 'text/javascript' : p.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8' }); res.end(b);
    });
  }).listen(port);
  return `http://localhost:${port}`;
}

export let env;
export async function initEnv() {
  env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: fs.readFileSync(path.join(REPO, 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 } });
  return env;
}
export async function resetData(seedFn) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => { await seedFn(c.firestore()); });
}
export async function admin(fn) { let out; await env.withSecurityRulesDisabled(async c => { out = await fn(c.firestore()); }); return out; }
export async function all(coll) { return admin(async d => (await getDocs(collection(d, coll))).docs.map(x => Object.assign({ _id: x.id }, x.data()))); }
export async function one(coll, id) { return admin(async d => { const s = await getDoc(doc(d, coll, id)); return s.exists() ? s.data() : null; }); }
export { doc, setDoc, collection };

export async function ensureUsers(emails) {
  for (const e of emails) await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: e, password: 'pass1234', returnSecureToken: true }) });
}

let browser;
export async function openApp(base, email, { mobile = false } = {}) {
  browser = browser || await chromium.launch();
  const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 } } : { viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  const log = { dialogs: [], errors: [], console: [] };
  page.on('pageerror', e => log.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') log.console.push(m.text()); });
  // 對話框：記錄內容；預設按確定（prompt 用預設值），可用 page.__dialogPlan 覆寫
  page.on('dialog', async d => {
    const plan = page.__dialogPlan && page.__dialogPlan.shift();
    log.dialogs.push({ type: d.type(), msg: d.message(), answer: plan === undefined ? 'accept' : plan });
    if (plan === false) return d.dismiss();
    if (d.type() === 'prompt') return d.accept(typeof plan === 'string' ? plan : d.defaultValue());
    return d.accept();
  });
  await ctx.route(/^(?!http:\/\/(127\.0\.0\.1|localhost))/, r => {
    const u = r.request().url();
    const m = u.match(/firebasejs\/10\.7\.1\/(firebase-[a-z]+-compat\.js)/);
    if (m) return r.fulfill({ body: fs.readFileSync(path.join(NM, 'firebase10', m[1])), contentType: 'text/javascript' });
    if (u.includes('cdn.tailwindcss.com')) return r.fulfill({ body: TAILWIND_STUB, contentType: 'text/javascript' });
    for (const k in LIBS) if (u.includes(k)) return r.fulfill({ body: fs.readFileSync(path.join(NM, LIBS[k])), contentType: 'text/javascript' });
    return r.fulfill({ body: '', contentType: u.endsWith('.css') ? 'text/css' : 'text/javascript' });
  });
  await page.goto(base + (mobile ? '/mobile.html' : '/index.html'));
  if (mobile) {
    await page.fill('#login-email', email); await page.fill('#login-pwd', 'pass1234');
    await page.click('button[onclick="doLogin()"]');
    await page.waitForFunction(() => window.currentUser, null, { timeout: 15000 });
  } else {
    await page.fill('#login-email', email); await page.fill('#login-pwd', 'pass1234');
    await page.evaluate(() => window.loginSystem());
    await page.waitForFunction(() => window.currentUser && document.getElementById('view-login').classList.contains('hidden'), null, { timeout: 15000 });
  }
  await page.waitForTimeout(2500);
  return { page, log, ctx };
}
export async function nav(page, tab) {
  await page.click(`[onclick^="switchTab('${tab}'"]`);
  await page.waitForTimeout(800);
}
export function lastDialog(log) { return log.dialogs.length ? log.dialogs[log.dialogs.length - 1].msg : ''; }
export async function close() { if (browser) await browser.close(); if (srv) srv.close(); }

export const results = [];
export function check(name, cond, detail = '') { results.push({ name, ok: !!cond, detail }); console.log((cond ? '✔ ' : '✘ ') + name + (cond ? '' : '  ⇒ ' + String(detail).slice(0, 400))); }
export function note(msg) { console.log('📝 ' + msg); }
