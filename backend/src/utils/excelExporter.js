const ExcelJS = require('exceljs');

/**
 * Generate Excel workbook from report data
 * @param {string} title - Sheet name
 * @param {Array} columns - [{ header, key, width }]
 * @param {Array} rows - data rows
 * @returns {Buffer}
 */
const generateExcel = async (title, columns, rows) => {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(title);

  // Header styling
  sheet.columns = columns.map((col) => ({
    header: col.header,
    key: col.key,
    width: col.width || 18,
  }));

  // Style header row
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F4E79' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

  // Add data rows
  rows.forEach((row) => {
    sheet.addRow(row);
  });

  // Auto-filter
  if (rows.length > 0) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columns.length },
    };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
};

module.exports = { generateExcel };
