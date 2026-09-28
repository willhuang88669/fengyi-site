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
const revealTargets = document.querySelectorAll('.statement, .work, .values, .stats, .about-intro, .advantages, .service, .features, .contact-card');
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

// 諮詢表單：目前是純靜態網站，所以送出時會開啟 Email，並帶入客人填寫的內容
const form = document.getElementById('contact-form');
const status = form.querySelector('.form-status');

const rules = {
  name: (v) => (v ? '' : '請填寫您的姓名'),
  phone: (v) => (!v ? '請填寫聯絡電話' : /^[\d\s\-+()#]{8,}$/.test(v) ? '' : '電話格式看起來不太對，請再確認一下'),
  email: (v) => (!v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? '' : 'Email 格式不正確，例如 name@example.com'),
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

form.querySelectorAll('input, textarea').forEach((input) => {
  input.addEventListener('blur', () => validateField(input));
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const fields = [...form.querySelectorAll('input, textarea')];
  const invalid = fields.filter((f) => !validateField(f));
  if (invalid.length) {
    invalid[0].focus();
    status.textContent = '';
    return;
  }

  const data = new FormData(form);
  const body = [
    `姓名：${data.get('name')}`,
    `電話：${data.get('phone')}`,
    `Email：${data.get('email') || '（未填）'}`,
    `工程類型：${data.get('type') || '（未選）'}`,
    '',
    '需求說明：',
    data.get('message'),
  ].join('\n');

  const subject = `【網站諮詢】${data.get('name')}`;
  window.location.href = `mailto:yoko7377@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  status.textContent = '已為您開啟 Email，確認內容後按下寄出即可。也歡迎直接來電或加 LINE。';
});

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
