/**
 * PublicWidget.jsx
 * Embeddable public ticket submission widget (no auth required).
 * Route: /widget/:token
 *
 * Tab 1 — Submit Ticket: name, email, title, description, category → REQ confirmation
 * Tab 2 — Check Status: email input → list of tickets with status badges
 */
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const STATUS_COLORS = {
  open: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  pending: 'bg-purple-100 text-purple-700',
  resolved: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-gray-100 text-gray-600',
};

function Spinner() {
  return (
    <svg className="animate-spin h-5 w-5 text-blue-500 mx-auto" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

export default function PublicWidget() {
  const { token } = useParams();
  const [config, setConfig] = useState(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState(null);
  const [activeTab, setActiveTab] = useState('submit');

  // Submit Ticket form state
  const [form, setForm] = useState({ name: '', email: '', title: '', description: '', category: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null); // { reqNumber }
  const [submitError, setSubmitError] = useState(null);

  // Check Status state
  const [statusEmail, setStatusEmail] = useState('');
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusTickets, setStatusTickets] = useState(null);
  const [statusError, setStatusError] = useState(null);

  // Load widget config
  useEffect(() => {
    setConfigLoading(true);
    axios.get(`${API_URL}/helpdesk/widget/${token}/config`)
      .then(res => setConfig(res.data?.data || res.data))
      .catch(err => {
        const msg = err?.response?.data?.error?.message;
        setConfigError(msg === 'Token not found' ? 'This support widget link is invalid or has been disabled.' : 'Failed to load widget configuration.');
      })
      .finally(() => setConfigLoading(false));
  }, [token]);

  const handleChange = (key, val) => {
    setForm(f => ({ ...f, [key]: val }));
    setSubmitError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.title.trim()) {
      setSubmitError('Name, email, and title are required.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await axios.post(`${API_URL}/helpdesk/widget/${token}/tickets`, form);
      const ticket = res.data?.data || res.data;
      setSubmitted({ reqNumber: ticket?.reqNumber || ticket?._id || 'N/A' });
    } catch (err) {
      setSubmitError(err?.response?.data?.error?.message || 'Failed to submit ticket. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckStatus = useCallback(async () => {
    if (!statusEmail.trim()) { setStatusError('Please enter your email address.'); return; }
    setStatusLoading(true);
    setStatusError(null);
    setStatusTickets(null);
    try {
      const res = await axios.get(`${API_URL}/helpdesk/widget/${token}/tickets`, { params: { email: statusEmail } });
      setStatusTickets(res.data?.data || []);
    } catch (err) {
      setStatusError(err?.response?.data?.error?.message || 'Failed to fetch tickets. Please try again.');
    } finally {
      setStatusLoading(false); }
  }, [token, statusEmail]);

  const handleNewTicket = () => {
    setForm({ name: '', email: '', title: '', description: '', category: '' });
    setSubmitted(null);
    setSubmitError(null);
  };

  // --- Render ---
  if (configLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (configError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-red-200 shadow-sm max-w-md w-full p-10 text-center">
          <p className="text-lg font-semibold text-gray-700 mb-2">Widget Unavailable</p>
          <p className="text-sm text-gray-400">{configError}</p>
        </div>
      </div>
    );
  }

  const projectName = config?.name || config?.projectName || 'Support';

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center p-6 pt-12">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm max-w-lg w-full overflow-hidden">
        {/* Widget Header */}
        <div className="bg-blue-600 px-6 py-5 text-white">
          <h1 className="text-xl font-bold">{projectName}</h1>
          <p className="text-blue-100 text-sm mt-0.5">Support Portal</p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          {[['submit', 'Submit Ticket'], ['status', 'Check Status']].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px
                ${activeTab === id ? 'text-blue-700 border-blue-600' : 'text-gray-500 border-transparent hover:text-gray-700'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* Submit Ticket Tab */}
          {activeTab === 'submit' && (
            submitted ? (
              <div className="text-center py-6 space-y-4">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-50 mb-2">
                  <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-gray-900">Ticket Submitted!</h2>
                <p className="text-sm text-gray-600">Your support request has been received. Our team will get back to you shortly.</p>
                <div className="bg-gray-50 rounded-xl border border-gray-200 px-5 py-3 inline-block">
                  <p className="text-xs text-gray-500">Your ticket reference number</p>
                  <p className="font-mono font-bold text-blue-700 text-lg">{submitted.reqNumber}</p>
                </div>
                <p className="text-xs text-gray-400">Save this number to track your ticket status</p>
                <button
                  onClick={handleNewTicket}
                  className="mt-2 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  Submit Another Ticket
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Your Name *</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={e => handleChange('name', e.target.value)}
                      placeholder="Full name"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Email Address *</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={e => handleChange('email', e.target.value)}
                      placeholder="your@email.com"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Subject *</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={e => handleChange('title', e.target.value)}
                    placeholder="Brief description of your issue"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                  <input
                    type="text"
                    value={form.category}
                    onChange={e => handleChange('category', e.target.value)}
                    placeholder="e.g. IT, HR, Finance (optional)"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                  <textarea
                    rows={4}
                    value={form.description}
                    onChange={e => handleChange('description', e.target.value)}
                    placeholder="Describe your issue in detail..."
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>

                {submitError && (
                  <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100">{submitError}</p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {submitting ? <><Spinner /> Submitting...</> : 'Submit Ticket'}
                </button>
              </form>
            )
          )}

          {/* Check Status Tab */}
          {activeTab === 'status' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Enter the email address you used when submitting the ticket to see its status.</p>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={statusEmail}
                  onChange={e => { setStatusEmail(e.target.value); setStatusError(null); }}
                  onKeyDown={e => { if (e.key === 'Enter') handleCheckStatus(); }}
                  placeholder="your@email.com"
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleCheckStatus}
                  disabled={statusLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {statusLoading ? 'Searching...' : 'Search'}
                </button>
              </div>

              {statusError && (
                <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100">{statusError}</p>
              )}

              {statusLoading && (
                <div className="py-8"><Spinner /></div>
              )}

              {statusTickets !== null && !statusLoading && (
                statusTickets.length === 0 ? (
                  <div className="py-8 text-center text-gray-400 text-sm">
                    No tickets found for this email address.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-gray-500">{statusTickets.length} ticket{statusTickets.length !== 1 ? 's' : ''} found</p>
                    {statusTickets.map(t => (
                      <div key={t.id} className="border border-gray-200 rounded-xl p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-mono text-gray-400 mb-0.5">{t.reqNumber || `#${String(t.id).slice(-6)}`}</p>
                            <p className="text-sm font-medium text-gray-900">{t.title}</p>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize flex-shrink-0 ${STATUS_COLORS[t.status] || 'bg-gray-100 text-gray-700'}`}>
                            {t.status?.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-2">
                          Submitted {t.created_at ? new Date(t.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-gray-100 text-center">
          <p className="text-xs text-gray-400">Powered by PLI Portal Helpdesk</p>
        </div>
      </div>
    </div>
  );
}
