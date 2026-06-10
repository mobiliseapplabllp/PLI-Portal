import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { createProjectApi } from '../../api/pm/projects.api';
import { getUsersApi } from '../../api/users.api';
import { HiOutlineArrowLeft } from 'react-icons/hi';

const STATUS_OPTIONS = ['planning', 'active', 'on_hold'];

export default function CreateProject() {
  const navigate = useNavigate();
  const { user } = useSelector(s => s.auth);
  const [users, setUsers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    purpose: '',
    ownerId: user?._id || '',
    clientName: '',
    clientEmail: '',
    notifyClient: false,
    managerId: '',
    status: 'planning',
    startDate: '',
    endDate: '',
  });

  useEffect(() => {
    getUsersApi({ isActive: true, limit: 200 }).then(res => {
      setUsers(res.data?.data?.users || res.data?.data || []);
    }).catch(() => {});
  }, []);

  const set = (field, val) => setForm(f => ({ ...f, [field]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Project name is required');
    setSaving(true);
    try {
      const res = await createProjectApi(form);
      toast.success('Project created');
      navigate(`/pm/projects/${res.data.data.id}`);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to create project');
    } finally {
      setSaving(false);
    }
  };

  const Field = ({ label, required, children }) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );

  const inputClass = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/pm/projects')} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors">
          <HiOutlineArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create Project</h1>
          <p className="text-sm text-gray-500">Fill in the project details below</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Project Info</h2>

        <Field label="Project Name" required>
          <input value={form.name} onChange={e => set('name', e.target.value)} className={inputClass} placeholder="e.g. Portal Redesign 2025" />
        </Field>

        <Field label="Description">
          <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3} className={inputClass} placeholder="Brief description of the project..." />
        </Field>

        <Field label="Purpose / Objective">
          <textarea value={form.purpose} onChange={e => set('purpose', e.target.value)} rows={2} className={inputClass} placeholder="What is the goal of this project?" />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Status">
            <select value={form.status} onChange={e => set('status', e.target.value)} className={inputClass}>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
            </select>
          </Field>

          <Field label="Project Owner">
            <select value={form.ownerId} onChange={e => set('ownerId', e.target.value)} className={inputClass}>
              <option value="">Select owner</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
            </select>
          </Field>
        </div>

        <Field label="Project Manager">
          <select value={form.managerId} onChange={e => set('managerId', e.target.value)} className={inputClass}>
            <option value="">Select project manager</option>
            {users.filter(u => ['manager', 'senior_manager', 'admin'].includes(u.role)).map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Start Date">
            <input type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} className={inputClass} />
          </Field>
          <Field label="End Date">
            <input type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)} className={inputClass} />
          </Field>
        </div>

        <hr className="border-gray-100" />
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Client Details</h2>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Client Name">
            <input value={form.clientName} onChange={e => set('clientName', e.target.value)} className={inputClass} placeholder="Client / Company name" />
          </Field>
          <Field label="Client Email">
            <input type="email" value={form.clientEmail} onChange={e => set('clientEmail', e.target.value)} className={inputClass} placeholder="client@example.com" />
          </Field>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.notifyClient} onChange={e => set('notifyClient', e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-emerald-600" />
          <span className="text-sm text-gray-600">Send daily status reports to client</span>
        </label>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={() => navigate('/pm/projects')} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="px-5 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors">
            {saving ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </form>
    </div>
  );
}
