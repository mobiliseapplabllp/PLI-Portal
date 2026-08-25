const milestoneService = require('../../services/pm/milestone.service');
const { sendSuccess } = require('../../utils/response');
const Project   = require('../../models/pm/Project');
const Milestone = require('../../models/pm/Milestone');
const User      = require('../../models/User');

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
    sendSuccess(res, await milestoneService.updateMilestone(req.params.id, req.params.milestoneId, req.body, req.user), 'Milestone updated');
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
    sendSuccess(res, await milestoneService.updateMilestoneStatus(req.params.id, req.params.milestoneId, req.body.status, req.user), 'Status updated');
  } catch (e) { next(e); }
};

const updateProgress = async (req, res, next) => {
  try {
    sendSuccess(res, await milestoneService.updateMilestoneProgress(req.params.id, req.params.milestoneId, req.body.completionPercentage, req.user), 'Progress updated');
  } catch (e) { next(e); }
};

/**
 * GET /api/pm/milestones/export
 */
const exportMilestones = async (req, res, next) => {
  try {
    const ExcelJS = require('exceljs');
    const { projectType, status, projectId } = req.query;

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
      { header: 'Start Date',       key: 'startDate',    width: 14 },
      { header: 'End Date',         key: 'endDate',      width: 14 },
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
        startDate:   m.startDate,
        endDate:     m.endDate,
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
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(req.file.buffer);
    const ws = wb.worksheets[0];
    if (!ws) return res.status(400).json({ error: 'No worksheet found in file' });
    const rows = [], errors = [];
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const [, projectName, milestoneName, description, startDate, endDate, status, completion] = row.values;
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
        startDate:            startDate || null,
        endDate:              endDate   || null,
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
      return res.status(400).json({ error: 'No rows provided' });
    const validRows = rows.filter(r => r.valid);
    const results   = { inserted: 0, skipped: 0, errors: [] };
    for (const row of validRows) {
      try {
        const project = await Project.findOne({ where: { name: row.projectName } });
        if (!project) { results.skipped++; results.errors.push({ row: row.rowNumber, error: `Project "${row.projectName}" not found` }); continue; }
        await Milestone.create({ projectId: project.id, name: row.name, description: row.description || null, startDate: row.startDate || null, endDate: row.endDate || null, status: row.status || 'not_started', completionPercentage: row.completionPercentage || 0 });
        results.inserted++;
      } catch (e) { results.skipped++; results.errors.push({ row: row.rowNumber, error: e.message }); }
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
    const ws = wb.addWorksheet('Milestones');
    ws.columns = [
      { header: 'Project Name *',         key: 'projectName', width: 30 },
      { header: 'Milestone Name *',        key: 'name',        width: 35 },
      { header: 'Description',             key: 'description', width: 40 },
      { header: 'Start Date (YYYY-MM-DD)', key: 'startDate',   width: 22 },
      { header: 'End Date (YYYY-MM-DD)',   key: 'endDate',     width: 22 },
      { header: 'Status',                  key: 'status',      width: 15 },
      { header: 'Completion %',            key: 'completion',  width: 14 },
    ];
    ws.getRow(1).font   = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    ws.getRow(1).height = 20;
    ws.addRow({ projectName: 'Example Project', name: 'Phase 1 Delivery', description: 'Deliver phase 1', startDate: '2024-07-01', endDate: '2024-07-31', status: 'not_started', completion: 0 });
    ws.getRow(2).font = { italic: true, color: { argb: 'FF6B7280' } };
    const notes = wb.addWorksheet('Notes');
    notes.addRow(['Field', 'Notes']);
    notes.addRow(['Project Name *', 'Must match an existing project name exactly']);
    notes.addRow(['Status', 'One of: not_started, in_progress, completed, delayed, on_hold, cancelled']);
    notes.getRow(1).font = { bold: true };
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="milestone-import-template.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
};

module.exports = {
  getMilestones, createMilestone, createSubMilestone,
  updateMilestone, deleteMilestone,
  updateStatus, updateProgress,
  exportMilestones, validateMilestoneImport, commitMilestoneImport, getMilestoneImportTemplate,
};
