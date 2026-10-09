/* Standalone dashboard. Every visual is derived from the selected analytical facts. */
(function () {
  'use strict';
  if (document.body.dataset.page !== 'analytics') return;
  const D = window.PortalData, P = window.Portal, UI = window.PortalUI, M = window.PortalAnalytics, A = window.EducationAnalysis;
  const root = document.getElementById('page-content'), e = D.escape;
  const colors = { valid: '#008795', missing: '#cbd5e1', unknown: '#c68a20', invalid: '#cc5261', approved: '#008795', submitted: '#467cb3', resubmitted: '#7b68aa', changes_requested: '#c68a20', draft: '#94a3b8' };
  const qualityLabels = { valid: 'مقدار معتبر', missing: 'ثبت‌نشده', unknown: 'نامشخص / علامت *', invalid: 'مقدار نامعتبر' };
  const params = new URLSearchParams(location.search);
  const state = { mode: ['demo', 'source', 'records'].includes(params.get('mode')) ? params.get('mode') : 'demo',
    compareA: D.counties.includes(params.get('compareA')) ? params.get('compareA') : '',
    compareB: D.counties.includes(params.get('compareB')) ? params.get('compareB') : '',
    view: ['overview', 'domain', 'indicators', 'quality'].includes(params.get('view')) ? params.get('view') : 'overview',
    county: D.counties.includes(params.get('county')) ? params.get('county') : '',
    domain: D.definitions.some(d => d.id === params.get('domain')) ? params.get('domain') : '',
    metric: params.get('metric') || '', basis: params.get('basis') === 'latest' ? 'latest' : 'submitted',
    type: D.profileChoices.type.includes(params.get('type')) ? params.get('type') : '',
    status: Object.hasOwn(P.labels, params.get('status') || '') ? params.get('status') : '',
    period: /^\d{4}$/.test(params.get('period') || '') ? params.get('period') : '',
    days: ['7', '30'].includes(params.get('days')) ? params.get('days') : '',
    search: (params.get('search') || '').slice(0, 180), group: (params.get('group') || '').slice(0, 180),
    kind: ['need', 'existing', 'base', 'descriptive'].includes(params.get('kind')) ? params.get('kind') : '',
    quality: ['complete', 'partial', 'empty', 'unknown', 'invalid'].includes(params.get('quality')) ? params.get('quality') : '',
    sort: ['coverage', 'name'].includes(params.get('sort')) ? params.get('sort') : '' };
  let refreshedAt = new Date(), selected, scope, full, searchTimer;
  function number(value) { return value === null || value === undefined ? '—' : new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 }).format(value); }
  function percent(value) { return value === null ? '—' : number(value) + '٪'; }
  function domainTitle(domain) { return P.text('domain.' + domain.id, domain.title); }
  function rowTitle(domain, row) { return P.text('indicator.' + domain.id + '.' + row.id, row.title); }
  function icon(name) {
    const paths = { download: '<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>', refresh: '<path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5"/>', filter: '<path d="M3 4h18l-7 8v7l-4 2v-9Z"/>', print: '<path d="M6 8V3h12v5M6 17H3V8h18v9h-3M6 14h12v7H6ZM17 11h.01"/>', spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>', check: '<path d="m5 12 4 4L19 6"/>', warning: '<path d="m12 3 10 18H2ZM12 9v5m0 3h.01"/>' };
    return paths[name] ? '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' + paths[name] + '</svg>' : UI.icon(name);
  }
  function field(id, label, options, value) {
    return '<div class="bi-filter"><label for="' + id + '">' + e(label) + '</label><select class="field" id="' + id + '" data-bi-filter="' + id.replace('bi-', '') + '">' + options.map(o => '<option value="' + e(o.value) + '"' + (o.value === value ? ' selected' : '') + '>' + e(o.label) + '</option>').join('') + '</select></div>';
  }
  function options(values, label) { return [{ value: '', label }, ...values.map(value => ({ value, label: value }))]; }
  function prepare() {
    if (state.view === 'domain' && !state.domain) state.domain = 'space';
    if (state.group && !D.definitions.some(d => (!state.domain || d.id === state.domain) && d.rows.some(r => r.group === state.group))) state.group = '';
    full = state.mode === 'records' ? M.submissions(P.list(), state.basis, P.origin()) : M.workbook(state.mode === 'demo' ? window.PortalDemoData.workbook : window.PortalCountyData);
    scope = M.filter(full, { county: state.county, domain: state.domain,
      type: state.mode === 'records' ? state.type : '', status: state.mode === 'records' ? state.status : '',
      period: state.mode === 'records' ? state.period : '', days: state.mode === 'records' ? state.days : '' });
    selected = state.group ? { ...scope, facts: scope.facts.filter(f => f.group === state.group),
      audits: scope.audits.filter(a => scope.facts.some(f => f.group === state.group && f.domainId === a.domainId && f.rowId === a.rowId)) } : scope;
    const eligible = D.definitions.filter(d => !state.domain || d.id === state.domain);
    if (!eligible.some(d => d.rows.some(r => (!state.group || r.group === state.group) && M.key(d.id, r.id) === state.metric))) {
      const domain = eligible.find(d => d.id === 'students') || eligible[0];
      const rows = domain.rows.filter(r => !state.group || r.group === state.group);
      const valid = r => M.metric(selected, M.key(domain.id, r.id)).quality.valid > 0;
      const row = rows.find(r => r.kind === 'count' && M.isNeed(r) && valid(r)) || rows.find(valid) || rows.find(r => r.kind === 'count' && M.isNeed(r)) || rows[0] || domain.rows[0];
      state.metric = M.key(domain.id, row.id);
    }
    const counties = M.metric(selected, state.metric).counties;
    const known = [...counties].filter(c => c.value !== null).sort((a, b) => b.value - a.value);
    if (!counties.some(c => c.county === state.compareA)) state.compareA = (known[0] || counties[0])?.county || '';
    if (state.compareB === state.compareA || !counties.some(c => c.county === state.compareB)) {
      state.compareB = (known.find(c => c.county !== state.compareA) || counties.find(c => c.county !== state.compareA))?.county || '';
    }
  }
  function syncURL() {
    const query = new URLSearchParams();
    for (const name of ['mode', 'view', 'compareA', 'compareB', 'county', 'domain', 'metric', 'basis', 'type', 'status', 'period', 'days', 'search', 'group', 'kind', 'quality', 'sort']) if (state[name]) query.set(name, state[name]);
    history.replaceState(null, '', './index.html?' + query.toString());
  }
  function hero() {
    const titles = { overview: 'نمای مدیریتی نیازهای آموزشی', domain: 'تحلیل ' + (A.domainInfo[state.domain]?.short || 'حوزه'), indicators: 'مقایسه همه شاخص‌ها', quality: 'بررسی کیفیت و نواقص داده' };
    return '<section class="bi-hero"><div><span class="bi-eyebrow">' + icon('chart') + ' اطلس آموزشی خراسان شمالی</span><h1>' + e(titles[state.view]) + '</h1><p>از وضعیت استان به حوزه، شاخص و شهرستان برسید.</p><div class="bi-hero-meta">' + number(D.counties.length) + ' شهرستان<span>·</span>' + number(D.definitions.length) + ' حوزه<span>·</span>' + number(D.indicatorCount) + ' شاخص</div></div><div class="bi-hero-actions"><div><button class="button" data-bi-action="refresh" id="bi-refresh">' + icon('refresh') + 'بازمحاسبه</button><button class="button" data-bi-action="print">' + icon('print') + 'چاپ / PDF</button><button class="button bi-export" data-bi-action="export">' + icon('download') + 'خروجی CSV</button></div></div></section>';
  }
  function modes() {
    return '<div class="bi-source-switch" role="tablist" aria-label="منبع اطلاعات"><span>منبع تحلیل</span>' + [['demo', 'داده آزمایشی کامل', 'spark'], ['source', 'جداول اصلی شهرستان‌ها', 'chart'], ['records', 'پرونده‌های ثبت‌شده', 'file']].map(([mode, label, image]) => '<button type="button" role="tab" id="bi-mode-' + mode + '" aria-selected="' + (state.mode === mode) + '" aria-controls="bi-report" tabindex="' + (state.mode === mode ? 0 : -1) + '" class="' + (state.mode === mode ? 'is-active' : '') + '" data-bi-action="mode" data-mode="' + mode + '">' + icon(image) + e(label) + '</button>').join('') + '</div>';
  }
  function filters() {
    let html = field('bi-county', 'شهرستان', options(D.counties, 'همه شهرستان‌ها'), state.county) +
      field('bi-domain', 'حوزه نیازسنجی', [{ value: '', label: 'همه حوزه‌ها' }, ...D.definitions.map(d => ({ value: d.id, label: domainTitle(d) }))], state.domain);
    if (state.mode === 'records') {
      html += field('bi-type', 'نوع مرکز', options(D.profileChoices.type, 'همه مراکز'), state.type) +
        field('bi-period', 'دوره نیازسنجی', options([...new Set([...full.entities.map(e => e.period), ...(state.period ? [state.period] : [])])], 'همه دوره‌ها'), state.period) +
        field('bi-status', 'وضعیت پرونده', [{ value: '', label: 'همه وضعیت‌ها' }, ...Object.entries(P.labels).map(([value, label]) => ({ value, label }))], state.status) +
        field('bi-days', state.basis === 'latest' ? 'زمان آخرین فعالیت' : 'زمان آخرین ارسال', [{ value: '', label: 'همه تاریخ‌ها' }, { value: '30', label: '۳۰ روز گذشته' }, { value: '7', label: '۷ روز گذشته' }], state.days);
    }
    return '<section class="panel bi-filter-panel" aria-label="فیلترهای گزارش"><div class="bi-filter-title">' + icon('filter') + '<strong>محدوده تحلیل</strong><button class="text-button" data-bi-action="reset" id="bi-reset">پاک کردن فیلترها</button></div><div class="bi-filters ' + (state.mode === 'records' ? 'bi-filters-records' : '') + '">' + html + '</div>' + (state.mode === 'records' ? '<div class="bi-basis">' + field('bi-basis', 'مبنای اطلاعات فرم', [{ value: 'submitted', label: 'آخرین نسخه ارسال‌شده؛ پیش‌نویس‌ها کنار گذاشته می‌شوند' }, { value: 'latest', label: 'آخرین فرم ذخیره‌شده؛ شامل پیش‌نویس و اصلاحات' }], state.basis) + '<span>' + e(P.dataLabel()) + '</span></div>' : '') + '</section>';
  }
  function demoBanner() {
    if (full.origin !== 'demo') return '';
    const note = state.mode === 'demo' ? '۲۵۰۰ مقدار آزمایشی برای ۲۵۰ شاخص در ۱۰ شهرستان. این سناریو برای بررسی نمودارها و امکانات تحلیل است.' : number(P.list().length) + ' پرونده آزمایشی برای بررسی فیلترها و گردش پرونده‌ها؛ تعداد در محدوده فعلی با مبنای فرم و فیلترها تغییر می‌کند.';
    return '<aside class="bi-demo-banner" aria-label="ماهیت آزمایشی داده"><span class="bi-demo-badge">آزمایشی</span><div><strong>همه مقادیر این منبع ساختگی‌اند</strong><p>' + note + '</p></div><button class="text-button" data-bi-action="mode" data-mode="source">مشاهده جداول اصلی' + icon('chevron') + '</button></aside>';
  }
  function card(value, title, note, image, tone) {
    return '<article class="panel bi-kpi ' + (tone || '') + '"><div class="bi-kpi-top"><span>' + e(title) + '</span><span class="bi-kpi-icon">' + icon(image) + '</span></div><strong class="bi-kpi-value">' + value + '</strong><small>' + e(note) + '</small></article>';
  }
  function kpis() {
    if (state.view === 'domain') return focusCards();
    const s = M.summary(selected), q = s.quality;
    return '<section class="bi-kpis" aria-label="شاخص‌های کلیدی">' + (state.mode !== 'records' ?
      card(number(s.counties), 'شهرستان دارای مقدار معتبر', 'از ' + number(selected.entities.length) + ' شهرستان در محدوده', 'building') +
      card(percent(q.percent), 'پوشش داده‌های جدول', number(q.valid) + ' مقدار معتبر از ' + number(q.total) + ' سلول', 'check', 'bi-kpi-accent') +
      card(number(s.needIndicators), 'شاخص نیاز با مقدار مثبت', 'تعداد شاخص‌ها؛ نیازهای مختلف با هم جمع نشده‌اند', 'chart') +
      card(number(q.missing + q.unknown + q.invalid), 'مقدار نیازمند پیگیری', 'ثبت‌نشده، نامشخص یا نامعتبر', 'warning', 'bi-kpi-warning') :
      card(number(s.entities), 'پرونده در محدوده تحلیل', number(new Set(selected.entities.map(e => e.county)).size) + ' شهرستان · مبنای انتخاب‌شده', 'file') +
      card(percent(s.approvalPercent), 'نرخ تأیید پرونده‌ها', number(s.approved) + ' پرونده تأییدشده از ' + number(s.entities), 'check', 'bi-kpi-accent') +
      card(percent(q.percent), 'پوشش مقادیر شاخص‌ها', number(q.valid) + ' مقدار معتبر از ' + number(q.total), 'chart') +
      card(number(state.domain && state.domain !== 'safety' ? null : s.safetyEntities), 'مرکز دارای نیاز ایمنی', state.domain && state.domain !== 'safety' ? 'حوزه ایمنی در فیلتر فعلی نیست' : 'نیاز مثبت ایمنی یا فقدان اعلام / اطفای حریق', 'warning', 'bi-kpi-warning')) + '</section>';
  }
  function panelHeader(title, description, tag) {
    return '<div class="bi-panel-header"><div><h2>' + e(title) + '</h2><p>' + e(description) + '</p></div>' + (tag ? '<span class="bi-tag">' + e(tag) + '</span>' : '') + '</div>';
  }
  function empty(title, note) { return '<div class="bi-empty">' + icon('chart') + '<strong>' + e(title) + '</strong><p>' + e(note || 'فیلترها را تغییر دهید یا اطلاعات این شاخص را تکمیل کنید.') + '</p></div>'; }
  function metricSelector() {
    return '<label class="bi-metric-label" for="bi-metric">شاخص موردنظر برای مقایسه</label><select id="bi-metric" class="field" data-bi-filter="metric">' + D.definitions.filter(d => !state.domain || d.id === state.domain).map(d => '<optgroup label="' + e(domainTitle(d)) + '">' + d.rows.filter(r => !state.group || r.group === state.group).map(r => '<option value="' + M.key(d.id, r.id) + '"' + (state.metric === M.key(d.id, r.id) ? ' selected' : '') + '>' + e(rowTitle(d, r)) + '</option>').join('') + '</optgroup>').join('') + '</select>';
  }
  function metricPanel() {
    const m = M.metric(selected, state.metric), [domainId, rowId] = state.metric.split(':');
    const domain = D.definitions.find(d => d.id === domainId), row = domain.rows.find(r => r.id === rowId);
    const maximum = Math.max(1, ...m.counties.map(c => c.value || 0));
    let chart;
    if (m.numeric) {
      chart = '<div class="bi-bars" aria-label="مقادیر شاخص به تفکیک شهرستان">' + m.counties.map(c => '<button class="bi-bar-row" data-bi-action="county" data-county="' + e(c.county) + '" aria-label="' + e(c.county + ': ' + (c.value === null ? 'داده ثبت نشده' : number(c.value)) + '؛ ' + number(c.quality.valid) + ' مقدار معتبر از ' + number(c.quality.total) + '؛ فیلتر این شهرستان') + '"><span class="bi-bar-name">' + e(c.county) + '</span><span class="bi-bar-track"><span class="bi-bar-fill" style="width:' + (c.value === null ? 0 : c.value / maximum * 100) + '%"></span>' + (c.value === null ? '<span class="bi-no-value">فاقد مقدار معتبر</span>' : '') + '</span><b>' + number(c.value) + (c.quality.valid && c.quality.valid < c.quality.total ? '<span title="جمع ناقص؛ بعضی مقادیر موجود نیستند">*</span>' : '') + '</b></button>').join('') + '</div>';
    } else {
      chart = m.distribution.length ? '<div class="bi-distribution">' + m.distribution.map(item => '<div><span>' + e(D.fa(item.label)) + '</span><b>' + number(item.value) + ' ' + (state.mode !== 'records' ? 'شهرستان' : 'مرکز') + '</b></div>').join('') + '</div>' : empty('برای این شاخص مقدار معتبری ثبت نشده');
    }
    const audit = !state.county && selected.audits.find(a => a.domainId === domainId && a.rowId === rowId);
    return '<section class="panel bi-panel bi-main-chart">' + panelHeader('مقایسه شهرستان‌ها', 'روی نام یا میله هر شهرستان کلیک کنید تا گزارش فیلتر شود.', m.numeric ? 'یک شاخص، یک واحد' : 'توزیع پاسخ‌ها') + '<div class="bi-metric-controls">' + metricSelector() + '</div><div class="bi-metric-summary"><div><span>' + e(rowTitle(domain, row)) + '</span><strong>' + (m.numeric ? number(m.sum) : number(m.quality.valid)) + '<small>' + (m.numeric ? 'جمع مقادیر معتبر' : 'پاسخ معتبر') + '</small></strong></div><span class="bi-tag">' + number(m.quality.valid) + ' از ' + number(m.quality.total) + ' ' + (state.mode !== 'records' ? 'شهرستان' : 'مرکز') + ' دارای داده</span></div>' + chart + '<p class="bi-chart-note">' + (m.numeric ? 'عدد صفر یعنی مقدار صفر ثبت شده؛ خط تیره یعنی مقدار معتبر موجود نیست. علامت * کنار جمع یعنی بخشی از داده‌ها ناقص است.' : 'مقادیر متنی، وجود/عدم وجود و سال، جمع عددی نمی‌شوند.') + '</p>' + (audit ? '<div class="bi-inline-warning">' + icon('warning') + '<span>جمع فایل: ' + number(audit.reported) + '؛ جمع مقادیر موجود: ' + number(audit.calculated) + (audit.partial ? '؛ برخی شهرستان‌ها داده ندارند.' : '؛ این مغایرت باید بررسی شود.') + '</span></div>' : '') + '</section>';
  }
  function comparisonPanel() {
    const result = A.compareCounties(selected, state.metric, state.compareA, state.compareB), m = result.metric;
    if (!m.numeric) return '';
    const names = m.counties.map(c => c.county);
    if (names.length < 2) return '<section class="panel bi-panel bi-wide">' + panelHeader('مقایسه دو شهرستان', 'برای مقایسه این شاخص، دست‌کم دو شهرستان در محدوده لازم است.') + '<button class="button button-secondary" data-bi-action="compare-all">نمایش همه شهرستان‌ها برای مقایسه</button></section>';
    const choices = names.map(county => ({ value: county, label: county }));
    function valueCard(county) {
      return '<div><span>' + e(county.county) + '</span><strong>' + number(county.value) + '</strong><small>' + number(county.quality.valid) + ' از ' + number(county.quality.total) + ' مقدار معتبر</small></div>';
    }
    const leaders = A.concentration(selected, state.metric).slice(0, 3);
    const partial = m.quality.valid !== m.quality.total;
    const note = !result.ready ? 'برای محاسبه اختلاف، هر دو شهرستان باید مقدار معتبر و پوشش کامل داشته باشند. داده ناقص با صفر مقایسه نمی‌شود.' : result.first.value === 0 ? 'اختلاف عددی قابل محاسبه است؛ درصد اختلاف با مبنای صفر تعریف نمی‌شود.' : 'اختلاف = مقدار شهرستان دوم منهای اول؛ درصد اختلاف با مبنای شهرستان اول محاسبه می‌شود.';
    return '<section class="panel bi-panel bi-wide bi-comparison-panel">' + panelHeader('مقایسه دو شهرستان و تمرکز مقدار', 'مقایسه فقط برای شاخص انتخاب‌شده و فیلترهای فعلی انجام می‌شود.', 'همان شاخص نمودار بالا') + '<div class="bi-comparison-layout"><div><div class="bi-comparison-selects">' + field('bi-compareA', 'شهرستان اول · مبنا', choices, state.compareA) + field('bi-compareB', 'شهرستان دوم', choices.filter(c => c.value !== state.compareA), state.compareB) + '</div><div class="bi-comparison-values">' + valueCard(result.first) + valueCard(result.second) + '<div class="bi-comparison-delta"><span>اختلاف دوم با اول</span><strong>' + number(result.difference) + '</strong><small>واحد همان شاخص</small></div><div class="bi-comparison-delta"><span>درصد اختلاف نسبت به اول</span><strong>' + percent(result.changePercent) + '</strong><small>تفاوت مقدار؛ شاخص تحقق نیاز نیست</small></div></div><p class="bi-chart-note">' + note + '</p></div><aside class="bi-concentration"><h3>سه شهرستان با بیشترین مقدار معلوم</h3>' + (leaders.length ? '<ol>' + leaders.map(county => '<li><span>' + e(county.county) + '<small>' + number(county.value) + (county.partial ? '*' : '') + ' · مقدار معلوم</small></span><b>' + percent(county.share) + '</b></li>').join('') + '</ol>' : '<p>مقدار عددی مثبت برای محاسبه سهم ثبت نشده است.</p>') + '<p class="bi-chart-note">سهم از مجموع مقادیر معتبر همین شاخص در محدوده فعلی.' + (partial ? ' مجموع معلوم ناقص است؛ شهرستان فاقد مقدار در محاسبه سهم نیست.' : '') + ' این سهم، اولویت بودجه را تعیین نمی‌کند.</p></aside></div></section>';
  }
  function donut(items, label, center, note) {
    const total = items.reduce((n, item) => n + item.value, 0);
    let current = 0;
    const gradient = total ? items.filter(item => item.value).map(item => { const start = current; current += item.value / total * 100; return item.color + ' ' + start + '% ' + current + '%'; }).join(',') : 'var(--border) 0% 100%';
    return '<div class="bi-donut" role="img" aria-label="' + e(label + '؛ ' + items.map(i => i.label + ': ' + number(i.value)).join('، ')) + '" style="background:conic-gradient(' + gradient + ')"><div><strong>' + center + '</strong><span>' + e(note) + '</span></div></div><ul class="bi-legend">' + items.map(item => '<li><span><i style="background:' + item.color + '"></i>' + e(item.label) + '</span><b>' + number(item.value) + '<small>' + (total ? percent(Math.round(item.value / total * 100)) : '—') + '</small></b></li>').join('') + '</ul>';
  }
  function qualityPanel() {
    const q = M.quality(selected.facts);
    return '<section class="panel bi-panel">' + panelHeader('کیفیت و پوشش اطلاعات', 'میزان قابل اتکا بودن نمای فعلی', 'کل محدوده') + donut(Object.keys(qualityLabels).map(status => ({ label: qualityLabels[status], value: q[status], color: colors[status] })), 'کیفیت داده', percent(q.percent), 'مقدار معتبر') + '<div class="bi-info-note">' + icon('info') + '<p>سلول خالی و مقدار نامشخص وارد جمع نمی‌شوند. کامل بودن داده به معنی تأیید صحت آن نیست.</p></div></section>';
  }
  function needsPanel() {
    const ds = M.domains(selected), unit = state.mode !== 'records' ? 'شهرستان' : 'مرکز';
    const maximum = Math.max(1, selected.entities.length);
    return '<section class="panel bi-panel">' + panelHeader(unit + '‌های دارای نیاز در هر حوزه', 'هر ' + unit + ' در هر حوزه حداکثر یک بار شمرده می‌شود.', 'تعداد ' + unit) + '<div class="bi-domain-bars">' + ds.map(d => '<button data-bi-action="domain" data-domain="' + d.id + '" class="bi-domain-row"><span>' + e(domainTitle(d)) + '<small>پوشش داده ' + percent(d.quality.percent) + '</small></span><div><span style="width:' + d.needEntities / maximum * 100 + '%"></span></div><b>' + number(d.needEntities) + '</b></button>').join('') + '</div><p class="bi-chart-note">نیاز مثبت در یکی از شاخص‌های موردنیاز، نیازمند یا فاقد. این نمودار شدت نیاز یا رتبه اولویت بودجه نیست.</p></section>';
  }
  function pairsPanel() {
    const pairs = M.pairs(selected).filter(pair => state.view === 'domain' || pair.existing.quality.valid || pair.needed.quality.valid);
    return '<section class="panel bi-panel bi-pair-panel">' + panelHeader('امکانات موجود و نیاز اعلام‌شده', 'هر ردیف یک شاخص هم‌نوع است؛ داده خالی با خط تیره نمایش داده می‌شود.', number(pairs.length) + ' جفت شاخص') + '<div class="bi-pair-legend"><span><i></i>موجود</span><span><i></i>نیاز اعلام‌شده</span></div>' + (pairs.length ? '<div class="bi-pairs">' + pairs.map(pair => {
      const max = Math.max(1, pair.existing.sum || 0, pair.needed.sum || 0);
      return '<div class="bi-pair"><strong>' + e(pair.title) + '</strong>' + [['existing', pair.existing], ['needed', pair.needed]].map(([kind, m]) => '<div><span class="bi-pair-track"><i class="' + kind + '" style="width:' + (m.sum || 0) / max * 100 + '%"></i></span><b>' + number(m.sum) + (m.quality.valid && m.quality.valid < m.quality.total ? '*' : '') + '</b></div>').join('') + '<small class="bi-pair-coverage">پوشش موجود: ' + number(pair.existing.quality.valid) + ' از ' + number(pair.existing.quality.total) + ' · پوشش موردنیاز: ' + number(pair.needed.quality.valid) + ' از ' + number(pair.needed.quality.total) + '</small></div>';
    }).join('') + '</div>' : empty('جفت موجود / نیاز دارای داده نداریم', 'در این محدوده، شاخص جفت تعریف نشده یا هیچ مقدار معتبری برای آن ثبت نشده است.')) + '<p class="bi-chart-note">«موردنیاز» نیاز اعلام‌شده است؛ کمبود از تفریق «موجود» به دست نیامده. خط تیره مقدار ثبت‌نشده را نشان می‌دهد.</p></section>';
  }
  function heatmap() {
    const ds = M.domains(selected), rows = M.matrix(selected);
    return '<section class="panel bi-panel bi-wide">' + panelHeader('ماتریس پوشش شهرستان‌ها و حوزه‌ها', 'هر خانه درصد مقادیر معتبر است. با انتخاب آن، شهرستان و حوزه هم‌زمان فیلتر می‌شوند.', 'پوشش داده، نه حجم نیاز') + '<div class="bi-table-scroll"><table class="bi-matrix"><caption class="sr-only">درصد پوشش شاخص‌ها در هر شهرستان و حوزه</caption><thead><tr><th scope="col">شهرستان</th>' + ds.map(d => '<th scope="col">' + e(domainTitle(d)) + '</th>').join('') + '</tr></thead><tbody>' + rows.map(row => '<tr><th scope="row">' + e(row.county) + '</th>' + ds.map(d => {
      const q = row.domains.find(domain => domain.id === d.id)?.quality, p = q?.percent ?? null;
      return '<td><button class="bi-heat-cell heat-' + (p === null || p === 0 ? 'empty' : p < 35 ? 'low' : p < 75 ? 'mid' : 'high') + '" data-bi-action="cell" data-county="' + e(row.county) + '" data-domain="' + d.id + '" aria-label="' + e(row.county + '، ' + domainTitle(d) + '، پوشش ' + percent(p) + '، ' + number(q?.valid) + ' از ' + number(q?.total) + ' مقدار؛ فیلتر این خانه') + '">' + percent(p) + '</button></td>';
    }).join('') + '</tr>').join('') + '</tbody></table></div><div class="bi-heat-legend"><span>پوشش داده</span><i class="heat-empty"></i><span>صفر</span><i class="heat-low"></i><span>کمتر از ۳۵٪</span><i class="heat-mid"></i><span>۳۵ تا ۷۴٪</span><i class="heat-high"></i><span>۷۵ تا ۱۰۰٪</span></div></section>';
  }
  function workflowPanels() {
    const items = Object.entries(P.labels).map(([status, label]) => ({ label, value: selected.entities.filter(entity => entity.status === status).length, color: colors[status] }));
    const days = M.timeline(selected), max = Math.max(1, ...days.map(d => d.value));
    return '<section class="panel bi-panel">' + panelHeader('گردش بررسی پرونده‌ها', 'وضعیت جاری پرونده‌ها در محدوده انتخاب‌شده') + donut(items, 'وضعیت پرونده‌ها', number(selected.entities.length), 'پرونده') + '</section><section class="panel bi-panel">' + panelHeader('آخرین ارسال مراکز در ۱۴ روز اخیر', 'هر پرونده در روز آخرین ارسال خود، یک بار شمرده می‌شود.', 'تاریخ واقعی رکورد') + '<div class="bi-timeline" aria-label="تعداد آخرین ارسال پرونده‌ها در ۱۴ روز اخیر">' + days.map(day => '<div title="' + e(new Intl.DateTimeFormat('fa-IR', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(day.at)) + ': ' + number(day.value) + ' پرونده') + '"><b>' + number(day.value) + '</b><span><i style="height:' + day.value / max * 100 + '%"></i></span><small>' + e(new Intl.DateTimeFormat('fa-IR', { day: 'numeric', timeZone: 'UTC' }).format(new Date(day.at))) + '</small></div>').join('') + '</div><p class="bi-chart-note">این روند، تعداد کل دفعات ارسال یا تاریخچه تغییر نیازها نیست. پرونده بدون تاریخ ارسال معتبر شمرده نمی‌شود.</p></section>';
  }
  function insights() {
    const q = M.quality(selected.facts), audits = selected.audits;
    return '<section class="bi-insights" aria-label="نکات قابل پیگیری"><article><span>' + icon('info') + '</span><div><h3>' + (q.percent === 100 ? 'همه مقادیر جدول ثبت شده‌اند' : 'تکمیل اطلاعات پیش از تصمیم نهایی') + '</h3><p>' + number(q.missing) + ' مقدار ثبت‌نشده و ' + number(q.unknown) + ' مقدار نامشخص در این محدوده وجود دارد.</p></div></article><article><span>' + icon('warning') + '</span><div><h3>' + (state.mode !== 'records' ? number(audits.length) + ' جمع منبع نیازمند بازبینی' : 'مبنای ارسال و تأیید را جدا ببینید') + '</h3><p>' + (state.mode !== 'records' ? 'جمع ستون منبع با مقادیر موجود شهرستان‌ها تطبیق داده شد. بازبینی جمع، مربوط به کل فایل است.' : 'فیلتر «تأیید شده» فقط پرونده‌های نهایی را نشان می‌دهد؛ پیش‌نویس از مبنای ارسال حذف است.') + '</p></div></article><article><span>' + icon('spark') + '</span><div><h3>نیازهای هم‌پوشان، افراد متفاوت نیستند</h3><p>یک دانش‌آموز می‌تواند چند نیاز داشته باشد. جمع چند گروه حمایتی، تعداد افراد یکتا را نشان نمی‌دهد.</p></div></article></section>';
  }
  function detailsTable() {
    const m = M.metric(selected, state.metric), entityMap = new Map(selected.entities.map(e => [e.id, e]));
    const [domainId, rowId] = state.metric.split(':'), domain = D.definitions.find(d => d.id === domainId), row = domain.rows.find(r => r.id === rowId);
    const rows = m.facts.map(f => {
      const entity = entityMap.get(f.entityId);
      return '<tr><th scope="row">' + e(entity.name) + (entity.code ? '<small>کد ' + e(D.fa(entity.code)) + '</small>' : '') + '</th>' + (state.mode === 'records' ? '<td>' + e(entity.county) + '</td>' : '') + '<td class="bi-value-cell">' + (f.status === 'valid' ? e(f.kind === 'count' ? number(f.value) : D.fa(f.value)) : '—') + '</td><td><span class="bi-data-status data-' + f.status + '">' + e(qualityLabels[f.status]) + '</span></td><td><button type="button" class="text-button" data-bi-action="details" data-entity="' + e(entity.id) + '" data-domain="' + domainId + '">' + (state.mode !== 'records' ? 'جدول منبع' : 'پرونده مرکز') + icon('chevron') + '</button></td></tr>';
    }).join('');
    return '<section class="panel bi-panel bi-wide">' + panelHeader('جزئیات شاخص انتخاب‌شده', rowTitle(domain, row), number(m.facts.length) + ' ردیف') + '<div class="bi-table-scroll"><table class="bi-detail-table"><caption class="sr-only">' + e(rowTitle(domain, row)) + '</caption><thead><tr><th scope="col">' + (state.mode !== 'records' ? 'شهرستان' : 'مرکز / کد') + '</th>' + (state.mode === 'records' ? '<th scope="col">شهرستان</th>' : '') + '<th scope="col">مقدار معتبر</th><th scope="col">وضعیت داده</th><th scope="col">مشاهده</th></tr></thead><tbody>' + rows + '</tbody></table></div></section>';
  }
  function viewTabs() {
    return '<nav class="bi-view-tabs" aria-label="نمای تحلیل">' + [['overview', 'نمای مدیریتی'], ['domain', 'تحلیل هر حوزه'], ['indicators', 'جدول همه شاخص‌ها'], ['quality', 'کیفیت و نواقص داده']].map(([view, title]) => '<button type="button" data-bi-action="view" data-view="' + view + '" class="' + (state.view === view ? 'is-active' : '') + '"' + (state.view === view ? ' aria-current="page"' : '') + '>' + e(title) + '</button>').join('') + '</nav>';
  }
  function amount(row) {
    return row.metric.numeric ? number(row.metric.sum) : row.metric.quality.valid ? number(row.metric.quality.valid) : '—';
  }
  function coverageTag(row) {
    const q = row.metric.quality;
    return '<span class="bi-coverage-tag ' + (!q.valid ? 'is-empty' : row.partial ? 'is-partial' : 'is-complete') + '">' + (!q.valid ? 'فاقد مقدار معتبر' : row.partial ? 'داده ناقص · ' + percent(q.percent) : 'داده کامل') + '</span>';
  }
  function domainCards() {
    const reports = A.domainReports(scope);
    return '<section class="bi-domain-section" aria-labelledby="bi-domains-title"><div class="bi-section-heading"><div><h2 id="bi-domains-title">بررسی حوزه‌های نیازسنجی</h2><p>هر حوزه را باز کنید تا همه شاخص‌ها، موجودی و نیازهای آن را ببینید.</p></div><span>' + number(reports.length) + ' حوزه در محدوده</span></div><div class="bi-domain-cards">' + reports.map(d => '<button class="panel bi-domain-card" data-bi-action="open-domain" data-domain="' + d.id + '"><span class="bi-domain-card-head"><span class="bi-domain-symbol">' + UI.icon(d.id) + '</span><strong>' + e(d.short) + '</strong>' + icon('chevron') + '</span><span class="bi-domain-description">' + e(d.note) + '</span><span class="bi-domain-numbers"><span><b>' + number(d.indicators) + '</b> شاخص</span><span><b>' + number(d.positiveNeeds) + '</b> شاخص نیاز مثبت</span></span><span class="bi-card-coverage"><span>پوشش داده</span><b>' + percent(d.quality.percent) + '</b></span><span class="bi-progress"><i style="width:' + (d.quality.percent || 0) + '%"></i></span><span class="bi-domain-card-bottom">' + (!d.quality.valid ? 'اطلاعات این حوزه هنوز ثبت نشده' : number(d.quality.valid) + ' مقدار معتبر از ' + number(d.quality.total)) + '<span>بررسی حوزه</span></span></button>').join('') + '</div></section>';
  }
  function domainHeading() {
    const d = D.definitions.find(d => d.id === state.domain), q = M.quality(selected.facts);
    return '<section class="bi-domain-heading"><span class="bi-domain-symbol">' + UI.icon(d.id) + '</span><div><h2>' + e(d.title) + '</h2><p>' + e(A.domainInfo[d.id].note) + '</p></div><div class="bi-scope-chips"><span>' + number(A.catalog(selected).length) + ' شاخص</span><span>' + percent(q.percent) + ' پوشش</span><span>' + number(selected.entities.length) + ' ' + (state.mode !== 'records' ? 'شهرستان' : 'پرونده') + '</span></div></section>';
  }
  function focusCards() {
    const rows = A.catalog(selected);
    const ids = A.domainInfo[state.domain].focus.map(id => state.domain + ':' + id);
    const focus = (state.group ? rows.slice(0, 4) : ids.map(key => rows.find(r => r.key === key)).filter(Boolean));
    return '<section class="bi-kpis bi-focus-cards" aria-label="شاخص‌های حوزه">' + focus.map(row => '<button class="panel bi-kpi bi-focus-card" data-bi-action="indicator" data-metric="' + row.key + '"><span class="bi-kpi-top"><span>' + e(row.title) + '</span>' + icon('chart') + '</span><strong class="bi-kpi-value">' + amount(row) + '</strong><span class="bi-focus-unit">' + (row.metric.numeric ? 'جمع همین شاخص در محدوده' : 'پاسخ معتبر؛ توزیع در نمودار') + '</span>' + coverageTag(row) + '<small>' + number(row.metric.quality.valid) + ' از ' + number(row.metric.quality.total) + ' ' + (state.mode !== 'records' ? 'شهرستان' : 'مرکز') + ' دارای مقدار معتبر</small></button>').join('') + '</section>';
  }
  function groupCards() {
    const groups = A.groups(scope, state.domain);
    return '<section class="bi-subgroups" aria-label="زیرگروه‌های حوزه"><button data-bi-action="group" data-group="" class="' + (!state.group ? 'is-active' : '') + '"><strong>همه بخش‌های حوزه</strong><span>' + number(A.catalog(scope).length) + ' شاخص</span></button>' + groups.map(g => '<button data-bi-action="group" data-group="' + e(g.name) + '" class="' + (state.group === g.name ? 'is-active' : '') + '"><strong>' + e(g.name) + '</strong><span>' + number(g.indicators) + ' شاخص · ' + percent(g.quality.percent) + ' پوشش</span></button>').join('') + '</section>';
  }
  function followupsPanel() {
    const all = A.followups(selected), rows = all.slice(0, 8);
    return '<section class="panel bi-panel bi-wide">' + panelHeader('نیازهای ثبت‌شده برای پیگیری', 'مقدار هر ردیف مربوط به همان شاخص است. ترتیب ردیف‌ها مطابق جداول است.', number(rows.length) + ' از ' + number(all.length) + ' شاخص دارای نیاز مثبت') + (rows.length ? '<div class="bi-table-scroll"><table class="bi-detail-table bi-followup-table"><thead><tr><th scope="col">شاخص نیاز</th><th scope="col">جمع معلوم</th><th scope="col">بیشترین مقدار معلوم</th><th scope="col">شهرستان دارای نیاز</th><th scope="col">پوشش</th><th scope="col">بررسی</th></tr></thead><tbody>' + rows.map(row => '<tr><th scope="row">' + e(row.title) + '<small>' + e(A.domainInfo[row.domainId].short) + '</small></th><td class="bi-value-cell">' + amount(row) + (row.partial ? '*' : '') + '</td><td>' + e(row.largest?.county || '—') + '<small>' + number(row.largest?.value) + ' · ' + percent(row.knownShare) + ' از مجموع معلوم همین شاخص</small></td><td>' + number(row.positiveCounties) + '</td><td>' + coverageTag(row) + '</td><td><button class="text-button" data-bi-action="indicator" data-metric="' + row.key + '">بررسی شاخص' + icon('chevron') + '</button></td></tr>').join('') + '</tbody></table></div><div class="bi-panel-footer"><span>این فهرست رتبه اولویت بودجه نیست؛ شهرستان‌های فاقد داده در مقایسه مقدار شرکت ندارند.</span><button class="text-button" data-bi-action="need-table">مشاهده همه شاخص‌های نیاز' + icon('chevron') + '</button></div>' : empty('در این محدوده نیاز عددی مثبت ثبت نشده', 'شاخص‌های ثبت‌نشده در جدول همه شاخص‌ها قابل بررسی‌اند؛ نبود مقدار مثبت به معنی نبود نیاز نیست.')) + '</section>';
  }
  function tableControls() {
    const groups = [...new Set(D.definitions.filter(d => !state.domain || d.id === state.domain).flatMap(d => d.rows.map(r => r.group)).filter(Boolean))];
    return '<div class="bi-table-controls"><div class="bi-filter bi-table-search"><label for="bi-search">جست‌وجوی شاخص یا بخش</label><input id="bi-search" class="field" type="search" value="' + e(state.search) + '" data-bi-filter="search" maxlength="180" placeholder="مثلاً نیمکت، مقاوم‌سازی، سمعک…"></div>' + field('bi-group', 'بخش جدول', options(groups, 'همه بخش‌ها'), state.group) + field('bi-kind', 'نوع شاخص', [{ value: '', label: 'همه انواع' }, { value: 'need', label: 'موردنیاز / نیازمند / فاقد' }, { value: 'existing', label: 'موجود' }, { value: 'base', label: 'سایر شاخص‌های عددی' }, { value: 'descriptive', label: 'متن، وجود / عدم وجود، سال' }], state.kind) + field('bi-quality', 'وضعیت اطلاعات', [{ value: '', label: 'همه وضعیت‌ها' }, { value: 'complete', label: 'همه مقادیر معتبر' }, { value: 'partial', label: 'بخشی از مقادیر معتبر' }, { value: 'empty', label: 'فاقد مقدار معتبر' }, { value: 'unknown', label: 'دارای مقدار نامشخص' }, { value: 'invalid', label: 'دارای مقدار نامعتبر' }], state.quality) + field('bi-sort', 'ترتیب شاخص‌ها', [{ value: '', label: 'ترتیب جداول منبع' }, { value: 'coverage', label: 'کمترین پوشش داده' }, { value: 'name', label: 'عنوان شاخص' }], state.sort) + '</div>';
  }
  function allIndicatorTable() {
    const rows = A.selectRows(selected, state), counties = [...new Set(selected.entities.map(e => e.county))];
    function cell(row, county) {
      const c = A.countyCell(row, county), title = qualityLabels[c.status] + ' · ' + number(c.quality.valid) + ' مقدار معتبر از ' + number(c.quality.total);
      return '<td class="bi-catalog-cell cell-' + c.status + '" title="' + e(title) + '">' + (c.value !== null ? e(row.metric.numeric ? number(c.value) : D.fa(c.value)) + (c.partial ? '<sup>*</sup>' : '') : c.status === 'unknown' ? '<span>نامشخص</span>' : c.status === 'invalid' ? '<span>نامعتبر</span>' : '<span>—</span>') + '</td>';
    }
    return '<section class="panel bi-panel bi-wide bi-catalog-panel" id="bi-all-indicators">' + panelHeader('جدول کامل مقایسه شاخص‌ها', 'مقادیر شهرستان‌ها در کنار هم؛ برای نمودار و جزئیات روی عنوان شاخص بزنید.', number(rows.length) + ' از ' + number(A.catalog(selected).length) + ' شاخص') + tableControls() + '<div class="bi-table-summary"><span>' + number(counties.length) + ' شهرستان · هر ردیف واحد و جمع خودش را دارد</span><button class="text-button" data-bi-action="export-table">' + icon('download') + 'خروجی همین جدول</button></div>' + (rows.length ? '<div class="bi-table-scroll bi-catalog-scroll" tabindex="0" role="region" aria-label="جدول مقایسه قابل پیمایش"><table class="bi-catalog-table"><caption class="sr-only">مقایسه همه شاخص‌ها به تفکیک شهرستان</caption><thead><tr><th scope="col">حوزه / شاخص</th>' + counties.map(c => '<th scope="col">' + e(c) + '</th>').join('') + '<th scope="col">جمع معلوم</th><th scope="col">پوشش داده</th></tr></thead><tbody>' + rows.map(row => '<tr data-indicator="' + row.key + '"><th scope="row"><small>' + e(A.domainInfo[row.domainId].short + ' · ' + row.group) + '</small><button data-bi-action="indicator" data-metric="' + row.key + '">' + e(row.title) + icon('chevron') + '</button></th>' + counties.map(c => cell(row, c)).join('') + '<td class="bi-catalog-total">' + (row.metric.numeric ? amount(row) + (row.partial ? '<sup>*</sup>' : '') : '<span>توزیع پاسخ‌ها</span>') + '</td><td><span class="bi-catalog-percent">' + percent(row.metric.quality.percent) + '</span><small>' + number(row.metric.quality.valid) + ' از ' + number(row.metric.quality.total) + '</small></td></tr>').join('') + '</tbody></table></div>' : empty('شاخصی مطابق این فیلترها پیدا نشد', 'جست‌وجو یا فیلتر نوع و وضعیت اطلاعات را تغییر دهید.')) + '<p class="bi-chart-note">— مقدار ثبت‌نشده است. * جمع ناقصِ مقادیر معلوم است. برای متن و سال، جمع عددی محاسبه نمی‌شود. جمع نیازهای مختلف دانش‌آموزی، تعداد افراد یکتا نیست.</p></section>';
  }
  function countyCoveragePanel() {
    const rows = A.counties(selected).sort((a, b) => (a.quality.percent ?? -1) - (b.quality.percent ?? -1));
    return '<section class="panel bi-panel">' + panelHeader('پوشش داده به تفکیک شهرستان', 'کمترین پوشش در ابتدای فهرست؛ روی شهرستان بزنید تا اطلاعات آن بررسی شود.') + '<div class="bi-bars bi-coverage-bars">' + rows.map(row => '<button class="bi-bar-row" data-bi-action="county" data-county="' + e(row.county) + '"><span class="bi-bar-name">' + e(row.county) + '</span><span class="bi-bar-track"><span class="bi-bar-fill" style="width:' + (row.quality.percent || 0) + '%"></span></span><b>' + percent(row.quality.percent) + '</b><small>' + number(row.quality.valid) + ' معتبر از ' + number(row.quality.total) + '</small></button>').join('') + '</div></section>';
  }
  function auditPanel() {
    if (state.mode !== 'source') return '';
    const audits = selected.audits;
    return '<section class="panel bi-panel bi-wide bi-audit-panel">' + panelHeader('بررسی جمع ثبت‌شده در منبع', 'مقایسه ستون جمع استان با مقادیر اصلی همه شهرستان‌ها؛ مستقل از فیلتر شهرستان.', number(audits.length) + ' مورد قابل بازبینی') + (audits.length ? audits.map(a => '<div class="bi-audit-row"><span>' + icon('warning') + '</span><div><strong>' + e(a.title) + '</strong><p>جمع ثبت‌شده ' + number(a.reported) + ' · جمع شهرستان‌های دارای مقدار معتبر ' + number(a.calculated) + ' · ' + number(a.known) + ' از ' + number(a.expected) + ' شهرستان</p><small>' + (a.partial ? 'برخی شهرستان‌ها مقدار معتبر ندارند؛ جمع معلوم ناقص است و جایگزین جمع استان نمی‌شود.' : 'همه شهرستان‌ها مقدار دارند؛ اختلاف جمع باید بررسی شود.') + '</small></div><button class="text-button" data-bi-action="indicator" data-metric="' + a.domainId + ':' + a.rowId + '" data-clear-county="true">بررسی مقادیر' + icon('chevron') + '</button></div>').join('') : '<p class="bi-chart-note">در این محدوده اختلافی بین جمع قابل محاسبه و جمع معتبر منبع پیدا نشد. ردیف فاقد مقدار برای تطبیق جمع قابل ارزیابی نیست.</p>') + '</section>';
  }
  function extraFieldsPanel() {
    if (state.mode !== 'records' || !selected.extras.length && !selected.items.length) return '';
    const labels = [...new Set(selected.extras.map(f => f.rowId))].map(id => {
      const facts = selected.extras.filter(f => f.rowId === id), valid = facts.filter(f => f.status === 'valid');
      const values = facts[0].kind === 'count' ? (valid.length ? number(valid.reduce((n, f) => n + f.value, 0)) : '—') : [...new Set(valid.map(f => String(f.value)))].map(value => e(D.fa(value)) + ' (' + number(valid.filter(f => String(f.value) === value).length) + ')').join('، ') || '—';
      return '<tr><th scope="row">' + e(facts[0].title) + '</th><td>' + values + '</td><td>' + number(valid.length) + ' از ' + number(facts.length) + ' مرکز</td></tr>';
    });
    const entities = new Map(selected.entities.map(entity => [entity.id, entity]));
    return '<details class="panel bi-panel bi-wide bi-extra-fields"><summary>فیلدهای تکمیلی و جزئیات اقلام' + '<span>' + number(labels.length) + ' فیلد · ' + number(selected.items.length) + ' ردیف اقلام</span></summary><p class="bi-chart-note">این اطلاعات تکمیلی جدا از ۲۵۰ شاخص جدول هستند و در درصد پوشش آن شاخص‌ها شمرده نمی‌شوند.</p>' + (labels.length ? '<div class="bi-table-scroll"><table class="bi-detail-table"><thead><tr><th>فیلد تکمیلی</th><th>پاسخ‌ها / مقدار معلوم</th><th>پوشش پاسخ</th></tr></thead><tbody>' + labels.join('') + '</tbody></table></div>' : '') + (selected.items.length ? '<div class="bi-table-scroll"><table class="bi-detail-table"><thead><tr><th>مرکز</th><th>محل</th><th>تجهیز</th><th>تعداد</th></tr></thead><tbody>' + selected.items.map(item => '<tr><th>' + e(entities.get(item.entityId)?.name) + '</th><td>' + e(item.place) + '</td><td>' + e(item.title) + '</td><td>' + (D.parseCount(item.count) === null ? '—' : number(D.parseCount(item.count))) + '</td></tr>').join('') + '</tbody></table></div>' : '') + '</details>';
  }
  function content() {
    if (state.view === 'indicators') return allIndicatorTable();
    if (state.view === 'quality') return '<div class="bi-chart-grid">' + qualityPanel() + countyCoveragePanel() + heatmap() + auditPanel() + allIndicatorTable() + '</div>';
    if (state.view === 'domain') return groupCards() + '<div class="bi-chart-grid">' + metricPanel() + pairsPanel() + comparisonPanel() + allIndicatorTable() + extraFieldsPanel() + detailsTable() + '</div>';
    return domainCards() + '<div class="bi-chart-grid">' + metricPanel() + qualityPanel() + comparisonPanel() + needsPanel() + countyCoveragePanel() + followupsPanel() + heatmap() + (state.mode === 'records' ? workflowPanels() : '') + '</div>';
  }
  function methodology() {
    return '<details class="panel bi-method"><summary>' + icon('info') + 'روش محاسبه و خواندن گزارش' + icon('chevron') + '</summary><div><p><strong>پوشش اطلاعات:</strong> تعداد مقادیر معتبر تقسیم بر تعداد سلول‌های شاخص‌های جدول در محدوده انتخاب‌شده. «نامشخص»، «*»، خالی و مقدار نامعتبر در صورت کسر نیستند. صفر ثبت‌شده معتبر است.</p><p><strong>مبنای پرونده:</strong> پیش‌فرض آخرین نسخه ارسال‌شده است. در حالت «آخرین فرم ذخیره‌شده»، اصلاحات و پیش‌نویس هم وارد تحلیل می‌شوند. فیلتر تأییدشده، تحلیل پرونده‌های نهایی را جدا می‌کند.</p><p><strong>واحد شاخص:</strong> فقط مقادیر یک شاخص عددی با هم جمع می‌شوند. ظرفیت، تعداد مدرسه، تعداد تجهیز و تعداد دانش‌آموز با هم جمع نمی‌شوند؛ سال و متن هم مقدار عددی تجمیعی نیستند.</p><p><strong>حدود تحلیل:</strong> نمودارها بر ۲۵۰ شاخص جدول استوارند. جزئیات اقلام تجهیزات جدا از این شاخص‌هاست. داده بودجه و هزینه و تاریخچه مقادیر شهرستان‌ها در فایل منبع وجود ندارد؛ برای آن‌ها عدد یا روندی ساخته نشده است.</p></div></details>';
  }
  function render(focusId) {
    clearTimeout(searchTimer);
    prepare(); syncURL(); UI.shell(state.mode, state.view, state.domain);
    const noEntities = !selected.entities.length;
    const description = state.mode === 'demo' ? 'منبع: سناریوی آزمایشی کامل؛ همه عددها و پاسخ‌ها غیرواقعی‌اند.' : state.mode === 'source' ? 'منبع: مقادیر اصلی فایل «جمع آوری داده ها 2.xlsx»؛ سلول خالی تکمیل نشده است.' : 'منبع: ' + P.dataLabel() + '؛ ' + (state.basis === 'latest' ? 'آخرین فرم ذخیره‌شده.' : 'آخرین نسخه ارسال‌شده.');
    root.innerHTML = '<div class="bi-dashboard">' + hero() + modes() + demoBanner() + '<div id="bi-report" role="tabpanel" aria-labelledby="bi-mode-' + state.mode + '">' + (!selected.available ? '<section class="panel">' + empty('داده فایل منبع بارگذاری نشد', 'صفحه را تازه کنید تا فایل اطلاعات شهرستان‌ها دوباره بارگذاری شود.') + '</section>' : filters() + viewTabs() + '<div class="bi-source-caption"><span>' + icon('info') + e(description) + '</span><time>' + new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit' }).format(refreshedAt) + ' · بازمحاسبه نما</time></div><div id="bi-announcement" class="sr-only" role="status" aria-live="polite">' + number(selected.entities.length) + ' ' + (state.mode !== 'records' ? 'شهرستان' : 'پرونده') + ' در محدوده تحلیل</div>' + (state.view === 'domain' ? domainHeading() : '') + kpis() + (noEntities ? '<section class="panel">' + empty('پرونده‌ای در این محدوده نیست', 'فیلترها را پاک کنید یا مبنای فرم و وضعیت پرونده را تغییر دهید.') + '</section>' : content()) + (state.view === 'quality' ? insights() : '') + methodology()) + '</div>' + UI.footer() + '</div>';
    if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
  }
  function download(table) {
    const model = selected;
    if (!model.facts.length || table && !A.selectRows(model, state).length) { UI.toast('در این محدوده داده‌ای برای خروجی وجود ندارد.', true); return; }
    const blob = new Blob([table ? A.tableCSV(model, state) : M.exportFacts(model)], { type: 'text/csv;charset=utf-8' }), url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'education-needs-' + (model.mode === 'records' && model.origin === 'demo' ? 'demo-records' : model.mode) + '-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    UI.toast('خروجی CSV برای محدوده انتخاب‌شده آماده شد. مقدار نامشخص در خروجی عددی خالی است.');
  }
  document.addEventListener('change', event => {
    const filter = event.target.dataset.biFilter;
    if (!filter || !Object.hasOwn(state, filter)) return;
    state[filter] = event.target.value;
    if (filter === 'domain') { state.group = ''; state.metric = ''; if (state.view === 'overview' && state.domain) state.view = 'domain'; if (state.view === 'domain' && !state.domain) state.view = 'overview'; }
    render(event.target.id);
  });
  document.addEventListener('input', event => {
    if (event.target.id !== 'bi-search') return;
    const value = event.target.value.slice(0, 180), position = event.target.selectionStart;
    state.search = value;
    clearTimeout(searchTimer); searchTimer = setTimeout(() => {
      render('bi-search'); document.getElementById('bi-search')?.setSelectionRange?.(position, position);
    }, 180);
  });
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-bi-action]'); if (!button) return;
    const action = button.dataset.biAction;
    if (action === 'export') { download(['indicators', 'quality'].includes(state.view)); return; }
    if (action === 'export-table') { download(true); return; }
    if (action === 'details') { UI.details(button.dataset.entity, button.dataset.domain, state.mode, state.basis); return; }
    if (action === 'print') { window.print(); return; }
    if (action === 'mode') { if (!['demo', 'source', 'records'].includes(button.dataset.mode)) return; state.mode = button.dataset.mode; render('bi-mode-' + state.mode); return; }
    if (action === 'view') {
      if (!['overview', 'domain', 'indicators', 'quality'].includes(button.dataset.view)) return;
      state.view = button.dataset.view; state.search = ''; state.kind = ''; state.quality = ''; state.sort = '';
      if (state.view === 'overview') { state.domain = ''; state.group = ''; state.metric = ''; }
      UI.closeMenu(); render(); return;
    }
    if (action === 'open-domain' || action === 'domain') {
      if (!D.definitions.some(d => d.id === button.dataset.domain)) return;
      state.view = 'domain'; state.domain = button.dataset.domain; state.group = ''; state.metric = ''; state.kind = ''; state.search = ''; state.quality = '';
      UI.closeMenu(); render('bi-domain'); return;
    }
    if (action === 'indicator') {
      const row = D.definitions.flatMap(d => d.rows.map(r => ({ ...r, domainId: d.id, key: M.key(d.id, r.id) }))).find(r => r.key === button.dataset.metric);
      if (!row) return;
      state.view = 'domain'; state.domain = row.domainId; state.metric = row.key; state.group = ''; state.search = ''; state.kind = ''; state.quality = '';
      if (button.dataset.clearCounty === 'true') state.county = '';
      render('bi-metric'); document.getElementById('bi-metric')?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }); return;
    }
    if (action === 'group') { state.group = button.dataset.group || ''; state.metric = ''; state.search = ''; state.kind = ''; state.quality = ''; render(); return; }
    if (action === 'need-table') { state.view = 'indicators'; state.domain = ''; state.group = ''; state.kind = 'need'; state.quality = ''; state.search = ''; render('bi-kind'); return; }
    if (action === 'compare-all') { state.county = ''; render('bi-compareA'); return; }
    if (action === 'refresh') { refreshedAt = new Date(); render('bi-refresh'); UI.toast('گزارش از داده‌های فعلی دوباره محاسبه شد.'); return; }
    if (action === 'reset') { for (const name of ['county', 'type', 'status', 'period', 'days', 'metric', 'group', 'search', 'kind', 'quality', 'sort', 'compareA', 'compareB']) state[name] = ''; if (state.view !== 'domain') state.domain = ''; render('bi-reset'); return; }
    if (action === 'county') { state.county = state.county === button.dataset.county ? '' : button.dataset.county; render('bi-county'); return; }
    if (action === 'cell') { state.view = 'domain'; state.county = button.dataset.county; state.domain = button.dataset.domain; state.group = ''; state.metric = ''; render('bi-county'); }
  });
  document.addEventListener('keydown', event => {
    if (!event.target.matches('[role="tab"][data-bi-action="mode"]') || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const modes = ['demo', 'source', 'records'], index = modes.indexOf(state.mode);
    state.mode = event.key === 'Home' ? modes[0] : event.key === 'End' ? modes.at(-1) : modes[(index + (event.key === 'ArrowLeft' ? 1 : -1) + modes.length) % modes.length];
    render('bi-mode-' + state.mode);
  });
  window.addEventListener('storage', event => { if ([P.KEY, P.COPYKEY].includes(event.key) || event.key === null) { refreshedAt = new Date(); render(); } });
  window.addEventListener('bi-records-updated', () => { refreshedAt = new Date(); render(); });
  render();
})();
