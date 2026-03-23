import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchDepartments, createDepartment, updateDepartment } from '../../store/departmentsSlice';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';

export default function DepartmentManagement() {
  const dispatch = useDispatch();
  const { list, loading } = useSelector((state) => state.departments);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const { register, handleSubmit, reset } = useForm();

  useEffect(() => {
    dispatch(fetchDepartments());
  }, [dispatch]);

  const openCreate = () => {
    setEditing(null);
    reset({ code: '', name: '' });
    setShowModal(true);
  };

  const openEdit = (dept) => {
    setEditing(dept);
    reset({ code: dept.code, name: dept.name, isActive: dept.isActive });
    setShowModal(true);
  };

  const onSubmit = async (data) => {
    let result;
    if (editing) {
      result = await dispatch(updateDepartment({ id: editing._id, data }));
    } else {
      result = await dispatch(createDepartment(data));
    }
    if (result.meta.requestStatus === 'fulfilled') {
      toast.success(editing ? 'Updated' : 'Created');
      setShowModal(false);
      dispatch(fetchDepartments());
    } else {
      toast.error(result.payload || 'Failed');
    }
  };

  const columns = [
    { key: 'code', label: 'Code' },
    { key: 'name', label: 'Name' },
    { key: 'isActive', label: 'Status', render: (r) => (
      <span className={r.isActive ? 'text-green-600' : 'text-red-500'}>{r.isActive ? 'Active' : 'Inactive'}</span>
    )},
    { key: 'actions', label: '', render: (r) => (
      <button onClick={(e) => { e.stopPropagation(); openEdit(r); }} className="text-primary-600 text-sm hover:underline">Edit</button>
    )},
  ];

  return (
    <div>
      <PageHeader title="Departments" actions={<button onClick={openCreate} className="btn-primary">+ Add Department</button>} />
      <DataTable columns={columns} data={list} loading={loading} />

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Department' : 'Add Department'}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="label-text">Code</label>
            <input {...register('code', { required: true })} className="input-field" disabled={!!editing} />
          </div>
          <div>
            <label className="label-text">Name</label>
            <input {...register('name', { required: true })} className="input-field" />
          </div>
          {editing && (
            <div className="flex items-center gap-2">
              <input type="checkbox" {...register('isActive')} id="deptActive" />
              <label htmlFor="deptActive" className="text-sm">Active</label>
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">{editing ? 'Update' : 'Create'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
