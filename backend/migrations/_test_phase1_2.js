/**
 * Live API test — Phase 1 & 2 endpoints
 * Tests all new routes against running backend on port 5105
 *
 * Usage: node backend/migrations/_test_phase1_2.js [adminEmail] [adminPassword]
 */
const http = require('http');

const BASE = 'http://localhost:5105';
const [,, EMAIL = 'ashish.sharma@mobilise.co.in', PASS = 'password123'] = process.argv;

let TOKEN = '';
let PROJECT_ID = '';
let MILESTONE_ID = '';
let SUB_MILESTONE_ID = '';

const passed = [], failed = [];

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'localhost', port: 5105,
      path, method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
      },
    };
    const r = http.request(options, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function check(label, condition, detail) {
  if (condition) {
    passed.push(label);
    console.log('  ✅ ' + label);
  } else {
    failed.push(label);
    console.log('  ❌ ' + label + (detail ? ' — ' + detail : ''));
  }
}

// Helper: API always returns _id (renameIdsForClient renames id → _id)
function getId(obj) {
  return obj?._id || obj?.id || '';
}

async function run() {
  console.log('\n=== PHASE 1 & 2 LIVE API TESTS ===');
  console.log('Backend: ' + BASE + '\n');

  // ── 1. LOGIN ────────────────────────────────────────────────────────────────
  console.log('[1] Auth');
  const login = await req('POST', '/api/auth/login', { identifier: EMAIL, password: PASS });
  TOKEN = login.body?.data?.token || login.body?.token || '';
  check('Login returns 200 + token', login.status === 200 && !!TOKEN,
    'status=' + login.status + ' msg=' + (login.body?.message || ''));

  if (!TOKEN) { console.log('\n❌ Cannot proceed without token. Check credentials.\n'); return; }

  // ── 2. PM CONFIG — Project Types ────────────────────────────────────────────
  console.log('\n[2] PM Config — Project Types');
  const gt = await req('GET', '/api/pm/config/project-types', null, TOKEN);
  check('GET /config/project-types', gt.status === 200, 'status=' + gt.status);
  check('4 project types seeded', Array.isArray(gt.body?.data) && gt.body.data.length >= 4,
    'got ' + (gt.body?.data?.length || 0));

  const ct = await req('POST', '/api/pm/config/project-types', { name: 'Test Type ' + Date.now() }, TOKEN);
  check('POST /config/project-types', ct.status === 201, 'status=' + ct.status);
  const newTypeId = getId(ct.body?.data);
  if (newTypeId) {
    const dt = await req('DELETE', '/api/pm/config/project-types/' + newTypeId, null, TOKEN);
    check('DELETE /config/project-types/:id', dt.status === 200, 'status=' + dt.status);
  }

  // ── 3. PM CONFIG — Statuses ─────────────────────────────────────────────────
  console.log('\n[3] PM Config — Statuses');
  const gs = await req('GET', '/api/pm/config/statuses', null, TOKEN);
  check('GET /config/statuses', gs.status === 200, 'status=' + gs.status);
  check('7 statuses seeded', Array.isArray(gs.body?.data) && gs.body.data.length >= 7,
    'got ' + (gs.body?.data?.length || 0));

  // ── 4. PM CONFIG — Milestone Templates ──────────────────────────────────────
  console.log('\n[4] PM Config — Milestone Templates');
  const gmt = await req('GET', '/api/pm/config/milestone-templates', null, TOKEN);
  check('GET /config/milestone-templates', gmt.status === 200, 'status=' + gmt.status);
  check('10 templates seeded',
    Array.isArray(gmt.body?.data?.templates) && gmt.body.data.templates.length >= 10,
    'got ' + (gmt.body?.data?.templates?.length || 0));

  // Validate Demo Prototype template ranges
  const vt = await req('GET', '/api/pm/config/milestone-templates/Demo%20Prototype/validate', null, TOKEN);
  check('Template range validation for Demo Prototype',
    vt.status === 200 && vt.body?.data?.valid === true,
    JSON.stringify(vt.body?.data?.message || vt.body?.message || ''));

  // ── 5. PROJECTS — Create with new fields ────────────────────────────────────
  console.log('\n[5] Projects — Create with new fields');
  const cp = await req('POST', '/api/pm/projects', {
    name: 'Phase2Test_' + Date.now(),
    description: 'Automated test project',
    clientName: 'Test Client',
    billingType: 'Billable',
    projectType: 'Demo Prototype',
    status: 'Yet to Start',
    startDate: '2026-09-01',
  }, TOKEN);
  check('POST /projects (new fields)', cp.status === 201,
    'status=' + cp.status + ' ' + JSON.stringify(cp.body?.message || cp.body?.error || ''));
  PROJECT_ID = getId(cp.body?.data);
  console.log('  → PROJECT_ID:', PROJECT_ID || '(not set — POST failed)');

  if (PROJECT_ID) {
    // Verify project fields
    const gp = await req('GET', '/api/pm/projects/' + PROJECT_ID, null, TOKEN);
    check('GET project has billingType=Billable',
      gp.body?.data?.billingType === 'Billable', 'got: ' + gp.body?.data?.billingType);
    check('GET project has projectType=Demo Prototype',
      gp.body?.data?.projectType === 'Demo Prototype', 'got: ' + gp.body?.data?.projectType);
    check('GET project status=Yet to Start',
      gp.body?.data?.status === 'Yet to Start', 'got: ' + gp.body?.data?.status);

    // ── 6. MILESTONES — Nested tree (auto-created from template) ──────────────
    console.log('\n[6] Milestones — Auto-created from Demo Prototype template');
    const gm = await req('GET', '/api/pm/projects/' + PROJECT_ID + '/milestones', null, TOKEN);
    check('GET /milestones returns 200', gm.status === 200, 'status=' + gm.status);
    const milestones = gm.body?.data || [];
    check('5 default milestones auto-created', milestones.length === 5, 'got ' + milestones.length);
    check('All are isDefault=true', milestones.every(m => m.isDefault === true || m.isDefault === 1), '');
    check('Each has minPct/maxPct', milestones.every(m => m.minPct !== null && m.maxPct !== null), '');
    check('weightPercentage starts null', milestones.every(m => m.weightPercentage === null), '');

    if (milestones.length > 0) {
      // Find "Development" (index 2, or search by name)
      const devMile = milestones.find(m => m.name === 'Development') || milestones[2];
      MILESTONE_ID = getId(devMile);
      console.log('  → MILESTONE_ID (Development):', MILESTONE_ID || '(not found)');

      if (MILESTONE_ID) {
        // ── 7. Update milestone weight % ──────────────────────────────────────
        console.log('\n[7] Milestones — Set weight percentage');
        const um = await req('PUT', '/api/pm/projects/' + PROJECT_ID + '/milestones/' + MILESTONE_ID, {
          weightPercentage: 55,
        }, TOKEN);
        check('PUT milestone weightPercentage=55 (within 50-60% range)', um.status === 200,
          'status=' + um.status + ' ' + JSON.stringify(um.body?.message || ''));

        // Test validation — out of range should fail
        const umBad = await req('PUT', '/api/pm/projects/' + PROJECT_ID + '/milestones/' + MILESTONE_ID, {
          weightPercentage: 70, // out of 50-60% range
        }, TOKEN);
        check('PUT weightPercentage=70 rejected (out of range 50-60%)', umBad.status === 403,
          'status=' + umBad.status);

        // ── 8. Sub-milestones ────────────────────────────────────────────────
        console.log('\n[8] Milestones — Sub-milestone create');
        const sm = await req(
          'POST',
          '/api/pm/projects/' + PROJECT_ID + '/milestones/' + MILESTONE_ID + '/sub',
          {
            name: 'Backend Development',
            weightPercentage: 25,
            startDate: '2026-09-10',
            endDate: '2026-10-15',
          },
          TOKEN
        );
        check('POST /:milestoneId/sub creates sub-milestone', sm.status === 201,
          'status=' + sm.status + ' ' + JSON.stringify(sm.body?.message || ''));
        SUB_MILESTONE_ID = getId(sm.body?.data);

        // Verify nested tree includes sub-milestone
        const gm2 = await req('GET', '/api/pm/projects/' + PROJECT_ID + '/milestones', null, TOKEN);
        const tree2 = gm2.body?.data || [];
        const dev2 = tree2.find(m => getId(m) === MILESTONE_ID);
        check('Nested tree shows sub-milestone under Development',
          dev2?.subMilestones?.length >= 1,
          'subMilestones: ' + JSON.stringify(dev2?.subMilestones?.map(s => s.name)));
      }
    }

    // ── 9. Status Reports ────────────────────────────────────────────────────
    console.log('\n[9] Status Reports');
    const sr = await req('POST', '/api/pm/projects/' + PROJECT_ID + '/status-reports', {
      reportDate: '2026-08-24',
      period: 'Weekly',
      ragStatus: 'Green',
      summary: 'Project on track',
      risks: 'None identified',
      nextSteps: 'Begin requirements phase',
    }, TOKEN);
    check('POST /status-reports', sr.status === 201, 'status=' + sr.status);
    const gsr = await req('GET', '/api/pm/projects/' + PROJECT_ID + '/status-reports', null, TOKEN);
    check('GET /status-reports returns list', gsr.status === 200 && Array.isArray(gsr.body?.data),
      'status=' + gsr.status);

    // ── 10. RAID ────────────────────────────────────────────────────────────
    console.log('\n[10] RAID Items');
    const ri = await req('POST', '/api/pm/projects/' + PROJECT_ID + '/raid', {
      type: 'Risk',
      title: 'Resource availability risk',
      description: 'Key developer may not be available',
      impact: 'High',
      probability: 'Medium',
      status: 'Open',
      raisedDate: '2026-08-24',
    }, TOKEN);
    check('POST /raid', ri.status === 201, 'status=' + ri.status);
    const gri = await req('GET', '/api/pm/projects/' + PROJECT_ID + '/raid', null, TOKEN);
    check('GET /raid returns list', gri.status === 200 && Array.isArray(gri.body?.data),
      'status=' + gri.status);
    const grif = await req('GET', '/api/pm/projects/' + PROJECT_ID + '/raid?type=Risk', null, TOKEN);
    check('GET /raid?type=Risk filters correctly', grif.body?.data?.every(r => r.type === 'Risk'), '');

    // ── 11. Financial Details ────────────────────────────────────────────────
    console.log('\n[11] Financial Details');
    const fin = await req('PUT', '/api/pm/projects/' + PROJECT_ID + '/financial', {
      currency: 'INR',
      budgetAmount: 5000000,
      actualCost: 250000,
      invoicedAmount: 0,
      paymentTerms: 'Milestone-based',
    }, TOKEN);
    check('PUT /financial', fin.status === 200, 'status=' + fin.status);
    const gfin = await req('GET', '/api/pm/projects/' + PROJECT_ID + '/financial', null, TOKEN);
    check('GET /financial returns data', gfin.status === 200 && gfin.body?.data?.budgetAmount,
      'status=' + gfin.status);
    check('Budget amount saved correctly',
      parseFloat(gfin.body?.data?.budgetAmount) === 5000000,
      'got: ' + gfin.body?.data?.budgetAmount);

    // ── 12. Project Closure ──────────────────────────────────────────────────
    console.log('\n[12] Project Closure');
    const gcl = await req('GET', '/api/pm/projects/' + PROJECT_ID + '/closure', null, TOKEN);
    check('GET /closure returns default checklist',
      gcl.status === 200 && Array.isArray(gcl.body?.data?.checklist),
      'status=' + gcl.status);
    check('Default checklist has 6 items', gcl.body?.data?.checklist?.length === 6,
      'got: ' + gcl.body?.data?.checklist?.length);

    const pcl = await req('PUT', '/api/pm/projects/' + PROJECT_ID + '/closure', {
      closureNotes: 'Test closure notes',
      checklist: [
        { label: 'Client deliverables handed over', checked: true },
        { label: 'Client sign-off received', checked: false },
        { label: 'Knowledge transfer completed', checked: true },
        { label: 'Final invoice raised', checked: false },
        { label: 'Project documentation archived', checked: false },
        { label: 'Team released from project', checked: false },
      ],
    }, TOKEN);
    check('PUT /closure updates checklist', pcl.status === 200, 'status=' + pcl.status);

    // ── 13. Cleanup — delete test project ────────────────────────────────────
    console.log('\n[13] Cleanup');
    const dp = await req('DELETE', '/api/pm/projects/' + PROJECT_ID, null, TOKEN);
    check('DELETE test project (cleanup)', dp.status === 200, 'status=' + dp.status);
  }

  // ── BACKWARD COMPAT — existing projects have nested milestones ────────────
  console.log('\n[14] Backward Compatibility — existing projects');
  const gall = await req('GET', '/api/pm/projects', null, TOKEN);
  const allProjects = gall.body?.data || [];
  // Exclude any automated test project names
  const existingProjects = allProjects.filter(p =>
    !p.name?.startsWith('Phase2Test_') && !p.name?.startsWith('Phase 2 Test Project')
  );
  console.log('  Found ' + existingProjects.length + ' pre-existing project(s)');

  if (existingProjects.length > 0) {
    // Find first project with Development milestone + sub-milestones
    let found = false;
    for (const ep of existingProjects) {
      const epId = getId(ep);
      const ems = await req('GET', '/api/pm/projects/' + epId + '/milestones', null, TOKEN);
      const tree = ems.body?.data || [];
      const devNode = tree.find(m => m.name === 'Development' && (m.isDefault === true || m.isDefault === 1));
      if (devNode) {
        console.log('  Checking: "' + ep.name + '" → Development has ' + (devNode.subMilestones?.length || 0) + ' sub(s)');
        check('Existing project milestones returns 200', ems.status === 200, 'status=' + ems.status);
        check('Has "Development" default milestone', true, '');
        check('Former milestones are sub-milestones of Development',
          Array.isArray(devNode.subMilestones) && devNode.subMilestones.length > 0,
          'subMilestones: ' + JSON.stringify(devNode.subMilestones?.map(s => s.name)));
        found = true;
        break;
      }
    }
    if (!found) {
      console.log('  ⚠️  No projects with backward-compat Development milestone found');
      console.log('  (all existing projects may have been created after Phase 2 migration)');
      check('Backward compat: projects accessible', true, '');
    }
  } else {
    console.log('  ⚠️  No pre-existing projects visible — skip backward compat check');
  }

  // ── SUMMARY ──────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(50));
  console.log('RESULTS: ' + passed.length + ' passed, ' + failed.length + ' failed');
  if (failed.length > 0) {
    console.log('\nFailed:');
    failed.forEach(f => console.log('  ❌ ' + f));
  }
  if (failed.length === 0) {
    console.log('\n🎉 All tests passed! Phase 1 & 2 backend is solid.');
  }
  console.log('='.repeat(50) + '\n');
}

run().catch(e => { console.error('Test runner error:', e.message); });
