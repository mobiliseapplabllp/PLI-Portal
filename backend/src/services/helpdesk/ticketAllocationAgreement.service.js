'use strict';

/**
 * Ticket allocation agreement workflow (migration 057, Operations/Helpdesk
 * ONLY — never touches PM allocation). While `pm_settings
 * .ticketAllocationAgreementEnabled` is false, this module is never invoked —
 * ticket.controller.js's existing create/update allocation path behaves
 * exactly as before (sets the real allocation columns immediately).
 *
 * When enabled, a manager's allocation on a ticket must be proposed and
 * agreed before it's "real":
 *   none -> pending_employee -> confirmed            (employee agrees)
 *   none -> pending_employee -> pending_manager -> ... -> confirmed  (counters)
 *
 * The real allocation columns on hd_tickets (allocationTotalHours/From/To)
 * are only written at the moment of confirmation, reusing the EXISTING
 * validated resolveTicketAllocation/assertTicketCapacity logic in
 * ticket.controller.js — this module never re-implements that logic.
 */

const HdTicket = require('../../models/helpdesk/HdTicket');
const HdTicketAllocationProposal = require('../../models/helpdesk/HdTicketAllocationProposal');
const sequelize = require('../../config/database');
const { ValidationError, ForbiddenError, NotFoundError } = require('../../utils/errors');

async function isEnabled() {
  const pmSettingsService = require('../pm/pmSettings.service');
  const settings = await pmSettingsService.getSettings();
  return !!settings.ticketAllocationAgreementEnabled;
}

const otherRole = (role) => (role === 'manager' ? 'employee' : 'manager');
const pendingStatusFor = (role) => (role === 'manager' ? 'pending_employee' : 'pending_manager');

async function getPendingProposal(ticketId, transaction) {
  return HdTicketAllocationProposal.findOne({
    where: { ticketId, status: 'pending' },
    order: [['id', 'DESC']],
    transaction,
  });
}

async function getHistory(ticketId) {
  return HdTicketAllocationProposal.findAll({
    where: { ticketId },
    order: [['id', 'ASC']],
    include: [
      { association: 'proposedByUser', attributes: ['id', 'name'] },
      { association: 'respondedByUser', attributes: ['id', 'name'] },
    ],
  });
}

/**
 * Manager proposes a fresh allocation (or re-proposes after an employee's
 * disagree-without-counter reset the ticket to 'none').
 */
async function propose({ ticketId, proposedByUserId, totalHours, allocationFrom, allocationTo }) {
  return sequelize.transaction(async (t) => {
    const ticket = await HdTicket.findByPk(ticketId, { transaction: t });
    if (!ticket) throw new NotFoundError('Ticket');
    if (!ticket.assigneeId) throw new ValidationError('Ticket must have an assignee before allocation can be proposed');
    if (ticket.allocationAgreementStatus === 'pending_employee' || ticket.allocationAgreementStatus === 'pending_manager') {
      throw new ValidationError('A proposal is already pending a response on this ticket');
    }

    await HdTicketAllocationProposal.update(
      { status: 'superseded' },
      { where: { ticketId, status: 'pending' }, transaction: t },
    );
    const proposal = await HdTicketAllocationProposal.create({
      ticketId,
      proposedByUserId,
      proposedByRole: 'manager',
      totalHours,
      allocationFrom,
      allocationTo,
      status: 'pending',
    }, { transaction: t });

    ticket.allocationAgreementStatus = 'pending_employee';
    await ticket.save({ transaction: t });

    return proposal;
  });
}

/**
 * Respond to the current pending proposal — either side, whichever one it's
 * awaiting. `confirmFn(proposal, transaction)` is supplied by the caller
 * (ticket.controller.js) and is responsible for writing the real allocation
 * columns via the existing resolveTicketAllocation/assertTicketCapacity path.
 */
async function respond({ ticketId, respondedByUserId, respondedByRole, action, counter }, confirmFn) {
  return sequelize.transaction(async (t) => {
    const ticket = await HdTicket.findByPk(ticketId, { transaction: t });
    if (!ticket) throw new NotFoundError('Ticket');

    const pending = await getPendingProposal(ticketId, t);
    if (!pending) throw new ValidationError('No pending allocation proposal on this ticket');

    const expectedStatus = pendingStatusFor(pending.proposedByRole);
    if (ticket.allocationAgreementStatus !== expectedStatus) {
      throw new ValidationError('This proposal is no longer awaiting a response');
    }
    // The responder must be on the OTHER side from whoever proposed it.
    if (respondedByRole === pending.proposedByRole) {
      throw new ForbiddenError('You proposed this allocation — waiting on the other side to respond');
    }

    if (action === 'agree') {
      pending.status = 'accepted';
      pending.respondedByUserId = respondedByUserId;
      pending.respondedAt = new Date();
      await pending.save({ transaction: t });

      await confirmFn(pending, t);

      ticket.allocationAgreementStatus = 'confirmed';
      await ticket.save({ transaction: t });
      return { ticketStatus: 'confirmed', proposal: pending };
    }

    if (action === 'disagree') {
      pending.status = 'rejected';
      pending.respondedByUserId = respondedByUserId;
      pending.respondedAt = new Date();
      await pending.save({ transaction: t });

      if (counter && counter.totalHours != null && counter.allocationFrom && counter.allocationTo) {
        const nextRole = respondedByRole;
        const counterProposal = await HdTicketAllocationProposal.create({
          ticketId,
          proposedByUserId: respondedByUserId,
          proposedByRole:   nextRole,
          totalHours:      counter.totalHours,
          allocationFrom:  counter.allocationFrom,
          allocationTo:    counter.allocationTo,
          status: 'pending',
        }, { transaction: t });

        ticket.allocationAgreementStatus = pendingStatusFor(nextRole);
        await ticket.save({ transaction: t });
        return { ticketStatus: ticket.allocationAgreementStatus, proposal: counterProposal };
      }

      ticket.allocationAgreementStatus = 'none';
      await ticket.save({ transaction: t });
      return { ticketStatus: 'none', proposal: null };
    }

    throw new ValidationError("action must be 'agree' or 'disagree'");
  });
}

module.exports = { isEnabled, getPendingProposal, getHistory, propose, respond };
