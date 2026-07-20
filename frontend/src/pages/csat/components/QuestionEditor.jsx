import { HiOutlineTrash, HiOutlineChevronUp, HiOutlineChevronDown } from 'react-icons/hi';
import QuestionOptionList from './QuestionOptionList';

const QUESTION_TYPE_LABELS = {
  text:      'Short Text (Open-ended)',
  paragraph: 'Paragraph (Long Text)',
  radio:     'Single Choice (Radio)',
  select:    'Dropdown (Select)',
  checkbox:  'Multiple Choice (Checkbox)',
  rating:    'Rating Scale',
};

const NEEDS_OPTIONS   = ['radio', 'select', 'checkbox'];
const NEEDS_RATING    = ['rating'];
const NEEDS_PARAGRAPH = ['paragraph'];

// Rows options for paragraph answer field
const PARAGRAPH_ROWS_OPTIONS = [
  { value: 3, label: 'Short (3 rows)' },
  { value: 5, label: 'Medium (5 rows)' },
  { value: 8, label: 'Long (8 rows)' },
  { value: 10, label: 'Extra Long (10 rows)' },
];

export default function QuestionEditor({ question, index, total, onChange, onRemove, onMoveUp, onMoveDown }) {
  const update = (field, val) => onChange({ ...question, [field]: val });

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-1">
          Q{index + 1}
        </span>

        <div className="flex items-center gap-1 ml-auto">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={index === 0}
            className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed rounded"
            title="Move up"
          >
            <HiOutlineChevronUp className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed rounded"
            title="Move down"
          >
            <HiOutlineChevronDown className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors"
            title="Remove question"
          >
            <HiOutlineTrash className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Question text — always a textarea so longer questions can be written naturally */}
      <div>
        <textarea
          value={question.questionText || ''}
          onChange={(e) => update('questionText', e.target.value)}
          placeholder="Question text *"
          rows={2}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
        />
      </div>

      {/* Helper text */}
      <div>
        <input
          type="text"
          value={question.helperText || ''}
          onChange={(e) => update('helperText', e.target.value)}
          placeholder="Helper text (optional — shown below the question)"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-gray-50"
        />
      </div>

      {/* Type selector */}
      <div>
        <select
          value={question.questionType || 'text'}
          onChange={(e) => update('questionType', e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
        >
          {Object.entries(QUESTION_TYPE_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
      </div>

      {/* Options for radio/select/checkbox */}
      {NEEDS_OPTIONS.includes(question.questionType) && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Options</label>
          <QuestionOptionList
            options={question.options || []}
            onChange={(opts) => update('options', opts)}
          />
        </div>
      )}

      {/* Rating scale config */}
      {NEEDS_RATING.includes(question.questionType) && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Min Value</label>
            <input
              type="number"
              value={question.minValue ?? 1}
              onChange={(e) => update('minValue', parseInt(e.target.value) || 1)}
              min={0}
              max={9}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Max Value</label>
            <input
              type="number"
              value={question.maxValue ?? 5}
              onChange={(e) => update('maxValue', parseInt(e.target.value) || 5)}
              min={2}
              max={10}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Min Label</label>
            <input
              type="text"
              value={question.minLabel || ''}
              onChange={(e) => update('minLabel', e.target.value)}
              placeholder="e.g. Very Poor"
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Max Label</label>
            <input
              type="text"
              value={question.maxLabel || ''}
              onChange={(e) => update('maxLabel', e.target.value)}
              placeholder="e.g. Excellent"
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>
      )}

      {/* Paragraph answer rows config */}
      {NEEDS_PARAGRAPH.includes(question.questionType) && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">
            Answer Field Size
          </label>
          <select
            value={question.minValue ?? 5}
            onChange={(e) => update('minValue', parseInt(e.target.value))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
          >
            {PARAGRAPH_ROWS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">
            Controls how tall the answer text box appears to respondents.
          </p>
        </div>
      )}

      {/* Required toggle */}
      <div className="flex items-center gap-2 pt-1">
        <input
          type="checkbox"
          id={`req-${question._localId}`}
          checked={!!question.isRequired}
          onChange={(e) => update('isRequired', e.target.checked)}
          className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
        />
        <label htmlFor={`req-${question._localId}`} className="text-sm text-gray-600 cursor-pointer">
          Required
        </label>
      </div>
    </div>
  );
}
