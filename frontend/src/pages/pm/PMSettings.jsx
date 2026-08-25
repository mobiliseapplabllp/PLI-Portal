import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineArrowLeft,
  HiOutlinePlus,
  HiOutlinePencil,
  HiOutlineTrash,
  HiOutlineCheck,
  HiOutlineX,
  HiOutlineTag,
  HiOutlineColorSwatch,
  HiOutlineTemplate,
  HiOutlineClock,
  HiOutlineMail,
  HiOutlinePlay,
  HiOutlineSave,
} from 'react-icons/hi';
import api from '../../api/axios';
import {
  getProjectTypesApi, createProjectTypeApi, updateProjectTypeApi, deleteProjectTypeApi,
  getPmStatusesApi, createPmStatusApi, updatePmStatusApi, deletePmStatusApi,
  getMilestoneTemplatesApi, createMilestoneTemplateApi, updateMilestoneTemplateApi,
  deleteMilestoneTemplateApi, validateTemplateRangesApi,
} from '../../api/pm/config.api';

const getId = (item) => item?._id || item?.id || '';

const TABS = [
  { label: 'Project Types',        icon: HiOutlineTag },
  { label: 'Statuses',             icon: HiOutlineColorSwatch },
  { label: 'Milestone Templates',  icon: HiOutlineTemplate },
  { label: 'Scheduler',            icon: HiOutlineClock },
];

// ─── Reusable Toggle Switch ───────────────────────────────────────────────────
function Toggle({ checked, onChange, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={[
        'relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent',
        'transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1',
        checked ? 'bg-emerald-500' : 'bg-gray-200',
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
      ].join(' ')}
    >
      <span
        className={[
          'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0',
          'transition duration-200 ease-in-out',
          checked ? 'translate-x-4' : 'translate-x-0',
        ].join(' ')}
      />
    </button>
  );
}

// ─── Shared table header style ────────────────────────────────────────────────
const thCls = 'px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide';
const inputCls =
  'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';
const editInputCls =
  'w-full px-2 py-1.5 border border-emerald-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';

// ─── Tab 1: Project Types ─────────────────────────────────────────────────────
function ProjectTypesTab() {
  const [types,    setTypes]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [newName,  setNewName]  = useState('');
  const [adding,   setAdding]   = useState(false);
  const [editId,   setEditId]   = useState(null);
  const [editData, setEditData] = useState({ name: '', sortOrder: 0, isActive: true });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getProjectTypesApi();
      setTypes(r.data.data ?? r.data ?? []);
    } catch {
      toast.error('Failed to load project types');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!newName.trim()) return toast.error('Name is required');
    setAdding(true);
    try {
      await createProjectTypeApi({ name: newName.trim() });
      toast.success('Project type added');
      setNewName('');
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to add project type');
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (item) => {
    setEditId(getId(item));
    setEditData({ name: item.name, sortOrder: item.sortOrder ?? 0, isActive: item.isActive ?? true });
  };

  const handleUpdate = async (id) => {
    try {
      await updateProjectTypeApi(id, editData);
      toast.success('Project type updated');
      setEditId(null);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to update');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this project type?')) return;
    try {
      await deleteProjectTypeApi(id);
      toast.success('Project type deleted');
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Cannot delete — may be in use');
    }
  };

  const handleToggleActive = async (item) => {
    try {
      await updateProjectTypeApi(getId(item), { isActive: !item.isActive });
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to toggle');
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-400 text-sm">Loading project types…</div>;
  }

  return (
    <div className="space-y-4">
      {/* Inline add form */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-sm font-semibold text-gray-700 mb-3">Add Project Type</p>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="e.g. Fixed Price, T&amp;M, Retainer…"
            className={inputCls + ' flex-1'}
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newName.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <HiOutlinePlus className="w-4 h-4" />
            {adding ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {types.length === 0 ? (
          <p className="text-center text-gray-400 py-10 text-sm">No project types yet. Add one above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className={thCls + ' text-left'}>Name</th>
                  <th className={thCls + ' text-center w-28'}>Sort Order</th>
                  <th className={thCls + ' text-center w-24'}>Active</th>
                  <th className={thCls + ' text-right w-28'}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {types.map(item => {
                  const id = getId(item);
                  const isEditing = editId === id;
                  return (
                    <tr key={id} className="hover:bg-gray-50/70 transition-colors">
                      {isEditing ? (
                        <>
                          <td className="px-4 py-2">
                            <input
                              type="text"
                              value={editData.name}
                              onChange={e => setEditData(p => ({ ...p, name: e.target.value }))}
                              className={editInputCls}
                              autoFocus
                            />
                          </td>
                          <td className="px-4 py-2 text-center">
                            <input
                              type="number"
                              value={editData.sortOrder}
                              onChange={e => setEditData(p => ({ ...p, sortOrder: +e.target.value }))}
                              className={editInputCls + ' w-16 text-center mx-auto'}
                            />
                          </td>
                          <td className="px-4 py-2 text-center">
                            <Toggle
                              checked={!!editData.isActive}
                              onChange={() => setEditData(p => ({ ...p, isActive: !p.isActive }))}
                            />
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex justify-end gap-1">
                              <button
                                onClick={() => handleUpdate(id)}
                                className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                title="Save"
                              >
                                <HiOutlineCheck className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setEditId(null)}
                                className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
                                title="Cancel"
                              >
                                <HiOutlineX className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3 font-medium text-gray-800">{item.name}</td>
                          <td className="px-4 py-3 text-center text-gray-500">{item.sortOrder ?? 0}</td>
                          <td className="px-4 py-3 text-center">
                            <Toggle checked={!!item.isActive} onChange={() => handleToggleActive(item)} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-1">
                              <button
                                onClick={() => startEdit(item)}
                                className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                title="Edit"
                              >
                                <HiOutlinePencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(id)}
                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                title="Delete"
                              >
                                <HiOutlineTrash className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab 2: Statuses ──────────────────────────────────────────────────────────
function StatusesTab() {
  const [statuses, setStatuses] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [addForm,  setAddForm]  = useState({ name: '', color: '#10b981', isActive: true });
  const [adding,   setAdding]   = useState(false);
  const [editId,   setEditId]   = useState(null);
  const [editData, setEditData] = useState({ name: '', color: '#10b981', isActive: true });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getPmStatusesApi();
      setStatuses(r.data.data ?? r.data ?? []);
    } catch {
      toast.error('Failed to load statuses');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!addForm.name.trim()) return toast.error('Name is required');
    setAdding(true);
    try {
      await createPmStatusApi({ ...addForm, name: addForm.name.trim() });
      toast.success('Status added');
      setAddForm({ name: '', color: '#10b981', isActive: true });
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to add status');
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (item) => {
    setEditId(getId(item));
    setEditData({ name: item.name, color: item.color || '#10b981', isActive: item.isActive ?? true });
  };

  const handleUpdate = async (id) => {
    try {
      await updatePmStatusApi(id, editData);
      toast.success('Status updated');
      setEditId(null);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to update');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this status?')) return;
    try {
      await deletePmStatusApi(id);
      toast.success('Status deleted');
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Cannot delete');
    }
  };

  const handleToggleActive = async (item) => {
    try {
      await updatePmStatusApi(getId(item), { isActive: !item.isActive });
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to toggle');
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-400 text-sm">Loading statuses…</div>;
  }

  return (
    <div className="space-y-4">
      {/* Add form */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-sm font-semibold text-gray-700 mb-3">Add Status</p>
        <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
          <input
            type="text"
            value={addForm.name}
            onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="e.g. Active, On Hold, Cancelled…"
            className={inputCls + ' flex-1 min-w-0'}
          />
          <div className="flex items-center gap-2 shrink-0">
            <label className="text-xs text-gray-500 whitespace-nowrap">Color</label>
            <div className="relative">
              <div
                className="w-8 h-8 rounded-full border-2 border-gray-200 shadow-sm cursor-pointer overflow-hidden"
                style={{ backgroundColor: addForm.color }}
              >
                <input
                  type="color"
                  value={addForm.color}
                  onChange={e => setAddForm(p => ({ ...p, color: e.target.value }))}
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                  title="Pick a color"
                />
              </div>
            </div>
            <span className="text-xs text-gray-400 font-mono">{addForm.color}</span>
          </div>
          <button
            onClick={handleAdd}
            disabled={adding || !addForm.name.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
          >
            <HiOutlinePlus className="w-4 h-4" />
            {adding ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {statuses.length === 0 ? (
          <p className="text-center text-gray-400 py-10 text-sm">No statuses yet. Add one above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className={thCls + ' text-left'}>Name</th>
                  <th className={thCls + ' text-center w-28'}>Color</th>
                  <th className={thCls + ' text-center w-24'}>System</th>
                  <th className={thCls + ' text-center w-24'}>Active</th>
                  <th className={thCls + ' text-right w-28'}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {statuses.map(item => {
                  const id = getId(item);
                  const isEditing = editId === id;
                  return (
                    <tr key={id} className="hover:bg-gray-50/70 transition-colors">
                      {isEditing ? (
                        <>
                          <td className="px-4 py-2">
                            <input
                              type="text"
                              value={editData.name}
                              onChange={e => setEditData(p => ({ ...p, name: e.target.value }))}
                              className={editInputCls}
                              autoFocus
                            />
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex items-center justify-center gap-2">
                              <div
                                className="w-7 h-7 rounded-full border-2 border-gray-200 shadow-sm cursor-pointer overflow-hidden relative"
                                style={{ backgroundColor: editData.color }}
                              >
                                <input
                                  type="color"
                                  value={editData.color}
                                  onChange={e => setEditData(p => ({ ...p, color: e.target.value }))}
                                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                                />
                              </div>
                              <span className="text-xs text-gray-400 font-mono">{editData.color}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2 text-center">
                            {item.isSystem
                              ? <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">System</span>
                              : <span className="text-gray-300 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <Toggle
                              checked={!!editData.isActive}
                              onChange={() => setEditData(p => ({ ...p, isActive: !p.isActive }))}
                            />
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex justify-end gap-1">
                              <button
                                onClick={() => handleUpdate(id)}
                                className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                title="Save"
                              >
                                <HiOutlineCheck className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setEditId(null)}
                                className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
                                title="Cancel"
                              >
                                <HiOutlineX className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3 font-medium text-gray-800">{item.name}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-2">
                              <div
                                className="w-5 h-5 rounded-full border border-gray-200 shadow-sm"
                                style={{ backgroundColor: item.color || '#6b7280' }}
                                title={item.color}
                              />
                              <span className="text-xs text-gray-400 font-mono hidden sm:inline">{item.color || '—'}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {item.isSystem
                              ? <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">System</span>
                              : <span className="text-gray-300 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Toggle checked={!!item.isActive} onChange={() => handleToggleActive(item)} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-1">
                              <button
                                onClick={() => startEdit(item)}
                                className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                title="Edit"
                              >
                                <HiOutlinePencil className="w-4 h-4" />
                              </button>
                              {!item.isSystem && (
                                <button
                                  onClick={() => handleDelete(id)}
                                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Delete"
                                >
                                  <HiOutlineTrash className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab 3: Milestone Templates ───────────────────────────────────────────────
function MilestoneTemplatesTab() {
  const [templates,     setTemplates]     = useState([]);
  const [projectTypes,  setProjectTypes]  = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [selectedType,  setSelectedType]  = useState('');
  const [validation,    setValidation]    = useState({});       // { [typeName]: { valid, message, ... } }
  const [addForm,       setAddForm]       = useState({ projectType: '', name: '', minPct: '', maxPct: '', sortOrder: 0 });
  const [adding,        setAdding]        = useState(false);
  const [editId,        setEditId]        = useState(null);
  const [editData,      setEditData]      = useState({});
  const typeInitialized                   = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tplRes, ptRes] = await Promise.all([getMilestoneTemplatesApi(), getProjectTypesApi()]);
      // Backend returns { templates: [...], grouped: {...} } — extract the flat array
      const rawTpl = tplRes.data.data;
      setTemplates(Array.isArray(rawTpl) ? rawTpl : (rawTpl?.templates ?? []));
      setProjectTypes(ptRes.data.data ?? ptRes.data ?? []);
    } catch {
      toast.error('Failed to load milestone templates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Set default selected type once, after project types load
  useEffect(() => {
    if (!typeInitialized.current && projectTypes.length > 0) {
      typeInitialized.current = true;
      const firstName = projectTypes[0].name;
      setSelectedType(firstName);
      setAddForm(p => ({ ...p, projectType: firstName }));
    }
  }, [projectTypes]);

  // Validate ranges for the active project type whenever templates or type changes
  const validateType = useCallback(async (typeName) => {
    if (!typeName) return;
    setValidation(v => ({ ...v, [typeName]: undefined }));   // show "validating…"
    try {
      const r = await validateTemplateRangesApi(typeName);
      setValidation(v => ({ ...v, [typeName]: r.data.data ?? r.data }));
    } catch {
      setValidation(v => ({ ...v, [typeName]: { valid: false, message: 'Validation error' } }));
    }
  }, []);

  useEffect(() => {
    if (selectedType) validateType(selectedType);
  }, [selectedType, templates, validateType]);

  const filteredTemplates = templates
    .filter(t => t.projectType === selectedType)
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const handleAdd = async () => {
    if (!addForm.projectType)        return toast.error('Project type is required');
    if (!addForm.name.trim())        return toast.error('Name is required');
    if (addForm.minPct === '')       return toast.error('Min % is required');
    if (addForm.maxPct === '')       return toast.error('Max % is required');
    setAdding(true);
    try {
      await createMilestoneTemplateApi({
        ...addForm,
        name:      addForm.name.trim(),
        minPct:    +addForm.minPct,
        maxPct:    +addForm.maxPct,
        sortOrder: +addForm.sortOrder,
      });
      toast.success('Milestone template added');
      setAddForm(p => ({ ...p, name: '', minPct: '', maxPct: '', sortOrder: 0 }));
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to add template');
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (item) => {
    setEditId(getId(item));
    setEditData({ name: item.name, minPct: item.minPct, maxPct: item.maxPct, sortOrder: item.sortOrder ?? 0 });
  };

  const handleUpdate = async (id) => {
    try {
      await updateMilestoneTemplateApi(id, {
        ...editData,
        minPct:    +editData.minPct,
        maxPct:    +editData.maxPct,
        sortOrder: +editData.sortOrder,
      });
      toast.success('Template updated');
      setEditId(null);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to update');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this milestone template?')) return;
    try {
      await deleteMilestoneTemplateApi(id);
      toast.success('Template deleted');
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Cannot delete');
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-400 text-sm">Loading milestone templates…</div>;
  }

  const vResult = validation[selectedType];

  return (
    <div className="space-y-4">
      {/* Add form */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-sm font-semibold text-gray-700 mb-3">Add Milestone Template</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {/* Project Type */}
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-xs text-gray-500 mb-1">Project Type</label>
            <select
              value={addForm.projectType}
              onChange={e => setAddForm(p => ({ ...p, projectType: e.target.value }))}
              className={inputCls}
            >
              <option value="">Select…</option>
              {projectTypes.map(pt => (
                <option key={getId(pt)} value={pt.name}>{pt.name}</option>
              ))}
            </select>
          </div>
          {/* Name */}
          <div className="col-span-2 sm:col-span-1 lg:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Name</label>
            <input
              type="text"
              value={addForm.name}
              onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))}
              placeholder="Milestone name"
              className={inputCls}
            />
          </div>
          {/* Min % */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Min %</label>
            <input
              type="number"
              min="0" max="100"
              value={addForm.minPct}
              onChange={e => setAddForm(p => ({ ...p, minPct: e.target.value }))}
              placeholder="0"
              className={inputCls}
            />
          </div>
          {/* Max % */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Max %</label>
            <input
              type="number"
              min="0" max="100"
              value={addForm.maxPct}
              onChange={e => setAddForm(p => ({ ...p, maxPct: e.target.value }))}
              placeholder="100"
              className={inputCls}
            />
          </div>
          {/* Sort Order */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Sort Order</label>
            <input
              type="number"
              value={addForm.sortOrder}
              onChange={e => setAddForm(p => ({ ...p, sortOrder: e.target.value }))}
              placeholder="0"
              className={inputCls}
            />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            onClick={handleAdd}
            disabled={adding}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            <HiOutlinePlus className="w-4 h-4" />
            {adding ? 'Adding…' : 'Add Template'}
          </button>
        </div>
      </div>

      {/* Project type filter pills */}
      {projectTypes.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-gray-500">Filter:</span>
          {projectTypes.map(pt => (
            <button
              key={getId(pt)}
              onClick={() => setSelectedType(pt.name)}
              className={[
                'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                selectedType === pt.name
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                  : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-700',
              ].join(' ')}
            >
              {pt.name}
            </button>
          ))}
        </div>
      )}

      {/* Validation badge */}
      {selectedType && (
        <div
          className={[
            'flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium w-fit',
            vResult === undefined
              ? 'border-gray-200 bg-gray-50 text-gray-500'
              : vResult?.valid
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-amber-200 bg-amber-50 text-amber-700',
          ].join(' ')}
        >
          {vResult === undefined ? (
            <span>Validating ranges…</span>
          ) : vResult?.valid ? (
            <><span aria-hidden="true">✅</span><span>Ranges valid</span></>
          ) : (
            <><span aria-hidden="true">⚠️</span><span>{vResult?.message || 'Cannot reach 100%'}</span></>
          )}
        </div>
      )}

      {/* Template list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {!selectedType ? (
          <p className="text-center text-gray-400 py-10 text-sm">Select a project type above to view templates.</p>
        ) : filteredTemplates.length === 0 ? (
          <p className="text-center text-gray-400 py-10 text-sm">
            No milestone templates for <span className="font-medium text-gray-600">"{selectedType}"</span> yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className={thCls + ' text-left'}>Name</th>
                  <th className={thCls + ' text-center w-40'}>Range (%)</th>
                  <th className={thCls + ' text-center w-28'}>Sort Order</th>
                  <th className={thCls + ' text-right w-28'}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredTemplates.map(item => {
                  const id = getId(item);
                  const isEditing = editId === id;
                  return (
                    <tr key={id} className="hover:bg-gray-50/70 transition-colors">
                      {isEditing ? (
                        <>
                          <td className="px-4 py-2">
                            <input
                              type="text"
                              value={editData.name}
                              onChange={e => setEditData(p => ({ ...p, name: e.target.value }))}
                              className={editInputCls}
                              autoFocus
                            />
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex items-center justify-center gap-1">
                              <input
                                type="number" min="0" max="100"
                                value={editData.minPct}
                                onChange={e => setEditData(p => ({ ...p, minPct: e.target.value }))}
                                className={editInputCls + ' w-16 text-center'}
                              />
                              <span className="text-gray-400 text-xs shrink-0">–</span>
                              <input
                                type="number" min="0" max="100"
                                value={editData.maxPct}
                                onChange={e => setEditData(p => ({ ...p, maxPct: e.target.value }))}
                                className={editInputCls + ' w-16 text-center'}
                              />
                            </div>
                          </td>
                          <td className="px-4 py-2 text-center">
                            <input
                              type="number"
                              value={editData.sortOrder}
                              onChange={e => setEditData(p => ({ ...p, sortOrder: e.target.value }))}
                              className={editInputCls + ' w-16 text-center mx-auto'}
                            />
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex justify-end gap-1">
                              <button
                                onClick={() => handleUpdate(id)}
                                className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                title="Save"
                              >
                                <HiOutlineCheck className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setEditId(null)}
                                className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
                                title="Cancel"
                              >
                                <HiOutlineX className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3 font-medium text-gray-800">{item.name}</td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center gap-0.5 px-2.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-medium border border-emerald-100">
                              {item.minPct}% – {item.maxPct}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-gray-500">{item.sortOrder ?? 0}</td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-1">
                              <button
                                onClick={() => startEdit(item)}
                                className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                title="Edit"
                              >
                                <HiOutlinePencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(id)}
                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                title="Delete"
                              >
                                <HiOutlineTrash className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab 4: Scheduler / Daily Report ─────────────────────────────────────────
const ROLE_OPTIONS = [
  { value: 'admin',          label: 'Admin' },
  { value: 'manager',        label: 'Manager' },
  { value: 'senior_manager', label: 'Senior Manager' },
  { value: 'md',             label: 'MD' },
  { value: 'director',       label: 'Director' },
];

function SchedulerTab() {
  const [form,      setForm]      = useState(null);   // null = not loaded yet
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [triggering,setTriggering]= useState(false);
  const [ccInput,   setCcInput]   = useState('');     // for adding a CC email

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/pm/settings');
      const s = r.data.data ?? r.data ?? {};
      setForm({
        dailyReportEnabled:  s.dailyReportEnabled  ?? true,
        dailyReportTime:     s.dailyReportTime      ?? '09:00',
        consolidatedReport:  s.consolidatedReport   ?? false,
        reportCcEmails:      Array.isArray(s.reportCcEmails) ? s.reportCcEmails : [],
        allowedCreatorRoles: Array.isArray(s.allowedCreatorRoles)
          ? s.allowedCreatorRoles
          : ['admin', 'manager', 'senior_manager'],
      });
    } catch {
      toast.error('Failed to load scheduler settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setF = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/pm/settings', form);
      toast.success('Scheduler settings saved');
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to save settings');
    } finally { setSaving(false); }
  };

  const handleTrigger = async () => {
    if (!window.confirm('Send the daily project report email now?')) return;
    setTriggering(true);
    try {
      await api.post('/pm/settings/trigger-report');
      toast.success('Daily report triggered and sent!');
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to trigger report');
    } finally { setTriggering(false); }
  };

  const addCc = () => {
    const email = ccInput.trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast.error('Invalid email address');
    if (form.reportCcEmails.includes(email)) return toast.error('Email already in list');
    setF('reportCcEmails', [...form.reportCcEmails, email]);
    setCcInput('');
  };

  const removeCc = (email) => setF('reportCcEmails', form.reportCcEmails.filter(e => e !== email));

  const toggleRole = (role) => {
    const current = form.allowedCreatorRoles;
    setF('allowedCreatorRoles',
      current.includes(role) ? current.filter(r => r !== role) : [...current, role],
    );
  };

  if (loading) return <div className="py-12 text-center text-gray-400">Loading settings…</div>;
  if (!form)   return null;

  return (
    <div className="space-y-6 py-4">

      {/* Daily Report section */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <HiOutlineClock className="w-4 h-4 text-emerald-600" />
            Daily Report Cron
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Automated email sent to all project managers at the configured time.
          </p>
        </div>
        <div className="px-5 py-5 space-y-5">

          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Enable daily report</p>
              <p className="text-xs text-gray-400 mt-0.5">Turn off to pause all scheduled emails</p>
            </div>
            <Toggle checked={form.dailyReportEnabled} onChange={() => setF('dailyReportEnabled', !form.dailyReportEnabled)} />
          </div>

          {/* Report time */}
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-600 block mb-1">Send time (24-hr HH:MM)</label>
              <input
                type="time"
                value={form.dailyReportTime}
                onChange={e => setF('dailyReportTime', e.target.value)}
                disabled={!form.dailyReportEnabled}
                className={`${inputCls} disabled:opacity-50 w-40`}
              />
            </div>
          </div>

          {/* Consolidated toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Consolidated report</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Send one combined email for all projects instead of per-project emails
              </p>
            </div>
            <Toggle
              checked={form.consolidatedReport}
              onChange={() => setF('consolidatedReport', !form.consolidatedReport)}
              disabled={!form.dailyReportEnabled}
            />
          </div>

          {/* CC emails */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-2 flex items-center gap-1">
              <HiOutlineMail className="w-3.5 h-3.5" /> CC Recipients
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="email"
                value={ccInput}
                onChange={e => setCcInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCc()}
                placeholder="name@example.com"
                className={`${inputCls} flex-1`}
              />
              <button
                type="button"
                onClick={addCc}
                className="px-3 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
              >
                <HiOutlinePlus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {form.reportCcEmails.map(email => (
                <span key={email} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-full text-xs text-gray-700">
                  {email}
                  <button onClick={() => removeCc(email)} className="text-gray-400 hover:text-red-500 transition-colors">
                    <HiOutlineX className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {form.reportCcEmails.length === 0 && (
                <p className="text-xs text-gray-400 italic">No CC recipients</p>
              )}
            </div>
          </div>

          {/* Manual trigger */}
          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs text-gray-500 mb-2">Manually trigger the report now (for testing)</p>
            <button
              onClick={handleTrigger}
              disabled={triggering}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <HiOutlinePlay className="w-4 h-4" />
              {triggering ? 'Sending…' : 'Send Report Now'}
            </button>
          </div>
        </div>
      </div>

      {/* Who can create projects */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-800">Project Creator Roles</h3>
          <p className="text-xs text-gray-500 mt-0.5">Roles allowed to create new projects</p>
        </div>
        <div className="px-5 py-4">
          <div className="flex flex-wrap gap-3">
            {ROLE_OPTIONS.map(({ value, label }) => {
              const active = form.allowedCreatorRoles.includes(value);
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggleRole(value)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    active
                      ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                      : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {active && <HiOutlineCheck className="inline w-3.5 h-3.5 mr-1" />}
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          <HiOutlineSave className="w-4 h-4" />
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PMSettings() {
  const navigate   = useNavigate();
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => navigate('/pm')}
          className="mt-0.5 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
          title="Back to PM Dashboard"
        >
          <HiOutlineArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">PM Configuration</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage project types, statuses, and milestone templates
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-0.5 -mb-px" aria-label="Settings tabs">
          {TABS.map((tab, idx) => {
            const Icon    = tab.icon;
            const active  = activeTab === idx;
            return (
              <button
                key={tab.label}
                onClick={() => setActiveTab(idx)}
                className={[
                  'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                  active
                    ? 'border-emerald-500 text-emerald-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
                ].join(' ')}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 0 && <ProjectTypesTab />}
        {activeTab === 1 && <StatusesTab />}
        {activeTab === 2 && <MilestoneTemplatesTab />}
        {activeTab === 3 && <SchedulerTab />}
      </div>
    </div>
  );
}
