const ExcelJS = require('exceljs');
const { Op } = require('sequelize');
const KpiAssignment = require('../models/KpiAssignment');
const KpiItem = require('../models/KpiItem');
const KpiPlanItem = require('../models/KpiPlanItem');
const User = require('../models/User');
const Department = require('../models/Department');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors');
const { getQuarterFromMonth } = require('../utils/quarterHelper');
const { calculateMonthlyScore, statusToNumeric } = require('../utils/scoreCalculator');
const { createAuditLog } = require('../middleware/auditLogger');
const {
  KPI_STATUS,
  STATUS_TRANSITIONS,
  REOPEN_ALLOWED_FROM,
  REOPEN_ALLOWED_TO,
  KPI_CATEGORIES,
  KPI_UNITS,
  NOTIFICATION_TYPES,
  AUDIT_ACTIONS,
} = require('../config/constants');
const notificationService = require('./notification.service');
const { findPlanForEmployee, applyPlanToAssignment } = require('./kpiPlan.service');

const employeeWithDept = {
  model: User,
  where: { isActive: 1 , kpiReviewApplicable: 1},
  as: 'employee',
  attributes: ['id', 'name', 'employeeCode', 'email', 'designation', 'departmentId', 'kpiReviewApplicable'],
  include: [
    { model: Department, as: 'department', attributes: ['id', 'name', 'code'] },
    { model: User, as: 'manager', attributes: ['id', 'name', 'employeeCode', 'email'] },
  ],
};


const managerShort = { model: User, as: 'manager', attributes: ['id', 'name', 'employeeCode'] };
const managerWithEmail = { model: User, as: 'manager', attributes: ['id', 'name', 'employeeCode', 'email'] };

const withCurrentManager = (assignment) => {
  const plain = assignment?.get ? assignment.get({ plain: true }) : assignment;
  if (!plain) return plain;
  return {
    ...plain,
    currentManager: plain.employee?.manager || null,
  };
};

// Strip employee-entered draft fields from items when the viewer is not the employee.
// Commitment draft (status=ASSIGNED): hide commitValue + employeeCommitmentComment.
// Self-review draft (status=COMMITMENT_APPROVED): hide employeeStatus + employeeComment.
const maskDraftFields = (items, assignmentStatus, viewerIsEmployee) => {
  return items.map((item) => {
    const masked = { ...item };
    if (!viewerIsEmployee) {
      // Manager / admin / HR: hide employee draft fields until the employee submits
      if (assignmentStatus === KPI_STATUS.ASSIGNED) {
        masked.commitValue = null;
        masked.employeeCommitmentComment = null;
      } else if (assignmentStatus === KPI_STATUS.COMMITMENT_APPROVED) {
        masked.employeeStatus = null;
        masked.employeeComment = null;
      }
    } else {
      // Employee viewing own assignment: hide manager draft fields until manager submits
      if (assignmentStatus === KPI_STATUS.EMPLOYEE_SUBMITTED) {
        masked.managerStatus = null;
        masked.managerComment = null;
      }
    }
    return masked;
  });
};

// Returns true if userId is authorised to act as manager on this assignment.
// Checks both the stored managerId (may be stale/HR-admin from auto-publish)
// AND the employee's current managerId from the User table.
const isManagerOfEmployee = async (assignment, userId) => {
  if (String(assignment.managerId || '') === String(userId)) return true;
  const employee = await User.findByPk(assignment.employeeId, { attributes: ['managerId'] });
  return !!(employee && String(employee.managerId || '') === String(userId));
};

const getAssignments = async (query = {}, user) => {
  const where = {};
  if (query.financialYear) where.financialYear = query.financialYear;
  if (query.month) where.month = Number(query.month);
  if (query.quarter) where.quarter = query.quarter;
  if (query.status) where.status = query.status;
  if (query.employee) where.employeeId = query.employee;
  if (query.manager) {
    const teamMembers = await User.findAll({
      where: { managerId: query.manager },
      attributes: ['id'],
    });
    where.employeeId = { [Op.in]: teamMembers.map((m) => m.id) };
  }

  if (user.role === 'employee') {
    where.employeeId = user._id;
  } else if (user.role === 'manager') {
    if (!query.employee) {
      const teamMembers = await User.findAll({
        where: { managerId: user._id },
        attributes: ['id'],
      });
      where.employeeId = { [Op.in]: teamMembers.map((m) => m.id) };
    }
  }

  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;

  const { count, rows } = await KpiAssignment.findAndCountAll({
    where,
    include: [
      {
        model: User,
        as: 'employee',
        attributes: ['id', 'name', 'employeeCode', 'email', 'departmentId'],
        include: [
          { model: Department, as: 'department', attributes: ['id', 'name', 'code'] },
          { model: User, as: 'manager', attributes: ['id', 'name', 'employeeCode', 'email'] },
        ],
      },
      managerShort,
    ],
    order: [
      ['financialYear', 'DESC'],
      ['month', 'DESC'],
      ['createdAt', 'DESC'],
    ],
    offset: (page - 1) * limit,
    limit,
    distinct: true,
  });

  return {
    assignments: rows.map(withCurrentManager),
    pagination: { total: count, page, limit, pages: Math.ceil(count / limit) },
  };
};

const getAssignmentById = async (id, user) => {
  const assignment = await KpiAssignment.findByPk(id, {
    // Never send BLOB bytes in regular detail calls — served via dedicated endpoints
    attributes: { exclude: ['employeeAttachmentBlob', 'managerAttachmentBlob'] },
    include: [employeeWithDept, managerWithEmail],
  });

  if (!assignment) throw new NotFoundError('KPI Assignment');

  const empId = assignment.employeeId;
  const isOwnAssignment = String(empId) === String(user._id);

  if (user.role === 'employee' && !isOwnAssignment) {
    throw new ForbiddenError('You can only view your own assignments');
  }
  if (user.role === 'manager') {
    const canView = isOwnAssignment || await isManagerOfEmployee(assignment, user._id);
    if (!canView) throw new ForbiddenError('You can only view your own or your team assignments');
  }

  const assignmentPlain = withCurrentManager(assignment);

  // Add helper flags so frontend knows if attachments exist
  assignmentPlain.hasEmployeeAttachment = !!assignment.employeeAttachmentName;
  assignmentPlain.hasManagerAttachment = !!assignment.managerAttachmentName;

  // Employee cannot see manager's private review data
  if (user.role === 'employee') {
    delete assignmentPlain.managerAttachmentName;
    delete assignmentPlain.managerAttachmentMime;
    delete assignmentPlain.hasManagerAttachment;
  }

  const rawItems = await KpiItem.findAll({
    where: { kpiAssignmentId: id },
    include: [{ model: KpiPlanItem, as: 'planItem', attributes: ['kpiHead'], required: false }],
    order: [['createdAt', 'ASC']],
  });

  const isOwnAssignmentViewer = String(assignment.employeeId) === String(user._id);

  // Strip manager's private comment from each item when viewer is employee
  const items = rawItems.map((item) => {
    const plain = item.get({ plain: true });
    if (user.role === 'employee') {
      delete plain.managerComment;
    }
    // Flatten kpiHead from the linked plan item
    plain.kpiHead = plain.planItem?.kpiHead || 'Performance';
    delete plain.planItem;
    return plain;
  });

  const maskedItems = maskDraftFields(items, assignment.status, isOwnAssignmentViewer);

  return { assignment: assignmentPlain, items: maskedItems };
};

const createAssignment = async (data, user) => {
  const employee = await User.findByPk(data.employee);
  if (!employee) throw new NotFoundError('Employee');
  if (!employee.kpiReviewApplicable) throw new ValidationError('KPI review is not applicable for this employee');

  const quarter = getQuarterFromMonth(data.month);

  const assignment = await KpiAssignment.create({
    financialYear: data.financialYear,
    month: data.month,
    quarter,
    employeeId: data.employee,
    managerId: user._id,
    createdById: user._id,
    status: KPI_STATUS.DRAFT,
  });

  // Auto-populate KPI items from published KpiPlan (team plan takes priority over dept plan)
  const plan = await findPlanForEmployee(employee, data.financialYear, Number(data.month));
  if (plan) {
    await applyPlanToAssignment(plan, assignment.id);
    const totalWeightage = plan.items.reduce((sum, i) => sum + parseFloat(i.monthlyWeightage || 0), 0);
    assignment.totalWeightage = Math.round(totalWeightage);
    await assignment.save();
  } else if (data.items && data.items.length > 0) {
    // Fallback: manual items (hr_admin/admin only path)
    await KpiItem.bulkCreate(
      data.items.map((item) => ({ ...item, kpiAssignmentId: assignment.id }))
    );
    const totalWeightage = data.items.reduce((sum, i) => sum + (Number(i.weightage) || 0), 0);
    assignment.totalWeightage = totalWeightage;
    await assignment.save();
  }

  await createAuditLog({
    entityType: 'kpi_assignment',
    entityId: assignment.id,
    action: AUDIT_ACTIONS.CREATED,
    changedBy: user._id,
    newValue: { employee: data.employee, month: data.month, financialYear: data.financialYear, autoPlanApplied: !!plan },
  });

  return assignment;
};

const updateAssignment = async (id, data, user) => {
  const assignment = await KpiAssignment.findByPk(id);
  if (!assignment) throw new NotFoundError('KPI Assignment');

  if (assignment.isLocked) throw new ValidationError('Assignment is locked');

  Object.assign(assignment, data);
  await assignment.save();

  return assignment;
};

const assignToEmployee = async (id, user) => {
  const assignment = await KpiAssignment.findByPk(id);
  if (!assignment) throw new NotFoundError('KPI Assignment');

  validateTransition(assignment.status, KPI_STATUS.ASSIGNED);

  const itemCount = await KpiItem.count({ where: { kpiAssignmentId: id } });
  if (itemCount === 0) throw new ValidationError('Add at least one KPI item before assigning');

  assignment.status = KPI_STATUS.ASSIGNED;
  await assignment.save();

  await notificationService.create({
    recipient: assignment.employeeId,
    type: 'kpi_assigned',
    title: 'KPIs Assigned',
    message: `KPIs for ${assignment.financialYear} Month ${assignment.month} have been assigned to you.`,
    referenceType: 'kpi_assignment',
    referenceId: assignment.id,
  });

  await createAuditLog({
    entityType: 'kpi_assignment',
    entityId: assignment.id,
    action: 'submitted',
    changedBy: user._id,
    newValue: { status: KPI_STATUS.ASSIGNED },
  });

  return assignment;
};

// ── commitKpi — Employee submits monthly commitment (no status, comment only) ─
const commitKpi = async (id, itemsData, user) => {
  const assignment = await KpiAssignment.findByPk(id);
  if (!assignment) throw new NotFoundError('KPI Assignment');

  if (user.role === 'employee' && String(assignment.employeeId) !== String(user._id)) {
    throw new ForbiddenError('You can only commit for your own assignments');
  }

  // Allow commitment when ASSIGNED (first time) or rejected back to ASSIGNED
  if (assignment.status !== KPI_STATUS.ASSIGNED) {
    throw new ValidationError(
      `Commitment can only be submitted when status is 'assigned'. Current status: '${assignment.status}'`
    );
  }

  const now = new Date();
  for (const item of itemsData) {
    await KpiItem.update(
      {
        commitValue: item.commitValue != null ? String(item.commitValue) : null,
        employeeCommitmentComment: item.employeeCommitmentComment || null,
        committedAt: now,
      },
      { where: { id: item.id, kpiAssignmentId: id } }
    );
  }

  assignment.status = KPI_STATUS.COMMITMENT_SUBMITTED;
  assignment.committedAt = now;
  assignment.commitmentRejectionComment = null; // clear any prior rejection
  await assignment.save();

  await notificationService.create({
    recipient: assignment.managerId,
    type: NOTIFICATION_TYPES.COMMITMENT_SUBMITTED,
    title: 'Employee Submitted Commitment',
    message: `Employee has submitted their commitment for ${assignment.financialYear} Month ${assignment.month}. Please review and approve or reject.`,
    referenceType: 'kpi_assignment',
    referenceId: assignment.id,
  });

  await createAuditLog({
    entityType: 'kpi_assignment',
    entityId: assignment.id,
    action: AUDIT_ACTIONS.COMMITTED,
    changedBy: user._id,
    newValue: { status: KPI_STATUS.COMMITMENT_SUBMITTED },
  });

  return assignment;
};

// ── approveCommitment — Manager approves employee's commitment ────────────────
const approveCommitment = async (id, user) => {
  const assignment = await KpiAssignment.findByPk(id);
  if (!assignment) throw new NotFoundError('KPI Assignment');

  if (!['admin', 'senior_manager'].includes(user.role) &&
      !(await isManagerOfEmployee(assignment, user._id))) {
    throw new ForbiddenError('You can only approve commitments for your team members');
  }

  if (assignment.status !== KPI_STATUS.COMMITMENT_SUBMITTED) {
    throw new ValidationError(
      `Commitment can only be approved when status is 'commitment_submitted'. Current: '${assignment.status}'`
    );
  }

  await assignment.update({ status: KPI_STATUS.COMMITMENT_APPROVED });

  await notificationService.create({
    recipient: assignment.employeeId,
    type: NOTIFICATION_TYPES.COMMITMENT_SUBMITTED, // reuse closest type
    title: 'Commitment Approved',
    message: `Your commitment for ${assignment.financialYear} Month ${assignment.month} has been approved. You may now proceed with your self-assessment.`,
    referenceType: 'kpi_assignment',
    referenceId: assignment.id,
  });

  await createAuditLog({
    entityType: 'kpi_assignment',
    entityId: assignment.id,
    action: 'commitment_approved',
    changedBy: user._id,
    newValue: { status: KPI_STATUS.COMMITMENT_APPROVED },
  });

  return assignment;
};

// ── rejectCommitment — Manager rejects employee's commitment ──────────────────
const rejectCommitment = async (id, rejectionComment, user) => {
  const assignment = await KpiAssignment.findByPk(id);
  if (!assignment) throw new NotFoundError('KPI Assignment');

  if (!['admin', 'senior_manager'].includes(user.role) &&
      !(await isManagerOfEmployee(assignment, user._id))) {
    throw new ForbiddenError('You can only reject commitments for your team members');
  }

  if (assignment.status !== KPI_STATUS.COMMITMENT_SUBMITTED) {
    throw new ValidationError(
      `Commitment can only be rejected when status is 'commitment_submitted'. Current: '${assignment.status}'`
    );
  }

  await assignment.update({
    status: KPI_STATUS.ASSIGNED,
    commitmentRejectionComment: rejectionComment || null,
    committedAt: null,
  });

  await notificationService.create({
    recipient: assignment.employeeId,
    type: NOTIFICATION_TYPES.COMMITMENT_SUBMITTED,
    title: 'Commitment Rejected — Please Resubmit',
    message: `Your commitment for ${assignment.financialYear} Month ${assignment.month} was rejected. ${rejectionComment ? `Reason: ${rejectionComment}` : 'Please revise and resubmit.'}`,
    referenceType: 'kpi_assignment',
    referenceId: assignment.id,
  });

  await createAuditLog({
    entityType: 'kpi_assignment',
    entityId: assignment.id,
    action: 'commitment_rejected',
    changedBy: user._id,
    newValue: { status: KPI_STATUS.ASSIGNED },
  });

  return assignment;
};

// ── reviewCommitmentItems — Manager approves/rejects each KPI item individually
const reviewCommitmentItems = async (id, itemsData, user) => {
  const assignment = await KpiAssignment.findByPk(id);
  if (!assignment) throw new NotFoundError('KPI Assignment');

  if (!['admin', 'senior_manager'].includes(user.role) &&
      !(await isManagerOfEmployee(assignment, user._id))) {
    throw new ForbiddenError('You can only review commitments for your team members');
  }

  if (assignment.status !== KPI_STATUS.COMMITMENT_SUBMITTED) {
    throw new ValidationError(
      `Commitment can only be reviewed when status is 'commitment_submitted'. Current: '${assignment.status}'`
    );
  }

  // Save per-item decisions
  for (const itemData of itemsData) {
    const item = await KpiItem.findOne({
      where: { id: itemData.id, kpiAssignmentId: id },
    });
    if (!item) continue;
    await item.update({
      managerCommitmentApproval: itemData.approval,
      managerCommitmentComment: itemData.comment || null,
    });
  }

  // Re-fetch all items to determine overall outcome
  const allItems = await KpiItem.findAll({ where: { kpiAssignmentId: id } });
  const anyRejected = allItems.some((i) => i.managerCommitmentApproval === 'rejected');
  const allDecided = allItems.every((i) => i.managerCommitmentApproval !== null);

  let newStatus;
  if (anyRejected) {
    // Build rejection summary from rejected items
    const rejectedTitles = allItems
      .filter((i) => i.managerCommitmentApproval === 'rejected')
      .map((i) => i.title)
      .join(', ');
    const overallComment = itemsData
      .filter((d) => d.approval === 'rejected' && d.comment)
      .map((d) => d.comment)
      .join('; ') || null;

    await assignment.update({
      status: KPI_STATUS.ASSIGNED,
      commitmentRejectionComment: overallComment || `Items rejected: ${rejectedTitles}`,
      committedAt: null,
    });
    newStatus = KPI_STATUS.ASSIGNED;

    await notificationService.create({
      recipient: assignment.employeeId,
      type: NOTIFICATION_TYPES.COMMITMENT_SUBMITTED,
      title: 'Commitment Partially Rejected — Please Resubmit',
      message: `Your commitment for ${assignment.financialYear} Month ${assignment.month} has items that were rejected by your manager. Please revise and resubmit.`,
      referenceType: 'kpi_assignment',
      referenceId: assignment.id,
    });
  } else if (allDecided) {
    // All items approved
    await assignment.update({ status: KPI_STATUS.COMMITMENT_APPROVED });
    newStatus = KPI_STATUS.COMMITMENT_APPROVED;

    await notificationService.create({
      recipient: assignment.employeeId,
      type: NOTIFICATION_TYPES.COMMITMENT_SUBMITTED,
      title: 'Commitment Approved',
      message: `All KPIs in your commitment for ${assignment.financialYear} Month ${assignment.month} have been approved. You may now proceed with your self-assessment.`,
      referenceType: 'kpi_assignment',
      referenceId: assignment.id,
    });
  } else {
    // Partial review — some items still pending, keep current status
    newStatus = KPI_STATUS.COMMITMENT_SUBMITTED;
  }

  await createAuditLog({
    entityType: 'kpi_assignment',
    entityId: assignment.id,
    action: anyRejected ? 'commitment_rejected' : allDecided ? 'commitment_approved' : 'commitment_partial_review',
    changedBy: user._id,
    newValue: { status: newStatus, itemDecisions: itemsData.map((d) => ({ id: d.id, approval: d.approval })) },
  });

  return assignment;
};

// ── saveDraft — saves commitment or self-review fields without changing status ─
const saveDraft = async (id, itemsData, user) => {
  const assignment = await KpiAssignment.findByPk(id);
  if (!assignment) throw new NotFoundError('KPI Assignment');

  if (user.role === 'employee' && String(assignment.employeeId) !== String(user._id)) {
    throw new ForbiddenError('You can only save drafts for your own assignments');
  }

  const isCommitPhase = assignment.status === KPI_STATUS.ASSIGNED;
  const isSelfReviewPhase = assignment.status === KPI_STATUS.COMMITMENT_APPROVED;
  const isManagerReviewPhase = assignment.status === KPI_STATUS.EMPLOYEE_SUBMITTED;

  if (!isCommitPhase && !isSelfReviewPhase && !isManagerReviewPhase) {
    throw new ValidationError(`Draft save is only allowed in 'assigned', 'commitment_approved', or 'employee_submitted' status. Current: '${assignment.status}'`);
  }

  // Manager review phase — check manager authorization
  if (isManagerReviewPhase) {
    if (!['admin', 'senior_manager'].includes(user.role) &&
        !(await isManagerOfEmployee(assignment, user._id))) {
      throw new ForbiddenError('You can only save drafts for your team assignments');
    }
  } else if (user.role === 'employee') {
    if (String(assignment.employeeId) !== String(user._id)) {
      throw new ForbiddenError('You can only save drafts for your own assignments');
    }
  }

  for (const item of itemsData) {
    let fields;
    if (isCommitPhase) {
      fields = { commitValue: item.commitValue != null ? String(item.commitValue) : null, employeeCommitmentComment: item.employeeCommitmentComment || null };
    } else if (isSelfReviewPhase) {
      fields = { employeeStatus: item.employeeStatus || null, employeeComment: item.employeeComment || null };
    } else {
      fields = { managerStatus: item.managerStatus || null, managerComment: item.managerComment || null };
    }
    await KpiItem.update(fields, { where: { id: item.id, kpiAssignmentId: id } });
  }

  return assignment;
};

const employeeSubmit = async (id, itemsData, file, user) => {
  const assignment = await KpiAssignment.findByPk(id);
  if (!assignment) throw new NotFoundError('KPI Assignment');

  if (user.role === 'employee' && String(assignment.employeeId) !== String(user._id)) {
    throw new ForbiddenError('You can only submit for your own assignments');
  }

  // Achievement (self-assessment) only allowed after manager approves the commitment (not re-submit after EMPLOYEE_SUBMITTED)
  if (![KPI_STATUS.COMMITMENT_APPROVED].includes(assignment.status)) {
    throw new ValidationError(
      `Self-assessment can only be submitted after your commitment is approved by your manager. Current status: '${assignment.status}'.`
    );
  }

  const now = new Date();
  for (const item of itemsData) {
    await KpiItem.update(
      {
        employeeStatus: item.employeeStatus,
        employeeComment: item.employeeComment || null,
        employeeSubmittedAt: now,
        itemStatus: KPI_STATUS.EMPLOYEE_SUBMITTED,
      },
      { where: { id: item.id, kpiAssignmentId: id } }
    );
  }

  assignment.status = KPI_STATUS.EMPLOYEE_SUBMITTED;
  assignment.employeeSubmittedAt = now;
  if (file) {
    assignment.employeeAttachmentBlob = file.buffer;
    assignment.employeeAttachmentName = file.originalname;
    assignment.employeeAttachmentMime = file.mimetype;
  }
  await assignment.save();

  await notificationService.create({
    recipient: assignment.managerId,
    type: NOTIFICATION_TYPES.EMPLOYEE_SUBMITTED,
    title: 'Employee Submitted Achievement',
    message: `Employee has submitted achievement for ${assignment.financialYear} Month ${assignment.month}.`,
    referenceType: 'kpi_assignment',
    referenceId: assignment.id,
  });

  await createAuditLog({
    entityType: 'kpi_assignment',
    entityId: assignment.id,
    action: AUDIT_ACTIONS.SUBMITTED,
    changedBy: user._id,
    newValue: { status: KPI_STATUS.EMPLOYEE_SUBMITTED },
  });

  return assignment;
};

const managerReview = async (id, itemsData, file, user) => {
  const assignment = await KpiAssignment.findByPk(id);
  if (!assignment) throw new NotFoundError('KPI Assignment');

  if (!['admin', 'senior_manager'].includes(user.role) &&
      !(await isManagerOfEmployee(assignment, user._id))) {
    throw new ForbiddenError('You can only review your team assignments');
  }

  validateTransition(assignment.status, KPI_STATUS.MANAGER_REVIEWED);

  const now = new Date();
  for (const item of itemsData) {
    const numeric = statusToNumeric(item.managerStatus);
    await KpiItem.update(
      {
        managerStatus: item.managerStatus,
        managerMonthlyNumeric: numeric,
        managerComment: item.managerComment || '',
        managerReviewedAt: now,
        itemStatus: KPI_STATUS.MANAGER_REVIEWED,
      },
      { where: { id: item.id, kpiAssignmentId: id } }
    );
  }

  assignment.status = KPI_STATUS.MANAGER_REVIEWED;
  assignment.managerReviewedAt = now;
  if (file) {
    assignment.managerAttachmentBlob = file.buffer;
    assignment.managerAttachmentName = file.originalname;
    assignment.managerAttachmentMime = file.mimetype;
  }
  await assignment.save();

  // Notify final approvers in the employee's department
  const employee = await User.findByPk(assignment.employeeId, { attributes: ['departmentId'] });
  const finalApprovers = await User.findAll({
    where: { role: 'final_approver', departmentId: employee?.departmentId, isActive: true },
    attributes: ['id'],
  });
  for (const fa of finalApprovers) {
    await notificationService.create({
      recipient: fa.id,
      type: 'manager_reviewed',
      title: 'Manager Review Complete',
      message: `Manager review completed for ${assignment.financialYear} Month ${assignment.month}. Ready for quarterly approval.`,
      referenceType: 'kpi_assignment',
      referenceId: assignment.id,
    });
  }

  await createAuditLog({
    entityType: 'kpi_assignment',
    entityId: assignment.id,
    action: AUDIT_ACTIONS.REVIEWED,
    changedBy: user._id,
    newValue: { status: KPI_STATUS.MANAGER_REVIEWED },
  });

  return assignment;
};

// finalReview is REMOVED — replaced by finalApprover.service.submitQuarterlyApproval
// Kept as a no-op stub so existing controller import does not crash
const finalReview = async () => {
  throw new ValidationError(
    'Direct final review is no longer supported. Use the Final Approver quarterly approval workflow via /api/final-approver.'
  );
};

const lockAssignment = async (id, user) => {
  const assignment = await KpiAssignment.findByPk(id);
  if (!assignment) throw new NotFoundError('KPI Assignment');

  // Allow both final_approved (new) and final_reviewed (legacy) to be locked
  if (![KPI_STATUS.FINAL_APPROVED, KPI_STATUS.FINAL_REVIEWED].includes(assignment.status)) {
    throw new ValidationError(
      `Assignment must be in 'final_approved' status before locking. Current status: '${assignment.status}'`
    );
  }

  assignment.status = KPI_STATUS.LOCKED;
  assignment.isLocked = true;
  assignment.lockedAt = new Date();
  assignment.lockedById = user._id;
  await assignment.save();

  await notificationService.create({
    recipient: assignment.employeeId,
    type: 'record_locked',
    title: 'KPI Record Locked',
    message: `Your KPI record for ${assignment.financialYear} Month ${assignment.month} has been finalized and locked.`,
    referenceType: 'kpi_assignment',
    referenceId: assignment.id,
  });

  await createAuditLog({
    entityType: 'kpi_assignment',
    entityId: assignment.id,
    action: 'locked',
    changedBy: user._id,
  });

  return assignment;
};

const unlockAssignment = async (id, user) => {
  const assignment = await KpiAssignment.findByPk(id);
  if (!assignment) throw new NotFoundError('KPI Assignment');

  if (assignment.status !== KPI_STATUS.LOCKED) {
    throw new ValidationError('Only locked assignments can be unlocked');
  }

  assignment.status = KPI_STATUS.FINAL_APPROVED;
  assignment.isLocked = false;
  assignment.lockedAt = null;
  assignment.lockedById = null;
  await assignment.save();

  await createAuditLog({
    entityType: 'kpi_assignment',
    entityId: assignment.id,
    action: AUDIT_ACTIONS.UNLOCKED,
    changedBy: user._id,
  });

  return assignment;
};

const reopenAssignment = async (id, targetStatus, user) => {
  const assignment = await KpiAssignment.findByPk(id);
  if (!assignment) throw new NotFoundError('KPI Assignment');

  if (!REOPEN_ALLOWED_FROM.includes(assignment.status)) {
    throw new ValidationError(
      `Cannot reopen from '${assignment.status}'. Allowed from: ${REOPEN_ALLOWED_FROM.join(', ')}.`
    );
  }
  if (!REOPEN_ALLOWED_TO.includes(targetStatus)) {
    throw new ValidationError(
      `Invalid reopen target status '${targetStatus}'. Allowed: ${REOPEN_ALLOWED_TO.join(', ')}.`
    );
  }

  const oldStatus = assignment.status;
  assignment.status = targetStatus;
  assignment.isLocked = false;
  assignment.lockedAt = null;
  assignment.lockedById = null;

  if (targetStatus === KPI_STATUS.ASSIGNED) {
    // Full reset — clear all submission data (legacy + new fields)
    await KpiItem.update(
      {
        // Legacy fields
        employeeValue: null, employeeAttachment: null, employeeSubmittedAt: null,
        managerValue: null, managerScore: null, managerReviewedAt: null,
        finalValue: null, finalScore: null, finalComment: null, finalReviewedAt: null,
        // New fields
        commitValue: null,
        employeeCommitmentStatus: null, employeeCommitmentComment: null, committedAt: null,
        employeeStatus: null, employeeComment: null,
        managerStatus: null, managerComment: null, managerMonthlyNumeric: null,
        finalApproverStatus: null, finalApproverValue: null, finalApproverAchievedWeightage: null,
        finalApproverComment: null, finalApprovedAt: null, finalApprovedById: null,
        itemStatus: KPI_STATUS.ASSIGNED,
      },
      { where: { kpiAssignmentId: id } }
    );
    assignment.committedAt = null;
    assignment.employeeSubmittedAt = null;
    assignment.managerReviewedAt = null;
    assignment.finalReviewedAt = null;
    assignment.finalApprovedAt = null;
    assignment.monthlyWeightedScore = null;
    assignment.employeeAttachmentBlob = null;
    assignment.employeeAttachmentName = null;
    assignment.employeeAttachmentMime = null;
    assignment.managerAttachmentBlob = null;
    assignment.managerAttachmentName = null;
    assignment.managerAttachmentMime = null;
  } else if (targetStatus === KPI_STATUS.COMMITMENT_SUBMITTED) {
    // Reset achievement and manager data, keep commitment intact
    await KpiItem.update(
      {
        // Legacy fields
        employeeValue: null, employeeAttachment: null, employeeSubmittedAt: null,
        managerValue: null, managerScore: null, managerReviewedAt: null,
        finalValue: null, finalScore: null, finalComment: null, finalReviewedAt: null,
        // New fields (keep commitment, clear rest)
        employeeStatus: null, employeeComment: null,
        managerStatus: null, managerComment: null, managerMonthlyNumeric: null,
        finalApproverStatus: null, finalApproverValue: null, finalApproverAchievedWeightage: null,
        finalApproverComment: null, finalApprovedAt: null, finalApprovedById: null,
        itemStatus: KPI_STATUS.COMMITMENT_SUBMITTED,
      },
      { where: { kpiAssignmentId: id } }
    );
    assignment.employeeSubmittedAt = null;
    assignment.managerReviewedAt = null;
    assignment.finalReviewedAt = null;
    assignment.finalApprovedAt = null;
    assignment.monthlyWeightedScore = null;
    assignment.employeeAttachmentBlob = null;
    assignment.employeeAttachmentName = null;
    assignment.employeeAttachmentMime = null;
    assignment.managerAttachmentBlob = null;
    assignment.managerAttachmentName = null;
    assignment.managerAttachmentMime = null;
  } else if (targetStatus === KPI_STATUS.EMPLOYEE_SUBMITTED) {
    // Reset manager and final approver data
    await KpiItem.update(
      {
        // Legacy fields
        managerValue: null, managerScore: null, managerReviewedAt: null,
        finalValue: null, finalScore: null, finalComment: null, finalReviewedAt: null,
        // New fields
        managerStatus: null, managerComment: null, managerMonthlyNumeric: null,
        finalApproverStatus: null, finalApproverValue: null, finalApproverAchievedWeightage: null,
        finalApproverComment: null, finalApprovedAt: null, finalApprovedById: null,
        itemStatus: KPI_STATUS.EMPLOYEE_SUBMITTED,
      },
      { where: { kpiAssignmentId: id } }
    );
    assignment.managerReviewedAt = null;
    assignment.finalReviewedAt = null;
    assignment.finalApprovedAt = null;
    assignment.monthlyWeightedScore = null;
    assignment.managerAttachmentBlob = null;
    assignment.managerAttachmentName = null;
    assignment.managerAttachmentMime = null;
  } else if (targetStatus === KPI_STATUS.MANAGER_REVIEWED) {
    // Reset only final approver data
    await KpiItem.update(
      {
        // Legacy fields
        finalValue: null, finalScore: null, finalComment: null, finalReviewedAt: null,
        // New fields
        finalApproverStatus: null, finalApproverValue: null, finalApproverAchievedWeightage: null,
        finalApproverComment: null, finalApprovedAt: null, finalApprovedById: null,
        itemStatus: KPI_STATUS.MANAGER_REVIEWED,
      },
      { where: { kpiAssignmentId: id } }
    );
    assignment.finalReviewedAt = null;
    assignment.finalApprovedAt = null;
    assignment.monthlyWeightedScore = null;
  } else if (targetStatus === KPI_STATUS.FINAL_APPROVED) {
    // Unlock from locked — no data to clear
    // QuarterlyApproval remains intact (admin is reverting the lock, not the approval)
  }

  await assignment.save();

  await notificationService.create({
    recipient: assignment.employeeId,
    type: 'record_unlocked',
    title: 'Assessment Reopened',
    message: `Your KPI assessment for ${assignment.financialYear} Month ${assignment.month} has been reopened to "${targetStatus.replace(/_/g, ' ')}" stage.`,
    referenceType: 'kpi_assignment',
    referenceId: assignment.id,
  });

  await createAuditLog({
    entityType: 'kpi_assignment',
    entityId: assignment.id,
    action: 'reopened',
    changedBy: user._id,
    oldValue: { status: oldStatus },
    newValue: { status: targetStatus },
  });

  return assignment;
};

function validateTransition(currentStatus, targetStatus) {
  // Allow idempotent resubmissions (employee can re-commit or re-submit achievement)
  if (currentStatus === targetStatus &&
    [KPI_STATUS.COMMITMENT_SUBMITTED, KPI_STATUS.EMPLOYEE_SUBMITTED].includes(currentStatus)) {
    return;
  }
  const allowed = STATUS_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(targetStatus)) {
    throw new ValidationError(`Cannot transition from '${currentStatus}' to '${targetStatus}'`);
  }
}

function itemPlain(item) {
  const obj = item.get ? item.get({ plain: true }) : item;
  obj.calculatedResult = computeItemAverage(obj);
  return obj;
}

const getTeamOverview = async (managerId, query = {}) => {
  // Admin/manager viewing a specific employee directly by employeeId
  if (query.employeeId) {
    const employee = await User.findByPk(query.employeeId, {
      attributes: ['id', 'name', 'employeeCode', 'email', 'designation', 'departmentId', 'kpiReviewApplicable'],
      include: [{ model: Department, as: 'department', attributes: ['id', 'name', 'code'] }],
    });
    if (!employee) return [];
    const filter = { employeeId: query.employeeId };
    if (query.financialYear) filter.financialYear = query.financialYear;
    if (query.month) filter.month = Number(query.month);
    const assignment = await KpiAssignment.findOne({ where: filter });
    if (assignment) {
      const items = await KpiItem.findAll({
        where: { kpiAssignmentId: assignment.id },
        order: [['createdAt', 'ASC']],
      });
      const maskedItems = maskDraftFields(items.map((item) => itemPlain(item)), assignment.status, false);
      return [{ employee: employee.get({ plain: true }), assignment: withCurrentManager(assignment), items: maskedItems }];
    }
    return [{ employee: employee.get({ plain: true }), assignment: null, items: [] }];
  }

  const teamMembers = await User.findAll({
    where: { managerId, isActive: true },
    attributes: ['id', 'name', 'employeeCode', 'email', 'designation', 'departmentId', 'kpiReviewApplicable'],
    include: [{ model: Department, as: 'department', attributes: ['id', 'name', 'code'] }],
    order: [['name', 'ASC']],
  });

  const teamIds = teamMembers.map((m) => m.id);
  const filter = { employeeId: { [Op.in]: teamIds } };
  if (query.financialYear) filter.financialYear = query.financialYear;
  if (query.month) filter.month = Number(query.month);

  const assignments = await KpiAssignment.findAll({
    where: filter,
    include: [employeeWithDept],
  });

  const assignmentMap = {};
  for (const a of assignments) {
    assignmentMap[a.employeeId] = a;
  }

  const results = [];
  for (const member of teamMembers) {
    const assignment = assignmentMap[member.id] || null;
    if (assignment) {
      const items = await KpiItem.findAll({
        where: { kpiAssignmentId: assignment.id },
        order: [['createdAt', 'ASC']],
      });
      const itemsWithAvg = maskDraftFields(items.map((item) => itemPlain(item)), assignment.status, false);
      results.push({ employee: member, assignment: withCurrentManager(assignment), items: itemsWithAvg });
    } else {
      results.push({ employee: member, assignment: null, items: [] });
    }
  }

  return results;
};

const getAdminOverview = async (query = {}) => {
  const where = {};
  if (query.financialYear) where.financialYear = query.financialYear;
  if (query.month) where.month = Number(query.month);
  if (query.status) where.status = query.status;
  if (query.department) {
    const emps = await User.findAll({
      where: { departmentId: query.department },
      attributes: ['id'],
    });
    where.employeeId = { [Op.in]: emps.map((e) => e.id) };
  }

  const assignments = await KpiAssignment.findAll({
    where,
    include: [employeeWithDept, managerShort],
    order: [['createdAt', 'DESC']],
  });

  const results = [];
  for (const assignment of assignments) {
    const assignmentPlain = withCurrentManager(assignment);

    const items = await KpiItem.findAll({
      where: { kpiAssignmentId: assignmentPlain.id },
      order: [['createdAt', 'ASC']],
    });
    const itemsWithAvg = maskDraftFields(items.map((item) => itemPlain(item)), assignment.status, false);

    const avgScores = itemsWithAvg
      .filter((i) => i.calculatedResult != null)
      .map((i) => i.calculatedResult * (Number(i.weightage) / 100));
    const totalWeight = itemsWithAvg
      .filter((i) => i.calculatedResult != null)
      .reduce((s, i) => s + Number(i.weightage), 0);
    const overallAvg =
      totalWeight > 0
        ? Math.round((avgScores.reduce((s, v) => s + v, 0) / totalWeight) * 100 * 100) / 100
        : null;

    results.push({
      assignment: assignmentPlain,
      items: itemsWithAvg,
      overallAverageScore: overallAvg,
    });
  }

  return results;
};

function computeItemAverage(item) {
  const values = [];
  if (item.employeeValue != null) values.push(Number(item.employeeValue));
  if (item.managerValue != null) values.push(Number(item.managerValue));
  if (item.finalValue != null) values.push(Number(item.finalValue));
  if (values.length === 0) return null;
  return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 100) / 100;
}

const cloneKpis = async (data, user) => {
  const { sourceAssignmentId, targetEmployeeId, targetMonth, targetFinancialYear } = data;

  const sourceAssignment = await KpiAssignment.findByPk(sourceAssignmentId);
  if (!sourceAssignment) throw new NotFoundError('Source KPI Assignment');

  const sourceItems = await KpiItem.findAll({
    where: { kpiAssignmentId: sourceAssignmentId },
    order: [['createdAt', 'ASC']],
  });
  if (sourceItems.length === 0) throw new ValidationError('Source assignment has no KPI items to clone');

  const quarter = getQuarterFromMonth(Number(targetMonth));

  const targetEmployee = await User.findByPk(targetEmployeeId);
  if (!targetEmployee) throw new NotFoundError('Target Employee');
  if (!targetEmployee.kpiReviewApplicable) throw new ValidationError('KPI review is not applicable for target employee');
  if (user.role !== 'admin') {
    if (!targetEmployee.managerId || String(targetEmployee.managerId) !== String(user._id)) {
      throw new ForbiddenError('You can only clone KPIs for employees in your current team');
    }
  }

  let targetAssignment = await KpiAssignment.findOne({
    where: {
      employeeId: targetEmployeeId,
      financialYear: targetFinancialYear,
      month: Number(targetMonth),
    },
  });

  if (targetAssignment && targetAssignment.status !== KPI_STATUS.DRAFT) {
    throw new ValidationError(
      `Target assignment for this employee/month already exists with status '${targetAssignment.status}'. Can only clone into draft assignments.`
    );
  }

  if (!targetAssignment) {
    targetAssignment = await KpiAssignment.create({
      financialYear: targetFinancialYear,
      month: Number(targetMonth),
      quarter,
      employeeId: targetEmployeeId,
      managerId: user.role === 'admin' ? targetEmployee.managerId || user._id : user._id,
      createdById: user._id,
      status: KPI_STATUS.DRAFT,
    });
  }

  const clonedPayload = sourceItems.map((item) => {
    const p = item.get({ plain: true });
    return {
      kpiAssignmentId: targetAssignment.id,
      title: p.title,
      description: p.description,
      category: p.category,
      unit: p.unit,
      weightage: p.weightage,
      targetValue: p.targetValue,
      thresholdValue: p.thresholdValue,
      stretchTarget: p.stretchTarget,
      remarks: p.remarks,
      itemStatus: 'draft',
    };
  });

  await KpiItem.bulkCreate(clonedPayload);

  const totalWeightage = clonedPayload.reduce((sum, i) => sum + (Number(i.weightage) || 0), 0);
  targetAssignment.totalWeightage = totalWeightage;
  await targetAssignment.save();

  await createAuditLog({
    entityType: 'kpi_assignment',
    entityId: targetAssignment.id,
    action: 'created',
    changedBy: user._id,
    newValue: {
      clonedFrom: sourceAssignmentId,
      employee: targetEmployeeId,
      month: targetMonth,
      financialYear: targetFinancialYear,
      itemsCloned: clonedPayload.length,
    },
  });

  return targetAssignment;
};

const bulkCloneKpis = async (data, user) => {
  const { sourceAssignmentId, targetEmployeeIds, targetMonth, targetFinancialYear } = data;

  const results = { success: [], failed: [] };

  const applicableEmployees = await User.findAll({
    where: { id: { [Op.in]: targetEmployeeIds }, kpiReviewApplicable: true },
    attributes: ['id'],
  });
  const applicableIds = new Set(applicableEmployees.map((e) => String(e.id)));

  for (const empId of targetEmployeeIds) {
    if (!applicableIds.has(String(empId))) {
      results.failed.push({ employeeId: empId, error: 'KPI review is not applicable for this employee' });
      continue;
    }
    try {
      const assignment = await cloneKpis(
        { sourceAssignmentId, targetEmployeeId: empId, targetMonth, targetFinancialYear },
        user
      );
      results.success.push({ employeeId: empId, assignmentId: assignment.id });
    } catch (err) {
      results.failed.push({ employeeId: empId, error: err.message });
    }
  }

  return results;
};

const bulkImportFromExcel = async (buffer, financialYear, month, user) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.getWorksheet(1);
  if (!worksheet) {
    throw new ValidationError('Excel file has no worksheets');
  }

  const success = [];
  const errors = [];

  const headerRow = worksheet.getRow(1);
  const headers = {};
  headerRow.eachCell((cell, colNumber) => {
    const val = String(cell.value || '').trim().toLowerCase();
    headers[val] = colNumber;
  });

  const requiredHeaders = ['employee code', 'kpi title', 'weightage', 'target value'];
  for (const h of requiredHeaders) {
    if (!headers[h]) {
      throw new ValidationError(
        `Missing required column: "${h}". Expected columns: Employee Code, KPI Title, Description, Category, Unit, Weightage, Target Value, Threshold Value, Stretch Target, Remarks`
      );
    }
  }

  const quarter = getQuarterFromMonth(Number(month));

  const employeeCache = {};
  const assignmentCache = {};

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);

    const employeeCode = String(row.getCell(headers['employee code']).value || '').trim().toUpperCase();
    const kpiTitle = String(row.getCell(headers['kpi title']).value || '').trim();

    if (!employeeCode || !kpiTitle) {
      if (employeeCode || kpiTitle) {
        errors.push({ row: rowNumber, message: 'Employee Code and KPI Title are required' });
      }
      continue;
    }

    try {
      let employee = employeeCache[employeeCode];
      if (!employee) {
        employee = await User.findOne({ where: { employeeCode, isActive: true } });
        if (!employee) {
          errors.push({ row: rowNumber, employeeCode, message: `Employee not found: ${employeeCode}` });
          continue;
        }
        employeeCache[employeeCode] = employee;
      }

      if (!employee.kpiReviewApplicable) {
        errors.push({ row: rowNumber, employeeCode, message: 'KPI review not applicable for this employee' });
        continue;
      }

      if (user.role !== 'admin') {
        if (!employee.managerId || String(employee.managerId) !== String(user._id)) {
          errors.push({ row: rowNumber, employeeCode, message: `Employee ${employeeCode} is not in your team` });
          continue;
        }
      }

      const description = headers['description']
        ? String(row.getCell(headers['description']).value || '').trim()
        : '';
      const category = headers['category'] ? String(row.getCell(headers['category']).value || '').trim() : 'Other';
      const unit = headers['unit'] ? String(row.getCell(headers['unit']).value || '').trim() : 'Number';
      const weightage = Number(row.getCell(headers['weightage']).value);
      const targetValue = Number(row.getCell(headers['target value']).value);
      const thresholdValue = headers['threshold value'] ? row.getCell(headers['threshold value']).value : null;
      const stretchTarget = headers['stretch target'] ? row.getCell(headers['stretch target']).value : null;
      const remarks = headers['remarks'] ? String(row.getCell(headers['remarks']).value || '').trim() : '';

      if (isNaN(weightage) || weightage < 1 || weightage > 100) {
        errors.push({ row: rowNumber, employeeCode, message: 'Weightage must be between 1 and 100' });
        continue;
      }
      if (isNaN(targetValue)) {
        errors.push({ row: rowNumber, employeeCode, message: 'Target Value must be a number' });
        continue;
      }
      if (category && !KPI_CATEGORIES.includes(category)) {
        errors.push({
          row: rowNumber,
          employeeCode,
          message: `Invalid category "${category}". Must be one of: ${KPI_CATEGORIES.join(', ')}`,
        });
        continue;
      }
      if (unit && !KPI_UNITS.includes(unit)) {
        errors.push({
          row: rowNumber,
          employeeCode,
          message: `Invalid unit "${unit}". Must be one of: ${KPI_UNITS.join(', ')}`,
        });
        continue;
      }

      const cacheKey = `${employee.id}_${financialYear}_${month}`;
      let assignment = assignmentCache[cacheKey];
      if (!assignment) {
        assignment = await KpiAssignment.findOne({
          where: { employeeId: employee.id, financialYear, month: Number(month) },
        });

        if (assignment && !['draft', 'assigned'].includes(assignment.status)) {
          errors.push({
            row: rowNumber,
            employeeCode,
            message: `Assignment for ${employeeCode} already exists with status "${assignment.status}" — cannot add items`,
          });
          continue;
        }

        if (!assignment) {
          assignment = await KpiAssignment.create({
            financialYear,
            month: Number(month),
            quarter,
            employeeId: employee.id,
            managerId: user.role === 'admin' ? employee.managerId || user._id : user._id,
            createdById: user._id,
            status: KPI_STATUS.DRAFT,
          });
        }
        assignmentCache[cacheKey] = assignment;
      }

      const kpiItem = await KpiItem.create({
        kpiAssignmentId: assignment.id,
        title: kpiTitle,
        description,
        category: category || 'Other',
        unit: unit || 'Number',
        weightage,
        targetValue,
        thresholdValue:
          thresholdValue != null && !isNaN(Number(thresholdValue)) ? Number(thresholdValue) : null,
        stretchTarget: stretchTarget != null && !isNaN(Number(stretchTarget)) ? Number(stretchTarget) : null,
        remarks,
        itemStatus: assignment.status === 'assigned' ? 'assigned' : 'draft',
      });

      const allItems = await KpiItem.findAll({ where: { kpiAssignmentId: assignment.id } });
      assignment.totalWeightage = allItems.reduce((sum, i) => sum + Number(i.weightage || 0), 0);
      await assignment.save();
      assignmentCache[cacheKey] = assignment;

      success.push({
        row: rowNumber,
        employeeCode,
        employeeName: employee.name,
        kpiTitle,
        assignmentId: assignment.id,
        itemId: kpiItem.id,
      });
    } catch (err) {
      errors.push({ row: rowNumber, employeeCode, message: err.message });
    }
  }

  return { success, errors };
};

const generateImportTemplate = async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PLI Portal';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('KPI Import');

  worksheet.columns = [
    { header: 'Employee Code', key: 'employeeCode', width: 18 },
    { header: 'KPI Title', key: 'kpiTitle', width: 30 },
    { header: 'Description', key: 'description', width: 40 },
    { header: 'Category', key: 'category', width: 15 },
    { header: 'Unit', key: 'unit', width: 12 },
    { header: 'Weightage', key: 'weightage', width: 12 },
    { header: 'Target Value', key: 'targetValue', width: 14 },
    { header: 'Threshold Value', key: 'thresholdValue', width: 16 },
    { header: 'Stretch Target', key: 'stretchTarget', width: 16 },
    { header: 'Remarks', key: 'remarks', width: 30 },
  ];

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E40AF' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

  worksheet.addRow({
    employeeCode: 'EMP001',
    kpiTitle: 'Revenue Target Achievement',
    description: 'Achieve monthly revenue targets as per business plan',
    category: 'Financial',
    unit: 'Percentage',
    weightage: 30,
    targetValue: 100,
    thresholdValue: 80,
    stretchTarget: 120,
    remarks: 'Based on monthly billing data',
  });
  worksheet.addRow({
    employeeCode: 'EMP001',
    kpiTitle: 'Customer Satisfaction Score',
    description: 'Maintain high customer satisfaction ratings',
    category: 'Quality',
    unit: 'Rating',
    weightage: 20,
    targetValue: 4.5,
    thresholdValue: 3.5,
    stretchTarget: 5,
    remarks: 'From quarterly survey',
  });
  worksheet.addRow({
    employeeCode: 'EMP002',
    kpiTitle: 'Project Delivery On-Time',
    description: 'Deliver assigned projects within deadline',
    category: 'Operational',
    unit: 'Percentage',
    weightage: 40,
    targetValue: 95,
    thresholdValue: 85,
    stretchTarget: 100,
    remarks: '',
  });

  worksheet.dataValidations.add('D2:D1000', {
    type: 'list',
    allowBlank: true,
    formulae: [`"${KPI_CATEGORIES.join(',')}"`],
    showErrorMessage: true,
    errorTitle: 'Invalid Category',
    error: `Must be one of: ${KPI_CATEGORIES.join(', ')}`,
  });

  worksheet.dataValidations.add('E2:E1000', {
    type: 'list',
    allowBlank: true,
    formulae: [`"${KPI_UNITS.join(',')}"`],
    showErrorMessage: true,
    errorTitle: 'Invalid Unit',
    error: `Must be one of: ${KPI_UNITS.join(', ')}`,
  });

  const instrSheet = workbook.addWorksheet('Instructions');
  instrSheet.columns = [{ header: '', key: 'text', width: 80 }];
  const instructions = [
    'KPI Bulk Import Template - Instructions',
    '',
    'Required Columns (marked with *):',
    '  * Employee Code - The employee code (e.g., EMP001). Must match an existing employee in your team.',
    '  * KPI Title - The name/title of the KPI metric.',
    '  * Weightage - Percentage weight (1-100). Total per employee should sum to 100.',
    '  * Target Value - The target value for this KPI.',
    '',
    'Optional Columns:',
    '  Description - Detailed description of the KPI.',
    `  Category - One of: ${KPI_CATEGORIES.join(', ')}. Defaults to "Other".`,
    `  Unit - One of: ${KPI_UNITS.join(', ')}. Defaults to "Number".`,
    '  Threshold Value - Minimum acceptable value.',
    '  Stretch Target - Aspirational target beyond the base target.',
    '  Remarks - Additional notes or instructions.',
    '',
    'Notes:',
    '  - You can define multiple KPIs per employee (one row per KPI).',
    '  - If an assignment already exists in "draft" or "assigned" status, new items will be added.',
    '  - Assignments in other statuses cannot be modified via import.',
    '  - Empty rows are skipped.',
  ];
  instructions.forEach((line) => instrSheet.addRow({ text: line }));
  instrSheet.getRow(1).font = { bold: true, size: 14 };

  return workbook;
};

module.exports = {
  getAssignments,
  getAssignmentById,
  createAssignment,
  updateAssignment,
  assignToEmployee,
  commitKpi,
  approveCommitment,
  rejectCommitment,
  reviewCommitmentItems,
  saveDraft,
  employeeSubmit,
  managerReview,
  finalReview,
  lockAssignment,
  unlockAssignment,
  reopenAssignment,
  getTeamOverview,
  getAdminOverview,
  cloneKpis,
  bulkCloneKpis,
  bulkImportFromExcel,
  generateImportTemplate,
};
