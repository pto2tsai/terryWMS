// 在 Node 裡載入 Google 雲端自動程式（tools/erp-sync/Code.gs）的共用函式，
// 並用它組出的內容寫進測試資料庫，模擬「Google 自動程式把鼎新報表送進 WMS」
import fs from 'fs'; import vm from 'vm'; import path from 'path'; import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
const code = fs.readFileSync(path.join(here, '..', '..', 'tools', 'erp-sync', 'Code.gs'), 'utf8');

export function loadGs() {
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx;
}

// 把一份報表（檔名＋表格）送進測試資料庫；回傳收件編號與 HTTP 狀態
// folder：放在哪個子資料夾；codeMap：檔名代碼對照表（跟 Code.gs 的 CONFIG.CODE_MAP 一樣）
export async function pushReport(fileName, rows, { projectId = 'terrywms-2345f', fileId = 'FILE' + Math.random().toString(36).slice(2, 12), modified = new Date().toISOString(), folder = '', codeMap = {} } = {}) {
  const gs = loadGs();
  const norm = gs.normalizeRows(rows, d => d.toISOString().slice(0, 10));
  const idr = gs.identifyReport(fileName, folder, norm, codeMap);
  if (!idr.report) throw new Error('看不出報表種類：' + fileName);
  const built = gs.buildInboxWrites(projectId, idr.report, { id: fileId, name: fileName, modified }, norm, new Date().toISOString(), idr.by);
  const res = await fetch(`http://127.0.0.1:8080/v1/projects/${projectId}/databases/(default)/documents:commit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ writes: built.writes })
  });
  return { id: built.id, status: res.status, body: await res.text(), fileId, modified };
}
