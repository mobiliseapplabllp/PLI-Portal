import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchTeam } from '../../store/usersSlice';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';

export default function TeamList() {
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const { team, loading } = useSelector((state) => state.users);

  useEffect(() => {
    if (user?._id) dispatch(fetchTeam(user._id));
  }, [dispatch, user]);

  const columns = [
    { key: 'employeeCode', label: 'Code' },
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'designation', label: 'Designation' },
    { key: 'department', label: 'Department', render: (r) => r.department?.name || '—' },
    { key: 'kpiReviewApplicable', label: 'KPI Review', render: (r) => (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        r.kpiReviewApplicable !== false
          ? 'bg-green-100 text-green-700'
          : 'bg-red-100 text-red-700'
      }`}>
        {r.kpiReviewApplicable !== false ? 'Applicable' : 'Not Applicable'}
      </span>
    )},
  ];

  return (
    <div>
      <PageHeader title="My Team" subtitle={`${team.length} direct reports`} />
      <DataTable columns={columns} data={team} loading={loading} emptyMessage="No team members found" />
    </div>
  );
}
