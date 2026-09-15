/**
 * Working Calendar (Phase 1) — hours/day + Saturday policy + holiday list.
 *
 *   GET  /pm/config/calendar                       policy (no holidays)
 *   PUT  /pm/config/calendar                       admin: update policy
 *   GET  /pm/config/calendar/preview?month=YYYY-MM month grid + capacity numbers
 *   GET  /pm/config/calendar/working-days?from&to  working days + capacity hours in a window
 *   GET  /pm/config/holidays?year=YYYY
 *   POST /pm/config/holidays                       admin
 *   PUT  /pm/config/holidays/:id                   admin
 *   DELETE /pm/config/holidays/:id                 admin
 *   GET  /pm/config/holidays/import/template       xlsx
 *   POST /pm/config/holidays/import/validate       admin, multipart 'file' — no DB writes
 *   POST /pm/config/holidays/import/commit         admin, { rows }
 *
 * Validation (400) and duplicate-date (409) errors use the unified
 * { success:false, message, error:{ message } } shape (utils/response sendError).
 */
const { Op }            = require('sequelize');
const sequelize         = require('../../config/database');   // instance — never destructure
const PmHoliday         = require('../../models/pm/PmHoliday');
const pmSettingsService = require('../../services/pm/pmSettings.service');
const { sendSuccess, sendError } = require('../../utils/response');
const { ValidationError, NotFoundError } = require('../../utils/errors');
const { dayKind, getMonthlyCapacity, iso, workingDaysBetween } = require('../../utils/capacityEngine');

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// ── Helpers ──────────────────────────────────────────────────────────────────

const ISO_RE   = /^(\d{4})-(\d{2})-(\d{2})$/;
const DMY_RE   = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;

/** True when y/m/d is a real calendar date. */
const isRealDate = (y, m, d) => {
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
};
const pad = (n) => String(n).padStart(2, '0');

/**
 * Normalise any accepted date input to 'YYYY-MM-DD', or null when unparseable.
 * Accepts a JS Date (Excel date cell), 'YYYY-MM-DD', 'DD-MM-YYYY', 'DD/MM/YYYY'.
 * Excel date cells arrive as an instant at (or near) midnight; shifting by
 * +12h and reading UTC fields yields the intended calendar day regardless of
 * the server's timezone.
 */
const parseDate = (v) => {
  if (v == null || v === '') return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    const d = new Date(v.getTime() + 12 * 3600 * 1000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(v).trim();
  let y, m, d, mt;
  if ((mt = s.match(ISO_RE)))      { y = +mt[1]; m = +mt[2]; d = +mt[3]; }
  else if ((mt = s.match(DMY_RE))) { d = +mt[1]; m = +mt[2]; y = +mt[3]; }
  else return null;
  return isRealDate(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null;
};

const isSunday = (isoDate) => {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d).getDay() === 0;
};

const toBool = (v) => {
  if (typeof v === 'boolean') return v;
  if (v == null) return false;
  return ['y', 'yes', '1', 'true'].includes(String(v).trim().toLowerCase());
};

/** Plain text of an ExcelJS cell value (handles rich text, hyperlinks, formulas). */
const cellText = (v) => {
  if (v == null) return '';
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if (v.result !== undefined) return cellText(v.result);
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('');
    if (v.text !== undefined) return String(v.text);
    return '';
  }
  return String(v);
};

const holidayJson = (row) => ({
  id: row.id, date: String(row.date).slice(0, 10), name: row.name, year: row.year, isOptional: !!row.isOptional,
});

/** Map ValidationError / NotFoundError to the unified error shape; everything else → next. */
const handle = (e, res, next) => {
  if (e instanceof ValidationError || e instanceof NotFoundError) {
    return sendError(res, e.message, e.statusCode);
  }
  return next(e);
};

const conflict = (res, date) =>
  sendError(res, `A holiday already exists on ${date}`, 409);

const userId = (req) => req.user?._id || req.user?.id || null;

// ── Calendar policy ──────────────────────────────────────────────────────────

const getCalendar = async (req, res, next) => {
  try {
    const { hoursPerDay, workingSaturdays } = await pmSettingsService.getCalendar();
    sendSuccess(res, { hoursPerDay, workingSaturdays });
  } catch (e) { next(e); }
};

const updateCalendar = async (req, res, next) => {
  try {
    const { hoursPerDay, workingSaturdays } = req.body || {};
    sendSuccess(res, await pmSettingsService.updateCalendar({ hoursPerDay, workingSaturdays }), 'Calendar updated');
  } catch (e) { handle(e, res, next); }
};

const getCalendarPreview = async (req, res, next) => {
  try {
    let year, month;
    if (req.query.month) {
      const mt = String(req.query.month).match(MONTH_RE);
      if (!mt || +mt[2] < 1 || +mt[2] > 12) throw new ValidationError('month must be in YYYY-MM format');
      year = +mt[1]; month = +mt[2];
    } else {
      const now = new Date(); year = now.getFullYear(); month = now.getMonth() + 1;
    }

    const calendar = await pmSettingsService.getCalendar();
    const cap = getMonthlyCapacity(year, month, calendar);

    const first = `${year}-${pad(month)}-01`;
    const last  = `${year}-${pad(month)}-${pad(cap.daysInMonth)}`;
    const rows  = await PmHoliday.findAll({
      where: { date: { [Op.between]: [first, last] } },
      order: [['date', 'ASC']],
    });
    const byDate = new Map(rows.map((r) => [String(r.date).slice(0, 10), r]));

    const days = [];
    for (let d = 1; d <= cap.daysInMonth; d++) {
      const date = new Date(year, month - 1, d);
      const key  = iso(date);
      const hol  = byDate.get(key);
      days.push({
        date: key,
        dow:  date.getDay(),
        kind: dayKind(date, calendar),          // optional holidays stay 'working'
        holidayName:       hol ? hol.name : null,
        isOptionalHoliday: hol ? !!hol.isOptional : false,
      });
    }

    sendSuccess(res, {
      year, month,
      hoursPerDay:      calendar.hoursPerDay,
      workingSaturdays: calendar.workingSaturdays,
      daysInMonth:      cap.daysInMonth,
      workingDays:      cap.workingDays,
      sundays:          cap.sundays,
      saturdaysOff:     cap.saturdaysOff,
      saturdaysOn:      cap.saturdaysOn,
      totalHours:       cap.totalHours,
      holidays: rows.map((r) => ({ date: String(r.date).slice(0, 10), name: r.name, isOptional: !!r.isOptional })),
      days,
    });
  } catch (e) { handle(e, res, next); }
};

/**
 * GET /pm/config/calendar/working-days?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Working days in an inclusive window + the hours that window can hold —
 * lets the UI convert total hours ⇄ hours/day the same way the engine does.
 */
const getWorkingDays = async (req, res, next) => {
  try {
    const from = parseDate(req.query.from);
    const to   = parseDate(req.query.to);
    if (!from) throw new ValidationError('from must be a valid date in YYYY-MM-DD format');
    if (!to)   throw new ValidationError('to must be a valid date in YYYY-MM-DD format');
    if (to < from) throw new ValidationError('to must be on or after from');

    const calendar    = await pmSettingsService.getCalendar();
    const workingDays = workingDaysBetween(from, to, calendar);
    sendSuccess(res, {
      from, to, workingDays,
      hoursPerDay:   calendar.hoursPerDay,
      capacityHours: Math.round(workingDays * calendar.hoursPerDay * 10) / 10,
    });
  } catch (e) { handle(e, res, next); }
};

// ── Holidays CRUD ────────────────────────────────────────────────────────────

const getHolidays = async (req, res, next) => {
  try {
    const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();
    if (!Number.isInteger(year) || year < 1900 || year > 2200) throw new ValidationError('year must be a 4-digit year');
    const rows = await PmHoliday.findAll({ where: { year }, order: [['date', 'ASC']] });
    sendSuccess(res, rows.map(holidayJson));
  } catch (e) { handle(e, res, next); }
};

const validateHolidayBody = (body, { partial = false } = {}) => {
  const out = {};
  if (!partial || body.date !== undefined) {
    const date = parseDate(body.date);
    if (!date) throw new ValidationError('date must be a valid date in YYYY-MM-DD format');
    out.date = date;
    out.year = Number(date.slice(0, 4));
  }
  if (!partial || body.name !== undefined) {
    const name = body.name == null ? '' : String(body.name).trim();
    if (!name) throw new ValidationError('name is required');
    if (name.length > 150) throw new ValidationError('name must be 150 characters or fewer');
    out.name = name;
  }
  if (!partial || body.isOptional !== undefined) out.isOptional = toBool(body.isOptional);
  return out;
};

const createHoliday = async (req, res, next) => {
  try {
    const data = validateHolidayBody(req.body || {});
    if (await PmHoliday.findOne({ where: { date: data.date }, attributes: ['id'] })) return conflict(res, data.date);
    const row = await PmHoliday.create({ ...data, createdById: userId(req) });
    sendSuccess(res, holidayJson(row), 'Holiday created', 201);
  } catch (e) { handle(e, res, next); }
};

const updateHoliday = async (req, res, next) => {
  try {
    const row = await PmHoliday.findByPk(req.params.id);
    if (!row) throw new NotFoundError('Holiday');
    const data = validateHolidayBody(req.body || {}, { partial: true });
    if (data.date && data.date !== String(row.date).slice(0, 10)) {
      const clash = await PmHoliday.findOne({ where: { date: data.date, id: { [Op.ne]: row.id } }, attributes: ['id'] });
      if (clash) return conflict(res, data.date);
    }
    Object.assign(row, data);
    await row.save();
    sendSuccess(res, holidayJson(row), 'Holiday updated');
  } catch (e) { handle(e, res, next); }
};

const deleteHoliday = async (req, res, next) => {
  try {
    const row = await PmHoliday.findByPk(req.params.id);
    if (!row) throw new NotFoundError('Holiday');
    await row.destroy();
    sendSuccess(res, null, 'Holiday deleted');
  } catch (e) { handle(e, res, next); }
};

// ── Excel import ─────────────────────────────────────────────────────────────

const TEMPLATE_HEADERS = ['Date', 'Holiday Name', 'Optional (Y/N)'];

const getHolidayImportTemplate = async (req, res, next) => {
  try {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Holidays');
    ws.columns = [
      { header: TEMPLATE_HEADERS[0], key: 'date',       width: 16 },
      { header: TEMPLATE_HEADERS[1], key: 'name',       width: 36 },
      { header: TEMPLATE_HEADERS[2], key: 'isOptional', width: 16 },
    ];
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
    headerRow.height = 22;
    headerRow.alignment = { vertical: 'middle' };
    ws.addRow({ date: '2026-01-26', name: 'Republic Day',   isOptional: 'N' });
    ws.addRow({ date: '2026-10-20', name: 'Diwali',         isOptional: 'N' });
    ws.addRow({ date: '2026-11-14', name: "Children's Day", isOptional: 'Y' });
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1, activeCell: 'A2' }];

    res.setHeader('Content-Type', XLSX_MIME);
    res.setHeader('Content-Disposition', 'attachment; filename="holiday-import-template.xlsx"');
    res.send(await wb.xlsx.writeBuffer());
  } catch (e) { next(e); }
};

/**
 * Parse + validate an uploaded holiday sheet. No DB writes.
 * Response: { valid, errors, warnings, summary }
 */
const validateHolidayImport = async (req, res, next) => {
  try {
    if (!req.file) return sendError(res, 'No file uploaded', 400);
    if (req.file.size > 2 * 1024 * 1024) {
      return sendError(res, 'File too large. Maximum size is 2MB.', 400);
    }
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(req.file.buffer);
    const ws = wb.worksheets[0];
    if (!ws) return sendError(res, 'No worksheet found in file', 400);
    if (ws.rowCount - 1 > 1000) {
      return sendError(res, 'File exceeds 1000 data rows. Please split into smaller files.', 400);
    }

    // Pass 1 — parse every row
    const parsed = [];
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;                       // header
      const [, rawDate, rawName, rawOpt] = row.values;   // A=Date B=Holiday Name C=Optional
      const nameTxt = cellText(rawName);
      const name = nameTxt instanceof Date ? '' : nameTxt.trim();
      const optTxt = cellText(rawOpt);
      if (rawDate == null && !name && !optTxt) return;   // fully blank row
      parsed.push({ row: rowNumber, date: parseDate(cellText(rawDate)), name, isOptional: toBool(optTxt) });
    });

    // Existing dates in one query
    const wanted = [...new Set(parsed.map((p) => p.date).filter(Boolean))];
    const existingRows = wanted.length
      ? await PmHoliday.findAll({ where: { date: { [Op.in]: wanted } }, attributes: ['date'] })
      : [];
    const existing = new Set(existingRows.map((r) => String(r.date).slice(0, 10)));

    // Pass 2 — classify
    const valid = [], errors = [], warnings = [];
    const summary = { totalRows: parsed.length, valid: 0, errors: 0, alreadyExists: 0, duplicatesInFile: 0, onSunday: 0 };
    const seen = new Map();   // date → first row number
    for (const p of parsed) {
      const rowErrors = [];
      if (!p.date) rowErrors.push('Invalid or missing date');
      if (!p.name) rowErrors.push('Holiday name is required');
      if (p.date && seen.has(p.date)) {
        rowErrors.push(`Duplicate date in file (row ${seen.get(p.date)})`);
        summary.duplicatesInFile++;
      } else if (p.date) {
        seen.set(p.date, p.row);
      }
      if (rowErrors.length) {
        for (const message of rowErrors) errors.push({ row: p.row, message });
        continue;
      }
      if (p.date && isSunday(p.date)) {
        warnings.push({ row: p.row, message: 'Falls on a Sunday — no effect on capacity' });
        summary.onSunday++;
      }
      if (existing.has(p.date)) {
        warnings.push({ row: p.row, message: 'Already exists — will be skipped' });
        summary.alreadyExists++;
        continue;                                          // not in valid
      }
      valid.push({ row: p.row, date: p.date, name: p.name, isOptional: p.isOptional });
    }
    summary.valid  = valid.length;
    summary.errors = new Set(errors.map((e) => e.row)).size;   // rows with at least one error

    sendSuccess(res, { valid, errors, warnings, summary }, 'Validation complete');
  } catch (e) { next(e); }
};

/**
 * Insert validated rows inside one transaction, skipping dates already present.
 * Body: { rows: [{ date, name, isOptional }] } → { inserted, skipped, skippedDates }
 */
const commitHolidayImport = async (req, res, next) => {
  try {
    const { rows } = req.body || {};
    if (!Array.isArray(rows) || rows.length === 0) {
      return sendError(res, 'No rows provided', 400);
    }
    if (rows.length > 1000) {
      return sendError(res, 'Too many rows (max 1000)', 400);
    }

    // Server-side re-validation — never trust the client's shape
    const clean = [];
    const seen = new Set();
    const skippedDates = [];
    rows.forEach((r, i) => {
      const n = i + 1;
      const date = parseDate(r?.date);
      if (!date) throw new ValidationError(`Row ${n}: Invalid or missing date`);
      const name = r?.name == null ? '' : String(r.name).trim();
      if (!name) throw new ValidationError(`Row ${n}: Holiday name is required`);
      if (name.length > 150) throw new ValidationError(`Row ${n}: Holiday name must be 150 characters or fewer`);
      if (seen.has(date)) { skippedDates.push(date); return; }   // duplicate within payload
      seen.add(date);
      clean.push({ date, name, year: Number(date.slice(0, 4)), isOptional: toBool(r.isOptional) });
    });

    let inserted = 0;
    const t = await sequelize.transaction();
    try {
      const existingRows = await PmHoliday.findAll({
        where: { date: { [Op.in]: clean.map((c) => c.date) } },
        attributes: ['date'],
        transaction: t,
      });
      const existing = new Set(existingRows.map((r) => String(r.date).slice(0, 10)));
      const toInsert = [];
      for (const c of clean) {
        if (existing.has(c.date)) skippedDates.push(c.date);
        else toInsert.push({ ...c, createdById: userId(req) });
      }
      if (toInsert.length) {
        await PmHoliday.bulkCreate(toInsert, { transaction: t });
        inserted = toInsert.length;
      }
      await t.commit();
    } catch (e) {
      await t.rollback();
      return sendError(res, 'Import failed — all rows rolled back', 500, e.message);
    }

    sendSuccess(
      res,
      { inserted, skipped: skippedDates.length, skippedDates },
      `Import complete: ${inserted} inserted, ${skippedDates.length} skipped`
    );
  } catch (e) { handle(e, res, next); }
};

module.exports = {
  getCalendar, updateCalendar, getCalendarPreview, getWorkingDays,
  getHolidays, createHoliday, updateHoliday, deleteHoliday,
  getHolidayImportTemplate, validateHolidayImport, commitHolidayImport,
  // exposed for tests
  _parseDate: parseDate,
};
