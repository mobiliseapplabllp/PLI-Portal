import { Routes, Route, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import PrivateRoute from './PrivateRoute';
import RoleRoute from './RoleRoute';
import AppLayout from '../components/layout/AppLayout';

// Auth pages
import LoginPage from '../pages/auth/LoginPage';
import ChangePasswordPage from '../pages/auth/ChangePasswordPage';

// Employee pages
import EmployeeDashboard from '../pages/employee/EmployeeDashboard';
import MyKpiList from '../pages/employee/MyKpiList';
import KpiSelfAssessment from '../pages/employee/KpiSelfAssessment';
import QuarterlySummary from '../pages/employee/QuarterlySummary';

// Manager pages
import ManagerDashboard from '../pages/manager/ManagerDashboard';
import TeamList from '../pages/manager/TeamList';
import AssignKpis from '../pages/manager/AssignKpis';
import ReviewTeamKpi from '../pages/manager/ReviewTeamKpi';
import TeamKpiReviewTable from '../pages/manager/TeamKpiReviewTable';
import ManagerTeamKpi from '../pages/manager/ManagerTeamKpi';

// HR Admin pages
import HrAdminDashboard from '../pages/hr-admin/HrAdminDashboard';
import KpiPlanManagement from '../pages/hr-admin/KpiPlanManagement';
import CreateKpiPlan from '../pages/hr-admin/CreateKpiPlan';

// Final Approver pages
import FinalApproverDashboard from '../pages/final-approver/FinalApproverDashboard';
import FinalApprovalWorkbench from '../pages/final-approver/FinalApprovalWorkbench';

// Admin pages
import AdminDashboard from '../pages/admin/AdminDashboard';
import EmployeeManagement from '../pages/admin/EmployeeManagement';
import DepartmentManagement from '../pages/admin/DepartmentManagement';
import CycleManagement from '../pages/admin/CycleManagement';
import FinalReviewWorkbench from '../pages/admin/FinalReviewWorkbench';
import AdminReviewTable from '../pages/admin/AdminReviewTable';
import KpiTemplates from '../pages/admin/KpiTemplates';
import PliRuleConfig from '../pages/admin/PliRuleConfig';
import Reports from '../pages/admin/Reports';
import AuditLogs from '../pages/admin/AuditLogs';

// PM pages
import PMDashboard from '../pages/pm/PMDashboard';
import ProjectList from '../pages/pm/ProjectList';
import CreateProject from '../pages/pm/CreateProject';
import ProjectDetail from '../pages/pm/ProjectDetail';
import MilestoneBoard from '../pages/pm/MilestoneBoard';
import GanttView from '../pages/pm/GanttView';
import TaskBoard from '../pages/pm/TaskBoard';
import DailyLogForm from '../pages/pm/DailyLogForm';
import DailyLogHistory from '../pages/pm/DailyLogHistory';
import MyTasks from '../pages/pm/MyTasks';
import PMSettings from '../pages/pm/PMSettings';

// Common
import ProfilePage from '../pages/common/ProfilePage';
import NotFoundPage from '../pages/common/NotFoundPage';

const ALL_ROLES = ['admin', 'manager', 'senior_manager', 'employee', 'hr_admin', 'final_approver', 'md', 'director'];
const PM_CREATORS = ['admin', 'manager', 'senior_manager'];

function HomeRedirect() {
  const { user } = useSelector((state) => state.auth);
  if (!user) return <Navigate to="/login" replace />;
  const map = {
    employee:        '/employee/dashboard',
    manager:         '/manager/dashboard',
    senior_manager:  '/manager/dashboard',
    hr_admin:        '/hr-admin/dashboard',
    final_approver:  '/final-approver/dashboard',
    admin:           '/admin/dashboard',
    md:              '/pm/dashboard',
    director:        '/pm/dashboard',
  };
  return <Navigate to={map[user.role] || '/pm/dashboard'} replace />;
}

export default function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />

      {/* Protected routes inside layout */}
      <Route
        element={
          <PrivateRoute>
            <AppLayout />
          </PrivateRoute>
        }
      >
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/change-password" element={<ChangePasswordPage />} />
        <Route path="/profile" element={<ProfilePage />} />

        {/* Employee routes */}
        <Route path="/employee/dashboard" element={<RoleRoute roles={['employee', 'manager', 'senior_manager', 'admin']}><EmployeeDashboard /></RoleRoute>} />
        <Route path="/employee/kpis" element={<RoleRoute roles={['employee', 'manager', 'senior_manager', 'admin']}><MyKpiList /></RoleRoute>} />
        <Route path="/employee/kpis/:assignmentId" element={<RoleRoute roles={['employee', 'manager', 'senior_manager', 'admin']}><KpiSelfAssessment /></RoleRoute>} />
        <Route path="/employee/quarterly" element={<RoleRoute roles={['employee', 'manager', 'senior_manager', 'admin']}><QuarterlySummary /></RoleRoute>} />

        {/* Manager routes */}
        <Route path="/manager/dashboard" element={<RoleRoute roles={['manager', 'senior_manager', 'admin']}><ManagerDashboard /></RoleRoute>} />
        <Route path="/manager/team" element={<RoleRoute roles={['manager', 'senior_manager', 'admin']}><TeamList /></RoleRoute>} />
        <Route path="/manager/assign-kpis" element={<RoleRoute roles={['manager', 'senior_manager', 'admin']}><AssignKpis /></RoleRoute>} />
        <Route path="/manager/review/:assignmentId" element={<RoleRoute roles={['manager', 'senior_manager', 'admin']}><ReviewTeamKpi /></RoleRoute>} />
        <Route path="/manager/team-review" element={<RoleRoute roles={['manager', 'senior_manager', 'admin']}><TeamKpiReviewTable /></RoleRoute>} />
        <Route path="/manager/team-kpi" element={<RoleRoute roles={['manager', 'senior_manager', 'admin']}><ManagerTeamKpi /></RoleRoute>} />

        {/* HR Admin routes */}
        <Route path="/hr-admin/dashboard" element={<RoleRoute roles={['hr_admin', 'admin']}><HrAdminDashboard /></RoleRoute>} />
        <Route path="/hr-admin/kpi-plans" element={<RoleRoute roles={['hr_admin', 'admin']}><KpiPlanManagement /></RoleRoute>} />
        <Route path="/hr-admin/kpi-plans/create" element={<RoleRoute roles={['hr_admin', 'admin']}><CreateKpiPlan /></RoleRoute>} />
        <Route path="/admin/kpi-templates" element={<RoleRoute roles={['hr_admin', 'admin']}><KpiTemplates /></RoleRoute>} />

        {/* Final Approver routes */}
        <Route path="/final-approver/dashboard" element={<RoleRoute roles={['final_approver', 'admin']}><FinalApproverDashboard /></RoleRoute>} />
        <Route path="/final-approver/workbench" element={<RoleRoute roles={['final_approver', 'admin']}><FinalApprovalWorkbench /></RoleRoute>} />
        <Route path="/final-approver/workbench/:employeeId/:fy/:quarter" element={<RoleRoute roles={['final_approver', 'admin']}><FinalApprovalWorkbench /></RoleRoute>} />

        {/* Admin routes */}
        <Route path="/admin/dashboard" element={<RoleRoute roles={['admin']}><AdminDashboard /></RoleRoute>} />
        <Route path="/admin/employees" element={<RoleRoute roles={['admin']}><EmployeeManagement /></RoleRoute>} />
        <Route path="/admin/departments" element={<RoleRoute roles={['admin']}><DepartmentManagement /></RoleRoute>} />
        <Route path="/admin/cycles" element={<RoleRoute roles={['admin']}><CycleManagement /></RoleRoute>} />
        <Route path="/admin/final-review" element={<RoleRoute roles={['admin']}><FinalReviewWorkbench /></RoleRoute>} />
        <Route path="/admin/final-review/:assignmentId" element={<RoleRoute roles={['admin']}><FinalReviewWorkbench /></RoleRoute>} />
        <Route path="/admin/review-table" element={<RoleRoute roles={['admin']}><AdminReviewTable /></RoleRoute>} />
        <Route path="/admin/pli-rules" element={<RoleRoute roles={['admin']}><PliRuleConfig /></RoleRoute>} />
        <Route path="/admin/reports" element={<RoleRoute roles={['hr_admin', 'final_approver', 'admin', 'manager', 'senior_manager']}><Reports /></RoleRoute>} />
        <Route path="/admin/audit-logs" element={<RoleRoute roles={['admin']}><AuditLogs /></RoleRoute>} />

        {/* PM routes — accessible to all roles */}
        <Route path="/pm/dashboard" element={<RoleRoute roles={ALL_ROLES}><PMDashboard /></RoleRoute>} />
        <Route path="/pm/projects" element={<RoleRoute roles={ALL_ROLES}><ProjectList /></RoleRoute>} />
        <Route path="/pm/projects/create" element={<RoleRoute roles={PM_CREATORS}><CreateProject /></RoleRoute>} />
        <Route path="/pm/projects/:id" element={<RoleRoute roles={ALL_ROLES}><ProjectDetail /></RoleRoute>} />
        <Route path="/pm/projects/:id/milestones" element={<RoleRoute roles={ALL_ROLES}><MilestoneBoard /></RoleRoute>} />
        <Route path="/pm/projects/:id/gantt" element={<RoleRoute roles={ALL_ROLES}><GanttView /></RoleRoute>} />
        <Route path="/pm/projects/:id/tasks" element={<RoleRoute roles={ALL_ROLES}><TaskBoard /></RoleRoute>} />
        <Route path="/pm/projects/:id/daily-log" element={<RoleRoute roles={ALL_ROLES}><DailyLogForm /></RoleRoute>} />
        <Route path="/pm/projects/:id/daily-logs" element={<RoleRoute roles={ALL_ROLES}><DailyLogHistory /></RoleRoute>} />
        <Route path="/pm/my-tasks" element={<RoleRoute roles={ALL_ROLES}><MyTasks /></RoleRoute>} />
        <Route path="/pm/settings" element={<RoleRoute roles={['admin']}><PMSettings /></RoleRoute>} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
