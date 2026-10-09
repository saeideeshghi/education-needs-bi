/* Independent data store and shell. Portal data is read only on an explicit import. */
(function () {
  'use strict';
  const D = window.PortalData, e = D.escape;
  const KEY = 'education-needs-bi:records:v1', THEME = 'education-needs-bi:theme:v1';
  const PORTAL_KEY = 'education-needs-portal:records:v4', MAX_BYTES = 5 * 1024 * 1024;
  const labels = { draft: 'پیش‌نویس', submitted: 'در انتظار بررسی مدیر', changes_requested: 'نیازمند اصلاح', resubmitted: 'ارسال مجدد', approved: 'تأیید شده' };
  const clone = value => JSON.parse(JSON.stringify(value));
  const text = (value, length = 180) => typeof value === 'string' ? value.slice(0, length) : typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
  const at = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
  let memory = null, toastTimer, menuOpen = false, previousFocus = null;
  function seedBook() {
    return { version: 1, application: 'education-needs-bi',
      meta: { origin: 'demo', seedVersion: window.PortalDemoData.seedVersion, name: '۵۰ پرونده آزمایشی در ۱۰ شهرستان', importedAt: null },
      records: window.PortalDemoData.records() };
  }
  function cleanState(raw) {
    if (!raw || typeof raw !== 'object' || !raw.profile || typeof raw.profile !== 'object') throw Error('ساختار فرم پرونده معتبر نیست.');
    const profile = {}, sections = {};
    for (const key of ['name', 'code', 'county', 'type', 'level', 'gender', 'students', 'classrooms', 'period', 'discrepancy']) profile[key] = text(raw.profile[key], key === 'discrepancy' ? 300 : 80);
    for (const domain of D.definitions) {
      const saved = raw.sections?.[domain.id];
      const rows = domain.rows.map(row => {
        const value = Array.isArray(saved?.rows) ? saved.rows.find(r => r && r.id === row.id) : null;
        return { id: row.id, value: text(value?.value), notes: text(value?.notes), unknown: value?.unknown === true };
      });
      const extras = domain.extras.map(field => {
        const value = Array.isArray(saved?.extras) ? saved.extras.find(f => f && f.id === field.id) : null;
        return { id: field.id, value: text(value?.value) };
      });
      const items = Array.isArray(saved?.items) ? saved.items.slice(0, 85).filter(item => item && typeof item === 'object').map((item, i) => ({
        id: /^[a-zA-Z0-9_-]{1,80}$/.test(item.id || '') ? item.id : 'import-item-' + i,
        place: text(item.place), title: text(item.title), count: text(item.count, 24)
      })) : [];
      sections[domain.id] = { rows, extras, items, completed: saved?.completed === true, started: saved?.started === true, updatedAt: at(saved?.updatedAt) };
    }
    return { schemaVersion: 2, profile, sections, savedAt: at(raw.savedAt),
      submission: raw.submission && at(raw.submission.at) ? { at: raw.submission.at, tracking: text(raw.submission.tracking, 100) } : null };
  }
  function normalizeRecords(input) {
    const list = Array.isArray(input) ? input : input?.records;
    if (!Array.isArray(list) || list.length > 250) throw Error('فایل باید فهرست پرونده‌ها داشته باشد؛ حداکثر ۲۵۰ پرونده.');
    const ids = new Set();
    return list.map(raw => {
      if (!raw || typeof raw.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(raw.id) || ids.has(raw.id)) throw Error('شناسه پرونده نامعتبر یا تکراری است.');
      if (!D.counties.includes(raw.county) || !Object.hasOwn(labels, raw.status)) throw Error('شهرستان یا وضعیت پرونده با ساختار سامانه مطابقت ندارد.');
      ids.add(raw.id);
      const state = cleanState(raw.state), snapshot = raw.snapshot ? cleanState(raw.snapshot) : null;
      const code = text(raw.code || state.profile.code, 80);
      state.profile.county = raw.county; state.profile.code = code;
      if (snapshot) { snapshot.profile.county = raw.county; snapshot.profile.code = code; }
      return { id: raw.id, county: raw.county, code, status: raw.status, state, snapshot, updatedAt: at(raw.updatedAt) };
    });
  }
  function readBook() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const book = JSON.parse(raw);
        if (book.version === 1 && Array.isArray(book.records)) {
          if (book.meta?.origin === 'demo' && book.meta.seedVersion !== window.PortalDemoData.seedVersion) {
            if (!memory || memory.meta?.origin !== 'demo') memory = seedBook();
            try { localStorage.setItem(KEY, JSON.stringify(memory)); } catch (_) {}
            return clone(memory);
          }
          return book;
        }
      }
    } catch (_) {}
    if (!memory) memory = seedBook();
    try { localStorage.setItem(KEY, JSON.stringify(memory)); } catch (_) {}
    return clone(memory);
  }
  function saveBook(book) {
    try { localStorage.setItem(KEY, JSON.stringify(book)); memory = clone(book); return { ok: true, count: book.records.length }; }
    catch (_) { return { ok: false, message: 'ذخیره داده ممکن نشد؛ فضای ذخیره مرورگر را بررسی کنید. داده قبلی حفظ شد.' }; }
  }
  function importBook(input, origin, name) {
    try {
      const records = normalizeRecords(input);
      const demo = origin !== 'portal' && input?.application === 'education-needs-bi' && (input.meta?.origin === 'demo' || input.meta?.demo === true);
      return saveBook({ version: 1, application: 'education-needs-bi', records,
        meta: { origin: origin === 'portal' ? 'portal' : 'file', demo, name: text(name, 100), importedAt: new Date().toISOString() } });
    } catch (error) { return { ok: false, message: error.message }; }
  }
  function importPortal() {
    try {
      const raw = localStorage.getItem(PORTAL_KEY);
      if (!raw) return { ok: false, message: 'داده پورتال در این مبدأ مرورگر پیدا نشد. دو سایت باید روی همان username.github.io باشند؛ یا فایل JSON پرونده‌ها را وارد کنید.' };
      if (new Blob([raw]).size > MAX_BYTES) return { ok: false, message: 'حجم داده بیشتر از ۵ مگابایت است.' };
      return importBook(JSON.parse(raw), 'portal', 'داده دریافت‌شده از پورتال');
    } catch (_) { return { ok: false, message: 'خواندن اطلاعات پورتال ممکن نشد. داده قبلی داشبورد حفظ شد.' }; }
  }
  function dataLabel() {
    const meta = readBook().meta;
    if (meta?.demo === true) return 'فایل آزمایشی واردشده: ' + (meta.name || 'پرونده‌های نمونه');
    return meta?.origin === 'portal' ? 'آخرین داده دریافت‌شده از پورتال' : meta?.origin === 'file' ? 'فایل واردشده: ' + (meta.name || 'پرونده‌ها') : 'داده‌های نمونه داشبورد؛ نمایشی';
  }
  function dataOrigin() {
    const meta = readBook().meta;
    return meta?.demo === true ? 'demo' : meta?.origin || 'unknown';
  }
  const paths = {
    check: '<path d="m5 12 4 4L19 6"/>',
    space: '<path d="M3 21h18M5 21V8h5V3h4v5h5v13M9 21v-5h6v5"/>',
    equipment: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
    workshops: '<path d="m14 6 4 4M14 3a6 6 0 0 0-7 7L3 18a2 2 0 0 0 3 3l8-7a6 6 0 0 0 7-7l-4 4-4-4 4-4Z"/>',
    specialized: '<path d="M8 3h8M9 3v6L3 19v2h18v-2L15 9V3M6 15h12"/>',
    safety: '<path d="m12 3 9 4v6c0 5-9 9-9 9s-9-4-9-9V7ZM8 12l3 3 5-6"/>',
    welfare: '<path d="M3 21V8M21 21V8M3 17h18M3 13h18v4H3Z"/><rect x="5" y="8" width="5" height="5" rx="1"/><rect x="14" y="8" width="5" height="5" rx="1"/>',
    students: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-4a6 6 0 0 1 12 0v4M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5"/>',
    nomadic: '<path d="m12 3 10 18H2Zm0 9v9M8 21l4-9 4 9"/>',
    exceptional: '<circle cx="12" cy="4" r="2"/><path d="M4 9h16M12 6v8M12 14l-5 7M12 14l5 7"/>',
    chart: '<path d="M4 3v18h17M8 17v-5M13 17V8M18 17V5"/>', file: '<path d="M14 2H6v20h12V8ZM14 2v6h6M8 12h8M8 16h8"/>',
    building: '<path d="M3 21h18M5 21V8h5V3h4v5h5v13M9 21v-5h6v5M8 11h.01M16 11h.01M12 7h.01"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>', close: '<path d="m6 6 12 12M18 6 6 18"/>',
    moon: '<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/>', sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1"/>',
    chevron: '<path d="m14 6-6 6 6 6"/>', download: '<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
    upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 17v4h16v-4"/>', external: '<path d="M14 3h7v7M21 3 10 14M10 3H3v18h18v-7"/>',
    data: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>'
  };
  function icon(name) { return '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' + (paths[name] || paths.chart) + '</svg>'; }
  function safePortalURL() {
    try { const url = new URL(window.PortalAnalyticsConfig?.portalUrl); return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null; }
    catch (_) { return null; }
  }
  function themeButton() {
    const dark = document.documentElement.dataset.theme === 'dark';
    return '<button class="icon-button" data-standalone="theme" aria-label="' + (dark ? 'حالت روشن' : 'حالت تاریک') + '">' + icon(dark ? 'sun' : 'moon') + '</button>';
  }
  function setMenu(open) {
    menuOpen = open; document.body.classList.toggle('menu-open', open);
    document.querySelector('[data-standalone="menu"]')?.setAttribute('aria-expanded', String(open));
    if (open) { previousFocus = document.activeElement; document.querySelector('.mobile-menu-close')?.focus(); }
    else if (previousFocus && document.contains(previousFocus)) previousFocus.focus();
  }
  function shell(mode, view, domainId) {
    const portal = safePortalURL(), definitions = D.definitions;
    const titles = { overview: 'نمای مدیریتی', domain: 'تحلیل حوزه', indicators: 'جدول همه شاخص‌ها', quality: 'کیفیت و نواقص داده' };
    const domain = definitions.find(d => d.id === domainId);
    const current = view === 'domain' && domain ? domain.title : titles[view] || titles.overview;
    function navButton(id, title, image) {
      return '<button class="nav-link ' + (view === id ? 'is-active' : '') + '" data-bi-action="view" data-view="' + id + '"' + (view === id ? ' aria-current="page"' : '') + '>' + icon(image) + '<span>' + e(title) + '</span></button>';
    }
    const domains = definitions.map(d => '<button class="nav-link bi-sidebar-domain ' + (view === 'domain' && domainId === d.id ? 'is-active' : '') + '" data-bi-action="open-domain" data-domain="' + d.id + '"' + (view === 'domain' && domainId === d.id ? ' aria-current="page"' : '') + ' title="' + e(d.title) + '">' + icon(d.id) + '<span>' + e(window.EducationAnalysis.domainInfo[d.id].short) + '</span></button>').join('');
    document.getElementById('shell').innerHTML =
      '<button class="menu-backdrop" data-standalone="close-menu" tabindex="-1" aria-label="بستن منو"></button>' +
      '<aside class="sidebar" id="sidebar" aria-label="منوی داشبورد"><button class="mobile-menu-close" data-standalone="close-menu" aria-label="بستن منو">' + icon('close') + '</button>' +
      '<a class="brand" href="./index.html">' + icon('building') + '<span class="brand-title">اطلس تحلیل آموزشی</span><span class="brand-subtitle">آموزش‌وپرورش خراسان شمالی</span></a>' +
      '<nav class="nav-list" aria-label="نماها و حوزه‌های تحلیل">' + navButton('overview', 'نمای مدیریتی', 'chart') + navButton('indicators', 'جدول همه شاخص‌ها', 'file') + navButton('quality', 'کیفیت و نواقص داده', 'check') +
      '<span class="bi-sidebar-label">حوزه‌های نیازسنجی</span>' + domains + '</nav>' +
      '<div class="sidebar-bottom"><button class="nav-link" data-standalone="data">' + icon('data') + '<span>دریافت و مدیریت داده</span></button>' +
      (portal ? '<a class="nav-link" href="' + e(portal) + '" target="_blank" rel="noopener">' + icon('external') + '<span>پورتال ثبت اطلاعات</span></a>' : '') +
      '<p class="bi-sidebar-provenance">' + e(mode === 'demo' ? 'داده آزمایشی کامل؛ غیرواقعی' : mode === 'source' ? 'جداول اصلی شهرستان‌ها' : dataLabel()) + '</p><p class="sidebar-caption">نسخه ' + D.fa('2.1.0') + '</p></div></aside>' +
      '<header class="topbar"><div class="flex min-w-0 items-center gap-2"><button class="icon-button mobile-menu-button" data-standalone="menu" aria-label="باز کردن منو" aria-expanded="' + menuOpen + '" aria-controls="sidebar">' + icon('menu') +
      '</button><p class="mobile-brand-title">اطلس تحلیل آموزشی</p><nav class="breadcrumbs" aria-label="مسیر صفحه"><span>تحلیل نیازهای آموزشی</span>' + icon('chevron') + '<strong>' + e(current) + '</strong></nav></div>' +
      '<div class="topbar-actions"><button class="button button-secondary bi-data-shortcut" data-standalone="data">' + icon('upload') + 'دریافت داده</button>' + themeButton() + '</div></header>';
  }
  function toast(message, error) {
    const node = document.getElementById('toast');
    clearTimeout(toastTimer); node.textContent = message; node.className = error ? 'is-error' : ''; node.hidden = false;
    toastTimer = setTimeout(() => { node.hidden = true; }, 5000);
  }
  function openData() {
    const book = readBook(), dialog = document.getElementById('data-dialog');
    dialog.innerHTML = '<div class="dialog-head"><h2 id="data-dialog-title">دریافت و مدیریت داده‌های پرونده</h2><button class="icon-button" data-standalone="close-data" aria-label="بستن">' + icon('close') + '</button></div><div class="dialog-body"><div class="bi-data-current"><strong>' + e(dataLabel()) + '</strong><span>' + D.fa(book.records.length) + ' پرونده</span></div><p class="bi-data-explain">داده آزمایشی کامل و جدول‌های اصلی شهرستان‌ها از تب منبع تحلیل قابل انتخاب‌اند. ۵۰ پرونده نمونه برای آزمون فرم‌ها وجود دارد. برای تحلیل پرونده‌های ثبت‌شده، یک نسخه از اطلاعات پورتال یا فایل JSON را دریافت کنید.</p><div class="bi-data-options"><button class="button button-primary" data-standalone="import-portal">' + icon('data') + 'دریافت از پورتال همین مرورگر</button><p>وقتی هر دو پروژه روی یک username.github.io باز شده‌اند، این دکمه نسخه فعلی داده پورتال را کپی می‌کند. ورود به پورتال و ثبت اطلاعات باید در همین مرورگر انجام شده باشد.</p><button class="button button-secondary" data-standalone="import-file">' + icon('upload') + 'ورود فایل JSON پرونده‌ها</button><p>فهرست پرونده‌ها یا فایل دارای records؛ حداکثر ۵ مگابایت و ۲۵۰ پرونده. مقدارهای خالی با داده نمونه پر نمی‌شوند.</p><button class="button button-secondary" data-standalone="export-json">' + icon('download') + 'دریافت نسخه JSON داده فعلی</button></div><p class="bi-data-note">به‌روزرسانی خودکار نیست. بعد از تغییر فرم‌های پورتال، دوباره داده را دریافت کنید. این داشبورد فقط اطلاعات را تحلیل می‌کند.</p></div><div class="dialog-footer"><button class="button button-quiet" data-standalone="reset-demo">بازگشت به داده‌های نمونه</button><button class="button button-secondary" data-standalone="close-data">بستن</button></div>';
    dialog.showModal();
  }
  function downloadJSON() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(readBook(), null, 2)], { type: 'application/json;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'education-needs-records-' + new Date().toISOString().slice(0, 10) + '.json'; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function result(action) {
    if (!action.ok) { toast(action.message, true); return; }
    document.getElementById('data-dialog').close();
    window.dispatchEvent(new Event('bi-records-updated'));
    toast(D.fa(action.count) + ' پرونده دریافت شد. برای مشاهده، نمای «تحلیل پرونده‌های سامانه» را باز کنید.');
  }
  function details(entityId, domainId, mode, basis) {
    const domain = D.definitions.find(d => d.id === domainId); if (!domain) return;
    const M = window.PortalAnalytics;
    const model = mode === 'records' ? M.submissions(readBook().records.filter(r => r.id === entityId), basis, dataOrigin()) : M.workbook(mode === 'demo' ? window.PortalDemoData.workbook : window.PortalCountyData);
    const entity = model.entities.find(item => item.id === entityId); if (!entity) return;
    const facts = model.facts.filter(f => f.entityId === entityId && f.domainId === domainId);
    const dialog = document.getElementById('details-dialog');
    const labels = { valid: 'معتبر', unknown: 'نامشخص', missing: 'ثبت‌نشده', invalid: 'نامعتبر' };
    function row(f) { return '<tr><th scope="row">' + e(f.title) + '</th><td>' + (f.status === 'valid' ? e(D.fa(f.value)) : '—') + '</td><td>' + e(labels[f.status]) + '</td></tr>'; }
    const extras = model.extras.filter(f => f.entityId === entityId && f.domainId === domainId);
    const items = model.items.filter(f => f.entityId === entityId && f.domainId === domainId);
    dialog.innerHTML = '<div class="dialog-head"><h2 id="details-dialog-title">' + e(entity.name + ' · ' + domain.title) + '</h2><button class="icon-button" data-standalone="close-details" aria-label="بستن">' + icon('close') + '</button></div><div class="dialog-body"><p class="bi-data-explain">' + (mode === 'demo' ? 'داده آزمایشی شهرستان؛ همه مقادیر این پنجره غیرواقعی‌اند.' : mode === 'source' ? 'مقادیر اصلی شهرستان؛ بدون پر کردن سلول خالی.' : (model.origin === 'demo' ? 'پرونده آزمایشی؛ مقادیر ساختگی‌اند. ' : '') + (basis === 'latest' ? 'آخرین فرم ذخیره‌شده' : 'آخرین نسخه ارسال‌شده') + ' · کد مرکز: ' + e(D.fa(entity.code)) + ' · شهرستان: ' + e(entity.county)) + '</p><div class="bi-table-scroll"><table class="bi-detail-table"><caption class="sr-only">جزئیات شاخص‌های حوزه</caption><thead><tr><th scope="col">شاخص</th><th scope="col">مقدار</th><th scope="col">وضعیت داده</th></tr></thead><tbody>' + facts.map(row).join('') + '</tbody></table></div>' + (extras.length ? '<h3 class="bi-detail-subtitle">فیلدهای تکمیلی</h3><div class="bi-table-scroll"><table class="bi-detail-table"><tbody>' + extras.map(row).join('') + '</tbody></table></div>' : '') + (items.length ? '<h3 class="bi-detail-subtitle">جزئیات اقلام</h3><div class="bi-table-scroll"><table class="bi-detail-table"><thead><tr><th>محل</th><th>تجهیز</th><th>تعداد</th></tr></thead><tbody>' + items.map(i => '<tr><td>' + e(i.place) + '</td><td>' + e(i.title) + '</td><td>' + e(D.fa(i.count)) + '</td></tr>').join('') + '</tbody></table></div>' : '') + '</div><div class="dialog-footer"><button class="button button-secondary" data-standalone="close-details">بستن</button></div>';
    dialog.showModal();
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-standalone]'); if (!button) return;
    const action = button.dataset.standalone;
    if (action === 'menu') setMenu(true);
    if (action === 'close-menu') setMenu(false);
    if (action === 'data') { if (menuOpen) setMenu(false); openData(); }
    if (action === 'close-data') document.getElementById('data-dialog').close();
    if (action === 'close-details') document.getElementById('details-dialog').close();
    if (action === 'import-portal') result(importPortal());
    if (action === 'import-file') document.getElementById('records-file').click();
    if (action === 'export-json') downloadJSON();
    if (action === 'reset-demo' && confirm('داده واردشده داشبورد با نمونه‌ها جایگزین شود؟ در صورت نیاز، ابتدا نسخه JSON را دریافت کنید.')) result(saveBook(seedBook()));
    if (action === 'theme') {
      const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = theme;
      try { localStorage.setItem(THEME, theme); } catch (_) {}
      button.outerHTML = themeButton(); document.querySelector('[data-standalone="theme"]')?.focus();
    }
  });
  document.addEventListener('change', async event => {
    if (event.target.id !== 'records-file') return;
    const file = event.target.files[0]; if (!file) return;
    if (file.size > MAX_BYTES) { toast('حجم فایل باید حداکثر ۵ مگابایت باشد.', true); event.target.value = ''; return; }
    try { result(importBook(JSON.parse(await file.text()), 'file', file.name)); }
    catch (_) { toast('فایل JSON خوانده نشد؛ داده قبلی حفظ شد.', true); }
    event.target.value = '';
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menuOpen) setMenu(false);
    if (event.key === 'Tab' && menuOpen) {
      const items = Array.from(document.getElementById('sidebar').querySelectorAll('a,button')).filter(n => n.getClientRects().length);
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
    }
  });
  matchMedia('(min-width:1024px)').addEventListener('change', event => { if (event.matches && menuOpen) setMenu(false); });
  window.Portal = Object.freeze({ KEY, COPYKEY: 'education-needs-bi:metadata:v1', labels,
    list: () => clone(readBook().records), text: (key, fallback) => fallback, dataLabel, origin: dataOrigin,
    importBook, importPortal, normalizeRecords, exportBook: () => clone(readBook()), resetDemo: () => saveBook(seedBook()) });
  window.PortalUI = Object.freeze({ shell, icon, toast, details, closeMenu: () => setMenu(false),
    footer: () => '<footer class="page-footer"><span>اطلس تحلیل آموزشی · بررسی نیازهای خراسان شمالی</span><span>نسخه ' + D.fa('2.1.0') + '</span></footer>' });
})();
