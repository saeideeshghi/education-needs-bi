/* Analytical facts keep workbook cells and portal submissions as separate sources.
   Blank/unknown values never become zero. All aggregates have one indicator grain. */
(function (global) {
  'use strict';
  if (global.PortalAllowed === false) return;
  const D = global.PortalData;
  const definitions = D.definitions;
  const normalize = text => String(text || '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[\s\u200c]+/g, ' ').trim();
  const isNeed = row => /مورد\s*نیاز|موردنیاز|نیازمند|فاقد/.test(normalize(row.title + ' ' + row.group));
  const key = (domainId, rowId) => domainId + ':' + rowId;
  function classify(raw, kind, unknown) {
    raw = D.cellValue(raw);
    if (unknown || String(raw).trim() === '*') return { status: 'unknown', value: null, raw: raw ?? '' };
    if (raw === null || raw === undefined || String(raw).trim() === '') return { status: 'missing', value: null, raw: raw ?? '' };
    const text = String(raw).trim();
    if (!D.validValue(text, kind)) return { status: 'invalid', value: null, raw };
    return { status: 'valid', value: kind === 'count' ? D.parseCount(text) : text, raw };
  }
  function fact(entity, domain, row, raw, unknown) {
    return { entityId: entity.id, county: entity.county, domainId: domain.id, rowId: row.id,
      key: key(domain.id, row.id), title: row.title, group: row.group || '', kind: row.kind,
      need: isNeed(row), ...classify(raw, row.kind, unknown) };
  }
  function workbook(data) {
    const entities = D.counties.map(county => ({ id: county, name: county, county, code: '', type: '', status: '', period: '' }));
    const facts = [], audits = [];
    for (const domain of definitions) {
      const sheet = data?.sheets?.find(s => s.id === domain.id);
      for (const row of domain.rows) {
        const sourceRow = sheet?.rows.find(r => r.id === row.id && !r.placeholder);
        const rowFacts = entities.map(entity => {
          const countyIndex = data?.counties?.indexOf(entity.county) ?? -1;
          const raw = sourceRow && countyIndex >= 0 ? sourceRow.cells[sheet.countyStart + countyIndex] : null;
          return fact(entity, domain, row, raw, false);
        });
        facts.push(...rowFacts);
        if (row.kind !== 'count' || !sourceRow) continue;
        const reported = classify(sourceRow.cells.at(-1), 'count');
        const valid = rowFacts.filter(f => f.status === 'valid');
        const calculated = valid.reduce((n, f) => n + f.value, 0);
        if (reported.status === 'valid' && valid.length && calculated !== reported.value) {
          audits.push({ domainId: domain.id, rowId: row.id, title: row.title, reported: reported.value,
            calculated, partial: valid.length !== entities.length, known: valid.length, expected: entities.length });
        }
      }
    }
    return { mode: 'source', available: !!data, entities, facts, audits, extras: [], items: [] };
  }
  function submissions(records, basis) {
    const entities = [], facts = [], extras = [], items = [];
    for (const record of records) {
      const state = basis === 'latest' ? record.state : record.status !== 'draft' && record.snapshot;
      if (!state) continue;
      const profile = state.profile || {};
      const entity = { id: record.id, name: profile.name, code: record.code, county: record.county,
        type: profile.type, period: profile.period, status: record.status, profile,
        at: basis === 'latest' ? record.updatedAt : state.submission?.at,
        sentAt: record.status !== 'draft' ? record.snapshot?.submission?.at : null,
        completed: D.stats(state).percent };
      entities.push(entity);
      for (const domain of definitions) {
        const section = state.sections?.[domain.id];
        for (const row of domain.rows) {
          const saved = section?.rows?.find(r => r.id === row.id);
          facts.push(fact(entity, domain, row, saved?.value, saved?.unknown));
        }
        for (const field of domain.extras) {
          const saved = section?.extras?.find(f => f.id === field.id);
          extras.push({ entityId: entity.id, county: entity.county, domainId: domain.id, rowId: field.id,
            title: field.title, kind: field.kind, ...classify(saved?.value, field.kind) });
        }
        for (const item of section?.items || []) {
          items.push({ entityId: entity.id, county: entity.county, domainId: domain.id, ...item });
        }
      }
    }
    return { mode: 'records', available: true, entities, facts, extras, items, audits: [] };
  }
  function filter(model, filters, timestamp) {
    const f = filters || {}, time = timestamp ?? Date.now();
    const entities = model.entities.filter(entity =>
      (!f.county || entity.county === f.county) && (!f.type || entity.type === f.type) &&
      (!f.status || entity.status === f.status) && (!f.period || entity.period === f.period) &&
      (!f.days || Number.isFinite(Date.parse(entity.at)) && Date.parse(entity.at) >= time - Number(f.days) * 86400000 && Date.parse(entity.at) <= time)
    );
    const ids = new Set(entities.map(entity => entity.id));
    const include = item => ids.has(item.entityId) && (!f.domain || item.domainId === f.domain);
    return { ...model, entities, facts: model.facts.filter(include), extras: model.extras.filter(include),
      items: model.items.filter(include), audits: model.audits.filter(a => !f.domain || a.domainId === f.domain) };
  }
  function quality(facts) {
    const counts = { valid: 0, missing: 0, unknown: 0, invalid: 0 };
    for (const item of facts) counts[item.status]++;
    const total = facts.length;
    return { ...counts, total, percent: total ? Math.round(counts.valid / total * 100) : null };
  }
  function summary(model) {
    const q = quality(model.facts);
    const counties = new Set(model.facts.filter(f => f.status === 'valid').map(f => f.county));
    const needIndicators = new Set(model.facts.filter(f => f.status === 'valid' && f.kind === 'count' && f.need && f.value > 0).map(f => f.key));
    const risk = new Set(model.facts.filter(f => f.domainId === 'safety' && f.need && f.status === 'valid' && f.value > 0).map(f => f.entityId));
    model.extras.filter(f => f.domainId === 'safety' && ['alarm', 'extinguishing'].includes(f.rowId) && f.status === 'valid' && f.value === 'خیر').forEach(f => risk.add(f.entityId));
    const approved = model.entities.filter(entity => entity.status === 'approved').length;
    return { quality: q, counties: counties.size, entities: model.entities.length, needIndicators: needIndicators.size,
      safetyEntities: risk.size, approved, approvalPercent: model.entities.length ? Math.round(approved / model.entities.length * 100) : null };
  }
  function metric(model, metricKey) {
    const facts = model.facts.filter(f => f.key === metricKey);
    const valid = facts.filter(f => f.status === 'valid');
    const kind = facts[0]?.kind || definitions.flatMap(d => d.rows.map(r => ({ ...r, key: key(d.id, r.id) }))).find(r => r.key === metricKey)?.kind;
    const numeric = kind === 'count';
    const sum = numeric && valid.length ? valid.reduce((n, f) => n + f.value, 0) : null;
    const distribution = new Map();
    if (!numeric) valid.forEach(f => distribution.set(String(f.value), (distribution.get(String(f.value)) || 0) + 1));
    const counties = [...new Set(model.entities.map(entity => entity.county))].map(county => {
      const selected = facts.filter(f => f.county === county), q = quality(selected);
      const numbers = selected.filter(f => f.status === 'valid');
      return { county, quality: q, value: numeric && numbers.length ? numbers.reduce((n, f) => n + f.value, 0) : null };
    });
    return { key: metricKey, kind, numeric, sum, quality: quality(facts), facts, counties,
      distribution: [...distribution].map(([label, value]) => ({ label, value })) };
  }
  function domains(model) {
    return definitions.map(domain => {
      const facts = model.facts.filter(f => f.domainId === domain.id);
      return { id: domain.id, title: domain.title, quality: quality(facts),
        needEntities: new Set(facts.filter(f => f.kind === 'count' && f.need && f.status === 'valid' && f.value > 0).map(f => f.entityId)).size };
    }).filter(domain => domain.quality.total);
  }
  function matrix(model) {
    return [...new Set(model.entities.map(e => e.county))].map(county => ({ county,
      domains: domains({ ...model, entities: model.entities.filter(e => e.county === county), facts: model.facts.filter(f => f.county === county) })
    }));
  }
  function pairs(model) {
    const base = text => normalize(text).replace(/مورد\s*نیاز|موجود/g, '').replace(/\s/g, '');
    const result = [];
    for (const domain of definitions) {
      for (const existing of domain.rows.filter(r => r.kind === 'count' && /موجود/.test(r.title))) {
        const needed = domain.rows.find(r => r.kind === 'count' && /مورد\s*نیاز/.test(normalize(r.title)) && base(r.title) === base(existing.title));
        if (!needed || !model.facts.some(f => f.domainId === domain.id)) continue;
        const current = metric(model, key(domain.id, existing.id)), demand = metric(model, key(domain.id, needed.id));
        result.push({ domainId: domain.id, title: normalize(existing.title).replace(/موجود/g, '').trim(), existingId: existing.id,
          neededId: needed.id, existing: current, needed: demand });
      }
    }
    return result;
  }
  function timeline(model, timestamp) {
    const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' });
    const today = new Date(dayFormat.format(new Date(timestamp ?? Date.now())) + 'T00:00:00Z');
    const buckets = Array.from({ length: 14 }, (_, i) => ({ at: new Date(today.getTime() - (13 - i) * 86400000).toISOString().slice(0, 10), value: 0 }));
    for (const entity of model.entities) {
      const date = Number.isFinite(Date.parse(entity.sentAt)) ? dayFormat.format(new Date(entity.sentAt)) : null;
      const bucket = buckets.find(b => b.at === date);
      if (bucket) bucket.value++;
    }
    return buckets;
  }
  function csvCell(value) {
    if (typeof value === 'number') return String(value);
    let text = String(value ?? '');
    if (/^\s*[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }
  function csv(rows) { return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n'); }
  function exportFacts(model) {
    const entities = new Map(model.entities.map(e => [e.id, e]));
    const rows = [['source', 'entity_id', 'center_code', 'center_name', 'county', 'center_type', 'period', 'case_status', 'observed_at', 'domain_id', 'domain_title', 'indicator_id', 'indicator_title', 'indicator_group', 'value_kind', 'data_status', 'numeric_value', 'text_value', 'raw_value', 'is_need']];
    for (const item of model.facts) {
      const entity = entities.get(item.entityId), domain = definitions.find(d => d.id === item.domainId);
      rows.push([model.mode, entity.id, entity.code, entity.name, entity.county, entity.type, entity.period, entity.status,
        entity.at || '', item.domainId, domain.title, item.rowId, item.title, item.group, item.kind, item.status,
        item.status === 'valid' && item.kind === 'count' ? item.value : '', item.status === 'valid' && item.kind !== 'count' ? item.value : '', item.raw, item.need ? 1 : 0]);
    }
    return csv(rows);
  }
  function secureEmbedURL(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const url = new URL(value);
      const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const allowed = ['reportId', 'groupId', 'ctid', 'autoAuth', 'pageName', 'filter', 'navContentPaneEnabled', 'filterPaneEnabled'];
      if (url.protocol !== 'https:' || url.host !== 'app.powerbi.com' || url.pathname !== '/reportEmbed' || url.username || url.password || !guid.test(url.searchParams.get('reportId') || '')) return null;
      if ([...url.searchParams.keys()].some(k => !allowed.includes(k))) return null;
      for (const name of ['groupId', 'ctid']) if (url.searchParams.has(name) && !guid.test(url.searchParams.get(name))) return null;
      url.searchParams.set('autoAuth', 'true');
      return url.toString();
    } catch (_) { return null; }
  }
  global.PortalAnalytics = Object.freeze({ classify, workbook, submissions, filter, quality, summary, metric,
    domains, matrix, pairs, timeline, csv, exportFacts, secureEmbedURL, key, isNeed });
})(typeof window === 'undefined' ? globalThis : window);
