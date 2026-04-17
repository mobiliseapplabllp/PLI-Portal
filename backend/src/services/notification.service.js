const { Op } = require('sequelize');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { getMonthName } = require('../utils/quarterHelper');
const {
  sendKpiAssignedEmail,
  sendEmployeeSubmittedEmail,
  sendManagerReviewedEmail,
  sendReviewCompleteEmail,
} = require('../utils/emailService');

const create = async (data) => {
  try {
    const notification = await Notification.create({
      recipientId: data.recipient,
      type: data.type,
      title: data.title,
      message: data.message || null,
      referenceType: data.referenceType || null,
      referenceId: data.referenceId || null,
    });

    triggerEmail(data).catch(() => {});

    return notification;
  } catch (err) {
    console.error('Notification creation error:', err.message);
    return null;
  }
};

async function triggerEmail(data) {
  try {
    const { type, recipient, referenceId } = data;

    let month = '';
    let year = '';
    if (referenceId && data.referenceType === 'kpi_assignment') {
      const KpiAssignment = require('../models/KpiAssignment');
      const assignment = await KpiAssignment.findByPk(referenceId);
      if (assignment) {
        month = getMonthName(assignment.month);
        year = assignment.financialYear;
      }
    }

    if (type === 'kpi_assigned') {
      const recipientUser = await User.findByPk(recipient, { attributes: ['email', 'name'] });
      if (recipientUser) {
        await sendKpiAssignedEmail(recipientUser.email, recipientUser.name, month, year);
      }
    } else if (type === 'employee_submitted') {
      const recipientUser = await User.findByPk(recipient, { attributes: ['email', 'name'] });
      let employeeName = 'An employee';
      if (referenceId && data.referenceType === 'kpi_assignment') {
        const KpiAssignment = require('../models/KpiAssignment');
        const assignment = await KpiAssignment.findByPk(referenceId, {
          include: [{ model: User, as: 'employee', attributes: ['name'] }],
        });
        if (assignment?.employee?.name) {
          employeeName = assignment.employee.name;
        }
      }
      if (recipientUser) {
        await sendEmployeeSubmittedEmail(recipientUser.email, recipientUser.name, employeeName, month, year);
      }
    } else if (type === 'manager_reviewed') {
      const recipientUser = await User.findByPk(recipient, { attributes: ['email', 'name'] });
      if (recipientUser) {
        await sendManagerReviewedEmail(recipientUser.email, recipientUser.name, month, year);
      }
    } else if (type === 'record_locked') {
      const recipientUser = await User.findByPk(recipient, { attributes: ['email', 'name'] });
      if (recipientUser) {
        await sendReviewCompleteEmail(recipientUser.email, recipientUser.name, month, year, 'locked');
      }
    }
  } catch (err) {
    console.error('[Email trigger] Error:', err.message);
  }
}

const getByUser = async (userId, query = {}) => {
  const where = { recipientId: userId };
  if (query.unreadOnly === 'true') where.isRead = false;

  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.findAll({
      where,
      order: [['createdAt', 'DESC']],
      offset: (page - 1) * limit,
      limit,
    }),
    Notification.count({ where }),
    Notification.count({ where: { recipientId: userId, isRead: false } }),
  ]);

  return { notifications, unreadCount, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
};

const markAsRead = async (id, userId) => {
  const n = await Notification.findOne({ where: { id, recipientId: userId } });
  if (!n) return null;
  n.isRead = true;
  await n.save();
  return n;
};

const markAllAsRead = async (userId) => {
  return Notification.update({ isRead: true }, { where: { recipientId: userId, isRead: false } });
};

module.exports = { create, getByUser, markAsRead, markAllAsRead };
