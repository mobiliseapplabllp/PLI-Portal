/**
 * KPI module smoke test — READ-ONLY. The KPI module must keep working through
 * every change elsewhere: models match the schema, the pure scoring helpers
 * behave, route modules load, middleware exports what routes expect.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_helpers');

const KPI_MODELS = [
  'AppraisalCycle', 'KpiAssignment', 'KpiItem', 'KpiPlan', 'KpiPlanItem', 'KpiTemplate',
  'QuarterlyApproval', 'QuarterlyApprovalItem', 'PliRule', 'PliSlab', 'ScoringConfig',
  'User', 'Department', 'Notification', 'AuditLog',
];
const KPI_ROUTES = [
  'cycle', 'kpiAssignment', 'kpiItem', 'kpiPlan', 'kpiTemplate', 'pliRule', 'scoringConfig',
  'finalApprover', 'dashboard', 'report', 'user', 'department', 'auth', 'notification', 'audit',
];
const KPI_SERVICES = [
  'cycle', 'kpiAssignment', 'kpiItem', 'kpiPlan', 'kpiTemplate', 'pliRule', 'scoringConfig',
  'finalApprover', 'dashboard', 'report', 'user', 'auth', 'notification',
];

test('KPI module smoke (read-only)', async (t) => {
  try {
    await t.test('every KPI model loads and findOne succeeds (no schema drift)', async () => {
      for (const name of KPI_MODELS) {
        const M = require(`../src/models/${name}`);
        assert.equal(typeof M.findOne, 'function', `${name} is a Sequelize model`);
        await assert.doesNotReject(M.findOne({ order: [['createdAt', 'DESC']] }), `${name}.findOne`);
      }
    });

    await t.test('KPI associations are registered', () => {
      const KpiAssignment = require('../src/models/KpiAssignment');
      const KpiItem = require('../src/models/KpiItem');
      assert.ok(KpiAssignment.associations.items, 'KpiAssignment.items');
      assert.ok(KpiItem.associations.assignment, 'KpiItem.assignment');
      assert.ok(require('../src/models/User').associations.department, 'User.department');
    });

    await t.test('KPI route modules and services require cleanly', () => {
      for (const r of KPI_ROUTES) {
        const router = require(`../src/routes/${r}.routes`);
        assert.equal(typeof router, 'function', `${r}.routes exports an express Router`);
        assert.ok(Array.isArray(router.stack) && router.stack.length > 0, `${r}.routes registers routes`);
      }
      for (const s of KPI_SERVICES) {
        const svc = require(`../src/services/${s}.service`);
        assert.ok(svc && typeof svc === 'object' && Object.keys(svc).length > 0, `${s}.service exports functions`);
      }
      const root = require('../src/routes');
      assert.equal(typeof root, 'function', 'routes/index.js mounts');
    });

    await t.test('authenticate / authorize / helpdeskAuth middleware exports', () => {
      const { authenticate } = require('../src/middleware/auth');
      const { authorize } = require('../src/middleware/rbac');
      const { helpdeskAuth, requireHdPermission } = require('../src/middleware/helpdeskAuth');
      const { ForbiddenError } = require('../src/utils/errors');
      assert.equal(typeof authenticate, 'function');
      assert.equal(authenticate.length, 3);
      assert.equal(typeof authorize, 'function');
      const guard = authorize('admin', 'manager');
      assert.equal(typeof guard, 'function');
      assert.equal(guard.length, 3);

      const next = H.mockNext();
      guard({ user: { role: 'employee' } }, {}, next);
      assert.ok(next.error instanceof ForbiddenError, 'employee is refused');
      const next2 = H.mockNext();
      guard({ user: { role: 'manager' } }, {}, next2);
      assert.equal(next2.error, undefined, 'manager passes');
      const next3 = H.mockNext();
      guard({}, {}, next3);
      assert.ok(next3.error instanceof ForbiddenError, 'no user is refused');

      assert.equal(typeof helpdeskAuth, 'function');
      assert.equal(typeof requireHdPermission('canAssign'), 'function');
    });

    await t.test('scoreCalculator: multiplier-based scoring', () => {
      const S = require('../src/utils/scoreCalculator');
      assert.equal(S.statusToMultiplier('Exceeds'), 1.5);
      assert.equal(S.statusToMultiplier('Meets'), 1);
      assert.equal(S.statusToMultiplier('Below'), -0.5);
      assert.equal(S.statusToMultiplier(null), 0);
      assert.equal(S.statusToMultiplier('Exceeds', { exceedsMultiplier: '2.0', meetsMultiplier: '1.0', belowMultiplier: '0' }), 2);
      assert.equal(S.statusToMultiplier('Below', { belowMultiplier: '-1' }), -1);

      assert.equal(S.calculateActualWeightage(10, 'Exceeds'), 15);
      assert.equal(S.calculateActualWeightage('10', 'Below'), -5);
      assert.equal(S.calculateActualWeightage(10, null), 0);

      const items = [
        { calculatedQuarterlyActual: 30, monthlyWeightage: 10, quarterlyAchievedWeightage: 15 },
        { calculatedQuarterlyActual: 15, monthlyWeightage: 10, quarterlyAchievedWeightage: 30 },
      ];
      assert.equal(S.calculateQuarterlyScoreFromActuals(items), 75);      // 45 / 60
      assert.equal(S.calculateQuarterlyScoreFromFAValues(items), 75);
      assert.equal(S.calculateQuarterlyScoreFromActuals([]), null);
      assert.equal(S.calculateQuarterlyScoreFromActuals([{ calculatedQuarterlyActual: 5, monthlyWeightage: 0 }]), null);
    });

    await t.test('scoreCalculator: status-sum and legacy numeric flows', () => {
      const S = require('../src/utils/scoreCalculator');
      assert.equal(S.statusToNumeric('Exceeds'), 1);
      assert.equal(S.statusToNumeric('Below'), -1);
      assert.equal(S.statusToNumeric('Meets'), 0);

      assert.equal(S.calculateMonthlyScoreFromAchievedWeightage([
        { finalApproverAchievedWeightage: '10.5' }, { finalApproverAchievedWeightage: 'n/a' }, { finalApproverAchievedWeightage: 4.25 },
      ]), 14.75);
      assert.equal(S.calculateMonthlyScoreFromAchievedWeightage([]), null);
      assert.equal(S.calculateQuarterlyScoreFromApprovalItems([{ quarterlyAchievedWeightage: 20 }, { quarterlyAchievedWeightage: '22.5' }]), 42.5);

      assert.equal(S.calculateMonthlyScore([{ finalScore: 80, weightage: 50 }, { finalScore: 100, weightage: 50 }]), 90);
      assert.equal(S.calculateMonthlyScore([{ finalScore: 80, weightage: 25 }, { finalScore: 100, weightage: 25 }]), 90);   // normalised
      assert.equal(S.calculateMonthlyScore([{ finalScore: null, weightage: 50 }]), 0);
      assert.equal(S.calculateMonthlyScore([]), 0);

      assert.equal(S.calculateQuarterlyScore([80, null, 100]), 90);
      assert.equal(S.calculateQuarterlyScore([null]), null);
      assert.equal(S.calculateQuarterlyScore([33.333, 33.333, 33.333]), 33.33);
    });

    await t.test('scoreCalculator.matchPliSlab', () => {
      const S = require('../src/utils/scoreCalculator');
      const slabs = [
        { minScore: 0,  maxScore: 59.99, payoutPercentage: 0,   label: 'None' },
        { minScore: 60, maxScore: 79.99, payoutPercentage: 50,  label: 'Half' },
        { minScore: 80, maxScore: 100,   payoutPercentage: 100, label: 'Full' },
      ];
      assert.deepEqual(S.matchPliSlab(85, slabs), { payoutPercentage: 100, label: 'Full', minScore: 80, maxScore: 100 });
      assert.equal(S.matchPliSlab(60, slabs).label, 'Half');
      assert.equal(S.matchPliSlab(79.995, slabs), null);      // falls in the gap between slabs
      assert.equal(S.matchPliSlab(101, slabs), null);
      assert.equal(S.matchPliSlab(null, slabs), null);
      assert.equal(S.matchPliSlab(50, []), null);
    });

    await t.test('quarterHelper: FY runs Apr-Mar', () => {
      const Q = require('../src/utils/quarterHelper');
      assert.equal(Q.getQuarterFromMonth(4), 'Q1');
      assert.equal(Q.getQuarterFromMonth(9), 'Q2');
      assert.equal(Q.getQuarterFromMonth(12), 'Q3');
      assert.equal(Q.getQuarterFromMonth(1), 'Q4');
      assert.equal(Q.getQuarterFromMonth(13), null);
      assert.deepEqual(Q.getMonthsInQuarter('Q2'), [7, 8, 9]);
      assert.deepEqual(Q.getMonthsInQuarter('Q4'), [1, 2, 3]);
      assert.deepEqual(Q.getMonthsInQuarter('Q9'), []);
      assert.equal(Q.getFinancialYear(new Date(2026, 8, 13)), '2026-27');
      assert.equal(Q.getFinancialYear(new Date(2027, 0, 15)), '2026-27');
      assert.equal(Q.getFinancialYear(new Date(2027, 3, 1)), '2027-28');
      assert.equal(Q.getFinancialYear(new Date(2027, 2, 31)), '2026-27');
      assert.deepEqual(Q.getFYAndQuarter(new Date(2026, 8, 13)), { financialYear: '2026-27', quarter: 'Q2', month: 9 });
      assert.equal(Q.getMonthName(9), 'September');
      assert.equal(Q.getMonthName(0), '');
    });
  } finally {
    await H.closeDb();
  }
});
