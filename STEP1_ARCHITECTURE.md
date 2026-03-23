# STEP 1: PLI Portal — Architecture & Design Document

---

## 1. COMPLETE FEATURE LIST

### 1.1 Authentication & Security
- F01: Email/employee-code + password login
- F02: JWT-based session with refresh token
- F03: Role-based route protection (frontend + backend)
- F04: Password change
- F05: Logout with token invalidation
- F06: Failed login attempt tracking

### 1.2 Master Data Management
- F07: Employee CRUD with activation/deactivation
- F08: Department CRUD with status management
- F09: Reporting hierarchy assignment (manager → employees)
- F10: Bulk view of team under a manager

### 1.3 Appraisal Cycle Management
- F11: Create monthly appraisal cycle with FY/month/quarter
- F12: Configure deadlines (employee submission, manager review, final review)
- F13: Cycle status management (Draft → Open → Closed → Locked)

### 1.4 KPI Assignment & Tracking
- F14: Manager creates monthly KPI assignment for employee
- F15: Multiple KPI items per assignment with weightage
- F16: Weightage validation (warn if ≠ 100)
- F17: KPI status workflow (Draft → Assigned → Employee Submitted → Manager Reviewed → Final Reviewed → Locked)

### 1.5 Three-Layer Assessment
- F18: Employee self-assessment (actual value, comment, attachment)
- F19: Manager review (reviewed value, score, comment)
- F20: Final reviewer assessment (final value, final score, final comment)
- F21: Save-as-draft before submitting at each layer

### 1.6 Lock/Unlock
- F22: Admin can lock finalized monthly records
- F23: Admin can unlock records (with audit trail)
- F24: Locked records become read-only across all roles

### 1.7 Quarterly PLI Evaluation
- F25: Auto-aggregate finalized monthly scores into quarterly score
- F26: Apply PLI rules (score slabs → payout %)
- F27: Generate PLI recommendation per employee per quarter

### 1.8 Dashboards
- F28: Employee dashboard (current KPIs, pending actions, history snapshot)
- F29: Manager dashboard (team overview, pending items, performance summary)
- F30: Admin dashboard (org-wide progress, dept summary, quarter analytics)

### 1.9 Reports & Export
- F31: Employee monthly/quarterly KPI reports
- F32: Team monthly/quarterly reports
- F33: Department performance report
- F34: Pending submission tracker
- F35: PLI payout recommendation report
- F36: Excel export
- F37: PDF export
- F38: Multi-filter support (FY, quarter, month, dept, manager, employee, status)

### 1.10 Notifications
- F39: In-app notification on KPI assignment
- F40: In-app notification on submission/review completion
- F41: In-app notification on cycle deadline approach
- F42: Mark as read / mark all as read

### 1.11 Audit Trail
- F43: Log all critical actions (create, edit, submit, review, lock, unlock)
- F44: Store old/new value snapshots
- F45: Admin audit log viewer with filters

---

## 2. FUNCTIONAL MODULE BREAKDOWN

| # | Module | Owner Roles | Key Screens |
|---|--------|-------------|-------------|
| M1 | Authentication | All | Login, Change Password |
| M2 | Employee Master | Admin | Employee List, Create/Edit Employee |
| M3 | Department Master | Admin | Department List, Create/Edit |
| M4 | Reporting Hierarchy | Admin | Hierarchy Mapping |
| M5 | Appraisal Cycle | Admin | Cycle List, Create/Edit Cycle |
| M6 | KPI Assignment | Manager | Assign KPIs, Edit KPI Items |
| M7 | Employee Submission | Employee | View KPIs, Self-Assessment Form |
| M8 | Manager Review | Manager | Review Employee KPIs |
| M9 | Final Review | Admin | Final Review Workbench |
| M10 | Quarterly Evaluation | Admin | Quarter Summary, PLI Calc |
| M11 | PLI Rules | Admin | Rule Configuration |
| M12 | Dashboards | All (role-specific) | Employee/Manager/Admin Dashboard |
| M13 | Reports | Manager, Admin | Report screens + export |
| M14 | Notifications | All | Notification bell/panel |
| M15 | Audit Logs | Admin | Audit Log Viewer |

---

## 3. USER ROLE PERMISSION MATRIX

### Legend: C=Create, R=Read, U=Update, D=Delete, S=Submit, L=Lock

| Resource / Action | Employee | Manager | Admin |
|-------------------|----------|---------|-------|
| **Own Profile** | R | R | R, U |
| **All Employees** | — | R (team only) | C, R, U, D |
| **Departments** | — | R | C, R, U |
| **Hierarchy** | — | R (own team) | C, R, U |
| **Appraisal Cycles** | R (own) | R | C, R, U |
| **KPI Assignments** | R (own) | C, R, U (team) | R, U (all) |
| **KPI Items** | R (own) | C, R, U, D (team) | R, U (all) |
| **Employee Values** | R, U, S (own) | R (team) | R (all) |
| **Manager Values** | R (own) | R, U, S (team) | R (all) |
| **Final Values** | R (own) | R (team) | R, U, S (all) |
| **Lock/Unlock** | — | — | L |
| **PLI Rules** | — | — | C, R, U |
| **Quarterly Summary** | R (own) | R (team) | R (all) |
| **Reports** | R (own) | R (team) | R (all), Export |
| **Dashboards** | R (own) | R (team) | R (all) |
| **Notifications** | R (own) | R (own) | R (own) |
| **Audit Logs** | — | — | R |

---

## 4. DETAILED WORKFLOW MAPPING

### 4.1 Monthly KPI Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                    MONTHLY KPI LIFECYCLE                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Admin] Creates/Opens Appraisal Cycle for Month            │
│       │                                                     │
│       ▼                                                     │
│  [Manager] Creates KPI Assignment (status: DRAFT)           │
│       │                                                     │
│       ▼                                                     │
│  [Manager] Adds KPI Items (title, target, weightage, etc.)  │
│       │                                                     │
│       ▼                                                     │
│  [Manager] Assigns to Employee (status: ASSIGNED)           │
│       │                                                     │
│       ▼                                                     │
│  [Employee] Views KPIs, Fills actual values & comments      │
│       │                                                     │
│       ▼                                                     │
│  [Employee] Submits (status: EMPLOYEE_SUBMITTED)            │
│       │                                                     │
│       ▼                                                     │
│  [Manager] Reviews, fills manager values/scores/comments    │
│       │                                                     │
│       ▼                                                     │
│  [Manager] Submits review (status: MANAGER_REVIEWED)        │
│       │                                                     │
│       ▼                                                     │
│  [Admin] Reviews, fills final values/scores/comments        │
│       │                                                     │
│       ▼                                                     │
│  [Admin] Finalizes (status: FINAL_REVIEWED)                 │
│       │                                                     │
│       ▼                                                     │
│  [Admin] Locks (status: LOCKED) → Read-only                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Status Transition Rules

| From | To | Triggered By | Condition |
|------|----|--------------|-----------|
| — | DRAFT | Manager | Creates new assignment |
| DRAFT | ASSIGNED | Manager | Assigns to employee (at least 1 KPI item) |
| ASSIGNED | EMPLOYEE_SUBMITTED | Employee | Submits all KPI values |
| EMPLOYEE_SUBMITTED | MANAGER_REVIEWED | Manager | Submits manager review |
| MANAGER_REVIEWED | FINAL_REVIEWED | Admin | Submits final review |
| FINAL_REVIEWED | LOCKED | Admin | Locks the record |
| LOCKED | FINAL_REVIEWED | Admin | Unlocks (audit logged) |

**Invalid transitions are blocked by API.**

### 4.3 Quarterly PLI Evaluation Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                QUARTERLY PLI EVALUATION                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Admin ensures all 3 months of quarter are LOCKED        │
│                                                             │
│  2. System computes per-employee quarterly score:            │
│     For each month in quarter:                              │
│       monthScore = Σ (kpiItem.finalScore × kpiItem.weight)  │
│     quarterScore = avg(month1Score, month2Score, month3Score)│
│                                                             │
│  3. System looks up PLI rule for quarter:                    │
│     Matches quarterScore against configured slabs            │
│     Returns payout percentage                               │
│                                                             │
│  4. Admin reviews quarterly summary                          │
│                                                             │
│  5. Admin exports PLI recommendation report                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.4 Scoring Logic

Each KPI item has `weightage` (e.g., 30 means 30% of 100).
Each KPI item gets a `finalScore` from admin (0–100 scale).

**Monthly Weighted Score** = Σ (item.finalScore × item.weightage / 100)
  - Example: 3 KPIs with weights 40, 30, 30 and scores 85, 90, 75
  - Monthly Score = (85×0.40) + (90×0.30) + (75×0.30) = 34 + 27 + 22.5 = 83.5

**Quarterly Score** = Average of 3 monthly weighted scores
  - Only includes months with status = LOCKED
  - If fewer than 3 months locked, system shows warning

---

## 5. DATABASE SCHEMA DESIGN

### 5.1 Entity Relationship Overview

```
departments ──1:N──► users
users (manager) ──1:N──► users (employees)
users ──1:N──► kpi_assignments
kpi_assignments ──1:N──► kpi_items
appraisal_cycles ──1:1──► (financialYear + month) unique
pli_rules ──(financialYear + quarter)──► scoring slabs
users ──1:N──► notifications
audit_logs ──► references any entity
```

### 5.2 Collection: `users`

```javascript
{
  _id: ObjectId,
  employeeCode: String,       // unique, indexed
  name: String,               // required
  email: String,              // unique, indexed
  passwordHash: String,       // bcrypt
  phone: String,
  department: ObjectId,       // ref: departments
  designation: String,
  joiningDate: Date,
  manager: ObjectId,          // ref: users (null for top-level)
  role: String,               // enum: ['employee', 'manager', 'admin']
  isActive: Boolean,          // default: true
  lastLogin: Date,
  createdAt: Date,
  updatedAt: Date
}
// Indexes: { employeeCode: 1 }, { email: 1 }, { manager: 1 }, { department: 1 }
```

### 5.3 Collection: `departments`

```javascript
{
  _id: ObjectId,
  code: String,               // unique
  name: String,               // required
  isActive: Boolean,          // default: true
  createdAt: Date,
  updatedAt: Date
}
```

### 5.4 Collection: `appraisal_cycles`

```javascript
{
  _id: ObjectId,
  financialYear: String,      // e.g., "2025-26"
  month: Number,              // 1-12
  quarter: String,            // e.g., "Q1", "Q2", "Q3", "Q4"
  employeeSubmissionDeadline: Date,
  managerReviewDeadline: Date,
  finalReviewDeadline: Date,
  status: String,             // enum: ['draft', 'open', 'closed', 'locked']
  createdBy: ObjectId,        // ref: users
  createdAt: Date,
  updatedAt: Date
}
// Indexes: { financialYear: 1, month: 1 } (unique compound)
```

### 5.5 Collection: `kpi_assignments`

```javascript
{
  _id: ObjectId,
  financialYear: String,      // e.g., "2025-26"
  month: Number,              // 1-12
  quarter: String,            // Q1-Q4
  employee: ObjectId,         // ref: users
  manager: ObjectId,          // ref: users
  createdBy: ObjectId,        // ref: users
  status: String,             // enum: ['draft','assigned','employee_submitted',
                              //        'manager_reviewed','final_reviewed','locked']
  totalWeightage: Number,     // computed, should be 100
  isLocked: Boolean,          // default: false
  lockedAt: Date,
  lockedBy: ObjectId,         // ref: users
  employeeSubmittedAt: Date,
  managerReviewedAt: Date,
  finalReviewedAt: Date,
  monthlyWeightedScore: Number, // computed after final review
  createdAt: Date,
  updatedAt: Date
}
// Indexes: { employee: 1, financialYear: 1, month: 1 } (unique compound)
//          { manager: 1, financialYear: 1, month: 1 }
//          { status: 1 }
```

### 5.6 Collection: `kpi_items`

```javascript
{
  _id: ObjectId,
  kpiAssignment: ObjectId,    // ref: kpi_assignments
  title: String,              // required
  description: String,
  category: String,           // e.g., "Financial", "Operational", "Quality", "Compliance"
  unit: String,               // e.g., "Number", "Percentage", "Currency", "Rating"
  weightage: Number,          // required, 1-100
  targetValue: Number,        // required
  thresholdValue: Number,     // minimum acceptable
  stretchTarget: Number,      // aspirational
  remarks: String,            // manager instructions

  // Employee layer
  employeeValue: Number,
  employeeComment: String,
  employeeAttachment: String, // file path
  employeeSubmittedAt: Date,

  // Manager layer
  managerValue: Number,
  managerScore: Number,       // 0-100
  managerComment: String,
  managerReviewedAt: Date,

  // Final reviewer layer
  finalValue: Number,
  finalScore: Number,         // 0-100 — this is used for calculation
  finalComment: String,
  finalReviewedAt: Date,

  itemStatus: String,         // mirrors parent or independent tracking
  createdAt: Date,
  updatedAt: Date
}
// Indexes: { kpiAssignment: 1 }
```

### 5.7 Collection: `pli_rules`

```javascript
{
  _id: ObjectId,
  financialYear: String,
  quarter: String,
  slabs: [
    {
      minScore: Number,       // inclusive
      maxScore: Number,       // inclusive
      payoutPercentage: Number,
      label: String           // e.g., "Exceptional", "Meets Expectations"
    }
  ],
  remarks: String,
  isActive: Boolean,
  createdBy: ObjectId,
  createdAt: Date,
  updatedAt: Date
}
// Indexes: { financialYear: 1, quarter: 1 } (unique compound)
```

### 5.8 Collection: `notifications`

```javascript
{
  _id: ObjectId,
  recipient: ObjectId,        // ref: users
  type: String,               // enum: ['kpi_assigned','employee_submitted',
                              //        'manager_reviewed','final_reviewed',
                              //        'cycle_deadline','record_locked']
  title: String,
  message: String,
  referenceType: String,      // 'kpi_assignment', 'appraisal_cycle'
  referenceId: ObjectId,
  isRead: Boolean,            // default: false
  createdAt: Date
}
// Indexes: { recipient: 1, isRead: 1, createdAt: -1 }
```

### 5.9 Collection: `audit_logs`

```javascript
{
  _id: ObjectId,
  entityType: String,         // 'user','kpi_assignment','kpi_item','appraisal_cycle','pli_rule'
  entityId: ObjectId,
  action: String,             // 'created','updated','submitted','reviewed','locked','unlocked'
  changedBy: ObjectId,        // ref: users
  oldValue: Mixed,            // snapshot of changed fields
  newValue: Mixed,
  ipAddress: String,
  createdAt: Date
}
// Indexes: { entityType: 1, entityId: 1 }, { changedBy: 1 }, { createdAt: -1 }
```

---

## 6. API LIST WITH REQUEST/RESPONSE

### 6.1 Auth APIs

| Method | Endpoint | Request | Response | Auth |
|--------|----------|---------|----------|------|
| POST | `/api/auth/login` | `{ email, password }` | `{ token, refreshToken, user: { id, name, role } }` | Public |
| POST | `/api/auth/logout` | — | `{ message }` | Any |
| GET | `/api/auth/me` | — | `{ user }` | Any |
| POST | `/api/auth/change-password` | `{ currentPassword, newPassword }` | `{ message }` | Any |

### 6.2 User APIs

| Method | Endpoint | Request | Response | Auth |
|--------|----------|---------|----------|------|
| GET | `/api/users` | `?page,limit,search,dept,role,status` | `{ users[], total, page, pages }` | Admin |
| POST | `/api/users` | `{ employeeCode, name, email, ... }` | `{ user }` | Admin |
| GET | `/api/users/:id` | — | `{ user }` | Admin, Self |
| PUT | `/api/users/:id` | `{ fields to update }` | `{ user }` | Admin |
| GET | `/api/users/team/:managerId` | — | `{ employees[] }` | Admin, Manager(own) |

### 6.3 Department APIs

| Method | Endpoint | Request | Response | Auth |
|--------|----------|---------|----------|------|
| GET | `/api/departments` | `?status` | `{ departments[] }` | Admin, Manager |
| POST | `/api/departments` | `{ code, name }` | `{ department }` | Admin |
| PUT | `/api/departments/:id` | `{ fields }` | `{ department }` | Admin |

### 6.4 KPI Assignment APIs

| Method | Endpoint | Request | Response | Auth |
|--------|----------|---------|----------|------|
| POST | `/api/kpi-assignments` | `{ financialYear, month, employee, items[] }` | `{ assignment }` | Manager |
| GET | `/api/kpi-assignments` | `?fy,month,quarter,employee,manager,status` | `{ assignments[], total }` | Role-filtered |
| GET | `/api/kpi-assignments/:id` | — | `{ assignment, items[] }` | Role-filtered |
| PUT | `/api/kpi-assignments/:id` | `{ fields }` | `{ assignment }` | Manager(own), Admin |
| POST | `/api/kpi-assignments/:id/assign` | — | `{ assignment }` | Manager |
| POST | `/api/kpi-assignments/:id/employee-submit` | `{ items: [{ id, employeeValue, comment }] }` | `{ assignment }` | Employee(own) |
| POST | `/api/kpi-assignments/:id/manager-review` | `{ items: [{ id, managerValue, score, comment }] }` | `{ assignment }` | Manager(own team) |
| POST | `/api/kpi-assignments/:id/final-review` | `{ items: [{ id, finalValue, score, comment }] }` | `{ assignment }` | Admin |
| POST | `/api/kpi-assignments/:id/lock` | — | `{ assignment }` | Admin |
| POST | `/api/kpi-assignments/:id/unlock` | — | `{ assignment }` | Admin |

### 6.5 KPI Item APIs

| Method | Endpoint | Request | Response | Auth |
|--------|----------|---------|----------|------|
| POST | `/api/kpi-items` | `{ kpiAssignment, title, weightage, target, ... }` | `{ item }` | Manager |
| PUT | `/api/kpi-items/:id` | `{ fields }` | `{ item }` | Manager(draft/assigned only) |
| DELETE | `/api/kpi-items/:id` | — | `{ message }` | Manager(draft only) |

### 6.6 Appraisal Cycle APIs

| Method | Endpoint | Request | Response | Auth |
|--------|----------|---------|----------|------|
| GET | `/api/appraisal-cycles` | `?fy,quarter,status` | `{ cycles[] }` | Any |
| POST | `/api/appraisal-cycles` | `{ financialYear, month, deadlines }` | `{ cycle }` | Admin |
| PUT | `/api/appraisal-cycles/:id` | `{ fields }` | `{ cycle }` | Admin |

### 6.7 PLI Rule APIs

| Method | Endpoint | Request | Response | Auth |
|--------|----------|---------|----------|------|
| GET | `/api/pli-rules` | `?fy,quarter` | `{ rules[] }` | Admin |
| POST | `/api/pli-rules` | `{ financialYear, quarter, slabs[] }` | `{ rule }` | Admin |
| PUT | `/api/pli-rules/:id` | `{ fields }` | `{ rule }` | Admin |

### 6.8 Dashboard APIs

| Method | Endpoint | Request | Response | Auth |
|--------|----------|---------|----------|------|
| GET | `/api/dashboard/employee` | — | `{ currentMonth, pending, quarterSnapshot, history }` | Employee |
| GET | `/api/dashboard/manager` | — | `{ teamSize, pendingAssignments, pendingReviews, teamSummary }` | Manager |
| GET | `/api/dashboard/admin` | — | `{ orgProgress, pendingFinalReviews, deptSummary, quarterOverview }` | Admin |

### 6.9 Report APIs

| Method | Endpoint | Request | Response | Auth |
|--------|----------|---------|----------|------|
| GET | `/api/reports/monthly` | `?fy,month,employee,dept` | `{ data[] }` | Manager, Admin |
| GET | `/api/reports/quarterly` | `?fy,quarter,employee,dept` | `{ data[] }` | Manager, Admin |
| GET | `/api/reports/department` | `?fy,quarter,dept` | `{ data[] }` | Admin |
| GET | `/api/reports/pending` | `?fy,month,status` | `{ data[] }` | Manager, Admin |
| GET | `/api/reports/pli-recommendation` | `?fy,quarter` | `{ data[] }` | Admin |
| GET | `/api/reports/export/excel` | `?reportType,filters` | Binary (xlsx) | Manager, Admin |
| GET | `/api/reports/export/pdf` | `?reportType,filters` | Binary (pdf) | Manager, Admin |

### 6.10 Notification APIs

| Method | Endpoint | Request | Response | Auth |
|--------|----------|---------|----------|------|
| GET | `/api/notifications` | `?unreadOnly,page,limit` | `{ notifications[], unreadCount }` | Any |
| PUT | `/api/notifications/:id/read` | — | `{ notification }` | Own |
| PUT | `/api/notifications/read-all` | — | `{ message }` | Own |

### 6.11 Audit Log APIs

| Method | Endpoint | Request | Response | Auth |
|--------|----------|---------|----------|------|
| GET | `/api/audit-logs` | `?entityType,entityId,action,user,from,to,page,limit` | `{ logs[], total }` | Admin |

---

## 7. FOLDER STRUCTURE

### 7.1 Backend (`/backend`)

```
backend/
├── package.json
├── .env
├── .env.example
├── server.js                      # Entry point
├── src/
│   ├── config/
│   │   ├── db.js                  # MongoDB connection
│   │   ├── env.js                 # Environment config
│   │   └── constants.js           # Enums, status codes, quarter mapping
│   ├── middleware/
│   │   ├── auth.js                # JWT verification
│   │   ├── rbac.js                # Role-based access control
│   │   ├── validate.js            # Request validation middleware
│   │   ├── errorHandler.js        # Global error handler
│   │   └── auditLogger.js         # Audit trail middleware
│   ├── models/
│   │   ├── User.js
│   │   ├── Department.js
│   │   ├── AppraisalCycle.js
│   │   ├── KpiAssignment.js
│   │   ├── KpiItem.js
│   │   ├── PliRule.js
│   │   ├── Notification.js
│   │   └── AuditLog.js
│   ├── validators/
│   │   ├── auth.validator.js
│   │   ├── user.validator.js
│   │   ├── department.validator.js
│   │   ├── cycle.validator.js
│   │   ├── kpiAssignment.validator.js
│   │   ├── kpiItem.validator.js
│   │   └── pliRule.validator.js
│   ├── services/
│   │   ├── auth.service.js
│   │   ├── user.service.js
│   │   ├── department.service.js
│   │   ├── cycle.service.js
│   │   ├── kpiAssignment.service.js
│   │   ├── kpiItem.service.js
│   │   ├── submission.service.js
│   │   ├── review.service.js
│   │   ├── finalReview.service.js
│   │   ├── quarterly.service.js
│   │   ├── pliRule.service.js
│   │   ├── dashboard.service.js
│   │   ├── report.service.js
│   │   ├── notification.service.js
│   │   └── audit.service.js
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   ├── user.controller.js
│   │   ├── department.controller.js
│   │   ├── cycle.controller.js
│   │   ├── kpiAssignment.controller.js
│   │   ├── kpiItem.controller.js
│   │   ├── dashboard.controller.js
│   │   ├── report.controller.js
│   │   ├── pliRule.controller.js
│   │   ├── notification.controller.js
│   │   └── audit.controller.js
│   ├── routes/
│   │   ├── index.js               # Route aggregator
│   │   ├── auth.routes.js
│   │   ├── user.routes.js
│   │   ├── department.routes.js
│   │   ├── cycle.routes.js
│   │   ├── kpiAssignment.routes.js
│   │   ├── kpiItem.routes.js
│   │   ├── dashboard.routes.js
│   │   ├── report.routes.js
│   │   ├── pliRule.routes.js
│   │   ├── notification.routes.js
│   │   └── audit.routes.js
│   └── utils/
│       ├── response.js            # Standardized API response
│       ├── errors.js              # Custom error classes
│       ├── quarterHelper.js       # Quarter/FY utilities
│       ├── scoreCalculator.js     # Weighted score computation
│       ├── excelExporter.js       # Excel generation
│       └── pdfExporter.js         # PDF generation
├── uploads/                       # Employee attachments
└── scripts/
    └── seed.js                    # Seed data script
```

### 7.2 Frontend (`/frontend`)

```
frontend/
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── index.html
├── .env
├── public/
│   └── favicon.ico
├── src/
│   ├── main.jsx                   # App entry
│   ├── App.jsx                    # Root with router
│   ├── api/
│   │   ├── axios.js               # Axios instance with interceptors
│   │   ├── auth.api.js
│   │   ├── users.api.js
│   │   ├── departments.api.js
│   │   ├── cycles.api.js
│   │   ├── kpiAssignments.api.js
│   │   ├── kpiItems.api.js
│   │   ├── dashboard.api.js
│   │   ├── reports.api.js
│   │   ├── pliRules.api.js
│   │   ├── notifications.api.js
│   │   └── auditLogs.api.js
│   ├── store/
│   │   ├── store.js               # Redux store config
│   │   ├── authSlice.js
│   │   ├── usersSlice.js
│   │   ├── departmentsSlice.js
│   │   ├── cyclesSlice.js
│   │   ├── kpiSlice.js
│   │   ├── dashboardSlice.js
│   │   ├── reportsSlice.js
│   │   └── notificationsSlice.js
│   ├── hooks/
│   │   ├── useAuth.js
│   │   ├── useRole.js
│   │   └── useNotifications.js
│   ├── components/
│   │   ├── common/
│   │   │   ├── DataTable.jsx      # Reusable table with pagination/sort
│   │   │   ├── FormField.jsx      # Reusable form input
│   │   │   ├── SelectField.jsx
│   │   │   ├── StatusBadge.jsx
│   │   │   ├── LoadingSpinner.jsx
│   │   │   ├── EmptyState.jsx
│   │   │   ├── ConfirmDialog.jsx
│   │   │   ├── PageHeader.jsx
│   │   │   ├── Card.jsx
│   │   │   ├── StatCard.jsx
│   │   │   ├── FilterBar.jsx
│   │   │   └── ExportButtons.jsx
│   │   ├── layout/
│   │   │   ├── AppLayout.jsx      # Main layout with sidebar
│   │   │   ├── Sidebar.jsx        # Role-based sidebar
│   │   │   ├── Header.jsx         # Top bar with user/notifications
│   │   │   └── NotificationBell.jsx
│   │   └── kpi/
│   │       ├── KpiItemRow.jsx
│   │       ├── KpiForm.jsx
│   │       ├── EmployeeAssessmentForm.jsx
│   │       ├── ManagerReviewForm.jsx
│   │       └── FinalReviewForm.jsx
│   ├── pages/
│   │   ├── auth/
│   │   │   ├── LoginPage.jsx
│   │   │   └── ChangePasswordPage.jsx
│   │   ├── employee/
│   │   │   ├── EmployeeDashboard.jsx
│   │   │   ├── MyKpiList.jsx
│   │   │   ├── KpiSelfAssessment.jsx
│   │   │   ├── MonthlyHistory.jsx
│   │   │   └── QuarterlySummary.jsx
│   │   ├── manager/
│   │   │   ├── ManagerDashboard.jsx
│   │   │   ├── TeamList.jsx
│   │   │   ├── AssignKpis.jsx
│   │   │   ├── ReviewTeamKpi.jsx
│   │   │   ├── TeamMonthlySummary.jsx
│   │   │   └── TeamQuarterlySummary.jsx
│   │   ├── admin/
│   │   │   ├── AdminDashboard.jsx
│   │   │   ├── EmployeeManagement.jsx
│   │   │   ├── DepartmentManagement.jsx
│   │   │   ├── HierarchyMapping.jsx
│   │   │   ├── CycleManagement.jsx
│   │   │   ├── FinalReviewWorkbench.jsx
│   │   │   ├── PliRuleConfig.jsx
│   │   │   ├── Reports.jsx
│   │   │   └── AuditLogs.jsx
│   │   └── common/
│   │       ├── ProfilePage.jsx
│   │       └── NotFoundPage.jsx
│   ├── routes/
│   │   ├── AppRoutes.jsx          # All route definitions
│   │   ├── PrivateRoute.jsx       # Auth guard
│   │   └── RoleRoute.jsx          # Role guard
│   └── utils/
│       ├── constants.js           # Roles, statuses, quarter map
│       ├── formatters.js          # Date, number, score formatters
│       └── validators.js          # Zod schemas for forms
```

---

## 8. UI SCREEN LIST

### 8.1 Public Screens

| # | Screen | Route | Description |
|---|--------|-------|-------------|
| S01 | Login | `/login` | Email + password login |
| S02 | Change Password | `/change-password` | Current + new password form |

### 8.2 Employee Screens

| # | Screen | Route | Description |
|---|--------|-------|-------------|
| S03 | Employee Dashboard | `/employee/dashboard` | Summary cards, pending actions, quarter snapshot |
| S04 | My KPI List | `/employee/kpis` | Monthly KPI list with filters (month, FY) |
| S05 | KPI Self-Assessment | `/employee/kpis/:assignmentId` | Fill actual values, comments, attachments |
| S06 | Monthly History | `/employee/history` | Browse past months' KPIs |
| S07 | Quarterly Summary | `/employee/quarterly` | Quarter-wise score and PLI info |
| S08 | Profile | `/profile` | View own profile |

### 8.3 Manager Screens

| # | Screen | Route | Description |
|---|--------|-------|-------------|
| S09 | Manager Dashboard | `/manager/dashboard` | Team stats, pending items |
| S10 | Team List | `/manager/team` | Direct reportees with status |
| S11 | Assign KPIs | `/manager/assign-kpis` | Select employee + month, add KPI items |
| S12 | Review Team KPI | `/manager/review/:assignmentId` | Review employee submission, fill manager values |
| S13 | Team Monthly Summary | `/manager/monthly-summary` | Table of team scores for month |
| S14 | Team Quarterly Summary | `/manager/quarterly-summary` | Quarter aggregation for team |

### 8.4 Admin Screens

| # | Screen | Route | Description |
|---|--------|-------|-------------|
| S15 | Admin Dashboard | `/admin/dashboard` | Org-wide progress, dept summary |
| S16 | Employee Management | `/admin/employees` | CRUD employee records |
| S17 | Department Management | `/admin/departments` | CRUD departments |
| S18 | Hierarchy Mapping | `/admin/hierarchy` | Assign managers to employees |
| S19 | Cycle Management | `/admin/cycles` | Create/manage appraisal cycles |
| S20 | Final Review Workbench | `/admin/final-review` | List pending, do final review |
| S21 | Final Review Detail | `/admin/final-review/:assignmentId` | Fill final values, lock |
| S22 | PLI Rule Config | `/admin/pli-rules` | Configure score slabs per quarter |
| S23 | Reports | `/admin/reports` | Report selection, filters, export |
| S24 | Audit Logs | `/admin/audit-logs` | Filterable audit log table |

---

## 9. IMPLEMENTATION ASSUMPTIONS

1. **Single role per user** in v1. A user is either employee, manager, or admin. A manager is also implicitly an employee (can have own KPIs from their manager), but the UI role determines primary navigation.

2. **Manager is also assessable.** A manager can have their own KPIs assigned by their own manager or admin. The system treats them as an employee in that context.

3. **Admin can act as final reviewer for all employees.** No separate "final reviewer" role — admin handles this.

4. **No self-registration.** Admin creates all user accounts.

5. **Default password** set by admin during user creation. User must change on first login (enforced by a `mustChangePassword` flag).

6. **Financial year format**: "2025-26" for April 2025 to March 2026.

7. **Quarter auto-derived from month**: April=Q1, July=Q2, October=Q3, January=Q4.

8. **Score scale is 0-100** for all scoring (employee, manager, final).

9. **Weightage is integer percentage** (1-100). System warns but doesn't hard-block if total ≠ 100.

10. **File uploads** limited to common formats (PDF, PNG, JPG, XLSX) with 5MB max.

11. **No email integration in v1.** In-app notifications only.

12. **Single MongoDB database**, no multi-tenancy.

13. **No SSO/OAuth in v1.** Simple JWT auth.

14. **Reports show data based on role scope**: employee sees own, manager sees team, admin sees all.

15. **Quarterly score only calculated when all 3 months of the quarter are locked.** Partial quarter shows warning.

---

## 10. RECOMMENDED DEVELOPMENT PHASES

### Phase 1: Foundation (Week 1-2)
**Goal:** Auth, master data, project skeleton

| Task | Priority |
|------|----------|
| Backend project setup (Express, Mongoose, env, folder structure) | P0 |
| Frontend project setup (Vite, Tailwind, Router, Redux, Axios) | P0 |
| MongoDB connection and model definitions (all 8 collections) | P0 |
| Auth module (login, logout, JWT, change password) | P0 |
| RBAC middleware | P0 |
| User CRUD APIs + Admin employee management screen | P0 |
| Department CRUD APIs + screen | P0 |
| Hierarchy mapping API + screen | P0 |
| Appraisal cycle CRUD APIs + screen | P0 |
| App layout, sidebar, header, route guards | P0 |
| Common components (DataTable, FormField, StatusBadge, etc.) | P0 |
| Login page | P0 |
| Seed script (admin user, sample departments) | P0 |

### Phase 2: Core KPI Workflow (Week 3-4)
**Goal:** Full monthly KPI lifecycle working end-to-end

| Task | Priority |
|------|----------|
| KPI Assignment APIs (create, list, detail) | P0 |
| KPI Item APIs (add, edit, delete) | P0 |
| Manager: Assign KPIs screen | P0 |
| Employee: My KPI List screen | P0 |
| Employee submission API + self-assessment screen | P0 |
| Manager review API + review screen | P0 |
| Final review API + admin final review workbench | P0 |
| Lock/unlock APIs | P0 |
| Status workflow enforcement in APIs | P0 |
| Weightage validation | P1 |

### Phase 3: Dashboards, Reports, PLI (Week 5-6)
**Goal:** Business value — dashboards, quarterly calc, reports

| Task | Priority |
|------|----------|
| Employee dashboard | P0 |
| Manager dashboard | P0 |
| Admin dashboard | P0 |
| Monthly score calculation logic | P0 |
| Quarterly aggregation service | P0 |
| PLI rule configuration (CRUD + screen) | P0 |
| PLI recommendation calculation | P0 |
| Employee quarterly summary screen | P0 |
| Manager team summary screens | P0 |
| Report APIs (monthly, quarterly, department, pending) | P1 |
| Excel export (exceljs) | P1 |
| PDF export | P1 |
| Reports screen with filters | P1 |

### Phase 4: Polish & Deploy (Week 7-8)
**Goal:** Notifications, audit, testing, deployment

| Task | Priority |
|------|----------|
| Notification service + APIs | P1 |
| Notification bell UI | P1 |
| Audit log service + middleware | P1 |
| Audit log viewer screen | P1 |
| Employee monthly history screen | P1 |
| Profile page | P2 |
| Form validations (Zod) on all forms | P1 |
| Error handling polish | P1 |
| Loading/empty states everywhere | P1 |
| Seed script with full sample data | P1 |
| README with setup instructions | P1 |
| Test checklist document | P2 |
| Deployment guide | P2 |

---

## STANDARD API RESPONSE FORMAT

All APIs will use this consistent envelope:

```json
// Success
{
  "success": true,
  "data": { ... },
  "message": "Optional message"
}

// Success with pagination
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "total": 100,
    "page": 1,
    "limit": 20,
    "pages": 5
  }
}

// Error
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "details": [ ... ]  // field-level errors if applicable
  }
}
```

---

**STEP 1 COMPLETE.** Ready to proceed to STEP 2 (Backend Foundation) on your confirmation.
