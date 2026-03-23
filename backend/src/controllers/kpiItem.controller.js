const kpiItemService = require('../services/kpiItem.service');
const { sendSuccess } = require('../utils/response');

const createItem = async (req, res, next) => {
  try {
    const item = await kpiItemService.createItem(req.body, req.user);
    sendSuccess(res, item, 'KPI item created', 201);
  } catch (error) {
    next(error);
  }
};

const updateItem = async (req, res, next) => {
  try {
    const item = await kpiItemService.updateItem(req.params.id, req.body, req.user);
    sendSuccess(res, item, 'KPI item updated');
  } catch (error) {
    next(error);
  }
};

const deleteItem = async (req, res, next) => {
  try {
    await kpiItemService.deleteItem(req.params.id, req.user);
    sendSuccess(res, null, 'KPI item deleted');
  } catch (error) {
    next(error);
  }
};

module.exports = { createItem, updateItem, deleteItem };
