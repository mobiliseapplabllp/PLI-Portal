export default function ConfirmDialog({
  open,
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText,
  confirmLabel,
  danger = false,
  loading = false,
}) {
  const visible = open || isOpen;
  const label = confirmText || confirmLabel || 'Confirm';

  if (!visible) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <div className="text-sm text-gray-600 mt-2">{message}</div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onCancel} disabled={loading} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={danger ? 'btn-danger' : 'btn-primary'}
          >
            {loading ? 'Please wait…' : label}
          </button>
        </div>
      </div>
    </div>
  );
}
