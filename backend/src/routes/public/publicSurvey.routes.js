const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const ctrl = require('../../controllers/publicSurvey.controller');

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many requests. Please try again later.' } },
});

router.use(publicLimiter);
router.get('/:token',  ctrl.getSurvey);
router.post('/:token', ctrl.submitSurvey);

module.exports = router;
