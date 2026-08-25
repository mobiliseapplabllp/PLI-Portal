const { sendSuccess } = require('../../utils/response');
const PmClosure  = require('../../models/pm/PmClosure');
const Project    = require('../../models/pm/Project');
const User       = require('../../models/User');
const { randomUUID } = require('crypto');
const { NotFoundError, ForbiddenError } = require('../../utils/errors');

const MANAGERS = ['admin', 'manager', 'senior_manager'];

const get = async (req, res, next) => {
  try {
    let closure = await PmClosure.findOne({
      where: { projectId: req.params.id },
      include: [{ model: User, as: 'signedOffBy', attributes: ['id', 'name', 'email'] }],
    });
    if (!closure) {
      // Return default structure without saving
      closure = { projectId: req.params.id, checklist: PmClosure.DEFAULT_CHECKLIST };
    }
    sendSuccess(res, closure);
  } catch (e) { next(e); }
};

const upsert = async (req, res, next) => {
  try {
    const project = await Project.findByPk(req.params.id);
    if (!project) throw new NotFoundError('Project');
    if (!MANAGERS.includes(req.user.role) && String(project.managerId) !== String(req.user._id ?? req.user.id)) {
      throw new ForbiddenError('Only project manager or admin can update project closure');
    }
    const [closure] = await PmClosure.findOrCreate({
      where: { projectId: req.params.id },
      defaults: {
        id: randomUUID(),
        projectId: req.params.id,
        checklist: PmClosure.DEFAULT_CHECKLIST,
        createdById: req.user._id ?? req.user.id,
      },
    });
    const { closureDate, closureNotes, signedOffById, checklist } = req.body;
    if (closureDate   !== undefined) closure.closureDate   = closureDate;
    if (closureNotes  !== undefined) closure.closureNotes  = closureNotes;
    if (signedOffById !== undefined) {
      closure.signedOffById = signedOffById;
      closure.signedOffAt   = signedOffById ? new Date() : null;
    }
    if (checklist !== undefined) closure.checklist = checklist;
    await closure.save();
    sendSuccess(res, closure, 'Project closure updated');
  } catch (e) { next(e); }
};

// Mark project as officially closed
const markClosed = async (req, res, next) => {
  try {
    const project = await Project.findByPk(req.params.id);
    if (!project) throw new NotFoundError('Project');
    if (!MANAGERS.includes(req.user.role) && String(project.managerId) !== String(req.user._id ?? req.user.id)) {
      throw new ForbiddenError('Only project manager or admin can close a project');
    }
    // Update project status
    project.status = 'Completed';
    await project.save();
    // Stamp closure record
    const [closure] = await PmClosure.findOrCreate({
      where: { projectId: req.params.id },
      defaults: { id: randomUUID(), projectId: req.params.id, checklist: PmClosure.DEFAULT_CHECKLIST },
    });
    closure.closedAt = new Date();
    if (!closure.closureDate) closure.closureDate = new Date().toISOString().slice(0, 10);
    await closure.save();
    sendSuccess(res, { project, closure }, 'Project marked as closed');
  } catch (e) { next(e); }
};

module.exports = { get, upsert, markClosed };
