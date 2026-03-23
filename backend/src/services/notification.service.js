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
    const notification = await Notification.create(data);

    // Trigger email in the background (non-blocking, never throws)
    triggerEmail(data).catch(() => {});

    return notification;
  } catch (err) {
    console.error('Notification creation error:', err.message);
    return null;
  }
};

/**
 * Send email based on notification type.
 * Fetches recipient info from User model, then dispatches the appropriate email.
 */
async function triggerEmail(data) {
  try {
    const { type, recipient, referenceId } = data;

    // We need the assignment context for month/year info
    // Load the referenced assignment if available
    let month = '';
    let year = '';
    if (referenceId && data.referenceType === 'kpi_assignment') {
      const KpiAssignment = require('../models/KpiAssignment');
      const assignment = await KpiAssignment.findById(referenceId);
      if (assignment) {
        month = getMonthName(assignment.month);
        year = assignment.financialYear;
      }
    }

    if (type === 'kpi_assigned') {
      // Send email to the employee
      const recipientUser = await User.findById(recipient).select('email name');
      if (recipientUser) {
        await sendKpiAssignedEmail(recipientUser.email, recipientUser.name, month, year);
      }
    } else if (type === 'employee_submitted') {
      // Send email to manager
      const recipientUser = await User.findById(recipient).select('email name');
      // Also find the employee name from the assignment
      let employeeName = 'An employee';
      if (referenceId && data.referenceType === 'kpi_assignment') {
        const KpiAssignment = require('../models/KpiAssignment');
        const assignment = await KpiAssignment.findById(referenceId).populate('employee', 'name');
        if (assignment?.employee?.name) {
          employeeName = assignment.employee.name;
        }
      }
      if (recipientUser) {
        await sendEmployeeSubmittedEmail(recipientUser.email, recipientUser.name, employeeName, month, year);
      }
    } else if (type === 'manager_reviewed') {
      // Send email to admin
      const recipientUser = await User.findById(recipient).select('email name');
      if (recipientUser) {
        await sendManagerReviewedEmail(recipientUser.email, recipientUser.name, month, year);
      }
    } else if (type === 'record_locked') {
      // Send email to employee
      const recipientUser = await User.findById(recipient).select('email name');
      if (recipientUser) {
        await sendReviewCompleteEmail(recipientUser.email, recipientUser.name, month, year, 'locked');
      }
    }
  } catch (err) {
    console.error('[Email trigger] Error:', err.message);
  }
}

const getByUser = async (userId, query = {}) => {
  const filter = { recipient: userId };
  if (query.unreadOnly === 'true') filter.isRead = false;

  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Notification.countDocuments(filter),
    Notification.countDocuments({ recipient: userId, isRead: false }),
  ]);

  return { notifications, unreadCount, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
};

const markAsRead = async (id, userId) => {
  return Notification.findOneAndUpdate(
    { _id: id, recipient: userId },
    { isRead: true },
    { new: true }
  );
};

const markAllAsRead = async (userId) => {
  return Notification.updateMany(
    { recipient: userId, isRead: false },
    { isRead: true }
  );
};

module.exports = { create, getByUser, markAsRead, markAllAsRead };
