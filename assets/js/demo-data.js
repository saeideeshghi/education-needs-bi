/* Synthetic scenarios only. Original county-data.js is never changed or filled. */
(function (global) {
  'use strict';
  const D = global.PortalData;
  const weights = [0.86, 0.42, 2.75, 0.52, 1.16, 0.94, 1.82, 0.74, 0.37, 0.63];
  const normalize = value => String(value).replace(/[\s\u200c]+/g, ' ').trim();
  const need = row => /مورد\s*نیاز|موردنیاز|نیازمند|فاقد/.test(normalize(row.title + ' ' + row.group));
  const clone = value => JSON.parse(JSON.stringify(value));
  const hash = value => [...value].reduce((n, char) => (n * 31 + char.charCodeAt(0)) >>> 0, 23);
  function count(domain, row, countyIndex) {
    const n = Number(row.id.slice(1)), title = normalize(row.title), w = weights[countyIndex];
    const seed = hash(domain.id + ':' + row.id + ':' + countyIndex);
    const varied = base => Math.max(0, Math.round(base * w * (0.8 + seed % 41 / 100)));
    let value;
    if (domain.id === 'space') {
      const schools = Math.round(235 * w), buildingNeeds = Math.max(1, Math.round(8 * w));
      const base = { 2: schools, 3: schools * 7, 4: buildingNeeds, 5: buildingNeeds * 4,
        6: Math.max(1, Math.round(5 * w)), 7: Math.max(1, Math.round(5 * w)) * 6,
        8: Math.max(1, Math.round(3 * w)), 9: Math.round(18 * w), 10: Math.round(24 * w),
        31: Math.max(2, Math.round(schools * 0.14)), 32: Math.round(schools * 0.56),
        33: Math.round(12 * w), 34: Math.round(7 * w), 35: Math.round(9 * w) };
      value = Object.hasOwn(base, n) ? base[n] : varied(need(row) ? 11 + n % 8 : 45 + n % 19);
    } else if (domain.id === 'equipment') {
      let base = /میز و نیمکت/.test(title) ? 1600 : /کتاب/.test(title) ? 3200 : /منابع مرجع/.test(title) ? 900 :
        /صندلی سالن/.test(title) ? 280 : /رایانه/.test(title) ? 130 : /تخته/.test(title) ? 110 :
        /میز معلم/.test(title) ? 95 : /کمد|قفسه/.test(title) ? 80 : /مطالعه/.test(title) ? 65 : 35;
      if (need(row)) base *= 0.12 + seed % 19 / 100;
      value = n === 57 ? varied(9) : varied(base);
    } else if (domain.id === 'workshops') value = varied(3 + n % 9);
    else if (domain.id === 'specialized') value = varied(n === 20 ? 160 : /رایانه/.test(title) ? 22 : 4 + n % 13);
    else if (domain.id === 'safety') {
      const base = { 2: 185, 3: 32, 4: 105, 5: 54, 6: 18, 7: 28, 8: 22, 9: 36,
        10: 39, 11: 27, 12: 43, 13: 9, 14: 11, 15: 7, 16: 480, 17: 85, 18: 65, 19: 21,
        20: 34, 21: 23, 22: 270, 23: 120, 24: 6, 25: 12, 26: 17, 27: 8, 28: 7,
        29: 16, 30: 19, 31: 11, 32: 280, 33: 63, 34: 87, 35: 72, 36: 21 };
      value = varied(base[n]);
    } else if (domain.id === 'welfare') {
      const base = { 2: 5, 3: 2, 4: 1, 5: 180, 6: 65, 7: 40, 8: 55, 9: 8, 10: 25, 11: 11,
        12: 9, 13: 7, 14: 6, 15: 2, 16: 5, 17: 8, 18: 2, 19: 3, 20: 3, 24: 85,
        25: 22, 26: 30, 27: 16, 28: 9, 32: 70 };
      value = varied(base[n]);
    } else if (domain.id === 'students') {
      const base = { 2: 800, 3: 650, 4: 480, 5: 140, 6: 370, 7: 590, 8: 55, 9: 18, 10: 12,
        11: 16, 12: 9, 13: 6, 14: 8, 15: 5, 16: 21, 17: 26, 18: 34, 19: 42, 20: 29, 21: 11 };
      value = varied(base[n]);
    } else if (domain.id === 'nomadic') {
      const schools = Math.max(4, Math.round(40 * w * (countyIndex === 4 ? 1.6 : 1)));
      const mobile = Math.round(schools * 0.38);
      const base = { 2: schools, 3: schools * 21 + countyIndex * 3, 4: Math.round(schools * 1.7),
        5: mobile, 6: schools - mobile, 7: schools + 3, 8: Math.round(schools * 0.22),
        9: mobile, 10: Math.round(mobile * 0.35), 11: Math.round(schools * 0.6),
        12: Math.round(schools * 0.18), 13: schools, 14: Math.round(schools * 0.2),
        15: mobile, 16: Math.round(mobile * 0.3), 17: schools, 18: Math.round(schools * 0.2),
        19: schools, 20: Math.round(schools * 0.2), 21: Math.round(schools * 0.24),
        22: Math.round(schools * 0.3), 23: Math.round(schools * 0.2), 24: Math.round(schools * 0.3),
        25: Math.round(schools * 0.25), 26: schools * 7, 27: Math.round(schools * 0.2), 28: Math.round(schools * 0.3) };
      value = base[n];
    } else value = varied(n === 2 ? 5 : n === 3 ? 2 : n === 4 ? 8 : 3 + n % 6);
    // Recorded zeros make zero/no-data behavior visible, without emptying an entire indicator.
    return need(row) && seed % 17 === 0 && !['space', 'nomadic'].includes(domain.id) ? 0 : value;
  }
  function value(domain, row, countyIndex) {
    if (row.kind === 'count') return count(domain, row, countyIndex);
    const n = Number(row.id.slice(1)), title = normalize(row.title), seed = hash(row.id + ':' + countyIndex);
    if (row.kind === 'presence') return seed % 3 ? 'دارد' : 'ندارد';
    if (row.kind === 'boolean') return seed % 3 ? 'بله' : 'خیر';
    if (row.kind === 'year') return String(1385 + seed % 21);
    if (/ظرفیت/.test(title)) return String(Math.round((n === 23 ? 95 : 180) * weights[countyIndex])) + ' نفر';
    if (n === 21) return ['ساخت مرکز جدید', 'نیاز ندارد', 'یک مرکز جدید'][countyIndex % 3];
    if (n === 22) return ['افزایش اتاق‌ها', 'بهسازی و توسعه', 'نیاز ندارد'][countyIndex % 3];
    if (/سرمایشی/.test(title)) return ['کولر آبی', 'اسپلیت', 'بهسازی تهویه'][countyIndex % 3];
    if (/گرمایشی/.test(title)) return ['رادیاتور', 'موتورخانه', 'بخاری استاندارد'][countyIndex % 3];
    return 'پاسخ آزمایشی ' + D.fa(countyIndex + 1);
  }
  const workbook = {
    filename: 'داده آزمایشی کامل — غیرواقعی', synthetic: true, counties: [...D.counties],
    sheets: D.definitions.map(domain => {
      const original = D.S.sheets.find(sheet => sheet.id === domain.id);
      return { id: domain.id, title: domain.title, sheetName: original.sheetName, icon: domain.id,
        columns: [...original.columns], countyStart: original.countyStart,
        rows: domain.rows.map(row => {
          const values = D.counties.map((_, index) => value(domain, row, index));
          const metadata = original.rows.find(r => r.id === row.id);
          const headers = metadata ? metadata.cells.slice(0, original.countyStart) : Array.from({ length: original.countyStart }, (_, index) => index === original.countyStart - 1 ? row.title : index === 0 ? row.group : null);
          return { id: row.id, excelRow: metadata?.excelRow || Number(row.id.slice(1)), group: row.group, title: row.title,
            placeholder: false, kind: row.kind, cells: [...headers,
              ...values, row.kind === 'count' ? values.reduce((sum, v) => sum + v, 0) : null] };
        }) };
    })
  };
  function records(timestamp = Date.now()) {
    const statuses = ['draft', 'submitted', 'approved', 'changes_requested', 'resubmitted'];
    return D.counties.flatMap((county, countyIndex) => statuses.map((status, slot) => {
      const index = countyIndex * statuses.length + slot, state = D.seed();
      const type = D.profileChoices.type[(countyIndex * 3 + slot) % D.profileChoices.type.length];
      const submittedAt = new Date(timestamp - (1 + index % 40) * 86400000).toISOString();
      const code = String(710001 + index);
      state.profile = { ...state.profile, name: type + ' آزمایشی ' + D.fa(slot + 1) + ' · ' + county,
        code, county, type, level: slot % 2 ? 'ابتدایی' : 'متوسطه دوم', gender: D.profileChoices.gender[index % 4],
        students: String(120 + index * 7), classrooms: String(4 + index % 12), period: index % 3 === 0 ? '1404' : '1405' };
      for (const domain of D.definitions) {
        const section = state.sections[domain.id];
        for (const row of domain.rows) {
          const saved = section.rows.find(item => item.id === row.id), sample = value(domain, row, countyIndex);
          saved.value = row.kind === 'count' ? String(Math.floor(sample / 5) + (slot < sample % 5 ? 1 : 0)) : String(sample);
          saved.unknown = false; saved.notes = '';
        }
        section.extras.forEach((field, fieldIndex) => {
          const definition = domain.extras.find(f => f.id === field.id);
          if (definition.kind === 'boolean') field.value = (index + fieldIndex) % 3 ? 'بله' : 'خیر';
          else if (definition.kind === 'count') field.value = String(4 + (index + fieldIndex) % 19);
          else if (field.id === 'dormitory-code') field.value = code;
          else if (field.id === 'teacher-home-name') field.value = 'مرکز اقامتی آزمایشی ' + county;
          else if (field.id === 'heating-type') field.value = ['موتورخانه', 'رادیاتور', 'بخاری استاندارد'][index % 3];
          else if (field.id === 'cooling-type') field.value = ['کولر آبی', 'اسپلیت'][index % 2];
        });
        if (['equipment', 'workshops', 'specialized', 'welfare'].includes(domain.id)) {
          section.items = [
            { id: 'demo-item-' + index + '-1', place: 'فضای آزمایشی ' + D.fa(slot + 1), title: 'رایانه نمونه', count: String(1 + index % 7) },
            { id: 'demo-item-' + index + '-2', place: 'کلاس آزمایشی ' + D.fa(slot + 1), title: 'میز و صندلی نمونه', count: String(4 + index % 17) }
          ];
        }
        section.started = true; section.completed = status !== 'draft'; section.updatedAt = submittedAt;
      }
      // Maintain the basic nomadic school identity in each experimental form as well.
      const nomadic = state.sections.nomadic.rows;
      nomadic.find(r => r.id === 'r2').value = String(Number(nomadic.find(r => r.id === 'r5').value) + Number(nomadic.find(r => r.id === 'r6').value));
      state.savedAt = submittedAt;
      state.submission = status === 'draft' ? null : { at: submittedAt, tracking: 'DEMO-1405-' + code };
      return { id: 'demo-center-' + code, county, code, status, state,
        snapshot: status === 'draft' ? null : clone(state), updatedAt: submittedAt };
    }));
  }
  global.PortalDemoData = Object.freeze({ workbook, records, seedVersion: 3 });
})(window);
