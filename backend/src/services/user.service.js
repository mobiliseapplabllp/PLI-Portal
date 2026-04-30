const { Op } = require('sequelize');
const sequelize = require('../config/database');
const User = require('../models/User');
const Department = require('../models/Department');
const KpiAssignment = require('../models/KpiAssignment');
const { KPI_STATUS } = require('../config/constants');
const { NotFoundError } = require('../utils/errors');
const { createAuditLog } = require('../middleware/auditLogger');

const userIncludes = [
  { model: Department, as: 'department', attributes: ['id', 'name', 'code'] },
  { model: User, as: 'manager', attributes: ['id', 'name', 'employeeCode', 'email'] },
];

const getUsers = async (query = {}) => {
  const { page = 1, limit = 20, search, department, role, isActive } = query;
  const where = {};

  if (search) {
    const matchingManagers = await User.findAll({
      where: { name: { [Op.like]: `%${search}%` } },
      attributes: ['id'],
    });
    const managerIds = matchingManagers.map((m) => m.id);

    const or = [
      { name: { [Op.like]: `%${search}%` } },
      { employeeCode: { [Op.like]: `%${search}%` } },
      { email: { [Op.like]: `%${search}%` } },
    ];
    if (managerIds.length) {
      or.push({ managerId: { [Op.in]: managerIds } });
    }
    where[Op.or] = or;
  }
  if (department) where.departmentId = department;
  if (role) where.role = role;
  if (isActive !== undefined) where.isActive = isActive === 'true';

  const total = await User.count({ where });
  const users = await User.findAll({
    where,
    attributes: { exclude: ['passwordHash'] },
    include: userIncludes,
    order: [['name', 'ASC']],
    offset: (page - 1) * limit,
    limit: Number(limit),
  });

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
  const user = await User.findByPk(id, {
    attributes: { exclude: ['passwordHash'] },
    include: userIncludes,
  });
  if (!user) throw new NotFoundError('User');
  return user;
};

const mapCreateBody = (data) => {
  const { department, manager, password, ...rest } = data;
  return {
    ...rest,
    email: data.email?.toLowerCase?.() || data.email,
    employeeCode: data.employeeCode?.toUpperCase?.() || data.employeeCode,
    departmentId: department || null,
    managerId: manager || null,
    passwordHash: password,
  };
};

const createUser = async (data, createdBy) => {
  const user = await User.create(mapCreateBody(data));

  await createAuditLog({
    entityType: 'user',
    entityId: user.id,
    action: 'created',
    changedBy: createdBy,
    newValue: { employeeCode: user.employeeCode, name: user.name, role: user.role },
  });

  const full = await User.findByPk(user.id, {
    attributes: { exclude: ['passwordHash'] },
    include: userIncludes,
  });
  return full.get({ plain: true });
};

const updateUser = async (id, data, updatedBy) => {
  const user = await User.findByPk(id);
  if (!user) throw new NotFoundError('User');

  const oldValue = {
    name: user.name,
    email: user.email,
    role: user.role,
    departmentId: user.departmentId,
    managerId: user.managerId,
    isActive: user.isActive,
  };

  const patch = { ...data };
  if (patch.password) {
    patch.passwordHash = patch.password;
    patch.mustChangePassword = true;
    delete patch.password;
  }
  if (patch.department !== undefined) {
    patch.departmentId = patch.department;
    delete patch.department;
  }
  if (patch.manager !== undefined) {
    patch.managerId = patch.manager;
    delete patch.manager;
  }
  if (patch.email) patch.email = patch.email.toLowerCase();

  const wasActive = oldValue.isActive;
  const isBeingDeactivated = wasActive && patch.isActive === false;
  const hasManagerChanged = patch.managerId !== undefined && String(oldValue.managerId || '') !== String(patch.managerId || '');

  if (isBeingDeactivated) {
    patch.kpiReviewApplicable = false;
  }

  Object.assign(user, patch);
  await user.save();

  if (hasManagerChanged) {
    const [reassignedCount] = await KpiAssignment.update(
      { managerId: user.managerId || null },
      { where: { employeeId: user.id } }
    );
    await createAuditLog({
      entityType: 'user',
      entityId: user.id,
      action: 'manager_changed',
      changedBy: updatedBy,
      oldValue: { managerId: oldValue.managerId || null },
      newValue: { managerId: user.managerId || null, reassignedOpenAssignments: reassignedCount },
    });
  }

  if (isBeingDeactivated) {
    const openStatuses = [
      KPI_STATUS.DRAFT,
      KPI_STATUS.ASSIGNED,
      KPI_STATUS.EMPLOYEE_SUBMITTED,
      KPI_STATUS.MANAGER_REVIEWED,
      KPI_STATUS.FINAL_REVIEWED,
    ];
    const [affected] = await KpiAssignment.update(
      { status: KPI_STATUS.LOCKED },
      { where: { employeeId: user.id, status: { [Op.in]: openStatuses } } }
    );
    if (affected > 0) {
      await createAuditLog({
        entityType: 'kpi_assignment',
        entityId: user.id,
        action: 'bulk_locked_on_exit',
        changedBy: updatedBy,
        oldValue: { openAssignments: affected },
        newValue: { status: 'locked', reason: 'Employee deactivated' },
      });
    }
  }

  await createAuditLog({
    entityType: 'user',
    entityId: user.id,
    action: 'updated',
    changedBy: updatedBy,
    oldValue,
    newValue: data,
  });

  const full = await User.findByPk(user.id, {
    attributes: { exclude: ['passwordHash'] },
    include: userIncludes,
  });
  return full.get({ plain: true });
};

const getTeamByManager = async (managerId) => {
  return User.findAll({
    where: { managerId, isActive: true },
    attributes: { exclude: ['passwordHash'] },
    include: [{ model: Department, as: 'department', attributes: ['id', 'name', 'code'] }],
    order: [['name', 'ASC']],
  });
};

const getDistinctDesignations = async () => {
  const [rows] = await sequelize.query(
    `SELECT DISTINCT role FROM users
     WHERE role IS NOT NULL AND role != '' AND isActive = 1
     ORDER BY role ASC`
  );
  return rows.map((r) => r.role).filter(Boolean);
};

module.exports = { getUsers, getUserById, createUser, updateUser, getTeamByManager, getDistinctDesignations };
