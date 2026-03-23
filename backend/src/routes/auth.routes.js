const router = require('express').Router();
const { login, logout, getMe, changePassword } = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { loginValidator, changePasswordValidator } = require('../validators/auth.validator');

router.post('/login', loginValidator, validate, login);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getMe);
router.post('/change-password', authenticate, changePasswordValidator, validate, changePassword);

module.exports = router;
