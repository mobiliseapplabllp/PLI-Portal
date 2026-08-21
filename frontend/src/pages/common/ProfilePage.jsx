import { useSelector } from 'react-redux';
import { HiOutlineShieldCheck } from 'react-icons/hi';
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
      <PageHeader title="My Profile" />
      <div className="card max-w-lg mb-4 flex items-start gap-3 bg-emerald-50 border-emerald-200">
        <HiOutlineShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
        <p className="text-sm text-emerald-800">
          This account has no password. You sign in with a one-time code sent to <strong>{user?.email}</strong>.
        </p>
      </div>
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
