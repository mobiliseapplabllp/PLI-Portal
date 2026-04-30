const multer = require('multer');
const kpiAssignmentService = require('../services/kpiAssignment.service');
const KpiAssignment = require('../models/KpiAssignment');
const { sendSuccess, sendPaginated } = require('../utils/response');
const upload = require('../middleware/upload');

// Dedicated multer for KPI attachments (larger limit, any file type)
const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

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

const saveDraft = async (req, res, next) => {
  try {
    const assignment = await kpiAssignmentService.saveDraft(req.params.id, req.body.items, req.user);
    sendSuccess(res, assignment, 'Draft saved');
  } catch (error) {
    next(error);
  }
};

const approveCommitment = async (req, res, next) => {
  try {
    const assignment = await kpiAssignmentService.approveCommitment(req.params.id, req.user);
    sendSuccess(res, assignment, 'Commitment approved');
  } catch (error) {
    next(error);
  }
};

const rejectCommitment = async (req, res, next) => {
  try {
    const assignment = await kpiAssignmentService.rejectCommitment(req.params.id, req.body.rejectionComment, req.user);
    sendSuccess(res, assignment, 'Commitment rejected — employee must resubmit');
  } catch (error) {
    next(error);
  }
};

const reviewCommitment = async (req, res, next) => {
  try {
    const result = await kpiAssignmentService.reviewCommitmentItems(req.params.id, req.body.items, req.user);
    sendSuccess(res, result, 'Commitment review submitted');
  } catch (error) {
    next(error);
  }
};

const employeeSubmit = [
  attachmentUpload.single('attachment'),
  async (req, res, next) => {
    try {
      // items may arrive as JSON string (multipart) or as parsed array (JSON body)
      let items = req.body.items;
      if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch { items = []; }
      }
      const assignment = await kpiAssignmentService.employeeSubmit(req.params.id, items, req.file || null, req.user);
      sendSuccess(res, assignment, 'Employee submission successful');
    } catch (error) {
      next(error);
    }
  },
];

const managerReview = [
  attachmentUpload.single('attachment'),
  async (req, res, next) => {
    try {
      let items = req.body.items;
      if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch { items = []; }
      }
      const assignment = await kpiAssignmentService.managerReview(req.params.id, items, req.file || null, req.user);
      sendSuccess(res, assignment, 'Manager review submitted');
    } catch (error) {
      next(error);
    }
  },
];

const getEmployeeAttachment = async (req, res, next) => {
  try {
    const assignment = await KpiAssignment.findByPk(req.params.id, {
      attributes: ['id', 'employeeId', 'employeeAttachmentBlob', 'employeeAttachmentName', 'employeeAttachmentMime'],
    });
    if (!assignment || !assignment.employeeAttachmentBlob) {
      return res.status(404).json({ success: false, error: { message: 'No attachment found' } });
    }
    const user = req.user;
    if (user.role === 'employee' && String(assignment.employeeId) !== String(user._id)) {
      return res.status(403).json({ success: false, error: { message: 'Forbidden' } });
    }
    res.setHeader('Content-Type', assignment.employeeAttachmentMime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(assignment.employeeAttachmentName || 'attachment')}"`);
    res.send(assignment.employeeAttachmentBlob);
  } catch (error) {
    next(error);
  }
};

const getManagerAttachment = async (req, res, next) => {
  try {
    const assignment = await KpiAssignment.findByPk(req.params.id, {
      attributes: ['id', 'managerAttachmentBlob', 'managerAttachmentName', 'managerAttachmentMime'],
    });
    if (!assignment || !assignment.managerAttachmentBlob) {
      return res.status(404).json({ success: false, error: { message: 'No attachment found' } });
    }
    res.setHeader('Content-Type', assignment.managerAttachmentMime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(assignment.managerAttachmentName || 'attachment')}"`);
    res.send(assignment.managerAttachmentBlob);
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
  saveDraft,
  approveCommitment,
  rejectCommitment,
  reviewCommitment,
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
  getEmployeeAttachment,
  getManagerAttachment,
};
