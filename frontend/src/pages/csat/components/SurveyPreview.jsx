import QuestionRenderer from '../../../components/common/QuestionRenderer';

export default function SurveyPreview({ survey, questions }) {
  if (!questions || questions.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400 text-sm">
        No questions yet. Add questions to see a preview.
      </div>
    );
  }

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 space-y-6">
      {/* Survey header */}
      <div className="border-b border-gray-200 pb-4">
        <h2 className="text-xl font-bold text-gray-900">{survey?.name || 'Survey Preview'}</h2>
        {survey?.description && (
          <p className="text-sm text-gray-600 mt-1">{survey.description}</p>
        )}
      </div>

      {/* Questions */}
      {questions.map((q, idx) => (
        <div key={q._localId || q._id || idx} className="space-y-2">
          <p className="text-sm font-semibold text-gray-800">
            {idx + 1}. {q.questionText}
            {q.isRequired && <span className="text-red-500 ml-1">*</span>}
          </p>
          <QuestionRenderer question={q} disabled />
        </div>
      ))}

      {/* Thank-you preview */}
      {survey?.thankYouMessage && (
        <div className="border-t border-gray-200 pt-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Thank-you message</p>
          <p className="text-sm text-gray-600 italic">{survey.thankYouMessage}</p>
        </div>
      )}
    </div>
  );
}
