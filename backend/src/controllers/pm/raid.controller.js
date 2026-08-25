const { sendSuccess } = require('../../utils/response');
const PmRaidItem = require('../../models/pm/PmRaidItem');
const Project    = require('../../models/pm/Project');
const User       = require('../../models/User');
const { NotFoundError, ForbiddenError } = require('../../utils/errors');

const MANAGERS = ['admin', 'manager', 'senior_manager'];

const list = async (req, res, next) => {
  try {
    const where = { projectId: req.params.id };
    if (req.query.type)   where.type   = req.query.type;
    if (req.query.status) where.status = req.query.status;
    const items = await PmRaidItem.findAll({
      where,
      include: [{ model: User, as: 'createdBy', attributes: ['id', 'name', 'email'] }],
      order: [['createdAt', 'DESC']],
    });
    sendSuccess(res, items);
  } catch (e) { next(e); }
};

const create = async (req, res, next) => {
  try {
    const project = await Project.findByPk(req.params.id);
    if (!project) throw new NotFoundError('Project');
    if (!MANAGERS.includes(req.user.role) && String(project.managerId) !== String(req.user._id ?? req.user.id)) {
      throw new ForbiddenError('Only project manager or admin can add RAID items');
    }
    const { type, title, description, impact, probability, status, owner, ownerId, raisedDate, targetDate, mitigationPlan } = req.body;
    if (!title) return res.status(400).json({ message: 'title is required' });
    const item = await PmRaidItem.create({
      projectId: req.params.id,
      type, title, description, impact, probability, status,
      owner, ownerId, raisedDate, targetDate, mitigationPlan,
      createdById: req.user._id ?? req.user.id,
    });
    sendSuccess(res, item, 'RAID item created', 201);
  } catch (e) { next(e); }
};

const update = async (req, res, next) => {
  try {
    const item = await PmRaidItem.findOne({ where: { id: req.params.itemId, projectId: req.params.id } });
    if (!item) throw new NotFoundError('RAID item');
    const ALLOWED = ['type','title','description','impact','probability','status','owner','ownerId','raisedDate','targetDate','closedDate','mitigationPlan'];
    ALLOWED.forEach(k => { if (k in req.body) item[k] = req.body[k]; });
    await item.save();
    sendSuccess(res, item, 'RAID item updated');
  } catch (e) { next(e); }
};

const remove = async (req, res, next) => {
  try {
    const item = await PmRaidItem.findOne({ where: { id: req.params.itemId, projectId: req.params.id } });
    if (!item) throw new NotFoundError('RAID item');
    await item.destroy();
    sendSuccess(res, null, 'RAID item deleted');
  } catch (e) { next(e); }
};

module.exports = { list, create, update, remove };
