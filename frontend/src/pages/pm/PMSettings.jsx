import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { getPmSettingsApi, updatePmSettingsApi } from '../../api/pm/pmSettings.api';

const ALL_ROLES = ['admin', 'manager', 'senior_manager', 'hr_admin', 'final_approver', 'employee'];

export default function PMSettings() {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);

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

        <div className="flex justify-end pt-2">
          <button onClick={handleSave} disabled={saving} className="px-5 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors">
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
