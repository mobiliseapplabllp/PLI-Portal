require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
require('../src/models/associations');
const PmProjectType       = require('../src/models/pm/PmProjectType');
const PmStatus            = require('../src/models/pm/PmStatus');
const PmMilestoneTemplate = require('../src/models/pm/PmMilestoneTemplate');
const Milestone           = require('../src/models/pm/Milestone');
const Project             = require('../src/models/pm/Project');
const sequelize           = require('../src/config/database');

async function run() {
  console.log('\n=== PHASE 2 VERIFICATION ===\n');

  const types     = await PmProjectType.findAll({ attributes: ['id','name'] });
  const statuses  = await PmStatus.findAll({ attributes: ['id','name','color'] });
  const templates = await PmMilestoneTemplate.findAll({ attributes: ['id','projectType','name','minPct','maxPct'] });
  const defaults  = await Milestone.findAll({ where: { isDefault: true }, attributes: ['id','name','projectId','weightPercentage'] });
  const projects  = await Project.findAll({ attributes: ['id','name','status','billingType','projectType','accountManagerId'] });

  console.log('Project Types (' + types.length + '):');
  types.forEach(t => console.log('  -', t.name));

  console.log('\nStatuses (' + statuses.length + '):');
  statuses.forEach(s => console.log('  -', s.name, s.color));

  console.log('\nMilestone Templates (' + templates.length + '):');
  templates.forEach(t => console.log('  -', t.projectType + ' /', t.name, '[' + t.minPct + '-' + t.maxPct + '%]'));

  console.log('\nDefault Milestones (' + defaults.length + ') [backward compat]:');
  defaults.forEach(d => console.log('  -', d.name, '| project:', d.projectId, '| weight:', d.weightPercentage + '%'));

  console.log('\nProjects (' + projects.length + '):');
  projects.forEach(p => console.log('  -', p.name, '| status:', p.status, '| billing:', p.billingType, '| type:', p.projectType || '(unset)'));

  // Test milestone service (nested tree)
  const milestoneService = require('../src/services/pm/milestone.service');
  if (projects.length > 0) {
    const fakeUser = { _id: 'admin', role: 'admin' };
    const tree = await milestoneService.getMilestones(projects[0].id, fakeUser);
    console.log('\nNested milestone tree for "' + projects[0].name + '":');
    tree.forEach(m => {
      console.log('  [DEFAULT] ' + m.name + ' (' + (m.weightPercentage || '?') + '%)');
      (m.subMilestones || []).forEach(s => console.log('    [SUB] ' + s.name));
    });
  }

  console.log('\n=== PHASE 2 BACKEND: ALL OK ===\n');
  await sequelize.close();
}

run().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
