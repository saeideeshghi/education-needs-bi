/* Derived analytical views. Aggregation stays at one indicator and one unit. */
(function () {
  'use strict';
  const D = window.PortalData, M = window.PortalAnalytics;
  const domainInfo = Object.freeze({
    space: { short: 'فضا و عمران', focus: ['r31', 'r25', 'r27', 'r10'], note: 'توسعه، احداث، بازسازی و مقاوم‌سازی فضاهای آموزشی' },
    equipment: { short: 'تجهیزات آموزشی', focus: ['r3', 'r5', 'r7', 'r57'], note: 'تجهیزات کلاس، آزمایشگاه، ورزش و امکانات عمومی مدرسه' },
    workshops: { short: 'کارگاه‌های هنرستان', focus: ['r2', 'r3', 'r4', 'r5'], note: 'کارگاه‌های نیازمند تجهیز به تفکیک رشته' },
    specialized: { short: 'مراکز تخصصی', focus: ['r18', 'r19', 'r20', 'r23'], note: 'پژوهش‌سرا، کانون، مشاوره و مراکز سنجش' },
    safety: { short: 'تأسیسات و ایمنی', focus: ['r26', 'r6', 'r20', 'r36'], note: 'گرمایش، سرمایش، برق، آب و تجهیزات ایمنی' },
    welfare: { short: 'خوابگاه و رفاهی', focus: ['r20', 'r24', 'r21', 'r38'], note: 'خوابگاه، خانه معلم و امکانات اقامتی فرهنگیان' },
    students: { short: 'حمایت دانش‌آموزی', focus: ['r2', 'r3', 'r6', 'r7'], note: 'حمایت عمومی، تجهیزات کمک‌توانبخشی و نیازهای خاص' },
    nomadic: { short: 'مدارس عشایری', focus: ['r2', 'r3', 'r22', 'r26'], note: 'مدارس ثابت و سیار، فضای آموزشی و تجهیزات پایه' },
    exceptional: { short: 'مراکز استثنایی', focus: ['r3', 'r4', 'r8', 'r10'], note: 'مناسب‌سازی، کلاس ویژه و تجهیزات توانبخشی' }
  });
  const normalize = value => String(value || '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[\s\u200c]+/g, ' ').trim().toLowerCase();
  const caches = new WeakMap();
  function rowType(row) {
    if (row.kind !== 'count') return 'descriptive';
    if (M.isNeed(row)) return 'need';
    return /موجود/.test(row.title) ? 'existing' : 'base';
  }
  function catalog(model) {
    if (caches.has(model)) return caches.get(model);
    const rows = [];
    for (const domain of D.definitions) {
      if (!model.facts.some(f => f.domainId === domain.id)) continue;
      for (const row of domain.rows) {
        const key = M.key(domain.id, row.id), metric = M.metric(model, key);
        if (!metric.quality.total) continue;
        const positive = metric.facts.filter(f => f.status === 'valid' && f.kind === 'count' && f.value > 0);
        const ordered = metric.counties.filter(c => c.value !== null).sort((a, b) => b.value - a.value || a.county.localeCompare(b.county, 'fa'));
        rows.push({ ...row, domainId: domain.id, domainTitle: domain.title, key, type: rowType(row), metric,
          partial: metric.quality.valid > 0 && metric.quality.valid < metric.quality.total,
          positiveEntities: new Set(positive.map(f => f.entityId)).size,
          positiveCounties: new Set(positive.map(f => f.county)).size,
          largest: metric.numeric && ordered[0]?.value > 0 ? ordered[0] : null });
      }
    }
    caches.set(model, rows);
    return rows;
  }
  function selectRows(model, filters = {}) {
    const search = normalize(filters.search);
    const rows = catalog(model).filter(row => {
      const q = row.metric.quality;
      return (!filters.group || row.group === filters.group) && (!filters.kind || row.type === filters.kind) &&
        (!search || normalize(row.title + ' ' + row.group + ' ' + row.domainTitle).includes(search)) &&
        (!filters.quality || filters.quality === 'complete' && q.total > 0 && q.valid === q.total ||
          filters.quality === 'partial' && q.valid > 0 && q.valid < q.total ||
          filters.quality === 'empty' && q.total > 0 && !q.valid ||
          filters.quality === 'unknown' && q.unknown > 0 || filters.quality === 'invalid' && q.invalid > 0);
    });
    if (filters.sort === 'coverage') rows.sort((a, b) => (a.metric.quality.percent ?? -1) - (b.metric.quality.percent ?? -1));
    if (filters.sort === 'name') rows.sort((a, b) => a.title.localeCompare(b.title, 'fa'));
    return rows;
  }
  function domainReports(model) {
    const rows = catalog(model);
    return M.domains(model).map(domain => {
      const indicators = rows.filter(r => r.domainId === domain.id), needs = indicators.filter(r => r.type === 'need');
      return { ...domain, ...domainInfo[domain.id], indicators: indicators.length,
        needsWithData: needs.filter(r => r.metric.quality.valid).length,
        positiveNeeds: needs.filter(r => r.positiveEntities > 0).length,
        emptyIndicators: indicators.filter(r => !r.metric.quality.valid).length };
    });
  }
  function groups(model, domainId) {
    const indicators = catalog(model).filter(r => r.domainId === domainId);
    return [...new Set(indicators.map(r => r.group || 'سایر'))].map(name => {
      const rows = indicators.filter(r => (r.group || 'سایر') === name);
      return { name, indicators: rows.length, positiveNeeds: rows.filter(r => r.type === 'need' && r.positiveEntities > 0).length,
        quality: M.quality(rows.flatMap(r => r.metric.facts)) };
    });
  }
  function followups(model) {
    return catalog(model).filter(row => row.type === 'need' && row.positiveEntities > 0).map(row => ({
      ...row, knownShare: row.largest && row.metric.sum > 0 ? row.largest.value / row.metric.sum * 100 : null
    }));
  }
  function counties(model) {
    return [...new Set(model.entities.map(e => e.county))].map(county => {
      const facts = model.facts.filter(f => f.county === county);
      return { county, quality: M.quality(facts), positiveNeeds: new Set(facts.filter(f => f.status === 'valid' && f.kind === 'count' && f.need && f.value > 0).map(f => f.key)).size };
    });
  }
  function countyCell(row, county) {
    const facts = row.metric.facts.filter(f => f.county === county), q = M.quality(facts);
    const valid = facts.filter(f => f.status === 'valid');
    return { quality: q, partial: q.valid > 0 && q.valid < q.total,
      value: row.metric.numeric ? (valid.length ? valid.reduce((n, f) => n + f.value, 0) : null) : [...new Set(valid.map(f => String(f.value)))].join('، ') || null,
      status: q.valid ? 'valid' : q.invalid ? 'invalid' : q.unknown ? 'unknown' : 'missing' };
  }
  function tableCSV(model, filters) {
    const names = [...new Set(model.entities.map(e => e.county))];
    const data = [['domain', 'group', 'indicator_id', 'indicator', 'kind', ...names, 'sum_of_known_values', 'valid_cells', 'expected_cells', 'coverage_percent', 'is_partial', 'source', 'data_origin']];
    for (const row of selectRows(model, filters)) data.push([row.domainTitle, row.group, row.key, row.title, row.kind,
      ...names.map(county => countyCell(row, county).value ?? ''), row.metric.sum ?? '', row.metric.quality.valid,
      row.metric.quality.total, row.metric.quality.percent ?? '', row.partial ? 1 : 0, model.mode, model.origin || model.mode]);
    return M.csv(data);
  }
  function compareCounties(model, metricKey, firstCounty, secondCounty) {
    const metric = M.metric(model, metricKey);
    const first = metric.counties.find(c => c.county === firstCounty), second = metric.counties.find(c => c.county === secondCounty);
    const complete = county => county && county.value !== null && county.quality.total > 0 && county.quality.valid === county.quality.total;
    const ready = metric.numeric && firstCounty !== secondCounty && complete(first) && complete(second);
    const difference = ready ? second.value - first.value : null;
    return { metric, first, second, ready: !!ready, difference,
      changePercent: ready && first.value > 0 ? difference / first.value * 100 : null };
  }
  function concentration(model, metricKey) {
    const metric = M.metric(model, metricKey);
    if (!metric.numeric || !(metric.sum > 0)) return [];
    return metric.counties.filter(c => c.value > 0).sort((a, b) => b.value - a.value).map(county => ({
      ...county, share: county.value / metric.sum * 100,
      partial: county.quality.valid !== county.quality.total
    }));
  }
  window.EducationAnalysis = Object.freeze({ domainInfo, normalize, catalog, selectRows, domainReports, groups, followups, counties, countyCell, tableCSV, compareCounties, concentration });
})();
