'use strict';
const bulkImportService = require('../../services/pm/bulkImport.service');
const { sendSuccess } = require('../../utils/response');

// Lazy-load ExcelJS only when needed (avoids startup cost) — same pattern as
// the helpdesk ticket / milestone import templates.
let ExcelJS;
function getExcelJS() {
  if (!ExcelJS) ExcelJS = require('exceljs');
  return ExcelJS;
}

/**
 * GET /pm/projects/bulk-import/template
 */
const downloadTemplate = async (req, res, next) => {
  try {
    const XL = getExcelJS();
    const wb = new XL.Workbook();
    const ws = wb.addWorksheet('Projects');
    ws.columns = [
      { header: 'S.No', key: 'sno', width: 8 },
      { header: 'Client', key: 'client', width: 30 },
      { header: 'Project Name', key: 'projectName', width: 40 },
    ];
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
    headerRow.height = 20;
    ws.addRow({ sno: 1, client: 'Sodexo', projectName: 'HTM' });
    ws.addRow({ sno: 2, client: 'Cyrix', projectName: 'Kerala' });
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="bulk-import-projects-template.xlsx"');
    const buf = await wb.xlsx.writeBuffer();
    return res.send(buf);
  } catch (err) { next(err); }
};

/**
 * POST /pm/projects/bulk-import/validate
 */
const validateImport = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    if (req.file.size > 2 * 1024 * 1024) {
      return res.status(400).json({ message: 'File too large. Maximum size is 2MB.' });
    }
    const XL = getExcelJS();
    const wb = new XL.Workbook();
    await wb.xlsx.load(req.file.buffer);
    const ws = wb.worksheets[0];
    if (!ws) return res.status(400).json({ message: 'No worksheet found in file' });

    const headerValues = ws.getRow(1).values.slice(1); // ExcelJS pads index 0
    bulkImportService.assertHeadersValid(headerValues);

    if (ws.rowCount - 1 > 1000) {
      return res.status(400).json({ message: 'File exceeds 1000 data rows. Please split into smaller files.' });
    }

    const headerMap = headerValues.map(h => String(h || '').trim());
    const rawRows = [];
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const values = row.values.slice(1);
      const obj = {};
      headerMap.forEach((h, i) => { obj[h] = values[i]; });
      rawRows.push(obj);
    });

    const result = await bulkImportService.dryRun(rawRows);
    sendSuccess(res, { ...result, fileName: req.file.originalname }, 'Validation complete');
  } catch (err) { next(err); }
};

/**
 * POST /pm/projects/bulk-import/confirm
 * Body: { rows: [{ client, projectName, ... }], fileName }
 * Re-resolves and writes server-side — never trusts the client's earlier preview.
 */
const confirmImport = async (req, res, next) => {
  try {
    const { rows, fileName } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: 'No rows provided' });
    }
    const result = await bulkImportService.confirmImport(rows, req.user, fileName);
    sendSuccess(res, result, 'Import complete', 201);
  } catch (err) { next(err); }
};

/**
 * GET /pm/projects/bulk-import/logs
 */
const listImportLogs = async (req, res, next) => {
  try { sendSuccess(res, await bulkImportService.listImportLogs()); }
  catch (err) { next(err); }
};

/**
 * POST /pm/projects/bulk-import/:batchId/undo
 */
const undoImport = async (req, res, next) => {
  try {
    const result = await bulkImportService.undoImport(req.params.batchId);
    sendSuccess(res, result, 'Import undone');
  } catch (err) { next(err); }
};

module.exports = { downloadTemplate, validateImport, confirmImport, listImportLogs, undoImport };
