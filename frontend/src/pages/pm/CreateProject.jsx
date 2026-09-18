import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { createProjectApi, addMemberApi } from '../../api/pm/projects.api';
import { getUsersApi } from '../../api/users.api';
import { getProjectTypesApi, getPmStatusesApi, getMemberRolesApi } from '../../api/pm/config.api';
import api from '../../api/axios';
import { HiOutlineArrowLeft, HiOutlinePlus, HiOutlineX, HiOutlineUserGroup, HiOutlineUserAdd } from 'react-icons/hi';
import ResourceAvailabilityCard from '../../components/pm/ResourceAvailabilityCard';
import AllocationTypeInput, { formatAllocation } from '../../components/pm/AllocationTypeInput';
import ProjectUsageChecks, { useProjectNameCheck } from '../../components/pm/ProjectUsageChecks';

// ── Role badge colour — default for unlisted roles ────────────────────────────
const DEFAULT_BADGE = 'bg-gray-50 text-gray-600 border-gray-200';
const roleBadgeCls = () => DEFAULT_BADGE; // dynamic roles → single neutral badge

const AV_CLR = [
  'bg-blue-100 text-blue-700',    'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-700',  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',    'bg-emerald-100 text-emerald-700',
  'bg-indigo-100 text-indigo-700','bg-orange-100 text-orange-700',
];
const avCls = (name = '') => AV_CLR[(name.charCodeAt(0) || 0) % AV_CLR.length];

// ── Style tokens ─────────────────────────────────────────────────────────────
const inp = [
  'w-full h-9 px-3 text-sm border border-gray-200 rounded-lg',
  'bg-white text-gray-900 placeholder:text-gray-300',
  'focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400',
  'transition-colors',
].join(' ');

const ta = [
  'w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg resize-none',
  'bg-white text-gray-900 placeholder:text-gray-300 leading-relaxed',
  'focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400',
  'transition-colors',
].join(' ');

function Lbl({ children, required, note }) {
  return (
    <p className="text-[11px] font-semibold text-gray-500 mb-1.5 leading-none">
      {children}
      {required && <span className="text-red-400 ml-0.5">*</span>}
      {note && <span className="ml-1 font-normal text-gray-300">{note}</span>}
    </p>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function CreateProject() {
  const navigate = useNavigate();
  const { user } = useSelector(s => s.auth);
  const isMgr  = ['admin', 'manager', 'senior_manager'].includes(user?.role);
  const userId = user?._id || user?.id || '';

  const [users,        setUsers]        = useState([]);
  const [projectTypes, setProjectTypes] = useState([]);
  const [statuses,     setStatuses]     = useState([]);
  const [clientOrgs,   setClientOrgs]   = useState([]);
  const [memberRoles,  setMemberRoles]  = useState([]);
  const [saving,       setSaving]       = useState(false);
  const [loading,      setLoading]      = useState(true);

  const DRAFT_EMPTY = { userId: '', role: '', allocationMode: 'per_day', hoursPerDay: '', allocationTotalHours: '', allocationFrom: '', allocationTo: '' };
  const [teamMembers,    setTeamMembers]    = useState([]);
  const [memberDraft,    setMemberDraft]    = useState(DRAFT_EMPTY);
  const [draftDerived,   setDraftDerived]   = useState({ hoursPerDay: null, totalHours: null, workingDays: null }); // per-day derived by AllocationTypeInput
  const [showMemberForm, setShowMemberForm] = useState(false);
  // Shown when the user picks "request approval/exception" on the draft row — the
  // project does not exist yet, so an exception cannot be requested here.
  const [exceptionNote,  setExceptionNote]  = useState(false);

  const [form, setForm] = useState({
    clientOrgId:  null,
    name:         '',
    plannedStart: '',
    plannedEnd:   '',
    description:  '',
    purpose:      '',
    billingType:  'Non-Billable',
    projectType:  '',
    status:       'Yet to Start',
    // Created from Project Management → Product by default (milestones are created).
    isProduct:    true,
    isOperations: false,
  });

  // Close member modal on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { setShowMemberForm(false); setMemberDraft(DRAFT_EMPTY); } };
    if (showMemberForm) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showMemberForm]); // eslint-disable-line

  useEffect(() => {
    setLoading(true);
    api.get('/pm/config/client-orgs')
      .then(res => setClientOrgs(res.data?.data ?? []))
      .catch(() => {});
    Promise.all([
      getUsersApi({ isActive: true, limit: 200 }),
      getProjectTypesApi(),
      getPmStatusesApi(),
      getMemberRolesApi(),
    ]).then(([usersRes, typesRes, statusesRes, rolesRes]) => {
      setUsers(usersRes.data?.data?.users || usersRes.data?.data || []);
      const typeList = typesRes.data?.data || [];
      setProjectTypes(typeList);
      setStatuses(statusesRes.data?.data || []);
      setMemberRoles((rolesRes.data?.data || []).filter(r => r.isActive));
      if (typeList.length > 0) setForm(f => ({ ...f, projectType: typeList[0].name }));
    }).catch(() => toast.error('Failed to load configuration'))
      .finally(() => setLoading(false));
  }, []);

  const set = (field, val) => setForm(f => ({ ...f, [field]: val }));
  const selectedOrg = clientOrgs.find(o => (o._id || o.id) === form.clientOrgId) || null;
  const setDraft    = (f, v) => setMemberDraft(p => ({ ...p, [f]: v }));
  // Duplicate-name check against the full name the server will receive
  const nameCheck = useProjectNameCheck(
    selectedOrg && form.name.trim() ? `${selectedOrg.name} - ${form.name.trim()}` : form.name
  );

  const handleAddDraftMember = () => {
    if (!memberDraft.userId) return toast.error('Select a team member');
    if (!memberDraft.role)   return toast.error('Select a role');
    if (teamMembers.find(m => m.userId === memberDraft.userId))
      return toast.error('This person is already on the team');
    const u = users.find(u => (u._id || u.id) === memberDraft.userId);
    setTeamMembers(prev => [...prev, { ...memberDraft, userName: u?.name || '' }]);
    setMemberDraft(DRAFT_EMPTY);
    setShowMemberForm(false);
  };

  const removeMember = (uid) => setTeamMembers(prev => prev.filter(m => m.userId !== uid));

  const derivedManagerId = teamMembers.find(m => {
    const r = (m.role || '').toLowerCase();
    return r.includes('project manager') || r.includes('product manager') || r === 'manager';
  })?.userId;

  const derivedOwnerId = teamMembers.find(m => {
    const r = (m.role || '').toLowerCase();
    return r.includes('product owner') || r.includes('project owner');
  })?.userId;
  const derivedAccountManagerId = teamMembers.find(m =>
    m.role === 'Account Manager or Sales Executive',
  )?.userId;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim())  return toast.error('Project name is required');
    if (!form.projectType)  return toast.error('Select a project type');
    if (nameCheck.taken)    return toast.error(nameCheck.message || 'A project with this name already exists');
    setSaving(true);
    const fullName = selectedOrg
      ? `${selectedOrg.name} - ${form.name.trim()}`
      : form.name.trim();
    try {
      const res = await createProjectApi({
        clientOrgId:      form.clientOrgId      || undefined,
        name:             fullName,
        description:      form.description      || undefined,
        purpose:          form.purpose          || undefined,
        billingType:      form.billingType,
        projectType:      form.projectType,
        status:           form.status,
        isProduct:        form.isProduct !== false,
        isOperations:     form.isOperations === true,
        accountManagerId: derivedAccountManagerId || undefined,
        managerId:        derivedManagerId || (isMgr ? userId : undefined),
        startDate:        form.plannedStart || undefined,
        endDate:          form.plannedEnd   || undefined,
      });
      const newId = res.data?.data?._id || res.data?.data?.id;
      if (!newId) throw new Error('Server did not return a project ID. Please try again.');

      for (const m of teamMembers) {
        try {
          const mode = m.allocationMode === 'total' ? 'total' : 'per_day';
          await addMemberApi(newId, {
            userId:        m.userId,
            role:          m.role,
            allocationMode: mode,
            hoursPerDay:    mode === 'per_day' && m.hoursPerDay !== '' && m.hoursPerDay != null ? Number(m.hoursPerDay) : null,
            allocationTotalHours: mode === 'total' && m.allocationTotalHours !== '' && m.allocationTotalHours != null ? Number(m.allocationTotalHours) : null,
            allocationFrom: m.allocationFrom || null,
            allocationTo:   m.allocationTo   || null,
          });
        } catch (memberErr) {
          // Non-fatal — the project exists; surface the problem and keep going with the rest
          const msg = memberErr.response?.data?.message || memberErr.message || 'Failed to add member';
          toast.error(`${m.userName || 'Member'}: ${msg}`);
        }
      }
      toast.success('Project created successfully');
      navigate(`/pm/projects/${newId}`);
    } catch (err) {
      toast.error(
        err.response?.data?.message ||
        err.response?.data?.error?.message ||
        'Failed to create project',
      );
    } finally { setSaving(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">

      {/* Page header */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => navigate('/pm/projects')}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <HiOutlineArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900 leading-tight">New Project</h1>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Milestones are auto-generated from the selected project type
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

          <div className="p-6 space-y-5">

            {/* ── ROW 1: Client Organisation | Project Name ──────────────── */}
            <div className="grid grid-cols-2 gap-5">
              {/* Client Org */}
              <div>
                <Lbl>Client Organisation</Lbl>
                <select
                  value={form.clientOrgId || ''}
                  onChange={e => set('clientOrgId', e.target.value || null)}
                  className={inp}
                >
                  <option value="">— None —</option>
                  {clientOrgs.map(org => (
                    <option key={org._id || org.id} value={org._id || org.id}>{org.name}</option>
                  ))}
                </select>
              </div>

              {/* Project Name */}
              <div>
                <Lbl required>
                  Project Name
                  {selectedOrg && (
                    <span className="ml-1 font-normal text-gray-300">
                      — prefixed with "{selectedOrg.name}"
                    </span>
                  )}
                </Lbl>
                <div className="flex rounded-lg border border-gray-200 overflow-hidden transition-colors focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:border-emerald-400">
                  {selectedOrg && (
                    <span className="flex items-center px-3 bg-gray-50 border-r border-gray-200 text-[11px] font-semibold text-gray-500 whitespace-nowrap select-none">
                      {selectedOrg.name} —
                    </span>
                  )}
                  <input
                    value={form.name}
                    onChange={e => set('name', e.target.value)}
                    className="flex-1 h-9 px-3 text-sm bg-white text-gray-900 placeholder:text-gray-300 focus:outline-none"
                    placeholder={selectedOrg ? 'Project name…' : 'e.g. PLI Portal Redesign 2026'}
                  />
                </div>
                {nameCheck.checking && <p className="text-xs text-gray-400 mt-1">Checking name…</p>}
                {nameCheck.taken && <p className="text-xs text-red-600 mt-1">{nameCheck.message}</p>}
              </div>
            </div>

            {/* ── ROW 2: Project Type | Initial Status | Billing Type ────────── */}
            <div className="grid grid-cols-3 gap-5">
              {/* Project Type */}
              <div>
                <Lbl required>Project Type</Lbl>
                <select
                  value={form.projectType}
                  onChange={e => set('projectType', e.target.value)}
                  className={inp}
                  title="Determines which milestone template is applied"
                >
                  <option value="">Select…</option>
                  {projectTypes.map(t => (
                    <option key={t._id || t.id} value={t.name}>{t.name}</option>
                  ))}
                </select>
              </div>

              {/* Initial Status */}
              <div>
                <Lbl>Initial Status</Lbl>
                <select
                  value={form.status}
                  onChange={e => set('status', e.target.value)}
                  className={inp}
                >
                  {statuses.map(s => (
                    <option key={s._id || s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Billing Type — segmented control */}
              <div>
                <Lbl>Billing Type</Lbl>
                <div className="flex h-9 bg-gray-100 rounded-lg p-0.5 gap-0.5">
                  {[
                    { val: 'Billable',     icon: '💰', label: 'Billable'    },
                    { val: 'Non-Billable', icon: '🔧', label: 'Non-Billable' },
                  ].map(({ val, icon, label }) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => set('billingType', val)}
                      className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold rounded-md transition-all ${
                        form.billingType === val
                          ? 'bg-white text-gray-800 shadow-sm border border-gray-200'
                          : 'text-gray-400 hover:text-gray-600'
                      }`}
                    >
                      <span>{icon}</span>
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Used for: Product (milestones) / Operations (tickets) ─────── */}
            <div>
              <Lbl>Used for</Lbl>
              <ProjectUsageChecks
                value={{ isProduct: form.isProduct, isOperations: form.isOperations }}
                onChange={(next) => setForm(f => ({ ...f, ...next }))}
              />
            </div>

            {/* ── ROW 3: Planned Start | Planned End ─────────────────────── */}
            <div className="grid grid-cols-2 gap-5">
              <div>
                <Lbl note="— locked after creation">Planned Start</Lbl>
                <input
                  type="date"
                  value={form.plannedStart}
                  onChange={e => set('plannedStart', e.target.value)}
                  className={inp}
                />
              </div>
              <div>
                <Lbl note="— locked after creation">Planned End</Lbl>
                <input
                  type="date"
                  value={form.plannedEnd}
                  onChange={e => set('plannedEnd', e.target.value)}
                  className={inp}
                />
              </div>
            </div>

            {/* ── ROW 3: Team ────────────────────────────────────────────── */}
            <div>
              {/* Team bar — label + chips + add button all in one line */}
              <div className="flex items-center gap-2 flex-wrap min-h-[36px]">
                <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-[0.15em] mr-1 flex-shrink-0">
                  Team
                </span>

                {/* Member chips */}
                {teamMembers.map(m => (
                  <span
                    key={m.userId}
                    className="group inline-flex items-center gap-1.5 pl-1.5 pr-2 py-1 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-full text-xs font-medium text-gray-700 transition-colors"
                  >
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-extrabold flex-shrink-0 ${avCls(m.userName)}`}>
                      {(m.userName || '?').charAt(0).toUpperCase()}
                    </span>
                    <span className="text-gray-800">{m.userName}</span>
                    <span className="text-gray-300">·</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${roleBadgeCls()}`}>
                      {m.role.split('/')[0].split(' or ')[0].trim()}
                    </span>
                    {formatAllocation(m, 8) && (
                      <span className="text-[10px] text-gray-400 font-semibold">{formatAllocation(m, 8)}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeMember(m.userId)}
                      className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0 ml-0.5"
                    >
                      <HiOutlineX className="w-3 h-3" />
                    </button>
                  </span>
                ))}

                {/* Add Member trigger — always visible */}
                <button
                  type="button"
                  onClick={() => setShowMemberForm(true)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 border border-dashed border-gray-300 text-gray-400 hover:border-emerald-400 hover:text-emerald-600 rounded-full text-xs font-semibold transition-colors"
                >
                  <HiOutlinePlus className="w-3.5 h-3.5" />
                  Add Member
                </button>

                {/* Empty-state hint */}
                {teamMembers.length === 0 && (
                  <span className="text-[11px] text-gray-300 italic ml-1">
                    Optional — add later from Team Setup tab
                  </span>
                )}
              </div>

            </div>

            {/* Divider */}
            <div className="h-px bg-gray-100" />

            {/* ── ROW 4: Description | Purpose / Objective ───────────────── */}
            <div className="grid grid-cols-2 gap-5">
              <div>
                <Lbl>Description</Lbl>
                <textarea
                  value={form.description}
                  onChange={e => set('description', e.target.value)}
                  rows={3}
                  className={ta}
                  placeholder="Brief overview — scope, background, deliverables…"
                />
              </div>
              <div>
                <Lbl>Purpose / Objective</Lbl>
                <textarea
                  value={form.purpose}
                  onChange={e => set('purpose', e.target.value)}
                  rows={3}
                  className={ta}
                  placeholder="What problem does this project solve? Expected outcome?"
                />
              </div>
            </div>

          </div>{/* /p-6 */}

          {/* ── Footer ─────────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              {teamMembers.length > 0
                ? `${teamMembers.length} member${teamMembers.length !== 1 ? 's' : ''} assigned`
                : 'Team can be configured after creation from the Team Setup tab'}
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate('/pm/projects')}
                className="px-5 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !form.name.trim() || !form.projectType || nameCheck.taken}
                className="px-6 py-2 text-sm font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                {saving ? 'Creating…' : 'Create Project'}
              </button>
            </div>
          </div>

        </div>
      </form>

      {/* ── Add Member Modal ────────────────────────────────────────────────── */}
      {showMemberForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(2px)' }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) { setShowMemberForm(false); setMemberDraft(DRAFT_EMPTY); } }}
        >
          <div className="w-full max-w-[520px] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[90vh]">

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Add Team Member</h3>
                <p className="text-[11px] text-gray-400 mt-0.5">Assign a role and allocation for this person</p>
              </div>
              <button
                type="button"
                onClick={() => { setShowMemberForm(false); setMemberDraft(DRAFT_EMPTY); }}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <HiOutlineX className="w-4 h-4" />
              </button>
            </div>

            {/* Modal body — fields stacked */}
            <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
              <div>
                <Lbl required>Person</Lbl>
                <select
                  value={memberDraft.userId}
                  onChange={e => setDraft('userId', e.target.value)}
                  className={inp}
                  autoFocus
                >
                  <option value="">Select person…</option>
                  {users.map(u => (
                    <option key={u._id || u.id} value={u._id || u.id}>{u.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <Lbl required>Role</Lbl>
                <select
                  value={memberDraft.role}
                  onChange={e => setDraft('role', e.target.value)}
                  className={inp}
                >
                  <option value="">Select role…</option>
                  {memberRoles.map(r => (
                    <option key={r.name} value={r.name}>{r.name}</option>
                  ))}
                </select>
              </div>

              <AllocationTypeInput
                value={memberDraft}
                onChange={next => setMemberDraft(p => ({
                  ...p,
                  allocationMode:       next.allocationMode,
                  hoursPerDay:          next.hoursPerDay ?? '',
                  allocationTotalHours: next.allocationTotalHours ?? '',
                }))}
                from={memberDraft.allocationFrom || null}
                to={memberDraft.allocationTo || null}
                capacity={8}
                maxPerDay={12}
                defaultMode="per_day"
                inputClassName={inp}
                onDerived={setDraftDerived}
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Lbl>From</Lbl>
                  <input
                    type="date"
                    value={memberDraft.allocationFrom}
                    onChange={e => setDraft('allocationFrom', e.target.value)}
                    className={inp}
                  />
                </div>
                <div>
                  <Lbl>To</Lbl>
                  <input
                    type="date"
                    value={memberDraft.allocationTo}
                    onChange={e => setDraft('allocationTo', e.target.value)}
                    className={inp}
                  />
                </div>
              </div>

              {/* Resource Availability — shows when a person is selected */}
              {memberDraft.userId && (
                <div className="mt-3">
                  <ResourceAvailabilityCard
                    userId={memberDraft.userId}
                    fromDate={memberDraft.allocationFrom || null}
                    toDate={memberDraft.allocationTo || null}
                    newHoursPerDay={draftDerived.hoursPerDay != null ? Number(draftDerived.hoursPerDay) : null}
                    onSuggestionSelect={(suggestion) => {
                      setExceptionNote(false);
                      if (suggestion.type === 'reduce_hours' && suggestion.suggestedHoursPerDay != null) {
                        setMemberDraft(d => ({ ...d, allocationMode: 'per_day', hoursPerDay: String(suggestion.suggestedHoursPerDay), allocationTotalHours: '' }));
                      }
                      if (suggestion.type === 'shift_dates' && suggestion.suggestedFromDate) {
                        setMemberDraft(d => ({ ...d, allocationFrom: suggestion.suggestedFromDate }));
                      }
                    }}
                    // No project id yet → exceptions cannot be requested from the draft row.
                    onRequestException={() => setExceptionNote(true)}
                  />
                  {exceptionNote && (
                    <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2" role="status">
                      Exceptions can be requested after the project is created. For now, reduce the hours or shift the dates using the options above.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-t border-gray-100">
              <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
                <HiOutlineUserGroup className="w-3.5 h-3.5 flex-shrink-0" />
                Optional — configure full team after creation
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setShowMemberForm(false); setMemberDraft(DRAFT_EMPTY); }}
                  className="px-4 py-2 text-sm font-medium text-gray-500 whitespace-nowrap rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAddDraftMember}
                  disabled={!memberDraft.userId || !memberDraft.role}
                  className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-semibold whitespace-nowrap rounded-lg transition-all
                    bg-emerald-600 text-white shadow-sm
                    hover:bg-emerald-700 hover:shadow-md
                    active:scale-[0.97]
                    disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none disabled:cursor-not-allowed"
                >
                  <HiOutlineUserAdd className="w-4 h-4 flex-shrink-0" />
                  Add to Team
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
