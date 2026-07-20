import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { HiOutlineArrowLeft, HiOutlineEye } from 'react-icons/hi';
import { getSurveyApi } from '../../api/csat.api';
import QuestionRenderer from '../../components/common/QuestionRenderer';

const parseOptions = (options) => {
  if (Array.isArray(options)) return options;
  if (typeof options === 'string') {
    try { return JSON.parse(options); } catch { return []; }
  }
  return [];
};

function TopProgress({ current, total }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-gray-100">
      <div
        className="h-full bg-emerald-500 transition-all duration-500 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function QuestionSlide({ question, index, total, value, onChange, error, visible, slideDir }) {
  const qId = question._id || question.id;
  const hasAnswer = value !== undefined && value !== null && value !== '' &&
    !(Array.isArray(value) && value.length === 0);

  return (
    <div
      style={{
        transition: 'opacity 0.22s ease, transform 0.22s ease',
        opacity: visible ? 1 : 0,
        transform: visible
          ? 'translateY(0)'
          : slideDir > 0 ? 'translateY(20px)' : 'translateY(-20px)',
      }}
      className="w-full"
    >
      <div className="flex items-center gap-2 mb-6">
        <span className="text-2xl font-bold text-gray-900">{index + 1}</span>
        <span className="text-base text-gray-300 font-medium">/ {total}</span>
        {question.isRequired && (
          <span className="ml-1 text-xs text-red-400 font-semibold">Required</span>
        )}
      </div>

      <h2 className="text-xl sm:text-2xl font-bold text-gray-900 leading-snug mb-2">
        {question.questionText}
        {question.isRequired && <span className="text-red-400 ml-1.5">*</span>}
      </h2>

      {question.helperText && (
        <p className="text-sm text-gray-400 mb-6 leading-relaxed">{question.helperText}</p>
      )}
      {!question.helperText && <div className="mb-6" />}

      <div className="max-w-lg">
        <QuestionRenderer
          question={{ ...question, id: qId }}
          value={value}
          onChange={onChange}
        />
      </div>

      {error && (
        <p className="mt-4 text-sm text-red-500 font-medium flex items-center gap-1.5">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
        </p>
      )}

      {hasAnswer && (
        <p className="mt-5 text-xs text-gray-300 flex items-center gap-1.5">
          Press
          <kbd className="inline-flex items-center px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded text-gray-400 text-xs font-mono">Enter ↵</kbd>
          to continue
        </p>
      )}
    </div>
  );
}

export default function SurveyPreviewPage() {
  const { surveyId } = useParams();
  const navigate = useNavigate();

  const [survey, setSurvey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState({});

  // One-at-a-time navigation state
  const [stage, setStage] = useState('intro');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [slideVisible, setSlideVisible] = useState(true);
  const [slideDir, setSlideDir] = useState(1);
  const [currentError, setCurrentError] = useState('');

  useEffect(() => {
    getSurveyApi(surveyId)
      .then((res) => {
        const s = res.data.data;
        s.questions = (s.questions || []).map((q) => ({
          ...q,
          options: parseOptions(q.options),
        }));
        setSurvey(s);
      })
      .catch(() => toast.error('Failed to load survey'))
      .finally(() => setLoading(false));
  }, [surveyId]);

  const questions = useMemo(() => survey?.questions || [], [survey]);
  const currentQuestion = questions[currentIndex];
  const currentQId = currentQuestion ? (currentQuestion._id || currentQuestion.id) : null;
  const currentValue = currentQId ? answers[currentQId] : undefined;

  const hasAnswer = useCallback((qId) => {
    const val = answers[qId];
    return val !== undefined && val !== null && val !== '' && !(Array.isArray(val) && val.length === 0);
  }, [answers]);

  const goToIndex = useCallback((nextIndex, dir) => {
    setSlideDir(dir);
    setSlideVisible(false);
    setTimeout(() => {
      setCurrentIndex(nextIndex);
      setCurrentError('');
      setSlideVisible(true);
    }, 220);
  }, []);

  const validateCurrent = useCallback(() => {
    if (!currentQuestion?.isRequired) return true;
    if (!hasAnswer(currentQId)) {
      setCurrentError('This field is required — please answer before continuing.');
      return false;
    }
    return true;
  }, [currentQuestion, currentQId, hasAnswer]);

  const handleNext = useCallback(() => {
    if (!validateCurrent()) return;
    if (currentIndex < questions.length - 1) goToIndex(currentIndex + 1, 1);
  }, [validateCurrent, currentIndex, questions.length, goToIndex]);

  const handleBack = useCallback(() => {
    if (currentIndex > 0) goToIndex(currentIndex - 1, -1);
    else setStage('intro');
  }, [currentIndex, goToIndex]);

  useEffect(() => {
    if (stage !== 'questions') return;
    const onKey = (e) => {
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'SELECT') {
        e.preventDefault();
        if (currentIndex < questions.length - 1) handleNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stage, currentIndex, questions.length, handleNext]);

  const handlePreviewSubmit = () => {
    toast('This is a preview. Submissions are disabled.', {
      icon: '👁️',
      style: { background: '#1e293b', color: '#f1f5f9', fontSize: '13px' },
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-400">Loading preview...</p>
        </div>
      </div>
    );
  }

  if (!survey) return null;

  const isLast = currentIndex === questions.length - 1;

  // ── Preview banner (shown on every screen) ────────────────────────────────
  const PreviewBanner = () => (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-50 border-b border-amber-200 px-4 py-2.5">
      <div className="max-w-xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 bg-amber-100 border border-amber-300 rounded-full px-3 py-1">
            <HiOutlineEye className="w-3.5 h-3.5 text-amber-700" />
            <span className="text-xs font-bold text-amber-800 uppercase tracking-wide">Preview Mode</span>
          </div>
          <p className="text-xs text-amber-700 hidden sm:block">
            Exactly what your client will see. Submissions are disabled.
          </p>
        </div>
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-900 transition-colors flex-shrink-0"
        >
          <HiOutlineArrowLeft className="w-3.5 h-3.5" />
          Back to Builder
        </button>
      </div>
    </div>
  );

  // ── Intro screen ─────────────────────────────────────────────────────────
  if (stage === 'intro') {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <PreviewBanner />
        <div className="flex-1 flex items-center justify-center px-6 py-16 mt-10">
          <div className="w-full max-w-xl space-y-8">
            <p className="text-base text-gray-400">
              Hi, <span className="font-semibold text-gray-700">Preview User</span> 👋
            </p>
            <div className="space-y-3">
              <h1 className="text-3xl font-bold text-gray-900 leading-tight">{survey.name}</h1>
              {survey.description && (
                <p className="text-gray-500 text-base leading-relaxed">{survey.description}</p>
              )}
            </div>
            <div className="flex items-center gap-5 text-sm text-gray-400">
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 20 20">
                  <path d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h6a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h0a2 2 0 002-2M9 5a2 2 0 012-2h0a2 2 0 012 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                {questions.length} question{questions.length !== 1 ? 's' : ''}
              </span>
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 20 20">
                  <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                Takes under 2 minutes
              </span>
            </div>
            <button
              onClick={() => { setCurrentIndex(0); setStage('questions'); }}
              className="flex items-center gap-3 px-8 py-4 bg-emerald-600 text-white text-base font-semibold rounded-2xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
            >
              Start Survey
              <svg className="w-5 h-5" fill="none" viewBox="0 0 20 20">
                <path d="M4 10h12M10 4l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
        <footer className="pb-6 text-center">
          <p className="text-xs text-gray-300">Powered by PLI Portal · Secure & Confidential</p>
        </footer>
      </div>
    );
  }

  // ── Question-by-question ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PreviewBanner />
      <TopProgress current={currentIndex + (hasAnswer(currentQId) ? 1 : 0)} total={questions.length} />

      <div className="flex-1 flex items-center justify-center px-6 py-16 mt-10">
        <div className="w-full max-w-xl">
          {currentQuestion && (
            <QuestionSlide
              question={currentQuestion}
              index={currentIndex}
              total={questions.length}
              value={currentValue}
              onChange={(val) => {
                setAnswers((prev) => ({ ...prev, [currentQId]: val }));
                if (currentError) setCurrentError('');
              }}
              error={currentError}
              visible={slideVisible}
              slideDir={slideDir}
            />
          )}
        </div>
      </div>

      {/* Bottom nav */}
      <div className="border-t border-gray-100 bg-white px-6 py-4">
        <div className="max-w-xl mx-auto flex items-center justify-between gap-4">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 20 20">
              <path d="M15 10H5M9 5l-5 5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {currentIndex === 0 ? 'Back to Start' : 'Back'}
          </button>

          <div className="flex items-center gap-1.5">
            {questions.slice(0, 8).map((q, i) => {
              const qId = q._id || q.id;
              const done = hasAnswer(qId);
              return (
                <div
                  key={i}
                  className={`rounded-full transition-all duration-300 ${
                    i === currentIndex ? 'w-5 h-2 bg-emerald-600' : done ? 'w-2 h-2 bg-emerald-400' : 'w-2 h-2 bg-gray-200'
                  }`}
                />
              );
            })}
            {questions.length > 8 && (
              <span className="text-xs text-gray-400 ml-1">+{questions.length - 8}</span>
            )}
          </div>

          {isLast ? (
            <button
              onClick={handlePreviewSubmit}
              className="relative flex items-center gap-2 px-6 py-2.5 text-sm font-semibold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all shadow-sm min-w-[120px] justify-center"
            >
              Submit Survey
              <svg className="w-4 h-4" fill="none" viewBox="0 0 20 20">
                <path d="M4 10h12M10 4l6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="absolute -top-2.5 -right-2.5 bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                Preview
              </span>
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all shadow-sm min-w-[100px] justify-center"
            >
              OK
              <svg className="w-4 h-4" fill="none" viewBox="0 0 20 20">
                <path d="M4 10h12M10 4l6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <footer className="py-3 text-center">
        <p className="text-xs text-gray-300">Powered by PLI Portal · Secure & Confidential</p>
      </footer>
    </div>
  );
}
