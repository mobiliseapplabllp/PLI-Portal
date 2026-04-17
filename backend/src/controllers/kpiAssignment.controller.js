const kpiAssignmentService = require('../services/kpiAssignment.service');
const { sendSuccess, sendPaginated } = require('../utils/response');
const upload = require('../middleware/upload');

const getAssignments = async (req, res, next) => {
  try {
    const { assignments, pagination } = await kpiAssignmentService.getAssignments(req.query, req.user);
    sendPaginated(res, assignments, pagination);
  } catch (error) {
    next(error);
  }
};

const getAssignmentById = async (req, res, next) => {
  try {
    const result = await kpiAssignmentService.getAssignmentById(req.params.id, req.user);
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
};

const createAssignment = async (req, res, next) => {
  try {
    const assignment = await kpiAssignmentService.createAssignment(req.body, req.user);
    sendSuccess(res, assignment, 'KPI assignment created', 201);
  } catch (error) {
    next(error);
  }
};

const updateAssignment = async (req, res, next) => {
  try {
    const assignment = await kpiAssignmentService.updateAssignment(req.params.id, req.body, req.user);
    sendSuccess(res, assignment, 'Assignment updated');
  } catch (error) {
    next(error);
  }
};

const assignToEmployee = async (req, res, next) => {
  try {
    const assignment = await kpiAssignmentService.assignToEmployee(req.params.id, req.user);
    sendSuccess(res, assignment, 'KPIs assigned to employee');
  } catch (error) {
    next(error);
  }
};

const commitKpi = async (req, res, next) => {
  try {
    const assignment = await kpiAssignmentService.commitKpi(req.params.id, req.body.items, req.user);
    sendSuccess(res, assignment, 'Commitment submitted successfully');
  } catch (error) {
    next(error);
  }
};

const employeeSubmit = async (req, res, next) => {
  try {
    const assignment = await kpiAssignmentService.employeeSubmit(req.params.id, req.body.items, req.user);
    sendSuccess(res, assignment, 'Employee submission successful');
  } catch (error) {
    next(error);
  }
};

const managerReview = async (req, res, next) => {
  try {
    const assignment = await kpiAssignmentService.managerReview(req.params.id, req.body.items, req.user);
    sendSuccess(res, assignment, 'Manager review submitted');
  } catch (error) {
    next(error);
  }
};

const finalReview = async (req, res, next) => {
  try {
    const assignment = await kpiAssignmentService.finalReview(req.params.id, req.body.items, req.user);
    sendSuccess(res, assignment, 'Final review submitted');
  } catch (error) {
    next(error);
  }
};

const lockAssignment = async (req, res, next) => {
  try {
    const assignment = await kpiAssignmentService.lockAssignment(req.params.id, req.user);
    sendSuccess(res, assignment, 'Assignment locked');
  } catch (error) {
    next(error);
  }
};

const unlockAssignment = async (req, res, next) => {
  try {
    const assignment = await kpiAssignmentService.unlockAssignment(req.params.id, req.user);
    sendSuccess(res, assignment, 'Assignment unlocked');
  } catch (error) {
    next(error);
  }
};

const teamOverview = async (req, res, next) => {
  try {
    const managerId = req.user.role === 'admin' && req.query.managerId
      ? req.query.managerId
      : req.user._id;
    const data = await kpiAssignmentService.getTeamOverview(managerId, req.query);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

const adminOverview = async (req, res, next) => {
  try {
    const data = await kpiAssignmentService.getAdminOverview(req.query);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

const reopenAssignment = async (req, res, next) => {
  try {
    const { targetStatus } = req.body;
    const assignment = await kpiAssignmentService.reopenAssignment(req.params.id, targetStatus, req.user);
    sendSuccess(res, assignment, 'Assessment reopened successfully');
  } catch (error) {
    next(error);
  }
};

const cloneKpis = async (req, res, next) => {
  try {
    const result = await kpiAssignmentService.cloneKpis(req.body, req.user);
    sendSuccess(res, result, 'KPIs cloned successfully', 201);
  } catch (error) {
    next(error);
  }
};

const bulkCloneKpis = async (req, res, next) => {
  try {
    const result = await kpiAssignmentService.bulkCloneKpis(req.body, req.user);
    sendSuccess(res, result, 'Bulk clone completed');
  } catch (error) {
    next(error);
  }
};

const bulkImportKpis = [
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: { message: 'No file uploaded. Please upload an Excel file (.xlsx).' } });
      }

      const { financialYear, month } = req.body;
      if (!financialYear || !month) {
        return res.status(400).json({ success: false, error: { message: 'financialYear and month are required.' } });
      }

      const result = await kpiAssignmentService.bulkImportFromExcel(
        req.file.buffer,
        financialYear,
        Number(month),
        req.user
      );

      sendSuccess(res, result, `Import complete: ${result.success.length} succeeded, ${result.errors.length} errors`);
    } catch (error) {
      next(error);
    }
  },
];

const getImportTemplate = async (req, res, next) => {
  try {
    const workbook = await kpiAssignmentService.generateImportTemplate();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=kpi_import_template.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAssignments,
  getAssignmentById,
  createAssignment,
  updateAssignment,
  assignToEmployee,
  commitKpi,
  employeeSubmit,
  managerReview,
  finalReview,
  lockAssignment,
  unlockAssignment,
  teamOverview,
  adminOverview,
  reopenAssignment,
  cloneKpis,
  bulkCloneKpis,
  bulkImportKpis,
  getImportTemplate,
};
