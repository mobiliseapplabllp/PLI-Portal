/**
 * QuickCreateProjectModal — create a PM project from inside the helpdesk
 * Create Ticket form without leaving the page.
 *
 * Mirrors pages/pm/CreateProject.jsx: same form state (clientOrgId, name,
 * plannedStart, plannedEnd, description, purpose, billingType, projectType,
 * status), same option sources (/pm/config/client-orgs, project types, PM
 * statuses), same validation (name + project type required), same
 * createProjectApi payload — minus Team Setup (no members are added).
 *
 * Props
 *   open       bool
 *   onClose    () => void
 *   onCreated  (project) => void   — receives the created project record
 *                                    (response data; id is exposed as _id)
 */
import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import Modal from '../common/Modal';
import api from '../../api/axios';
import { createProjectApi } from '../../api/pm/projects.api';
import ProjectUsageChecks, { useProjectNameCheck } from '../pm/ProjectUsageChecks';
import { getProjectTypesApi, getPmStatusesApi } from '../../api/pm/config.api';

const EMPTY_FORM = {
  clientOrgId:  null,
  name:         '',
  plannedStart: '',
  plannedEnd:   '',
  description:  '',
  purpose:      '',
  billingType:  'Non-Billable',
  projectType:  '',
  status:       'Yet to Start',
  // Opened from the ticket form → Operations by default (no milestones).
  isProduct:    false,
  isOperations: true,
};

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

export default function QuickCreateProjectModal({ open, onClose, onCreated }) {
  const { user } = useSelector(s => s.auth);
  // Same rule as CreateProject.jsx: managers become the default project manager
  const isMgr  = ['admin', 'manager', 'senior_manager'].includes(user?.role);
  const userId = user?._id || user?.id || '';

  const [form,         setForm]         = useState(EMPTY_FORM);
  const [clientOrgs,   setClientOrgs]   = useState([]);
  const [projectTypes, setProjectTypes] = useState([]);
  const [statuses,     setStatuses]     = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [saving,       setSaving]       = useState(false);

  // Load option sources each time the modal opens; reset the form
  useEffect(() => {
    if (!open) return;
    setForm(EMPTY_FORM);
    setLoading(true);
    api.get('/pm/config/client-orgs')
      .then(res => setClientOrgs(res.data?.data ?? []))
      .catch(() => {});
    Promise.all([getProjectTypesApi(), getPmStatusesApi()])
      .then(([typesRes, statusesRes]) => {
        const typeList = typesRes.data?.data || [];
        setProjectTypes(typeList);
        setStatuses(statusesRes.data?.data || []);
        if (typeList.length > 0) setForm(f => ({ ...f, projectType: typeList[0].name }));
      })
      .catch(() => toast.error('Failed to load configuration'))
      .finally(() => setLoading(false));
  }, [open]);

  const set = (field, val) => setForm(f => ({ ...f, [field]: val }));
  const selectedOrg = clientOrgs.find(o => (o._id ?? o.id) === form.clientOrgId) || null;
  // Duplicate-name check against the full name the server will receive
  const nameCheck = useProjectNameCheck(
    selectedOrg && form.name.trim() ? `${selectedOrg.name} - ${form.name.trim()}` : form.name
  );

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
        clientOrgId: form.clientOrgId      || undefined,
        name:        fullName,
        description: form.description      || undefined,
        purpose:     form.purpose          || undefined,
        billingType: form.billingType,
        projectType: form.projectType,
        status:      form.status,
        isProduct:    form.isProduct === true,
        isOperations: form.isOperations !== false,
        managerId:   isMgr ? userId : undefined,
        startDate:   form.plannedStart || undefined,
        endDate:     form.plannedEnd   || undefined,
      });
      const project = res.data?.data;
      const newId   = project?._id ?? project?.id;
      if (!newId) throw new Error('Server did not return a project ID. Please try again.');
      toast.success('Project created successfully');
      onCreated?.({ ...project, _id: newId });
      onClose?.();
    } catch (err) {
      toast.error(
        err.response?.data?.message ||
        err.response?.data?.error?.message ||
        err.message ||
        'Failed to create project',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New Project" size="lg">
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <p className="text-[11px] text-gray-400 -mt-1">
            {form.isProduct
              ? 'Milestones are auto-generated from the selected project type. '
              : 'Operations only — no milestones are created. Tick "Product" below if this project is also planned in Project Management. '}
            Team members can be added later from the project&apos;s Team Setup tab.
          </p>

          {/* Client Organisation | Project Name */}
          <div className="grid grid-cols-2 gap-5">
            <div>
              <Lbl>Client Organisation</Lbl>
              <select
                value={form.clientOrgId || ''}
                onChange={e => set('clientOrgId', e.target.value || null)}
                className={inp}
              >
                <option value="">— None —</option>
                {clientOrgs.map(org => (
                  <option key={org._id ?? org.id} value={org._id ?? org.id}>{org.name}</option>
                ))}
              </select>
            </div>
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
                  autoFocus
                />
              </div>
              {nameCheck.checking && <p className="text-[11px] text-gray-400 mt-0.5">Checking name…</p>}
              {nameCheck.taken && <p className="text-[11px] text-red-600 mt-0.5">{nameCheck.message}</p>}
            </div>
          </div>

          {/* Project Type | Initial Status | Billing Type */}
          <div className="grid grid-cols-3 gap-5">
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
                  <option key={t._id ?? t.id} value={t.name}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Lbl>Initial Status</Lbl>
              <select
                value={form.status}
                onChange={e => set('status', e.target.value)}
                className={inp}
              >
                {statuses.map(s => (
                  <option key={s._id ?? s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Lbl>Billing Type</Lbl>
              <div className="flex h-9 bg-gray-100 rounded-lg p-0.5 gap-0.5">
                {[
                  { val: 'Billable',     icon: '💰', label: 'Billable'     },
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

          {/* Used for */}
          <div>
            <Lbl>Used for</Lbl>
            <ProjectUsageChecks
              compact
              value={{ isProduct: form.isProduct, isOperations: form.isOperations }}
              onChange={(next) => setForm(f => ({ ...f, ...next }))}
            />
          </div>

          {/* Planned Start | Planned End */}
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

          <div className="h-px bg-gray-100" />

          {/* Description | Purpose */}
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

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-5 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
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
        </form>
      )}
    </Modal>
  );
}
