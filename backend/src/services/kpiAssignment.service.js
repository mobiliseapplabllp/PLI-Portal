const ExcelJS = require('exceljs');
const KpiAssignment = require('../models/KpiAssignment');
const KpiItem = require('../models/KpiItem');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors');
const { getQuarterFromMonth } = require('../utils/quarterHelper');
const { calculateMonthlyScore } = require('../utils/scoreCalculator');
const { createAuditLog } = require('../middleware/auditLogger');
const { KPI_STATUS, STATUS_TRANSITIONS, REOPEN_ALLOWED_FROM, REOPEN_ALLOWED_TO, KPI_CATEGORIES, KPI_UNITS } = require('../config/constants');
const User = require('../models/User');
const notificationService = require('./notification.service');

const getAssignments = async (query = {}, user) => {
  const filter = {};
  if (query.financialYear) filter.financialYear = query.financialYear;
  if (query.month) filter.month = Number(query.month);
  if (query.quarter) filter.quarter = query.quarter;
  if (query.status) filter.status = query.status;
  if (query.employee) filter.employee = query.employee;
  if (query.manager) filter.manager = query.manager;

  // Role-based filtering
  if (user.role === 'employee') {
    filter.employee = user._id;
  } else if (user.role === 'manager') {
    if (!query.employee) filter.manager = user._id;
  }
  // admin sees all

  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;

  const total = await KpiAssignment.countDocuments(filter);
  const assignments = await KpiAssignment.find(filter)
    .populate('employee', 'name employeeCode email department')
    .populate('manager', 'name employeeCode')
    .sort({ financialYear: -1, month: -1, createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  return {
    assignments,
    pagination: { total, page, limit, pages: Math.ceil(total / limit) },
  };
};

const getAssignmentById = async (id, user) => {
  const assignment = await KpiAssignment.findById(id)
    .populate('employee', 'name employeeCode email department')
    .populate('manager', 'name employeeCode email');

  if (!assignment) throw new NotFoundError('KPI Assignment');

  // Access control
  const isOwnAssignment = assignment.employee._id.toString() === user._id.toString();
  const isTeamAssignment = assignment.manager._id.toString() === user._id.toString();

  if (user.role === 'employee' && !isOwnAssignment) {
    throw new ForbiddenError('You can only view your own assignments');
  }
  if (user.role === 'manager' && !isOwnAssignment && !isTeamAssignment) {
    throw new ForbiddenError('You can only view your own or your team assignments');
  }

  const items = await KpiItem.find({ kpiAssignment: id }).sort({ createdAt: 1 });
  return { assignment, items };
};

const createAssignment = async (data, user) => {
  // Verify employee exists and is KPI-applicable
  const employee = await User.findById(data.employee);
  if (!employee) throw new NotFoundError('Employee');
  if (!employee.kpiReviewApplicable) throw new ValidationError('KPI review is not applicable for this employee');

  const quarter = getQuarterFromMonth(data.month);

  const assignmentData = {
    financialYear: data.financialYear,
    month: data.month,
    quarter,
    employee: data.employee,
    manager: user._id,
    createdBy: user._id,
    status: KPI_STATUS.DRAFT,
  };

  const assignment = await KpiAssignment.create(assignmentData);

  // Create KPI items if provided
  if (data.items && data.items.length > 0) {
    const items = data.items.map((item) => ({
      ...item,
      kpiAssignment: assignment._id,
    }));
    await KpiItem.insertMany(items);

    // Recalculate total weightage
    const totalWeightage = data.items.reduce((sum, i) => sum + (i.weightage || 0), 0);
    assignment.totalWeightage = totalWeightage;
    await assignment.save();
  }

  await createAuditLog({
    entityType: 'kpi_assignment',
    entityId: assignment._id,
    action: 'created',
    changedBy: user._id,
    newValue: { employee: data.employee, month: data.month, financialYear: data.financialYear },
  });

  return assignment;
};

const updateAssignment = async (id, data, user) => {
  const assignment = await KpiAssignment.findById(id);
  if (!assignment) throw new NotFoundError('KPI Assignment');

  if (assignment.isLocked) throw new ValidationError('Assignment is locked');

  Object.assign(assignment, data);
  await assignment.save();

  return assignment;
};

/**
 * Transition assignment from DRAFT to ASSIGNED
 */
const assignToEmployee = async (id, user) => {
  const assignment = await KpiAssignment.findById(id);
  if (!assignment) throw new NotFoundError('KPI Assignment');

  validateTransition(assignment.status, KPI_STATUS.ASSIGNED);

  // Must have at least 1 KPI item
  const itemCount = await KpiItem.countDocuments({ kpiAssignment: id });
  if (itemCount === 0) throw new ValidationError('Add at least one KPI item before assigning');

  assignment.status = KPI_STATUS.ASSIGNED;
  await assignment.save();

  // Notify employee
  await notificationService.create({
    recipient: assignment.employee,
    type: 'kpi_assigned',
    title: 'KPIs Assigned',
    message: `KPIs for ${assignment.financialYear} Month ${assignment.month} have been assigned to you.`,
    referenceType: 'kpi_assignment',
    referenceId: assignment._id,
  });

  await createAuditLog({
    entityType: 'kpi_assignment',
    entityId: assignment._id,
    action: 'submitted',
    changedBy: user._id,
    newValue: { status: KPI_STATUS.ASSIGNED },
  });

  return assignment;
};

/**
 * Employee submits their values
 */
const employeeSubmit = async (id, itemsData, user) => {
  const assignment = await KpiAssignment.findById(id);
  if (!assignment) throw new NotFoundError('KPI Assignment');

  if (assignment.employee.toString() !== user._id.toString()) {
    throw new ForbiddenError('You can only submit for your own assignments');
  }
  // Note: managers can also submit their own KPIs (they are employees too)

  validateTransition(assignment.status, KPI_STATUS.EMPLOYEE_SUBMITTED);

  const now = new Date();
  for (const item of itemsData) {
    await KpiItem.findByIdAndUpdate(item.id, {
      employeeValue: item.employeeValue,
      employeeComment: item.employeeComment || '',
      employeeSubmittedAt: now,
      itemStatus: KPI_STATUS.EMPLOYEE_SUBMITTED,
    });
  }

  assignment.status = KPI_STATUS.EMPLOYEE_SUBMITTED;
  assignment.employeeSubmittedAt = now;
  await assignment.save();

  // Notify manager
  await notificationService.create({
    recipient: assignment.manager,
    type: 'employee_submitted',
    title: 'Employee Submitted KPIs',
    message: `Employee has submitted KPIs for ${assignment.financialYear} Month ${assignment.month}.`,
    referenceType: 'kpi_assignment',
    referenceId: assignment._id,
  });

  await createAuditLog({
    entityType: 'kpi_assignment',
    entityId: assignment._id,
    action: 'submitted',
    changedBy: user._id,
    newValue: { status: KPI_STATUS.EMPLOYEE_SUBMITTED },
  });

  return assignment;
};

/**
 * Manager reviews employee submission
 */
const managerReview = async (id, itemsData, user) => {
  const assignment = await KpiAssignment.findById(id);
  if (!assignment) throw new NotFoundError('KPI Assignment');

  if (assignment.manager.toString() !== user._id.toString()) {
    throw new ForbiddenError('You can only review your team assignments');
  }

  validateTransition(assignment.status, KPI_STATUS.MANAGER_REVIEWED);

  const now = new Date();
  for (const item of itemsData) {
    await KpiItem.findByIdAndUpdate(item.id, {
      managerValue: item.managerValue,
      managerScore: item.managerScore,
      managerComment: item.managerComment || '',
      managerReviewedAt: now,
      itemStatus: KPI_STATUS.MANAGER_REVIEWED,
    });
  }

  assignment.status = KPI_STATUS.MANAGER_REVIEWED;
  assignment.managerReviewedAt = now;
  await assignment.save();

  // Notify admin (all admins)
  const admins = await User.find({ role: 'admin', isActive: true }).select('_id');
  for (const admin of admins) {
    await notificationService.create({
      recipient: admin._id,
      type: 'manager_reviewed',
      title: 'Manager Review Complete',
      message: `Manager review completed for ${assignment.financialYear} Month ${assignment.month}.`,
      referenceType: 'kpi_assignment',
      referenceId: assignment._id,
    });
  }

  await createAuditLog({
    entityType: 'kpi_assignment',
    entityId: assignment._id,
    action: 'reviewed',
    changedBy: user._id,
    newValue: { status: KPI_STATUS.MANAGER_REVIEWED },
  });

  return assignment;
};

/**
 * Admin/final reviewer submits final values
 */
const finalReview = async (id, itemsData, user) => {
  const assignment = await KpiAssignment.findById(id);
  if (!assignment) throw new NotFoundError('KPI Assignment');

  validateTransition(assignment.status, KPI_STATUS.FINAL_REVIEWED);

  const now = new Date();
  for (const item of itemsData) {
    await KpiItem.findByIdAndUpdate(item.id, {
      finalValue: item.finalValue,
      finalScore: item.finalScore,
      finalComment: item.finalComment || '',
      finalReviewedAt: now,
      itemStatus: KPI_STATUS.FINAL_REVIEWED,
    });
  }

  // Calculate monthly weighted score
  const items = await KpiItem.find({ kpiAssignment: id });
  const monthlyScore = calculateMonthlyScore(items);

  assignment.status = KPI_STATUS.FINAL_REVIEWED;
  assignment.finalReviewedAt = now;
  assignment.monthlyWeightedScore = monthlyScore;
  await assignment.save();

  await createAuditLog({
    entityType: 'kpi_assignment',
    entityId: assignment._id,
    action: 'final_reviewed',
    changedBy: user._id,
    newValue: { status: KPI_STATUS.FINAL_REVIEWED, monthlyWeightedScore: monthlyScore },
  });

  return assignment;
};

/**
 * Lock assignment — makes it read-only
 */
const lockAssignment = async (id, user) => {
  const assignment = await KpiAssignment.findById(id);
  if (!assignment) throw new NotFoundError('KPI Assignment');

  validateTransition(assignment.status, KPI_STATUS.LOCKED);

  assignment.status = KPI_STATUS.LOCKED;
  assignment.isLocked = true;
  assignment.lockedAt = new Date();
  assignment.lockedBy = user._id;
  await assignment.save();

  // Notify employee
  await notificationService.create({
    recipient: assignment.employee,
    type: 'record_locked',
    title: 'KPI Record Locked',
    message: `Your KPI record for ${assignment.financialYear} Month ${assignment.month} has been finalized and locked.`,
    referenceType: 'kpi_assignment',
    referenceId: assignment._id,
  });

  await createAuditLog({
    entityType: 'kpi_assignment',
    entityId: assignment._id,
    action: 'locked',
    changedBy: user._id,
  });

  return assignment;
};

/**
 * Unlock assignment — admin override
 */
const unlockAssignment = async (id, user) => {
  const assignment = await KpiAssignment.findById(id);
  if (!assignment) throw new NotFoundError('KPI Assignment');

  if (assignment.status !== KPI_STATUS.LOCKED) {
    throw new ValidationError('Only locked assignments can be unlocked');
  }

  assignment.status = KPI_STATUS.FINAL_REVIEWED;
  assignment.isLocked = false;
  assignment.lockedAt = null;
  assignment.lockedBy = null;
  await assignment.save();

  await createAuditLog({
    entityType: 'kpi_assignment',
    entityId: assignment._id,
    action: 'unlocked',
    changedBy: user._id,
  });

  return assignment;
};

/**
 * Reopen assignment — admin can send it back to an earlier status for re-evaluation
 * targetStatus must be one of: assigned, employee_submitted, manager_reviewed, final_reviewed
 */
const reopenAssignment = async (id, targetStatus, user) => {
  const assignment = await KpiAssignment.findById(id);
  if (!assignment) throw new NotFoundError('KPI Assignment');

  if (!REOPEN_ALLOWED_FROM.includes(assignment.status)) {
    throw new ValidationError(
      `Cannot reopen from '${assignment.status}'. Only locked, final_reviewed, or manager_reviewed assignments can be reopened.`
    );
  }
  if (!REOPEN_ALLOWED_TO.includes(targetStatus)) {
    throw new ValidationError(
      `Invalid reopen target status '${targetStatus}'. Allowed: assigned, employee_submitted, manager_reviewed, final_reviewed.`
    );
  }

  const oldStatus = assignment.status;
  assignment.status = targetStatus;
  assignment.isLocked = false;
  assignment.lockedAt = null;
  assignment.lockedBy = null;

  // Clear downstream data based on target status
  if (targetStatus === KPI_STATUS.ASSIGNED) {
    // Reset all submission data
    await KpiItem.updateMany({ kpiAssignment: id }, {
      $unset: { employeeValue: 1, employeeComment: 1, employeeSubmittedAt: 1,
                managerValue: 1, managerScore: 1, managerComment: 1, managerReviewedAt: 1,
                finalValue: 1, finalScore: 1, finalComment: 1, finalReviewedAt: 1 },
      $set: { itemStatus: KPI_STATUS.ASSIGNED }
    });
    assignment.employeeSubmittedAt = null;
    assignment.managerReviewedAt = null;
    assignment.finalReviewedAt = null;
    assignment.monthlyWeightedScore = null;
  } else if (targetStatus === KPI_STATUS.EMPLOYEE_SUBMITTED) {
    // Keep employee data, clear manager + final
    await KpiItem.updateMany({ kpiAssignment: id }, {
      $unset: { managerValue: 1, managerScore: 1, managerComment: 1, managerReviewedAt: 1,
                finalValue: 1, finalScore: 1, finalComment: 1, finalReviewedAt: 1 },
      $set: { itemStatus: KPI_STATUS.EMPLOYEE_SUBMITTED }
    });
    assignment.managerReviewedAt = null;
    assignment.finalReviewedAt = null;
    assignment.monthlyWeightedScore = null;
  } else if (targetStatus === KPI_STATUS.MANAGER_REVIEWED) {
    // Keep employee + manager data, clear final
    await KpiItem.updateMany({ kpiAssignment: id }, {
      $unset: { finalValue: 1, finalScore: 1, finalComment: 1, finalReviewedAt: 1 },
      $set: { itemStatus: KPI_STATUS.MANAGER_REVIEWED }
    });
    assignment.finalReviewedAt = null;
    assignment.monthlyWeightedScore = null;
  }
  // If target is final_reviewed, just unlock — no data cleared

  await assignment.save();

  // Notify employee about reopened assessment
  await notificationService.create({
    recipient: assignment.employee,
    type: 'record_unlocked',
    title: 'Assessment Reopened',
    message: `Your KPI assessment for ${assignment.financialYear} Month ${assignment.month} has been reopened to "${targetStatus.replace(/_/g, ' ')}" stage.`,
    referenceType: 'kpi_assignment',
    referenceId: assignment._id,
  });

  await createAuditLog({
    entityType: 'kpi_assignment',
    entityId: assignment._id,
    action: 'reopened',
    changedBy: user._id,
    oldValue: { status: oldStatus },
    newValue: { status: targetStatus },
  });

  return assignment;
};

// Validate status transition
function validateTransition(currentStatus, targetStatus) {
  const allowed = STATUS_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(targetStatus)) {
    throw new ValidationError(
      `Cannot transition from '${currentStatus}' to '${targetStatus}'`
    );
  }
}

/**
 * Get consolidated team overview for a manager for a given month.
 * Returns ALL team members — those with KPI assignments show items,
 * those without show as { employee, assignment: null, items: [] }
 * so the frontend can offer "Add KPI" links.
 */
const getTeamOverview = async (managerId, query = {}) => {
  // 1. Get all team members for this manager
  const teamMembers = await User.find({ manager: managerId, isActive: true })
    .select('_id name employeeCode email designation department kpiReviewApplicable')
    .sort({ name: 1 });

  // 2. Find assignments for the selected period
  const filter = { manager: managerId };
  if (query.financialYear) filter.financialYear = query.financialYear;
  if (query.month) filter.month = Number(query.month);

  const assignments = await KpiAssignment.find(filter)
    .populate('employee', 'name employeeCode email designation department');

  // 3. Build a map of employeeId → assignment
  const assignmentMap = {};
  for (const a of assignments) {
    assignmentMap[a.employee._id.toString()] = a;
  }

  // 4. Build results: one entry per team member
  const results = [];
  for (const member of teamMembers) {
    const assignment = assignmentMap[member._id.toString()] || null;
    if (assignment) {
      const items = await KpiItem.find({ kpiAssignment: assignment._id }).sort({ createdAt: 1 });
      const itemsWithAvg = items.map((item) => {
        const obj = item.toObject();
        obj.calculatedResult = computeItemAverage(obj);
        return obj;
      });
      results.push({ employee: member, assignment, items: itemsWithAvg });
    } else {
      // No KPIs defined yet for this member+month
      results.push({ employee: member, assignment: null, items: [] });
    }
  }

  return results;
};

/**
 * Get all assignments overview for admin for a given month (all employees)
 * Returns all assignments with KPI items across the organization
 */
const getAdminOverview = async (query = {}) => {
  const filter = {};
  if (query.financialYear) filter.financialYear = query.financialYear;
  if (query.month) filter.month = Number(query.month);
  if (query.status) filter.status = query.status;
  if (query.department) {
    // Filter by department: need to find employees in that department first
    const empIds = await User.find({ department: query.department }).select('_id');
    filter.employee = { $in: empIds.map((e) => e._id) };
  }

  const assignments = await KpiAssignment.find(filter)
    .populate('employee', 'name employeeCode email designation department kpiReviewApplicable')
    .populate('manager', 'name employeeCode')
    .sort({ createdAt: -1 });

  const results = [];
  for (const assignment of assignments) {
    const items = await KpiItem.find({ kpiAssignment: assignment._id }).sort({ createdAt: 1 });
    const itemsWithAvg = items.map((item) => {
      const obj = item.toObject();
      obj.calculatedResult = computeItemAverage(obj);
      return obj;
    });

    // Compute overall average score for the assignment
    const avgScores = itemsWithAvg
      .filter((i) => i.calculatedResult != null)
      .map((i) => i.calculatedResult * (i.weightage / 100));
    const totalWeight = itemsWithAvg
      .filter((i) => i.calculatedResult != null)
      .reduce((s, i) => s + i.weightage, 0);
    const overallAvg = totalWeight > 0
      ? Math.round((avgScores.reduce((s, v) => s + v, 0) / totalWeight) * 100 * 100) / 100
      : null;

    results.push({
      assignment,
      items: itemsWithAvg,
      overallAverageScore: overallAvg,
    });
  }

  return results;
};

/**
 * Compute average of employee, manager, and final values for a KPI item.
 * Only includes values that have been submitted (non-null).
 * Returns null if no values available.
 */
function computeItemAverage(item) {
  const values = [];
  if (item.employeeValue != null) values.push(Number(item.employeeValue));
  if (item.managerValue != null) values.push(Number(item.managerValue));
  if (item.finalValue != null) values.push(Number(item.finalValue));
  if (values.length === 0) return null;
  return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 100) / 100;
}

/**
 * Clone KPI items from a source assignment to a target employee+month.
 * Creates a new assignment (or uses existing draft) and copies KPI item definitions.
 * Does NOT copy employee/manager/final values — only the KPI structure.
 *
 * Options:
 *   sourceAssignmentId — the assignment to clone from
 *   targetEmployeeId — the employee to clone to
 *   targetMonth — target month number
 *   targetFinancialYear — target FY string
 */
const cloneKpis = async (data, user) => {
  const { sourceAssignmentId, targetEmployeeId, targetMonth, targetFinancialYear } = data;

  // 1. Load source assignment + items
  const sourceAssignment = await KpiAssignment.findById(sourceAssignmentId);
  if (!sourceAssignment) throw new NotFoundError('Source KPI Assignment');

  const sourceItems = await KpiItem.find({ kpiAssignment: sourceAssignmentId }).sort({ createdAt: 1 });
  if (sourceItems.length === 0) throw new ValidationError('Source assignment has no KPI items to clone');

  const quarter = getQuarterFromMonth(Number(targetMonth));

  // 2. Verify target employee is KPI-applicable
  const targetEmployee = await User.findById(targetEmployeeId);
  if (!targetEmployee) throw new NotFoundError('Target Employee');
  if (!targetEmployee.kpiReviewApplicable) throw new ValidationError('KPI review is not applicable for target employee');

  // 3. Check if target assignment already exists
  let targetAssignment = await KpiAssignment.findOne({
    employee: targetEmployeeId,
    financialYear: targetFinancialYear,
    month: Number(targetMonth),
  });

  if (targetAssignment && targetAssignment.status !== KPI_STATUS.DRAFT) {
    throw new ValidationError(
      `Target assignment for this employee/month already exists with status '${targetAssignment.status}'. Can only clone into draft assignments.`
    );
  }

  if (!targetAssignment) {
    // Create new draft assignment
    targetAssignment = await KpiAssignment.create({
      financialYear: targetFinancialYear,
      month: Number(targetMonth),
      quarter,
      employee: targetEmployeeId,
      manager: user._id,
      createdBy: user._id,
      status: KPI_STATUS.DRAFT,
    });
  }

  // 3. Clone KPI items (definition only, no values)
  const clonedItems = sourceItems.map((item) => ({
    kpiAssignment: targetAssignment._id,
    title: item.title,
    description: item.description,
    category: item.category,
    unit: item.unit,
    weightage: item.weightage,
    targetValue: item.targetValue,
    thresholdValue: item.thresholdValue,
    stretchTarget: item.stretchTarget,
    remarks: item.remarks,
    itemStatus: 'draft',
  }));

  await KpiItem.insertMany(clonedItems);

  // Update total weightage
  const totalWeightage = clonedItems.reduce((sum, i) => sum + (i.weightage || 0), 0);
  targetAssignment.totalWeightage = totalWeightage;
  await targetAssignment.save();

  await createAuditLog({
    entityType: 'kpi_assignment',
    entityId: targetAssignment._id,
    action: 'created',
    changedBy: user._id,
    newValue: {
      clonedFrom: sourceAssignmentId,
      employee: targetEmployeeId,
      month: targetMonth,
      financialYear: targetFinancialYear,
      itemsCloned: clonedItems.length,
    },
  });

  return targetAssignment;
};

/**
 * Bulk clone: clone one source assignment's KPI structure to multiple employees for the same month.
 */
const bulkCloneKpis = async (data, user) => {
  const { sourceAssignmentId, targetEmployeeIds, targetMonth, targetFinancialYear } = data;

  const results = { success: [], failed: [] };

  // Pre-filter employees not applicable for KPI review
  const applicableEmployees = await User.find({
    _id: { $in: targetEmployeeIds },
    kpiReviewApplicable: true,
  }).select('_id');
  const applicableIds = new Set(applicableEmployees.map((e) => e._id.toString()));

  for (const empId of targetEmployeeIds) {
    if (!applicableIds.has(empId.toString())) {
      results.failed.push({ employeeId: empId, error: 'KPI review is not applicable for this employee' });
      continue;
    }
    try {
      const assignment = await cloneKpis(
        { sourceAssignmentId, targetEmployeeId: empId, targetMonth, targetFinancialYear },
        user
      );
      results.success.push({ employeeId: empId, assignmentId: assignment._id });
    } catch (err) {
      results.failed.push({ employeeId: empId, error: err.message });
    }
  }

  return results;
};

/**
 * Bulk import KPI items from an Excel file.
 * Expected columns: Employee Code, KPI Title, Description, Category, Unit,
 *                   Weightage, Target Value, Threshold Value, Stretch Target, Remarks
 *
 * For each row:
 *   - Find the employee by employeeCode
 *   - Verify the employee is in the manager's team
 *   - Find or create a KPI assignment for that employee+month+FY
 *   - Create KPI item under that assignment
 *   - Update totalWeightage
 *
 * @param {Buffer} buffer - Excel file buffer
 * @param {string} financialYear
 * @param {number} month
 * @param {Object} user - The authenticated manager/admin user
 * @returns {{ success: Array, errors: Array }}
 */
const bulkImportFromExcel = async (buffer, financialYear, month, user) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.getWorksheet(1);
  if (!worksheet) {
    throw new ValidationError('Excel file has no worksheets');
  }

  const success = [];
  const errors = [];

  // Read header row to map column positions
  const headerRow = worksheet.getRow(1);
  const headers = {};
  headerRow.eachCell((cell, colNumber) => {
    const val = String(cell.value || '').trim().toLowerCase();
    headers[val] = colNumber;
  });

  // Validate required headers
  const requiredHeaders = ['employee code', 'kpi title', 'weightage', 'target value'];
  for (const h of requiredHeaders) {
    if (!headers[h]) {
      throw new ValidationError(`Missing required column: "${h}". Expected columns: Employee Code, KPI Title, Description, Category, Unit, Weightage, Target Value, Threshold Value, Stretch Target, Remarks`);
    }
  }

  const quarter = getQuarterFromMonth(Number(month));

  // Cache for employee lookups and assignments
  const employeeCache = {};
  const assignmentCache = {};

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);

    // Skip empty rows
    const employeeCode = String(row.getCell(headers['employee code']).value || '').trim().toUpperCase();
    const kpiTitle = String(row.getCell(headers['kpi title']).value || '').trim();

    if (!employeeCode || !kpiTitle) {
      if (employeeCode || kpiTitle) {
        errors.push({ row: rowNumber, message: 'Employee Code and KPI Title are required' });
      }
      continue;
    }

    try {
      // 1. Find employee
      let employee = employeeCache[employeeCode];
      if (!employee) {
        employee = await User.findOne({ employeeCode, isActive: true });
        if (!employee) {
          errors.push({ row: rowNumber, employeeCode, message: `Employee not found: ${employeeCode}` });
          continue;
        }
        employeeCache[employeeCode] = employee;
      }

      // Check KPI review applicability
      if (!employee.kpiReviewApplicable) {
        errors.push({ row: rowNumber, employeeCode, message: 'KPI review not applicable for this employee' });
        continue;
      }

      // 2. Verify employee is in manager's team (skip for admin)
      if (user.role !== 'admin') {
        if (!employee.manager || employee.manager.toString() !== user._id.toString()) {
          errors.push({ row: rowNumber, employeeCode, message: `Employee ${employeeCode} is not in your team` });
          continue;
        }
      }

      // 3. Parse row data
      const description = headers['description'] ? String(row.getCell(headers['description']).value || '').trim() : '';
      const category = headers['category'] ? String(row.getCell(headers['category']).value || '').trim() : 'Other';
      const unit = headers['unit'] ? String(row.getCell(headers['unit']).value || '').trim() : 'Number';
      const weightage = Number(row.getCell(headers['weightage']).value);
      const targetValue = Number(row.getCell(headers['target value']).value);
      const thresholdValue = headers['threshold value'] ? row.getCell(headers['threshold value']).value : null;
      const stretchTarget = headers['stretch target'] ? row.getCell(headers['stretch target']).value : null;
      const remarks = headers['remarks'] ? String(row.getCell(headers['remarks']).value || '').trim() : '';

      // Validate
      if (isNaN(weightage) || weightage < 1 || weightage > 100) {
        errors.push({ row: rowNumber, employeeCode, message: 'Weightage must be between 1 and 100' });
        continue;
      }
      if (isNaN(targetValue)) {
        errors.push({ row: rowNumber, employeeCode, message: 'Target Value must be a number' });
        continue;
      }
      if (category && !KPI_CATEGORIES.includes(category)) {
        errors.push({ row: rowNumber, employeeCode, message: `Invalid category "${category}". Must be one of: ${KPI_CATEGORIES.join(', ')}` });
        continue;
      }
      if (unit && !KPI_UNITS.includes(unit)) {
        errors.push({ row: rowNumber, employeeCode, message: `Invalid unit "${unit}". Must be one of: ${KPI_UNITS.join(', ')}` });
        continue;
      }

      // 4. Find or create assignment
      const cacheKey = `${employee._id}_${financialYear}_${month}`;
      let assignment = assignmentCache[cacheKey];
      if (!assignment) {
        assignment = await KpiAssignment.findOne({
          employee: employee._id,
          financialYear,
          month: Number(month),
        });

        if (assignment && !['draft', 'assigned'].includes(assignment.status)) {
          errors.push({ row: rowNumber, employeeCode, message: `Assignment for ${employeeCode} already exists with status "${assignment.status}" — cannot add items` });
          continue;
        }

        if (!assignment) {
          assignment = await KpiAssignment.create({
            financialYear,
            month: Number(month),
            quarter,
            employee: employee._id,
            manager: user.role === 'admin' ? (employee.manager || user._id) : user._id,
            createdBy: user._id,
            status: KPI_STATUS.DRAFT,
          });
        }
        assignmentCache[cacheKey] = assignment;
      }

      // 5. Create KPI item
      const kpiItem = await KpiItem.create({
        kpiAssignment: assignment._id,
        title: kpiTitle,
        description,
        category: category || 'Other',
        unit: unit || 'Number',
        weightage,
        targetValue,
        thresholdValue: thresholdValue != null && !isNaN(Number(thresholdValue)) ? Number(thresholdValue) : undefined,
        stretchTarget: stretchTarget != null && !isNaN(Number(stretchTarget)) ? Number(stretchTarget) : undefined,
        remarks,
        itemStatus: assignment.status === 'assigned' ? 'assigned' : 'draft',
      });

      // 6. Update totalWeightage on assignment
      const allItems = await KpiItem.find({ kpiAssignment: assignment._id });
      assignment.totalWeightage = allItems.reduce((sum, i) => sum + (i.weightage || 0), 0);
      await assignment.save();
      assignmentCache[cacheKey] = assignment;

      success.push({
        row: rowNumber,
        employeeCode,
        employeeName: employee.name,
        kpiTitle,
        assignmentId: assignment._id,
        itemId: kpiItem._id,
      });
    } catch (err) {
      errors.push({ row: rowNumber, employeeCode, message: err.message });
    }
  }

  return { success, errors };
};

/**
 * Generate an Excel template for bulk KPI import.
 * Returns an ExcelJS Workbook ready to be written to a response stream.
 */
const generateImportTemplate = async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PLI Portal';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('KPI Import');

  // Define columns
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

  // Style header row
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E40AF' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

  // Add sample data rows
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

  // Add data validation for Category
  worksheet.dataValidations.add('D2:D1000', {
    type: 'list',
    allowBlank: true,
    formulae: [`"${KPI_CATEGORIES.join(',')}"`],
    showErrorMessage: true,
    errorTitle: 'Invalid Category',
    error: `Must be one of: ${KPI_CATEGORIES.join(', ')}`,
  });

  // Add data validation for Unit
  worksheet.dataValidations.add('E2:E1000', {
    type: 'list',
    allowBlank: true,
    formulae: [`"${KPI_UNITS.join(',')}"`],
    showErrorMessage: true,
    errorTitle: 'Invalid Unit',
    error: `Must be one of: ${KPI_UNITS.join(', ')}`,
  });

  // Add instructions sheet
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
