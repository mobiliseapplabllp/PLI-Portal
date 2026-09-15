const milestoneService  = require('../../services/pm/milestone.service');
const { sendSuccess, sendError } = require('../../utils/response');
// config/database exports the Sequelize instance directly — do NOT destructure
const sequelize         = require('../../config/database');
const Project           = require('../../models/pm/Project');
const Milestone         = require('../../models/pm/Milestone');
const User              = require('../../models/User');
const { randomUUID }    = require('crypto');

const getMilestones = async (req, res, next) => {
  try { sendSuccess(res, await milestoneService.getMilestones(req.params.id, req.user)); }
  catch (e) { next(e); }
};

const createMilestone = async (req, res, next) => {
  try {
    sendSuccess(res, await milestoneService.createMilestone(req.params.id, req.body, req.user), 'Milestone created', 201);
  } catch (e) { next(e); }
};

// POST /projects/:id/milestones/:milestoneId/sub — add sub-milestone under a default milestone
const createSubMilestone = async (req, res, next) => {
  try {
    sendSuccess(
      res,
      await milestoneService.createSubMilestone(req.params.id, req.params.milestoneId, req.body, req.user),
      'Sub-milestone created', 201
    );
  } catch (e) { next(e); }
};

const updateMilestone = async (req, res, next) => {
  try {
    const {
      name,
      description,
      status,
      weightPercentage,
      completionPercentage,
      accountableUserId,
      type,
      // plannedStartDate and plannedEndDate are write-once and must go through
      // PATCH /:milestoneId/planned-dates which has the write-once guard.
    } = req.body;

    const allowedData = Object.fromEntries(
      Object.entries({
        name,
        description,
        status,
        weightPercentage,
        completionPercentage,
        accountableUserId,
        type,
      }).filter(([, v]) => v !== undefined)
    );

    sendSuccess(res, await milestoneService.updateMilestone(req.params.id, req.params.milestoneId, allowedData, req.user), 'Milestone updated');
  } catch (e) { next(e); }
};

const deleteMilestone = async (req, res, next) => {
  try {
    await milestoneService.deleteMilestone(req.params.id, req.params.milestoneId, req.user);
    sendSuccess(res, null, 'Milestone deleted');
  } catch (e) { next(e); }
};

const updateStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!status) return sendError(res, 'status is required', 400);
    if (typeof status !== 'string' || !status.trim()) {
      return sendError(res, 'Invalid status value', 400);
    }
    const VALID_STATUSES = ['not_started', 'in_progress', 'completed', 'delayed', 'on_hold', 'cancelled'];
    if (!VALID_STATUSES.includes(status.trim())) {
      return sendError(res, `Invalid status "${status}". Valid values: ${VALID_STATUSES.join(', ')}`, 400);
    }
    sendSuccess(res, await milestoneService.updateMilestoneStatus(req.params.id, req.params.milestoneId, status.trim(), req.user), 'Status updated');
  } catch (e) { next(e); }
};

const updateProgress = async (req, res, next) => {
  try {
    const pct = Number(req.body.completionPercentage);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return sendError(res, 'completionPercentage must be a number between 0 and 100', 400);
    }
    req.body.completionPercentage = pct;
    sendSuccess(res, await milestoneService.updateMilestoneProgress(req.params.id, req.params.milestoneId, pct, req.user), 'Progress updated');
  } catch (e) { next(e); }
};

/**
 * GET /api/pm/milestones/export
 */
const exportMilestones = async (req, res, next) => {
  try {
    const ExcelJS = require('exceljs');
    const { projectType, status, projectId } = req.query;

    const ADMIN_ROLES = ['admin', 'manager', 'senior_manager'];
    const isAdminOrManager = ADMIN_ROLES.includes(req.user.role);

    if (!isAdminOrManager) {
      if (!projectId) {
        return sendError(res, 'projectId is required for your role to export milestones', 403);
      }
      const ProjectMember = require('../../models/pm/ProjectMember');
      const membership = await ProjectMember.findOne({ where: { projectId, userId: req.user.id } });
      if (!membership) {
        return sendError(res, 'You are not a member of this project', 403);
      }
    }

    const projectWhere = {};
    if (projectType) projectWhere.projectType = projectType;

    const where = {};
    if (status)    where.status    = status;
    if (projectId) where.projectId = projectId;

    const milestones = await Milestone.findAll({
      where,
      include: [
        {
          model: Project,
          as: 'project',
          attributes: ['id', 'name', 'projectType', 'billingType', 'status'],
          where: Object.keys(projectWhere).length ? projectWhere : undefined,
          required: Object.keys(projectWhere).length > 0,
        },
        { model: User, as: 'accountableUser', attributes: ['id', 'name', 'email'], required: false },
      ],
      order: [['createdAt', 'ASC']],
    });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Milestones');
    ws.columns = [
      { header: 'Project Name',     key: 'projectName',  width: 30 },
      { header: 'Project Type',     key: 'projectType',  width: 16 },
      { header: 'Billing Type',     key: 'billingType',  width: 14 },
      { header: 'Milestone Name',   key: 'name',         width: 35 },
      { header: 'Type',             key: 'type',         width: 12 },
      { header: 'Description',      key: 'description',  width: 40 },
      { header: 'Status',           key: 'status',       width: 15 },
      { header: 'Weight %',         key: 'weight',       width: 10 },
      { header: 'Completion %',     key: 'completion',   width: 14 },
      { header: 'Planned Start', key: 'plannedStartDate', width: 15 },
      { header: 'Planned End',   key: 'plannedEndDate',   width: 15 },
      { header: 'Actual Start',  key: 'actualStartDate',  width: 15 },
      { header: 'Actual End',    key: 'actualEndDate',    width: 15 },
      { header: 'Accountable User', key: 'accountable',  width: 25 },
    ];
    ws.getRow(1).font      = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    ws.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    ws.getRow(1).height    = 20;
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    milestones.forEach(m => {
      ws.addRow({
        projectName: m.project ? m.project.name : '',
        projectType: m.project ? m.project.projectType : '',
        billingType: m.project ? m.project.billingType : '',
        name:        m.name,
        type:        m.isDefault ? 'Default' : 'Sub',
        description: m.description || '',
        status:      m.status,
        weight:      m.weightPercentage ?? '',
        completion:  m.completionPercentage,
        plannedStartDate: m.plannedStartDate,
        plannedEndDate:   m.plannedEndDate,
        actualStartDate:  m.actualStartDate,
        actualEndDate:    m.actualEndDate,
        accountable: m.accountableUser ? m.accountableUser.name : '',
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="milestones-${Date.now()}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
};

/**
 * POST /api/pm/milestones/import/validate
 */
const validateMilestoneImport = async (req, res, next) => {
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
    const dataRowCount = ws.rowCount - 1;
    if (dataRowCount > 1000) {
      return sendError(res, 'File exceeds 1000 data rows. Please split into smaller files.', 400);
    }
    const rows = [], errors = [];
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      // Template columns (1-indexed, ExcelJS): A=projectName B=name C=status
      // D=clientOrg (skipped) E=completionPercentage F=plannedStart G=plannedEnd H=notes→description
      const [, projectName, milestoneName, status, , completion, startDate, endDate, description] = row.values;
      const rowErrors = [];
      if (!projectName)   rowErrors.push('Project Name is required');
      if (!milestoneName) rowErrors.push('Milestone Name is required');
      if (completion !== undefined && (Number(completion) < 0 || Number(completion) > 100))
        rowErrors.push('Completion % must be 0–100');
      const validStatuses = ['not_started', 'in_progress', 'completed', 'delayed', 'on_hold', 'cancelled'];
      if (status && !validStatuses.includes(status))
        rowErrors.push(`Invalid status "${status}". Valid: ${validStatuses.join(', ')}`);
      rows.push({
        rowNumber,
        projectName:          projectName  ? projectName.toString().trim()  : '',
        name:                 milestoneName ? milestoneName.toString().trim() : '',
        description:          description  ? description.toString().trim()  : '',
        plannedStartDate:     startDate || null,
        plannedEndDate:       endDate   || null,
        status:               status    || 'not_started',
        completionPercentage: Number(completion) || 0,
        errors: rowErrors,
        valid:  rowErrors.length === 0,
      });
      if (rowErrors.length) errors.push({ row: rowNumber, errors: rowErrors });
    });
    return sendSuccess(res, { rows, totalRows: rows.length, errorCount: errors.length, errors }, 'Validation complete');
  } catch (err) { next(err); }
};

/**
 * POST /api/pm/milestones/import/commit
 */
const commitMilestoneImport = async (req, res, next) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0)
      return sendError(res, 'No rows provided', 400);

    // Server-side re-validation — do not trust client's r.valid flag
    const validRows = [];
    const skipped = [];
    for (const row of rows) {
      if (!row.name || typeof row.name !== 'string' || !row.name.trim()) {
        skipped.push({ row, reason: 'Missing name' });
        continue;
      }
      if (!row.projectName) {
        skipped.push({ row, reason: 'Missing project name' });
        continue;
      }
      if (row.completionPercentage !== undefined && row.completionPercentage !== null) {
        const pct = Number(row.completionPercentage);
        if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
          skipped.push({ row, reason: 'Invalid completionPercentage' });
          continue;
        }
      }
      validRows.push(row);
    }

    const results = {
      inserted: 0,
      skipped:  skipped.length,
      errors:   skipped.map(s => ({ row: s.row.rowNumber, error: s.reason })),
    };

    // Wrap all inserts in one transaction so a mid-batch failure rolls back
    // already-inserted rows rather than leaving the DB in a partial state.
    const t = await sequelize.transaction();
    try {
      for (const row of validRows) {
        const project = await Project.findOne({ where: { name: row.projectName }, transaction: t });
        if (!project) {
          results.skipped++;
          results.errors.push({ row: row.rowNumber, error: `Project "${row.projectName}" not found` });
          continue; // skip this row but do NOT abort the transaction
        }
        await Milestone.create({
          id:                   randomUUID(),
          projectId:            project.id,
          name:                 row.name,
          description:          row.description          || null,
          plannedStartDate:     row.plannedStartDate      || null,
          plannedEndDate:       row.plannedEndDate        || null,
          status:               row.status               || 'not_started',
          completionPercentage: row.completionPercentage || 0,
        }, { transaction: t });
        results.inserted++;
      }
      await t.commit();
    } catch (e) {
      await t.rollback();
      return sendError(res, 'Import failed — all rows rolled back', 500, e.message);
    }
    return sendSuccess(res, results, `Import complete: ${results.inserted} inserted, ${results.skipped} skipped`);
  } catch (err) { next(err); }
};

/**
 * GET /api/pm/milestones/import/template
 */
const getMilestoneImportTemplate = async (req, res, next) => {
  try {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();

    // --- Main sheet ---
    // Column layout (must stay in sync with validateMilestoneImport destructuring):
    // A=projectName B=name C=status D=clientOrg E=completionPercentage
    // F=plannedStartDate G=plannedEndDate H=notes(→description in model)
    const ws = wb.addWorksheet('Milestones');
    ws.columns = [
      { header: 'Project Name *', key: 'projectName', width: 30 },
      { header: 'Milestone Name *', key: 'name', width: 35 },
      { header: 'Status', key: 'status', width: 20 },
      { header: 'Client Org', key: 'clientOrg', width: 25 },
      { header: 'Completion %', key: 'completionPercentage', width: 15 },
      { header: 'Planned Start (YYYY-MM-DD)', key: 'plannedStartDate', width: 25 },
      { header: 'Planned End (YYYY-MM-DD)', key: 'plannedEndDate', width: 25 },
      { header: 'Notes', key: 'notes', width: 40 },
    ];

    // Style header row
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
    headerRow.height = 22;
    headerRow.alignment = { vertical: 'middle' };

    // Sample row
    ws.addRow({
      projectName: 'Example Project',
      name: 'Design Phase',
      status: 'not_started',
      clientOrg: 'Client Name',
      completionPercentage: 0,
      plannedStartDate: '2026-01-01',
      plannedEndDate: '2026-03-31',
      notes: 'Optional notes',
    });

    // Freeze first row
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1, activeCell: 'A2' }];

    // --- Hidden dropdowns sheet ---
    const dropSheet = wb.addWorksheet('_lists');
    dropSheet.state = 'veryHidden';

    // Fetch real project names
    const Project = require('../../models/pm/Project');
    const { Op } = require('sequelize');
    const projects = await Project.findAll({
      attributes: ['name'],
      where: {
        status: { [Op.notIn]: ['completed', 'cancelled'] },
        // Operations (helpdesk-only) projects have no milestones to import into
        [Op.or]: [{ projectType: null }, { projectType: { [Op.ne]: 'Operations' } }],
      },
      order: [['name', 'ASC']],
      limit: 500,
    });
    const projectNames = projects.map(p => p.name);

    // Fetch statuses from DB or use defaults
    let statusValues = ['not_started', 'in_progress', 'completed', 'on_hold', 'cancelled', 'delayed'];
    try {
      const PmStatus = require('../../models/pm/PmStatus');
      const dbStatuses = await PmStatus.findAll({ where: { forMilestone: true }, attributes: ['value', 'name'] });
      if (dbStatuses.length) statusValues = dbStatuses.map(s => s.value || s.name);
    } catch (_) {}

    // Fetch client orgs
    let clientOrgs = [];
    try {
      const ClientOrg = require('../../models/csat/ClientOrganisation');
      const orgs = await ClientOrg.findAll({ attributes: ['name'], order: [['name', 'ASC']], limit: 200 });
      clientOrgs = orgs.map(o => o.name);
    } catch (_) {}

    // Populate hidden sheet columns
    dropSheet.getColumn(1).values = ['Projects', ...projectNames];
    dropSheet.getColumn(2).values = ['Statuses', ...statusValues];
    dropSheet.getColumn(3).values = ['ClientOrgs', ...clientOrgs];

    // Apply data validation to data rows 2–1001
    const lastProjectRow = projectNames.length + 1;
    const lastStatusRow = statusValues.length + 1;
    const lastClientRow = clientOrgs.length + 1;

    for (let i = 2; i <= 1001; i++) {
      // Project Name dropdown (col A)
      if (projectNames.length > 0) {
        ws.getCell(`A${i}`).dataValidation = {
          type: 'list', allowBlank: false,
          formulae: [`_lists!$A$2:$A$${lastProjectRow}`],
          showErrorMessage: true, errorStyle: 'stop',
          errorTitle: 'Invalid Project', error: 'Select a project from the dropdown',
        };
      }
      // Status dropdown (col C)
      ws.getCell(`C${i}`).dataValidation = {
        type: 'list', allowBlank: true,
        formulae: [`_lists!$B$2:$B$${lastStatusRow}`],
        showErrorMessage: true, errorStyle: 'warning',
        errorTitle: 'Invalid Status', error: 'Select a valid status',
      };
      // Client Org dropdown (col D)
      if (clientOrgs.length > 0) {
        ws.getCell(`D${i}`).dataValidation = {
          type: 'list', allowBlank: true,
          formulae: [`_lists!$C$2:$C$${lastClientRow}`],
        };
      }
      // Completion % validation (col E)
      ws.getCell(`E${i}`).dataValidation = {
        type: 'whole', allowBlank: true, operator: 'between',
        formulae: [0, 100],
        showErrorMessage: true, errorStyle: 'stop',
        errorTitle: 'Invalid %', error: 'Enter a whole number between 0 and 100',
      };
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="milestone-import-template.xlsx"');
    const buf = await wb.xlsx.writeBuffer();
    res.send(buf);
  } catch (err) {
    next(err);
  }
};

const updatePlannedDates = async (req, res, next) => {
  try {
    const { reason, plannedStartDate, plannedEndDate } = req.body;
    const result = await milestoneService.updateMilestonePlannedDates(
      req.params.id,
      req.params.milestoneId,
      { plannedStartDate, plannedEndDate, reason },
      req.user
    );
    const message = result.alert === 'deadline_near'
      ? 'Dates updated — deadline is approaching'
      : 'Planned dates updated';
    sendSuccess(res, result, message);
  } catch (e) { next(e); }
};

// Admin unlocks a milestone's planned dates so a manager can reset them once.
const unlockPlannedDates = async (req, res, next) => {
  try {
    const result = await milestoneService.unlockPlannedDates(
      req.params.id, req.params.milestoneId, req.body.reason, req.user
    );
    sendSuccess(res, result, 'Planned dates unlocked — the next change will re-lock them');
  } catch (e) { next(e); }
};

// Admin re-locks without a change (changed their mind).
const lockPlannedDates = async (req, res, next) => {
  try {
    const result = await milestoneService.lockPlannedDates(
      req.params.id, req.params.milestoneId, req.user
    );
    sendSuccess(res, result, 'Planned dates locked');
  } catch (e) { next(e); }
};

const updateActualDates = async (req, res, next) => {
  try {
    const { reason, actualStartDate, actualEndDate } = req.body;
    if (actualStartDate && isNaN(new Date(actualStartDate).getTime())) {
      return sendError(res, 'Invalid actualStartDate format', 400);
    }
    if (actualEndDate && isNaN(new Date(actualEndDate).getTime())) {
      return sendError(res, 'Invalid actualEndDate format', 400);
    }
    if (actualStartDate && actualEndDate && new Date(actualStartDate) > new Date(actualEndDate)) {
      return sendError(res, 'actualStartDate must be before or equal to actualEndDate', 400);
    }
    const result = await milestoneService.updateMilestoneActualDates(
      req.params.id,
      req.params.milestoneId,
      { actualStartDate, actualEndDate, reason },
      req.user
    );
    sendSuccess(res, result, 'Actual dates updated');
  } catch (e) { next(e); }
};

module.exports = {
  getMilestones, createMilestone, createSubMilestone,
  updateMilestone, deleteMilestone,
  updateStatus, updateProgress,
  updatePlannedDates, updateActualDates,
  unlockPlannedDates, lockPlannedDates,
  exportMilestones, validateMilestoneImport, commitMilestoneImport, getMilestoneImportTemplate,
};
