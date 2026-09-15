const router = require('express').Router({ mergeParams: true });
const ctrl = require('../../controllers/pm/task.controller');
const { requirePermission } = require('../../core/rbac');


router.get('/', requirePermission('pm.task.view'), ctrl.getTasks);
router.post('/', requirePermission('pm.task.create'), ctrl.createTask);
router.put('/:taskId', requirePermission('pm.task.update'), ctrl.updateTask);
router.delete('/:taskId', requirePermission('pm.task.delete'), ctrl.deleteTask);
router.patch('/:taskId/status', requirePermission('pm.task.update'), ctrl.updateTaskStatus);

module.exports = router;
