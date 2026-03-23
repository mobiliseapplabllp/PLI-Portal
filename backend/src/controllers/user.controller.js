const userService = require('../services/user.service');
const { sendSuccess, sendPaginated } = require('../utils/response');

const getUsers = async (req, res, next) => {
  try {
    const { users, pagination } = await userService.getUsers(req.query);
    sendPaginated(res, users, pagination);
  } catch (error) {
    next(error);
  }
};

const getUserById = async (req, res, next) => {
  try {
    const user = await userService.getUserById(req.params.id);
    sendSuccess(res, user);
  } catch (error) {
    next(error);
  }
};

const createUser = async (req, res, next) => {
  try {
    const user = await userService.createUser(req.body, req.user._id);
    sendSuccess(res, user, 'User created successfully', 201);
  } catch (error) {
    next(error);
  }
};

const updateUser = async (req, res, next) => {
  try {
    const user = await userService.updateUser(req.params.id, req.body, req.user._id);
    sendSuccess(res, user, 'User updated successfully');
  } catch (error) {
    next(error);
  }
};

const getTeam = async (req, res, next) => {
  try {
    const managerId = req.params.managerId;
    // Manager can only see own team
    if (req.user.role === 'manager' && managerId !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: { message: 'Cannot view other teams' } });
    }
    const team = await userService.getTeamByManager(managerId);
    sendSuccess(res, team);
  } catch (error) {
    next(error);
  }
};

module.exports = { getUsers, getUserById, createUser, updateUser, getTeam };
