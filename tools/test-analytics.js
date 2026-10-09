/* Business-logic and rendered-markup checks; no browser or DOM package required. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const rootPath = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(rootPath, 'assets/js', name + '.js'), 'utf8');
function storage() {
  const map = new Map(), reads = [], writes = [];
  return { map, reads, writes, fail: false,
    getItem(k) { reads.push(k); return map.get(k) ?? null; },
    setItem(k, v) { if (this.fail) throw Error('QuotaExceededError'); writes.push(k); map.set(k, String(v)); },
    removeItem: k => map.delete(k) };
}
function harness(options = {}) {
  const events = {}, windowEvents = {}, elements = new Map(), timers = new Map();
  let nextTimer = 1;
  function element(id) {
    if (!elements.has(id)) elements.set(id, { id, innerHTML: '', hidden: true, dataset: {}, className: '',
      focus() {}, querySelectorAll() { return []; }, contains() { return false; }, setAttribute() {},
      showModal() { this.open = true; }, close() { this.open = false; } });
    return elements.get(id);
  }
  const localStorage = storage();
  if (options.book) localStorage.map.set('education-needs-bi:records:v1', JSON.stringify(options.book));
  const query = new URLSearchParams(options.query || '');
  if (!query.has('mode') && !options.defaultDemo) query.set('mode', 'source');
  if (options.portal) localStorage.map.set('education-needs-portal:records:v4', JSON.stringify(options.portal));
  const c = { URL, URLSearchParams, Blob, Event, crypto: crypto.webcrypto, localStorage,
    location: { pathname: '/education-needs-bi/index.html', search: query.toString() ? '?' + query.toString() : '', replace(url) { c.redirect = url; } },
    history: { replaceState(a, b, url) { c.lastURL = url; } },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    setTimeout(callback, delay) { const id = nextTimer++; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    addEventListener(type, callback) { (windowEvents[type] ||= []).push(callback); },
    dispatchEvent(event) { for (const callback of windowEvents[event.type] || []) callback(event); },
    document: { documentElement: { dataset: {} }, body: { dataset: { page: 'analytics' }, classList: { toggle() {} }, style: {} },
      addEventListener(type, callback) { (events[type] ||= []).push(callback); },
      getElementById: element, querySelector() { return null; }, querySelectorAll() { return []; },
      createTreeWalker() { return { nextNode() { return false; } }; } }
  };
  c.window = c;
  vm.createContext(c);
  for (const name of ['boot', 'source', 'county-data', 'data', 'demo-data', 'standalone', 'analytics-config', 'analytics-model', 'analysis-catalog']) {
    if (name === 'county-data' && options.noWorkbook) continue;
    vm.runInContext(read(name), c, { filename: name + '.js' });
  }
  c.PortalAnalyticsConfig = { ...c.PortalAnalyticsConfig, secureEmbedUrl: options.embed || '' };
  vm.runInContext(read('analytics'), c, { filename: 'analytics.js' });
  function action(dataset) {
    const target = { dataset, closest(selector) { return selector === '[data-bi-action]' && dataset.biAction || selector === '[data-standalone]' && dataset.standalone ? this : null; } };
    for (const callback of events.click || []) callback({ target });
  }
  function change(name, value) {
    const target = { id: 'bi-' + name, value, dataset: { biFilter: name } };
    for (const callback of events.change || []) callback({ target });
  }
  return { c, M: c.PortalAnalytics, A: c.EducationAnalysis, D: c.PortalData, html: () => element('page-content').innerHTML,
    shell: () => element('shell').innerHTML, action, change, events, windowEvents, element, localStorage,
    input(value) { for (const callback of events.input || []) callback({ target: { id: 'bi-search', value, selectionStart: value.length } }); },
    tick(delay) { for (const [id, timer] of [...timers]) if (timer.delay <= delay) { timers.delete(id); timer.callback(); } } };
}

test('workbook uses the original cells; missing counties are not zero or demo values', () => {
  const { c, M } = harness();
  const model = M.workbook(c.PortalCountyData), metric = M.metric(model, 'students:r2');
  assert.equal(model.facts.length, 2500);
  assert.equal(metric.sum, 12405);
  assert.equal(metric.quality.valid, 7);
  assert.equal(metric.quality.missing, 3);
  assert.equal(metric.counties.find(c => c.county === 'اسفراین').value, null);
  assert.equal(metric.counties.find(c => c.county === 'شیروان').value, 6650);
  assert.equal(M.quality(model.facts).valid, 331);
  assert.equal(M.quality(model.facts).unknown, 23);
  assert.equal(M.metric(model, 'equipment:r2').sum, null);
});

test('zero, Persian digits, unknown, formula cache and invalid counts remain distinct', () => {
  const { M } = harness();
  assert.equal(M.classify('۰', 'count').value, 0);
  assert.equal(M.classify('١٢', 'count').value, 12);
  assert.equal(M.classify('', 'count').status, 'missing');
  assert.equal(M.classify('*', 'count').status, 'unknown');
  assert.equal(M.classify('40', 'count', true).value, null);
  assert.equal(M.classify({ formula: '=SUM(C1:L1)', value: 75 }, 'count').value, 75);
  for (const value of ['2x', '-1', '1.5', '1000001', '<img src=x>']) assert.equal(M.classify(value, 'count').status, 'invalid');
});

test('source total discrepancy is reported as a partial sum, never silently corrected', () => {
  const { c, M } = harness();
  const audits = M.workbook(c.PortalCountyData).audits;
  assert.equal(audits.length, 1);
  assert.equal(audits[0].reported, 7068);
  assert.equal(audits[0].calculated, 7067);
  assert.equal(audits[0].partial, true);
});

test('default submission model excludes drafts and uses immutable sent snapshots', () => {
  const { c, M } = harness();
  const records = c.Portal.list();
  const sent = records.find(r => r.status === 'submitted');
  sent.state.sections.equipment.rows.find(r => r.id === 'r3').value = '900';
  const snapshotValue = Number(sent.snapshot.sections.equipment.rows.find(r => r.id === 'r3').value);
  const submitted = M.submissions(records, 'submitted'), latest = M.submissions(records, 'latest');
  assert.equal(submitted.entities.length, 40);
  assert.equal(latest.entities.length, 50);
  assert.equal(submitted.facts.find(f => f.entityId === sent.id && f.key === 'equipment:r3').value, snapshotValue);
  assert.equal(latest.facts.find(f => f.entityId === sent.id && f.key === 'equipment:r3').value, 900);
  assert.equal(M.filter(submitted, { status: 'approved' }).entities.length, 10);
});

test('a requested amount is not subtracted from existing stock', () => {
  const { c, M } = harness();
  const record = c.Portal.list().find(r => r.status === 'submitted');
  record.snapshot.sections.equipment.rows.find(r => r.id === 'r2').value = '120';
  record.snapshot.sections.equipment.rows.find(r => r.id === 'r3').value = '18';
  const pair = M.pairs(M.submissions([record], 'submitted')).find(p => p.domainId === 'equipment' && p.existingId === 'r2');
  assert.equal(pair.existing.sum, 120);
  assert.equal(pair.needed.sum, 18);
  assert.equal(pair.existingId, 'r2');
  assert.equal(pair.neededId, 'r3');
});

test('categorical and year values produce distributions, never numeric sums', () => {
  const { c, M } = harness();
  const model = M.workbook(c.PortalCountyData);
  for (const key of ['welfare:r35', 'welfare:r38', 'welfare:r23']) {
    const result = M.metric(model, key);
    assert.equal(result.numeric, false);
    assert.equal(result.sum, null);
  }
});

test('cross filtering recalculates denominator at county and domain grain', () => {
  const { c, M } = harness();
  const model = M.filter(M.workbook(c.PortalCountyData), { county: 'بجنورد', domain: 'students' });
  assert.equal(model.entities.length, 1);
  assert.equal(model.facts.length, 20);
  assert.equal(M.metric(model, 'students:r2').sum, 21);
  assert.equal(M.matrix(model).length, 1);
  assert.equal(M.matrix(model)[0].domains.length, 1);
  assert.equal(M.domains(model)[0].needEntities, 1);
});

test('empty record filters do not claim 0 percent coverage or divide by zero', () => {
  const { c, M } = harness();
  const model = M.filter(M.submissions(c.Portal.list(), 'submitted'), { county: 'گرمه', period: '1399' });
  assert.equal(model.facts.length, 0);
  assert.equal(M.summary(model).quality.percent, null);
  assert.equal(M.summary(model).approvalPercent, null);
});

test('timeline respects the Tehran day boundary and counts only the last submission', () => {
  const { M } = harness();
  const result = M.timeline({ entities: [{ sentAt: '2026-10-08T22:00:00Z' }, { sentAt: null }] }, Date.parse('2026-10-09T12:00:00Z'));
  assert.equal(result.at(-1).at, '2026-10-09');
  assert.equal(result.at(-1).value, 1);
  assert.equal(result.reduce((n, b) => n + b.value, 0), 1);
});

test('CSV is UTF-8, keeps blank numeric values and neutralizes spreadsheet formulas', () => {
  const { c, M } = harness();
  const model = M.filter(M.workbook(c.PortalCountyData), { county: 'اسفراین', domain: 'students' });
  const csv = M.exportFacts(model);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.equal(csv.split('\r\n').length, 21);
  assert.ok(csv.includes('"count","missing","","","",1'));
  assert.ok(M.csv([['=HYPERLINK("bad")', '@SUM(A1)', 'normal']]).includes("'=HYPERLINK"));
});

test('secure Power BI accepts reportEmbed and rejects public, spoofed or token URLs', () => {
  const { M } = harness();
  const valid = 'https://app.powerbi.com/reportEmbed?reportId=aaaaaaaa-0000-1111-2222-bbbbbbbbbbbb';
  assert.ok(M.secureEmbedURL(valid).includes('autoAuth=true'));
  for (const url of ['javascript:alert(1)', valid.replace('https:', 'http:'), valid.replace('app.powerbi.com', 'app.powerbi.com.evil.example'),
    valid + '&access_token=secret', 'https://app.powerbi.com/view?r=public', valid.replace('reportId=', 'reportId=bad')]) assert.equal(M.secureEmbedURL(url), null);
});

test('dashboard renders all nine domains, drilldown filters and empty state without exceptions', () => {
  const h = harness();
  assert.ok(h.html().includes('۱۲٬۴۰۵'));
  assert.equal([...h.html().matchAll(/class="panel bi-domain-card"/g)].length, 9);
  assert.ok(h.shell().includes('data-view="indicators"'));
  for (const domain of h.D.definitions) {
    h.action({ biAction: 'open-domain', domain: domain.id });
    assert.ok(h.html().includes('bi-catalog-table'));
    assert.equal([...h.html().matchAll(/data-indicator=/g)].length, domain.rows.length);
  }
  h.action({ biAction: 'view', view: 'overview' });
  h.action({ biAction: 'reset' });
  h.action({ biAction: 'view', view: 'overview' });
  h.action({ biAction: 'cell', county: 'بجنورد', domain: 'students' });
  assert.ok(h.c.lastURL.includes('domain=students'));
  assert.ok(h.html().includes('۲۱'));
  h.action({ biAction: 'mode', mode: 'records' });
  h.change('period', '1399');
  assert.ok(h.html().includes('پرونده‌ای در این محدوده نیست'));
  h.action({ biAction: 'reset' });
  h.action({ biAction: 'view', view: 'overview' });
  assert.ok(h.html().includes('bi-timeline'));
  const ids = [...h.html().matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(ids.length, new Set(ids).size);
});

test('analytical interface opens directly and has no external report tab or iframe', () => {
  const h = harness({ query: '?mode=powerbi' });
  assert.ok(h.html().includes('نمای مدیریتی نیازهای آموزشی'));
  assert.ok(!h.html().includes('<iframe'));
  assert.ok(!h.html().includes('گزارش Power BI هنوز متصل نشده'));
  assert.ok(!h.shell().includes('گزارش Power BI'));
});

test('independent route opens without a portal account and marks demo records clearly', () => {
  const h = harness({ query: '?mode=records' });
  assert.ok(h.html().includes('داده‌های نمونه داشبورد؛ نمایشی'));
  assert.ok(!h.shell().includes('login.html'));
  assert.equal(h.c.PortalAuth, undefined);
  assert.equal(h.c.redirect, undefined);
  assert.equal(h.c.Portal.list().length, 50);
});

test('exact scope can be reopened by URL and unrecognized query input is not executed', () => {
  const h = harness({ query: '?mode=records&status=approved&type=مدرسه&domain=equipment&basis=submitted&period=1405&days=30' });
  assert.ok(h.c.lastURL.includes('status=approved'));
  assert.ok(h.c.lastURL.includes('days=30'));
  assert.ok(!harness({ query: '?county=%3Cscript%3Ealert(1)%3C/script%3E&metric=x' }).html().includes('<script>alert'));
});

function importedRecord(overrides = {}) {
  return { id: 'school-01', county: 'بجنورد', code: '600001', status: 'submitted', updatedAt: '2026-10-08T10:00:00Z',
    state: { profile: { name: 'مرکز واردشده', code: '600001', county: 'بجنورد', type: 'مدرسه', period: '1405' },
      sections: { students: { rows: [{ id: 'r2', value: '۱۲', unknown: false }], completed: false } } },
    snapshot: { profile: { name: 'مرکز واردشده', type: 'مدرسه', period: '1405' },
      sections: { students: { rows: [{ id: 'r2', value: '۷' }], completed: false } },
      submission: { at: '2026-10-08T10:00:00Z', tracking: 'TEST-01' } }, ...overrides };
}

test('portal data is read only after explicit import and is never overwritten', () => {
  const portal = { version: 4, records: [importedRecord()] };
  const h = harness({ portal, query: '?mode=records' }), key = 'education-needs-portal:records:v4';
  assert.ok(!h.localStorage.reads.includes(key));
  const original = h.localStorage.map.get(key);
  h.action({ standalone: 'import-portal' });
  assert.equal(h.c.Portal.list().length, 1);
  assert.ok(h.html().includes('آخرین داده دریافت‌شده از پورتال'));
  assert.equal(h.localStorage.map.get(key), original);
  assert.ok(!h.localStorage.writes.includes(key));
  assert.equal(h.c.Portal.exportBook().meta.origin, 'portal');
});

test('JSON import preserves sparse forms and unknowns instead of filling demo values', () => {
  const h = harness(), record = importedRecord();
  record.state.sections.students.rows.push({ id: 'r3', value: '99', unknown: true });
  const result = h.c.Portal.importBook({ records: [record] }, 'file', 'schools.json');
  assert.equal(result.ok, true);
  const model = h.M.submissions(h.c.Portal.list(), 'latest');
  assert.equal(h.M.metric(model, 'students:r2').sum, 12);
  assert.equal(h.M.metric(model, 'students:r3').quality.unknown, 1);
  assert.equal(h.M.metric(model, 'equipment:r3').sum, null);
  assert.equal(h.M.quality(model.facts).valid, 1);
  assert.equal(h.M.quality(model.facts).missing, 248);
  assert.equal(h.M.metric(h.M.submissions(h.c.Portal.list(), 'submitted'), 'students:r2').sum, 7);
  assert.equal(h.c.Portal.exportBook().meta.name, 'schools.json');
});

test('invalid import and storage quota failures keep the previous dashboard data', () => {
  const h = harness(), before = h.localStorage.map.get(h.c.Portal.KEY);
  for (const records of [[importedRecord(), importedRecord()], [importedRecord({ id: 123 })],
    [importedRecord({ county: 'نامعتبر' })], [importedRecord({ status: 'not-a-status' })],
    [importedRecord({ state: {} })], Array.from({ length: 251 }, (_, i) => importedRecord({ id: 'school-' + i }))]) {
    assert.equal(h.c.Portal.importBook({ records }, 'file', 'invalid.json').ok, false);
    assert.equal(h.localStorage.map.get(h.c.Portal.KEY), before);
  }
  h.localStorage.fail = true;
  assert.equal(h.c.Portal.importBook([importedRecord()], 'file', 'valid.json').ok, false);
  assert.equal(h.localStorage.map.get(h.c.Portal.KEY), before);
});

test('missing portal store is an actionable error and leaves the dashboard unchanged', () => {
  const h = harness(), before = h.localStorage.map.get(h.c.Portal.KEY);
  const result = h.c.Portal.importPortal();
  assert.equal(result.ok, false);
  assert.ok(result.message.includes('JSON'));
  assert.equal(h.localStorage.map.get(h.c.Portal.KEY), before);
});

test('exported JSON can be imported into another dashboard with the same values', () => {
  const a = harness(), b = harness();
  a.c.Portal.importBook([importedRecord()], 'file', 'records.json');
  const exported = JSON.parse(JSON.stringify(a.c.Portal.exportBook()));
  assert.equal(b.c.Portal.importBook(exported, 'file', 'backup.json').ok, true);
  assert.equal(JSON.stringify(a.c.Portal.list()), JSON.stringify(b.c.Portal.list()));
  const sourceBefore = a.M.metric(a.M.workbook(a.c.PortalCountyData), 'students:r2').sum;
  a.c.Portal.resetDemo();
  assert.equal(sourceBefore, a.M.metric(a.M.workbook(a.c.PortalCountyData), 'students:r2').sum);
});

test('detail buttons open local dialogs for workbook and snapshot records', () => {
  const h = harness();
  assert.ok(!h.html().includes('./tables.html'));
  h.action({ biAction: 'details', entity: 'شیروان', domain: 'students' });
  assert.equal(h.element('details-dialog').open, true);
  assert.ok(h.element('details-dialog').innerHTML.includes('۶۶۵۰'));
  h.c.Portal.importBook([importedRecord()], 'file', 'records.json');
  h.action({ biAction: 'mode', mode: 'records' });
  h.action({ biAction: 'details', entity: 'school-01', domain: 'students' });
  assert.ok(h.element('details-dialog').innerHTML.includes('مرکز واردشده'));
  assert.ok(h.element('details-dialog').innerHTML.includes('>۷<'));
  assert.ok(h.element('details-dialog').innerHTML.includes('ثبت‌نشده'));
});

test('imported names are escaped in the dashboard and detail dialogs', () => {
  const h = harness({ query: '?mode=records' }), record = importedRecord();
  record.state.profile.name = record.snapshot.profile.name = '<img src=x onerror=alert(1)>';
  h.c.Portal.importBook([record], 'file', '<script>file</script>.json');
  h.c.dispatchEvent(new Event('bi-records-updated'));
  assert.ok(!h.html().includes('<img src=x'));
  h.action({ biAction: 'details', entity: 'school-01', domain: 'students' });
  assert.ok(h.element('details-dialog').innerHTML.includes('&lt;img'));
  assert.ok(!h.element('details-dialog').innerHTML.includes('<img src=x'));
});

test('indicator catalog contains all original rows and applies Persian search and type filters', () => {
  const { c, M, A } = harness(), model = M.workbook(c.PortalCountyData);
  assert.equal(A.catalog(model).length, 250);
  assert.equal(A.selectRows(model, { kind: 'descriptive' }).length, 14);
  assert.ok(A.selectRows(model, { search: 'كيف' }).some(r => r.key === 'students:r2'));
  assert.ok(A.selectRows(model, { search: 'بازسازی' }).every(r => A.normalize(r.title + r.group + r.domainTitle).includes('بازسازی')));
  assert.ok(A.selectRows(model, { kind: 'existing' }).every(r => /موجود/.test(r.title)));
  assert.ok(A.selectRows(model, { quality: 'empty' }).every(r => r.metric.quality.valid === 0));
  assert.ok(A.selectRows(model, { quality: 'unknown' }).some(r => r.key === 'nomadic:r3'));
});

test('followups rank counties only within one indicator and retain partial coverage', () => {
  const { c, M, A } = harness(), model = M.workbook(c.PortalCountyData);
  const row = A.followups(model).find(r => r.key === 'students:r2');
  assert.equal(row.metric.sum, 12405);
  assert.equal(row.largest.county, 'شیروان');
  assert.equal(row.largest.value, 6650);
  assert.equal(row.partial, true);
  assert.equal(row.positiveCounties, 7);
  assert.ok(Math.abs(row.knownShare - 6650 / 12405 * 100) < 1e-10);
  assert.ok(A.followups(model).every(r => r.type === 'need' && r.positiveEntities > 0));
});

test('empty domains remain visible with all their indicators and do not claim needs are zero', () => {
  const h = harness({ query: '?view=domain&domain=equipment' });
  const model = h.M.filter(h.M.workbook(h.c.PortalCountyData), { domain: 'equipment' });
  const domain = h.A.domainReports(model)[0];
  assert.equal(domain.indicators, 56);
  assert.equal(domain.emptyIndicators, 56);
  assert.equal(domain.quality.valid, 0);
  assert.ok(h.html().includes('فاقد مقدار معتبر'));
  assert.equal([...h.html().matchAll(/data-indicator=/g)].length, 56);
  assert.ok(!h.html().includes('نیاز ندارند'));
});

test('complete indicator matrix renders every original county and row with distinct blanks', () => {
  const h = harness({ query: '?view=indicators' });
  assert.equal([...h.html().matchAll(/data-indicator=/g)].length, 250);
  for (const county of h.D.counties) assert.ok(h.html().includes('>' + county + '</th>'));
  assert.ok(h.html().includes('cell-unknown'));
  assert.ok(h.html().includes('cell-missing'));
  assert.ok(h.html().includes('توزیع پاسخ‌ها'));
  assert.ok(!h.html().includes('مجموع کل نیازها'));
  h.change('search', 'کیف');
  assert.equal([...h.html().matchAll(/data-indicator=/g)].length, 1);
  h.action({ biAction: 'indicator', metric: 'students:r2' });
  assert.ok(h.c.lastURL.includes('view=domain'));
  assert.ok(h.c.lastURL.includes('domain=students'));
  assert.ok(h.html().includes('۱۲٬۴۰۵'));
});

test('subgroup selection updates table denominator and restricts the metric selector', () => {
  const h = harness({ query: '?view=domain&domain=students' });
  const group = h.D.definitions.find(d => d.id === 'students').rows.find(r => r.id === 'r8').group;
  h.action({ biAction: 'group', group });
  assert.ok(h.c.lastURL.includes('group='));
  assert.equal([...h.html().matchAll(/data-indicator=/g)].length, 8);
  assert.ok(!h.html().includes('data-indicator="students:r2"'));
  assert.ok(h.html().includes('data-indicator="students:r8"'));
  h.action({ biAction: 'group', group: '' });
  assert.equal([...h.html().matchAll(/data-indicator=/g)].length, 20);
});

test('county cells distinguish missing, unknown, zero and partial numeric or text values', () => {
  const { c, A, M } = harness(), model = M.workbook(c.PortalCountyData);
  const row = A.catalog(model).find(r => r.key === 'students:r2');
  assert.equal(A.countyCell(row, 'اسفراین').value, null);
  assert.equal(A.countyCell(row, 'شیروان').value, 6650);
  const sample = { metric: { numeric: true, facts: [{ county: 'بجنورد', status: 'valid', value: 0 }, { county: 'بجنورد', status: 'missing', value: null }] } };
  assert.equal(A.countyCell(sample, 'بجنورد').value, 0);
  assert.equal(A.countyCell(sample, 'بجنورد').partial, true);
  sample.metric.facts = [{ county: 'بجنورد', status: 'unknown', value: null }];
  assert.equal(A.countyCell(sample, 'بجنورد').status, 'unknown');
  sample.metric.numeric = false;
  sample.metric.facts = [{ county: 'بجنورد', status: 'valid', value: 'دارد' }, { county: 'بجنورد', status: 'missing', value: null }];
  assert.equal(A.countyCell(sample, 'بجنورد').value, 'دارد');
  assert.equal(A.countyCell(sample, 'بجنورد').partial, true);
});

test('quality view exposes county coverage, source discrepancies and every incomplete row', () => {
  const h = harness({ query: '?view=quality' });
  assert.ok(h.html().includes('bi-coverage-bars'));
  assert.ok(h.html().includes('bi-audit-panel'));
  assert.ok(h.html().includes('۷٬۰۶۸'));
  assert.ok(h.html().includes('۷٬۰۶۷'));
  h.change('quality', 'unknown');
  assert.ok(h.html().includes('data-indicator="nomadic:r3"'));
  h.action({ biAction: 'indicator', metric: 'nomadic:r3', clearCounty: 'true' });
  assert.ok(h.html().includes('جمع فایل: ۷٬۰۶۸'));
});

test('domain pairs include all matching indicators without a six-row truncation', () => {
  const h = harness({ query: '?view=domain&domain=equipment' });
  const expected = h.M.pairs(h.M.filter(h.M.workbook(h.c.PortalCountyData), { domain: 'equipment' })).length;
  assert.ok(expected > 6);
  assert.equal([...h.html().matchAll(/class="bi-pair"/g)].length, expected);
});

test('table CSV respects search, group and county scope with no cross-indicator total', () => {
  const { c, M, A } = harness(), model = M.filter(M.workbook(c.PortalCountyData), { county: 'بجنورد', domain: 'students' });
  const csv = A.tableCSV(model, { search: 'کیف' });
  assert.equal(csv.split('\r\n').length, 2);
  assert.ok(csv.includes('"students:r2"'));
  assert.ok(csv.includes(',21,21,1,1,100,0'));
  assert.ok(!csv.includes('"students:r3"'));
});

test('all views show imported data and extra fields remain separate from table coverage', () => {
  const h = harness({ query: '?mode=records&view=domain&domain=safety' }), record = importedRecord();
  record.state.sections.safety = { rows: [], extras: [{ id: 'alarm', value: 'خیر' }], items: [], completed: false };
  record.snapshot.sections.safety = record.state.sections.safety;
  assert.equal(h.c.Portal.importBook([record], 'file', 'records.json').ok, true);
  h.c.dispatchEvent(new Event('bi-records-updated'));
  assert.ok(h.html().includes('فیلدهای تکمیلی و جزئیات اقلام'));
  assert.ok(h.html().includes('خیر (۱)'));
  const model = h.M.filter(h.M.submissions(h.c.Portal.list(), 'submitted'), { domain: 'safety' });
  assert.equal(h.M.quality(model.facts).valid, 0);
  assert.equal(model.extras.filter(f => f.status === 'valid').length, 1);
  for (const view of ['overview', 'domain', 'indicators', 'quality']) {
    h.action({ biAction: 'view', view });
    assert.ok(h.html().includes('فایل واردشده: records.json'));
    assert.ok(!h.html().includes('<iframe'));
  }
});

test('pending search cannot overwrite a newly selected domain and survives another table filter', () => {
  const h = harness({ query: '?view=indicators' });
  h.input('کیف');
  h.change('quality', 'partial');
  assert.equal([...h.html().matchAll(/data-indicator=/g)].length, 1);
  h.input('پوشاک');
  h.action({ biAction: 'open-domain', domain: 'space' });
  h.tick(200);
  assert.equal([...h.html().matchAll(/data-indicator=/g)].length, 34);
  assert.ok(!h.c.lastURL.includes('search='));
});

test('the actual default route opens the complete demo with a visible non-real-data banner', () => {
  const h = harness({ defaultDemo: true });
  assert.ok(h.c.lastURL.includes('mode=demo'));
  assert.ok(h.html().includes('همه مقادیر این منبع ساختگی‌اند'));
  assert.ok(h.html().includes('۲۵۰۰ مقدار آزمایشی'));
  assert.ok(h.shell().includes('داده آزمایشی کامل؛ غیرواقعی'));
  assert.ok(h.html().includes('مقایسه دو شهرستان و تمرکز مقدار'));
  assert.equal([...h.html().matchAll(/role="tab" id="bi-mode-/g)].length, 3);
});

test('the synthetic workbook covers every domain, indicator and county with valid varied values', () => {
  const { c, D, M, A } = harness(), model = M.workbook(c.PortalDemoData.workbook);
  const q = M.quality(model.facts);
  assert.equal(model.mode, 'demo');
  assert.equal(model.origin, 'demo');
  assert.equal(q.total, 2500);
  assert.equal(q.valid, 2500);
  assert.equal(model.audits.length, 0);
  assert.ok(model.facts.some(f => f.kind === 'count' && f.value === 0));
  for (const domain of D.definitions) {
    const report = A.domainReports(M.filter(model, { domain: domain.id }))[0];
    assert.equal(report.indicators, domain.rows.length);
    assert.equal(report.quality.percent, 100);
    assert.ok(report.positiveNeeds > 0);
    for (const row of domain.rows) {
      const metric = M.metric(model, domain.id + ':' + row.id);
      assert.equal(metric.quality.valid, 10);
      assert.ok(new Set(metric.facts.map(f => f.value)).size > 1);
    }
  }
  for (const county of D.counties) {
    const schools = M.filter(model, { county, domain: 'nomadic' });
    assert.equal(M.metric(schools, 'nomadic:r2').sum, M.metric(schools, 'nomadic:r5').sum + M.metric(schools, 'nomadic:r6').sum);
  }
});

test('sample records cover all ten counties, statuses, center types and two periods', () => {
  const { c, D, M } = harness(), records = c.Portal.list();
  assert.equal(records.length, 50);
  assert.equal(new Set(records.map(r => r.id)).size, 50);
  assert.equal(new Set(records.map(r => r.state.profile.type)).size, D.profileChoices.type.length);
  assert.equal(new Set(records.map(r => r.state.profile.period)).size, 2);
  for (const county of D.counties) {
    const selected = records.filter(r => r.county === county);
    assert.equal(selected.length, 5);
    assert.equal(new Set(selected.map(r => r.status)).size, 5);
  }
  assert.ok(records.every(r => r.state.profile.name.includes('آزمایشی')));
  assert.equal(M.quality(M.submissions(records, 'latest').facts).valid, 12500);
  assert.equal(M.quality(M.submissions(records, 'submitted').facts).valid, 10000);
  assert.ok(Buffer.byteLength(JSON.stringify(c.Portal.exportBook())) < 5 * 1024 * 1024);
});

test('legacy demo data is refreshed while imported and unmarked local books are retained', () => {
  const old = { version: 1, meta: { origin: 'demo' }, records: [importedRecord()] };
  const updated = harness({ book: old, query: '?mode=records' });
  assert.equal(updated.c.Portal.list().length, 50);
  assert.equal(updated.c.Portal.exportBook().meta.seedVersion, 3);
  for (const meta of [{ origin: 'file', name: 'mine.json' }, { origin: 'portal' }, {}]) {
    const book = { version: 1, meta, records: [importedRecord()] };
    const h = harness({ book, query: '?mode=records' });
    assert.equal(JSON.stringify(h.c.Portal.exportBook()), JSON.stringify(book));
    assert.equal(h.localStorage.writes.filter(k => k === h.c.Portal.KEY).length, 0);
  }
});

test('switching source never mixes demo counts into the original workbook or imported forms', () => {
  const h = harness({ defaultDemo: true });
  const original = JSON.stringify(h.c.PortalCountyData);
  h.action({ biAction: 'mode', mode: 'source' });
  assert.ok(!h.html().includes('bi-demo-banner'));
  assert.ok(h.html().includes('۱۲٬۴۰۵'));
  assert.equal(h.M.quality(h.M.workbook(h.c.PortalCountyData).facts).valid, 331);
  h.c.Portal.importBook([importedRecord()], 'file', 'actual.json');
  h.action({ biAction: 'mode', mode: 'records' });
  assert.ok(!h.html().includes('bi-demo-banner'));
  assert.ok(h.html().includes('فایل واردشده: actual.json'));
  h.action({ biAction: 'mode', mode: 'demo' });
  assert.ok(h.html().includes('bi-demo-banner'));
  assert.equal(h.c.Portal.list().length, 1);
  assert.equal(JSON.stringify(h.c.PortalCountyData), original);
});

test('every demo view and domain displays populated tables and details with correct provenance', () => {
  const h = harness({ query: '?mode=demo' });
  for (const domain of h.D.definitions) {
    h.action({ biAction: 'open-domain', domain: domain.id });
    assert.ok(h.html().includes('bi-demo-banner'));
    assert.equal([...h.html().matchAll(/data-indicator=/g)].length, domain.rows.length);
    assert.ok(!h.html().includes('class="bi-catalog-cell cell-missing"'));
    assert.ok(h.html().includes('bi-comparison-panel'));
  }
  for (const view of ['overview', 'indicators', 'quality']) {
    h.action({ biAction: 'view', view });
    assert.ok(h.html().includes('bi-demo-banner'));
    const ids = [...h.html().matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
    assert.equal(new Set(ids).size, ids.length);
  }
  h.action({ biAction: 'details', entity: 'اسفراین', domain: 'equipment' });
  assert.equal(h.element('details-dialog').open, true);
  assert.ok(h.element('details-dialog').innerHTML.includes('همه مقادیر این پنجره غیرواقعی‌اند'));
});

test('two-county comparison uses a single indicator and rejects incomplete or categorical comparisons', () => {
  const { c, M, A } = harness(), model = M.workbook(c.PortalCountyData);
  const result = A.compareCounties(model, 'students:r2', 'بجنورد', 'شیروان');
  assert.equal(result.ready, true);
  assert.equal(result.difference, 6629);
  assert.ok(Math.abs(result.changePercent - 6629 / 21 * 100) < 1e-9);
  assert.equal(A.compareCounties(model, 'students:r2', 'اسفراین', 'شیروان').difference, null);
  assert.equal(A.compareCounties(model, 'students:r2', 'شیروان', 'شیروان').ready, false);
  assert.equal(A.compareCounties(model, 'welfare:r38', 'بجنورد', 'شیروان').ready, false);
  const partial = { ...model, facts: [...model.facts, { ...model.facts.find(f => f.key === 'students:r2' && f.county === 'بجنورد'), status: 'missing', value: null }] };
  assert.equal(A.compareCounties(partial, 'students:r2', 'بجنورد', 'شیروان').difference, null);
});

test('a recorded zero allows absolute comparison without dividing by a zero baseline', () => {
  const { c, M, A } = harness(), model = M.workbook(c.PortalDemoData.workbook);
  const modified = { ...model, facts: model.facts.map(f => f.key === 'students:r2' && f.county === 'بجنورد' ? { ...f, value: 0, raw: 0 } : f) };
  const comparison = A.compareCounties(modified, 'students:r2', 'بجنورد', 'شیروان');
  assert.equal(comparison.ready, true);
  assert.equal(comparison.difference, comparison.second.value);
  assert.equal(comparison.changePercent, null);
});

test('concentration uses only known values of the selected indicator and recalculates with scope', () => {
  const { c, M, A } = harness(), model = M.workbook(c.PortalCountyData);
  const rows = A.concentration(model, 'students:r2');
  assert.equal(rows[0].county, 'شیروان');
  assert.equal(rows[0].value, 6650);
  assert.ok(!rows.some(r => r.county === 'اسفراین'));
  assert.ok(Math.abs(rows.reduce((sum, row) => sum + row.share, 0) - 100) < 1e-10);
  assert.ok(Math.abs(rows[0].share - 6650 / 12405 * 100) < 1e-10);
  assert.equal(A.concentration(M.filter(model, { county: 'بجنورد' }), 'students:r2')[0].share, 100);
  assert.equal(A.concentration(model, 'welfare:r38').length, 0);
  assert.equal(A.concentration(model, 'equipment:r3').length, 0);
});

test('comparison selectors survive URL reopening, single-county filters and source changes', () => {
  const h = harness({ query: '?mode=demo&compareA=بجنورد&compareB=شیروان' });
  assert.ok(h.html().includes('id="bi-compareA"'));
  h.change('compareA', 'اسفراین');
  const query = new URL(h.c.lastURL, 'https://example.org/').search;
  const reopened = harness({ query });
  assert.ok(reopened.html().includes('value="اسفراین" selected'));
  h.action({ biAction: 'county', county: 'بجنورد' });
  assert.ok(h.html().includes('نمایش همه شهرستان‌ها برای مقایسه'));
  h.action({ biAction: 'compare-all' });
  assert.ok(h.html().includes('bi-comparison-panel'));
  h.action({ biAction: 'mode', mode: 'source' });
  h.change('compareA', 'اسفراین');
  assert.ok(h.html().includes('هر دو شهرستان باید مقدار معتبر و پوشش کامل داشته باشند'));
});

test('all CSV formats retain demo/source provenance, including demonstration records', () => {
  const { c, M, A } = harness();
  const demo = M.workbook(c.PortalDemoData.workbook), original = M.workbook(c.PortalCountyData);
  const records = M.submissions(c.Portal.list(), 'submitted', c.Portal.origin());
  for (const model of [demo, original, records]) {
    const raw = M.exportFacts(model), wide = A.tableCSV(model, { search: 'کیف' });
    assert.ok(raw.split('\r\n')[0].includes('"data_origin"'));
    assert.ok(wide.split('\r\n')[0].includes('"data_origin"'));
    assert.ok(raw.split('\r\n')[1].endsWith('"' + model.origin + '"'));
    assert.ok(wide.split('\r\n')[1].endsWith('"' + model.mode + '","' + model.origin + '"'));
  }
});

test('keyboard navigation cycles all three source tabs and keeps demo labels visible', () => {
  const h = harness({ defaultDemo: true });
  const target = { matches: () => true };
  function key(key) { for (const callback of h.events.keydown) callback({ target, key, preventDefault() {} }); }
  key('ArrowLeft'); assert.ok(h.c.lastURL.includes('mode=source'));
  key('ArrowLeft'); assert.ok(h.c.lastURL.includes('mode=records'));
  key('ArrowLeft'); assert.ok(h.c.lastURL.includes('mode=demo'));
  key('ArrowRight'); assert.ok(h.c.lastURL.includes('mode=records'));
  key('Home'); assert.ok(h.c.lastURL.includes('mode=demo'));
  key('End'); assert.ok(h.c.lastURL.includes('mode=records'));
  assert.ok(h.html().includes('همه مقادیر این منبع ساختگی‌اند'));
});

test('importing exported demonstration JSON retains its synthetic label without auto-reseeding it', () => {
  const source = harness(), exported = JSON.parse(JSON.stringify(source.c.Portal.exportBook()));
  exported.records = exported.records.filter(r => r.status === 'approved').slice(0, 2);
  const target = harness({ query: '?mode=records' });
  assert.equal(target.c.Portal.importBook(exported, 'file', 'demo-backup.json').ok, true);
  target.c.dispatchEvent(new Event('bi-records-updated'));
  assert.equal(target.c.Portal.list().length, 2);
  assert.equal(target.c.Portal.origin(), 'demo');
  assert.ok(target.html().includes('فایل آزمایشی واردشده: demo-backup.json'));
  assert.ok(target.html().includes('همه مقادیر این منبع ساختگی‌اند'));
  assert.ok(target.html().includes('۲ پرونده آزمایشی'));
  target.action({ biAction: 'details', entity: exported.records[0].id, domain: 'safety' });
  assert.ok(target.element('details-dialog').innerHTML.includes('پرونده آزمایشی؛ مقادیر ساختگی‌اند.'));
  target.action({ biAction: 'refresh' });
  assert.equal(target.c.Portal.list().length, 2);
  const roundtrip = JSON.parse(JSON.stringify(target.c.Portal.exportBook()));
  assert.equal(source.c.Portal.importBook(roundtrip, 'file', 'again.json').ok, true);
  assert.equal(source.c.Portal.origin(), 'demo');
});

test('demo scenarios do not depend on original value files and source failure remains explicit', () => {
  const h = harness({ defaultDemo: true, noWorkbook: true });
  assert.equal(h.M.quality(h.M.workbook(h.c.PortalDemoData.workbook).facts).valid, 2500);
  assert.ok(h.html().includes('همه مقادیر این منبع ساختگی‌اند'));
  h.action({ biAction: 'mode', mode: 'source' });
  assert.ok(h.html().includes('داده فایل منبع بارگذاری نشد'));
  assert.ok(!h.html().includes('bi-demo-banner'));
});
