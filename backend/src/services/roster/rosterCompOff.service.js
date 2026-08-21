const { Op } = require('sequelize');
const { RosterCompOff } = require('../../models/associations');
const User = require('../../models/User');
const { NotFoundError, ForbiddenError, ValidationError } = require('../../utils/errors');
const { createAuditLog } = require('../../middleware/auditLogger');
const { ROSTER_COMP_OFF_STATUS } = require('../../config/constants');
const { isRosterAdmin, isTeamManager } = require('./roster.service');

/** Admin/hr: all (optionally ?employeeId=). Manager: their team. Employee: own. */
const listCompOffs = async (user, query = {}) => {
  const where = {};
  if (query.status) where.status = query.status;

  if (isRosterAdmin(user)) {
    if (query.employeeId) where.employeeId = query.employeeId;
  } else if (isTeamManager(user)) {
    const team = await User.findAll({ where: { managerId: user._id }, attributes: ['id'] });
    const ids = team.map((u) => u.id);
    where.employeeId = query.employeeId && ids.includes(query.employeeId)
      ? query.employeeId
      : { [Op.in]: ids };
  } else {
    where.employeeId = user._id;
  }

  return RosterCompOff.findAll({
    where,
    include: [
      { model: User, as: 'employee', attributes: ['id', 'name', 'employeeCode'] },
      { model: User, as: 'grantedBy', attributes: ['id', 'name'] },
    ],
    order: [['earnedDate', 'DESC']],
    limit: Math.min(Number(query.limit) || 100, 500),
  });
};

/** Manager of the employee (or admin/hr) marks an earned comp-off as availed. */
const availCompOff = async (id, { availedDate }, user) => {
  const compOff = await RosterCompOff.findByPk(id, {
    include: [{ model: User, as: 'employee', attributes: ['id', 'name', 'managerId'] }],
  });
  if (!compOff) throw new NotFoundError('Comp-off');
  if (!isRosterAdmin(user) && String(compOff.employee?.managerId) !== String(user._id)) {
    throw new ForbiddenError('You can only manage comp-offs of your own team');
  }
  if (compOff.status !== ROSTER_COMP_OFF_STATUS.EARNED) {
    throw new ValidationError('Only earned comp-offs can be marked as availed');
  }
  compOff.status = ROSTER_COMP_OFF_STATUS.AVAILED;
  compOff.availedDate = availedDate || new Date().toISOString().slice(0, 10);
  await compOff.save();

  await createAuditLog({
    entityType: 'roster_comp_off',
    entityId: compOff.id,
    action: 'availed',
    changedBy: user._id,
    newValue: { availedDate: compOff.availedDate },
  });
  return compOff;
};

module.exports = { listCompOffs, availCompOff };
