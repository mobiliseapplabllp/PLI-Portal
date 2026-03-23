import { useEffect, useState } from 'react';
import { getKpiTemplatesApi, createKpiTemplateApi, updateKpiTemplateApi, deleteKpiTemplateApi } from '../../api/kpiTemplates.api';
import PageHeader from '../../components/common/PageHeader';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import toast from 'react-hot-toast';
import { KPI_CATEGORIES, KPI_UNITS } from '../../utils/constants';
import { HiOutlineSearch, HiOutlinePencil, HiOutlineTrash } from 'react-icons/hi';

const emptyForm = {
  name: '',
  description: '',
  category: 'Other',
  unit: 'Number',
  defaultWeightage: '',
  defaultTargetValue: '',
  defaultThresholdValue: '',
  defaultStretchTarget: '',
};

export default function KpiTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const loadTemplates = (searchTerm) => {
    setLoading(true);
    const params = {};
    if (searchTerm) params.search = searchTerm;
    getKpiTemplatesApi(params)
      .then((res) => setTemplates(res.data.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const handleSearch = () => {
    loadTemplates(search);
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch();
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setShowModal(true);
  };

  const openEdit = (template) => {
    setEditing(template);
    setForm({
      name: template.name,
      description: template.description || '',
      category: template.category,
      unit: template.unit,
      defaultWeightage: template.defaultWeightage ?? '',
      defaultTargetValue: template.defaultTargetValue ?? '',
      defaultThresholdValue: template.defaultThresholdValue ?? '',
      defaultStretchTarget: template.defaultStretchTarget ?? '',
    });
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error('Template name is required');
      return;
    }
    try {
      const payload = {
        ...form,
        defaultWeightage: form.defaultWeightage !== '' ? Number(form.defaultWeightage) : undefined,
        defaultTargetValue: form.defaultTargetValue !== '' ? Number(form.defaultTargetValue) : undefined,
        defaultThresholdValue: form.defaultThresholdValue !== '' ? Number(form.defaultThresholdValue) : undefined,
        defaultStretchTarget: form.defaultStretchTarget !== '' ? Number(form.defaultStretchTarget) : undefined,
      };

      if (editing) {
        await updateKpiTemplateApi(editing._id, payload);
        toast.success('Template updated');
      } else {
        await createKpiTemplateApi(payload);
        toast.success('Template created');
      }
      setShowModal(false);
      loadTemplates(search);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed');
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteKpiTemplateApi(deleteConfirm._id);
      toast.success('Template deactivated');
      setDeleteConfirm(null);
      loadTemplates(search);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed');
    }
  };

  if (loading && templates.length === 0) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader
        title="KPI Templates"
        subtitle="Manage reusable KPI templates for quick assignment"
        actions={<button onClick={openCreate} className="btn-primary">+ Add Template</button>}
      />

      {/* Search */}
      <div className="card mb-6">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search templates by name..."
              className="input-field pl-9"
            />
          </div>
          <button onClick={handleSearch} className="btn-secondary">Search</button>
        </div>
      </div>

      {/* Templates Table */}
      <div className="card overflow-x-auto">
        {templates.length === 0 ? (
          <p className="text-gray-400 text-center py-8">No templates found. Create one to get started.</p>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Category</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Unit</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Weightage</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Target</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {templates.map((t) => (
                <tr key={t._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{t.name}</p>
                      {t.description && <p className="text-xs text-gray-400 truncate max-w-xs">{t.description}</p>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{t.category}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{t.unit}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{t.defaultWeightage != null ? `${t.defaultWeightage}%` : '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{t.defaultTargetValue ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${t.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {t.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openEdit(t)} className="text-primary-600 hover:text-primary-800" title="Edit">
                        <HiOutlinePencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => setDeleteConfirm(t)} className="text-red-500 hover:text-red-700" title="Deactivate">
                        <HiOutlineTrash className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit KPI Template' : 'Create KPI Template'} size="lg">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="label-text">Template Name *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" placeholder="e.g., Revenue Growth Target" />
          </div>
          <div className="md:col-span-2">
            <label className="label-text">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input-field" rows={2} placeholder="Describe this KPI template..." />
          </div>
          <div>
            <label className="label-text">Category</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input-field">
              {KPI_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label-text">Unit</label>
            <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="input-field">
              {KPI_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="label-text">Default Weightage (%)</label>
            <input type="number" value={form.defaultWeightage} onChange={(e) => setForm({ ...form, defaultWeightage: e.target.value })} className="input-field" min="1" max="100" placeholder="e.g., 20" />
          </div>
          <div>
            <label className="label-text">Default Target Value</label>
            <input type="number" value={form.defaultTargetValue} onChange={(e) => setForm({ ...form, defaultTargetValue: e.target.value })} className="input-field" placeholder="e.g., 100" />
          </div>
          <div>
            <label className="label-text">Default Threshold (Min)</label>
            <input type="number" value={form.defaultThresholdValue} onChange={(e) => setForm({ ...form, defaultThresholdValue: e.target.value })} className="input-field" placeholder="e.g., 70" />
          </div>
          <div>
            <label className="label-text">Default Stretch Target</label>
            <input type="number" value={form.defaultStretchTarget} onChange={(e) => setForm({ ...form, defaultStretchTarget: e.target.value })} className="input-field" placeholder="e.g., 120" />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
          <button onClick={handleSubmit} className="btn-primary">{editing ? 'Update' : 'Create'}</button>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteConfirm}
        title="Deactivate Template"
        message={`Are you sure you want to deactivate "${deleteConfirm?.name}"? It will no longer appear in template lists.`}
        confirmText="Deactivate"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
