const User = require('../models/User');
const KpiAssignment = require('../models/KpiAssignment');
const { KPI_STATUS } = require('../config/constants');
const { NotFoundError, ConflictError } = require('../utils/errors');
const { createAuditLog } = require('../middleware/auditLogger');

const getUsers = async (query = {}) => {
  const { page = 1, limit = 20, search, department, role, isActive } = query;
  const filter = {};

  if (search) {
    // Also search by manager name: find managers matching the search term
    const matchingManagers = await User.find({
      name: { $regex: search, $options: 'i' },
    }).select('_id').lean();
    const managerIds = matchingManagers.map((m) => m._id);

    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { employeeCode: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      ...(managerIds.length > 0 ? [{ manager: { $in: managerIds } }] : []),
    ];
  }
  if (department) filter.department = department;
  if (role) filter.role = role;
  if (isActive !== undefined) filter.isActive = isActive === 'true';

  const total = await User.countDocuments(filter);
  const users = await User.find(filter)
    .select('-passwordHash')
    .populate('department', 'name code')
    .populate('manager', 'name employeeCode')
    .sort({ name: 1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  return {
    users,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / limit),
    },
  };
};

const getUserById = async (id) => {
  const user = await User.findById(id)
    .select('-passwordHash')
    .populate('department', 'name code')
    .populate('manager', 'name employeeCode email');
  if (!user) throw new NotFoundError('User');
  return user;
};

const createUser = async (data, createdBy) => {
  // Set passwordHash from password field
  const userData = {
    ...data,
    passwordHash: data.password,
  };
  delete userData.password;

  const user = await User.create(userData);

  await createAuditLog({
    entityType: 'user',
    entityId: user._id,
    action: 'created',
    changedBy: createdBy,
    newValue: { employeeCode: user.employeeCode, name: user.name, role: user.role },
  });

  return user.toJSON();
};

const updateUser = async (id, data, updatedBy) => {
  const user = await User.findById(id);
  if (!user) throw new NotFoundError('User');

  const oldValue = {
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department,
    manager: user.manager,
    isActive: user.isActive,
  };

  // If password is being reset by admin
  if (data.password) {
    data.passwordHash = data.password;
    data.mustChangePassword = true;
    delete data.password;
  }

  // If employee is being deactivated (exit from organisation), cascade:
  // 1. Auto-disable KPI review applicability
  // 2. Lock all their open/in-progress KPI assignments
  const wasActive = oldValue.isActive;
  const isBeingDeactivated = wasActive && data.isActive === false;

  if (isBeingDeactivated) {
    data.kpiReviewApplicable = false;
  }

  Object.assign(user, data);
  await user.save();

  // Cascade: freeze all open KPI assignments for deactivated employee
  if (isBeingDeactivated) {
    const openStatuses = [
      KPI_STATUS.DRAFT,
      KPI_STATUS.ASSIGNED,
      KPI_STATUS.EMPLOYEE_SUBMITTED,
      KPI_STATUS.MANAGER_REVIEWED,
      KPI_STATUS.FINAL_REVIEWED,
    ];

    const frozenAssignments = await KpiAssignment.updateMany(
      { employee: user._id, status: { $in: openStatuses } },
      { status: KPI_STATUS.LOCKED }
    );

    if (frozenAssignments.modifiedCount > 0) {
      await createAuditLog({
        entityType: 'kpi_assignment',
        entityId: user._id,
        action: 'bulk_locked_on_exit',
        changedBy: updatedBy,
        oldValue: { openAssignments: frozenAssignments.modifiedCount },
        newValue: { status: 'locked', reason: 'Employee deactivated' },
      });
    }
  }

  await createAuditLog({
    entityType: 'user',
    entityId: user._id,
    action: 'updated',
    changedBy: updatedBy,
    oldValue,
    newValue: data,
  });

  return user.toJSON();
};

const getTeamByManager = async (managerId) => {
  return User.find({ manager: managerId, isActive: true })
    .select('-passwordHash')
    .populate('department', 'name code')
    .sort({ name: 1 });
};

module.exports = { getUsers, getUserById, createUser, updateUser, getTeamByManager };
