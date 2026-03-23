import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-300">404</h1>
        <p className="text-lg text-gray-600 mt-4">Page not found</p>
        <Link to="/" className="btn-primary mt-6 inline-block">Go Home</Link>
      </div>
    </div>
  );
}
