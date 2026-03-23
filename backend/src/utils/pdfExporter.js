const PDFDocument = require('pdfkit');

/**
 * Generate a simple PDF report
 * @param {string} title
 * @param {Array} headers - column headers
 * @param {Array} rows - 2D array of cell values
 * @returns {Promise<Buffer>}
 */
const generatePdf = (title, headers, rows) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Title
    doc.fontSize(16).font('Helvetica-Bold').text(title, { align: 'center' });
    doc.moveDown();
    doc.fontSize(9).font('Helvetica').text(`Generated: ${new Date().toLocaleString()}`, { align: 'right' });
    doc.moveDown();

    // Simple table
    const colWidth = Math.min(120, (doc.page.width - 80) / headers.length);
    const startX = 40;
    let y = doc.y;

    // Header
    doc.font('Helvetica-Bold').fontSize(8);
    headers.forEach((header, i) => {
      doc.text(header, startX + i * colWidth, y, {
        width: colWidth - 4,
        align: 'left',
      });
    });

    y += 18;
    doc.moveTo(startX, y).lineTo(startX + headers.length * colWidth, y).stroke();
    y += 4;

    // Rows
    doc.font('Helvetica').fontSize(7);
    rows.forEach((row) => {
      if (y > doc.page.height - 60) {
        doc.addPage();
        y = 40;
      }
      row.forEach((cell, i) => {
        doc.text(String(cell ?? ''), startX + i * colWidth, y, {
          width: colWidth - 4,
          align: 'left',
        });
      });
      y += 15;
    });

    doc.end();
  });
};

module.exports = { generatePdf };
