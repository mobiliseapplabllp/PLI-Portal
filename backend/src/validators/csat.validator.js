const { body } = require('express-validator');

// ── Client Organisation ───────────────────────────────────────────────────────
const createClientOrgValidator = [
  body('name').notEmpty().withMessage('Organisation name is required').trim(),
  body('description').optional().trim(),
  body('industry').optional().trim(),
  body('managedById').optional({ checkFalsy: true }).isUUID().withMessage('managedById must be a valid UUID'),
];

const updateClientOrgValidator = [
  body('name').optional().notEmpty().withMessage('Name cannot be empty').trim(),
  body('description').optional().trim(),
  body('industry').optional().trim(),
  body('managedById').optional({ checkFalsy: true }).isUUID().withMessage('managedById must be a valid UUID'),
  body('isActive').optional().isBoolean().withMessage('isActive must be boolean'),
];

// ── Client Employee ───────────────────────────────────────────────────────────
const createClientEmployeeValidator = [
  body('name').notEmpty().withMessage('Employee name is required').trim(),
  body('email').notEmpty().withMessage('Email is required').isEmail().withMessage('Invalid email').normalizeEmail(),
  body('mobileNo').optional({ checkFalsy: true }).trim(),
  body('designation').optional({ checkFalsy: true }).trim(),
  body('department').optional({ checkFalsy: true }).trim(),
];

const updateClientEmployeeValidator = [
  body('name').optional().notEmpty().withMessage('Name cannot be empty').trim(),
  body('email').optional().isEmail().withMessage('Invalid email').normalizeEmail(),
  body('mobileNo').optional({ checkFalsy: true }).trim(),
  body('designation').optional({ checkFalsy: true }).trim(),
  body('department').optional({ checkFalsy: true }).trim(),
  body('isActive').optional().isBoolean().withMessage('isActive must be boolean'),
];

// ── Survey ────────────────────────────────────────────────────────────────────
const VALID_QUESTION_TYPES = ['text', 'radio', 'select', 'checkbox', 'rating', 'paragraph'];

const createSurveyValidator = [
  body('name').notEmpty().withMessage('Survey name is required').trim(),
  body('description').optional().trim(),
  body('thankYouMessage').optional().trim(),
  body('questions').optional().isArray().withMessage('questions must be an array'),
  body('questions.*.questionText').if(body('questions').exists()).notEmpty().withMessage('questionText is required'),
  body('questions.*.questionType').if(body('questions').exists())
    .isIn(VALID_QUESTION_TYPES).withMessage(`questionType must be one of: ${VALID_QUESTION_TYPES.join(', ')}`),
  body('questions.*.minValue').optional().isInt().withMessage('minValue must be an integer'),
  body('questions.*.maxValue').optional().isInt().withMessage('maxValue must be an integer'),
  body('questions.*.isRequired').optional().isBoolean().withMessage('isRequired must be boolean'),
  body('questions.*.orderIndex').optional().isInt({ min: 0 }).withMessage('orderIndex must be non-negative integer'),
];

const updateSurveyValidator = [
  body('name').optional().notEmpty().withMessage('Name cannot be empty').trim(),
  body('description').optional().trim(),
  body('thankYouMessage').optional().trim(),
  body('questions').optional().isArray().withMessage('questions must be an array'),
  body('questions.*.questionText').if(body('questions').exists()).notEmpty().withMessage('questionText is required'),
  body('questions.*.questionType').if(body('questions').exists())
    .isIn(VALID_QUESTION_TYPES).withMessage(`questionType must be one of: ${VALID_QUESTION_TYPES.join(', ')}`),
];

// ── Survey Approval ───────────────────────────────────────────────────────────
const approveValidator = [
  body('overallFeedback').optional({ checkFalsy: true }).isString().trim()
    .isLength({ max: 500 }).withMessage('Feedback must be under 500 characters'),
];

const requestChangesValidator = [
  body('overallFeedback').optional({ checkFalsy: true }).isString().trim()
    .isLength({ max: 500 }),
  body('questionFeedbacks').optional().isArray(),
  body('questionFeedbacks.*.surveyQuestionId')
    .if(body('questionFeedbacks').exists())
    .notEmpty().isUUID().withMessage('surveyQuestionId must be a valid UUID'),
  body('questionFeedbacks.*.feedback')
    .if(body('questionFeedbacks').exists())
    .notEmpty().isString().trim()
    .isLength({ max: 500 }).withMessage('Question feedback must be under 500 characters'),
];

const rejectValidator = [
  body('overallFeedback')
    .notEmpty().withMessage('A reason is required when rejecting')
    .isString().trim()
    .isLength({ max: 500 }),
  body('questionFeedbacks').optional().isArray(),
  body('questionFeedbacks.*.surveyQuestionId')
    .if(body('questionFeedbacks').exists())
    .notEmpty().isUUID(),
  body('questionFeedbacks.*.feedback')
    .if(body('questionFeedbacks').exists())
    .notEmpty().isString().trim().isLength({ max: 500 }),
];

module.exports = {
  createClientOrgValidator,
  updateClientOrgValidator,
  createClientEmployeeValidator,
  updateClientEmployeeValidator,
  createSurveyValidator,
  updateSurveyValidator,
  approveValidator,
  requestChangesValidator,
  rejectValidator,
};
