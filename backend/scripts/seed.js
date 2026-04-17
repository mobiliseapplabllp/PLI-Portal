/**
 * Seed script — creates production data with real reporting hierarchy
 * Run: npm run seed
 *
 * Admin: admin@mobilise.co.in (MLP001 - ASHISH SHARMA)
 * Managers & Employees: {code}@mobilise.co.in / password123
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const sequelize = require('../src/config/database');
require('../src/models/associations');
const {
  User,
  Department,
  AppraisalCycle,
  PliRule,
  PliSlab,
  KpiAssignment,
  KpiItem,
  Notification,
  AuditLog,
  KpiTemplate,
} = require('../src/models/associations');

// ══════════════════════════════════════════════════════════════
//  COMPLETE EMPLOYEE LIST WITH REPORTING HIERARCHY
//  role: 'admin' | 'manager' | 'employee'
//  managerCode: employee code of their reporting manager
// ══════════════════════════════════════════════════════════════
const employeeData = [
  // ── Admin ──
  { code: 'MLP001', name: 'ASHISH SHARMA',       role: 'admin',   managerCode: null },

  // ── Managers (people who have direct reports) ──
  { code: 'MLP002', name: 'SMRITI SHARMA',        role: 'manager', managerCode: 'MLP001' },
  { code: 'MLP041', name: 'LAL SINGH',            role: 'manager', managerCode: 'MLP001' },
  { code: 'MLP053', name: 'DEEPAK ATTRI',         role: 'manager', managerCode: 'MLP001' },
  { code: 'MLP125', name: 'SUGANDHA AGGARWAL',    role: 'manager', managerCode: 'MLP001' },
  { code: 'MLP043', name: 'DHEERAJ SHARMA',       role: 'manager', managerCode: 'MLP001' },
  { code: 'MLP069', name: 'RASHMI GANDHI',        role: 'manager', managerCode: 'MLP001' },
  { code: 'MLP105', name: 'DEVESH JOSHI',         role: 'manager', managerCode: 'MLP001' },
  { code: 'MLP097', name: 'MUKESH KUMAR THAKUR',  role: 'manager', managerCode: 'MLP001' },
  { code: 'MLP127', name: 'ROHIT HOODA',          role: 'manager', managerCode: 'MLP001' },
  { code: 'MLP049', name: 'ABHISHEK KURUP BALAKRISHNA', role: 'manager', managerCode: 'MLP001' },
  { code: 'MLP131', name: 'ABHISHEK SRIVASTAVA',  role: 'manager', managerCode: 'MLP001' },
  { code: 'MLP048', name: 'AMAN TYAGI',           role: 'manager', managerCode: 'MLP043' },
  { code: 'MLP126', name: 'RAVI RANJAN',          role: 'manager', managerCode: 'MLP049' },
  { code: 'MLP091', name: 'MAYANK SABHARWAL',     role: 'manager', managerCode: 'MLP125' },

  // ── Employees reporting to SMRITI SHARMA (MLP002) ──
  { code: 'MLP159', name: 'AAYUSHI SHARMA',       role: 'employee', managerCode: 'MLP002' },
  { code: 'MLP156', name: 'NIKHIL SHARMA',        role: 'employee', managerCode: 'MLP002' },

  // ── Employees reporting to ASHISH SHARMA (MLP001 - Admin) ──
  { code: 'MLP148', name: 'AMIT KUMAR',           role: 'employee', managerCode: 'MLP001' },
  { code: 'MLP007', name: 'KAMAL SHARMA',         role: 'employee', managerCode: 'MLP001' },
  { code: 'MLP140', name: 'RAMBABU KUMAR MAHTO',  role: 'employee', managerCode: 'MLP001' },
  { code: 'MLP133', name: 'SHIV KUMAR',           role: 'employee', managerCode: 'MLP001' },
  { code: 'MLP130', name: 'CHHAYA VERMA',         role: 'employee', managerCode: 'MLP001' },

  // ── Employees reporting to LAL SINGH (MLP041) ──
  { code: 'MLP086', name: 'ABHISHEK VERMA',       role: 'employee', managerCode: 'MLP041' },
  { code: 'MLP044', name: 'ANUJ KUMAR',           role: 'employee', managerCode: 'MLP041' },
  { code: 'MLP067', name: 'LAXMI PRIYA',          role: 'employee', managerCode: 'MLP041' },
  { code: 'MLP141', name: 'AVINASH KUMAR',        role: 'employee', managerCode: 'MLP041' },
  { code: 'MLP011', name: 'BRIJ BHUSHAN',         role: 'employee', managerCode: 'MLP041' },
  { code: 'MLP166', name: 'MOHIT YADAV',          role: 'employee', managerCode: 'MLP041' },
  { code: 'MLP153', name: 'SANDEEP',              role: 'employee', managerCode: 'MLP041' },
  { code: 'MLP088', name: 'MD. SHAHID BELAL',     role: 'employee', managerCode: 'MLP041' },
  { code: 'MLP171', name: 'DIVYA ABHISHEK PISE',  role: 'employee', managerCode: 'MLP041' },
  { code: 'MLP051', name: 'JYASHU SHARMA',        role: 'employee', managerCode: 'MLP041' },
  { code: 'MLP038', name: 'DHARMENDRA KUMAR',     role: 'employee', managerCode: 'MLP041' },
  { code: 'MLP073', name: 'SAKSHI GUPTA',         role: 'employee', managerCode: 'MLP041' },
  { code: 'MLP081', name: 'YASHIKA',              role: 'employee', managerCode: 'MLP041' },

  // ── Employees reporting to DEEPAK ATTRI (MLP053) ──
  { code: 'MLP142', name: 'ADITYA SHARMA',        role: 'employee', managerCode: 'MLP053' },
  { code: 'MLP080', name: 'ARVIND KUMAR KARUNAKAR', role: 'employee', managerCode: 'MLP053' },
  { code: 'MLP135', name: 'MOHAMMAD FARAZ QURAISHI', role: 'employee', managerCode: 'MLP053' },
  { code: 'IN0019', name: 'ABHISHEK LOHIYA',      role: 'employee', managerCode: 'MLP053' },

  // ── Employees reporting to SUGANDHA AGGARWAL (MLP125) ──
  { code: 'MLP093', name: 'AKASH KUMAR',          role: 'employee', managerCode: 'MLP125' },
  { code: 'MLP172', name: 'ARPITA MAHESHWARI',    role: 'employee', managerCode: 'MLP125' },
  { code: 'MLP095', name: 'ARUN SAHU',            role: 'employee', managerCode: 'MLP125' },
  { code: 'MLP071', name: 'FARHA',                role: 'employee', managerCode: 'MLP125' },
  { code: 'MLP057', name: 'PAWAN PANT',           role: 'employee', managerCode: 'MLP125' },
  { code: 'MLP147', name: 'RAMAN KUMAR VERMA',    role: 'employee', managerCode: 'MLP125' },
  { code: 'MLP039', name: 'RISHABH AZAD',         role: 'employee', managerCode: 'MLP125' },

  // ── Employees reporting to DHEERAJ SHARMA (MLP043) ──
  { code: 'MLP104', name: 'ANUJ KUMAR YADAV',     role: 'employee', managerCode: 'MLP043' },
  { code: 'MLP113', name: 'GANESH PANDEY',        role: 'employee', managerCode: 'MLP043' },
  { code: 'MLP173', name: 'GOURAV SHARMA',        role: 'employee', managerCode: 'MLP043' },
  { code: 'MLP108', name: 'MAHAVIR',              role: 'employee', managerCode: 'MLP043' },
  { code: 'MLP144', name: 'PRAKASH',              role: 'employee', managerCode: 'MLP043' },
  { code: 'MLP174', name: 'PRINCE GUPTA',         role: 'employee', managerCode: 'MLP043' },
  { code: 'MLP092', name: 'PUNEET YADAV',         role: 'employee', managerCode: 'MLP043' },
  { code: 'MLP100', name: 'SONAM OJHA',           role: 'employee', managerCode: 'MLP043' },
  { code: 'MLP128', name: 'VEER VIKRAM SINGH',    role: 'employee', managerCode: 'MLP043' },

  // ── Employees reporting to RASHMI GANDHI (MLP069) ──
  { code: 'MLP114', name: 'AMIT KUMAR',           role: 'employee', managerCode: 'MLP069' },
  { code: 'MLP070', name: 'ANIT VERMA',           role: 'employee', managerCode: 'MLP069' },
  { code: 'MLP146', name: 'SANJAY',               role: 'employee', managerCode: 'MLP069' },

  // ── Employees reporting to DEVESH JOSHI (MLP105) ──
  { code: 'MLP161', name: 'ASHOK KUMAR YADAV',    role: 'employee', managerCode: 'MLP105' },
  { code: 'MLP066', name: 'BHARAT SHARMA',        role: 'employee', managerCode: 'MLP105' },
  { code: 'MLP060', name: 'NAVEEN KUMAR',         role: 'employee', managerCode: 'MLP105' },
  { code: 'IN0010', name: 'RAKESH KUMAR RAI',     role: 'employee', managerCode: 'MLP105' },
  { code: 'MLP084', name: 'RASANARAYANA CHAURASIYA', role: 'employee', managerCode: 'MLP105' },
  { code: 'MLP061', name: 'ROHIT KUMAR',          role: 'employee', managerCode: 'MLP105' },

  // ── Employees reporting to MUKESH KUMAR THAKUR (MLP097) ──
  { code: 'MLP145', name: 'DEVESH KUMAR DUBEY',   role: 'employee', managerCode: 'MLP097' },
  { code: 'MLP150', name: 'SACHIN',               role: 'employee', managerCode: 'MLP097' },
  { code: 'MLP129', name: 'SAVITA',               role: 'employee', managerCode: 'MLP097' },
  { code: 'MLP085', name: 'SUSHIL RANA',          role: 'employee', managerCode: 'MLP097' },

  // ── Employees reporting to ROHIT HOODA (MLP127) ──
  { code: 'MLP083', name: 'DOLLY GOYAL',          role: 'employee', managerCode: 'MLP127' },

  // ── Employees reporting to ABHISHEK KURUP (MLP049) ──
  { code: 'MLP155', name: 'HARSH',                role: 'employee', managerCode: 'MLP049' },

  // ── Employees reporting to RAVI RANJAN (MLP126) ──
  { code: 'IN0014', name: 'GOKARNA PANDEY',       role: 'employee', managerCode: 'MLP126' },

  // ── Employees reporting to AMAN TYAGI (MLP048) ──
  { code: 'MLP175', name: 'DEVRAJ',               role: 'employee', managerCode: 'MLP048' },

  // ── Employees reporting to MAYANK SABHARWAL (MLP091) ──
  { code: 'IN0021', name: 'UJJWAL MANTRI',        role: 'employee', managerCode: 'MLP091' },
  { code: 'IN0022', name: 'ROHIT PANDEY',         role: 'employee', managerCode: 'MLP091' },
  { code: 'IN0026', name: 'NINGTHOUJAM ROHIT KUMAR SINGH', role: 'employee', managerCode: 'MLP091' },

  // ── Employees reporting to ABHISHEK SRIVASTAVA (MLP131) ──
  { code: 'IN0025', name: 'MAYANK SATYARTHI',     role: 'employee', managerCode: 'MLP131' },

  // ── Employees NOT in hierarchy list — default to Admin ──
  { code: 'MLP177', name: 'ASHISH - OFFICE',      role: 'employee', managerCode: 'MLP001' },
  { code: 'MLP110', name: 'ARUN',                 role: 'employee', managerCode: 'MLP001' },
  { code: 'MLP072', name: 'GANESH CHANDRA SHARMA', role: 'employee', managerCode: 'MLP001' },
  { code: 'MLP149', name: 'HITESH PRAKASH PATIL', role: 'employee', managerCode: 'MLP001' },
  { code: 'MLP162', name: 'INDU SRREE',           role: 'employee', managerCode: 'MLP001' },
  { code: 'MLP123', name: 'KAVYA MARWAHA',        role: 'employee', managerCode: 'MLP001' },
  { code: 'MLP107', name: 'LALITA SINGH',         role: 'employee', managerCode: 'MLP001' },
  { code: 'MLP160', name: 'PRASHANT THAKUR',      role: 'employee', managerCode: 'MLP001' },
  { code: 'MLP074', name: 'SHIVANI SHARMA',       role: 'employee', managerCode: 'MLP001' },
  { code: 'MLP178', name: 'SUBHASH SHARMA',       role: 'employee', managerCode: 'MLP001' },
  { code: 'MLP094', name: 'SUMITRA GUPTA',        role: 'employee', managerCode: 'MLP001' },
  { code: 'MLP068', name: 'UDITA',                role: 'employee', managerCode: 'MLP001' },
  { code: 'MLP176', name: 'NIDHI PRAJAPATI',      role: 'employee', managerCode: 'MLP001' },
  { code: 'MLP008', name: 'SANGITA SHARMA',       role: 'employee', managerCode: 'MLP001' },
  { code: 'MLP152', name: 'SHIVAM',               role: 'employee', managerCode: 'MLP001' },
  { code: 'MLP045', name: 'KRIPA SHANKAR',        role: 'employee', managerCode: 'MLP001' },
  { code: 'IN0015', name: 'ROHIT V',              role: 'employee', managerCode: 'MLP001' },
  { code: 'IN0016', name: 'SUBRAT SHARMA',        role: 'employee', managerCode: 'MLP001' },
  { code: 'IN0013', name: 'VENU SM',              role: 'employee', managerCode: 'MLP001' },
  { code: 'IN0017', name: 'RAVIKIRAN R',          role: 'employee', managerCode: 'MLP001' },
  { code: 'IN0018', name: 'VINAY G K',            role: 'employee', managerCode: 'MLP001' },
  { code: 'IN0020', name: 'GANGARAJ B',           role: 'employee', managerCode: 'MLP001' },
  { code: 'IN0023', name: 'SRINIVAS M',           role: 'employee', managerCode: 'MLP001' },
  { code: 'IN0024', name: 'VINAY G',              role: 'employee', managerCode: 'MLP001' },
];

function makeEmail(code) {
  return `${code.toLowerCase()}@mobilise.co.in`;
}

const seed = async () => {
  try {
    await sequelize.authenticate();
    console.log('Connected to MySQL');
    await sequelize.sync();
    console.log('Schema synced');

    await KpiItem.destroy({ where: {} });
    await KpiAssignment.destroy({ where: {} });
    await Notification.destroy({ where: {} });
    await AuditLog.destroy({ where: {} });
    await PliSlab.destroy({ where: {} });
    await PliRule.destroy({ where: {} });
    await AppraisalCycle.destroy({ where: {} });
    await KpiTemplate.destroy({ where: {} });
    await User.update({ managerId: null }, { where: {} });
    await User.destroy({ where: {} });
    await Department.destroy({ where: {} });
    console.log('Cleared ALL existing data');

    const departments = await Department.bulkCreate([
      { code: 'TECH', name: 'Technology' },
      { code: 'SALES', name: 'Sales' },
      { code: 'HR', name: 'Human Resources' },
      { code: 'FIN', name: 'Finance' },
      { code: 'OPS', name: 'Operations' },
    ]);
    console.log('Created departments:', departments.length);
    const deptMap = {};
    departments.forEach((d) => {
      deptMap[d.code] = d.id;
    });

    // ══════════════════════════════════════════════════════════════
    //  CREATE ALL USERS (2-pass: create first, then set managers)
    // ══════════════════════════════════════════════════════════════
    const plainPassword = 'password123';
    const hashedPassword = await bcrypt.hash(plainPassword, 12);

    // Pass 1: Create all users WITHOUT manager field
    const codeToId = {};
    let adminId = null;

    // Create admin first (uses pre-save hook for password)
    const admin = await User.create({
      employeeCode: 'MLP001',
      name: 'ASHISH SHARMA',
      email: 'admin@mobilise.co.in',
      passwordHash: plainPassword,
      role: 'admin',
      departmentId: deptMap.OPS,
      designation: 'Admin',
      joiningDate: new Date('2020-01-01'),
      mustChangePassword: false,
    });
    codeToId['MLP001'] = admin.id;
    adminId = admin.id;
    console.log('Created admin:', admin.email, '(' + admin.employeeCode + ')');

    // Create remaining users via insertMany (pre-hashed password)
    const othersToCreate = employeeData
      .filter((e) => e.code !== 'MLP001')
      .map((emp) => ({
        employeeCode: emp.code,
        name: emp.name,
        email: makeEmail(emp.code),
        passwordHash: hashedPassword,
        role: emp.role,
        departmentId: deptMap.OPS,
        designation: emp.role === 'manager' ? 'Manager' : 'Employee',
        joiningDate: new Date('2024-01-01'),
        mustChangePassword: false,
        isActive: true,
      }));

    const createdUsers = await User.bulkCreate(othersToCreate);
    createdUsers.forEach((u) => {
      codeToId[u.employeeCode] = u.id;
    });
    console.log('Created users:', createdUsers.length);

    for (const emp of employeeData.filter((e) => e.managerCode)) {
      await User.update(
        { managerId: codeToId[emp.managerCode] },
        { where: { employeeCode: emp.code } }
      );
    }
    console.log('Set manager references');

    const kpiNotApplicableCodes = ['MLP159', 'MLP160', 'MLP161', 'MLP162', 'MLP163'];
    await User.update(
      { kpiReviewApplicable: false },
      { where: { employeeCode: kpiNotApplicableCodes } }
    );
    console.log('Marked 5 employees as KPI review not applicable:', kpiNotApplicableCodes.join(', '));

    // Count roles
    const managerCount = employeeData.filter((e) => e.role === 'manager').length;
    const employeeCount = employeeData.filter((e) => e.role === 'employee').length;
    console.log(`  Roles: 1 admin, ${managerCount} managers, ${employeeCount} employees`);

    // ══════════════════════════════════════════════════════════════
    //  FY 2026-27 Appraisal Cycles
    // ══════════════════════════════════════════════════════════════
    const FY = '2026-27';
    const allCycleMonths = [
      { month: 4,  quarter: 'Q1' },
      { month: 5,  quarter: 'Q1' },
      { month: 6,  quarter: 'Q1' },
      { month: 7,  quarter: 'Q2' },
      { month: 8,  quarter: 'Q2' },
      { month: 9,  quarter: 'Q2' },
      { month: 10, quarter: 'Q3' },
      { month: 11, quarter: 'Q3' },
      { month: 12, quarter: 'Q3' },
      { month: 1,  quarter: 'Q4' },
      { month: 2,  quarter: 'Q4' },
      { month: 3,  quarter: 'Q4' },
    ];

    // Determine visible quarters based on today
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const { QUARTER_MAP: QM } = require('../src/config/constants');
    const currentQuarter = QM[currentMonth];
    const qOrder = ['Q1', 'Q2', 'Q3', 'Q4'];
    const qMonths = { Q1: [4,5,6], Q2: [7,8,9], Q3: [10,11,12], Q4: [1,2,3] };
    const lastMonthOfCurrentQ = qMonths[currentQuarter][2];
    const nextQVisible = currentMonth >= lastMonthOfCurrentQ;
    const nextQIdx = (qOrder.indexOf(currentQuarter) + 1) % 4;
    const openQuarters = [currentQuarter];
    if (nextQVisible) openQuarters.push(qOrder[nextQIdx]);

    const cycleMonths = allCycleMonths.map((c) => ({
      ...c,
      status: openQuarters.includes(c.quarter) ? 'open' : 'draft',
    }));
    console.log(`Active quarters: ${openQuarters.join(', ')} (current month: ${currentMonth})`);

    function getDeadline(month, day) {
      let calYear = month >= 4 ? 2026 : 2027;
      let nextMonth = month + 1;
      if (nextMonth > 12) { nextMonth = 1; calYear += 1; }
      return new Date(calYear, nextMonth - 1, day);
    }

    const cycles = await AppraisalCycle.bulkCreate(
      cycleMonths.map((c) => ({
        financialYear: FY,
        month: c.month,
        quarter: c.quarter,
        status: c.status,
        employeeSubmissionDeadline: getDeadline(c.month, 5),
        managerReviewDeadline: getDeadline(c.month, 10),
        finalReviewDeadline: getDeadline(c.month, 15),
        createdById: adminId,
      }))
    );
    console.log('Created appraisal cycles:', cycles.length);

    // ── PLI Rules ──
    const standardSlabs = [
      { minScore: 90, maxScore: 100, payoutPercentage: 100, label: 'Exceptional' },
      { minScore: 80, maxScore: 89.99, payoutPercentage: 80, label: 'Exceeds Expectations' },
      { minScore: 70, maxScore: 79.99, payoutPercentage: 60, label: 'Meets Expectations' },
      { minScore: 60, maxScore: 69.99, payoutPercentage: 40, label: 'Needs Improvement' },
      { minScore: 0, maxScore: 59.99, payoutPercentage: 0, label: 'Below Expectations' },
    ];

    for (const q of ['Q1', 'Q2', 'Q3', 'Q4']) {
      const rule = await PliRule.create({
        financialYear: FY,
        quarter: q,
        remarks: `Standard PLI payout rules for FY ${FY} ${q}`,
        createdById: adminId,
        isActive: true,
      });
      await PliSlab.bulkCreate(
        standardSlabs.map((s) => ({
          pliRuleId: rule.id,
          minScore: s.minScore,
          maxScore: s.maxScore,
          payoutPercentage: s.payoutPercentage,
          label: s.label,
        }))
      );
    }
    console.log('Created PLI rules for all 4 quarters');

    // ══════════════════════════════════════════════════════════════
    //  KPI Assignments — only for open months
    //  Each employee gets assigned by THEIR OWN MANAGER
    //  1) Attendance (10%) → all open months
    //  2) Claude Training Completion (20%) → April 2026 only
    // ══════════════════════════════════════════════════════════════
    const openCycleMonths = cycleMonths.filter((c) => c.status === 'open');
    // Get all non-admin users for KPI creation (exclude KPI not applicable)
    const allNonAdminData = employeeData.filter((e) => e.code !== 'MLP001' && !kpiNotApplicableCodes.includes(e.code));

    console.log(`\nCreating KPI assignments for ${allNonAdminData.length} users across ${openCycleMonths.length} open months...`);

    let assignmentCount = 0;
    let itemCount = 0;
    const BATCH_SIZE = 20;

    for (let batchStart = 0; batchStart < allNonAdminData.length; batchStart += BATCH_SIZE) {
      const batch = allNonAdminData.slice(batchStart, batchStart + BATCH_SIZE);
      const assignmentDocs = [];
      const itemDocs = [];

      for (const emp of batch) {
        const empId = codeToId[emp.code];
        const mgrId = codeToId[emp.managerCode] || adminId;

        for (const cm of openCycleMonths) {
          const isApril = cm.month === 4;
          const totalWeightage = isApril ? 30 : 10;

          assignmentDocs.push({
            financialYear: FY,
            month: cm.month,
            quarter: cm.quarter,
            employeeId: empId,
            managerId: mgrId,
            createdById: mgrId,
            status: 'assigned',
            totalWeightage,
            isLocked: false,
          });
        }
      }

      const createdAssignments = await KpiAssignment.bulkCreate(assignmentDocs);
      assignmentCount += createdAssignments.length;

      for (const assignment of createdAssignments) {
        itemDocs.push({
          kpiAssignmentId: assignment.id,
          title: 'Attendance',
          description: 'On-time attendance percentage for the month.',
          category: 'Operational',
          unit: 'Percentage',
          weightage: 10,
          targetValue: 98,
          thresholdValue: 90,
          stretchTarget: 100,
          remarks: 'Target: 98% on-time attendance. Tracked via HRMS attendance records.',
          itemStatus: 'assigned',
        });

        if (assignment.month === 4) {
          itemDocs.push({
            kpiAssignmentId: assignment.id,
            title: 'Claude Training Completion',
            description: 'Complete assigned Claude AI training modules. Target is 100% completion.',
            category: 'Development',
            unit: 'Percentage',
            weightage: 20,
            targetValue: 100,
            thresholdValue: 70,
            stretchTarget: 100,
            remarks: 'Completion tracked via LMS portal.',
            itemStatus: 'assigned',
          });
        }
      }

      if (itemDocs.length > 0) {
        const createdItems = await KpiItem.bulkCreate(itemDocs);
        itemCount += createdItems.length;
      }

      const processed = Math.min(batchStart + BATCH_SIZE, allNonAdminData.length);
      console.log(`  Processed ${processed}/${allNonAdminData.length} users (${assignmentCount} assignments, ${itemCount} KPI items)`);
    }

    // ── Summary ──
    console.log('\n========================================');
    console.log('  SEED COMPLETE');
    console.log('========================================');
    console.log(`\n  Total users: ${employeeData.length} (1 admin, ${managerCount} managers, ${employeeCount} employees)`);
    console.log(`  Departments: ${departments.length}`);
    console.log(`  Appraisal cycles: ${cycles.length} (FY ${FY})`);
    console.log(`  PLI rule sets: 4`);
    console.log(`  KPI Assignments: ${assignmentCount}`);
    console.log(`  KPI Items: ${itemCount}`);
    console.log(`\n  KPIs assigned:`);
    console.log('  ─────────────────────────────────────');
    console.log('  Attendance (10%) → All open months, all users');
    console.log('  Claude Training Completion (20%) → April 2026 only');
    console.log(`\n  Reporting hierarchy:`);
    console.log('  ─────────────────────────────────────');

    // Print manager → team size
    const mgrTeamSize = {};
    employeeData.forEach((e) => {
      if (e.managerCode) {
        mgrTeamSize[e.managerCode] = (mgrTeamSize[e.managerCode] || 0) + 1;
      }
    });
    Object.entries(mgrTeamSize)
      .sort((a, b) => b[1] - a[1])
      .forEach(([code, count]) => {
        const mgr = employeeData.find((e) => e.code === code);
        console.log(`  ${mgr?.name || code} (${code}): ${count} direct reports`);
      });

    console.log('\n  Login credentials (all passwords: password123):');
    console.log('  ─────────────────────────────────────');
    console.log('  Admin:    admin@mobilise.co.in  or  MLP001');
    console.log('  Manager:  mlp002@mobilise.co.in or  MLP002 (Smriti Sharma)');
    console.log('  Manager:  mlp041@mobilise.co.in or  MLP041 (Lal Singh)');
    console.log('  Employee: mlp159@mobilise.co.in or  MLP159');
    console.log('  ... and all other employee codes');
    console.log('========================================\n');

    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
};

seed();
