import { useEffect, useMemo, useRef, useState } from 'react';
import { HiOutlineSearch, HiOutlineX, HiOutlineChevronDown } from 'react-icons/hi';

/**
 * Type-and-search user picker. Drop-in replacement for a plain <select> when
 * the list of users is long enough that scrolling a dropdown is painful —
 * filters by name, email and role as you type.
 */
export default function UserSearchSelect({ users, value, onChange, placeholder = 'Search by name, email or role…', getLabel }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const boxRef = useRef(null);

  const selectedUser = useMemo(
    () => users.find((u) => (u._id || u.id) === value) || null,
    [users, value]
  );

  const label = (u) => (getLabel ? getLabel(u) : `${u.name} — ${u.role}`);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      [u.name, u.email, u.role].filter(Boolean).some((f) => f.toLowerCase().includes(q))
    );
  }, [users, query]);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const handleSelect = (u) => {
    onChange(u._id || u.id);
    setQuery('');
    setOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('');
    setQuery('');
  };

  return (
    <div ref={boxRef} className="relative">
      <div
        onClick={() => setOpen((o) => !o)}
        className="input-field flex items-center justify-between cursor-pointer select-none"
      >
        {open ? (
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="flex-1 outline-none bg-transparent"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className={selectedUser ? 'text-gray-800' : 'text-gray-400'}>
            {selectedUser ? label(selectedUser) : placeholder}
          </span>
        )}
        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          {selectedUser && !open && (
            <button type="button" onClick={handleClear} className="text-gray-400 hover:text-gray-600">
              <HiOutlineX className="h-4 w-4" />
            </button>
          )}
          {open ? <HiOutlineSearch className="h-4 w-4 text-gray-400" /> : <HiOutlineChevronDown className="h-4 w-4 text-gray-400" />}
        </div>
      </div>

      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2.5 text-sm text-gray-400">No matching users</div>
          ) : (
            filtered.map((u) => {
              const id = u._id || u.id;
              const isSelected = id === value;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleSelect(u)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-violet-50 ${isSelected ? 'bg-violet-50 text-violet-700 font-medium' : 'text-gray-700'}`}
                >
                  {label(u)}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
