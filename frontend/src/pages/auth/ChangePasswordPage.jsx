import { useForm } from 'react-hook-form';
import { useDispatch, useSelector } from 'react-redux';
import { changePassword, clearMustChangePassword } from '../../store/authSlice';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import PageHeader from '../../components/common/PageHeader';

export default function ChangePasswordPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);
  const isForced = user?.mustChangePassword;
  const { register, handleSubmit, reset, formState: { errors }, watch } = useForm();

  const onSubmit = async (data) => {
    const result = await dispatch(changePassword(data));
    if (result.meta.requestStatus === 'fulfilled') {
      toast.success('Password changed successfully');
      reset();
      // Clear the mustChangePassword flag in Redux + localStorage
      dispatch(clearMustChangePassword());
      // Navigate to appropriate dashboard
      if (isForced) {
        const map = { employee: '/employee/dashboard', manager: '/manager/dashboard', admin: '/admin/dashboard' };
        navigate(map[user?.role] || '/');
      }
    } else {
      toast.error(result.payload || 'Failed to change password');
    }
  };

  return (
    <div>
      <PageHeader title="Change Password" />

      {isForced && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-lg mb-4 max-w-md">
          You must change your password before continuing. This is required for first-time login.
        </div>
      )}

      <div className="card max-w-md">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="label-text">Current Password</label>
            <input type="password" {...register('currentPassword', { required: 'Required' })} className="input-field" />
            {errors.currentPassword && <p className="text-red-500 text-xs mt-1">{errors.currentPassword.message}</p>}
          </div>
          <div>
            <label className="label-text">New Password</label>
            <input type="password" {...register('newPassword', { required: 'Required', minLength: { value: 6, message: 'Min 6 chars' } })} className="input-field" />
            {errors.newPassword && <p className="text-red-500 text-xs mt-1">{errors.newPassword.message}</p>}
          </div>
          <div>
            <label className="label-text">Confirm New Password</label>
            <input
              type="password"
              {...register('confirmPassword', {
                required: 'Required',
                validate: (val) => val === watch('newPassword') || 'Passwords do not match',
              })}
              className="input-field"
            />
            {errors.confirmPassword && <p className="text-red-500 text-xs mt-1">{errors.confirmPassword.message}</p>}
          </div>
          <button type="submit" className="btn-primary">Change Password</button>
        </form>
      </div>
    </div>
  );
}
