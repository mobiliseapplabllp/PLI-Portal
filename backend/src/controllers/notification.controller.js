const notificationService = require('../services/notification.service');
const { sendSuccess } = require('../utils/response');

const getNotifications = async (req, res, next) => {
  try {
    const result = await notificationService.getByUser(req.user._id, req.query);
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
};

const markAsRead = async (req, res, next) => {
  try {
    const notification = await notificationService.markAsRead(req.params.id, req.user._id);
    sendSuccess(res, notification, 'Marked as read');
  } catch (error) {
    next(error);
  }
};

const markAllAsRead = async (req, res, next) => {
  try {
    await notificationService.markAllAsRead(req.user._id);
    sendSuccess(res, null, 'All notifications marked as read');
  } catch (error) {
    next(error);
  }
};

module.exports = { getNotifications, markAsRead, markAllAsRead };
