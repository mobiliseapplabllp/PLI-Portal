const departmentService = require('../services/department.service');
const { sendSuccess } = require('../utils/response');

const getDepartments = async (req, res, next) => {
  try {
    const departments = await departmentService.getDepartments(req.query);
    sendSuccess(res, departments);
  } catch (error) {
    next(error);
  }
};

const createDepartment = async (req, res, next) => {
  try {
    const department = await departmentService.createDepartment(req.body, req.user._id);
    sendSuccess(res, department, 'Department created', 201);
  } catch (error) {
    next(error);
  }
};

const updateDepartment = async (req, res, next) => {
  try {
    const department = await departmentService.updateDepartment(req.params.id, req.body, req.user._id);
    sendSuccess(res, department, 'Department updated');
  } catch (error) {
    next(error);
  }
};

module.exports = { getDepartments, createDepartment, updateDepartment };
