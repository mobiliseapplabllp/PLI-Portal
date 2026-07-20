/**
 * CSAT Demo Seed — Realistic IT Company Client Survey Data
 *
 * Creates:
 *   • 5 client organisations (real Indian IT industry verticals)
 *   • 3–5 employees per org
 *   • 3 professional CSAT surveys with real questions
 *
 * RUN (from project root):
 *   node backend/src/seeds/csat_demo_seed.js
 *
 * SAFE TO RE-RUN — uses findOrCreate where possible; surveys are skipped if name already exists.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { v4: uuidv4 } = require('uuid');
const sequelize = require('../config/database');

// Load associations so all FK relations are registered before queries
require('../models/associations');

const User                = require('../models/User');
const ClientOrganisation  = require('../models/csat/ClientOrganisation');
const ClientEmployee      = require('../models/csat/ClientEmployee');
const Survey              = require('../models/csat/Survey');
const SurveyQuestion      = require('../models/csat/SurveyQuestion');

// ─────────────────────────────────────────────────────────────────────────────
// SEED DATA
// ─────────────────────────────────────────────────────────────────────────────

const CLIENT_ORGS = [
  {
    name: 'Axis Bank Limited',
    description: 'Leading private sector bank — core banking modernisation project',
    contactPerson: 'Rajan Mehta',
    contactEmail: 'rajan.mehta@axisbank.com',
    contactPhone: '+91 22 4325 2525',
    industry: 'BFSI',
    employees: [
      { name: 'Rajan Mehta',       email: 'rajan.mehta@axisbank.com' },
      { name: 'Priya Krishnamurthy', email: 'priya.k@axisbank.com' },
      { name: 'Arun Desai',        email: 'arun.desai@axisbank.com' },
      { name: 'Sunita Rao',        email: 'sunita.rao@axisbank.com' },
    ],
  },
  {
    name: 'Apollo Hospitals Enterprise',
    description: 'Pan-India hospital network — HMIS integration and patient portal development',
    contactPerson: 'Dr. Anand Krishnan',
    contactEmail: 'anand.krishnan@apollohospitals.com',
    contactPhone: '+91 44 2829 0200',
    industry: 'Healthcare',
    employees: [
      { name: 'Dr. Anand Krishnan', email: 'anand.krishnan@apollohospitals.com' },
      { name: 'Meena Subramaniam',  email: 'meena.s@apollohospitals.com' },
      { name: 'Vikram Nair',        email: 'vikram.nair@apollohospitals.com' },
    ],
  },
  {
    name: 'Reliance Retail Limited',
    description: 'Retail tech transformation — ERP rollout and supply chain digitisation',
    contactPerson: 'Kavita Sharma',
    contactEmail: 'kavita.sharma@ril.com',
    contactPhone: '+91 22 3555 5000',
    industry: 'Retail',
    employees: [
      { name: 'Kavita Sharma',   email: 'kavita.sharma@ril.com' },
      { name: 'Deepak Gupta',    email: 'deepak.gupta@ril.com' },
      { name: 'Nisha Patel',     email: 'nisha.patel@ril.com' },
      { name: 'Rohit Agarwal',   email: 'rohit.agarwal@ril.com' },
      { name: 'Sneha Joshi',     email: 'sneha.joshi@ril.com' },
    ],
  },
  {
    name: 'HDFC Life Insurance',
    description: 'Digital transformation — policy management portal and claims automation',
    contactPerson: 'Shashank Verma',
    contactEmail: 'shashank.verma@hdfclife.com',
    contactPhone: '+91 22 6751 6666',
    industry: 'BFSI',
    employees: [
      { name: 'Shashank Verma',  email: 'shashank.verma@hdfclife.com' },
      { name: 'Pooja Malhotra',  email: 'pooja.malhotra@hdfclife.com' },
      { name: 'Amit Saxena',     email: 'amit.saxena@hdfclife.com' },
    ],
  },
  {
    name: 'Tata Motors Limited',
    description: 'Connected vehicle platform and dealer management system',
    contactPerson: 'Ravi Tiwari',
    contactEmail: 'ravi.tiwari@tatamotors.com',
    contactPhone: '+91 22 6665 8282',
    industry: 'Manufacturing',
    employees: [
      { name: 'Ravi Tiwari',     email: 'ravi.tiwari@tatamotors.com' },
      { name: 'Geeta Bhandari',  email: 'geeta.bhandari@tatamotors.com' },
      { name: 'Suresh Kumar',    email: 'suresh.kumar@tatamotors.com' },
      { name: 'Lalita Prasad',   email: 'lalita.prasad@tatamotors.com' },
    ],
  },
];

const SURVEYS = [
  // ── Survey 1: Project Delivery & Quality ─────────────────────────────────
  {
    name: 'Project Delivery & Quality Assessment',
    description:
      'We value your feedback on the recently delivered project phase. Your honest responses help us improve our delivery standards and ensure we consistently meet your expectations.',
    thankYouMessage:
      'Thank you for taking the time to complete this survey. Your feedback is invaluable to us and will be reviewed by our Delivery team within 48 hours.',
    questions: [
      {
        questionText: 'How satisfied are you with the overall quality of the deliverables provided?',
        helperText: 'Consider code quality, documentation, UI/UX, and overall completeness.',
        questionType: 'rating',
        minValue: 1, maxValue: 5,
        minLabel: 'Very Dissatisfied', maxLabel: 'Very Satisfied',
        isRequired: true, orderIndex: 0,
      },
      {
        questionText: 'Was the project delivered within the agreed timeline and milestones?',
        helperText: null,
        questionType: 'radio',
        options: [
          'Yes, delivered ahead of schedule',
          'Yes, delivered on schedule',
          'Minor delays but acceptable',
          'Significant delays occurred',
        ],
        isRequired: true, orderIndex: 1,
      },
      {
        questionText: 'How would you rate the technical expertise demonstrated by our development team?',
        helperText: 'Evaluate the team\'s domain knowledge, problem-solving skills, and technical decisions.',
        questionType: 'rating',
        minValue: 1, maxValue: 5,
        minLabel: 'Needs Improvement', maxLabel: 'Excellent',
        isRequired: true, orderIndex: 2,
      },
      {
        questionText: 'Which of the following areas do you feel we performed well in? (Select all that apply)',
        helperText: null,
        questionType: 'checkbox',
        options: [
          'Requirements gathering & understanding',
          'Code quality & best practices',
          'UI/UX design & usability',
          'Testing & QA rigour',
          'Documentation & knowledge transfer',
          'Post-delivery support',
        ],
        isRequired: false, orderIndex: 3,
      },
      {
        questionText: 'How effective was our communication throughout the project?',
        helperText: 'Consider frequency, clarity, and responsiveness of project updates and escalations.',
        questionType: 'rating',
        minValue: 1, maxValue: 5,
        minLabel: 'Very Poor', maxLabel: 'Outstanding',
        isRequired: true, orderIndex: 4,
      },
      {
        questionText: 'Were project risks and issues escalated and resolved in a timely manner?',
        helperText: null,
        questionType: 'select',
        options: [
          'Always — proactive and fast resolution',
          'Mostly — minor delays in some cases',
          'Sometimes — a few issues were not addressed promptly',
          'Rarely — escalation and resolution was poor',
          'Not applicable — no major issues arose',
        ],
        isRequired: true, orderIndex: 5,
      },
      {
        questionText: 'How would you rate the value for money delivered by this project engagement?',
        helperText: 'Consider the output quality relative to the investment made.',
        questionType: 'rating',
        minValue: 1, maxValue: 5,
        minLabel: 'Poor Value', maxLabel: 'Excellent Value',
        isRequired: true, orderIndex: 6,
      },
      {
        questionText: 'Please share any specific feedback, suggestions, or areas where you feel we can improve.',
        helperText: 'Your detailed comments help us take concrete improvement actions.',
        questionType: 'text',
        isRequired: false, orderIndex: 7,
      },
    ],
  },

  // ── Survey 2: Support & Maintenance ──────────────────────────────────────
  {
    name: 'Support & Maintenance Satisfaction Survey',
    description:
      'This survey measures your satisfaction with our ongoing support and maintenance services. We aim to provide best-in-class SLA adherence and issue resolution.',
    thankYouMessage:
      'Thank you for your feedback! Your responses have been shared with our Support Head and will be acted upon in our next service review.',
    questions: [
      {
        questionText: 'How satisfied are you with the speed of initial response when you raise a support ticket?',
        helperText: 'Our target SLA is P1: 1hr, P2: 4hr, P3: 8hr.',
        questionType: 'rating',
        minValue: 1, maxValue: 5,
        minLabel: 'Very Slow', maxLabel: 'Very Fast',
        isRequired: true, orderIndex: 0,
      },
      {
        questionText: 'What is the typical priority level of the issues you raise with our team?',
        helperText: null,
        questionType: 'select',
        options: [
          'P1 — Critical / Production down',
          'P2 — High / Major functionality impacted',
          'P3 — Medium / Minor functionality impacted',
          'P4 — Low / Cosmetic or enhancement',
        ],
        isRequired: true, orderIndex: 1,
      },
      {
        questionText: 'How effectively does our support team understand and resolve your issues?',
        helperText: 'Rate the quality and completeness of the resolutions provided.',
        questionType: 'rating',
        minValue: 1, maxValue: 5,
        minLabel: 'Not Effective', maxLabel: 'Highly Effective',
        isRequired: true, orderIndex: 2,
      },
      {
        questionText: 'How professional and courteous is our support team during interactions?',
        helperText: null,
        questionType: 'rating',
        minValue: 1, maxValue: 5,
        minLabel: 'Unprofessional', maxLabel: 'Highly Professional',
        isRequired: true, orderIndex: 3,
      },
      {
        questionText: 'Which support channels do you use most frequently? (Select all that apply)',
        helperText: null,
        questionType: 'checkbox',
        options: [
          'Email',
          'Phone / Call',
          'JIRA / Ticketing portal',
          'Microsoft Teams / Slack',
          'WhatsApp',
        ],
        isRequired: false, orderIndex: 4,
      },
      {
        questionText: 'Are you kept informed about the status of your open tickets?',
        helperText: 'Do you receive timely updates without needing to follow up?',
        questionType: 'radio',
        options: [
          'Yes, always — proactive updates without prompting',
          'Mostly — occasional follow-up needed',
          'Sometimes — I often have to chase for updates',
          'Rarely — updates are infrequent and unclear',
        ],
        isRequired: true, orderIndex: 5,
      },
      {
        questionText: 'How satisfied are you with the quality of our technical documentation and runbooks?',
        helperText: 'Consider user manuals, API docs, release notes, and troubleshooting guides.',
        questionType: 'rating',
        minValue: 1, maxValue: 5,
        minLabel: 'Very Poor', maxLabel: 'Excellent',
        isRequired: false, orderIndex: 6,
      },
      {
        questionText: 'Has our support team met your SLA commitments consistently over the past quarter?',
        helperText: null,
        questionType: 'radio',
        options: [
          'Yes, consistently meeting or exceeding SLA',
          'Mostly — 1-2 minor SLA breaches',
          'Partially — SLA breaches are occasional but impactful',
          'No — frequent SLA breaches',
        ],
        isRequired: true, orderIndex: 7,
      },
      {
        questionText: 'What improvements would you most like to see in our support service?',
        helperText: 'Please be as specific as possible — e.g., faster escalation, better documentation, more proactive communication.',
        questionType: 'text',
        isRequired: false, orderIndex: 8,
      },
    ],
  },

  // ── Survey 3: Quarterly Business Review ──────────────────────────────────
  {
    name: 'Quarterly Business Review — Client Satisfaction (Q3 FY2025-26)',
    description:
      'As part of our Quarterly Business Review (QBR) process, we request your assessment of our overall partnership performance this quarter. This feedback directly informs our leadership review and continuous improvement initiatives.',
    thankYouMessage:
      'Thank you for participating in our QBR survey. Your feedback will be presented to our CTO and Account Management team. We look forward to connecting with you in our upcoming QBR meeting.',
    questions: [
      {
        questionText: 'How would you rate your overall satisfaction with our company as a technology partner this quarter?',
        helperText: null,
        questionType: 'rating',
        minValue: 1, maxValue: 10,
        minLabel: 'Extremely Dissatisfied', maxLabel: 'Extremely Satisfied',
        isRequired: true, orderIndex: 0,
      },
      {
        questionText: 'How well does our team understand your business objectives and align our solutions accordingly?',
        helperText: 'Consider whether our solutions address your actual business problems, not just technical requirements.',
        questionType: 'rating',
        minValue: 1, maxValue: 5,
        minLabel: 'Poor Alignment', maxLabel: 'Excellent Alignment',
        isRequired: true, orderIndex: 1,
      },
      {
        questionText: 'How would you rate the collaboration and working relationship with our team?',
        helperText: 'Consider teamwork, transparency, trust, and responsiveness.',
        questionType: 'rating',
        minValue: 1, maxValue: 5,
        minLabel: 'Very Poor', maxLabel: 'Excellent',
        isRequired: true, orderIndex: 2,
      },
      {
        questionText: 'Which of the following best describes the impact our solutions have had on your organisation this quarter? (Select all that apply)',
        helperText: null,
        questionType: 'checkbox',
        options: [
          'Improved operational efficiency',
          'Reduced manual effort / automation gains',
          'Improved data visibility & decision-making',
          'Better customer / end-user experience',
          'Cost savings achieved',
          'Faster time-to-market for your own products',
          'Improved compliance / regulatory posture',
        ],
        isRequired: false, orderIndex: 3,
      },
      {
        questionText: 'How satisfied are you with the level of innovation and proactive ideas brought by our team?',
        helperText: 'Does our team proactively suggest improvements, new technologies, or better approaches — or do they only respond to what is asked?',
        questionType: 'radio',
        options: [
          'Very satisfied — consistently proactive and innovative',
          'Satisfied — bring good ideas when relevant',
          'Neutral — mostly reactive but satisfactory',
          'Dissatisfied — rarely bring new ideas or suggestions',
        ],
        isRequired: true, orderIndex: 4,
      },
      {
        questionText: 'How likely are you to recommend our company as a technology partner to another organisation in your network?',
        helperText: '10 = Extremely likely to recommend (Net Promoter Score)',
        questionType: 'rating',
        minValue: 0, maxValue: 10,
        minLabel: 'Would not recommend', maxLabel: 'Extremely likely to recommend',
        isRequired: true, orderIndex: 5,
      },
      {
        questionText: 'Are there any ongoing concerns or unresolved issues that need to be addressed at the QBR?',
        helperText: 'This will be shared directly with your Account Manager before the meeting.',
        questionType: 'text',
        isRequired: false, orderIndex: 6,
      },
      {
        questionText: 'What is the single most important thing we can do to improve our partnership in the next quarter?',
        helperText: null,
        questionType: 'text',
        isRequired: true, orderIndex: 7,
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SEED RUNNER
// ─────────────────────────────────────────────────────────────────────────────

async function seed() {
  console.log('\n┌─────────────────────────────────────────────────────────┐');
  console.log('│         CSAT Demo Seed — IT Company Survey Data         │');
  console.log('└─────────────────────────────────────────────────────────┘\n');

  await sequelize.authenticate();
  console.log('✓ Database connection established\n');

  // Find admin user to use as createdById
  const admin = await User.findOne({ where: { role: 'admin' } });
  if (!admin) {
    console.error('✗ No admin user found in the database. Please create an admin user first.');
    process.exit(1);
  }
  console.log(`✓ Using admin user: ${admin.firstName} ${admin.lastName} (${admin.id})\n`);

  // ── 1. Client Organisations + Employees ──────────────────────────────────
  console.log('─── Client Organisations ──────────────────────────────────\n');
  const createdOrgs = [];

  for (const orgData of CLIENT_ORGS) {
    const { employees, ...orgFields } = orgData;

    const [org, orgCreated] = await ClientOrganisation.findOrCreate({
      where: { name: orgFields.name },
      defaults: {
        id: uuidv4(),
        ...orgFields,
        isActive: true,
        createdById: admin.id,
      },
    });

    console.log(`  ${orgCreated ? '✓ Created' : '↷ Exists '} org: ${org.name} (${org.industry})`);
    createdOrgs.push(org);

    // Add employees
    for (const empData of employees) {
      const [, empCreated] = await ClientEmployee.findOrCreate({
        where: { clientOrganisationId: org.id, email: empData.email },
        defaults: {
          id: uuidv4(),
          clientOrganisationId: org.id,
          name: empData.name,
          email: empData.email,
          isActive: true,
        },
      });
      if (empCreated) {
        console.log(`      ✓ Employee: ${empData.name} <${empData.email}>`);
      }
    }
  }

  // ── 2. Surveys + Questions ────────────────────────────────────────────────
  console.log('\n─── Surveys ───────────────────────────────────────────────\n');

  for (const surveyData of SURVEYS) {
    const { questions, ...surveyFields } = surveyData;

    // Check if survey already exists
    const existing = await Survey.findOne({ where: { name: surveyFields.name } });
    if (existing) {
      console.log(`  ↷ Exists  survey: "${surveyFields.name}"`);
      continue;
    }

    const survey = await Survey.create({
      id: uuidv4(),
      ...surveyFields,
      status: 'published',
      createdById: admin.id,
    });

    console.log(`  ✓ Created survey: "${survey.name}" (${questions.length} questions)`);

    // Create questions
    for (const q of questions) {
      await SurveyQuestion.create({
        id: uuidv4(),
        surveyId: survey.id,
        questionText: q.questionText,
        helperText: q.helperText || null,
        questionType: q.questionType,
        options: q.options ? JSON.stringify(q.options) : null,
        minValue: q.minValue ?? null,
        maxValue: q.maxValue ?? null,
        minLabel: q.minLabel || null,
        maxLabel: q.maxLabel || null,
        isRequired: q.isRequired ?? false,
        orderIndex: q.orderIndex,
      });
    }

    console.log(`      ✓ ${questions.length} questions created`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const totalOrgs  = await ClientOrganisation.count({ where: { isActive: true } });
  const totalEmps  = await ClientEmployee.count({ where: { isActive: true } });
  const totalSurveys = await Survey.count({ where: { status: 'published' } });

  console.log('\n┌─────────────────────────────────────────────────────────┐');
  console.log('│                    Seed Complete ✓                      │');
  console.log('├─────────────────────────────────────────────────────────┤');
  console.log(`│  Client organisations : ${String(totalOrgs).padEnd(31)}│`);
  console.log(`│  Client employees     : ${String(totalEmps).padEnd(31)}│`);
  console.log(`│  Published surveys    : ${String(totalSurveys).padEnd(31)}│`);
  console.log('├─────────────────────────────────────────────────────────┤');
  console.log('│  Next steps:                                            │');
  console.log('│   1. Log in as Admin                                    │');
  console.log('│   2. Go to CSAT → Send Survey                           │');
  console.log('│   3. Select any published survey above                  │');
  console.log('│   4. Pick a client org and send!                        │');
  console.log('└─────────────────────────────────────────────────────────┘\n');
}

seed()
  .catch((err) => {
    console.error('\n✗ Seed failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  })
  .finally(() => process.exit(0));
