const APP = {
  name: 'PRINT LAB',
  adminEmail: 'usc1125520@g2.usc.edu.tw',
  rooms: ['J103', 'J101A', 'J101B', 'J104（系辦教室）', '其他'],
  statuses: ['待審核', '待製作', '製作中', '待取件', '已完成', '退件'],
  sheetNames: {
    Requests: '印務需求', ReviewLogs: '審核紀錄', ArtworkFiles: '完稿檔案',
    Users: '使用者', Settings: '系統設定', Notifications: '通知紀錄'
  },
  sheets: {
    Requests: ['id','createdAt','updatedAt','requesterEmail','requesterName','room','title','category','size','quantity','neededBy','deadline','description','driveUrl','referenceUrl','productionArtworkUrl','status','reviewNote','reviewedBy','reviewedAt'],
    ReviewLogs: ['id','requestId','at','reviewer','action','note'],
    ArtworkFiles: ['id','requestId','fileId','fileName','mimeType','size','version','uploadedBy','uploadedAt','driveUrl'],
    Users: ['email','name','role','active'],
    Settings: ['key','value'],
    Notifications: ['id','requestId','at','recipient','kind','sent']
  }
};

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('數遊系印務設計需求系統')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Run once from the Apps Script editor after creating a private spreadsheet. */
function initializeDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('請先在 PRINT LAB 資料庫試算表中開啟 Apps Script，再執行初始化。');
  PropertiesService.getScriptProperties().setProperty('DATABASE_ID', ss.getId());
  Object.entries(APP.sheets).forEach(([key, headers]) => {
    const name = APP.sheetNames[key];
    let sheet = ss.getSheetByName(name);
    const legacySheet = ss.getSheetByName(key);
    if (!sheet && legacySheet) { legacySheet.setName(name); sheet = legacySheet; }
    if (!sheet) sheet = ss.insertSheet(name);
    if (sheet.getLastRow() === 0) sheet.appendRow(headers);
    else {
      const currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
      const missingHeaders = headers.filter(header => !currentHeaders.includes(header));
      if (missingHeaders.length) sheet.getRange(1, currentHeaders.length + 1, 1, missingHeaders.length).setValues([missingHeaders]);
    }
    sheet.setFrozenRows(1);
  });
  const users = ss.getSheetByName(APP.sheetNames.Users);
  if (users.getLastRow() < 2) users.appendRow([APP.adminEmail, 'PRINT LAB 管理員', 'admin', true]);
  const settings = ss.getSheetByName(APP.sheetNames.Settings);
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

function getSheet_(key) {
  const name = APP.sheetNames[key];
  if (!name) throw new Error('未知的資料分類：' + key);
  const sheet = getDatabase_().getSheetByName(name);
  if (!sheet) throw new Error('找不到工作表「' + name + '」，請先執行 initializeDatabase()。');
  return sheet;
}

function isActiveUser_(email, roles) {
  if (!email) return false;
  const accepted = roles.map(role => String(role).trim().toLowerCase());
  return readRows_('Users').some(row => {
    const rowEmail = String(row.email || '').trim().toLowerCase();
    const role = String(row.role || '').trim().toLowerCase();
    const active = row.active === true || String(row.active || '').trim().toUpperCase() === 'TRUE';
    return active && rowEmail === email && accepted.includes(role);
  });
}
function adminTokenKey_(token) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(token || ''));
  return 'PRINTLAB_ADMIN_' + bytes.map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
}
function adminSessionEmail_(token) {
  if (!token) return '';
  const email = CacheService.getScriptCache().get(adminTokenKey_(token));
  return email && isActiveUser_(email, ['admin','管理員','designer','print_staff','設計人員','印務人員']) ? email : '';
}

  function requestAdminLoginCode(email) {
email = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('請輸入有效的 Email。');
  const cache = CacheService.getScriptCache(), rateKey = 'PRINTLAB_ADMIN_RATE_' + adminTokenKey_(email);
  if (cache.get(rateKey)) return { ok:true };
  cache.put(rateKey, '1', 60);
  if (!isActiveUser_(email, ['admin','管理員','designer','print_staff','設計人員','印務人員'])) return { ok:true };
  const seed = Utilities.getUuid().replace(/-/g, '');
  const code = String(parseInt(seed.slice(0, 8), 16) % 900000 + 100000);
  cache.put('PRINTLAB_ADMIN_OTP_' + adminTokenKey_(email), code, 300);
  MailApp.sendEmail(email, '數遊系印務設計需求系統｜登入驗證碼', '登入驗證碼：' + code + '\n\n5 分鐘內有效。若非本人操作請忽略此信。');
  return { ok:true };
}
function verifyAdminLoginCode(email, code) {
  email = String(email || '').trim().toLowerCase(); code = String(code || '').trim();
  const cache = CacheService.getScriptCache(), key = adminTokenKey_(email);
  const stored = cache.get('PRINTLAB_ADMIN_OTP_' + key), triesKey = 'PRINTLAB_ADMIN_TRIES_' + key, tries = Number(cache.get(triesKey) || 0);
  if (!stored || tries >= 5 || stored !== code || !isActiveUser_(email, ['admin','管理員','designer','print_staff','設計人員','印務人員'])) {
    cache.put(triesKey, String(tries + 1), 300); throw new Error('驗證碼錯誤或已逾期，請重新取得。');
  }
  cache.remove('PRINTLAB_ADMIN_OTP_' + key); cache.remove(triesKey);
  const token = Utilities.getUuid() + Utilities.getUuid();
  cache.put(adminTokenKey_(token), email, 21600);
  return { ok:true, token, email };
}
function logoutAdmin(token) { if (token) CacheService.getScriptCache().remove(adminTokenKey_(token)); return { ok:true }; }
function currentUser_(token) {
  const email = String(adminSessionEmail_(token) || Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  return { email, isAdmin:isActiveUser_(email, ['admin','管理員']), isPrintStaff:isActiveUser_(email, ['designer','print_staff','設計人員','印務人員']) };
}
function requireAdmin_(token) {
  const user = currentUser_(token);
  if (!user.isAdmin) throw new Error('請先以已啟用的管理員帳號登入。');
  return user;
}

function requirePrintStaff_(adminToken) {
  const user = currentUser_(adminToken);
  const isStaff = readRows_('Users').some(row => {
    const email = String(row.email || '').trim().toLowerCase();
    const role = String(row.role || '').trim().toLowerCase();
    const active = row.active === true || String(row.active || '').trim().toUpperCase() === 'TRUE';
    return active && email === user.email && ['designer', 'print_staff', '設計人員', '印務人員'].includes(role);
  });
  if (!isStaff && !user.isAdmin) throw new Error('只有已啟用的印務／設計人員可以上傳完稿。');
  return user;
}

function getBootstrap(adminToken) {
  const user = currentUser_(adminToken);
  const requests = readRows_('Requests');
  return { user, rooms: getRooms_(), statuses: APP.statuses, requests, isAdmin: user.isAdmin };
}

function listRequests(filters) {
  const user = currentUser_();
  const f = filters || {};
  let rows = readRows_('Requests');
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
  const requesterEmail = user.email || p.requesterEmail;
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    saveRoom_(p.room);
    const now = new Date().toISOString();
    const id = 'PL-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyMMdd') + '-' + Utilities.getUuid().slice(0,5).toUpperCase();
    appendObject_('Requests', { id, createdAt:now, updatedAt:now, requesterEmail, requesterName:safe_(p.requesterName,80), room:p.room, title:safe_(p.title,120), category:safe_(p.category,60), size:safe_(p.size,80), quantity:p.quantity, neededBy:p.neededBy, deadline:p.deadline, description:safe_(p.description,1000), driveUrl:p.driveUrl, referenceUrl:p.referenceUrl, productionArtworkUrl:'', status:'待審核', reviewNote:'', reviewedBy:'', reviewedAt:'' });
    logReview_(id, requesterEmail, '提交需求', '');
    return { ok:true, id };
  } finally { lock.releaseLock(); }
}

function reviewRequest(payload) {
  const p = payload || {};
  const admin = requireAdmin_(p.adminToken);
  const action = String(p.action || '');
  if (!['approve','reject','status'].includes(action)) throw new Error('無效的審核動作。');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sheet = getSheet_('Requests');
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

function getReviewHistory(requestId, adminToken) {
  const user = currentUser_(adminToken);
  const request = readRows_('Requests').find(r => String(r.id) === String(requestId));
  if (!request) throw new Error('找不到這筆需求。');
  if (!user.isAdmin && !user.isPrintStaff && String(request.requesterEmail).toLowerCase() !== user.email) throw new Error('沒有權限查看此紀錄。');
  return readRows_('ReviewLogs').filter(r => String(r.requestId) === String(requestId)).sort((a,b) => String(a.at).localeCompare(String(b.at)));
}

/** Save the final artwork link added by print staff after a request is submitted. */
function saveProductionArtwork(payload) {
  const p = payload || {};
  const admin = requireAdmin_(p.adminToken);
  const url = String(p.url || '').trim();
  if (url && !/^https:\/\/(drive|docs)\.google\.com\//.test(url)) throw new Error('完稿連結請使用 Google Drive 或 Google 文件網址。');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sheet = getSheet_('Requests');
    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(String);
    const idCol = headers.indexOf('id');
    const linkCol = headers.indexOf('productionArtworkUrl');
    if (linkCol < 0) {
      const newCol = headers.length + 1;
      sheet.getRange(1, newCol).setValue('productionArtworkUrl');
      headers.push('productionArtworkUrl');
    }
    const rowIndex = values.findIndex((row, i) => i > 0 && String(row[idCol]) === String(p.id));
    if (rowIndex < 1) throw new Error('找不到這筆需求。');
    sheet.getRange(rowIndex + 1, headers.indexOf('productionArtworkUrl') + 1).setValue(url);
    const updatedCol = headers.indexOf('updatedAt');
    if (updatedCol >= 0) sheet.getRange(rowIndex + 1, updatedCol + 1).setValue(new Date().toISOString());
    logReview_(String(p.id), admin.email, url ? '印務人員上傳完稿' : '移除印務人員完稿連結', '');
    return { ok:true };
  } finally { lock.releaseLock(); }
}

/** Upload a new artwork version. Active print/design staff can edit; requester and admin can view. */
/** Save a Drive link from an enabled print/design staff member or authenticated admin. */
function savePrintStaffArtworkLink(payload) {
  const p = payload || {}, user = currentUser_(p.adminToken);
  const isStaff = isActiveUser_(user.email, ['designer','print_staff','設計人員','印務人員']);
  if (!isStaff && !user.isAdmin) throw new Error('只有已啟用的印務／設計人員或管理員可以新增完稿連結。');
  const requestId = safe_(p.requestId, 100), url = String(p.url || '').trim();
  if (!requestId || !url) throw new Error('請填寫完稿連結。');
  if (!(url.startsWith('https://drive.google.com/') || url.startsWith('https://docs.google.com/'))) throw new Error('完稿連結請使用 Google Drive 或 Google 文件網址。');
  const sheet = getSheet_('Requests'), values = sheet.getDataRange().getValues(), headers = values[0].map(String);
  const idCol = headers.indexOf('id'), linkCol = headers.indexOf('productionArtworkUrl');
  const rowIndex = values.findIndex((row, i) => i > 0 && String(row[idCol]) === requestId);
  if (rowIndex < 1) throw new Error('找不到這筆需求。');
  if (linkCol < 0) throw new Error('找不到完稿連結欄位，請先初始化資料表。');
  const now = new Date().toISOString();
  sheet.getRange(rowIndex + 1, linkCol + 1).setValue(url);
  const updatedCol = headers.indexOf('updatedAt');
  if (updatedCol >= 0) sheet.getRange(rowIndex + 1, updatedCol + 1).setValue(now);
  logReview_(requestId, user.email, '印務人員新增完稿連結', '');
  return { ok:true, url };
}

function uploadProductionArtwork(form) {
  const user = requirePrintStaff_(form && form.adminToken);
  const requestId = safe_(form && form.requestId, 100);
  const blob = form && form.artworkFile;
  if (!requestId || !blob || !blob.getBytes) throw new Error('請選擇完稿檔案。');
  const bytes = blob.getBytes();
  if (!bytes.length || bytes.length > 15 * 1024 * 1024) throw new Error('檔案大小需介於 1 byte 至 15 MB。');
  const originalName = safe_(blob.getName() || 'artwork', 140);
  const extension = (originalName.match(/\.([a-z0-9]{1,8})$/i) || [,''])[1].toLowerCase();
  const allowed = ['pdf','png','jpg','jpeg','svg','ai','psd'];
  if (!allowed.includes(extension)) throw new Error('目前接受 PDF、PNG、JPG、SVG、AI、PSD 檔案。');
  const request = readRows_('Requests').find(row => String(row.id) === requestId);
  if (!request) throw new Error('找不到這筆需求。');

  const props = PropertiesService.getUserProperties();
  let folder;
  const folderId = props.getProperty('PRINT_LAB_ARTWORK_FOLDER_ID');
  if (folderId) { try { folder = DriveApp.getFolderById(folderId); } catch (e) {} }
  if (!folder) {
    folder = DriveApp.createFolder('PRINT LAB 完稿上傳');
    props.setProperty('PRINT_LAB_ARTWORK_FOLDER_ID', folder.getId());
  }
  const version = readRows_('ArtworkFiles').filter(row => String(row.requestId) === requestId).length + 1;
  const fileName = `${requestId}_v${version}_${originalName}`;
  const file = folder.createFile(blob.setName(fileName));
  const adminEmails = readRows_('Users').filter(row => {
    const role = String(row.role || '').trim().toLowerCase();
    const active = row.active === true || String(row.active || '').trim().toUpperCase() === 'TRUE';
    return active && ['admin','管理員'].includes(role);
  }).map(row => String(row.email || '').trim().toLowerCase());
  const recipients = [...new Set([String(request.requesterEmail || '').trim().toLowerCase(), ...adminEmails].filter(email => email && email !== user.email))];
  const shareWarnings = [];
  recipients.forEach(email => { try { file.addViewer(email); } catch (e) { shareWarnings.push(email); } });
  const staffEditors = [...new Set(readRows_('Users')
    .filter(row => {
      const role = String(row.role || '').trim().toLowerCase();
      const active = row.active === true || String(row.active || '').trim().toUpperCase() === 'TRUE';
      return active && ['designer', 'print_staff', '設計人員', '印務人員'].includes(role);
    })
    .map(row => String(row.email || '').trim().toLowerCase())
    .filter(email => email && email !== user.email && email !== APP.adminEmail && !recipients.includes(email)))];
  staffEditors.forEach(email => { try { file.addEditor(email); } catch (e) { shareWarnings.push(email); } });

  const now = new Date().toISOString();
  appendObject_('ArtworkFiles', { id:Utilities.getUuid(), requestId, fileId:file.getId(), fileName, mimeType:blob.getContentType(), size:bytes.length, version, uploadedBy:user.email, uploadedAt:now, driveUrl:file.getUrl() });
  const requestSheet = getSheet_('Requests');
  const headers = requestSheet.getRange(1, 1, 1, requestSheet.getLastColumn()).getValues()[0].map(String);
  const rowNumber = requestSheet.getDataRange().getValues().findIndex((row, index) => index > 0 && String(row[headers.indexOf('id')]) === requestId) + 1;
  if (rowNumber > 1) {
    requestSheet.getRange(rowNumber, headers.indexOf('productionArtworkUrl') + 1).setValue(file.getUrl());
    requestSheet.getRange(rowNumber, headers.indexOf('updatedAt') + 1).setValue(now);
  }
  logReview_(requestId, user.email, '印務人員上傳完稿 v' + version, shareWarnings.length ? '檔案分享未能自動完成：' + shareWarnings.join(', ') : '');
  return { ok:true, fileName, version, shareWarnings };
}

function validateRequest_(p) {
  p = p || {};
  const room = safe_(p.room || '', 80);
  const title = String(p.title || '').trim();
  const quantity = Number(p.quantity);
  if (!room || room === '__add__') throw new Error('請選擇或新增使用地點。');
  if (!title) throw new Error('請填寫需求名稱。');
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) throw new Error('數量需為 1 至 10,000 的整數。');
  const driveUrl = String(p.driveUrl || '').trim();
  if (driveUrl && !/^https:\/\/(drive|docs)\.google\.com\//.test(driveUrl)) throw new Error('檔案連結請使用 Google Drive 或 Google 文件網址。');
  const referenceUrl = String(p.referenceUrl || '').trim();
  if (referenceUrl && !/^https:\/\/(drive|docs)\.google\.com\//.test(referenceUrl)) throw new Error('參考範例請使用 Google Drive 或 Google 文件網址。');
  const activeEmail = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  const requesterEmail = activeEmail || String(p.requesterEmail || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requesterEmail)) throw new Error('請填寫有效的聯絡 Email。');
  const neededBy = String(p.neededBy || ''); const deadline = String(p.deadline || '');
  if (!neededBy || !deadline) throw new Error('請填寫需求日期與交件期限。');
  return { ...p, requesterEmail, room, title, quantity, neededBy, deadline, driveUrl, referenceUrl };
}

function readRows_(name) {
  const sheet = getSheet_(name);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getValues(); const headers = values.shift();
  return values.filter(row => row.some(v => v !== '')).map(row => {
    const obj = {}; headers.forEach((h,i) => obj[h] = row[i] instanceof Date ? Utilities.formatDate(row[i], Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss") : row[i]); return obj;
  });
}

function getRooms_() {
  const setting = readRows_('Settings').find(row => row.key === 'rooms');
  let saved = [];
  try { saved = setting ? JSON.parse(String(setting.value || '[]')) : []; } catch (e) {}
  if (!Array.isArray(saved)) saved = [];
  return [...new Set([...APP.rooms, ...saved.map(value => safe_(value, 80)).filter(Boolean)])];
}

function saveRoom_(room) {
  if (APP.rooms.includes(room)) return;
  const sheet = getSheet_('Settings');
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);
  const keyCol = headers.indexOf('key');
  const valueCol = headers.indexOf('value');
  const settingRow = values.findIndex((row, index) => index > 0 && row[keyCol] === 'rooms');
  const rooms = getRooms_();
  if (!rooms.includes(room)) rooms.push(room);
  if (settingRow < 1) appendObject_('Settings', { key: 'rooms', value: JSON.stringify(rooms) });
  else sheet.getRange(settingRow + 1, valueCol + 1).setValue(JSON.stringify(rooms));
}

function appendObject_(name, obj) {
  const sheet = getSheet_(name); const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  sheet.appendRow(headers.map(h => obj[h] === undefined ? '' : obj[h]));
}
function writeObjectAt_(name, rowNumber, obj) {
  const sheet = getSheet_(name); const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([headers.map(h => obj[h] === undefined ? '' : obj[h])]);
}
function logReview_(requestId, reviewer, action, note) {
  appendObject_('ReviewLogs', { id:Utilities.getUuid(), requestId, at:new Date().toISOString(), reviewer, action, note });
}
function safe_(value, max) { return String(value || '').trim().replace(/[<>]/g, '').slice(0, max); }




function verifyAdminPassword(email, password) {
  email = String(email || '').trim().toLowerCase();
  password = String(password || '');
  const configuredPassword = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  if (!configuredPassword) throw new Error('管理密碼尚未設定，請管理員先在 Apps Script 專案設定新增 ADMIN_PASSWORD。');
  const cache = CacheService.getScriptCache();
  const rateKey = 'PRINTLAB_LOGIN_TRIES_' + adminTokenKey_(email);
  const tries = Number(cache.get(rateKey) || 0);
  if (tries >= 10) throw new Error('登入嘗試次數過多，請 15 分鐘後再試。');
  if (!isActiveUser_(email, ['admin', '管理員', 'designer', 'print_staff', '設計人員', '印務人員']) || password !== configuredPassword) {
    cache.put(rateKey, String(tries + 1), 900);
    throw new Error('帳號或密碼錯誤，或帳號尚未啟用。');
  }
  cache.remove(rateKey);
  const token = Utilities.getUuid() + Utilities.getUuid();
  cache.put(adminTokenKey_(token), email, 21600);
  return { ok: true, token, email, expiresIn: 21600 };
}

function deleteRequest(payload) {
  const p = payload || {}, admin = requireAdmin_(p.adminToken), requestId = safe_(p.id, 100);
  if (!requestId) throw new Error('缺少需求編號。');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const requestSheet = getSheet_('Requests'), requestValues = requestSheet.getDataRange().getValues();
    const requestHeaders = requestValues[0].map(String), idCol = requestHeaders.indexOf('id');
    const rowIndex = requestValues.findIndex((row, i) => i > 0 && String(row[idCol]) === requestId);
    if (rowIndex < 1) throw new Error('找不到這筆需求。');
    const artworkSheet = getSheet_('ArtworkFiles'), artworkValues = artworkSheet.getDataRange().getValues();
    const artworkHeaders = artworkValues.length ? artworkValues[0].map(String) : [];
    const requestIdCol = artworkHeaders.indexOf('requestId'), fileIdCol = artworkHeaders.indexOf('fileId');
    const relatedRows = artworkValues.slice(1).map((row, i) => ({ rowNumber:i + 2, row }))
      .filter(item => requestIdCol >= 0 && String(item.row[requestIdCol]) === requestId);
    relatedRows.forEach(item => {
      const fileId = fileIdCol >= 0 ? String(item.row[fileIdCol] || '').trim() : '';
      if (fileId) {
        try { DriveApp.getFileById(fileId).setTrashed(true); }
        catch (e) { throw new Error('相關完稿檔案無法移至垃圾桶，需求尚未刪除。請確認檔案權限後再試。'); }
      }
    });
    relatedRows.reverse().forEach(item => artworkSheet.deleteRow(item.rowNumber));
    requestSheet.deleteRow(rowIndex + 1);
    logReview_(requestId, admin.email, '管理員刪除需求', '需求資料與完稿檔案紀錄已移除；雲端硬碟檔案已移至垃圾桶。');
    return { ok:true };
  } finally { lock.releaseLock(); }
}
