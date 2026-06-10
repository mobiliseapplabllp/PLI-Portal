import { useState, useRef, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { logoutUser } from '../../store/authSlice';
import { setActiveModule } from '../../store/appSlice';
import NotificationBell from './NotificationBell';
import {
  HiOutlineLogout, HiOutlineUser, HiOutlineMenuAlt2,
  HiOutlineChevronDown, HiOutlineLightningBolt, HiOutlineClipboardList,
  HiCheck,
} from 'react-icons/hi';

const MODULES = [
  {
    id: 'kpi',
    label: 'KPI Module',
    icon: HiOutlineLightningBolt,
    defaultRoute: null, // handled by role in HomeRedirect
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  {
    id: 'pm',
    label: 'Project Management',
    icon: HiOutlineClipboardList,
    defaultRoute: '/pm/dashboard',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
  },
];

export default function Header({ onToggleSidebar }) {
  const { user } = useSelector((s) => s.auth);
  const { activeModule } = useSelector((s) => s.app);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => { if (dropRef.current && !dropRef.current.contains(e.target)) setDropdownOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = () => {
    if (!window.confirm('Are you sure you want to logout?')) return;
    dispatch(logoutUser());
    navigate('/login');
  };

  const handleSwitchModule = (mod) => {
    setDropdownOpen(false);
    if (mod.id === activeModule) return;
    dispatch(setActiveModule(mod.id));
    if (mod.id === 'pm') navigate('/pm/dashboard');
    else {
      // Route based on role
      const roleRoutes = {
        employee: '/employee/dashboard',
        manager: '/manager/dashboard',
        senior_manager: '/manager/dashboard',
        hr_admin: '/hr-admin/dashboard',
        final_approver: '/final-approver/dashboard',
        admin: '/admin/dashboard',
        md: '/pm/dashboard',
        director: '/pm/dashboard',
      };
      navigate(roleRoutes[user?.role] || '/');
    }
  };

  const activeModuleObj = MODULES.find(m => m.id === activeModule) || MODULES[0];
  const ActiveIcon = activeModuleObj.icon;

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 z-30">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="text-gray-500 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100 transition-colors"
          title="Toggle sidebar"
        >
          <HiOutlineMenuAlt2 className="w-5 h-5" />
        </button>

        {/* Module Switcher */}
        <div className="relative" ref={dropRef}>
          <button
            onClick={() => setDropdownOpen(o => !o)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all
              ${dropdownOpen ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 hover:border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >
            <ActiveIcon className={`w-4 h-4 ${activeModuleObj.color}`} />
            <span className="hidden sm:inline">{activeModuleObj.label}</span>
            <HiOutlineChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {dropdownOpen && (
            <div className="absolute left-0 top-full mt-1.5 w-56 bg-white rounded-xl border border-gray-200 shadow-lg py-1 z-50">
              {MODULES.map(mod => {
                const Icon = mod.icon;
                const isActive = mod.id === activeModule;
                return (
                  <button
                    key={mod.id}
                    onClick={() => handleSwitchModule(mod)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors
                      ${isActive ? 'font-semibold text-gray-900' : 'text-gray-600'}`}
                  >
                    <div className={`p-1.5 rounded-lg ${mod.bg}`}>
                      <Icon className={`w-4 h-4 ${mod.color}`} />
                    </div>
                    <span className="flex-1 text-left">{mod.label}</span>
                    {isActive && <HiCheck className="w-4 h-4 text-blue-600" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <span className="text-sm text-gray-400 capitalize hidden md:inline">
          {user?.role?.replace(/_/g, ' ')} Portal
        </span>
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
