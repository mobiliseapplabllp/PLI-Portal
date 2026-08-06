import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { getPmSettingsApi, updatePmSettingsApi } from '../../api/pm/pmSettings.api';
import api from '../../api/axios';

const ALL_ROLES = ['admin', 'manager', 'senior_manager', 'hr_admin', 'final_approver', 'employee', 'md', 'director'];

export default function PMSettings() {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [triggering, setTriggering] = useState(false);

  useEffect(() => {
    getPmSettingsApi().then(r => setSettings(r.data.data)).catch(() => toast.error('Failed to load settings'));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updatePmSettingsApi(settings);
      toast.success('Settings saved');
    } catch { toast.error('Failed to save settings'); }
    finally { setSaving(false); }
  };

  if (!settings) return <div className="text-center text-gray-400 py-12">Loading settings...</div>;

  const toggleRole = (role) => {
    const current = settings.allowedCreatorRoles || [];
    const updated = current.includes(role) ? current.filter(r => r !== role) : [...current, role];
    setSettings(p => ({ ...p, allowedCreatorRoles: updated }));
  };

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">PM Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Configure Project Management module behavior</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Who can create projects?</label>
          <div className="flex flex-wrap gap-2">
            {ALL_ROLES.map(r => (
              <button
                key={r}
                type="button"
                onClick={() => toggleRole(r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-all capitalize
                  ${settings.allowedCreatorRoles?.includes(r)
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                    : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300'}`}
              >
                {r.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">Note: Admin always has full access regardless of this setting.</p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Daily Report Time (IST)</label>
          <input
            type="time"
            value={settings.dailyReportTime || '09:00'}
            onChange={e => setSettings(p => ({ ...p, dailyReportTime: e.target.value }))}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 w-40"
          />
          <p className="text-xs text-gray-400 mt-1">Daily email reports are sent at this time every day.</p>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.dailyReportEnabled}
            onChange={e => setSettings(p => ({ ...p, dailyReportEnabled: e.target.checked }))}
            className="w-4 h-4 rounded border-gray-300 text-emerald-600"
          />
          <div>
            <p className="text-sm font-medium text-gray-700">Enable Daily Email Reports</p>
            <p className="text-xs text-gray-400">Uncheck to pause all project daily emails</p>
          </div>
        </label>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Daily Report Mode</label>
          <div className="space-y-2">
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border-2 transition-all
              border-emerald-500 bg-emerald-50"
              style={{ borderColor: settings.consolidatedReport ? undefined : '#10b981', backgroundColor: settings.consolidatedReport ? undefined : '#f0fdf4' }}
              onClick={() => setSettings(p => ({ ...p, consolidatedReport: false }))}
            >
              <input type="radio" checked={!settings.consolidatedReport} onChange={() => setSettings(p => ({ ...p, consolidatedReport: false }))}
                className="mt-0.5 text-emerald-600" readOnly />
              <div>
                <p className="text-sm font-medium text-gray-700">Per Project</p>
                <p className="text-xs text-gray-400">Send one separate email per project (current behavior)</p>
              </div>
            </label>
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border-2 transition-all"
              style={{ borderColor: settings.consolidatedReport ? '#10b981' : '#e5e7eb', backgroundColor: settings.consolidatedReport ? '#f0fdf4' : '#f9fafb' }}
              onClick={() => setSettings(p => ({ ...p, consolidatedReport: true }))}
            >
              <input type="radio" checked={!!settings.consolidatedReport} onChange={() => setSettings(p => ({ ...p, consolidatedReport: true }))}
                className="mt-0.5 text-emerald-600" readOnly />
              <div>
                <p className="text-sm font-medium text-gray-700">Consolidated</p>
                <p className="text-xs text-gray-400">One email per person with all their projects combined — MD/Directors get all projects, managers get only their projects</p>
              </div>
            </label>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Always CC These Emails</label>
          <p className="text-xs text-gray-400 mb-2">These email addresses receive every project's daily report regardless of project membership.</p>
          <div className="space-y-2">
            {(settings.reportCcEmails || []).map((email, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={e => {
                    const updated = [...(settings.reportCcEmails || [])];
                    updated[i] = e.target.value;
                    setSettings(p => ({ ...p, reportCcEmails: updated }));
                  }}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="email@example.com"
                />
                <button
                  type="button"
                  onClick={() => {
                    const updated = (settings.reportCcEmails || []).filter((_, idx) => idx !== i);
                    setSettings(p => ({ ...p, reportCcEmails: updated }));
                  }}
                  className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setSettings(p => ({ ...p, reportCcEmails: [...(p.reportCcEmails || []), ''] }))}
              className="text-sm text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1 mt-1"
            >
              + Add Email
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={async () => {
              setTriggering(true);
              try {
                await api.post('/pm/settings/trigger-report');
                toast.success('Daily report triggered — check your inbox!');
              } catch {
                toast.error('Failed to trigger report');
              } finally {
                setTriggering(false);
              }
            }}
            disabled={triggering}
            className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {triggering ? (
              <><svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Sending...</>
            ) : (
              <><span>📧</span> Send Test Report Now</>
            )}
          </button>
          <button onClick={handleSave} disabled={saving} className="px-5 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors">
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
