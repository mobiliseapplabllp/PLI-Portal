const KpiDefiner = require('../models/KpiDefiner');
const KpiDefinitionApprover = require('../models/KpiDefinitionApprover');
const User = require('../models/User');
const Department = require('../models/Department');
const { AppError, NotFoundError } = require('../utils/errors');

// req.user has `id` renamed to `_id` for the client (renameIdsForClient) —
// a raw Sequelize instance (e.g. in scripts/tests) still has `id`. Accept both.
const uid = (user) => user._id || user.id;

const includeUserDept = [
  { model: User, as: 'user', attributes: ['id', 'name', 'email', 'role', 'departmentId'] },
];

// ── Definers ────────────────────────────────────────────────────────────────

const listDefiners = async () => {
  return KpiDefiner.findAll({
    where: { isActive: true },
    include: [...includeUserDept, { model: Department, as: 'department', attributes: ['id', 'name'] }],
    order: [['grantedAt', 'DESC']],
  });
};

// Grant is always auto-scoped to the target user's OWN department — never
// admin-picked. Upserts: re-granting a previously revoked user reactivates
// the same row rather than creating a duplicate.
const grantDefiner = async (userId, grantedById) => {
  const user = await User.findByPk(userId);
  if (!user) throw new NotFoundError('User');
  if (!user.departmentId) throw new AppError('This user has no department set — cannot grant Definer rights.', 400);

  let grant = await KpiDefiner.findOne({ where: { userId } });
  if (grant) {
    grant.departmentId = user.departmentId;
    grant.isActive = true;
    grant.grantedById = grantedById;
    grant.grantedAt = new Date();
    grant.revokedAt = null;
    await grant.save();
  } else {
    grant = await KpiDefiner.create({
      userId,
      departmentId: user.departmentId,
      isActive: true,
      grantedById,
    });
  }
  return grant;
};

const revokeDefiner = async (userId) => {
  const grant = await KpiDefiner.findOne({ where: { userId, isActive: true } });
  if (!grant) throw new NotFoundError('Active Definer grant');
  grant.isActive = false;
  grant.revokedAt = new Date();
  await grant.save();
  return grant;
};

// ── Approvers ───────────────────────────────────────────────────────────────

const listApprovers = async () => {
  return KpiDefinitionApprover.findAll({
    include: [
      { model: Department, as: 'department', attributes: ['id', 'name'] },
      { model: User, as: 'user', attributes: ['id', 'name', 'email', 'role'] },
    ],
    order: [['assignedAt', 'DESC']],
  });
};

// One active approver per department. Admin may assign ANY user — not
// restricted to that department. Upserts: reassigning replaces the row.
const assignApprover = async (departmentId, userId, assignedById) => {
  const dept = await Department.findByPk(departmentId);
  if (!dept) throw new NotFoundError('Department');
  const user = await User.findByPk(userId);
  if (!user) throw new NotFoundError('User');

  let row = await KpiDefinitionApprover.findOne({ where: { departmentId } });
  if (row) {
    row.userId = userId;
    row.assignedById = assignedById;
    row.assignedAt = new Date();
    await row.save();
  } else {
    row = await KpiDefinitionApprover.create({ departmentId, userId, assignedById });
  }
  return row;
};

// Removing the assignment falls back to admin automatically — no row left behind.
const removeApprover = async (departmentId) => {
  const row = await KpiDefinitionApprover.findOne({ where: { departmentId } });
  if (!row) throw new NotFoundError('Approver assignment');
  await row.destroy();
  return { departmentId, fallenBackToAdmin: true };
};

// Self-check for the CURRENT user — drives sidebar visibility for a granted
// Definer or assigned Approver whose role wouldn't otherwise show these links
// (e.g. a plain 'employee' like Neha/Veer). Any authenticated user may call this.
const getMyAccess = async (user) => {
  const grant = await KpiDefiner.findOne({ where: { userId: uid(user), isActive: true } });
  const approverRows = await KpiDefinitionApprover.findAll({ where: { userId: uid(user) } });
  return {
    isDefiner: !!grant,
    definerDepartmentId: grant ? grant.departmentId : null,
    isApprover: approverRows.length > 0,
    approverDepartmentIds: approverRows.map((r) => r.departmentId),
  };
};

module.exports = {
  listDefiners,
  grantDefiner,
  revokeDefiner,
  listApprovers,
  assignApprover,
  removeApprover,
  getMyAccess,
};
