// 手機選單開關
const toggle = document.querySelector('.nav-toggle');
const nav = document.getElementById('site-nav');

toggle.addEventListener('click', () => {
  const open = toggle.getAttribute('aria-expanded') === 'true';
  toggle.setAttribute('aria-expanded', String(!open));
  toggle.querySelector('.visually-hidden').textContent = open ? '開啟選單' : '關閉選單';
  nav.classList.toggle('is-open', !open);
});

nav.addEventListener('click', (e) => {
  if (e.target.matches('a') && nav.classList.contains('is-open')) toggle.click();
});

// 捲動時標示目前所在區塊
const links = [...nav.querySelectorAll('a')];
const sections = links.map((a) => document.querySelector(a.getAttribute('href')));

const navObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    const id = '#' + entry.target.id;
    links.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === id));
  });
}, { rootMargin: '-45% 0px -50% 0px' });

sections.forEach((s) => s && navObserver.observe(s));

// 區塊進場淡入
const revealTargets = document.querySelectorAll('.statement, .work, .values, .stats, .about-intro, .founder, .advantages, .service, .features, .contact-card');
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

revealTargets.forEach((el) => {
  el.classList.add('reveal');
  revealObserver.observe(el);
});

// 諮詢表單：送到 Google 試算表（Apps Script），網址在 config.js
const form = document.getElementById('contact-form');
const status = form.querySelector('.form-status');

const rules = {
  name: (v) => (v ? '' : '請填寫您的姓名'),
  phone: (v) => (!v ? '請填寫聯絡電話' : /^[\d\s\-+()#]{8,}$/.test(v) ? '' : '電話格式看起來不太對，請再確認一下'),
  city: (v) => (v ? '' : '請選擇服務縣市'),
  message: (v) => (v ? '' : '請簡單描述您的需求，例如地點與想做的項目'),
};

function validateField(input) {
  const rule = rules[input.name];
  if (!rule) return true;
  const msg = rule(input.value.trim());
  const err = document.getElementById(input.getAttribute('aria-describedby'));
  input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  if (err) err.textContent = msg;
  return !msg;
}

form.querySelectorAll('.field input, .field select, .field textarea').forEach((input) => {
  input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'blur', () => validateField(input));
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const fields = [...form.querySelectorAll('.field input, .field select, .field textarea')];
  const invalid = fields.filter((f) => !validateField(f));
  if (invalid.length) {
    invalid[0].focus();
    status.textContent = '';
    return;
  }

  sendInquiry(Object.fromEntries(new FormData(form)));
});

async function sendInquiry(data) {
  const btn = form.querySelector('button[type="submit"]');
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = '送出中…';
  status.classList.remove('is-error');
  status.textContent = '';

  try {
    const res = await fetch(window.FENGYI_API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'submit', data }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'failed');
    form.reset();
    status.textContent = '已收到您的諮詢，我們會盡快與您聯繫，謝謝！';
  } catch (err) {
    status.classList.add('is-error');
    status.textContent = err.message === 'rate_limited'
      ? '目前諮詢人數較多，請一分鐘後再試，或直接來電 0915-512-120／加 LINE：yje996699。'
      : '送出失敗，請稍後再試，或直接來電 0915-512-120／加 LINE：yje996699。';
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

// 深色／淺色模式切換：沒選過就跟隨系統設定
const themeBtn = document.querySelector('.theme-toggle');
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

function currentTheme() {
  return document.documentElement.dataset.theme || (systemDark.matches ? 'dark' : 'light');
}

function syncThemeButton() {
  const dark = currentTheme() === 'dark';
  themeBtn.setAttribute('aria-label', dark ? '切換成淺色模式' : '切換成深色模式');
}

themeBtn.addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch (e) {}
  syncThemeButton();
});

systemDark.addEventListener('change', syncThemeButton);
syncThemeButton();

// 管理員登入：輸入代碼，確認正確後跳到後台
const loginDlg = document.getElementById('admin-login');
const loginForm = document.getElementById('admin-login-form');
const codeInput = document.getElementById('admin-code');
const codeErr = document.getElementById('admin-code-err');

document.querySelector('.admin-entry').addEventListener('click', () => {
  loginForm.reset();
  codeErr.textContent = '';
  codeInput.removeAttribute('aria-invalid');
  loginDlg.showModal();
  codeInput.focus();
});
loginForm.querySelector('.admin-login-cancel').addEventListener('click', () => loginDlg.close());

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = codeInput.value.trim();
  if (!code) {
    codeErr.textContent = '請輸入代碼';
    codeInput.setAttribute('aria-invalid', 'true');
    return;
  }
  const btn = loginForm.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = '確認中…';
  codeErr.textContent = '';
  try {
    const res = await fetch(window.FENGYI_API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'list', key: code }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error);
    location.href = 'admin.html#k=' + encodeURIComponent(code);
  } catch (err) {
    codeErr.textContent = err.message === 'unauthorized' ? '代碼不正確' : '連線失敗，請稍後再試';
    codeInput.setAttribute('aria-invalid', 'true');
    codeInput.select();
    btn.disabled = false;
    btn.textContent = '進入後台';
  }
});
