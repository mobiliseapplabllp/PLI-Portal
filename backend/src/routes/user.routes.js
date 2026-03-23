const router = require('express').Router();
const { getUsers, getUserById, createUser, updateUser, getTeam } = require('../controllers/user.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { validate } = require('../middleware/validate');
const { createUserValidator, updateUserValidator } = require('../validators/user.validator');

router.use(authenticate);

router.get('/', authorize('admin'), getUsers);
router.post('/', authorize('admin'), createUserValidator, validate, createUser);
router.get('/team/:managerId', authorize('admin', 'manager'), getTeam);
router.get('/:id', authorize('admin', 'manager', 'employee'), getUserById);
router.put('/:id', authorize('admin'), updateUserValidator, validate, updateUser);

module.exports = router;
