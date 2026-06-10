const DailyStatusLog = require('../../models/pm/DailyStatusLog');
const Project = require('../../models/pm/Project');
const ProjectMember = require('../../models/pm/ProjectMember');
const User = require('../../models/User');
const { NotFoundError, ForbiddenError } = require('../../utils/errors');

function canSubmitLog(project, user) {
  if (['admin', 'manager', 'senior_manager'].includes(user.role)) return true;
  if (String(project.managerId) === String(user._id)) return true;
  return false;
}

const getLogs = async (projectId, query = {}) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Number(query.limit) || 20);
  const offset = (page - 1) * limit;

  const { rows, count } = await DailyStatusLog.findAndCountAll({
    where: { projectId },
    include: [{ model: User, as: 'createdBy', attributes: ['id', 'name'] }],
    order: [['reportDate', 'DESC']],
    limit,
    offset,
  });

  return { logs: rows, pagination: { page, limit, total: count, pages: Math.ceil(count / limit) } };
};

const getLogById = async (projectId, logId) => {
  const log = await DailyStatusLog.findOne({
    where: { id: logId, projectId },
    include: [{ model: User, as: 'createdBy', attributes: ['id', 'name'] }],
  });
  if (!log) throw new NotFoundError('Daily Status Log');
  return log;
};

const upsertTodayLog = async (projectId, data, user) => {
  const project = await Project.findByPk(projectId);
  if (!project) throw new NotFoundError('Project');
  if (!canSubmitLog(project, user)) {
    // Also allow project members
    const isMember = await ProjectMember.findOne({ where: { projectId, userId: user._id } });
    if (!isMember) throw new ForbiddenError('Only project members can submit daily logs');
  }

  const today = new Date().toISOString().slice(0, 10);
  const [log, created] = await DailyStatusLog.findOrCreate({
    where: { projectId, reportDate: today },
    defaults: { ...data, generatedBy: 'manual', createdById: user._id },
  });

  if (!created) {
    Object.assign(log, { ...data, generatedBy: 'manual', createdById: user._id });
    await log.save();
  }

  return log;
};

module.exports = { getLogs, getLogById, upsertTodayLog };
