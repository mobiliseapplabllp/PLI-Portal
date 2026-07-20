import { useState, useEffect, useCallback } from 'react';
import { HiOutlineSearch, HiOutlineCheck } from 'react-icons/hi';
import { getClientEmployeesApi } from '../../../api/csat.api';

export default function RecipientSelector({ orgId, selected, onChange }) {
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!orgId) { setEmployees([]); return; }
    setLoading(true);
    try {
      const res = await getClientEmployeesApi(orgId, { search, limit: 100, isActive: true });
      setEmployees(res.data.data || []);
    } catch {
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, search]);

  useEffect(() => { fetch(); }, [fetch]);

  // Reset selection when org changes
  useEffect(() => { onChange([]); }, [orgId]); // eslint-disable-line

  const toggle = (id) => {
    if (selected.includes(id)) onChange(selected.filter((s) => s !== id));
    else onChange([...selected, id]);
  };

  const toggleAll = () => {
    if (selected.length === employees.length) onChange([]);
    else onChange(employees.map((e) => e._id));
  };

  const allSelected = employees.length > 0 && selected.length === employees.length;

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 p-3 bg-gray-50 border-b border-gray-200">
        <div className="relative flex-1">
          <HiOutlineSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search employees..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
          />
        </div>
        <button
          type="button"
          onClick={toggleAll}
          disabled={!employees.length}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-white disabled:opacity-40"
        >
          {allSelected ? 'Deselect All' : 'Select All'}
        </button>
        <span className="text-sm font-medium text-emerald-700 whitespace-nowrap">
          {selected.length} selected
        </span>
      </div>

      {/* Employee list */}
      <div className="max-h-56 overflow-y-auto divide-y divide-gray-50">
        {loading ? (
          <div className="p-4 text-sm text-gray-400 text-center">Loading...</div>
        ) : employees.length === 0 ? (
          <div className="p-4 text-sm text-gray-400 text-center">
            {orgId ? 'No active employees found' : 'Select an organisation first'}
          </div>
        ) : (
          employees.map((emp) => {
            const checked = selected.includes(emp._id);
            return (
              <label
                key={emp._id}
                className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                  checked ? 'bg-emerald-50' : 'hover:bg-gray-50'
                }`}
              >
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  checked ? 'bg-emerald-600 border-emerald-600' : 'border-gray-300'
                }`}>
                  {checked && <HiOutlineCheck className="w-3 h-3 text-white" />}
                </div>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  onChange={() => toggle(emp._id)}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{emp.name}</p>
                  <p className="text-xs text-gray-400 truncate">{emp.email}</p>
                </div>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}
