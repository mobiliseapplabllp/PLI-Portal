const kpiPlanService = require('../services/kpiPlan.service');

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

const createPlan = async (req, res, next) => {
  try {
    const plan = await kpiPlanService.createPlan(req.body, req.user);
    res.status(201).json({ success: true, data: plan });
  } catch (err) { next(err); }
};

const updatePlan = async (req, res, next) => {
  try {
    const plan = await kpiPlanService.updatePlan(req.params.id, req.body, req.user);
    res.json({ success: true, data: plan });
  } catch (err) { next(err); }
};

const updatePlanStatus = async (req, res, next) => {
  try {
    const plan = await kpiPlanService.updatePlanStatus(req.params.id, req.body.status, req.user);
    res.json({ success: true, data: plan });
  } catch (err) { next(err); }
};

const publishPlan = async (req, res, next) => {
  try {
    const { plan, assignmentsCreated, assignmentsSynced } = await kpiPlanService.publishPlan(req.params.id, req.user);
    const parts = [];
    if (assignmentsCreated > 0) parts.push(`${assignmentsCreated} new assignment${assignmentsCreated !== 1 ? 's' : ''} created`);
    if (assignmentsSynced > 0) parts.push(`${assignmentsSynced} existing assignment${assignmentsSynced !== 1 ? 's' : ''} updated`);
    const detail = parts.length ? ` (${parts.join(', ')})` : '';
    res.json({
      success: true,
      data: plan,
      message: `Plan published${detail}.`,
    });
  } catch (err) { next(err); }
};

const addPlanItem = async (req, res, next) => {
  try {
    const item = await kpiPlanService.addPlanItem(req.params.id, req.body, req.user);
    res.status(201).json({ success: true, data: item });
  } catch (err) { next(err); }
};

const updatePlanItem = async (req, res, next) => {
  try {
    const item = await kpiPlanService.updatePlanItem(req.params.id, req.params.itemId, req.body, req.user);
    res.json({ success: true, data: item });
  } catch (err) { next(err); }
};

const deletePlanItem = async (req, res, next) => {
  try {
    await kpiPlanService.deletePlanItem(req.params.id, req.params.itemId, req.user);
    res.json({ success: true, message: 'Item deleted.' });
  } catch (err) { next(err); }
};

module.exports = {
  getPlans, getPlanById, createPlan, updatePlan, updatePlanStatus,
  publishPlan, addPlanItem, updatePlanItem, deletePlanItem,
};
