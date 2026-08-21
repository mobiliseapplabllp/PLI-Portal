const { Op } = require('sequelize');
const sequelize = require('../../config/database');
const { RosterWeek, RosterEntry, RosterSwapRequest } = require('../../models/associations');
const User = require('../../models/User');
const { NotFoundError, ForbiddenError, ValidationError, ConflictError } = require('../../utils/errors');
const { createAuditLog } = require('../../middleware/auditLogger');
const { ROSTER_SWAP_STATUS } = require('../../config/constants');
const { sendRosterSwapEmail } = require('../../utils/emailService');
const { isRosterAdmin, prettyDate } = require('./roster.service');

const ACTIVE_STATUSES = [ROSTER_SWAP_STATUS.PENDING_PEER, ROSTER_SWAP_STATUS.PENDING_MANAGER];

const swapIncludes = [
  { model: RosterWeek, as: 'week', attributes: ['id', 'saturdayDate', 'label'] },
  { model: User, as: 'requester', attributes: ['id', 'name', 'employeeCode', 'email', 'managerId'] },
  { model: User, as: 'target', attributes: ['id', 'name', 'employeeCode', 'email', 'managerId'] },
  { model: User, as: 'decidedBy', attributes: ['id', 'name'] },
  { model: RosterEntry, as: 'requesterEntry', attributes: ['id', 'finalStatus'] },
  { model: RosterEntry, as: 'targetEntry', attributes: ['id', 'finalStatus'] },
];

/**
 * Employee requests to swap their Saturday status with a colleague (same week).
 * Both entries must be published and have opposite statuses.
 */
const createSwap = async (weekId, { targetEmployeeId, reason }, user) => {
  if (String(targetEmployeeId) === String(user._id)) {
    throw new ValidationError('You cannot swap with yourself');
  }
  const week = await RosterWeek.findByPk(weekId);
  if (!week) throw new NotFoundError('Roster week');

  const [mine, theirs] = await Promise.all([
    RosterEntry.findOne({ where: { rosterWeekId: weekId, employeeId: user._id } }),
    RosterEntry.findOne({ where: { rosterWeekId: weekId, employeeId: targetEmployeeId } }),
  ]);
  if (!mine || !mine.isPublished) throw new ValidationError('Your roster for this Saturday is not published yet');
  if (!theirs || !theirs.isPublished) throw new ValidationError("Your colleague's roster for this Saturday is not published yet");
  if (mine.finalStatus === theirs.finalStatus) {
    throw new ValidationError('A swap only makes sense when one of you is Working and the other is Off');
  }

  const existing = await RosterSwapRequest.findOne({
    where: {
      rosterWeekId: weekId,
      status: { [Op.in]: ACTIVE_STATUSES },
      [Op.or]: [
        { requesterEntryId: { [Op.in]: [mine.id, theirs.id] } },
        { targetEntryId: { [Op.in]: [mine.id, theirs.id] } },
      ],
    },
  });
  if (existing) throw new ConflictError('There is already a pending swap involving one of you for this Saturday');

  const swap = await RosterSwapRequest.create({
    rosterWeekId: weekId,
    requesterId: user._id,
    targetId: targetEmployeeId,
    requesterEntryId: mine.id,
    targetEntryId: theirs.id,
    reason: reason ? String(reason).trim() : null,
  });

  await createAuditLog({
    entityType: 'roster_swap',
    entityId: swap.id,
    action: 'created',
    changedBy: user._id,
    newValue: { weekId, targetEmployeeId, reason: swap.reason },
  });

  const target = await User.findByPk(targetEmployeeId, { attributes: ['name', 'email'] });
  const requester = await User.findByPk(user._id, { attributes: ['name'] });
  if (target?.email) {
    sendRosterSwapEmail(target.email, target.name, 'requested', {
      requesterName: requester?.name || 'A colleague',
      targetName: target.name,
      dateLabel: prettyDate(week.saturdayDate),
      reason: swap.reason,
    }).catch(() => {});
  }
  return getSwap(swap.id);
};

const getSwap = async (id) => {
  const swap = await RosterSwapRequest.findByPk(id, { include: swapIncludes });
  if (!swap) throw new NotFoundError('Swap request');
  return swap;
};

/** Colleague accepts → goes to the manager(s) for approval. */
const acceptSwap = async (id, user) => {
  const swap = await getSwap(id);
  if (String(swap.targetId) !== String(user._id)) {
    throw new ForbiddenError('Only the requested colleague can accept this swap');
  }
  if (swap.status !== ROSTER_SWAP_STATUS.PENDING_PEER) {
    throw new ValidationError('This swap is not awaiting your acceptance');
  }
  swap.status = ROSTER_SWAP_STATUS.PENDING_MANAGER;
  swap.peerAcceptedAt = new Date();
  await swap.save();

  await createAuditLog({
    entityType: 'roster_swap',
    entityId: swap.id,
    action: 'peer_accepted',
    changedBy: user._id,
  });

  // Notify the managers of both parties (deduped)
  const managerIds = [...new Set([swap.requester?.managerId, swap.target?.managerId].filter(Boolean))];
  if (managerIds.length) {
    const managers = await User.findAll({ where: { id: { [Op.in]: managerIds }, isActive: true }, attributes: ['name', 'email'] });
    for (const m of managers) {
      if (!m.email) continue;
      sendRosterSwapEmail(m.email, m.name, 'peer_accepted', {
        requesterName: swap.requester?.name,
        targetName: swap.target?.name,
        dateLabel: prettyDate(swap.week.saturdayDate),
        reason: swap.reason,
      }).catch(() => {});
    }
  }
  return swap;
};

/** Manager of either party (or admin/hr) approves or rejects. */
const decideSwap = async (id, { action, comment }, user) => {
  if (!['approve', 'reject'].includes(action)) throw new ValidationError('Action must be approve or reject');
  const swap = await getSwap(id);
  if (swap.status !== ROSTER_SWAP_STATUS.PENDING_MANAGER) {
    throw new ValidationError('This swap is not awaiting manager approval');
  }
  const managesParty =
    String(swap.requester?.managerId) === String(user._id) ||
    String(swap.target?.managerId) === String(user._id);
  if (!isRosterAdmin(user) && !managesParty) {
    throw new ForbiddenError('Only the manager of either employee (or admin) can decide this swap');
  }

  const dateLabel = prettyDate(swap.week.saturdayDate);

  if (action === 'approve') {
    await sequelize.transaction(async (t) => {
      const [a, b] = await Promise.all([
        RosterEntry.findByPk(swap.requesterEntryId, { transaction: t, lock: t.LOCK.UPDATE }),
        RosterEntry.findByPk(swap.targetEntryId, { transaction: t, lock: t.LOCK.UPDATE }),
      ]);
      if (!a || !b) throw new NotFoundError('Roster entry');
      if (a.finalStatus === b.finalStatus) {
        throw new ConflictError('The two entries no longer have opposite statuses — swap cannot be applied');
      }
      const now = new Date();
      const swapNote = `Swap approved: ${swap.requester?.name} ⇄ ${swap.target?.name}`;
      const [aNew, bNew] = [b.finalStatus, a.finalStatus];
      await a.update({ finalStatus: aNew, changeReason: swapNote, changedById: user._id, changedAt: now }, { transaction: t });
      await b.update({ finalStatus: bNew, changeReason: swapNote, changedById: user._id, changedAt: now }, { transaction: t });
      await swap.update(
        { status: ROSTER_SWAP_STATUS.APPROVED, decidedById: user._id, decidedAt: now, decisionComment: comment || null },
        { transaction: t }
      );
    });
  } else {
    swap.status = ROSTER_SWAP_STATUS.REJECTED;
    swap.decidedById = user._id;
    swap.decidedAt = new Date();
    swap.decisionComment = comment || null;
    await swap.save();
  }

  await createAuditLog({
    entityType: 'roster_swap',
    entityId: swap.id,
    action: action === 'approve' ? 'approved' : 'rejected',
    changedBy: user._id,
    newValue: { comment: comment || null },
  });

  const stage = action === 'approve' ? 'approved' : 'rejected';
  for (const party of [swap.requester, swap.target]) {
    if (!party?.email) continue;
    sendRosterSwapEmail(party.email, party.name, stage, {
      requesterName: swap.requester?.name,
      targetName: swap.target?.name,
      dateLabel,
      comment,
    }).catch(() => {});
  }
  return getSwap(swap.id);
};

const cancelSwap = async (id, user) => {
  const swap = await getSwap(id);
  if (String(swap.requesterId) !== String(user._id)) {
    throw new ForbiddenError('Only the requester can cancel a swap');
  }
  if (!ACTIVE_STATUSES.includes(swap.status)) {
    throw new ValidationError('Only pending swaps can be cancelled');
  }
  swap.status = ROSTER_SWAP_STATUS.CANCELLED;
  await swap.save();
  await createAuditLog({ entityType: 'roster_swap', entityId: swap.id, action: 'cancelled', changedBy: user._id });
  return swap;
};

/** Admin/hr: all. Manager: swaps where either party is in their team. Employee: own. */
const listSwaps = async (user, query = {}) => {
  const where = {};
  if (query.status) where.status = query.status;

  if (isRosterAdmin(user)) {
    // no extra scoping
  } else if (['manager', 'senior_manager', 'sales_director'].includes(user.role)) {
    const team = await User.findAll({ where: { managerId: user._id }, attributes: ['id'] });
    const ids = team.map((u) => u.id);
    ids.push(user._id);
    where[Op.or] = [{ requesterId: { [Op.in]: ids } }, { targetId: { [Op.in]: ids } }];
  } else {
    where[Op.or] = [{ requesterId: user._id }, { targetId: user._id }];
  }

  return RosterSwapRequest.findAll({
    where,
    include: swapIncludes,
    order: [['createdAt', 'DESC']],
    limit: Math.min(Number(query.limit) || 50, 200),
  });
};

module.exports = { createSwap, acceptSwap, decideSwap, cancelSwap, listSwaps };
