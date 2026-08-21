/**
 * KnowledgeBase.jsx
 * Knowledge base article browser. Layout matches the original helpdesk Solutions page:
 * white header bar (title, search, category pills, New Article button) above a
 * gray content area with a 2-column article card grid.
 * All logged-in users can create articles.
 */
import { useEffect, useState, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  fetchSolutions,
  selectSolutions,
} from '../../store/helpdeskSlice';
import {
  createSolutionApi,
} from '../../api/helpdesk/solutions.api';
import {
  HiOutlineSearch,
  HiOutlinePlus,
  HiOutlineChevronRight,
  HiOutlineLightBulb,
  HiOutlineEye,
  HiOutlineThumbUp,
} from 'react-icons/hi';

const categories = ['All', 'Hardware', 'Software', 'Network', 'General', 'Security'];

export default function KnowledgeBase() {
  const dispatch  = useDispatch();
  const navigate  = useNavigate();
  const solutions = useSelector(selectSolutions);
  const solutionsLoading = useSelector(s => s.helpdesk.solutionsLoading);
  const user = useSelector(s => s.auth.user);

  const [search, setSearch]               = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [showForm, setShowForm]           = useState(false);
  const [saving, setSaving]               = useState(false);
  const [form, setForm]                   = useState({ title: '', category: 'General', content: '' });

  useEffect(() => { dispatch(fetchSolutions()); }, [dispatch]);

  const filtered = useMemo(() => {
    return solutions.filter(s => {
      const matchSearch =
        !search ||
        s.title?.toLowerCase().includes(search.toLowerCase()) ||
        s.content?.toLowerCase().includes(search.toLowerCase());
      const matchCat = categoryFilter === 'All' || s.category === categoryFilter;
      return matchSearch && matchCat;
    });
  }, [solutions, search, categoryFilter]);

  const handleCreateArticle = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim()) {
      toast.error('Title and content are required');
      return;
    }
    setSaving(true);
    try {
      await createSolutionApi({
        ...form,
        author: user?.name || user?.fullName || 'User',
      });
      toast.success('Article created');
      dispatch(fetchSolutions());
      setShowForm(false);
      setForm({ title: '', category: 'General', content: '' });
    } catch (err) {
      toast.error(err?.response?.data?.error?.message || 'Failed to create article');
    } finally {
      setSaving(false);
    }
  };

  return (
    /* Break out of AppLayout's p-6 so the header bar runs edge-to-edge */
    <div className="-mx-6 -mt-6 flex flex-col bg-[#f5f5f5]" style={{ minHeight: 'calc(100% + 24px)' }}>

      {/* ── White header bar ── */}
      <div className="bg-white border-b border-gray-200">

        {/* Title row */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold text-gray-800">Solutions</h1>
            <span className="text-sm text-gray-500">({solutions.length} articles)</span>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#2196f3] text-white rounded-lg hover:bg-[#1976d2] text-sm font-medium"
          >
            <HiOutlinePlus className="w-4 h-4" />
            New Article
          </button>
        </div>

        {/* Search + category pills row */}
        <div className="flex items-center gap-3 px-4 py-2 border-t border-gray-100">
          <div className="relative flex-1 max-w-md">
            <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search solutions..."
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 rounded-lg text-sm ${
                  categoryFilter === cat
                    ? 'bg-[#2196f3] text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Scrollable content area ── */}
      <div className="flex-1 overflow-auto p-4">

        {/* New Article Form */}
        {showForm && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-4 max-w-2xl">
            <h3 className="font-semibold mb-4">New Solution Article</h3>
            <form onSubmit={handleCreateArticle} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Enter article title"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  {categories.filter(c => c !== 'All').map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm(f => ({ ...f, content: e.target.value }))}
                  placeholder="Write the solution content..."
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-[#2196f3] text-white rounded-lg text-sm disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Publish'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Loading skeleton */}
        {solutionsLoading ? (
          <div className="grid grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white rounded-lg border border-gray-200 p-5 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
                <div className="h-3 bg-gray-100 rounded w-1/3 mb-3" />
                <div className="h-3 bg-gray-100 rounded w-full" />
                <div className="h-3 bg-gray-100 rounded w-4/5 mt-2" />
              </div>
            ))}
          </div>

        ) : solutions.length === 0 && !showForm ? (
          /* Onboarding empty state — no articles at all */
          <div className="flex flex-col items-center justify-center h-full bg-white rounded-lg border border-gray-200 p-12">
            <HiOutlineLightBulb className="w-16 h-16 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-800 mb-2">No Solutions Yet</h3>
            <p className="text-gray-500 text-sm mb-6 text-center max-w-md">
              Create knowledge base articles to help users find solutions quickly.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-6 py-3 bg-[#2196f3] text-white rounded-lg hover:bg-[#1976d2] font-medium"
            >
              <HiOutlinePlus className="w-5 h-5" />
              Create First Article
            </button>
          </div>

        ) : filtered.length === 0 ? (
          /* Search / filter returned no results */
          <div className="flex flex-col items-center justify-center h-64 bg-white rounded-lg border border-gray-200">
            <HiOutlineSearch className="w-12 h-12 text-gray-300 mb-4" />
            <p className="text-gray-500">No solutions found</p>
          </div>

        ) : (
          /* Article grid — 2 columns */
          <div className="grid grid-cols-2 gap-4">
            {filtered.map(article => (
              <div
                key={article.id}
                onClick={() => navigate(`/helpdesk/solutions/${article.id}`)}
                className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md cursor-pointer transition-shadow"
              >
                {/* Category badge + chevron */}
                <div className="flex items-start justify-between mb-3">
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                    {article.category}
                  </span>
                  <HiOutlineChevronRight className="w-4 h-4 text-gray-400" />
                </div>

                {/* Title */}
                <h3 className="font-medium text-gray-800 mb-2 line-clamp-2">{article.title}</h3>

                {/* Excerpt */}
                <p className="text-sm text-gray-500 line-clamp-3 mb-4">{article.content}</p>

                {/* Footer: views · helpful · date */}
                <div className="flex items-center justify-between text-sm text-gray-400 pt-3 border-t">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1">
                      <HiOutlineEye className="w-4 h-4" />
                      {article.views || 0}
                    </span>
                    <span className="flex items-center gap-1">
                      <HiOutlineThumbUp className="w-4 h-4" />
                      {article.helpful ?? article.helpfulCount ?? 0}
                    </span>
                  </div>
                  <span className="text-xs">
                    {article.created_at
                      ? new Date(article.created_at).toLocaleDateString('en-IN', {
                          day: '2-digit', month: 'short', year: 'numeric',
                        })
                      : article.createdAt || ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
