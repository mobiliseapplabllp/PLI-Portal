/**
 * AutoCalcBadge — Shows whether a quarterly row was auto-calculated or manually entered.
 * States: auto | manual | overridden
 */
import { HiOutlineLightningBolt, HiOutlinePencil, HiOutlineExclamation } from 'react-icons/hi';

export default function AutoCalcBadge({ isAutoCalculated, isOverridden = false, size = 'sm' }) {
  const iconClass = size === 'xs' ? 'h-3 w-3' : 'h-3.5 w-3.5';
  const textClass = size === 'xs' ? 'text-xs' : 'text-xs';

  if (isAutoCalculated && isOverridden) {
    return (
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${textClass} font-medium bg-amber-50 text-amber-700 ring-1 ring-amber-200`}>
        <HiOutlineExclamation className={iconClass} />
        Auto (overridden)
      </span>
    );
  }

  if (isAutoCalculated) {
    return (
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${textClass} font-medium bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200`}>
        <HiOutlineLightningBolt className={iconClass} />
        Auto-calculated
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${textClass} font-medium bg-gray-50 text-gray-500 ring-1 ring-gray-200`}>
      <HiOutlinePencil className={iconClass} />
      Manual
    </span>
  );
}
