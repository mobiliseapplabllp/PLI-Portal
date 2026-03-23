export default function LoadingSpinner({ size = 'md' }) {
  const sizeClass = size === 'sm' ? 'w-5 h-5' : size === 'lg' ? 'w-10 h-10' : 'w-7 h-7';

  return (
    <div className="flex items-center justify-center py-12">
      <div className={`${sizeClass} border-2 border-gray-200 border-t-primary-600 rounded-full animate-spin`} />
    </div>
  );
}
