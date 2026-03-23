const reportService = require('../services/report.service');
const { sendSuccess } = require('../utils/response');
const { generateExcel } = require('../utils/excelExporter');
const { generatePdf } = require('../utils/pdfExporter');

const monthlyReport = async (req, res, next) => {
  try {
    const query = { ...req.query };
    // Employees can only see their own monthly data
    if (req.user.role === 'employee') {
      query.employee = req.user._id.toString();
    }
    const data = await reportService.getMonthlyReport(query);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

const quarterlyReport = async (req, res, next) => {
  try {
    const query = { ...req.query };
    // Employees can only see their own quarterly data
    if (req.user.role === 'employee') {
      query.employee = req.user._id.toString();
    }
    const data = await reportService.getQuarterlyReport(query);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

const departmentReport = async (req, res, next) => {
  try {
    const data = await reportService.getDepartmentReport(req.query);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

const pendingReport = async (req, res, next) => {
  try {
    const data = await reportService.getPendingReport(req.query);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

const exportExcel = async (req, res, next) => {
  try {
    const { reportType = 'monthly' } = req.query;
    let data, columns, rows;

    if (reportType === 'quarterly') {
      data = await reportService.getQuarterlyReport(req.query);
      columns = [
        { header: 'Employee Code', key: 'code', width: 15 },
        { header: 'Employee Name', key: 'name', width: 25 },
        { header: 'Quarterly Score', key: 'score', width: 15 },
        { header: 'PLI Payout %', key: 'payout', width: 15 },
        { header: 'PLI Label', key: 'label', width: 20 },
      ];
      rows = data.map((d) => ({
        code: d.employee.employeeCode,
        name: d.employee.name,
        score: d.quarterlyScore,
        payout: d.pliRecommendation?.payoutPercentage ?? 'N/A',
        label: d.pliRecommendation?.label ?? 'N/A',
      }));
    } else {
      data = await reportService.getMonthlyReport(req.query);
      columns = [
        { header: 'Employee Code', key: 'code', width: 15 },
        { header: 'Employee Name', key: 'name', width: 25 },
        { header: 'Month', key: 'month', width: 10 },
        { header: 'Status', key: 'status', width: 18 },
        { header: 'Monthly Score', key: 'score', width: 15 },
      ];
      rows = data.map((d) => ({
        code: d.assignment.employee?.employeeCode,
        name: d.assignment.employee?.name,
        month: d.assignment.month,
        status: d.assignment.status,
        score: d.assignment.monthlyWeightedScore ?? 'N/A',
      }));
    }

    const buffer = await generateExcel(`${reportType} Report`, columns, rows);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${reportType}_report.xlsx`);
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

const exportPdf = async (req, res, next) => {
  try {
    const { reportType = 'monthly' } = req.query;
    let data, headers, rows;

    if (reportType === 'quarterly') {
      data = await reportService.getQuarterlyReport(req.query);
      headers = ['Emp Code', 'Name', 'Q Score', 'Payout %', 'Label'];
      rows = data.map((d) => [
        d.employee.employeeCode,
        d.employee.name,
        d.quarterlyScore,
        d.pliRecommendation?.payoutPercentage ?? 'N/A',
        d.pliRecommendation?.label ?? 'N/A',
      ]);
    } else {
      data = await reportService.getMonthlyReport(req.query);
      headers = ['Emp Code', 'Name', 'Month', 'Status', 'Score'];
      rows = data.map((d) => [
        d.assignment.employee?.employeeCode,
        d.assignment.employee?.name,
        d.assignment.month,
        d.assignment.status,
        d.assignment.monthlyWeightedScore ?? 'N/A',
      ]);
    }

    const buffer = await generatePdf(`PLI Portal - ${reportType} Report`, headers, rows);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${reportType}_report.pdf`);
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

module.exports = { monthlyReport, quarterlyReport, departmentReport, pendingReport, exportExcel, exportPdf };
