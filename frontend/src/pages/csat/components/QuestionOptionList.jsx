import { HiOutlinePlus, HiOutlineTrash } from 'react-icons/hi';

export default function QuestionOptionList({ options = [], onChange }) {
  const add = () => onChange([...options, '']);
  const remove = (idx) => onChange(options.filter((_, i) => i !== idx));
  const update = (idx, val) => onChange(options.map((o, i) => (i === idx ? val : o)));

  return (
    <div className="space-y-2">
      {options.map((opt, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <input
            type="text"
            value={opt}
            onChange={(e) => update(idx, e.target.value)}
            placeholder={`Option ${idx + 1}`}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            type="button"
            onClick={() => remove(idx)}
            className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors"
            title="Remove option"
          >
            <HiOutlineTrash className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="flex items-center gap-1.5 text-sm text-emerald-600 hover:text-emerald-800 font-medium"
      >
        <HiOutlinePlus className="w-4 h-4" />
        Add option
      </button>
    </div>
  );
}
