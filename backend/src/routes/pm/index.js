const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');

const projectRoutes = require('./project.routes');
const milestoneRoutes = require('./milestone.routes');
const taskRoutes = require('./task.routes');
const dailyLogRoutes = require('./dailyLog.routes');
const pmSettingsRoutes = require('./pmSettings.routes');

router.use(authenticate);

router.use('/projects', projectRoutes);
router.use('/projects/:id/milestones', milestoneRoutes);
router.use('/projects/:id/milestones/:milestoneId/tasks', taskRoutes);
router.use('/projects/:id/daily-logs', dailyLogRoutes);
router.use('/settings', pmSettingsRoutes);

module.exports = router;
