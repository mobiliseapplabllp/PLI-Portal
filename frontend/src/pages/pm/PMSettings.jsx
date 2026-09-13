import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
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
  HiOutlineOfficeBuilding,
  HiOutlineUserGroup,
  HiOutlineCalendar,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineDownload,
  HiOutlineUpload,
} from 'react-icons/hi';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import api from '../../api/axios';
import {
  getProjectTypesApi, createProjectTypeApi, updateProjectTypeApi, deleteProjectTypeApi,
  getPmStatusesApi, createPmStatusApi, updatePmStatusApi, deletePmStatusApi,
  getMilestoneTemplatesApi, createMilestoneTemplateApi, updateMilestoneTemplateApi,
  deleteMilestoneTemplateApi, validateTemplateRangesApi,
  getMemberRolesApi, createMemberRoleApi, updateMemberRoleApi, deleteMemberRoleApi,
  getCalendarApi, updateCalendarApi, getCalendarPreviewApi,
  getHolidaysApi, createHolidayApi, updateHolidayApi, deleteHolidayApi,
  getHolidayTemplateApi, validateHolidayImportApi, commitHolidayImportApi,
} from '../../api/pm/config.api';
import {
  getClientOrgsApi, createClientOrgApi, updateClientOrgApi, deleteClientOrgApi,
  getClientEmployeesApi, createClientEmployeeApi, deleteClientEmployeeApi,
} from '../../api/csat.api';
import { getUsersApi } from '../../api/users.api';

const getId = (item) => item?._id || item?.id || '';

const TABS = [
  { label: 'Project Types',        icon: HiOutlineTag },
  { label: 'Milestone Templates',  icon: HiOutlineTemplate },
  { label: 'Statuses',             icon: HiOutlineColorSwatch },
  { label: 'Scheduler',            icon: HiOutlineClock },
  { label: 'Working Calendar',     icon: HiOutlineCalendar },
  { label: 'Client Orgs',          icon: HiOutlineOfficeBuilding },
  { label: 'Email Alerts',         icon: HiOutlineMail },
  { label: 'Member Roles',         icon: HiOutlineUserGroup },
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
  const [addForm,  setAddForm]  = useState({ name: '', color: '#10b981', isActive: true, forProject: true, forMilestone: true, forSubMilestone: false });
  const [adding,   setAdding]   = useState(false);
  const [editId,   setEditId]   = useState(null);
  const [editData, setEditData] = useState({ name: '', color: '#10b981', isActive: true, forProject: true, forMilestone: true, forSubMilestone: false });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/pm/config/statuses/all');
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
    if (!addForm.forProject && !addForm.forMilestone && !addForm.forSubMilestone) {
      return toast.error('At least one scope (Project, Milestone, or Sub-milestone) must be selected');
    }
    setAdding(true);
    try {
      await createPmStatusApi({ ...addForm, name: addForm.name.trim() });
      toast.success('Status added');
      setAddForm({ name: '', color: '#10b981', isActive: true, forProject: true, forMilestone: true, forSubMilestone: false });
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to add status');
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (item) => {
    setEditId(getId(item));
    setEditData({
      name:            item.name,
      color:           item.color || '#10b981',
      isActive:        item.isActive ?? true,
      forProject:      item.forProject ?? true,
      forMilestone:    item.forMilestone ?? true,
      forSubMilestone: item.forSubMilestone ?? false,
    });
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

  const handleScopeToggle = async (statusId, field, value) => {
    try {
      setStatuses(prev => prev.map(s => s._id === statusId ? { ...s, [field]: value } : s));
      await api.put(`/pm/config/statuses/${statusId}`, { [field]: value });
    } catch (err) {
      setStatuses(prev => prev.map(s => s._id === statusId ? { ...s, [field]: !value } : s));
      toast.error('Failed to update scope');
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
        <div className="mt-3">
          <label className="text-sm font-medium text-gray-700 block mb-2">Scope</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={addForm.forProject ?? true} onChange={e => setAddForm(f => ({ ...f, forProject: e.target.checked }))} className="w-4 h-4 text-primary-600 rounded" />
              Project
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={addForm.forMilestone ?? true} onChange={e => setAddForm(f => ({ ...f, forMilestone: e.target.checked }))} className="w-4 h-4 text-primary-600 rounded" />
              Milestone
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={addForm.forSubMilestone ?? false} onChange={e => setAddForm(f => ({ ...f, forSubMilestone: e.target.checked }))} className="w-4 h-4 text-primary-600 rounded" />
              Sub-Milestone
            </label>
          </div>
          <p className="text-xs text-gray-400 mt-1">At least one scope must be selected</p>
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
                  <th className={thCls + ' text-center w-24'}>Project</th>
                  <th className={thCls + ' text-center w-28'}>Milestone</th>
                  <th className={thCls + ' text-center w-32'}>Sub-Milestone</th>
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
                          <td className="px-4 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={editData.forProject ?? true}
                              onChange={e => setEditData(p => ({ ...p, forProject: e.target.checked }))}
                              className="w-4 h-4 text-primary-600 rounded"
                            />
                          </td>
                          <td className="px-4 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={editData.forMilestone ?? true}
                              onChange={e => setEditData(p => ({ ...p, forMilestone: e.target.checked }))}
                              className="w-4 h-4 text-primary-600 rounded"
                            />
                          </td>
                          <td className="px-4 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={editData.forSubMilestone ?? false}
                              onChange={e => setEditData(p => ({ ...p, forSubMilestone: e.target.checked }))}
                              className="w-4 h-4 text-primary-600 rounded"
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
                          <td className="px-4 py-3 font-medium text-gray-800">
                            {item.name}
                            <div className="flex gap-1 mt-1">
                              {(item.forProject ?? true)      && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Project</span>}
                              {(item.forMilestone ?? true)    && <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">Milestone</span>}
                              {item.forSubMilestone           && <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">Sub-Milestone</span>}
                            </div>
                          </td>
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
                          <td className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={item.forProject ?? true}
                              onChange={() => handleScopeToggle(item._id, 'forProject', !(item.forProject ?? true))}
                              className="w-4 h-4 text-primary-600 rounded"
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={item.forMilestone ?? true}
                              onChange={() => handleScopeToggle(item._id, 'forMilestone', !(item.forMilestone ?? true))}
                              className="w-4 h-4 text-primary-600 rounded"
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={item.forSubMilestone ?? false}
                              onChange={() => handleScopeToggle(item._id, 'forSubMilestone', !(item.forSubMilestone ?? false))}
                              className="w-4 h-4 text-primary-600 rounded"
                            />
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

// ─── DnD: Sortable milestone template row ────────────────────────────────────
function SortableTemplateRow({ template, onEdit, onDelete, canDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: template._id || template.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <tr ref={setNodeRef} style={style} className="hover:bg-gray-50/70 transition-colors">
      <td className="px-4 py-3">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 p-1"
          title="Drag to reorder"
        >
          ⠿
        </button>
      </td>
      <td className="px-4 py-3 font-medium text-gray-800">{template.name}</td>
      <td className="px-4 py-3 text-center">
        <span className="inline-flex items-center gap-0.5 px-2.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-medium border border-emerald-100">
          {template.minPct}% – {template.maxPct}%
        </span>
      </td>
      <td className="px-4 py-3 text-center text-gray-500">{template.sortOrder ?? 0}</td>
      <td className="px-4 py-3">
        <div className="flex justify-end gap-1">
          <button
            onClick={() => onEdit(template)}
            className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
            title="Edit"
          >
            <HiOutlinePencil className="w-4 h-4" />
          </button>
          {canDelete && (
            <button
              onClick={() => onDelete(template._id || template.id)}
              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="Delete"
            >
              <HiOutlineTrash className="w-4 h-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
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

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleTemplateDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Build the current ordered list for this type only
    const typeTemplates = templates
      .filter(t => t.projectType === selectedType)
      .slice()
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    const oldIndex = typeTemplates.findIndex(t => (t._id || t.id) === active.id);
    const newIndex = typeTemplates.findIndex(t => (t._id || t.id) === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(typeTemplates, oldIndex, newIndex);

    // Build order map so filteredTemplates (which sorts by sortOrder) shows new order
    const newOrderMap = {};
    reordered.forEach((t, i) => { newOrderMap[t._id || t.id] = i + 1; });

    // Optimistic state update: patch sortOrder in-place for this type's templates
    setTemplates(prev => prev.map(t => {
      const id = t._id || t.id;
      return newOrderMap[id] !== undefined ? { ...t, sortOrder: newOrderMap[id] } : t;
    }));

    // Persist to backend — only send this type's templates, 1-based order
    const payload = reordered.map((t, i) => ({ id: t._id || t.id, order: i + 1 }));
    api.put('/pm/config/milestone-templates/reorder', payload)
      .catch(() => {
        toast.error('Failed to save template order');
        load(); // Revert to server state on error
      });
  };

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
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleTemplateDragEnd}>
              <SortableContext
                items={filteredTemplates.filter(t => getId(t) !== editId).map(t => t._id || t.id)}
                strategy={verticalListSortingStrategy}
              >
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-3 w-10"></th>
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
                      if (isEditing) {
                        return (
                          <tr key={id} className="hover:bg-gray-50/70 transition-colors">
                            <td className="px-4 py-2"></td>
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
                          </tr>
                        );
                      }
                      return (
                        <SortableTemplateRow
                          key={id}
                          template={item}
                          onEdit={startEdit}
                          onDelete={handleDelete}
                          canDelete={!item.isSystem}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </SortableContext>
            </DndContext>
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
        dailyReportEnabled:         s.dailyReportEnabled         ?? true,
        dailyReportTime:            s.dailyReportTime             ?? '09:00',
        consolidatedReport:         s.consolidatedReport          ?? false,
        reportCcEmails:             Array.isArray(s.reportCcEmails) ? s.reportCcEmails : [],
        allowedCreatorRoles:        Array.isArray(s.allowedCreatorRoles)
          ? s.allowedCreatorRoles
          : ['admin', 'manager', 'senior_manager'],
        helpdeskDailyReportEnabled: s.helpdeskDailyReportEnabled  ?? false,
        helpdeskDailyReportTime:    s.helpdeskDailyReportTime      ?? '09:00',
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
      // Settings validation errors come through the global handler as { error: { message } }
      toast.error(e?.response?.data?.message || e?.response?.data?.error?.message || 'Failed to save settings');
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

      {/* Helpdesk Daily Report */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <HiOutlineClock className="w-4 h-4 text-emerald-600" />
            Helpdesk Daily Report
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Automated email with daily helpdesk activity summary.
          </p>
        </div>
        <div className="px-5 py-5 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Enable Helpdesk Daily Report</p>
              <p className="text-xs text-gray-400 mt-0.5">Sends a daily helpdesk activity summary</p>
            </div>
            <Toggle
              checked={form.helpdeskDailyReportEnabled}
              onChange={() => setF('helpdeskDailyReportEnabled', !form.helpdeskDailyReportEnabled)}
            />
          </div>
          {form.helpdeskDailyReportEnabled && (
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Report Time (24-hr HH:MM)</label>
              <input
                type="time"
                value={form.helpdeskDailyReportTime}
                onChange={e => setF('helpdeskDailyReportTime', e.target.value)}
                className={`${inputCls} w-40`}
              />
            </div>
          )}
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

// ─── Tab 5: Working Calendar ─────────────────────────────────────────────────
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SATURDAY_ORDINALS = ['1st', '2nd', '3rd', '4th', '5th'];

const currentYearMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const shiftMonth = (ym, delta) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const monthLabel = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
};
// 'YYYY-MM-DD' → { text: '05 Oct 2026', weekday: 'Mon' } — parsed as local date to avoid TZ drift
const formatHolidayDate = (iso) => {
  if (!iso) return { text: '', weekday: '' };
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return { text: `${String(d).padStart(2, '0')} ${SHORT_MONTHS[m - 1]} ${y}`, weekday: WEEKDAY_NAMES[dt.getDay()] };
};
const calendarErrMsg = (e, fallback) =>
  e?.response?.data?.message || e?.response?.data?.error?.message || fallback;

function WorkingCalendarTab() {
  const { user } = useSelector(s => s.auth);
  const isAdmin = user?.role === 'admin';

  // Card A — working week
  const [calLoading,   setCalLoading]   = useState(true);
  const [hoursPerDay,  setHoursPerDay]  = useState(8);
  const [workingSats,  setWorkingSats]  = useState([]);
  const [savingCal,    setSavingCal]    = useState(false);

  // Card B — preview
  const [previewMonth, setPreviewMonth] = useState(currentYearMonth);
  const [preview,      setPreview]      = useState(null);
  const [previewBusy,  setPreviewBusy]  = useState(false);

  // Card C — holidays
  const thisYear = new Date().getFullYear();
  const yearOptions = [thisYear - 1, thisYear, thisYear + 1, thisYear + 2];
  const [holYear,      setHolYear]      = useState(thisYear);
  const [holidays,     setHolidays]     = useState([]);
  const [holLoading,   setHolLoading]   = useState(true);
  const [addForm,      setAddForm]      = useState({ date: '', name: '', isOptional: false });
  const [adding,       setAdding]       = useState(false);

  // Import panel
  const [showImport,   setShowImport]   = useState(false);
  const [validating,   setValidating]   = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [committing,   setCommitting]   = useState(false);
  const fileInputRef = useRef(null);

  const loadCalendar = useCallback(async () => {
    setCalLoading(true);
    try {
      const r = await getCalendarApi();
      const d = r.data.data ?? r.data ?? {};
      setHoursPerDay(d.hoursPerDay ?? 8);
      setWorkingSats(Array.isArray(d.workingSaturdays) ? d.workingSaturdays : []);
    } catch (e) {
      toast.error(calendarErrMsg(e, 'Failed to load working calendar'));
    } finally {
      setCalLoading(false);
    }
  }, []);

  const loadPreview = useCallback(async (month) => {
    setPreviewBusy(true);
    try {
      const r = await getCalendarPreviewApi(month);
      setPreview(r.data.data ?? r.data ?? null);
    } catch (e) {
      toast.error(calendarErrMsg(e, 'Failed to load capacity preview'));
    } finally {
      setPreviewBusy(false);
    }
  }, []);

  const loadHolidays = useCallback(async (year) => {
    setHolLoading(true);
    try {
      const r = await getHolidaysApi(year);
      setHolidays(r.data.data ?? r.data ?? []);
    } catch (e) {
      toast.error(calendarErrMsg(e, 'Failed to load holidays'));
    } finally {
      setHolLoading(false);
    }
  }, []);

  useEffect(() => { loadCalendar(); }, [loadCalendar]);
  useEffect(() => { loadPreview(previewMonth); }, [previewMonth, loadPreview]);
  useEffect(() => { loadHolidays(holYear); }, [holYear, loadHolidays]);

  const refreshAfterHolidayChange = () => Promise.all([loadHolidays(holYear), loadPreview(previewMonth)]);

  // ── Card A handlers ──
  const toggleSat = (n) =>
    setWorkingSats(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]);

  const handleSaveCalendar = async () => {
    const h = Number(hoursPerDay);
    if (!Number.isFinite(h) || h < 4 || h > 12) return toast.error('Hours per working day must be between 4 and 12');
    setSavingCal(true);
    try {
      const r = await updateCalendarApi({ hoursPerDay: h, workingSaturdays: [...workingSats].sort((a, b) => a - b) });
      const d = r.data.data ?? r.data ?? {};
      if (d.hoursPerDay != null) setHoursPerDay(d.hoursPerDay);
      if (Array.isArray(d.workingSaturdays)) setWorkingSats(d.workingSaturdays);
      toast.success('Working calendar saved');
      await loadPreview(previewMonth);
    } catch (e) {
      toast.error(calendarErrMsg(e, 'Failed to save working calendar'));
    } finally {
      setSavingCal(false);
    }
  };

  // ── Card C handlers ──
  const handleAddHoliday = async () => {
    if (!addForm.date)        return toast.error('Date is required');
    if (!addForm.name.trim()) return toast.error('Name is required');
    setAdding(true);
    try {
      await createHolidayApi({ date: addForm.date, name: addForm.name.trim(), isOptional: !!addForm.isOptional });
      toast.success('Holiday added');
      setAddForm({ date: '', name: '', isOptional: false });
      await refreshAfterHolidayChange();
    } catch (e) {
      toast.error(calendarErrMsg(e, 'Failed to add holiday'));
    } finally {
      setAdding(false);
    }
  };

  const handleToggleOptional = async (item) => {
    try {
      await updateHolidayApi(getId(item), { isOptional: !item.isOptional });
      await refreshAfterHolidayChange();
    } catch (e) {
      toast.error(calendarErrMsg(e, 'Failed to update holiday'));
    }
  };

  const handleDeleteHoliday = async (item) => {
    if (!window.confirm(`Delete holiday "${item.name}"?`)) return;
    try {
      await deleteHolidayApi(getId(item));
      toast.success('Holiday deleted');
      await refreshAfterHolidayChange();
    } catch (e) {
      toast.error(calendarErrMsg(e, 'Failed to delete holiday'));
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const r = await getHolidayTemplateApi();
      const url = window.URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'holiday-import-template.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(calendarErrMsg(e, 'Failed to download template'));
    }
  };

  const clearImport = () => {
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCancelImport = () => {
    clearImport();
    setShowImport(false);
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setValidating(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await validateHolidayImportApi(fd);
      setImportResult(r.data.data ?? r.data ?? null);
    } catch (err) {
      toast.error(calendarErrMsg(err, 'Failed to validate file'));
      clearImport();
    } finally {
      setValidating(false);
    }
  };

  const handleCommitImport = async () => {
    const rows = (importResult?.valid ?? []).map(({ date, name, isOptional }) => ({ date, name, isOptional: !!isOptional }));
    if (rows.length === 0) return;
    setCommitting(true);
    try {
      const r = await commitHolidayImportApi({ rows });
      const d = r.data.data ?? r.data ?? {};
      toast.success(`Imported ${d.inserted ?? rows.length} holidays (${d.skipped ?? 0} skipped)`);
      handleCancelImport();
      await refreshAfterHolidayChange();
    } catch (e) {
      toast.error(calendarErrMsg(e, 'Failed to import holidays'));
    } finally {
      setCommitting(false);
    }
  };

  // ── Preview derived values ──
  const previewDays = preview?.days ?? [];
  const leadingBlanks = previewDays.length ? (previewDays[0].dow + 6) % 7 : 0;   // dow 0=Sun → column 6
  const mandatoryHolidays = (preview?.holidays ?? []).filter(h => !h.isOptional).length;
  const optionalHolidays  = (preview?.holidays ?? []).filter(h => h.isOptional).length;

  const dayCellCls = (d) => {
    if (d.kind === 'holiday')      return 'bg-red-50 text-red-700 border-red-200';
    if (d.kind === 'sunday')       return 'bg-gray-200 text-gray-400 border-gray-200';
    if (d.kind === 'saturday-off') return 'bg-gray-200 text-gray-400 border-gray-200';
    if (d.isOptionalHoliday)       return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-gray-50 text-gray-700 border-gray-200';
  };
  const dayCellTitle = (d) => {
    if (d.kind === 'holiday')      return d.holidayName || 'Holiday';
    if (d.isOptionalHoliday)       return `${d.holidayName || 'Holiday'} (optional)`;
    if (d.kind === 'sunday')       return 'Sunday';
    if (d.kind === 'saturday-off') return 'Saturday off';
    return d.date;
  };

  const summary = importResult?.summary;

  return (
    <div className="space-y-6 py-4">

      {/* Card A — Working week */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <HiOutlineCalendar className="w-4 h-4 text-emerald-600" />
            Working week
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Defines one person's capacity: hours in a working day and which Saturdays count as working.
          </p>
        </div>
        {calLoading ? (
          <div className="py-10 text-center text-gray-400 text-sm">Loading working calendar…</div>
        ) : (
          <div className="px-5 py-5 space-y-5">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Hours per working day</label>
              <input
                type="number" min="4" max="12" step="0.5"
                value={hoursPerDay ?? ''}
                onChange={e => setHoursPerDay(e.target.value === '' ? '' : Number(e.target.value))}
                disabled={!isAdmin}
                className={`${inputCls} w-40 disabled:opacity-60 disabled:bg-gray-50`}
              />
              <p className="text-xs text-gray-400 mt-1">Between 4 and 12. Used to compute allocation percentages and capacity conflicts.</p>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Sunday</label>
              <label className="flex items-center gap-2 text-sm text-gray-500">
                <input type="checkbox" checked={false} disabled readOnly className="w-4 h-4 rounded opacity-50 cursor-not-allowed" />
                Always a non-working day
              </label>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Working Saturdays</label>
              <div className="flex flex-wrap gap-4">
                {SATURDAY_ORDINALS.map((label, i) => {
                  const n = i + 1;
                  return (
                    <label key={n} className={`flex items-center gap-2 text-sm ${isAdmin ? 'text-gray-700' : 'text-gray-500'}`}>
                      <input
                        type="checkbox"
                        checked={workingSats.includes(n)}
                        onChange={() => toggleSat(n)}
                        disabled={!isAdmin}
                        className="w-4 h-4 text-emerald-600 rounded disabled:opacity-50"
                      />
                      {label}
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Tick the Saturdays of the month that are working days. Most months have 4; a few have 5.
              </p>
            </div>

            {isAdmin && (
              <div className="flex justify-end pt-2 border-t border-gray-100">
                <button
                  onClick={handleSaveCalendar}
                  disabled={savingCal}
                  className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  <HiOutlineSave className="w-4 h-4" />
                  {savingCal ? 'Saving…' : 'Save'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Card B — Capacity preview */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Capacity preview</h3>
            <p className="text-xs text-gray-500 mt-0.5">Working days and hours available per person for the selected month.</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPreviewMonth(m => shiftMonth(m, -1))}
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              title="Previous month"
            >
              <HiOutlineChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium text-gray-800 w-36 text-center">{monthLabel(previewMonth)}</span>
            <button
              type="button"
              onClick={() => setPreviewMonth(m => shiftMonth(m, 1))}
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              title="Next month"
            >
              <HiOutlineChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-5 py-5 space-y-4">
          {!preview ? (
            <div className="py-6 text-center text-gray-400 text-sm">{previewBusy ? 'Loading preview…' : 'No preview available.'}</div>
          ) : (
            <>
              <p className={`text-base font-semibold text-gray-900 ${previewBusy ? 'opacity-50' : ''}`}>
                {preview.workingDays} working days × {preview.hoursPerDay} hrs = {preview.totalHours} hrs per person
              </p>

              <div className="flex flex-wrap gap-2">
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">{preview.sundays} Sundays</span>
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">{preview.saturdaysOff} Saturdays off</span>
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">{preview.saturdaysOn} Saturdays working</span>
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-100">{mandatoryHolidays} holidays</span>
                {optionalHolidays > 0 && (
                  <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-50 text-gray-400 border border-gray-200">{optionalHolidays} optional</span>
                )}
              </div>

              {/* Mini month grid */}
              <div className="max-w-md">
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                    <div key={d} className="text-[10px] font-semibold text-gray-400 uppercase text-center">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: leadingBlanks }).map((_, i) => <div key={'blank-' + i} />)}
                  {previewDays.map(d => (
                    <div
                      key={d.date}
                      title={dayCellTitle(d)}
                      className={`relative h-12 rounded-md border px-1 py-0.5 text-xs overflow-hidden ${dayCellCls(d)}`}
                    >
                      <div className="font-medium leading-none">{Number(d.date.slice(8, 10))}</div>
                      {d.kind === 'saturday-off' && (
                        <span className="absolute top-0.5 right-1 text-[9px] font-semibold">S</span>
                      )}
                      {(d.kind === 'holiday' || d.isOptionalHoliday) && d.holidayName && (
                        <div className="text-[10px] leading-tight truncate mt-0.5">{d.holidayName}</div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[11px] text-gray-500">
                  <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm border border-gray-200 bg-gray-50" /> Working</span>
                  <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm border border-gray-200 bg-gray-200" /> Sunday / Saturday off</span>
                  <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm border border-red-200 bg-red-50" /> Holiday</span>
                  <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm border border-amber-200 bg-amber-50" /> Optional holiday</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Card C — Holidays */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-gray-800">Holidays</h3>
            <select
              value={holYear}
              onChange={e => setHolYear(Number(e.target.value))}
              className="px-2 py-1 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <HiOutlineDownload className="w-4 h-4" />
              Download template
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowImport(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
              >
                <HiOutlineUpload className="w-4 h-4" />
                Import from Excel
              </button>
            )}
          </div>
        </div>

        {/* Import panel */}
        {showImport && isAdmin && (
          <div className="px-5 py-4 border-b border-gray-100 bg-emerald-50/40 space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-sm font-medium text-gray-700">Import holidays from Excel</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleFileChange}
                disabled={validating || committing}
                className="text-sm text-gray-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-white file:text-sm file:font-medium file:text-gray-700 file:border file:border-gray-200 hover:file:bg-gray-50"
              />
              {validating && <span className="text-xs text-gray-400">Validating…</span>}
            </div>

            {importResult && (
              <div className="space-y-4">
                {summary && (
                  <p className="text-sm text-gray-700">
                    {summary.totalRows} rows · <span className="text-emerald-700 font-medium">{summary.valid} ready</span> ·{' '}
                    <span className="text-red-600 font-medium">{summary.errors} errors</span> ·{' '}
                    {summary.alreadyExists} already exist · {summary.onSunday} on a Sunday
                  </p>
                )}

                {importResult.errors?.length > 0 && (
                  <div className="rounded-lg border border-red-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-red-50 border-b border-red-100">
                        <tr>
                          <th className={thCls + ' text-left w-20 text-red-700'}>Row</th>
                          <th className={thCls + ' text-left text-red-700'}>Error</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-red-50 bg-white">
                        {importResult.errors.map((r, i) => (
                          <tr key={i}>
                            <td className="px-4 py-2 text-gray-500">{r.row}</td>
                            <td className="px-4 py-2 text-red-700">{r.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {importResult.warnings?.length > 0 && (
                  <div className="rounded-lg border border-amber-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-amber-50 border-b border-amber-100">
                        <tr>
                          <th className={thCls + ' text-left w-20 text-amber-700'}>Row</th>
                          <th className={thCls + ' text-left text-amber-700'}>Warning</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-amber-50 bg-white">
                        {importResult.warnings.map((r, i) => (
                          <tr key={i}>
                            <td className="px-4 py-2 text-gray-500">{r.row}</td>
                            <td className="px-4 py-2 text-amber-700">{r.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {importResult.valid?.length > 0 && (
                  <div className="rounded-lg border border-emerald-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-emerald-50 border-b border-emerald-100">
                        <tr>
                          <th className={thCls + ' text-left w-20 text-emerald-700'}>Row</th>
                          <th className={thCls + ' text-left w-40 text-emerald-700'}>Date</th>
                          <th className={thCls + ' text-left text-emerald-700'}>Name</th>
                          <th className={thCls + ' text-center w-24 text-emerald-700'}>Optional</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-emerald-50 bg-white">
                        {importResult.valid.map((r, i) => (
                          <tr key={i}>
                            <td className="px-4 py-2 text-gray-500">{r.row}</td>
                            <td className="px-4 py-2 text-gray-800">{formatHolidayDate(r.date).text}</td>
                            <td className="px-4 py-2 text-gray-800">{r.name}</td>
                            <td className="px-4 py-2 text-center text-gray-500">{r.isOptional ? 'Yes' : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleCancelImport}
                    disabled={committing}
                    className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCommitImport}
                    disabled={committing || !(importResult.valid?.length > 0)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                  >
                    <HiOutlineUpload className="w-4 h-4" />
                    {committing ? 'Importing…' : `Import ${importResult.valid?.length ?? 0} holidays`}
                  </button>
                </div>
              </div>
            )}

            {!importResult && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleCancelImport}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {/* Inline add row */}
        {isAdmin && (
          <div className="px-5 py-4 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-700 mb-3">Add Holiday</p>
            <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
              <input
                type="date"
                value={addForm.date}
                onChange={e => setAddForm(p => ({ ...p, date: e.target.value }))}
                className={inputCls + ' w-44 shrink-0'}
              />
              <input
                type="text"
                value={addForm.name}
                onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && handleAddHoliday()}
                placeholder="e.g. Diwali, Republic Day…"
                className={inputCls + ' flex-1 min-w-0'}
              />
              <label className="flex items-center gap-2 text-sm text-gray-600 shrink-0">
                <Toggle checked={addForm.isOptional} onChange={() => setAddForm(p => ({ ...p, isOptional: !p.isOptional }))} />
                Optional
              </label>
              <button
                onClick={handleAddHoliday}
                disabled={adding || !addForm.date || !addForm.name.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
              >
                <HiOutlinePlus className="w-4 h-4" />
                {adding ? 'Adding…' : 'Add'}
              </button>
            </div>
          </div>
        )}

        {/* Holiday table */}
        {holLoading ? (
          <p className="text-center text-gray-400 py-10 text-sm">Loading holidays…</p>
        ) : holidays.length === 0 ? (
          <p className="text-center text-gray-400 py-10 text-sm">
            No holidays for {holYear}. Add one above or import from Excel.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className={thCls + ' text-left w-48'}>Date</th>
                  <th className={thCls + ' text-left'}>Name</th>
                  <th className={thCls + ' text-center w-28'}>Optional</th>
                  <th className={thCls + ' text-right w-24'}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {holidays.map(item => {
                  const id = getId(item);
                  const fd = formatHolidayDate(item.date);
                  return (
                    <tr key={id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-4 py-3 text-gray-800">
                        {fd.text} <span className="text-gray-400 text-xs ml-1">{fd.weekday}</span>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800">{item.name}</td>
                      <td className="px-4 py-3 text-center">
                        <Toggle
                          checked={!!item.isOptional}
                          onChange={() => handleToggleOptional(item)}
                          disabled={!isAdmin}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          {isAdmin && (
                            <button
                              onClick={() => handleDeleteHoliday(item)}
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete"
                            >
                              <HiOutlineTrash className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
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

// ─── Tab 6: Client Organisations ─────────────────────────────────────────────
function ClientOrgsTab() {
  const { user } = useSelector(s => s.auth);
  const isAdmin = user?.role === 'admin';

  // list state
  const [orgs,    setOrgs]    = useState([]);
  const [page,    setPage]    = useState(1);
  const [pages,   setPages]   = useState(1);
  const [search,  setSearch]  = useState('');
  const [loading, setLoading] = useState(true);

  // modal state
  const [showModal,  setShowModal]  = useState(false);
  const [editingOrg, setEditingOrg] = useState(null);
  const [modalForm,  setModalForm]  = useState({ name: '', industry: '', managedById: '', description: '' });
  const [saving,     setSaving]     = useState(false);

  // users for managed-by dropdown
  const [users, setUsers] = useState([]);

  // employee sub-panel state
  const [expandedOrgId, setExpandedOrgId] = useState(null);
  const [employees,     setEmployees]     = useState({});
  const [empForm,       setEmpForm]       = useState({ name: '', email: '', designation: '', department: '' });
  const [empSaving,     setEmpSaving]     = useState(false);

  const load = useCallback(async (p, q) => {
    setLoading(true);
    try {
      const r = await getClientOrgsApi({ search: q, page: p, limit: 15, isActive: true });
      const d = r.data?.data ?? {};
      setOrgs(Array.isArray(d) ? d : (d.rows ?? d.docs ?? []));
      setPages(d.pages ?? d.totalPages ?? 1);
    } catch {
      toast.error('Failed to load client organisations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(page, search); }, [page, search, load]);

  useEffect(() => {
    getUsersApi({ limit: 200 })
      .then(r => {
        const d = r.data?.data ?? r.data ?? [];
        setUsers(Array.isArray(d) ? d : (d.rows ?? d.docs ?? []));
      })
      .catch(() => {});
  }, []);

  const loadEmployees = async (orgId) => {
    try {
      const r = await getClientEmployeesApi(orgId);
      setEmployees(prev => ({ ...prev, [orgId]: r.data?.data ?? [] }));
    } catch {
      toast.error('Failed to load members');
    }
  };

  const toggleExpand = async (orgId) => {
    if (expandedOrgId === orgId) {
      setExpandedOrgId(null);
    } else {
      setExpandedOrgId(orgId);
      if (!employees[orgId]) await loadEmployees(orgId);
    }
  };

  const openCreate = () => {
    setEditingOrg(null);
    setModalForm({ name: '', industry: '', managedById: '', description: '' });
    setShowModal(true);
  };

  const openEdit = (org) => {
    setEditingOrg(org);
    setModalForm({
      name:        org.name ?? '',
      industry:    org.industry ?? '',
      managedById: getId(org.managedBy) || org.managedById || '',
      description: org.description ?? '',
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingOrg(null);
  };

  const handleModalSave = async () => {
    if (!modalForm.name.trim()) return toast.error('Organisation name is required');
    setSaving(true);
    try {
      if (editingOrg) {
        await updateClientOrgApi(getId(editingOrg), modalForm);
        toast.success('Organisation updated');
      } else {
        await createClientOrgApi(modalForm);
        toast.success('Organisation created');
      }
      closeModal();
      await load(page, search);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to save organisation');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this client organisation?')) return;
    try {
      await deleteClientOrgApi(id);
      toast.success('Organisation deleted');
      if (expandedOrgId === id) setExpandedOrgId(null);
      await load(page, search);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Cannot delete — may be in use');
    }
  };

  const handleAddEmployee = async (orgId) => {
    if (!empForm.name.trim()) return toast.error('Employee name is required');
    if (!empForm.email.trim()) return toast.error('Employee email is required');
    setEmpSaving(true);
    try {
      await createClientEmployeeApi(orgId, empForm);
      toast.success('Member added');
      setEmpForm({ name: '', email: '', designation: '', department: '' });
      await loadEmployees(orgId);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to add member');
    } finally {
      setEmpSaving(false);
    }
  };

  const handleRemoveEmployee = async (orgId, empId) => {
    if (!window.confirm('Remove this member?')) return;
    try {
      await deleteClientEmployeeApi(orgId, empId);
      toast.success('Member removed');
      await loadEmployees(orgId);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to remove member');
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search organisations…"
          className={inputCls + ' flex-1'}
        />
        {isAdmin && (
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap"
          >
            <HiOutlinePlus className="w-4 h-4" />
            New Organisation
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Loading client organisations…</div>
        ) : orgs.length === 0 ? (
          <p className="text-center text-gray-400 py-10 text-sm">No client organisations found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className={thCls + ' text-left'}>Organisation Name</th>
                  <th className={thCls + ' text-left'}>Industry</th>
                  <th className={thCls + ' text-left'}>Managed By</th>
                  <th className={thCls + ' text-right w-40'}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orgs.map(org => {
                  const id = getId(org);
                  const empList = employees[id] ?? [];
                  const isExpanded = expandedOrgId === id;
                  const managedByName = org.managedBy?.name ?? org.managedByName ?? '—';
                  return (
                    <React.Fragment key={id}>
                      <tr className="border-b border-gray-50 hover:bg-gray-50/70 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-800">{org.name}</td>
                        <td className="px-4 py-3 text-gray-600">{org.industry || '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{managedByName}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end items-center gap-1">
                            <button
                              onClick={() => toggleExpand(id)}
                              className="px-2 py-1 text-xs text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors whitespace-nowrap"
                              title="Show members"
                            >
                              {'👥'} Members ({isExpanded ? empList.length : '…'})
                            </button>
                            {isAdmin && (
                              <>
                                <button
                                  onClick={() => openEdit(org)}
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
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={id + '-emp'} className="bg-gray-50/60">
                          <td colSpan={4} className="px-6 pb-4">
                            <div className="pt-3 space-y-3">
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Members</p>
                              {empList.length === 0 ? (
                                <p className="text-sm text-gray-400">No members yet.</p>
                              ) : (
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr>
                                      <th className="text-left text-xs font-semibold text-gray-400 pb-1.5 pr-4">Name</th>
                                      <th className="text-left text-xs font-semibold text-gray-400 pb-1.5 pr-4">Email</th>
                                      <th className="text-left text-xs font-semibold text-gray-400 pb-1.5 pr-4">Designation</th>
                                      {isAdmin && <th className="w-8" />}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {empList.map(emp => {
                                      const eid = getId(emp);
                                      return (
                                        <tr key={eid}>
                                          <td className="py-1.5 pr-4 text-gray-700">{emp.name}</td>
                                          <td className="py-1.5 pr-4 text-gray-500">{emp.email}</td>
                                          <td className="py-1.5 pr-4 text-gray-500">{emp.designation || '—'}</td>
                                          {isAdmin && (
                                            <td>
                                              <button
                                                onClick={() => handleRemoveEmployee(id, eid)}
                                                className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                                title="Remove"
                                              >
                                                <HiOutlineX className="w-3.5 h-3.5" />
                                              </button>
                                            </td>
                                          )}
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              )}
                              {isAdmin && (
                                <div className="border-t border-gray-200 pt-3">
                                  <p className="text-xs font-semibold text-gray-500 mb-2">+ Add Member</p>
                                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                    <input
                                      type="text"
                                      placeholder="Name *"
                                      value={empForm.name}
                                      onChange={e => setEmpForm(p => ({ ...p, name: e.target.value }))}
                                      className={inputCls}
                                    />
                                    <input
                                      type="email"
                                      placeholder="Email *"
                                      value={empForm.email}
                                      onChange={e => setEmpForm(p => ({ ...p, email: e.target.value }))}
                                      className={inputCls}
                                    />
                                    <input
                                      type="text"
                                      placeholder="Designation"
                                      value={empForm.designation}
                                      onChange={e => setEmpForm(p => ({ ...p, designation: e.target.value }))}
                                      className={inputCls}
                                    />
                                    <input
                                      type="text"
                                      placeholder="Department"
                                      value={empForm.department}
                                      onChange={e => setEmpForm(p => ({ ...p, department: e.target.value }))}
                                      className={inputCls}
                                    />
                                  </div>
                                  <button
                                    onClick={() => handleAddEmployee(id)}
                                    disabled={empSaving}
                                    className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                                  >
                                    <HiOutlinePlus className="w-3.5 h-3.5" />
                                    {empSaving ? 'Adding…' : 'Add Member'}
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex justify-center items-center gap-3">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            Prev
          </button>
          <span className="text-sm text-gray-500">Page {page} of {pages}</span>
          <button
            onClick={() => setPage(p => Math.min(pages, p + 1))}
            disabled={page === pages}
            className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            Next
          </button>
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">
                {editingOrg ? 'Edit Organisation' : 'New Organisation'}
              </h2>
              <button
                onClick={closeModal}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <HiOutlineX className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={modalForm.name}
                  onChange={e => setModalForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Organisation name"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Industry</label>
                <input
                  type="text"
                  value={modalForm.industry}
                  onChange={e => setModalForm(p => ({ ...p, industry: e.target.value }))}
                  placeholder="e.g. Technology, Finance…"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Managed By</label>
                <select
                  value={modalForm.managedById}
                  onChange={e => setModalForm(p => ({ ...p, managedById: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">— Select user —</option>
                  {users.map(u => (
                    <option key={getId(u)} value={getId(u)}>{u.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Description</label>
                <textarea
                  rows={3}
                  value={modalForm.description}
                  onChange={e => setModalForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Optional description…"
                  className={inputCls + ' resize-none'}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleModalSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                <HiOutlineSave className="w-4 h-4" />
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab 6: Email Alerts ──────────────────────────────────────────────────────
function EmailAlertsTab() {
  const [form, setForm] = useState({
    emailAlertOnProjectCreate:    false,
    emailAlertOnMilestoneComplete: false,
    emailAlertOnRaidRaised:       false,
  });
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    api.get('/pm/settings')
      .then(res => {
        const s = res.data?.data ?? {};
        setForm({
          emailAlertOnProjectCreate:    s.emailAlertOnProjectCreate    ?? false,
          emailAlertOnMilestoneComplete: s.emailAlertOnMilestoneComplete ?? false,
          emailAlertOnRaidRaised:       s.emailAlertOnRaidRaised       ?? false,
        });
        setLoadError(null); // clear any previous error
      })
      .catch(err => {
        setLoadError('Failed to load email settings. Save is disabled until settings load successfully.');
        console.error('[EmailAlertsTab] load failed', err);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/pm/settings', form);
      toast.success('Email alert settings saved');
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  };

  const toggles = [
    { key: 'emailAlertOnProjectCreate',    label: 'New project created',    desc: 'Send alert when a new project is created' },
    { key: 'emailAlertOnMilestoneComplete', label: 'Milestone completed',    desc: 'Send alert when a milestone status changes to completed' },
    { key: 'emailAlertOnRaidRaised',       label: 'RAID item raised',        desc: 'Send alert when a new RAID item is logged' },
  ];

  if (loading) return <div className="py-12 text-center text-sm text-gray-400">Loading…</div>;

  return (
    <div className="space-y-6 py-4">
      {loadError && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700 mb-4">
          {loadError}
        </div>
      )}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-800">Email Alert Triggers</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Recipients use the CC email list configured in the Scheduler tab.
          </p>
        </div>
        <div className="px-5 py-5 divide-y divide-gray-100">
          {toggles.map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
              <div>
                <p className="text-sm font-medium text-gray-700">{label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
              </div>
              <Toggle
                checked={form[key] || false}
                onChange={() => setForm(prev => ({ ...prev, [key]: !prev[key] }))}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={!!loadError || saving}
          className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          <HiOutlineSave className="w-4 h-4" />
          {saving ? 'Saving…' : 'Save Alert Settings'}
        </button>
      </div>
    </div>
  );
}

// ─── Tab 7: Member Roles ──────────────────────────────────────────────────────
function MemberRolesTab() {
  const [roles,    setRoles]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [newName,  setNewName]  = useState('');
  const [adding,   setAdding]   = useState(false);
  const [editId,   setEditId]   = useState(null);
  const [editData, setEditData] = useState({ name: '', sortOrder: 0, isActive: true });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getMemberRolesApi();
      setRoles(r.data.data ?? r.data ?? []);
    } catch {
      toast.error('Failed to load member roles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!newName.trim()) return toast.error('Role name is required');
    setAdding(true);
    try {
      await createMemberRoleApi({ name: newName.trim() });
      toast.success('Member role added');
      setNewName('');
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to add role');
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
      await updateMemberRoleApi(id, editData);
      toast.success('Member role updated');
      setEditId(null);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to update');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this role?')) return;
    try {
      await deleteMemberRoleApi(id);
      toast.success('Member role deleted');
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Cannot delete — may be in use');
    }
  };

  const handleToggleActive = async (item) => {
    try {
      await updateMemberRoleApi(getId(item), { isActive: !item.isActive });
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to toggle');
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-400 text-sm">Loading member roles…</div>;
  }

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-700">
        These roles appear in the <strong>Team Setup</strong> tab when adding or editing project members.
        Add roles like <em>Developer</em>, <em>Designer</em>, <em>DevOps</em>, etc.
      </div>

      {/* Add form */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-sm font-semibold text-gray-700 mb-3">Add Member Role</p>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="e.g. Developer, Designer, DevOps, QA…"
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

      {/* Roles table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {roles.length === 0 ? (
          <p className="text-center text-gray-400 py-10 text-sm">No roles yet. Add one above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className={thCls + ' text-left'}>Role Name</th>
                  <th className={thCls + ' text-center w-28'}>Sort Order</th>
                  <th className={thCls + ' text-center w-24'}>Active</th>
                  <th className={thCls + ' text-right w-28'}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {roles.map(item => {
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
                          <td className="px-4 py-3 font-medium text-gray-800">
                            {item.name}
                            {!item.isActive && (
                              <span className="ml-2 text-xs text-gray-400 font-normal">(inactive)</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center text-gray-500">{item.sortOrder ?? '—'}</td>
                          <td className="px-4 py-3 text-center">
                            <Toggle
                              checked={!!item.isActive}
                              onChange={() => handleToggleActive(item)}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-1">
                              <button
                                onClick={() => startEdit(item)}
                                className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Edit"
                              >
                                <HiOutlinePencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(id)}
                                className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors"
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
        {activeTab === 1 && <MilestoneTemplatesTab />}
        {activeTab === 2 && <StatusesTab />}
        {activeTab === 3 && <SchedulerTab />}
        {activeTab === 4 && <WorkingCalendarTab />}
        {activeTab === 5 && <ClientOrgsTab />}
        {activeTab === 6 && <EmailAlertsTab />}
        {activeTab === 7 && <MemberRolesTab />}
      </div>
    </div>
  );
}
