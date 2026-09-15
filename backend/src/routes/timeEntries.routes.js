/**
 * /time-entries — actual hours on tickets, milestones and projects.
 * Any authenticated user; ownership rules live in the controller.
 */
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/timeEntry.controller');

router.use(authenticate);

router.get('/summary', ctrl.summary);   // before '/:id'-style routes (none yet, but keep it first)
router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
