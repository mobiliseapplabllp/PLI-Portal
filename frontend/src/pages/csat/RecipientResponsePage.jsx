import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { HiOutlineArrowLeft, HiOutlineClock, HiOutlineMail } from 'react-icons/hi';
import { getRecipientResponsesApi } from '../../api/csat.api';
import QuestionRenderer from '../../components/common/QuestionRenderer';

const fmtDate = (d) =>
  d ? new Date(d).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }) : '—';

const TYPE_LABEL = {
  text: 'Text', radio: 'Multiple choice', select: 'Dropdown',
  checkbox: 'Checkboxes', rating: 'Rating scale',
};

export default function RecipientResponsePage() {
  const { dispatchId, recipientId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRecipientResponsesApi(dispatchId, recipientId)
      .then((res) => setData(res.data.data))
      .catch(() => { toast.error('Failed to load responses'); navigate(-1); })
      .finally(() => setLoading(false));
  }, [dispatchId, recipientId, navigate]);

  if (loading) {
    return (
      <div className="p-6 space-y-4 max-w-2xl mx-auto">
        <div className="h-10 w-40 bg-gray-100 rounded-xl animate-pulse" />
        <div className="h-24 bg-gray-100 rounded-2xl animate-pulse" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 bg-gray-100 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const { recipient, surveyName, answers } = data;

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      {/* Back nav */}
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-700 transition-colors group"
      >
        <HiOutlineArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
        Back to responses
      </button>

      {/* Page title */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">{surveyName}</h1>
        <p className="text-sm text-gray-400 mt-0.5">Individual response</p>
      </div>

      {/* Recipient card */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 flex items-start gap-4">
        <div className="w-11 h-11 bg-emerald-50 border border-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
          <span className="text-base font-bold text-emerald-600">
            {(recipient.name || '?')[0].toUpperCase()}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900">{recipient.name}</p>
          <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-0.5">
            <HiOutlineMail className="w-3.5 h-3.5" />
            {recipient.email}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 mt-1 font-medium">
            <HiOutlineClock className="w-3.5 h-3.5" />
            Submitted {fmtDate(recipient.submittedAt)}
          </div>
        </div>
        <div className="flex-shrink-0">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-full border border-emerald-200">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12">
              <path d="M2 6l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Completed
          </span>
        </div>
      </div>

      {/* Answers */}
      <div className="space-y-4">
        {answers.map((a, idx) => {
          let parsedValue = a.answer;
          if (a.questionType === 'checkbox' && a.answer) {
            try { parsedValue = JSON.parse(a.answer); } catch { /* leave raw */ }
          } else if (a.questionType === 'rating' && a.answer) {
            parsedValue = parseInt(a.answer);
          }

          return (
            <div key={a.questionId} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              {/* Question header */}
              <div className="px-5 pt-5 pb-3 border-b border-gray-100">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-semibold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                    Q{idx + 1}
                  </span>
                  {TYPE_LABEL[a.questionType] && (
                    <span className="text-xs text-gray-400">{TYPE_LABEL[a.questionType]}</span>
                  )}
                </div>
                <p className="text-sm font-semibold text-gray-900 leading-snug">{a.questionText}</p>
                {a.helperText && (
                  <p className="text-xs text-gray-400 mt-1">{a.helperText}</p>
                )}
              </div>

              {/* Answer */}
              <div className="px-5 py-4">
                {a.answer ? (
                  <div className="pointer-events-none opacity-90">
                    <QuestionRenderer
                      question={{ ...a, id: a.questionId }}
                      value={parsedValue}
                      disabled
                    />
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">No answer provided</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
