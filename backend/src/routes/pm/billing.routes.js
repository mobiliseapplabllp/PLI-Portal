const router = require('express').Router();
const { body } = require('express-validator');
const { authorize } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validate');
const ctrl = require('../../controllers/pm/billing.controller');

// Who may READ the billing register: Finance, admin and leadership.
const VIEWERS = ['finance', 'admin', 'md', 'director', 'senior_manager'];
// Who may WRITE billing outcomes — re-asserted in the service too.
const BILLERS = ['finance', 'admin'];

const markBilledValidator = [
  body('invoiceNumber')
    .notEmpty().withMessage('Invoice number is required')
    .isLength({ max: 64 }).withMessage('Invoice number is too long')
    .trim(),
  body('billedDate').optional({ checkFalsy: true }).isISO8601().withMessage('Invalid billed date'),
];

router.get('/', authorize(...VIEWERS), ctrl.getRegister);
router.get('/export', authorize(...VIEWERS), ctrl.exportRegister);
router.patch('/:id/bill', authorize(...BILLERS), markBilledValidator, validate, ctrl.markBilled);
router.patch('/:id/unbill', authorize(...BILLERS), ctrl.unmarkBilled);

module.exports = router;
