import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { createProjectApi } from '../../api/pm/projects.api';
import { getUsersApi } from '../../api/users.api';
import { getProjectTypesApi, getPmStatusesApi } from '../../api/pm/config.api';
import { HiOutlineArrowLeft, HiOutlineInformationCircle } from 'react-icons/hi';

// Must be defined outside component — defining inside causes remount on every keystroke
function Field({ label, required, hint, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div className="pb-2 border-b border-gray-100">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{children}</h2>
    </div>
  );
}

export default function CreateProject() {
  const navigate = useNavigate();
  const { user } = useSelector(s => s.auth);
  const isAdmin = user?.role === 'admin';
  const isMgr   = ['admin','manager','senior_manager'].includes(user?.role);
  const userId   = user?._id || user?.id || '';

  const [users,        setUsers]        = useState([]);
  const [projectTypes, setProjectTypes] = useState([]);
  const [statuses,     setStatuses]     = useState([]);
  const [saving,       setSaving]       = useState(false);
  const [loading,      setLoading]      = useState(true);

  const [form, setForm] = useState({
    name:             '',
    description:      '',
    purpose:          '',
    // Billing (Billable / Non-Billable)
    billingType:      'Non-Billable',
    // Project category (Signed / Unsigned / Contract / Demo Prototype)
    projectType:      '',
    // Status loaded from config
    status:           'Yet to Start',
    // Account Manager / Sales Manager
    accountManagerId: '',
    // Project Manager / Owner
    managerId:        isMgr ? userId : '',
    // Client
    clientName:       '',
    clientEmail:      '',
    notifyClient:     false,
    // Dates
    startDate:        '',
    endDate:          '',
  });

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getUsersApi({ isActive: true, limit: 200 }),
      getProjectTypesApi(),
      getPmStatusesApi(),
    ]).then(([usersRes, typesRes, statusesRes]) => {
      const userList   = usersRes.data?.data?.users || usersRes.data?.data || [];
      const typeList   = typesRes.data?.data || [];
      const statusList = statusesRes.data?.data || [];
      setUsers(userList);
      setProjectTypes(typeList);
      setStatuses(statusList);
      // Pre-select first available type and default status
      if (typeList.length > 0) {
        setForm(f => ({ ...f, projectType: typeList[0].name }));
      }
    }).catch(() => {
      toast.error('Failed to load configuration — check connection');
    }).finally(() => setLoading(false));
  }, []);

  const set = (field, val) => setForm(f => ({ ...f, [field]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Project name is required');
    if (!form.projectType) return toast.error('Project type is required');
    setSaving(true);
    try {
      const payload = {
        name:             form.name.trim(),
        description:      form.description,
        purpose:          form.purpose,
        billingType:      form.billingType,
        projectType:      form.projectType,
        status:           form.status,
        accountManagerId: form.accountManagerId || undefined,
        managerId:        form.managerId        || undefined,
        clientName:       form.clientName,
        clientEmail:      form.clientEmail,
        notifyClient:     form.notifyClient,
        startDate:        form.startDate        || undefined,
        endDate:          form.endDate          || undefined,
      };
      const res = await createProjectApi(payload);
      const newId = res.data?.data?._id || res.data?.data?.id;
      toast.success('Project created — milestones auto-generated');
      navigate(`/pm/projects/${newId}`);
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error?.message || 'Failed to create project');
    } finally {
      setSaving(false);
    }
  };

  const inputClass  = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white";
  const selectClass = inputClass;

  // Milestone preview based on selected project type
  const previewTemplates = {
    'Demo Prototype': [
      { name: 'Requirements', range: '5–10%' },
      { name: 'Design',       range: '15–20%' },
      { name: 'Development',  range: '50–60%' },
      { name: 'Testing',      range: '10–15%' },
      { name: 'Delivery',     range: '5–10%' },
    ],
    'Signed': [
      { name: 'Requirements', range: '5–10%' },
      { name: 'Design',       range: '15–25%' },
      { name: 'Development',  range: '40–55%' },
      { name: 'Testing',      range: '10–20%' },
      { name: 'Delivery',     range: '5–10%' },
    ],
  };
  const milestonePreview = previewTemplates[form.projectType] || null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-10">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/pm/projects')}
          className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
        >
          <HiOutlineArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create Project</h1>
          <p className="text-sm text-gray-500">Fill in the project details — milestones will be created automatically based on project type</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ── Section 1: Project Info ─────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <SectionTitle>Project Info</SectionTitle>

          <Field label="Project Name" required>
            <input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              className={inputClass}
              placeholder="e.g. PLI Portal Redesign 2026"
            />
          </Field>

          <Field label="Description">
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={3}
              className={inputClass}
              placeholder="Brief description of the project..."
            />
          </Field>

          <Field label="Purpose / Objective">
            <textarea
              value={form.purpose}
              onChange={e => set('purpose', e.target.value)}
              rows={2}
              className={inputClass}
              placeholder="What is the goal of this project?"
            />
          </Field>
        </div>

        {/* ── Section 2: Classification ───────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <SectionTitle>Classification</SectionTitle>

          {/* Billing Type — toggle chips */}
          <Field label="Billing Type" required>
            <div className="flex gap-3">
              {['Billable', 'Non-Billable'].map(type => (
                <label
                  key={type}
                  className={`flex items-center gap-2 px-4 py-2 border rounded-lg cursor-pointer text-sm font-medium transition-colors ${
                    form.billingType === type
                      ? type === 'Billable'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : 'border-gray-400 bg-gray-50 text-gray-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="billingType"
                    value={type}
                    checked={form.billingType === type}
                    onChange={() => set('billingType', type)}
                    className="sr-only"
                  />
                  {type === 'Billable' ? '💰' : '🔧'} {type}
                </label>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            {/* Project Type — from config */}
            <Field
              label="Project Type"
              required
              hint="Determines which milestone template is applied"
            >
              <select
                value={form.projectType}
                onChange={e => set('projectType', e.target.value)}
                className={selectClass}
              >
                <option value="">Select type…</option>
                {projectTypes.map(t => (
                  <option key={t._id || t.id} value={t.name}>{t.name}</option>
                ))}
              </select>
            </Field>

            {/* Status — from config */}
            <Field label="Initial Status">
              <select
                value={form.status}
                onChange={e => set('status', e.target.value)}
                className={selectClass}
              >
                {statuses.map(s => (
                  <option key={s._id || s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </Field>
          </div>

          {/* Milestone preview */}
          {milestonePreview && (
            <div className="rounded-lg bg-blue-50 border border-blue-100 p-3">
              <div className="flex items-start gap-2">
                <HiOutlineInformationCircle className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-blue-700 mb-1">
                    Auto-created milestones for <span className="font-bold">{form.projectType}</span>:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {milestonePreview.map(m => (
                      <span key={m.name} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-blue-200 rounded text-xs text-blue-700">
                        <span className="font-medium">{m.name}</span>
                        <span className="text-blue-400">{m.range}</span>
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-blue-500 mt-1.5">
                    You'll assign exact % to each milestone in the Project Plan tab.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Section 3: Team ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <SectionTitle>Team</SectionTitle>

          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Account Manager / Sales Manager"
              hint="Client POC on commercial side"
            >
              <select
                value={form.accountManagerId}
                onChange={e => set('accountManagerId', e.target.value)}
                className={selectClass}
              >
                <option value="">Select account manager</option>
                {users.map(u => (
                  <option key={u._id || u.id} value={u._id || u.id}>
                    {u.name}
                    {u.role ? ` (${u.role.replace(/_/g, ' ')})` : ''}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Project Manager / Owner"
              hint="Responsible for delivery"
            >
              <select
                value={form.managerId}
                onChange={e => set('managerId', e.target.value)}
                className={selectClass}
              >
                <option value="">Select project manager</option>
                {users
                  .filter(u => ['admin','manager','senior_manager'].includes(u.role))
                  .map(u => (
                    <option key={u._id || u.id} value={u._id || u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </Field>
          </div>
        </div>

        {/* ── Section 4: Timeline ─────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <SectionTitle>Timeline</SectionTitle>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Start Date">
              <input
                type="date"
                value={form.startDate}
                onChange={e => set('startDate', e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="End Date">
              <input
                type="date"
                value={form.endDate}
                onChange={e => set('endDate', e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
        </div>

        {/* ── Section 5: Client Details ────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <SectionTitle>Client Details</SectionTitle>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Client Name">
              <input
                value={form.clientName}
                onChange={e => set('clientName', e.target.value)}
                className={inputClass}
                placeholder="Client / Company name"
              />
            </Field>
            <Field label="Client Email">
              <input
                type="email"
                value={form.clientEmail}
                onChange={e => set('clientEmail', e.target.value)}
                className={inputClass}
                placeholder="client@example.com"
              />
            </Field>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.notifyClient}
              onChange={e => set('notifyClient', e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span className="text-sm text-gray-600">Send daily status reports to client email</span>
          </label>
        </div>

        {/* ── Actions ─────────────────────────────────────────────────────── */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/pm/projects')}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !form.name.trim() || !form.projectType}
            className="px-5 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Creating…' : 'Create Project'}
          </button>
        </div>
      </form>
    </div>
  );
}
