import { doc, setDoc } from './harness.mjs';
export const USERS = { admin: 'admin@t.com', op: 'op@t.com', op2: 'op2@t.com', sup: 'sup@t.com' };
export async function baseSeed(d) {
  await setDoc(doc(d, 'users', 'admin@t.com'), { email: 'admin@t.com', name: '管理員', role: 'admin', active: true });
  await setDoc(doc(d, 'users', 'op@t.com'), { email: 'op@t.com', name: '小王', role: 'operator', active: true });
  await setDoc(doc(d, 'users', 'op2@t.com'), { email: 'op2@t.com', name: '小李', role: 'operator', active: true });
  await setDoc(doc(d, 'users', 'sup@t.com'), { email: 'sup@t.com', name: '主管', role: 'supervisor', active: true });
  await setDoc(doc(d, 'productMaster', 'PM1'), { code: 'P001', name: '白蝦', spec: '50/60', palletCapacity: 40, shelfLife: 24, company: '崇文' });
  await setDoc(doc(d, 'productMaster', 'PM2'), { code: 'P002', name: '透抽', spec: 'L', palletCapacity: 30, shelfLife: 24, company: '崇文' });
  await setDoc(doc(d, 'warehouses', 'W1'), { code: 'EXT-TP', name: '台北外倉', company: '崇文', type: 'external', active: true });
}
