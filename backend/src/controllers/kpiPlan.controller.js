const kpiPlanService = require('../services/kpiPlan.service');
const kpiDefinitionApproval = require('../services/kpiDefinitionApproval.service');

const getPlans = async (req, res, next) => {
  try {
    const plans = await kpiPlanService.getPlans(req.query, req.user);
    res.json({ success: true, data: plans });
  } catch (err) { next(err); }
};

const getPlanById = async (req, res, next) => {
  try {
    const plan = await kpiPlanService.getPlanById(req.params.id, req.user);
    res.json({ success: true, data: plan });
  } catch (err) { next(err); }
};

// Every write below goes through kpiDefinitionApproval.service. Define/edit
// actions (create/update/status/items) always apply instantly for anyone
// eligible — admin, the department's Approver, or a granted Definer. Only
// publishPlan can come back pending (202, status 'pending') — that happens
// when a plain Definer (not also the Approver) submits it; nothing in
// kpi_plans/kpi_plan_items changes until the department's Approver (or
// admin, as fallback) approves it.

const createPlan = async (req, res, next) => {
  try {
    const { status, result } = await kpiDefinitionApproval.createPlan(req.body, req.user);
    if (status === 'pending') {
      return res.status(202).json({ success: true, status, data: result, message: 'Submitted for approval.' });
    }
    res.status(201).json({ success: true, status, data: result });
  } catch (err) { next(err); }
};

const updatePlan = async (req, res, next) => {
  try {
    const { status, result } = await kpiDefinitionApproval.updatePlan(req.params.id, req.body, req.user);
    if (status === 'pending') {
      return res.status(202).json({ success: true, status, data: result, message: 'Submitted for approval.' });
    }
    res.json({ success: true, status, data: result });
  } catch (err) { next(err); }
};

const updatePlanStatus = async (req, res, next) => {
  try {
    const { status, result } = await kpiDefinitionApproval.updatePlanStatus(req.params.id, req.body.status, req.user);
    if (status === 'pending') {
      return res.status(202).json({ success: true, status, data: result, message: 'Submitted for approval.' });
    }
    res.json({ success: true, status, data: result });
  } catch (err) { next(err); }
};

const publishPlan = async (req, res, next) => {
  try {
    const { status, result } = await kpiDefinitionApproval.publishPlan(req.params.id, req.user);
    if (status === 'pending') {
      return res.status(202).json({ success: true, status, data: result, message: 'Submitted for approval.' });
    }
    const { plan, assignmentsCreated, assignmentsSynced, monthsConverted } = result;
    const parts = [];
    if (assignmentsCreated > 0) parts.push(`${assignmentsCreated} new assignment${assignmentsCreated !== 1 ? 's' : ''} created`);
    if (assignmentsSynced > 0) parts.push(`${assignmentsSynced} existing assignment${assignmentsSynced !== 1 ? 's' : ''} updated`);
    if (monthsConverted > 0) parts.push(`${monthsConverted} month${monthsConverted !== 1 ? 's' : ''} moved from a previous department now that this plan is live`);
    const detail = parts.length ? ` (${parts.join(', ')})` : '';
    res.json({
      success: true,
      status,
      data: plan,
      message: `Plan published${detail}.`,
    });
  } catch (err) { next(err); }
};

const unpublishPlan = async (req, res, next) => {
  try {
    const { result } = await kpiDefinitionApproval.unpublishPlan(req.params.id, req.user);
    res.json({ success: true, data: result, message: 'Plan unpublished.' });
  } catch (err) { next(err); }
};

const addPlanItem = async (req, res, next) => {
  try {
    const { status, result } = await kpiDefinitionApproval.addPlanItem(req.params.id, req.body, req.user);
    if (status === 'pending') {
      return res.status(202).json({ success: true, status, data: result, message: 'Submitted for approval.' });
    }
    res.status(201).json({ success: true, status, data: result });
  } catch (err) { next(err); }
};

const updatePlanItem = async (req, res, next) => {
  try {
    const { status, result } = await kpiDefinitionApproval.updatePlanItem(req.params.id, req.params.itemId, req.body, req.user);
    if (status === 'pending') {
      return res.status(202).json({ success: true, status, data: result, message: 'Submitted for approval.' });
    }
    res.json({ success: true, status, data: result });
  } catch (err) { next(err); }
};

const deletePlanItem = async (req, res, next) => {
  try {
    const { status, result } = await kpiDefinitionApproval.deletePlanItem(req.params.id, req.params.itemId, req.user);
    if (status === 'pending') {
      return res.status(202).json({ success: true, status, data: result, message: 'Submitted for approval.' });
    }
    res.json({ success: true, message: 'Item deleted.' });
  } catch (err) { next(err); }
};

module.exports = {
  getPlans, getPlanById, createPlan, updatePlan, updatePlanStatus,
  publishPlan, unpublishPlan, addPlanItem, updatePlanItem, deletePlanItem,
};
