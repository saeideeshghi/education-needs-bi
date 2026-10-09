/* Standalone schema, validation and illustrative records. No portal storage is read. */
(function () {
  "use strict";
  const S = window.PortalSource;
  const VERSION = 2;
  const MAX_COUNT = 1000000;
  const counties = S.counties;
  const profileChoices = {
    type: ["مدرسه", "هنرستان", "پژوهش‌سرا", "کانون", "مرکز مشاوره", "مرکز سنجش", "خوابگاه", "خانه معلم", "مدرسه عشایری", "مرکز استثنایی"],
    level: ["ابتدایی", "متوسطه اول", "متوسطه دوم", "چندمقطعی", "مرکز آموزشی و رفاهی"],
    gender: ["دخترانه", "پسرانه", "مختلط", "مرکز بدون تفکیک جنسیت"]
  };
  const extraFields = {
    space: [
      { id: "rebuild", title: "مرکز نیازمند بازسازی", kind: "boolean", value: "خیر" },
      { id: "strengthen", title: "مرکز نیازمند مقاوم‌سازی", kind: "boolean", value: "بله" }
    ],
    safety: [
      { id: "heating-type", title: "نوع سیستم گرمایشی موجود", kind: "text", value: "موتورخانه و رادیاتور" },
      { id: "cooling-type", title: "نوع سیستم سرمایشی موجود", kind: "text", value: "کولر آبی" },
      { id: "heating-repair", title: "نیاز به اصلاح یا نوسازی گرمایش", kind: "boolean", value: "بله" },
      { id: "powerhouse-build", title: "نیاز به احداث موتورخانه", kind: "boolean", value: "خیر" },
      { id: "powerhouse-rebuild", title: "نیاز به بازسازی موتورخانه", kind: "boolean", value: "بله" },
      { id: "wiring", title: "برق‌کشی نیازمند اصلاح", kind: "boolean", value: "بله" },
      { id: "board", title: "تابلو برق نیازمند تعویض", kind: "boolean", value: "خیر" },
      { id: "solar", title: "سامانه خورشیدی نیازمند توسعه", kind: "boolean", value: "خیر" },
      { id: "water", title: "شبکه آب نیازمند اصلاح", kind: "boolean", value: "خیر" },
      { id: "sewage", title: "شبکه فاضلاب نیازمند اصلاح", kind: "boolean", value: "بله" },
      { id: "disposal", title: "سیستم دفع فاضلاب نیازمند اصلاح", kind: "boolean", value: "خیر" },
      { id: "alarm", title: "سیستم اعلام حریق موجود", kind: "boolean", value: "بله" },
      { id: "extinguishing", title: "سیستم اطفای حریق موجود", kind: "boolean", value: "خیر" }
    ],
    welfare: [
      { id: "dormitory-code", title: "کد مدرسه شبانه‌روزی", kind: "text", value: "123456" },
      { id: "dormitory-rebuild", title: "خوابگاه نیازمند بازسازی", kind: "boolean", value: "بله" },
      { id: "dormitory-build", title: "خوابگاه نیازمند احداث", kind: "boolean", value: "خیر" },
      { id: "dormitory-capacity", title: "خوابگاه نیازمند افزایش ظرفیت", kind: "boolean", value: "بله" },
      { id: "bath-repair", title: "حمام نیازمند بهسازی", kind: "boolean", value: "بله" },
      { id: "bath-build", title: "حمام نیازمند احداث", kind: "boolean", value: "خیر" },
      { id: "toilet-repair", title: "سرویس بهداشتی نیازمند بهسازی", kind: "boolean", value: "بله" },
      { id: "toilet-build", title: "سرویس بهداشتی نیازمند احداث", kind: "boolean", value: "خیر" },
      { id: "teacher-home-name", title: "نام خانه معلم / مرکز اقامتی", kind: "text", value: "مرکز اقامتی نمونه" },
      { id: "teacher-home-develop", title: "خانه معلم نیازمند توسعه", kind: "boolean", value: "بله" },
      { id: "lodging-needed", title: "ظرفیت اقامتی موردنیاز", kind: "count", value: "12" },
      { id: "hall-needed", title: "ظرفیت تالار موردنیاز", kind: "count", value: "20" }
    ]
  };
  const detailSeeds = {
    equipment: [
      { id: "sample-lab-1", place: "آزمایشگاه علوم", title: "میکروسکوپ آموزشی", count: "3" },
      { id: "sample-lab-2", place: "آزمایشگاه علوم", title: "کیت آزمایش شیمی", count: "4" }
    ],
    workshops: [
      { id: "sample-workshop-1", place: "کارگاه برق و الکترونیک", title: "میز آموزش مدار", count: "6" },
      { id: "sample-workshop-2", place: "کارگاه کامپیوتر و شبکه", title: "رایانه کارگاهی", count: "10" }
    ],
    specialized: [
      { id: "sample-center-1", place: "پژوهش‌سرا / رباتیک", title: "کیت رباتیک", count: "8" },
      { id: "sample-center-2", place: "مرکز سنجش", title: "اسکنر پاسخ‌برگ", count: "2" }
    ],
    welfare: [
      { id: "sample-kitchen-1", place: "آشپزخانه خوابگاه", title: "اجاق گاز صنعتی", count: "1" },
      { id: "sample-kitchen-2", place: "آشپزخانه خانه معلم", title: "یخچال صنعتی", count: "2" }
    ]
  };
  const definitions = S.sheets.map((sheet) => ({
    id: sheet.id, title: sheet.title, heading: sheet.title, icon: sheet.icon, applicable: true,
    rows: sheet.rows.filter((row) => !row.placeholder), extras: extraFields[sheet.id] || [],
    details: Object.hasOwn(detailSeeds, sheet.id)
  }));
  const applicable = definitions;
  const indicatorCount = definitions.reduce((count, definition) => count + definition.rows.length, 0);
  function latin(value) {
    return String(value ?? "").replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
      .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  }
  function fa(value) { return String(value ?? "").replace(/[0-9]/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]); }
  function parseCount(value) {
    const normalized = latin(value).trim();
    if (!/^\d+$/.test(normalized)) return null;
    const number = Number(normalized);
    return Number.isSafeInteger(number) && number >= 0 && number <= MAX_COUNT ? number : null;
  }
  function escape(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }
  function sampleValue(definition, row, countyIndex) {
    const n = row.excelRow;
    const scale = countyIndex === undefined ? 1 : [2, 1, 5, 1, 2, 2, 4, 1, 1, 1][countyIndex];
    if (row.kind === "presence") return (n + (countyIndex || 0)) % 3 === 0 ? "ندارد" : "دارد";
    if (row.kind === "year") return String(1399 + n % 5);
    if (row.kind === "text") {
      if (n === 21) return "در دست اقدام";
      if (n === 22) return "1 (نیمه‌تمام)";
      if (n === 23) return "12 اتاق هتلی / 3 سوئیت";
      if (n === 29) return "کولر آبی / نیاز به 2 دستگاه";
      if (n === 30) return "پکیج / نیاز به سرویس";
      return n === 31 ? "40 نفر" : n === 33 ? "50 نفر" : "60 نفر";
    }
    if (definition.id === "space" && n === 2) return String(scale);
    if (definition.id === "space" && n === 3) return String(12 * scale);
    if (definition.id === "equipment" && n === 2) return String(120 * scale);
    if (definition.id === "equipment" && n === 3) return String(18 * scale);
    if (/دانش.?آموز|دانش آموز/.test(row.title)) return String((definition.id === "nomadic" ? 35 : 18 + n * 2) * scale);
    if (/کتاب.*موجود|منابع.*موجود/.test(row.title)) return String((120 + n * 3) * scale);
    if (/ظرفیت/.test(row.title)) return String((15 + n) * scale);
    return String((n % 7) * scale);
  }
  function seed() {
    const sections = {};
    definitions.forEach((definition) => {
      sections[definition.id] = {
        completed: ["space", "students"].includes(definition.id), started: true, updatedAt: null,
        rows: definition.rows.map((row) => ({ id: row.id, value: sampleValue(definition, row), notes: "", unknown: false })),
        extras: definition.extras.map((field) => ({ id: field.id, value: field.value })),
        items: (detailSeeds[definition.id] || []).map((item) => ({ ...item }))
      };
    });
    return { schemaVersion: VERSION, profile: { name: "دبیرستان نمونه", code: "123456", county: "بجنورد", type: "مدرسه", level: "متوسطه دوم", gender: "پسرانه", students: "360", classrooms: "12", period: "1405", discrepancy: "" }, sections, savedAt: null, submission: null, migrated: false, legacyDraft: null };
  }
  function validValue(value, kind) {
    if (kind === "presence") return ["دارد", "ندارد"].includes(value);
    if (kind === "boolean") return ["بله", "خیر"].includes(value);
    if (kind === "text") return typeof value === "string" && value.trim().length > 0 && value.length <= 180;
    const count = parseCount(value);
    return kind === "year" ? count !== null && count >= 1300 && count <= 1499 : count !== null;
  }
  function validateSection(section, definition) {
    const errors = [];
    if (!definition) throw new Error("Section definition is required");
    definition.rows.forEach((item) => {
      const row = section.rows.find((saved) => saved.id === item.id);
      if (!row || (!row.unknown && !validValue(row.value, item.kind))) errors.push({ rowId: item.id, field: "value", message: item.kind === "year" ? "سال شمسی بین ۱۳۰۰ تا ۱۴۹۹ وارد کنید." : item.kind === "count" ? "یک عدد صحیح بین صفر تا یک میلیون وارد کنید." : "مقدار یا وضعیت این شاخص را وارد کنید." });
    });
    definition.extras.forEach((field) => {
      const row = section.extras.find((item) => item.id === field.id);
      if (!row || !validValue(row.value, field.kind)) errors.push({ rowId: field.id, field: "extra", message: "این فیلد را کامل کنید." });
    });
    section.items.forEach((item) => {
      if (!item.place.trim()) errors.push({ rowId: item.id, field: "place", message: "نام مرکز یا فضا را وارد کنید." });
      if (!item.title.trim()) errors.push({ rowId: item.id, field: "title", message: "شرح تجهیز را وارد کنید." });
      if (parseCount(item.count) === null) errors.push({ rowId: item.id, field: "count", message: "تعداد را با عدد صحیح وارد کنید." });
    });
    return errors;
  }
  function complete(state, id) {
    const definition = definitions.find((item) => item.id === id);
    return state.sections[id]?.completed === true && validateSection(state.sections[id], definition).length === 0;
  }
  function stats(state) {
    const completed = definitions.filter((definition) => complete(state, definition.id)).length;
    return { completed, total: definitions.length, percent: Math.round(completed / definitions.length * 100) };
  }
  function nextSection(state) { return definitions.find((definition) => !complete(state, definition.id))?.id || "space"; }
  function unknownCount(state) { return definitions.reduce((count, definition) => count + state.sections[definition.id].rows.filter((row) => row.unknown).length, 0); }
  function cellValue(cell) { return cell && typeof cell === "object" ? cell.value : cell; }
  window.PortalData = Object.freeze({ S, VERSION, MAX_COUNT, counties, profileChoices, definitions, applicable, indicatorCount, latin, fa, escape, parseCount, validValue, sampleValue, cellValue, seed, validateSection, complete, stats, nextSection, unknownCount });
})();
