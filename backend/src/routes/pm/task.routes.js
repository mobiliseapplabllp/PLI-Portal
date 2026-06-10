const router = require('express').Router({ mergeParams: true });
const ctrl = require('../../controllers/pm/task.controller');
const { authorize } = require('../../middleware/rbac');

const ALL = ['admin', 'manager', 'senior_manager', 'employee', 'hr_admin', 'final_approver', 'md', 'director'];

router.get('/', authorize(...ALL), ctrl.getTasks);
router.post('/', authorize(...ALL), ctrl.createTask);
router.put('/:taskId', authorize(...ALL), ctrl.updateTask);
router.delete('/:taskId', authorize('admin', 'manager', 'senior_manager'), ctrl.deleteTask);
router.patch('/:taskId/status', authorize(...ALL), ctrl.updateTaskStatus);

module.exports = router;
