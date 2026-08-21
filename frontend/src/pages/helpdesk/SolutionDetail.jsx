/**
 * SolutionDetail.jsx
 * Full-page view for a single knowledge base article.
 * Layout matches the original helpdesk SolutionDetail:
 *   - Title + category breadcrumb in the top bar (next to back button)
 *   - Share and Print icon buttons on the right of the top bar
 *   - Edit / Delete buttons for managers (PLI-specific, keeps API calls)
 *   - 2-column grid: main content card (left) | Article Info + Related Articles sidebar (right)
 *   - "Was this article helpful?" section with Yes (ThumbsUp) and No (ThumbsDown) buttons
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import toast from 'react-hot-toast';
import {
  getSolutionByIdApi,
  updateSolutionApi,
  deleteSolutionApi,
} from '../../api/helpdesk/solutions.api';
import {
  fetchSolutions,
  selectSolutions,
} from '../../store/helpdeskSlice';
import api from '../../api/axios';
import {
  HiOutlineArrowLeft,
  HiOutlineThumbUp,
  HiOutlineThumbDown,
  HiOutlineShare,
  HiOutlinePrinter,
  HiOutlinePencil,
  HiOutlineTrash,
  HiOutlineCheck,
  HiOutlineX,
  HiOutlineLightBulb,
  HiOutlineFolder,
  HiOutlineEye,
  HiOutlineCalendar,
} from 'react-icons/hi';

const EDIT_ROLES   = ['admin', 'manager', 'senior_manager'];
const DELETE_ROLES = ['admin', 'manager'];

export default function SolutionDetail() {
  const { id }    = useParams();
  const navigate  = useNavigate();
  const dispatch  = useDispatch();
  const user      = useSelector(s => s.auth.user);
  const solutions = useSelector(selectSolutions);

  const [solution, setSolution] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Helpful state
  const [helpfulCount, setHelpfulCount]     = useState(0);
  const [helpfulVoted, setHelpfulVoted]     = useState(false);
  const [helpfulLoading, setHelpfulLoading] = useState(false);

  // Edit state
  const [editing, setEditing]   = useState(false);
  const [editForm, setEditForm] = useState({ title: '', content: '' });
  const [saving, setSaving]     = useState(false);

  // Delete state
  const [deleting, setDeleting] = useState(false);

  const canEdit   = EDIT_ROLES.includes(user?.role);
  const canDelete = DELETE_ROLES.includes(user?.role);

  /* ── Fetch article ── */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);

    getSolutionByIdApi(id)
      .then(res => {
        if (cancelled) return;
        const data = res.data?.data || res.data;
        if (!data) { setNotFound(true); return; }
        setSolution(data);
        setHelpfulCount(data.helpful ?? data.helpfulCount ?? 0);
        setEditForm({ title: data.title || '', content: data.content || '' });
      })
      .catch(err => {
        if (cancelled) return;
        if (err?.response?.status === 404) {
          setNotFound(true);
        } else {
          toast.error('Failed to load article');
          setNotFound(true);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [id]);

  /* Ensure related-articles list is populated in the store */
  useEffect(() => {
    if (solutions.length === 0) dispatch(fetchSolutions());
  }, [dispatch, solutions.length]);

  /* ── Helpful ── */
  const handleHelpful = async () => {
    if (helpfulVoted || helpfulLoading) return;
    setHelpfulLoading(true);
    try {
      await api.post(`/helpdesk/solutions/${id}/helpful`);
      setHelpfulCount(c => c + 1);
      setHelpfulVoted(true);
      toast.success('Thanks for your feedback!');
    } catch {
      toast.error('Could not record your vote');
    } finally {
      setHelpfulLoading(false);
    }
  };

  /* ── Share (copy link) ── */
  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success('Link copied to clipboard');
    } catch {
      toast.error('Could not copy link');
    }
  };

  /* ── Print ── */
  const handlePrint = () => window.print();

  /* ── Save edit ── */
  const handleSaveEdit = async () => {
    if (!editForm.title.trim() || !editForm.content.trim()) {
      toast.error('Title and content are required');
      return;
    }
    setSaving(true);
    try {
      const res = await updateSolutionApi(id, {
        title:   editForm.title,
        content: editForm.content,
      });
      const updated = res.data?.data || res.data;
      setSolution(prev => ({ ...prev, ...updated, title: editForm.title, content: editForm.content }));
      setEditing(false);
      toast.success('Article updated');
    } catch (err) {
      toast.error(err?.response?.data?.error?.message || 'Failed to update article');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditForm({ title: solution.title || '', content: solution.content || '' });
    setEditing(false);
  };

  /* ── Delete ── */
  const handleDelete = async () => {
    if (!window.confirm('Delete this article? This action cannot be undone.')) return;
    setDeleting(true);
    try {
      await deleteSolutionApi(id);
      toast.success('Article deleted');
      navigate('/helpdesk/knowledge-base');
    } catch (err) {
      toast.error(err?.response?.data?.error?.message || 'Failed to delete article');
      setDeleting(false);
    }
  };

  /* ── Loading skeleton ── */
  if (loading) {
    return (
      <div className="-mx-6 -mt-6 bg-[#f5f5f5] p-6">
        <div className="max-w-5xl mx-auto space-y-5 animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3" />
          <div className="bg-white rounded-lg border border-gray-200 p-8 space-y-4">
            <div className="h-6 bg-gray-200 rounded w-2/3" />
            <div className="space-y-2 pt-4">
              <div className="h-4 bg-gray-100 rounded w-full" />
              <div className="h-4 bg-gray-100 rounded w-5/6" />
              <div className="h-4 bg-gray-100 rounded w-4/5" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Not found ── */
  if (notFound || !solution) {
    return (
      <div className="h-full flex items-center justify-center bg-[#f5f5f5]">
        <div className="text-center">
          <HiOutlineLightBulb className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-lg font-medium text-gray-800 mb-2">Solution not found</h2>
          <button
            onClick={() => navigate('/helpdesk/knowledge-base')}
            className="mt-4 text-blue-600 hover:underline"
          >
            Back to Solutions
          </button>
        </div>
      </div>
    );
  }

  /* ── Article render ── */
  const createdDate = solution.created_at
    ? new Date(solution.created_at).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
      })
    : solution.createdAt || '—';

  const relatedArticles = solutions
    .filter(s => String(s.id) !== String(id) && s.category === solution.category)
    .slice(0, 3);

  return (
    <div className="-mx-6 -mt-6 bg-[#f5f5f5] p-6">
      <div className="max-w-5xl mx-auto">

        {/* ── Top bar: back · title · actions ── */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            {/* Back button — icon only */}
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-gray-200 rounded-lg"
            >
              <HiOutlineArrowLeft className="w-5 h-5" />
            </button>

            {/* Category breadcrumb + title */}
            {!editing && (
              <div>
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                  <span>{solution.category}</span>
                </div>
                <h1 className="text-2xl font-bold">{solution.title}</h1>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Share */}
            <button
              onClick={handleShare}
              className="flex items-center gap-2 p-2 hover:bg-gray-200 rounded-lg"
              title="Share"
            >
              <HiOutlineShare className="w-5 h-5 text-gray-600" />
            </button>

            {/* Print */}
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 p-2 hover:bg-gray-200 rounded-lg"
              title="Print"
            >
              <HiOutlinePrinter className="w-5 h-5 text-gray-600" />
            </button>

            {/* Edit (admin / manager / senior_manager) */}
            {canEdit && !editing && (
              <button
                onClick={() => setEditing(true)}
                title="Edit article"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-blue-600 border border-blue-200 hover:bg-blue-50 transition-colors"
              >
                <HiOutlinePencil className="w-4 h-4" />
                Edit
              </button>
            )}

            {/* Delete (admin / manager) */}
            {canDelete && !editing && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                title="Delete article"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-red-600 border border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                <HiOutlineTrash className="w-4 h-4" />
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            )}
          </div>
        </div>

        {/* ── 3-column grid: main (2 cols) + sidebar (1 col) ── */}
        <div className="grid grid-cols-3 gap-6">

          {/* Main column */}
          <div className="col-span-2">

            {/* Content card */}
            <div className="bg-white rounded-lg border border-gray-200 p-8">
              {editing ? (
                /* Edit mode */
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                    <input
                      type="text"
                      value={editForm.title}
                      onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
                    <textarea
                      rows={14}
                      value={editForm.content}
                      onChange={e => setEditForm(f => ({ ...f, content: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={handleSaveEdit}
                      disabled={saving}
                      className="flex items-center gap-1.5 px-4 py-2 bg-[#2196f3] text-white rounded-lg text-sm font-medium hover:bg-[#1976d2] disabled:opacity-50 transition-colors"
                    >
                      <HiOutlineCheck className="w-4 h-4" />
                      {saving ? 'Saving…' : 'Save Changes'}
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                    >
                      <HiOutlineX className="w-4 h-4" />
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* View mode — article body only */
                <div className="prose max-w-none">
                  <div className="whitespace-pre-line text-gray-700 leading-relaxed">
                    {solution.content}
                  </div>
                </div>
              )}
            </div>

            {/* Helpful feedback */}
            {!editing && (
              <div className="bg-white rounded-lg border border-gray-200 p-6 mt-6">
                <h3 className="text-lg font-semibold mb-4">Was this article helpful?</h3>
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleHelpful}
                    disabled={helpfulVoted || helpfulLoading}
                    className="flex items-center gap-2 px-6 py-3 border border-gray-300 rounded-lg hover:bg-green-50 hover:border-green-300 transition-colors disabled:opacity-60"
                  >
                    <HiOutlineThumbUp className="w-5 h-5 text-green-600" />
                    <span>
                      {helpfulVoted ? 'Thanks!' : `Yes (${helpfulCount})`}
                    </span>
                  </button>
                  <button className="flex items-center gap-2 px-6 py-3 border border-gray-300 rounded-lg hover:bg-red-50 hover:border-red-300 transition-colors">
                    <HiOutlineThumbDown className="w-5 h-5 text-red-600" />
                    <span>No</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">

            {/* Article Info */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold mb-4">Article Info</h3>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <HiOutlineFolder className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Category</p>
                    <p className="font-medium">{solution.category}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <HiOutlineEye className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Views</p>
                    <p className="font-medium">{solution.views || 0}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <HiOutlineCalendar className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Created</p>
                    <p className="font-medium">{createdDate}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Related Articles */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold mb-4">Related Articles</h3>
              {relatedArticles.length === 0 ? (
                <p className="text-sm text-gray-500">No related articles</p>
              ) : (
                <div className="space-y-3">
                  {relatedArticles.map(s => (
                    <button
                      key={s.id}
                      onClick={() => navigate(`/helpdesk/solutions/${s.id}`)}
                      className="w-full text-left p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      <p className="text-sm font-medium text-blue-600">{s.title}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
