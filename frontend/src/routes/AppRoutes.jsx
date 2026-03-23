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

// Common
import ProfilePage from '../pages/common/ProfilePage';
import NotFoundPage from '../pages/common/NotFoundPage';

function HomeRedirect() {
  const { user } = useSelector((state) => state.auth);
  if (!user) return <Navigate to="/login" />;
  const map = {
    employee: '/employee/dashboard',
    manager: '/manager/dashboard',
    admin: '/admin/dashboard',
  };
  return <Navigate to={map[user.role] || '/login'} />;
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
        <Route path="/employee/dashboard" element={<RoleRoute roles={['employee', 'manager', 'admin']}><EmployeeDashboard /></RoleRoute>} />
        <Route path="/employee/kpis" element={<RoleRoute roles={['employee', 'manager', 'admin']}><MyKpiList /></RoleRoute>} />
        <Route path="/employee/kpis/:assignmentId" element={<RoleRoute roles={['employee', 'manager', 'admin']}><KpiSelfAssessment /></RoleRoute>} />
        <Route path="/employee/quarterly" element={<RoleRoute roles={['employee', 'manager', 'admin']}><QuarterlySummary /></RoleRoute>} />

        {/* Manager routes */}
        <Route path="/manager/dashboard" element={<RoleRoute roles={['manager', 'admin']}><ManagerDashboard /></RoleRoute>} />
        <Route path="/manager/team" element={<RoleRoute roles={['manager', 'admin']}><TeamList /></RoleRoute>} />
        <Route path="/manager/assign-kpis" element={<RoleRoute roles={['manager', 'admin']}><AssignKpis /></RoleRoute>} />
        <Route path="/manager/review/:assignmentId" element={<RoleRoute roles={['manager', 'admin']}><ReviewTeamKpi /></RoleRoute>} />
        <Route path="/manager/team-review" element={<RoleRoute roles={['manager', 'admin']}><TeamKpiReviewTable /></RoleRoute>} />

        {/* Admin routes */}
        <Route path="/admin/dashboard" element={<RoleRoute roles={['admin']}><AdminDashboard /></RoleRoute>} />
        <Route path="/admin/employees" element={<RoleRoute roles={['admin']}><EmployeeManagement /></RoleRoute>} />
        <Route path="/admin/departments" element={<RoleRoute roles={['admin']}><DepartmentManagement /></RoleRoute>} />
        <Route path="/admin/cycles" element={<RoleRoute roles={['admin']}><CycleManagement /></RoleRoute>} />
        <Route path="/admin/final-review" element={<RoleRoute roles={['admin']}><FinalReviewWorkbench /></RoleRoute>} />
        <Route path="/admin/final-review/:assignmentId" element={<RoleRoute roles={['admin']}><FinalReviewWorkbench /></RoleRoute>} />
        <Route path="/admin/review-table" element={<RoleRoute roles={['admin']}><AdminReviewTable /></RoleRoute>} />
        <Route path="/admin/kpi-templates" element={<RoleRoute roles={['admin']}><KpiTemplates /></RoleRoute>} />
        <Route path="/admin/pli-rules" element={<RoleRoute roles={['admin']}><PliRuleConfig /></RoleRoute>} />
        <Route path="/admin/reports" element={<RoleRoute roles={['admin', 'manager']}><Reports /></RoleRoute>} />
        <Route path="/admin/audit-logs" element={<RoleRoute roles={['admin']}><AuditLogs /></RoleRoute>} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
