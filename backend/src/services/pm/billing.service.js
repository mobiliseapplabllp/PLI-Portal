const { Op } = require('sequelize');
const { Project, Milestone, Task, ProjectMember } = require('../../models/associations');
const User = require('../../models/User');
const { NotFoundError, ForbiddenError, ValidationError } = require('../../utils/errors');
const { createAuditLog } = require('../../middleware/auditLogger');
const { generateExcel } = require('../../utils/excelExporter');
const notificationService = require('../notification.service');
const { sendProjectReadyToBillEmail, sendProjectBilledEmail } = require('../../utils/emailService');
const {
  PM_BILLING_ROLES,
  PM_PROJECT_STATUS,
  NOTIFICATION_TYPES,
} = require('../../config/constants');

// ─────────────────────────────────────────────────────────────────────────────
// Billing is a Finance function, deliberately separated from delivery:
//   · the project manager decides whether a project is BILLABLE
//   · Finance (or admin) decides when it is BILLED, and only once it is COMPLETED
// ─────────────────────────────────────────────────────────────────────────────

const isBillingUser = (user) => PM_BILLING_ROLES.includes(user.role);

const assertBillingUser = (user) => {
  if (!isBillingUser(user)) {
    throw new ForbiddenError('Only the Finance team can update billing status');
  }
};

const projectIncludes = [
  { model: User, as: 'projectManager', attributes: ['id', 'name', 'email'] },
  { model: User, as: 'owner', attributes: ['id', 'name'] },
  { model: User, as: 'billedBy', attributes: ['id', 'name'] },
];

/**
 * Billing register. Readable by Finance/admin plus the leadership roles that
 * already see every project.
 *
 * query.filter: 'ready' | 'billed' | 'billable' | 'all'  (default 'all')
 */
const getBillingRegister = async (user, query = {}) => {
  const where = {};
  if (query.status) where.status = query.status;
  if (query.search) where.name = { [Op.like]: `%${query.search}%` };

  switch (query.filter) {
    case 'ready': // billable, finished, not yet invoiced
      Object.assign(where, {
        isBillable: true,
        isBilled: false,
        status: PM_PROJECT_STATUS.COMPLETED,
      });
      break;
    case 'billed':
      where.isBilled = true;
      break;
    case 'billable':
      where.isBillable = true;
      break;
    default:
      break;
  }

  const projects = await Project.findAll({
    where,
    include: projectIncludes,
    order: [['updatedAt', 'DESC']],
  });

  const rows = projects.map((p) => {
    const plain = p.get({ plain: true });
    plain.readyToBill = plain.isBillable && !plain.isBilled && plain.status === PM_PROJECT_STATUS.COMPLETED;
    // Billable and still running — visible to Finance as pipeline, not yet actionable
    plain.pending = plain.isBillable && !plain.isBilled && plain.status !== PM_PROJECT_STATUS.COMPLETED;
    return plain;
  });

  // Totals are always computed over ALL projects, not the filtered slice, so the
  // cards stay stable while Finance moves between tabs.
  const all = await Project.findAll({
    attributes: ['status', 'isBillable', 'isBilled'],
  });
  const stats = {
    total: all.length,
    billable: all.filter((p) => p.isBillable).length,
    notBillable: all.filter((p) => !p.isBillable).length,
    readyToBill: all.filter(
      (p) => p.isBillable && !p.isBilled && p.status === PM_PROJECT_STATUS.COMPLETED
    ).length,
    billed: all.filter((p) => p.isBilled).length,
    inFlight: all.filter(
      (p) => p.isBillable && !p.isBilled && p.status !== PM_PROJECT_STATUS.COMPLETED
    ).length,
  };

  return { projects: rows, stats, canBill: isBillingUser(user) };
};

/**
 * Mark a project invoiced. Guarded three ways: role, billable flag, and a
 * completed status — a project that is still running cannot be billed.
 */
const markBilled = async (projectId, { invoiceNumber, billedDate }, user) => {
  assertBillingUser(user);

  const project = await Project.findByPk(projectId);
  if (!project) throw new NotFoundError('Project');

  if (!project.isBillable) {
    throw new ValidationError('This project is not marked billable. Ask the project manager to flag it first.');
  }
  if (project.status !== PM_PROJECT_STATUS.COMPLETED) {
    throw new ValidationError('Only completed projects can be billed.');
  }
  if (project.isBilled) {
    throw new ValidationError('This project has already been billed.');
  }
  if (!invoiceNumber || !String(invoiceNumber).trim()) {
    throw new ValidationError('Invoice number is required.');
  }

  await project.update({
    isBilled: true,
    invoiceNumber: String(invoiceNumber).trim(),
    billedDate: billedDate || new Date().toISOString().slice(0, 10),
    billedById: user._id,
    billedAt: new Date(),
  });

  await createAuditLog({
    entityType: 'pm_project',
    entityId: project.id,
    action: 'billed',
    changedBy: user._id,
    newValue: { invoiceNumber: project.invoiceNumber, billedDate: project.billedDate },
  });

  const updated = await Project.findByPk(project.id, { include: projectIncludes });

  // Tell the delivery side their project has been invoiced
  if (project.managerId) {
    notificationService.create({
      recipient: project.managerId,
      type: NOTIFICATION_TYPES.PM_PROJECT_BILLED,
      title: `Project billed: ${project.name}`,
      message: `Finance has raised invoice ${project.invoiceNumber} for "${project.name}".`,
      referenceType: 'pm_project',
      referenceId: project.id,
    });

    if (updated?.projectManager?.email) {
      sendProjectBilledEmail(
        updated.projectManager.email,
        updated.projectManager.name,
        updated.get({ plain: true })
      ).catch(() => {});
    }
  }

  return updated;
};

/** Reverse an invoice entry (wrong invoice number, credit note, etc.). */
const unmarkBilled = async (projectId, { reason }, user) => {
  assertBillingUser(user);

  const project = await Project.findByPk(projectId);
  if (!project) throw new NotFoundError('Project');
  if (!project.isBilled) throw new ValidationError('This project is not marked as billed.');

  const previous = { invoiceNumber: project.invoiceNumber, billedDate: project.billedDate };

  await project.update({
    isBilled: false,
    invoiceNumber: null,
    billedDate: null,
    billedById: null,
    billedAt: null,
  });

  await createAuditLog({
    entityType: 'pm_project',
    entityId: project.id,
    action: 'billing_reverted',
    changedBy: user._id,
    oldValue: previous,
    newValue: { reason: reason || null },
  });

  return Project.findByPk(project.id, { include: projectIncludes });
};

/**
 * Alert Finance that a billable project just completed. Called from the project
 * service on the status transition; never throws into the caller's flow.
 */
const notifyFinanceReadyToBill = async (projectRef) => {
  try {
    const financeUsers = await User.findAll({
      where: { role: { [Op.in]: PM_BILLING_ROLES }, isActive: true },
      attributes: ['id', 'name', 'email'],
    });
    if (!financeUsers.length) return;

    // Re-read with the people attached, and gather what Finance needs to raise
    // the invoice without chasing the project manager.
    const project = await Project.findByPk(projectRef.id, { include: projectIncludes });
    if (!project) return;

    const [milestones, tasks, teamSize] = await Promise.all([
      Milestone.findAll({ where: { projectId: project.id }, attributes: ['status'] }),
      Task.findAll({ where: { projectId: project.id }, attributes: ['status'] }),
      ProjectMember.count({ where: { projectId: project.id } }),
    ]);

    const stats = {
      milestonesTotal: milestones.length,
      milestonesCompleted: milestones.filter((m) => m.status === 'completed').length,
      tasksTotal: tasks.length,
      tasksCompleted: tasks.filter((t) => t.status === 'completed').length,
      teamSize,
    };

    const link = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/pm/billing`;
    const plain = project.get({ plain: true });

    for (const fin of financeUsers) {
      notificationService.create({
        recipient: fin.id,
        type: NOTIFICATION_TYPES.PM_PROJECT_READY_TO_BILL,
        title: `Ready to bill: ${project.name}`,
        message: `"${project.name}"${project.clientName ? ` for ${project.clientName}` : ''} is complete and billable — ${stats.milestonesCompleted}/${stats.milestonesTotal} milestones delivered. Ready to invoice.`,
        referenceType: 'pm_project',
        referenceId: project.id,
      });

      if (fin.email) {
        sendProjectReadyToBillEmail(fin.email, fin.name, plain, stats, link).catch(() => {});
      }
    }
  } catch (err) {
    console.error('[Billing] finance notification failed:', err.message);
  }
};

const exportBillingExcel = async (user, query = {}) => {
  const { projects } = await getBillingRegister(user, query);
  const columns = [
    { header: 'Project', key: 'name', width: 32 },
    { header: 'Client', key: 'client', width: 24 },
    { header: 'Project Manager', key: 'pm', width: 22 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Start', key: 'start', width: 12 },
    { header: 'End', key: 'end', width: 12 },
    { header: 'Billable', key: 'billable', width: 10 },
    { header: 'Billed', key: 'billed', width: 10 },
    { header: 'Invoice No.', key: 'invoice', width: 18 },
    { header: 'Billed Date', key: 'billedDate', width: 14 },
    { header: 'Billed By', key: 'billedBy', width: 20 },
  ];
  const rows = projects.map((p) => ({
    name: p.name,
    client: p.clientName || '',
    pm: p.projectManager?.name || '',
    status: p.status,
    start: p.startDate || '',
    end: p.endDate || '',
    billable: p.isBillable ? 'Yes' : 'No',
    billed: p.isBilled ? 'Yes' : p.readyToBill ? 'Ready' : 'No',
    invoice: p.invoiceNumber || '',
    billedDate: p.billedDate || '',
    billedBy: p.billedBy?.name || '',
  }));
  const buffer = await generateExcel('Billing Register', columns, rows);
  return { buffer, filename: `billing-register-${new Date().toISOString().slice(0, 10)}.xlsx` };
};

module.exports = {
  isBillingUser,
  getBillingRegister,
  markBilled,
  unmarkBilled,
  notifyFinanceReadyToBill,
  exportBillingExcel,
};
