import { Link } from 'react-router-dom';
import { HiOutlineChevronRight } from 'react-icons/hi';

export default function Breadcrumbs({ items = [] }) {
  if (items.length === 0) return null;

  return (
    <nav className="flex items-center text-sm mb-4" aria-label="Breadcrumb">
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <span key={idx} className="flex items-center">
            {idx > 0 && (
              <HiOutlineChevronRight className="w-4 h-4 text-gray-400 mx-1.5 flex-shrink-0" />
            )}
            {isLast || !item.to ? (
              <span className="font-semibold text-gray-800">{item.label}</span>
            ) : (
              <Link
                to={item.to}
                className="text-gray-500 hover:text-primary-600 transition-colors"
              >
                {item.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
