'use strict';

/**
 * Solutions (Knowledge Base) router.
 * /public is unauthenticated; all other routes require helpdeskAuth.
 */

const router       = require('express').Router();
const { authenticate }  = require('../../middleware/auth');
const { helpdeskAuth }  = require('../../middleware/helpdeskAuth');
const solutionCtrl = require('../../controllers/helpdesk/solution.controller');

// ── PUBLIC ─────────────────────────────────────────────────────────────────
router.get('/public', solutionCtrl.listPublic);

// ── Authenticated ──────────────────────────────────────────────────────────
router.use(authenticate, helpdeskAuth);

router.get('/',       solutionCtrl.listSolutions);
router.post('/',      solutionCtrl.createSolution);
router.get('/:id',    solutionCtrl.getSolution);
router.put('/:id',    solutionCtrl.updateSolution);
router.delete('/:id', solutionCtrl.deleteSolution);

module.exports = router;
