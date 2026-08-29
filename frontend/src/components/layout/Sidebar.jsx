import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  HiOutlineHome,
  HiOutlineClipboardList,
  HiOutlineUserGroup,
  HiOutlineDocumentReport,
  HiOutlineCog,
  HiOutlineCalendar,
  HiOutlineShieldCheck,
  HiOutlineChartBar,
  HiOutlineCollection,
  HiOutlineClipboardCheck,
  HiOutlineOfficeBuilding,
  HiOutlineDocumentText,
  HiOutlineTable,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineViewGridAdd,
  HiOutlinePlus,
  HiOutlinePencilAlt,
  HiOutlineChevronDown,
  HiOutlineChevronUp,
  HiOutlineFolderOpen,
  HiOutlineFlag,
  HiOutlineCheckCircle,
  HiOutlineClipboard,
  HiOutlineEye,
  HiOutlinePaperAirplane,
  HiOutlineAnnotation,
  HiOutlineInbox,
  HiOutlineClipboardCheck as HiOutlineMyRequests,
  HiOutlineTicket,
  HiOutlineBookOpen,
  HiOutlineSpeakerphone,
} from 'react-icons/hi';
import { ROLE_CONFIG } from '../../utils/constants';

// ── KPI Nav Items ─────────────────────────────────────────────────────────────
const kpiNavItems = {
  employee: [
    { to: '/employee/dashboard', label: 'Dashboard', icon: HiOutlineHome },
    {
      label: 'KPI',
      icon: HiOutlineClipboardList,
      children: [
        { to: '/employee/kpis', label: 'My KPIs', icon: HiOutlineClipboardList },
      ],
    },
  ],
  manager: [
    { to: '/manager/dashboard', label: 'Dashboard', icon: HiOutlineHome },
    { to: '/manager/team', label: 'My Team', icon: HiOutlineUserGroup },
    {
      label: 'KPI',
      icon: HiOutlineClipboardList,
      children: [
        { to: '/manager/team-kpi', label: 'Team KPIs', icon: HiOutlineClipboardList },
        { to: '/employee/kpis', label: 'My KPIs', icon: HiOutlineClipboardCheck },
      ],
    },
  ],
  senior_manager: [
    { to: '/manager/dashboard', label: 'Dashboard', icon: HiOutlineHome },
    { to: '/manager/team', label: 'My Team', icon: HiOutlineUserGroup },
    {
      label: 'KPI',
      icon: HiOutlineClipboardList,
      children: [
        { to: '/manager/team-kpi', label: 'Team KPIs', icon: HiOutlineClipboardList },
        { to: '/employee/kpis', label: 'My KPIs', icon: HiOutlineClipboardCheck },
      ],
    },
  ],
  hr_admin: [
    { to: '/hr-admin/dashboard', label: 'Dashboard', icon: HiOutlineHome },
    {
      label: 'KPI',
      icon: HiOutlineClipboardList,
      children: [
        { to: '/hr-admin/kpi-plans/create', label: 'Create KPI', icon: HiOutlinePlus },
        { to: '/hr-admin/kpi-plans', label: 'Edit KPI', icon: HiOutlinePencilAlt },
      ],
    },
    {
      label: 'Miscellaneous',
      icon: HiOutlineViewGridAdd,
      children: [
        { to: '/admin/reports', label: 'Reports', icon: HiOutlineDocumentReport },
      ],
    },
  ],
  final_approver: [
    { to: '/final-approver/dashboard', label: 'Dashboard', icon: HiOutlineHome },
    {
      label: 'KPI',
      icon: HiOutlineClipboardList,
      children: [
        { to: '/final-approver/workbench', label: 'Approval Workbench', icon: HiOutlineClipboardCheck },
      ],
    },
    { to: '/admin/reports', label: 'Reports', icon: HiOutlineChartBar },
  ],
  admin: [
    { to: '/admin/dashboard', label: 'Dashboard', icon: HiOutlineHome },
    { to: '/admin/employees', label: 'Employees', icon: HiOutlineUserGroup },
    { to: '/admin/departments', label: 'Departments', icon: HiOutlineOfficeBuilding },
    { to: '/manager/team', label: 'My Team', icon: HiOutlineUserGroup },
    {
      label: 'KPI',
      icon: HiOutlineClipboardList,
      children: [
        { to: '/hr-admin/kpi-plans/create', label: 'Create KPI', icon: HiOutlinePlus },
        { to: '/hr-admin/kpi-plans', label: 'Edit KPI', icon: HiOutlinePencilAlt },
        { to: '/manager/team-kpi', label: 'Team KPIs', icon: HiOutlineClipboardList },
        { to: '/employee/kpis', label: 'My KPIs', icon: HiOutlineClipboardCheck },
        { to: '/final-approver/workbench', label: 'Approval Workbench', icon: HiOutlineClipboardCheck },
        { to: '/admin/scoring-config', label: 'Scoring Config', icon: HiOutlineChartBar },
      ],
    },
    {
      label: 'Miscellaneous',
      icon: HiOutlineViewGridAdd,
      children: [
        { to: '/admin/cycles', label: 'Appraisal Cycles', icon: HiOutlineCalendar },
        { to: '/admin/review-table', label: 'Review Table', icon: HiOutlineTable },
        { to: '/admin/final-review', label: 'Final Approval Overview', icon: HiOutlineShieldCheck },
        { to: '/admin/pli-rules', label: 'PLI Rules', icon: HiOutlineCog },
        { to: '/admin/reports', label: 'Reports', icon: HiOutlineDocumentReport },
      ],
    },
    { to: '/admin/audit-logs', label: 'Audit Logs', icon: HiOutlineDocumentText },
  ],
  sales_director: [
    { to: '/manager/dashboard', label: 'Dashboard', icon: HiOutlineHome },
    { to: '/manager/team', label: 'My Team', icon: HiOutlineUserGroup },
    {
      label: 'KPI',
      icon: HiOutlineClipboardList,
      children: [
        { to: '/hr-admin/kpi-plans/create', label: 'Create KPI', icon: HiOutlinePlus },
        { to: '/hr-admin/kpi-plans', label: 'Edit KPI', icon: HiOutlinePencilAlt },
        { to: '/manager/team-kpi', label: 'Team KPIs', icon: HiOutlineClipboardList },
        { to: '/employee/kpis', label: 'My KPIs', icon: HiOutlineClipboardCheck },
      ],
    },
    {
      label: 'Miscellaneous',
      icon: HiOutlineViewGridAdd,
      children: [
        { to: '/admin/reports', label: 'Reports', icon: HiOutlineDocumentReport },
      ],
    },
  ],
  // MD/Director fallback to PM
  md: [],
  director: [],
};

// ── Shared building blocks ────────────────────────────────────────────────────
const opsBaseChildren = [
  { to: '/helpdesk/tickets',        label: 'Tickets',        icon: HiOutlineTicket },
  { to: '/helpdesk/knowledge-base', label: 'Knowledge Base', icon: HiOutlineBookOpen },
  { to: '/helpdesk/announcements',  label: 'Announcements',  icon: HiOutlineSpeakerphone },
];
const opsFullChildren = [
  ...opsBaseChildren,
  { to: '/helpdesk/reports', label: 'Reports', icon: HiOutlineChartBar },
  { to: '/helpdesk/groups',  label: 'Groups',  icon: HiOutlineUserGroup },
];

const surveyMgrChildren = [
  { to: '/csat/dashboard',  label: 'CSAT Dashboard',   icon: HiOutlineChartBar },
  { to: '/csat/send',       label: 'Send Survey',       icon: HiOutlinePaperAirplane },
  { to: '/csat/my-requests',label: 'My Requests',       icon: HiOutlineMyRequests },
  { to: '/csat/responses',  label: 'Survey Responses',  icon: HiOutlineChartBar },
];
const surveyAdminChildren = [
  { to: '/csat/dashboard',            label: 'CSAT Dashboard',   icon: HiOutlineChartBar },
  { to: '/csat/client-organisations', label: 'Client Orgs',      icon: HiOutlineOfficeBuilding },
  { to: '/csat/approval-inbox',       label: 'Approval Inbox',   icon: HiOutlineInbox },
  { to: '/csat/surveys',              label: 'Survey Builder',    icon: HiOutlinePencilAlt },
  { to: '/csat/send',                 label: 'Send Survey',       icon: HiOutlinePaperAirplane },
  { to: '/csat/responses',            label: 'Survey Responses',  icon: HiOutlineChartBar },
];
const surveyReadChildren = [
  { to: '/csat/dashboard', label: 'CSAT Dashboard',  icon: HiOutlineChartBar },
  { to: '/csat/responses', label: 'Survey Responses', icon: HiOutlineChartBar },
];

// ── PM Nav Items ──────────────────────────────────────────────────────────────
const pmNavItems = {
  // ── Employee ──────────────────────────────────────────────────────────────
  employee: [
    { to: '/pm/dashboard', label: 'Dashboard', icon: HiOutlineHome },
    {
      label: 'Project Management',
      icon: HiOutlineFolderOpen,
      children: [
        { to: '/pm/projects', label: 'All Projects', icon: HiOutlineFolderOpen },
      ],
    },
    {
      label: 'Operations Management',
      icon: HiOutlineTicket,
      children: opsBaseChildren,
    },
    {
      label: 'Miscellaneous',
      icon: HiOutlineViewGridAdd,
      children: [
        { to: '/pm/my-tasks', label: 'My Tasks', icon: HiOutlineCheckCircle },
      ],
    },
  ],

  // ── Manager ───────────────────────────────────────────────────────────────
  manager: [
    { to: '/pm/dashboard', label: 'Dashboard', icon: HiOutlineHome },
    {
      label: 'Project Management',
      icon: HiOutlineFolderOpen,
      children: [
        { to: '/pm/projects',        label: 'All Projects',    icon: HiOutlineFolderOpen },
        { to: '/pm/projects/create', label: 'Create Project',  icon: HiOutlinePlus },
      ],
    },
    {
      label: 'Operations Management',
      icon: HiOutlineTicket,
      children: opsFullChildren,
    },
    {
      label: 'Survey Management',
      icon: HiOutlineAnnotation,
      children: surveyMgrChildren,
    },
    {
      label: 'Miscellaneous',
      icon: HiOutlineViewGridAdd,
      children: [
        { to: '/pm/my-tasks', label: 'My Tasks', icon: HiOutlineCheckCircle },
      ],
    },
    {
      label: 'Settings',
      icon: HiOutlineCog,
      children: [
        { to: '/pm/settings', label: 'PM Settings', icon: HiOutlineCog },
      ],
    },
  ],

  // ── Senior Manager ────────────────────────────────────────────────────────
  senior_manager: [
    { to: '/pm/dashboard', label: 'Dashboard', icon: HiOutlineHome },
    {
      label: 'Project Management',
      icon: HiOutlineFolderOpen,
      children: [
        { to: '/pm/projects',        label: 'All Projects',   icon: HiOutlineFolderOpen },
        { to: '/pm/projects/create', label: 'Create Project', icon: HiOutlinePlus },
      ],
    },
    {
      label: 'Operations Management',
      icon: HiOutlineTicket,
      children: opsFullChildren,
    },
    {
      label: 'Survey Management',
      icon: HiOutlineAnnotation,
      children: surveyMgrChildren,
    },
    {
      label: 'Miscellaneous',
      icon: HiOutlineViewGridAdd,
      children: [
        { to: '/pm/my-tasks', label: 'My Tasks', icon: HiOutlineCheckCircle },
      ],
    },
    {
      label: 'Settings',
      icon: HiOutlineCog,
      children: [
        { to: '/pm/settings',       label: 'PM Settings',         icon: HiOutlineCog },
        { to: '/helpdesk/settings', label: 'Operations Settings', icon: HiOutlineCog },
      ],
    },
  ],

  // ── HR Admin ──────────────────────────────────────────────────────────────
  hr_admin: [
    { to: '/pm/dashboard', label: 'Dashboard', icon: HiOutlineHome },
    {
      label: 'Project Management',
      icon: HiOutlineFolderOpen,
      children: [
        { to: '/pm/projects', label: 'All Projects', icon: HiOutlineFolderOpen },
      ],
    },
    {
      label: 'Operations Management',
      icon: HiOutlineTicket,
      children: opsBaseChildren,
    },
    {
      label: 'Survey Management',
      icon: HiOutlineAnnotation,
      children: surveyReadChildren,
    },
  ],

  // ── Final Approver ────────────────────────────────────────────────────────
  final_approver: [
    { to: '/pm/dashboard', label: 'Dashboard', icon: HiOutlineHome },
    {
      label: 'Project Management',
      icon: HiOutlineFolderOpen,
      children: [
        { to: '/pm/projects', label: 'All Projects', icon: HiOutlineFolderOpen },
      ],
    },
    {
      label: 'Operations Management',
      icon: HiOutlineTicket,
      children: opsBaseChildren,
    },
    {
      label: 'Survey Management',
      icon: HiOutlineAnnotation,
      children: surveyReadChildren,
    },
  ],

  // ── MD ────────────────────────────────────────────────────────────────────
  md: [
    { to: '/pm/dashboard', label: 'Dashboard', icon: HiOutlineHome },
    {
      label: 'Project Management',
      icon: HiOutlineFolderOpen,
      children: [
        { to: '/pm/projects', label: 'All Projects', icon: HiOutlineFolderOpen },
      ],
    },
    {
      label: 'Operations Management',
      icon: HiOutlineTicket,
      children: opsBaseChildren,
    },
  ],

  // ── Director ──────────────────────────────────────────────────────────────
  director: [
    { to: '/pm/dashboard', label: 'Dashboard', icon: HiOutlineHome },
    {
      label: 'Project Management',
      icon: HiOutlineFolderOpen,
      children: [
        { to: '/pm/projects', label: 'All Projects', icon: HiOutlineFolderOpen },
      ],
    },
    {
      label: 'Operations Management',
      icon: HiOutlineTicket,
      children: opsBaseChildren,
    },
  ],

  // ── Admin ─────────────────────────────────────────────────────────────────
  admin: [
    { to: '/pm/dashboard', label: 'Dashboard', icon: HiOutlineHome },
    {
      label: 'Project Management',
      icon: HiOutlineFolderOpen,
      children: [
        { to: '/pm/projects',        label: 'All Projects',   icon: HiOutlineFolderOpen },
        { to: '/pm/projects/create', label: 'Create Project', icon: HiOutlinePlus },
      ],
    },
    {
      label: 'Operations Management',
      icon: HiOutlineTicket,
      children: opsFullChildren,
    },
    {
      label: 'Survey Management',
      icon: HiOutlineAnnotation,
      children: surveyAdminChildren,
    },
    {
      label: 'Miscellaneous',
      icon: HiOutlineViewGridAdd,
      children: [
        { to: '/pm/my-tasks', label: 'My Tasks', icon: HiOutlineCheckCircle },
      ],
    },
    {
      label: 'Settings',
      icon: HiOutlineCog,
      children: [
        { to: '/pm/settings',        label: 'PM Settings',         icon: HiOutlineCog },
        { to: '/helpdesk/settings',  label: 'Operations Settings', icon: HiOutlineCog },
      ],
    },
  ],

  // ── Sales Director — no PM module access ──────────────────────────────────
  sales_director: [],
};

// ── Helpdesk Nav Items (KPI module only — unchanged) ─────────────────────────
const hdBaseItems = [
  { section: 'Helpdesk' },
  { to: '/helpdesk/dashboard',     label: 'Dashboard',     icon: HiOutlineHome },
  { to: '/helpdesk/tickets',        label: 'Tickets',       icon: HiOutlineTicket },
  { to: '/helpdesk/knowledge-base', label: 'Knowledge Base', icon: HiOutlineBookOpen },
  { to: '/helpdesk/announcements',  label: 'Announcements', icon: HiOutlineSpeakerphone },
];

const hdWithGroups = [
  ...hdBaseItems,
  { to: '/helpdesk/reports', label: 'Reports', icon: HiOutlineChartBar },
  { to: '/helpdesk/groups',  label: 'Groups',  icon: HiOutlineUserGroup },
];

const hdWithSettings = [
  ...hdWithGroups,
  { to: '/helpdesk/settings', label: 'Settings', icon: HiOutlineCog },
];

// Inject Helpdesk section into KPI nav items (KPI module sidebar unchanged)
kpiNavItems.employee      = [...kpiNavItems.employee,       ...hdBaseItems];
kpiNavItems.manager       = [...kpiNavItems.manager,        ...hdWithGroups];
kpiNavItems.senior_manager = [...kpiNavItems.senior_manager, ...hdWithGroups];
kpiNavItems.hr_admin      = [...kpiNavItems.hr_admin,       ...hdBaseItems];
kpiNavItems.final_approver = [...kpiNavItems.final_approver, ...hdBaseItems];
kpiNavItems.admin         = [...kpiNavItems.admin,          ...hdWithSettings];
kpiNavItems.sales_director = [...kpiNavItems.sales_director, ...hdBaseItems];
kpiNavItems.md            = [...kpiNavItems.md,             ...hdBaseItems];
kpiNavItems.director      = [...kpiNavItems.director,       ...hdBaseItems];

export default function Sidebar({ collapsed, onToggle, onNavClick }) {
  const { user } = useSelector((state) => state.auth);
  const { activeModule } = useSelector((state) => state.app);
  const location = useLocation();
  const [openMenus, setOpenMenus] = useState({});

  if (!user) return null;

  const navMap = activeModule === 'pm' ? pmNavItems : kpiNavItems;
  const items = navMap[user.role] || navMap.employee || [];
  const roleConfig = ROLE_CONFIG[user.role] || ROLE_CONFIG.employee;

  const toggleMenu = (label) => setOpenMenus((prev) => ({ ...prev, [label]: !prev[label] }));

  const isChildActive = (children) =>
    children.some((c) => location.pathname === c.to.split('?')[0]);

  const linkClass = (isActive) =>
    `flex items-center ${collapsed ? 'justify-center' : 'gap-3'} px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? 'bg-primary-50 text-primary-700'
        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
    }`;

  // PM module gets a different accent
  const pmAccentClass = 'from-emerald-600 to-emerald-700';
  const headerAccent = activeModule === 'pm' ? pmAccentClass : roleConfig.accentClass;
  const headerLabel = activeModule === 'pm' ? 'Project Mgmt' : roleConfig.label;

  return (
    <aside
      className={`${collapsed ? 'w-16' : 'w-64'} h-full bg-white border-r border-gray-200 flex flex-col transition-all duration-200 ease-in-out`}
    >
      {/* Role-accented header */}
      <div className={`h-16 flex items-center justify-between px-4 border-b border-gray-200 bg-gradient-to-r ${headerAccent}`}>
        <div className={`flex items-center ${collapsed ? 'justify-center w-full' : ''}`}>
          <HiOutlineCollection className="w-7 h-7 text-white flex-shrink-0" />
          {!collapsed && (
            <div className="ml-2">
              <div className="text-xs text-white/70 leading-none">PLI Portal</div>
              <div className="text-sm font-bold text-white leading-tight whitespace-nowrap">{headerLabel}</div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {items.map((item, idx) => {
          if (item.section) {
            return !collapsed ? (
              <div key={`section-${idx}`} className="pt-4 pb-1 px-4">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{item.section}</p>
              </div>
            ) : (
              <div key={`section-${idx}`} className="border-t border-gray-200 my-2" />
            );
          }

          if (item.children) {
            const childActive = isChildActive(item.children);
            const isOpen = openMenus[item.label] ?? childActive;

            return (
              <div key={`submenu-${idx}`}>
                <button
                  onClick={() => !collapsed && toggleMenu(item.label)}
                  title={collapsed ? item.label : undefined}
                  className={`w-full flex items-center ${collapsed ? 'justify-center' : 'justify-between'} px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    childActive
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <div className={`flex items-center ${collapsed ? '' : 'gap-3'}`}>
                    <item.icon className="w-5 h-5 flex-shrink-0" />
                    {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
                  </div>
                  {!collapsed && (
                    isOpen
                      ? <HiOutlineChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      : <HiOutlineChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  )}
                </button>

                {!collapsed && isOpen && (
                  <div className="ml-4 mt-0.5 space-y-0.5 border-l-2 border-gray-100 pl-3">
                    {item.children.map((child, cIdx) => (
                      <NavLink
                        key={`${child.to}-${cIdx}`}
                        to={child.to}
                        className={({ isActive }) => linkClass(isActive)}
                        onClick={onNavClick}
                      >
                        <child.icon className="w-4 h-4 flex-shrink-0" />
                        <span className="whitespace-nowrap">{child.label}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          return (
            <NavLink
              key={`${item.to}-${idx}`}
              to={item.to}
              className={({ isActive }) => linkClass(isActive)}
              title={collapsed ? item.label : undefined}
              onClick={onNavClick}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-gray-200 hidden md:block">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center py-3 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <HiOutlineChevronRight className="w-5 h-5" />
          ) : (
            <div className="flex items-center gap-2 text-xs">
              <HiOutlineChevronLeft className="w-4 h-4" />
              <span>Collapse</span>
            </div>
          )}
        </button>
      </div>
    </aside>
  );
}
