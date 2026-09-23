import { chromium } from 'playwright';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, setLogLevel, Timestamp } from 'firebase/firestore';
import fs from 'fs'; import http from 'http'; import path from 'path';
setLogLevel('error');
const REPO=path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FB=path.join(REPO,'tests/node_modules/firebase10/')+'/';
const PROJECT='terrywms-2345f';
// static server for repo
const srv = http.createServer((req,res)=>{ const p=path.join(REPO, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/,'/index.html'));
  fs.readFile(p,(e,b)=>{ if(e){res.writeHead(404);return res.end();}
    // 手機版：由測試伺服器注入模擬器設定（用 route 攔截文件會讓 Chromium 擋掉跨來源請求）
    if (p.endsWith('mobile.html')) b = Buffer.from(String(b).replace("const auth = firebase.auth();","const auth = firebase.auth(); db.useEmulator('127.0.0.1',8080); auth.useEmulator('http://127.0.0.1:9099',{disableWarnings:true});"));
    res.writeHead(200,{'content-type': p.endsWith('.js')?'text/javascript':'text/html; charset=utf-8'}); res.end(b);});}).listen(8765);
const env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: fs.readFileSync(path.join(REPO,'firestore.rules'),'utf8'), host:'127.0.0.1', port:8080 } });
const today = new Date(); const ds = today.getFullYear()+String(today.getMonth()+1).padStart(2,'0')+String(today.getDate()).padStart(2,'0');
await env.withSecurityRulesDisabled(async c => { const d=c.firestore();
  await setDoc(doc(d,'users','admin@t.com'),{email:'admin@t.com',role:'admin',active:true});
  await setDoc(doc(d,'users','op@t.com'),{email:'op@t.com',role:'operator',active:true});
  await setDoc(doc(d,'users','op2@t.com'),{email:'op2@t.com',role:'operator',active:true});
  await setDoc(doc(d,'users','ro@t.com'),{email:'ro@t.com',role:'readonly',active:true});
  const P=(id,o)=>setDoc(doc(d,'pallets',id),Object.assign({palletId:id,productName:'白蝦',spec:'S',company:'崇文',batchNo:'B1',expiryDate:'2027-01-01',quantity:10},o));
  await P('PA',{locationId:'I-A-01-3F',quantity:10}); await P('PB',{locationId:'I-A-02-3F',quantity:5});
  await P('PC',{locationId:'I-A-03-3F',quantity:7,batchNo:'B2'}); await P('PD',{locationId:'I-A-04-3F',quantity:3});
  await P('PE',{locationId:'I-B-01-2F',quantity:4}); await P('PF',{locationId:'I-A-05-1F',quantity:4});
  await P('PG',{locationId:'J-C-01-3F',quantity:6}); await P('PH',{locationId:'J-C-02-3F',quantity:3}); await P('PI',{locationId:'J-C-03-3F',quantity:2,batchNo:'B9'});
  await setDoc(doc(d,'pallets','PX'),{palletId:'PX',productName:'花枝',spec:'M',company:'崇文',batchNo:'Z',expDate:'2027/3/4',quantity:'8',locationId:'K-E-01-1F'});
  await setDoc(doc(d,'pallets','PY'),{palletId:'PY',productName:'花枝',spec:'M',company:'崇文',batchNo:'Z',expiryDate:Timestamp.fromDate(new Date(2027,2,4)),quantity:5,locationId:'K-E-02-1F'});
  await setDoc(doc(d,'inventoryLogs','OLD1'),{type:'move',timestamp:Timestamp.fromDate(new Date(2026,0,2,7,30)),palletId:'PX'});
  await setDoc(doc(d,'waves','WP'),{waveNo:'WP1',status:'pending',orders:[{id:'SO2',orderNo:'SO2'}]});
  await setDoc(doc(d,'salesOrders','SO2'),{orderNo:'SO2',status:'inWave',waveNo:'WP1'});
  await setDoc(doc(d,'waves','WM'),{waveNo:'WM1',status:'pending',logistics:'黑貓',totalQty:3,createdAt:'2026-09-23T01:00:00Z',summary:[{productName:'花枝',spec:'M',totalQty:3,orders:[]}]});
  await setDoc(doc(d,'dispatchOrders','DO1'),{orderNo:'DSP-1',productName:'花枝',status:'pending',completedOps:[],createdAt:'2026-09-23T01:00:00Z',operations:[
    {id:'op-0',type:'移位',from:'K-E-02-1F',palletId:'PY',docId:'PY',to:'K-F-05-2F',qty:5,reason:'孤立板'},
    {id:'op-1',type:'合併',from:'K-E-01-1F',palletId:'PX',docId:'PX',to:'K-F-05-2F',toDocId:'PY',toPalletId:'PY',qty:8}]});
  await setDoc(doc(d,'externalStock','E1'),{warehouseId:'W1',productName:'透抽',spec:'L',batchNo:'X',company:'崇文',quantity:20});
  await setDoc(doc(d,'waves','WV'),{waveNo:'WV1',status:'picking'});
  await setDoc(doc(d,'salesOrders','SO1'),{orderNo:'SO1',status:'inWave'});
  await setDoc(doc(d,'shippingOrders','O1'),{orderId:'O1',customer:'客戶甲',status:'Pending',items:[{productName:'白蝦',spec:'S',qty:3}]});
});
for (const e of ['admin@t.com','op@t.com','op2@t.com','ro@t.com','stranger@t.com'])
  await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:e,password:'pass1234',returnSecureToken:true})});

const browser = await chromium.launch();
async function openAs(email){
  const ctx = await browser.newContext(); const page = await ctx.newPage(); const errs=[];
  page.on('pageerror', e=>errs.push(e.message));
  await ctx.route('**/*', r=>{ const u=r.request().url();
    const m=u.match(/firebasejs\/10\.7\.1\/(firebase-[a-z]+-compat\.js)/); if(m) return r.fulfill({body:fs.readFileSync(FB+m[1]),contentType:'text/javascript'});
    if(u.endsWith('/firebase-init.js')){ let s=fs.readFileSync(REPO+'/firebase-init.js','utf8');
      s=s.replace("window.secondaryAuth = secondaryAuth;","window.secondaryAuth = secondaryAuth; db.useEmulator('127.0.0.1',8080); auth.useEmulator('http://127.0.0.1:9099',{disableWarnings:true}); secondaryAuth.useEmulator('http://127.0.0.1:9099',{disableWarnings:true});");
      return r.fulfill({body:s,contentType:'text/javascript'}); }
    if(u.startsWith('http://localhost:8765')||u.startsWith('http://127.0.0.1')) return r.continue();
    return r.fulfill({body:'',contentType:'text/javascript'}); });
  await page.addInitScript(()=>{ window.__alerts=[]; window.alert=m=>window.__alerts.push(String(m)); window.confirm=()=>true; window.prompt=(q,d)=>d; });
  await page.goto('http://localhost:8765/index.html');
  await page.waitForFunction(()=>typeof window.loginSystem==='function');
  await page.fill('#login-email',email); await page.fill('#login-pwd','pass1234');
  await page.evaluate(()=>window.loginSystem());
  await page.waitForFunction(()=>window.currentUser || !document.getElementById('login-error').classList.contains('hidden'),null,{timeout:15000});
  await page.waitForTimeout(1500);
  return {page, errs};
}

async function openMobileAs(email){
  const ctx = await browser.newContext({ viewport:{width:390,height:844} }); const page = await ctx.newPage(); const errs=[];
  page.on('pageerror', e=>errs.push(e.message));
  await ctx.route('**/*', r=>{ const u=r.request().url();
    const m=u.match(/firebasejs\/10\.7\.1\/(firebase-[a-z]+-compat\.js)/); if(m) return r.fulfill({body:fs.readFileSync(FB+m[1]),contentType:'text/javascript'});
    if(u.startsWith('http://localhost:8765')||u.startsWith('http://127.0.0.1')) return r.continue();
    return r.fulfill({body:'',contentType:'text/css'}); });
  await page.addInitScript(()=>{ window.__alerts=[]; window.alert=m=>window.__alerts.push(String(m)); window.confirm=()=>true; });
  await page.goto('http://localhost:8765/mobile.html');
  await page.waitForFunction(()=>typeof window.doLogin==='function');
  await page.fill('#login-email',email); await page.fill('#login-pwd','pass1234');
  await page.evaluate(()=>window.doLogin());
  await page.waitForTimeout(2500);
  return {page, errs};
}

let pass=0, fail=0; const ok=(name,cond,extra='')=>{ if(cond){pass++;console.log('✔',name);} else {fail++;console.log('✘',name,extra);} };
const admin = async fn => { let out; await env.withSecurityRulesDisabled(async c=>{ out = await fn(c.firestore()); }); return out; };
const qty = id => admin(async d=>{ const s=await getDoc(doc(d,'pallets',id)); return s.exists()? s.data().quantity : null; });
const logCount = () => admin(async d=>(await getDocs(collection(d,'inventoryLogs'))).size);

const A = await openAs('op@t.com'); const B = await openAs('op2@t.com');
ok('operator login', await A.page.evaluate(()=>window.currentUser && window.currentUser.role)==='operator');

// T1 doc numbers
const nosA = await A.page.evaluate(async()=>{ await window.ensureDocNoPool('IN',3); return [generateDocNo('IN'),generateDocNo('IN'),await nextDocNo('IN')]; });
const nosB = await B.page.evaluate(async()=>{ await window.ensureDocNoPool('IN',3); return [generateDocNo('IN'),generateDocNo('IN'),await nextDocNo('IN')]; });
const all=[...nosA,...nosB];
ok('doc numbers unique across devices', new Set(all).size===all.length, all.join(','));
ok('doc number format', all.every(n=>new RegExp('^IN-'+ds+'-\\d{3}$').test(n)), all.join(','));
const cnt = await admin(async d=>(await getDoc(doc(d,'counters','IN-'+ds))).data());
ok('counter stored in Firestore', cnt && cnt.seq>=6, JSON.stringify(cnt));

// T2 concurrent deductions on same pallet
const logs0 = await logCount();
const tx = (p, delta) => p.evaluate(async(delta)=>{ try{ await runStockTransaction({changes:[{ref:db.collection('pallets').doc('PA'),delta,label:'PA'}],logs:()=>[{type:'outbound',productName:'白蝦',quantityChange:delta,palletId:'PA'}]}); return 'ok'; }catch(e){ return 'ERR '+e.message; } }, delta);
const [r1,r2] = await Promise.all([tx(A.page,-4), tx(B.page,-4)]);
ok('concurrent deductions both succeed', r1==='ok'&&r2==='ok', r1+' / '+r2);
ok('concurrent deductions no lost update (10-8=2)', await qty('PA')===2, await qty('PA'));
const r3 = await tx(A.page,-3);
ok('insufficient stock rejected', r3.includes('庫存不足'), r3);
ok('stock unchanged after rejection', await qty('PA')===2);
ok('logs written in same tx (2)', await logCount()-logs0===2, await logCount()-logs0);

// T3 merge
const m1 = await A.page.evaluate(async()=>{ try{ await mergePalletsTx(db.collection('pallets').doc('PC'), db.collection('pallets').doc('PB')); return 'ok'; }catch(e){return 'ERR '+e.message;} });
ok('merge different batch blocked', m1.includes('批號不同'), m1);
const m2 = await A.page.evaluate(async()=>{ try{ const r=await mergePalletsTx(db.collection('pallets').doc('PB'), db.collection('pallets').doc('PA')); return r.total; }catch(e){return 'ERR '+e.message;} });
ok('merge adds actual qty (2+5=7)', m2===7 && await qty('PA')===7 && await qty('PB')===null, m2);
const m3 = await A.page.evaluate(async()=>{ try{ await mergePalletsTx(db.collection('pallets').doc('PA'), db.collection('pallets').doc('PA')); return 'ok'; }catch(e){return 'ERR '+e.message;} });
ok('merge into itself blocked', m3.startsWith('ERR'), m3);

// T4 field outbound UI function
await A.page.evaluate(()=>{ if(!document.getElementById('field-out-qty')) document.body.insertAdjacentHTML('beforeend','<input id="field-out-qty">'); });
const fo = await A.page.evaluate(async()=>{ window._fieldData.outbound.pallet = currentPallets().find(p=>p.id==='PD'); document.getElementById('field-out-qty').value='3'; window.resetFieldOutbound=function(){}; await executeFieldOutbound(); return window.__alerts.slice(-1)[0]; });
ok('field outbound empties & deletes pallet', await qty('PD')===null, fo);
const lastLog = await admin(async d=>{ const s=await getDocs(collection(d,'inventoryLogs')); return s.docs.map(x=>x.data()).find(l=>l.palletId==='PD'); });
ok('field outbound log has ISO timestamp', lastLog && typeof lastLog.timestamp==='string' && lastLog.quantityChange===-3, JSON.stringify(lastLog));

// T5 transfer (external -> pending inbound order)
const t5 = await A.page.evaluate(async()=>{
  window.externalStock=[{id:'E1',warehouseId:'W1',productName:'透抽',spec:'L',batchNo:'X',company:'崇文',quantity:20}];
  window.renderTransferList=function(){}; window.loadExternalStock=async function(){}; window.showNotification=function(){};
  window.transferList=[{mode:'in',fromWh:'W1',fromName:'外倉1',productName:'透抽',spec:'L',batchNo:'X',company:'崇文',quantity:5},
                       {mode:'in',fromWh:'W1',fromName:'外倉1',productName:'透抽',spec:'L',batchNo:'X',company:'崇文',quantity:100}];
  await executeTransfer(); return { left: window.transferList.length, msg: window.__alerts.slice(-1)[0] }; });
const e1 = await admin(async d=>(await getDoc(doc(d,'externalStock','E1'))).data().quantity);
ok('transfer: first line done, second (too big) kept in list', t5.left===1 && e1===15, JSON.stringify(t5)+' E1='+e1);
const io = await admin(async d=>(await getDocs(collection(d,'inboundOrders'))).docs.map(x=>x.data()));
ok('transfer created inbound order with TR number', io.length===1 && /^TR-\d{8}-\d{3}$/.test(io[0].docNo), JSON.stringify(io.map(o=>o.docNo)));

// T6 completeWave twice
const wave = () => A.page.evaluate(async()=>{
  window.saveWaves=function(){}; window.closeWaveExecuteModal=function(){}; window.refreshWaveList=function(){};
  window._waveData.currentWave={id:'WV',waveNo:'WV1',status:'picking',orders:[{orderId:'SO1'}]};
  window._waveData.pickingList=[{completed:true,palletId:'PA',pickQty:2,productName:'白蝦',spec:'S',locationId:'I-A-01-3F',batchNo:'B1'}];
  await completeWave(); return window.__alerts.slice(-1)[0]; });
const w1 = await wave();
const wv = await admin(async d=>[(await getDoc(doc(d,'waves','WV'))).data().status,(await getDoc(doc(d,'salesOrders','SO1'))).data().status]);
ok('wave completed: stock 7-2=5, wave done, order shipped', await qty('PA')===5 && wv[0]==='done' && wv[1]==='shipped', w1+' '+wv);
const w2 = await wave();
ok('wave cannot be completed twice', w2.includes('已經完成過') && await qty('PA')===5, w2);

// T7 query wrapper + clearLane only clears that lane
await A.page.evaluate(async()=>{ await clearLane('I-B', 1); });
ok('clearLane deletes only its lane', await qty('PE')===null && await qty('PF')===4 && await qty('PA')===5);
const qn = await A.page.evaluate(async()=>(await getDocs(query(collection(db,'pallets'), where('palletId','==','PF')))).size);
ok('query where filter applied', qn===1, qn);


// T9 dispatch merge by doc id
const d9 = await A.page.evaluate(async()=>{ window.renderDispatchExecList=function(){}; window.updateDispatchProgress=function(){};
  window._dispatchExecData={operations:[],completedIds:[]};
  await executeDispatchOperation({id:'m1',type:'merge',docId:'PF',palletId:'PF',from:'I-A-05-1F',to:'I-A-01-3F',qty:4,keepPallet:{docId:'PA',palletId:'PA',location:'I-A-01-3F'}});
  return window._dispatchExecData.completedIds.join(',') + ' ' + (window.__alerts.slice(-1)[0]||''); });
ok('dispatch merge uses actual qty (5+4=9)', await qty('PA')===9 && await qty('PF')===null, d9);

// T10 order shipment
const ship = () => A.page.evaluate(async()=>{
  ['order-picking-detail','order-picking-actions','shipping-list-body','order-count'].forEach(id=>{ if(!document.getElementById(id)) document.body.insertAdjacentHTML('beforeend','<div id="'+id+'"></div>'); });
  await new Promise(r=>setTimeout(r,300));
  const order = window.currentOrders().find(o=>o.orderId==='O1');
  window.currentSelectedOrder = order; selectOrderForPicking(window.currentOrders().indexOf(order));
  await confirmOrderPicking(); return window.__alerts.slice(-1)[0]; });
const s1 = await ship();
const o1 = await admin(async d=>(await getDoc(doc(d,'shippingOrders','O1'))).data().status);
ok('order shipment deducts 9-3=6 and marks order Completed', await qty('PA')===6 && o1==='Completed', s1+' '+o1);
const s2 = await ship();
ok('order cannot ship twice', s2.includes('已經出貨') && await qty('PA')===6, s2);

// T11 raw-material picking
const rm = await A.page.evaluate(async()=>{
  ['rm-pick-user','rm-pick-dept','rm-pick-note'].forEach(id=>{ if(!document.getElementById(id)) document.body.insertAdjacentHTML('beforeend','<input id="'+id+'">'); });
  window.printRmPickingList=function(){}; window.renderRmCartDisplay=function(){}; window.updateRmStepStatus=function(){}; window.loadRmStockData=function(){};
  const item = currentPallets().find(p=>p.id==='PA');
  window.rmStockSelected={a:{item:item,qty:2}}; window.rmPickingInfo={user:'王小明',dept:'生產',note:''};
  await executeRmPicking(); return window.__alerts.slice(-1)[0]||'ok'; });
ok('raw-material picking deducts 6-2=4', await qty('PA')===4, rm);

// T12 external outbound + transfer to main warehouse
const ex = await A.page.evaluate(async()=>{ window.showToast=function(m){ window.__alerts.push(m); };
  const a = await externalOutbound('E1', 5, 'test'); const b = await transferToMainWarehouse('E1', 4, 'I-A-06-3F'); return [a,b,window.__alerts.slice(-2)]; });
const e1b = await admin(async d=>(await getDoc(doc(d,'externalStock','E1'))).data().quantity);
const newP = await admin(async d=>(await getDocs(collection(d,'pallets'))).docs.map(x=>x.data()).find(p=>p.locationId==='I-A-06-3F'));
ok('external outbound + transfer to main (15-5-4=6), new pallet numbered', ex[0]===true && ex[1]===true && e1b===6 && newP && /^IN-\d{8}-\d{3}$/.test(newP.palletId) && newP.quantity===4, JSON.stringify(ex)+' E1='+e1b);

// T13 scrap
const sc = await A.page.evaluate(async()=>{ window.loadInventory=function(){}; window.refreshExpiryReport=function(){}; await initiateScrap('PC'); return window.__alerts.slice(-1)[0]; });
const scLog = await admin(async d=>(await getDocs(collection(d,'inventoryLogs'))).docs.map(x=>x.data()).find(l=>l.type==='scrap'));
ok('scrap deletes pallet and logs', await qty('PC')===null && scLog && scLog.quantityChange===-7, sc);


// T14 pallet change page: move + merge (stale scan cache must be ignored)
const pc = await A.page.evaluate(async()=>{
  ['move-pallet-id','move-target-loc','merge-keep-id','merge-remove-id'].forEach(id=>{ if(!document.getElementById(id)) document.body.insertAdjacentHTML('beforeend','<input id="'+id+'">'); });
  ['move-pallet-info','merge-keep-info','merge-remove-info'].forEach(id=>{ if(!document.getElementById(id)) document.body.insertAdjacentHTML('beforeend','<div id="'+id+'"></div>'); });
  window._movePalletData = currentPallets().find(p=>p.id==='PI'); // stale cache from an earlier scan
  document.getElementById('move-pallet-id').value='PG'; document.getElementById('move-target-loc').value='J-D-09-1F';
  await executePalletMove();
  const a1 = window.__alerts.slice(-1)[0];
  await new Promise(r=>setTimeout(r,500));
  document.getElementById('merge-keep-id').value='PG'; document.getElementById('merge-remove-id').value='PI';
  window._keepPalletData=null; window._removePalletData=null;
  await executePalletMerge(); const a2 = window.__alerts.slice(-1)[0];
  document.getElementById('merge-keep-id').value='PG'; document.getElementById('merge-remove-id').value='PH';
  window._keepPalletData=null; window._removePalletData=null;
  await executePalletMerge(); const a3 = window.__alerts.slice(-1)[0];
  return [a1,a2,a3]; });
const pg = await admin(async d=>(await getDoc(doc(d,'pallets','PG'))).data());
ok('pallet change: moved the scanned pallet (not stale cache)', pg.locationId==='J-D-09-1F' && (await admin(async d=>(await getDoc(doc(d,'pallets','PI'))).data().locationId))==='J-C-03-3F', pc[0]);
ok('pallet change: merge with different batch blocked', pc[1].includes('批號不同') && await qty('PI')===2, pc[1]);
ok('pallet change: merge 6+3=9', await qty('PG')===9 && await qty('PH')===null, pc[2]);


// ===== 第 3 步：資料格式、容量、重複函數 =====
const nrm = await A.page.evaluate(()=>{ const px=currentPallets().find(p=>p.id==='PX'), py=currentPallets().find(p=>p.id==='PY'); return [px.expiryDate,px.expDate,px.quantity,py.expiryDate,py.expDate]; });
ok('read-time normalization: both fields YYYY-MM-DD, qty number', JSON.stringify(nrm)===JSON.stringify(['2027-03-04','2027-03-04',8,'2027-03-04','2027-03-04']), JSON.stringify(nrm));
const cap = await A.page.evaluate(()=>[levelRemaining({full:4},'2F','scattered'), levelRemaining({full:2},'2F','scattered'), levelRemaining({scattered:4},'1F','full'), levelRemaining({},'3F','partial'), canLevelFit({partial:3},'2F','full')]);
ok('mixed-type capacity (2F full4→0 scattered; full2→3; 1F 4 scattered→6 full; 3F no partial; 2F partial3→1 full)', JSON.stringify(cap)===JSON.stringify([0,3,6,0,true]), JSON.stringify(cap));
const dw = await A.page.evaluate(async()=>{ window.refreshWaveList=function(){}; window.saveWaves=function(){};
  window._orderData = window._orderData || {orders:[]}; window._waveData.waves=[{id:'WP',waveNo:'WP1',status:'pending',orders:[{id:'SO2',orderNo:'SO2'}]},{id:'WV',waveNo:'WV1',status:'done',orders:[]}];
  await deleteWave('WV1'); const a1=window.__alerts.slice(-1)[0]; await deleteWave('WP1'); return [a1, window._waveData.waves.map(w=>w.waveNo)]; });
const so2 = await admin(async d=>(await getDoc(doc(d,'salesOrders','SO2'))).data().status);
const wpGone = await admin(async d=>!(await getDoc(doc(d,'waves','WP'))).exists());
ok('deleteWave: done wave refused; pending wave deleted and order back to pending', dw[0].includes('待揀貨') && wpGone && so2==='pending', JSON.stringify(dw)+' '+so2);
const AD = await openAs('admin@t.com');
const opMig = await A.page.evaluate(async()=>{ try{ await migrateDataFormats(true); return 'ran'; }catch(e){ return e.message; } });
ok('migration refused for non-admin', opMig.includes('管理員'), opMig);
const dry = await AD.page.evaluate(async()=>migrateDataFormats(true));
const px0 = await admin(async d=>(await getDoc(doc(d,'pallets','PX'))).data());
ok('migration dry-run reports but does not write', dry.pallets.changed>=2 && dry.inventoryLogs.changed>=1 && px0.expDate==='2027/3/4', JSON.stringify(dry));
await AD.page.evaluate(async()=>migrateDataFormats(false));
const px1 = await admin(async d=>(await getDoc(doc(d,'pallets','PX'))).data());
const py1 = await admin(async d=>(await getDoc(doc(d,'pallets','PY'))).data());
const old1 = await admin(async d=>(await getDoc(doc(d,'inventoryLogs','OLD1'))).data());
ok('migration writes unified fields', px1.expiryDate==='2027-03-04' && px1.expDate==='2027-03-04' && px1.quantity===8 && py1.expiryDate==='2027-03-04' && typeof old1.timestamp==='string', JSON.stringify([px1.expiryDate,px1.quantity,py1.expiryDate,old1.timestamp]));
const dry2 = await AD.page.evaluate(async()=>migrateDataFormats(true));
ok('migration is idempotent (nothing left to change)', dry2.totalChanged===0, JSON.stringify(dry2));


const alloc = await A.page.evaluate(()=>{ try { const labels = smartAllocateLocations([{id:'t1',productName:'測試品',spec:'S1',company:'崇文',batchNo:'Q',expiryDate:'2027-05-01',quantity:100,perPallet:40,palletCount:3}], {strategy:'smart', zones:['A','B']}); return labels.map(l=>[l.quantity,l.locationId,l.palletType, l.id||l.palletNo]); } catch(e){ return 'ERR '+e.message; } });
ok('smart allocation runs with shared capacity (40+40+20, real locations, unique numbers)', Array.isArray(alloc) && alloc.length===3 && alloc.every(a=>a[1] && a[1]!=='OVERFLOW' && /^[IJK]-[A-H]-\d{2}-[123]F$/.test(a[1])) && new Set(alloc.map(a=>a[3])).size===3, JSON.stringify(alloc));


// ===== 第 4 步：手機版 =====
const MX = await openMobileAs('stranger@t.com');
const mxErr = await MX.page.evaluate(()=>document.getElementById('login-error').innerText);
ok('mobile: unregistered account denied', mxErr.includes('尚未開通') && !(await MX.page.evaluate(()=>!!window.currentUser)), mxErr);
const M = await openMobileAs('op2@t.com');
ok('mobile: operator logged in and pallets loaded', await M.page.evaluate(()=>window.currentUser && window.currentUser.role==='operator' && window.pallets.length>0));
const mp = await M.page.evaluate(async()=>{ openPage('picking'); await new Promise(r=>setTimeout(r,1200));
  const sel=document.getElementById('picking-wave-select'); const opts=[...sel.options].map(o=>o.value);
  sel.value='WM'; await loadPickingWave();
  const first = pickingItems.find(i=>!i.shortage); document.getElementById('picking-scan').value = first.palletId; await confirmPickingScan();
  return { opts, first: first.id, progress: document.getElementById('picking-progress').innerText }; });
const wm = await admin(async d=>(await getDoc(doc(d,'waves','WM'))).data());
ok('mobile: loads desktop wave from Firestore and saves scan progress', mp.opts.includes('WM') && wm.completedItems.includes(mp.first) && wm.status==='picking', JSON.stringify(mp)+' '+JSON.stringify(wm.completedItems));
const shared = await A.page.evaluate(async(first)=>{ const w=(await db.collection('waves').doc('WM').get()).data(); const list=buildWavePickingList(w, currentPallets()); return list.find(i=>i.id===first)?.completed; }, mp.first);
ok('desktop sees the same picking item as completed (shared list builder)', shared===true);
await M.page.evaluate(async()=>{ await completePickingWave(); });
ok('mobile: finish picking marks wave for desktop shipment (no stock deducted)', (await admin(async d=>(await getDoc(doc(d,'waves','WM'))).data().status))==='sorting' && await qty('PX')===8 && await qty('PY')===5);
const md = await M.page.evaluate(async()=>{ openPage('dispatch'); await new Promise(r=>setTimeout(r,1200));
  const sel=document.getElementById('dispatch-order-select'); sel.value='DO1'; await loadDispatchOrder();
  document.getElementById('dispatch-scan').value='PY'; await confirmDispatchScan(); const r1=document.getElementById('dispatch-scan-result').innerText;
  await new Promise(r=>setTimeout(r,500));
  document.getElementById('dispatch-scan').value='PX'; await confirmDispatchScan(); const r2=document.getElementById('dispatch-scan-result').innerText;
  await completeDispatchOrder(); return [r1,r2]; });
const pyAfter = await admin(async d=>(await getDoc(doc(d,'pallets','PY'))).data());
const do1 = await admin(async d=>(await getDoc(doc(d,'dispatchOrders','DO1'))).data());
ok('mobile dispatch: move then merge executed as transactions (PY at K-F-05-2F, 5+8=13, PX removed)', pyAfter.locationId==='K-F-05-2F' && pyAfter.quantity===13 && await qty('PX')===null, JSON.stringify(md)+' '+JSON.stringify([pyAfter.locationId,pyAfter.quantity]));
ok('mobile dispatch: order progress saved and completed', do1.completedOps.length===2 && do1.status==='completed', JSON.stringify(do1.completedOps)+do1.status);
const mlogs = await admin(async d=>(await getDocs(collection(d,'inventoryLogs'))).docs.map(x=>x.data()).filter(l=>String(l.note).includes('手機調度工單')));
ok('mobile dispatch wrote inventory logs with operator', mlogs.length===2 && mlogs.every(l=>l.operator && l.operator!=='system'), JSON.stringify(mlogs.map(l=>[l.type,l.operator])));

// T8 readonly & stranger
const R = await openAs('ro@t.com');
const rr = await tx(R.page,-1);
ok('readonly cannot change stock (rules)', rr.startsWith('ERR') && await qty('PA')===4, rr.slice(0,60));
const X = await openAs('stranger@t.com');
const xmsg = await X.page.evaluate(()=>document.getElementById('login-error').innerText);
ok('stranger denied at login', xmsg.includes('尚未開通') && !(await X.page.evaluate(()=>!!window.currentUser)), xmsg);

for (const [n,o] of [['A',A],['B',B],['R',R],['X',X],['AD',AD],['M',M],['MX',MX]]) { const e=o.errs.filter(m=>!/tailwind|Chart is not defined|Cannot redefine property: inventory|XLSX|JsBarcode/.test(m)); if(e.length) console.log('page errors',n,e.slice(0,5)); }
console.log(`pass ${pass} fail ${fail}`);
await browser.close(); await env.cleanup(); srv.close(); process.exit(fail?1:0);
