import { useEffect, useMemo, useState } from 'react';
import { HiOutlineX, HiOutlineCheckCircle } from 'react-icons/hi';
import { getTeamApi } from '../../api/users.api';

const MANAGER_LEVEL_ROLES = ['manager', 'senior_manager', 'sales_director'];

/**
 * Department -> Manager -> Employee (optional) picker for granting KPI
 * Definer rights. Mirrors the backend eligibility rule exactly
 * (kpiDefinitionDelegation.service.js assertEligibleDefinerTarget): a
 * manager-level person can be picked directly, or an employee can only be
 * reached by first picking their manager.
 *
 * Three separate, always-visible fields — Department, Manager, Employee —
 * each with its own search box, all stay on screen throughout (picking a
 * manager doesn't collapse the form — it just also enables the Employee
 * field below it). Picking a manager grants them by default; picking
 * someone in the Employee field overrides that with the employee instead.
 * A small confirmation line shows whichever is the current final choice.
 */
export default function DefinerTargetPicker({ departments, users, value, onChange }) {
  const [deptId, setDeptId] = useState('');
  const [managerId, setManagerId] = useState('');
  const [deptQuery, setDeptQuery] = useState('');
  const [managerQuery, setManagerQuery] = useState('');
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [team, setTeam] = useState([]); // selected manager's direct reports
  const [teamLoading, setTeamLoading] = useState(false);

  const selectedFinal = useMemo(
    () => users.find((u) => (u._id || u.id) === value) || null,
    [users, value]
  );

  const selectedDept = useMemo(() => departments.find((d) => (d._id || d.id) === deptId) || null, [departments, deptId]);
  const selectedManager = useMemo(() => users.find((u) => (u._id || u.id) === managerId) || null, [users, managerId]);

  const matchesQuery = (u, q) => {
    const query = q.trim().toLowerCase();
    if (!query) return true;
    return [u.name, u.role, u.email].filter(Boolean).some((f) => f.toLowerCase().includes(query));
  };

  const managersInDept = useMemo(() => {
    if (!deptId) return [];
    return users.filter((u) => u.departmentId === deptId && MANAGER_LEVEL_ROLES.includes(u.role));
  }, [users, deptId]);
  const filteredManagers = useMemo(() => managersInDept.filter((m) => matchesQuery(m, managerQuery)), [managersInDept, managerQuery]);

  const filteredTeam = useMemo(() => team.filter((m) => matchesQuery(m, employeeQuery)), [team, employeeQuery]);

  // Fetch the selected manager's team whenever it changes.
  useEffect(() => {
    if (!managerId) { setTeam([]); return; }
    setTeamLoading(true);
    getTeamApi(managerId)
      .then((r) => setTeam(Array.isArray(r.data?.data) ? r.data.data : []))
      // A non-admin granter (e.g. a manager-role Definer) may be blocked from
      // viewing a DIFFERENT manager's team by the underlying /users/team
      // endpoint (manager role is restricted to their own team there) —
      // degrade to an empty list rather than crash.
      .catch(() => setTeam([]))
      .finally(() => setTeamLoading(false));
  }, [managerId]);

  const handleDeptPick = (newDeptId) => {
    setDeptId(newDeptId);
    setDeptQuery('');
    setManagerId('');
    setManagerQuery('');
    setEmployeeQuery('');
    setTeam([]);
    onChange('');
  };

  const handleManagerPick = (userId) => {
    setManagerId(userId);
    setEmployeeQuery('');
    onChange(userId); // default: grant the manager — Employee field below can override
  };

  const handleEmployeePick = (userId) => {
    onChange(userId);
  };

  const handleReset = () => {
    onChange('');
    setDeptId(''); setManagerId('');
    setDeptQuery(''); setManagerQuery(''); setEmployeeQuery('');
    setTeam([]);
  };

  const filteredDepartments = departments.filter((d) => d.name.toLowerCase().includes(deptQuery.trim().toLowerCase()));

  return (
    <div className="space-y-3">
      <div>
        <label className="label-text">Department</label>
        <input
          type="text"
          value={deptId ? (selectedDept?.name || '') : deptQuery}
          onChange={(e) => { if (deptId) setDeptId(''); setDeptQuery(e.target.value); }}
          onFocus={() => { if (deptId) { setDeptId(''); onChange(''); } }}
          placeholder="Search department…"
          className="input-field mb-1"
        />
        {!deptId && deptQuery && (
          <div className="border border-gray-200 rounded-lg max-h-40 overflow-y-auto">
            {filteredDepartments.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-400">No match.</div>
            ) : (
              filteredDepartments.map((d) => {
                const dId = d._id || d.id;
                return (
                  <button key={dId} type="button" onClick={() => handleDeptPick(dId)} className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-violet-50">
                    {d.name}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      <div>
        <label className="label-text">Manager {!deptId && <span className="text-gray-400 font-normal">(pick department first)</span>}</label>
        <input
          type="text"
          value={managerId ? (selectedManager?.name || '') : managerQuery}
          onChange={(e) => { if (managerId) { setManagerId(''); onChange(''); } setManagerQuery(e.target.value); }}
          onFocus={() => { if (managerId) { setManagerId(''); onChange(''); } }}
          placeholder="Search by name, email or role…"
          className="input-field mb-1"
          disabled={!deptId}
        />
        {deptId && !managerId && (
          <div className="border border-gray-200 rounded-lg max-h-40 overflow-y-auto">
            {filteredManagers.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-400">
                {managersInDept.length === 0 ? 'No manager-level users in this department.' : 'No match.'}
              </div>
            ) : (
              filteredManagers.map((m) => {
                const mId = m._id || m.id;
                return (
                  <button key={mId} type="button" onClick={() => handleManagerPick(mId)} className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-violet-50">
                    {m.name} <span className="text-gray-400">— {m.role}</span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      <div>
        <label className="label-text">
          Employee <span className="text-gray-400 font-normal">(optional — leave blank to grant the manager above)</span>
        </label>
        <input
          type="text"
          value={employeeQuery}
          onChange={(e) => setEmployeeQuery(e.target.value)}
          placeholder={managerId ? "Search this manager's team…" : 'Pick a manager first…'}
          className="input-field mb-1"
          disabled={!managerId}
        />
        {managerId && (
          <div className="border border-gray-200 rounded-lg max-h-40 overflow-y-auto">
            {teamLoading ? (
              <div className="px-3 py-2 text-sm text-gray-400">Loading team…</div>
            ) : filteredTeam.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-400">
                {team.length === 0 ? 'No team members under this manager.' : 'No match.'}
              </div>
            ) : (
              filteredTeam.map((member) => {
                const memberId = member._id || member.id;
                const isThisSelected = memberId === value;
                return (
                  <button
                    key={memberId}
                    type="button"
                    onClick={() => handleEmployeePick(memberId)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-violet-50 ${isThisSelected ? 'bg-violet-50 text-violet-700 font-medium' : 'text-gray-700'}`}
                  >
                    {member.name} <span className="text-gray-400">— {member.role}</span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {selectedFinal && (
        <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          <span className="flex items-center gap-1.5 text-sm text-emerald-800">
            <HiOutlineCheckCircle className="h-4 w-4 flex-shrink-0" />
            Will grant: <strong>{selectedFinal.name}</strong> — {selectedFinal.role}
          </span>
          <button type="button" onClick={handleReset} className="text-emerald-700 hover:text-emerald-900">
            <HiOutlineX className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
