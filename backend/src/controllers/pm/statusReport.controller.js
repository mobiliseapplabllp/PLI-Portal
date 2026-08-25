const { sendSuccess } = require('../../utils/response');
const PmStatusReport = require('../../models/pm/PmStatusReport');
const User = require('../../models/User');
const Project = require('../../models/pm/Project');
const { NotFoundError, ForbiddenError } = require('../../utils/errors');

const MANAGERS = ['admin', 'manager', 'senior_manager'];

const list = async (req, res, next) => {
  try {
    const reports = await PmStatusReport.findAll({
      where: { projectId: req.params.id },
      include: [{ model: User, as: 'createdBy', attributes: ['id', 'name', 'email'] }],
      order: [['reportDate', 'DESC']],
    });
    sendSuccess(res, reports);
  } catch (e) { next(e); }
};

const create = async (req, res, next) => {
  try {
    const project = await Project.findByPk(req.params.id);
    if (!project) throw new NotFoundError('Project');
    if (!MANAGERS.includes(req.user.role) && String(project.managerId) !== String(req.user._id ?? req.user.id)) {
      throw new ForbiddenError('Only project manager or admin can add status reports');
    }
    const { reportDate, period, ragStatus, summary, risks, nextSteps } = req.body;
    const report = await PmStatusReport.create({
      projectId: req.params.id,
      reportDate, period, ragStatus, summary, risks, nextSteps,
      createdById: req.user._id ?? req.user.id,
    });
    sendSuccess(res, report, 'Status report created', 201);
  } catch (e) { next(e); }
};

const update = async (req, res, next) => {
  try {
    const report = await PmStatusReport.findOne({ where: { id: req.params.reportId, projectId: req.params.id } });
    if (!report) throw new NotFoundError('Status report');
    const { reportDate, period, ragStatus, summary, risks, nextSteps } = req.body;
    if (reportDate  !== undefined) report.reportDate  = reportDate;
    if (period      !== undefined) report.period      = period;
    if (ragStatus   !== undefined) report.ragStatus   = ragStatus;
    if (summary     !== undefined) report.summary     = summary;
    if (risks       !== undefined) report.risks       = risks;
    if (nextSteps   !== undefined) report.nextSteps   = nextSteps;
    await report.save();
    sendSuccess(res, report, 'Status report updated');
  } catch (e) { next(e); }
};

const remove = async (req, res, next) => {
  try {
    const report = await PmStatusReport.findOne({ where: { id: req.params.reportId, projectId: req.params.id } });
    if (!report) throw new NotFoundError('Status report');
    await report.destroy();
    sendSuccess(res, null, 'Status report deleted');
  } catch (e) { next(e); }
};

module.exports = { list, create, update, remove };
