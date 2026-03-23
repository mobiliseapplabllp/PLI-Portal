import { HiOutlineInbox } from 'react-icons/hi';

export default function EmptyState({ message = 'No data found', icon: Icon = HiOutlineInbox }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
      <Icon className="w-12 h-12 mb-3" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
