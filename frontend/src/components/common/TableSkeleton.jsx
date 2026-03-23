export default function TableSkeleton({ rows = 5, columns = 6 }) {
  // Varying widths to make it look natural
  const widthClasses = ['w-3/4', 'w-1/2', 'w-2/3', 'w-1/3', 'w-5/6', 'w-2/5', 'w-3/5', 'w-1/4'];

  const getWidth = (rowIdx, colIdx) => {
    return widthClasses[(rowIdx + colIdx) % widthClasses.length];
  };

  return (
    <div className="overflow-x-auto border border-gray-200 rounded-lg">
      <table className="min-w-full divide-y divide-gray-200">
        {/* Header skeleton */}
        <thead className="bg-gray-50">
          <tr>
            {Array.from({ length: columns }).map((_, colIdx) => (
              <th key={colIdx} className="px-4 py-3">
                <div className="h-3 bg-gray-300 rounded animate-pulse w-2/3 mx-auto" />
              </th>
            ))}
          </tr>
        </thead>

        {/* Body skeleton */}
        <tbody className="divide-y divide-gray-100">
          {Array.from({ length: rows }).map((_, rowIdx) => (
            <tr key={rowIdx}>
              {Array.from({ length: columns }).map((_, colIdx) => (
                <td key={colIdx} className="px-4 py-3">
                  <div
                    className={`h-3 bg-gray-200 rounded animate-pulse ${getWidth(rowIdx, colIdx)}`}
                  />
                  {/* Add a smaller second line for the first column to mimic title + subtitle */}
                  {colIdx === 0 && (
                    <div className="h-2 bg-gray-100 rounded animate-pulse w-1/2 mt-1.5" />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
