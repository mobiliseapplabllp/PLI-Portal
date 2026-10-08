'use strict';
const router    = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const dashCtrl  = require('../../controllers/pm/pmDashboard.controller');

router.use(authenticate);
router.get('/stats', dashCtrl.getDashboardStats);
router.post('/export', dashCtrl.exportDashboard);

module.exports = router;
