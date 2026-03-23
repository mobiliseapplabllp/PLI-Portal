import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import { formatDate, formatDateTime } from '../../utils/formatters';

export default function ProfilePage() {
  const { user } = useSelector((state) => state.auth);

  const fields = [
    { label: 'Employee Code', value: user?.employeeCode },
    { label: 'Name', value: user?.name },
    { label: 'Email', value: user?.email },
    { label: 'Phone', value: user?.phone || '—' },
    { label: 'Department', value: user?.department?.name || '—' },
    { label: 'Designation', value: user?.designation || '—' },
    { label: 'Role', value: user?.role?.charAt(0).toUpperCase() + user?.role?.slice(1) },
    { label: 'Joining Date', value: formatDate(user?.joiningDate) },
    { label: 'Last Login', value: formatDateTime(user?.lastLogin) },
  ];

  return (
    <div>
      <PageHeader
        title="My Profile"
        actions={<Link to="/change-password" className="btn-secondary">Change Password</Link>}
      />
      <div className="card max-w-lg">
        <dl className="divide-y divide-gray-100">
          {fields.map((f) => (
            <div key={f.label} className="flex py-3">
              <dt className="w-40 text-sm font-medium text-gray-500">{f.label}</dt>
              <dd className="text-sm text-gray-900">{f.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
