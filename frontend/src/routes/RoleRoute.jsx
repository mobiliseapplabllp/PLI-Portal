import { useSelector } from 'react-redux';
import { Navigate } from 'react-router-dom';

export default function RoleRoute({ roles, children }) {
  const { user } = useSelector((state) => state.auth);

  if (!user) return <Navigate to="/login" replace />;

  if (!roles.includes(user.role)) {
    // Redirect to appropriate dashboard
    const dashboardMap = {
      employee: '/employee/dashboard',
      manager: '/manager/dashboard',
      admin: '/admin/dashboard',
    };
    return <Navigate to={dashboardMap[user.role] || '/login'} replace />;
  }

  return children;
}
