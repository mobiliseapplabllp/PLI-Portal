/**
 * UnifiedDashboard.jsx
 * Single entry point for /pm/dashboard.
 * Tab 1 → PM Dashboard  (project-management analytics)
 * Tab 2 → Operations Dashboard  (helpdesk analytics — only for roles with HD access)
 */
import { useState, Suspense, lazy } from 'react';
import { useSelector } from 'react-redux';
import { HiOutlineChartBar, HiOutlineCollection } from 'react-icons/hi';
import PMDashboard from './PMDashboard';

// Lazy-load HdDashboard — it's heavy (charts + multiple API calls)
const HdDashboard = lazy(() => import('../helpdesk/HdDashboard'));

// Roles that have helpdesk (Operations) access in PM module
const HD_ROLES = ['admin', 'manager', 'senior_manager', 'hr_admin', 'final_approver', 'employee', 'md', 'director'];

export default function UnifiedDashboard() {
  const { user } = useSelector(s => s.auth);
  const [activeTab, setActiveTab] = useState('pm');

  const hasHelpdesk = HD_ROLES.includes(user?.role);

  const tabs = [
    { key: 'pm',  label: 'PM Dashboard',         icon: HiOutlineCollection },
    ...(hasHelpdesk
      ? [{ key: 'ops', label: 'Operations Dashboard', icon: HiOutlineChartBar }]
      : []),
  ];

  return (
    <div>
      {/* ── Tab strip ── */}
      <div className="flex gap-0 border-b border-gray-200 mb-6">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-emerald-500 text-emerald-700 bg-emerald-50/50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      {activeTab === 'pm' && <PMDashboard />}

      {activeTab === 'ops' && hasHelpdesk && (
        <Suspense fallback={
          <div className="flex items-center justify-center py-24 gap-2">
            <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-gray-400">Loading Operations Dashboard…</span>
          </div>
        }>
          <HdDashboard />
        </Suspense>
      )}
    </div>
  );
}
