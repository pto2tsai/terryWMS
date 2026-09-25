import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, query, where, setDoc, updateDoc, deleteDoc, addDoc, collection, writeBatch, runTransaction, setLogLevel } from 'firebase/firestore';
import fs from 'fs';
setLogLevel('error');
const env = await initializeTestEnvironment({ projectId: 'demo-wms-rules', firestore: { rules: fs.readFileSync(new URL('../firestore.rules', import.meta.url),'utf8'), host:'127.0.0.1', port:8080 } });
await env.withSecurityRulesDisabled(async c => {
  const d = c.firestore();
  for (const [e, role, active] of [['admin@x.com','admin',true],['sup@x.com','supervisor',true],['op@x.com','operator',true],['fork@x.com','forklift',true],['ro@x.com','readonly',true],['off@x.com','admin',false],['noactive@x.com','operator',undefined]]) {
    const u = { email: e, role }; if (active !== undefined) u.active = active;
    await setDoc(doc(d,'users',e), u);
  }
  await setDoc(doc(d,'pallets','P1'), { quantity: 10 });
  await setDoc(doc(d,'inventoryLogs','L1'), { type:'in' });
  await setDoc(doc(d,'inboundOrders','O1'), { approvalStatus:'pending', status:'pending' });
  await setDoc(doc(d,'counters','IN-20260923'), { seq: 5 });
  await setDoc(doc(d,'erpInbox','E1'), { type:'sales_daily', sensitive:false, status:'pending' });
  await setDoc(doc(d,'erpInbox','E1','chunks','0000'), { i:0, data:'[]', sensitive:false });
  await setDoc(doc(d,'erpInbox','AR1'), { type:'ar_monthly', sensitive:true, status:'stored' });
  await setDoc(doc(d,'erpInbox','AR1','chunks','0000'), { i:0, data:'[]', sensitive:true });
});
const as = e => env.authenticatedContext(e.split('@')[0], { email: e }).firestore();
const anon = env.unauthenticatedContext().firestore();
let pass=0, fail=0;
async function t(name, p){ try{ await p; pass++; } catch(e){ fail++; console.log('FAIL', name, e.message.split('\n')[0]); } }
const A=as('admin@x.com'), S=as('sup@x.com'), O=as('op@x.com'), F=as('fork@x.com'), R=as('ro@x.com'), OFF=as('off@x.com'), X=as('stranger@x.com'), N=as('noactive@x.com'), MIX=as('Op@X.com');
await t('anon cannot read pallets', assertFails(getDoc(doc(anon,'pallets','P1'))));
await t('stranger cannot read pallets', assertFails(getDoc(doc(X,'pallets','P1'))));
await t('stranger can get own (missing) user doc', assertSucceeds(getDoc(doc(X,'users','stranger@x.com'))));
await t('stranger cannot list users', assertFails(getDocs(collection(X,'users'))));
await t('stranger cannot self-create admin', assertFails(setDoc(doc(X,'users','stranger@x.com'),{role:'admin'})));
await t('inactive cannot read', assertFails(getDoc(doc(OFF,'pallets','P1'))));
await t('inactive can get own doc', assertSucceeds(getDoc(doc(OFF,'users','off@x.com'))));
await t('missing active field = active', assertSucceeds(getDoc(doc(N,'pallets','P1'))));
await t('mixed-case email token works', assertSucceeds(getDoc(doc(MIX,'pallets','P1'))));
await t('readonly can read', assertSucceeds(getDoc(doc(R,'pallets','P1'))));
await t('readonly cannot write pallet', assertFails(updateDoc(doc(R,'pallets','P1'),{quantity:1})));
await t('forklift can update pallet', assertSucceeds(updateDoc(doc(F,'pallets','P1'),{quantity:9})));
await t('operator can add pallet', assertSucceeds(addDoc(collection(O,'pallets'),{quantity:1})));
await t('operator can add log', assertSucceeds(addDoc(collection(O,'inventoryLogs'),{type:'out'})));
await t('operator cannot edit log', assertFails(updateDoc(doc(O,'inventoryLogs','L1'),{type:'x'})));
await t('operator cannot delete log', assertFails(deleteDoc(doc(O,'inventoryLogs','L1'))));
await t('admin can delete log', assertSucceeds(deleteDoc(doc(A,'inventoryLogs','L1'))));
await t('operator cannot approve', assertFails(updateDoc(doc(O,'inboundOrders','O1'),{approvalStatus:'approved'})));
await t('operator can update other fields', assertSucceeds(updateDoc(doc(O,'inboundOrders','O1'),{status:'completed'})));
await t('operator cannot create pre-approved', assertFails(addDoc(collection(O,'inboundOrders'),{approvalStatus:'approved'})));
await t('operator can create pending', assertSucceeds(addDoc(collection(O,'inboundOrders'),{approvalStatus:'pending'})));
await t('supervisor can approve', assertSucceeds(updateDoc(doc(S,'inboundOrders','O1'),{approvalStatus:'approved'})));
await t('operator cannot edit users', assertFails(updateDoc(doc(O,'users','ro@x.com'),{role:'admin'})));
await t('operator cannot promote self', assertFails(updateDoc(doc(O,'users','op@x.com'),{role:'admin'})));
await t('operator can update own lastLogin', assertSucceeds(updateDoc(doc(O,'users','op@x.com'),{lastLogin:'2026'})));
await t('operator can list users', assertSucceeds(getDocs(collection(O,'users'))));
await t('admin can create user', assertSucceeds(setDoc(doc(A,'users','new@x.com'),{role:'operator'})));
await t('operator cannot edit settings', assertFails(setDoc(doc(O,'settings','rentalSettings'),{a:1})));
await t('supervisor can edit settings', assertSucceeds(setDoc(doc(S,'settings','rentalSettings'),{a:1})));
await t('operator cannot read backups', assertFails(getDoc(doc(O,'backups','B1'))));
await t('admin can write backups', assertSucceeds(setDoc(doc(A,'backups','B1'),{a:1})));
await t('operator can bump counter', assertSucceeds(setDoc(doc(O,'counters','IN-20260923'),{seq:6})));
await t('operator cannot lower counter', assertFails(setDoc(doc(O,'counters','IN-20260923'),{seq:1})));
await t('operator can create counter', assertSucceeds(setDoc(doc(O,'counters','BI-20260923'),{seq:3})));
await t('operator cannot write unknown coll', assertFails(setDoc(doc(O,'misc','a'),{a:1})));
await t('admin can write unknown coll', assertSucceeds(setDoc(doc(A,'misc','a'),{a:1})));
await t('readonly cannot write consignment', assertFails(addDoc(collection(R,'consignments'),{a:1})));
// 大量寫入（批次 / 交易）不會超過規則的文件讀取上限
await env.withSecurityRulesDisabled(async c => { const d=c.firestore();
  for (let i=0;i<60;i++) await setDoc(doc(d,'pallets','BP'+i),{quantity:5}); });
const O2 = env.authenticatedContext('op',{email:'op@x.com'}).firestore();
const R2 = env.authenticatedContext('ro',{email:'ro@x.com'}).firestore();
const b = writeBatch(O2); for (let i=0;i<60;i++){ b.update(doc(O2,'pallets','BP'+i),{quantity:4}); b.set(doc(collection(O2,'inventoryLogs')),{t:1}); b.set(doc(collection(O2,'pallets')),{quantity:1}); }
try { await assertSucceeds(b.commit()); pass++; } catch(e){ fail++; console.log('FAIL operator big batch', e.message.slice(0,300)); }
try { await assertSucceeds(runTransaction(O2, async tx=>{ for (let i=0;i<30;i++){ await tx.get(doc(O2,'pallets','BP'+i)); } for (let i=0;i<30;i++) tx.update(doc(O2,'pallets','BP'+i),{quantity:3}); })); pass++; } catch(e){ fail++; console.log('FAIL operator 30-pallet tx', e.message.slice(0,300)); }
try { await assertFails(runTransaction(R2, async tx=>{ await tx.get(doc(R2,'pallets','P1')); tx.update(doc(R2,'pallets','P1'),{quantity:0}); })); pass++; } catch(e){ fail++; console.log('FAIL readonly tx', e.message.slice(0,200)); }
await t('negative pallet quantity rejected', assertFails(updateDoc(doc(O,'pallets','P1'),{quantity:-1})));
await t('string quantity still allowed (legacy imports)', assertSucceeds(updateDoc(doc(O,'pallets','P1'),{quantity:'3'})));
await t('negative external quantity rejected', assertFails(addDoc(collection(O,'externalStock'),{quantity:-5})));
await t('log with own operatorEmail ok', assertSucceeds(addDoc(collection(O,'inventoryLogs'),{type:'out',operatorEmail:'op@x.com'})));
await t('log impersonating another user rejected', assertFails(addDoc(collection(O,'inventoryLogs'),{type:'out',operatorEmail:'admin@x.com'})));
await t('mixed-case token email matches lowercase operatorEmail', assertSucceeds(addDoc(collection(MIX,'inventoryLogs'),{type:'out',operatorEmail:'op@x.com'})));
await t('operator can record today stock snapshot', assertSucceeds(setDoc(doc(O,'stockSnapshots','2026-01-01'),{date:'2026-01-01',pallets:{'崇文':3}})));
await t('operator cannot change a past stock snapshot', assertFails(setDoc(doc(O,'stockSnapshots','2026-01-01'),{date:'2026-01-01',pallets:{'崇文':99}})));
await t('readonly cannot record stock snapshot', assertFails(setDoc(doc(R,'stockSnapshots','2026-01-02'),{date:'2026-01-02',pallets:{}})));
// 鼎新報表收件匣
await t('operator can read normal ERP report', assertSucceeds(getDoc(doc(O,'erpInbox','E1'))));
await t('readonly can read normal ERP report (board)', assertSucceeds(getDoc(doc(R,'erpInbox','E1'))));
await t('operator can read normal ERP chunks', assertSucceeds(getDoc(doc(O,'erpInbox','E1','chunks','0000'))));
await t('operator cannot read AR report', assertFails(getDoc(doc(O,'erpInbox','AR1'))));
await t('operator cannot read AR chunks', assertFails(getDoc(doc(O,'erpInbox','AR1','chunks','0000'))));
await t('supervisor can read AR report', assertSucceeds(getDoc(doc(S,'erpInbox','AR1'))));
await t('supervisor can read AR chunks', assertSucceeds(getDoc(doc(S,'erpInbox','AR1','chunks','0000'))));
await t('operator can list only non-sensitive', assertSucceeds(getDocs(query(collection(O,'erpInbox'), where('sensitive','==',false)))));
await t('operator cannot list everything', assertFails(getDocs(collection(O,'erpInbox'))));
await t('nobody can create ERP report from app', assertFails(setDoc(doc(A,'erpInbox','X1'),{ type:'sales_daily', sensitive:false })));
await t('operator can claim report', assertSucceeds(updateDoc(doc(O,'erpInbox','E1'),{ status:'processing', processingBy:'op@x.com', processingAt:'2026' })));
await t('operator cannot change report contents', assertFails(updateDoc(doc(O,'erpInbox','E1'),{ type:'ar_monthly' })));
await t('operator cannot make report non-sensitive', assertFails(updateDoc(doc(O,'erpInbox','AR1'),{ status:'done' })));
await t('readonly cannot claim report', assertFails(updateDoc(doc(R,'erpInbox','E1'),{ status:'done' })));
await t('operator cannot write chunks', assertFails(setDoc(doc(O,'erpInbox','E1','chunks','0001'),{ data:'[]', sensitive:false })));
await t('operator cannot delete report', assertFails(deleteDoc(doc(O,'erpInbox','E1'))));

console.log(`pass ${pass} fail ${fail}`);
await env.cleanup(); process.exit(fail?1:0);
