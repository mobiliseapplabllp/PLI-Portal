import { useState, useEffect, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlinePlus, HiOutlinePencil, HiOutlineTrash, HiOutlineSearch,
  HiOutlineArrowLeft, HiOutlineUser, HiOutlineMail,
} from 'react-icons/hi';
import {
  getClientOrgApi, getClientEmployeesApi,
  createClientEmployeeApi, updateClientEmployeeApi, deleteClientEmployeeApi,
} from '../../api/csat.api';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import Pagination from '../../components/common/Pagination';

const ADMIN_ROLES = ['admin'];
const emptyForm = { name: '', email: '', mobileNo: '', designation: '', department: '' };

function Avatar({ name }) {
  return (
    <div className="w-9 h-9 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center flex-shrink-0">
      <span className="text-sm font-bold text-emerald-600">
        {(name || '?')[0].toUpperCase()}
      </span>
    </div>
  );
}

export default function ClientEmployeesPage() {
  const { user } = useSelector((s) => s.auth);
  const { orgId } = useParams();
  const navigate = useNavigate();

  const [org, setOrg] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [showForm, setShowForm] = useState(false);
  const [editEmp, setEditEmp] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const isAdmin = ADMIN_ROLES.includes(user?.role);

  useEffect(() => {
    getClientOrgApi(orgId)
      .then((res) => setOrg(res.data.data))
      .catch(() => { toast.error('Organisation not found'); navigate('/csat/client-organisations'); });
  }, [orgId, navigate]);

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getClientEmployeesApi(orgId, { search, page, limit: 20, isActive: true });
      setEmployees(res.data.data);
      setPagination(res.data.pagination);
    } catch {
      toast.error('Failed to load employees');
    } finally {
      setLoading(false);
    }
  }, [orgId, search, page]);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);

  const openCreate = () => { setEditEmp(null); setForm(emptyForm); setShowForm(true); };
  const openEdit = (emp) => {
    setEditEmp(emp);
    setForm({ name: emp.name, email: emp.email, mobileNo: emp.mobileNo || '', designation: emp.designation || '', department: emp.department || '' });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    if (!form.email.trim()) { toast.error('Email is required'); return; }
    setSaving(true);
    try {
      if (editEmp) {
        await updateClientEmployeeApi(orgId, editEmp._id, form);
        toast.success('Employee updated');
      } else {
        await createClientEmployeeApi(orgId, form);
        toast.success('Employee added');
      }
      setShowForm(false);
      fetchEmployees();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteClientEmployeeApi(orgId, deleteTarget._id);
      toast.success('Employee deactivated');
      setDeleteTarget(null);
      fetchEmployees();
    } catch {
      toast.error('Failed to deactivate employee');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/csat/client-organisations')}
          className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors flex-shrink-0"
        >
          <HiOutlineArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-gray-900 truncate">
              {org ? org.name : '—'}
            </h1>
            {org?.industry && (
              <span className="text-xs font-medium bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full flex-shrink-0">
                {org.industry}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-400 mt-0.5">
            {pagination.total} employee{pagination.total !== 1 ? 's' : ''}
            {' · '}Employees
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-100 flex-shrink-0"
          >
            <HiOutlinePlus className="w-4 h-4" />
            Add Employee
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
        />
      </div>

      {/* Employee list */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : employees.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-2xl">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <HiOutlineUser className="w-7 h-7 text-gray-400" />
          </div>
          <p className="text-gray-700 font-semibold text-sm">No employees found</p>
          {isAdmin && (
            <button onClick={openCreate} className="mt-3 text-emerald-600 text-sm font-medium hover:underline">
              Add first employee →
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Employee</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Mobile</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Designation</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Department</th>
                {isAdmin && <th className="px-5 py-3.5 w-24" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {employees.map((emp) => (
                <tr key={emp._id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar name={emp.name} />
                      <span className="font-semibold text-gray-900">{emp.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-1.5 text-gray-500">
                      <HiOutlineMail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      {emp.email}
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-gray-500">{emp.mobileNo || <span className="text-gray-300">—</span>}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-500">{emp.designation || <span className="text-gray-300">—</span>}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-500">{emp.department || <span className="text-gray-300">—</span>}</td>
                  {isAdmin && (
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => openEdit(emp)}
                          className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <HiOutlinePencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(emp)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Deactivate"
                        >
                          <HiOutlineTrash className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination.pages > 1 && (
        <Pagination page={page} pages={pagination.pages} onPageChange={setPage} />
      )}

      {/* Modal */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editEmp ? 'Edit Employee' : 'Add Client Employee'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Full Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Rahul Sharma"
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Email Address <span className="text-red-400">*</span>
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="rahul@clientcompany.com"
              disabled={!!editEmp}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-50 disabled:text-gray-400"
            />
            {editEmp && (
              <p className="text-xs text-gray-400 mt-1.5">Email cannot be changed after creation.</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Mobile No <span className="text-gray-400 font-normal">(optional)</span></label>
              <input
                type="text"
                value={form.mobileNo}
                onChange={(e) => setForm((f) => ({ ...f, mobileNo: e.target.value }))}
                placeholder="+91 98765 43210"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Designation <span className="text-gray-400 font-normal">(optional)</span></label>
              <input
                type="text"
                value={form.designation}
                onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))}
                placeholder="e.g. Project Manager"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Department <span className="text-gray-400 font-normal">(optional)</span></label>
            <input
              type="text"
              value={form.department}
              onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
              placeholder="e.g. IT, Finance, Operations"
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2.5 text-sm bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 font-semibold transition-colors"
            >
              {saving ? 'Saving...' : editEmp ? 'Update' : 'Add Employee'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirm */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Deactivate Employee"
        message={`Remove "${deleteTarget?.name}" from survey recipient lists?`}
        confirmLabel="Deactivate"
        danger
      />
    </div>
  );
}
