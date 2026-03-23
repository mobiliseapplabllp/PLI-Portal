import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { loginUser, clearError } from '../../store/authSlice';
import { HiOutlineCollection } from 'react-icons/hi';

export default function LoginPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user, loading, error } = useSelector((state) => state.auth);
  const { register, handleSubmit, formState: { errors } } = useForm();

  useEffect(() => {
    if (user) {
      if (user.mustChangePassword) {
        navigate('/change-password');
      } else {
        const map = { employee: '/employee/dashboard', manager: '/manager/dashboard', admin: '/admin/dashboard' };
        navigate(map[user.role] || '/');
      }
    }
  }, [user, navigate]);

  useEffect(() => {
    return () => dispatch(clearError());
  }, [dispatch]);

  const onSubmit = (data) => {
    dispatch(loginUser({ identifier: data.identifier, password: data.password }));
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <HiOutlineCollection className="w-8 h-8 text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-900">PLI Portal</h1>
        </div>

        <h2 className="text-lg font-semibold text-gray-800 mb-6 text-center">Sign in to your account</h2>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="label-text">Email or Employee ID</label>
            <input
              type="text"
              {...register('identifier', { required: 'Email or Employee ID is required' })}
              className="input-field"
              placeholder="e.g. admin@mobilise.co.in or MLP001"
              autoComplete="username"
            />
            {errors.identifier && <p className="text-red-500 text-xs mt-1">{errors.identifier.message}</p>}
          </div>

          <div>
            <label className="label-text">Password</label>
            <input
              type="password"
              {...register('password', { required: 'Password is required' })}
              className="input-field"
              placeholder="Enter your password"
              autoComplete="current-password"
            />
            {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-xs text-gray-400 text-center mt-6">
          Internal use only. Contact admin for access.
        </p>
      </div>
    </div>
  );
}
