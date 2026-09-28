/**
 * 楓藝諮詢後台 — Google Apps Script
 *
 * 使用方式見 docs/setup-google-sheet.md。
 * 秘密碼（ADMIN_KEY）與通知信箱（NOTIFY_EMAIL）存在「指令碼屬性」，不寫在程式碼裡。
 */

const SHEET_NAME = '諮詢';
const HEADERS = ['編號', '建立時間', '來源', '姓名', '電話', '服務縣市', '工程類型', '需求說明', '進度', '備註', '最後更新'];
const FIELDS = ['id', 'createdAt', 'source', 'name', 'phone', 'city', 'type', 'message', 'stage', 'note', 'updatedAt'];
const STAGES = ['新諮詢', '已聯絡', '已場勘', '已報價', '已成交', '施工中', '已完工', '沒成交'];
const LIMITS = { name: 50, phone: 30, city: 10, type: 50, message: 2000, note: 2000 };
const RATE_LIMIT_PER_MINUTE = 10;
const TZ = 'Asia/Taipei';
const ADMIN_PAGE = 'https://willhuang88669.github.io/fengyi-site/admin.html';
// 秘密碼也可以手動改成好記的字（專案設定 → 指令碼屬性 → ADMIN_KEY），首頁網址加 #秘密碼 就會進後台

/* ========== 一次性設定：在編輯器選 setup 後按「執行」 ========== */

function setup() {
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME, 0);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#FAF4E6');
  }
  // 全部欄位存成文字，避免電話 0915… 的 0 被吃掉
  sheet.getRange(1, 1, sheet.getMaxRows(), HEADERS.length).setNumberFormat('@');
  // 「進度」欄在試算表裡也有下拉選單
  const rule = SpreadsheetApp.newDataValidation().requireValueInList(STAGES, true).build();
  sheet.getRange(2, FIELDS.indexOf('stage') + 1, sheet.getMaxRows() - 1, 1).setDataValidation(rule);

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ADMIN_KEY')) props.setProperty('ADMIN_KEY', newKey_());

  Logger.log('✅ 設定完成。你的後台網址如下（請加入書籤，不要分享給別人）：');
  Logger.log(ADMIN_PAGE + '#k=' + props.getProperty('ADMIN_KEY'));
  if (!props.getProperty('NOTIFY_EMAIL')) {
    Logger.log('提醒：還沒設定 NOTIFY_EMAIL，有新諮詢時不會寄通知信。');
  }
}

/** 後台網址外流時執行：換一組新秘密碼，舊網址立刻失效 */
function rotateKey() {
  const key = newKey_();
  PropertiesService.getScriptProperties().setProperty('ADMIN_KEY', key);
  Logger.log('🔑 已更換秘密碼。新的後台網址：');
  Logger.log(ADMIN_PAGE + '#k=' + key);
}

/** 測試通知信是否寄得出去 */
function testNotify() {
  notify_({ id: 'TEST', createdAt: now_(), name: '測試客人', phone: '0900-000-000', city: '臺中市', type: '其他／還不確定', message: '這是一封測試通知信。' });
  Logger.log('已嘗試寄出測試信，請檢查信箱：' + (PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL') || '（尚未設定 NOTIFY_EMAIL）'));
}

/* ========== 網頁應用程式入口 ========== */

function doGet() {
  return ContentService.createTextOutput('楓藝諮詢服務運作中');
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'bad_request' });
  }

  try {
    switch (req.action) {
      case 'submit':
        return json_(submit_(req.data || {}));
      case 'list':
        auth_(req.key);
        return json_({ ok: true, items: list_(), stages: STAGES });
      case 'update':
        auth_(req.key);
        return json_(update_(req.id, req.data || {}));
      case 'create':
        auth_(req.key);
        return json_(create_(req.data || {}, '手動'));
      case 'delete':
        auth_(req.key);
        return json_(remove_(req.id));
      default:
        return json_({ ok: false, error: 'unknown_action' });
    }
  } catch (err) {
    if (err.message === 'unauthorized') return json_({ ok: false, error: 'unauthorized' });
    if (err.message === 'invalid') return json_({ ok: false, error: 'invalid' });
    if (err.message === 'not_found') return json_({ ok: false, error: 'not_found' });
    console.error(err);
    return json_({ ok: false, error: 'server_error' });
  }
}

/* ========== 動作 ========== */

function submit_(data) {
  // 隱藏欄位被填了 = 機器人，假裝成功但不存
  if (data.website) return { ok: true };

  const cache = CacheService.getScriptCache();
  const bucket = 'rate:' + Utilities.formatDate(new Date(), TZ, 'yyyyMMddHHmm');
  const count = Number(cache.get(bucket) || 0);
  if (count >= RATE_LIMIT_PER_MINUTE) return { ok: false, error: 'rate_limited' };
  cache.put(bucket, String(count + 1), 120);

  const result = create_(data, '官網');
  try {
    notify_(result.item);
  } catch (err) {
    console.error('通知信寄送失敗', err);
  }
  return { ok: true };
}

function create_(data, source) {
  const item = {
    id: Utilities.formatDate(new Date(), TZ, 'yyyyMMdd-HHmmss') + '-' + Math.random().toString(16).slice(2, 5),
    createdAt: now_(),
    source: source,
    name: clean_(data.name, LIMITS.name),
    phone: clean_(data.phone, LIMITS.phone),
    city: clean_(data.city, LIMITS.city),
    type: clean_(data.type, LIMITS.type),
    message: clean_(data.message, LIMITS.message),
    stage: '新諮詢',
    note: clean_(data.note, LIMITS.note),
    updatedAt: now_(),
  };
  if (!item.name || !item.phone) throw new Error('invalid');
  if (source === '官網' && !item.message) throw new Error('invalid');

  withLock_(() => sheet_().appendRow(FIELDS.map((f) => safe_(item[f]))));
  return { ok: true, item: item };
}

function list_() {
  const sheet = sheet_();
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const rows = sheet.getRange(2, 1, last - 1, FIELDS.length).getDisplayValues();
  return rows
    .filter((r) => r[0])
    .map(toItem_)
    .reverse();
}

function update_(id, data) {
  if (!id) throw new Error('invalid');
  if (data.stage !== undefined && STAGES.indexOf(data.stage) === -1) throw new Error('invalid');

  return withLock_(() => {
    const sheet = sheet_();
    const cell = sheet.getRange('A:A').createTextFinder(String(id)).matchEntireCell(true).findNext();
    if (!cell || cell.getRow() === 1) throw new Error('not_found');
    const row = cell.getRow();

    if (data.stage !== undefined) sheet.getRange(row, FIELDS.indexOf('stage') + 1).setValue(data.stage);
    if (data.note !== undefined) sheet.getRange(row, FIELDS.indexOf('note') + 1).setValue(safe_(clean_(data.note, LIMITS.note)));
    sheet.getRange(row, FIELDS.indexOf('updatedAt') + 1).setValue(now_());

    const values = sheet.getRange(row, 1, 1, FIELDS.length).getDisplayValues()[0];
    return { ok: true, item: toItem_(values) };
  });
}

function remove_(id) {
  if (!id) throw new Error('invalid');
  return withLock_(() => {
    const sheet = sheet_();
    const cell = sheet.getRange('A:A').createTextFinder(String(id)).matchEntireCell(true).findNext();
    if (!cell || cell.getRow() === 1) throw new Error('not_found');
    sheet.deleteRow(cell.getRow());
    return { ok: true };
  });
}

function notify_(item) {
  const to = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL');
  if (!to) return;
  MailApp.sendEmail({
    to: to,
    subject: '【楓藝】新諮詢：' + item.name,
    body: [
      '官網收到一筆新諮詢：',
      '',
      '姓名：' + item.name,
      '電話：' + item.phone,
      '服務縣市：' + (item.city || '（未選）'),
      '工程類型：' + (item.type || '（未選）'),
      '時間：' + item.createdAt,
      '',
      '需求說明：',
      item.message,
      '',
      '到後台查看：請打開你書籤裡的後台網址。',
    ].join('\n'),
  });
}

/* ========== 工具 ========== */

/** 10 分鐘內秘密碼錯 30 次，就暫時全部擋掉，避免被一直猜 */
function auth_(key) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('auth-fails') || 0);
  if (fails >= 30) throw new Error('unauthorized');
  const expected = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  if (!expected || !key || String(key) !== expected) {
    cache.put('auth-fails', String(fails + 1), 600);
    throw new Error('unauthorized');
  }
}

function sheet_() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('找不到「' + SHEET_NAME + '」工作表，請先執行 setup');
  return sheet;
}

function toItem_(row) {
  const item = {};
  FIELDS.forEach((f, i) => (item[f] = row[i]));
  return item;
}

function clean_(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

/** 開頭是 = + - @ 的文字加上單引號，避免被試算表當成公式 */
function safe_(value) {
  return /^[=+\-@]/.test(value) ? "'" + value : value;
}

function now_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
}

function newKey_() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
