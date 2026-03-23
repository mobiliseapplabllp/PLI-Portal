import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { logoutUser } from '../../store/authSlice';
import NotificationBell from './NotificationBell';
import { HiOutlineLogout, HiOutlineUser, HiOutlineMenuAlt2 } from 'react-icons/hi';

export default function Header({ onToggleSidebar }) {
  const { user } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleLogout = () => {
    if (!window.confirm('Are you sure you want to logout?')) return;
    dispatch(logoutUser());
    navigate('/login');
  };

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="text-gray-500 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100 transition-colors"
          title="Toggle sidebar"
        >
          <HiOutlineMenuAlt2 className="w-5 h-5" />
        </button>
        <span className="text-sm text-gray-500 capitalize">{user?.role} Portal</span>
      </div>

      <div className="flex items-center gap-4">
        <NotificationBell />

        <button
          onClick={() => navigate('/profile')}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
        >
          <HiOutlineUser className="w-5 h-5" />
          <span className="hidden sm:inline">{user?.name}</span>
        </button>

        <button
          onClick={handleLogout}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-600"
          title="Logout"
        >
          <HiOutlineLogout className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
