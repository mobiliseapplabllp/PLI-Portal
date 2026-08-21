/**
 * HdAnnouncements.jsx
 * Helpdesk announcements list page.
 * Cards show title, body, and expiry date.
 * Admin/managers can create new announcements.
 * Expired announcements are displayed in a muted style.
 */
import { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import toast from 'react-hot-toast';
import {
  fetchAnnouncements,
  selectAnnouncements,
} from '../../store/helpdeskSlice';
import api from '../../api/axios';
import { HiOutlineSpeakerphone, HiOutlinePlus, HiOutlineX } from 'react-icons/hi';

const ADMIN_ROLES = ['admin', 'manager', 'senior_manager'];

function isExpired(date) {
  if (!date) return false;
  return new Date(date) < new Date();
}

export default function HdAnnouncements() {
  const dispatch = useDispatch();
  const announcements = useSelector(selectAnnouncements);
  const announcementsLoading = useSelector(s => s.helpdesk.announcementsLoading);
  const { user } = useSelector(s => s.auth);

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', expiresAt: '' });

  useEffect(() => { dispatch(fetchAnnouncements()); }, [dispatch]);

  const canManage = ADMIN_ROLES.includes(user?.role);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim()) {
      toast.error('Title and body are required');
      return;
    }
    setSaving(true);
    try {
      await api.post('/helpdesk/announcements', form);
      toast.success('Announcement created');
      dispatch(fetchAnnouncements());
      setShowForm(false);
      setForm({ title: '', body: '', expiresAt: '' });
    } catch (err) {
      toast.error(err?.response?.data?.error?.message || 'Failed to create announcement');
    } finally { setSaving(false); }
  };

  const active = announcements.filter(a => !isExpired(a.expiresAt));
  const expired = announcements.filter(a => isExpired(a.expiresAt));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Announcements</h1>
          <p className="text-sm text-gray-500 mt-1">{active.length} active, {expired.length} expired</p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowForm(f => !f)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            {showForm ? <HiOutlineX className="w-4 h-4" /> : <HiOutlinePlus className="w-4 h-4" />}
            {showForm ? 'Cancel' : 'New Announcement'}
          </button>
        )}
      </div>

      {/* Create Form */}
      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl border border-blue-200 p-5 space-y-4">
          <h3 className="font-semibold text-gray-900">Create Announcement</h3>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Announcement title..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Body *</label>
            <textarea
              rows={4}
              value={form.body}
              onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              placeholder="Announcement body text..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Expires At (optional)</label>
            <input
              type="datetime-local"
              value={form.expiresAt}
              onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? 'Saving...' : 'Publish'}
            </button>
          </div>
        </form>
      )}

      {/* Loading */}
      {announcementsLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-3" />
              <div className="h-3 bg-gray-100 rounded w-full" />
              <div className="h-3 bg-gray-100 rounded w-4/5 mt-2" />
            </div>
          ))}
        </div>
      ) : announcements.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <HiOutlineSpeakerphone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No announcements yet</p>
          {canManage && <button onClick={() => setShowForm(true)} className="mt-3 text-sm text-blue-600 hover:underline">Create the first announcement</button>}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Active */}
          {active.map(a => (
            <div key={a.id || a.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <HiOutlineSpeakerphone className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                  <h3 className="font-semibold text-gray-900">{a.title}</h3>
                </div>
                {a.expiresAt && (
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    Expires {new Date(a.expiresAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-600 mt-2 leading-relaxed">{a.body}</p>
              <p className="text-xs text-gray-400 mt-3">
                Posted {a.created_at ? new Date(a.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
              </p>
            </div>
          ))}

          {/* Expired */}
          {expired.length > 0 && (
            <>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider pt-2">Expired Announcements</p>
              {expired.map(a => (
                <div key={a.id || a.id} className="bg-gray-50 rounded-xl border border-gray-200 p-5 opacity-60">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <HiOutlineSpeakerphone className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                      <h3 className="font-medium text-gray-600">{a.title}</h3>
                    </div>
                    <span className="text-xs text-red-400 flex-shrink-0">
                      Expired {a.expiresAt ? new Date(a.expiresAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-2 leading-relaxed">{a.body}</p>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
