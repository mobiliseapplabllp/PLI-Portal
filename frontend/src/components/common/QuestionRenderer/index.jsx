import RatingScale from '../RatingScale';

export default function QuestionRenderer({ question, value, onChange, disabled = false, showRequired = true }) {
  const { questionType, options = [], minValue = 1, maxValue = 5, minLabel, maxLabel, helperText, isRequired } = question;
  // For paragraph type, minValue stores the configured answer rows (default 5)
  const paragraphRows = questionType === 'paragraph' ? (minValue || 5) : 5;

  const handleCheckboxChange = (opt) => {
    const current = Array.isArray(value) ? value : [];
    const next = current.includes(opt)
      ? current.filter((v) => v !== opt)
      : [...current, opt];
    onChange && onChange(next);
  };

  return (
    <div className="space-y-2">
      {helperText && (
        <p className="text-sm text-gray-500">{helperText}</p>
      )}

      {questionType === 'text' && (
        <textarea
          value={value || ''}
          onChange={(e) => onChange && onChange(e.target.value)}
          disabled={disabled}
          rows={3}
          required={isRequired && showRequired}
          aria-required={isRequired}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none disabled:bg-gray-50 disabled:text-gray-400"
          placeholder="Your answer..."
        />
      )}

      {questionType === 'paragraph' && (
        <textarea
          value={value || ''}
          onChange={(e) => onChange && onChange(e.target.value)}
          disabled={disabled}
          rows={paragraphRows}
          required={isRequired && showRequired}
          aria-required={isRequired}
          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y disabled:bg-gray-50 disabled:text-gray-400 leading-relaxed"
          placeholder="Write your detailed response here..."
        />
      )}

      {questionType === 'radio' && (
        <div className="space-y-2">
          {options.map((opt) => (
            <label key={opt} className="flex items-center gap-2.5 cursor-pointer group">
              <input
                type="radio"
                name={question.id}
                value={opt}
                checked={value === opt}
                onChange={() => onChange && onChange(opt)}
                disabled={disabled}
                required={isRequired && showRequired}
                className="w-4 h-4 text-emerald-600 border-gray-300 focus:ring-emerald-500"
              />
              <span className="text-sm text-gray-700 group-hover:text-gray-900">{opt}</span>
            </label>
          ))}
        </div>
      )}

      {questionType === 'select' && (
        options.length === 0 && disabled ? (
          <p className="text-xs text-gray-400 italic">No options added yet</p>
        ) : (
          <select
            value={value || ''}
            onChange={(e) => onChange && onChange(e.target.value)}
            disabled={disabled && false}
            required={isRequired && showRequired}
            aria-required={isRequired}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white cursor-pointer"
          >
            <option value="">— Select an option —</option>
            {options.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        )
      )}

      {questionType === 'checkbox' && (
        <fieldset>
          <legend className="sr-only">Select all that apply</legend>
          <div className="space-y-2">
            {options.map((opt) => {
              const checked = Array.isArray(value) && value.includes(opt);
              return (
                <label key={opt} className="flex items-center gap-2.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    value={opt}
                    checked={checked}
                    onChange={() => handleCheckboxChange(opt)}
                    disabled={disabled}
                    className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                  />
                  <span className="text-sm text-gray-700 group-hover:text-gray-900">{opt}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {questionType === 'rating' && (
        <RatingScale
          min={minValue}
          max={maxValue}
          minLabel={minLabel}
          maxLabel={maxLabel}
          value={typeof value === 'number' ? value : (value ? parseInt(value) : null)}
          onChange={onChange}
          disabled={disabled}
        />
      )}
    </div>
  );
}
