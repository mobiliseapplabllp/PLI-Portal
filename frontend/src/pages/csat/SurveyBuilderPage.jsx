import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlinePlus, HiOutlineEye, HiOutlineCheckCircle, HiOutlineArchive,
  HiOutlineDocumentText, HiOutlineExternalLink,
} from 'react-icons/hi';
import {
  getSurveysApi, getSurveyApi, createSurveyApi, updateSurveyApi, publishSurveyApi, archiveSurveyApi,
} from '../../api/csat.api';
import QuestionEditor from './components/QuestionEditor';
import SurveyPreview from './components/SurveyPreview';

const TABS = [
  { key: 'draft',     label: 'Drafts' },
  { key: 'published', label: 'Published' },
  { key: 'archived',  label: 'Archived' },
];

const QUESTION_TYPE_LABELS = {
  text: 'Short Text', paragraph: 'Paragraph', radio: 'Radio',
  select: 'Select', checkbox: 'Checkbox', rating: 'Rating',
};

let _localIdCounter = 0;

const parseOptions = (options) => {
  if (Array.isArray(options)) return options;
  if (typeof options === 'string') {
    try { return JSON.parse(options); } catch { return []; }
  }
  return [];
};

const newQuestion = () => ({
  _localId: ++_localIdCounter,
  questionText: '', helperText: '', questionType: 'text',
  options: [], minValue: 5, maxValue: 5, minLabel: '', maxLabel: '',
  isRequired: false, orderIndex: 0,
});

const STATUS_PILL = {
  draft:     'bg-amber-50 text-amber-700 border border-amber-200',
  published: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  archived:  'bg-gray-100 text-gray-500 border border-gray-200',
};

export default function SurveyBuilderPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('draft');
  const [surveys, setSurveys] = useState([]);
  const [loadingList, setLoadingList] = useState(true);

  const [editing, setEditing] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const fetchSurveys = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await getSurveysApi({ status: activeTab, limit: 50 });
      setSurveys(res.data.data);
    } catch {
      toast.error('Failed to load surveys');
    } finally {
      setLoadingList(false);
    }
  }, [activeTab]);

  useEffect(() => { if (!editing) fetchSurveys(); }, [fetchSurveys, editing]);

  const openNew = () => {
    setEditing({ name: '', description: '', thankYouMessage: '', status: 'draft' });
    setQuestions([newQuestion()]);
    setShowPreview(false);
  };

  const openExisting = async (survey) => {
    try {
      const res = await getSurveyApi(survey._id);
      const s = res.data.data;
      setEditing(s);
      const qs = (s.questions || []).map((q) => ({ ...q, _localId: ++_localIdCounter, options: parseOptions(q.options) }));
      setQuestions(qs.length ? qs : [newQuestion()]);
      setShowPreview(false);
    } catch {
      toast.error('Failed to load survey');
    }
  };

  const addQuestion = () => setQuestions((prev) => [...prev, newQuestion()]);

  const updateQuestion = (localId, updated) =>
    setQuestions((prev) => prev.map((q) => (q._localId === localId ? { ...updated, _localId: localId } : q)));

  const removeQuestion = (localId) =>
    setQuestions((prev) => prev.filter((q) => q._localId !== localId));

  const moveQuestion = (localId, dir) => {
    setQuestions((prev) => {
      const idx = prev.findIndex((q) => q._localId === localId);
      if (idx < 0) return prev;
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next.map((q, i) => ({ ...q, orderIndex: i }));
    });
  };

  const buildPayload = () => ({
    name: editing.name,
    description: editing.description,
    thankYouMessage: editing.thankYouMessage,
    questions: questions.map((q, idx) => ({
      questionText: q.questionText,
      helperText: q.helperText || null,
      questionType: q.questionType,
      options: ['radio', 'select', 'checkbox'].includes(q.questionType) ? q.options.filter(Boolean) : null,
      minValue: q.questionType === 'rating' ? (q.minValue ?? 1) : null,
      maxValue: q.questionType === 'rating' ? (q.maxValue ?? 5) : null,
      minLabel: q.questionType === 'rating' ? (q.minLabel || null) : null,
      maxLabel: q.questionType === 'rating' ? (q.maxLabel || null) : null,
      isRequired: !!q.isRequired,
      orderIndex: idx,
    })),
  });

  const handleSave = async () => {
    if (!editing.name.trim()) { toast.error('Survey name is required'); return; }
    const emptyQ = questions.find((q) => !q.questionText.trim());
    if (emptyQ) { toast.error('All questions must have text'); return; }

    setSaving(true);
    try {
      const payload = buildPayload();
      if (editing._id) {
        const res = await updateSurveyApi(editing._id, payload);
        setEditing(res.data.data);
        const qs = (res.data.data.questions || []).map((q) => ({ ...q, _localId: ++_localIdCounter, options: parseOptions(q.options) }));
        setQuestions(qs);
        toast.success('Survey saved');
      } else {
        const res = await createSurveyApi(payload);
        setEditing(res.data.data);
        const qs = (res.data.data.questions || []).map((q) => ({ ...q, _localId: ++_localIdCounter, options: parseOptions(q.options) }));
        setQuestions(qs);
        toast.success('Survey created');
      }
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!editing._id) return;
    if (!window.confirm(`Archive "${editing.name}"? It will no longer be dispatchable.`)) return;
    setArchiving(true);
    try {
      await archiveSurveyApi(editing._id);
      toast.success('Survey archived');
      setEditing(null);
      setActiveTab('archived');
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Archive failed');
    } finally {
      setArchiving(false);
    }
  };

  const handlePublish = async () => {
    if (!editing._id) { toast.error('Save the survey first'); return; }
    setPublishing(true);
    try {
      await publishSurveyApi(editing._id);
      toast.success('Survey published — it can now be dispatched');
      setEditing(null);
      setActiveTab('published');
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Publish failed');
    } finally {
      setPublishing(false);
    }
  };

  // ── Builder view ───────────────────────────────────────────────────────────────
  if (editing !== null) {
    return (
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-4 flex-wrap bg-white border border-gray-200 rounded-2xl px-5 py-3.5 shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setEditing(null)}
              className="text-sm text-gray-400 hover:text-gray-700 font-medium flex items-center gap-1.5 transition-colors flex-shrink-0"
            >
              ← Surveys
            </button>
            <span className="text-gray-300">/</span>
            <h1 className="text-base font-bold text-gray-900 truncate">
              {editing._id ? editing.name || 'Untitled' : 'New Survey'}
            </h1>
            {editing.status && (
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full flex-shrink-0 ${STATUS_PILL[editing.status]}`}>
                {editing.status}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setShowPreview((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-xl border font-medium transition-all ${
                showPreview
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <HiOutlineEye className="w-4 h-4" />
              Preview
            </button>
            {editing._id && (
              <button
                onClick={() => window.open(`/csat/surveys/${editing._id}/preview`, '_blank')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-xl border border-gray-200 text-gray-600 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 font-medium transition-all"
                title="Open full-page preview as client will see it"
              >
                <HiOutlineExternalLink className="w-4 h-4" />
                Open Preview
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 text-sm bg-gray-800 text-white rounded-xl hover:bg-gray-900 disabled:opacity-50 font-semibold transition-colors"
            >
              {saving ? 'Saving...' : 'Save Draft'}
            </button>
            {editing.status === 'draft' && (
              <button
                onClick={handlePublish}
                disabled={publishing || !editing._id}
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 font-semibold transition-colors shadow-sm shadow-emerald-100"
                title={!editing._id ? 'Save first' : ''}
              >
                <HiOutlineCheckCircle className="w-4 h-4" />
                {publishing ? 'Publishing...' : 'Publish'}
              </button>
            )}
            {editing._id && editing.status !== 'archived' && (
              <button
                onClick={handleArchive}
                disabled={archiving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 text-gray-500 rounded-xl hover:bg-red-50 hover:border-red-200 hover:text-red-600 disabled:opacity-50 transition-all"
              >
                <HiOutlineArchive className="w-4 h-4" />
                {archiving ? '...' : 'Archive'}
              </button>
            )}
          </div>
        </div>

        <div className={`grid gap-6 ${showPreview ? 'grid-cols-2' : 'grid-cols-1 max-w-2xl mx-auto w-full'}`}>
          {/* Editor */}
          <div className="space-y-4">
            {/* Survey meta */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
              <input
                type="text"
                value={editing.name || ''}
                onChange={(e) => setEditing((s) => ({ ...s, name: e.target.value }))}
                placeholder="Survey name *"
                className="w-full border-0 border-b border-gray-200 pb-2 text-xl font-bold text-gray-900 focus:outline-none focus:border-emerald-500 placeholder:font-normal placeholder:text-gray-400 placeholder:text-base transition-colors"
              />
              <textarea
                value={editing.description || ''}
                onChange={(e) => setEditing((s) => ({ ...s, description: e.target.value }))}
                rows={2}
                placeholder="Description (shown to respondents at the top of the survey)"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none bg-gray-50 placeholder:text-gray-400"
              />
              <input
                type="text"
                value={editing.thankYouMessage || ''}
                onChange={(e) => setEditing((s) => ({ ...s, thankYouMessage: e.target.value }))}
                placeholder="Thank-you message shown after submission (optional)"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-gray-50 placeholder:text-gray-400"
              />
            </div>

            {/* Questions */}
            <div className="space-y-3">
              {questions.map((q, idx) => (
                <QuestionEditor
                  key={q._localId}
                  question={q}
                  index={idx}
                  total={questions.length}
                  onChange={(updated) => updateQuestion(q._localId, updated)}
                  onRemove={() => removeQuestion(q._localId)}
                  onMoveUp={() => moveQuestion(q._localId, -1)}
                  onMoveDown={() => moveQuestion(q._localId, 1)}
                />
              ))}

              <button
                type="button"
                onClick={addQuestion}
                className="w-full flex items-center justify-center gap-2 py-4 border-2 border-dashed border-gray-200 rounded-2xl text-sm text-gray-400 hover:border-emerald-400 hover:text-emerald-600 hover:bg-emerald-50/30 transition-all font-medium"
              >
                <HiOutlinePlus className="w-4 h-4" />
                Add question
              </button>
            </div>
          </div>

          {/* Preview */}
          {showPreview && (
            <div className="sticky top-6 h-fit">
              <SurveyPreview survey={editing} questions={questions} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Survey Builder</h1>
          <p className="text-sm text-gray-500 mt-1">Create and manage CSAT surveys</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-100 flex-shrink-0"
        >
          <HiOutlinePlus className="w-4 h-4" />
          New Survey
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${
              activeTab === tab.key
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-gray-400 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Survey list */}
      {loadingList ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : surveys.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-2xl">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <HiOutlineDocumentText className="w-7 h-7 text-gray-400" />
          </div>
          <p className="text-gray-700 font-semibold text-sm">No {activeTab} surveys</p>
          {activeTab === 'draft' && (
            <button onClick={openNew} className="mt-3 text-emerald-600 text-sm font-medium hover:underline">
              Create your first survey →
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {surveys.map((survey) => (
            <div
              key={survey._id}
              className="bg-white border border-gray-200 rounded-2xl px-5 py-4 flex items-start justify-between gap-4 hover:border-emerald-300 hover:shadow-sm transition-all cursor-pointer group"
              onClick={() => openExisting(survey)}
            >
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-50 transition-colors">
                  <HiOutlineDocumentText className="w-4 h-4 text-gray-400 group-hover:text-emerald-600 transition-colors" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="text-sm font-bold text-gray-900 truncate">{survey.name}</h3>
                    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full flex-shrink-0 ${STATUS_PILL[survey.status]}`}>
                      {survey.status}
                    </span>
                  </div>
                  {survey.description && (
                    <p className="text-xs text-gray-400 truncate">{survey.description}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); window.open(`/csat/surveys/${survey._id}/preview`, '_blank'); }}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-500 border border-gray-200 rounded-xl hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 transition-all"
                  title="Preview as client will see it"
                >
                  <HiOutlineExternalLink className="w-3.5 h-3.5" />
                  Preview
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); openExisting(survey); }}
                  className="px-3.5 py-1.5 text-xs font-semibold text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 group-hover:border-emerald-300 group-hover:text-emerald-700 transition-all"
                >
                  Open
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
