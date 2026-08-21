const { body } = require('express-validator');
const { ROSTER_STATUS } = require('../config/constants');

const createWeekValidator = [
  body('saturdayDate')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('saturdayDate must be a valid date (YYYY-MM-DD)')
    .custom((value) => {
      if (new Date(`${value}T00:00:00`).getDay() !== 6) {
        throw new Error('saturdayDate must fall on a Saturday');
      }
      return true;
    }),
];

const updateEntryValidator = [
  body('status')
    .notEmpty()
    .isIn(Object.values(ROSTER_STATUS))
    .withMessage('status must be working or off'),
  body('reason').optional({ checkFalsy: true }).trim().isLength({ max: 512 }),
];

const createSwapValidator = [
  body('targetEmployeeId').notEmpty().isUUID().withMessage('targetEmployeeId must be a valid user id'),
  body('reason').optional({ checkFalsy: true }).trim().isLength({ max: 512 }),
];

const decideSwapValidator = [
  body('action').notEmpty().isIn(['approve', 'reject']).withMessage('action must be approve or reject'),
  body('comment').optional({ checkFalsy: true }).trim().isLength({ max: 512 }),
];

const availCompOffValidator = [
  body('availedDate').optional({ checkFalsy: true }).isISO8601().withMessage('availedDate must be a valid date'),
];

module.exports = {
  createWeekValidator,
  updateEntryValidator,
  createSwapValidator,
  decideSwapValidator,
  availCompOffValidator,
};
