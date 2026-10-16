const { sequelize } = require('../test/_helpers');
const { validationResult } = require('express-validator');
const { updateCycleValidator } = require('../src/validators/cycle.validator');
const Department = require('../src/models/Department');

(async () => {
  const dept = await Department.findOne({ where: { name: 'Operations' } });
  console.log('Operations dept:', dept?.id, dept?.name);

  // Simulate the exact body the edit form would send
  const body = {
    status: 'open',
    departmentId: dept?.id || '',
    commitmentDeadline: '2026-07-10',
    employeeSubmissionDeadline: '2026-07-04',
    managerReviewDeadline: '2026-07-09',
    finalReviewDeadline: '2026-07-14',
  };
  console.log('Simulated body:', body);

  const req = { body };
  for (const validator of updateCycleValidator) {
    await validator.run(req);
  }
  const errors = validationResult(req);
  console.log('Validation errors:', JSON.stringify(errors.array(), null, 2));

  await sequelize.close();
})();
