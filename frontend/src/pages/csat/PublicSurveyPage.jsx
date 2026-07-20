import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { getPublicSurveyApi, submitPublicSurveyApi } from '../../api/csat.api';
import QuestionRenderer from '../../components/common/QuestionRenderer';

const fmt = (d) =>
  new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

// ── Thin progress bar fixed at very top ───────────────────────────────────────
function TopProgress({ current, total }) {
  const pct = total > 0 ? Math.round(((current) / total) * 100) : 0;
  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-gray-100">
      <div
        className="h-full bg-emerald-500 transition-all duration-500 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ── Full-screen status screens ─────────────────────────────────────────────────
function StatusScreen({ variant, message, expiresAt }) {
  const cfg = {
    loading: {
      icon: <div className="w-14 h-14 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mx-auto" />,
      title: null, body: 'Loading your survey…', accent: false,
    },
    error: {
      icon: (
        <svg className="w-16 h-16 mx-auto" viewBox="0 0 64 64" fill="none">
          <circle cx="32" cy="32" r="32" fill="#FEF2F2" />
          <path d="M32 20v16M32 40v2" stroke="#EF4444" strokeWidth="3" strokeLinecap="round" />
        </svg>
      ),
      title: 'Link not found', body: message, accent: false,
    },
    closed: {
      icon: (
        <svg className="w-16 h-16 mx-auto" viewBox="0 0 64 64" fill="none">
          <circle cx="32" cy="32" r="32" fill="#F1F5F9" />
          <rect x="21" y="30" width="22" height="16" rx="2" fill="#94A3B8" />
          <path d="M25 30v-5a7 7 0 0 1 14 0v5" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      ),
      title: 'Survey closed', body: 'This survey is no longer accepting responses.', accent: false,
    },
    expired: {
      icon: (
        <svg className="w-16 h-16 mx-auto" viewBox="0 0 64 64" fill="none">
          <circle cx="32" cy="32" r="32" fill="#FFFBEB" />
          <circle cx="32" cy="32" r="12" stroke="#F59E0B" strokeWidth="2.5" />
          <path d="M32 25v8l5 4" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      title: 'Survey expired', body: `This survey closed on ${fmt(expiresAt)}.`, accent: false,
    },
    submitted: {
      icon: (
        <svg className="w-16 h-16 mx-auto" viewBox="0 0 64 64" fill="none">
          <circle cx="32" cy="32" r="32" fill="#ECFDF5" />
          <path d="M20 33l9 9 15-17" stroke="#059669" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      title: 'Thank you!', body: message || 'Your response has been recorded.', accent: true,
    },
    already: {
      icon: (
        <svg className="w-16 h-16 mx-auto" viewBox="0 0 64 64" fill="none">
          <circle cx="32" cy="32" r="32" fill="#ECFDF5" />
          <path d="M20 33l9 9 15-17" stroke="#059669" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      title: 'Already submitted', body: message || 'You have already completed this survey.', accent: true,
    },
  }[variant] || {};

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="h-1 bg-emerald-600 fixed top-0 left-0 right-0" />
      <div className="max-w-sm w-full text-center space-y-5 py-16">
        {cfg.icon}
        {cfg.title && (
          <h1 className={`text-2xl font-bold ${cfg.accent ? 'text-emerald-700' : 'text-gray-900'}`}>
            {cfg.title}
          </h1>
        )}
        <p className="text-gray-500 text-sm leading-relaxed">{cfg.body}</p>
      </div>
    </div>
  );
}

// ── Intro / Welcome screen ─────────────────────────────────────────────────────
function IntroScreen({ survey, recipientName, questionCount, onStart }) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="h-1 bg-emerald-600" />
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="max-w-xl w-full space-y-8">
          {/* Greeting */}
          {recipientName && (
            <p className="text-base text-gray-400">
              Hi, <span className="font-semibold text-gray-700">{recipientName}</span> 👋
            </p>
          )}

          {/* Survey name */}
          <div className="space-y-3">
            <h1 className="text-3xl font-bold text-gray-900 leading-tight">{survey.name}</h1>
            {survey.description && (
              <p className="text-gray-500 text-base leading-relaxed">{survey.description}</p>
            )}
          </div>

          {/* Meta info */}
          <div className="flex items-center gap-5 text-sm text-gray-400">
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 20 20">
                <path d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h6a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h0a2 2 0 002-2M9 5a2 2 0 012-2h0a2 2 0 012 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {questionCount} question{questionCount !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 20 20">
                <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Takes under 2 minutes
            </span>
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 20 20">
                <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Confidential
            </span>
          </div>

          {/* Expiry notice */}
          {survey.expiresAt && (
            <div className="inline-flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
              <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 20 20">
                <path d="M10 2a8 8 0 100 16A8 8 0 0010 2zm0 4v5h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-xs font-medium text-amber-700">
                Closes on {fmt(survey.expiresAt)}
              </span>
            </div>
          )}

          {/* CTA */}
          <button
            onClick={onStart}
            className="flex items-center gap-3 px-8 py-4 bg-emerald-600 text-white text-base font-semibold rounded-2xl hover:bg-emerald-700 active:bg-emerald-800 transition-all shadow-lg shadow-emerald-100 focus:outline-none focus:ring-4 focus:ring-emerald-500/25"
          >
            Start Survey
            <svg className="w-5 h-5" fill="none" viewBox="0 0 20 20">
              <path d="M4 10h12M10 4l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <p className="text-xs text-gray-300">Press Enter ↵ to continue between questions</p>
        </div>
      </div>
      <footer className="pb-6 text-center">
        <p className="text-xs text-gray-300">Powered by PLI Portal · Secure & Confidential</p>
      </footer>
    </div>
  );
}

// ── One-question slide ─────────────────────────────────────────────────────────
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
      {/* Counter */}
      <div className="flex items-center gap-2 mb-6">
        <span className="text-2xl font-bold text-gray-900">{index + 1}</span>
        <span className="text-base text-gray-300 font-medium">/ {total}</span>
        {question.isRequired && (
          <span className="ml-1 text-xs text-red-400 font-semibold">Required</span>
        )}
      </div>

      {/* Question text */}
      <h2 className="text-xl sm:text-2xl font-bold text-gray-900 leading-snug mb-2">
        {question.questionText}
        {question.isRequired && <span className="text-red-400 ml-1.5">*</span>}
      </h2>

      {/* Helper text */}
      {question.helperText && (
        <p className="text-sm text-gray-400 mb-6 leading-relaxed">{question.helperText}</p>
      )}
      {!question.helperText && <div className="mb-6" />}

      {/* Answer input */}
      <div className="max-w-lg">
        <QuestionRenderer
          question={{ ...question, id: qId }}
          value={value}
          onChange={onChange}
        />
      </div>

      {/* Validation error */}
      {error && (
        <p className="mt-4 text-sm text-red-500 font-medium flex items-center gap-1.5">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
        </p>
      )}

      {/* Keyboard hint */}
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

// ── Main component ─────────────────────────────────────────────────────────────
export default function PublicSurveyPage() {
  const { token } = useParams();

  const [pageState, setPageState] = useState('loading');
  const [survey, setSurvey] = useState(null);
  const [recipientName, setRecipientName] = useState('');
  const [answers, setAnswers] = useState({});
  const [thankYou, setThankYou] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // One-at-a-time navigation
  const [stage, setStage] = useState('intro');   // 'intro' | 'questions'
  const [currentIndex, setCurrentIndex] = useState(0);
  const [slideVisible, setSlideVisible] = useState(true);
  const [slideDir, setSlideDir] = useState(1);    // 1=forward, -1=back
  const [currentError, setCurrentError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getPublicSurveyApi(token)
      .then((res) => {
        const data = res.data.data;
        if (data.closed)           { setPageState('closed'); setSurvey(data); return; }
        if (data.expired)          { setPageState('expired'); setSurvey(data); return; }
        if (data.alreadySubmitted) { setPageState('already'); setThankYou(data.thankYouMessage); return; }
        setSurvey(data.survey);
        setRecipientName(data.recipientName || '');
        setPageState('active');
      })
      .catch((err) => {
        const status = err.response?.status;
        if (status === 404) setErrorMsg('This survey link is invalid or does not exist.');
        else if (status === 429) setErrorMsg('Too many requests. Please try again in a few minutes.');
        else setErrorMsg('Something went wrong. Please try again.');
        setPageState('error');
      });
  }, [token]);

  const questions = useMemo(() => survey?.questions || [], [survey]);

  const currentQuestion = questions[currentIndex];
  const currentQId = currentQuestion ? (currentQuestion._id || currentQuestion.id) : null;
  const currentValue = currentQId ? answers[currentQId] : undefined;

  const hasAnswer = useCallback((qId) => {
    const val = answers[qId];
    return val !== undefined && val !== null && val !== '' && !(Array.isArray(val) && val.length === 0);
  }, [answers]);

  const answeredCount = useMemo(
    () => questions.filter((q) => hasAnswer(q._id || q.id)).length,
    [questions, hasAnswer]
  );

  // Slide transition helper
  const goToIndex = useCallback((nextIndex, dir) => {
    setSlideDir(dir);
    setSlideVisible(false);
    setTimeout(() => {
      setCurrentIndex(nextIndex);
      setCurrentError('');
      setSlideVisible(true);
    }, 220);
  }, []);

  // Validate current question before advancing
  const validateCurrent = useCallback(() => {
    if (!currentQuestion) return true;
    if (!currentQuestion.isRequired) return true;
    if (!hasAnswer(currentQId)) {
      setCurrentError('This field is required — please answer before continuing.');
      return false;
    }
    return true;
  }, [currentQuestion, currentQId, hasAnswer]);

  const handleNext = useCallback(() => {
    if (!validateCurrent()) return;
    if (currentIndex < questions.length - 1) {
      goToIndex(currentIndex + 1, 1);
    }
  }, [validateCurrent, currentIndex, questions.length, goToIndex]);

  const handleBack = useCallback(() => {
    if (currentIndex > 0) goToIndex(currentIndex - 1, -1);
    else setStage('intro');
  }, [currentIndex, goToIndex]);

  // Enter key to advance
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

  const handleSubmit = async () => {
    // Validate all required questions before submitting
    const firstMissing = questions.find(
      (q) => q.isRequired && !hasAnswer(q._id || q.id)
    );
    if (firstMissing) {
      const idx = questions.indexOf(firstMissing);
      goToIndex(idx, idx > currentIndex ? 1 : -1);
      setTimeout(() => setCurrentError('This field is required — please answer before submitting.'), 250);
      return;
    }

    setSubmitting(true);
    try {
      const res = await submitPublicSurveyApi(token, { answers });
      setThankYou(res.data.data.thankYouMessage);
      setPageState('submitted');
    } catch (err) {
      const msg = err.response?.data?.error?.message;
      if (err.response?.status === 409 && msg?.includes('already submitted')) {
        setPageState('already');
      } else {
        setErrorMsg(msg || 'Submission failed. Please try again.');
        setPageState('error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render states ────────────────────────────────────────────────────────────
  if (pageState === 'loading')   return <StatusScreen variant="loading" />;
  if (pageState === 'error')     return <StatusScreen variant="error" message={errorMsg} />;
  if (pageState === 'closed')    return <StatusScreen variant="closed" />;
  if (pageState === 'expired')   return <StatusScreen variant="expired" expiresAt={survey?.expiresAt} />;
  if (pageState === 'submitted') return <StatusScreen variant="submitted" message={thankYou} />;
  if (pageState === 'already')   return <StatusScreen variant="already" message={thankYou} />;

  // ── Intro screen ─────────────────────────────────────────────────────────────
  if (stage === 'intro') {
    return (
      <IntroScreen
        survey={survey}
        recipientName={recipientName}
        questionCount={questions.length}
        onStart={() => { setCurrentIndex(0); setStage('questions'); }}
      />
    );
  }

  // ── Question-by-question ──────────────────────────────────────────────────────
  const isLast = currentIndex === questions.length - 1;

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <TopProgress current={currentIndex + (hasAnswer(currentQId) ? 1 : 0)} total={questions.length} />

      {/* Main question area */}
      <div className="flex-1 flex items-center justify-center px-6 py-16">
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

      {/* Bottom navigation bar */}
      <div className="border-t border-gray-100 bg-white px-6 py-4">
        <div className="max-w-xl mx-auto flex items-center justify-between gap-4">

          {/* Back */}
          <button
            onClick={handleBack}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 20 20">
              <path d="M15 10H5M9 5l-5 5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {currentIndex === 0 ? 'Back to Start' : 'Back'}
          </button>

          {/* Question dots — compact, max 8 shown */}
          <div className="flex items-center gap-1.5">
            {questions.slice(0, 8).map((q, i) => {
              const qId = q._id || q.id;
              const done = hasAnswer(qId);
              return (
                <div
                  key={i}
                  className={`rounded-full transition-all duration-300 ${
                    i === currentIndex
                      ? 'w-5 h-2 bg-emerald-600'
                      : done
                      ? 'w-2 h-2 bg-emerald-400'
                      : 'w-2 h-2 bg-gray-200'
                  }`}
                />
              );
            })}
            {questions.length > 8 && (
              <span className="text-xs text-gray-400 ml-1">+{questions.length - 8}</span>
            )}
          </div>

          {/* Next / Submit */}
          {isLast ? (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-60 transition-all shadow-sm shadow-emerald-100 min-w-[120px] justify-center"
            >
              {submitting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Submitting…
                </>
              ) : (
                <>
                  Submit Survey
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 20 20">
                    <path d="M4 10h12M10 4l6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all shadow-sm shadow-emerald-100 min-w-[100px] justify-center"
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
