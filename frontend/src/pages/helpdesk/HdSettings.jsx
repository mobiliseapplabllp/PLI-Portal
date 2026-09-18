/**
 * HdSettings.jsx
 * Helpdesk Settings — sidebar + content panel layout matching original Setup.jsx.
 * Left nav: collapsible groups with active highlights.
 * Right panel: swaps content based on selected menu item.
 */
import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import PublicWidgetSettings from '../../components/helpdesk/PublicWidgetSettings';
import {
  getHdOptionsApi,
  createHdOptionApi,
  deleteHdOptionApi,
} from '../../api/helpdesk/helpdesk.api';
import {
  HiOutlineCog,
  HiOutlineCollection,
  HiOutlineMail,
  HiOutlineColorSwatch,
  HiOutlineLightningBolt,
  HiOutlineDatabase,
  HiOutlineLightBulb,
  HiOutlineChartPie,
  HiOutlineChevronDown,
  HiOutlineChevronRight,
  HiOutlinePlus,
  HiOutlineX,
  HiOutlineTrash,
  HiOutlineExternalLink,
} from 'react-icons/hi';

// ─── localStorage helpers ─────────────────────────────────────────────────────
const HD_STORE = 'pli_hd_settings';
function getHdSetting(key, fallback = null) {
  try {
    const raw = localStorage.getItem(`${HD_STORE}_${key}`);
    return raw !== null ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function saveHdSetting(key, value) {
  try { localStorage.setItem(`${HD_STORE}_${key}`, JSON.stringify(value)); } catch {}
}

// ─── Menu definition ──────────────────────────────────────────────────────────
const MENU_ITEMS = [
  { id: 'instance',     label: 'Instance Configuration', icon: HiOutlineCog },
  { id: 'widget',       label: 'Public widget',          icon: HiOutlineCollection },
  {
    id: 'mail', label: 'Mail Settings', icon: HiOutlineMail,
    items: [
      { id: 'mail-server',    label: 'Mail Server Settings' },
      { id: 'mail-filter',    label: 'Mail Filter' },
      { id: 'email-command',  label: 'Email Command' },
    ],
  },
  {
    id: 'customization', label: 'Customization', icon: HiOutlineColorSwatch,
    items: [
      { id: 'helpdesk',          label: 'Helpdesk' },
      { id: 'additional-fields', label: 'Additional Fields' },
      { id: 'checklists',        label: 'Checklists' },
      { id: 'announcement',      label: 'Announcement' },
    ],
  },
  { id: 'automation', label: 'Automation',       icon: HiOutlineLightningBolt },
  {
    id: 'data-admin', label: 'Data Administration', icon: HiOutlineDatabase, adminOnly: true,
    items: [
      { id: 'sites',  label: 'Sites' },
    ],
  },
  {
    id: 'general', label: 'General Settings', icon: HiOutlineCog,
    items: [
      { id: 'advanced-portal',  label: 'Advanced Portal Settings' },
      { id: 'requester-portal', label: 'Requester Portal' },
    ],
  },
  { id: 'zia',     label: 'Zia (AI Assistant)', icon: HiOutlineLightBulb },
  { id: 'reports', label: 'Reports',            icon: HiOutlineChartPie },
];

const OPTION_TABS = [
  { key: 'category',        label: 'Category' },
  { key: 'status',          label: 'Status',       readOnly: true },  // DB ENUM — cannot be changed via UI
  { key: 'level',           label: 'Level' },
  { key: 'mode',            label: 'Mode' },
  { key: 'impact',          label: 'Impact' },
  { key: 'urgency',         label: 'Urgency' },
  { key: 'priority',        label: 'Priority' },
  { key: 'priority_matrix', label: 'Priority Matrix' },
  { key: 'request_type',    label: 'Request Type' },
];

// ─── Shared: Placeholder ──────────────────────────────────────────────────────
function PlaceholderContent({ title }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-center">
      <HiOutlineCog className="w-12 h-12 text-gray-300 mx-auto mb-4" />
      <p className="text-gray-400 text-sm">{title} — Coming soon</p>
    </div>
  );
}

// ─── Section: Instance Configuration ─────────────────────────────────────────
function InstanceSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Instance Configuration</h2>
        <p className="text-sm text-gray-500 mt-1">Current environment details for this PLI Portal helpdesk instance.</p>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100 text-sm">
        {[
          ['Environment',   'UAT (pli_portal_uat)'],
          ['Backend Port',  '5105'],
          ['Version',       'PLI Portal Helpdesk v1.0'],
          ['Database',      'MySQL 8 · pli_portal_uat'],
          ['Auth',          'JWT (PLI Portal users)'],
        ].map(([k, v]) => (
          <div key={k} className="flex items-center px-5 py-3 gap-4">
            <span className="w-40 text-gray-500 shrink-0">{k}</span>
            <span className="text-gray-800 font-medium">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Section: Mail Server Settings (localStorage) ────────────────────────────
function MailServerSettings() {
  const [form, setForm] = useState(() => getHdSetting('mail_server', {
    host: '', port: '587', user: '', pass: '', from: '', secure: false,
  }));
  const [saved, setSaved] = useState(false);

  const handleSave = (e) => {
    e.preventDefault();
    saveHdSetting('mail_server', form);
    setSaved(true);
    toast.success('Mail server settings saved (local)');
    setTimeout(() => setSaved(false), 2000);
  };

  const field = (label, key, type = 'text', placeholder = '') => (
    <div key={key}>
      <label className="text-xs font-medium text-gray-600 block mb-1">{label}</label>
      <input type={type} value={form[key] || ''} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Mail Server Settings</h2>
        <p className="text-sm text-gray-500 mt-0.5">Outgoing SMTP configuration for helpdesk email notifications.</p>
      </div>
      <form onSubmit={handleSave} className="bg-white rounded-lg border border-gray-200 p-5 space-y-4 max-w-lg">
        {field('SMTP Host',      'host', 'text', 'mail.example.com')}
        {field('SMTP Port',      'port', 'text', '587')}
        {field('Username',       'user', 'text', 'noreply@example.com')}
        {field('Password',       'pass', 'password', '••••••••')}
        {field('From Address',   'from', 'text', 'Helpdesk <noreply@example.com>')}
        <div className="flex items-center gap-2">
          <input type="checkbox" checked={!!form.secure} onChange={e => setForm(f => ({ ...f, secure: e.target.checked }))}
            id="smtp-secure" className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
          <label htmlFor="smtp-secure" className="text-sm text-gray-700">Use SSL/TLS</label>
        </div>
        <button type="submit"
          className="px-5 py-2 bg-[#2196f3] text-white rounded-lg text-sm font-medium hover:bg-[#1976d2] transition-colors">
          {saved ? '✓ Saved' : 'Save Settings'}
        </button>
      </form>
      <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2 max-w-lg">
        ⚠️ Settings are stored locally in this browser. Configure SMTP in the backend <code>.env</code> file for production use.
      </p>
    </div>
  );
}

// ─── Section: Mail Filter ────────────────────────────────────────────────────
function MailFilterSettings() {
  const [rules, setRules] = useState(() => getHdSetting('mail_filter', []));
  const [newRule, setNewRule] = useState({ keyword: '', action: 'block' });

  const addRule = () => {
    if (!newRule.keyword.trim()) return;
    const updated = [...rules, { ...newRule, id: Date.now() }];
    setRules(updated);
    saveHdSetting('mail_filter', updated);
    setNewRule({ keyword: '', action: 'block' });
    toast.success('Rule added');
  };

  const removeRule = (id) => {
    const updated = rules.filter(r => r.id !== id);
    setRules(updated);
    saveHdSetting('mail_filter', updated);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Mail Filter</h2>
        <p className="text-sm text-gray-500 mt-0.5">Define keywords to automatically block or flag incoming emails.</p>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-5 max-w-lg space-y-4">
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="text-xs font-medium text-gray-600 block mb-1">Keyword / Pattern</label>
            <input value={newRule.keyword} onChange={e => setNewRule(r => ({ ...r, keyword: e.target.value }))}
              placeholder="e.g. unsubscribe"
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Action</label>
            <select value={newRule.action} onChange={e => setNewRule(r => ({ ...r, action: e.target.value }))}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="block">Block</option>
              <option value="flag">Flag</option>
              <option value="auto-close">Auto Close</option>
            </select>
          </div>
          <button onClick={addRule}
            className="px-3 py-1.5 bg-[#2196f3] text-white rounded-lg text-sm font-medium hover:bg-[#1976d2] transition-colors">
            Add
          </button>
        </div>
        {rules.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No filter rules yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2 text-left">Keyword</th>
                <th className="px-3 py-2 text-left">Action</th>
                <th className="px-3 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rules.map(r => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-mono text-gray-800">{r.keyword}</td>
                  <td className="px-3 py-2 text-gray-600 capitalize">{r.action}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => removeRule(r.id)} className="text-red-500 hover:text-red-700">
                      <HiOutlineTrash className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Section: Helpdesk Customization (ticket field options) ──────────────────
function HelpdeskCustomization() {
  const [activeType, setActiveType] = useState('category');
  const [items,       setItems]     = useState([]);
  const [loading,     setLoading]   = useState(false);
  const [showAdd,     setShowAdd]   = useState(false);
  const [newName,     setNewName]   = useState('');
  const [newDesc,     setNewDesc]   = useState('');
  const [saving,      setSaving]    = useState(false);
  const [deletingId,  setDeletingId] = useState(null);
  const [addError,    setAddError]  = useState('');

  const load = useCallback(async (type) => {
    if (type === 'priority_matrix') { setItems([]); return; }
    setLoading(true);
    setAddError('');
    try {
      const res = await getHdOptionsApi(type);
      const raw = res.data?.data;
      setItems(Array.isArray(raw) ? raw : []);
    } catch (err) {
      toast.error(err?.response?.data?.error?.message || 'Failed to load options');
      setItems([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { setShowAdd(false); setNewName(''); setNewDesc(''); load(activeType); }, [activeType, load]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setAddError('');
    setSaving(true);
    try {
      await createHdOptionApi({ type: activeType, name: newName.trim(), description: newDesc.trim() || null });
      toast.success('Option added');
      setNewName(''); setNewDesc(''); setShowAdd(false);
      await load(activeType);
    } catch (err) {
      setAddError(err?.response?.data?.error?.message || 'Failed to add option');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Remove option "${name}"?`)) return;
    setDeletingId(id);
    try {
      await deleteHdOptionApi(id);
      toast.success('Option removed');
      await load(activeType);
    } catch (err) {
      toast.error(err?.response?.data?.error?.message || 'Failed to remove option');
    } finally { setDeletingId(null); }
  };

  const activeTab   = OPTION_TABS.find(t => t.key === activeType);
  const activeLabel = activeTab?.label || activeType;
  const isReadOnly  = !!activeTab?.readOnly;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Helpdesk Customization</h2>
        <p className="text-sm text-gray-500 mt-0.5">Manage dropdown options available on ticket forms.</p>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {/* Tab strip */}
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {OPTION_TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveType(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeType === tab.key ? 'text-[#2196f3] border-[#2196f3]' : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}>
              {tab.label}
              {tab.readOnly && <span className="ml-1 text-[9px] text-gray-400 font-normal">(fixed)</span>}
            </button>
          ))}
        </div>

        {activeType === 'priority_matrix' ? (
          <div className="p-6">
            <p className="text-sm text-gray-500 mb-4">Priority is determined by the intersection of Impact and Urgency.</p>
            <table className="text-xs border border-gray-200">
              <thead>
                <tr>
                  <th className="px-3 py-2 bg-gray-50 border-b border-r border-gray-200 text-gray-500">Impact ↓ / Urgency →</th>
                  {['Low','Medium','High'].map(u => <th key={u} className="px-3 py-2 bg-gray-50 border-b border-r border-gray-200 text-gray-700">{u}</th>)}
                </tr>
              </thead>
              <tbody>
                {[['High','High','High','Medium'],['Medium','High','Medium','Low'],['Low','Medium','Low','Low']].map(([impact,...cells]) => (
                  <tr key={impact}>
                    <td className="px-3 py-2 bg-gray-50 border-r border-b border-gray-200 font-medium text-gray-700">{impact}</td>
                    {cells.map((v,i) => (
                      <td key={i} className={`px-3 py-2 border-r border-b border-gray-200 text-center font-semibold ${
                        v==='High'?'text-red-600':v==='Medium'?'text-orange-500':'text-emerald-600'}`}>{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-700">
                {activeLabel} options {!loading && `(${items.length})`}
                {isReadOnly && (
                  <span className="ml-2 text-xs text-amber-600 font-normal bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                    Read-only — defined by the database ENUM
                  </span>
                )}
              </span>
              {!isReadOnly && (
                <button onClick={() => setShowAdd(s => !s)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2196f3] text-white rounded-lg text-xs font-medium hover:bg-[#1976d2] transition-colors">
                  {showAdd ? <HiOutlineX className="w-3.5 h-3.5" /> : <HiOutlinePlus className="w-3.5 h-3.5" />}
                  {showAdd ? 'Cancel' : `Add ${activeLabel}`}
                </button>
              )}
            </div>

            {showAdd && (
              <form onSubmit={handleAdd} className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                {addError && <p className="text-xs text-red-600 mb-2">{addError}</p>}
                <div className="flex gap-3 flex-wrap items-end">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Name *</label>
                    <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                      placeholder={`${activeLabel} name`} required autoFocus
                      className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm w-40 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Description</label>
                    <input type="text" value={newDesc} onChange={e => setNewDesc(e.target.value)}
                      placeholder="Optional"
                      className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <button type="submit" disabled={saving || !newName.trim()}
                    className="px-4 py-1.5 bg-[#2196f3] text-white rounded-lg text-sm hover:bg-[#1976d2] disabled:opacity-50 transition-colors">
                    {saving ? 'Adding…' : 'Add'}
                  </button>
                </div>
              </form>
            )}

            {loading ? (
              <div className="py-8 text-center text-gray-400 text-sm">Loading…</div>
            ) : items.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-sm">No {activeLabel.toLowerCase()} options yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-2 text-left">Name</th>
                    <th className="px-4 py-2 text-left">Description</th>
                    <th className="px-4 py-2 w-12">Remove</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {items.map(item => {
                    const itemId = item._id || item.id;
                    return (
                      <tr key={itemId} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2 font-medium text-gray-900">
                          <span className="text-gray-400 mr-1.5">▸</span>{item.name}
                        </td>
                        <td className="px-4 py-2 text-gray-500">{item.description || '—'}</td>
                        <td className="px-4 py-2">
                          {isReadOnly ? (
                            <span className="text-xs text-gray-300">—</span>
                          ) : (
                            <button onClick={() => handleDelete(itemId, item.name)} disabled={deletingId === itemId}
                              className="text-red-500 hover:text-red-700 disabled:opacity-40">
                              {deletingId === itemId ? <span className="text-xs">…</span> : <HiOutlineTrash className="w-4 h-4" />}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Section: Simple option list (Teams or Sites) ────────────────────────────
function SimpleOptionSettings({ type, title, description }) {
  const [items,      setItems]      = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [newName,    setNewName]    = useState('');
  const [adding,     setAdding]     = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [addError,   setAddError]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getHdOptionsApi(type);
      const raw = res.data?.data;
      setItems(Array.isArray(raw) ? raw : []);
    } catch { setItems([]); }
    finally { setLoading(false); }
  }, [type]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setAddError('');
    setAdding(true);
    try {
      await createHdOptionApi({ type, name: newName.trim() });
      toast.success(`${title} added`);
      setNewName('');
      await load();
    } catch (err) {
      setAddError(err?.response?.data?.error?.message || `Failed to add ${title}`);
    } finally { setAdding(false); }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Remove "${name}"?`)) return;
    setDeletingId(id);
    try {
      await deleteHdOptionApi(id);
      toast.success('Removed');
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.error?.message || 'Failed to remove');
    } finally { setDeletingId(null); }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-800">{title}</h2>
        <p className="text-sm text-gray-500 mt-0.5">{description}</p>
      </div>
      <form onSubmit={handleAdd} className="flex gap-3 items-end max-w-md">
        <div className="flex-1">
          <label className="text-xs font-medium text-gray-600 block mb-1">{title} Name *</label>
          <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
            placeholder={`Add new ${title.toLowerCase()}…`} required
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {addError && <p className="text-xs text-red-600 mt-1">{addError}</p>}
        </div>
        <button type="submit" disabled={adding || !newName.trim()}
          className="px-4 py-2 bg-[#2196f3] text-white rounded-lg text-sm font-medium hover:bg-[#1976d2] disabled:opacity-50 transition-colors">
          {adding ? 'Adding…' : 'Add'}
        </button>
      </form>

      {loading ? (
        <div className="py-6 text-center text-gray-400 text-sm">Loading…</div>
      ) : items.length === 0 ? (
        <div className="py-6 text-center text-gray-400 text-sm bg-white rounded-lg border border-gray-200">
          No {title.toLowerCase()} entries yet.
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden max-w-md">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-2 text-left">{title}</th>
                <th className="px-4 py-2 w-12">Remove</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map(item => {
                const itemId = item._id || item.id;
                return (
                  <tr key={itemId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 text-gray-800">
                      <span className="text-gray-400 mr-1.5">▸</span>{item.name}
                    </td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => handleDelete(itemId, item.name)} disabled={deletingId === itemId}
                        className="text-red-500 hover:text-red-700 disabled:opacity-40">
                        {deletingId === itemId ? <span className="text-xs">…</span> : <HiOutlineTrash className="w-4 h-4" />}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Section: Automation ─────────────────────────────────────────────────────
function AutomationSettings() {
  const CARDS = [
    { title: 'Business Rules',   desc: 'Auto-assign tickets based on conditions.' },
    { title: 'SLA Policies',     desc: 'Define response and resolution time targets.' },
    { title: 'Escalations',      desc: 'Auto-escalate tickets that breach SLA.' },
    { title: 'Notifications',    desc: 'Email/SMS alerts for ticket events.' },
    { title: 'Triggers',         desc: 'Fire actions when ticket fields change.' },
    { title: 'Workflows',        desc: 'Multi-step approval and routing flows.' },
  ];
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Automation</h2>
        <p className="text-sm text-gray-500 mt-0.5">Configure automated rules, SLA, escalations, and workflows.</p>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {CARDS.map(c => (
          <div key={c.title} className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-sm transition-shadow cursor-pointer">
            <p className="font-medium text-gray-800 text-sm">{c.title}</p>
            <p className="text-xs text-gray-500 mt-1">{c.desc}</p>
            <p className="text-xs text-[#2196f3] mt-3 font-medium">Configure →</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
        ⚠️ Automation rules are not yet active in this environment. Configuration is stored but not applied.
      </p>
    </div>
  );
}

// ─── Section: Advanced Portal Settings (localStorage) ────────────────────────
function AdvancedPortalSettings() {
  const [settings, setSettings] = useState(() => getHdSetting('advanced_portal', {
    quickIncident:          true,
    includeTechnicians:     false,
    showConversations:      true,
    promptReason:           false,
    firstResponseNote:      false,
    firstResponseEmail:     true,
    showNoteToRequester:    false,
    emailTechnicianNote:    false,
  }));
  const [saved, setSaved] = useState(false);

  const save = () => {
    saveHdSetting('advanced_portal', settings);
    setSaved(true);
    toast.success('Settings saved');
    setTimeout(() => setSaved(false), 2000);
  };

  const toggle = (key) => setSettings(s => ({ ...s, [key]: !s[key] }));

  const rows = [
    ['quickIncident',       'Enable Quick-create Incident button'],
    ['includeTechnicians',  'Include technicians in requester list'],
    ['showConversations',   'Show conversations panel to requester'],
    ['promptReason',        'Prompt agent for reason on status change'],
    ['firstResponseNote',   'Notify on first response (internal note)'],
    ['firstResponseEmail',  'Notify on first response (email)'],
    ['showNoteToRequester', 'Show internal notes to requester'],
    ['emailTechnicianNote', 'Email technician when internal note added'],
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Advanced Portal Settings</h2>
        <p className="text-sm text-gray-500 mt-0.5">Fine-tune helpdesk portal behaviour.</p>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100 max-w-lg">
        {rows.map(([key, label]) => (
          <div key={key} className="flex items-center justify-between px-5 py-3">
            <span className="text-sm text-gray-700">{label}</span>
            <button onClick={() => toggle(key)}
              className={`relative inline-flex w-10 h-5 rounded-full transition-colors ${settings[key] ? 'bg-[#2196f3]' : 'bg-gray-200'}`}>
              <span className={`inline-block w-4 h-4 bg-white rounded-full shadow transform transition-transform mt-0.5 ${settings[key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
        ))}
      </div>
      <button onClick={save}
        className="px-5 py-2 bg-[#2196f3] text-white rounded-lg text-sm font-medium hover:bg-[#1976d2] transition-colors">
        {saved ? '✓ Saved' : 'Save Settings'}
      </button>
    </div>
  );
}

// ─── Section: Zia AI ─────────────────────────────────────────────────────────
function ZiaSettings() {
  const [settings, setSettings] = useState(() => getHdSetting('zia', {
    suggestions:     false,
    autoCategorize:  false,
    smartReplies:    false,
    sentiment:       false,
  }));
  const [saved, setSaved] = useState(false);

  const toggle = (key) => setSettings(s => ({ ...s, [key]: !s[key] }));

  const save = () => {
    saveHdSetting('zia', settings);
    setSaved(true);
    toast.success('Zia settings saved');
    setTimeout(() => setSaved(false), 2000);
  };

  const rows = [
    ['suggestions',    'Smart suggestions for technicians'],
    ['autoCategorize', 'Auto-categorise incoming tickets'],
    ['smartReplies',   'Smart reply suggestions'],
    ['sentiment',      'Sentiment analysis on conversations'],
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Zia — AI Assistant</h2>
        <p className="text-sm text-gray-500 mt-0.5">Enable AI-powered features to improve helpdesk efficiency.</p>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100 max-w-lg">
        {rows.map(([key, label]) => (
          <div key={key} className="flex items-center justify-between px-5 py-3">
            <span className="text-sm text-gray-700">{label}</span>
            <button onClick={() => toggle(key)}
              className={`relative inline-flex w-10 h-5 rounded-full transition-colors ${settings[key] ? 'bg-[#2196f3]' : 'bg-gray-200'}`}>
              <span className={`inline-block w-4 h-4 bg-white rounded-full shadow transform transition-transform mt-0.5 ${settings[key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
        ))}
      </div>
      <button onClick={save}
        className="px-5 py-2 bg-[#2196f3] text-white rounded-lg text-sm font-medium hover:bg-[#1976d2] transition-colors">
        {saved ? '✓ Saved' : 'Save Settings'}
      </button>
      <p className="text-xs text-gray-400">AI features are placeholders in this environment.</p>
    </div>
  );
}

// ─── Section: Announcement link ───────────────────────────────────────────────
function AnnouncementLink() {
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Announcements</h2>
        <p className="text-sm text-gray-500 mt-0.5">Publish notices visible to all helpdesk users.</p>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-6 flex items-center justify-between max-w-lg">
        <p className="text-sm text-gray-700">Manage helpdesk announcements</p>
        <button onClick={() => navigate('/helpdesk/announcements')}
          className="flex items-center gap-2 px-4 py-2 bg-[#2196f3] text-white rounded-lg text-sm font-medium hover:bg-[#1976d2] transition-colors">
          <HiOutlineExternalLink className="w-4 h-4" /> Open
        </button>
      </div>
    </div>
  );
}

// ─── Section: Additional Fields ───────────────────────────────────────────────
function AdditionalFieldsSettings() {
  const [fields, setFields] = useState(() => getHdSetting('custom_ticket_fields', []));
  const [newField, setNewField] = useState({ label: '', type: 'text', required: false });
  const [adding, setAdding] = useState(false);

  const addField = (e) => {
    e.preventDefault();
    if (!newField.label.trim()) return;
    setAdding(true);
    const updated = [...fields, { ...newField, id: Date.now(), label: newField.label.trim() }];
    setFields(updated);
    saveHdSetting('custom_ticket_fields', updated);
    setNewField({ label: '', type: 'text', required: false });
    toast.success('Field added');
    setAdding(false);
  };

  const removeField = (id) => {
    const updated = fields.filter(f => f.id !== id);
    setFields(updated);
    saveHdSetting('custom_ticket_fields', updated);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Additional Fields</h2>
        <p className="text-sm text-gray-500 mt-0.5">Add custom fields to the ticket creation form.</p>
      </div>
      <form onSubmit={addField} className="flex gap-3 items-end flex-wrap">
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Field Label *</label>
          <input value={newField.label} onChange={e => setNewField(f => ({ ...f, label: e.target.value }))}
            placeholder="e.g. Asset Tag" required
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm w-44 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Type</label>
          <select value={newField.type} onChange={e => setNewField(f => ({ ...f, type: e.target.value }))}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="date">Date</option>
            <option value="select">Dropdown</option>
            <option value="checkbox">Checkbox</option>
          </select>
        </div>
        <div className="flex items-center gap-1.5 pb-1">
          <input type="checkbox" id="req-field" checked={newField.required} onChange={e => setNewField(f => ({ ...f, required: e.target.checked }))}
            className="w-4 h-4 rounded border-gray-300 text-blue-600" />
          <label htmlFor="req-field" className="text-sm text-gray-700">Required</label>
        </div>
        <button type="submit" disabled={adding}
          className="px-4 py-1.5 bg-[#2196f3] text-white rounded-lg text-sm font-medium hover:bg-[#1976d2] disabled:opacity-50 transition-colors">
          Add Field
        </button>
      </form>

      {fields.length === 0 ? (
        <div className="py-6 text-center text-gray-400 text-sm bg-white rounded-lg border border-gray-200">
          No custom fields yet.
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden max-w-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-2 text-left">Label</th>
                <th className="px-4 py-2 text-left">Type</th>
                <th className="px-4 py-2 text-left">Required</th>
                <th className="px-4 py-2 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {fields.map(f => (
                <tr key={f.id}>
                  <td className="px-4 py-2.5 font-medium text-gray-800">{f.label}</td>
                  <td className="px-4 py-2.5 text-gray-600 capitalize">{f.type}</td>
                  <td className="px-4 py-2.5 text-gray-500">{f.required ? 'Yes' : 'No'}</td>
                  <td className="px-4 py-2.5">
                    <button onClick={() => removeField(f.id)} className="text-red-500 hover:text-red-700">
                      <HiOutlineTrash className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Content router ────────────────────────────────────────────────────────────
function ContentPanel({ activeId }) {
  switch (activeId) {
    case 'instance':         return <InstanceSettings />;
    case 'widget':           return <PublicWidgetSettings />;
    case 'mail-server':      return <MailServerSettings />;
    case 'mail-filter':      return <MailFilterSettings />;
    case 'email-command':    return <PlaceholderContent title="Email Command" />;
    case 'helpdesk':         return <HelpdeskCustomization />;
    case 'additional-fields':return <AdditionalFieldsSettings />;
    case 'checklists':       return <PlaceholderContent title="Checklists" />;
    case 'announcement':     return <AnnouncementLink />;
    case 'templates':        return <PlaceholderContent title="Templates & Forms" />;
    case 'layouts':          return <PlaceholderContent title="Layouts" />;
    case 'automation':       return <AutomationSettings />;
    case 'survey':           return <PlaceholderContent title="User Survey" />;
    case 'sites':            return <SimpleOptionSettings type="site" title="Sites" description="Add or remove site locations used when raising tickets." />;
    case 'advanced-portal':  return <AdvancedPortalSettings />;
    case 'requester-portal': return <PlaceholderContent title="Requester Portal" />;
    case 'apps':             return <PlaceholderContent title="Apps & Add-ons" />;
    case 'developer':        return <PlaceholderContent title="Developer Space" />;
    case 'zia':              return <ZiaSettings />;
    case 'reports':          return <PlaceholderContent title="Reports" />;
    default:                 return <InstanceSettings />;
  }
}

// ─── Main: HdSettings ────────────────────────────────────────────────────────
export default function HdSettings() {
  const { user } = useSelector(s => s.auth);
  const [activeId,  setActiveId]  = useState('instance');
  const [expanded,  setExpanded]  = useState({});   // group open/closed

  if (!['admin', 'senior_manager'].includes(user?.role)) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-lg font-semibold text-gray-700">Access Denied</p>
        <p className="text-sm text-gray-400 mt-2">You do not have permission to view Helpdesk Settings.</p>
      </div>
    );
  }

  const isAdmin = user?.role === 'admin';

  const toggleGroup = (id) => setExpanded(e => ({ ...e, [id]: !e[id] }));

  const handleItemClick = (id, hasChildren) => {
    if (hasChildren) {
      toggleGroup(id);
    } else {
      setActiveId(id);
    }
  };

  // Find if an item or its sub-items is active
  const isGroupActive = (item) =>
    item.id === activeId || (item.items || []).some(s => s.id === activeId);

  const isGroupOpen = (item) =>
    expanded[item.id] !== undefined ? expanded[item.id] : isGroupActive(item);

  return (
    <div className="h-full flex bg-[#f5f5f5]">
      {/* ── Left sidebar ────────────────────────────────────────────────────── */}
      <div className="w-60 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="font-semibold text-[#2196f3] text-sm">Setup</h2>
        </div>
        <nav className="flex-1 overflow-auto py-1">
          {MENU_ITEMS.filter(item => !item.adminOnly || isAdmin).map(item => {
            const Icon = item.icon;
            const hasChildren = !!(item.items?.length);
            const groupOpen   = isGroupOpen(item);
            const groupActive = isGroupActive(item);

            return (
              <div key={item.id}>
                {/* Group / top-level item */}
                <button
                  onClick={() => handleItemClick(item.id, hasChildren)}
                  className={`w-full flex items-center gap-2 px-4 py-2 text-sm text-left transition-colors ${
                    !hasChildren && activeId === item.id
                      ? 'bg-blue-50 text-[#2196f3] font-medium'
                      : groupActive && hasChildren
                      ? 'text-[#2196f3]'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {hasChildren && (
                    groupOpen
                      ? <HiOutlineChevronDown className="w-3.5 h-3.5 text-gray-400" />
                      : <HiOutlineChevronRight className="w-3.5 h-3.5 text-gray-400" />
                  )}
                </button>

                {/* Sub-items */}
                {hasChildren && groupOpen && (
                  <div>
                    {item.items.map(sub => (
                      <button
                        key={sub.id}
                        onClick={() => setActiveId(sub.id)}
                        className={`w-full text-left px-10 py-2 text-sm transition-colors ${
                          activeId === sub.id
                            ? 'bg-blue-50 text-[#2196f3] font-medium'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                        }`}
                      >
                        {sub.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      {/* ── Right content panel ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-6">
        <ContentPanel activeId={activeId} />
      </div>
    </div>
  );
}
