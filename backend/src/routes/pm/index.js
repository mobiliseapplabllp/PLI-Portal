const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const { authorize } = require('../../middleware/rbac');

const projectRoutes = require('./project.routes');
const milestoneRoutes = require('./milestone.routes');
const taskRoutes = require('./task.routes');
const dailyLogRoutes = require('./dailyLog.routes');
const pmSettingsRoutes = require('./pmSettings.routes');
const taskCtrl = require('../../controllers/pm/task.controller');

router.use(authenticate);

const ALL = ['admin', 'manager', 'senior_manager', 'employee', 'hr_admin', 'final_approver', 'md', 'director'];
router.get('/my-tasks', authorize(...ALL), taskCtrl.getMyTasks);

router.use('/projects', projectRoutes);
router.use('/projects/:id/milestones', milestoneRoutes);
router.use('/projects/:id/milestones/:milestoneId/tasks', taskRoutes);
router.use('/projects/:id/daily-logs', dailyLogRoutes);
router.use('/settings', pmSettingsRoutes);

module.exports = router;
