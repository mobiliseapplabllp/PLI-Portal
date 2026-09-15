const { Op }     = require('sequelize');
const sequelize  = require('../../config/database');
const { sendSuccess, sendError } = require('../../utils/response');
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
      include: [
        { model: User, as: 'createdBy',      attributes: ['id', 'name', 'email'] },
        { model: User, as: 'accountableUser', attributes: ['id', 'name', 'email'] },
      ],
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
    if (!title) return sendError(res, 'title is required', 400);
    const item = await PmRaidItem.create({
      projectId: req.params.id,
      type, title, description, impact, probability, status,
      owner, ownerId, raisedDate, targetDate, mitigationPlan,
      createdById: req.user._id ?? req.user.id,
    });

    // Email alert: notify on RAID item raised if enabled
    try {
      const PmSettings = require('../../models/pm/PmSettings');
      const settings = await PmSettings.findByPk(1);
      if (settings?.emailAlertOnRaidRaised) {
        const ccList = settings.reportCcEmails || [];
        if (ccList.length) {
          const { sendEmail } = require('../../utils/emailService');
          const subject = `[PM Alert] New RAID Item Raised — ${item.type}: ${item.title}`;
          const html = `
            <p>A new RAID item has been raised in project <strong>${project.name}</strong>.</p>
            <table cellpadding="6" style="border-collapse:collapse;font-size:14px">
              <tr><td><strong>Type</strong></td><td>${item.type}</td></tr>
              <tr><td><strong>Title</strong></td><td>${item.title}</td></tr>
              <tr><td><strong>Status</strong></td><td>${item.status || 'Open'}</td></tr>
              <tr><td><strong>Impact</strong></td><td>${item.impact || '—'}</td></tr>
              <tr><td><strong>Raised By</strong></td><td>${req.user.name || req.user.email}</td></tr>
              <tr><td><strong>Target Date</strong></td><td>${item.targetDate || '—'}</td></tr>
            </table>
            <p style="margin-top:12px">Log in to PLI Portal to review and action this item.</p>
          `;
          await sendEmail(ccList.join(','), subject, html);
        }
      }
    } catch (alertErr) {
      console.error('[PM Alert] RAID alert failed:', alertErr.message);
    }

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

const raidSummary = async (req, res, next) => {
  try {
    // Returns open RAID counts grouped by projectId
    // Optional: ?projectIds=id1,id2,id3 to filter specific projects
    const projectIds = req.query.projectIds
      ? req.query.projectIds.split(',').filter(Boolean)
      : null;

    const where = { status: { [Op.notIn]: ['closed', 'Closed', 'resolved', 'Resolved'] } };
    if (projectIds) where.projectId = { [Op.in]: projectIds };

    const items = await PmRaidItem.findAll({
      where,
      attributes: ['projectId', 'type', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
      group: ['projectId', 'type'],
      raw: true,
    });

    // Reshape into { [projectId]: { total, risk, action, issue, decision } }
    const summary = {};
    for (const row of items) {
      if (!summary[row.projectId]) {
        summary[row.projectId] = { total: 0, risk: 0, action: 0, issue: 0, decision: 0 };
      }
      const cnt = parseInt(row.count, 10);
      summary[row.projectId].total += cnt;
      const typeKey = (row.type || '').toLowerCase();
      if (summary[row.projectId][typeKey] !== undefined) {
        summary[row.projectId][typeKey] = cnt;
      }
    }

    sendSuccess(res, summary);
  } catch (e) { next(e); }
};

module.exports = { list, create, update, remove, raidSummary };
