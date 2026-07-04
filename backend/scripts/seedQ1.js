/**
 * Q1 2026-27 Dummy Data Seeder — Final Approval Ready
 *
 * Creates complete KPI data for 7 employees under DHEERAJ SHARMA (MLP043):
 *   - 3 monthly KpiAssignments per employee (April, May, June 2026)
 *   - 12 KPI items per assignment (4 KPI heads, realistic weightages summing to 100%)
 *   - All statuses: commitment_approved → employee_submitted → manager_reviewed
 *   - Weightage formula: monthlyWt × multiplier (Meets=1, Below=-0.5, Exceeds=1.5)
 *
 * Run: node scripts/seedQ1.js
 * Safe to re-run (findOrCreate throughout).
 */
require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const sequelize = require('../src/config/database');
require('../src/models/associations');
const User          = require('../src/models/User');
const KpiAssignment = require('../src/models/KpiAssignment');
const KpiItem       = require('../src/models/KpiItem');

// ── Config ────────────────────────────────────────────────────────────────────
const FY        = '2026-27';
const QUARTER   = 'Q1';
const Q1_MONTHS = [4, 5, 6]; // April=4, May=5, June=6

const TARGET_CODES = [
  'MLP104', // ANUJ KUMAR YADAV
  'MLP113', // GANESH PANDEY
  'MLP173', // GOURAV SHARMA
  'MLP108', // MAHAVIR
  'MLP092', // PUNEET YADAV
  'MLP100', // SONAM OJHA
  'MLP128', // VEER VIKRAM SINGH
];

// ── KPI Plan (12 items, weightages sum = 100 per month) ──────────────────────
// kpiHead: Performance(40%) | CustomerCentric(30%) | CoreValues(20%) | Trainings(10%)
const KPI_PLAN = [
  // Performance — 4 items × 10% = 40%
  { kpiHead: 'Performance',     title: 'Revenue Target Achievement',       monthlyWt: 10, category: 'Financial',   unit: 'Percentage', target: 100, threshold: 80 },
  { kpiHead: 'Performance',     title: 'Project Delivery On-Time Rate',    monthlyWt: 10, category: 'Operational', unit: 'Percentage', target: 95,  threshold: 80 },
  { kpiHead: 'Performance',     title: 'Process Efficiency Index',         monthlyWt: 10, category: 'Operational', unit: 'Number',     target: 10,  threshold: 6  },
  { kpiHead: 'Performance',     title: 'Zero Defect Deliverables (%)',     monthlyWt: 10, category: 'Quality',     unit: 'Percentage', target: 100, threshold: 90 },
  // CustomerCentric — 3 items × 10% = 30%
  { kpiHead: 'CustomerCentric', title: 'Client Satisfaction Score (CSAT)', monthlyWt: 10, category: 'Quality',     unit: 'Rating',     target: 5,   threshold: 3.5 },
  { kpiHead: 'CustomerCentric', title: 'Client Escalation Resolution <48h',monthlyWt: 10, category: 'Operational', unit: 'Percentage', target: 100, threshold: 85 },
  { kpiHead: 'CustomerCentric', title: 'New Client Onboarding SLA Met',    monthlyWt: 10, category: 'Compliance',  unit: 'Percentage', target: 100, threshold: 90 },
  // CoreValues — 3 items, total 20%
  { kpiHead: 'CoreValues',      title: 'Compliance Adherence Rate',        monthlyWt: 7,  category: 'Compliance',  unit: 'Percentage', target: 100, threshold: 95 },
  { kpiHead: 'CoreValues',      title: 'Team Collaboration Score',         monthlyWt: 7,  category: 'Other',       unit: 'Rating',     target: 5,   threshold: 3.5 },
  { kpiHead: 'CoreValues',      title: 'Policy & SOP Adherence',           monthlyWt: 6,  category: 'Compliance',  unit: 'Percentage', target: 100, threshold: 95 },
  // Trainings — 2 items, total 10%
  { kpiHead: 'Trainings',       title: 'Training Hours Completed',         monthlyWt: 5,  category: 'Development', unit: 'Number',     target: 8,   threshold: 4  },
  { kpiHead: 'Trainings',       title: 'Certification / Skill Upgrade',    monthlyWt: 5,  category: 'Development', unit: 'Boolean',    target: 1,   threshold: 0  },
];

// Total monthly weightage = 10+10+10+10 + 10+10+10 + 7+7+6 + 5+5 = 100 ✓

// ── Scoring multipliers (system defaults, no config created yet) ──────────────
const MULTIPLIER = { Meets: 1.0, Below: -0.5, Exceeds: 1.5 };

// ── Per-employee, per-month status patterns (varied for realism) ──────────────
// [month4, month5, month6] statuses for each KPI item
// emp 0: high performer  emp 1: steady  emp 2: improving  etc.
const STATUS_PATTERNS = [
  ['Exceeds', 'Exceeds', 'Exceeds'],  // star — all exceeds
  ['Meets',   'Meets',   'Meets'],    // solid — all meets
  ['Below',   'Meets',   'Exceeds'],  // improving trajectory
  ['Meets',   'Exceeds', 'Meets'],    // peak in middle
  ['Exceeds', 'Meets',   'Meets'],    // strong start
  ['Meets',   'Meets',   'Exceeds'],  // strong finish
  ['Below',   'Meets',   'Meets'],    // recovered after slow start
];

function getStatus(empIdx, kpiIdx, monthIdx) {
  return STATUS_PATTERNS[(empIdx + kpiIdx) % STATUS_PATTERNS.length][monthIdx];
}

// ── Calculated weightage formula ──────────────────────────────────────────────
// monthly_actual = monthlyWt × multiplier(status)
// quarterly_actual = m1_actual + m2_actual + m3_actual
// quarterly_score  = Σ(quarterly_actual) / Σ(3 × monthlyWt) × 100
function calcActual(monthlyWt, status) {
  return parseFloat((monthlyWt * MULTIPLIER[status]).toFixed(4));
}

// ── Commitment text per KPI ───────────────────────────────────────────────────
const COMMITMENTS = [
  'Achieve 100% revenue target through weekly pipeline tracking and proactive follow-ups.',
  'Deliver all assigned projects on time by maintaining sprint discipline and daily standups.',
  'Improve process efficiency by minimum 15% through automation and lean practices.',
  'Maintain zero defect rate using peer review gates and pre-delivery QA checklists.',
  'Maintain CSAT ≥ 4.2 through proactive communication and monthly client check-ins.',
  'Resolve 100% escalations within 48 hours via dedicated war-room approach.',
  'Ensure 100% SLA adherence for all new client onboarding within agreed timelines.',
  'Maintain ≥98% compliance rate with monthly internal compliance audits.',
  'Foster team collaboration with bi-weekly syncs and shared OKR tracking.',
  'Achieve zero SOP deviations and conduct refresher training for team monthly.',
  'Complete ≥8 training hours per month relevant to current project requirements.',
  'Complete at least one role-aligned certification by end of quarter.',
];

// Employee self-review comments [month4, month5, month6]
const SELF_COMMENTS = [
  ['Revenue target achieved at 102%.', 'Pipeline maintained, 98% target hit.', 'Exceptional month — 115% of target achieved.'],
  ['All 3 projects delivered on time.', 'On-time delivery at 95%.', 'Early delivery on 2 projects this month.'],
  ['Efficiency improved 14% via automation.', 'Gains sustained at 15%.', 'Further gains — efficiency at 18%.'],
  ['Zero defects this month.', 'One minor issue caught in QA gate.', 'Back to zero defects.'],
  ['CSAT: 4.4 this month.', 'CSAT maintained at 4.2.', 'CSAT improved to 4.6 post feedback initiative.'],
  ['All escalations closed within 24h.', '2 escalations resolved in 36h.', 'Zero escalations raised this month.'],
  ['All 3 onboardings completed within SLA.', 'SLA met for both clients onboarded.', 'Onboarding completed 2 days ahead of schedule.'],
  ['Compliance at 99%.', 'Maintained 98.5% compliance.', '100% compliance — zero audit findings.'],
  ['Team collaboration score 4/5.', 'Organised cross-functional workshop.', 'Score improved to 4.6/5.'],
  ['Zero SOP deviations; trained 1 new joiner.', 'Zero deviations maintained.', 'Refresher conducted for team of 5.'],
  ['9 training hours completed.', '10 hours — attended external webinar.', '8 hours completed with workshop.'],
  ['Enrolled in AWS Cloud Practitioner.', 'Completed 6 of 8 course modules.', 'Certification exam passed — AWS CP.'],
];

// Manager review comments
const MGR_COMMENTS = [
  'Performance is exactly on track as per the plan.',
  'Excellent results — consistently high output observed.',
  'Good improvement trajectory. Keep it up.',
  'Meets the expected benchmark for this period.',
  'Outstanding effort — significantly above expectations.',
  'Slight improvement needed but overall acceptable.',
  'Strong recovery — commendable performance this month.',
];

function mgrComment(eIdx, kIdx, mIdx) {
  return MGR_COMMENTS[(eIdx * 2 + kIdx + mIdx) % MGR_COMMENTS.length];
}

// ── Dates for each month ──────────────────────────────────────────────────────
const DATES = {
  4: { commit: '2026-04-05', submit: '2026-04-18', review: '2026-04-25' },
  5: { commit: '2026-05-05', submit: '2026-05-18', review: '2026-05-25' },
  6: { commit: '2026-06-05', submit: '2026-06-18', review: '2026-06-25' },
};

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  await sequelize.authenticate();
  console.log('✅ DB connected\n');

  const employees = await User.findAll({
    where: { employeeCode: TARGET_CODES },
    include: [{ association: 'manager', attributes: ['id', 'employeeCode', 'name'] }],
  });

  if (!employees.length) {
    console.error('❌ No employees found. Run main seed.js first.');
    process.exit(1);
  }

  console.log(`Seeding Q1 ${FY} for ${employees.length} employees:\n`);
  employees.forEach((e) => console.log(`  ${e.employeeCode} — ${e.name} → manager: ${e.manager?.employeeCode}`));
  console.log('');

  let totalAssignments = 0;
  let totalItems = 0;

  for (let eIdx = 0; eIdx < employees.length; eIdx++) {
    const emp = employees[eIdx];
    if (!emp.managerId) {
      console.warn(`  ⚠️  ${emp.employeeCode} has no manager — skipping`);
      continue;
    }

    console.log(`\n▸ ${emp.name} (${emp.employeeCode})`);

    for (let mIdx = 0; mIdx < Q1_MONTHS.length; mIdx++) {
      const month = Q1_MONTHS[mIdx];
      const d = DATES[month];
      const label = ['April', 'May', 'June'][mIdx];

      // ── Assignment ──
      const [assignment, created] = await KpiAssignment.findOrCreate({
        where: { employeeId: emp.id, financialYear: FY, month },
        defaults: {
          id: uuidv4(),
          quarter: QUARTER,
          managerId: emp.managerId,
          status: 'manager_reviewed',
          totalWeightage: 100,
          committedAt:         new Date(d.commit),
          employeeSubmittedAt: new Date(d.submit),
          managerReviewedAt:   new Date(d.review),
        },
      });

      if (!created) {
        await assignment.update({
          status: 'manager_reviewed',
          managerReviewedAt: new Date(d.review),
        });
      }

      console.log(`  ${label}: ${created ? 'created' : 'updated'} assignment`);
      totalAssignments++;

      // ── KPI Items ──
      for (let kIdx = 0; kIdx < KPI_PLAN.length; kIdx++) {
        const plan = KPI_PLAN[kIdx];
        const empStatus = getStatus(eIdx, kIdx, mIdx);
        const mgrStatus = empStatus; // manager agrees with employee self-review

        const monthActual = calcActual(plan.monthlyWt, mgrStatus);
        const numeric     = mgrStatus === 'Exceeds' ? 1 : mgrStatus === 'Below' ? -1 : 0;

        const [item, itemCreated] = await KpiItem.findOrCreate({
          where: { kpiAssignmentId: assignment.id, title: plan.title },
          defaults: {
            id: uuidv4(),
            category: plan.category,
            unit:     plan.unit,
            weightage: plan.monthlyWt,
            quarterlyWeightage: plan.monthlyWt * 3,
            targetValue:    plan.target,
            thresholdValue: plan.threshold,
            stretchTarget:  plan.target * 1.1,

            // Commitment
            commitValue: COMMITMENTS[kIdx],
            employeeCommitmentStatus: 'Meets',
            managerCommitmentApproval: 'approved',
            managerCommitmentComment: 'Commitment accepted and looks achievable.',
            committedAt: new Date(d.commit),
            itemStatus: 'manager_reviewed',

            // Self-review
            employeeStatus:  empStatus,
            employeeComment: SELF_COMMENTS[kIdx][mIdx],
            employeeSubmittedAt: new Date(d.submit),

            // Manager review
            managerStatus:         mgrStatus,
            managerComment:        mgrComment(eIdx, kIdx, mIdx),
            managerMonthlyNumeric: numeric,
            managerReviewedAt:     new Date(d.review),

            // Pre-calculated FA value (Weightage × Multiplier)
            finalApproverAchievedWeightage: monthActual,
            finalApproverStatus: mgrStatus,
          },
        });

        if (!itemCreated) {
          await item.update({
            managerStatus:         mgrStatus,
            managerMonthlyNumeric: numeric,
            managerReviewedAt:     new Date(d.review),
            itemStatus:            'manager_reviewed',
            finalApproverAchievedWeightage: monthActual,
            finalApproverStatus:   mgrStatus,
          });
        }

        totalItems++;
      }

      console.log(`         → ${KPI_PLAN.length} KPI items (weightage formula applied)`);
    }

    // Print expected quarterly score for this employee
    console.log(`\n  📊 Expected Q1 scores for ${emp.name}:`);
    let totalCalcActual = 0;
    let totalWeightage  = 0;
    for (let kIdx = 0; kIdx < KPI_PLAN.length; kIdx++) {
      const plan = KPI_PLAN[kIdx];
      let kpiActual = 0;
      for (let mIdx = 0; mIdx < Q1_MONTHS.length; mIdx++) {
        const status = getStatus(eIdx, kIdx, mIdx);
        kpiActual += calcActual(plan.monthlyWt, status);
      }
      totalCalcActual += kpiActual;
      totalWeightage  += plan.monthlyWt * 3;
      console.log(`     ${plan.title.padEnd(42)} → Q-Actual: ${kpiActual.toFixed(2).padStart(6)}  (Wt: ${plan.monthlyWt}%/mo × 3)`);
    }
    const qScore = totalWeightage > 0 ? ((totalCalcActual / totalWeightage) * 100).toFixed(2) : '—';
    console.log(`  ─────────────────────────────────────────────────────────────────`);
    console.log(`  Calc Quarterly Score = ${totalCalcActual.toFixed(2)} / ${totalWeightage} × 100 = ${qScore}%`);
  }

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`✅  Q1 ${FY} seed complete`);
  console.log(`    Assignments : ${totalAssignments}`);
  console.log(`    KPI items   : ${totalItems}`);
  console.log(`    Status      : All → manager_reviewed (ready for Final Approver)`);
  console.log('══════════════════════════════════════════════════════════════\n');

  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
