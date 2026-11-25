const APP = {
  name: 'PRINT LAB',
  adminEmail: 'usc1125520@g2.usc.edu.tw',
  rooms: ['J103', 'J101A', 'J101B', 'J104（系辦教室）', '其他'],
  statuses: ['待審核', '待製作', '製作中', '待取件', '已完成', '退件'],
  sheets: {
    Requests: ['id','createdAt','updatedAt','requesterEmail','requesterName','room','title','category','size','quantity','neededBy','deadline','description','driveUrl','referenceUrl','status','reviewNote','reviewedBy','reviewedAt'],
    ReviewLogs: ['id','requestId','at','reviewer','action','note'],
    Users: ['email','name','role','active'],
    Settings: ['key','value'],
    Notifications: ['id','requestId','at','recipient','kind','sent']
  }
};

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('PRINT LAB｜印刷輸出管理')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Run once from the Apps Script editor after creating a private spreadsheet. */
function initializeDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('請先在 PRINT LAB 資料庫試算表中開啟 Apps Script，再執行初始化。');
  PropertiesService.getScriptProperties().setProperty('DATABASE_ID', ss.getId());
  Object.entries(APP.sheets).forEach(([name, headers]) => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    if (sheet.getLastRow() === 0) sheet.appendRow(headers);
    else {
      const currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
      const missingHeaders = headers.filter(header => !currentHeaders.includes(header));
      if (missingHeaders.length) sheet.getRange(1, currentHeaders.length + 1, 1, missingHeaders.length).setValues([missingHeaders]);
    }
    sheet.setFrozenRows(1);
  });
  const users = ss.getSheetByName('Users');
  if (users.getLastRow() < 2) users.appendRow([APP.adminEmail, 'PRINT LAB 管理員', 'admin', true]);
  const settings = ss.getSheetByName('Settings');
  if (settings.getLastRow() < 2) {
    settings.appendRow(['rooms', JSON.stringify(APP.rooms)]);
    settings.appendRow(['statuses', JSON.stringify(APP.statuses)]);
  }
  return '資料庫已初始化：' + ss.getUrl();
}

function getDatabase_() {
  const id = PropertiesService.getScriptProperties().getProperty('DATABASE_ID');
  if (!id) throw new Error('管理員尚未設定資料庫，請執行 initializeDatabase()。');
  return SpreadsheetApp.openById(id);
}

function currentUser_() {
  const email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!email) throw new Error('無法確認登入帳號。請使用 Google 帳號重新開啟，並確認 Apps Script 網頁應用程式存取設定。');
  const admin = email === APP.adminEmail;
  return { email, isAdmin: admin };
}

function requireAdmin_() {
  const user = currentUser_();
  if (!user.isAdmin) throw new Error('只有管理員可以執行此操作。');
  return user;
}

function getBootstrap() {
  const user = currentUser_();
  const requests = readRows_('Requests');
  const own = user.isAdmin ? requests : requests.filter(r => String(r.requesterEmail).toLowerCase() === user.email);
  return { user, rooms: APP.rooms, statuses: APP.statuses, requests: own, isAdmin: user.isAdmin };
}

function listRequests(filters) {
  const user = currentUser_();
  const f = filters || {};
  let rows = readRows_('Requests');
  if (!user.isAdmin) rows = rows.filter(r => String(r.requesterEmail).toLowerCase() === user.email);
  if (f.room) rows = rows.filter(r => r.room === f.room);
  if (f.status) rows = rows.filter(r => r.status === f.status);
  if (f.query) {
    const q = String(f.query).toLowerCase();
    rows = rows.filter(r => [r.id,r.title,r.room,r.requesterName,r.requesterEmail].join(' ').toLowerCase().includes(q));
  }
  return rows.sort((a,b) => String(a.deadline).localeCompare(String(b.deadline)));
}

function createRequest(payload) {
  const user = currentUser_();
  const p = validateRequest_(payload);
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const now = new Date().toISOString();
    const id = 'PL-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyMMdd') + '-' + Utilities.getUuid().slice(0,5).toUpperCase();
    appendObject_('Requests', { id, createdAt:now, updatedAt:now, requesterEmail:user.email, requesterName:safe_(p.requesterName,80), room:p.room, title:safe_(p.title,120), category:safe_(p.category,60), size:safe_(p.size,80), quantity:p.quantity, neededBy:p.neededBy, deadline:p.deadline, description:safe_(p.description,1000), driveUrl:p.driveUrl, referenceUrl:p.referenceUrl, status:'待審核', reviewNote:'', reviewedBy:'', reviewedAt:'' });
    logReview_(id, user.email, '提交需求', '');
    return { ok:true, id };
  } finally { lock.releaseLock(); }
}

function reviewRequest(payload) {
  const admin = requireAdmin_();
  const p = payload || {};
  const action = String(p.action || '');
  if (!['approve','reject','status'].includes(action)) throw new Error('無效的審核動作。');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sheet = getDatabase_().getSheetByName('Requests');
    const rows = sheet.getDataRange().getValues();
    const headers = rows[0]; const idCol = headers.indexOf('id');
    const idx = rows.findIndex((r,i) => i > 0 && String(r[idCol]) === String(p.id));
    if (idx < 1) throw new Error('找不到這筆需求。');
    const row = rows[idx]; const obj = {}; headers.forEach((h,i) => obj[h] = row[i]);
    const next = action === 'approve' ? '待製作' : action === 'reject' ? '退件' : String(p.status || '');
    if (!APP.statuses.includes(next)) throw new Error('無效的狀態。');
    const note = safe_(p.note || '', 500);
    obj.status = next; obj.reviewNote = note; obj.reviewedBy = admin.email; obj.reviewedAt = new Date().toISOString(); obj.updatedAt = obj.reviewedAt;
    writeObjectAt_('Requests', idx + 1, obj);
    logReview_(obj.id, admin.email, action === 'approve' ? '核准' : action === 'reject' ? '退件' : '更新狀態', note);
    return { ok:true };
  } finally { lock.releaseLock(); }
}

function getReviewHistory(requestId) {
  const user = currentUser_();
  const request = readRows_('Requests').find(r => String(r.id) === String(requestId));
  if (!request) throw new Error('找不到這筆需求。');
  if (!user.isAdmin && String(request.requesterEmail).toLowerCase() !== user.email) throw new Error('沒有權限查看此紀錄。');
  return readRows_('ReviewLogs').filter(r => String(r.requestId) === String(requestId)).sort((a,b) => String(a.at).localeCompare(String(b.at)));
}

function validateRequest_(p) {
  p = p || {};
  const room = String(p.room || '');
  const title = String(p.title || '').trim();
  const quantity = Number(p.quantity);
  if (!APP.rooms.includes(room)) throw new Error('請選擇有效的教室。');
  if (!title) throw new Error('請填寫需求名稱。');
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) throw new Error('數量需為 1 至 10,000 的整數。');
  const driveUrl = String(p.driveUrl || '').trim();
  if (driveUrl && !/^https:\/\/(drive|docs)\.google\.com\//.test(driveUrl)) throw new Error('檔案連結請使用 Google Drive 或 Google 文件網址。');
  const referenceUrl = String(p.referenceUrl || '').trim();
  if (referenceUrl && !/^https:\/\/(drive|docs)\.google\.com\//.test(referenceUrl)) throw new Error('參考範例請使用 Google Drive 或 Google 文件網址。');
  const neededBy = String(p.neededBy || ''); const deadline = String(p.deadline || '');
  if (!neededBy || !deadline) throw new Error('請填寫需求日期與交件期限。');
  return { ...p, room, title, quantity, neededBy, deadline, driveUrl, referenceUrl };
}

function readRows_(name) {
  const sheet = getDatabase_().getSheetByName(name);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getValues(); const headers = values.shift();
  return values.filter(row => row.some(v => v !== '')).map(row => {
    const obj = {}; headers.forEach((h,i) => obj[h] = row[i] instanceof Date ? Utilities.formatDate(row[i], Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss") : row[i]); return obj;
  });
}

function appendObject_(name, obj) {
  const sheet = getDatabase_().getSheetByName(name); const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  sheet.appendRow(headers.map(h => obj[h] === undefined ? '' : obj[h]));
}
function writeObjectAt_(name, rowNumber, obj) {
  const sheet = getDatabase_().getSheetByName(name); const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([headers.map(h => obj[h] === undefined ? '' : obj[h])]);
}
function logReview_(requestId, reviewer, action, note) {
  appendObject_('ReviewLogs', { id:Utilities.getUuid(), requestId, at:new Date().toISOString(), reviewer, action, note });
}
function safe_(value, max) { return String(value || '').trim().replace(/[<>]/g, '').slice(0, max); }
