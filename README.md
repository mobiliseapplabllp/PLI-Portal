# PLI Portal — Internal Performance Linked Incentive System

A full-stack application for managing monthly KPI tracking and quarterly PLI evaluation.

## Tech Stack

- **Backend:** Node.js, Express.js, **MySQL**, Sequelize, JWT
- **Frontend:** React 18, Vite, Redux Toolkit, Tailwind CSS, React Router v6
- **Auth:** JWT with bcrypt password hashing
- **Exports:** ExcelJS, PDFKit

## Quick Start

### Prerequisites

- Node.js 18+
- MySQL 8+ (or MariaDB 10.5+ with compatible SQL)

### 1. Database

Create the database and an app user (adjust names/passwords). Example script: `deploy/mysql-init.example.sql`.

### 2. Backend Setup

```bash
cd backend
npm install
```

Create `.env` (copy from `.env.example`):

```
PORT=5100
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DATABASE=pli_portal
MYSQL_USER=pli_app
MYSQL_PASSWORD=your_password
JWT_SECRET=your_secret_here
JWT_EXPIRES_IN=24h
JWT_REFRESH_SECRET=your_refresh_secret
JWT_REFRESH_EXPIRES_IN=7d
```

On first start, `sequelize.sync()` creates tables. Then seed:

```bash
npm run seed
```

Start the server:

```bash
npm run dev
```

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:3000` and proxies API calls to port **5100**.

### Production: Linux + Apache (`https://lakshya.onmobilise.com/`)

1. Build the SPA: `cd frontend && npm install && npm run build` — deploy `frontend/dist` as Apache `DocumentRoot` (example in `deploy/apache-lakshya.onmobilise.com.conf.example`: `/home/lakshya/PLI-Portal-master/frontend/dist`).
2. On the server, run the API with `PORT=5100` (or rely on the default in `server.js`). Use **systemd** or **pm2** so Node stays up after logout.
3. Enable Apache modules: `a2enmod ssl proxy proxy_http rewrite headers` (and `headers` if you add security headers).
4. Use a vhost that proxies API and uploads to Node, and serves the React app for everything else. See `deploy/apache-lakshya.onmobilise.com.conf.example`.
5. Frontend uses relative `/api` by default (`axios.js`), so the browser calls `https://lakshya.onmobilise.com/api/...` and Apache forwards to `http://127.0.0.1:5100/api/...`.

### 3. Login

After seeding, use these credentials (password: `password123`):

| Role | Email | Team |
|------|-------|------|
| Admin | admin@pli.com | — |
| Manager | rajesh@pli.com | Tech (3 reports) |
| Manager | priya@pli.com | Sales (2 reports) |
| Employee | amit@pli.com | Tech |
| Employee | sneha@pli.com | Tech |
| Employee | neha@pli.com | Sales |

## Project Structure

```
PLI_Portal/
├── backend/
│   ├── server.js
│   ├── src/
│   │   ├── config/         # DB connection, constants
│   │   ├── middleware/      # Auth, RBAC, validation, error handling
│   │   ├── models/          # Sequelize models + associations
│   │   ├── validators/      # Express-validator schemas
│   │   ├── services/        # Business logic layer
│   │   ├── controllers/     # Request handlers
│   │   ├── routes/          # API route definitions
│   │   └── utils/           # Response helpers, score calc, exporters
│   └── scripts/seed.js
├── frontend/
│   ├── src/
│   │   ├── api/             # Axios API layer
│   │   ├── store/           # Redux Toolkit slices
│   │   ├── components/      # Reusable UI components
│   │   ├── pages/           # Route pages by role
│   │   ├── routes/          # Router + guards
│   │   └── utils/           # Constants, formatters
```

## Monthly KPI Workflow

1. **Admin** creates appraisal cycle (month + deadlines)
2. **Manager** creates KPI assignment for employee with KPI items
3. **Manager** assigns KPIs to employee (status: ASSIGNED)
4. **Employee** fills actual values and submits (status: EMPLOYEE_SUBMITTED)
5. **Manager** reviews and scores (status: MANAGER_REVIEWED)
6. **Admin** provides final review and scores (status: FINAL_REVIEWED)
7. **Admin** locks the record (status: LOCKED)

## Quarterly PLI

- Quarterly score = average of 3 monthly weighted scores
- PLI payout determined by configurable score slabs
- Only locked months count toward quarterly calculation

## API Endpoints

| Group | Base Path | Methods |
|-------|-----------|---------|
| Auth | /api/auth | login, logout, me, change-password |
| Users | /api/users | CRUD + team |
| Departments | /api/departments | CRUD |
| Cycles | /api/appraisal-cycles | CRUD |
| KPI Assignments | /api/kpi-assignments | CRUD + workflow transitions |
| KPI Items | /api/kpi-items | CUD |
| Dashboard | /api/dashboard | employee, manager, admin |
| Reports | /api/reports | monthly, quarterly, export |
| PLI Rules | /api/pli-rules | CRUD |
| Notifications | /api/notifications | list, mark read |
| Audit Logs | /api/audit-logs | list |

## Roles

- **Employee:** View/submit own KPIs
- **Manager:** Assign/review team KPIs
- **Admin:** Full access, final review, lock/unlock, reports, user management
