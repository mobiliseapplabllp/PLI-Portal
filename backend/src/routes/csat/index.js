const router = require('express').Router();

router.use('/client-organisations', require('./clientOrg.routes'));
router.use('/surveys', require('./survey.routes'));
router.use('/dispatches', require('./surveyDispatch.routes'));
router.use('/approvals', require('./surveyApproval.routes'));

module.exports = router;
