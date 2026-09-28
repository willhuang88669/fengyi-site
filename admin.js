// 楓藝諮詢後台：秘密碼從網址 #k=… 讀取，不存在程式碼裡
const API = window.FENGYI_API;
const KEY = new URLSearchParams(location.hash.slice(1)).get('k');
const STAGES = ['新諮詢', '已聯絡', '已場勘', '已報價', '已成交', '施工中', '已完工', '沒成交'];
const STAGE_TONE = {
  新諮詢: 'new', 已聯絡: 'talk', 已場勘: 'talk', 已報價: 'quote',
  已成交: 'won', 施工中: 'won', 已完工: 'done', 沒成交: 'lost',
};
const ICON_TRASH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12M10.5 11v5M13.5 11v5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const $ = (id) => document.getElementById(id);
const state = { items: [], stage: '全部', q: '', city: '', sort: 'new' };
let current = null;

/* ========== API ========== */

async function api(action, payload = {}) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, key: KEY, ...payload }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'failed');
  return json;
}

/* ========== 載入與畫面狀態 ========== */

function show(view) {
  $('loading').hidden = view !== 'loading';
  $('app').hidden = view !== 'app';
  $('msg-denied').hidden = view !== 'denied';
  $('msg-error').hidden = view !== 'error';
  ['btn-new', 'btn-export'].forEach((id) => { $(id).disabled = view !== 'app'; });
}

async function load() {
  if (!KEY) return show('denied');
  if (state.items.length === 0) show('loading');
  $('btn-refresh').disabled = true;
  try {
    const json = await api('list');
    state.items = json.items;
    render();
    show('app');
  } catch (err) {
    show(err.message === 'unauthorized' ? 'denied' : 'error');
  } finally {
    $('btn-refresh').disabled = false;
  }
}

function filtered() {
  const q = state.q.trim().toLowerCase();
  const rows = state.items.filter((it) => {
    if (state.stage !== '全部' && it.stage !== state.stage) return false;
    if (state.city && it.city !== state.city) return false;
    if (!q) return true;
    return [it.name, it.phone, it.city, it.type, it.message, it.note].some((v) => String(v).toLowerCase().includes(q));
  });
  const by = {
    new: (a, b) => b.id.localeCompare(a.id), // 編號開頭是 yyyyMMdd-HHmmss，可直接排序
    old: (a, b) => a.id.localeCompare(b.id),
    updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
    stage: (a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage),
  };
  return rows.sort(by[state.sort]);
}

/* ========== 畫面 ========== */

function render() {
  renderTabs();
  renderCityFilter();
  renderList();
}

// 在表格裡改進度時只更新這裡，表格不重排，免得那一列突然消失
function renderTabs() {
  const counts = Object.fromEntries(STAGES.map((s) => [s, 0]));
  state.items.forEach((it) => { if (it.stage in counts) counts[it.stage] += 1; });
  const tabs = [['全部', state.items.length], ...STAGES.map((s) => [s, counts[s]])];
  $('stage-tabs').replaceChildren(...tabs.map(([name, n]) => {
    const b = el('button', 'crm-tab');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(state.stage === name));
    b.append(el('span', '', name), el('span', 'count', String(n)));
    b.addEventListener('click', () => { state.stage = name; render(); });
    return b;
  }));
  const badge = $('nav-new-count');
  badge.textContent = counts['新諮詢'];
  badge.hidden = counts['新諮詢'] === 0;
  badge.setAttribute('aria-label', `${counts['新諮詢']} 筆新諮詢`);
}

function renderCityFilter() {
  const cities = [...new Set(state.items.map((it) => it.city).filter(Boolean))].sort();
  const sel = $('city-filter');
  if (state.city && !cities.includes(state.city)) state.city = '';
  sel.replaceChildren(new Option('全部縣市', ''), ...cities.map((c) => new Option(c, c)));
  sel.value = state.city;
}

function renderList() {
  const rows = filtered();
  $('list').replaceChildren(...rows.map((it, i) => buildRow(it, i + 1)));
  $('empty').hidden = rows.length > 0;
  $('result-count').textContent = rows.length === state.items.length
    ? `共 ${rows.length} 筆`
    : `顯示 ${rows.length} 筆，共 ${state.items.length} 筆`;
}

function buildRow(it, n) {
  const tr = el('tr');

  const name = el('button', '', it.name);
  name.type = 'button';
  name.addEventListener('click', () => openDetail(it.id));
  const nameTd = td('c-name', name);
  if (it.source === '手動') nameTd.append(el('span', 'tag-manual', '手動'));

  const phone = el('a', '', it.phone);
  phone.href = `tel:${it.phone.replace(/[^\d+]/g, '')}`;

  // 我的備註：離開輸入框時自動儲存
  const note = el('textarea');
  note.rows = 2;
  note.value = it.note;
  note.placeholder = '寫點備註…';
  note.setAttribute('aria-label', `${it.name} 的備註`);

  // 進度：選了就自動儲存
  const select = el('select', 'stage-pill');
  select.setAttribute('aria-label', `${it.name} 的進度`);
  select.append(...STAGES.map((s) => new Option(s, s)));
  select.value = it.stage;
  select.dataset.tone = STAGE_TONE[it.stage] || 'new';
  const saveStatus = el('span', 'row-save');
  saveStatus.setAttribute('role', 'status');

  select.addEventListener('change', async () => {
    const prev = it.stage;
    select.dataset.tone = STAGE_TONE[select.value] || 'new';
    const ok = await saveRow(it, { stage: select.value }, saveStatus);
    if (!ok) {
      select.value = prev;
      select.dataset.tone = STAGE_TONE[prev] || 'new';
    }
    renderTabs();
  });
  note.addEventListener('blur', () => {
    if (note.value !== it.note) saveRow(it, { note: note.value }, saveStatus);
  });

  const del = el('button', 'icon-btn');
  del.type = 'button';
  del.innerHTML = ICON_TRASH;
  del.setAttribute('aria-label', `刪除 ${it.name} 的資料`);
  del.title = '刪除';
  del.addEventListener('click', () => askDelete(it));

  const msg = el('p', '', it.message || '—');
  msg.title = it.message || '';

  tr.append(
    td('c-num', String(n)),
    nameTd,
    td('c-phone', phone),
    td('c-city', it.city || '—'),
    td('c-type', el('span', 'type-chip', shortType(it.type))),
    td('c-msg', msg),
    td('c-note', note),
    td('c-stage', select, saveStatus),
    td('c-date', formatDate(it.createdAt)),
    td('c-act', del),
  );
  return tr;
}

const pending = new Set();
async function saveRow(it, data, statusEl) {
  pending.add(it.id);
  statusEl.className = 'row-save';
  statusEl.textContent = '儲存中…';
  try {
    const { item } = await api('update', { id: it.id, data });
    Object.assign(it, item);
    statusEl.classList.add('is-ok');
    statusEl.textContent = '已儲存';
    setTimeout(() => { if (statusEl.textContent === '已儲存') statusEl.textContent = ''; }, 2500);
    return true;
  } catch (err) {
    statusEl.classList.add('is-error');
    statusEl.textContent = '儲存失敗，請再試一次';
    return false;
  } finally {
    pending.delete(it.id);
  }
}

// 還在儲存時關掉頁面，先提醒
window.addEventListener('beforeunload', (e) => {
  if (pending.size) { e.preventDefault(); e.returnValue = ''; }
});

// 「休閒建築（涼亭、廊道…）」在表格只顯示「休閒建築」，完整名稱在詳細資料
function shortType(type) {
  return type ? type.replace(/（.*）/, '') : '—';
}

// 2026-09-29 12:30 → 09/29
function formatDate(s) {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[1]}/${m[2]}` : s;
}

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function td(cls, ...children) {
  const cell = el('td', cls);
  cell.append(...children);
  return cell;
}

/* ========== 詳細資料 ========== */

$('d-stage').append(...STAGES.map((s) => new Option(s, s)));

function openDetail(id) {
  current = state.items.find((it) => it.id === id);
  if (!current) return;
  $('detail-meta').textContent = `${current.createdAt}　來源：${current.source}`;
  $('detail-name').textContent = current.name;
  const phone = $('detail-phone');
  phone.textContent = current.phone;
  phone.href = `tel:${current.phone.replace(/[^\d+]/g, '')}`;
  $('detail-city').textContent = current.city || '—';
  $('detail-type').textContent = current.type || '—';
  $('detail-message').textContent = current.message || '—';
  $('d-stage').value = current.stage;
  $('d-note').value = current.note;
  $('detail-updated').textContent = `最後更新：${current.updatedAt}`;
  $('detail-form').querySelector('.form-status').textContent = '';
  $('detail').showModal();
}

$('detail-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const btn = form.querySelector('button[type="submit"]');
  const status = form.querySelector('.form-status');
  btn.disabled = true;
  btn.textContent = '儲存中…';
  status.classList.remove('is-error');
  status.textContent = '';
  try {
    const { item } = await api('update', { id: current.id, data: { stage: $('d-stage').value, note: $('d-note').value } });
    Object.assign(current, item);
    render();
    $('detail').close();
    toast('已儲存');
  } catch (err) {
    status.classList.add('is-error');
    status.textContent = '儲存失敗，請再按一次儲存。';
  } finally {
    btn.disabled = false;
    btn.textContent = '儲存';
  }
});

/* ========== 刪除（二次確認） ========== */

let deleting = null;

function askDelete(it) {
  deleting = it;
  const dlg = $('confirm-delete');
  $('confirm-desc').textContent = `「${it.name}」（${it.phone}）的諮詢紀錄會從試算表永久刪除，無法復原。`;
  dlg.querySelector('.form-status').textContent = '';
  $('confirm-ok').disabled = false;
  $('confirm-ok').textContent = '刪除';
  dlg.showModal();
  $('confirm-cancel').focus(); // 預設停在「取消」，避免誤按 Enter 就刪掉
}

$('detail-delete').addEventListener('click', () => {
  const it = current;
  $('detail').close();
  askDelete(it);
});

$('confirm-cancel').addEventListener('click', () => $('confirm-delete').close());

$('confirm-ok').addEventListener('click', async () => {
  const btn = $('confirm-ok');
  const status = $('confirm-delete').querySelector('.form-status');
  btn.disabled = true;
  btn.textContent = '刪除中…';
  status.classList.remove('is-error');
  status.textContent = '';
  const removeLocal = () => {
    state.items = state.items.filter((x) => x.id !== deleting.id);
    render();
    $('confirm-delete').close();
  };
  try {
    await api('delete', { id: deleting.id });
    removeLocal();
    toast(`已刪除「${deleting.name}」`);
  } catch (err) {
    if (err.message === 'not_found') {
      removeLocal();
      toast('這筆資料已經不存在');
      return;
    }
    status.classList.add('is-error');
    status.textContent = '刪除失敗，請再試一次。';
    btn.disabled = false;
    btn.textContent = '刪除';
  }
});

/* ========== 手動新增 ========== */

$('btn-new').addEventListener('click', () => {
  $('create-form').reset();
  $('create-form').querySelector('.form-status').textContent = '';
  $('create').showModal();
});

$('create-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const status = form.querySelector('.form-status');
  const data = Object.fromEntries(new FormData(form));
  status.classList.add('is-error');
  if (!data.name.trim()) { status.textContent = '請填寫姓名'; $('c-name').focus(); return; }
  if (!data.phone.trim()) { status.textContent = '請填寫電話'; $('c-phone').focus(); return; }

  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = '新增中…';
  status.textContent = '';
  try {
    const { item } = await api('create', { data });
    state.items.unshift(item);
    state.stage = '全部';
    render();
    $('create').close();
    toast('已新增');
  } catch (err) {
    status.textContent = '新增失敗，請再試一次。';
  } finally {
    btn.disabled = false;
    btn.textContent = '新增';
  }
});

/* ========== 匯出（目前篩選的資料） ========== */

$('btn-export').addEventListener('click', () => {
  const rows = filtered();
  const header = ['編號', '建立時間', '來源', '姓名', '電話', '服務縣市', '工程類型', '需求說明', '進度', '備註', '最後更新'];
  const keys = ['id', 'createdAt', 'source', 'name', 'phone', 'city', 'type', 'message', 'stage', 'note', 'updatedAt'];
  const esc = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = "'" + s; // 避免 Excel 當成公式
    return `"${s.replace(/"/g, '""')}"`;
  };
  // 電話前面加 \t，Excel 才不會把開頭的 0 吃掉
  const lines = [header.map(esc).join(','), ...rows.map((it) => keys.map((k) => (k === 'phone' ? esc('\t' + it[k]) : esc(it[k]))).join(','))];
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  a.href = URL.createObjectURL(blob);
  a.download = `楓藝諮詢_${state.stage}_${stamp}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast(`已匯出 ${rows.length} 筆`);
});

/* ========== 其他 ========== */

$('btn-refresh').addEventListener('click', load);
$('btn-retry').addEventListener('click', load);
$('search').addEventListener('input', (e) => { state.q = e.target.value; renderList(); });
$('sort').addEventListener('change', (e) => { state.sort = e.target.value; renderList(); });
$('city-filter').addEventListener('change', (e) => { state.city = e.target.value; renderList(); });
window.addEventListener('hashchange', () => location.reload());

let toastTimer;
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('is-show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-show'), 3000);
}

// 深色／淺色模式（和官網共用設定）
const themeBtn = document.querySelector('.theme-toggle');
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
const currentTheme = () => document.documentElement.dataset.theme || (systemDark.matches ? 'dark' : 'light');
function syncTheme() {
  themeBtn.setAttribute('aria-label', currentTheme() === 'dark' ? '切換成淺色模式' : '切換成深色模式');
}
themeBtn.addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch (e) {}
  syncTheme();
});
systemDark.addEventListener('change', syncTheme);
syncTheme();

load();
