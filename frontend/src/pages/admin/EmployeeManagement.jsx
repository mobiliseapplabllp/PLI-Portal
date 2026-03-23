import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchUsers, createUser, updateUser } from '../../store/usersSlice';
import { fetchDepartments } from '../../store/departmentsSlice';
import { getUsersApi } from '../../api/users.api';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import Pagination from '../../components/common/Pagination';
import Modal from '../../components/common/Modal';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { ROLES } from '../../utils/constants';

export default function EmployeeManagement() {
  const dispatch = useDispatch();
  const { list: users, pagination, loading } = useSelector((state) => state.users);
  const { list: departments } = useSelector((state) => state.departments);
  const [filters, setFilters] = useState({ page: 1, search: '' });
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm();
  const watchIsActive = watch('isActive');

  // All employees list for the manager dropdown (fetched once, unpaginated)
  const [allUsers, setAllUsers] = useState([]);
  const [managerSearch, setManagerSearch] = useState('');

  useEffect(() => {
    dispatch(fetchUsers(filters));
    dispatch(fetchDepartments());
  }, [dispatch, filters]);

  // Load all users once for the manager dropdown
  useEffect(() => {
    getUsersApi({ limit: 500 })
      .then((res) => setAllUsers(res.data.data || []))
      .catch(() => {});
  }, []);

  const openCreate = () => {
    setEditingUser(null);
    setManagerSearch('');
    reset({ name: '', email: '', employeeCode: '', password: '', role: 'employee', phone: '', designation: '', department: '', manager: '', kpiReviewApplicable: true });
    setShowModal(true);
  };

  const openEdit = (user) => {
    setEditingUser(user);
    setManagerSearch('');
    reset({
      name: user.name,
      email: user.email,
      employeeCode: user.employeeCode,
      role: user.role,
      phone: user.phone || '',
      designation: user.designation || '',
      department: user.department?._id || '',
      manager: user.manager?._id || '',
      isActive: user.isActive,
      kpiReviewApplicable: user.kpiReviewApplicable !== false,
    });
    setShowModal(true);
  };

  const onSubmit = async (data) => {
    const cleaned = { ...data };
    if (!cleaned.department) delete cleaned.department;
    if (!cleaned.manager) delete cleaned.manager;
    if (!cleaned.password) delete cleaned.password;

    let result;
    if (editingUser) {
      result = await dispatch(updateUser({ id: editingUser._id, data: cleaned }));
    } else {
      result = await dispatch(createUser(cleaned));
    }

    if (result.meta.requestStatus === 'fulfilled') {
      toast.success(editingUser ? 'User updated' : 'User created');
      setShowModal(false);
      dispatch(fetchUsers(filters));
      // Refresh all users list too
      getUsersApi({ limit: 500 }).then((res) => setAllUsers(res.data.data || []));
    } else {
      toast.error(result.payload || 'Failed');
    }
  };

  // Filter the allUsers list for the manager select dropdown
  // Exclude the user being edited (can't be their own manager)
  const managerOptions = allUsers
    .filter((u) => u.isActive !== false)
    .filter((u) => !editingUser || u._id !== editingUser._id)
    .filter((u) => {
      if (!managerSearch) return true;
      const q = managerSearch.toLowerCase();
      return (
        u.name.toLowerCase().includes(q) ||
        u.employeeCode.toLowerCase().includes(q) ||
        (u.email && u.email.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const columns = [
    { key: 'employeeCode', label: 'Code' },
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'role', label: 'Role', render: (r) => <span className="capitalize">{r.role}</span> },
    { key: 'department', label: 'Department', render: (r) => r.department?.name || '—' },
    { key: 'manager', label: 'Manager', render: (r) => r.manager?.name || '—' },
    { key: 'isActive', label: 'Status', render: (r) => (
      <span className={`text-xs font-medium ${r.isActive ? 'text-green-600' : 'text-red-500'}`}>
        {r.isActive ? 'Active' : 'Inactive'}
      </span>
    )},
    { key: 'kpiReviewApplicable', label: 'KPI Review', render: (r) => (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        r.kpiReviewApplicable !== false
          ? 'bg-green-100 text-green-700'
          : 'bg-red-100 text-red-700'
      }`}>
        {r.kpiReviewApplicable !== false ? 'Applicable' : 'Not Applicable'}
      </span>
    )},
    { key: 'actions', label: '', render: (r) => (
      <button onClick={(e) => { e.stopPropagation(); openEdit(r); }} className="text-primary-600 text-sm hover:underline">Edit</button>
    )},
  ];

  return (
    <div>
      <PageHeader
        title="Employee Management"
        actions={<button onClick={openCreate} className="btn-primary">+ Add Employee</button>}
      />

      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by name, email, code, or manager name..."
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
          className="input-field w-72"
        />
      </div>

      <DataTable columns={columns} data={users} loading={loading} />
      <Pagination pagination={pagination} onPageChange={(p) => setFilters({ ...filters, page: p })} />

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editingUser ? 'Edit Employee' : 'Add Employee'} size="lg">
        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label-text">Employee Code *</label>
            <input {...register('employeeCode', { required: 'Required' })} className="input-field" disabled={!!editingUser} />
            {errors.employeeCode && <p className="text-red-500 text-xs mt-1">{errors.employeeCode.message}</p>}
          </div>
          <div>
            <label className="label-text">Full Name *</label>
            <input {...register('name', { required: 'Required' })} className="input-field" />
          </div>
          <div>
            <label className="label-text">Email *</label>
            <input type="email" {...register('email', { required: 'Required' })} className="input-field" />
          </div>
          {!editingUser && (
            <div>
              <label className="label-text">Password *</label>
              <input type="password" {...register('password', { required: !editingUser ? 'Required' : false })} className="input-field" />
            </div>
          )}
          <div>
            <label className="label-text">Role</label>
            <select {...register('role')} className="input-field">
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div>
            <label className="label-text">Phone</label>
            <input {...register('phone')} className="input-field" />
          </div>
          <div>
            <label className="label-text">Designation</label>
            <input {...register('designation')} className="input-field" />
          </div>
          <div>
            <label className="label-text">Department</label>
            <select {...register('department')} className="input-field">
              <option value="">Select</option>
              {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="label-text">Manager</label>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Type to search employees by name or code..."
                value={managerSearch}
                onChange={(e) => setManagerSearch(e.target.value)}
                className="input-field"
              />
              <select {...register('manager')} className="input-field" size={5}>
                <option value="">— No Manager —</option>
                {managerOptions.map((m) => (
                  <option key={m._id} value={m._id}>
                    {m.name} ({m.employeeCode}) — {m.role}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400">
                {managerOptions.length} employee{managerOptions.length !== 1 ? 's' : ''} shown
                {managerSearch && ` matching "${managerSearch}"`}
              </p>
            </div>
          </div>
          {editingUser && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                {...register('isActive')}
                id="isActive"
                onChange={(e) => {
                  // When deactivating, auto-disable KPI review
                  const checked = e.target.checked;
                  setValue('isActive', checked);
                  if (!checked) {
                    setValue('kpiReviewApplicable', false);
                  }
                }}
              />
              <label htmlFor="isActive" className="text-sm">Active</label>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="kpiReviewApplicable"
              {...register('kpiReviewApplicable')}
              className="rounded"
              disabled={editingUser && watchIsActive === false}
            />
            <label htmlFor="kpiReviewApplicable" className={`text-sm ${editingUser && watchIsActive === false ? 'text-gray-400' : 'text-gray-700'}`}>
              KPI Review Applicable
            </label>
          </div>
          {editingUser && watchIsActive === false && (
            <p className="md:col-span-2 text-xs text-amber-600 bg-amber-50 rounded px-3 py-2">
              Deactivating this employee will automatically disable KPI review and lock all their open KPI assignments.
            </p>
          )}
          <div className="md:col-span-2 flex justify-end gap-3 mt-4">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">{editingUser ? 'Update' : 'Create'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
